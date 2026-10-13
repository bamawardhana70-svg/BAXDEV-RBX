// BAXDEV VIP Plus Lua obfuscator. Served only through /api/tool after server-side VIP+ validation.
export default String.raw`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Obfus</title>
<style>
:root{color-scheme:dark;--bg:#11131a;--text:#f3f5fb;--muted:#9ba4b8;--line:rgba(255,255,255,.14);--g1:rgba(255,255,255,.08);--btn:#a5b4fc;--btn-ink:#11131a;--blob:rgba(99,102,241,.22)}
*{box-sizing:border-box}body{margin:0;padding:22px;font:14px/1.5 system-ui,sans-serif;color:var(--text);background:radial-gradient(600px 250px at 90% 0,var(--blob),transparent 70%),var(--bg)}
.wrap{max-width:980px;margin:auto}.kicker{font-size:11px;letter-spacing:.16em;color:var(--btn);font-weight:800}h1{font-size:clamp(25px,5vw,36px);margin:5px 0}p{color:var(--muted);margin:4px 0 18px}.panel{border:1px solid var(--line);background:var(--g1);border-radius:18px;padding:16px;margin-top:14px}label{display:block;font-weight:700;margin-bottom:8px}textarea{width:100%;min-height:260px;resize:vertical;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.15);color:var(--text);padding:13px;font:12px/1.55 ui-monospace,monospace;outline:none}textarea:focus{border-color:var(--btn)}.out{min-height:240px}button{border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer;background:var(--btn);color:var(--btn-ink);margin:8px 7px 0 0}button.secondary{background:var(--g1);color:var(--text);border:1px solid var(--line)}.hint{font-size:12px;color:var(--muted)}#status{font-size:12px;color:var(--btn);margin-top:9px}
</style></head><body><main class="wrap"><div class="kicker">BAXDEV / LUA TOOLS</div><h1>Obfus Lua</h1><p>Samarkan nama variabel lokal dan rapikan kode Lua/Luau Roblox. Jalankan hasilnya di lingkungan uji terlebih dahulu.</p>
<section class="panel"><label for="src">Kode Lua / Luau</label><textarea id="src" spellcheck="false" placeholder="Tempel kode Lua/Luau di sini..."></textarea><button id="run">Obfuscate</button><button class="secondary" id="clear">Bersihkan</button><div class="hint">Mode ringan: tidak mengenkripsi kode. Hindari kode yang memakai nama lokal secara dinamis atau bergantung pada debug.getlocal.</div></section>
<section class="panel"><label for="out">Hasil obfuscation</label><textarea id="out" class="out" spellcheck="false" readonly placeholder="Hasil akan muncul di sini..."></textarea><button id="copy">Salin hasil</button><div id="status" role="status"></div></section></main>
<script>
const $=id=>document.getElementById(id);
function obfuscate(code){
 if(!code.trim()) throw Error('Masukkan kode terlebih dahulu.');
 // Token-aware lightweight minifier: keeps quoted strings and long-bracket strings/comments intact.
 const tokens=[]; let i=0, n=code.length;
 while(i<n){
  const c=code[i], d=code[i+1];
  if(/\s/.test(c)){i++;continue}
  if(c==='-'&&d==='-'){
   let j=i+2,eq='';
   if(code[j]==='['){let k=j+1;while(code[k]==='='){eq+='=';k++}if(code[k]==='['){const end=']'+eq+']';const p=code.indexOf(end,k+1);i=p<0?n:p+end.length;continue}}
   while(i<n&&code[i]!=='\n')i++;continue;
  }
  if(c==='"'||c==="'"||c==='`'){
   const q=c;let tok=q;i++;
   while(i<n){const x=code[i++];tok+=x;if(x==='\\'&&i<n){tok+=code[i++];continue}if(x===q)break}
   tokens.push(tok);continue;
  }
  if(c==='['){let j=i+1,eq='';while(code[j]==='='){eq+='=';j++}if(code[j]==='['){const end=']'+eq+']',p=code.indexOf(end,j+1);if(p>=0){tokens.push(code.slice(i,p+end.length));i=p+end.length;continue}}}
  const id=code.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
  if(id){tokens.push(id[0]);i+=id[0].length;continue}
  const num=code.slice(i).match(/^\d+(?:\.\d+)?/);if(num){tokens.push(num[0]);i+=num[0].length;continue}
  const op=['...', '..','==','~=','<=','>=','+=','-=','*=','/=','//','::','->'].find(x=>code.startsWith(x,i));
  if(op){tokens.push(op);i+=op.length}else{tokens.push(c);i++}
 }
 const reserved=new Set(('and break do else elseif end false for function if in local nil not or repeat return then true until while continue export type typeof self').split(' '));
 const names=new Map();let count=0;
 for(let k=0;k<tokens.length-1;k++){
  if(tokens[k]==='local'){
   let j=k+1;
   if(tokens[j]==='function')j++;
   if(/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokens[j]||'')&&!reserved.has(tokens[j])){
    const name=tokens[j];
    if(!names.has(name))names.set(name,'_v'+(++count).toString(36));
   }
  }
 }
 // Replace tokens only in syntactic identifier positions; preserve member keys after . or : and table keys before =.
 const out=[];
 for(let k=0;k<tokens.length;k++){
  const t=tokens[k],prev=tokens[k-1],next=tokens[k+1];
  if(names.has(t)&&prev!=='.'&&prev!==':'&&next!==':'&&next!=='='&&!(prev==='function')) out.push(names.get(t));
  else out.push(t);
 }
 let result='';
 for(let k=0;k<out.length;k++){
  const a=out[k],b=out[k+1]||'';
  result+=a;
  if((/[A-Za-z0-9_]$/.test(a)&&/^[A-Za-z0-9_]/.test(b))||((a==='-'&&b==='-')||(a==='/'&&b==='/')))result+=' ';
 }
 return result;
}
$('run').onclick=()=>{try{$('out').value=obfuscate($('src').value);$('status').textContent='Selesai. Uji hasil di Roblox Studio.'}catch(e){$('status').textContent=e.message}};
$('clear').onclick=()=>{$('src').value='';$('out').value='';$('status').textContent=''};
$('copy').onclick=async()=>{const v=$('out').value;if(!v){$('status').textContent='Belum ada hasil.';return}try{await navigator.clipboard.writeText(v);$('status').textContent='Hasil disalin.'}catch(e){$('out').select();document.execCommand('copy');$('status').textContent='Hasil disalin.'}};
function applyBxTheme(data){if(!data||!/^#[0-9a-fA-F]{6}$/.test(data.bg)||!Array.isArray(data.p)||data.p.length!==3)return;const p=data.p.map(c=>Array.isArray(c)&&c.length===3?c.map(v=>Math.max(0,Math.min(255,Math.round(Number(v)||0)))):null);if(p.some(c=>!c))return;const rgb=c=>'rgb('+c.join(',')+')',rgba=(c,a)=>'rgba('+c.join(',')+','+a+')',r=document.documentElement.style,l=p[0];r.setProperty('--bg',data.bg);r.setProperty('--text',rgb(l));r.setProperty('--muted',rgba(l,.64));r.setProperty('--line',rgba(l,.17));r.setProperty('--g1',rgba(l,.08));r.setProperty('--btn',rgb(l));r.setProperty('--btn-ink',data.bg);r.setProperty('--blob',rgba(p[1],.26));if(data.scheme==='light'||data.scheme==='dark')r.setProperty('color-scheme',data.scheme)}
addEventListener('message',e=>{if(e.source===parent&&e.data&&e.data.bx==='theme')applyBxTheme(e.data)});
</script></body></html>`;
