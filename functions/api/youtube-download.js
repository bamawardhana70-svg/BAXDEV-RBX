import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/youtube-download
//
// Convert YouTube ke MP3 lewat beberapa jalur yang dicoba berurutan (yang gagal pindah ke berikutnya):
//   XyloAPI server1, NexRay, XyloAPI server2, XyloAPI server3, lalu backend sendiri (kalau
//   env YT_BACKEND_URL + YT_BACKEND_SECRET diisi; folder yt-backend/ atau yt-worker/).
// api.theresav.eu sudah tidak dipakai di sini.
// Kalau antrean lebih dari QUEUE_SPREAD_MIN link, tiap link dimulai dari jalur berbeda (client mengirim
// slot + queue) supaya beban tersebar ke 3 jalur pertama.
// Env opsional: XYLO_SERVERS = "server1,server2,server3" (daftar server XyloAPI).
//
// Sukses: audio/mpeg (+ header X-Audio-Title, URL-encoded). Gagal: JSON {ok:false,message}.

const NEXRAY_API = "https://api.nexray.eu.cc/downloader/ytmp3";
const XYLO_API = "https://xyloapi.qzz.io/api/downloader/youtube";
const XYLO_DEFAULT_SERVERS = ["server1", "server2", "server3"];
const XYLO_META_TIMEOUT_MS = 40000;
const XYLO_FILE_TIMEOUT_MS = 90000;
const QUEUE_SPREAD_MIN = 4;   // "lebih dari 3"
const SPREAD_WIDTH = 3;

// Batas waktu: di atas batas job backend (150 dtk) supaya pesan error backend yang tampil, bukan timeout kasar.
const BACKEND_TIMEOUT_MS = 170000;

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

  // Daftar jalur: XyloAPI dan NexRay diselang-seling supaya 3 jalur pertama berbeda penyedia; backend sendiri paling akhir.
  const xylo = xyloServers(env).map(server => ({ name: "xylo-" + server, run: () => xyloConvert(url, server) }));
  const providers = [];
  if (xylo[0]) providers.push(xylo[0]);
  providers.push({ name: "nexray", run: () => nexrayConvert(url) });
  providers.push(...xylo.slice(1));
  if (base && secret) providers.push({ name: "backend", run: () => ownBackend(base, secret, url) });

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

// ── NexRay ───────────────────────────────────────────────────────────────────
// GET {NEXRAY_API}?url=... -> {status, result:{title, duration, filesize, url}}
async function nexrayConvert(url) {
  let meta;
  try {
    const res = await fetch(`${NEXRAY_API}?url=${encodeURIComponent(url)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(XYLO_META_TIMEOUT_MS)
    });
    if (!res.ok) return fail(`NexRay membalas HTTP ${res.status}.`, res.status === 429 || res.status >= 500);
    meta = await res.json();
  } catch (err) {
    return fail(isTimeout(err) ? "NexRay terlalu lama merespons." : "Gagal menghubungi NexRay.", true);
  }

  const data = meta && meta.status && meta.result;
  if (!data || typeof data.url !== "string") return fail("NexRay tidak mengembalikan link audio.", true);
  return fetchAudio(data.url, data.title, "NexRay");
}

// Unduh file audio hasil convert dan stream ke client. Mengembalikan {ok:true,response} atau {ok:false,...}.
async function fetchAudio(link, title, label) {
  let fileUrl;
  try {
    fileUrl = new URL(link);
    if (fileUrl.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    return fail(`${label} mengembalikan link audio yang tidak valid.`, true);
  }

  let file;
  try {
    file = await fetch(fileUrl.href, { signal: AbortSignal.timeout(XYLO_FILE_TIMEOUT_MS) });
  } catch (err) {
    return fail(isTimeout(err) ? `Download audio dari ${label} terlalu lama.` : `Gagal mengunduh audio dari ${label}.`, true);
  }
  if (!file.ok) return fail(`Download audio dari ${label} gagal (HTTP ${file.status}).`, file.status === 429 || file.status >= 500);

  const type = (file.headers.get("content-type") || "").toLowerCase();
  if (/^(text\/|application\/json)/.test(type)) {
    file.body && file.body.cancel().catch(() => {});
    return fail(`${label} tidak membalas file audio.`, true);
  }

  const headers = { "content-type": /^audio\//.test(type) ? type : "audio/mpeg", "cache-control": "no-store" };
  if (title) headers["x-audio-title"] = encodeURIComponent(String(title));
  return { ok: true, response: new Response(file.body, { status: 200, headers }) };
}

// ── XyloAPI ────────────────────────────────────────────────────────
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

  return fetchAudio(audio.url, data.title, `XyloAPI (${server})`);
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
