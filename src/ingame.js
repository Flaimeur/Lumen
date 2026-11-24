'use strict';
// Menu en jeu : panneau par-dessus le jeu (fenêtre transparente, toujours devant), ouvert avec le bouton PS / Home,
// Select + L1 ou Ctrl+Maj+M. Lumen le pilote à la manette depuis sa fenêtre principale (qui lit déjà la manette
// pendant les parties) : la fenêtre du menu ne fait qu'afficher l'état qu'on lui envoie.
// Comme la bannière des succès : marche en plein écran fenêtré / sans bordure, un plein écran exclusif peut la cacher.
const { BrowserWindow, screen } = require('electron');

let w = null;
let pending = null;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden;font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;color:#fff;user-select:none;cursor:default}
  .bg{position:fixed;inset:0;background:radial-gradient(ellipse at 30% 50%,rgba(6,8,16,.55),rgba(4,6,12,.82));animation:fade .25s ease both}
  .p{position:absolute;left:56px;top:50%;width:420px;transform:translateY(-50%);padding:26px 24px 20px;border-radius:26px;
    background:linear-gradient(160deg,rgba(24,28,44,.96),rgba(12,14,24,.96));border:1px solid rgba(255,255,255,.12);
    box-shadow:0 30px 80px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08);animation:in .35s cubic-bezier(.2,1.2,.4,1) both}
  .top{display:flex;gap:16px;align-items:center;margin-bottom:18px}
  .cv{width:64px;height:64px;border-radius:14px;background:rgba(255,255,255,.08) center/cover no-repeat;flex:none;box-shadow:0 0 0 2px var(--a)}
  .k{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--a)}
  .n{font-size:20px;font-weight:750;line-height:1.2;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .facts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
  .f{padding:6px 11px;border-radius:999px;background:rgba(255,255,255,.07);font-size:12.5px;font-weight:650;color:rgba(255,255,255,.85);font-variant-numeric:tabular-nums}
  .f.low{color:#f87171}
  .it{display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:14px;font-size:15.5px;font-weight:700;color:rgba(255,255,255,.82);transition:background .12s,color .12s,box-shadow .12s}
  .it .i{width:22px;text-align:center;opacity:.9}
  .it.on{background:rgba(255,255,255,.1);color:#fff;box-shadow:0 0 0 2px var(--a),0 0 24px color-mix(in srgb,var(--a) 35%,transparent)}
  .it.danger.on{box-shadow:0 0 0 2px #f87171,0 0 24px rgba(248,113,113,.3)}
  .h{display:flex;gap:16px;margin-top:16px;font-size:12px;color:rgba(255,255,255,.55)}
  .h b{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;margin-right:6px;border-radius:6px;background:rgba(255,255,255,.12);color:#fff;font-size:11px}
  @keyframes in{from{opacity:0;transform:translate(-30px,-50%) scale(.97)}to{opacity:1;transform:translateY(-50%)}}
  @keyframes fade{from{opacity:0}}
</style></head><body><div class="bg"></div><div class="p" id="p"></div><script>
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.render = (d) => {
    document.documentElement.style.setProperty('--a', d.accent || '#5eead4');
    document.getElementById('p').innerHTML =
      '<div class="top"><div class="cv"' + (d.cover ? ' style="background-image:url(\\'' + esc(d.cover).replace(/'/g, '%27') + '\\')"' : '') + '></div>' +
      '<div><div class="k">' + esc(d.system || 'En jeu') + '</div><div class="n">' + esc(d.name) + '</div></div></div>' +
      '<div class="facts">' + (d.facts || []).map((f) => '<span class="f' + (f.low ? ' low' : '') + '">' + esc(f.text) + '</span>').join('') + '</div>' +
      (d.items || []).map((it, i) => '<div class="it' + (i === d.sel ? ' on' : '') + (it.danger ? ' danger' : '') + '"><span class="i">' + esc(it.icon) + '</span>' + esc(it.label) + '</div>').join('') +
      '<div class="h"><span><b>A</b>Choisir</span><span><b>B</b>Reprendre</span></div>';
  };
</script></body></html>`;

function show(data) {
  pending = data;
  if (w && !w.isDestroyed()) { update(data); return; }
  const b = screen.getPrimaryDisplay().bounds;
  w = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    alwaysOnTop: true, show: false, hasShadow: false, fullscreenable: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true, backgroundThrottling: false },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  // Mac : visible aussi par-dessus un jeu en plein écran (qui a son propre Space).
  if (process.platform === 'darwin') w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  w.setIgnoreMouseEvents(true);
  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
  w.webContents.once('did-finish-load', () => { update(pending); if (w && !w.isDestroyed()) w.showInactive(); });
  w.on('closed', () => { w = null; });
}

function update(data) {
  pending = data;
  if (!w || w.isDestroyed() || w.webContents.isLoading()) return;
  w.webContents.executeJavaScript(`window.render(${JSON.stringify(data)})`).catch(() => {});
}

function hide() {
  pending = null;
  if (w && !w.isDestroyed()) w.destroy();
  w = null;
}

const isOpen = () => !!(w && !w.isDestroyed());

module.exports = { show, update, hide, isOpen };
