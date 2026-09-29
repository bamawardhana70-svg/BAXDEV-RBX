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
