import { requireUser, requireVipPlus } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/image-upscale (multipart/form-data)
//   image = file gambar (PNG/JPG/WebP), scale = 2 | 4, rid = Roblox User ID (untuk cek VIP Plus)
//
// Diteruskan ke api.theresav.eu/api/tools/hd (field "image" dan "scale", header x-apikey).
// Dipakai SkyBox 360 untuk memperbesar tiap sisi sebelum diunggah ke Roblox.
// Sukses: body gambar hasil (content-type image/*). Gagal: JSON {ok:false,message,retryable}.

const API_KEY = "U8LwW";
const HD_URL = "https://api.theresav.eu/api/tools/hd";
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 100000;
const SCALES = new Set(["2", "4"]);

export async function onRequestPost({ request }) {
  const denied = await requireUser(request);
  if (denied) return denied;

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan multipart/form-data)." }, 400);
  }

  const gate = await requireVipPlus(request, form.get("rid"));
  if (gate) return gate;

  const image = form.get("image");
  const scale = String(form.get("scale") || "");
  if (!(image instanceof Blob) || image.size === 0) return json({ ok: false, message: "image wajib diisi." }, 400);
  if (image.size > MAX_INPUT_BYTES) return json({ ok: false, message: "Gambar terlalu besar untuk di-upscale (maksimal 10 MB)." }, 413);
  if (!/^image\/(png|jpeg|webp)$/i.test(image.type || "")) return json({ ok: false, message: "Format gambar harus PNG, JPG, atau WebP." }, 400);
  if (!SCALES.has(scale)) return json({ ok: false, message: "scale harus 2 atau 4." }, 400);

  const upstreamForm = new FormData();
  upstreamForm.append("image", image, "image." + (image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1]));
  upstreamForm.append("scale", scale);

  let upstream;
  try {
    upstream = await fetch(HD_URL, { method: "POST", headers: { "x-apikey": API_KEY }, body: upstreamForm, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    return json({ ok: false, message: timedOut ? "Upscale terlalu lama merespons. Coba lagi." : "Gagal menghubungi API upscale.", retryable: true }, 502);
  }

  if (!upstream.ok) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 200);
    return json({ ok: false, message: `API upscale membalas HTTP ${upstream.status}${detail ? ": " + detail : ""}`, retryable: upstream.status === 429 || upstream.status >= 500 }, 502);
  }

  const type = upstream.headers.get("content-type") || "";
  if (/^image\//i.test(type)) {
    return new Response(upstream.body, { status: 200, headers: { "content-type": type, "cache-control": "no-store" } });
  }

  // Upstream membalas JSON berisi link hasil.
  let data;
  try { data = await upstream.json(); } catch {
    return json({ ok: false, message: "Respons API upscale bukan gambar maupun JSON yang dikenali.", retryable: true }, 502);
  }
  const link = pickUrl(data);
  let fileUrl;
  try {
    fileUrl = new URL(link);
    if (fileUrl.protocol !== "https:") throw new Error("protocol");
  } catch {
    return json({ ok: false, message: "API upscale tidak mengembalikan link gambar.", retryable: true }, 502);
  }

  let file;
  try {
    file = await fetch(fileUrl.href, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    return json({ ok: false, message: timedOut ? "Download hasil upscale terlalu lama." : "Gagal mengunduh hasil upscale.", retryable: true }, 502);
  }
  const fileType = file.headers.get("content-type") || "";
  if (!file.ok || !/^image\//i.test(fileType)) {
    file.body && file.body.cancel().catch(() => {});
    return json({ ok: false, message: `Hasil upscale tidak bisa diunduh (HTTP ${file.status}).`, retryable: file.status === 429 || file.status >= 500 }, 502);
  }
  return new Response(file.body, { status: 200, headers: { "content-type": fileType, "cache-control": "no-store" } });
}

function pickUrl(data) {
  const sources = [data, data && data.result, data && data.data];
  for (const s of sources) {
    if (!s) continue;
    if (typeof s === "string") return s;
    const v = s.url || s.image || s.output || s.downloadUrl || s.download_url;
    if (typeof v === "string") return v;
  }
  return "";
}

export async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
