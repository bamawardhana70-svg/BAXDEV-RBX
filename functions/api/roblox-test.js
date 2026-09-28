import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/roblox-test
//
// Same rationale as roblox-upload.js: proxies a call to Roblox's Open Cloud
// API server-side so the "Cek Koneksi" button in Settings works regardless
// of browser CORS. Nothing here is logged or persisted.
//
// creatorType "Group" checks the Groups API (v2/groups/{groupId}) instead of
// the Users API, since that's the endpoint + scope that actually matters
// when uploads are going to publish under a Group/community, not the user's
// own account. A key can be valid for Users but lack Groups access (or vice
// versa), so testing the wrong endpoint would report "connected" even when
// the upload is about to fail.

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
  const creatorType = String((body && body.creatorType) || "User").trim();
  const groupId = String((body && body.groupId) || "").trim();

  if (!userId || !apiKey) {
    return json({ ok: false, message: "Isi Roblox User ID dan API Key dulu." });
  }

  if (creatorType === "Group") {
    if (!groupId) {
      return json({ ok: false, message: "Isi Group ID dulu untuk tes koneksi ke Group." });
    }
    return testGroup(groupId, apiKey);
  }
  return testUser(userId, apiKey);
}

async function testUser(userId, apiKey) {
  let res;
  try {
    res = await fetch(`https://apis.roblox.com/cloud/v2/users/${encodeURIComponent(userId)}`, {
      headers: { "x-api-key": apiKey }
    });
  } catch (err) {
    return json({ ok: false, message: "Gagal menghubungi Roblox dari server: " + (err && err.message ? err.message : "network error") });
  }

  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    const name = data.displayName || data.name || userId;
    return json({ ok: true, message: `Terhubung ke akun Roblox: ${name}.` });
  }
  if (res.status === 401 || res.status === 403) {
    return json({ ok: false, message: `API key ditolak (HTTP ${res.status}). Cek API key dan pastikan scope Users API / Assets API sudah dicentang.` });
  }
  if (res.status === 404) {
    return json({ ok: false, message: "User ID tidak ditemukan di Roblox." });
  }
  return json({ ok: false, message: `Roblox membalas HTTP ${res.status}.` });
}

async function testGroup(groupId, apiKey) {
  let res;
  try {
    res = await fetch(`https://apis.roblox.com/cloud/v2/groups/${encodeURIComponent(groupId)}`, {
      headers: { "x-api-key": apiKey }
    });
  } catch (err) {
    return json({ ok: false, message: "Gagal menghubungi Roblox dari server: " + (err && err.message ? err.message : "network error") });
  }

  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    const name = data.displayName || data.id || groupId;
    return json({ ok: true, message: `Terhubung ke Group Roblox: ${name}.` });
  }
  if (res.status === 401 || res.status === 403) {
    return json({ ok: false, message: `API key ditolak untuk Group ini (HTTP ${res.status}). Pastikan API key dibuat dari Group tersebut (atau kamu punya izin), dan scope Groups / Assets: Read & Write dicentang.` });
  }
  if (res.status === 404) {
    return json({ ok: false, message: "Group ID tidak ditemukan di Roblox. Cek lagi angkanya." });
  }
  const bodyText = await res.text().catch(() => "");
  return json({ ok: false, message: `Roblox membalas HTTP ${res.status}${bodyText ? ": " + bodyText.slice(0, 150) : "."}` });
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
