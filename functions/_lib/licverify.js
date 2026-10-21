// Verifikasi lisensi ModuleScript (tanpa loadstring). Dipanggil game Roblox lewat POST /api/license/verify.
//
// Tanpa secret / environment variable. Data di Firebase Realtime Database (aturan: database.rules.json):
//   licpub/<key>          = { name, enabled, expiresAt (0 = permanen), universes:{id:true}, places?:{id:true}, updatedAt }
//                           baca publik per path persis (tidak bisa di-list), tulis hanya owner.
//   liclog/<key>/<pushId> = riwayat verifikasi. Server menulis lewat REST publik; rules hanya mengizinkan
//                           menambah entri baru untuk key yang ada dan memvalidasi bentuknya.
//   licstat/<key>         = ringkasan verifikasi terakhir { at, ok, code } (untuk daftar di halaman /license).
// Master data (catatan pembeli dll.) ada di licenses/<id> dan hanya bisa dibaca owner: tidak pernah dikirim ke game.

export const FIREBASE_DB_URL = "https://baxdev-rbx-default-rtdb.asia-southeast1.firebasedatabase.app";
export const KEY_RE = /^BXL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const NONCE_RE = /^[A-Za-z0-9-]{8,64}$/;
const POS_ID_RE = /^[1-9][0-9]{0,19}$/;
const DAY = 86400000;

// Pesan untuk pemilik map (muncul di Output server). Tidak memuat key, kredensial, atau data pembeli.
export const MSG = {
  OK: "Lisensi valid.",
  BAD_REQUEST: "Permintaan verifikasi tidak lengkap atau rusak. Pasang ulang ModuleScript BaxdevLicense dari halaman lisensi.",
  KEY_INVALID: "Format kunci lisensi salah. Salin ulang kode dari halaman lisensi tanpa mengubah apa pun.",
  KEY_NOT_FOUND: "Kunci lisensi tidak ditemukan. Mungkin sudah dihapus atau salah salin.",
  DISABLED: "Lisensi sedang dinonaktifkan oleh admin.",
  EXPIRED: "Lisensi sudah kedaluwarsa. Minta admin memperpanjangnya.",
  PLACE_NOT_PUBLISHED: "Place belum dipublish (Place ID 0). Publish dulu lewat File > Publish to Roblox.",
  PLACE_HEADER_MISMATCH: "Place ID yang dikirim modul tidak sama dengan Place ID asal request dari Roblox.",
  PLACE_UNKNOWN: "Place ID tidak dikenali Roblox. Pastikan place sudah dipublish.",
  UNIVERSE_PLACE_MISMATCH: "Universe ID dan Place ID tidak berasal dari game yang sama.",
  UNIVERSE_NOT_ALLOWED: "Universe ID game ini belum terdaftar di lisensi. Minta admin menambahkannya.",
  PLACE_NOT_ALLOWED: "Place ID game ini tidak termasuk daftar place yang diizinkan di lisensi.",
  LOOKUP_FAILED: "Server lisensi gagal memeriksa Place ID ke Roblox. Coba lagi sebentar lagi.",
  DB_UNAVAILABLE: "Database lisensi sedang tidak bisa dihubungi. Coba lagi sebentar lagi.",
  METHOD_NOT_ALLOWED: "Gunakan metode POST."
};

const norm = (v) => {
  const s = String(v == null ? "" : v).trim();
  return /^[0-9]{1,20}$/.test(s) ? s.replace(/^0+(?=[0-9])/, "") : null;
};

async function readJson(path, fetchFn) {
  try {
    const r = await fetchFn(FIREBASE_DB_URL + path + ".json", { cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, value: await r.json() };
  } catch {
    return { ok: false, status: 0 };
  }
}

// Universe dari sebuah place lewat API publik Roblox. Hasilnya tidak pernah berubah, jadi sukses di-cache lama, gagal tidak.
async function universeOfPlace(place, fetchFn) {
  let r;
  try {
    r = await fetchFn("https://apis.roblox.com/universes/v1/places/" + place + "/universe", {
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 3600, "300-599": 0 } }
    });
  } catch { return { err: "network" }; }
  if (r.status === 400 || r.status === 404) return { universe: null };
  if (!r.ok) return { err: "http" + r.status };
  let j;
  try { j = await r.json(); } catch { return { err: "json" }; }
  const id = j && j.universeId != null ? j.universeId : (j && j.data && j.data[0] && j.data[0].universeId);
  const s = id != null ? String(id) : "";
  return POS_ID_RE.test(s) ? { universe: s } : { universe: null };
}

// input : { body, robloxId, country }   body = hasil JSON.parse request (atau null)
// deps  : { fetchFn, now }              untuk pengujian
// return: { status, body, log, key }    log = entri riwayat (atau null kalau key tidak dikenal / request rusak)
export async function verifyLicense(input, deps) {
  const fetchFn = (deps && deps.fetchFn) || fetch;
  const now = (deps && deps.now) || Date.now();
  const body = input && input.body && typeof input.body === "object" ? input.body : null;
  const nonce = body && NONCE_RE.test(String(body.nonce || "")) ? String(body.nonce) : "";

  const out = (status, code, extra, log) => ({
    status,
    body: Object.assign({ ok: code === "OK", code, message: MSG[code] || "", nonce, serverTime: now }, extra || {}),
    log: log || null,
    key
  });
  let key = "";

  if (!body || !nonce) return out(400, "BAD_REQUEST");
  key = String(body.key || "").trim().toUpperCase();
  if (!KEY_RE.test(key)) return out(200, "KEY_INVALID");

  const claimedUniverse = norm(body.universeId);
  let place = norm(body.placeId);
  if (claimedUniverse === null || place === null) return out(400, "BAD_REQUEST");

  const pub = await readJson("/licpub/" + key, fetchFn);
  if (!pub.ok) return out(503, "DB_UNAVAILABLE", { retryable: true });
  const lic = pub.value;
  if (!lic || typeof lic !== "object") return out(200, "KEY_NOT_FOUND");

  // Sumber: Roblox mengisi header Roblox-Id (Place ID asal request) sendiri. Tanpa header = klaim modul / tes dari panel.
  const header = POS_ID_RE.test(String(input.robloxId || "")) ? String(input.robloxId) : "";
  const src = header ? "roblox" : (body.test === true ? "panel" : "claimed");
  const cc = /^[A-Z]{2}$/.test(String(input.country || "")) && input.country !== "XX" ? input.country : "";

  const finish = (status, code, extra, detail, universe) => {
    const log = { at: now, ok: code === "OK", code, universe: universe || (claimedUniverse !== "0" ? claimedUniverse : ""), place: place !== "0" ? place : "", src };
    if (detail) log.detail = String(detail).slice(0, 120);
    if (cc) log.cc = cc;
    if (body.studio === true) log.studio = true;
    return out(status, code, extra, log);
  };

  if (lic.enabled !== true) return finish(200, "DISABLED", { status: "disabled" });
  const exp = Number(lic.expiresAt) > 0 ? Number(lic.expiresAt) : 0;
  if (exp > 0 && exp <= now) return finish(200, "EXPIRED", { status: "expired", expiresAt: exp });

  if (header) {
    if (place !== "0" && place !== header) return finish(200, "PLACE_HEADER_MISMATCH", null, "header " + header + " / modul " + place);
    place = header;
  }
  if (place === "0") return finish(200, "PLACE_NOT_PUBLISHED");

  const look = await universeOfPlace(place, fetchFn);
  if (look.err) return finish(503, "LOOKUP_FAILED", { retryable: true }, look.err);
  if (!look.universe) return finish(200, "PLACE_UNKNOWN");
  const universe = look.universe;
  if (claimedUniverse !== "0" && claimedUniverse !== universe) {
    return finish(200, "UNIVERSE_PLACE_MISMATCH", null, "place " + place + " milik universe " + universe + ", modul mengirim " + claimedUniverse, universe);
  }

  const allowedU = lic.universes && typeof lic.universes === "object" ? lic.universes : {};
  if (allowedU[universe] !== true) {
    return finish(200, "UNIVERSE_NOT_ALLOWED", { message: "Universe ID " + universe + " belum terdaftar di lisensi ini. Minta admin menambahkannya." }, null, universe);
  }
  const allowedP = lic.places && typeof lic.places === "object" ? lic.places : null;
  if (allowedP && Object.keys(allowedP).length > 0 && allowedP[place] !== true) {
    return finish(200, "PLACE_NOT_ALLOWED", { message: "Place ID " + place + " tidak termasuk daftar place yang diizinkan di lisensi ini." }, null, universe);
  }

  return finish(200, "OK", {
    status: "active",
    name: typeof lic.name === "string" ? lic.name.slice(0, 80) : "",
    expiresAt: exp,
    daysLeft: exp ? Math.max(0, Math.ceil((exp - now) / DAY)) : null,
    universeId: universe,
    placeId: place,
    trusted: !!header
  }, null, universe);
}

// Tulis riwayat + ringkasan terakhir. Dipanggil lewat waitUntil supaya tidak memperlambat respons ke game.
export async function writeLog(key, log, fetchFn) {
  fetchFn = fetchFn || fetch;
  if (!key || !log) return;
  const opts = (method, data) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  try {
    await Promise.all([
      fetchFn(FIREBASE_DB_URL + "/liclog/" + key + ".json", opts("POST", log)),
      fetchFn(FIREBASE_DB_URL + "/licstat/" + key + ".json", opts("PUT", { at: log.at, ok: log.ok, code: log.code }))
    ]);
  } catch { /* riwayat bersifat best-effort: gagal menulis tidak boleh menggagalkan verifikasi */ }
}
