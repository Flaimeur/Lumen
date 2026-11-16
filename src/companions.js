'use strict';
// Applis connectées : des applis de l'utilisateur que Lumen détecte et pilote depuis un widget.
//  - Lueur (lumière de la chambre + RGB du PC) : reconnue d'office, commandes --on / --off / --toggle / --screen.
//  - N'importe quelle autre appli : un fichier %APPDATA%\<Appli>\lumen-widget.json
//      { "name": "…", "exe": "C:\\…\\appli.exe", "color": "#5eead4",
//        "actions": [{ "id": "go", "label": "Lancer", "args": ["--go"], "icon": "▶" }],
//        "status": "texte court affiché dans le widget (facultatif)" }
// On ne lit jamais les secrets des applis (jetons, mots de passe) : seulement ce qui sert à l'affichage.
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const appData = () => process.env.APPDATA || '';
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } };

function regRun(name) {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', name], { windowsHide: true }, (err, out) => {
      if (err) return resolve('');
      const m = /REG_\w+\s+(.+)/.exec(String(out));
      if (!m) return resolve('');
      const v = m[1].trim();
      const q = /^"([^"]+)"/.exec(v);
      resolve(q ? q[1] : v.split(/\s+--/)[0]);
    });
  });
}
function runningPath(proc) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Name '${proc}' -ErrorAction SilentlyContinue | Select-Object -First 1).Path`], { windowsHide: true, timeout: 8000 }, (err, out) => resolve(err ? '' : String(out).trim()));
  });
}

const hex = (r, g, b) => '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');

async function lueur() {
  const dir = path.join(appData(), 'Lueur');
  const settings = readJson(path.join(dir, 'settings.json'));
  // Lueur 1.1+ écrit son état pour Lumen (state.json) : allumé, couleur, mode, scènes. Plus besoin de chercher le processus.
  const st = readJson(path.join(dir, 'state.json'));
  let exe = await regRun('Lueur');
  if (st && exists(st.exe)) exe = st.exe;
  const running = st && typeof st.running === 'boolean' ? (st.running ? (exe || 'oui') : '') : await runningPath('Lueur');
  if (!exists(exe)) exe = running;
  if (!exists(exe)) {
    const home = process.env.USERPROFILE || '';
    exe = [path.join(home, 'Desktop', 'Lueur', 'dist', 'Lueur.exe'), path.join(home, 'Bureau', 'Lueur', 'dist', 'Lueur.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Lueur', 'Lueur.exe')].find(exists) || '';
  }
  if (!exe && !settings) return null;
  const look = settings && settings.Look;
  const rgb = look && look.BaseRgb;
  let color = rgb ? hex(rgb.R, rgb.G, rgb.B) : '#fbbf24';
  let level = look ? Math.round((look.Level || 0) * 100) : null;
  let status = look ? (look.IsWhite ? `Blanc ${look.Kelvin} K` : 'Couleur') + (level != null ? ` · ${level} %` : '') : 'Lumière de la chambre et RGB du PC';
  const cmds = new Set(((st && st.commands) || []).map((c) => String(c).split(' ')[0]));
  const has = (c) => !st || !st.commands || cmds.has(c);
  if (st) {
    if (/^#[0-9a-f]{6}$/i.test(st.color || '')) color = st.color;
    if (typeof st.level === 'number') level = st.level;
    const mode = st.mode === 'screen' ? ' · mode écran' : st.mode === 'adaptive' ? ' · adaptatif' : '';
    status = (st.on === false ? 'Éteint' : String(st.description || status).replace(/\u00B7/g, '·')) + mode;
  }
  const scenes = ((st && st.scenes) || ((settings && settings.Scenes) || []).map((s) => s.Name)).filter(Boolean).slice(0, 12);
  const adaptiveOn = st ? st.mode === 'adaptive' : !!(settings && settings.AdaptiveOn);
  const actions = [
    { id: 'on', label: 'Allumer', args: ['--on'], icon: '☀' },
    { id: 'off', label: 'Éteindre', args: ['--off'], icon: '🌙' },
    { id: 'toggle', label: 'Basculer', args: ['--toggle'], icon: '⟳' },
    { id: 'screen', label: 'Mode écran', args: ['--screen'], icon: '⛶' },
    { id: 'warm', label: 'Soirée', args: ['--warm'], icon: '🌙' },
  ];
  if (has('--adaptive')) actions.push({ id: 'adaptive', label: adaptiveOn ? 'Arrêter l’adaptatif' : 'Lumière adaptative', args: ['--adaptive', adaptiveOn ? 'off' : 'on'], icon: '⚡' });
  if (has('--scene')) for (const name of scenes) actions.push({ id: 'scene:' + name, label: 'Scène ' + name, args: ['--scene', name], icon: '★', scene: true });
  if (has('--show')) actions.push({ id: 'show', label: 'Ouvrir Lueur', args: ['--show'], icon: '▶' });
  return {
    id: 'lueur', name: 'Lueur', exe, running: !!running, on: st ? st.on !== false : null, color, status, level, version: st && st.version,
    actions,
    open: [],
  };
}

// Applis qui se déclarent avec lumen-widget.json.
function manifests() {
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(appData(), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const d of dirs) {
    const m = readJson(path.join(appData(), d, 'lumen-widget.json'));
    if (!m || !m.name || !exists(m.exe)) continue;
    const id = 'app-' + d.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    out.push({
      id, name: String(m.name).slice(0, 40), exe: m.exe, color: /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : '#5eead4',
      status: m.status ? String(m.status).slice(0, 80) : '', running: false,
      actions: (Array.isArray(m.actions) ? m.actions : []).slice(0, 6).map((a, i) => ({ id: String(a.id || i), label: String(a.label || 'Action').slice(0, 24), args: Array.isArray(a.args) ? a.args.map(String) : [], icon: a.icon || '▶' })),
      open: [],
    });
  }
  return out;
}

let cache = null;
async function list(force) {
  if (cache && !force && Date.now() - cache.at < 15000) return cache.list;
  const items = [];
  try { const l = await lueur(); if (l) items.push(l); } catch { /* Lueur absent */ }
  for (const m of manifests()) if (!items.some((x) => x.id === m.id)) items.push(m);
  cache = { at: Date.now(), list: items };
  return items;
}

// Lance une action déclarée (jamais une commande libre venue du rendu).
async function run(id, actionId) {
  const items = await list();
  const app = items.find((x) => x.id === id);
  if (!app || !exists(app.exe)) return { ok: false, error: `${app ? app.name : 'Appli'} introuvable sur ce PC.` };
  const act = actionId === '__open' ? { args: [] } : app.actions.find((a) => a.id === actionId);
  if (!act) return { ok: false, error: 'Action inconnue.' };
  try {
    const child = spawn(app.exe, act.args, { detached: true, stdio: 'ignore', windowsHide: actionId !== '__open', cwd: path.dirname(app.exe) });
    child.on('error', () => {});
    child.unref();
    cache = null;
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

module.exports = { list, run };
