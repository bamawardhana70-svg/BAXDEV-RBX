// Cloudflare Pages Function — POST /api/vip-check
// Body: { userId } -> { ok, vip }
// Baca daftar VIP dari KV (binding: VIP_KV) yang diisi lewat /admin.html.
// Kalau KV belum di-bind, balas ok:false supaya client jatuh ke daftar VIP lokal.

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, message: "Body bukan JSON." }, 400); }
  const userId = String((body && body.userId) || "").trim();
  if (!/^\d{1,20}$/.test(userId)) return json({ ok: false, message: "userId tidak valid." }, 400);
  if (!env.VIP_KV) return json({ ok: false, message: "KV VIP_KV belum di-bind." });
  try {
    const hit = await env.VIP_KV.get("vip:" + userId);
    return json({ ok: true, vip: hit !== null });
  } catch (err) {
    return json({ ok: false, message: "Gagal membaca KV." });
  }
}

export async function onRequestGet() { return json({ ok: false, message: "Gunakan POST." }, 405); }

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
