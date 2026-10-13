// Sumber tool VIP Plus "Seamless Texture". Disajikan lewat /api/tool setelah cek VIP Plus; jangan taruh sebagai file statis.
// Edit: di dalam template literal ini jangan pakai backtick, "${" atau backslash (kecuali interpolasi kerangka di bawah).
import { SHELL_CSS, SHELL_JS } from "./_shell.js";

export default `<!DOCTYPE html>
<html lang="id" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src blob: data:; font-src data:; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Seamless Texture</title>
<style>
${SHELL_CSS}
.range-row{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px}
input[type=range]{width:160px;accent-color:var(--text)}
input[type=number],input[type=text]{min-height:42px;padding:0 14px;border:1px solid var(--line);border-radius:999px;background:var(--field);color:var(--text);font:inherit}
input[type=number]{width:96px}
input[type=text]{width:min(240px,100%)}
input:focus-visible{outline:2px solid var(--text);outline-offset:2px}
.options{display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px;margin-top:14px}
.preview-wrap{margin-top:12px;overflow:hidden;border:1px solid var(--line);border-radius:22px;background:#000}
.preview-wrap canvas{display:block;width:100%;height:auto;aspect-ratio:1}
.seg{display:inline-flex;padding:3px;border:1px solid var(--line);border-radius:999px;background:var(--field)}
.seg button{min-height:34px;padding:0 14px;border:0;border-radius:999px;background:transparent;color:var(--muted);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--btn);color:var(--btn-ink)}
.seg button:focus-visible{outline:2px solid var(--text);outline-offset:2px}
.btn.secondary{background:var(--field);color:var(--text);box-shadow:none;border:1px solid var(--line)}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
@media(max-width:420px){.actions>.btn{width:100%}input[type=range]{width:100%}.range-row{width:100%;justify-content:space-between}}
</style>
</head>
<body>
<main>
  <header class="top">
    <div class="brand">
      <span class="logo glass"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg></span>
      <div><div class="kicker">ROBLOX TOOL / TEXTURE</div><h1>Seamless Texture</h1></div>
    </div>
    <button type="button" class="icon-btn glass" id="theme-btn" hidden aria-label="Ganti tema hitam / putih"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg></button>
  </header>
  <p class="sub">Ubah foto atau gambar menjadi ubin tanpa sambungan yang bisa diulang tanpa batas di Part. Lihat hasilnya dalam susunan 3 x 3, publish ke Roblox, lalu salin script Studio yang memasangnya ke Part terpilih.</p>

  <section class="glass card" aria-labelledby="src-title">
    <h2 id="src-title">1. Pilih gambar</h2>
    <p class="help">PNG, JPG, atau WebP. Bagian tengah gambar dipotong persegi. Hasil terbaik dari tekstur yang rata (tanah, kayu, batu, kain), tanpa objek besar atau gradasi cahaya yang kuat.</p>
    <label class="drop" id="drop-zone">
      <input type="file" id="source-file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp">
      <span>
        <span class="drop-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span>
        <span class="drop-title" id="file-label">Pilih gambar tekstur</span>
        <span class="drop-meta" id="file-meta">Rekomendasi minimal 1024 x 1024 px</span>
      </span>
    </label>
    <div class="options">
      <div class="select-wrap"><label for="tile-size">Ukuran ubin</label>
        <select id="tile-size"><option value="256">256 x 256</option><option value="512" selected>512 x 512</option><option value="1024">1024 x 1024</option></select></div>
      <div class="range-row"><label for="blend">Lebar blend</label><input type="range" id="blend" min="10" max="50" step="1" value="25"><output id="blend-out" for="blend">25%</output></div>
    </div>
    <p class="help" id="blend-help" style="margin-top:10px">Blend lebih lebar membuat sambungan lebih halus tetapi detail di tepi terlihat sedikit kabur. Kalau pola terlihat berulang jelas, kecilkan; kalau masih ada garis sambungan, besarkan.</p>
    <div class="progress" id="progress" hidden><i id="progress-fill"></i></div>
    <div class="status" id="status" role="status" aria-live="polite"></div>
  </section>

  <section class="glass card" id="card-preview" aria-labelledby="prev-title" hidden>
    <div class="card-head">
      <h2 id="prev-title">2. Preview ubin</h2>
      <div class="seg" role="group" aria-label="Mode preview">
        <button type="button" data-mode="tile" aria-pressed="true">Susunan 3 x 3</button>
        <button type="button" data-mode="seam" aria-pressed="false">Cek sambungan</button>
      </div>
    </div>
    <p class="help" id="prev-help">Ubin diulang 3 x 3 seperti saat dipasang di Part.</p>
    <div class="preview-wrap"><canvas id="preview" width="768" height="768" aria-label="Preview ubin berulang"></canvas></div>
    <div class="actions">
      <button type="button" class="btn secondary" id="download-btn">Unduh PNG</button>
    </div>
  </section>

  <section class="glass card" id="card-publish" aria-labelledby="pub-title" hidden>
    <h2 id="pub-title">3. Publish ke Roblox</h2>
    <p class="help">Ubin diunggah sebagai aset gambar. Studs per ubin menentukan seberapa besar satu ubin di Part (hanya dipakai di script).</p>
    <div class="options">
      <div class="select-wrap"><label for="asset-name">Nama aset</label><input type="text" id="asset-name" maxlength="40" value="Seamless Texture" autocomplete="off"></div>
      <div class="select-wrap"><label for="studs">Studs per ubin</label><input type="number" id="studs" min="1" max="512" step="1" value="8"></div>
    </div>
    <div class="actions"><button type="button" class="btn" id="publish-btn">Publish ke Roblox</button></div>
    <div class="results" id="results">
      <div class="id-list"><div class="id-row"><b>Tile</b><code id="asset-id-text">Menunggu</code><button type="button" class="mini" id="copy-id-btn" hidden>Salin</button></div></div>
      <div class="code-wrap">
        <div class="code-head"><span>Script Roblox Studio (pilih Part dulu, jalankan di Command Bar)</span><button type="button" class="mini" id="copy-script-btn">Salin script</button></div>
        <textarea id="texture-script" class="code" readonly spellcheck="false" aria-label="Script untuk memasang tekstur ke Part terpilih"></textarea>
      </div>
    </div>
  </section>
</main>
<div id="toast" aria-live="polite"></div>

<script>
${SHELL_JS}

// ── Seamless: cross-fade tepi ──
// Gambar persegi diperbesar jadi M = N x (1 + f) lalu dilipat: di zona blend selebar B = M - N,
// piksel (x, y) dicampur dengan piksel (x + N, y), (x, y + N), (x + N, y + N). Piksel kolom N-1 dan kolom 0
// jadi bertetangga di sumber, jadi sambungan kiri-kanan dan atas-bawah dijamin mulus.
function buildSeamlessTile(bitmap, n, overlapPercent) {
  const m = Math.round(n * (1 + overlapPercent / 100));
  const b = m - n;
  const side = Math.min(bitmap.width, bitmap.height);
  const crop = document.createElement('canvas');
  crop.width = crop.height = m;
  const cropCtx = crop.getContext('2d', {willReadFrequently: true});
  cropCtx.imageSmoothingEnabled = true; cropCtx.imageSmoothingQuality = 'high';
  cropCtx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, m, m);
  const src = cropCtx.getImageData(0, 0, m, m).data;
  const weight = new Float32Array(n);
  for (let i = 0; i < n; i++) weight[i] = i < b ? smoothstep(i / b) : 1;
  const out = document.createElement('canvas');
  out.width = out.height = n;
  const outCtx = out.getContext('2d');
  const image = outCtx.createImageData(n, n);
  const dst = image.data;
  for (let y = 0; y < n; y++) {
    const ty = weight[y], y2 = y < b ? y + n : y;
    for (let x = 0; x < n; x++) {
      const tx = weight[x], x2 = x < b ? x + n : x;
      const w00 = tx * ty, w10 = (1 - tx) * ty, w01 = tx * (1 - ty), w11 = (1 - tx) * (1 - ty);
      const i00 = (y * m + x) * 4, i10 = (y * m + x2) * 4, i01 = (y2 * m + x) * 4, i11 = (y2 * m + x2) * 4, o = (y * n + x) * 4;
      for (let c = 0; c < 4; c++) dst[o + c] = src[i00 + c] * w00 + src[i10 + c] * w10 + src[i01 + c] * w01 + src[i11 + c] * w11;
    }
  }
  outCtx.putImageData(image, 0, 0);
  return out;
}

let sourceBitmap = null, tileCanvas = null, tileBlob = null, previewMode = 'tile', assetId = '', genToken = 0, regenTimer = 0;

function drawPreview() {
  if (!tileCanvas) return;
  const canvas = $('preview'), ctx = canvas.getContext('2d');
  const cell = canvas.width / 3, shift = previewMode === 'seam' ? cell / 2 : 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  for (let j = -1; j < 4; j++) for (let i = -1; i < 4; i++) ctx.drawImage(tileCanvas, i * cell - shift, j * cell - shift, cell, cell);
}

async function generateTile() {
  if (!sourceBitmap) return;
  const token = ++genToken;
  const n = Number($('tile-size').value), overlap = Number($('blend').value);
  setStatus('Membuat ubin ' + n + ' x ' + n + '...');
  await sleep(0);
  try {
    const canvas = buildSeamlessTile(sourceBitmap, n, overlap);
    const blob = await canvasToBlob(canvas);
    if (token !== genToken) return;
    tileCanvas = canvas; tileBlob = blob;
    $('card-preview').hidden = false; $('card-publish').hidden = false;
    $('publish-btn').disabled = false;
    drawPreview();
    resetResult();
    setStatus('Ubin ' + n + ' x ' + n + ' siap (' + Math.round(blob.size / 1024) + ' KB).', 'success');
  } catch (e) {
    if (token === genToken) setStatus(e.message || 'Gagal membuat ubin.', 'error');
  }
}
function scheduleGenerate() { clearTimeout(regenTimer); regenTimer = setTimeout(generateTile, 180); }

async function chooseImage(file) {
  if (!file) return;
  try {
    const bitmap = await decodeImage(file, 4096);
    if (sourceBitmap) sourceBitmap.close();
    sourceBitmap = bitmap;
    $('file-label').textContent = file.name;
    $('file-meta').textContent = bitmap.width + ' x ' + bitmap.height + ' px' + (bitmap.width !== bitmap.height ? ' (bagian tengah dipotong persegi)' : '');
    const base = file.name.replace(/[.][^.]*$/, '').replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().slice(0, 40);
    if (base) $('asset-name').value = base;
    await generateTile();
  } catch (e) {
    setStatus(e.message || 'Gambar tidak bisa dibaca.', 'error');
  }
}

function resetResult() {
  assetId = '';
  $('results').classList.remove('visible');
  $('asset-id-text').textContent = 'Menunggu';
  $('copy-id-btn').hidden = true;
  $('texture-script').value = '';
}

function buildTextureScript() {
  const studs = Math.max(1, Math.min(512, Number($('studs').value) || 8));
  return [
    '-- Pilih satu atau lebih Part di Studio, lalu jalankan di Command Bar.',
    '-- Tekstur dipasang di keenam sisi tiap Part. Hasil lama dari script ini diganti, bukan ditumpuk.',
    'local Selection = game:GetService("Selection")',
    'local ChangeHistoryService = game:GetService("ChangeHistoryService")',
    luaResolveFunction(),
    '',
    'local ASSET_ID = "' + assetId + '"',
    'local STUDS_PER_TILE = ' + studs,
    'local NAME = "SeamlessTexture"',
    '',
    'local parts = {}',
    'for _, instance in ipairs(Selection:Get()) do',
    '    if instance:IsA("BasePart") then',
    '        table.insert(parts, instance)',
    '    end',
    '    for _, descendant in ipairs(instance:GetDescendants()) do',
    '        if descendant:IsA("BasePart") then',
    '            table.insert(parts, descendant)',
    '        end',
    '    end',
    'end',
    'if #parts == 0 then',
    '    error("Pilih minimal satu Part dulu. Tidak ada yang diubah.")',
    'end',
    '',
    'local url = resolve(ASSET_ID)',
    'pcall(function() ChangeHistoryService:SetWaypoint("Sebelum pasang tekstur") end)',
    '',
    'for _, part in ipairs(parts) do',
    '    for _, child in ipairs(part:GetChildren()) do',
    '        if child:IsA("Texture") and child.Name == NAME then',
    '            child:Destroy()',
    '        end',
    '    end',
    '    for _, face in ipairs(Enum.NormalId:GetEnumItems()) do',
    '        local texture = Instance.new("Texture")',
    '        texture.Name = NAME',
    '        texture.Face = face',
    '        texture.Texture = url',
    '        texture.StudsPerTileU = STUDS_PER_TILE',
    '        texture.StudsPerTileV = STUDS_PER_TILE',
    '        texture.Parent = part',
    '    end',
    'end',
    '',
    'pcall(function() ChangeHistoryService:SetWaypoint("Setelah pasang tekstur") end)',
    'print("Tekstur dipasang di " .. #parts .. " Part.")'
  ].join(NL);
}
function refreshScript() { if (assetId) $('texture-script').value = buildTextureScript(); }

async function publishTile() {
  if (!tileBlob) return;
  const button = $('publish-btn');
  button.disabled = true;
  resetResult();
  $('results').classList.add('visible');
  $('asset-id-text').textContent = 'Mengunggah...';
  showProgress(12);
  setStatus('Mengunggah ubin ke Roblox. Jangan tutup halaman ini.');
  try {
    const name = ($('asset-name').value || '').replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().slice(0, 40) || 'Seamless Texture';
    const results = await requestPublish({Tile: new File([tileBlob], 'Tile.png', {type: 'image/png'})}, name, (face, text) => { $('asset-id-text').textContent = text; });
    const result = results.Tile || {};
    const id = String(result.assetId || '').replace(/[^0-9]/g, '');
    if (!id) {
      $('asset-id-text').textContent = 'Gagal';
      setStatus(result.error || 'Roblox tidak menerima gambar ini.', 'error');
      return;
    }
    assetId = id;
    $('asset-id-text').textContent = 'rbxassetid://' + id;
    $('copy-id-btn').hidden = false;
    refreshScript();
    setStatus('Ubin berhasil dipublish. Asset ID dan script siap disalin.', 'success');
    toast('Tekstur berhasil dipublish ke Roblox', 'success');
  } catch (e) {
    $('asset-id-text').textContent = 'Gagal';
    setStatus(e.message || 'Publish gagal.', 'error');
  } finally {
    hideProgress();
    button.disabled = false;
  }
}

$('source-file').addEventListener('change', e => chooseImage(e.target.files[0]));
const dropZone = $('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); chooseImage(e.dataTransfer.files[0]); });
$('tile-size').addEventListener('change', scheduleGenerate);
$('blend').addEventListener('input', () => { $('blend-out').textContent = $('blend').value + '%'; scheduleGenerate(); });
$('studs').addEventListener('input', refreshScript);
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
  previewMode = b.dataset.mode;
  document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  $('prev-help').textContent = previewMode === 'seam'
    ? 'Ubin digeser setengah ukuran: sambungan asli kini ada di tengah. Kalau tengah gambar terlihat mulus, ubinnya aman.'
    : 'Ubin diulang 3 x 3 seperti saat dipasang di Part.';
  drawPreview();
}));
$('download-btn').addEventListener('click', () => { if (tileBlob) downloadBlob(tileBlob, 'Seamless_' + $('tile-size').value + '.png'); });
$('publish-btn').addEventListener('click', publishTile);
$('copy-id-btn').addEventListener('click', () => { if (assetId) copyText('rbxassetid://' + assetId, 'Asset ID disalin'); });
$('copy-script-btn').addEventListener('click', () => { const s = $('texture-script').value; if (s) copyText(s, 'Script disalin'); else toast('Publish dulu supaya script terisi', 'error'); });
</script>
</body>
</html>
`;
