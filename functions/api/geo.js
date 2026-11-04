// Cloudflare Pages Function — GET /api/geo
//
// Perkiraan kota pemanggil dari jaringannya (request.cf milik Cloudflare), dipakai kartu jadwal
// sholat di Home sebagai lokasi awal sebelum pengguna memberi izin GPS. Tidak butuh login,
// tidak menyimpan apa pun, dan koordinat dibulatkan ke 2 desimal (±1 km).

export async function onRequestGet({ request }) {
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
