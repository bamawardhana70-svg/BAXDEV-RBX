import { requireUser } from "../_lib/auth.js";
import { resolveModeration } from "../_lib/moderation.js";

// Cloudflare Pages Function — POST /api/roblox-asset-status
//
// Dipanggil dari Library saat sebuah track masih berstatus "pending"
// (operation belum done() waktu /api/roblox-upload tadi polling). Ini
// hanya satu kali GET ke operation yang sama — bukan proxy baru, cuma
// lanjutan pengecekan yang sama seperti di roblox-upload.js — supaya
// assetId yang muncul belakangan (moderasi audio Roblox bisa makan waktu)
// tetap bisa diambil tanpa upload ulang.

export async function onRequestPost(context) {
  const { request } = context;

  const denied = await requireUser(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan JSON)." }, 400);
  }

  const apiKey = String(body.apiKey || "").trim();
  const operationPath = String(body.operationPath || "").trim();
  const knownAssetId = String(body.assetId || "").trim();
  if (!apiKey || (!operationPath && !knownAssetId)) {
    return json({ ok: false, message: "apiKey dan operationPath (atau assetId) wajib diisi." }, 400);
  }
  if (operationPath && !/^operations\/[\w-]+$/.test(operationPath)) {
    return json({ ok: false, message: "Format operationPath tidak valid." }, 400);
  }
  if (!operationPath && !/^[0-9]{1,20}$/.test(knownAssetId)) {
    return json({ ok: false, message: "Format assetId tidak valid." }, 400);
  }

  // Cek langsung lewat assetId (untuk entri yang tidak punya operationPath)
  if (!operationPath) {
    const moderation = await resolveModeration(knownAssetId, apiKey, null);
    if (moderation === "rejected") {
      return json({ ok: true, done: true, error: true, rejected: true, message: "Roblox menolak asset ini: diblokir moderasi." });
    }
    if (moderation === "reviewing") {
      return json({ ok: true, done: false, moderating: true, message: "Masih dimoderasi Roblox." });
    }
    return json({ ok: true, done: true, assetId: knownAssetId, rejected: false, moderationState: "approved" });
  }

  let res;
  try {
    res = await fetch(`https://apis.roblox.com/assets/v1/${operationPath}`, {
      headers: { "x-api-key": apiKey }
    });
  } catch (err) {
    return json({ ok: false, message: "Gagal menghubungi Roblox dari server: " + (err && err.message ? err.message : "network error") }, 502);
  }

  const bodyText = await res.text();
  let op = {};
  try { op = JSON.parse(bodyText); } catch { /* Roblox didn't return JSON */ }

  if (!res.ok) {
    return json({ ok: false, message: `Roblox membalas HTTP ${res.status} saat cek status.` });
  }
  if (!op.done) {
    return json({ ok: true, done: false, message: "Masih diproses Roblox." });
  }
  if (op.error) {
    return json({ ok: true, done: true, error: true, rejected: true, message: `Roblox menolak asset ini: ${op.error.message || "diblokir moderasi."}` });
  }

  const assetId = op.response && op.response.assetId ? String(op.response.assetId) : null;
  const opState = op.response && op.response.moderationResult ? op.response.moderationResult.moderationState : null;
  if (!assetId) {
    return json({ ok: true, done: true, assetId: null, rejected: false, moderationState: null });
  }
  // done=true hanya berarti asset sudah dibuat, bukan berarti lolos moderasi.
  const moderation = await resolveModeration(assetId, apiKey, opState);
  if (moderation === "rejected") {
    return json({ ok: true, done: true, error: true, rejected: true, message: "Roblox menolak asset ini: diblokir moderasi." });
  }
  if (moderation === "reviewing") {
    return json({ ok: true, done: false, moderating: true, message: "Masih dimoderasi Roblox." });
  }
  return json({ ok: true, done: true, assetId, rejected: false, moderationState: "approved" });
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
