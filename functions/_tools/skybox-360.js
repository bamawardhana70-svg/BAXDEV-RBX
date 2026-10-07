// Sumber tool VIP Plus. Disajikan lewat /api/tool setelah cek VIP Plus; jangan taruh sebagai file statis.
// Edit: di dalam template literal ini tanda \, ` dan ${ harus di-escape dengan \.
export default `<!DOCTYPE html>
<html lang="id" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src https://cdn.jsdelivr.net blob: data:; font-src data:; base-uri 'none'; form-action 'none'">
<meta name="color-scheme" content="dark light">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>SkyBox 360°</title>
<style>
:root{--bg:#050505;--text:#fff;--muted:rgba(255,255,255,.64);--faint:rgba(255,255,255,.4);--g1:rgba(255,255,255,.12);--g2:rgba(255,255,255,.035);--line:rgba(255,255,255,.17);--rim1:rgba(255,255,255,.7);--rim2:rgba(255,255,255,.26);--shadow:0 24px 60px rgba(0,0,0,.55);--inner:inset 0 1px 0 rgba(255,255,255,.28),inset 0 0 24px rgba(255,255,255,.035);--btn:#fff;--btn-ink:#000;--hl:rgba(255,255,255,.14);--blob:rgba(255,255,255,.17);--field:rgba(255,255,255,.07);color-scheme:dark;
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media(prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#ececee;--text:#0a0a0a;--muted:rgba(0,0,0,.6);--faint:rgba(0,0,0,.4);--g1:rgba(255,255,255,.72);--g2:rgba(255,255,255,.36);--line:rgba(255,255,255,.9);--rim1:#fff;--rim2:rgba(255,255,255,.7);--shadow:0 20px 50px rgba(0,0,0,.14);--inner:inset 0 1px 0 #fff,inset 0 0 20px rgba(255,255,255,.4);--btn:#0a0a0a;--btn-ink:#fff;--hl:rgba(255,255,255,.95);--blob:rgba(0,0,0,.13);--field:rgba(255,255,255,.6);color-scheme:light}}
:root[data-theme="light"]{--bg:#ececee;--text:#0a0a0a;--muted:rgba(0,0,0,.6);--faint:rgba(0,0,0,.4);--g1:rgba(255,255,255,.72);--g2:rgba(255,255,255,.36);--line:rgba(255,255,255,.9);--rim1:#fff;--rim2:rgba(255,255,255,.7);--shadow:0 20px 50px rgba(0,0,0,.14);--inner:inset 0 1px 0 #fff,inset 0 0 20px rgba(255,255,255,.4);--btn:#0a0a0a;--btn-ink:#fff;--hl:rgba(255,255,255,.95);--blob:rgba(0,0,0,.13);--field:rgba(255,255,255,.6);color-scheme:light}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100svh;background:var(--bg);color:var(--text);font:14px/1.5 var(--sans);
 padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
body.no-scroll{overflow:hidden}
.bg{position:fixed;inset:0;z-index:-1;overflow:hidden;background:var(--bg)}
.bg i{position:absolute;width:55vmax;height:55vmax;border-radius:50%;background:radial-gradient(circle,var(--blob),transparent 65%);animation:drift 22s ease-in-out infinite alternate}
.bg i:nth-child(1){top:-20vmax;left:-15vmax}.bg i:nth-child(2){right:-20vmax;top:25vh;animation-delay:-8s}.bg i:nth-child(3){bottom:-25vmax;left:15vw;animation-delay:-14s}
@keyframes drift{to{transform:translate(8vmax,6vmax) scale(1.15)}}
@media(prefers-reduced-motion:reduce){.bg i{animation:none}}
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
select{min-height:42px;padding:0 30px 0 14px;border:1px solid var(--line);border-radius:999px;background:var(--field);color:var(--text);font:inherit;cursor:pointer}
select:focus-visible,.btn:focus-visible,.mini:focus-visible,.icon-btn:focus-visible,.seg button:focus-visible,.dock button:focus-visible,#view-canvas:focus-visible{outline:2px solid var(--text);outline-offset:2px}
.btn{min-height:44px;padding:0 22px;border:0;border-radius:999px;background:var(--btn);color:var(--btn-ink);font:inherit;font-weight:650;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 6px 20px rgba(0,0,0,.25);transition:transform .15s,opacity .15s}
.btn:hover:not(:disabled){transform:translateY(-1px)}.btn:disabled{opacity:.35;cursor:not-allowed}
.progress{height:4px;overflow:hidden;margin-top:12px;border-radius:999px;background:var(--line)}
.progress>i{display:block;width:0;height:100%;border-radius:inherit;background:var(--text);transition:width .2s}
.status{min-height:20px;margin-top:12px;color:var(--muted);font-size:12px;line-height:1.55}
.status.error{color:var(--text);font-weight:600}.status.error::before{content:"✕ "}.status.success{color:var(--text)}.status.success::before{content:"✓ "}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.card-head h2{margin:0}
.seg{display:inline-flex;padding:3px;border:1px solid var(--line);border-radius:999px;background:var(--field)}
.seg button{min-height:34px;padding:0 14px;border:0;border-radius:999px;background:transparent;color:var(--muted);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--btn);color:var(--btn-ink)}.seg button:disabled{opacity:.35;cursor:not-allowed}
.viewer{position:relative;overflow:hidden;aspect-ratio:16/10;min-height:260px;border-radius:22px;background:#000;border:1px solid var(--line)}
.viewer.is-full{position:fixed;inset:0;z-index:100;aspect-ratio:auto;border-radius:0;border:0}
#view-canvas{position:absolute;inset:0;display:block;width:100%;height:100%;cursor:grab;touch-action:none;outline-offset:-3px}
#view-canvas:active{cursor:grabbing}
.hud{position:absolute;display:flex;gap:6px;pointer-events:none;color:#fff;font-size:11px}
.hud-top{top:12px;left:12px}.viewer.is-full .hud-top{top:max(12px,env(safe-area-inset-top))}
.chip,.dock{background:rgba(20,20,20,.42);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}
.chip{padding:5px 11px;border-radius:999px;font:11px var(--mono)}
.hint{font-family:var(--sans);position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:8px 14px;border-radius:999px;font-size:12px;color:#fff;text-align:center;pointer-events:none;transition:opacity .5s;max-width:90%}
.viewer.seen .hint{opacity:0}
.dock{position:absolute;left:50%;bottom:12px;display:flex;gap:2px;padding:5px;border-radius:999px;transform:translateX(-50%)}
.viewer.is-full .dock{bottom:max(14px,env(safe-area-inset-bottom))}
.dock button{display:grid;width:40px;height:40px;place-items:center;border:0;border-radius:50%;background:transparent;color:#fff;cursor:pointer}
.dock button:hover,.dock button[aria-pressed="true"]{background:rgba(255,255,255,.22)}
.dock svg{width:18px;height:18px}
.gl-fail{position:absolute;inset:0;display:grid;place-items:center;padding:20px;color:#fff;text-align:center;font-size:13px}
.faces-wrap{margin-top:18px}.faces-wrap h2{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px}.face{cursor:pointer;transition:transform .15s,border-color .15s}.face:hover{transform:translateY(-2px)}.face.active{border-color:var(--text);box-shadow:0 0 0 1px var(--text)}
.faces{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
.face{min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--field)}
.face img{display:block;width:100%;aspect-ratio:1;object-fit:cover}
.face-info{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px}
.face-info b{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.face-info a{flex:none;color:var(--muted);font-size:11px;text-decoration:none}.face-info a:hover{color:var(--text)}
.results{display:none}.results.visible{display:block}
.id-list{display:grid;gap:6px;margin-top:10px}
.id-row{display:grid;grid-template-columns:72px minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px 12px;border:1px solid var(--line);border-radius:14px;background:var(--field)}
.id-row b{color:var(--muted);font-size:11px}
.id-row code{min-width:0;overflow:hidden;font:11px var(--mono);text-overflow:ellipsis;white-space:nowrap}
.mini{padding:6px 12px;border:1px solid var(--line);border-radius:999px;background:var(--field);color:var(--text);font:inherit;font-size:11px;cursor:pointer}
.code-wrap{margin-top:14px}
.code-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;font-size:12px;font-weight:620}
.code{display:block;width:100%;min-height:220px;resize:vertical;padding:14px;border:1px solid var(--line);border-radius:18px;background:rgba(0,0,0,.62);color:#f2f2f2;font:11px/1.6 var(--mono);white-space:pre;overflow:auto}
#toast{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));z-index:200;display:grid;gap:8px;transform:translateX(-50%);pointer-events:none}
.toast-item{padding:10px 18px;border-radius:999px;font-size:12px;transition:opacity .3s,transform .3s;background:rgba(20,20,20,.7);color:#fff;border:1px solid rgba(255,255,255,.2);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}
@media(max-width:720px){.faces{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.face-info{padding:7px 9px}.face-info b{font-size:10px}.id-row{grid-template-columns:56px minmax(0,1fr) auto}.viewer{aspect-ratio:4/3}}
@media(max-width:720px) and (orientation:landscape){.faces{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:420px){.controls>.btn{width:100%}.select-wrap{width:100%;justify-content:space-between}.id-row{grid-template-columns:1fr auto}.id-row b{grid-column:1/-1}.id-row code{grid-column:1}.id-row .mini{grid-column:2;grid-row:2}}
</style>
</head>
<body>
<div class="bg" aria-hidden="true"><i></i><i></i><i></i></div>
<main>
  <header class="top">
    <div class="brand">
      <span class="logo glass"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5a4.5 4.5 0 0 1-.9-8.9A6 6 0 0 1 17.7 8.8 4.9 4.9 0 0 1 17 18.5H7Z"/></svg></span>
      <div><div class="kicker">ROBLOX TOOL / ENVIRONMENT</div><h1>SkyBox 360°</h1></div>
    </div>
    <button type="button" class="icon-btn glass" id="theme-btn" aria-label="Ganti tema hitam / putih"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg></button>
  </header>
  <p class="sub">Ubah satu panorama 360° menjadi enam tekstur Skybox, lihat hasilnya langsung dalam lingkungan 360°, publish ke Roblox, lalu salin script siap jalan di Command Bar Studio.</p>

  <section class="glass card" aria-labelledby="panel-title">
    <h2 id="panel-title">1. Pilih panorama</h2>
    <p class="help">Gunakan panorama equirectangular dengan rasio 2:1. Format input PNG, JPG, atau WebP. Hasilnya enam PNG persegi untuk Front, Back, Left, Right, Top, dan Bottom.</p>
    <label class="drop" id="drop-zone">
      <input type="file" id="source-file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp">
      <span>
        <span class="drop-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span>
        <span class="drop-title" id="file-label">Pilih gambar panorama 360°</span>
        <span class="drop-meta" id="file-meta">Rekomendasi sumber 2:1, misalnya 4096 × 2048 px</span>
      </span>
    </label>
    <div class="controls">
      <div class="select-wrap"><label for="face-size">Ukuran tiap sisi</label>
        <select id="face-size"><option value="256">256 × 256</option><option value="512">512 × 512</option><option value="1024" selected>1024 × 1024 (disarankan)</option></select></div>
      <button type="button" class="btn" id="generate-btn" hidden disabled>Buat 6 sisi</button>
    </div>
    <div class="progress" id="progress" hidden><i id="progress-fill"></i></div>
    <div class="status" id="status" role="status" aria-live="polite"></div>
  </section>

  <section class="glass card" id="card-viewer" aria-labelledby="viewer-title" hidden>
    <div class="card-head">
      <h2 id="viewer-title">Preview 360°</h2>
      <div class="seg" role="group" aria-label="Sumber preview">
        <button type="button" data-mode="pano" aria-pressed="true">Panorama</button>
        <button type="button" data-mode="cube" aria-pressed="false" id="seg-cube" disabled>6 sisi</button>
      </div>
    </div>
    <div class="viewer" id="viewer">
      <canvas id="view-canvas" tabindex="0" aria-label="Preview 360°. Seret untuk memutar, scroll atau cubit untuk zoom, tombol panah untuk menggeser."></canvas>
      <div class="hud hud-top"><span class="chip" id="hud-mode">Panorama</span><span class="chip" id="hud-fov">FOV 75°</span></div>
      <div class="hint chip" id="hint">Seret untuk memutar · scroll / cubit untuk zoom · klik 2× untuk reset</div>
      <div class="dock" role="toolbar" aria-label="Kontrol preview">
        <button type="button" id="v-out" aria-label="Zoom out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/></svg></button>
        <button type="button" id="v-in" aria-label="Zoom in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/></svg></button>
        <button type="button" id="v-reset" aria-label="Reset arah"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
        <button type="button" id="v-auto" aria-label="Putar otomatis" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18.5 2v4h-4M5.5 22v-4h4"/></svg></button>
        <button type="button" id="v-full" aria-label="Layar penuh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>
      </div>
      <div class="gl-fail" id="gl-fail" hidden>WebGL tidak tersedia di perangkat ini, jadi preview 360° tidak bisa ditampilkan. Pembuatan 6 sisi tetap berfungsi.</div>
    </div>
      <div class="faces-wrap" id="card-faces" hidden>
      <h2>Enam sisi <span class="help">· ketuk sisi untuk melihatnya di preview</span></h2>
      <div class="faces" id="face-grid"></div>
      <div class="controls" id="publish-controls" hidden>
        <span class="help">Setiap sisi akan diunggah sebagai aset gambar Roblox.</span>
        <button type="button" class="btn" id="publish-btn">Publish 6 sisi ke Roblox</button>
      </div>
    </div>
  </section>


  <section class="glass card results" id="results">
    <h2>2. Asset ID Skybox</h2>
    <p class="help">Tunggu sampai keenam ID terisi. Lalu salin script dan jalankan di Roblox Studio melalui View → Command Bar.</p>
    <div class="id-list" id="id-list"></div>
    <div class="code-wrap">
      <div class="code-head"><span>Script Roblox Studio</span><button type="button" class="mini" id="copy-script-btn">Salin script</button></div>
      <textarea id="skybox-script" class="code" readonly spellcheck="false" aria-label="Script untuk memasang Skybox di Roblox Studio"></textarea>
    </div>
  </section>
</main>
<div id="toast" aria-live="polite"></div>

<script>
// Runtime: browser (vanilla JS), berjalan di iframe sandbox milik BAXDEV.
// Publish ke Roblox dikerjakan halaman induk lewat postMessage, jadi API key Roblox tidak pernah masuk ke tool ini.

const SKYBOX_FACE_DEFS = [
  {key:'Front',  label:'Front / SkyboxFt',  normal:[0,0,-1], right:[1,0,0],  up:[0,1,0]},
  {key:'Back',   label:'Back / SkyboxBk',   normal:[0,0,1],  right:[-1,0,0], up:[0,1,0]},
  {key:'Left',   label:'Left / SkyboxLf',   normal:[-1,0,0], right:[0,0,-1], up:[0,1,0]},
  {key:'Right',  label:'Right / SkyboxRt',  normal:[1,0,0],  right:[0,0,1],  up:[0,1,0]},
  {key:'Top',    label:'Top / SkyboxUp',    normal:[0,1,0],  right:[1,0,0],  up:[0,0,-1]},
  {key:'Bottom', label:'Bottom / SkyboxDn', normal:[0,-1,0], right:[1,0,0],  up:[0,0,1]}
];

let skyboxSourceFile = null;
let skyboxFaces = [];
let skyboxAssetIds = {};
let skyboxFaceStates = {};
let genId = 0;

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(requestAnimationFrame);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = \`toast-item \${type}\`;
  el.textContent = msg;
  $('toast').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 300); }, 2600);
}
function setStatus(message, type = '') {
  const node = $('status');
  node.textContent = message;
  node.className = \`status\${type ? ' ' + type : ''}\`;
}
function showProgress(percent) {
  $('progress').hidden = false;
  $('progress-fill').style.width = \`\${Math.max(0, Math.min(100, percent))}%\`;
}
function hideProgress() {
  $('progress').hidden = true;
  $('progress-fill').style.width = '0%';
}

function clearSkyboxFaces() {
  genId++;
  skyboxFaces.forEach(face => URL.revokeObjectURL(face.url));
  skyboxFaces = [];
  skyboxAssetIds = {};
  skyboxFaceStates = {};
  $('face-grid').replaceChildren();
  $('card-faces').hidden = true;
  $('seg-cube').disabled = true;
  setViewMode('pano');
  $('results').classList.remove('visible');
  $('publish-controls').hidden = true;
  $('skybox-script').value = '';
}

async function chooseSkyboxImage(file) {
  clearSkyboxFaces();
  skyboxSourceFile = null;
  $('card-viewer').hidden = true;
  $('generate-btn').disabled = true;
  if (!file) return;
  if (!/^image\\/(png|jpeg|webp)$/.test(file.type) || file.size > 30 * 1024 * 1024) {
    setStatus('Pilih PNG, JPG, atau WebP dengan ukuran maksimal 30 MB.', 'error');
    return;
  }
  let image;
  try { image = await createImageBitmap(file); }
  catch { setStatus('Gambar tidak bisa dibuka. Coba ekspor ulang sebagai PNG atau JPG.', 'error'); return; }
  const ratio = image.width / image.height;
  if (image.width > 8192 || image.height > 4096 || ratio < 1.85 || ratio > 2.15) {
    image.close();
    setStatus('Panorama harus berasio 2:1 dan maksimal 8192 × 4096 px.', 'error');
    return;
  }
  skyboxSourceFile = file;
  $('file-label').textContent = file.name;
  $('file-meta').textContent = \`\${image.width} × \${image.height} px · \${(file.size / 1048576).toFixed(2)} MB\`;
  if (viewer) { $('card-viewer').hidden = false; viewer.resize(); viewer.setPanorama(image); viewer.reset(); setViewMode('pano'); }
  image.close();
  $('generate-btn').disabled = false;
  setStatus('Panorama siap. Membuat enam sisi...');
  generateSkyboxFaces();
}

// Equirectangular bilinear sample for direction (dx,dy,dz) → writes RGBA into dst at offset o.
function samplePanoramaInto(src, width, height, dx, dy, dz, dst, o) {
  const length = Math.hypot(dx, dy, dz);
  const longitude = Math.atan2(dx / length, -dz / length);
  const latitude = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  const x = ((longitude / (Math.PI * 2) + .5) * width - .5 + width) % width;
  const y = Math.max(0, Math.min(height - 1, (.5 - latitude / Math.PI) * height - .5));
  const x0 = Math.floor(x), x1 = (x0 + 1) % width;
  const y0 = Math.floor(y), y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * width + x0) * 4, i01 = (y0 * width + x1) * 4;
  const i10 = (y1 * width + x0) * 4, i11 = (y1 * width + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const a = src[i00 + c], b = src[i01 + c], cc = src[i10 + c], d = src[i11 + c];
    dst[o + c] = (a + (b - a) * fx) * (1 - fy) + (cc + (d - cc) * fx) * fy;
  }
}

async function generateSkyboxFaces() {
  if (!skyboxSourceFile || skyboxFaces.length) return;
  const button = $('generate-btn');
  const size = Number($('face-size').value), id = genId;
  button.disabled = true;
  $('publish-controls').hidden = true;
  setStatus(\`Membaca panorama dan membuat enam sisi \${size} × \${size}...\`);
  showProgress(2);
  try {
    const bitmap = await createImageBitmap(skyboxSourceFile);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = bitmap.width; sourceCanvas.height = bitmap.height;
    const sourceContext = sourceCanvas.getContext('2d', {willReadFrequently: true});
    sourceContext.drawImage(bitmap, 0, 0);
    bitmap.close();
    const sw = sourceCanvas.width, sh = sourceCanvas.height;
    const source = sourceContext.getImageData(0, 0, sw, sh).data;

    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = size; faceCanvas.height = size;
    const faceContext = faceCanvas.getContext('2d');
    const total = SKYBOX_FACE_DEFS.length;

    for (let index = 0; index < total; index++) {
      const face = SKYBOX_FACE_DEFS[index];
      const [nx, ny, nz] = face.normal, [rx, ry, rz] = face.right, [ux, uy, uz] = face.up;
      const pixels = faceContext.createImageData(size, size);
      // Tepi tiap sisi memakai sampel yang sama persis agar sambungan kubus tidak terlihat.
      for (let y = 0; y < size; y++) {
        const v = y === 0 ? -1 : y === size - 1 ? 1 : 2 * (y + .5) / size - 1;
        for (let x = 0; x < size; x++) {
          const s = x === 0 ? -1 : x === size - 1 ? 1 : 2 * (x + .5) / size - 1;
          samplePanoramaInto(source, sw, sh,
            nx + s * rx - v * ux, ny + s * ry - v * uy, nz + s * rz - v * uz,
            pixels.data, (y * size + x) * 4);
        }
        if ((y & 127) === 127) {
          showProgress(Math.round((index + y / size) / total * 100));
          await nextFrame();
          if (id !== genId) return;
        }
      }
      faceContext.putImageData(pixels, 0, 0);
      const blob = await new Promise(resolve => faceCanvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(\`PNG \${face.key} gagal dibuat.\`);
      if (id !== genId) return;
      skyboxFaces.push({key: face.key, label: face.label, blob, url: URL.createObjectURL(blob)});
      showProgress(Math.round((index + 1) / total * 100));
      await nextFrame();
    }
    renderSkyboxPreviews();
    $('card-faces').hidden = false;
    await showFacesInViewer();
    $('publish-controls').hidden = false;
    setStatus('Enam sisi siap. Unduh PNG per sisi, atau publish untuk mendapatkan ID Roblox.', 'success');
  } catch (error) {
    setStatus(error.message || 'Gagal membuat sisi SkyBox.', 'error');
    clearSkyboxFaces();
  } finally {
    hideProgress();
    button.disabled = !skyboxSourceFile;
  }
}

function renderSkyboxPreviews() {
  $('face-grid').innerHTML = skyboxFaces.map(face =>
    \`<article class="face" data-key="\${face.key}"><img src="\${face.url}" alt="Preview \${escapeHtml(face.label)}">\` +
    \`<div class="face-info"><b>\${escapeHtml(face.label)}</b>\` +
    \`<a href="\${face.url}" download="Skybox_\${face.key}.png">PNG</a></div></article>\`).join('');
}

function setSkyboxFaceState(face, state) {
  skyboxFaceStates[face] = state;
  renderSkyboxIdRows();
}
function renderSkyboxIdRows() {
  $('id-list').innerHTML = SKYBOX_FACE_DEFS.map(face => {
    const id = skyboxAssetIds[face.key] || '';
    const value = id ? \`rbxassetid://\${id}\` : escapeHtml(skyboxFaceStates[face.key] || 'Menunggu');
    return \`<div class="id-row"><b>\${face.key}</b><code>\${value}</code>\` +
      (id ? \`<button type="button" class="mini" data-copy-face="\${face.key}">Salin</button>\` : '') + \`</div>\`;
  }).join('');
}

function buildSkyboxCommandBarScript() {
  const id = key => String(skyboxAssetIds[key] || '').replace(/\\D/g, '');
  return \`-- SkyBox 360°
-- Jalankan di Roblox Studio: View > Command Bar
local Lighting = game:GetService("Lighting")
local ContentProvider = game:GetService("ContentProvider")
local sky = Instance.new("Sky")
sky.Name = "CustomSkybox"
sky.SkyboxFt = "rbxassetid://\${id('Front')}"
sky.SkyboxBk = "rbxassetid://\${id('Back')}"
sky.SkyboxLf = "rbxassetid://\${id('Left')}"
sky.SkyboxRt = "rbxassetid://\${id('Right')}"
sky.SkyboxUp = "rbxassetid://\${id('Top')}"
sky.SkyboxDn = "rbxassetid://\${id('Bottom')}"

-- Load all six images before swapping skies to avoid a blank/delayed sky.
local loaded, loadError = pcall(function()
    ContentProvider:PreloadAsync({sky})
end)
if not loaded then warn("Skybox preload failed: " .. tostring(loadError)) end

local oldSkies = {}
for _, child in ipairs(Lighting:GetChildren()) do
    if child:IsA("Sky") then table.insert(oldSkies, child) end
end
sky.Parent = Lighting
for _, oldSky in ipairs(oldSkies) do oldSky:Destroy() end
print("SkyBox terpasang di Lighting")
print("Front: rbxassetid://\${id('Front')}")
print("Back: rbxassetid://\${id('Back')}")
print("Left: rbxassetid://\${id('Left')}")
print("Right: rbxassetid://\${id('Right')}")
print("Top: rbxassetid://\${id('Top')}")
print("Bottom: rbxassetid://\${id('Bottom')}")\`;
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
  } catch { toast('Gagal menyalin. Pilih teks lalu salin manual.', 'error'); }
}

// Kirim enam PNG ke halaman induk (BAXDEV) dan tunggu hasil per sisi.
function requestPublish(files, onState) {
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
    window.parent.postMessage({bx: 'publish', type: 'request', id, files}, '*');
  });
}

async function publishSkyboxFaces() {
  if (skyboxFaces.length !== 6) return;
  const button = $('publish-btn');
  button.disabled = true;
  skyboxAssetIds = {};
  skyboxFaceStates = Object.fromEntries(SKYBOX_FACE_DEFS.map(face => [face.key, 'Mengunggah...']));
  $('results').classList.add('visible');
  renderSkyboxIdRows();
  showProgress(8);
  setStatus('Mengunggah enam tekstur ke Roblox. Jangan tutup halaman ini.');
  let finished = 0;
  try {
    const files = Object.fromEntries(skyboxFaces.map(face => [face.key, new File([face.blob], \`Skybox_\${face.key}.png\`, {type: 'image/png'})]));
    const results = await requestPublish(files, (face, text) => {
      setSkyboxFaceState(face, text);
      if (text === 'Selesai') showProgress(8 + Math.round(++finished / SKYBOX_FACE_DEFS.length * 92));
    });
    const failed = [];
    for (const face of SKYBOX_FACE_DEFS) {
      const result = results[face.key] || {};
      const id = String(result.assetId || '').replace(/\\D/g, '');
      if (id) { skyboxAssetIds[face.key] = id; skyboxFaceStates[face.key] = 'Selesai'; }
      else {
        const reason = result.error || 'Roblox tidak menerima sisi ini.';
        skyboxFaceStates[face.key] = \`Gagal: \${reason}\`;
        failed.push(\`\${face.key}: \${reason}\`);
      }
    }
    renderSkyboxIdRows();
    if (!failed.length) {
      $('skybox-script').value = buildSkyboxCommandBarScript();
      setStatus('Enam sisi berhasil dipublish. Asset ID dan script siap disalin.', 'success');
      toast('SkyBox berhasil dipublish ke Roblox', 'success');
    } else {
      setStatus(failed.join(' '), 'error');
    }
  } catch (error) {
    setStatus(error.message || 'Upload SkyBox gagal.', 'error');
  } finally {
    hideProgress();
    button.disabled = false;
  }
}

// ── Wiring ──
// Tema dari halaman induk: warna dasar + palet 3 warna (terang, sedang, gelap).
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
}
addEventListener('message', e => {
  if (e.source === window.parent && e.data && e.data.bx === 'theme') applyBxTheme(e.data);
});
$('source-file').addEventListener('change', e => chooseSkyboxImage(e.target.files[0]));
const dropZone = $('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); chooseSkyboxImage(e.dataTransfer.files[0]); });
$('face-size').addEventListener('change', () => { if (skyboxSourceFile) { clearSkyboxFaces(); generateSkyboxFaces(); } });
$('generate-btn').addEventListener('click', generateSkyboxFaces);
$('publish-btn').addEventListener('click', publishSkyboxFaces);
$('copy-script-btn').addEventListener('click', () => { const s = $('skybox-script').value; if (s) copyText(s, 'Script SkyBox disalin'); });
$('id-list').addEventListener('click', e => {
  const key = e.target.closest('[data-copy-face]')?.dataset.copyFace;
  if (key && skyboxAssetIds[key]) copyText(\`rbxassetid://\${skyboxAssetIds[key]}\`, \`\${key} ID disalin\`);
});

// ── Preview 360° (WebGL murni, tanpa library) ──
// Sumber "Panorama": equirectangular asli. Sumber "6 sisi": tekstur hasil generate, disampel dengan
// definisi sisi yang sama persis seperti SKYBOX_FACE_DEFS, jadi preview = cara Roblox membacanya.
function createViewer(canvas) {
  const gl = canvas.getContext('webgl', {antialias: true, alpha: false});
  if (!gl) return null;
  const VS = 'attribute vec2 p;varying vec2 q;void main(){q=p;gl_Position=vec4(p,0.,1.);}';
  const FS = \`precision highp float;
varying vec2 q;
uniform sampler2D uP,uF,uB,uL,uR,uT,uD;
uniform float uMode,uYaw,uPitch,uTan,uAsp;
void main(){
  vec3 c=normalize(vec3(q.x*uTan*uAsp,q.y*uTan,-1.));
  float cp=cos(uPitch),sp=sin(uPitch);
  vec3 a=vec3(c.x,c.y*cp-c.z*sp,c.y*sp+c.z*cp);
  float cy=cos(uYaw),sy=sin(uYaw);
  vec3 d=vec3(a.x*cy+a.z*sy,a.y,-a.x*sy+a.z*cy);
  vec3 b=abs(d);vec3 col;
  if(uMode<.5){
    float lon=atan(d.x,-d.z),lat=asin(clamp(d.y,-1.,1.));
    col=texture2D(uP,vec2(lon/6.2831853+.5,.5-lat/3.1415927)).rgb;
  }else if(b.z>=b.x&&b.z>=b.y){
    if(d.z<0.) col=texture2D(uF,vec2(d.x,-d.y)/-d.z*.5+.5).rgb;
    else col=texture2D(uB,vec2(-d.x,-d.y)/d.z*.5+.5).rgb;
  }else if(b.x>=b.y){
    if(d.x<0.) col=texture2D(uL,vec2(-d.z,-d.y)/-d.x*.5+.5).rgb;
    else col=texture2D(uR,vec2(d.z,-d.y)/d.x*.5+.5).rgb;
  }else{
    if(d.y>0.) col=texture2D(uT,vec2(d.x,d.z)/d.y*.5+.5).rgb;
    else col=texture2D(uD,vec2(d.x,-d.z)/-d.y*.5+.5).rgb;
  }
  gl_FragColor=vec4(col,1.);
}\`;
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  try { gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS)); }
  catch (e) { console.error(e); return null; }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(prog, n);
  const uni = {mode: U('uMode'), yaw: U('uYaw'), pitch: U('uPitch'), tan: U('uTan'), asp: U('uAsp')};
  const params = () => { for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); };
  const tex = ['uP','uF','uB','uL','uR','uT','uD'].map((name, i) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([16,16,16,255]));
    params(); gl.uniform1i(U(name), i); return t; });
  const upload = (i, src) => {
    gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[i]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); params();
  };

  const FOV_MIN = 25, FOV_MAX = 100, FOV_DEF = 75, DEG = Math.PI / 180;
  let yaw = 0, pitch = 0, fov = FOV_DEF, yawV = 0, pitchV = 0;
  let mode = 0, auto = false, dragging = false, running = false, last = 0, dirty = true;
  const pointers = new Map();
  let pinch = 0, lastT = 0, tgt = null;
  const hudFov = document.getElementById('hud-fov');
  const clampFov = v => Math.max(FOV_MIN, Math.min(FOV_MAX, v));

  function draw() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uni.mode, mode); gl.uniform1f(uni.yaw, yaw * DEG); gl.uniform1f(uni.pitch, pitch * DEG);
    gl.uniform1f(uni.tan, Math.tan(fov * DEG / 2)); gl.uniform1f(uni.asp, canvas.width / Math.max(1, canvas.height));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    hudFov.textContent = \`FOV \${Math.round(fov)}°\`;
  }
  function frame(t) {
    const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
    let moving = false;
    if (tgt && !dragging) {
      const k = 1 - Math.exp(-10 * dt), dy = (((tgt.y - yaw) % 360) + 540) % 360 - 180;
      yaw += dy * k; pitch += (tgt.p - pitch) * k; fov += (FOV_DEF - fov) * k; moving = true;
      if (Math.abs(dy) < .1 && Math.abs(tgt.p - pitch) < .1 && Math.abs(FOV_DEF - fov) < .1) tgt = null;
    }
    if (!dragging) {
      if (Math.abs(yawV) > .01 || Math.abs(pitchV) > .01) {
        yaw += yawV * dt; pitch += pitchV * dt;
        const k = Math.exp(-4 * dt); yawV *= k; pitchV *= k; moving = true;
      }
      if (auto) { yaw += 7 * dt; moving = true; }
    }
    pitch = Math.max(-89, Math.min(89, pitch));
    if (moving || dirty || dragging) { draw(); dirty = false; }
    if (moving || dragging || auto) requestAnimationFrame(frame); else running = false;
  }
  function invalidate() { dirty = true; if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
    invalidate();
  }
  new ResizeObserver(resize).observe(canvas);

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    canvas.parentElement.classList.add('seen'); dragging = true; tgt = null; yawV = pitchV = 0; lastT = e.timeStamp;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    invalidate();
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && dist) fov = clampFov(fov * pinch / dist); pinch = dist;
    } else {
      const k = fov / canvas.clientHeight, dt = Math.max(1, e.timeStamp - lastT) / 1000; lastT = e.timeStamp;
      yaw += dx * k; pitch += dy * k;                      // konten mengikuti jari
      yawV = yawV * .6 + (dx * k / dt) * .4; pitchV = pitchV * .6 + (dy * k / dt) * .4;
    }
    invalidate();
  });
  const release = e => { pointers.delete(e.pointerId); pinch = 0; if (!pointers.size) dragging = false; else { const r = [...pointers.values()][0]; void r; }
    if (e.type === 'pointercancel') yawV = pitchV = 0; invalidate(); };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', e => { e.preventDefault(); canvas.parentElement.classList.add('seen');
    fov = clampFov(fov * Math.exp(e.deltaY * (e.deltaMode === 1 ? .03 : .0012))); invalidate(); }, {passive: false});
  canvas.addEventListener('dblclick', () => api.reset());
  canvas.addEventListener('keydown', e => {
    const step = fov / 12, map = {ArrowLeft: () => yaw -= step, ArrowRight: () => yaw += step, ArrowUp: () => pitch += step,
      ArrowDown: () => pitch -= step, '+': () => fov = clampFov(fov - 6), '=': () => fov = clampFov(fov - 6),
      '-': () => fov = clampFov(fov + 6), '0': () => api.reset()};
    if (map[e.key]) { e.preventDefault(); map[e.key](); canvas.parentElement.classList.add('seen'); invalidate(); }
  });

  const api = {
    resize,
    setPanorama(src) {
      let s = src; const cap = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
      if (src.width > cap) { s = document.createElement('canvas'); s.width = cap; s.height = Math.round(src.height * cap / src.width);
        s.getContext('2d').drawImage(src, 0, 0, s.width, s.height); }
      upload(0, s); invalidate();
    },
    setFaces(list) { list.forEach((b, i) => upload(i + 1, b)); invalidate(); },
    setMode(m) { mode = m === 'cube' ? 1 : 0; invalidate(); },
    lookAt(y, p) { tgt = {y, p}; yawV = pitchV = 0; invalidate(); },
    reset() { yaw = pitch = yawV = pitchV = 0; fov = FOV_DEF; invalidate(); },
    zoom(f) { fov = clampFov(fov * f); invalidate(); },
    toggleAuto() { auto = !auto; invalidate(); return auto; }
  };
  return api;
}

const viewer = (() => { try { return createViewer($('view-canvas')); } catch (e) { console.error(e); return null; } })();
if (!viewer) $('gl-fail').hidden = false;

function setViewMode(mode) {
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('hud-mode').textContent = mode === 'cube' ? '6 sisi' : 'Panorama';
  viewer?.setMode(mode);
}
async function showFacesInViewer() {
  if (!viewer) return;
  try {
    const bitmaps = await Promise.all(skyboxFaces.map(f => createImageBitmap(f.blob)));
    viewer.setFaces(bitmaps); bitmaps.forEach(b => b.close());
    $('seg-cube').disabled = false; setViewMode('cube');
  } catch (e) { console.error(e); }
}
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setViewMode(b.dataset.mode)));
$('v-in').addEventListener('click', () => viewer?.zoom(.8));
$('v-out').addEventListener('click', () => viewer?.zoom(1.25));
$('v-reset').addEventListener('click', () => viewer?.reset());
$('v-auto').addEventListener('click', e => e.currentTarget.setAttribute('aria-pressed', String(!!viewer?.toggleAuto())));
function setFull(on) {
  $('viewer').classList.toggle('is-full', on); document.body.classList.toggle('no-scroll', on);
  $('v-full').setAttribute('aria-pressed', String(on)); requestAnimationFrame(() => viewer?.resize());
}
$('v-full').addEventListener('click', () => setFull(!$('viewer').classList.contains('is-full')));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('viewer').classList.contains('is-full')) setFull(false); });

// ── Tema hitam / putih ──
const themeRoot = document.documentElement;
try { const t = localStorage.getItem('skybox-theme'); if (t) themeRoot.dataset.theme = t; } catch {}
$('theme-btn').addEventListener('click', () => {
  const isLight = (themeRoot.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'light';
  themeRoot.dataset.theme = isLight ? 'dark' : 'light';
  try { localStorage.setItem('skybox-theme', themeRoot.dataset.theme); } catch {}
});
// Kilau liquid glass mengikuti pointer
document.addEventListener('pointermove', e => {
  const g = e.target.closest?.('.glass'); if (!g) return; const r = g.getBoundingClientRect();
  g.style.setProperty('--mx', \`\${e.clientX - r.left}px\`); g.style.setProperty('--my', \`\${e.clientY - r.top}px\`);
}, {passive: true});
const FACE_LOOK = {Front: [0, 0], Back: [180, 0], Left: [90, 0], Right: [-90, 0], Top: [0, 89], Bottom: [0, -89]};
$('face-grid').addEventListener('click', e => {
  const card = e.target.closest('.face'); if (!card || e.target.closest('a')) return;
  const look = FACE_LOOK[card.dataset.key]; if (!look || !viewer) return;
  document.querySelectorAll('.face').forEach(f => f.classList.toggle('active', f === card));
  if (!$('seg-cube').disabled) setViewMode('cube');
  $('viewer').parentElement.classList.add('seen'); $('viewer').classList.add('seen');
  viewer.lookAt(look[0], look[1]);
  $('viewer').scrollIntoView({behavior: 'smooth', block: 'nearest'});
});
</script>
</body>
</html>
`;
