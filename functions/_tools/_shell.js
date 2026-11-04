// Kerangka bersama tool VIP Plus baru (Seamless Texture, Spritesheet): gaya liquid glass, tema dari halaman induk,
// tinggi otomatis, helper decode/download, dan permintaan publish ke halaman induk.
// Disisipkan ke template tool lewat ${SHELL_CSS} / ${SHELL_JS}. Isi di bawah tidak boleh memuat backtick, "${" atau backslash.
export const SHELL_CSS = `
:root{--bg:#050505;--text:#fff;--muted:rgba(255,255,255,.64);--faint:rgba(255,255,255,.4);--g1:rgba(255,255,255,.12);--g2:rgba(255,255,255,.035);--line:rgba(255,255,255,.17);--rim1:rgba(255,255,255,.7);--rim2:rgba(255,255,255,.26);--shadow:0 24px 60px rgba(0,0,0,.55);--inner:inset 0 1px 0 rgba(255,255,255,.28),inset 0 0 24px rgba(255,255,255,.035);--btn:#fff;--btn-ink:#000;--hl:rgba(255,255,255,.14);--blob:rgba(255,255,255,.17);--field:rgba(255,255,255,.07);
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media(prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#ececee;--text:#0a0a0a;--muted:rgba(0,0,0,.6);--faint:rgba(0,0,0,.4);--g1:rgba(255,255,255,.72);--g2:rgba(255,255,255,.36);--line:rgba(255,255,255,.9);--rim1:#fff;--rim2:rgba(255,255,255,.7);--shadow:0 20px 50px rgba(0,0,0,.14);--inner:inset 0 1px 0 #fff,inset 0 0 20px rgba(255,255,255,.4);--btn:#0a0a0a;--btn-ink:#fff;--hl:rgba(255,255,255,.95);--blob:rgba(0,0,0,.13);--field:rgba(255,255,255,.6);}}
:root[data-theme="light"]{--bg:#ececee;--text:#0a0a0a;--muted:rgba(0,0,0,.6);--faint:rgba(0,0,0,.4);--g1:rgba(255,255,255,.72);--g2:rgba(255,255,255,.36);--line:rgba(255,255,255,.9);--rim1:#fff;--rim2:rgba(255,255,255,.7);--shadow:0 20px 50px rgba(0,0,0,.14);--inner:inset 0 1px 0 #fff,inset 0 0 20px rgba(255,255,255,.4);--btn:#0a0a0a;--btn-ink:#fff;--hl:rgba(255,255,255,.95);--blob:rgba(0,0,0,.13);--field:rgba(255,255,255,.6);}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
html{background:transparent}
body{margin:0;background:transparent;color:var(--text);font:14px/1.5 var(--sans);
 padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
body.no-scroll{overflow:hidden}
html.autoh,html.autoh body{overflow:hidden}
main{width:100%;max-width:880px;margin:0 auto;display:grid;gap:16px}
.glass{position:relative;background:radial-gradient(260px circle at var(--mx,50%) var(--my,-30%),var(--hl),transparent 62%),linear-gradient(135deg,var(--g1),var(--g2));
 -webkit-backdrop-filter:blur(28px) saturate(170%);backdrop-filter:blur(28px) saturate(170%);border:1px solid var(--line);box-shadow:var(--inner),var(--shadow)}
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;
 background:linear-gradient(145deg,var(--rim1),transparent 32%,transparent 68%,var(--rim2));
 -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.card{padding:clamp(16px,3vw,24px);border-radius:28px}
.card[hidden]{display:none}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:12px;min-width:0}
.logo,.icon-btn{display:grid;flex:none;width:46px;height:46px;place-items:center;border-radius:16px;color:var(--text)}
.icon-btn{cursor:pointer;border-radius:50%}.icon-btn:hover{transform:translateY(-1px)}
.logo svg,.icon-btn svg{width:22px;height:22px}
.kicker{color:var(--faint);font:10px var(--mono);letter-spacing:.2em}
h1{margin:2px 0 0;font-size:clamp(22px,5vw,32px);letter-spacing:-.02em;line-height:1.1}
h2{margin:0 0 6px;font-size:15px;font-weight:650}
.sub{max-width:660px;margin:0;color:var(--muted);font-size:13px}
.help{margin:0;color:var(--muted);font-size:12px;line-height:1.65}
.drop{position:relative;display:grid;min-height:150px;place-items:center;margin-top:14px;padding:22px;text-align:center;border:1px dashed var(--faint);border-radius:22px;background:var(--field);cursor:pointer;transition:border-color .2s,background .2s}
.drop:hover,.drop.drag-over{border-color:var(--text)}
.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.drop-icon{display:grid;width:46px;height:46px;place-items:center;margin:0 auto 10px;border:1px solid var(--line);border-radius:50%}
.drop-icon svg{width:20px;height:20px}
.drop-title{display:block;overflow-wrap:anywhere;font-size:14px;font-weight:620}
.drop-meta{display:block;margin-top:5px;color:var(--muted);font-size:11px;overflow-wrap:anywhere}
.controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px}
.controls[hidden],.progress[hidden]{display:none!important}
.select-wrap{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:12px}
.select-wrap label{white-space:nowrap}
select{min-height:42px;padding:0 30px 0 14px;border:1px solid var(--line);border-radius:999px;background:var(--field);color:var(--text);font:inherit;cursor:pointer}
select:focus-visible,.btn:focus-visible,.mini:focus-visible,.icon-btn:focus-visible,.seg button:focus-visible,.dock button:focus-visible,#view-canvas:focus-visible{outline:2px solid var(--text);outline-offset:2px}
.btn{min-height:44px;padding:0 22px;border:0;border-radius:999px;background:var(--btn);color:var(--btn-ink);font:inherit;font-weight:650;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 6px 20px rgba(0,0,0,.25);transition:transform .15s,opacity .15s}
.btn:hover:not(:disabled){transform:translateY(-1px)}.btn:disabled{opacity:.35;cursor:not-allowed}
.progress{height:4px;overflow:hidden;margin-top:12px;border-radius:999px;background:var(--line)}
.progress>i{display:block;width:0;height:100%;border-radius:inherit;background:var(--text);transition:width .2s}
.status{min-height:20px;margin-top:12px;color:var(--muted);font-size:12px;line-height:1.55}
.status.error{color:var(--text);font-weight:600}.status.error::before{content:"✕ "}.status.success{color:var(--text)}.status.success::before{content:"✓ "}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.card-head h2{margin:0}
.results{display:none}.results.visible{display:block}
.id-list{display:grid;gap:6px;margin-top:10px}
.id-row{display:grid;grid-template-columns:72px minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px 12px;border:1px solid var(--line);border-radius:14px;background:var(--field)}
.id-row b{color:var(--muted);font-size:11px}
.id-row code{min-width:0;overflow:hidden;font:11px var(--mono);text-overflow:ellipsis;white-space:nowrap}
.mini{padding:6px 12px;border:1px solid var(--line);border-radius:999px;background:var(--field);color:var(--text);font:inherit;font-size:11px;cursor:pointer}
.code-wrap{margin-top:14px}
.code-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;font-size:12px;font-weight:620}
.code{display:block;width:100%;min-height:220px;resize:vertical;padding:14px;border:1px solid var(--line);border-radius:18px;background:rgba(0,0,0,.62);color:#f2f2f2;font:11px/1.6 var(--mono);white-space:pre;overflow:auto}
#toast{position:absolute;left:50%;top:calc(var(--vt,0px) + var(--vh,100vh) - 18px);z-index:200;display:grid;gap:8px;transform:translate(-50%,-100%);pointer-events:none}
.toast-item{padding:10px 18px;border-radius:999px;font-size:12px;transition:opacity .3s,transform .3s;background:rgba(20,20,20,.7);color:#fff;border:1px solid rgba(255,255,255,.2);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}
@media(max-width:420px){.controls>.btn{width:100%}.select-wrap{width:100%;justify-content:space-between}.id-row{grid-template-columns:1fr auto}.id-row b{grid-column:1/-1}.id-row code{grid-column:1}.id-row .mini{grid-column:2;grid-row:2}}
`;

export const SHELL_JS = `
const $ = id => document.getElementById(id);
const NL = String.fromCharCode(10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast-item ' + (type || 'info');
  el.textContent = msg;
  $('toast').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 300); }, 2600);
}
function setStatus(message, type) {
  const node = $('status');
  node.textContent = message;
  node.className = 'status' + (type ? ' ' + type : '');
}
function showProgress(percent) {
  $('progress').hidden = false;
  $('progress-fill').style.width = Math.max(0, Math.min(100, percent)) + '%';
}
function hideProgress() {
  $('progress').hidden = true;
  $('progress-fill').style.width = '0%';
}
async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const input = document.createElement('textarea');
      input.value = text; input.style.cssText = 'position:fixed;opacity:0';
      document.body.append(input); input.select(); document.execCommand('copy'); input.remove();
    }
    toast(successMessage, 'success');
  } catch (e) { toast('Gagal menyalin. Pilih teks lalu salin manual.', 'error'); }
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Gagal membuat PNG.')), 'image/png'));
}
// Decode gambar dengan batas aman. maxSide > 0: sisi terpanjang diperkecil ke angka itu.
async function decodeImage(file, maxSide) {
  if (!file || !/^image[/](png|jpeg|webp)$/.test(file.type)) throw new Error('Format harus PNG, JPG, atau WebP.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 25 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch (e) { throw new Error('Gambar tidak bisa dibaca.'); }
  if (bitmap.width * bitmap.height > 64e6) { bitmap.close(); throw new Error('Resolusi gambar terlalu besar (maksimal 64 megapiksel).'); }
  if (maxSide > 0 && Math.max(bitmap.width, bitmap.height) > maxSide) {
    const k = maxSide / Math.max(bitmap.width, bitmap.height);
    const small = await createImageBitmap(bitmap, {resizeWidth: Math.max(1, Math.round(bitmap.width * k)), resizeHeight: Math.max(1, Math.round(bitmap.height * k)), resizeQuality: 'high'});
    bitmap.close();
    return small;
  }
  return bitmap;
}
function smoothstep(t) { return t * t * (3 - 2 * t); }

// Kirim file ke halaman induk (BAXDEV) untuk diunggah ke Roblox sebagai Decal; API key tidak pernah masuk ke tool ini.
// files = {Kunci: File}. Mengembalikan {Kunci: {assetId} | {error}}.
function requestPublish(files, name, onState) {
  return new Promise((resolve, reject) => {
    if (window.parent === window) { reject(new Error('Publish hanya tersedia di dalam BAXDEV.')); return; }
    const id = 'pub-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const finish = (error, results) => {
      clearTimeout(timer); removeEventListener('message', onMessage);
      if (error) reject(error); else resolve(results);
    };
    const timer = setTimeout(() => finish(new Error('Publish melewati batas waktu. Cek Library BAXDEV untuk hasilnya.')), 6 * 60 * 1000);
    function onMessage(e) {
      const d = e.data;
      if (e.source !== window.parent || !d || d.bx !== 'publish' || d.id !== id) return;
      if (d.type === 'state') onState(d.face, String(d.text || ''));
      else if (d.type === 'done') finish(null, d.results || {});
      else if (d.type === 'error') finish(new Error(d.message || 'Publish gagal.'));
    }
    addEventListener('message', onMessage);
    window.parent.postMessage({bx: 'publish', type: 'request', id, files, name}, '*');
  });
}

// Lua: ambil ID gambar dari aset Decal supaya Image/Texture pasti tampil (aset Decal punya ID gambar sendiri).
function luaResolveFunction() {
  return [
    'local InsertService = game:GetService("InsertService")',
    '',
    '-- Aset yang diupload sebagai Decal punya ID gambar sendiri. Ambil ID gambarnya supaya pasti tampil.',
    '-- Kalau gagal diambil, pakai ID apa adanya.',
    'local function resolve(assetId)',
    '    local fallback = "rbxassetid://" .. assetId',
    '    local ok, texture = pcall(function()',
    '        local model = InsertService:LoadAsset(tonumber(assetId))',
    '        local decal = model:FindFirstChildWhichIsA("Decal", true)',
    '        local result = decal and decal.Texture or ""',
    '        model:Destroy()',
    '        return result',
    '    end)',
    '    if ok and type(texture) == "string" and texture ~= "" then',
    '        return texture',
    '    end',
    '    return fallback',
    'end'
  ].join(NL);
}

// ── Tema dari halaman induk: warna dasar + palet 3 warna (terang, sedang, gelap) ──
function applyBxTheme(data) {
  if (!data || !/^#[0-9a-fA-F]{6}$/.test(data.bg) || !Array.isArray(data.p) || data.p.length !== 3) return;
  const p = data.p.map(color => Array.isArray(color) && color.length === 3 ? color.map(v => Math.max(0, Math.min(255, Math.round(Number(v) || 0)))) : null);
  if (p.some(color => !color)) return;
  const rgb = color => 'rgb(' + color.join(',') + ')', rgba = (color, alpha) => 'rgba(' + color.join(',') + ',' + alpha + ')';
  const set = (name, value) => document.documentElement.style.setProperty(name, value);
  const light = p[0];
  set('--bg', data.bg); set('--text', rgb(light)); set('--muted', rgba(light, .64)); set('--faint', rgba(light, .4));
  set('--g1', rgba(light, .12)); set('--g2', rgba(light, .035)); set('--line', rgba(light, .17));
  set('--rim1', rgba(light, .7)); set('--rim2', rgba(light, .26)); set('--hl', rgba(light, .14)); set('--field', rgba(light, .07));
  set('--inner', 'inset 0 1px 0 ' + rgba(light, .28) + ',inset 0 0 24px ' + rgba(light, .035));
  set('--btn', rgb(light)); set('--btn-ink', data.bg); set('--blob', rgba(p[1], .26));
  if (data.scheme === 'light' || data.scheme === 'dark') set('color-scheme', data.scheme);
}
addEventListener('message', e => {
  if (e.source === window.parent && e.data && e.data.bx === 'theme') applyBxTheme(e.data);
});

// ── Satu scroll: tinggi iframe mengikuti isi halaman, jadi hanya halaman BAXDEV yang di-scroll ──
(function () {
  if (window.parent === window) return;
  document.documentElement.classList.add('autoh');
  let last = 0;
  const send = () => {
    const h = Math.ceil(document.body.getBoundingClientRect().height);
    if (h && h !== last) { last = h; window.parent.postMessage({bx: 'height', h}, '*'); }
  };
  new ResizeObserver(send).observe(document.body);
  addEventListener('load', send); send();
  // Bagian iframe yang sedang terlihat di layar (dikirim induk) dipakai untuk posisi toast.
  addEventListener('message', e => {
    const d = e.data;
    if (e.source !== window.parent || !d || d.bx !== 'view' || !Number.isFinite(d.top) || !Number.isFinite(d.h)) return;
    document.documentElement.style.setProperty('--vt', Math.round(d.top) + 'px');
    document.documentElement.style.setProperty('--vh', Math.round(d.h) + 'px');
  });
})();

// ── Tema hitam / putih ──
const themeRoot = document.documentElement;
try { const t = localStorage.getItem('bx-tool-theme'); if (t) themeRoot.dataset.theme = t; } catch (e) {}
$('theme-btn').addEventListener('click', () => {
  const isLight = (themeRoot.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'light';
  themeRoot.dataset.theme = isLight ? 'dark' : 'light';
  try { localStorage.setItem('bx-tool-theme', themeRoot.dataset.theme); } catch (e) {}
});
// Kilau liquid glass mengikuti pointer
document.addEventListener('pointermove', e => {
  const g = e.target.closest && e.target.closest('.glass'); if (!g) return; const r = g.getBoundingClientRect();
  g.style.setProperty('--mx', (e.clientX - r.left) + 'px'); g.style.setProperty('--my', (e.clientY - r.top) + 'px');
}, {passive: true});
`;
