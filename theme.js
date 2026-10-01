/* baxdev — tema warna kustom (khusus VIP). Dipakai index.html dan owner.html. */
(function () {
  var page = (document.currentScript && document.currentScript.getAttribute('data-page')) || 'index';
  var DEFAULT = '#a855f7';
  function isHex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }
  function hex2hsl(hex) {
    var r = parseInt(hex.substr(1, 2), 16) / 255, g = parseInt(hex.substr(3, 2), 16) / 255, b = parseInt(hex.substr(5, 2), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function rgbs(h, s, l) { return hsl2rgb(h, s, l).join(','); }
  function hx(h, s, l) { return '#' + hsl2rgb(h, s, l).map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }
  function tokens(hex) {
    var c = hex2hsl(hex), h = c[0], s0 = c[1], neutral = s0 < 0.12;
    var S = neutral ? s0 : Math.max(s0, 0.45), Sd = neutral ? s0 : Math.min(S, 0.6);
    return {
      t: rgbs(h, S, 0.64), bg: hx(h, Sd, 0.035), bg2: hx(h, Sd, 0.06), bg3: hx(h, Sd, 0.095), nav: rgbs(h, Sd, 0.05), bgr: rgbs(h, Sd, 0.035),
      amb0: hx(h, Sd, 0.025), amb1: hx(h, Sd, 0.16), amb2: hx(h, Sd, 0.125), amb3: hx(h, Sd, 0.07),
      text: hx(h, neutral ? s0 : 0.5, 0.965), text2: hx(h, Math.min(S, 0.25), 0.76), text3: hx(h, Math.min(S, 0.18), 0.56),
      light: hx(h, S, 0.72), light2: hx(h, S, 0.6), hi: hx(h, S, 0.93), lo: hx(h, S * 0.7, 0.6),
      chrome: 'linear-gradient(180deg,' + hx(h, S, 0.88) + ' 0%,' + hx(h, S, 0.68) + ' 48%,' + hx(h, S, 0.5) + ' 100%)',
      onacc: hx(h, Math.min(S, 0.7), 0.08),
      pal: [hsl2rgb(h, S, 0.88), hsl2rgb(h, S, 0.7), hsl2rgb(h, S, 0.5)]
    };
  }
  var TPL = {
    index: `
html[data-theme="custom"] { color-scheme: dark; --bg:@bg@; --bg2:@bg2@; --bg3:@bg3@;
  --surface:rgba(@t@,.05); --surface-hover:rgba(@t@,.11); --glass:rgba(@t@,.07); --glass-strong:rgba(@t@,.13); --glass-border:rgba(@t@,.20);
  --surf:rgba(@t@,.06); --surf-hi:rgba(@t@,.11);
  --text:@text@; --text2:@text2@; --text3:@text3@;
  --accent-blue:@light@; --silver:@light@; --silver-hi:@hi@; --silver-lo:@lo@;
  --chrome:@chrome@; --on-accent:@onacc@;
  --glow:inset 0 1px 0 rgba(@t@,.22), inset 0 -1px 0 rgba(@t@,.05), 0 12px 36px rgba(0,0,0,.35);
  --glow-hover:inset 0 1px 0 rgba(@t@,.34), 0 16px 44px rgba(0,0,0,.45); }
html[data-theme="custom"] body, html[data-theme="custom"] body.premium-user:not(.developer-mode), html[data-theme="custom"] body.developer-mode { --glass-border:rgba(@t@,.22); --glass-strong:rgba(@t@,.14); }
html[data-theme="custom"] { --bx-t:@t@; --bx-nav:@nav@; --bx-bg:@bgr@; }
html[data-theme="custom"] ::selection { background:@light@; color:@onacc@; }
html[data-theme="custom"] :is(button,[role=button],input,select,a):focus-visible { outline-color:@light@; }
html[data-theme="custom"] .ambient-scene, html[data-theme="custom"] body.premium-user:not(.developer-mode) .ambient-scene {
  background: radial-gradient(ellipse at 88% 6%, @amb1@ 0%, transparent 56%), radial-gradient(ellipse at 4% 98%, @amb2@ 0%, transparent 54%), radial-gradient(ellipse at 50% 45%, @amb3@ 0%, transparent 70%), @amb0@; }
html[data-theme="custom"] #navbar, html[data-theme="custom"] body.premium-user:not(.developer-mode) #navbar, html[data-theme="custom"] body.developer-mode #navbar { background:rgba(@nav@,.58); border-bottom-color:rgba(@t@,.22); box-shadow:inset 0 -1px 0 rgba(@t@,.06), 0 10px 40px rgba(0,0,0,.35); }
html[data-theme="custom"] .nav-link.active, html[data-theme="custom"] .settings-side .settings-tab.active { background:linear-gradient(135deg, rgba(@t@,.28), rgba(@t@,.06)); box-shadow:inset 0 0 0 1px rgba(@t@,.34), inset 0 1px 0 rgba(@t@,.32), 0 4px 12px rgba(0,0,0,.3); }
html[data-theme="custom"] .signin-btn, html[data-theme="custom"] #login-nav-btn.nav-signin { background:linear-gradient(150deg, rgba(@t@,.28), rgba(@t@,.07)); border-color:rgba(@t@,.42); box-shadow:inset 0 1px 0 rgba(@t@,.34), 0 4px 14px rgba(0,0,0,.3); }
html[data-theme="custom"] .nav-avatar, html[data-theme="custom"] .su-avatar, html[data-theme="custom"] #login-nav-btn.nav-silhouette, html[data-theme="custom"] body.premium-user:not(.developer-mode) .nav-avatar { background:linear-gradient(145deg, rgba(@t@,.32), rgba(@t@,.08)); border-color:rgba(@t@,.65); box-shadow:0 0 0 3px rgba(@t@,.10), 0 6px 18px rgba(0,0,0,.45), inset 0 1px 0 rgba(@t@,.4); }
html[data-theme="custom"] .settings-user, html[data-theme="custom"] .settings-side .settings-nav { background:linear-gradient(135deg, rgba(@t@,.12), rgba(@t@,.03)); border-color:rgba(@t@,.18); }
html[data-theme="custom"] #player-bar { background:rgba(@nav@,.78); border-color:rgba(@t@,.30); }
html[data-theme="custom"] .btn-primary, html[data-theme="custom"] .google-btn { background:var(--chrome); color:var(--on-accent); border-color:rgba(@t@,.7); box-shadow:inset 0 1px 0 rgba(255,255,255,.55), 0 8px 24px rgba(@t@,.22); }
html[data-theme="custom"] .btn-primary:hover, html[data-theme="custom"] .google-btn:hover { background:var(--chrome); }
html[data-theme="custom"] .speed-chip.active, html[data-theme="custom"] .source-tab.active { background:var(--chrome); color:var(--on-accent); border-color:rgba(@t@,.7); }
html[data-theme="custom"] .toggle.on { background:rgba(@t@,.45); border-color:rgba(@t@,.7); }
html[data-theme="custom"] .toggle.on::after { background:linear-gradient(#fff, @light@); }
html[data-theme="custom"] .player-play, html[data-theme="custom"] .um-cover, html[data-theme="custom"] .connect-icon { background:var(--chrome); color:var(--on-accent); }
html[data-theme="custom"] .progress-fill, html[data-theme="custom"] .um-progress span { background:var(--chrome); }
html[data-theme="custom"] .studio-hero h1 span { background-image:linear-gradient(90deg, #ffffff, @light@ 45%, @hi@ 70%, @light2@); }
html[data-theme="custom"] .plan-option { background:rgba(@t@,.06); border-color:rgba(@t@,.22); }
html[data-theme="custom"] .plan-option:hover, html[data-theme="custom"] .plan-option:focus-visible { background:rgba(@t@,.13); border-color:@light@; }
html[data-theme="custom"] .subscription-card, html[data-theme="custom"] body.premium-user:not(.developer-mode) .subscription-card { border-color:rgba(@t@,.40); background:rgba(@nav@,.94); box-shadow:var(--shadow), 0 0 45px rgba(@t@,.10); }
html[data-theme="custom"] .q-chip { background:rgba(@t@,.12); }
html[data-theme="custom"] .q-chip.is-run { background:rgba(@t@,.24); }
html[data-theme="custom"] .lib-note { background:rgba(@t@,.07); }
html[data-theme="custom"] .badge-arch { background:rgba(@t@,.14); }
html[data-theme="custom"] .gg-lock { background:rgba(@t@,.09); border-color:rgba(@t@,.24); }
html[data-theme="custom"] #google-gate .gg-card, html[data-theme="custom"] #mt-overlay .mt-card, html[data-theme="custom"] #ban-overlay .bo-card { background:linear-gradient(150deg, rgba(@t@,.20), rgba(@t@,.06) 45%, rgba(@t@,.10)); border-color:rgba(@t@,.30); }
html[data-theme="custom"] #google-gate .gg-btn, html[data-theme="custom"] #mt-overlay .mt-owner { background:var(--chrome); color:var(--on-accent); }
html[data-theme="custom"] #google-gate .gg-back { background:linear-gradient(150deg, rgba(@t@,.14), rgba(@t@,.04)); border-color:rgba(@t@,.30); }
html[data-theme="custom"] #google-gate .gg-reason { background:rgba(@t@,.12); border-color:rgba(@t@,.24); }
html[data-theme="custom"] #mt-overlay .mt-ico { background:rgba(@t@,.14); border-color:rgba(@t@,.30); }
html[data-theme="custom"] .theme-opt.active { border-color:@light@; background:rgba(@t@,.14); box-shadow:0 0 0 1px @light@ inset; }
`,
    owner: `
html[data-theme="custom"]{--bg:@bg@;--bg2:@bg2@;--glass:rgba(@t@,.07);--line:rgba(@t@,.20);--text:@text@;--text2:@text2@}
html[data-theme="custom"] body{background:radial-gradient(1200px 600px at 70% -10%,@amb1@ 0,transparent 60%),var(--bg)}
html[data-theme="custom"] input:focus,html[data-theme="custom"] select:focus{border-color:rgba(@t@,.65)}
html[data-theme="custom"] .btn{background:rgba(@t@,.09)}
html[data-theme="custom"] .btn:hover{background:rgba(@t@,.17)}
html[data-theme="custom"] .btn.primary{background:@chrome@;color:@onacc@;border-color:transparent}
html[data-theme="custom"] .btn.danger{background:rgba(255,90,90,.08)}
`
  };
  function css(hex) {
    var k = tokens(hex);
    return TPL[page === 'owner' ? 'owner' : 'index'].replace(/@(\w+)@/g, function (m, key) { return k[key] != null ? k[key] : m; });
  }
  function apply(hex) {
    if (!isHex(hex)) hex = DEFAULT;
    var k = tokens(hex), el = document.getElementById('custom-theme-css');
    if (!el) { el = document.createElement('style'); el.id = 'custom-theme-css'; document.head.appendChild(el); }
    el.textContent = css(hex);
    window.__bxPalette = k.pal;
    window.__bxThemeMeta = k.bg;
    document.documentElement.setAttribute('data-theme', 'custom');
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', k.bg);
  }
  window.BXCustom = { apply: apply, valid: isHex, DEFAULT: DEFAULT };
  try {
    if (localStorage.getItem('baxdev_theme') === 'custom') {
      var c = localStorage.getItem('baxdev_theme_color');
      apply(isHex(c) ? c : DEFAULT);
    }
  } catch (e) {}
})();
