import { serveLicensedScript } from "../../_lib/license.js";

// Alamat cadangan: GET /api/script/<slug>?u=<universeId>  (sama persis dengan /<slug>)
export async function onRequest({ request, env, params }) {
  const res = await serveLicensedScript(request, env, params.slug);
  return res || new Response("-- script tidak ditemukan", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
  });
}
