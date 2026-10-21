// Halaman /license (owner). Data lewat Firebase Realtime Database (aturan: database.rules.json), verifikasi lewat /api/license/verify.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, update, query, limitToLast, forceLongPolling } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { buildModuleLua, buildModuleLuaObf, buildLoaderLua, defaultModuleName } from "./license-lua.js";

const $ = (id) => document.getElementById(id);
const DAY = 86400000, SOON_DAYS = 7, MAX_DAYS = 3650, MAX_UNI = 20, MAX_PLACE = 50;
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ID_RE = /^[1-9][0-9]{0,19}$/;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (ms) => new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (ms) => new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const maskKey = (k) => String(k || "").length === 23 ? k.slice(0, 8) + "-••••-••••-" + k.slice(-4) : "••••";
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return s + " dtk lalu";
  if (s < 3600) return Math.floor(s / 60) + " mnt lalu";
  if (s < 86400) return Math.floor(s / 3600) + " jam lalu";
  return Math.floor(s / 86400) + " hari lalu";
}
function rand(len) {
  const b = new Uint8Array(len); crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHA[x % 32]).join("");
}
const genKey = () => "BXL-" + [rand(4), rand(4), rand(4), rand(4)].join("-");
const genId = () => rand(12);

/* ── Penjelasan error (kode dari server + masalah umum di Studio) ── */
const ERRORS = [
  ["HTTP_DISABLED", "HTTP Requests belum aktif di game.", "Studio: Home → Game Settings → Security → nyalakan Allow HTTP Requests → Save. Lalu File → Publish to Roblox dan jalankan ulang."],
  ["PLACE_NOT_PUBLISHED", "Place belum dipublish (Place ID 0).", "File → Publish to Roblox. Setelah itu Universe ID dan Place ID terisi."],
  ["KEY_NOT_FOUND", "Kunci lisensi tidak ada di database.", "Lisensi mungkin sudah dihapus atau key salah salin. Salin ulang ModuleScript dari halaman ini."],
  ["KEY_INVALID", "Format kunci rusak.", "Jangan edit baris LICENSE_KEY. Salin ulang seluruh ModuleScript."],
  ["DISABLED", "Lisensi dinonaktifkan admin.", "Admin mengaktifkan kembali lewat tombol Aktifkan."],
  ["EXPIRED", "Masa berlaku habis.", "Admin memperpanjang lisensi lewat tombol Perpanjang. Berlaku langsung tanpa memasang ulang kode."],
  ["UNIVERSE_NOT_ALLOWED", "Universe ID game belum terdaftar.", "Tambahkan Universe ID di tab Kelola. Cek angkanya: jalankan print(game.GameId) di Command Bar Studio."],
  ["PLACE_NOT_ALLOWED", "Place ID tidak ada di daftar place yang diizinkan.", "Tambahkan Place ID di tab Kelola, atau kosongkan daftar Place supaya semua place di universe itu boleh."],
  ["UNIVERSE_PLACE_MISMATCH", "Universe ID dan Place ID bukan dari game yang sama.", "Biasanya terjadi di tes manual: isi pasangan yang benar dari print(game.GameId, game.PlaceId)."],
  ["PLACE_HEADER_MISMATCH", "Place ID yang dikirim berbeda dengan asal request dari Roblox.", "Modul diedit atau request dipalsukan. Pasang ulang ModuleScript asli."],
  ["PLACE_UNKNOWN", "Roblox tidak mengenali Place ID.", "Pastikan place sudah dipublish dan Place ID benar."],
  ["LOOKUP_FAILED", "Server gagal bertanya ke Roblox (sementara).", "Tunggu sebentar, modul mencoba ulang otomatis 3 kali. Game tidak di-kick untuk error ini."],
  ["DB_UNAVAILABLE", "Database lisensi tidak terjangkau (sementara).", "Coba lagi nanti. Cek status Firebase bila berlanjut."],
  ["NETWORK", "Server lisensi tidak terhubung dari game.", "Pastikan Allow HTTP Requests aktif dan domain situs bisa dibuka. Game tidak di-kick untuk error ini."],
  ["BAD_REQUEST", "Permintaan rusak atau tidak lengkap.", "Pasang ulang ModuleScript BaxdevLicense dari halaman ini."],
  ["SERVER_ONLY", "Modul dipanggil dari LocalScript / sisi client.", "Loader harus berupa Script (bukan LocalScript) di ServerScriptService."]
];
const MISC = [
  ["Infinite yield possible on 'ServerScriptService.BaxdevLicense'", "ModuleScript tidak ada atau salah nama.", "Nama harus persis BaxdevLicense, tipe ModuleScript, di ServerScriptService."],
  ["Script tidak mencetak apa-apa di Output", "Script salah tipe/lokasi atau dinonaktifkan.", "Pakai Script (bukan LocalScript), taruh di ServerScriptService, pastikan Enabled dicentang, dan buka View → Output."],
  ["Requested module experienced an error while loading", "ModuleScript produk punya error sendiri.", "Baca pesan error di baris sebelumnya di Output. Lisensinya sendiri sudah lolos."],
  ["ModuleScript produk tidak ditemukan", "Nama ModuleScript produk berbeda dengan di loader.", "Samakan nama di PRODUCT_MODULE_NAME dengan nama ModuleScript produk (atau ubah di tab Kelola lalu salin ulang loader)."],
  ["Gagal require() Asset ID", "Asset tidak bisa dimuat oleh game ini.", "Asset harus ModuleScript yang dipublish dan bisa dipakai pemilik game (milik akun/grup yang sama atau diberi izin)."]
];
const errInfo = (code) => ERRORS.find((e) => e[0] === code);

/* ── Firebase ── */
const cfg = window.BAXDEV_FIREBASE || {};
const configured = cfg.apiKey && cfg.databaseURL && !/ISI_/.test(cfg.apiKey + cfg.databaseURL);
let auth, db;
let licMap = {}, statMap = {}, logMap = {}, unsubs = [], logUnsub = null, logKey = "";
let obf = true, route = { view: "list" }, filter = "all", search = "", justCreated = "", codes = { A: "", B: "" };
if (configured) {
  const app = initializeApp(cfg);
  auth = getAuth(app);
  try { forceLongPolling(); } catch (e) {}
  db = getDatabase(app);
}

/* ── Util UI ── */
function toast(msg, bad) {
  const old = document.querySelector(".toast"); if (old) old.remove();
  const t = document.createElement("div"); t.className = "toast" + (bad ? " bad" : ""); t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const t = document.createElement("textarea"); t.value = text; t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e2) {}
    t.remove(); if (!ok) return toast("Gagal menyalin. Salin manual.", true);
  }
  toast((label || "Teks") + " tersalin");
}
function hl(src) {
  const re = /(--\[\[[\s\S]*?\]\])|(--[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(and|break|do|else|elseif|end|false|for|function|if|in|local|nil|not|or|repeat|return|then|true|until|while)\b|\b(\d+(?:\.\d+)?)\b/g;
  let out = "", last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    out += '<span class="t-' + (m[1] || m[2] ? "c" : m[3] ? "s" : m[4] ? "k" : "n") + '">' + esc(m[0]) + "</span>";
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}
function statusOf(l) {
  if (!l.enabled) return "off";
  const now = Date.now();
  if (l.expiresAt && l.expiresAt <= now) return "expired";
  if (l.expiresAt && l.expiresAt - now <= SOON_DAYS * DAY) return "soon";
  return "active";
}
const S_LABEL = { active: "Aktif", soon: "Segera berakhir", expired: "Kedaluwarsa", off: "Nonaktif" };
const chipHtml = (l) => { const s = statusOf(l); return '<span class="chip s-' + s + '">' + S_LABEL[s] + "</span>"; };
function expText(l) {
  if (!l.expiresAt) return "Permanen";
  const d = Math.ceil((l.expiresAt - Date.now()) / DAY);
  return fmtDate(l.expiresAt) + (d > 0 ? " · " + d + " hari lagi" : " · lewat " + Math.max(1, -d) + " hari");
}
const keysOf = (o) => Object.keys(o || {}).sort((a, b) => (a.length - b.length) || (a < b ? -1 : 1));
function lastText(l) {
  const s = statMap[l.key];
  if (!s) return "Belum pernah";
  return (s.ok ? "✓ " : "✕ " + (s.code || "") + " · ") + ago(s.at);
}
const licList = () => Object.keys(licMap).map((id) => Object.assign({ id }, licMap[id])).filter((l) => l && l.key).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
const errMsg = (e) => /PERMISSION_DENIED/i.test(String(e && (e.code || e.message))) ? "Ditolak database. Publish ulang database.rules.json di Firebase Console." : String((e && e.message) || e);

/* ── Modal ── */
function openModal(html, onMount) {
  closeModal();
  const ov = document.createElement("div"); ov.className = "ov"; ov.id = "ov";
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + "</div>";
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) closeModal(); });
  $("modalRoot").appendChild(ov);
  document.addEventListener("keydown", escClose);
  const f = ov.querySelector("input,select,button"); if (f) f.focus();
  if (onMount) onMount(ov.firstChild);
}
const escClose = (e) => { if (e.key === "Escape") closeModal(); };
function closeModal() { const o = $("ov"); if (o) o.remove(); document.removeEventListener("keydown", escClose); }

/* ── Aksi data ── */
async function setEnabled(l, on) {
  const t = Date.now();
  try {
    await update(ref(db), { ["licenses/" + l.id + "/enabled"]: on, ["licenses/" + l.id + "/updatedAt"]: t, ["licpub/" + l.key + "/enabled"]: on, ["licpub/" + l.key + "/updatedAt"]: t });
    toast(on ? "Lisensi diaktifkan" : "Lisensi dinonaktifkan");
  } catch (e) { toast(errMsg(e), true); }
}
async function setExpiry(l, exp) {
  const t = Date.now();
  try {
    await update(ref(db), { ["licenses/" + l.id + "/expiresAt"]: exp, ["licenses/" + l.id + "/updatedAt"]: t, ["licpub/" + l.key + "/expiresAt"]: exp, ["licpub/" + l.key + "/updatedAt"]: t });
    toast(exp ? "Berlaku sampai " + fmtDate(exp) : "Lisensi dijadikan permanen"); return true;
  } catch (e) { toast(errMsg(e), true); return false; }
}
async function removeLicense(l) {
  try {
    await update(ref(db), { ["licenses/" + l.id]: null, ["licpub/" + l.key]: null, ["liclog/" + l.key]: null, ["licstat/" + l.key]: null });
    toast("Lisensi dihapus");
    if (route.view === "detail" && route.id === l.id) location.hash = "#/";
  } catch (e) { toast(errMsg(e), true); }
}
async function addIds(l, kind, raw) {
  const ids = Array.from(new Set(String(raw).split(/[\s,;]+/).filter(Boolean)));
  if (!ids.length) return false;
  const bad = ids.filter((x) => !ID_RE.test(x));
  if (bad.length) { toast("ID harus angka saja: " + bad[0], true); return false; }
  const cur = l[kind] || {}, limit = kind === "universes" ? MAX_UNI : MAX_PLACE;
  const fresh = ids.filter((x) => !cur[x]);
  if (Object.keys(cur).length + fresh.length > limit) { toast("Maksimal " + limit + " ID per lisensi", true); return false; }
  if (!fresh.length) { toast("ID sudah ada di daftar", true); return false; }
  const t = Date.now(), w = { ["licenses/" + l.id + "/updatedAt"]: t, ["licpub/" + l.key + "/updatedAt"]: t };
  fresh.forEach((x) => { w["licenses/" + l.id + "/" + kind + "/" + x] = true; w["licpub/" + l.key + "/" + kind + "/" + x] = true; });
  try { await update(ref(db), w); toast(fresh.length + " ID ditambahkan, langsung berlaku"); return true; }
  catch (e) { toast(errMsg(e), true); return false; }
}
async function removeId(l, kind, id) {
  if (kind === "universes" && Object.keys(l.universes || {}).length <= 1) return toast("Minimal satu Universe ID harus terdaftar.", true);
  const t = Date.now();
  try {
    await update(ref(db), { ["licenses/" + l.id + "/" + kind + "/" + id]: null, ["licpub/" + l.key + "/" + kind + "/" + id]: null, ["licenses/" + l.id + "/updatedAt"]: t, ["licpub/" + l.key + "/updatedAt"]: t });
    toast("ID dihapus");
  } catch (e) { toast(errMsg(e), true); }
}

/* ── Modal: buat lisensi ── */
function chipsHtml(arr, kind) {
  return arr.map((x) => '<span class="cx">' + esc(x) + '<button type="button" class="chip-x" data-rm="' + kind + '" data-v="' + esc(x) + '" aria-label="Hapus ' + esc(x) + '">×</button></span>').join("");
}
function openCreate() {
  const f = { universes: [], places: [] };
  openModal(`<h2>Lisensi baru</h2>
  <div class="field"><label for="fName">Nama lisensi / produk</label><input id="fName" maxlength="80" placeholder="Contoh: Music Server Pro"></div>
  <div class="field"><label for="fBuyer">Pembeli (opsional)</label><input id="fBuyer" maxlength="80" placeholder="Nama atau username pembeli"></div>
  <div class="field"><label for="fUni">Universe ID (wajib)</label>
    <div class="addrow"><input id="fUni" inputmode="numeric" autocomplete="off" placeholder="Pisahkan koma untuk banyak ID"><button class="btn" type="button" data-add="universes">Tambah</button></div>
    <div class="chips" id="cUni"></div><div class="hint">Cek di Studio: Command Bar → <code>print(game.GameId, game.PlaceId)</code>. Angka pertama = Universe ID.</div></div>
  <div class="field"><label for="fPlc">Place ID (opsional)</label>
    <div class="addrow"><input id="fPlc" inputmode="numeric" autocomplete="off" placeholder="Kosong = semua place di universe itu"><button class="btn" type="button" data-add="places">Tambah</button></div>
    <div class="chips" id="cPlc"></div></div>
  <div class="grid2">
    <div class="field"><label for="fDur">Masa berlaku</label><select id="fDur"><option value="30">30 hari</option><option value="7">7 hari</option><option value="90">90 hari</option><option value="180">180 hari</option><option value="365">365 hari</option><option value="0">Permanen</option><option value="custom">Tanggal kustom…</option></select></div>
    <div class="field hide" id="fDateW"><label for="fDate">Sampai tanggal</label><input id="fDate" type="date"></div>
  </div>
  <div class="grid2">
    <div class="field"><label for="fMod">Nama ModuleScript produk</label><input id="fMod" maxlength="60" placeholder="Otomatis dari nama"></div>
    <div class="field"><label for="fAsset">Asset ID module (opsional)</label><input id="fAsset" inputmode="numeric" maxlength="20" placeholder="Pakai require(assetId)"></div>
  </div>
  <div class="msg" id="fMsg" role="status"></div>
  <div class="actions"><button class="btn" type="button" data-close>Batal</button><button class="btn primary" type="button" id="fSave">Buat lisensi</button></div>`, (root) => {
    const draw = () => { $("cUni").innerHTML = chipsHtml(f.universes, "universes"); $("cPlc").innerHTML = chipsHtml(f.places, "places"); };
    const msg = (t) => { $("fMsg").textContent = t || ""; $("fMsg").className = "msg" + (t ? " err" : ""); };
    const add = (kind) => {
      const inp = $(kind === "universes" ? "fUni" : "fPlc"), ids = inp.value.split(/[\s,;]+/).filter(Boolean);
      const bad = ids.filter((x) => !ID_RE.test(x));
      if (bad.length) return msg("ID harus angka saja (tanpa < >): " + bad[0]);
      ids.forEach((x) => { if (!f[kind].includes(x)) f[kind].push(x); });
      if (f.universes.length > MAX_UNI || f.places.length > MAX_PLACE) { f[kind].length = kind === "universes" ? MAX_UNI : MAX_PLACE; msg("Melebihi batas jumlah ID."); } else msg("");
      inp.value = ""; draw();
    };
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.add) add(b.dataset.add);
      if (b.dataset.rm) { f[b.dataset.rm] = f[b.dataset.rm].filter((x) => x !== b.dataset.v); draw(); }
      if (b.hasAttribute("data-close")) closeModal();
    });
    root.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.target.id === "fUni" || e.target.id === "fPlc")) { e.preventDefault(); add(e.target.id === "fUni" ? "universes" : "places"); } });
    $("fDur").addEventListener("change", () => $("fDateW").classList.toggle("hide", $("fDur").value !== "custom"));
    $("fSave").addEventListener("click", async () => {
      if ($("fUni").value.trim()) add("universes");
      if ($("fPlc").value.trim()) add("places");
      const name = $("fName").value.trim(), buyer = $("fBuyer").value.trim(), mod = $("fMod").value.trim(), asset = $("fAsset").value.trim();
      if (!name) return msg("Isi nama lisensi.");
      if (!f.universes.length) return msg("Isi minimal satu Universe ID.");
      if (mod && !/^[A-Za-z0-9_ .-]{1,60}$/.test(mod)) return msg("Nama ModuleScript: huruf, angka, spasi, _ . - (maks. 60).");
      if (asset && !ID_RE.test(asset)) return msg("Asset ID harus angka saja.");
      const now = Date.now(), dur = $("fDur").value; let exp = 0;
      if (dur === "custom") {
        const d = $("fDate").value; exp = d ? new Date(d + "T23:59:59").getTime() : 0;
        if (!exp || exp <= now) return msg("Pilih tanggal kedaluwarsa di masa depan.");
      } else if (dur !== "0") exp = now + Number(dur) * DAY;
      if (exp > now + MAX_DAYS * DAY) return msg("Maksimal 10 tahun. Pilih Permanen jika tanpa batas.");
      const btn = $("fSave"); btn.disabled = true; msg("");
      try {
        let key = genKey();
        for (let i = 0; i < 5 && (await get(ref(db, "licpub/" + key))).exists(); i++) key = genKey();
        const id = genId(), uni = {}, plc = {};
        f.universes.forEach((x) => (uni[x] = true)); f.places.forEach((x) => (plc[x] = true));
        const rec = { key, name, enabled: true, expiresAt: exp, universes: uni, createdAt: now, updatedAt: now };
        if (buyer) rec.buyer = buyer; if (mod) rec.module = mod; if (asset) rec.assetId = asset; if (f.places.length) rec.places = plc;
        const pub = { name, enabled: true, expiresAt: exp, universes: uni, updatedAt: now }; if (f.places.length) pub.places = plc;
        await update(ref(db), { ["licenses/" + id]: rec, ["licpub/" + key]: pub });
        justCreated = id; closeModal(); location.hash = "#/l/" + id + "/pasang";
      } catch (e) { msg(errMsg(e)); btn.disabled = false; }
    });
  });
}

/* ── Modal: perpanjang ── */
function openExtend(l) {
  const base = l.expiresAt && l.expiresAt > Date.now() ? l.expiresAt : Date.now();
  openModal(`<h2>Perpanjang lisensi</h2>
  <p class="sub" style="margin-bottom:12px">${esc(l.name)} · sekarang: ${esc(expText(l))}</p>
  <div class="field"><label for="xOpt">Tambah masa berlaku</label><select id="xOpt"><option value="7">+ 7 hari</option><option value="30" selected>+ 30 hari</option><option value="90">+ 90 hari</option><option value="365">+ 365 hari</option><option value="custom">Tanggal kustom…</option><option value="0">Jadikan permanen</option></select></div>
  <div class="field hide" id="xDateW"><label for="xDate">Sampai tanggal</label><input id="xDate" type="date"></div>
  <div class="hint" id="xPrev"></div><div class="msg" id="xMsg" role="status"></div>
  <div class="actions"><button class="btn" type="button" data-close>Batal</button><button class="btn primary" type="button" id="xSave">Terapkan</button></div>`, (root) => {
    const calc = () => {
      const v = $("xOpt").value; $("xDateW").classList.toggle("hide", v !== "custom");
      if (v === "0") return 0;
      if (v === "custom") { const d = $("xDate").value; return d ? new Date(d + "T23:59:59").getTime() : NaN; }
      return base + Number(v) * DAY;
    };
    const prev = () => { const e = calc(); $("xPrev").textContent = e === 0 ? "Lisensi tidak akan kedaluwarsa." : isNaN(e) ? "Pilih tanggal." : "Berlaku sampai " + fmtDate(e) + (l.expiresAt && l.expiresAt > Date.now() ? " (dihitung dari masa berlaku sekarang)." : " (dihitung dari hari ini).") ; };
    root.addEventListener("input", prev); root.addEventListener("change", prev); prev();
    root.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
    $("xSave").addEventListener("click", async () => {
      const e = calc();
      if (isNaN(e) || (e !== 0 && e <= Date.now())) { $("xMsg").textContent = "Tanggal harus di masa depan."; $("xMsg").className = "msg err"; return; }
      if (e > Date.now() + MAX_DAYS * DAY) { $("xMsg").textContent = "Maksimal 10 tahun."; $("xMsg").className = "msg err"; return; }
      $("xSave").disabled = true; if (await setExpiry(l, e)) closeModal(); else $("xSave").disabled = false;
    });
  });
}
function openDelete(l) {
  openModal(`<h2>Hapus lisensi?</h2><p style="font-size:14px;color:#c9cad1">“${esc(l.name)}” akan dihapus beserta riwayat verifikasinya. Game yang masih memakai kuncinya langsung gagal verifikasi (KEY_NOT_FOUND). Tindakan ini tidak bisa dibatalkan.</p>
  <div class="actions"><button class="btn" type="button" data-close>Batal</button><button class="btn danger" type="button" id="dDo">Ya, hapus</button></div>`, (root) => {
    root.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
    $("dDo").addEventListener("click", async () => { $("dDo").disabled = true; await removeLicense(l); closeModal(); });
  });
}

/* ── Modal: Test License ── */
function openTest(l) {
  const u0 = keysOf(l.universes)[0] || "", p0 = keysOf(l.places)[0] || "";
  openModal(`<h2>Test License</h2>
  <p class="sub" style="margin-bottom:12px">Memanggil endpoint verifikasi yang sama dengan yang dipakai game, termasuk pengecekan Universe ID ↔ Place ID ke Roblox. Tercatat di Riwayat sebagai “Test panel”.</p>
  <div class="grid2"><div class="field"><label for="tU">Universe ID</label><input id="tU" inputmode="numeric" value="${esc(u0)}"></div>
  <div class="field"><label for="tP">Place ID</label><input id="tP" inputmode="numeric" value="${esc(p0)}" placeholder="Dari print(game.PlaceId)"></div></div>
  <div id="tRes"></div>
  <div class="actions"><button class="btn" type="button" data-close>Tutup</button><button class="btn primary" type="button" id="tGo">Jalankan tes</button></div>`, (root) => {
    root.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
    $("tGo").addEventListener("click", async () => {
      const u = $("tU").value.trim(), p = $("tP").value.trim(), box = $("tRes");
      if (!ID_RE.test(u) || !ID_RE.test(p)) { box.innerHTML = '<div class="result bad"><b>Isi ID dulu</b><div class="m">Universe ID dan Place ID harus angka.</div></div>'; return; }
      $("tGo").disabled = true; box.innerHTML = '<div class="result"><div class="m">Memeriksa…</div></div>';
      const nonce = crypto.randomUUID(), t0 = performance.now();
      try {
        const r = await fetch("/api/license/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: l.key, universeId: u, placeId: p, nonce, test: true, v: 2 }) });
        const j = await r.json(), ms = Math.round(performance.now() - t0);
        if (j.nonce !== nonce) throw new Error("Respons tidak cocok (nonce). Server bukan endpoint lisensi yang benar.");
        if (j.ok) {
          box.innerHTML = '<div class="result ok"><b>✓ Lisensi valid</b><div class="m">' + esc(j.message) + "<br>Universe " + esc(j.universeId) + " · Place " + esc(j.placeId) + "<br>Berlaku: " + (j.expiresAt ? esc(fmtDate(j.expiresAt)) + " (" + j.daysLeft + " hari lagi)" : "permanen") + " · " + ms + " ms</div></div>";
        } else {
          const info = errInfo(j.code);
          box.innerHTML = '<div class="result bad"><b>✕ ' + esc(j.code) + '</b><div class="m">' + esc(j.message) + (info ? "<br><br><b style='display:inline;font-size:13px'>Solusi:</b> " + esc(info[2]) : "") + "<br>" + ms + " ms</div></div>";
        }
      } catch (e) { box.innerHTML = '<div class="result bad"><b>✕ Gagal menghubungi server</b><div class="m">' + esc(e.message || e) + "</div></div>"; }
      $("tGo").disabled = false;
    });
  });
}

/* ── Daftar ── */
function renderList() {
  if ($("app").dataset.v !== "list") {
    $("app").dataset.v = "list";
    $("app").innerHTML = `<h1>License</h1><p class="lead">Buat dan kelola lisensi script. Verifikasi Universe ID + Place ID lewat ModuleScript dan <code>require()</code>, tanpa loadstring.</p>
    <div class="stats" id="stats"></div>
    <div class="bar"><input class="search" id="q" type="search" placeholder="Cari nama, pembeli, atau Universe ID" aria-label="Cari lisensi" value="${esc(search)}">
    <div class="filters" id="filters" role="group" aria-label="Filter status"></div><button class="btn primary" type="button" data-act="create">+ Lisensi baru</button></div>
    <div class="list" id="list"></div>`;
    $("q").addEventListener("input", (e) => { search = e.target.value.trim().toLowerCase(); drawList(); });
  }
  drawList();
}
function drawList() {
  const all = licList(), c = { active: 0, soon: 0, expired: 0, off: 0 };
  all.forEach((l) => c[statusOf(l)]++);
  $("stats").innerHTML = [["Total", all.length], ["Aktif", c.active + c.soon], ["Segera berakhir", c.soon], ["Kedaluwarsa / nonaktif", c.expired + c.off]]
    .map((s) => '<div class="card stat"><b>' + s[1] + "</b><span>" + s[0] + "</span></div>").join("");
  $("filters").innerHTML = [["all", "Semua"], ["active", "Aktif"], ["off", "Nonaktif"], ["expired", "Kedaluwarsa"]]
    .map((f) => '<button class="pill" type="button" data-filter="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '">' + f[1] + "</button>").join("");
  const rows = all.filter((l) => {
    const s = statusOf(l);
    if (filter === "active" && s !== "active" && s !== "soon") return false;
    if (filter === "off" && s !== "off") return false;
    if (filter === "expired" && s !== "expired") return false;
    if (!search) return true;
    return [l.name, l.buyer, l.note, ...Object.keys(l.universes || {})].join(" ").toLowerCase().includes(search);
  });
  $("list").innerHTML = rows.length ? rows.map((l) => {
    const nu = Object.keys(l.universes || {}).length, np = Object.keys(l.places || {}).length;
    return `<article class="card lic" data-id="${esc(l.id)}">
      <div class="lic-top"><div><h3>${esc(l.name)}</h3><div class="sub">${esc(l.buyer || "Tanpa nama pembeli")}</div></div>${chipHtml(l)}</div>
      <div class="keyrow"><code>${esc(maskKey(l.key))}</code><button class="btn sm" type="button" data-act="copykey">Salin key</button></div>
      <dl class="facts"><div><dt>Berlaku sampai</dt><dd>${esc(expText(l))}</dd></div><div><dt>Verifikasi terakhir</dt><dd>${esc(lastText(l))}</dd></div>
      <div class="wide"><dt>Cakupan</dt><dd>${nu} Universe · ${np ? np + " Place" : "semua Place"}</dd></div></dl>
      <div class="actions"><button class="btn sm primary" type="button" data-act="open">Detail &amp; pasang</button>
      <button class="btn sm" type="button" data-act="toggle">${l.enabled ? "Nonaktifkan" : "Aktifkan"}</button>
      <button class="btn sm" type="button" data-act="extend">Perpanjang</button>
      <button class="btn sm danger" type="button" data-act="delete">Hapus</button></div></article>`;
  }).join("") : '<div class="card empty" style="grid-column:1/-1">' + (all.length ? "Tidak ada lisensi yang cocok." : "Belum ada lisensi. Klik “+ Lisensi baru”.") + "</div>";
}

/* ── Detail ── */
const TABS = [["pasang", "Pasang"], ["error", "Error & solusi"], ["riwayat", "Riwayat"], ["kelola", "Kelola"]];
function codeBlock(slot, title) {
  const tg = slot === "A" ? '<button class="btn sm" type="button" data-act="toggleobf" id="obfBtn"></button>' : "";
  return `<div class="code"><div class="code-bar"><span>${esc(title)}</span><span class="actions">${tg}<button class="btn sm primary" type="button" data-copy="${slot}">Copy Code</button></span></div><pre id="code${slot}"></pre></div>`;
}
function tutorialHtml(l) {
  const asset = /^[0-9]{1,20}$/.test(l.assetId || "");
  const mod = l.module || defaultModuleName(l.name);
  return `${justCreated === l.id ? '<div class="banner">✓ Lisensi berhasil dibuat. Ikuti langkah di bawah, lalu tekan <b>Test License</b>.</div>' : ""}
  <div class="note"><b>Tanpa loadstring.</b> Sistem ini memakai ModuleScript dan <code>require()</code>, jadi <code>ServerScriptService.LoadStringEnabled</code> <b>tidak perlu</b> dicentang.</div>
  <ol class="steps">
   <li><h3>Siapkan Universe ID &amp; Place ID</h3><p>Game harus sudah dipublish. Di Studio buka <span class="kbd">View → Command Bar</span>, jalankan <code>print(game.GameId, game.PlaceId)</code>, lihat hasilnya di <span class="kbd">View → Output</span>. Angka pertama Universe ID, kedua Place ID.</p>
     <p>Terdaftar di lisensi ini: <span id="regIds"></span>. Beda? Ubah di tab <b>Kelola</b>.</p></li>
   <li><h3>Buat ModuleScript lisensi</h3><p>Di Explorer, arahkan kursor ke <b>ServerScriptService</b> → klik <b>+</b> → <b>ModuleScript</b>. Ganti nama menjadi <code>BaxdevLicense</code> (persis). Buka, hapus isi bawaan, tempel kode ini. Kode ini sudah di-<b>obfuscate</b> (nama variabel diacak, key dan URL dienkode): jangan diedit dan jangan dirapikan.</p>${codeBlock("A", "ModuleScript · BaxdevLicense")}</li>
   <li><h3>Buat Script loader</h3><p>Di <b>ServerScriptService</b> klik <b>+</b> → <b>Script</b> (bukan LocalScript, bukan ModuleScript). Nama: <code>BaxdevLoader</code>. Hapus isi bawaan, tempel kode ini:</p>${codeBlock("B", "Script · BaxdevLoader")}</li>
   <li><h3>Pasang produk</h3>${asset ? `<p>Produk dimuat dengan <code>require(${esc(l.assetId)})</code>. Pastikan asset itu ModuleScript yang sudah dipublish dan boleh dipakai game ini.</p>` : `<p>Taruh ModuleScript produk yang dijual di <b>ServerScriptService</b> dengan nama <code>${esc(mod)}</code>. Nama lain? Ubah di tab Kelola lalu salin ulang loader.</p>`}
     <div class="tree">ServerScriptService
├─ BaxdevLicense   (ModuleScript)
├─ BaxdevLoader    (Script)
└─ ${esc(asset ? "(produk via Asset ID)" : mod)}${asset ? "" : "   (ModuleScript produk)"}</div></li>
   <li><h3>Aktifkan Allow HTTP Requests</h3><ul><li>Studio: tab <span class="kbd">Home</span> → <b>Game Settings</b> → <b>Security</b>.</li><li>Nyalakan <b>Allow HTTP Requests</b> → <b>Save</b>.</li><li>Pilihan tidak muncul atau abu-abu? <span class="kbd">File → Publish to Roblox</span> dulu, lalu buka lagi.</li></ul></li>
   <li><h3>Test, lalu publish</h3><p>Tekan <button class="btn sm" type="button" data-act="test">Test License</button> dan pastikan hasilnya ✓. Lalu tekan <span class="kbd">Play</span> di Studio: di Output harus muncul <code>[BAXDEV] Lisensi valid</code>. Terakhir <span class="kbd">File → Publish to Roblox</span>.</p>
     <p>Muncul error? Buka tab <b>Error &amp; solusi</b>.</p></li>
  </ol>`;
}
function errorsHtml() {
  const item = (a) => `<div class="err-item"><code>${esc(a[0])}</code><p>${esc(a[1])}</p><p class="fix">→ ${esc(a[2])}</p></div>`;
  return `<h2 style="margin-bottom:10px">Pesan dari server lisensi</h2><div class="err-list">${ERRORS.map(item).join("")}</div>
  <h2 style="margin:22px 0 10px">Masalah umum di Studio</h2><div class="err-list">${MISC.map(item).join("")}</div>
  <div class="note warn" style="margin-top:18px"><b>Batasan jujur:</b> pengecekan berjalan di server game, jadi pembeli yang mengedit atau menghapus loader bisa melewatinya. Lisensi ini mencegah pemakaian lewat modul asli di map lain dan memberi riwayat serta kontrol cabut/perpanjang, bukan menyembunyikan source ModuleScript produk.</div>`;
}
function manageHtml(l) {
  return `<div class="card" style="margin-bottom:14px"><h2 style="margin-bottom:12px">Info lisensi</h2>
   <div class="grid2"><div class="field"><label for="eName">Nama</label><input id="eName" maxlength="80" value="${esc(l.name)}"></div>
   <div class="field"><label for="eBuyer">Pembeli</label><input id="eBuyer" maxlength="80" value="${esc(l.buyer || "")}"></div></div>
   <div class="field"><label for="eNote">Catatan internal</label><input id="eNote" maxlength="200" value="${esc(l.note || "")}"></div>
   <div class="grid2"><div class="field"><label for="eMod">Nama ModuleScript produk</label><input id="eMod" maxlength="60" value="${esc(l.module || "")}" placeholder="${esc(defaultModuleName(l.name))}"></div>
   <div class="field"><label for="eAsset">Asset ID module (opsional)</label><input id="eAsset" inputmode="numeric" maxlength="20" value="${esc(l.assetId || "")}"></div></div>
   <button class="btn primary" type="button" data-act="saveinfo">Simpan</button> <span class="hint">Mengubah nama module / Asset ID mengubah kode loader: salin ulang di tab Pasang.</span><div class="msg" id="eMsg" role="status"></div></div>
   <div class="card" style="margin-bottom:14px"><h2>Universe ID <span class="sub" id="uCount"></span></h2><div class="chips" id="uList"></div>
   <div class="addrow" style="margin-top:12px"><input id="addU" inputmode="numeric" placeholder="Tambah Universe ID (pisahkan koma)" aria-label="Tambah Universe ID"><button class="btn" type="button" data-add="universes">Tambah</button></div></div>
   <div class="card"><h2>Place ID <span class="sub" id="pCount"></span></h2><div class="hint" style="margin:4px 0 0">Kosong = semua place di Universe yang terdaftar boleh. Isi untuk membatasi ke place tertentu.</div><div class="chips" id="pList"></div>
   <div class="addrow" style="margin-top:12px"><input id="addP" inputmode="numeric" placeholder="Tambah Place ID (pisahkan koma)" aria-label="Tambah Place ID"><button class="btn" type="button" data-add="places">Tambah</button></div></div>`;
}
function renderDetail() {
  const l = licList().find((x) => x.id === route.id);
  if (!l) { $("app").dataset.v = ""; $("app").innerHTML = '<button class="back" data-act="back">← Semua lisensi</button><div class="card empty">Lisensi tidak ditemukan atau sudah dihapus.</div>'; return; }
  const sig = "d:" + l.id + ":" + route.tab;
  if ($("app").dataset.v !== sig) {
    $("app").dataset.v = sig;
    ensureLogs(l);
    const body = route.tab === "error" ? errorsHtml() : route.tab === "riwayat" ? '<div class="hist" id="hist"></div><div style="margin-top:14px" id="histAct"></div>' : route.tab === "kelola" ? manageHtml(l) : tutorialHtml(l);
    $("app").innerHTML = `<button class="back" type="button" data-act="back">← Semua lisensi</button>
    <div class="card dhead" id="dHead"></div>
    <div class="tabs" role="tablist">${TABS.map((t) => `<button class="tab" role="tab" type="button" data-tab="${t[0]}" aria-selected="${route.tab === t[0]}">${t[1]}</button>`).join("")}</div>
    <div id="tabBody">${body}</div>`;
  }
  drawDetail(l);
}
function drawDetail(l) {
  const np = Object.keys(l.places || {}).length;
  $("dHead").innerHTML = `<div class="row1"><div><h1 style="font-size:24px">${esc(l.name)}</h1><div class="sub">${esc(l.buyer || "Tanpa nama pembeli")}${l.note ? " · " + esc(l.note) : ""}</div></div>${chipHtml(l)}</div>
   <div class="keyrow"><code id="keyTxt">${esc(maskKey(l.key))}</code><span class="actions"><button class="btn sm" type="button" data-act="showkey" id="showBtn">Tampilkan</button><button class="btn sm" type="button" data-act="copykey">Salin key</button></span></div>
   <dl class="facts"><div><dt>Berlaku sampai</dt><dd>${esc(expText(l))}</dd></div><div><dt>Verifikasi terakhir</dt><dd>${esc(lastText(l))}</dd></div>
   <div><dt>Universe</dt><dd>${Object.keys(l.universes || {}).length} terdaftar</dd></div><div><dt>Place</dt><dd>${np ? np + " diizinkan" : "semua place"}</dd></div></dl>
   <div class="actions"><button class="btn primary" type="button" data-act="test">Test License</button><button class="btn" type="button" data-act="extend">Perpanjang</button>
   <button class="btn" type="button" data-act="toggle">${l.enabled ? "Nonaktifkan" : "Aktifkan"}</button><button class="btn danger" type="button" data-act="delete">Hapus</button></div>`;
  const reg = $("regIds");
  if (reg) reg.innerHTML = "Universe " + (keysOf(l.universes).map((x) => "<code>" + esc(x) + "</code>").join(", ") || "—") + (np ? "; Place " + keysOf(l.places).map((x) => "<code>" + esc(x) + "</code>").join(", ") : "; semua Place");
  if ($("codeA")) {
    codes.A = obf ? buildModuleLuaObf(l, location.origin) : buildModuleLua(l, location.origin); codes.B = buildLoaderLua(l, location.origin);
    $("codeA").innerHTML = hl(codes.A);
    const ob = $("obfBtn"); if (ob) ob.textContent = obf ? "Obfuscated ✓ (lihat terbaca)" : "Terbaca (obfuscate)"; $("codeB").innerHTML = hl(codes.B);
  }
  if ($("uList")) {
    $("uList").innerHTML = chipsHtml(keysOf(l.universes), "universes"); $("uCount").textContent = "· " + Object.keys(l.universes || {}).length + "/" + MAX_UNI;
    $("pList").innerHTML = chipsHtml(keysOf(l.places), "places") || '<span class="hint">Semua place diizinkan.</span>'; $("pCount").textContent = "· " + np + "/" + MAX_PLACE;
  }
  drawHist();
}
function ensureLogs(l) {
  if (logKey === l.key) return;
  if (logUnsub) logUnsub();
  logKey = l.key; logMap = {};
  logUnsub = onValue(query(ref(db, "liclog/" + l.key), limitToLast(100)), (s) => { logMap = s.val() || {}; drawHist(); }, () => {});
}
const SRC = { roblox: "Server Roblox", claimed: "Klaim modul", panel: "Test panel" };
function drawHist() {
  const box = $("hist"); if (!box) return;
  const rows = Object.values(logMap).sort((a, b) => b.at - a.at);
  box.innerHTML = rows.length ? rows.map((r) => {
    const info = errInfo(r.code);
    return `<div class="h-row ${r.ok ? "ok" : "bad"}"><span class="st" aria-hidden="true">${r.ok ? "✓" : "✕"}</span><div><b>${r.ok ? "Lisensi valid" : esc(r.code)}</b>${!r.ok && info ? " · " + esc(info[1]) : ""}</div>
    <div class="m">${esc(fmtTime(r.at))} · ${esc(SRC[r.src] || r.src)}${r.universe ? " · U " + esc(r.universe) : ""}${r.place ? " · P " + esc(r.place) : ""}${r.cc ? " · " + esc(r.cc) : ""}${r.studio ? " · Studio" : ""}${r.detail ? "<br>" + esc(r.detail) : ""}</div></div>`;
  }).join("") : '<div class="card empty">Belum ada verifikasi. Jalankan Test License atau mainkan game.</div>';
  if ($("histAct")) $("histAct").innerHTML = rows.length ? '<button class="btn sm danger" type="button" data-act="clearlog">Hapus riwayat</button> <span class="hint">Menampilkan 100 terbaru.</span>' : "";
}

/* ── Router & event ── */
function parseHash() {
  const m = location.hash.match(/^#\/l\/([A-Za-z0-9]+)(?:\/(pasang|error|riwayat|kelola))?$/);
  route = m ? { view: "detail", id: m[1], tab: m[2] || "pasang" } : { view: "list" };
}
function render() {
  if (!db || $("app").classList.contains("hide")) return;
  if (route.view === "detail") renderDetail(); else renderList();
}
window.addEventListener("hashchange", () => { parseHash(); if (route.view === "list") { if (logUnsub) { logUnsub(); logUnsub = null; logKey = ""; } justCreated = ""; } window.scrollTo(0, 0); render(); });
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act],[data-filter],[data-tab],[data-copy],[data-add],[data-rm]"); if (!el || el.closest("#ov")) return;
  const card = el.closest("[data-id]"), l = licMap[route.view === "detail" ? route.id : card && card.dataset.id];
  const lic = l ? Object.assign({ id: route.view === "detail" ? route.id : card.dataset.id }, l) : null;
  if (el.dataset.filter) { filter = el.dataset.filter; return drawList(); }
  if (el.dataset.tab) { location.hash = "#/l/" + route.id + "/" + el.dataset.tab; return; }
  if (el.dataset.copy) return copy(codes[el.dataset.copy], "Kode");
  if (el.dataset.add && lic) { const inp = $(el.dataset.add === "universes" ? "addU" : "addP"); if (await addIds(lic, el.dataset.add, inp.value)) inp.value = ""; return; }
  if (el.dataset.rm && lic) return removeId(lic, el.dataset.rm, el.dataset.v);
  switch (el.dataset.act) {
    case "create": return openCreate();
    case "back": location.hash = "#/"; return;
    case "open": if (lic) location.hash = "#/l/" + lic.id + "/pasang"; return;
    case "copykey": if (lic) copy(lic.key, "Key"); return;
    case "showkey": { const t = $("keyTxt"), b = $("showBtn"), shown = b.dataset.on === "1"; t.textContent = shown ? maskKey(lic.key) : lic.key; b.dataset.on = shown ? "" : "1"; b.textContent = shown ? "Tampilkan" : "Sembunyikan"; return; }
    case "toggle": if (lic) setEnabled(lic, !lic.enabled); return;
    case "extend": if (lic) openExtend(lic); return;
    case "delete": if (lic) openDelete(lic); return;
    case "test": if (lic) openTest(lic); return;
    case "toggleobf": obf = !obf; if (lic) drawDetail(lic); toast(obf ? "Mode obfuscated: ini yang dibagikan ke pembeli" : "Mode terbaca: hanya untuk admin/dukungan", !obf); return;
    case "clearlog": if (lic && confirm("Hapus semua riwayat verifikasi lisensi ini?")) { try { await update(ref(db), { ["liclog/" + lic.key]: null, ["licstat/" + lic.key]: null }); toast("Riwayat dihapus"); } catch (er) { toast(errMsg(er), true); } } return;
    case "saveinfo": {
      if (!lic) return;
      const msg = $("eMsg"), name = $("eName").value.trim(), mod = $("eMod").value.trim(), asset = $("eAsset").value.trim();
      const bad = (t) => { msg.textContent = t; msg.className = "msg err"; };
      if (!name) return bad("Nama tidak boleh kosong.");
      if (mod && !/^[A-Za-z0-9_ .-]{1,60}$/.test(mod)) return bad("Nama ModuleScript: huruf, angka, spasi, _ . - (maks. 60).");
      if (asset && !ID_RE.test(asset)) return bad("Asset ID harus angka saja.");
      const t = Date.now(), v = (x) => (x ? x : null), p = "licenses/" + lic.id + "/";
      try {
        await update(ref(db), { [p + "name"]: name, [p + "buyer"]: v($("eBuyer").value.trim()), [p + "note"]: v($("eNote").value.trim()), [p + "module"]: v(mod), [p + "assetId"]: v(asset), [p + "updatedAt"]: t, ["licpub/" + lic.key + "/name"]: name, ["licpub/" + lic.key + "/updatedAt"]: t });
        msg.textContent = "Tersimpan."; msg.className = "msg ok";
      } catch (er) { bad(errMsg(er)); }
      return;
    }
  }
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.target.id === "addU" || e.target.id === "addP")) { e.preventDefault(); const k = e.target.id === "addU" ? "universes" : "places"; document.querySelector('[data-add="' + k + '"]').click(); } });

/* ── Auth ── */
function showLogin(msg, bad) {
  unsubs.forEach((f) => f()); unsubs = []; if (logUnsub) { logUnsub(); logUnsub = null; logKey = ""; }
  $("loading").classList.add("hide"); $("app").classList.add("hide"); $("app").dataset.v = ""; $("loginView").classList.remove("hide"); $("logoutBtn").classList.add("hide");
  $("loginMsg").textContent = msg || ""; $("loginMsg").className = "msg" + (bad ? " err" : "");
}
let entering = false;
async function enter(user) {
  if (entering) return; entering = true;
  try {
    try { await get(ref(db, "isAdmin")); }
    catch (e) {
      const denied = e && (e.code === "PERMISSION_DENIED" || /permission/i.test(String(e.message)));
      showLogin(denied ? "Akun ini bukan owner." : "Database tidak merespons. Cek jaringan lalu muat ulang.", true);
      if (denied) await signOut(auth); return;
    }
    $("who").textContent = user.email || ""; $("loginView").classList.add("hide"); $("loading").classList.add("hide"); $("app").classList.remove("hide"); $("logoutBtn").classList.remove("hide");
    unsubs.push(onValue(ref(db, "licenses"), (s) => { licMap = s.val() || {}; render(); }, (e) => toast("Gagal membaca lisensi: " + errMsg(e), true)));
    unsubs.push(onValue(ref(db, "licstat"), (s) => { statMap = s.val() || {}; render(); }, () => {}));
    parseHash(); render();
  } finally { entering = false; }
}
if (!configured) { showLogin("Firebase belum dikonfigurasi (firebase-config.js).", true); $("loginBtn").disabled = true; }
else {
  onAuthStateChanged(auth, (u) => { if (u && u.email) enter(u); else showLogin(); });
  $("loginBtn").addEventListener("click", async () => {
    const em = $("email").value.trim(), pw = $("pw").value;
    if (!em || !pw) { $("loginMsg").textContent = "Isi email dan password."; $("loginMsg").className = "msg err"; return; }
    $("loginBtn").disabled = true; $("loginMsg").textContent = "Memeriksa…"; $("loginMsg").className = "msg";
    try { await signInWithEmailAndPassword(auth, em, pw); }
    catch (e) { $("loginMsg").textContent = e.code === "auth/too-many-requests" ? "Terlalu banyak percobaan. Coba lagi nanti." : "Email atau password salah."; $("loginMsg").className = "msg err"; }
    $("loginBtn").disabled = false;
  });
  $("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") $("loginBtn").click(); });
  $("logoutBtn").addEventListener("click", () => signOut(auth));
}
