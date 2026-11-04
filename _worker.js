// BAXDEV RBX — Cloudflare Pages "advanced mode" worker (dibuat otomatis dari functions/).
// Menggantikan folder functions/: cukup satu file ini supaya bisa di-deploy lewat drag & drop atau upload satu file.

const M_auth = (() => {

// Verifikasi Firebase ID token (login Google) di Cloudflare Pages Functions, tanpa library.
// Tanpa environment variable: Project ID Firebase (bukan rahasia) ditulis langsung di bawah.
// Pemakaian di handler:  const deny = await requireUser(request); if (deny) return deny;

const FIREBASE_PROJECT_ID = "baxdev-rbx";
const FIREBASE_DB_URL = "https://baxdev-rbx-default-rtdb.asia-southeast1.firebasedatabase.app";

// Proof-of-work (tanpa setup, tanpa secret, tanpa layanan tambahan).
// Setiap request /api/* harus membawa header  X-BX-Pow: <ts>.<nonce>  dengan
//   SHA-256("bx1|<ts>|<METHOD>|<path>|<nonce>")  yang diawali minimal POW_BITS bit nol.
// Browser mencarinya di Web Worker (index.html). Rata-rata 2^POW_BITS hash per request.
// Naikkan POW_BITS untuk memperberat skrip massal (tiap +1 bit = 2x kerja); klien menyesuaikan sendiri
// lewat respons 403 (field "bits"), jadi cukup ubah angka ini di server.
const POW_ENFORCE = true;
const POW_BITS = 16;
const POW_WINDOW_S = 120;   // toleransi selisih jam klien-server
// Maintenance terjadwal: setiap hari 00.00 - 05.00 WIB (UTC+7, tanpa DST).
const MAINTENANCE_TEXT =
  "Saat ini layanan sedang dalam proses pemeliharaan.\n" +
  "Layanan akan kembali tersedia nanti pagi.\n\n" +
  "Mohon maaf atas ketidaknyamanannya. Terima kasih atas pengertiannya.";

function isScheduledMaintenance(now) {
  const wibHour = new Date((now || Date.now()) + 7 * 3600e3).getUTCHours();
  return wibHour >= 0 && wibHour < 5;
}

// Owner (lolos baca /isAdmin di Security Rules) boleh tetap memakai layanan saat maintenance.
async function isOwnerToken(token) {
  try {
    const r = await fetch(FIREBASE_DB_URL + "/isAdmin.json?auth=" + encodeURIComponent(token), { cache: "no-store" });
    return r.ok;
  } catch { return false; }
}

// Owner rank: akun Google yang lolos /isAdmin DAN memakai Roblox User ID ini.
// ID saja tidak cukup: kolom Roblox User ID bisa diisi siapa saja, jadi harus digabung dengan cek Google owner.
const OWNER_ROBLOX_ID = "8675322450";

async function isOwnerSession(token, robloxId) {
  return String(robloxId || "").trim() === OWNER_ROBLOX_ID && await isOwnerToken(token);
}

// vip/<robloxId>: { expiresAt (0 = permanen), plusUntil? (0 = permanen), ... }. VIP Plus selalu ikut VIP.
function vipActive(v) { return !!v && (!v.expiresAt || v.expiresAt > Date.now()); }
function plusActive(v) {
  return vipActive(v) && typeof v.plusUntil === "number" && (v.plusUntil === 0 || v.plusUntil > Date.now());
}

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const jwksCache = {};   // url -> { keys, at }

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToJson(s) { return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))); }

async function loadKeys(url) {
  const res = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error("jwks");
  const data = await res.json();
  jwksCache[url] = { keys: data.keys || [], at: Date.now() };
  return jwksCache[url].keys;
}

// Cari kunci publik by kid. Cache 1 jam; kid tak dikenal baru memicu muat ulang bila cache sudah >5 menit (rotasi kunci).
async function findKey(url, kid) {
  const c = jwksCache[url];
  let keys = c && Date.now() - c.at < 3600e3 ? c.keys : await loadKeys(url);
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk && jwksCache[url] && Date.now() - jwksCache[url].at > 300e3) {
    keys = await loadKeys(url);
    jwk = keys.find((k) => k.kid === kid);
  }
  return jwk || null;
}

// Urai JWT RS256 tanpa memeriksa tanda tangan. null kalau bentuknya salah.
function parseJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = b64urlToJson(parts[0]); payload = b64urlToJson(parts[1]); } catch { return null; }
  if (!header || !payload || header.alg !== "RS256" || !header.kid) return null;
  return { parts, header, payload };
}

async function signatureValid(jwt, jwksUrl) {
  const jwk = await findKey(jwksUrl, jwt.header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(jwt.parts[2]), new TextEncoder().encode(jwt.parts[0] + "." + jwt.parts[1]));
}

const timeValid = (p, now) => typeof p.exp === "number" && p.exp >= now - 30 && !(p.iat > now + 300);

async function verifyIdToken(token, projectId) {
  const jwt = parseJwt(token);
  if (!jwt) return null;
  const p = jwt.payload;
  const now = Math.floor(Date.now() / 1000);
  if (p.aud !== projectId || p.iss !== "https://securetoken.google.com/" + projectId) return null;
  if (!p.sub || !timeValid(p, now)) return null;
  return (await signatureValid(jwt, JWKS_URL)) ? { uid: p.sub, email: p.email || "" } : null;
}

// ── Proof-of-work ──
// Replay: pasangan (ts, method, path, nonce) yang sama hanya diterima sekali per isolate (best effort;
// isolate Cloudflare bisa berganti, jadi ini pelengkap, bukan jaminan).
const powSeen = new Map();   // msg -> kedaluwarsa (ms)

async function leadingZeroBits(msg) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg)));
  let bits = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] === 0) { bits += 8; continue; }
    bits += Math.clz32(d[i]) - 24;
    break;
  }
  return bits;
}

// Balikkan Response (tolak) bila PoW tidak sah; null bila lolos.
async function checkPow(request) {
  const nowS = Math.floor(Date.now() / 1000);
  const info = { bits: POW_BITS, now: nowS };
  const m = /^(\d{10})\.([0-9a-z]{1,24})$/.exec(request.headers.get("x-bx-pow") || "");
  if (!m) return deny(403, "pow_required", "Verifikasi keamanan belum selesai. Muat ulang halaman lalu coba lagi.", info);
  const ts = Number(m[1]);
  if (Math.abs(nowS - ts) > POW_WINDOW_S) return deny(403, "pow_stale", "Jam perangkat tidak sinkron. Coba lagi.", info);
  let path;
  try { path = new URL(request.url).pathname; } catch { return deny(400, "bad_request", "URL tidak valid."); }
  const msg = "bx1|" + ts + "|" + request.method.toUpperCase() + "|" + path + "|" + m[2];
  if ((await leadingZeroBits(msg)) < POW_BITS) return deny(403, "pow_failed", "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.", info);
  const nowMs = Date.now();
  if (powSeen.size > 4000) {
    for (const [k, exp] of powSeen) if (exp < nowMs) powSeen.delete(k);
    if (powSeen.size > 8000) powSeen.clear();
  }
  if (powSeen.has(msg)) return deny(403, "pow_replay", "Permintaan ganda ditolak. Coba lagi.", info);
  powSeen.set(msg, nowMs + POW_WINDOW_S * 2000);
  return null;
}

function deny(status, code, message, extra) {
  return new Response(JSON.stringify({ ok: false, code, message, ...(extra || {}) }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

// Balikkan Response (tolak) kalau belum login Google; null kalau lolos.
// Hanya terima request dari halaman situs ini di browser. Browser selalu mengirim Sec-Fetch-Site (dan Origin untuk POST),
// sedangkan curl / skrip biasa tidak. Ini menyaring tembakan langsung yang polos, BUKAN pengaman mutlak: klien yang
// sengaja memalsukan header ini masih bisa lolos. Lapisan berikutnya adalah proof-of-work di atas: tiap request
// harus membayar kerja CPU, jadi tembakan massal jadi mahal (bukan mustahil).
function sameOriginBrowser(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function requireUser(request) {
  if (!sameOriginBrowser(request)) {
    return deny(403, "forbidden_origin", "Permintaan hanya diterima dari situs resmi.");
  }
  if (POW_ENFORCE) {
    const powDeny = await checkPow(request);
    if (powDeny) return powDeny;
  }
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (isScheduledMaintenance() && !(m && await isOwnerToken(m[1]))) {
    return deny(503, "maintenance", MAINTENANCE_TEXT);
  }
  if (!m) return deny(401, "login_required", "Login Google dulu.");
  try {
    const user = await verifyIdToken(m[1], FIREBASE_PROJECT_ID);
    if (!user) return deny(401, "login_required", "Sesi login Google tidak valid. Login ulang.");
    // Akun yang di-ban owner (bans/<uid>) ditolak di semua endpoint. Gagal baca DB = jangan blokir.
    try {
      const br = await fetch(FIREBASE_DB_URL + "/bans/" + encodeURIComponent(user.uid) + ".json", { cache: "no-store" });
      if (br.ok && (await br.text()).trim() !== "null") {
        return deny(403, "banned", "Akun kamu diblokir dari layanan ini. Hubungi admin bila ini keliru.");
      }
    } catch { /* lanjut */ }
  } catch {
    return deny(502, "auth_unavailable", "Gagal memverifikasi login. Coba lagi.");
  }
  return null;
}

// Gerbang fitur VIP (menu Spoof/Animasi). Sama seperti requireVipPlus tapi cukup VIP aktif. Gagal baca DB = tolak.
async function requireVip(request, robloxId) {
  const rid = String(robloxId || "").trim();
  if (!/^[0-9]{1,20}$/.test(rid)) return deny(400, "roblox_required", "Isi Roblox User ID di Pengaturan dulu.");
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (m && await isOwnerSession(m[1], rid)) return null;
  let v;
  try {
    const r = await fetch(FIREBASE_DB_URL + "/vip/" + rid + ".json", { cache: "no-store" });
    if (!r.ok) throw new Error("vip read " + r.status);
    v = await r.json();
  } catch {
    return deny(502, "vip_unavailable", "Gagal memeriksa status VIP. Coba lagi.");
  }
  if (!vipActive(v)) return deny(403, "vip_required", "Menu Spoof khusus VIP.");
  return null;
}

// Gerbang fitur VIP Plus (dipanggil setelah requireUser lolos). Gagal baca DB = tolak (fitur berbayar, jangan fail-open).
// Balikkan Response (tolak) atau null kalau boleh.
async function requireVipPlus(request, robloxId) {
  const rid = String(robloxId || "").trim();
  if (!/^[0-9]{1,20}$/.test(rid)) return deny(400, "roblox_required", "Isi Roblox User ID di Pengaturan dulu.");
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (m && await isOwnerSession(m[1], rid)) return null;
  let v;
  try {
    const r = await fetch(FIREBASE_DB_URL + "/vip/" + rid + ".json", { cache: "no-store" });
    if (!r.ok) throw new Error("vip read " + r.status);
    v = await r.json();
  } catch {
    return deny(502, "vip_unavailable", "Gagal memeriksa status VIP Plus. Coba lagi.");
  }
  if (!plusActive(v)) return deny(403, "vip_plus_required", "Fitur ini khusus VIP Plus.");
  return null;
}

// ── Kuota publish akun free (disimpan di Firebase: quota/<uid> = {day, count}) ──
// Dihitung server-side per akun Google, jadi tidak bisa direset lewat hapus data browser / ganti Roblox ID.
// Hari berganti 00.00 WIB (UTC+7). Pastikan FREE_DAILY_LIMIT sama dengan FREE_UPLOAD_LIMIT di index.html.
const FREE_DAILY_LIMIT = 5;
const WIB_MS = 7 * 3600e3, DAY_MS = 86400e3;
const wibDay = (now) => Math.floor((now + WIB_MS) / DAY_MS);

async function readQuota(uid, token) {
  const r = await fetch(FIREBASE_DB_URL + "/quota/" + encodeURIComponent(uid) + ".json?auth=" + encodeURIComponent(token), { cache: "no-store" });
  if (!r.ok) throw new Error("quota read " + r.status);
  const rec = await r.json();
  const day = wibDay(Date.now());
  return { day, used: rec && rec.day === day ? Number(rec.count) || 0 : 0 };
}

// ── Kuota publish akun VIP / VIP Plus (disimpan di Firebase: vipq/<uid> = {period, count}) ──
// Jendela tetap 6 jam (tidak mengikuti WIB), direset tiap kelipatan VIP_PERIOD_MS sejak epoch.
// Pastikan VIP_PERIOD_LIMIT sama dengan VIP_UPLOAD_LIMIT di index.html.
const VIP_PERIOD_MS = 6 * 3600e3;
const VIP_PERIOD_LIMIT = 100;
const vipPeriod = (now) => Math.floor(now / VIP_PERIOD_MS);

async function readVipQuota(uid, token) {
  const r = await fetch(FIREBASE_DB_URL + "/vipq/" + encodeURIComponent(uid) + ".json?auth=" + encodeURIComponent(token), { cache: "no-store" });
  if (!r.ok) throw new Error("vipq read " + r.status);
  const rec = await r.json();
  const period = vipPeriod(Date.now());
  return { period, used: rec && rec.period === period ? Number(rec.count) || 0 : 0 };
}

// Cek sebelum upload. { ok:false, used, limit, vip? } kalau kuota habis. Gagal baca DB / rules belum dipasang = jangan blokir (skip).
async function quotaBegin(request, robloxId) {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (!m) return { ok: true, skip: true };
  try {
    const user = await verifyIdToken(m[1], FIREBASE_PROJECT_ID);
    if (!user) return { ok: true, skip: true };
    if (/^[0-9]{1,20}$/.test(String(robloxId || ""))) {
      if (await isOwnerSession(m[1], robloxId)) return { ok: true, owner: true };                 // owner tanpa batas
      try {
        const vr = await fetch(FIREBASE_DB_URL + "/vip/" + robloxId + ".json", { cache: "no-store" });
        if (vr.ok && vipActive(await vr.json())) {
          const vq = await readVipQuota(user.uid, m[1]);
          if (vq.used >= VIP_PERIOD_LIMIT) return { ok: false, used: vq.used, limit: VIP_PERIOD_LIMIT, vip: true };
          return { ok: true, uid: user.uid, token: m[1], vip: true };                              // VIP / VIP Plus: 100 per 6 jam
        }
      } catch { /* anggap bukan VIP */ }
    }
    const q = await readQuota(user.uid, m[1]);
    if (q.used >= FREE_DAILY_LIMIT) return { ok: false, used: q.used, limit: FREE_DAILY_LIMIT };
    return { ok: true, uid: user.uid, token: m[1] };
  } catch {
    return { ok: true, skip: true };
  }
}

// Tambah 1 pada counter kuota secara atomik. Dua upload paralel (multi upload) bisa selesai bersamaan;
// baca-lalu-tulis biasa membuat salah satunya hilang. Firebase REST mendukung penulisan bersyarat:
// GET dengan X-Firebase-ETag lalu PUT dengan if-match (412 bila data sudah berubah) -> ulangi.
async function bumpCounter(path, token, periodKey, periodNow) {
  const url = FIREBASE_DB_URL + path + ".json?auth=" + encodeURIComponent(token);
  for (let attempt = 0; attempt < 6; attempt++) {
    const g = await fetch(url, { headers: { "X-Firebase-ETag": "true" }, cache: "no-store" });
    if (!g.ok) throw new Error(path + " read " + g.status);
    const etag = g.headers.get("ETag");
    const rec = await g.json();
    const used = rec && rec[periodKey] === periodNow ? Number(rec.count) || 0 : 0;
    const headers = { "content-type": "application/json" };
    if (etag) headers["if-match"] = etag;   // tanpa ETag (proxy menghapusnya) jatuh ke perilaku lama
    const w = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ [periodKey]: periodNow, count: used + 1 }) });
    if (w.ok) return used + 1;
    if (w.status !== 412) return null;
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  return null;
}

// Catat 1 publish setelah upload berhasil. Balikkan { used, limit } atau null.
async function quotaCommit(q) {
  if (!q || q.skip || q.owner || !q.uid) return null;
  try {
    if (q.vip) {
      const used = await bumpCounter("/vipq/" + encodeURIComponent(q.uid), q.token, "period", vipPeriod(Date.now()));
      return used == null ? null : { used, limit: VIP_PERIOD_LIMIT };
    }
    const used = await bumpCounter("/quota/" + encodeURIComponent(q.uid), q.token, "day", wibDay(Date.now()));
    return used == null ? null : { used, limit: FREE_DAILY_LIMIT };
  } catch { return null; }
}

return { POW_ENFORCE, POW_BITS, MAINTENANCE_TEXT, isScheduledMaintenance, OWNER_ROBLOX_ID, isOwnerSession, vipActive, plusActive, verifyIdToken, requireUser, requireVip, requireVipPlus, FREE_DAILY_LIMIT, VIP_PERIOD_MS, VIP_PERIOD_LIMIT, quotaBegin, quotaCommit };
})();

const M_image_to_mesh = (() => {

// Sumber tool VIP Plus. Disajikan lewat /api/tool setelah cek VIP Plus; jangan taruh sebagai file statis.
// Edit: di dalam template literal ini tanda \, ` dan ${ harus di-escape dengan \.
const __default = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src https://cdn.jsdelivr.net blob: data:; font-src data:; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Image to Mesh — 3D Maker</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23000'/%3E%3Cpath d='M32 10 54 32 32 54 10 32Z' fill='none' stroke='%23fff' stroke-width='3' stroke-linejoin='round'/%3E%3Cpath d='M17.5 26.5 37.5 46.5M24.5 19.5 44.5 39.5M17.5 37.5 37.5 17.5M24.5 44.5 44.5 24.5' stroke='%23fff' stroke-opacity='.6' stroke-width='2'/%3E%3C/svg%3E">
<style>
:root{
  --bg1:#000;--bg2:#101010;
  --glass:rgba(255,255,255,.07);--glass-hi:rgba(255,255,255,.16);
  --rim-hi:rgba(255,255,255,.6);--rim-lo:rgba(255,255,255,.14);
  --ink:#fff;--ink-2:rgba(255,255,255,.74);--track:rgba(255,255,255,.17);
  --accent:#fff;--accent-ink:#000;
  --orb1:#a8a8a8;--orb2:#707070;--orb3:#c4c4c4;--orb4:#4c4c4c;
  --lift:0 26px 64px rgba(0,0,0,.5);--well:rgba(0,0,0,.4);
}

*{box-sizing:border-box}
[hidden]{display:none!important}
html{background:transparent}
body{margin:0;min-height:100vh;min-height:100dvh;overflow-x:hidden;background:transparent;color:var(--ink);
  font:15px/1.5 "SF Pro Display","SF Pro Text",-apple-system,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif}
body::before{display:none}
@keyframes drift{from{transform:translate3d(-2%,-1%,0) rotate(0)}to{transform:translate3d(3%,2%,0) rotate(9deg)}}
@media(prefers-reduced-motion:reduce){body::before{animation:none}*{transition-duration:.01ms!important}}

/* susunan: satu kolom, scroll ke bawah */
.shell{max-width:880px;margin:0 auto;padding:max(28px,env(safe-area-inset-top)) 16px max(48px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:16px}
.hero{padding:6px 4px 10px}
.badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 8px;border-radius:99px;font-size:13px;font-weight:600;color:var(--ink);
  background:var(--glass);box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%)}
.badge svg{width:22px;height:22px}
h1{margin:14px 0 8px;font-size:clamp(34px,6vw,56px);font-weight:300;letter-spacing:-.03em;line-height:1.04}
.hero p{margin:0;max-width:56ch;color:var(--ink-2);font-size:15px}

.card{position:relative;padding:clamp(18px,3vw,26px);border-radius:30px;background:linear-gradient(160deg,var(--glass-hi),var(--glass) 45%);
  backdrop-filter:blur(26px) saturate(185%) brightness(1.04);-webkit-backdrop-filter:blur(26px) saturate(185%) brightness(1.04);
  box-shadow:var(--lift),inset 0 1px 0 var(--rim-hi),inset 0 -1px 0 var(--rim-lo),inset 0 0 28px rgba(255,255,255,.05)}
.card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.2px;pointer-events:none;
  background:linear-gradient(140deg,var(--rim-hi),transparent 28%,transparent 68%,var(--rim-lo));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.card::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(120% 55% at 8% 0%,rgba(255,255,255,.18),transparent 60%)}
.card>*{position:relative;z-index:1}
.card h2{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em}
.card-sub{margin:4px 0 16px;color:var(--ink-2);font-size:13px}
.stack{display:grid;gap:20px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px 28px}
.span{grid-column:1/-1}
@media(max-width:640px){.pair{grid-template-columns:1fr}.card{border-radius:26px}}

/* unggah */
.drop{position:relative;display:grid;place-items:center;min-height:150px;padding:20px;border:1.5px dashed var(--rim-hi);border-radius:22px;background:var(--glass);text-align:center;cursor:pointer;
  box-shadow:inset 0 1px 0 var(--rim-lo);transition:background .25s,transform .25s,box-shadow .25s}
.drop:hover,.drop.drag-over{background:var(--glass-hi);transform:translateY(-1px);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 20%,transparent)}
.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.drop-icon{display:grid;width:42px;height:42px;place-items:center;margin:0 auto 10px;border-radius:14px;color:var(--accent-ink);
  background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 96%,#fff),color-mix(in srgb,var(--accent) 72%,transparent));box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 6px 16px rgba(0,0,0,.25)}
.drop-icon svg{width:20px;height:20px}
.model3d-file-name{display:block;overflow-wrap:anywhere;font-size:14px;font-weight:650}
.model3d-file-meta{display:block;margin-top:4px;color:var(--ink-2);font-size:12px}

/* preview */
.model3d-viewport{position:relative;height:clamp(320px,60vh,560px);overflow:hidden;border-radius:24px;touch-action:none;
  background:radial-gradient(ellipse at 50% 38%,rgba(255,255,255,.18),transparent 62%),var(--well);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo),inset 0 -30px 60px rgba(0,0,0,.12)}
.model3d-viewport canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}
.model3d-empty{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:10px;padding:22px;text-align:center;pointer-events:none;color:var(--ink-2)}
.model3d-empty svg{width:84px;height:84px;color:var(--ink);filter:drop-shadow(0 8px 22px rgba(0,0,0,.35))}
.model3d-empty b{margin-top:6px;color:var(--ink);font-size:15px}
.model3d-empty span{max-width:250px;font-size:13px}
.model3d-viewport.has-model .model3d-empty{display:none}
.model3d-preview-bar{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;font-size:12px}
.model3d-preview-bar span{padding:6px 12px;border-radius:99px;background:var(--glass);box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo);color:var(--ink-2)}
.model3d-status{min-height:20px;margin-top:12px;color:var(--ink-2);font-size:13px;line-height:1.5}
.model3d-status.error,.model3d-status.success{color:var(--ink);font-weight:600}

/* kontrol */
.model3d-control{min-width:0}
.model3d-control-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;font-size:13px;font-weight:600}
.model3d-control-head output{font-variant-numeric:tabular-nums}
.model3d-control-hint,.model3d-toggle small{display:block;margin-top:4px;color:var(--ink-2);font-size:12px;line-height:1.5;font-weight:400}
.model3d-control input[type=range]{-webkit-appearance:none;appearance:none;display:block;width:100%;height:28px;margin:0;background:transparent;cursor:pointer;--fill:50%}
.model3d-control input[type=range]::-webkit-slider-runnable-track{height:7px;border-radius:99px;background:linear-gradient(90deg,var(--accent) var(--fill),var(--track) var(--fill));box-shadow:inset 0 1px 2px rgba(0,0,0,.25)}
.model3d-control input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;margin-top:-9.5px;border-radius:50%;border:1px solid rgba(255,255,255,.95);
  background:radial-gradient(circle at 32% 26%,#fff,rgba(255,255,255,.85) 42%,rgba(255,255,255,.6));box-shadow:0 5px 14px rgba(0,0,0,.4),inset 0 -3px 6px rgba(0,0,0,.14);transition:transform .18s}
.model3d-control input[type=range]:active::-webkit-slider-thumb{transform:scale(1.12)}
.model3d-control input[type=range]::-moz-range-track{height:7px;border-radius:99px;background:var(--track)}
.model3d-control input[type=range]::-moz-range-progress{height:7px;border-radius:99px;background:var(--accent)}
.model3d-control input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;border:1px solid #fff;background:radial-gradient(circle at 32% 26%,#fff,rgba(255,255,255,.7));box-shadow:0 5px 14px rgba(0,0,0,.4)}
.model3d-control input[type=range]:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:99px}

.model3d-toggle{display:flex;align-items:flex-start;gap:12px;font-size:14px;font-weight:600;cursor:pointer}
.model3d-toggle input[type=checkbox]{-webkit-appearance:none;appearance:none;position:relative;flex:none;width:46px;height:28px;margin:0;border-radius:99px;cursor:pointer;
  background:var(--track);box-shadow:inset 0 1px 3px rgba(0,0,0,.3),inset 0 0 0 1px var(--rim-lo);transition:background .25s}
.model3d-toggle input[type=checkbox]::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;
  background:radial-gradient(circle at 32% 26%,#fff,rgba(255,255,255,.85) 55%,rgba(255,255,255,.62));box-shadow:0 3px 8px rgba(0,0,0,.4);transition:transform .3s cubic-bezier(.3,1.5,.5,1),background .25s}
.model3d-toggle input[type=checkbox]:checked{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 94%,#fff),color-mix(in srgb,var(--accent) 74%,transparent))}
.model3d-toggle input[type=checkbox]:checked::after{transform:translateX(18px);background:var(--accent-ink)}
.model3d-toggle input[type=checkbox]:focus-visible{outline:2px solid var(--accent);outline-offset:3px}

.model3d-quality{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border-radius:16px;background:var(--well);box-shadow:inset 0 1px 3px rgba(0,0,0,.25),inset 0 0 0 1px var(--rim-lo)}
.model3d-quality button{min-height:40px;border:0;border-radius:12px;background:transparent;color:var(--ink-2);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .25s,color .25s,box-shadow .25s}
.model3d-quality button.active{color:var(--ink);background:linear-gradient(180deg,var(--glass-hi),var(--glass));box-shadow:inset 0 1px 0 var(--rim-hi),0 4px 12px rgba(0,0,0,.25)}
.model3d-quality button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}

/* ekspor */
.model3d-export{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:10px 22px;border:0;border-radius:99px;color:var(--ink);font:inherit;font-size:14px;font-weight:650;cursor:pointer;
  background:linear-gradient(180deg,var(--glass-hi),var(--glass));backdrop-filter:blur(16px) saturate(170%);-webkit-backdrop-filter:blur(16px) saturate(170%);
  box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo),0 10px 24px rgba(0,0,0,.2);transition:transform .2s,filter .2s}
.btn:hover{transform:translateY(-1px);filter:brightness(1.1)}.btn:active{transform:scale(.97)}.btn:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.btn-primary{color:var(--accent-ink);background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 94%,#fff),color-mix(in srgb,var(--accent) 76%,transparent));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 1px rgba(255,255,255,.3),0 10px 26px rgba(0,0,0,.28)}
.model3d-new{margin-top:14px}
.model3d-export-note{margin:0;color:var(--ink-2);font-size:12px;line-height:1.55}
@media(max-width:520px){.model3d-export .btn{flex:1 1 100%}.model3d-viewport{height:clamp(280px,56vh,420px)}}

.model3d-target button{font-size:12px;padding-inline:4px}
.opt-meter{display:grid;gap:8px;padding:14px;border-radius:20px;background:var(--well);box-shadow:inset 0 1px 3px rgba(0,0,0,.2),inset 0 0 0 1px var(--rim-lo)}
.opt-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;font-size:14px}
.opt-row b{font-variant-numeric:tabular-nums;font-weight:650}
.opt-state{padding:4px 12px;border-radius:99px;font-size:12px;font-weight:650;color:var(--ink-2);background:var(--glass);box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo)}
.opt-state[data-tone=ok]{color:var(--accent-ink);background:var(--accent)}
.opt-state[data-tone=warn]{color:var(--ink);background:transparent;box-shadow:inset 0 0 0 1.5px var(--ink);text-decoration:underline dotted;text-underline-offset:3px}
.opt-bar{height:9px;border-radius:99px;background:var(--track);overflow:hidden}
.opt-bar i{display:block;height:100%;width:0;border-radius:inherit;background:var(--accent);transition:width .45s cubic-bezier(.3,1,.4,1)}
.opt-meter .model3d-control-hint{margin:0}
.opt-note{margin-top:14px}
.is-off .model3d-target,.is-off .opt-meter{opacity:.55}
.vp-reset{position:absolute;top:12px;right:12px;z-index:2;display:none;align-items:center;gap:6px;min-height:40px;padding:8px 14px;border:0;border-radius:99px;color:var(--ink);font:inherit;font-size:12px;font-weight:650;cursor:pointer;
  background:linear-gradient(180deg,var(--glass-hi),var(--glass));backdrop-filter:blur(14px) saturate(170%);-webkit-backdrop-filter:blur(14px) saturate(170%);box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo),0 8px 20px rgba(0,0,0,.25)}
.vp-reset svg{width:15px;height:15px}.vp-reset:active{transform:scale(.96)}.vp-reset:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.model3d-viewport.has-model .vp-reset{display:inline-flex}
/* tombol nonaktif */
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none;filter:none}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  :root{--glass:rgba(48,48,48,.88);--glass-hi:rgba(70,70,70,.94)}
  
}

</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="ico-mesh" viewBox="0 0 64 64"><path d="M32 6 58 32 32 58 6 32 32 6Z" fill="currentColor" fill-opacity=".14"/>
<path d="M12.5 25.5 38.5 51.5M19 19 45 45M25.5 12.5 51.5 38.5M12.5 38.5 38.5 12.5M19 45 45 19M25.5 51.5 51.5 25.5" fill="none" stroke="currentColor" stroke-opacity=".65" stroke-width="1.8" stroke-linecap="round"/>
<path d="M32 6 58 32 32 58 6 32 32 6Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
<circle cx="32" cy="6" r="2.6" fill="currentColor"/><circle cx="58" cy="32" r="2.6" fill="currentColor"/><circle cx="32" cy="58" r="2.6" fill="currentColor"/><circle cx="6" cy="32" r="2.6" fill="currentColor"/></symbol>
</svg>

<main class="shell" id="page-model3d">
  <header class="hero">
    <span class="badge"><svg aria-hidden="true"><use href="#ico-mesh"/></svg>Roblox mesh studio</span>
    <h1>Image to Mesh</h1>
    <p>Bentuk gambar menjadi mesh timbul yang halus dan padat. Hasilnya mesh putih polos tanpa tekstur dan tanpa warna vertex. Semua diproses lokal di browser.</p>
  </header>

  <section class="card" aria-labelledby="t-upload">
    <h2 id="t-upload">Gambar sumber</h2>
    <p class="card-sub">PNG, JPG, atau WebP. Gambar hanya dibaca untuk siluet, tidak diunggah ke server.</p>
    <label class="drop" id="model3d-drop-zone">
      <input type="file" id="model3d-file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp">
      <span>
        <span class="drop-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg></span>
        <span class="model3d-file-name" id="model3d-file-name">Pilih gambar</span>
        <span class="model3d-file-meta" id="model3d-file-meta">Klik untuk memilih atau tarik file ke sini. Maks. 15 MB</span>
      </span>
    </label>
  </section>

  <section class="card" aria-label="Preview mesh 3D">
    <h2>Preview</h2>
    <p class="card-sub">Geser untuk memutar, cubit atau scroll untuk zoom, ketuk dua kali untuk reset.</p>
    <div class="model3d-viewport" id="model3d-viewport">
      <canvas id="model3d-canvas" aria-label="Preview 3D yang dapat diputar"></canvas>
      <button type="button" class="vp-reset" id="model3d-reset" aria-label="Reset sudut kamera"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Reset</button>
      <div class="model3d-empty" id="model3d-empty">
        <svg viewBox="0 0 64 64" aria-hidden="true"><use href="#ico-mesh"/></svg>
        <b>Belum ada mesh</b>
        <span>Pilih gambar di atas, hasil ekstrusi 3D tampil di sini.</span>
      </div>
    </div>
    <div class="model3d-preview-bar"><span id="model3d-dimensions">Belum ada mesh</span><span id="model3d-triangle-count">Siap memutar</span></div>
    <div class="model3d-status" id="model3d-status" role="status" aria-live="polite">Pilih gambar untuk membuat mesh 3D.</div>
  </section>

  <section class="card" aria-labelledby="t-bg">
    <h2 id="t-bg">Latar belakang</h2>
    <p class="card-sub">Bagian yang dibuang sebelum gambar dijadikan siluet.</p>
    <div class="stack">
      <label class="model3d-toggle"><input type="checkbox" id="model3d-remove-bg" checked><span>Hapus latar polos otomatis<small>Warna yang mirip sudut gambar dibuat transparan, termasuk bagian dalam huruf.</small></span></label>
      <div class="model3d-control"><div class="model3d-control-head"><label for="model3d-tolerance">Toleransi latar</label><output id="model3d-tolerance-value">48</output></div><input type="range" id="model3d-tolerance" min="12" max="110" value="48" aria-label="Toleransi penghapusan latar"></div>
    </div>
  </section>

  <section class="card" aria-labelledby="t-shape">
    <h2 id="t-shape">Bentuk</h2>
    <p class="card-sub">Ukuran dan kontur mesh. Preview diperbarui langsung.</p>
    <div class="pair">
      <div class="model3d-control"><div class="model3d-control-head"><label for="model3d-depth">Ketebalan</label><output id="model3d-depth-value">1.0 studs</output></div><input type="range" id="model3d-depth" min="0.2" max="3.5" step="0.1" value="1" aria-label="Ketebalan mesh"></div>
      <div class="model3d-control"><div class="model3d-control-head"><label for="model3d-size">Ukuran maksimum</label><output id="model3d-size-value">6 studs</output></div><input type="range" id="model3d-size" min="2" max="12" step="0.5" value="6" aria-label="Ukuran maksimum model"></div>
      <div class="model3d-control span"><div class="model3d-control-head"><label for="model3d-smoothness">Kehalusan kontur</label><output id="model3d-smoothness-value">1.6 px</output></div><input type="range" id="model3d-smoothness" min="0.3" max="2.4" step="0.1" value="1.6" aria-label="Kehalusan kontur mesh"><small class="model3d-control-hint">Kontur diproses pada resolusi tinggi. Naikkan untuk sudut lebih membulat.</small></div>
    </div>
  </section>

  <section class="card" aria-labelledby="t-detail">
    <h2 id="t-detail">Detail dan tampilan</h2>
    <p class="card-sub">Makin tinggi detail, makin banyak segitiga.</p>
    <div class="stack">
      <div class="model3d-control"><div class="model3d-control-head"><span>Kerapatan kontur</span></div><div class="model3d-quality" role="group" aria-label="Detail mesh"><button type="button" data-budget="6000" onclick="setModel3DBudget(this)">Ringan</button><button type="button" class="active" data-budget="12000" onclick="setModel3DBudget(this)">Seimbang</button><button type="button" data-budget="18000" onclick="setModel3DBudget(this)">Tinggi</button></div></div>
      <label class="model3d-toggle"><input type="checkbox" id="model3d-auto-rotate" checked><span>Putar otomatis<small>Berhenti saat kamu menyentuh preview.</small></span></label>
    </div>
  </section>

  <section class="card" id="model3d-optimize-card" aria-labelledby="t-opt">
    <h2 id="t-opt">Optimasi Roblox</h2>
    <p class="card-sub">Jumlah segitiga disesuaikan otomatis ke target. Detail dikurangi bertahap, mulai dari yang paling tidak terlihat.</p>
    <div class="stack">
      <label class="model3d-toggle"><input type="checkbox" id="model3d-optimize" checked><span>Optimasi otomatis<small>Satu material per mesh, bevel dan kepadatan permukaan dituning sampai muat target.</small></span></label>
      <div class="model3d-control"><div class="model3d-control-head"><span>Target segitiga</span></div><div class="model3d-quality model3d-target" role="group" aria-label="Target segitiga"><button type="button" data-target="4000" aria-pressed="false" onclick="setModel3DOptimizeTarget(this)">Aksesori 4.000</button><button type="button" class="active" data-target="10000" aria-pressed="true" onclick="setModel3DOptimizeTarget(this)">Aman 10.000</button><button type="button" data-target="20000" aria-pressed="false" onclick="setModel3DOptimizeTarget(this)">Maks 20.000</button></div></div>
      <div class="opt-meter" aria-live="polite">
        <div class="opt-row"><b id="model3d-opt-count">– / 10.000 segitiga</b><span class="opt-state" id="model3d-opt-state">Menunggu gambar</span></div>
        <div class="opt-bar" role="presentation"><i id="model3d-opt-fill"></i></div>
        <small class="model3d-control-hint" id="model3d-opt-detail">Pilih gambar, mesh akan disesuaikan otomatis ke target.</small>
      </div>
    </div>
    <p class="model3d-export-note opt-note">Batas resmi bisa berubah dan berbeda tiap jenis aset. Angka yang umum dipakai: sekitar 20.000 sampai 21.000 segitiga per MeshPart dan 4.000 untuk aksesori UGC. Cek dokumentasi Roblox terbaru sebelum upload.</p>
  </section>

  <section class="card" aria-labelledby="t-export">
    <h2 id="t-export">Ekspor</h2>
    <p class="card-sub">Tersedia setelah mesh selesai dibuat.</p>
    <div class="model3d-export" id="model3d-export" hidden>
      <button type="button" class="btn btn-primary" onclick="exportModel3DGLTF()">Unduh glTF</button>
      <button type="button" class="btn" onclick="exportModel3DOBJ()">Unduh OBJ</button>
    </div>
    <p class="model3d-export-note">Ekspor putih polos, tanpa tekstur dan tanpa warna vertex. Untuk glTF, simpan file .gltf dan .bin dalam satu folder. OBJ ikut menyertakan file .mtl. Saat optimasi aktif, ekspor memakai satu material.</p>
    <div class="model3d-export model3d-new"><button type="button" class="btn" id="new-btn" disabled>Mesh baru</button></div>
  </section>
</main>
<script>
let model3dFile = null;
let model3dGrid = null;
let model3dMeshData = null;
let model3dBudget = 12000;
let model3dBuildToken = 0;
let model3dRenderState = null;
let model3dRenderFrame = 0;
let model3dMeshTimer = 0;
let model3dThreePromise = null;
let model3dPageActive = true;
/* Optimasi Roblox: tangga kualitas dari paling detail ke paling ringan.
   bevel = segmen bevel (null=bawaan, 0=tanpa bevel), face = panjang maks sisi segitiga depan/belakang (px grid, null=bawaan),
   tol = tambahan toleransi penyederhanaan kontur (px). */
const MODEL3D_LADDER=[
  {bevel:null,face:null,tol:0},
  {bevel:6,face:7,tol:.2},
  {bevel:4,face:10,tol:.4},
  {bevel:3,face:14,tol:.7},
  {bevel:2,face:20,tol:1.1},
  {bevel:2,face:32,tol:1.6},
  {bevel:1,face:64,tol:2.4},
  {bevel:1,face:1e9,tol:3.5},
  {bevel:0,face:1e9,tol:5}
];
let model3dTune=MODEL3D_LADDER[0];
let model3dOpt={on:true,target:10000,step:0,triangles:0,over:false};

function setModel3DStatus(message,type='') {
  const node=document.getElementById('model3d-status');
  node.textContent=message;
  node.className=\`model3d-status\${type ? \` \${type}\` : ''}\`;
}

function model3DColorDistance(data,a,b) {
  const r=data[a]-data[b],g=data[a+1]-data[b+1],bl=data[a+2]-data[b+2];
  return Math.sqrt(r*r+g*g+bl*bl);
}
function removeModel3DBackground(context,width,height,tolerance) {
  const image=context.getImageData(0,0,width,height), data=image.data;
  const corners=[0,(width-1)*4,((height-1)*width)*4,(height*width-1)*4];
  if(corners.some(offset=>data[offset+3]<245)) return image;
  const background=[0,0,0];
  corners.forEach(offset=>{for(let c=0;c<3;c++) background[c]+=data[offset+c]/4});
  const near=corners.filter(offset=>{
    const r=data[offset]-background[0],g=data[offset+1]-background[1],b=data[offset+2]-background[2];
    return Math.sqrt(r*r+g*g+b*b)<=tolerance*1.8;
  }).length;
  if(near<3) return image;
  for(let offset=0;offset<data.length;offset+=4){
    if(data[offset+3]<245) continue;
    const r=data[offset]-background[0],g=data[offset+1]-background[1],b=data[offset+2]-background[2];
    if(Math.sqrt(r*r+g*g+b*b)<=tolerance) data[offset+3]=0;
  }
  return image;
}
function scanModel3DCanvas(canvas) {
  const context=canvas.getContext('2d',{willReadFrequently:true});
  const image=context.getImageData(0,0,canvas.width,canvas.height), data=image.data;
  let filled=0,boundary=0,minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
  const isSolid=(x,y)=>x>=0&&y>=0&&x<canvas.width&&y<canvas.height&&data[(y*canvas.width+x)*4+3]>=16;
  for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) if(isSolid(x,y)){
    filled++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    if(!isSolid(x,y-1)) boundary++;if(!isSolid(x+1,y)) boundary++;
    if(!isSolid(x,y+1)) boundary++;if(!isSolid(x-1,y)) boundary++;
  }
  return {context,image,filled,boundary,triangles:filled*4+boundary*2,minX,minY,maxX,maxY};
}
function prepareModel3DGrid(bitmap,removeBg,tolerance,budget) {
  const maxDimension=budget<=6000?320:budget<=12000?448:640;
  const scale=Math.min(4,maxDimension/Math.max(bitmap.width,bitmap.height));
  const source=document.createElement('canvas');
  source.width=Math.max(1,Math.round(bitmap.width*scale));source.height=Math.max(1,Math.round(bitmap.height*scale));
  let context=source.getContext('2d',{willReadFrequently:true});
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,source.width,source.height);
  if(removeBg) context.putImageData(removeModel3DBackground(context,source.width,source.height,tolerance),0,0);
  let scan=scanModel3DCanvas(source);
  if(!scan.filled) throw new Error('Siluet tidak ditemukan. Matikan hapus latar atau pilih gambar lain.');
  const crop=document.createElement('canvas');
  crop.width=scan.maxX-scan.minX+1;crop.height=scan.maxY-scan.minY+1;
  crop.getContext('2d',{willReadFrequently:true}).drawImage(source,scan.minX,scan.minY,crop.width,crop.height,0,0,crop.width,crop.height);
  const finalCanvas=crop,finalScan=scanModel3DCanvas(finalCanvas);
  if(!finalScan.filled) throw new Error('Gambar terlalu tipis untuk dibuat sebagai mesh.');
  const pixels=finalScan.image.data, mask=new Uint8Array(finalCanvas.width*finalCanvas.height);
  for(let i=0;i<mask.length;i++) mask[i]=pixels[i*4+3]>=16?1:0;
  return {width:finalCanvas.width,height:finalCanvas.height,pixels,mask,filled:finalScan.filled,triangles:finalScan.triangles};
}
function disposeModel3DMesh() {
  const state=model3dRenderState;
  if(!state?.mesh) return;
  state.scene.remove(state.mesh);state.mesh.geometry.dispose();
  state.mesh.material.forEach(material=>{material.map?.dispose();material.dispose()});
  state.mesh=null;
}
async function buildModel3D() {
  if(!model3dFile) return;
  const token=++model3dBuildToken;
  model3dGrid=null;model3dMeshData=null;updateModel3DOptimizeUI(0);
  document.getElementById('model3d-export').hidden=true;
  document.getElementById('model3d-viewport').classList.remove('has-model');
  disposeModel3DMesh();syncModel3DActions();
  setModel3DStatus('Menganalisis gambar dan membentuk siluet...');
  let bitmap;
  try {
    bitmap=await createImageBitmap(model3dFile);
    if(bitmap.width>10000||bitmap.height>10000||bitmap.width*bitmap.height>40000000) throw new Error('Resolusi gambar terlalu besar. Gunakan gambar maksimal 40 megapiksel.');
    const tolerance=Number(document.getElementById('model3d-tolerance').value);
    model3dGrid=prepareModel3DGrid(bitmap,document.getElementById('model3d-remove-bg').checked,tolerance,model3dBudget);
    if(token!==model3dBuildToken) return;
    await rebuildModel3D(token);
  } catch(error) {
    if(token===model3dBuildToken) setModel3DStatus(error.message||'Gagal membentuk mesh dari gambar.','error');
  } finally { if(bitmap) bitmap.close(); }
}
function setModel3DBudget(button) {
  model3dBudget=Number(button.dataset.budget);
  document.querySelectorAll('.model3d-quality button').forEach(item=>item.classList.toggle('active',item===button));
  if(model3dFile) buildModel3D();
}
function chooseModel3DFile(file) {
  if(!file) return;
  if(!/^image\\/(png|jpeg|webp)$/.test(file.type)||file.size>15*1024*1024){model3dFile=null;model3dGrid=null;model3dMeshData=null;document.getElementById('model3d-export').hidden=true;document.getElementById('model3d-viewport').classList.remove('has-model');syncModel3DActions();setModel3DStatus('Pilih PNG, JPG, atau WebP maksimal 15 MB.','error');return}
  model3dFile=file;
  document.getElementById('model3d-file-name').textContent=file.name;
  document.getElementById('model3d-file-meta').textContent=\`\${(file.size/1048576).toFixed(2)} MB · Gambar diproses lokal\`;
  buildModel3D();
}
function model3DContourArea(points) {
  let area=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-b[0]*a[1]}
  return area/2;
}
function model3DPointInPolygon(point,polygon) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function simplifyModel3DContour(points) {
  return points.filter((point,index)=>{
    const prev=points[(index+points.length-1)%points.length],next=points[(index+1)%points.length];
    return Math.abs((point[0]-prev[0])*(next[1]-point[1])-(point[1]-prev[1])*(next[0]-point[0]))>1e-5;
  });
}
function simplifyModel3DClosedContour(points,tolerance) {
  const clean=simplifyModel3DContour(points);
  if(clean.length<9) return clean;
  let split=1,farthest=0;
  for(let i=1;i<clean.length;i++){
    const dx=clean[i][0]-clean[0][0],dy=clean[i][1]-clean[0][1],distance=dx*dx+dy*dy;
    if(distance>farthest){farthest=distance;split=i}
  }
  const reduce=contour=>{
    const keep=new Uint8Array(contour.length),stack=[[0,contour.length-1]],toleranceSquared=tolerance*tolerance;
    keep[0]=keep[contour.length-1]=1;
    while(stack.length){
      const [start,end]=stack.pop(),a=contour[start],b=contour[end];
      const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
      let farIndex=-1,farDistance=toleranceSquared;
      for(let i=start+1;i<end;i++){
        const point=contour[i],t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)):0;
        const px=point[0]-(a[0]+dx*t),py=point[1]-(a[1]+dy*t),distance=px*px+py*py;
        if(distance>farDistance){farDistance=distance;farIndex=i}
      }
      if(farIndex>=0){keep[farIndex]=1;stack.push([start,farIndex],[farIndex,end])}
    }
    return contour.filter((point,index)=>keep[index]);
  };
  const left=reduce(clean.slice(0,split+1));
  const right=reduce(clean.slice(split).concat([clean[0]]));
  const result=left.concat(right.slice(1,-1));
  return result.length>=4?result:clean;
}
function smoothModel3DContour(points,amount,extra=0) {
  let result=simplifyModel3DContour(points);
  const iterations=Math.max(1,Math.min(4,Math.round(amount*1.6)));
  for(let pass=0;pass<iterations;pass++){
    const next=[];
    for(let i=0;i<result.length;i++){
      const a=result[i],b=result[(i+1)%result.length];
      next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);
    }
    result=next;
  }
  return result.length>=4?simplifyModel3DClosedContour(result,.35+amount*.25+extra):simplifyModel3DContour(points);
}
function traceModel3DContours(grid) {
  const edges=[],outgoing=new Map(),width=grid.width,height=grid.height;
  const solid=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&grid.mask[y*width+x];
  const key=(x,y)=>y*(width+1)+x;
  const add=(x1,y1,x2,y2,direction)=>{
    const edge={x:x1,y:y1,start:key(x1,y1),end:key(x2,y2),direction,used:false},index=edges.length;
    edges.push(edge);
    if(!outgoing.has(edge.start)) outgoing.set(edge.start,[]);
    outgoing.get(edge.start).push(index);
  };
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) if(solid(x,y)){
    if(!solid(x,y-1)) add(x,y,x+1,y,0);
    if(!solid(x+1,y)) add(x+1,y,x+1,y+1,1);
    if(!solid(x,y+1)) add(x+1,y+1,x,y+1,2);
    if(!solid(x-1,y)) add(x,y+1,x,y,3);
  }
  const loops=[];
  for(let first=0;first<edges.length;first++){
    if(edges[first].used) continue;
    const points=[],start=edges[first].start;
    let current=first,closed=false;
    for(let guard=0;guard<=edges.length;guard++){
      const edge=edges[current];if(edge.used) break;
      edge.used=true;points.push([edge.x,edge.y]);
      if(edge.end===start){closed=true;break}
      const candidates=(outgoing.get(edge.end)||[]).filter(index=>!edges[index].used);
      if(!candidates.length) break;
      const priority={1:0,0:1,3:2,2:3};
      candidates.sort((a,b)=>priority[(edges[a].direction-edge.direction+4)%4]-priority[(edges[b].direction-edge.direction+4)%4]);
      current=candidates[0];
    }
    const contour=simplifyModel3DContour(points);
    const area=contour.length>=4?model3DContourArea(contour):0;
    if(closed&&contour.length>=4&&Math.abs(area)>.5) loops.push({points:contour,area});
  }
  return loops;
}
function buildModel3DGeometry(THREE,grid) {
  const loops=traceModel3DContours(grid),outers=loops.filter(loop=>loop.area>0).map(loop=>({...loop,holes:[]}));
  const holes=loops.filter(loop=>loop.area<0);
  for(const hole of holes){
    let parent=null;
    for(const outer of outers) if(model3DPointInPolygon(hole.points[0],outer.points)&&(!parent||Math.abs(outer.area)<Math.abs(parent.area))) parent=outer;
    if(parent) parent.holes.push(hole);
  }
  if(!outers.length) throw new Error('Tidak dapat menutup kontur gambar. Coba naikkan toleransi latar.');
  const size=Number(document.getElementById('model3d-size').value),unit=size/Math.max(grid.width,grid.height);
  const depth=Number(document.getElementById('model3d-depth').value),smoothness=Number(document.getElementById('model3d-smoothness').value);
  const bevelThickness=Math.min(depth*.16,.18),bevelSize=unit*Math.min(1.25,.25+smoothness*.38);
  const partData=[];
  let vertexCount=0;
  const addPath=(path,points)=>{
    const smoothed=smoothModel3DContour(points,smoothness,model3dTune.tol||0),first=smoothed[0];
    path.moveTo((first[0]-grid.width/2)*unit,(grid.height/2-first[1])*unit);
    for(let i=1;i<smoothed.length;i++) path.lineTo((smoothed[i][0]-grid.width/2)*unit,(grid.height/2-smoothed[i][1])*unit);
    path.closePath();
  };
  for(const outer of outers){
    const shape=new THREE.Shape();addPath(shape,outer.points);
    for(const hole of outer.holes){const path=new THREE.Path();addPath(path,hole.points);shape.holes.push(path)}
    const bevelSeg=model3dTune.bevel==null?Math.max(8,Math.round(8+smoothness*4)):model3dTune.bevel,bt=bevelSeg>0?bevelThickness:0;
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.01,depth-2*bt),steps:1,bevelEnabled:bevelSeg>0,bevelSegments:Math.max(1,bevelSeg),bevelThickness,bevelSize});
    geometry.translate(0,0,-depth/2+bt);
    const positions=geometry.attributes.position.array.slice(),normals=geometry.attributes.normal.array.slice();
    partData.push({positions,normals,groups:geometry.groups.map(group=>({...group,start:group.start+vertexCount}))});
    vertexCount+=positions.length/3;geometry.dispose();
  }
  const positions=new Float32Array(vertexCount*3),normals=new Float32Array(vertexCount*3),groups=[];
  let offset=0;
  for(const part of partData){positions.set(part.positions,offset*3);normals.set(part.normals,offset*3);groups.push(...part.groups);offset+=part.positions.length/3}
  const sideNormalSums=new Map();
  for(const group of groups) if(group.materialIndex===1) for(let vertex=group.start;vertex<group.start+group.count;vertex++){
    const offset=vertex*3,key=\`\${Math.round(positions[offset]*1e5)},\${Math.round(positions[offset+1]*1e5)},\${Math.round(positions[offset+2]*1e5)}\`;
    const sum=sideNormalSums.get(key)||[0,0,0];
    sum[0]+=normals[offset];sum[1]+=normals[offset+1];sum[2]+=normals[offset+2];sideNormalSums.set(key,sum);
  }
  for(const group of groups) if(group.materialIndex===1) for(let vertex=group.start;vertex<group.start+group.count;vertex++){
    const offset=vertex*3,key=\`\${Math.round(positions[offset]*1e5)},\${Math.round(positions[offset+1]*1e5)},\${Math.round(positions[offset+2]*1e5)}\`,sum=sideNormalSums.get(key),length=Math.hypot(sum[0],sum[1],sum[2])||1;
    normals[offset]=sum[0]/length;normals[offset+1]=sum[1]/length;normals[offset+2]=sum[2]/length;
  }
  const densePositions=[],denseNormals=[],denseGroups=[];
  const faceMaxEdge=model3dTune.face==null?(grid.width>=560?4:grid.width>=380?5:6):model3dTune.face;
  const readVertex=index=>({position:[positions[index*3],positions[index*3+1],positions[index*3+2]],normal:[normals[index*3],normals[index*3+1],normals[index*3+2]]});
  const appendVertex=vertex=>{densePositions.push(...vertex.position);denseNormals.push(...vertex.normal)};
  const middle=(a,b)=>{
    const normal=a.normal.map((value,index)=>value+b.normal[index]),length=Math.hypot(...normal)||1;
    return {position:a.position.map((value,index)=>(value+b.position[index])/2),normal:normal.map(value=>value/length)};
  };
  const edgeLength=(a,b)=>Math.hypot((a.position[0]-b.position[0])/unit,(a.position[1]-b.position[1])/unit);
  const subdivide=(a,b,c,depth=0)=>{
    const ab=edgeLength(a,b),bc=edgeLength(b,c),ca=edgeLength(c,a),longest=Math.max(ab,bc,ca);
    if(longest<=faceMaxEdge||depth>=12){appendVertex(a);appendVertex(b);appendVertex(c);return}
    if(ab>=bc&&ab>=ca){const m=middle(a,b);subdivide(a,m,c,depth+1);subdivide(m,b,c,depth+1)}
    else if(bc>=ca){const m=middle(b,c);subdivide(b,m,a,depth+1);subdivide(m,c,a,depth+1)}
    else {const m=middle(c,a);subdivide(c,m,b,depth+1);subdivide(m,a,b,depth+1)}
  };
  for(const group of groups){
    const start=densePositions.length/3;
    for(let vertex=group.start;vertex<group.start+group.count;vertex+=3){
      const a=readVertex(vertex),b=readVertex(vertex+1),c=readVertex(vertex+2);
      if(group.materialIndex===0) subdivide(a,b,c);
      else {appendVertex(a);appendVertex(b);appendVertex(c)}
    }
    const count=densePositions.length/3-start;
    if(count) denseGroups.push({start,count,materialIndex:group.materialIndex});
  }
  const finalPositions=new Float32Array(densePositions),finalNormals=new Float32Array(denseNormals),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(finalPositions,3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(finalNormals,3));
  denseGroups.forEach(group=>geometry.addGroup(group.start,group.count,group.materialIndex));
  geometry.computeBoundingSphere();
  return {geometry,positions:finalPositions,normals:finalNormals,groups:denseGroups};
}
function model3DRender() {
  const state=model3dRenderState;
  if(!state||!model3dPageActive||document.hidden){model3dRenderFrame=0;return}
  if(document.getElementById('model3d-auto-rotate').checked&&!state.pointers.size) state.theta+=.0008;
  const sin=Math.sin(state.phi),radius=state.distance;
  state.camera.position.set(radius*sin*Math.sin(state.theta),radius*Math.cos(state.phi),radius*sin*Math.cos(state.theta));
  state.camera.lookAt(0,0,0);
  state.renderer.render(state.scene,state.camera);
  model3dRenderFrame=requestAnimationFrame(model3DRender);
}
/* model3dPageActive hanya penanda halaman aktif (selalu true di versi mandiri). Jangan diubah saat tab disembunyikan,
   kalau tidak loop render tidak pernah menyala lagi setelah tab kembali terlihat. */
function setModel3DRendering(active) {
  if(!model3dRenderState) return;
  cancelAnimationFrame(model3dRenderFrame);model3dRenderFrame=0;
  if(active&&model3dPageActive&&!document.hidden) model3dRenderFrame=requestAnimationFrame(model3DRender);
}
function ensureModel3DLoop() { if(model3dRenderState&&!model3dRenderFrame&&!document.hidden) setModel3DRendering(true); }
function resetModel3DView() {
  const state=model3dRenderState;if(!state) return;
  state.theta=.48;state.phi=1.08;state.distance=Math.max(8,Number(document.getElementById('model3d-size').value)*2.55);
  state.pointers.clear();ensureModel3DLoop();
}
/* Kontrol putar/zoom. Titik sentuh yang "nyangkut" (pointerup tidak pernah datang) dibersihkan supaya
   satu jari tidak dianggap pinch dan auto-rotate tidak berhenti selamanya. */
function attachModel3DControls(canvas,state) {
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const end=event=>{state.pointers.delete(event.pointerId)};
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0) return;
    if(event.isPrimary) state.pointers.clear();
    try{canvas.setPointerCapture(event.pointerId)}catch(error){}
    state.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    ensureModel3DLoop();
  });
  canvas.addEventListener('pointermove',event=>{
    const point=state.pointers.get(event.pointerId);if(!point) return;
    if(event.pointerType!=='touch'&&event.buttons===0){state.pointers.delete(event.pointerId);return}
    if(state.pointers.size>1){
      const other=[...state.pointers.entries()].find(([id])=>id!==event.pointerId)?.[1];
      const oldDistance=Math.hypot(point.x-other.x,point.y-other.y),newDistance=Math.hypot(event.clientX-other.x,event.clientY-other.y);
      if(newDistance>0&&oldDistance>0) state.distance=clamp(state.distance*oldDistance/newDistance,5,42);
    } else {state.theta-=(event.clientX-point.x)*.009;state.phi=clamp(state.phi-(event.clientY-point.y)*.009,.15,Math.PI-.15)}
    point.x=event.clientX;point.y=event.clientY;
    ensureModel3DLoop();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name,end);
  canvas.addEventListener('contextmenu',event=>{event.preventDefault();state.pointers.clear()});
  canvas.addEventListener('wheel',event=>{event.preventDefault();state.distance=clamp(state.distance*(event.deltaY>0?1.08:.92),5,42);ensureModel3DLoop()},{passive:false});
  canvas.addEventListener('dblclick',resetModel3DView);
  canvas.addEventListener('webglcontextrestored',()=>setModel3DRendering(true));
  window.addEventListener('blur',()=>state.pointers.clear());
}
async function initModel3DRenderer() {
  if(!model3dThreePromise) model3dThreePromise=import('https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js');
  const THREE=await model3dThreePromise;
  if(model3dRenderState) return {THREE,state:model3dRenderState};
  const canvas=document.getElementById('model3d-canvas'),viewport=document.getElementById('model3d-viewport');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(34,1,.1,100);
  scene.add(new THREE.HemisphereLight(0xe9f7ed,0x526156,2.2));
  const key=new THREE.DirectionalLight(0xffffff,2.7);key.position.set(-4,7,8);scene.add(key);
  const rim=new THREE.DirectionalLight(0xffffff,1.2);rim.position.set(5,2,-5);scene.add(rim);
  const state={THREE,renderer,scene,camera,mesh:null,theta:.48,phi:1.08,distance:16,pointers:new Map(),resizeObserver:null};
  model3dRenderState=state;
  const resize=()=>{
    const width=Math.max(1,viewport.clientWidth),height=Math.max(1,viewport.clientHeight);
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  };
  state.resizeObserver=new ResizeObserver(resize);state.resizeObserver.observe(viewport);resize();
  attachModel3DControls(canvas,state);
  if(model3dPageActive) setModel3DRendering(true);
  return {THREE,state};
}
function model3DCountTriangles(built) { return built.groups.reduce((sum,group)=>sum+group.count/3,0); }
/* Cari langkah paling detail yang masih muat di target segitiga (pencarian biner pada tangga). */
function optimizeModel3DGeometry(THREE,grid,target,build=buildModel3DGeometry) {
  const cache=new Map();
  const attempt=step=>{
    if(!cache.has(step)){model3dTune=MODEL3D_LADDER[step];const built=build(THREE,grid);cache.set(step,{step,built,triangles:model3DCountTriangles(built)})}
    return cache.get(step);
  };
  let lo=0,hi=MODEL3D_LADDER.length-1,pick=attempt(0),over=false;
  if(pick.triangles>target){
    const last=attempt(hi);
    if(last.triangles>target){pick=last;over=true}
    else{
      while(hi-lo>1){const mid=(lo+hi)>>1;if(attempt(mid).triangles<=target) hi=mid;else lo=mid}
      pick=attempt(hi);
    }
  }
  for(const entry of cache.values()) if(entry!==pick) entry.built.geometry?.dispose?.();
  model3dTune=MODEL3D_LADDER[pick.step];
  return {built:pick.built,step:pick.step,triangles:pick.triangles,over};
}
function updateModel3DOptimizeUI(triangles) {
  const on=model3dOpt.on,target=model3dOpt.target;
  const fmt=value=>Math.round(value).toLocaleString('id-ID');
  const bar=document.getElementById('model3d-opt-fill'),count=document.getElementById('model3d-opt-count'),state=document.getElementById('model3d-opt-state'),detail=document.getElementById('model3d-opt-detail');
  document.getElementById('model3d-optimize-card').classList.toggle('is-off',!on);
  if(!triangles){count.textContent=\`– / \${fmt(target)} segitiga\`;bar.style.width='0%';state.textContent=on?'Menunggu gambar':'Optimasi mati';state.dataset.tone='';detail.textContent='Pilih gambar, mesh akan disesuaikan otomatis ke target.';return}
  const ratio=Math.min(100,triangles/target*100);
  count.textContent=\`\${fmt(triangles)} / \${fmt(target)} segitiga\`;bar.style.width=\`\${ratio}%\`;
  if(!on){state.textContent=triangles<=target?'Di bawah target':'Di atas target';state.dataset.tone=triangles<=target?'ok':'warn';detail.textContent='Optimasi otomatis mati, mesh memakai pengaturan manual.';return}
  state.textContent=model3dOpt.over?'Masih di atas target':'Lolos target';state.dataset.tone=model3dOpt.over?'warn':'ok';
  const t=model3dTune,parts=[t.bevel==null?'bevel penuh':t.bevel===0?'tanpa bevel':\`bevel \${t.bevel} segmen\`,t.face==null||t.face<1e8?(t.face==null?'permukaan padat':\`permukaan lebih jarang\`):'permukaan tanpa subdivisi',t.tol?\`kontur disederhanakan \${t.tol.toFixed(1)} px\`:'kontur penuh'];
  detail.textContent=model3dOpt.step===0?'Detail penuh sudah muat di target, tidak ada yang dikurangi.':\`Detail dikurangi bertahap: \${parts.join(', ')}.\`+(model3dOpt.over?' Turunkan ukuran gambar atau pilih detail Ringan.':'');
}
function setModel3DOptimizeTarget(button) {
  model3dOpt.target=Number(button.dataset.target);
  document.querySelectorAll('.model3d-target button').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',active)});
  if(model3dGrid) scheduleModel3DRebuild();else updateModel3DOptimizeUI(0);
}
async function rebuildModel3D(token=model3dBuildToken) {
  if(!model3dGrid) return;
  const {THREE,state}=await initModel3DRenderer();
  if(token!==model3dBuildToken) return;
  let built;
  if(model3dOpt.on){
    const result=optimizeModel3DGeometry(THREE,model3dGrid,model3dOpt.target);
    built=result.built;model3dOpt.step=result.step;model3dOpt.triangles=result.triangles;model3dOpt.over=result.over;
  } else {
    model3dTune=MODEL3D_LADDER[0];built=buildModel3DGeometry(THREE,model3dGrid);
    model3dOpt.step=0;model3dOpt.triangles=model3DCountTriangles(built);model3dOpt.over=model3dOpt.triangles>model3dOpt.target;
  }
  if(state.mesh){state.scene.remove(state.mesh);state.mesh.geometry.dispose();state.mesh.material.forEach(material=>{material.map?.dispose();material.dispose()})}
  const front=new THREE.MeshStandardMaterial({color:0xeeeeee,roughness:.6,metalness:0,side:THREE.DoubleSide});
  const sides=new THREE.MeshStandardMaterial({color:0xeeeeee,roughness:.6,metalness:0,side:THREE.DoubleSide});
  state.mesh=new THREE.Mesh(built.geometry,[front,sides]);state.scene.add(state.mesh);state.distance=Math.max(8,Number(document.getElementById('model3d-size').value)*2.55);
  model3dMeshData={positions:built.positions,normals:built.normals,groups:built.groups};
  document.getElementById('model3d-viewport').classList.add('has-model');
  document.getElementById('model3d-export').hidden=false;
  const size=Number(document.getElementById('model3d-size').value),unit=size/Math.max(model3dGrid.width,model3dGrid.height);
  const width=model3dGrid.width*unit,height=model3dGrid.height*unit;
  document.getElementById('model3d-dimensions').textContent=\`\${width.toFixed(1)} × \${height.toFixed(1)} × \${Number(document.getElementById('model3d-depth').value).toFixed(1)} studs\`;
  const triangleCount=built.groups.reduce((sum,group)=>sum+group.count/3,0);
  document.getElementById('model3d-triangle-count').textContent=\`\${Math.round(triangleCount).toLocaleString('id-ID')} segitiga · kontur \${model3dGrid.width} × \${model3dGrid.height}\`;
  document.getElementById('model3d-depth-value').textContent=\`\${Number(document.getElementById('model3d-depth').value).toFixed(1)} studs\`;
  document.getElementById('model3d-size-value').textContent=\`\${size.toFixed(1)} studs\`;
  document.getElementById('model3d-smoothness-value').textContent=\`\${Number(document.getElementById('model3d-smoothness').value).toFixed(1)} px\`;
  updateModel3DOptimizeUI(model3dOpt.triangles);
  setModel3DStatus(model3dOpt.on?(model3dOpt.over?'Mesh siap, tetapi masih di atas target Roblox. Lihat kartu Optimasi Roblox.':'Mesh putih polos siap dan sudah dioptimasi untuk Roblox.'):'Mesh putih polos padat tanpa tekstur siap.','success');
  setModel3DRendering(model3dPageActive);
  syncModel3DActions();
}
function scheduleModel3DRebuild() {
  document.getElementById('model3d-depth-value').textContent=\`\${Number(document.getElementById('model3d-depth').value).toFixed(1)} studs\`;
  document.getElementById('model3d-size-value').textContent=\`\${Number(document.getElementById('model3d-size').value).toFixed(1)} studs\`;
  document.getElementById('model3d-smoothness-value').textContent=\`\${Number(document.getElementById('model3d-smoothness').value).toFixed(1)} px\`;
  clearTimeout(model3dMeshTimer);model3dMeshTimer=setTimeout(()=>rebuildModel3D().catch(error=>setModel3DStatus(error.message||'Preview 3D tidak tersedia.','error')),90);
}
function model3DBaseName() {
  return (model3dFile?.name||'Luma_Mesh').replace(/\\.[^.]+$/,'').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||'Luma_Mesh';
}
function downloadModel3DFile(blob,name) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;link.hidden=true;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function createModel3DGLTF() {
  if(!model3dMeshData) throw new Error('Buat mesh terlebih dahulu.');
  const data=model3dMeshData,vertexCount=data.positions.length/3;
  const indexType=vertexCount<=65535?Uint16Array:Uint32Array,indexComponent=indexType===Uint16Array?5123:5125;
  const grouped=[[],[]];
  for(const group of data.groups){const target=grouped[group.materialIndex]||grouped[1];for(let i=group.start;i<group.start+group.count;i++) target.push(i)}
  if(model3dOpt.on){grouped[0]=grouped[0].concat(grouped[1]);grouped[1]=[]}
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<data.positions.length;i+=3) for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],data.positions[i+axis]);max[axis]=Math.max(max[axis],data.positions[i+axis])}
  const plans=[
    {array:data.positions,target:34962,componentType:5126,type:'VEC3',count:vertexCount,min,max},
    {array:data.normals,target:34962,componentType:5126,type:'VEC3',count:vertexCount},
    ...grouped.map((values,material)=>{
      let minIndex=0,maxIndex=0;
      if(values.length){minIndex=values[0];maxIndex=values[0];for(let i=1;i<values.length;i++){minIndex=Math.min(minIndex,values[i]);maxIndex=Math.max(maxIndex,values[i])}}
      return {array:new indexType(values),target:34963,componentType:indexComponent,type:'SCALAR',count:values.length,material,min:[minIndex],max:[maxIndex]};
    }).filter(plan=>plan.count)
  ];
  let byteLength=0;
  for(const plan of plans){byteLength=(byteLength+3)&~3;plan.byteOffset=byteLength;plan.byteLength=plan.array.byteLength;byteLength+=plan.byteLength}
  const binary=new ArrayBuffer(byteLength),bufferViews=[],accessors=[],indexAccessorByMaterial={};
  plans.forEach((plan,index)=>{
    new Uint8Array(binary,plan.byteOffset,plan.byteLength).set(new Uint8Array(plan.array.buffer,plan.array.byteOffset,plan.byteLength));
    bufferViews.push({buffer:0,byteOffset:plan.byteOffset,byteLength:plan.byteLength,target:plan.target});
    const accessor={bufferView:index,componentType:plan.componentType,count:plan.count,type:plan.type};
    if(plan.min) accessor.min=plan.min;if(plan.max) accessor.max=plan.max;
    accessors.push(accessor);
    if(plan.material!==undefined) indexAccessorByMaterial[plan.material]=index;
  });
  const primitives=[0,1].filter(material=>indexAccessorByMaterial[material]!==undefined).map(material=>({attributes:{POSITION:0,NORMAL:1},indices:indexAccessorByMaterial[material],material,mode:4}));
  const base=model3DBaseName();
  const material=name=>({name,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1},doubleSided:true});
  const gltf={asset:{version:'2.0',generator:'Luma Studio 3D Maker'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:base}],meshes:[{name:base,primitives}],materials:model3dOpt.on?[material('White mesh')]:[material('White front and back'),material('White sides')],buffers:[{uri:\`\${base}.bin\`,byteLength}],bufferViews,accessors};
  return {base,json:JSON.stringify(gltf),binary};
}
function exportModel3DGLTF() {
  try {
    const output=createModel3DGLTF();
    downloadModel3DFile(new Blob([output.json],{type:'model/gltf+json'}),\`\${output.base}.gltf\`);
    downloadModel3DFile(new Blob([output.binary],{type:'application/octet-stream'}),\`\${output.base}.bin\`);
    setModel3DStatus('glTF putih polos tanpa tekstur dan BIN diunduh. Simpan keduanya dalam satu folder, lalu impor file .gltf.','success');
  } catch(error) { setModel3DStatus(error.message||'Ekspor glTF gagal.','error'); }
}
function exportModel3DOBJ() {
  if(!model3dMeshData){setModel3DStatus('Buat mesh terlebih dahulu.','error');return}
  const data=model3dMeshData,vertexCount=data.positions.length/3,lines=['# Luma Studio - extruded image mesh',\`o \${model3DBaseName()}\`];
  for(let i=0;i<data.positions.length;i+=3) lines.push(\`v \${data.positions[i].toFixed(5)} \${data.positions[i+1].toFixed(5)} \${data.positions[i+2].toFixed(5)}\`);
  for(let i=0;i<data.normals.length;i+=3) lines.push(\`vn \${data.normals[i].toFixed(4)} \${data.normals[i+1].toFixed(4)} \${data.normals[i+2].toFixed(4)}\`);
  const base=model3DBaseName(),material=['newmtl LumaFront','Ka 1 1 1','Kd 1 1 1','Ks 0 0 0','illum 1',''].concat(model3dOpt.on?[]:['newmtl LumaSides','Ka 1 1 1','Kd 1 1 1','Ks 0 0 0','illum 1','']);
  lines.splice(1,0,\`mtllib \${base}.mtl\`);
  for(const group of data.groups){
    lines.push(model3dOpt.on||group.materialIndex===0?'usemtl LumaFront':'usemtl LumaSides');
    for(let i=group.start+1;i<group.start+group.count;i+=3) lines.push(\`f \${i}//\${i} \${i+1}//\${i+1} \${i+2}//\${i+2}\`);
  }
  downloadModel3DFile(new Blob([lines.join('\\n')],{type:'text/plain'}),\`\${base}.obj\`);
  downloadModel3DFile(new Blob([material.join('\\n')],{type:'text/plain'}),\`\${base}.mtl\`);
  setModel3DStatus('OBJ dan MTL putih polos tanpa tekstur diunduh.','success');
}

/* ── Mesh baru, tema ── */
function syncModel3DActions() {
  document.getElementById('new-btn').disabled=!model3dMeshData&&!model3dFile;
}
function resetModel3D() {
  ++model3dBuildToken;clearTimeout(model3dMeshTimer);
  model3dFile=null;model3dGrid=null;model3dMeshData=null;
  disposeModel3DMesh();
  document.getElementById('model3d-export').hidden=true;
  document.getElementById('model3d-viewport').classList.remove('has-model');
  document.getElementById('model3d-file-name').textContent='Pilih gambar';
  document.getElementById('model3d-file-meta').textContent='Klik untuk memilih atau tarik file ke sini. Maks. 15 MB';
  document.getElementById('model3d-dimensions').textContent='Belum ada mesh';
  document.getElementById('model3d-triangle-count').textContent='Siap memutar';
  updateModel3DOptimizeUI(0);
  setModel3DStatus('Pilih gambar untuk membuat mesh 3D.');
  syncModel3DActions();
  window.scrollTo({top:0,behavior:'smooth'});
}
/* Tema dari halaman induk: warna dasar + palet 3 warna (terang, sedang, gelap). */
function applyBxTheme(data) {
  if(!data||!/^#[0-9a-fA-F]{6}$/.test(data.bg)||!Array.isArray(data.p)||data.p.length!==3) return;
  const p=data.p.map(color=>Array.isArray(color)&&color.length===3?color.map(v=>Math.max(0,Math.min(255,Math.round(Number(v)||0)))):null);
  if(p.some(color=>!color)) return;
  const base=[1,3,5].map(i=>parseInt(data.bg.substr(i,2),16));
  const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
  const rgb=color=>'rgb('+color.join(',')+')',rgba=(color,alpha)=>'rgba('+color.join(',')+','+alpha+')';
  const set=(name,value)=>document.documentElement.style.setProperty(name,value);
  set('--bg1',data.bg);set('--bg2',rgb(mix(base,p[2],.16)));
  set('--orb1',rgb(p[1]));set('--orb2',rgb(p[2]));set('--orb3',rgb(p[0]));set('--orb4',rgb(mix(p[2],base,.5)));
  set('--accent',rgb(p[0]));set('--accent-ink',data.bg);
  set('--glass',rgba(p[0],.07));set('--glass-hi',rgba(p[0],.16));set('--rim-hi',rgba(p[0],.6));set('--rim-lo',rgba(p[0],.16));
  set('--track',rgba(p[0],.17));set('--ink-2',rgba(p[0],.74));
  if(data.scheme==='light'||data.scheme==='dark') set('color-scheme',data.scheme);
}
window.addEventListener('message',event=>{
  if(event.source===window.parent&&event.data&&event.data.bx==='theme') applyBxTheme(event.data);
});
document.getElementById('new-btn').addEventListener('click',resetModel3D);
document.getElementById('model3d-file').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';chooseModel3DFile(file)});
const model3DDrop=document.getElementById('model3d-drop-zone');
model3DDrop.addEventListener('dragover',event=>{event.preventDefault();model3DDrop.classList.add('drag-over')});
model3DDrop.addEventListener('dragleave',()=>model3DDrop.classList.remove('drag-over'));
model3DDrop.addEventListener('drop',event=>{event.preventDefault();model3DDrop.classList.remove('drag-over');chooseModel3DFile(event.dataTransfer.files[0])});
document.getElementById('model3d-remove-bg').addEventListener('change',()=>buildModel3D());
document.getElementById('model3d-tolerance').addEventListener('input',event=>{document.getElementById('model3d-tolerance-value').textContent=event.target.value});
document.getElementById('model3d-tolerance').addEventListener('change',()=>{if(model3dFile) buildModel3D()});
document.getElementById('model3d-depth').addEventListener('input',scheduleModel3DRebuild);
document.getElementById('model3d-size').addEventListener('input',scheduleModel3DRebuild);
document.getElementById('model3d-smoothness').addEventListener('input',scheduleModel3DRebuild);
document.getElementById('model3d-optimize').addEventListener('change',event=>{model3dOpt.on=event.target.checked;if(model3dGrid) scheduleModel3DRebuild();else updateModel3DOptimizeUI(0)});
document.getElementById('model3d-auto-rotate').addEventListener('change',()=>setModel3DRendering(true));
document.addEventListener('visibilitychange',()=>{if(model3dRenderState) model3dRenderState.pointers.clear();setModel3DRendering(!document.hidden)});
window.addEventListener('pageshow',()=>setModel3DRendering(true));
window.addEventListener('focus',ensureModel3DLoop);
document.getElementById('model3d-reset').addEventListener('click',resetModel3DView);


updateModel3DOptimizeUI(0);syncModel3DActions();
/* isi track slider */
(function(){
  const paint=el=>el.style.setProperty('--fill',((el.value-el.min)/(el.max-el.min)*100)+'%');
  document.querySelectorAll('.model3d-control input[type=range]').forEach(el=>{paint(el);el.addEventListener('input',()=>paint(el))});
})();

</script>
</body>
</html>
`;

return { default: __default };
})();

const M_obfus = (() => {

// BAXDEV VIP Plus Lua obfuscator. Served only through /api/tool after server-side VIP+ validation.
const __default = String.raw`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Obfus</title>
<style>
:root{color-scheme:dark;--bg:#11131a;--text:#f3f5fb;--muted:#9ba4b8;--line:rgba(255,255,255,.14);--g1:rgba(255,255,255,.08);--btn:#a5b4fc;--btn-ink:#11131a;--blob:rgba(99,102,241,.22)}
*{box-sizing:border-box}html{background:transparent}body{margin:0;padding:4px 2px 24px;font:14px/1.5 system-ui,sans-serif;color:var(--text);background:transparent}html.autoh body{overflow:hidden}
.wrap{max-width:980px;margin:auto}.kicker{font-size:11px;letter-spacing:.16em;color:var(--btn);font-weight:800}h1{font-size:clamp(25px,5vw,36px);margin:5px 0}p{color:var(--muted);margin:4px 0 18px}.panel{border:1px solid var(--line);background:var(--g1);border-radius:18px;padding:16px;margin-top:14px}label{display:block;font-weight:700;margin-bottom:8px}textarea{width:100%;min-height:260px;resize:vertical;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.15);color:var(--text);padding:13px;font:12px/1.55 ui-monospace,monospace;outline:none}textarea:focus{border-color:var(--btn)}.out{min-height:240px}button{border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer;background:var(--btn);color:var(--btn-ink);margin:8px 7px 0 0}button.secondary{background:var(--g1);color:var(--text);border:1px solid var(--line)}.hint{font-size:12px;color:var(--muted)}#status{font-size:12px;color:var(--btn);margin-top:9px}
</style></head><body><main class="wrap"><div class="kicker">BAXDEV / LUA TOOLS</div><h1>Obfus Lua</h1><p>Samarkan nama variabel lokal dan rapikan kode Lua/Luau Roblox. Jalankan hasilnya di lingkungan uji terlebih dahulu.</p>
<section class="panel"><label for="src">Kode Lua / Luau</label><textarea id="src" spellcheck="false" placeholder="Tempel kode Lua/Luau di sini..."></textarea><button id="run">Obfuscate</button><button class="secondary" id="clear">Bersihkan</button><div class="hint">Mode ringan: tidak mengenkripsi kode. Hindari kode yang memakai nama lokal secara dinamis atau bergantung pada debug.getlocal.</div></section>
<section class="panel"><label for="out">Hasil obfuscation</label><textarea id="out" class="out" spellcheck="false" readonly placeholder="Hasil akan muncul di sini..."></textarea><button id="copy">Salin hasil</button><div id="status" role="status"></div></section></main>
<script>
const $=id=>document.getElementById(id);
function obfuscate(code){
 if(!code.trim()) throw Error('Masukkan kode terlebih dahulu.');
 // Token-aware lightweight minifier: keeps quoted strings and long-bracket strings/comments intact.
 const tokens=[]; let i=0, n=code.length;
 while(i<n){
  const c=code[i], d=code[i+1];
  if(/\s/.test(c)){i++;continue}
  if(c==='-'&&d==='-'){
   let j=i+2,eq='';
   if(code[j]==='['){let k=j+1;while(code[k]==='='){eq+='=';k++}if(code[k]==='['){const end=']'+eq+']';const p=code.indexOf(end,k+1);i=p<0?n:p+end.length;continue}}
   while(i<n&&code[i]!=='\n')i++;continue;
  }
  if(c==='"'||c==="'"||c==='\x60'){
   const q=c;let tok=q;i++;
   while(i<n){const x=code[i++];tok+=x;if(x==='\\'&&i<n){tok+=code[i++];continue}if(x===q)break}
   tokens.push(tok);continue;
  }
  if(c==='['){let j=i+1,eq='';while(code[j]==='='){eq+='=';j++}if(code[j]==='['){const end=']'+eq+']',p=code.indexOf(end,j+1);if(p>=0){tokens.push(code.slice(i,p+end.length));i=p+end.length;continue}}}
  const id=code.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
  if(id){tokens.push(id[0]);i+=id[0].length;continue}
  const num=code.slice(i).match(/^(?:0[xX][0-9A-Fa-f_]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);if(num){tokens.push(num[0]);i+=num[0].length;continue}
  const op=['...', '..','==','~=','<=','>=','+=','-=','*=','/=','//','::','->'].find(x=>code.startsWith(x,i));
  if(op){tokens.push(op);i+=op.length}else{tokens.push(c);i++}
 }
 const reserved=new Set(('and break do else elseif end false for function if in local nil not or repeat return then true until while continue export type typeof self').split(' '));
 const names=new Map();let count=0;
 for(let k=0;k<tokens.length-1;k++){
  if(tokens[k]==='local'){
   let j=k+1;
   if(tokens[j]==='function')j++;
   if(/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokens[j]||'')&&!reserved.has(tokens[j])){
    const name=tokens[j];
    if(!names.has(name))names.set(name,'_v'+(++count).toString(36));
   }
  }
 }
 // Replace tokens only in syntactic identifier positions; preserve member keys after . or : and table keys before =.
 const out=[];let bd=0;
 for(let k=0;k<tokens.length;k++){
  const t=tokens[k],prev=tokens[k-1],next=tokens[k+1];
  const tableKey=bd>0&&next==='='&&(prev==='{'||prev===','||prev===';');
  if(names.has(t)&&prev!=='.'&&prev!==':'&&!tableKey) out.push(names.get(t));
  else out.push(t);
  if(t==='{')bd++;else if(t==='}'&&bd>0)bd--;
 }
 let result='';
 for(let k=0;k<out.length;k++){
  const a=out[k],b=out[k+1]||'';
  result+=a;
  if((/[A-Za-z0-9_]$/.test(a)&&/^[A-Za-z0-9_]/.test(b))||((a==='-'&&b==='-')||(a==='/'&&b==='/'))||(/^\d/.test(a)&&b.startsWith('.')))result+=' ';
 }
 return result;
}
$('run').onclick=()=>{try{$('out').value=obfuscate($('src').value);$('status').textContent='Selesai. Uji hasil di Roblox Studio.'}catch(e){$('status').textContent=e.message}};
$('clear').onclick=()=>{$('src').value='';$('out').value='';$('status').textContent=''};
$('copy').onclick=async()=>{const v=$('out').value;if(!v){$('status').textContent='Belum ada hasil.';return}try{await navigator.clipboard.writeText(v);$('status').textContent='Hasil disalin.'}catch(e){$('out').select();document.execCommand('copy');$('status').textContent='Hasil disalin.'}};
function applyBxTheme(data){if(!data||!/^#[0-9a-fA-F]{6}$/.test(data.bg)||!Array.isArray(data.p)||data.p.length!==3)return;const p=data.p.map(c=>Array.isArray(c)&&c.length===3?c.map(v=>Math.max(0,Math.min(255,Math.round(Number(v)||0)))):null);if(p.some(c=>!c))return;const rgb=c=>'rgb('+c.join(',')+')',rgba=(c,a)=>'rgba('+c.join(',')+','+a+')',r=document.documentElement.style,l=p[0];r.setProperty('--bg',data.bg);r.setProperty('--text',rgb(l));r.setProperty('--muted',rgba(l,.64));r.setProperty('--line',rgba(l,.17));r.setProperty('--g1',rgba(l,.08));r.setProperty('--btn',rgb(l));r.setProperty('--btn-ink',data.bg);r.setProperty('--blob',rgba(p[1],.26));if(data.scheme==='light'||data.scheme==='dark')r.setProperty('color-scheme',data.scheme)}
addEventListener('message',e=>{if(e.source===parent&&e.data&&e.data.bx==='theme')applyBxTheme(e.data)});

// Satu scroll: tinggi iframe mengikuti isi halaman (induk memakai pesan bx:height), jadi tidak ada isi yang terpotong.
(function(){
  if(window.parent===window)return;
  document.documentElement.classList.add('autoh');
  let last=0;
  const send=()=>{const h=Math.ceil(document.body.getBoundingClientRect().height);if(h&&h!==last){last=h;window.parent.postMessage({bx:'height',h:h},'*')}};
  new ResizeObserver(send).observe(document.body);
  addEventListener('load',send);send();
})();
</script></body></html>`;

return { default: __default };
})();

const M_skybox_360 = (() => {

// Sumber tool VIP Plus. Disajikan lewat /api/tool setelah cek VIP Plus; jangan taruh sebagai file statis.
// Edit: di dalam template literal ini tanda \, ` dan ${ harus di-escape dengan \.
const __default = `<!DOCTYPE html>
<html lang="id" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src https://cdn.jsdelivr.net blob: data:; font-src data:; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>SkyBox 360°</title>
<style>
:root{--bg:#050505;--text:#fff;--muted:rgba(255,255,255,.64);--faint:rgba(255,255,255,.4);--g1:rgba(255,255,255,.12);--g2:rgba(255,255,255,.035);--line:rgba(255,255,255,.17);--rim1:rgba(255,255,255,.7);--rim2:rgba(255,255,255,.26);--shadow:0 24px 60px rgba(0,0,0,.55);--inner:inset 0 1px 0 rgba(255,255,255,.28),inset 0 0 24px rgba(255,255,255,.035);--btn:#fff;--btn-ink:#000;--hl:rgba(255,255,255,.14);--blob:rgba(255,255,255,.17);--field:rgba(255,255,255,.07);
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media(prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#ececee;--text:#0a0a0a;--muted:rgba(0,0,0,.6);--faint:rgba(0,0,0,.4);--g1:rgba(255,255,255,.72);--g2:rgba(255,255,255,.36);--line:rgba(255,255,255,.9);--rim1:#fff;--rim2:rgba(255,255,255,.7);--shadow:0 20px 50px rgba(0,0,0,.14);--inner:inset 0 1px 0 #fff,inset 0 0 20px rgba(255,255,255,.4);--btn:#0a0a0a;--btn-ink:#fff;--hl:rgba(255,255,255,.95);--blob:rgba(0,0,0,.13);--field:rgba(255,255,255,.6);}}
:root[data-theme="light"]{--bg:#ececee;--text:#0a0a0a;--muted:rgba(0,0,0,.6);--faint:rgba(0,0,0,.4);--g1:rgba(255,255,255,.72);--g2:rgba(255,255,255,.36);--line:rgba(255,255,255,.9);--rim1:#fff;--rim2:rgba(255,255,255,.7);--shadow:0 20px 50px rgba(0,0,0,.14);--inner:inset 0 1px 0 #fff,inset 0 0 20px rgba(255,255,255,.4);--btn:#0a0a0a;--btn-ink:#fff;--hl:rgba(255,255,255,.95);--blob:rgba(0,0,0,.13);--field:rgba(255,255,255,.6);}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
html{background:transparent}
body{margin:0;background:transparent;color:var(--text);font:14px/1.5 var(--sans);
 padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
body.no-scroll{overflow:hidden}
html.autoh,html.autoh body{overflow:hidden}
main{width:100%;max-width:880px;margin:0 auto;display:grid;gap:16px}
.glass{position:relative;background:radial-gradient(260px circle at var(--mx,50%) var(--my,-30%),var(--hl),transparent 62%),linear-gradient(135deg,var(--g1),var(--g2));
 -webkit-backdrop-filter:blur(28px) saturate(170%);backdrop-filter:blur(28px) saturate(170%);border:1px solid var(--line);box-shadow:var(--inner),var(--shadow)}
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;
 background:linear-gradient(145deg,var(--rim1),transparent 32%,transparent 68%,var(--rim2));
 -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.card{padding:clamp(16px,3vw,24px);border-radius:28px}
.card[hidden]{display:none}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:12px;min-width:0}
.logo,.icon-btn{display:grid;flex:none;width:46px;height:46px;place-items:center;border-radius:16px;color:var(--text)}
.icon-btn{cursor:pointer;border-radius:50%}.icon-btn:hover{transform:translateY(-1px)}
.logo svg,.icon-btn svg{width:22px;height:22px}
.kicker{color:var(--faint);font:10px var(--mono);letter-spacing:.2em}
h1{margin:2px 0 0;font-size:clamp(22px,5vw,32px);letter-spacing:-.02em;line-height:1.1}
h2{margin:0 0 6px;font-size:15px;font-weight:650}
.sub{max-width:660px;margin:0;color:var(--muted);font-size:13px}
.help{margin:0;color:var(--muted);font-size:12px;line-height:1.65}
.drop{position:relative;display:grid;min-height:150px;place-items:center;margin-top:14px;padding:22px;text-align:center;border:1px dashed var(--faint);border-radius:22px;background:var(--field);cursor:pointer;transition:border-color .2s,background .2s}
.drop:hover,.drop.drag-over{border-color:var(--text)}
.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.drop-icon{display:grid;width:46px;height:46px;place-items:center;margin:0 auto 10px;border:1px solid var(--line);border-radius:50%}
.drop-icon svg{width:20px;height:20px}
.drop-title{display:block;overflow-wrap:anywhere;font-size:14px;font-weight:620}
.drop-meta{display:block;margin-top:5px;color:var(--muted);font-size:11px;overflow-wrap:anywhere}
.controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px}
.controls[hidden],.progress[hidden]{display:none!important}
.select-wrap{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:12px}
select{min-height:42px;padding:0 30px 0 14px;border:1px solid var(--line);border-radius:999px;background:var(--field);color:var(--text);font:inherit;cursor:pointer}
select:focus-visible,.btn:focus-visible,.mini:focus-visible,.icon-btn:focus-visible,.seg button:focus-visible,.dock button:focus-visible,#view-canvas:focus-visible{outline:2px solid var(--text);outline-offset:2px}
.btn{min-height:44px;padding:0 22px;border:0;border-radius:999px;background:var(--btn);color:var(--btn-ink);font:inherit;font-weight:650;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 6px 20px rgba(0,0,0,.25);transition:transform .15s,opacity .15s}
.btn:hover:not(:disabled){transform:translateY(-1px)}.btn:disabled{opacity:.35;cursor:not-allowed}
.progress{height:4px;overflow:hidden;margin-top:12px;border-radius:999px;background:var(--line)}
.progress>i{display:block;width:0;height:100%;border-radius:inherit;background:var(--text);transition:width .2s}
.status{min-height:20px;margin-top:12px;color:var(--muted);font-size:12px;line-height:1.55}
.status.error{color:var(--text);font-weight:600}.status.error::before{content:"✕ "}.status.success{color:var(--text)}.status.success::before{content:"✓ "}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.card-head h2{margin:0}
.seg{display:inline-flex;padding:3px;border:1px solid var(--line);border-radius:999px;background:var(--field)}
.seg button{min-height:34px;padding:0 14px;border:0;border-radius:999px;background:transparent;color:var(--muted);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--btn);color:var(--btn-ink)}.seg button:disabled{opacity:.35;cursor:not-allowed}
.viewer{position:relative;overflow:hidden;aspect-ratio:16/10;min-height:260px;border-radius:22px;background:#000;border:1px solid var(--line)}
.viewer.is-full{position:fixed;inset:0;z-index:100;aspect-ratio:auto;border-radius:0;border:0}
.glass.fs-on{-webkit-backdrop-filter:none;backdrop-filter:none;transform:none}
#view-canvas{position:absolute;inset:0;display:block;width:100%;height:100%;cursor:grab;touch-action:none;outline-offset:-3px}
#view-canvas:active{cursor:grabbing}
.hud{position:absolute;display:flex;gap:6px;pointer-events:none;color:#fff;font-size:11px}
.hud-top{top:12px;left:12px}.viewer.is-full .hud-top{top:max(12px,env(safe-area-inset-top))}
.chip,.dock{background:rgba(20,20,20,.42);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}
.chip{padding:5px 11px;border-radius:999px;font:11px var(--mono)}
.hint{font-family:var(--sans);position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:8px 14px;border-radius:999px;font-size:12px;color:#fff;text-align:center;pointer-events:none;transition:opacity .5s;max-width:90%}
.viewer.seen .hint{opacity:0}
.dock{position:absolute;left:50%;bottom:12px;display:flex;gap:2px;padding:5px;border-radius:999px;transform:translateX(-50%)}
.viewer.is-full .dock{bottom:max(14px,env(safe-area-inset-bottom))}
.dock button{display:grid;width:40px;height:40px;place-items:center;border:0;border-radius:50%;background:transparent;color:#fff;cursor:pointer}
.dock button:hover,.dock button[aria-pressed="true"]{background:rgba(255,255,255,.22)}
.dock svg{width:18px;height:18px}
.gl-fail{position:absolute;inset:0;display:grid;place-items:center;padding:20px;color:#fff;text-align:center;font-size:13px}
.faces-wrap{margin-top:18px}.faces-wrap h2{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px}.face{cursor:pointer;transition:transform .15s,border-color .15s}.face:hover{transform:translateY(-2px)}.face.active{border-color:var(--text);box-shadow:0 0 0 1px var(--text)}
.faces{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
.face{min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--field)}
.face img{display:block;width:100%;aspect-ratio:1;object-fit:cover}
.face-info{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px}
.face-info b{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.face-info a{flex:none;color:var(--muted);font-size:11px;text-decoration:none}.face-info a:hover{color:var(--text)}
.results{display:none}.results.visible{display:block}
.id-list{display:grid;gap:6px;margin-top:10px}
.id-row{display:grid;grid-template-columns:72px minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px 12px;border:1px solid var(--line);border-radius:14px;background:var(--field)}
.id-row b{color:var(--muted);font-size:11px}
.id-row code{min-width:0;overflow:hidden;font:11px var(--mono);text-overflow:ellipsis;white-space:nowrap}
.mini{padding:6px 12px;border:1px solid var(--line);border-radius:999px;background:var(--field);color:var(--text);font:inherit;font-size:11px;cursor:pointer}
.code-wrap{margin-top:14px}
.code-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;font-size:12px;font-weight:620}
.code{display:block;width:100%;min-height:220px;resize:vertical;padding:14px;border:1px solid var(--line);border-radius:18px;background:rgba(0,0,0,.62);color:#f2f2f2;font:11px/1.6 var(--mono);white-space:pre;overflow:auto}
#toast{position:absolute;left:50%;top:calc(var(--vt,0px) + var(--vh,100vh) - 18px);z-index:200;display:grid;gap:8px;transform:translate(-50%,-100%);pointer-events:none}
.toast-item{padding:10px 18px;border-radius:999px;font-size:12px;transition:opacity .3s,transform .3s;background:rgba(20,20,20,.7);color:#fff;border:1px solid rgba(255,255,255,.2);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}
@media(max-width:720px){.faces{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.face-info{padding:7px 9px}.face-info b{font-size:10px}.id-row{grid-template-columns:56px minmax(0,1fr) auto}.viewer{aspect-ratio:4/3}}
@media(max-width:720px) and (orientation:landscape){.faces{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:420px){.controls>.btn{width:100%}.select-wrap{width:100%;justify-content:space-between}.id-row{grid-template-columns:1fr auto}.id-row b{grid-column:1/-1}.id-row code{grid-column:1}.id-row .mini{grid-column:2;grid-row:2}}
</style>
</head>
<body>
<main>
  <header class="top">
    <div class="brand">
      <span class="logo glass"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5a4.5 4.5 0 0 1-.9-8.9A6 6 0 0 1 17.7 8.8 4.9 4.9 0 0 1 17 18.5H7Z"/></svg></span>
      <div><div class="kicker">ROBLOX TOOL / ENVIRONMENT</div><h1>SkyBox 360°</h1></div>
    </div>
    <button type="button" class="icon-btn glass" id="theme-btn" hidden aria-label="Ganti tema hitam / putih"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg></button>
  </header>
  <p class="sub">Ubah satu panorama 360° menjadi enam tekstur Skybox, lihat hasilnya langsung dalam lingkungan 360°, publish ke Roblox, lalu salin script siap jalan di Command Bar Studio.</p>

  <section class="glass card" aria-labelledby="panel-title">
    <h2 id="panel-title">1. Pilih panorama</h2>
    <p class="help">Gunakan panorama equirectangular dengan rasio 2:1. Format input PNG, JPG, atau WebP. Hasilnya enam PNG persegi untuk Front, Back, Left, Right, Top, dan Bottom.</p>
    <label class="drop" id="drop-zone">
      <input type="file" id="source-file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp">
      <span>
        <span class="drop-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span>
        <span class="drop-title" id="file-label">Pilih gambar panorama 360°</span>
        <span class="drop-meta" id="file-meta">Rekomendasi sumber 2:1, misalnya 4096 × 2048 px</span>
      </span>
    </label>
    <div class="controls">
      <div class="select-wrap"><label for="face-size">Ukuran tiap sisi</label>
        <select id="face-size"><option value="256">256 × 256</option><option value="512">512 × 512</option><option value="1024" selected>1024 × 1024 (disarankan)</option></select></div>
      <button type="button" class="btn" id="generate-btn" hidden disabled>Buat 6 sisi</button>
    </div>
    <div class="progress" id="progress" hidden><i id="progress-fill"></i></div>
    <div class="status" id="status" role="status" aria-live="polite"></div>
  </section>

  <section class="glass card" id="card-viewer" aria-labelledby="viewer-title" hidden>
    <div class="card-head">
      <h2 id="viewer-title">Preview 360°</h2>
      <div class="seg" role="group" aria-label="Sumber preview">
        <button type="button" data-mode="pano" aria-pressed="true">Panorama</button>
        <button type="button" data-mode="cube" aria-pressed="false" id="seg-cube" disabled>6 sisi</button>
      </div>
    </div>
    <div class="viewer" id="viewer">
      <canvas id="view-canvas" tabindex="0" aria-label="Preview 360°. Seret untuk memutar, scroll atau cubit untuk zoom, tombol panah untuk menggeser."></canvas>
      <div class="hud hud-top"><span class="chip" id="hud-mode">Panorama</span><span class="chip" id="hud-fov">FOV 75°</span></div>
      <div class="hint chip" id="hint">Seret untuk memutar · scroll / cubit untuk zoom · klik 2× untuk reset</div>
      <div class="dock" role="toolbar" aria-label="Kontrol preview">
        <button type="button" id="v-out" aria-label="Zoom out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/></svg></button>
        <button type="button" id="v-in" aria-label="Zoom in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/></svg></button>
        <button type="button" id="v-reset" aria-label="Reset arah"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
        <button type="button" id="v-auto" aria-label="Putar otomatis" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18.5 2v4h-4M5.5 22v-4h4"/></svg></button>
        <button type="button" id="v-full" aria-label="Layar penuh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>
      </div>
      <div class="gl-fail" id="gl-fail" hidden>WebGL tidak tersedia di perangkat ini, jadi preview 360° tidak bisa ditampilkan. Pembuatan 6 sisi tetap berfungsi.</div>
    </div>
      <div class="faces-wrap" id="card-faces" hidden>
      <h2>Enam sisi <span class="help">· ketuk sisi untuk melihatnya di preview</span></h2>
      <div class="faces" id="face-grid"></div>
      <div class="controls" id="publish-controls" hidden>
        <span class="help" id="publish-help">Setiap sisi akan diunggah sebagai aset gambar Roblox.</span>
        <div class="select-wrap"><label for="upscale-scale">Upscale sebelum upload</label>
          <select id="upscale-scale"><option value="1" selected>Tanpa upscale</option><option value="2">2×</option><option value="4">4×</option></select></div>
        <button type="button" class="btn" id="publish-btn">Publish 6 sisi ke Roblox</button>
      </div>
    </div>
  </section>


  <section class="glass card results" id="results">
    <h2>2. Asset ID Skybox</h2>
    <p class="help">Tunggu sampai keenam ID terisi. Lalu salin script dan jalankan di Roblox Studio melalui View → Command Bar. Script hanya mengganti ID pada Sky yang sudah ada, tidak menghapusnya.</p>
    <div class="id-list" id="id-list"></div>
    <div class="code-wrap">
      <div class="code-head"><span>Script Roblox Studio</span><button type="button" class="mini" id="copy-script-btn">Salin script</button></div>
      <textarea id="skybox-script" class="code" readonly spellcheck="false" aria-label="Script untuk memasang Skybox di Roblox Studio"></textarea>
    </div>
  </section>
</main>
<div id="toast" aria-live="polite"></div>

<script>
// Runtime: browser (vanilla JS), berjalan di iframe sandbox milik BAXDEV.
// Publish ke Roblox dikerjakan halaman induk lewat postMessage, jadi API key Roblox tidak pernah masuk ke tool ini.

// Arah tiap sisi mengikuti cara Roblox membaca Sky (sumbu dunia Roblox, depan = -Z):
//   SkyboxFt = menghadap -Z, SkyboxBk = +Z, SkyboxLf = +X, SkyboxRt = -X (Lf/Rt terbalik dibanding nama, memang begitu di Roblox),
//   SkyboxUp = +Y dengan sisi atas gambar menghadap +X, SkyboxDn = -Y dengan sisi atas gambar menghadap -X.
// normal = arah pandang, right = arah kanan gambar, up = arah atas gambar. Semua kanan = normal x up, jadi tidak ada sisi yang ter-mirror.
const SKYBOX_FACE_DEFS = [
  {key:'Front',  label:'Front / SkyboxFt',  normal:[0,0,-1], right:[1,0,0],  up:[0,1,0]},
  {key:'Back',   label:'Back / SkyboxBk',   normal:[0,0,1],  right:[-1,0,0], up:[0,1,0]},
  {key:'Left',   label:'Left / SkyboxLf',   normal:[1,0,0],  right:[0,0,1],  up:[0,1,0]},
  {key:'Right',  label:'Right / SkyboxRt',  normal:[-1,0,0], right:[0,0,-1], up:[0,1,0]},
  {key:'Top',    label:'Top / SkyboxUp',    normal:[0,1,0],  right:[0,0,-1], up:[1,0,0]},
  {key:'Bottom', label:'Bottom / SkyboxDn', normal:[0,-1,0], right:[0,0,-1], up:[-1,0,0]}
];

let skyboxSourceFile = null;
let skyboxFaces = [];
let skyboxAssetIds = {};
let skyboxFaceStates = {};
let genId = 0;

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(requestAnimationFrame);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = \`toast-item \${type}\`;
  el.textContent = msg;
  $('toast').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 300); }, 2600);
}
function setStatus(message, type = '') {
  const node = $('status');
  node.textContent = message;
  node.className = \`status\${type ? ' ' + type : ''}\`;
}
function showProgress(percent) {
  $('progress').hidden = false;
  $('progress-fill').style.width = \`\${Math.max(0, Math.min(100, percent))}%\`;
}
function hideProgress() {
  $('progress').hidden = true;
  $('progress-fill').style.width = '0%';
}

function clearSkyboxFaces() {
  genId++;
  skyboxFaces.forEach(face => URL.revokeObjectURL(face.url));
  skyboxFaces = [];
  skyboxAssetIds = {};
  skyboxFaceStates = {};
  $('face-grid').replaceChildren();
  $('card-faces').hidden = true;
  $('seg-cube').disabled = true;
  setViewMode('pano');
  $('results').classList.remove('visible');
  $('publish-controls').hidden = true;
  $('skybox-script').value = '';
}

async function chooseSkyboxImage(file) {
  clearSkyboxFaces();
  skyboxSourceFile = null;
  $('card-viewer').hidden = true;
  $('generate-btn').disabled = true;
  if (!file) return;
  if (!/^image\\/(png|jpeg|webp)$/.test(file.type) || file.size > 30 * 1024 * 1024) {
    setStatus('Pilih PNG, JPG, atau WebP dengan ukuran maksimal 30 MB.', 'error');
    return;
  }
  let image;
  try { image = await createImageBitmap(file); }
  catch { setStatus('Gambar tidak bisa dibuka. Coba ekspor ulang sebagai PNG atau JPG.', 'error'); return; }
  const ratio = image.width / image.height;
  if (image.width > 8192 || image.height > 4096 || ratio < 1.85 || ratio > 2.15) {
    image.close();
    setStatus('Panorama harus berasio 2:1 dan maksimal 8192 × 4096 px.', 'error');
    return;
  }
  skyboxSourceFile = file;
  $('file-label').textContent = file.name;
  $('file-meta').textContent = \`\${image.width} × \${image.height} px · \${(file.size / 1048576).toFixed(2)} MB\`;
  if (viewer) { $('card-viewer').hidden = false; viewer.resize(); viewer.setPanorama(image); viewer.reset(); setViewMode('pano'); }
  image.close();
  $('generate-btn').disabled = false;
  setStatus('Panorama siap. Membuat enam sisi...');
  generateSkyboxFaces();
}

// Equirectangular bilinear sample for direction (dx,dy,dz) → writes RGBA into dst at offset o.
function samplePanoramaInto(src, width, height, dx, dy, dz, dst, o) {
  const length = Math.hypot(dx, dy, dz);
  const longitude = Math.atan2(dx / length, -dz / length);
  const latitude = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  const x = ((longitude / (Math.PI * 2) + .5) * width - .5 + width) % width;
  const y = Math.max(0, Math.min(height - 1, (.5 - latitude / Math.PI) * height - .5));
  const x0 = Math.floor(x), x1 = (x0 + 1) % width;
  const y0 = Math.floor(y), y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * width + x0) * 4, i01 = (y0 * width + x1) * 4;
  const i10 = (y1 * width + x0) * 4, i11 = (y1 * width + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const a = src[i00 + c], b = src[i01 + c], cc = src[i10 + c], d = src[i11 + c];
    dst[o + c] = (a + (b - a) * fx) * (1 - fy) + (cc + (d - cc) * fx) * fy;
  }
}

async function generateSkyboxFaces() {
  if (!skyboxSourceFile || skyboxFaces.length) return;
  const button = $('generate-btn');
  const size = Number($('face-size').value), id = genId;
  button.disabled = true;
  $('publish-controls').hidden = true;
  setStatus(\`Membaca panorama dan membuat enam sisi \${size} × \${size}...\`);
  showProgress(2);
  try {
    const bitmap = await createImageBitmap(skyboxSourceFile);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = bitmap.width; sourceCanvas.height = bitmap.height;
    const sourceContext = sourceCanvas.getContext('2d', {willReadFrequently: true});
    sourceContext.drawImage(bitmap, 0, 0);
    bitmap.close();
    const sw = sourceCanvas.width, sh = sourceCanvas.height;
    const source = sourceContext.getImageData(0, 0, sw, sh).data;

    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = size; faceCanvas.height = size;
    const faceContext = faceCanvas.getContext('2d');
    const total = SKYBOX_FACE_DEFS.length;

    for (let index = 0; index < total; index++) {
      const face = SKYBOX_FACE_DEFS[index];
      const [nx, ny, nz] = face.normal, [rx, ry, rz] = face.right, [ux, uy, uz] = face.up;
      const pixels = faceContext.createImageData(size, size);
      // Tepi tiap sisi memakai sampel yang sama persis agar sambungan kubus tidak terlihat.
      for (let y = 0; y < size; y++) {
        const v = y === 0 ? -1 : y === size - 1 ? 1 : 2 * (y + .5) / size - 1;
        for (let x = 0; x < size; x++) {
          const s = x === 0 ? -1 : x === size - 1 ? 1 : 2 * (x + .5) / size - 1;
          samplePanoramaInto(source, sw, sh,
            nx + s * rx - v * ux, ny + s * ry - v * uy, nz + s * rz - v * uz,
            pixels.data, (y * size + x) * 4);
        }
        if ((y & 127) === 127) {
          showProgress(Math.round((index + y / size) / total * 100));
          await nextFrame();
          if (id !== genId) return;
        }
      }
      faceContext.putImageData(pixels, 0, 0);
      const blob = await new Promise(resolve => faceCanvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(\`PNG \${face.key} gagal dibuat.\`);
      if (id !== genId) return;
      skyboxFaces.push({key: face.key, label: face.label, blob, url: URL.createObjectURL(blob)});
      showProgress(Math.round((index + 1) / total * 100));
      await nextFrame();
    }
    renderSkyboxPreviews();
    $('card-faces').hidden = false;
    await showFacesInViewer();
    $('publish-controls').hidden = false;
    setStatus('Enam sisi siap. Unduh PNG per sisi, atau publish untuk mendapatkan ID Roblox.', 'success');
  } catch (error) {
    setStatus(error.message || 'Gagal membuat sisi SkyBox.', 'error');
    clearSkyboxFaces();
  } finally {
    hideProgress();
    button.disabled = !skyboxSourceFile;
  }
}

function renderSkyboxPreviews() {
  $('face-grid').innerHTML = skyboxFaces.map(face =>
    \`<article class="face" data-key="\${face.key}"><img src="\${face.url}" alt="Preview \${escapeHtml(face.label)}">\` +
    \`<div class="face-info"><b>\${escapeHtml(face.label)}</b>\` +
    \`<a href="\${face.url}" download="Skybox_\${face.key}.png">PNG</a></div></article>\`).join('');
}

function setSkyboxFaceState(face, state) {
  skyboxFaceStates[face] = state;
  renderSkyboxIdRows();
}
function renderSkyboxIdRows() {
  $('id-list').innerHTML = SKYBOX_FACE_DEFS.map(face => {
    const id = skyboxAssetIds[face.key] || '';
    const value = id ? \`rbxassetid://\${id}\` : escapeHtml(skyboxFaceStates[face.key] || 'Menunggu');
    return \`<div class="id-row"><b>\${face.key}</b><code>\${value}</code>\` +
      (id ? \`<button type="button" class="mini" data-copy-face="\${face.key}">Salin</button>\` : '') + \`</div>\`;
  }).join('');
}

function buildSkyboxCommandBarScript() {
  const id = key => String(skyboxAssetIds[key] || '').replace(/\\D/g, '');
  return \`-- SkyBox 360°
-- Jalankan di Roblox Studio: View > Command Bar
-- Mengganti ID tekstur pada Sky yang sudah ada di Lighting. Tidak ada Sky yang dihapus.
-- Kalau Lighting belum punya Sky, satu Sky baru dibuat.
local Lighting = game:GetService("Lighting")
local InsertService = game:GetService("InsertService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local FACES = {
    SkyboxFt = "\${id('Front')}",
    SkyboxBk = "\${id('Back')}",
    SkyboxLf = "\${id('Left')}",
    SkyboxRt = "\${id('Right')}",
    SkyboxUp = "\${id('Top')}",
    SkyboxDn = "\${id('Bottom')}",
}

-- Aset yang diupload sebagai Decal punya ID gambar sendiri. Ambil ID gambarnya supaya Sky pasti tampil.
-- Kalau gagal diambil, pakai ID apa adanya.
local function resolve(assetId)
    local fallback = "rbxassetid://" .. assetId
    local ok, texture = pcall(function()
        local model = InsertService:LoadAsset(tonumber(assetId))
        local decal = model:FindFirstChildWhichIsA("Decal", true)
        local result = decal and decal.Texture or ""
        model:Destroy()
        return result
    end)
    if ok and type(texture) == "string" and texture ~= "" then
        return texture
    end
    return fallback
end

local textures = {}
for prop, assetId in pairs(FACES) do
    if assetId == "" then
        error("ID untuk " .. prop .. " kosong. Publish ulang SkyBox dulu. Tidak ada yang diubah.")
    end
    textures[prop] = resolve(assetId)
end

pcall(function() ChangeHistoryService:SetWaypoint("Sebelum ganti SkyBox") end)

local skies = {}
for _, child in ipairs(Lighting:GetChildren()) do
    if child:IsA("Sky") then
        table.insert(skies, child)
    end
end

if #skies == 0 then
    local sky = Instance.new("Sky")
    sky.Name = "CustomSkybox"
    sky.Parent = Lighting
    table.insert(skies, sky)
end

for _, sky in ipairs(skies) do
    for prop, url in pairs(textures) do
        sky[prop] = url
    end
end

pcall(function() ChangeHistoryService:SetWaypoint("SkyBox 360") end)

print("SkyBox diperbarui pada " .. #skies .. " Sky di Lighting")
for prop, url in pairs(textures) do
    print(prop .. ": " .. url)
end\`;
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const input = document.createElement('textarea');
      input.value = text; input.style.cssText = 'position:fixed;opacity:0';
      document.body.append(input); input.select(); document.execCommand('copy'); input.remove();
    }
    toast(successMessage, 'success');
  } catch { toast('Gagal menyalin. Pilih teks lalu salin manual.', 'error'); }
}

// Kirim enam PNG ke halaman induk (BAXDEV) dan tunggu hasil per sisi.
function requestPublish(files, scale, onState) {
  return new Promise((resolve, reject) => {
    if (window.parent === window) { reject(new Error('Publish hanya tersedia di dalam BAXDEV.')); return; }
    const id = 'pub-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const finish = (error, results) => {
      clearTimeout(timer); removeEventListener('message', onMessage);
      if (error) reject(error); else resolve(results);
    };
    const timer = setTimeout(() => finish(new Error('Publish melewati batas waktu. Cek Creator Hub untuk hasilnya.')), 6 * 60 * 1000);
    function onMessage(e) {
      const d = e.data;
      if (e.source !== window.parent || !d || d.bx !== 'publish' || d.id !== id) return;
      if (d.type === 'state') onState(d.face, String(d.text || ''));
      else if (d.type === 'done') finish(null, d.results || {});
      else if (d.type === 'error') finish(new Error(d.message || 'Publish gagal.'));
    }
    addEventListener('message', onMessage);
    window.parent.postMessage({bx: 'publish', type: 'request', id, files, scale}, '*');
  });
}

async function publishSkyboxFaces() {
  if (skyboxFaces.length !== 6) return;
  const button = $('publish-btn');
  button.disabled = true;
  skyboxAssetIds = {};
  skyboxFaceStates = Object.fromEntries(SKYBOX_FACE_DEFS.map(face => [face.key, 'Mengunggah...']));
  $('results').classList.add('visible');
  renderSkyboxIdRows();
  showProgress(8);
  setStatus('Mengunggah enam tekstur ke Roblox. Jangan tutup halaman ini.');
  let finished = 0;
  try {
    const files = Object.fromEntries(skyboxFaces.map(face => [face.key, new File([face.blob], \`Skybox_\${face.key}.png\`, {type: 'image/png'})]));
    const results = await requestPublish(files, Number($('upscale-scale').value) || 1, (face, text) => {
      setSkyboxFaceState(face, text);
      if (text === 'Selesai') showProgress(8 + Math.round(++finished / SKYBOX_FACE_DEFS.length * 92));
    });
    const failed = [];
    for (const face of SKYBOX_FACE_DEFS) {
      const result = results[face.key] || {};
      const id = String(result.assetId || '').replace(/\\D/g, '');
      if (id) { skyboxAssetIds[face.key] = id; skyboxFaceStates[face.key] = 'Selesai'; }
      else {
        const reason = result.error || 'Roblox tidak menerima sisi ini.';
        skyboxFaceStates[face.key] = \`Gagal: \${reason}\`;
        failed.push(\`\${face.key}: \${reason}\`);
      }
    }
    renderSkyboxIdRows();
    if (!failed.length) {
      $('skybox-script').value = buildSkyboxCommandBarScript();
      setStatus('Enam sisi berhasil dipublish. Asset ID dan script siap disalin.', 'success');
      toast('SkyBox berhasil dipublish ke Roblox', 'success');
    } else {
      setStatus(failed.join(' '), 'error');
    }
  } catch (error) {
    setStatus(error.message || 'Upload SkyBox gagal.', 'error');
  } finally {
    hideProgress();
    button.disabled = false;
  }
}

// ── Wiring ──
// Tema dari halaman induk: warna dasar + palet 3 warna (terang, sedang, gelap).
function applyBxTheme(data) {
  if (!data || !/^#[0-9a-fA-F]{6}$/.test(data.bg) || !Array.isArray(data.p) || data.p.length !== 3) return;
  const p = data.p.map(color => Array.isArray(color) && color.length === 3 ? color.map(v => Math.max(0, Math.min(255, Math.round(Number(v) || 0)))) : null);
  if (p.some(color => !color)) return;
  const rgb = color => 'rgb(' + color.join(',') + ')', rgba = (color, alpha) => 'rgba(' + color.join(',') + ',' + alpha + ')';
  const set = (name, value) => document.documentElement.style.setProperty(name, value);
  const light = p[0];
  set('--bg', data.bg); set('--text', rgb(light)); set('--muted', rgba(light, .64)); set('--faint', rgba(light, .4));
  set('--g1', rgba(light, .12)); set('--g2', rgba(light, .035)); set('--line', rgba(light, .17));
  set('--rim1', rgba(light, .7)); set('--rim2', rgba(light, .26)); set('--hl', rgba(light, .14)); set('--field', rgba(light, .07));
  set('--inner', 'inset 0 1px 0 ' + rgba(light, .28) + ',inset 0 0 24px ' + rgba(light, .035));
  set('--btn', rgb(light)); set('--btn-ink', data.bg); set('--blob', rgba(p[1], .26));
  if (data.scheme === 'light' || data.scheme === 'dark') set('color-scheme', data.scheme);
}
addEventListener('message', e => {
  if (e.source === window.parent && e.data && e.data.bx === 'theme') applyBxTheme(e.data);
});
$('source-file').addEventListener('change', e => chooseSkyboxImage(e.target.files[0]));
const dropZone = $('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); chooseSkyboxImage(e.dataTransfer.files[0]); });
function updateUpscaleHelp() {
  const scale = Number($('upscale-scale').value) || 1, size = Number($('face-size').value) || 1024;
  $('publish-help').textContent = scale > 1
    ? 'Tiap sisi di-upscale ' + scale + '× (' + size + ' → ' + (size * scale) + ' px) lalu diunggah sebagai aset gambar Roblox. Proses lebih lama.'
    : 'Setiap sisi akan diunggah sebagai aset gambar Roblox.';
}
$('upscale-scale').addEventListener('change', updateUpscaleHelp);
$('face-size').addEventListener('change', updateUpscaleHelp);
$('face-size').addEventListener('change', () => { if (skyboxSourceFile) { clearSkyboxFaces(); generateSkyboxFaces(); } });
$('generate-btn').addEventListener('click', generateSkyboxFaces);
$('publish-btn').addEventListener('click', publishSkyboxFaces);
$('copy-script-btn').addEventListener('click', () => { const s = $('skybox-script').value; if (s) copyText(s, 'Script SkyBox disalin'); });
$('id-list').addEventListener('click', e => {
  const key = e.target.closest('[data-copy-face]')?.dataset.copyFace;
  if (key && skyboxAssetIds[key]) copyText(\`rbxassetid://\${skyboxAssetIds[key]}\`, \`\${key} ID disalin\`);
});

// ── Preview 360° (WebGL murni, tanpa library) ──
// Sumber "Panorama": equirectangular asli. Sumber "6 sisi": tekstur hasil generate, disampel dengan
// definisi sisi yang sama persis seperti SKYBOX_FACE_DEFS, jadi preview = cara Roblox membacanya.
function createViewer(canvas) {
  const gl = canvas.getContext('webgl', {antialias: true, alpha: false});
  if (!gl) return null;
  const VS = 'attribute vec2 p;varying vec2 q;void main(){q=p;gl_Position=vec4(p,0.,1.);}';
  const FS = \`precision highp float;
varying vec2 q;
uniform sampler2D uP,uF,uB,uL,uR,uT,uD;
uniform float uMode,uYaw,uPitch,uTan,uAsp;
void main(){
  vec3 c=normalize(vec3(q.x*uTan*uAsp,q.y*uTan,-1.));
  float cp=cos(uPitch),sp=sin(uPitch);
  vec3 a=vec3(c.x,c.y*cp-c.z*sp,c.y*sp+c.z*cp);
  float cy=cos(uYaw),sy=sin(uYaw);
  vec3 d=vec3(a.x*cy+a.z*sy,a.y,-a.x*sy+a.z*cy);
  vec3 b=abs(d);vec3 col;
  if(uMode<.5){
    float lon=atan(d.x,-d.z),lat=asin(clamp(d.y,-1.,1.));
    col=texture2D(uP,vec2(lon/6.2831853+.5,.5-lat/3.1415927)).rgb;
  }else if(b.z>=b.x&&b.z>=b.y){
    if(d.z<0.) col=texture2D(uF,vec2(d.x,-d.y)/-d.z*.5+.5).rgb;
    else col=texture2D(uB,vec2(-d.x,-d.y)/d.z*.5+.5).rgb;
  }else if(b.x>=b.y){
    if(d.x>0.) col=texture2D(uL,vec2(d.z,-d.y)/d.x*.5+.5).rgb;
    else col=texture2D(uR,vec2(-d.z,-d.y)/-d.x*.5+.5).rgb;
  }else{
    if(d.y>0.) col=texture2D(uT,vec2(-d.z,-d.x)/d.y*.5+.5).rgb;
    else col=texture2D(uD,vec2(-d.z,d.x)/-d.y*.5+.5).rgb;
  }
  gl_FragColor=vec4(col,1.);
}\`;
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  try { gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS)); }
  catch (e) { console.error(e); return null; }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(prog, n);
  const uni = {mode: U('uMode'), yaw: U('uYaw'), pitch: U('uPitch'), tan: U('uTan'), asp: U('uAsp')};
  const params = () => { for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); };
  const tex = ['uP','uF','uB','uL','uR','uT','uD'].map((name, i) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([16,16,16,255]));
    params(); gl.uniform1i(U(name), i); return t; });
  const upload = (i, src) => {
    gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[i]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); params();
  };

  const FOV_MIN = 25, FOV_MAX = 100, FOV_DEF = 75, DEG = Math.PI / 180;
  let yaw = 0, pitch = 0, fov = FOV_DEF, yawV = 0, pitchV = 0;
  let mode = 0, auto = false, dragging = false, running = false, last = 0, dirty = true;
  const pointers = new Map();
  let pinch = 0, lastT = 0, tgt = null;
  const hudFov = document.getElementById('hud-fov');
  const clampFov = v => Math.max(FOV_MIN, Math.min(FOV_MAX, v));

  function draw() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uni.mode, mode); gl.uniform1f(uni.yaw, yaw * DEG); gl.uniform1f(uni.pitch, pitch * DEG);
    gl.uniform1f(uni.tan, Math.tan(fov * DEG / 2)); gl.uniform1f(uni.asp, canvas.width / Math.max(1, canvas.height));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    hudFov.textContent = \`FOV \${Math.round(fov)}°\`;
  }
  function frame(t) {
    const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
    let moving = false;
    if (tgt && !dragging) {
      const k = 1 - Math.exp(-10 * dt), dy = (((tgt.y - yaw) % 360) + 540) % 360 - 180;
      yaw += dy * k; pitch += (tgt.p - pitch) * k; fov += (FOV_DEF - fov) * k; moving = true;
      if (Math.abs(dy) < .1 && Math.abs(tgt.p - pitch) < .1 && Math.abs(FOV_DEF - fov) < .1) tgt = null;
    }
    if (!dragging) {
      if (Math.abs(yawV) > .01 || Math.abs(pitchV) > .01) {
        yaw += yawV * dt; pitch += pitchV * dt;
        const k = Math.exp(-4 * dt); yawV *= k; pitchV *= k; moving = true;
      }
      if (auto) { yaw += 7 * dt; moving = true; }
    }
    pitch = Math.max(-89, Math.min(89, pitch));
    if (moving || dirty || dragging) { draw(); dirty = false; }
    if (moving || dragging || auto) requestAnimationFrame(frame); else running = false;
  }
  function invalidate() { dirty = true; if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
    invalidate();
  }
  new ResizeObserver(resize).observe(canvas);

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    canvas.parentElement.classList.add('seen'); dragging = true; tgt = null; yawV = pitchV = 0; lastT = e.timeStamp;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    invalidate();
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && dist) fov = clampFov(fov * pinch / dist); pinch = dist;
    } else {
      const k = fov / canvas.clientHeight, dt = Math.max(1, e.timeStamp - lastT) / 1000; lastT = e.timeStamp;
      yaw += dx * k; pitch += dy * k;                      // konten mengikuti jari
      yawV = yawV * .6 + (dx * k / dt) * .4; pitchV = pitchV * .6 + (dy * k / dt) * .4;
    }
    invalidate();
  });
  const release = e => { pointers.delete(e.pointerId); pinch = 0; if (!pointers.size) dragging = false; else { const r = [...pointers.values()][0]; void r; }
    if (e.type === 'pointercancel') yawV = pitchV = 0; invalidate(); };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', e => { e.preventDefault(); canvas.parentElement.classList.add('seen');
    fov = clampFov(fov * Math.exp(e.deltaY * (e.deltaMode === 1 ? .03 : .0012))); invalidate(); }, {passive: false});
  canvas.addEventListener('dblclick', () => api.reset());
  canvas.addEventListener('keydown', e => {
    const step = fov / 12, map = {ArrowLeft: () => yaw -= step, ArrowRight: () => yaw += step, ArrowUp: () => pitch += step,
      ArrowDown: () => pitch -= step, '+': () => fov = clampFov(fov - 6), '=': () => fov = clampFov(fov - 6),
      '-': () => fov = clampFov(fov + 6), '0': () => api.reset()};
    if (map[e.key]) { e.preventDefault(); map[e.key](); canvas.parentElement.classList.add('seen'); invalidate(); }
  });

  const api = {
    resize,
    setPanorama(src) {
      let s = src; const cap = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
      if (src.width > cap) { s = document.createElement('canvas'); s.width = cap; s.height = Math.round(src.height * cap / src.width);
        s.getContext('2d').drawImage(src, 0, 0, s.width, s.height); }
      upload(0, s); invalidate();
    },
    setFaces(list) { list.forEach((b, i) => upload(i + 1, b)); invalidate(); },
    setMode(m) { mode = m === 'cube' ? 1 : 0; invalidate(); },
    lookAt(y, p) { tgt = {y, p}; yawV = pitchV = 0; invalidate(); },
    reset() { yaw = pitch = yawV = pitchV = 0; fov = FOV_DEF; invalidate(); },
    zoom(f) { fov = clampFov(fov * f); invalidate(); },
    toggleAuto() { auto = !auto; invalidate(); return auto; }
  };
  return api;
}

const viewer = (() => { try { return createViewer($('view-canvas')); } catch (e) { console.error(e); return null; } })();
if (!viewer) $('gl-fail').hidden = false;

function setViewMode(mode) {
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('hud-mode').textContent = mode === 'cube' ? '6 sisi' : 'Panorama';
  viewer?.setMode(mode);
}
async function showFacesInViewer() {
  if (!viewer) return;
  try {
    const bitmaps = await Promise.all(skyboxFaces.map(f => createImageBitmap(f.blob)));
    viewer.setFaces(bitmaps); bitmaps.forEach(b => b.close());
    $('seg-cube').disabled = false; setViewMode('cube');
  } catch (e) { console.error(e); }
}
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setViewMode(b.dataset.mode)));
$('v-in').addEventListener('click', () => viewer?.zoom(.8));
$('v-out').addEventListener('click', () => viewer?.zoom(1.25));
$('v-reset').addEventListener('click', () => viewer?.reset());
$('v-auto').addEventListener('click', e => e.currentTarget.setAttribute('aria-pressed', String(!!viewer?.toggleAuto())));
function setFull(on) {
  if (window.parent !== window) window.parent.postMessage({bx: 'fs', on: !!on}, '*');
  $('card-viewer').classList.toggle('fs-on', on);   // backdrop-filter pada kartu bikin position:fixed relatif ke kartu
  $('viewer').classList.toggle('is-full', on); document.body.classList.toggle('no-scroll', on);
  $('v-full').setAttribute('aria-pressed', String(on)); requestAnimationFrame(() => viewer?.resize());
}
$('v-full').addEventListener('click', () => setFull(!$('viewer').classList.contains('is-full')));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('viewer').classList.contains('is-full')) setFull(false); });

// ── Satu scroll: tinggi iframe mengikuti isi halaman, jadi hanya halaman BAXDEV yang di-scroll ──
(function () {
  if (window.parent === window) return;
  document.documentElement.classList.add('autoh');
  let last = 0;
  const send = () => {
    const h = Math.ceil(document.body.getBoundingClientRect().height);
    if (h && h !== last) { last = h; window.parent.postMessage({bx: 'height', h}, '*'); }
  };
  new ResizeObserver(send).observe(document.body);
  addEventListener('load', send); send();
  // Bagian iframe yang sedang terlihat di layar (dikirim induk) dipakai untuk posisi toast.
  addEventListener('message', e => {
    const d = e.data;
    if (e.source !== window.parent || !d || d.bx !== 'view' || !Number.isFinite(d.top) || !Number.isFinite(d.h)) return;
    document.documentElement.style.setProperty('--vt', Math.round(d.top) + 'px');
    document.documentElement.style.setProperty('--vh', Math.round(d.h) + 'px');
  });
})();

// ── Tema hitam / putih ──
const themeRoot = document.documentElement;
try { const t = localStorage.getItem('skybox-theme'); if (t) themeRoot.dataset.theme = t; } catch {}
$('theme-btn').addEventListener('click', () => {
  const isLight = (themeRoot.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'light';
  themeRoot.dataset.theme = isLight ? 'dark' : 'light';
  try { localStorage.setItem('skybox-theme', themeRoot.dataset.theme); } catch {}
});
// Kilau liquid glass mengikuti pointer
document.addEventListener('pointermove', e => {
  const g = e.target.closest?.('.glass'); if (!g) return; const r = g.getBoundingClientRect();
  g.style.setProperty('--mx', \`\${e.clientX - r.left}px\`); g.style.setProperty('--my', \`\${e.clientY - r.top}px\`);
}, {passive: true});
const FACE_LOOK = {Front: [0, 0], Back: [180, 0], Left: [-90, 0], Right: [90, 0], Top: [0, 89], Bottom: [0, -89]};
$('face-grid').addEventListener('click', e => {
  const card = e.target.closest('.face'); if (!card || e.target.closest('a')) return;
  const look = FACE_LOOK[card.dataset.key]; if (!look || !viewer) return;
  document.querySelectorAll('.face').forEach(f => f.classList.toggle('active', f === card));
  if (!$('seg-cube').disabled) setViewMode('cube');
  $('viewer').parentElement.classList.add('seen'); $('viewer').classList.add('seen');
  viewer.lookAt(look[0], look[1]);
  $('viewer').scrollIntoView({behavior: 'smooth', block: 'nearest'});
});
</script>
</body>
</html>
`;

return { default: __default };
})();

const M_geo = (() => {

// Cloudflare Pages Function — GET /api/geo
//
// Perkiraan kota pemanggil dari jaringannya (request.cf milik Cloudflare), dipakai kartu jadwal
// sholat di Home sebagai lokasi awal sebelum pengguna memberi izin GPS. Tidak butuh login,
// tidak menyimpan apa pun, dan koordinat dibulatkan ke 2 desimal (±1 km).

async function onRequestGet({ request }) {
  const cf = request.cf || {};
  const lat = Number(cf.latitude);
  const lon = Number(cf.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json({ ok: false, message: "Lokasi dari jaringan tidak tersedia." }, 404);
  }
  return json({
    ok: true,
    city: cf.city || null,
    region: cf.region || null,
    country: cf.country || null,
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
    tz: cf.timezone || null
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    // Jawaban khusus per pengguna: jangan pernah masuk cache bersama.
    headers: { "content-type": "application/json", "cache-control": "private, no-store" }
  });
}

return { onRequestGet };
})();

const M_image_upscale = (() => {
const { requireUser, requireVipPlus } = M_auth;

// Cloudflare Pages Function — POST /api/image-upscale (multipart/form-data)
//   image = file gambar (PNG/JPG/WebP), scale = 2 | 4, rid = Roblox User ID (untuk cek VIP Plus)
//
// Diteruskan ke api.theresav.eu/api/tools/hd (field "image" dan "scale", header x-apikey).
// Dipakai SkyBox 360 untuk memperbesar tiap sisi sebelum diunggah ke Roblox.
// Sukses: body gambar hasil (content-type image/*). Gagal: JSON {ok:false,message,retryable}.

const API_KEY = "U8LwW";
const HD_URL = "https://api.theresav.eu/api/tools/hd";
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 100000;
const SCALES = new Set(["2", "4"]);

async function onRequestPost({ request }) {
  const denied = await requireUser(request);
  if (denied) return denied;

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan multipart/form-data)." }, 400);
  }

  const gate = await requireVipPlus(request, form.get("rid"));
  if (gate) return gate;

  const image = form.get("image");
  const scale = String(form.get("scale") || "");
  if (!(image instanceof Blob) || image.size === 0) return json({ ok: false, message: "image wajib diisi." }, 400);
  if (image.size > MAX_INPUT_BYTES) return json({ ok: false, message: "Gambar terlalu besar untuk di-upscale (maksimal 10 MB)." }, 413);
  if (!/^image\/(png|jpeg|webp)$/i.test(image.type || "")) return json({ ok: false, message: "Format gambar harus PNG, JPG, atau WebP." }, 400);
  if (!SCALES.has(scale)) return json({ ok: false, message: "scale harus 2 atau 4." }, 400);

  const upstreamForm = new FormData();
  upstreamForm.append("image", image, "image." + (image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1]));
  upstreamForm.append("scale", scale);

  let upstream;
  try {
    upstream = await fetch(HD_URL, { method: "POST", headers: { "x-apikey": API_KEY }, body: upstreamForm, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    return json({ ok: false, message: timedOut ? "Upscale terlalu lama merespons. Coba lagi." : "Gagal menghubungi API upscale.", retryable: true }, 502);
  }

  if (!upstream.ok) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 200);
    return json({ ok: false, message: `API upscale membalas HTTP ${upstream.status}${detail ? ": " + detail : ""}`, retryable: upstream.status === 429 || upstream.status >= 500 }, 502);
  }

  const type = upstream.headers.get("content-type") || "";
  if (/^image\//i.test(type)) {
    return new Response(upstream.body, { status: 200, headers: { "content-type": type, "cache-control": "no-store" } });
  }

  // Upstream membalas JSON berisi link hasil.
  let data;
  try { data = await upstream.json(); } catch {
    return json({ ok: false, message: "Respons API upscale bukan gambar maupun JSON yang dikenali.", retryable: true }, 502);
  }
  const link = pickUrl(data);
  let fileUrl;
  try {
    fileUrl = new URL(link);
    if (fileUrl.protocol !== "https:") throw new Error("protocol");
  } catch {
    return json({ ok: false, message: "API upscale tidak mengembalikan link gambar.", retryable: true }, 502);
  }

  let file;
  try {
    file = await fetch(fileUrl.href, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    return json({ ok: false, message: timedOut ? "Download hasil upscale terlalu lama." : "Gagal mengunduh hasil upscale.", retryable: true }, 502);
  }
  const fileType = file.headers.get("content-type") || "";
  if (!file.ok || !/^image\//i.test(fileType)) {
    file.body && file.body.cancel().catch(() => {});
    return json({ ok: false, message: `Hasil upscale tidak bisa diunduh (HTTP ${file.status}).`, retryable: file.status === 429 || file.status >= 500 }, 502);
  }
  return new Response(file.body, { status: 200, headers: { "content-type": fileType, "cache-control": "no-store" } });
}

function pickUrl(data) {
  const sources = [data, data && data.result, data && data.data];
  for (const s of sources) {
    if (!s) continue;
    if (typeof s === "string") return s;
    const v = s.url || s.image || s.output || s.downloadUrl || s.download_url;
    if (typeof v === "string") return v;
  }
  return "";
}

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

return { onRequestPost, onRequestGet };
})();

const M_roblox_asset_check = (() => {
const { requireUser } = M_auth;

// Cloudflare Pages Function — POST /api/roblox-asset-check
//
//   { apiKey, assetIds: ["123", ...] }  -> status moderasi tiap asset (Audio, Model, Decal, dll.)
//
// Satu GET ke Open Cloud Assets API per ID (key perlu izin asset:read dan hanya bisa
// membaca asset milik akun/grup pemilik key). API key hanya lewat di request ini.

// Batas PER REQUEST (subrequest per invocation di Cloudflare Pages, free: 50). index.html membagi daftar ID
// berapa pun jadi request sebesar ini dan melambat otomatis bila Roblox membalas 429 (~60 request/menit per API key).
const MAX_IDS = 40;

async function onRequestPost(context) {
  try {
    return await handle(context);
  } catch (err) {
    return json({ ok: false, message: "Kesalahan server: " + (err && err.message ? err.message : "tidak diketahui") }, 500);
  }
}

async function handle({ request }) {
  const denied = await requireUser(request);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan JSON)." }, 400);
  }

  const apiKey = String(body.apiKey || "").replace(/[\s\u200B-\u200D\u2060\uFEFF\u00A0]/g, "");
  if (!apiKey) return json({ ok: false, message: "apiKey wajib diisi." }, 400);

  const ids = Array.from(new Set((Array.isArray(body.assetIds) ? body.assetIds : []).map(String).filter((id) => /^\d{1,19}$/.test(id))));
  if (!ids.length) return json({ ok: false, message: "Isi minimal 1 Asset ID." }, 400);
  if (ids.length > MAX_IDS) return json({ ok: false, message: `Maksimal ${MAX_IDS} ID per request. Client membagi otomatis.` }, 400);

  const items = await Promise.all(ids.map((id) => inspect(apiKey, id)));
  return json({ ok: true, items });
}

async function inspect(apiKey, id) {
  let res;
  try {
    res = await fetch(`https://apis.roblox.com/assets/v1/assets/${id}?readMask=displayName,assetType,moderationResult`, {
      headers: { "x-api-key": apiKey }
    });
  } catch {
    return { id, ok: false, reason: "Gagal menghubungi Roblox." };
  }
  if (res.status === 401 || res.status === 403) {
    return { id, ok: false, reason: "API key ditolak (perlu izin asset:read) atau asset ini bukan milikmu." };
  }
  if (res.status === 404) return { id, ok: false, reason: "Asset tidak ditemukan." };
  if (res.status === 429) return { id, ok: false, rateLimited: true, reason: "Terlalu banyak permintaan, coba lagi sebentar." };
  if (!res.ok) return { id, ok: false, reason: "Roblox membalas error " + res.status + "." };

  let a = {};
  try { a = await res.json(); } catch { /* kosong */ }
  const state = String((a.moderationResult && a.moderationResult.moderationState) || "");
  return {
    id,
    ok: true,
    name: String(a.displayName || "Asset " + id).slice(0, 100),
    type: String(a.assetType || ""),
    state: /^(Approved|Reviewing|Rejected)$/.test(state) ? state : "Unknown"
  };
}

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

return { onRequestPost, onRequestGet };
})();

const M_roblox_asset_status = (() => {
const { requireUser } = M_auth;

// Cloudflare Pages Function — POST /api/roblox-asset-status
//
// Dipanggil dari Library saat sebuah track masih berstatus "proc"
// (operation belum done() waktu /api/roblox-upload tadi polling). Ini
// hanya satu kali GET ke operation yang sama — bukan proxy baru, cuma
// lanjutan pengecekan yang sama seperti di roblox-upload.js — supaya
// assetId yang muncul belakangan tetap bisa diambil tanpa upload ulang.

async function onRequestPost(context) {
  const { request } = context;

  const denied = await requireUser(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan JSON)." }, 400);
  }

  const apiKey = String(body.apiKey || "").replace(/[\s\u200B-\u200D\u2060\uFEFF\u00A0]/g, "");
  const operationPath = String(body.operationPath || "").trim();
  if (!apiKey || !operationPath) {
    return json({ ok: false, message: "apiKey dan operationPath wajib diisi." }, 400);
  }
  if (!/^operations\/[\w-]+$/.test(operationPath)) {
    return json({ ok: false, message: "Format operationPath tidak valid." }, 400);
  }

  let res;
  try {
    res = await fetch(`https://apis.roblox.com/assets/v1/${operationPath}`, {
      headers: { "x-api-key": apiKey }
    });
  } catch (err) {
    return json({ ok: false, message: "Gagal menghubungi Roblox dari server: " + (err && err.message ? err.message : "network error") }, 502);
  }

  const bodyText = await res.text();
  let op = {};
  try { op = JSON.parse(bodyText); } catch { /* Roblox didn't return JSON */ }

  if (!res.ok) {
    return json({ ok: false, message: `Roblox membalas HTTP ${res.status} saat cek status.` });
  }
  if (!op.done) {
    return json({ ok: true, done: false, message: "Masih diproses Roblox." });
  }
  if (op.error) {
    return json({ ok: true, done: true, error: true, message: `Roblox menolak asset ini: ${op.error.message || "upload gagal."}` });
  }

  const assetId = op.response && op.response.assetId ? String(op.response.assetId) : null;
  return json({ ok: true, done: true, assetId });
}

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

return { onRequestPost, onRequestGet };
})();

const M_roblox_my_audio = (() => {
const { requireUser } = M_auth;

// Cloudflare Pages Function — POST /api/roblox-my-audio
//
// Mengambil audio lama yang sudah dipublish di akun Roblox supaya bisa dimasukkan ke Library.
//
//   { apiKey, userId, assetIds: ["123", ...] }   -> cek tiap ID lewat Open Cloud Assets API
//                                                   (GET /assets/v1/assets/{id}, key perlu asset:read). Andal.
//   { apiKey, userId, scan: true, cursor? }       -> daftar audio PUBLIK akun lewat Creator Store (tanpa API key).
//                                                   Audio privat tidak muncul; untuk itu tempel ID manual.
// API key hanya lewat di request ini (tidak disimpan/di-log).

const MAX_IDS = 40;

async function onRequestPost(context) {
  try {
    return await handle(context);
  } catch (err) {
    return json({ ok: false, message: "Kesalahan server: " + (err && err.message ? err.message : "tidak diketahui") }, 500);
  }
}

async function handle({ request }) {
  const denied = await requireUser(request);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan JSON)." }, 400);
  }

  const apiKey = String(body.apiKey || "").replace(/[\s\u200B-\u200D\u2060\uFEFF\u00A0]/g, "");
  const userId = String(body.userId || "").trim();
  if (!apiKey) return json({ ok: false, message: "apiKey wajib diisi." }, 400);
  if (!/^\d{1,19}$/.test(userId)) return json({ ok: false, message: "User ID Roblox belum diisi di Settings." }, 400);

  if (body.scan) return scan(apiKey, userId, String(body.cursor || ""));

  const ids = uniqueIds(body.assetIds);
  if (!ids.length) return json({ ok: false, message: "Isi minimal 1 ID audio." }, 400);
  if (ids.length > MAX_IDS) return json({ ok: false, message: `Maksimal ${MAX_IDS} ID per proses.` }, 400);

  const items = await Promise.all(ids.map((id) => inspect(apiKey, userId, id)));
  return json({ ok: true, items });
}

// Satu aset: nama, tipe, pembuat, status moderasi.
async function inspect(apiKey, userId, id) {
  let res;
  try {
    res = await fetch(`https://apis.roblox.com/assets/v1/assets/${id}?readMask=displayName,assetType,creationContext,moderationResult`, {
      headers: { "x-api-key": apiKey }
    });
  } catch {
    return { id, ok: false, reason: "Gagal menghubungi Roblox." };
  }
  if (res.status === 401 || res.status === 403) {
    return { id, ok: false, reason: "API key ditolak (perlu izin asset:read) atau aset ini bukan milikmu." };
  }
  if (res.status === 404) return { id, ok: false, reason: "Aset tidak ditemukan." };
  if (res.status === 429) return { id, ok: false, reason: "Terlalu banyak permintaan, coba lagi sebentar." };
  if (!res.ok) return { id, ok: false, reason: "Roblox membalas error " + res.status + "." };

  let a = {};
  try { a = await res.json(); } catch { /* kosong */ }

  const type = String(a.assetType || "");
  if (type && type !== "Audio") return { id, ok: false, reason: "Bukan audio (" + type + ")." };

  const creator = (a.creationContext && a.creationContext.creator) || {};
  const creatorUserId = creator.userId ? String(creator.userId) : "";
  const mine = !creatorUserId || creatorUserId === userId; // group asset: creatorUserId kosong, diterima
  if (!mine) return { id, ok: false, reason: "Audio ini dibuat akun lain." };

  const state = String((a.moderationResult && a.moderationResult.moderationState) || "");
  return {
    id,
    ok: true,
    name: String(a.displayName || "Audio " + id).slice(0, 100),
    state: state || "Unknown" // Approved | Reviewing | Rejected | Unknown
  };
}

// Daftar audio buatan akun.
// 1) Creator Store (toolbox-service, tanpa API key): audio PUBLIK milik userId. Ini jalur utama.
// 2) Cadangan: itemconfiguration dengan API key (sering ditolak 401, jadi hanya dicoba kalau jalur 1 kosong).
async function scan(apiKey, userId, cursor) {
  if (cursor && !/^[\w\-=+/.,:~%]+$/.test(cursor)) return json({ ok: false, message: "Cursor tidak valid." }, 400);

  // Jalur 1: Creator Store
  let storeErr = "";
  try {
    const p = new URLSearchParams({ creatorType: "1", creatorTargetId: userId, limit: "30" });
    if (cursor) p.set("cursor", cursor);
    const res = await fetch("https://apis.roblox.com/toolbox-service/v1/marketplace/3?" + p, {
      headers: { accept: "application/json" }
    });
    if (res.ok) {
      const page = await res.json();
      const ids = (Array.isArray(page.data) ? page.data : [])
        .map((r) => String(r && r.id != null ? r.id : ""))
        .filter((id) => /^\d+$/.test(id));
      if (ids.length) {
        const names = await loadNames(ids);
        return json({
          ok: true, scanOk: true, source: "store",
          items: ids.map((id) => ({ id, name: names[id] || "Audio " + id })),
          nextCursor: page.nextPageCursor || null
        });
      }
      if (cursor) return json({ ok: true, scanOk: true, source: "store", items: [], nextCursor: null });
    } else {
      storeErr = "Creator Store HTTP " + res.status;
    }
  } catch {
    storeErr = "Gagal menghubungi Creator Store";
  }

  // Jalur 2: cadangan lewat API key (tanpa jaminan)
  const q = new URLSearchParams({ assetType: "Audio", isArchived: "false", limit: "50" });
  try {
    const res = await fetch("https://itemconfiguration.roblox.com/v1/creations/get-assets?" + q, {
      headers: { "x-api-key": apiKey, accept: "application/json" }
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.assets) ? data.assets : [];
      const items = rows.map((r) => {
        const id = String((r && (r.assetId != null ? r.assetId : r.id)) || "");
        return /^\d+$/.test(id) ? { id, name: String((r && (r.name || r.displayName)) || "Audio " + id).slice(0, 100) } : null;
      }).filter(Boolean);
      if (items.length) return json({ ok: true, scanOk: true, source: "config", items, nextCursor: data.nextPageCursor || null });
    }
  } catch { /* lanjut ke pesan gagal */ }

  return json({
    ok: true,
    scanOk: false,
    message: storeErr
      ? "Scan gagal (" + storeErr + ")."
      : "Tidak ada audio publik di Creator Store untuk akun ini. Audio yang privat tidak bisa dipindai otomatis."
  });
}

async function loadNames(ids) {
  const out = {};
  try {
    const res = await fetch("https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=" + encodeURIComponent(ids.join(",")), {
      headers: { accept: "application/json" }
    });
    if (!res.ok) return out;
    const d = await res.json();
    for (const row of d.data || []) {
      const a = (row && row.asset) || {};
      if (a.id != null) out[String(a.id)] = String(a.name || "").slice(0, 100);
    }
  } catch { /* nama opsional */ }
  return out;
}

function uniqueIds(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const v of list) {
    const s = String(v == null ? "" : v).trim();
    if (!/^\d{1,19}$/.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

return { onRequestPost, onRequestGet };
})();

const M_roblox_permission = (() => {
const { requireUser } = M_auth;

// Cloudflare Pages Function — POST /api/roblox-permission
//
// Memberi izin "Use" atas beberapa asset (audio) ke beberapa experience (Universe ID) sekaligus,
// lewat Open Cloud Asset Permissions API:
//   PATCH https://apis.roblox.com/asset-permissions-api/v1/assets/permissions
// Satu request ke Roblox = satu subject (universe) x banyak asset, jadi fungsi ini mengulang per universe.
// API key hanya lewat di request ini (tidak disimpan/di-log). Key perlu scope asset-permissions:write.

// Batas PER REQUEST (bukan per proses): index.html membagi daftar apa pun menjadi request sebesar ini,
// jadi dari sisi pengguna jumlah audio dan map tidak dibatasi. 20 map = 20 subrequest, aman untuk Pages.
const MAX_ASSETS = 50;
const MAX_UNIVERSES = 20;
const ROBLOX_URL = "https://apis.roblox.com/asset-permissions-api/v1/assets/permissions";

async function onRequestPost(context) {
  try {
    return await handle(context);
  } catch (err) {
    return json({ ok: false, message: "Kesalahan server: " + (err && err.message ? err.message : "tidak diketahui") }, 500);
  }
}

async function handle({ request }) {
  const denied = await requireUser(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan JSON)." }, 400);
  }

  const apiKey = String(body.apiKey || "").replace(/[\s\u200B-\u200D\u2060\uFEFF\u00A0]/g, "");
  if (!apiKey) return json({ ok: false, message: "apiKey wajib diisi." }, 400);

  const assetIds = uniqueIds(body.assetIds);
  const universeIds = uniqueIds(body.universeIds);
  if (!assetIds.length) return json({ ok: false, message: "Pilih minimal 1 audio." }, 400);
  if (!universeIds.length) return json({ ok: false, message: "Isi minimal 1 Universe ID." }, 400);
  if (assetIds.length > MAX_ASSETS) return json({ ok: false, message: `Maksimal ${MAX_ASSETS} audio per request. Client membagi otomatis; kalau memanggil API langsung, bagi per ${MAX_ASSETS}.` }, 400);
  if (universeIds.length > MAX_UNIVERSES) return json({ ok: false, message: `Maksimal ${MAX_UNIVERSES} map per request. Client membagi otomatis; kalau memanggil API langsung, bagi per ${MAX_UNIVERSES}.` }, 400);

  const results = [];
  for (const universeId of universeIds) {
    results.push(await grantOne(apiKey, universeId, assetIds));
  }

  const okCount = results.filter((r) => r.ok).length;
  return json({
    ok: okCount > 0,
    allOk: okCount === results.length,
    results
  });
}

async function grantOne(apiKey, universeId, assetIds) {
  let res;
  try {
    res = await fetch(ROBLOX_URL, {
      method: "PATCH",
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        subjectType: "Universe",
        subjectId: String(universeId),
        action: "Use",
        requests: assetIds.map((assetId) => ({ assetId: Number(assetId) }))
      })
    });
  } catch {
    return { universeId, ok: false, message: "Gagal menghubungi Roblox. Coba lagi.", success: [], failed: assetIds };
  }

  let data = null;
  try { data = await res.json(); } catch { /* body kosong */ }

  if (!res.ok) {
    return {
      universeId,
      ok: false,
      status: res.status,
      message: explain(res.status, data),
      success: [],
      failed: assetIds
    };
  }

  const success = Array.isArray(data && data.successAssetIds) ? data.successAssetIds.map(String) : [];
  const errors = Array.isArray(data && data.errors) ? data.errors : [];
  const failed = errors.map((e) => ({ assetId: String(e.assetId), code: String(e.code || "Error") }));
  return {
    universeId,
    ok: success.length > 0,
    success,
    failed,
    message: success.length ? "" : "Roblox tidak menerima satupun audio untuk map ini."
  };
}

function explain(status, data) {
  const raw = data && data.error && data.error.message ? String(data.error.message) : "";
  if (status === 401 || status === 403) {
    return "API key ditolak. Pastikan key punya izin asset-permissions:write dan kamu pemilik audio serta map tujuan." + (raw ? " (" + raw + ")" : "");
  }
  if (status === 400) return "Permintaan ditolak Roblox" + (raw ? ": " + raw : ". Cek Universe ID dan ID audio.");
  if (status === 429) return "Terlalu banyak permintaan. Tunggu semenit lalu coba lagi.";
  return "Roblox membalas error " + status + (raw ? ": " + raw : ".");
}

function uniqueIds(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const v of list) {
    const s = String(v == null ? "" : v).trim();
    if (!/^\d{1,19}$/.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

return { onRequestPost, onRequestGet };
})();

const M_roblox_profile = (() => {
const { requireUser } = M_auth;

// Cloudflare Pages Function — POST /api/roblox-profile
//
// Mengambil nama + avatar Roblox lewat server supaya browser tidak kena CORS
// (thumbnails.roblox.com tidak mengirim header CORS ke browser).
// Dipakai untuk avatar di pojok kanan atas dan kartu profil di Settings.
//
// Nama diambil dari users.roblox.com (publik, tanpa API key). Kalau gagal,
// dicoba lewat Open Cloud (butuh API key dengan scope Users). Avatar diambil
// dari Thumbnails API (publik). Tidak ada yang dicatat atau disimpan di server.

async function onRequestPost(context) {
  const { request } = context;

  const denied = await requireUser(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid." }, 400);
  }

  const userId = String((body && body.userId) || "").trim();
  const apiKey = String((body && body.apiKey) || "").replace(/[\s\u200B-\u200D\u2060\uFEFF\u00A0]/g, "");
  if (!/^\d{1,20}$/.test(userId)) {
    return json({ ok: false, message: "Roblox User ID tidak valid." });
  }

  const [publicResult, avatarResult, cloudResult] = await Promise.allSettled([
    fetch(`https://users.roblox.com/v1/users/${userId}`),
    fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`),
    apiKey
      ? fetch(`https://apis.roblox.com/cloud/v2/users/${userId}`, { headers: { "x-api-key": apiKey } })
      : Promise.reject(new Error("no key"))
  ]);

  let username = null;
  let displayName = null;

  if (publicResult.status === "fulfilled" && publicResult.value.ok) {
    const d = await publicResult.value.json().catch(() => ({}));
    username = d.name || null;
    displayName = d.displayName || d.name || null;
  }

  if (!username && cloudResult.status === "fulfilled" && cloudResult.value.ok) {
    const d = await cloudResult.value.json().catch(() => ({}));
    username = d.name || null;
    displayName = d.displayName || d.name || null;
  }

  let avatarUrl = null;
  if (avatarResult.status === "fulfilled" && avatarResult.value.ok) {
    const d = await avatarResult.value.json().catch(() => null);
    const entry = d && d.data && d.data[0];
    // "Completed" = gambar siap; state lain kadang cuma placeholder.
    if (entry && entry.imageUrl && entry.state === "Completed") avatarUrl = entry.imageUrl;
  }

  if (!username && !avatarUrl) {
    return json({ ok: false, message: "Profil Roblox tidak ditemukan. Cek User ID kamu." });
  }

  // Gambar avatar dikirim langsung (data URL) supaya client bisa menyimpannya dan tetap tampil
  // walau URL CDN Roblox berubah/kedaluwarsa.
  const avatarData = avatarUrl ? await toDataUrl(avatarUrl) : null;

  return json({
    ok: true,
    username,
    displayName: displayName || username || userId,
    avatarUrl,
    avatarData
  });
}

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

async function toDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!type.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length || buf.length > 200000) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return "data:" + type + ";base64," + btoa(bin);
  } catch {
    return null;
  }
}

return { onRequestPost, onRequestGet };
})();

const M_roblox_test = (() => {
const { requireUser } = M_auth;

// Cloudflare Pages Function — POST /api/roblox-test
//
// Tes koneksi untuk tombol "Cek Koneksi" di Settings.
//
// Kenapa ditulis ulang: versi lama memanggil cloud/v2/users/{id} dan
// cloud/v2/groups/{id}. Dua endpoint itu butuh scope User/Group, padahal
// aplikasi ini cuma butuh scope ASSETS (read + write). Akibatnya API key yang
// benar dan cukup untuk upload malah ditolak (403) di tes koneksi.
//
// Sekarang:
//  1. API key divalidasi lewat introspeksi key Roblox (kalau tersedia) untuk
//     membaca daftar scope-nya, lalu dicek lewat endpoint Assets sebagai cadangan.
//  2. User ID / Group ID dicek lewat API publik Roblox (tanpa API key).
//
// API key hanya lewat request ini, tidak disimpan atau dicatat.

const REQUIRED_SCOPE_TEXT = "Assets (Read + Write)";

async function onRequestPost(context) {
  const { request } = context;

  const denied = await requireUser(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid." }, 400);
  }

  const userId = String((body && body.userId) || "").trim();
  const apiKey = String((body && body.apiKey) || "").replace(/[\s\u200B-\u200D\u2060\uFEFF\u00A0]/g, "");
  const creatorType = String((body && body.creatorType) || "User").trim();
  const groupId = String((body && body.groupId) || "").trim();

  if (!userId || !apiKey) {
    return json({ ok: false, message: "Isi Roblox User ID dan API Key dulu." });
  }
  if (!/^\d{1,20}$/.test(userId)) {
    return json({ ok: false, message: "Roblox User ID harus berupa angka." });
  }
  if (creatorType === "Group") {
    if (!groupId) return json({ ok: false, message: "Isi Group ID dulu untuk tes koneksi ke Group." });
    if (!/^\d{1,20}$/.test(groupId)) return json({ ok: false, message: "Group ID harus berupa angka." });
  }

  // 1) Validasi API key + scope
  const keyResult = await checkApiKey(apiKey);
  if (!keyResult.ok) return json({ ok: false, code: keyResult.code, message: keyResult.message });

  // 2) Validasi target (User / Group) lewat API publik
  const target = creatorType === "Group"
    ? await checkGroup(groupId)
    : await checkUser(userId);
  if (!target.ok) return json({ ok: false, code: target.code, message: target.message });

  const parts = [target.message];
  if (keyResult.note) parts.push(keyResult.note);
  return json({ ok: true, message: parts.join(" ") });
}

// ── API key ────────────────────────────────────────────────────────────────

function scopeSet(scopes) {
  // Bentuk scope Roblox: [{ name: "asset", operations: ["read","write"] }, ...]
  const set = new Set();
  const names = [];
  for (const s of Array.isArray(scopes) ? scopes : []) {
    if (typeof s === "string") { set.add(s.toLowerCase()); names.push(s.toLowerCase()); continue; }
    if (!s || typeof s.name !== "string") continue;
    const name = s.name.toLowerCase();
    names.push(name);
    const ops = Array.isArray(s.operations) ? s.operations : [];
    if (!ops.length) set.add(name);
    for (const op of ops) set.add(name + ":" + String(op).toLowerCase());
  }
  return { set, names };
}

async function checkApiKey(apiKey) {
  // (a) Introspeksi: baca scope langsung dari key (endpoint resmi Roblox).
  let info = null;
  let introStatus = "tidak terjangkau";
  try {
    const r = await fetch("https://apis.roblox.com/api-keys/v1/introspect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey })
    });
    introStatus = "HTTP " + r.status;
    if (r.ok) info = await r.json().catch(() => null);
    else {
      const t = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 140);
      if (t) introStatus += " " + t;
    }
  } catch { /* lanjut ke pengecekan cadangan */ }

  if (info && typeof info === "object" && Array.isArray(info.scopes)) {
    if (info.enabled === false) {
      return bad("key_disabled", "API key ini dinonaktifkan di Creator Hub. Aktifkan lagi atau buat key baru.");
    }
    if (info.expired === true) {
      return bad("key_expired", "API key ini sudah kedaluwarsa. Buat API key baru di Creator Hub.");
    }
    const { set, names } = scopeSet(info.scopes);
    const hasRead = set.has("asset:read") || set.has("asset");
    const hasWrite = set.has("asset:write") || set.has("asset");
    if (!hasRead || !hasWrite) {
      const found = names.length ? names.join(", ") : "tidak ada";
      const missing = [!hasRead ? "Read" : null, !hasWrite ? "Write" : null].filter(Boolean).join(" + ");
      return bad(
        "missing_scope",
        `⚠️ Scope API key tidak sesuai. Website ini butuh scope ${REQUIRED_SCOPE_TEXT}. ` +
        `Key kamu punya scope: ${found}` + (names.some((n) => n.startsWith("asset")) ? ` (kurang: ${missing}).` : ".") +
        ` Buat API key baru di creator.roblox.com → Credentials, tambahkan API System "Assets" dengan izin Read dan Write.`
      );
    }
    const others = names.filter((n) => !n.startsWith("asset"));
    return {
      ok: true,
      note: others.length
        ? `Catatan: key ini juga punya scope lain (${others.join(", ")}). Disarankan cukup scope Assets saja demi keamanan.`
        : ""
    };
  }

  // (b) Cadangan: probe endpoint Assets. Kunci valid + scope Assets → 404 (operasi tidak ada).
  let res;
  try {
    res = await fetch("https://apis.roblox.com/assets/v1/operations/00000000-0000-4000-8000-000000000000", {
      headers: { "x-api-key": apiKey }
    });
  } catch (err) {
    return bad("network", "Gagal menghubungi Roblox dari server: " + (err && err.message ? err.message : "network error"));
  }

  if (res.status === 401) {
    return bad("invalid_key", "API key ditolak Roblox (HTTP 401). Yang paling sering: (1) di Creator Hub bagian Keamanan, matikan/biarkan KOSONG opsi Restrict IP addresses (isi 0.0.0.0/0 hanya cocok untuk IPv4, sedangkan server bisa memakai IPv6), (2) key belum utuh atau sudah dibuat ulang, (3) key kedaluwarsa atau status bukan Active. " +
      `[Diagnosa: panjang key ${apiKey.length} karakter, introspeksi ${introStatus}, probe Assets HTTP 401]`);
  }
  if (res.status === 403) {
    const txt = await res.text().catch(() => "");
    const ipHint = /ip|address/i.test(txt) ? " Kemungkinan juga pembatasan IP (Accepted IP Addresses) di API key — matikan opsi Restrict IP addresses di Creator Hub." : "";
    return bad(
      "missing_scope",
      `⚠️ API key ditolak untuk Assets API (HTTP 403). Website ini butuh scope ${REQUIRED_SCOPE_TEXT}. ` +
      `Buat/ubah API key di creator.roblox.com → Credentials, tambahkan API System "Assets" dengan izin Read dan Write.` + ipHint
    );
  }
  if (res.status === 429) {
    return bad("rate_limited", "Roblox sedang membatasi permintaan (HTTP 429). Coba lagi beberapa detik lagi.");
  }
  if (res.status >= 500) {
    return bad("roblox_down", `Server Roblox sedang bermasalah (HTTP ${res.status}). Coba lagi nanti.`);
  }
  // 200 / 400 / 404 = key diterima oleh Assets API
  return { ok: true, note: "" };
}

// ── User / Group (API publik, tanpa API key) ───────────────────────────────

async function checkUser(userId) {
  let res;
  try {
    res = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`);
  } catch {
    // API publik tidak terjangkau — key sudah valid, jangan gagalkan tes hanya karena ini.
    return { ok: true, message: "API key valid (scope Assets OK)." };
  }
  if (res.ok) {
    const d = await res.json().catch(() => ({}));
    const name = d.displayName || d.name || userId;
    return { ok: true, message: `Terhubung ke akun Roblox: ${name}. API key valid (scope Assets OK).` };
  }
  if (res.status === 404 || res.status === 400) {
    return { ok: false, code: "user_not_found", message: "User ID tidak ditemukan di Roblox. Cek lagi angkanya." };
  }
  return { ok: true, message: "API key valid (scope Assets OK)." };
}

async function checkGroup(groupId) {
  let res;
  try {
    res = await fetch(`https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}`);
  } catch {
    return { ok: true, message: "API key valid (scope Assets OK)." };
  }
  if (res.ok) {
    const d = await res.json().catch(() => ({}));
    const name = d.name || groupId;
    return { ok: true, message: `Terhubung ke Group Roblox: ${name}. API key valid (scope Assets OK).` };
  }
  if (res.status === 404 || res.status === 400) {
    return { ok: false, code: "group_not_found", message: "Group ID tidak ditemukan di Roblox. Cek lagi angkanya." };
  }
  return { ok: true, message: "API key valid (scope Assets OK)." };
}

function bad(code, message) { return { ok: false, code, message }; }

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

return { onRequestPost, onRequestGet };
})();

const M_roblox_upload = (() => {
const { requireUser, requireVip, quotaBegin, quotaCommit } = M_auth;

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

// Tipe yang boleh diunggah lewat endpoint ini. Model: .rbxm / .rbxmx (format native Roblox, content type
// harus persis model/x-rbxm karena browser tidak mengenal ekstensi ini) dan .glb (hasil Image to Mesh,
// diimpor Roblox sebagai Model berisi MeshPart).
const ASSET_TYPES = new Set(["Audio", "Model", "Decal", "Animation"]);
const NOUNS = { Audio: "audio", Model: "model", Decal: "gambar", Animation: "animasi" };
// Decal: format gambar yang diterima Open Cloud Assets API.
const DECAL_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", bmp: "image/bmp", tga: "image/tga" };
const decalExt = (name) => String(name || "").split(".").pop().toLowerCase();
const MODEL_EXT = /\.(rbxmx?|glb)$/i;
const MODEL_CONTENT_TYPE = "model/x-rbxm";
const GLB_EXT = /\.glb$/i;
const GLB_CONTENT_TYPE = "model/gltf-binary";
const GLB_MAGIC = "glTF";        // biner: 4 byte pertama
const RBXM_MAGIC = "<roblox!";   // biner: 8 byte pertama
const RBXMX_TAG = "<roblox";     // XML: muncul di awal dokumen (setelah <?xml ...?> bila ada)

async function looksLikeRbxm(file) {
  const head = new TextDecoder("latin1").decode(await file.slice(0, 256).arrayBuffer());
  return head.startsWith(RBXM_MAGIC) || head.includes(RBXMX_TAG);
}

async function looksLikeGlb(file) {
  const head = new TextDecoder("latin1").decode(await file.slice(0, 4).arrayBuffer());
  return head === GLB_MAGIC;
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

async function onRequestPost(context) {
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
  // Buang spasi, newline, dan karakter tak terlihat (zero-width/BOM) yang suka ikut ke-paste di HP.
  const apiKey = String(form.get("apiKey") || "").replace(/[\s\u200B-\u200D\u2060\uFEFF\u00A0]/g, "");
  const creatorType = String(form.get("creatorType") || "User").trim();
  const groupId = String(form.get("groupId") || "").trim();
  const assetType = String(form.get("assetType") || "Audio");
  const noun = NOUNS[assetType] || "audio";
  // Clamped to 30 chars here too (not just client-side) so this endpoint is
  // safe even if something else calls it directly.
  const displayName = String(form.get("displayName") || "Untitled").trim().slice(0, 30) || "Untitled";
  const description = String(form.get("description") || "");

  if (!ASSET_TYPES.has(assetType)) {
    return json({ ok: false, message: "Tipe asset tidak didukung. Yang tersedia: Audio, Animation, Model, dan Decal." }, 400);
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
      return json({ ok: false, message: "Model harus berformat .rbxm, .rbxmx, atau .glb." }, 400);
    }
    if (GLB_EXT.test(file.name)) {
      if (!(await looksLikeGlb(file))) {
        return json({ ok: false, message: "Isi file bukan GLB yang valid. Buat ulang mesh lalu coba lagi." }, 400);
      }
    } else if (!(await looksLikeRbxm(file))) {
      return json({ ok: false, message: "Isi file bukan model Roblox yang valid. Ekspor ulang dari Roblox Studio (Save to File As → .rbxm)." }, 400);
    }
  }

  if (assetType === "Animation") {
    if (!/\.rbxmx?$/i.test(file.name || "")) {
      return json({ ok: false, message: "Animasi harus berformat .rbxm atau .rbxmx (ekspor KeyframeSequence dari Roblox Studio)." }, 400);
    }
    if (!(await looksLikeRbxm(file))) {
      return json({ ok: false, message: "Isi file bukan file Roblox yang valid. Ekspor ulang KeyframeSequence dari Roblox Studio (klik kanan > Save to File)." }, 400);
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

  // Menu Spoof (upload Animasi) khusus VIP: dicek di server supaya tidak bisa dilewati dari browser.
  if (assetType === "Animation") {
    const vipDeny = await requireVip(request, userId);
    if (vipDeny) return vipDeny;
  }

  // Kuota harian akun free (server-side, tidak bisa direset dari browser). VIP lolos.
  const quota = await quotaBegin(request, userId);
  if (!quota.ok) {
    const message = quota.vip
      ? `Kuota publish VIP 6 jam ini sudah habis (${quota.used}/${quota.limit}). Kuota reset otomatis tiap 6 jam.`
      : `Kuota publish hari ini sudah habis (${quota.used}/${quota.limit}) dan reset besok jam 00.00 WIB. Beli VIP atau tukar kode di Pengaturan → Akun.`;
    return json({
      ok: false, code: "quota_exceeded",
      message,
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
  if (assetType === "Animation") {
    upstream.append("fileContent", file.slice(0, file.size, MODEL_CONTENT_TYPE), file.name);
  } else if (assetType === "Model") {
    const type = GLB_EXT.test(file.name) ? GLB_CONTENT_TYPE : MODEL_CONTENT_TYPE;
    upstream.append("fileContent", file.slice(0, file.size, type), file.name);
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
    const keyHint = res.status === 401
      ? " 401 = Roblox tidak mengenali key-nya. Cek: (1) tekan Simpan lagi di Pengaturan setelah paste key baru, (2) di bagian Keamanan key, matikan/biarkan kosong opsi Restrict IP addresses, (3) key belum expired / masih Enabled, (4) key disalin utuh tanpa spasi."
      : "";
    const scopeHint = (res.status === 403)
      ? " Pastikan API key punya scope Assets (Read + Write) — buat di creator.roblox.com → Credentials."
      : "";
    return json({ ok: false, message: `Roblox menolak upload (HTTP ${res.status}): ${detail}${keyHint}${hint}${scopeHint}` });
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

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

return { onRequestPost, onRequestGet };
})();

const M_tiktok_download = (() => {
const { requireUser } = M_auth;

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

async function onRequestPost(context) {
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

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

return { onRequestPost, onRequestGet };
})();

const M_tool = (() => {
const { requireUser, requireVipPlus } = M_auth;
const meshHtml = M_image_to_mesh.default;
const skyboxHtml = M_skybox_360.default;
const obfusHtml = M_obfus.default;




// Cloudflare Pages Function — GET /api/tool?name=mesh|skybox|obfus&rid=<Roblox User ID>
//
// Tool VIP Plus (Image to Mesh, SkyBox 360, Obfus) disajikan dari sini, bukan dari file statis, supaya
// HTML-nya tidak bisa diunduh tanpa login Google + status VIP Plus (atau Owner) yang diperiksa server.
// Halaman utama memuatnya ke iframe sandbox tanpa akses ke localStorage / API key Roblox.

const TOOLS = { mesh: meshHtml, skybox: skyboxHtml, obfus: obfusHtml };

async function onRequestGet({ request }) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const html = Object.prototype.hasOwnProperty.call(TOOLS, url.searchParams.get("name")) ? TOOLS[url.searchParams.get("name")] : null;
  if (!html) return json({ ok: false, message: "Tool tidak ditemukan." }, 404);

  const gate = await requireVipPlus(request, url.searchParams.get("rid"));
  if (gate) return gate;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

return { onRequestGet };
})();

const M_youtube_download = (() => {
const { requireUser } = M_auth;

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

async function onRequestPost(context) {
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

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

return { onRequestPost, onRequestGet };
})();

const M_youtube_title = (() => {
const { requireUser } = M_auth;

// Cloudflare Pages Function — POST /api/youtube-title
//
// Sumber nama asset YouTube yang dulu dipakai (field "title" dari respons
// API convert pihak ketiga di fytaan.vercel.app) tidak terdokumentasi resmi
// dan kadang tidak ada, sehingga upload.html jatuh ke nama generik
// "YouTube Audio ...". Function ini memanggil oEmbed resmi YouTube
// (www.youtube.com/oembed) dari server — endpoint publik resmi milik
// YouTube sendiri, bukan tebakan — untuk dapat judul video yang asli dan
// akurat, lepas dari apa pun yang dibalas API convert pihak ketiga.

async function onRequestPost(context) {
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

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

  let res;
  try {
    res = await fetch(oembedUrl);
  } catch (err) {
    return json({ ok: false, message: "Gagal menghubungi YouTube: " + (err && err.message ? err.message : "network error") });
  }

  if (!res.ok) {
    // 404/401 dari oEmbed = video privat/age-restricted/tidak ada — bukan error server.
    return json({ ok: false, message: `YouTube membalas HTTP ${res.status} untuk oEmbed.` });
  }

  let data;
  try { data = await res.json(); } catch {
    return json({ ok: false, message: "Respons oEmbed YouTube bukan JSON." });
  }

  if (!data.title) return json({ ok: false, message: "oEmbed tidak mengembalikan judul." });
  return json({ ok: true, title: data.title, authorName: data.author_name || null });
}

async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}

return { onRequestPost, onRequestGet };
})();

const API = {
  "geo": M_geo,
  "image-upscale": M_image_upscale,
  "roblox-asset-check": M_roblox_asset_check,
  "roblox-asset-status": M_roblox_asset_status,
  "roblox-my-audio": M_roblox_my_audio,
  "roblox-permission": M_roblox_permission,
  "roblox-profile": M_roblox_profile,
  "roblox-test": M_roblox_test,
  "roblox-upload": M_roblox_upload,
  "tiktok-download": M_tiktok_download,
  "tool": M_tool,
  "youtube-download": M_youtube_download,
  "youtube-title": M_youtube_title
};
const METHOD = { GET: "onRequestGet", POST: "onRequestPost", PUT: "onRequestPut", PATCH: "onRequestPatch", DELETE: "onRequestDelete", OPTIONS: "onRequestOptions", HEAD: "onRequestHead" };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const m = /^\/api\/([^/]+)\/?$/.exec(url.pathname);
    if (m && Object.prototype.hasOwnProperty.call(API, m[1])) {
      const mod = API[m[1]];
      const method = request.method.toUpperCase();
      const fn = mod[METHOD[method]] || (method === "HEAD" ? mod.onRequestGet : null) || mod.onRequest;
      if (typeof fn === "function") {
        return fn({
          request, env, params: {}, data: {},
          waitUntil: (p) => ctx.waitUntil(p),
          next: () => env.ASSETS.fetch(request)
        });
      }
      return new Response(JSON.stringify({ ok: false, message: "Method tidak didukung." }), { status: 405, headers: { "content-type": "application/json" } });
    }
    return env.ASSETS.fetch(request);
  }
};
