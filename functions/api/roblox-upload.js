import { requireUser, quotaBegin, quotaCommit } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/roblox-upload
//
// Runs server-side (Cloudflare's edge), so unlike a fetch() from the app
// itself, it isn't subject to the browser's CORS restriction. Roblox's Open
// Cloud Assets API is built for server-to-server calls and does not return
// CORS headers to a browser origin, so this function exists to be that
// server: it re-posts the file + credentials the client sends here to
// Roblox and relays back a small JSON result. Nothing is logged, cached, or
// persisted here — the API key only passes through this request.
//
// Create Asset (POST /v1/assets) itself only returns an Operation path
// (operations/{id}) — the actual numeric assetId only shows up once that
// operation is polled to completion via GET /v1/{operationPath}. So this
// function polls that endpoint for a bounded window right after upload and
// returns the resolved assetId when it's ready. If Roblox is still
// processing past that window, it replies with pending:true and
// the operationPath so the client can resolve it later via
// /api/roblox-asset-status instead of the UI silently showing nothing.

const POLL_ATTEMPTS = 6;
const POLL_DELAY_MS = 1500;

// Tipe yang boleh diunggah lewat endpoint ini. Model hanya .rbxm / .rbxmx (format native Roblox);
// content type-nya harus persis model/x-rbxm karena browser tidak mengenal ekstensi ini.
const ASSET_TYPES = new Set(["Audio", "Model", "Decal"]);
const NOUNS = { Audio: "audio", Model: "model", Decal: "gambar" };
// Decal: format gambar yang diterima Open Cloud Assets API.
const DECAL_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", bmp: "image/bmp", tga: "image/tga" };
const decalExt = (name) => String(name || "").split(".").pop().toLowerCase();
const MODEL_EXT = /\.rbxmx?$/i;
const MODEL_CONTENT_TYPE = "model/x-rbxm";
const RBXM_MAGIC = "<roblox!";   // biner: 8 byte pertama
const RBXMX_TAG = "<roblox";     // XML: muncul di awal dokumen (setelah <?xml ...?> bila ada)

async function looksLikeRbxm(file) {
  const head = new TextDecoder("latin1").decode(await file.slice(0, 256).arrayBuffer());
  return head.startsWith(RBXM_MAGIC) || head.includes(RBXMX_TAG);
}

// Cek isi file cocok dengan ekstensinya (TGA tidak punya magic number, jadi hanya dicek lewat ekstensi).
async function looksLikeImage(file, ext) {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (ext === "png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (ext === "jpg" || ext === "jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === "bmp") return b[0] === 0x42 && b[1] === 0x4d;
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollOperation(operationPath, apiKey) {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await sleep(POLL_DELAY_MS);
    let res;
    try {
      res = await fetch(`https://apis.roblox.com/assets/v1/${operationPath}`, {
        headers: { "x-api-key": apiKey }
      });
    } catch {
      continue; // network hiccup mid-poll — try again next tick instead of giving up
    }
    if (!res.ok) continue;
    let op = null;
    try { op = await res.json(); } catch { continue; }
    if (op && op.done) return op;
  }
  return null; // still not done after the poll window
}

export async function onRequestPost(context) {
  // Bungkus semua error tak terduga jadi JSON supaya klien dapat pesan jelas (bukan halaman HTML 500).
  try {
    return await handleUpload(context);
  } catch (err) {
    return json({ ok: false, message: "Kesalahan server saat upload: " + (err && err.message ? err.message : "tidak diketahui") }, 500);
  }
}

async function handleUpload(context) {
  const { request } = context;

  const denied = await requireUser(request);
  if (denied) return denied;

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan multipart/form-data)." }, 400);
  }

  const file = form.get("file");
  const userId = String(form.get("userId") || "").trim();
  const apiKey = String(form.get("apiKey") || "").trim();
  const creatorType = String(form.get("creatorType") || "User").trim();
  const groupId = String(form.get("groupId") || "").trim();
  const assetType = String(form.get("assetType") || "Audio");
  const noun = NOUNS[assetType] || "audio";
  // Clamped to 30 chars here too (not just client-side) so this endpoint is
  // safe even if something else calls it directly.
  const displayName = String(form.get("displayName") || "Untitled").trim().slice(0, 30) || "Untitled";
  const description = String(form.get("description") || "");

  if (!ASSET_TYPES.has(assetType)) {
    return json({ ok: false, message: "Tipe asset tidak didukung. Yang tersedia: Audio, Model, dan Decal." }, 400);
  }
  if (!(file instanceof File)) {
    return json({ ok: false, message: `File ${noun} tidak ditemukan di request.` }, 400);
  }
  if (!userId || !apiKey) {
    return json({ ok: false, message: "userId dan apiKey wajib diisi." }, 400);
  }
  if (creatorType === "Group" && !groupId) {
    return json({ ok: false, message: "groupId wajib diisi kalau creatorType = Group." }, 400);
  }
  if (file.size === 0) {
    return json({ ok: false, message: `File ${noun} kosong (0 byte) — coba upload ulang dari halaman Upload.` }, 400);
  }
  const MAX_BYTES = 20 * 1024 * 1024; // sama dengan batas di upload.html (MAX_FILE_MB)
  if (file.size > MAX_BYTES) {
    return json({ ok: false, message: `File ${noun} melebihi batas 20MB.` }, 400);
  }
  if (assetType === "Model") {
    if (!MODEL_EXT.test(file.name || "")) {
      return json({ ok: false, message: "Model harus berformat .rbxm atau .rbxmx." }, 400);
    }
    if (!(await looksLikeRbxm(file))) {
      return json({ ok: false, message: "Isi file bukan model Roblox yang valid. Ekspor ulang dari Roblox Studio (Save to File As → .rbxm)." }, 400);
    }
  }

  if (assetType === "Decal") {
    const ext = decalExt(file.name);
    if (!DECAL_TYPES[ext]) {
      return json({ ok: false, message: "Gambar harus berformat PNG, JPG, BMP, atau TGA." }, 400);
    }
    if (!(await looksLikeImage(file, ext))) {
      return json({ ok: false, message: `Isi file bukan gambar ${ext.toUpperCase()} yang valid.` }, 400);
    }
  }

  // Kuota harian akun free (server-side, tidak bisa direset dari browser). VIP lolos.
  const quota = await quotaBegin(request, userId);
  if (!quota.ok) {
    return json({
      ok: false, code: "quota_exceeded",
      message: `Kuota publish hari ini sudah habis (${quota.used}/${quota.limit}) dan reset besok jam 00.00 WIB. Beli VIP atau tukar kode di Pengaturan → Akun.`,
      quota: { used: quota.used, limit: quota.limit }
    }, 429);
  }
  const ok = async (obj) => {
    const qi = await quotaCommit(quota);
    if (qi) obj.quota = qi;
    return json(obj);
  };

  // Publish target: personal account (userId) by default, or a Group/community
  // (groupId) when the user picked "Group" as Creator Type in Settings. Roblox's
  // Open Cloud Assets API keys creationContext.creator by whichever one is set —
  // sending userId when the intent is Group silently publishes to the wrong
  // owner instead of failing, so the branch has to be explicit here.
  const creator = creatorType === "Group" ? { groupId } : { userId };
  const requestPayload = {
    assetType,
    displayName,
    description,
    creationContext: { creator }
  };

  const upstream = new FormData();
  // PENTING: "request" harus di-append sebagai string biasa, BUKAN dibungkus
  // Blob. FormData.append(name, blobValue) selalu menyertakan atribut
  // `filename` (default "blob") begitu value-nya sebuah Blob — itu membuat
  // Roblox membaca part ini sebagai file, bukan field JSON biasa, sehingga
  // "request" dianggap kosong walau fileContent-nya sendiri valid (persis
  // pesan error "Request body cannot be empty" yang muncul). Contoh resmi
  // Roblox (curl --form 'request={...}') juga mengirim field ini tanpa
  // filename maupun content-type eksplisit.
  upstream.append("request", JSON.stringify(requestPayload));
  if (assetType === "Model") {
    upstream.append("fileContent", file.slice(0, file.size, MODEL_CONTENT_TYPE), file.name);
  } else if (assetType === "Decal") {
    upstream.append("fileContent", file.slice(0, file.size, DECAL_TYPES[decalExt(file.name)]), file.name);
  } else {
    upstream.append("fileContent", file, file.name || "audio");
  }

  let res;
  try {
    res = await fetch("https://apis.roblox.com/assets/v1/assets", {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: upstream
    });
  } catch (err) {
    return json({ ok: false, message: "Gagal menghubungi Roblox dari server: " + (err && err.message ? err.message : "network error") }, 502);
  }

  const bodyText = await res.text();
  let data = {};
  try { data = JSON.parse(bodyText); } catch { /* Roblox didn't return JSON */ }

  if (!res.ok) {
    const detail = data.message || bodyText.slice(0, 200) || `HTTP ${res.status}`;
    const hint = creatorType === "Group" && (res.status === 401 || res.status === 403)
      ? " Pastikan API key dibuat dari Group ini (atau kamu punya izin Manage Assets di Group), dan Group ID sudah benar."
      : "";
    const scopeHint = (res.status === 401 || res.status === 403)
      ? " Pastikan API key punya scope Assets (Read + Write) — buat di creator.roblox.com → Credentials."
      : "";
    return json({ ok: false, message: `Roblox menolak upload (HTTP ${res.status}): ${detail}${hint}${scopeHint}` });
  }

  const operationPath = data.path || null;
  if (!operationPath) {
    // Upload diterima tapi Roblox tidak mengembalikan operation path — tidak
    // ada cara untuk resolve assetId sama sekali.
    return ok({ ok: true, message: "Terkirim ke Roblox Open Cloud.", assetId: null, operationPath: null });
  }

  const op = await pollOperation(operationPath, apiKey);
  if (!op) {
    // Masih diproses Roblox setelah jendela polling — bukan gagal, cuma
    // belum selesai. Client menyimpan operationPath untuk dicek lagi nanti.
    return ok({
      ok: true,
      pending: true,
      operationPath,
      message: "Terkirim ke Roblox, masih diproses. ID aset akan muncul begitu selesai."
    });
  }
  if (op.error) {
    return json({ ok: false, message: `Roblox menolak asset ini: ${op.error.message || "upload gagal."}` });
  }

  const assetId = op.response && op.response.assetId ? String(op.response.assetId) : null;
  if (!assetId) {
    return ok({ ok: true, message: "Terkirim ke Roblox Open Cloud.", assetId: null, operationPath });
  }
  return ok({
    ok: true,
    assetId,
    message: `Berhasil dipublish. Asset ID: ${assetId}`
  });
}

export async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}
