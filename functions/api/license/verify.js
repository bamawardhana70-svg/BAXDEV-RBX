import { verifyLicense, writeLog, MSG } from "../../_lib/licverify.js";

// POST /api/license/verify   (dipanggil ModuleScript BaxdevLicense dari server game Roblox, dan tombol Test License)
// Body JSON: { key, universeId, placeId, nonce, jobId?, studio?, test?, v? }
// Respons selalu JSON dengan nonce yang sama (modul menolak respons tanpa nonce). Tidak butuh login: Roblox tidak bisa login.
// Tidak memakai requireUser/maintenance: game yang sedang berjalan tidak boleh mati karena jadwal maintenance situs.
const HEAD = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: HEAD });

export async function onRequest({ request, waitUntil }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEAD });
  if (request.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: MSG.METHOD_NOT_ALLOWED });

  let body = null;
  try {
    const raw = await request.text();
    if (raw.length <= 2048) body = JSON.parse(raw);
  } catch { body = null; }

  const res = await verifyLicense({
    body,
    robloxId: request.headers.get("roblox-id"),
    country: request.headers.get("cf-ipcountry")
  });
  if (res.log) {
    const p = writeLog(res.key, res.log);
    if (typeof waitUntil === "function") waitUntil(p); else await p;
  }
  return json(res.status, res.body);
}
