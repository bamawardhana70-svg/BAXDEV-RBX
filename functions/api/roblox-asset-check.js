import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/roblox-asset-check
//
//   { apiKey, assetIds: ["123", ...] }  -> status moderasi tiap asset (Audio, Model, Decal, dll.)
//
// Satu GET ke Open Cloud Assets API per ID (key perlu izin asset:read dan hanya bisa
// membaca asset milik akun/grup pemilik key). API key hanya lewat di request ini.

const MAX_IDS = 40; // batas subrequest per invocation di Cloudflare Pages (free: 50)

export async function onRequestPost(context) {
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

  const apiKey = String(body.apiKey || "").trim();
  if (!apiKey) return json({ ok: false, message: "apiKey wajib diisi." }, 400);

  const ids = Array.from(new Set((Array.isArray(body.assetIds) ? body.assetIds : []).map(String).filter((id) => /^\d{1,19}$/.test(id))));
  if (!ids.length) return json({ ok: false, message: "Isi minimal 1 Asset ID." }, 400);
  if (ids.length > MAX_IDS) return json({ ok: false, message: `Maksimal ${MAX_IDS} ID per proses.` }, 400);

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
  if (res.status === 429) return { id, ok: false, reason: "Terlalu banyak permintaan, coba lagi sebentar." };
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

export async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}
