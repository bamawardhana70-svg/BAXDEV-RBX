import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — GET /api/roblox-toolbox?category=10&q=tree&cursor=...
//
// Pencarian Toolbox / Creator Store Roblox (seperti create.roblox.com/store/models).
// Memakai endpoint publik toolbox-service Roblox, jadi TIDAK butuh API key.
// Browser tidak bisa memanggil apis.roblox.com langsung (CORS), makanya lewat sini.
//
//   ?q=kata kunci            cari berdasarkan nama
//   ?q=1234567890            (angka saja / link create.roblox.com/store/asset/ID) ambil detail satu asset
//   ?category=10             10 Model, 13 Decal, 40 MeshPart, 38 Plugin, 3 Audio
//   ?cursor=...              halaman berikutnya (dari nextCursor respons sebelumnya)

const CATEGORIES = { 10: "Model", 13: "Decal", 40: "MeshPart", 38: "Plugin", 3: "Audio" };
const PAGE_SIZE = 30;

export async function onRequestGet(context) {
  const { request } = context;

  const denied = await requireUser(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const category = String(url.searchParams.get("category") || "10");
  if (!CATEGORIES[category]) {
    return json({ ok: false, message: "Kategori tidak dikenal." }, 400);
  }

  let q = String(url.searchParams.get("q") || "").trim().slice(0, 100);
  const cursor = String(url.searchParams.get("cursor") || "").slice(0, 300);
  if (cursor && !/^[\w\-=+/.,:~%]+$/.test(cursor)) {
    return json({ ok: false, message: "Cursor tidak valid." }, 400);
  }

  try {
    // Tempel ID atau link asset → langsung ambil detailnya.
    const linkId = /create\.roblox\.com\/(?:store\/asset|marketplace\/asset)\/(\d{3,19})/i.exec(q);
    const directId = linkId ? linkId[1] : (/^\d{5,19}$/.test(q) ? q : null);
    if (directId) {
      const items = await loadDetails([directId]);
      return json({ ok: true, items, nextCursor: null, direct: true });
    }

    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (q) params.set("keyword", q);
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`https://apis.roblox.com/toolbox-service/v1/marketplace/${category}?${params}`, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 60, cacheEverything: true }
    });
    if (res.status === 429) {
      return json({ ok: false, message: "Roblox membatasi permintaan. Tunggu beberapa detik lalu coba lagi." }, 429);
    }
    if (!res.ok) {
      return json({ ok: false, message: `Roblox membalas HTTP ${res.status} saat mencari.` }, 502);
    }
    const page = await res.json();
    const ids = (Array.isArray(page.data) ? page.data : [])
      .map((row) => String(row && row.id != null ? row.id : ""))
      .filter((id) => /^\d+$/.test(id));

    const items = ids.length ? await loadDetails(ids) : [];
    return json({ ok: true, items, nextCursor: page.nextPageCursor || null });
  } catch (err) {
    return json({ ok: false, message: "Gagal menghubungi Roblox dari server: " + (err && err.message ? err.message : "network error") }, 502);
  }
}

// Nama, kreator, vote, dan thumbnail untuk daftar ID (dua panggilan paralel).
async function loadDetails(ids) {
  const csv = ids.join(",");
  const [detailsRes, thumbsRes] = await Promise.all([
    fetch("https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=" + encodeURIComponent(csv), {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true }
    }),
    fetch("https://thumbnails.roblox.com/v1/assets?assetIds=" + encodeURIComponent(csv) + "&size=150x150&format=Png&returnPolicy=PlaceHolder", {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true }
    }).catch(() => null)
  ]);

  if (!detailsRes.ok) throw new Error(`detail asset HTTP ${detailsRes.status}`);
  const details = await detailsRes.json();

  const thumbs = {};
  if (thumbsRes && thumbsRes.ok) {
    try {
      const t = await thumbsRes.json();
      for (const row of t.data || []) {
        if (row && row.imageUrl && (row.state === "Completed" || !row.state)) thumbs[String(row.targetId)] = row.imageUrl;
      }
    } catch { /* thumbnail opsional */ }
  }

  const byId = {};
  for (const row of details.data || []) {
    const asset = (row && row.asset) || {};
    const id = String(asset.id != null ? asset.id : "");
    if (!id) continue;
    const creator = (row && row.creator) || {};
    const voting = (row && row.voting) || {};
    const up = Number(voting.upVotes) || 0;
    const down = Number(voting.downVotes) || 0;
    const total = up + down;
    byId[id] = {
      id,
      name: String(asset.name || "Tanpa nama").slice(0, 120),
      creator: String(creator.name || "").slice(0, 60),
      verified: Boolean(creator.verified || creator.hasVerifiedBadge || creator.isVerifiedCreator),
      votes: total,
      likePct: total > 0 ? Math.round((up / total) * 100) : null,
      thumb: thumbs[id] || null
    };
  }

  // Urutan hasil pencarian dipertahankan; ID yang detailnya gagal diambil tetap tampil dengan ID-nya.
  return ids.map((id) => byId[id] || { id, name: "Asset " + id, creator: "", verified: false, votes: 0, likePct: null, thumb: thumbs[id] || null });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
