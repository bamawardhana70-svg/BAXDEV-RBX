// Lisensi script Lua (Cloudflare Pages Functions, tanpa library, TANPA secret / environment variable).
//
// Model data di Firebase Realtime Database (ditulis owner lewat /owner, aturannya ada di database.rules.json):
//   scripts/<slug>          = data master (owner-only): { name, code, enabled, kickMsg, universes }
//   pubmeta/<slug>          = { kickMsg?, updatedAt }  -> hanya penanda bahwa slug ini script lisensi (baca publik per path)
//   pub/<slug>/<universeId> = isi script Lua (string)  -> ada HANYA kalau script aktif dan Universe ID itu terdaftar
// pub/ tidak bisa di-list (rules hanya mengizinkan baca per path persis), jadi kode hanya terbaca kalau tahu
// nama link DAN Universe ID yang terdaftar. Server cukup membaca dua path itu lewat REST publik.

const FIREBASE_DB_URL = "https://baxdev-rbx-default-rtdb.asia-southeast1.firebasedatabase.app";
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const DEFAULT_KICK = "Game ini belum terdaftar untuk memakai script ini.";

// Path yang dipakai situs sendiri: tidak boleh dijadikan slug lisensi.
export const RESERVED_SLUGS = new Set([
  "api", "owner", "admin", "index", "logo", "favicon", "manifest", "sw", "theme", "firebase-config",
  "qris", "apple-touch-icon", "robots", "sitemap", "assets", "static", "functions", "yt-backend", "yt-worker"
]);

export const isValidSlug = (s) => SLUG_RE.test(String(s || "")) && !RESERVED_SLUGS.has(String(s));

const text = (body, status) => new Response(body, {
  status: status || 200,
  headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});

// Lua yang mengeluarkan semua pemain (sekarang dan yang masuk nanti). Dikirim sebagai "script" ke map yang tidak terdaftar.
function kickStub(message) {
  const msg = String(message || DEFAULT_KICK).slice(0, 200)
    .replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
  return [
    "-- baxdev license: map tidak terdaftar",
    'local Players = game:GetService("Players")',
    'local MESSAGE = "' + msg + '"',
    "local function kick(player)",
    "\tpcall(function() player:Kick(MESSAGE) end)",
    "end",
    "for _, player in ipairs(Players:GetPlayers()) do kick(player) end",
    "Players.PlayerAdded:Connect(kick)",
    ""
  ].join("\n");
}

// Baca satu path publik. Balikkan { ok:false } kalau gagal; { ok:true, value } (value null = tidak ada).
async function readPublic(path) {
  try {
    const r = await fetch(FIREBASE_DB_URL + path + ".json", { cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, value: await r.json() };
  } catch {
    return { ok: false, status: 0 };
  }
}

// Universe dari sebuah place lewat API publik Roblox (hasilnya tidak pernah berubah, jadi di-cache lama). null kalau gagal.
async function universeOfPlace(placeId) {
  try {
    const r = await fetch("https://apis.roblox.com/universes/v1/places/" + placeId + "/universe", { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!r.ok) return null;
    const j = await r.json();
    const id = j && (j.universeId != null ? j.universeId : (j.data && j.data[0] && j.data[0].universeId));
    return id != null ? String(id) : null;
  } catch {
    return null;
  }
}

// ── Handler utama: GET /<slug>  (juga /api/script/<slug>) ──
// Universe ID dikirim loader lewat header "X-Baxdev-Universe", jadi tidak tampil di link.
// (Query "?u=" lama masih diterima supaya loader versi lama tetap jalan.)
// Balikkan Response, atau null kalau slug tidak dikenal sebagai script lisensi (supaya route lain bisa lanjut).
export async function serveLicensedScript(request, env, slug) {
  slug = String(slug || "").toLowerCase();
  if (!isValidSlug(slug)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return text("-- method tidak didukung", 405);

  const universe = String(request.headers.get("x-baxdev-universe") || new URL(request.url).searchParams.get("u") || "").trim();
  let validUniverse = /^[0-9]{1,20}$/.test(universe);

  // Pengaman tambahan: kalau Roblox menyertakan header Roblox-Id (Place ID asal request) dan universe place itu
  // berbeda dari yang diklaim loader, tolak. Tanpa header itu, atau kalau Roblox API gagal dijangkau, pengecekan dilewati.
  const placeId = String(request.headers.get("roblox-id") || "").trim();
  if (validUniverse && /^[1-9][0-9]{0,19}$/.test(placeId)) {
    const real = await universeOfPlace(placeId);
    if (real && real !== universe) validUniverse = false;
  }

  const [meta, code] = await Promise.all([
    readPublic("/pubmeta/" + slug),
    validUniverse ? readPublic("/pub/" + slug + "/" + universe) : Promise.resolve({ ok: true, value: null })
  ]);
  if (!meta.ok || !code.ok) return text("-- baxdev: database tidak bisa dihubungi (" + (meta.status || code.status || "jaringan") + ")", 502);
  if (!meta.value || typeof meta.value !== "object") return null;   // bukan script lisensi: biarkan route lain / 404 biasa

  if (typeof code.value === "string" && code.value) return text(code.value);
  return text(kickStub(meta.value.kickMsg));   // universe tidak terdaftar, tidak ada "u", atau script dinonaktifkan
}
