import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/youtube-download
//
// Default: convert lewat api.theresav.eu memakai API key milik sendiri (di bawah).
// Opsional: kalau env YT_BACKEND_URL + YT_BACKEND_SECRET diisi, pakai backend sendiri
// (folder yt-backend/ atau yt-worker/) sebagai gantinya.
//
// Sukses: audio/mpeg (+ header X-Audio-Title, URL-encoded). Gagal: JSON {ok:false,message}.

const API_KEY = "U8LwW";

const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

function isYoutube(value) {
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && HOSTS.has(u.hostname.toLowerCase());
  } catch { return false; }
}

export async function onRequestPost(context) {
  const { request, env } = context;

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
  if (!isYoutube(url)) return json({ ok: false, message: "Link harus dari YouTube." }, 400);

  const base = String((env && env.YT_BACKEND_URL) || "").trim().replace(/\/+$/, "");
  const secret = String((env && env.YT_BACKEND_SECRET) || "").trim();
  if (!base || !secret) return legacyConvert(url);

  let upstream;
  try {
    upstream = await fetch(base + "/convert", {
      method: "POST",
      headers: { "content-type": "application/json", "x-backend-secret": secret },
      body: JSON.stringify({ url })
    });
  } catch {
    return json({ ok: false, message: "Tidak bisa menghubungi backend YouTube. Cek server-nya menyala." }, 502);
  }

  const type = upstream.headers.get("content-type") || "";
  if (upstream.ok && /^audio\//i.test(type)) {
    const headers = { "content-type": type, "cache-control": "no-store" };
    const title = upstream.headers.get("x-audio-title");
    if (title) headers["x-audio-title"] = title;
    return new Response(upstream.body, { status: 200, headers });
  }

  let msg = "";
  try { msg = (await upstream.json()).message || ""; } catch { /* bukan JSON */ }
  if (upstream.status === 401) msg = "Rahasia backend tidak cocok. Samakan YT_BACKEND_SECRET di Pages dan di server.";
  return json({ ok: false, message: msg || `Backend YouTube membalas HTTP ${upstream.status}.` }, upstream.status === 429 ? 429 : 502);
}

// ── Jalur default: API convert pihak ketiga dengan API key ───────────────────
async function legacyConvert(url) {
  const apiUrl = `https://api.theresav.eu/api/download/ytmp3?url=${encodeURIComponent(url)}&format=mp3&bitrate=64k`;

  let upstream;
  try {
    upstream = await fetch(apiUrl, { headers: { "x-apikey": API_KEY } });
  } catch (err) {
    return json({ ok: false, message: "Gagal menghubungi API convert: " + (err && err.message ? err.message : "network error") }, 502);
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    return json({ ok: false, message: `API convert membalas HTTP ${upstream.status}${errText ? ": " + errText.slice(0, 200) : ""}` });
  }

  const contentType = upstream.headers.get("content-type") || "";

  // Upstream langsung membalas file audio.
  if (/^audio\//i.test(contentType) || /^application\/octet-stream/i.test(contentType)) {
    return new Response(upstream.body, { status: 200, headers: { "content-type": contentType || "audio/mpeg" } });
  }

  // Upstream membalas JSON berisi link download terpisah.
  let data;
  try { data = await upstream.json(); } catch {
    return json({ ok: false, message: "Respons API convert bukan audio maupun JSON yang dikenali." });
  }

  const downloadUrl = data.url || data.downloadUrl || data.download_url
    || (data.result && (data.result.url || data.result.downloadUrl))
    || (data.data && (data.data.url || data.data.downloadUrl));
  const title = data.title || (data.result && data.result.title) || (data.data && data.data.title) || null;

  if (!downloadUrl) return json({ ok: false, message: "Tidak menemukan URL audio di respons API convert." });

  let fileRes;
  try {
    fileRes = await fetch(downloadUrl);
  } catch (err) {
    return json({ ok: false, message: "Gagal mengunduh hasil convert: " + (err && err.message ? err.message : "network error") });
  }
  if (!fileRes.ok) return json({ ok: false, message: `Gagal mengunduh hasil convert (HTTP ${fileRes.status}).` });

  const headers = { "content-type": fileRes.headers.get("content-type") || "audio/mpeg" };
  if (title) headers["x-audio-title"] = encodeURIComponent(title);
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
