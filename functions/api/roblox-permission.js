import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/roblox-permission
//
// Memberi izin "Use" atas beberapa asset (audio) ke beberapa experience (Universe ID) sekaligus,
// lewat Open Cloud Asset Permissions API:
//   PATCH https://apis.roblox.com/asset-permissions-api/v1/assets/permissions
// Satu request ke Roblox = satu subject (universe) x banyak asset, jadi fungsi ini mengulang per universe.
// API key hanya lewat di request ini (tidak disimpan/di-log). Key perlu scope asset-permissions:write.

const MAX_ASSETS = 50;
const MAX_UNIVERSES = 20;
const ROBLOX_URL = "https://apis.roblox.com/asset-permissions-api/v1/assets/permissions";

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
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan JSON)." }, 400);
  }

  const apiKey = String(body.apiKey || "").trim();
  if (!apiKey) return json({ ok: false, message: "apiKey wajib diisi." }, 400);

  const assetIds = uniqueIds(body.assetIds);
  const universeIds = uniqueIds(body.universeIds);
  if (!assetIds.length) return json({ ok: false, message: "Pilih minimal 1 audio." }, 400);
  if (!universeIds.length) return json({ ok: false, message: "Isi minimal 1 Universe ID." }, 400);
  if (assetIds.length > MAX_ASSETS) return json({ ok: false, message: `Maksimal ${MAX_ASSETS} audio per proses.` }, 400);
  if (universeIds.length > MAX_UNIVERSES) return json({ ok: false, message: `Maksimal ${MAX_UNIVERSES} map per proses.` }, 400);

  const results = [];
  for (const universeId of universeIds) {
    results.push(await grantOne(apiKey, universeId, assetIds));
  }

  const okCount = results.filter((r) => r.ok).length;
  return json({
    ok: okCount > 0,
    allOk: okCount === results.length,
    results
  });
}

async function grantOne(apiKey, universeId, assetIds) {
  let res;
  try {
    res = await fetch(ROBLOX_URL, {
      method: "PATCH",
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        subjectType: "Universe",
        subjectId: String(universeId),
        action: "Use",
        requests: assetIds.map((assetId) => ({ assetId: Number(assetId) }))
      })
    });
  } catch {
    return { universeId, ok: false, message: "Gagal menghubungi Roblox. Coba lagi.", success: [], failed: assetIds };
  }

  let data = null;
  try { data = await res.json(); } catch { /* body kosong */ }

  if (!res.ok) {
    return {
      universeId,
      ok: false,
      status: res.status,
      message: explain(res.status, data),
      success: [],
      failed: assetIds
    };
  }

  const success = Array.isArray(data && data.successAssetIds) ? data.successAssetIds.map(String) : [];
  const errors = Array.isArray(data && data.errors) ? data.errors : [];
  const failed = errors.map((e) => ({ assetId: String(e.assetId), code: String(e.code || "Error") }));
  return {
    universeId,
    ok: success.length > 0,
    success,
    failed,
    message: success.length ? "" : "Roblox tidak menerima satupun audio untuk map ini."
  };
}

function explain(status, data) {
  const raw = data && data.error && data.error.message ? String(data.error.message) : "";
  if (status === 401 || status === 403) {
    return "API key ditolak. Pastikan key punya izin asset-permissions:write dan kamu pemilik audio serta map tujuan." + (raw ? " (" + raw + ")" : "");
  }
  if (status === 400) return "Permintaan ditolak Roblox" + (raw ? ": " + raw : ". Cek Universe ID dan ID audio.");
  if (status === 429) return "Terlalu banyak permintaan. Tunggu semenit lalu coba lagi.";
  return "Roblox membalas error " + status + (raw ? ": " + raw : ".");
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
