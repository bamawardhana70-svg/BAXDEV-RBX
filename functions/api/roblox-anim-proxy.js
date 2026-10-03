import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — GET /api/roblox-anim-proxy?animId=XXX
//
// CORS proxy untuk mengambil file animasi Roblox dari browser.
// Roblox CDN (assetdelivery) tidak menyertakan header CORS, jadi fetch
// langsung dari browser diblokir browser. Endpoint ini menjadi perantara:
// mengambil file animasi di server-side lalu mengembalikannya ke browser.
//
// Butuh login Google (requireUser) untuk mencegah penyalahgunaan endpoint.
// Kuota tidak dikurangi karena ini hanya baca, bukan upload.

const ANIM_ID_RE = /^\d{1,19}$/;
const MAX_BYTES  = 10 * 1024 * 1024; // 10 MB — animasi pada umumnya <1 MB

export async function onRequestGet(context) {
  try {
    return await handleProxy(context);
  } catch (err) {
    return json({ ok: false, message: "Kesalahan server: " + (err?.message || "tidak diketahui") }, 500);
  }
}

async function handleProxy(context) {
  const { request } = context;

  const denied = await requireUser(request);
  if (denied) return denied;

  const url    = new URL(request.url);
  const animId = (url.searchParams.get("animId") || "").replace(/\D/g, "").trim();

  if (!ANIM_ID_RE.test(animId)) {
    return json({ ok: false, message: "animId tidak valid — harus berupa angka." }, 400);
  }

  let cdnRes;
  try {
    cdnRes = await fetch(
      `https://assetdelivery.roblox.com/v1/asset/?id=${animId}`,
      {
        redirect: "follow",
        headers: {
          Accept: "*/*",
          "User-Agent": "RobloxProxy/1.0",
        },
      }
    );
  } catch (err) {
    return json(
      { ok: false, message: "Gagal menghubungi Roblox CDN: " + (err?.message || "network error") },
      502
    );
  }

  if (cdnRes.status === 401 || cdnRes.status === 403) {
    return json(
      {
        ok: false,
        message: `Animasi ID ${animId} tidak bisa diunduh — kemungkinan privat atau dibatasi. Coba animasi publik dari Toolbox.`,
      },
      403
    );
  }
  if (cdnRes.status === 404) {
    return json({ ok: false, message: `Animasi ID ${animId} tidak ditemukan.` }, 404);
  }
  if (!cdnRes.ok) {
    return json(
      { ok: false, message: `Roblox CDN membalas HTTP ${cdnRes.status} untuk ID ${animId}.` },
      502
    );
  }

  let buf;
  try {
    buf = await cdnRes.arrayBuffer();
  } catch (err) {
    return json(
      { ok: false, message: "Gagal membaca data animasi: " + (err?.message || "read error") },
      502
    );
  }

  if (!buf || buf.byteLength === 0) {
    return json({ ok: false, message: `File animasi ID ${animId} kosong.` }, 400);
  }
  if (buf.byteLength > MAX_BYTES) {
    return json(
      {
        ok: false,
        message: `File animasi terlalu besar (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB, maks 10 MB).`,
      },
      413
    );
  }

  // Deteksi content type dari konten
  const head = new TextDecoder("latin1").decode(buf.slice(0, 64));
  const ct   = head.includes("<roblox") ? "text/xml; charset=utf-8" : "application/octet-stream";

  return new Response(buf, {
    headers: {
      "content-type":  ct,
      "cache-control": "public, max-age=300", // 5 menit cache
      "x-anim-id":     animId,
    },
  });
}

export async function onRequestPost() {
  return json({ ok: false, message: "Gunakan GET." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  });
}
