// Sumber tool VIP Plus. Disajikan lewat /api/tool setelah cek VIP Plus; jangan taruh sebagai file statis.
// Edit: di dalam template literal ini tanda \, ` dan ${ harus di-escape dengan \.
export default `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src https://cdn.jsdelivr.net blob: data:; font-src data:; base-uri 'none'; form-action 'none'">
<meta name="theme-color" content="#000000">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Image to Mesh — 3D Maker</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23000'/%3E%3Cpath d='M32 12 52 23.5 32 35 12 23.5Z' fill='%23fff'/%3E%3Cpath d='M12 23.5 32 35v21L12 44.5Z' fill='%23fff' fill-opacity='.5'/%3E%3Cpath d='M52 23.5 32 35v21l20-11.5Z' fill='%23fff' fill-opacity='.26'/%3E%3C/svg%3E">
<style>
:root{
  color-scheme:dark;
  --bg1:#000;--bg2:#101010;
  --glass:rgba(255,255,255,.07);--glass-hi:rgba(255,255,255,.16);
  --rim-hi:rgba(255,255,255,.6);--rim-lo:rgba(255,255,255,.14);
  --ink:#fff;--ink-2:rgba(255,255,255,.74);--track:rgba(255,255,255,.17);
  --accent:#fff;--accent-ink:#000;
  --orb1:#a8a8a8;--orb2:#707070;--orb3:#c4c4c4;--orb4:#4c4c4c;
  --lift:0 26px 64px rgba(0,0,0,.5);--well:rgba(0,0,0,.4);
}

*{box-sizing:border-box}
[hidden]{display:none!important}
html{background:linear-gradient(165deg,var(--bg1),var(--bg2)) fixed,var(--bg1)}
body{margin:0;min-height:100vh;min-height:100dvh;overflow-x:hidden;background:transparent;color:var(--ink);
  font:15px/1.5 "SF Pro Display","SF Pro Text",-apple-system,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif}
body::before{content:"";position:fixed;inset:-25%;z-index:-1;pointer-events:none;filter:blur(36px) saturate(1.1);
  background:
    radial-gradient(34% 30% at 18% 22%,color-mix(in srgb,var(--orb1) 62%,transparent),transparent 72%),
    radial-gradient(30% 34% at 82% 18%,color-mix(in srgb,var(--orb2) 58%,transparent),transparent 72%),
    radial-gradient(36% 32% at 70% 82%,color-mix(in srgb,var(--orb4) 46%,transparent),transparent 72%),
    radial-gradient(30% 28% at 24% 80%,color-mix(in srgb,var(--orb3) 40%,transparent),transparent 72%);
  animation:drift 46s ease-in-out infinite alternate}
@keyframes drift{from{transform:translate3d(-2%,-1%,0) rotate(0)}to{transform:translate3d(3%,2%,0) rotate(9deg)}}
@media(prefers-reduced-motion:reduce){body::before{animation:none}*{transition-duration:.01ms!important}}

/* susunan: satu kolom, scroll ke bawah */
.shell{max-width:880px;margin:0 auto;padding:max(28px,env(safe-area-inset-top)) 16px max(48px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:16px}
.hero{padding:6px 4px 10px}
.badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 8px;border-radius:99px;font-size:13px;font-weight:600;color:var(--ink);
  background:var(--glass);box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%)}
.badge svg{width:22px;height:22px}
h1{margin:14px 0 8px;font-size:clamp(34px,6vw,56px);font-weight:300;letter-spacing:-.03em;line-height:1.04}
.hero p{margin:0;max-width:56ch;color:var(--ink-2);font-size:15px}

.card{position:relative;padding:clamp(18px,3vw,26px);border-radius:30px;background:linear-gradient(160deg,var(--glass-hi),var(--glass) 45%);
  backdrop-filter:blur(26px) saturate(185%) brightness(1.04);-webkit-backdrop-filter:blur(26px) saturate(185%) brightness(1.04);
  box-shadow:var(--lift),inset 0 1px 0 var(--rim-hi),inset 0 -1px 0 var(--rim-lo),inset 0 0 28px rgba(255,255,255,.05)}
.card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.2px;pointer-events:none;
  background:linear-gradient(140deg,var(--rim-hi),transparent 28%,transparent 68%,var(--rim-lo));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.card::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(120% 55% at 8% 0%,rgba(255,255,255,.18),transparent 60%)}
.card>*{position:relative;z-index:1}
.card h2{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em}
.card-sub{margin:4px 0 16px;color:var(--ink-2);font-size:13px}
.stack{display:grid;gap:20px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px 28px}
.span{grid-column:1/-1}
@media(max-width:640px){.pair{grid-template-columns:1fr}.card{border-radius:26px}}

/* unggah */
.drop{position:relative;display:grid;place-items:center;min-height:150px;padding:20px;border:1.5px dashed var(--rim-hi);border-radius:22px;background:var(--glass);text-align:center;cursor:pointer;
  box-shadow:inset 0 1px 0 var(--rim-lo);transition:background .25s,transform .25s,box-shadow .25s}
.drop:hover,.drop.drag-over{background:var(--glass-hi);transform:translateY(-1px);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 20%,transparent)}
.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.drop-icon{display:grid;width:42px;height:42px;place-items:center;margin:0 auto 10px;border-radius:14px;color:var(--accent-ink);
  background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 96%,#fff),color-mix(in srgb,var(--accent) 72%,transparent));box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 6px 16px rgba(0,0,0,.25)}
.drop-icon svg{width:20px;height:20px}
.model3d-file-name{display:block;overflow-wrap:anywhere;font-size:14px;font-weight:650}
.model3d-file-meta{display:block;margin-top:4px;color:var(--ink-2);font-size:12px}

/* preview */
.model3d-viewport{position:relative;height:clamp(320px,60vh,560px);overflow:hidden;border-radius:24px;touch-action:none;
  background:radial-gradient(ellipse at 50% 38%,rgba(255,255,255,.18),transparent 62%),var(--well);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo),inset 0 -30px 60px rgba(0,0,0,.12)}
.model3d-viewport canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}
.model3d-empty{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:10px;padding:22px;text-align:center;pointer-events:none;color:var(--ink-2)}
.model3d-empty svg{width:84px;height:84px;color:var(--ink);filter:drop-shadow(0 8px 22px rgba(0,0,0,.35))}
.model3d-empty b{margin-top:6px;color:var(--ink);font-size:15px}
.model3d-empty span{max-width:250px;font-size:13px}
.model3d-viewport.has-model .model3d-empty{display:none}
.model3d-preview-bar{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;font-size:12px}
.model3d-preview-bar span{padding:6px 12px;border-radius:99px;background:var(--glass);box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo);color:var(--ink-2)}
.model3d-status{min-height:20px;margin-top:12px;color:var(--ink-2);font-size:13px;line-height:1.5}
.model3d-status.error,.model3d-status.success{color:var(--ink);font-weight:600}

/* kontrol */
.model3d-control{min-width:0}
.model3d-control-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;font-size:13px;font-weight:600}
.model3d-control-head output{font-variant-numeric:tabular-nums}
.model3d-control-hint,.model3d-toggle small{display:block;margin-top:4px;color:var(--ink-2);font-size:12px;line-height:1.5;font-weight:400}
.model3d-control input[type=range]{-webkit-appearance:none;appearance:none;display:block;width:100%;height:28px;margin:0;background:transparent;cursor:pointer;--fill:50%}
.model3d-control input[type=range]::-webkit-slider-runnable-track{height:7px;border-radius:99px;background:linear-gradient(90deg,var(--accent) var(--fill),var(--track) var(--fill));box-shadow:inset 0 1px 2px rgba(0,0,0,.25)}
.model3d-control input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;margin-top:-9.5px;border-radius:50%;border:1px solid rgba(255,255,255,.95);
  background:radial-gradient(circle at 32% 26%,#fff,rgba(255,255,255,.85) 42%,rgba(255,255,255,.6));box-shadow:0 5px 14px rgba(0,0,0,.4),inset 0 -3px 6px rgba(0,0,0,.14);transition:transform .18s}
.model3d-control input[type=range]:active::-webkit-slider-thumb{transform:scale(1.12)}
.model3d-control input[type=range]::-moz-range-track{height:7px;border-radius:99px;background:var(--track)}
.model3d-control input[type=range]::-moz-range-progress{height:7px;border-radius:99px;background:var(--accent)}
.model3d-control input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;border:1px solid #fff;background:radial-gradient(circle at 32% 26%,#fff,rgba(255,255,255,.7));box-shadow:0 5px 14px rgba(0,0,0,.4)}
.model3d-control input[type=range]:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:99px}

.model3d-toggle{display:flex;align-items:flex-start;gap:12px;font-size:14px;font-weight:600;cursor:pointer}
.model3d-toggle input[type=checkbox]{-webkit-appearance:none;appearance:none;position:relative;flex:none;width:46px;height:28px;margin:0;border-radius:99px;cursor:pointer;
  background:var(--track);box-shadow:inset 0 1px 3px rgba(0,0,0,.3),inset 0 0 0 1px var(--rim-lo);transition:background .25s}
.model3d-toggle input[type=checkbox]::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;
  background:radial-gradient(circle at 32% 26%,#fff,rgba(255,255,255,.85) 55%,rgba(255,255,255,.62));box-shadow:0 3px 8px rgba(0,0,0,.4);transition:transform .3s cubic-bezier(.3,1.5,.5,1),background .25s}
.model3d-toggle input[type=checkbox]:checked{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 94%,#fff),color-mix(in srgb,var(--accent) 74%,transparent))}
.model3d-toggle input[type=checkbox]:checked::after{transform:translateX(18px);background:var(--accent-ink)}
.model3d-toggle input[type=checkbox]:focus-visible{outline:2px solid var(--accent);outline-offset:3px}

.model3d-quality{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border-radius:16px;background:var(--well);box-shadow:inset 0 1px 3px rgba(0,0,0,.25),inset 0 0 0 1px var(--rim-lo)}
.model3d-quality button{min-height:40px;border:0;border-radius:12px;background:transparent;color:var(--ink-2);font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .25s,color .25s,box-shadow .25s}
.model3d-quality button.active{color:var(--ink);background:linear-gradient(180deg,var(--glass-hi),var(--glass));box-shadow:inset 0 1px 0 var(--rim-hi),0 4px 12px rgba(0,0,0,.25)}
.model3d-quality button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}

/* ekspor */
.model3d-export{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:10px 22px;border:0;border-radius:99px;color:var(--ink);font:inherit;font-size:14px;font-weight:650;cursor:pointer;
  background:linear-gradient(180deg,var(--glass-hi),var(--glass));backdrop-filter:blur(16px) saturate(170%);-webkit-backdrop-filter:blur(16px) saturate(170%);
  box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo),0 10px 24px rgba(0,0,0,.2);transition:transform .2s,filter .2s}
.btn:hover{transform:translateY(-1px);filter:brightness(1.1)}.btn:active{transform:scale(.97)}.btn:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.btn-primary{color:var(--accent-ink);background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 94%,#fff),color-mix(in srgb,var(--accent) 76%,transparent));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 1px rgba(255,255,255,.3),0 10px 26px rgba(0,0,0,.28)}
.model3d-export-note{margin:0;color:var(--ink-2);font-size:12px;line-height:1.55}
@media(max-width:520px){.model3d-export .btn{flex:1 1 100%}.model3d-viewport{height:clamp(280px,56vh,420px)}}

.model3d-target button{font-size:12px;padding-inline:4px}
.opt-meter{display:grid;gap:8px;padding:14px;border-radius:20px;background:var(--well);box-shadow:inset 0 1px 3px rgba(0,0,0,.2),inset 0 0 0 1px var(--rim-lo)}
.opt-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;font-size:14px}
.opt-row b{font-variant-numeric:tabular-nums;font-weight:650}
.opt-state{padding:4px 12px;border-radius:99px;font-size:12px;font-weight:650;color:var(--ink-2);background:var(--glass);box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo)}
.opt-state[data-tone=ok]{color:var(--accent-ink);background:var(--accent)}
.opt-state[data-tone=warn]{color:var(--ink);background:transparent;box-shadow:inset 0 0 0 1.5px var(--ink);text-decoration:underline dotted;text-underline-offset:3px}
.opt-bar{height:9px;border-radius:99px;background:var(--track);overflow:hidden}
.opt-bar i{display:block;height:100%;width:0;border-radius:inherit;background:var(--accent);transition:width .45s cubic-bezier(.3,1,.4,1)}
.opt-meter .model3d-control-hint{margin:0}
.opt-note{margin-top:14px}
.is-off .model3d-target,.is-off .opt-meter{opacity:.55}
.vp-reset{position:absolute;top:12px;right:12px;z-index:2;display:none;align-items:center;gap:6px;min-height:40px;padding:8px 14px;border:0;border-radius:99px;color:var(--ink);font:inherit;font-size:12px;font-weight:650;cursor:pointer;
  background:linear-gradient(180deg,var(--glass-hi),var(--glass));backdrop-filter:blur(14px) saturate(170%);-webkit-backdrop-filter:blur(14px) saturate(170%);box-shadow:inset 0 1px 0 var(--rim-hi),inset 0 0 0 1px var(--rim-lo),0 8px 20px rgba(0,0,0,.25)}
.vp-reset svg{width:15px;height:15px}.vp-reset:active{transform:scale(.96)}.vp-reset:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.model3d-viewport.has-model .vp-reset{display:inline-flex}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  :root{--glass:rgba(48,48,48,.88);--glass-hi:rgba(70,70,70,.94)}
  
}

</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="ico-cube" viewBox="0 0 64 64"><path d="M32 7 56 20.5v27L32 61 8 47.5v-27L32 7Z" fill="currentColor" fill-opacity=".14"/>
<path d="M32 7 56 20.5 32 34 8 20.5 32 7Z" fill="currentColor" fill-opacity=".9"/>
<path d="M8 20.5 32 34v27L8 47.5v-27Z" fill="currentColor" fill-opacity=".5"/>
<path d="M56 20.5 32 34v27l24-13.5v-27Z" fill="currentColor" fill-opacity=".26"/>
<path d="M32 7 56 20.5v27L32 61 8 47.5v-27L32 7Zm0 27v27M8 20.5 32 34l24-13.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M32 15.5 44 22.4 32 29.3 20 22.4 32 15.5Z" fill="none" stroke="var(--cube-line,#000)" stroke-opacity=".45" stroke-width="1.6" stroke-linejoin="round"/></symbol>
</svg>

<main class="shell" id="page-model3d">
  <header class="hero">
    <span class="badge"><svg aria-hidden="true"><use href="#ico-cube"/></svg>Roblox mesh studio</span>
    <h1>Image to Mesh</h1>
    <p>Bentuk gambar menjadi mesh timbul yang halus dan padat. Hasilnya mesh putih polos tanpa tekstur dan tanpa warna vertex. Semua diproses lokal di browser.</p>
  </header>

  <section class="card" aria-labelledby="t-upload">
    <h2 id="t-upload">Gambar sumber</h2>
    <p class="card-sub">PNG, JPG, atau WebP. Gambar hanya dibaca untuk siluet, tidak diunggah ke server.</p>
    <label class="drop" id="model3d-drop-zone">
      <input type="file" id="model3d-file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp">
      <span>
        <span class="drop-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg></span>
        <span class="model3d-file-name" id="model3d-file-name">Pilih gambar</span>
        <span class="model3d-file-meta" id="model3d-file-meta">Klik untuk memilih atau tarik file ke sini. Maks. 15 MB</span>
      </span>
    </label>
  </section>

  <section class="card" aria-label="Preview mesh 3D">
    <h2>Preview</h2>
    <p class="card-sub">Geser untuk memutar, cubit atau scroll untuk zoom, ketuk dua kali untuk reset.</p>
    <div class="model3d-viewport" id="model3d-viewport">
      <canvas id="model3d-canvas" aria-label="Preview 3D yang dapat diputar"></canvas>
      <button type="button" class="vp-reset" id="model3d-reset" aria-label="Reset sudut kamera"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Reset</button>
      <div class="model3d-empty" id="model3d-empty">
        <svg viewBox="0 0 64 64" aria-hidden="true"><use href="#ico-cube"/></svg>
        <b>Belum ada mesh</b>
        <span>Pilih gambar di atas, hasil ekstrusi 3D tampil di sini.</span>
      </div>
    </div>
    <div class="model3d-preview-bar"><span id="model3d-dimensions">Belum ada mesh</span><span id="model3d-triangle-count">Siap memutar</span></div>
    <div class="model3d-status" id="model3d-status" role="status" aria-live="polite">Pilih gambar untuk membuat mesh 3D.</div>
  </section>

  <section class="card" aria-labelledby="t-bg">
    <h2 id="t-bg">Latar belakang</h2>
    <p class="card-sub">Bagian yang dibuang sebelum gambar dijadikan siluet.</p>
    <div class="stack">
      <label class="model3d-toggle"><input type="checkbox" id="model3d-remove-bg" checked><span>Hapus latar polos otomatis<small>Warna yang mirip sudut gambar dibuat transparan, termasuk bagian dalam huruf.</small></span></label>
      <div class="model3d-control"><div class="model3d-control-head"><label for="model3d-tolerance">Toleransi latar</label><output id="model3d-tolerance-value">48</output></div><input type="range" id="model3d-tolerance" min="12" max="110" value="48" aria-label="Toleransi penghapusan latar"></div>
    </div>
  </section>

  <section class="card" aria-labelledby="t-shape">
    <h2 id="t-shape">Bentuk</h2>
    <p class="card-sub">Ukuran dan kontur mesh. Preview diperbarui langsung.</p>
    <div class="pair">
      <div class="model3d-control"><div class="model3d-control-head"><label for="model3d-depth">Ketebalan</label><output id="model3d-depth-value">1.0 studs</output></div><input type="range" id="model3d-depth" min="0.2" max="3.5" step="0.1" value="1" aria-label="Ketebalan mesh"></div>
      <div class="model3d-control"><div class="model3d-control-head"><label for="model3d-size">Ukuran maksimum</label><output id="model3d-size-value">6 studs</output></div><input type="range" id="model3d-size" min="2" max="12" step="0.5" value="6" aria-label="Ukuran maksimum model"></div>
      <div class="model3d-control span"><div class="model3d-control-head"><label for="model3d-smoothness">Kehalusan kontur</label><output id="model3d-smoothness-value">1.6 px</output></div><input type="range" id="model3d-smoothness" min="0.3" max="2.4" step="0.1" value="1.6" aria-label="Kehalusan kontur mesh"><small class="model3d-control-hint">Kontur diproses pada resolusi tinggi. Naikkan untuk sudut lebih membulat.</small></div>
    </div>
  </section>

  <section class="card" aria-labelledby="t-detail">
    <h2 id="t-detail">Detail dan tampilan</h2>
    <p class="card-sub">Makin tinggi detail, makin banyak segitiga.</p>
    <div class="stack">
      <div class="model3d-control"><div class="model3d-control-head"><span>Kerapatan kontur</span></div><div class="model3d-quality" role="group" aria-label="Detail mesh"><button type="button" data-budget="6000" onclick="setModel3DBudget(this)">Ringan</button><button type="button" class="active" data-budget="12000" onclick="setModel3DBudget(this)">Seimbang</button><button type="button" data-budget="18000" onclick="setModel3DBudget(this)">Tinggi</button></div></div>
      <label class="model3d-toggle"><input type="checkbox" id="model3d-auto-rotate" checked><span>Putar otomatis<small>Berhenti saat kamu menyentuh preview.</small></span></label>
    </div>
  </section>

  <section class="card" id="model3d-optimize-card" aria-labelledby="t-opt">
    <h2 id="t-opt">Optimasi Roblox</h2>
    <p class="card-sub">Jumlah segitiga disesuaikan otomatis ke target. Detail dikurangi bertahap, mulai dari yang paling tidak terlihat.</p>
    <div class="stack">
      <label class="model3d-toggle"><input type="checkbox" id="model3d-optimize" checked><span>Optimasi otomatis<small>Satu material per mesh, bevel dan kepadatan permukaan dituning sampai muat target.</small></span></label>
      <div class="model3d-control"><div class="model3d-control-head"><span>Target segitiga</span></div><div class="model3d-quality model3d-target" role="group" aria-label="Target segitiga"><button type="button" data-target="4000" aria-pressed="false" onclick="setModel3DOptimizeTarget(this)">Aksesori 4.000</button><button type="button" class="active" data-target="10000" aria-pressed="true" onclick="setModel3DOptimizeTarget(this)">Aman 10.000</button><button type="button" data-target="20000" aria-pressed="false" onclick="setModel3DOptimizeTarget(this)">Maks 20.000</button></div></div>
      <div class="opt-meter" aria-live="polite">
        <div class="opt-row"><b id="model3d-opt-count">– / 10.000 segitiga</b><span class="opt-state" id="model3d-opt-state">Menunggu gambar</span></div>
        <div class="opt-bar" role="presentation"><i id="model3d-opt-fill"></i></div>
        <small class="model3d-control-hint" id="model3d-opt-detail">Pilih gambar, mesh akan disesuaikan otomatis ke target.</small>
      </div>
    </div>
    <p class="model3d-export-note opt-note">Batas resmi bisa berubah dan berbeda tiap jenis aset. Angka yang umum dipakai: sekitar 20.000 sampai 21.000 segitiga per MeshPart dan 4.000 untuk aksesori UGC. Cek dokumentasi Roblox terbaru sebelum upload.</p>
  </section>

  <section class="card" aria-labelledby="t-export">
    <h2 id="t-export">Ekspor</h2>
    <p class="card-sub">Tersedia setelah mesh selesai dibuat.</p>
    <div class="model3d-export" id="model3d-export" hidden>
      <button type="button" class="btn btn-primary" onclick="exportModel3DGLTF()">Unduh glTF</button>
      <button type="button" class="btn" onclick="exportModel3DOBJ()">Unduh OBJ</button>
    </div>
    <p class="model3d-export-note">Ekspor putih polos, tanpa tekstur dan tanpa warna vertex. Untuk glTF, simpan file .gltf dan .bin dalam satu folder. OBJ ikut menyertakan file .mtl. Saat optimasi aktif, ekspor memakai satu material.</p>
  </section>
</main>
<script>
let model3dFile = null;
let model3dGrid = null;
let model3dMeshData = null;
let model3dBudget = 12000;
let model3dBuildToken = 0;
let model3dRenderState = null;
let model3dRenderFrame = 0;
let model3dMeshTimer = 0;
let model3dThreePromise = null;
let model3dPageActive = true;
/* Optimasi Roblox: tangga kualitas dari paling detail ke paling ringan.
   bevel = segmen bevel (null=bawaan, 0=tanpa bevel), face = panjang maks sisi segitiga depan/belakang (px grid, null=bawaan),
   tol = tambahan toleransi penyederhanaan kontur (px). */
const MODEL3D_LADDER=[
  {bevel:null,face:null,tol:0},
  {bevel:6,face:7,tol:.2},
  {bevel:4,face:10,tol:.4},
  {bevel:3,face:14,tol:.7},
  {bevel:2,face:20,tol:1.1},
  {bevel:2,face:32,tol:1.6},
  {bevel:1,face:64,tol:2.4},
  {bevel:1,face:1e9,tol:3.5},
  {bevel:0,face:1e9,tol:5}
];
let model3dTune=MODEL3D_LADDER[0];
let model3dOpt={on:true,target:10000,step:0,triangles:0,over:false};

function setModel3DStatus(message,type='') {
  const node=document.getElementById('model3d-status');
  node.textContent=message;
  node.className=\`model3d-status\${type ? \` \${type}\` : ''}\`;
}

function model3DColorDistance(data,a,b) {
  const r=data[a]-data[b],g=data[a+1]-data[b+1],bl=data[a+2]-data[b+2];
  return Math.sqrt(r*r+g*g+bl*bl);
}
function removeModel3DBackground(context,width,height,tolerance) {
  const image=context.getImageData(0,0,width,height), data=image.data;
  const corners=[0,(width-1)*4,((height-1)*width)*4,(height*width-1)*4];
  if(corners.some(offset=>data[offset+3]<245)) return image;
  const background=[0,0,0];
  corners.forEach(offset=>{for(let c=0;c<3;c++) background[c]+=data[offset+c]/4});
  const near=corners.filter(offset=>{
    const r=data[offset]-background[0],g=data[offset+1]-background[1],b=data[offset+2]-background[2];
    return Math.sqrt(r*r+g*g+b*b)<=tolerance*1.8;
  }).length;
  if(near<3) return image;
  for(let offset=0;offset<data.length;offset+=4){
    if(data[offset+3]<245) continue;
    const r=data[offset]-background[0],g=data[offset+1]-background[1],b=data[offset+2]-background[2];
    if(Math.sqrt(r*r+g*g+b*b)<=tolerance) data[offset+3]=0;
  }
  return image;
}
function scanModel3DCanvas(canvas) {
  const context=canvas.getContext('2d',{willReadFrequently:true});
  const image=context.getImageData(0,0,canvas.width,canvas.height), data=image.data;
  let filled=0,boundary=0,minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
  const isSolid=(x,y)=>x>=0&&y>=0&&x<canvas.width&&y<canvas.height&&data[(y*canvas.width+x)*4+3]>=16;
  for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) if(isSolid(x,y)){
    filled++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    if(!isSolid(x,y-1)) boundary++;if(!isSolid(x+1,y)) boundary++;
    if(!isSolid(x,y+1)) boundary++;if(!isSolid(x-1,y)) boundary++;
  }
  return {context,image,filled,boundary,triangles:filled*4+boundary*2,minX,minY,maxX,maxY};
}
function prepareModel3DGrid(bitmap,removeBg,tolerance,budget) {
  const maxDimension=budget<=6000?320:budget<=12000?448:640;
  const scale=Math.min(4,maxDimension/Math.max(bitmap.width,bitmap.height));
  const source=document.createElement('canvas');
  source.width=Math.max(1,Math.round(bitmap.width*scale));source.height=Math.max(1,Math.round(bitmap.height*scale));
  let context=source.getContext('2d',{willReadFrequently:true});
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,source.width,source.height);
  if(removeBg) context.putImageData(removeModel3DBackground(context,source.width,source.height,tolerance),0,0);
  let scan=scanModel3DCanvas(source);
  if(!scan.filled) throw new Error('Siluet tidak ditemukan. Matikan hapus latar atau pilih gambar lain.');
  const crop=document.createElement('canvas');
  crop.width=scan.maxX-scan.minX+1;crop.height=scan.maxY-scan.minY+1;
  crop.getContext('2d',{willReadFrequently:true}).drawImage(source,scan.minX,scan.minY,crop.width,crop.height,0,0,crop.width,crop.height);
  const finalCanvas=crop,finalScan=scanModel3DCanvas(finalCanvas);
  if(!finalScan.filled) throw new Error('Gambar terlalu tipis untuk dibuat sebagai mesh.');
  const pixels=finalScan.image.data, mask=new Uint8Array(finalCanvas.width*finalCanvas.height);
  for(let i=0;i<mask.length;i++) mask[i]=pixels[i*4+3]>=16?1:0;
  return {width:finalCanvas.width,height:finalCanvas.height,pixels,mask,filled:finalScan.filled,triangles:finalScan.triangles};
}
async function buildModel3D() {
  if(!model3dFile) return;
  const token=++model3dBuildToken;
  model3dGrid=null;model3dMeshData=null;updateModel3DOptimizeUI(0);
  document.getElementById('model3d-export').hidden=true;
  document.getElementById('model3d-viewport').classList.remove('has-model');
  if(model3dRenderState?.mesh){model3dRenderState.scene.remove(model3dRenderState.mesh);model3dRenderState.mesh.geometry.dispose();model3dRenderState.mesh.material.forEach(material=>{material.map?.dispose();material.dispose()});model3dRenderState.mesh=null}
  setModel3DStatus('Menganalisis gambar dan membentuk siluet...');
  let bitmap;
  try {
    bitmap=await createImageBitmap(model3dFile);
    if(bitmap.width>10000||bitmap.height>10000||bitmap.width*bitmap.height>40000000) throw new Error('Resolusi gambar terlalu besar. Gunakan gambar maksimal 40 megapiksel.');
    const tolerance=Number(document.getElementById('model3d-tolerance').value);
    model3dGrid=prepareModel3DGrid(bitmap,document.getElementById('model3d-remove-bg').checked,tolerance,model3dBudget);
    if(token!==model3dBuildToken) return;
    await rebuildModel3D(token);
  } catch(error) {
    if(token===model3dBuildToken) setModel3DStatus(error.message||'Gagal membentuk mesh dari gambar.','error');
  } finally { if(bitmap) bitmap.close(); }
}
function setModel3DBudget(button) {
  model3dBudget=Number(button.dataset.budget);
  document.querySelectorAll('.model3d-quality button').forEach(item=>item.classList.toggle('active',item===button));
  if(model3dFile) buildModel3D();
}
function chooseModel3DFile(file) {
  if(!file) return;
  if(!/^image\\/(png|jpeg|webp)$/.test(file.type)||file.size>15*1024*1024){model3dFile=null;model3dGrid=null;model3dMeshData=null;document.getElementById('model3d-export').hidden=true;document.getElementById('model3d-viewport').classList.remove('has-model');setModel3DStatus('Pilih PNG, JPG, atau WebP maksimal 15 MB.','error');return}
  model3dFile=file;
  document.getElementById('model3d-file-name').textContent=file.name;
  document.getElementById('model3d-file-meta').textContent=\`\${(file.size/1048576).toFixed(2)} MB · Gambar diproses lokal\`;
  buildModel3D();
}
function model3DContourArea(points) {
  let area=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-b[0]*a[1]}
  return area/2;
}
function model3DPointInPolygon(point,polygon) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function simplifyModel3DContour(points) {
  return points.filter((point,index)=>{
    const prev=points[(index+points.length-1)%points.length],next=points[(index+1)%points.length];
    return Math.abs((point[0]-prev[0])*(next[1]-point[1])-(point[1]-prev[1])*(next[0]-point[0]))>1e-5;
  });
}
function simplifyModel3DClosedContour(points,tolerance) {
  const clean=simplifyModel3DContour(points);
  if(clean.length<9) return clean;
  let split=1,farthest=0;
  for(let i=1;i<clean.length;i++){
    const dx=clean[i][0]-clean[0][0],dy=clean[i][1]-clean[0][1],distance=dx*dx+dy*dy;
    if(distance>farthest){farthest=distance;split=i}
  }
  const reduce=contour=>{
    const keep=new Uint8Array(contour.length),stack=[[0,contour.length-1]],toleranceSquared=tolerance*tolerance;
    keep[0]=keep[contour.length-1]=1;
    while(stack.length){
      const [start,end]=stack.pop(),a=contour[start],b=contour[end];
      const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
      let farIndex=-1,farDistance=toleranceSquared;
      for(let i=start+1;i<end;i++){
        const point=contour[i],t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)):0;
        const px=point[0]-(a[0]+dx*t),py=point[1]-(a[1]+dy*t),distance=px*px+py*py;
        if(distance>farDistance){farDistance=distance;farIndex=i}
      }
      if(farIndex>=0){keep[farIndex]=1;stack.push([start,farIndex],[farIndex,end])}
    }
    return contour.filter((point,index)=>keep[index]);
  };
  const left=reduce(clean.slice(0,split+1));
  const right=reduce(clean.slice(split).concat([clean[0]]));
  const result=left.concat(right.slice(1,-1));
  return result.length>=4?result:clean;
}
function smoothModel3DContour(points,amount,extra=0) {
  let result=simplifyModel3DContour(points);
  const iterations=Math.max(1,Math.min(4,Math.round(amount*1.6)));
  for(let pass=0;pass<iterations;pass++){
    const next=[];
    for(let i=0;i<result.length;i++){
      const a=result[i],b=result[(i+1)%result.length];
      next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);
    }
    result=next;
  }
  return result.length>=4?simplifyModel3DClosedContour(result,.35+amount*.25+extra):simplifyModel3DContour(points);
}
function traceModel3DContours(grid) {
  const edges=[],outgoing=new Map(),width=grid.width,height=grid.height;
  const solid=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&grid.mask[y*width+x];
  const key=(x,y)=>y*(width+1)+x;
  const add=(x1,y1,x2,y2,direction)=>{
    const edge={x:x1,y:y1,start:key(x1,y1),end:key(x2,y2),direction,used:false},index=edges.length;
    edges.push(edge);
    if(!outgoing.has(edge.start)) outgoing.set(edge.start,[]);
    outgoing.get(edge.start).push(index);
  };
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) if(solid(x,y)){
    if(!solid(x,y-1)) add(x,y,x+1,y,0);
    if(!solid(x+1,y)) add(x+1,y,x+1,y+1,1);
    if(!solid(x,y+1)) add(x+1,y+1,x,y+1,2);
    if(!solid(x-1,y)) add(x,y+1,x,y,3);
  }
  const loops=[];
  for(let first=0;first<edges.length;first++){
    if(edges[first].used) continue;
    const points=[],start=edges[first].start;
    let current=first,closed=false;
    for(let guard=0;guard<=edges.length;guard++){
      const edge=edges[current];if(edge.used) break;
      edge.used=true;points.push([edge.x,edge.y]);
      if(edge.end===start){closed=true;break}
      const candidates=(outgoing.get(edge.end)||[]).filter(index=>!edges[index].used);
      if(!candidates.length) break;
      const priority={1:0,0:1,3:2,2:3};
      candidates.sort((a,b)=>priority[(edges[a].direction-edge.direction+4)%4]-priority[(edges[b].direction-edge.direction+4)%4]);
      current=candidates[0];
    }
    const contour=simplifyModel3DContour(points);
    const area=contour.length>=4?model3DContourArea(contour):0;
    if(closed&&contour.length>=4&&Math.abs(area)>.5) loops.push({points:contour,area});
  }
  return loops;
}
function buildModel3DGeometry(THREE,grid) {
  const loops=traceModel3DContours(grid),outers=loops.filter(loop=>loop.area>0).map(loop=>({...loop,holes:[]}));
  const holes=loops.filter(loop=>loop.area<0);
  for(const hole of holes){
    let parent=null;
    for(const outer of outers) if(model3DPointInPolygon(hole.points[0],outer.points)&&(!parent||Math.abs(outer.area)<Math.abs(parent.area))) parent=outer;
    if(parent) parent.holes.push(hole);
  }
  if(!outers.length) throw new Error('Tidak dapat menutup kontur gambar. Coba naikkan toleransi latar.');
  const size=Number(document.getElementById('model3d-size').value),unit=size/Math.max(grid.width,grid.height);
  const depth=Number(document.getElementById('model3d-depth').value),smoothness=Number(document.getElementById('model3d-smoothness').value);
  const bevelThickness=Math.min(depth*.16,.18),bevelSize=unit*Math.min(1.25,.25+smoothness*.38);
  const partData=[];
  let vertexCount=0;
  const addPath=(path,points)=>{
    const smoothed=smoothModel3DContour(points,smoothness,model3dTune.tol||0),first=smoothed[0];
    path.moveTo((first[0]-grid.width/2)*unit,(grid.height/2-first[1])*unit);
    for(let i=1;i<smoothed.length;i++) path.lineTo((smoothed[i][0]-grid.width/2)*unit,(grid.height/2-smoothed[i][1])*unit);
    path.closePath();
  };
  for(const outer of outers){
    const shape=new THREE.Shape();addPath(shape,outer.points);
    for(const hole of outer.holes){const path=new THREE.Path();addPath(path,hole.points);shape.holes.push(path)}
    const bevelSeg=model3dTune.bevel==null?Math.max(8,Math.round(8+smoothness*4)):model3dTune.bevel,bt=bevelSeg>0?bevelThickness:0;
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.01,depth-2*bt),steps:1,bevelEnabled:bevelSeg>0,bevelSegments:Math.max(1,bevelSeg),bevelThickness,bevelSize});
    geometry.translate(0,0,-depth/2+bt);
    const positions=geometry.attributes.position.array.slice(),normals=geometry.attributes.normal.array.slice();
    partData.push({positions,normals,groups:geometry.groups.map(group=>({...group,start:group.start+vertexCount}))});
    vertexCount+=positions.length/3;geometry.dispose();
  }
  const positions=new Float32Array(vertexCount*3),normals=new Float32Array(vertexCount*3),groups=[];
  let offset=0;
  for(const part of partData){positions.set(part.positions,offset*3);normals.set(part.normals,offset*3);groups.push(...part.groups);offset+=part.positions.length/3}
  const sideNormalSums=new Map();
  for(const group of groups) if(group.materialIndex===1) for(let vertex=group.start;vertex<group.start+group.count;vertex++){
    const offset=vertex*3,key=\`\${Math.round(positions[offset]*1e5)},\${Math.round(positions[offset+1]*1e5)},\${Math.round(positions[offset+2]*1e5)}\`;
    const sum=sideNormalSums.get(key)||[0,0,0];
    sum[0]+=normals[offset];sum[1]+=normals[offset+1];sum[2]+=normals[offset+2];sideNormalSums.set(key,sum);
  }
  for(const group of groups) if(group.materialIndex===1) for(let vertex=group.start;vertex<group.start+group.count;vertex++){
    const offset=vertex*3,key=\`\${Math.round(positions[offset]*1e5)},\${Math.round(positions[offset+1]*1e5)},\${Math.round(positions[offset+2]*1e5)}\`,sum=sideNormalSums.get(key),length=Math.hypot(sum[0],sum[1],sum[2])||1;
    normals[offset]=sum[0]/length;normals[offset+1]=sum[1]/length;normals[offset+2]=sum[2]/length;
  }
  const densePositions=[],denseNormals=[],denseGroups=[];
  const faceMaxEdge=model3dTune.face==null?(grid.width>=560?4:grid.width>=380?5:6):model3dTune.face;
  const readVertex=index=>({position:[positions[index*3],positions[index*3+1],positions[index*3+2]],normal:[normals[index*3],normals[index*3+1],normals[index*3+2]]});
  const appendVertex=vertex=>{densePositions.push(...vertex.position);denseNormals.push(...vertex.normal)};
  const middle=(a,b)=>{
    const normal=a.normal.map((value,index)=>value+b.normal[index]),length=Math.hypot(...normal)||1;
    return {position:a.position.map((value,index)=>(value+b.position[index])/2),normal:normal.map(value=>value/length)};
  };
  const edgeLength=(a,b)=>Math.hypot((a.position[0]-b.position[0])/unit,(a.position[1]-b.position[1])/unit);
  const subdivide=(a,b,c,depth=0)=>{
    const ab=edgeLength(a,b),bc=edgeLength(b,c),ca=edgeLength(c,a),longest=Math.max(ab,bc,ca);
    if(longest<=faceMaxEdge||depth>=12){appendVertex(a);appendVertex(b);appendVertex(c);return}
    if(ab>=bc&&ab>=ca){const m=middle(a,b);subdivide(a,m,c,depth+1);subdivide(m,b,c,depth+1)}
    else if(bc>=ca){const m=middle(b,c);subdivide(b,m,a,depth+1);subdivide(m,c,a,depth+1)}
    else {const m=middle(c,a);subdivide(c,m,b,depth+1);subdivide(m,a,b,depth+1)}
  };
  for(const group of groups){
    const start=densePositions.length/3;
    for(let vertex=group.start;vertex<group.start+group.count;vertex+=3){
      const a=readVertex(vertex),b=readVertex(vertex+1),c=readVertex(vertex+2);
      if(group.materialIndex===0) subdivide(a,b,c);
      else {appendVertex(a);appendVertex(b);appendVertex(c)}
    }
    const count=densePositions.length/3-start;
    if(count) denseGroups.push({start,count,materialIndex:group.materialIndex});
  }
  const finalPositions=new Float32Array(densePositions),finalNormals=new Float32Array(denseNormals),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(finalPositions,3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(finalNormals,3));
  denseGroups.forEach(group=>geometry.addGroup(group.start,group.count,group.materialIndex));
  geometry.computeBoundingSphere();
  return {geometry,positions:finalPositions,normals:finalNormals,groups:denseGroups};
}
function model3DRender() {
  const state=model3dRenderState;
  if(!state||!model3dPageActive||document.hidden){model3dRenderFrame=0;return}
  if(document.getElementById('model3d-auto-rotate').checked&&!state.pointers.size) state.theta+=.0008;
  const sin=Math.sin(state.phi),radius=state.distance;
  state.camera.position.set(radius*sin*Math.sin(state.theta),radius*Math.cos(state.phi),radius*sin*Math.cos(state.theta));
  state.camera.lookAt(0,0,0);
  state.renderer.render(state.scene,state.camera);
  model3dRenderFrame=requestAnimationFrame(model3DRender);
}
/* model3dPageActive hanya penanda halaman aktif (selalu true di versi mandiri). Jangan diubah saat tab disembunyikan,
   kalau tidak loop render tidak pernah menyala lagi setelah tab kembali terlihat. */
function setModel3DRendering(active) {
  if(!model3dRenderState) return;
  cancelAnimationFrame(model3dRenderFrame);model3dRenderFrame=0;
  if(active&&model3dPageActive&&!document.hidden) model3dRenderFrame=requestAnimationFrame(model3DRender);
}
function ensureModel3DLoop() { if(model3dRenderState&&!model3dRenderFrame&&!document.hidden) setModel3DRendering(true); }
function resetModel3DView() {
  const state=model3dRenderState;if(!state) return;
  state.theta=.48;state.phi=1.08;state.distance=Math.max(8,Number(document.getElementById('model3d-size').value)*2.55);
  state.pointers.clear();ensureModel3DLoop();
}
/* Kontrol putar/zoom. Titik sentuh yang "nyangkut" (pointerup tidak pernah datang) dibersihkan supaya
   satu jari tidak dianggap pinch dan auto-rotate tidak berhenti selamanya. */
function attachModel3DControls(canvas,state) {
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const end=event=>{state.pointers.delete(event.pointerId)};
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0) return;
    if(event.isPrimary) state.pointers.clear();
    try{canvas.setPointerCapture(event.pointerId)}catch(error){}
    state.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    ensureModel3DLoop();
  });
  canvas.addEventListener('pointermove',event=>{
    const point=state.pointers.get(event.pointerId);if(!point) return;
    if(event.pointerType!=='touch'&&event.buttons===0){state.pointers.delete(event.pointerId);return}
    if(state.pointers.size>1){
      const other=[...state.pointers.entries()].find(([id])=>id!==event.pointerId)?.[1];
      const oldDistance=Math.hypot(point.x-other.x,point.y-other.y),newDistance=Math.hypot(event.clientX-other.x,event.clientY-other.y);
      if(newDistance>0&&oldDistance>0) state.distance=clamp(state.distance*oldDistance/newDistance,5,42);
    } else {state.theta-=(event.clientX-point.x)*.009;state.phi=clamp(state.phi-(event.clientY-point.y)*.009,.15,Math.PI-.15)}
    point.x=event.clientX;point.y=event.clientY;
    ensureModel3DLoop();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name,end);
  canvas.addEventListener('contextmenu',event=>{event.preventDefault();state.pointers.clear()});
  canvas.addEventListener('wheel',event=>{event.preventDefault();state.distance=clamp(state.distance*(event.deltaY>0?1.08:.92),5,42);ensureModel3DLoop()},{passive:false});
  canvas.addEventListener('dblclick',resetModel3DView);
  canvas.addEventListener('webglcontextrestored',()=>setModel3DRendering(true));
  window.addEventListener('blur',()=>state.pointers.clear());
}
async function initModel3DRenderer() {
  if(!model3dThreePromise) model3dThreePromise=import('https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js');
  const THREE=await model3dThreePromise;
  if(model3dRenderState) return {THREE,state:model3dRenderState};
  const canvas=document.getElementById('model3d-canvas'),viewport=document.getElementById('model3d-viewport');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(34,1,.1,100);
  scene.add(new THREE.HemisphereLight(0xe9f7ed,0x526156,2.2));
  const key=new THREE.DirectionalLight(0xffffff,2.7);key.position.set(-4,7,8);scene.add(key);
  const rim=new THREE.DirectionalLight(0xffffff,1.2);rim.position.set(5,2,-5);scene.add(rim);
  const state={THREE,renderer,scene,camera,mesh:null,theta:.48,phi:1.08,distance:16,pointers:new Map(),resizeObserver:null};
  model3dRenderState=state;
  const resize=()=>{
    const width=Math.max(1,viewport.clientWidth),height=Math.max(1,viewport.clientHeight);
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  };
  state.resizeObserver=new ResizeObserver(resize);state.resizeObserver.observe(viewport);resize();
  attachModel3DControls(canvas,state);
  if(model3dPageActive) setModel3DRendering(true);
  return {THREE,state};
}
function model3DCountTriangles(built) { return built.groups.reduce((sum,group)=>sum+group.count/3,0); }
/* Cari langkah paling detail yang masih muat di target segitiga (pencarian biner pada tangga). */
function optimizeModel3DGeometry(THREE,grid,target,build=buildModel3DGeometry) {
  const cache=new Map();
  const attempt=step=>{
    if(!cache.has(step)){model3dTune=MODEL3D_LADDER[step];const built=build(THREE,grid);cache.set(step,{step,built,triangles:model3DCountTriangles(built)})}
    return cache.get(step);
  };
  let lo=0,hi=MODEL3D_LADDER.length-1,pick=attempt(0),over=false;
  if(pick.triangles>target){
    const last=attempt(hi);
    if(last.triangles>target){pick=last;over=true}
    else{
      while(hi-lo>1){const mid=(lo+hi)>>1;if(attempt(mid).triangles<=target) hi=mid;else lo=mid}
      pick=attempt(hi);
    }
  }
  for(const entry of cache.values()) if(entry!==pick) entry.built.geometry?.dispose?.();
  model3dTune=MODEL3D_LADDER[pick.step];
  return {built:pick.built,step:pick.step,triangles:pick.triangles,over};
}
function updateModel3DOptimizeUI(triangles) {
  const on=model3dOpt.on,target=model3dOpt.target;
  const fmt=value=>Math.round(value).toLocaleString('id-ID');
  const bar=document.getElementById('model3d-opt-fill'),count=document.getElementById('model3d-opt-count'),state=document.getElementById('model3d-opt-state'),detail=document.getElementById('model3d-opt-detail');
  document.getElementById('model3d-optimize-card').classList.toggle('is-off',!on);
  if(!triangles){count.textContent=\`– / \${fmt(target)} segitiga\`;bar.style.width='0%';state.textContent=on?'Menunggu gambar':'Optimasi mati';state.dataset.tone='';detail.textContent='Pilih gambar, mesh akan disesuaikan otomatis ke target.';return}
  const ratio=Math.min(100,triangles/target*100);
  count.textContent=\`\${fmt(triangles)} / \${fmt(target)} segitiga\`;bar.style.width=\`\${ratio}%\`;
  if(!on){state.textContent=triangles<=target?'Di bawah target':'Di atas target';state.dataset.tone=triangles<=target?'ok':'warn';detail.textContent='Optimasi otomatis mati, mesh memakai pengaturan manual.';return}
  state.textContent=model3dOpt.over?'Masih di atas target':'Lolos target';state.dataset.tone=model3dOpt.over?'warn':'ok';
  const t=model3dTune,parts=[t.bevel==null?'bevel penuh':t.bevel===0?'tanpa bevel':\`bevel \${t.bevel} segmen\`,t.face==null||t.face<1e8?(t.face==null?'permukaan padat':\`permukaan lebih jarang\`):'permukaan tanpa subdivisi',t.tol?\`kontur disederhanakan \${t.tol.toFixed(1)} px\`:'kontur penuh'];
  detail.textContent=model3dOpt.step===0?'Detail penuh sudah muat di target, tidak ada yang dikurangi.':\`Detail dikurangi bertahap: \${parts.join(', ')}.\`+(model3dOpt.over?' Turunkan ukuran gambar atau pilih detail Ringan.':'');
}
function setModel3DOptimizeTarget(button) {
  model3dOpt.target=Number(button.dataset.target);
  document.querySelectorAll('.model3d-target button').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',active)});
  if(model3dGrid) scheduleModel3DRebuild();else updateModel3DOptimizeUI(0);
}
async function rebuildModel3D(token=model3dBuildToken) {
  if(!model3dGrid) return;
  const {THREE,state}=await initModel3DRenderer();
  if(token!==model3dBuildToken) return;
  let built;
  if(model3dOpt.on){
    const result=optimizeModel3DGeometry(THREE,model3dGrid,model3dOpt.target);
    built=result.built;model3dOpt.step=result.step;model3dOpt.triangles=result.triangles;model3dOpt.over=result.over;
  } else {
    model3dTune=MODEL3D_LADDER[0];built=buildModel3DGeometry(THREE,model3dGrid);
    model3dOpt.step=0;model3dOpt.triangles=model3DCountTriangles(built);model3dOpt.over=model3dOpt.triangles>model3dOpt.target;
  }
  if(state.mesh){state.scene.remove(state.mesh);state.mesh.geometry.dispose();state.mesh.material.forEach(material=>{material.map?.dispose();material.dispose()})}
  const front=new THREE.MeshStandardMaterial({color:0xeeeeee,roughness:.6,metalness:0,side:THREE.DoubleSide});
  const sides=new THREE.MeshStandardMaterial({color:0xeeeeee,roughness:.6,metalness:0,side:THREE.DoubleSide});
  state.mesh=new THREE.Mesh(built.geometry,[front,sides]);state.scene.add(state.mesh);state.distance=Math.max(8,Number(document.getElementById('model3d-size').value)*2.55);
  model3dMeshData={positions:built.positions,normals:built.normals,groups:built.groups};
  document.getElementById('model3d-viewport').classList.add('has-model');
  document.getElementById('model3d-export').hidden=false;
  const size=Number(document.getElementById('model3d-size').value),unit=size/Math.max(model3dGrid.width,model3dGrid.height);
  const width=model3dGrid.width*unit,height=model3dGrid.height*unit;
  document.getElementById('model3d-dimensions').textContent=\`\${width.toFixed(1)} × \${height.toFixed(1)} × \${Number(document.getElementById('model3d-depth').value).toFixed(1)} studs\`;
  const triangleCount=built.groups.reduce((sum,group)=>sum+group.count/3,0);
  document.getElementById('model3d-triangle-count').textContent=\`\${Math.round(triangleCount).toLocaleString('id-ID')} segitiga · kontur \${model3dGrid.width} × \${model3dGrid.height}\`;
  document.getElementById('model3d-depth-value').textContent=\`\${Number(document.getElementById('model3d-depth').value).toFixed(1)} studs\`;
  document.getElementById('model3d-size-value').textContent=\`\${size.toFixed(1)} studs\`;
  document.getElementById('model3d-smoothness-value').textContent=\`\${Number(document.getElementById('model3d-smoothness').value).toFixed(1)} px\`;
  updateModel3DOptimizeUI(model3dOpt.triangles);
  setModel3DStatus(model3dOpt.on?(model3dOpt.over?'Mesh siap, tetapi masih di atas target Roblox. Lihat kartu Optimasi Roblox.':'Mesh putih polos siap dan sudah dioptimasi untuk Roblox.'):'Mesh putih polos padat tanpa tekstur siap.','success');
  setModel3DRendering(model3dPageActive);
}
function scheduleModel3DRebuild() {
  document.getElementById('model3d-depth-value').textContent=\`\${Number(document.getElementById('model3d-depth').value).toFixed(1)} studs\`;
  document.getElementById('model3d-size-value').textContent=\`\${Number(document.getElementById('model3d-size').value).toFixed(1)} studs\`;
  document.getElementById('model3d-smoothness-value').textContent=\`\${Number(document.getElementById('model3d-smoothness').value).toFixed(1)} px\`;
  clearTimeout(model3dMeshTimer);model3dMeshTimer=setTimeout(()=>rebuildModel3D().catch(error=>setModel3DStatus(error.message||'Preview 3D tidak tersedia.','error')),90);
}
function model3DBaseName() {
  return (model3dFile?.name||'Luma_Mesh').replace(/\\.[^.]+$/,'').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||'Luma_Mesh';
}
function downloadModel3DFile(blob,name) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;link.hidden=true;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function createModel3DGLTF() {
  if(!model3dMeshData) throw new Error('Buat mesh terlebih dahulu.');
  const data=model3dMeshData,vertexCount=data.positions.length/3;
  const indexType=vertexCount<=65535?Uint16Array:Uint32Array,indexComponent=indexType===Uint16Array?5123:5125;
  const grouped=[[],[]];
  for(const group of data.groups){const target=grouped[group.materialIndex]||grouped[1];for(let i=group.start;i<group.start+group.count;i++) target.push(i)}
  if(model3dOpt.on){grouped[0]=grouped[0].concat(grouped[1]);grouped[1]=[]}
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<data.positions.length;i+=3) for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],data.positions[i+axis]);max[axis]=Math.max(max[axis],data.positions[i+axis])}
  const plans=[
    {array:data.positions,target:34962,componentType:5126,type:'VEC3',count:vertexCount,min,max},
    {array:data.normals,target:34962,componentType:5126,type:'VEC3',count:vertexCount},
    ...grouped.map((values,material)=>{
      let minIndex=0,maxIndex=0;
      if(values.length){minIndex=values[0];maxIndex=values[0];for(let i=1;i<values.length;i++){minIndex=Math.min(minIndex,values[i]);maxIndex=Math.max(maxIndex,values[i])}}
      return {array:new indexType(values),target:34963,componentType:indexComponent,type:'SCALAR',count:values.length,material,min:[minIndex],max:[maxIndex]};
    }).filter(plan=>plan.count)
  ];
  let byteLength=0;
  for(const plan of plans){byteLength=(byteLength+3)&~3;plan.byteOffset=byteLength;plan.byteLength=plan.array.byteLength;byteLength+=plan.byteLength}
  const binary=new ArrayBuffer(byteLength),bufferViews=[],accessors=[],indexAccessorByMaterial={};
  plans.forEach((plan,index)=>{
    new Uint8Array(binary,plan.byteOffset,plan.byteLength).set(new Uint8Array(plan.array.buffer,plan.array.byteOffset,plan.byteLength));
    bufferViews.push({buffer:0,byteOffset:plan.byteOffset,byteLength:plan.byteLength,target:plan.target});
    const accessor={bufferView:index,componentType:plan.componentType,count:plan.count,type:plan.type};
    if(plan.min) accessor.min=plan.min;if(plan.max) accessor.max=plan.max;
    accessors.push(accessor);
    if(plan.material!==undefined) indexAccessorByMaterial[plan.material]=index;
  });
  const primitives=[0,1].filter(material=>indexAccessorByMaterial[material]!==undefined).map(material=>({attributes:{POSITION:0,NORMAL:1},indices:indexAccessorByMaterial[material],material,mode:4}));
  const base=model3DBaseName();
  const material=name=>({name,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1},doubleSided:true});
  const gltf={asset:{version:'2.0',generator:'Luma Studio 3D Maker'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:base}],meshes:[{name:base,primitives}],materials:model3dOpt.on?[material('White mesh')]:[material('White front and back'),material('White sides')],buffers:[{uri:\`\${base}.bin\`,byteLength}],bufferViews,accessors};
  return {base,json:JSON.stringify(gltf),binary};
}
function exportModel3DGLTF() {
  try {
    const output=createModel3DGLTF();
    downloadModel3DFile(new Blob([output.json],{type:'model/gltf+json'}),\`\${output.base}.gltf\`);
    downloadModel3DFile(new Blob([output.binary],{type:'application/octet-stream'}),\`\${output.base}.bin\`);
    setModel3DStatus('glTF putih polos tanpa tekstur dan BIN diunduh. Simpan keduanya dalam satu folder, lalu impor file .gltf.','success');
  } catch(error) { setModel3DStatus(error.message||'Ekspor glTF gagal.','error'); }
}
function exportModel3DOBJ() {
  if(!model3dMeshData){setModel3DStatus('Buat mesh terlebih dahulu.','error');return}
  const data=model3dMeshData,vertexCount=data.positions.length/3,lines=['# Luma Studio - extruded image mesh',\`o \${model3DBaseName()}\`];
  for(let i=0;i<data.positions.length;i+=3) lines.push(\`v \${data.positions[i].toFixed(5)} \${data.positions[i+1].toFixed(5)} \${data.positions[i+2].toFixed(5)}\`);
  for(let i=0;i<data.normals.length;i+=3) lines.push(\`vn \${data.normals[i].toFixed(4)} \${data.normals[i+1].toFixed(4)} \${data.normals[i+2].toFixed(4)}\`);
  const base=model3DBaseName(),material=['newmtl LumaFront','Ka 1 1 1','Kd 1 1 1','Ks 0 0 0','illum 1',''].concat(model3dOpt.on?[]:['newmtl LumaSides','Ka 1 1 1','Kd 1 1 1','Ks 0 0 0','illum 1','']);
  lines.splice(1,0,\`mtllib \${base}.mtl\`);
  for(const group of data.groups){
    lines.push(model3dOpt.on||group.materialIndex===0?'usemtl LumaFront':'usemtl LumaSides');
    for(let i=group.start+1;i<group.start+group.count;i+=3) lines.push(\`f \${i}//\${i} \${i+1}//\${i+1} \${i+2}//\${i+2}\`);
  }
  downloadModel3DFile(new Blob([lines.join('\\n')],{type:'text/plain'}),\`\${base}.obj\`);
  downloadModel3DFile(new Blob([material.join('\\n')],{type:'text/plain'}),\`\${base}.mtl\`);
  setModel3DStatus('OBJ dan MTL putih polos tanpa tekstur diunduh.','success');
}

document.getElementById('model3d-file').addEventListener('change',event=>chooseModel3DFile(event.target.files[0]));
const model3DDrop=document.getElementById('model3d-drop-zone');
model3DDrop.addEventListener('dragover',event=>{event.preventDefault();model3DDrop.classList.add('drag-over')});
model3DDrop.addEventListener('dragleave',()=>model3DDrop.classList.remove('drag-over'));
model3DDrop.addEventListener('drop',event=>{event.preventDefault();model3DDrop.classList.remove('drag-over');chooseModel3DFile(event.dataTransfer.files[0])});
document.getElementById('model3d-remove-bg').addEventListener('change',()=>buildModel3D());
document.getElementById('model3d-tolerance').addEventListener('input',event=>{document.getElementById('model3d-tolerance-value').textContent=event.target.value});
document.getElementById('model3d-tolerance').addEventListener('change',()=>{if(model3dFile) buildModel3D()});
document.getElementById('model3d-depth').addEventListener('input',scheduleModel3DRebuild);
document.getElementById('model3d-size').addEventListener('input',scheduleModel3DRebuild);
document.getElementById('model3d-smoothness').addEventListener('input',scheduleModel3DRebuild);
document.getElementById('model3d-optimize').addEventListener('change',event=>{model3dOpt.on=event.target.checked;if(model3dGrid) scheduleModel3DRebuild();else updateModel3DOptimizeUI(0)});
document.getElementById('model3d-auto-rotate').addEventListener('change',()=>setModel3DRendering(true));
document.addEventListener('visibilitychange',()=>{if(model3dRenderState) model3dRenderState.pointers.clear();setModel3DRendering(!document.hidden)});
window.addEventListener('pageshow',()=>setModel3DRendering(true));
window.addEventListener('focus',ensureModel3DLoop);
document.getElementById('model3d-reset').addEventListener('click',resetModel3DView);


updateModel3DOptimizeUI(0);
/* isi track slider */
(function(){
  const paint=el=>el.style.setProperty('--fill',((el.value-el.min)/(el.max-el.min)*100)+'%');
  document.querySelectorAll('.model3d-control input[type=range]').forEach(el=>{paint(el);el.addEventListener('input',()=>paint(el))});
})();

</script>
</body>
</html>
`;
