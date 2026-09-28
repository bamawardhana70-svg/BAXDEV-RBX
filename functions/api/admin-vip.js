// Cloudflare Pages Function — POST /api/admin-vip
// Body: { password, action: "list" | "add" | "remove", userId?, note? }
// Butuh: KV binding VIP_KV + secret/env ADMIN_PASSWORD (Pages -> Settings).

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function passwordOk(input, expected) {
  const [a, b] = await Promise.all([sha256(String(input || "")), sha256(String(expected))]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, message: "Body bukan JSON." }, 400); }

  if (!env.ADMIN_PASSWORD) return json({ ok: false, code: "no_password", message: "ADMIN_PASSWORD belum diset di Cloudflare Pages (Settings → Variables and Secrets)." }, 500);
  if (!env.VIP_KV) return json({ ok: false, code: "no_kv", message: "KV namespace belum di-bind dengan nama VIP_KV (Settings → Bindings)." }, 500);

  if (!(await passwordOk(body && body.password, env.ADMIN_PASSWORD))) {
    await new Promise((r) => setTimeout(r, 600));
    return json({ ok: false, code: "bad_password", message: "Password salah." }, 401);
  }

  const action = String(body.action || "list");

  if (action === "list") {
    const items = [];
    let cursor;
    do {
      const page = await env.VIP_KV.list({ prefix: "vip:", cursor });
      for (const k of page.keys) {
        const meta = k.metadata || {};
        items.push({ id: k.name.slice(4), addedAt: meta.addedAt || null, note: meta.note || "" });
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    items.sort((a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")));
    return json({ ok: true, items });
  }

  const userId = String(body.userId || "").trim();
  if (!/^\d{1,20}$/.test(userId)) return json({ ok: false, message: "User ID harus angka (maks 20 digit)." }, 400);

  if (action === "add") {
    const note = String(body.note || "").trim().slice(0, 80);
    await env.VIP_KV.put("vip:" + userId, "1", { metadata: { addedAt: new Date().toISOString(), note } });
    return json({ ok: true, message: `Roblox #${userId} sekarang VIP.` });
  }
  if (action === "remove") {
    await env.VIP_KV.delete("vip:" + userId);
    return json({ ok: true, message: `VIP Roblox #${userId} dihapus.` });
  }
  return json({ ok: false, message: "Action tidak dikenal." }, 400);
}

export async function onRequestGet() { return json({ ok: false, message: "Gunakan POST." }, 405); }

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
