import { requireUser } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/roblox-test
//
// Tes koneksi untuk tombol "Cek Koneksi" di Settings.
//
// Kenapa ditulis ulang: versi lama memanggil cloud/v2/users/{id} dan
// cloud/v2/groups/{id}. Dua endpoint itu butuh scope User/Group, padahal
// aplikasi ini cuma butuh scope ASSETS (read + write). Akibatnya API key yang
// benar dan cukup untuk upload malah ditolak (403) di tes koneksi.
//
// Sekarang:
//  1. API key divalidasi lewat introspeksi key Roblox (kalau tersedia) untuk
//     membaca daftar scope-nya, lalu dicek lewat endpoint Assets sebagai cadangan.
//  2. User ID / Group ID dicek lewat API publik Roblox (tanpa API key).
//
// API key hanya lewat request ini, tidak disimpan atau dicatat.

const REQUIRED_SCOPE_TEXT = "Assets (Read + Write)";

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
  if (!/^\d{1,20}$/.test(userId)) {
    return json({ ok: false, message: "Roblox User ID harus berupa angka." });
  }
  if (creatorType === "Group") {
    if (!groupId) return json({ ok: false, message: "Isi Group ID dulu untuk tes koneksi ke Group." });
    if (!/^\d{1,20}$/.test(groupId)) return json({ ok: false, message: "Group ID harus berupa angka." });
  }

  // 1) Validasi API key + scope
  const keyResult = await checkApiKey(apiKey);
  if (!keyResult.ok) return json({ ok: false, code: keyResult.code, message: keyResult.message });

  // 2) Validasi target (User / Group) lewat API publik
  const target = creatorType === "Group"
    ? await checkGroup(groupId)
    : await checkUser(userId);
  if (!target.ok) return json({ ok: false, code: target.code, message: target.message });

  const parts = [target.message];
  if (keyResult.note) parts.push(keyResult.note);
  return json({ ok: true, message: parts.join(" ") });
}

// ── API key ────────────────────────────────────────────────────────────────

function scopeSet(scopes) {
  // Bentuk scope Roblox: [{ name: "asset", operations: ["read","write"] }, ...]
  const set = new Set();
  const names = [];
  for (const s of Array.isArray(scopes) ? scopes : []) {
    if (typeof s === "string") { set.add(s.toLowerCase()); names.push(s.toLowerCase()); continue; }
    if (!s || typeof s.name !== "string") continue;
    const name = s.name.toLowerCase();
    names.push(name);
    const ops = Array.isArray(s.operations) ? s.operations : [];
    if (!ops.length) set.add(name);
    for (const op of ops) set.add(name + ":" + String(op).toLowerCase());
  }
  return { set, names };
}

async function checkApiKey(apiKey) {
  // (a) Introspeksi: baca scope langsung dari key (endpoint resmi Roblox).
  let info = null;
  try {
    const r = await fetch("https://apis.roblox.com/api-keys/v1/introspect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey })
    });
    if (r.ok) info = await r.json().catch(() => null);
  } catch { /* lanjut ke pengecekan cadangan */ }

  if (info && typeof info === "object" && Array.isArray(info.scopes)) {
    if (info.enabled === false) {
      return bad("key_disabled", "API key ini dinonaktifkan di Creator Hub. Aktifkan lagi atau buat key baru.");
    }
    if (info.expired === true) {
      return bad("key_expired", "API key ini sudah kedaluwarsa. Buat API key baru di Creator Hub.");
    }
    const { set, names } = scopeSet(info.scopes);
    const hasRead = set.has("asset:read") || set.has("asset");
    const hasWrite = set.has("asset:write") || set.has("asset");
    if (!hasRead || !hasWrite) {
      const found = names.length ? names.join(", ") : "tidak ada";
      const missing = [!hasRead ? "Read" : null, !hasWrite ? "Write" : null].filter(Boolean).join(" + ");
      return bad(
        "missing_scope",
        `⚠️ Scope API key tidak sesuai. Website ini butuh scope ${REQUIRED_SCOPE_TEXT}. ` +
        `Key kamu punya scope: ${found}` + (names.some((n) => n.startsWith("asset")) ? ` (kurang: ${missing}).` : ".") +
        ` Buat API key baru di creator.roblox.com → Credentials, tambahkan API System "Assets" dengan izin Read dan Write.`
      );
    }
    const others = names.filter((n) => !n.startsWith("asset"));
    return {
      ok: true,
      note: others.length
        ? `Catatan: key ini juga punya scope lain (${others.join(", ")}). Disarankan cukup scope Assets saja demi keamanan.`
        : ""
    };
  }

  // (b) Cadangan: probe endpoint Assets. Kunci valid + scope Assets → 404 (operasi tidak ada).
  let res;
  try {
    res = await fetch("https://apis.roblox.com/assets/v1/operations/00000000-0000-4000-8000-000000000000", {
      headers: { "x-api-key": apiKey }
    });
  } catch (err) {
    return bad("network", "Gagal menghubungi Roblox dari server: " + (err && err.message ? err.message : "network error"));
  }

  if (res.status === 401) {
    return bad("invalid_key", "API key tidak valid atau salah salin. Cek lagi API key dari Creator Hub (tanpa spasi).");
  }
  if (res.status === 403) {
    const txt = await res.text().catch(() => "");
    const ipHint = /ip|address/i.test(txt) ? " Kemungkinan juga pembatasan IP (Accepted IP Addresses) di API key — isi 0.0.0.0/0." : "";
    return bad(
      "missing_scope",
      `⚠️ API key ditolak untuk Assets API (HTTP 403). Website ini butuh scope ${REQUIRED_SCOPE_TEXT}. ` +
      `Buat/ubah API key di creator.roblox.com → Credentials, tambahkan API System "Assets" dengan izin Read dan Write.` + ipHint
    );
  }
  if (res.status === 429) {
    return bad("rate_limited", "Roblox sedang membatasi permintaan (HTTP 429). Coba lagi beberapa detik lagi.");
  }
  if (res.status >= 500) {
    return bad("roblox_down", `Server Roblox sedang bermasalah (HTTP ${res.status}). Coba lagi nanti.`);
  }
  // 200 / 400 / 404 = key diterima oleh Assets API
  return { ok: true, note: "" };
}

// ── User / Group (API publik, tanpa API key) ───────────────────────────────

async function checkUser(userId) {
  let res;
  try {
    res = await fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`);
  } catch {
    // API publik tidak terjangkau — key sudah valid, jangan gagalkan tes hanya karena ini.
    return { ok: true, message: "API key valid (scope Assets OK)." };
  }
  if (res.ok) {
    const d = await res.json().catch(() => ({}));
    const name = d.displayName || d.name || userId;
    return { ok: true, message: `Terhubung ke akun Roblox: ${name}. API key valid (scope Assets OK).` };
  }
  if (res.status === 404 || res.status === 400) {
    return { ok: false, code: "user_not_found", message: "User ID tidak ditemukan di Roblox. Cek lagi angkanya." };
  }
  return { ok: true, message: "API key valid (scope Assets OK)." };
}

async function checkGroup(groupId) {
  let res;
  try {
    res = await fetch(`https://groups.roblox.com/v1/groups/${encodeURIComponent(groupId)}`);
  } catch {
    return { ok: true, message: "API key valid (scope Assets OK)." };
  }
  if (res.ok) {
    const d = await res.json().catch(() => ({}));
    const name = d.name || groupId;
    return { ok: true, message: `Terhubung ke Group Roblox: ${name}. API key valid (scope Assets OK).` };
  }
  if (res.status === 404 || res.status === 400) {
    return { ok: false, code: "group_not_found", message: "Group ID tidak ditemukan di Roblox. Cek lagi angkanya." };
  }
  return { ok: true, message: "API key valid (scope Assets OK)." };
}

function bad(code, message) { return { ok: false, code, message }; }

export async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
