import { requireUser } from "../_lib/auth.js";

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

export async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
