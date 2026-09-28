import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/roblox-profile
//
// Mengambil nama + avatar Roblox lewat server supaya browser tidak kena CORS
// (thumbnails.roblox.com tidak mengirim header CORS ke browser).
// Dipakai untuk avatar di pojok kanan atas dan kartu profil di Settings.
//
// Nama diambil dari users.roblox.com (publik, tanpa API key). Kalau gagal,
// dicoba lewat Open Cloud (butuh API key dengan scope Users). Avatar diambil
// dari Thumbnails API (publik). Tidak ada yang dicatat atau disimpan di server.

export async function onRequestPost(context) {
  const { request } = context;

  const denied = await requireUser(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid." }, 400);
  }

  const userId = String((body && body.userId) || "").trim();
  const apiKey = String((body && body.apiKey) || "").trim();
  if (!/^\d{1,20}$/.test(userId)) {
    return json({ ok: false, message: "Roblox User ID tidak valid." });
  }

  const [publicResult, avatarResult, cloudResult] = await Promise.allSettled([
    fetch(`https://users.roblox.com/v1/users/${userId}`),
    fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`),
    apiKey
      ? fetch(`https://apis.roblox.com/cloud/v2/users/${userId}`, { headers: { "x-api-key": apiKey } })
      : Promise.reject(new Error("no key"))
  ]);

  let username = null;
  let displayName = null;

  if (publicResult.status === "fulfilled" && publicResult.value.ok) {
    const d = await publicResult.value.json().catch(() => ({}));
    username = d.name || null;
    displayName = d.displayName || d.name || null;
  }

  if (!username && cloudResult.status === "fulfilled" && cloudResult.value.ok) {
    const d = await cloudResult.value.json().catch(() => ({}));
    username = d.name || null;
    displayName = d.displayName || d.name || null;
  }

  let avatarUrl = null;
  if (avatarResult.status === "fulfilled" && avatarResult.value.ok) {
    const d = await avatarResult.value.json().catch(() => null);
    const entry = d && d.data && d.data[0];
    // "Completed" = gambar siap; state lain kadang cuma placeholder.
    if (entry && entry.imageUrl && entry.state === "Completed") avatarUrl = entry.imageUrl;
  }

  if (!username && !avatarUrl) {
    return json({ ok: false, message: "Profil Roblox tidak ditemukan. Cek User ID kamu." });
  }

  // Gambar avatar dikirim langsung (data URL) supaya client bisa menyimpannya dan tetap tampil
  // walau URL CDN Roblox berubah/kedaluwarsa.
  const avatarData = avatarUrl ? await toDataUrl(avatarUrl) : null;

  return json({
    ok: true,
    username,
    displayName: displayName || username || userId,
    avatarUrl,
    avatarData
  });
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

async function toDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!type.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length || buf.length > 200000) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return "data:" + type + ";base64," + btoa(bin);
  } catch {
    return null;
  }
}
