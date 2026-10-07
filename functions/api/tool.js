import { requireUser, requireVipPlus } from "../_lib/auth.js";
import meshHtml from "../_tools/image-to-mesh.js";
import skyboxHtml from "../_tools/skybox-360.js";

// Cloudflare Pages Function — GET /api/tool?name=mesh|skybox&rid=<Roblox User ID>
//
// Tool VIP Plus (Image to Mesh, SkyBox 360) disajikan dari sini, bukan dari file statis, supaya
// HTML-nya tidak bisa diunduh tanpa login Google + status VIP Plus (atau Owner) yang diperiksa server.
// Halaman utama memuatnya ke iframe sandbox tanpa akses ke localStorage / API key Roblox.

const TOOLS = { mesh: meshHtml, skybox: skyboxHtml };

export async function onRequestGet({ request }) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const html = Object.prototype.hasOwnProperty.call(TOOLS, url.searchParams.get("name")) ? TOOLS[url.searchParams.get("name")] : null;
  if (!html) return json({ ok: false, message: "Tool tidak ditemukan." }, 404);

  const gate = await requireVipPlus(request, url.searchParams.get("rid"));
  if (gate) return gate;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
