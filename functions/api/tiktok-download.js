import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/tiktok-download
//
// Convert link TikTok -> MP3 lewat API publik tikwm.com
// (GET https://tikwm.com/api/?url=<link tiktok>). Bentuk respons yang dipakai
// di sini: { code, msg, data: { title, music, ... } } — code 0 = sukses,
// data.music = URL audio (MP3) dari video tersebut. Ini API pihak ketiga tanpa
// SLA resmi, jadi semua kegagalannya diteruskan ke client sebagai pesan jelas.
//
// Sama seperti /api/youtube-download: function ini SELALU membalas byte audio
// (content-type audio/*) kalau berhasil, jadi client cukup satu request
// same-origin. Judul (caption video) dititipkan lewat header X-Audio-Title
// (URL-encoded, karena header HTTP hanya boleh ASCII).

const TIKWM_API = "https://tikwm.com/api/";
const TIKWM_ORIGIN = "https://www.tikwm.com";
const MAX_BYTES = 20 * 1024 * 1024; // batas file audio Roblox
const TIKTOK_HOSTS = new Set(["tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTiktokUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return TIKTOK_HOSTS.has(u.hostname.toLowerCase().replace(/^www\./, ""));
  } catch {
    return false;
  }
}

async function fetchInfo(url) {
  const res = await fetch(`${TIKWM_API}?url=${encodeURIComponent(url)}&hd=0`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; baxdev-audio-studio)", accept: "application/json" }
  });
  if (!res.ok) throw new Error(`API convert TikTok membalas HTTP ${res.status}`);
  return res.json().catch(() => {
    throw new Error("Respons API convert TikTok bukan JSON yang dikenali.");
  });
}

export async function onRequestPost(context) {
  try {
    return await handle(context);
  } catch (err) {
    return json({ ok: false, message: err && err.message ? err.message : "Kesalahan server saat convert TikTok." }, 502);
  }
}

async function handle(context) {
  const { request } = context;

  const denied = await requireUser(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan JSON)." }, 400);
  }

  const url = String(body.url || "").trim();
  if (!url) return json({ ok: false, message: "url wajib diisi." }, 400);
  if (!isTiktokUrl(url)) return json({ ok: false, message: "URL harus berasal dari tiktok.com." }, 400);

  let info = await fetchInfo(url);
  // tikwm membatasi ~1 request/detik untuk pemakaian gratis; coba lagi sekali.
  if (info && info.code !== 0 && /limit/i.test(String(info.msg || ""))) {
    await sleep(1500);
    info = await fetchInfo(url);
  }
  if (!info || info.code !== 0 || !info.data) {
    return json({ ok: false, message: `Convert TikTok gagal: ${(info && info.msg) || "video tidak ditemukan atau privat."}` });
  }

  const data = info.data;
  const title = data.music_info && data.music_info.title && data.music_info.original === false
    ? data.music_info.title
    : (data.title || (data.music_info && data.music_info.title) || null);

  let audioUrl = String(data.music || "").trim();
  if (!audioUrl) return json({ ok: false, message: "Video ini tidak menyediakan audio." });
  if (audioUrl.startsWith("/")) audioUrl = TIKWM_ORIGIN + audioUrl;
  if (!/^https:\/\//i.test(audioUrl)) return json({ ok: false, message: "URL audio dari API convert tidak valid." });

  let fileRes;
  try {
    fileRes = await fetch(audioUrl);
  } catch (err) {
    return json({ ok: false, message: "Gagal mengunduh audio TikTok: " + (err && err.message ? err.message : "network error") });
  }
  if (!fileRes.ok) return json({ ok: false, message: `Gagal mengunduh audio TikTok (HTTP ${fileRes.status}).` });

  const declared = Number(fileRes.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) return json({ ok: false, message: "Audio melebihi batas 20MB Roblox." });

  const upstreamType = (fileRes.headers.get("content-type") || "").toLowerCase();
  if (/^(text\/|application\/json)/.test(upstreamType)) {
    return json({ ok: false, message: "Sumber audio TikTok tidak mengembalikan file audio." });
  }

  const headers = { "content-type": /^audio\//.test(upstreamType) ? upstreamType : "audio/mpeg" };
  if (title) headers["x-audio-title"] = encodeURIComponent(String(title).slice(0, 200));
  return new Response(fileRes.body, { status: 200, headers });
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
