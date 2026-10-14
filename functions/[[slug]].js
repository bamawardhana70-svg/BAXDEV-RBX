import { serveLicensedScript, isValidSlug } from "./_lib/license.js";

// Catch-all untuk link script lisensi di akar domain, contoh: https://baxdev-rbx.pages.dev/musicserver?u=<universeId>
// Hanya satu segmen path yang valid sebagai slug yang diperiksa ke database; selain itu langsung diteruskan
// ke file statis (next()), jadi halaman situs lain tidak terpengaruh.
export async function onRequest({ request, env, params, next }) {
  const parts = Array.isArray(params.slug) ? params.slug : [params.slug];
  if (parts.length === 1 && isValidSlug(String(parts[0] || "").toLowerCase())) {
    const res = await serveLicensedScript(request, env, parts[0]);
    if (res) return res;
  }
  return next();
}
