(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const video = $("video");
  const listEl = $("channelList");
  const messageEl = $("sourceMessage");
  const dialog = $("sourceDialog");
  let channels = [], current = null, hls = null, filter = "Semua", favorites = new Set();
  let deferredInstall = null;
  try { favorites = new Set(JSON.parse(localStorage.getItem("tvn-favorites") || "[]")); } catch {}
  const DEFAULT_PLAYLIST = "https://iptv-org.github.io/iptv/countries/id.m3u";
  const state = { playlistUrl: "", epgUrl: "", epg: [] };

  function say(msg, error=false) { messageEl.textContent = msg; messageEl.classList.toggle("error", error); }
  function setStatus(msg) { $("playerStatus").textContent = msg; }
  function normalize(s) { return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function categoryFor(group="", name="") {
    const s = normalize(group + " " + name);
    if (/news|berita|news channel/.test(s)) return "Berita";
    if (/regional|local|daerah|jawa|sumatera|kalimantan|sulawesi|papua|bali|madura|jatim|jabar|jateng/.test(s)) return "Daerah";
    if (/national|nasional|general|entertainment|sports|music|movie|education/.test(s)) return "Nasional";
    return "Lainnya";
  }
  function parseM3U(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    const out = []; let meta = null;
    for (const raw of lines) {
      const line = raw.trim(); if (!line) continue;
      if (line.startsWith("#EXTINF")) {
        const attrs = {};
        for (const m of line.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[m[1].toLowerCase()] = m[2];
        const comma = line.lastIndexOf(",");
        meta = { name: comma >= 0 ? line.slice(comma+1).trim() : (attrs["tvg-name"] || "Channel"), logo: attrs["tvg-logo"] || "", group: attrs["group-title"] || "Lainnya", tvgId: attrs["tvg-id"] || "" };
      } else if (!line.startsWith("#") && meta) {
        if (/^https?:\/\//i.test(line)) out.push({ ...meta, url: line, id: meta.tvgId || line });
        meta = null;
      }
    }
    return out;
  }
  function safeLogo(url) { try { const u = new URL(url); return ["http:","https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } }
  function logoMarkup(ch, cls) {
    const logo = safeLogo(ch.logo);
    return `<div class="${cls}">${logo ? `<img loading="lazy" referrerpolicy="no-referrer" src="${escapeAttr(logo)}" alt="" onerror="this.remove()">` : escapeHtml((ch.name || "TV").slice(0,3).toUpperCase())}</div>`;
  }
  function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function escapeAttr(s) { return escapeHtml(s); }
  function render() {
    const q = normalize($("searchInput").value);
    const shown = channels.filter(ch => {
      const match = normalize(ch.name + " " + ch.group).includes(q);
      const cat = categoryFor(ch.group, ch.name);
      return match && (filter === "Semua" || (filter === "Favorit" ? favorites.has(ch.id) : filter === cat));
    });
    $("channelCount").textContent = `${shown.length} dari ${channels.length} channel`;
    if (!shown.length) {
      listEl.innerHTML = `<div class="empty-state"><div>⌕</div><b>Tidak ada channel</b><p>Coba kata kunci atau kategori lain.</p></div>`; return;
    }
    listEl.innerHTML = shown.map(ch => `<div class="channel-card ${current?.id===ch.id?"selected":""}" data-id="${escapeAttr(ch.id)}" tabindex="0" role="button" aria-label="Putar ${escapeAttr(ch.name)}">${logoMarkup(ch,"channel-logo")}<div class="channel-info"><b>${escapeHtml(ch.name)}</b><small>${escapeHtml(ch.group || "TV Indonesia")}</small></div><button class="channel-fav ${favorites.has(ch.id)?"active":""}" data-fav="${escapeAttr(ch.id)}" aria-label="Favorit" title="Favorit">${favorites.has(ch.id)?"★":"☆"}</button></div>`).join("");
  }
  function persistFavorites() { try { localStorage.setItem("tvn-favorites", JSON.stringify([...favorites])); } catch {} }
  function setCurrentInfo(ch) {
    $("currentTitle").textContent = ch.name;
    $("currentGroup").textContent = ch.group || "TV Indonesia";
    $("currentLogo").innerHTML = safeLogo(ch.logo) ? `<img src="${escapeAttr(safeLogo(ch.logo))}" alt="">` : escapeHtml(ch.name.slice(0,3).toUpperCase());
    $("favCurrent").textContent = favorites.has(ch.id) ? "★" : "☆";
    $("favCurrent").classList.toggle("active", favorites.has(ch.id));
    $("playerPlaceholder").classList.add("hidden");
  }
  async function play(ch) {
    current = ch; render(); setCurrentInfo(ch); setStatus("Menghubungkan…");
    if (hls) { hls.destroy(); hls = null; }
    video.pause(); video.removeAttribute("src"); video.load();
    const url = ch.url;
    if (window.Hls && Hls.isSupported() && /\.m3u8?($|[?#])/i.test(url)) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
      hls.loadSource(url); hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setStatus("Stream siap"); video.play().catch(() => setStatus("Tekan tombol ▶ untuk memulai")); });
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setStatus("Stream gagal / dibatasi CORS"); });
    } else {
      video.src = url;
      video.play().then(() => setStatus("Sedang diputar")).catch(() => setStatus("Tidak bisa diputar: cek format, akses, atau CORS"));
    }
    updateEpg();
  }
  function loadPlaylist(text, label="Playlist") {
    const parsed = parseM3U(text);
    if (!parsed.length) throw new Error("Tidak menemukan stream URL di playlist M3U.");
    channels = parsed;
    state.playlistUrl = label;
    render();
    say(`${parsed.length} channel berhasil dimuat.`);
    if (current && !channels.some(c => c.id === current.id)) { current = null; $("currentTitle").textContent = "Belum ada channel"; $("currentGroup").textContent = "Pilih channel dari daftar"; }
  }
  async function loadUrl(url) {
    if (!url) return say("Masukkan URL playlist terlebih dahulu.", true);
    say("Mengunduh playlist…");
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Server menjawab HTTP ${response.status}`);
      loadPlaylist(await response.text(), url);
      $("playlistUrl").value = url;
    } catch (e) { say(`Gagal memuat playlist: ${e.message}. Mungkin URL salah atau server memblokir CORS. Coba unggah file M3U.`, true); }
  }
  function toggleFav(id) {
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    persistFavorites(); render();
    if (current?.id === id) { $("favCurrent").textContent = favorites.has(id) ? "★" : "☆"; $("favCurrent").classList.toggle("active", favorites.has(id)); }
  }
  listEl.addEventListener("click", e => {
    const fav = e.target.closest("[data-fav]");
    if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
    const card = e.target.closest("[data-id]"); if (card) { const ch = channels.find(c => c.id === card.dataset.id); if (ch) play(ch); }
  });
  listEl.addEventListener("keydown", e => { if ((e.key==="Enter" || e.key===" ") && e.target.matches("[data-id]")) { e.preventDefault(); const ch=channels.find(c=>c.id===e.target.dataset.id); if(ch) play(ch); } });
  $("favCurrent").addEventListener("click", () => { if (current) toggleFav(current.id); });
  $("searchInput").addEventListener("input", render);
  $("filters").addEventListener("click", e => { const b=e.target.closest("[data-filter]"); if(!b)return; filter=b.dataset.filter; $("filters").querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x===b)); render(); });
  $("sourceBtn").addEventListener("click", () => { dialog.showModal(); });
  $("refreshBtn").addEventListener("click", () => { if (state.playlistUrl.startsWith("http")) loadUrl(state.playlistUrl); else say("Muat ulang tersedia setelah playlist URL dimuat."); });
  $("loadUrlBtn").addEventListener("click", () => loadUrl($("playlistUrl").value.trim()));
  $("playlistFile").addEventListener("change", async e => { const file=e.target.files?.[0]; if(!file)return; try { loadPlaylist(await file.text(), file.name); say(`File ${file.name} berhasil dimuat.`); } catch(err) { say(err.message,true); } });
  $("communityBtn").addEventListener("click", () => { $("playlistUrl").value = DEFAULT_PLAYLIST; say("Sumber komunitas dipilih. Periksa hak akses setiap stream sebelum menonton atau membagikannya."); loadUrl(DEFAULT_PLAYLIST); });
  $("loadEpgBtn").addEventListener("click", async () => {
    const url=$("epgUrl").value.trim(); if(!url)return say("Masukkan URL EPG XMLTV.",true);
    say("Mengunduh EPG…");
    try {
      const res=await fetch(url); if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const xml=new DOMParser().parseFromString(await res.text(),"application/xml");
      if(xml.querySelector("parsererror"))throw new Error("Format XML tidak valid atau file gzip tidak didukung browser.");
      state.epg=[...xml.querySelectorAll("programme")].map(p=>({id:p.getAttribute("channel"),start:p.getAttribute("start"),stop:p.getAttribute("stop"),title:p.querySelector("title")?.textContent||"Acara"}));
      state.epgUrl=url; say(`EPG dimuat: ${state.epg.length} program.`); updateEpg();
    } catch(err) { say(`EPG gagal dimuat: ${err.message}. Periksa CORS dan pastikan URL XML dapat dibaca browser.`,true); }
  });
  function parseXmltvTime(s) { if(!s)return NaN; const m=s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/); if(!m)return NaN; const base=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)); if(m[7]){const off=(+m[7].slice(1,3)*60 + +m[7].slice(3,5))*60000;return base+(m[7][0]==="+"?-off:off);} return base; }
  function updateEpg() {
    const el=$("epgContent");
    if(!current || !state.epg.length) { el.textContent="Belum ada data jadwal. Masukkan URL XMLTV yang sah melalui Sumber Channel."; return; }
    const now=Date.now(); const programs=state.epg.filter(p => p.id===current.tvgId && parseXmltvTime(p.start)<=now && parseXmltvTime(p.stop)>now);
    if(!programs.length){el.textContent="Jadwal acara untuk channel ini tidak tersedia di EPG yang dimuat.";return;}
    el.innerHTML=programs.slice(0,3).map(p=>`<div style="padding:10px 0;border-bottom:1px solid #272f3d"><b style="color:#f1f5fb">${escapeHtml(p.title)}</b><div style="margin-top:4px">${new Date(parseXmltvTime(p.start)).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})} – ${new Date(parseXmltvTime(p.stop)).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</div></div>`).join("");
  }
  video.addEventListener("playing",()=>setStatus("Sedang diputar"));
  video.addEventListener("waiting",()=>setStatus("Buffering…"));
  video.addEventListener("error",()=>setStatus("Video tidak dapat diputar. Coba stream lain."));
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall=e; $("installBtn").classList.remove("hidden"); });
  $("installBtn").addEventListener("click", async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").classList.add("hidden");});
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
  // The playlist is not auto-loaded: users choose an authorized source.
})();