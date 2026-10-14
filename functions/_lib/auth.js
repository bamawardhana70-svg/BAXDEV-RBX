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
export const POW_ENFORCE = true;
export const POW_BITS = 16;
const POW_WINDOW_S = 120;   // toleransi selisih jam klien-server
// Maintenance terjadwal: setiap hari 00.00 - 05.00 WIB (UTC+7, tanpa DST).
export const MAINTENANCE_TEXT =
  "Saat ini layanan sedang dalam proses pemeliharaan.\n" +
  "Layanan akan kembali tersedia nanti pagi.\n\n" +
  "Mohon maaf atas ketidaknyamanannya. Terima kasih atas pengertiannya.";

export function isScheduledMaintenance(now) {
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
export const OWNER_ROBLOX_ID = "8675322450";

export async function isOwnerSession(token, robloxId) {
  return String(robloxId || "").trim() === OWNER_ROBLOX_ID && await isOwnerToken(token);
}

// vip/<robloxId>: { expiresAt (0 = permanen), plusUntil? (0 = permanen), ... }. VIP Plus selalu ikut VIP.
export function vipActive(v) { return !!v && (!v.expiresAt || v.expiresAt > Date.now()); }
export function plusActive(v) {
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

export async function verifyIdToken(token, projectId) {
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

export async function requireUser(request) {
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

// Gerbang fitur VIP Plus (dipanggil setelah requireUser lolos). Gagal baca DB = tolak (fitur berbayar, jangan fail-open).
// Balikkan Response (tolak) atau null kalau boleh.
export async function requireVipPlus(request, robloxId) {
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
export const FREE_DAILY_LIMIT = 5;
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
export const VIP_PERIOD_MS = 6 * 3600e3;
export const VIP_PERIOD_LIMIT = 100;
const vipPeriod = (now) => Math.floor(now / VIP_PERIOD_MS);

async function readVipQuota(uid, token) {
  const r = await fetch(FIREBASE_DB_URL + "/vipq/" + encodeURIComponent(uid) + ".json?auth=" + encodeURIComponent(token), { cache: "no-store" });
  if (!r.ok) throw new Error("vipq read " + r.status);
  const rec = await r.json();
  const period = vipPeriod(Date.now());
  return { period, used: rec && rec.period === period ? Number(rec.count) || 0 : 0 };
}

// Cek sebelum upload. { ok:false, used, limit, vip? } kalau kuota habis. Gagal baca DB / rules belum dipasang = jangan blokir (skip).
export async function quotaBegin(request, robloxId) {
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
export async function quotaCommit(q) {
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
