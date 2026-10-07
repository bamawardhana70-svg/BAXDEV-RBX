// Verifikasi Firebase ID token (login Google) di Cloudflare Pages Functions, tanpa library.
// Tanpa environment variable: Project ID Firebase (bukan rahasia) ditulis langsung di bawah.
// Pemakaian di handler:  const deny = await requireUser(request); if (deny) return deny;

const FIREBASE_PROJECT_ID = "baxdev-rbx";
const FIREBASE_DB_URL = "https://baxdev-rbx-default-rtdb.asia-southeast1.firebasedatabase.app";

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
let jwksCache = { keys: null, at: 0 };

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToJson(s) { return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))); }

async function getKeys() {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600e3) return jwksCache.keys;
  const res = await fetch(JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error("jwks");
  const data = await res.json();
  jwksCache = { keys: data.keys || [], at: Date.now() };
  return jwksCache.keys;
}

export async function verifyIdToken(token, projectId) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = b64urlToJson(parts[0]); payload = b64urlToJson(parts[1]); } catch { return null; }
  if (header.alg !== "RS256" || !header.kid) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId || payload.iss !== "https://securetoken.google.com/" + projectId) return null;
  if (!payload.sub || typeof payload.exp !== "number" || payload.exp < now - 30 || payload.iat > now + 300) return null;
  const jwk = (await getKeys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  return ok ? { uid: payload.sub, email: payload.email || "" } : null;
}

function deny(status, code, message) {
  return new Response(JSON.stringify({ ok: false, code, message }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

// Balikkan Response (tolak) kalau belum login Google; null kalau lolos.
export async function requireUser(request) {
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

// ── Kuota publish harian akun free (disimpan di Firebase: quota/<uid> = {day, count}) ──
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

// Cek sebelum upload. { ok:false, used, limit } kalau kuota habis. Gagal baca DB / rules belum dipasang = jangan blokir (skip).
export async function quotaBegin(request, robloxId) {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (!m) return { ok: true, skip: true };
  try {
    const user = await verifyIdToken(m[1], FIREBASE_PROJECT_ID);
    if (!user) return { ok: true, skip: true };
    if (/^[0-9]{1,20}$/.test(String(robloxId || ""))) {
      if (await isOwnerSession(m[1], robloxId)) return { ok: true, vip: true };                  // owner tanpa batas
      try {
        const vr = await fetch(FIREBASE_DB_URL + "/vip/" + robloxId + ".json", { cache: "no-store" });
        if (vr.ok && vipActive(await vr.json())) return { ok: true, vip: true };                  // VIP / VIP Plus tanpa batas
      } catch { /* anggap bukan VIP */ }
    }
    const q = await readQuota(user.uid, m[1]);
    if (q.used >= FREE_DAILY_LIMIT) return { ok: false, used: q.used, limit: FREE_DAILY_LIMIT };
    return { ok: true, uid: user.uid, token: m[1] };
  } catch {
    return { ok: true, skip: true };
  }
}

// Catat 1 publish setelah upload berhasil. Balikkan { used, limit } atau null.
export async function quotaCommit(q) {
  if (!q || q.skip || q.vip || !q.uid) return null;
  try {
    const cur = await readQuota(q.uid, q.token);   // baca ulang supaya tidak menimpa hitungan terbaru
    const next = cur.used + 1;
    const r = await fetch(FIREBASE_DB_URL + "/quota/" + encodeURIComponent(q.uid) + ".json?auth=" + encodeURIComponent(q.token), {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ day: cur.day, count: next })
    });
    return r.ok ? { used: next, limit: FREE_DAILY_LIMIT } : null;
  } catch { return null; }
}
