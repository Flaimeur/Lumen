'use strict';
// Télécommande sur téléphone : une page web servie sur le réseau local (http://<ip du PC>:47815).
// Sécurité : désactivée par défaut, accessible seulement depuis le réseau local, code à 6 chiffres demandé
// (blocage d'une minute après 5 erreurs), et seulement des actions précises (aucune commande libre).
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 47815;
let server = null;
let hooks = null; // { library(), launch(path), media(cmd), companions(), companionRun(id, a), quitGame(), state() }
let pin = '';
const tokens = new Set();
let fails = 0, lockedUntil = 0;

const isLocal = (ip) => /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip || '') || ip === '::1' || /^fe80:/i.test(ip || '');
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}
const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 4096) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

async function handle(req, res) {
  const ip = req.socket.remoteAddress;
  if (!isLocal(ip)) return send(res, 403, { error: 'Réservé au réseau local' });
  const url = new URL(req.url, 'http://lumen');
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, PAGE, 'text/html; charset=utf-8');
  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (Date.now() < lockedUntil) return send(res, 429, { error: 'Trop d’essais, réessaie dans une minute' });
    const b = await readBody(req);
    if (String(b.pin || '') !== pin) { fails++; if (fails >= 5) { lockedUntil = Date.now() + 60000; fails = 0; } return send(res, 401, { error: 'Code incorrect' }); }
    fails = 0;
    const t = crypto.randomBytes(24).toString('hex');
    tokens.add(t);
    return send(res, 200, { token: t });
  }
  // Toutes les autres routes demandent le jeton obtenu avec le code.
  const tok = req.headers['x-token'] || url.searchParams.get('t');
  if (!tok || !tokens.has(tok)) return send(res, 401, { error: 'Code demandé' });

  if (req.method === 'GET' && url.pathname === '/api/library') {
    const lib = hooks.library();
    return send(res, 200, lib.map((g, i) => ({ i, name: g.name, sys: g.sys, recent: g.recent || 0, fav: !!g.fav, cover: !!g.cover })));
  }
  if (req.method === 'GET' && url.pathname === '/api/cover') {
    const g = hooks.library()[Number(url.searchParams.get('i'))];
    const c = g && g.cover;
    if (!c) return send(res, 404, '');
    if (c.startsWith('web-cover:')) { res.writeHead(302, { Location: c.slice(10) }); return res.end(); }
    if (!/\.(png|jpe?g|webp|gif)$/i.test(c) || !fs.existsSync(c)) return send(res, 404, '');
    const ext = path.extname(c).slice(1).toLowerCase().replace('jpg', 'jpeg');
    res.writeHead(200, { 'Content-Type': 'image/' + ext, 'Cache-Control': 'max-age=86400' });
    return fs.createReadStream(c).pipe(res);
  }
  if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, await hooks.state());
  if (req.method === 'POST') {
    const b = await readBody(req);
    if (url.pathname === '/api/launch') { const g = hooks.library()[Number(b.i)]; if (!g) return send(res, 404, { error: 'Jeu introuvable' }); hooks.launch(g.path); return send(res, 200, { ok: true }); }
    if (url.pathname === '/api/media' && ['toggle', 'next', 'prev'].includes(b.cmd)) return send(res, 200, await hooks.media(b.cmd));
    if (url.pathname === '/api/volume' && typeof b.v === 'number') return send(res, 200, await hooks.media('vol ' + Math.max(0, Math.min(1, b.v)).toFixed(2)));
    if (url.pathname === '/api/companion') return send(res, 200, await hooks.companionRun(String(b.id || ''), String(b.a || '')));
    if (url.pathname === '/api/quit') { hooks.quitGame(); return send(res, 200, { ok: true }); }
  }
  return send(res, 404, { error: 'Inconnu' });
}

function start(h, code, host = '0.0.0.0') {
  hooks = h; pin = code;
  if (server) return { ok: true, port: PORT, addresses: lanAddresses() };
  server = http.createServer((req, res) => { handle(req, res).catch(() => { try { send(res, 500, { error: 'Erreur' }); } catch { /* fermé */ } }); });
  server.on('error', () => { server = null; });
  server.listen(PORT, host);
  return { ok: true, port: PORT, addresses: lanAddresses() };
}
function stop() { if (server) { server.close(); server = null; } tokens.clear(); }
function setPin(code) { pin = code; tokens.clear(); }

// ---------- Page de la télécommande (tout dans un seul fichier, sans dépendance) ----------
const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b0d16"><title>Lumen · télécommande</title>
<style>
:root{--bg:#0b0d16;--panel:#151a2b;--line:rgba(255,255,255,.08);--text:#eef2ff;--muted:#8b93a7;--accent:#5eead4}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:radial-gradient(circle at 50% -20%,#1d2547,var(--bg) 60%);color:var(--text);font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh;padding:env(safe-area-inset-top) 0 calc(76px + env(safe-area-inset-bottom))}
header{display:flex;align-items:center;gap:10px;padding:16px 18px 6px}
header b{font-size:20px;letter-spacing:.02em}.dot{width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#e0dcff,#8b7cf0)}
main{padding:8px 16px}
.hidden{display:none!important}
input{width:100%;padding:14px 16px;border-radius:14px;border:1px solid var(--line);background:var(--panel);color:var(--text);font:inherit;font-size:16px;outline:none}
input:focus{border-color:var(--accent)}
.pin input{font-size:30px;text-align:center;letter-spacing:.4em;font-weight:800}
button{font:inherit;border:0;border-radius:14px;background:var(--panel);color:var(--text);padding:14px 16px;font-weight:700;cursor:pointer;transition:transform .12s}
button:active{transform:scale(.96)}
.primary{background:var(--accent);color:#06231f;width:100%}
.card button:not(.primary){background:rgba(255,255,255,.08)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
.g{position:relative;aspect-ratio:1;border-radius:14px;overflow:hidden;background:var(--panel);border:1px solid var(--line)}
.g img{width:100%;height:100%;object-fit:cover;display:block}
.g span{position:absolute;inset:auto 0 0 0;padding:18px 7px 6px;font-size:11.5px;font-weight:700;background:linear-gradient(transparent,rgba(0,0,0,.85));line-height:1.2}
.g.noimg span{inset:0;display:flex;align-items:center;justify-content:center;text-align:center;background:none}
h2{font-size:14px;color:var(--muted);margin:18px 2px 0;font-weight:700}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;margin-top:12px}
.np{display:flex;gap:14px;align-items:center}.np b{display:block;font-size:17px}.np small{color:var(--muted)}
.row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.row button{flex:1}
input[type=range]{padding:0;height:6px;accent-color:var(--accent);margin-top:16px;border:0;background:transparent}
nav{position:fixed;left:0;right:0;bottom:0;display:flex;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:rgba(11,13,22,.92);backdrop-filter:blur(14px);border-top:1px solid var(--line)}
nav button{flex:1;background:none;color:var(--muted);font-size:12.5px;padding:10px 4px}
nav button.on{color:var(--accent)}
.toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#222a44;padding:10px 16px;border-radius:99px;font-weight:700;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.on{opacity:1}
.orb{width:40px;height:40px;border-radius:50%;flex:none}
.err{color:#fca5a5;text-align:center;min-height:20px;margin-top:10px}
</style></head><body>
<header><div class="dot"></div><b>lumen</b></header>
<main>
  <section id="login" class="pin">
    <h2>Code affiché dans Lumen (Réglages → Manettes → Télécommande)</h2>
    <div class="card"><input id="pin" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••"><div class="err" id="err"></div><button class="primary" id="go">Se connecter</button></div>
  </section>
  <section id="games" class="hidden"><input id="q" type="search" placeholder="Chercher un jeu"><h2 id="gh">Joués récemment</h2><div class="grid" id="list"></div></section>
  <section id="music" class="hidden"><div class="card"><div class="np"><div><b id="title">Rien en lecture</b><small id="artist"></small></div></div>
    <div class="row"><button data-m="prev">⏮</button><button data-m="toggle" class="primary">⏯</button><button data-m="next">⏭</button></div>
    <input type="range" id="vol" min="0" max="100" value="50" class="hidden"></div>
    <div class="card" id="ingame"><b>Jeu en cours</b><div id="playing" style="color:var(--muted);margin-top:4px">Aucun</div><div class="row"><button id="quit">Quitter le jeu</button></div></div></section>
  <section id="light" class="hidden"><div id="cos"></div></section>
</main>
<nav class="hidden" id="nav"><button data-t="games" class="on">Jeux</button><button data-t="music">Musique</button><button data-t="light">Lumière</button></nav>
<div class="toast" id="toast"></div>
<script>
let token = localStorage.getItem('lumen-token') || '';
let lib = [];
const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1800); };
async function api(p, body) {
  const r = await fetch(p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Token': token }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && p !== '/api/login') { token = ''; localStorage.removeItem('lumen-token'); show(false); throw new Error('code'); }
  return r.json();
}
function show(ok) { $('login').classList.toggle('hidden', ok); $('nav').classList.toggle('hidden', !ok); tab(ok ? 'games' : null); }
function tab(t) { for (const s of ['games', 'music', 'light']) $(s).classList.toggle('hidden', s !== t); document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); if (t === 'games') loadLib(); if (t === 'music') state(); if (t === 'light') lights(); }
$('go').onclick = async () => { const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: $('pin').value.trim() }) }).then((x) => x.json()); if (r.token) { token = r.token; localStorage.setItem('lumen-token', token); show(true); } else $('err').textContent = r.error || 'Erreur'; };
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => tab(b.dataset.t)));
async function loadLib() { if (!lib.length) lib = await api('/api/library'); render(); }
function render() {
  const q = $('q').value.trim().toLowerCase();
  let l = q ? lib.filter((g) => g.name.toLowerCase().includes(q)) : lib.filter((g) => g.recent).sort((a, b) => b.recent - a.recent);
  if (!q && !l.length) l = lib.filter((g) => g.fav);
  $('gh').textContent = q ? l.length + ' résultat(s)' : 'Joués récemment';
  $('list').innerHTML = '';
  for (const g of l.slice(0, 60)) {
    const d = document.createElement('div'); d.className = 'g' + (g.cover ? '' : ' noimg');
    if (g.cover) { const im = new Image(); im.loading = 'lazy'; im.src = '/api/cover?i=' + g.i + '&t=' + token; d.append(im); }
    const s = document.createElement('span'); s.textContent = g.name; d.append(s);
    d.onclick = async () => { if (!confirm('Lancer « ' + g.name + ' » ?')) return; await api('/api/launch', { i: g.i }); toast('Lancement de ' + g.name); };
    $('list').append(d);
  }
}
$('q').oninput = render;
async function state() {
  const s = await api('/api/state');
  const m = s.media || {};
  $('title').textContent = m.active ? m.title || 'Sans titre' : 'Rien en lecture';
  $('artist').textContent = m.active ? m.artist || '' : '';
  $('vol').classList.toggle('hidden', typeof m.vol !== 'number'); if (typeof m.vol === 'number') $('vol').value = Math.round(m.vol * 100);
  $('playing').textContent = s.playing || 'Aucun'; $('quit').disabled = !s.playing;
}
document.querySelectorAll('[data-m]').forEach((b) => (b.onclick = async () => { await api('/api/media', { cmd: b.dataset.m }); setTimeout(state, 500); }));
$('vol').onchange = async (e) => { await api('/api/volume', { v: e.target.value / 100 }); };
$('quit').onclick = async () => { if (confirm('Quitter le jeu en cours ?')) { await api('/api/quit', {}); toast('Jeu fermé'); setTimeout(state, 1500); } };
async function lights() {
  const s = await api('/api/state'); const box = $('cos'); box.innerHTML = '';
  if (!(s.companions || []).length) { box.innerHTML = '<div class="card">Aucune appli connectée (Lueur…) sur le PC.</div>'; return; }
  for (const c of s.companions) {
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = '<div class="np"><div class="orb"></div><div><b></b><small></small></div></div><div class="row"></div>';
    card.querySelector('.orb').style.background = 'radial-gradient(circle at 35% 30%,#fff 0 8%,' + c.color + ' 45%,#000 110%)';
    card.querySelector('b').textContent = c.name; card.querySelector('small').textContent = c.status || '';
    for (const a of c.actions) { const b = document.createElement('button'); b.textContent = a.label; b.onclick = async () => { const r = await api('/api/companion', { id: c.id, a: a.id }); toast(r.ok ? c.name + ' · ' + a.label : r.error || 'Erreur'); }; card.querySelector('.row').append(b); }
    box.append(card);
  }
}
show(!!token);
</script></body></html>`;

module.exports = { start, stop, setPin, lanAddresses, PORT };
