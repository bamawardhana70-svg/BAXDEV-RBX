import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/youtube-download
//
// Default: convert lewat api.theresav.eu memakai API key milik sendiri (di bawah).
// Opsional: kalau env YT_BACKEND_URL + YT_BACKEND_SECRET diisi, pakai backend sendiri
// (folder yt-backend/ atau yt-worker/) sebagai gantinya.
//
// Cadangan: XyloAPI (xyloapi.qzz.io). Kalau jalur utama gagal, otomatis pindah ke server XyloAPI.
// Kalau antrean lebih dari QUEUE_SPREAD_MIN link, request disebar ke 2-3 server sekaligus
// (client mengirim slot + queue) supaya tidak menumpuk di satu server.
// Env opsional XYLO_SERVERS = "server1,server2,server3" untuk mengubah daftar server XyloAPI.
//
// Sukses: audio/mpeg (+ header X-Audio-Title, URL-encoded). Gagal: JSON {ok:false,message}.

const API_KEY = "U8LwW";

const XYLO_API = "https://xyloapi.qzz.io/api/downloader/youtube";
const XYLO_DEFAULT_SERVERS = ["server1", "server2", "server3"];
const XYLO_META_TIMEOUT_MS = 40000;
const XYLO_FILE_TIMEOUT_MS = 90000;
const QUEUE_SPREAD_MIN = 4;   // "lebih dari 3"
const SPREAD_WIDTH = 3;

// Batas waktu: di atas batas job backend (150 dtk) supaya pesan error backend yang tampil, bukan timeout kasar.
const BACKEND_TIMEOUT_MS = 170000;
const LEGACY_TIMEOUT_MS = 90000;

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

  const base = String((env && env.YT_BACKEND_URL) || "").trim().replace(/\/+$/, "");
  const secret = String((env && env.YT_BACKEND_SECRET) || "").trim();

  // Pemanasan: client memanggil ini saat tab YouTube dibuka supaya container tidak cold start saat Convert.
  if (body && body.warm === true) {
    if (base && secret && context.waitUntil) {
      context.waitUntil(fetch(base + "/warm", { headers: { "x-backend-secret": secret }, signal: AbortSignal.timeout(15000) }).catch(() => {}));
    }
    return json({ ok: true, warm: Boolean(base && secret) });
  }

  const url = String((body && body.url) || "").trim();
  if (!url) return json({ ok: false, message: "url wajib diisi." }, 400);
  if (!isYoutube(url)) return json({ ok: false, message: "Link harus dari YouTube." }, 400);

  const slot = Number.isInteger(body.slot) && body.slot >= 0 ? body.slot : 0;
  const queue = Number.isInteger(body.queue) && body.queue > 0 ? body.queue : 1;

  // Daftar jalur: utama (backend sendiri atau API lama) lalu server XyloAPI sebagai cadangan.
  const providers = [];
  if (base && secret) providers.push({ name: "backend", run: () => ownBackend(base, secret, url) });
  else providers.push({ name: "legacy", run: () => legacyConvert(url) });
  const xylo = xyloServers(env).map(server => ({ name: "xylo-" + server, run: () => xyloConvert(url, server) }));
  // XYLO_FIRST=1: XyloAPI jadi jalur pertama, jalur utama jadi cadangan (dipakai saat backend utama sedang error).
  if (String((env && env.XYLO_FIRST) || "").trim() === "1") providers.unshift(...xylo);
  else providers.push(...xylo);

  // Antrean panjang: mulai dari jalur berbeda per link (round-robin 2-3 jalur), sisanya jadi cadangan.
  let order = providers;
  if (queue >= QUEUE_SPREAD_MIN) {
    const width = Math.min(SPREAD_WIDTH, providers.length);
    const first = slot % width;
    order = [...providers.slice(first, width), ...providers.slice(0, first), ...providers.slice(width)];
  }

  let lastFail = null;
  for (const provider of order) {
    const result = await provider.run();
    if (result.ok) return result.response;
    lastFail = result;
  }
  return json({ ok: false, message: lastFail.message, retryable: lastFail.retryable === true }, lastFail.status || 502);
}

function xyloServers(env) {
  const raw = String((env && env.XYLO_SERVERS) || "").trim();
  const list = (raw ? raw.split(",") : XYLO_DEFAULT_SERVERS).map(x => x.trim()).filter(x => /^[a-z0-9_-]{1,32}$/i.test(x));
  return list.length ? list : XYLO_DEFAULT_SERVERS;
}

// Setiap jalur mengembalikan {ok:true,response} atau {ok:false,message,retryable,status}; tidak pernah melempar.
function fail(message, retryable, status) {
  return { ok: false, message, retryable: retryable === true, status: status || 502 };
}

function isTimeout(err) {
  return err && (err.name === "TimeoutError" || err.name === "AbortError");
}

async function ownBackend(base, secret, url) {
  let upstream;
  try {
    upstream = await fetch(base + "/convert", {
      method: "POST",
      headers: { "content-type": "application/json", "x-backend-secret": secret },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS)
    });
  } catch (err) {
    return fail(isTimeout(err) ? "Backend YouTube terlalu lama merespons. Coba lagi." : "Tidak bisa menghubungi backend YouTube. Cek server-nya menyala.", !isTimeout(err));
  }

  const type = upstream.headers.get("content-type") || "";
  if (upstream.ok && /^audio\//i.test(type)) {
    const headers = { "content-type": type, "cache-control": "no-store" };
    const title = upstream.headers.get("x-audio-title");
    if (title) headers["x-audio-title"] = title;
    return { ok: true, response: new Response(upstream.body, { status: 200, headers }) };
  }

  let msg = "";
  try { msg = (await upstream.json()).message || ""; } catch { /* bukan JSON */ }
  if (upstream.status === 401) msg = "Rahasia backend tidak cocok. Samakan YT_BACKEND_SECRET di Pages dan di server.";
  const st = upstream.status;
  const passthrough = st === 400 || st === 413 || st === 422 || st === 429 ? st : 502;
  const retryable = st === 429 || st === 502 || st === 503 || st === 504;
  return fail(msg || `Backend YouTube membalas HTTP ${st}.`, retryable, passthrough);
}

// ── Cadangan: XyloAPI ────────────────────────────────────────────────────────
// GET {XYLO_API}?url=...&server=serverN -> {success, data:{title, links:[{label,url}]}}
async function xyloConvert(url, server) {
  let meta;
  try {
    const res = await fetch(`${XYLO_API}?url=${encodeURIComponent(url)}&server=${encodeURIComponent(server)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(XYLO_META_TIMEOUT_MS)
    });
    if (!res.ok) return fail(`XyloAPI (${server}) membalas HTTP ${res.status}.`, res.status === 429 || res.status >= 500);
    meta = await res.json();
  } catch (err) {
    return fail(isTimeout(err) ? `XyloAPI (${server}) terlalu lama merespons.` : `Gagal menghubungi XyloAPI (${server}).`, true);
  }

  const data = meta && meta.success && meta.data;
  const links = data && Array.isArray(data.links) ? data.links : [];
  const audio = links.find(l => l && /audio|mp3/i.test(String(l.label || "")) && typeof l.url === "string");
  if (!audio) return fail(`XyloAPI (${server}) tidak mengembalikan link audio.`, true);

  let fileUrl;
  try {
    fileUrl = new URL(audio.url);
    if (fileUrl.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    return fail(`XyloAPI (${server}) mengembalikan link audio yang tidak valid.`, true);
  }

  let file;
  try {
    file = await fetch(fileUrl.href, { signal: AbortSignal.timeout(XYLO_FILE_TIMEOUT_MS) });
  } catch (err) {
    return fail(isTimeout(err) ? `Download audio dari XyloAPI (${server}) terlalu lama.` : `Gagal mengunduh audio dari XyloAPI (${server}).`, true);
  }
  if (!file.ok) return fail(`Download audio dari XyloAPI (${server}) gagal (HTTP ${file.status}).`, file.status === 429 || file.status >= 500);

  const type = (file.headers.get("content-type") || "").toLowerCase();
  if (/^(text\/|application\/json)/.test(type)) {
    file.body && file.body.cancel().catch(() => {});
    return fail(`XyloAPI (${server}) tidak membalas file audio.`, true);
  }

  const headers = { "content-type": /^audio\//.test(type) ? type : "audio/mpeg", "cache-control": "no-store" };
  if (data.title) headers["x-audio-title"] = encodeURIComponent(String(data.title));
  return { ok: true, response: new Response(file.body, { status: 200, headers }) };
}

// ── Jalur default: API convert pihak ketiga dengan API key ───────────────────
async function legacyConvert(url) {
  const apiUrl = `https://api.theresav.eu/api/download/ytmp3?url=${encodeURIComponent(url)}&format=mp3&bitrate=64k`;

  let upstream;
  try {
    upstream = await fetch(apiUrl, { headers: { "x-apikey": API_KEY }, signal: AbortSignal.timeout(LEGACY_TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    return fail(timedOut ? "API convert terlalu lama merespons. Coba lagi." : "Gagal menghubungi API convert: " + (err && err.message ? err.message : "network error"), !timedOut);
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    return fail(`API convert membalas HTTP ${upstream.status}${errText ? ": " + errText.slice(0, 200) : ""}`, upstream.status === 429 || upstream.status >= 500);
  }

  const contentType = upstream.headers.get("content-type") || "";

  // Upstream langsung membalas file audio.
  if (/^audio\//i.test(contentType) || /^application\/octet-stream/i.test(contentType)) {
    return { ok: true, response: new Response(upstream.body, { status: 200, headers: { "content-type": contentType || "audio/mpeg" } }) };
  }

  // Upstream membalas JSON berisi link download terpisah.
  let data;
  try { data = await upstream.json(); } catch {
    return fail("Respons API convert bukan audio maupun JSON yang dikenali.");
  }

  const downloadUrl = data.url || data.downloadUrl || data.download_url
    || (data.result && (data.result.url || data.result.downloadUrl))
    || (data.data && (data.data.url || data.data.downloadUrl));
  const title = data.title || (data.result && data.result.title) || (data.data && data.data.title) || null;

  if (!downloadUrl) return fail("Tidak menemukan URL audio di respons API convert.");

  let fileRes;
  try {
    fileRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(LEGACY_TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    return fail(timedOut ? "Download hasil convert terlalu lama. Coba lagi." : "Gagal mengunduh hasil convert: " + (err && err.message ? err.message : "network error"), !timedOut);
  }
  if (!fileRes.ok) return fail(`Gagal mengunduh hasil convert (HTTP ${fileRes.status}).`);

  const headers = { "content-type": fileRes.headers.get("content-type") || "audio/mpeg" };
  if (title) headers["x-audio-title"] = encodeURIComponent(title);
  return { ok: true, response: new Response(fileRes.body, { status: 200, headers }) };
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
