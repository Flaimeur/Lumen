'use strict';
// Bannière « Succès débloqué » affichée par-dessus le jeu (fenêtre transparente, toujours devant, sans prendre le focus).
// Marche sur les jeux en plein écran fenêtré / sans bordure ; un plein écran exclusif peut la cacher.
const { BrowserWindow, screen } = require('electron');

const queue = [];
let busy = false;

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page({ game, name, desc, icon, source, accent }) {
  // L'image couvre le trophée ; si elle ne charge pas, le trophée reste visible (pas de JavaScript dans la bannière).
  const img = `<div class="ph"${icon ? ` style="background-image:url('${esc(icon).replace(/'/g, '%27')}');font-size:0"` : ''}>🏆</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent;overflow:hidden;font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;color:#fff}
  .n{position:absolute;inset:10px;display:flex;align-items:center;gap:14px;padding:12px 18px 12px 12px;border-radius:18px;
    background:linear-gradient(135deg,rgba(18,22,36,.94),rgba(10,12,20,.94));border:1px solid rgba(255,255,255,.12);
    box-shadow:0 12px 34px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);
    animation:in .55s cubic-bezier(.2,1.3,.4,1) both, out .4s ease-in 5.6s forwards}
  .n::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:4px;border-radius:0 4px 4px 0;background:${esc(accent || '#5eead4')}}
  img,.ph{width:62px;height:62px;border-radius:12px;object-fit:cover;flex:none;box-shadow:0 0 0 2px rgba(250,204,21,.6),0 0 22px rgba(250,204,21,.35)}
  .ph{display:grid;place-items:center;font-size:30px;background:rgba(250,204,21,.15) center/cover no-repeat}
  .t{min-width:0;display:flex;flex-direction:column;gap:2px}
  .k{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#facc15}
  .a{font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .d{font-size:12.5px;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .g{font-size:11px;color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  @keyframes in{from{opacity:0;transform:translateX(40px) scale(.96)}to{opacity:1;transform:none}}
  @keyframes out{to{opacity:0;transform:translateX(30px)}}
  </style></head><body><div class="n">${img}<div class="t"><div class="k">🏆 Succès débloqué · ${esc(source)}</div>
  <div class="a">${esc(name)}</div>${desc ? `<div class="d">${esc(desc)}</div>` : ''}<div class="g">${esc(game)}</div></div></div></body></html>`;
}

function next() {
  if (busy || !queue.length) return;
  busy = true;
  const item = queue.shift();
  const W = 440, H = 120;
  const area = screen.getPrimaryDisplay().workArea;
  const w = new BrowserWindow({
    width: W, height: H, x: area.x + area.width - W - 16, y: area.y + 16,
    frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    alwaysOnTop: true, show: false, hasShadow: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setIgnoreMouseEvents(true);
  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page(item)));
  w.once('ready-to-show', () => w.showInactive());
  setTimeout(() => { if (!w.isDestroyed()) w.destroy(); busy = false; setTimeout(next, 250); }, 6200);
}

// item : { game, name, desc, icon (URL https), source: 'Steam' | 'RetroAchievements', accent }
function notify(item) {
  queue.push(item);
  next();
}

module.exports = { notify, page };
