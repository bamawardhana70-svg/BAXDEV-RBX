import { requireUser, quotaBegin, quotaCommit } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/roblox-anim-spoof
//
// Alur:
//  1. Terima JSON: { animId, apiKey, userId, creatorType, groupId, displayName }
//  2. Unduh file animasi dari Roblox CDN (assetdelivery) — server-to-server,
//     bisa ambil aset publik tanpa auth.
//  3. Validasi format rbxm / rbxmx.
//  4. Upload ke Roblox Open Cloud sebagai "Animation" — aset akan muncul di
//     kategori Animasi di Creator Hub, bukan Model.
//  5. Poll operation → kembalikan assetId baru.
//
// Tidak ada file yang di-log, di-cache, atau disimpan di sisi server.
// API key dan data animasi hanya melintas dalam satu request/response saja.

const POLL_ATTEMPTS = 6;
const POLL_DELAY_MS = 1500;
const MAX_ANIM_BYTES = 8 * 1024 * 1024; // animasi biasanya <1 MB — 8 MB limit aman
const ANIM_ID_RE = /^\d{1,19}$/;
const RBXM_MAGIC = "<roblox!";   // header biner rbxm
const RBXMX_TAG = "<roblox";     // tag awal XML rbxmx
const MODEL_CONTENT_TYPE = "model/x-rbxm";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollOperation(operationPath, apiKey) {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await sleep(POLL_DELAY_MS);
    let res;
    try {
      res = await fetch(`https://apis.roblox.com/assets/v1/${operationPath}`, {
        headers: { "x-api-key": apiKey },
      });
    } catch {
      continue;
    }
    if (!res.ok) continue;
    let op = null;
    try { op = await res.json(); } catch { continue; }
    if (op && op.done) return op;
  }
  return null;
}

function looksLikeRbxm(buf) {
  // Cek 256 byte pertama untuk magic bytes
  const head = new TextDecoder("latin1").decode(buf.slice(0, 256));
  return head.startsWith(RBXM_MAGIC) || head.includes(RBXMX_TAG);
}

export async function onRequestPost(context) {
  try {
    return await handleSpoof(context);
  } catch (err) {
    return json(
      { ok: false, message: "Kesalahan server: " + (err?.message || "tidak diketahui") },
      500
    );
  }
}

async function handleSpoof(context) {
  const { request } = context;

  // Verifikasi login Google
  const denied = await requireUser(request);
  if (denied) return denied;

  // Parse body JSON
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Body JSON tidak valid." }, 400);
  }

  const animId      = String(body.animId      || "").replace(/\D/g, "").trim();
  const apiKey      = String(body.apiKey      || "").trim();
  const userId      = String(body.userId      || "").trim();
  const creatorType = String(body.creatorType || "User").trim();
  const groupId     = String(body.groupId     || "").trim();
  const rawName     = String(body.displayName || "").trim();
  const displayName = (rawName.slice(0, 30) || ("Anim_" + animId).slice(0, 30)) || "AnimSpoof";

  if (!ANIM_ID_RE.test(animId)) {
    return json({ ok: false, message: "animId tidak valid — harus berupa angka." }, 400);
  }
  if (!apiKey || !userId) {
    return json({ ok: false, message: "apiKey dan userId wajib diisi." }, 400);
  }
  if (creatorType === "Group" && !groupId) {
    return json({ ok: false, message: "groupId wajib diisi kalau creatorType = Group." }, 400);
  }

  // Cek kuota harian
  const quota = await quotaBegin(request, userId);
  if (!quota.ok) {
    return json(
      {
        ok: false,
        code: "quota_exceeded",
        message: `Kuota publish hari ini sudah habis (${quota.used}/${quota.limit}) dan reset besok jam 00.00 WIB. Beli VIP atau tukar kode di Pengaturan → Akun.`,
        quota: { used: quota.used, limit: quota.limit },
      },
      429
    );
  }

  const okResp = async (obj) => {
    const qi = await quotaCommit(quota);
    if (qi) obj.quota = qi;
    return json(obj);
  };

  // ── 1. Unduh animasi dari Roblox CDN ────────────────────────────────────
  let animBuf;
  {
    let cdnRes;
    try {
      cdnRes = await fetch(
        `https://assetdelivery.roblox.com/v1/asset/?id=${animId}`,
        {
          redirect: "follow",
          headers: {
            "Accept": "*/*",
            // Beberapa CDN Roblox cek UA — gunakan UA yang lazim
            "User-Agent": "RobloxProxy/1.0",
          },
        }
      );
    } catch (err) {
      return json(
        { ok: false, message: "Gagal menghubungi Roblox CDN: " + (err?.message || "network error") },
        502
      );
    }

    if (cdnRes.status === 401 || cdnRes.status === 403) {
      return json(
        {
          ok: false,
          message: `Animasi ID ${animId} tidak bisa diunduh — kemungkinan privat atau dibatasi. Coba animasi publik dari Toolbox.`,
        },
        403
      );
    }
    if (cdnRes.status === 404) {
      return json(
        { ok: false, message: `Animasi ID ${animId} tidak ditemukan di Roblox.` },
        404
      );
    }
    if (!cdnRes.ok) {
      return json(
        { ok: false, message: `Roblox CDN membalas HTTP ${cdnRes.status} untuk ID ${animId}.` },
        502
      );
    }

    let buf;
    try {
      buf = await cdnRes.arrayBuffer();
    } catch (err) {
      return json(
        { ok: false, message: "Gagal membaca file animasi dari CDN: " + (err?.message || "baca gagal") },
        502
      );
    }

    if (!buf || buf.byteLength === 0) {
      return json(
        { ok: false, message: `File animasi ID ${animId} kosong. Coba ID lain.` },
        400
      );
    }
    if (buf.byteLength > MAX_ANIM_BYTES) {
      return json(
        { ok: false, message: `File animasi terlalu besar (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB, maks 8 MB).` },
        413
      );
    }
    if (!looksLikeRbxm(buf)) {
      return json(
        {
          ok: false,
          message: `ID ${animId} bukan file animasi Roblox yang valid (format tidak dikenal). Pastikan ini ID animasi, bukan model/audio/decal.`,
        },
        400
      );
    }

    animBuf = buf;
  }

  // ── 2. Upload ke Roblox Open Cloud sebagai Model ─────────────────────────
  // "Model" adalah tipe yang didukung Open Cloud v1. File animasi Roblox
  // (KeyframeSequence dalam rbxm/rbxmx) bisa diupload sebagai Model dan
  // tetap bisa dipakai sebagai AnimationId di Animate script.
  const creator = creatorType === "Group" ? { groupId } : { userId };
  const requestPayload = {
    assetType: "Animation",
    displayName,
    description: `Spoof animasi #${animId} via BAXDEV`,
    creationContext: { creator },
  };

  const upstream = new FormData();
  // "request" harus diappend sebagai string biasa (bukan Blob) supaya
  // Roblox tidak salah baca sebagai file field. Lihat catatan di roblox-upload.js.
  upstream.append("request", JSON.stringify(requestPayload));
  upstream.append(
    "fileContent",
    new Blob([animBuf], { type: MODEL_CONTENT_TYPE }),
    `anim_${animId}.rbxm`
  );

  let res;
  try {
    res = await fetch("https://apis.roblox.com/assets/v1/assets", {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: upstream,
    });
  } catch (err) {
    return json(
      { ok: false, message: "Gagal menghubungi Roblox dari server: " + (err?.message || "network error") },
      502
    );
  }

  const bodyText = await res.text();
  let data = {};
  try { data = JSON.parse(bodyText); } catch { /* Roblox tidak selalu balas JSON */ }

  if (!res.ok) {
    const detail = data.message || bodyText.slice(0, 200) || `HTTP ${res.status}`;
    const scopeHint =
      res.status === 401 || res.status === 403
        ? " Pastikan API key punya scope Assets (Read + Write) — buat di creator.roblox.com → Credentials."
        : "";
    const groupHint =
      creatorType === "Group" && (res.status === 401 || res.status === 403)
        ? " Pastikan API key dibuat dari Group ini dan kamu punya izin Manage Assets di Group."
        : "";
    return json({
      ok: false,
      message: `Roblox menolak upload (HTTP ${res.status}): ${detail}${scopeHint}${groupHint}`,
    });
  }

  const operationPath = data.path || null;
  if (!operationPath) {
    return okResp({
      ok: true,
      message: "Terkirim ke Roblox Open Cloud.",
      assetId: null,
      operationPath: null,
    });
  }

  // ── 3. Poll operation sampai assetId keluar ───────────────────────────────
  const op = await pollOperation(operationPath, apiKey);
  if (!op) {
    return okResp({
      ok: true,
      pending: true,
      operationPath,
      message: "Terkirim ke Roblox, masih diproses. ID asset akan muncul begitu selesai.",
    });
  }
  if (op.error) {
    return json({
      ok: false,
      message: `Roblox menolak asset ini: ${op.error.message || "upload gagal."}`,
    });
  }

  const assetId = op.response?.assetId ? String(op.response.assetId) : null;
  if (!assetId) {
    return okResp({
      ok: true,
      message: "Terkirim ke Roblox Open Cloud.",
      assetId: null,
      operationPath,
    });
  }

  return okResp({
    ok: true,
    assetId,
    message: `Berhasil dipublish. Asset ID baru: ${assetId}`,
  });
}

export async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  });
}
