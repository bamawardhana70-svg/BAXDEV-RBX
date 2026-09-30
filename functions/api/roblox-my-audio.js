import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/roblox-my-audio
//
// Mengambil audio lama yang sudah dipublish di akun Roblox supaya bisa dimasukkan ke Library.
//
//   { apiKey, userId, assetIds: ["123", ...] }   -> cek tiap ID lewat Open Cloud Assets API
//                                                   (GET /assets/v1/assets/{id}, key perlu asset:read). Andal.
//   { apiKey, userId, scan: true, cursor? }       -> coba daftar semua audio buatan akun (best-effort).
//                                                   Endpoint daftar ini bukan bagian resmi Open Cloud dan bisa
//                                                   menolak API key; kalau gagal, hasilnya scanOk:false dan
//                                                   pengguna diminta tempel ID manual.
// API key hanya lewat di request ini (tidak disimpan/di-log).

const MAX_IDS = 40;

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
  const userId = String(body.userId || "").trim();
  if (!apiKey) return json({ ok: false, message: "apiKey wajib diisi." }, 400);
  if (!/^\d{1,19}$/.test(userId)) return json({ ok: false, message: "User ID Roblox belum diisi di Settings." }, 400);

  if (body.scan) return scan(apiKey, userId, String(body.cursor || ""));

  const ids = uniqueIds(body.assetIds);
  if (!ids.length) return json({ ok: false, message: "Isi minimal 1 ID audio." }, 400);
  if (ids.length > MAX_IDS) return json({ ok: false, message: `Maksimal ${MAX_IDS} ID per proses.` }, 400);

  const items = [];
  for (const id of ids) items.push(await inspect(apiKey, userId, id));
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

// Best-effort: daftar audio buatan akun.
async function scan(apiKey, userId, cursor) {
  if (cursor && !/^[\w\-=+/.,:~%]+$/.test(cursor)) return json({ ok: false, message: "Cursor tidak valid." }, 400);
  const p = new URLSearchParams({ assetType: "Audio", isArchived: "false", limit: "50" });
  if (cursor) p.set("cursor", cursor);

  let res;
  try {
    res = await fetch("https://itemconfiguration.roblox.com/v1/creations/get-assets?" + p, {
      headers: { "x-api-key": apiKey, accept: "application/json" }
    });
  } catch {
    return json({ ok: true, scanOk: false, message: "Gagal menghubungi Roblox." });
  }
  if (!res.ok) {
    return json({ ok: true, scanOk: false, message: "Roblox tidak mengizinkan daftar otomatis lewat API key (HTTP " + res.status + ")." });
  }
  let data = {};
  try { data = await res.json(); } catch { /* kosong */ }

  const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.assets) ? data.assets : [];
  const items = rows.map((r) => {
    const id = String((r && (r.assetId != null ? r.assetId : r.id)) || "");
    return /^\d+$/.test(id) ? { id, name: String((r && (r.name || r.displayName)) || "Audio " + id).slice(0, 100) } : null;
  }).filter(Boolean);

  return json({ ok: true, scanOk: true, items, nextCursor: data.nextPageCursor || null });
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

export async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
