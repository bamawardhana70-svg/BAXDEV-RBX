import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/roblox-place-publish
//
// Mengunggah file place (.rbxl / .rbxlx) ke sebuah experience lewat Open Cloud Place Publishing:
//   POST https://apis.roblox.com/universes/v1/{universeId}/places/{placeId}/versions?versionType=Saved|Published
// Body = isi file mentah. Roblox membalas nomor versi. API key hanya lewat di request ini
// (tidak disimpan/di-log). Key perlu scope universe-places:write untuk experience tujuan.

const MAX_BYTES = 90 * 1024 * 1024; // di bawah batas body Cloudflare Pages (100 MB)
const EXT = /\.rbxlx?$/i;
const RBXL_MAGIC = "<roblox!"; // biner: 8 byte pertama
const RBXLX_TAG = "<roblox";   // XML: muncul di awal dokumen

export async function onRequestPost(context) {
  try {
    return await handle(context);
  } catch (err) {
    return json({ ok: false, message: "Kesalahan server: " + (err && err.message ? err.message : "tidak diketahui") }, 500);
  }
}

async function handle({ request }) {
  const denied = await requireUser(request);
  if (denied) return denied;

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan multipart/form-data)." }, 400);
  }

  const file = form.get("file");
  const apiKey = String(form.get("apiKey") || "").trim();
  const universeId = String(form.get("universeId") || "").trim();
  const placeId = String(form.get("placeId") || "").trim();
  const versionType = String(form.get("versionType") || "Published");

  if (!apiKey) return json({ ok: false, message: "apiKey wajib diisi." }, 400);
  if (!/^\d{1,19}$/.test(universeId)) return json({ ok: false, message: "Universe ID harus angka." }, 400);
  if (!/^\d{1,19}$/.test(placeId)) return json({ ok: false, message: "Place ID harus angka." }, 400);
  if (versionType !== "Saved" && versionType !== "Published") {
    return json({ ok: false, message: "versionType harus Saved atau Published." }, 400);
  }
  if (!(file instanceof File)) return json({ ok: false, message: "File place tidak ditemukan di request." }, 400);
  if (!EXT.test(file.name || "")) return json({ ok: false, message: "File harus berformat .rbxl atau .rbxlx." }, 400);
  if (file.size === 0) return json({ ok: false, message: "File kosong (0 byte)." }, 400);
  if (file.size > MAX_BYTES) return json({ ok: false, message: "File melebihi batas 90MB." }, 400);

  const head = new TextDecoder("latin1").decode(await file.slice(0, 256).arrayBuffer());
  const isXml = head.includes(RBXLX_TAG) && !head.startsWith(RBXL_MAGIC);
  if (!head.startsWith(RBXL_MAGIC) && !head.includes(RBXLX_TAG)) {
    return json({ ok: false, message: "Isi file bukan place Roblox yang valid. Simpan ulang dari Studio (File > Save to File As)." }, 400);
  }

  let res;
  try {
    res = await fetch(
      `https://apis.roblox.com/universes/v1/${universeId}/places/${placeId}/versions?versionType=${versionType}`,
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "content-type": isXml ? "application/xml" : "application/octet-stream"
        },
        body: file
      }
    );
  } catch {
    return json({ ok: false, message: "Gagal menghubungi Roblox. Coba lagi." }, 502);
  }

  let text = "";
  try { text = (await res.text()).trim(); } catch { /* kosong */ }
  let data = null;
  try { data = JSON.parse(text); } catch { /* bukan JSON */ }

  if (!res.ok) {
    return json({ ok: false, status: res.status, message: explain(res.status, data, text) }, res.status === 429 ? 429 : 400);
  }

  const version = data && (data.versionNumber ?? data) ;
  return json({
    ok: true,
    versionType,
    version: typeof version === "object" ? "" : String(version)
  });
}

function explain(status, data, text) {
  const raw = (data && (data.message || (data.error && data.error.message))) || (text && text.length < 200 ? text : "");
  const tail = raw ? " (" + raw + ")" : "";
  if (status === 401) return "API key tidak valid atau kedaluwarsa." + tail;
  if (status === 403) return "Ditolak. Pastikan API key punya izin universe-places:write untuk experience ini." + tail;
  if (status === 404) return "Experience atau place tidak ditemukan. Cek Universe ID dan Place ID." + tail;
  if (status === 409) return "Place ini bukan bagian dari Universe ID tersebut." + tail;
  if (status === 429) return "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi." + tail;
  if (status === 400) return "Roblox menolak file atau permintaan." + tail;
  return "Roblox membalas error " + status + "." + tail;
}

export async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
