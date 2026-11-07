'use strict';
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, globalShortcut, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');
const SYSTEMS = require('./systems');
const { scanLibrary } = require('./scanner');
const { buildLaunch } = require('./launcher');
const { fetchMissingThumbnails } = require('./thumbnails');
const romm = require('./romm');
const { scanPcStores, fetchSteamGridDB, getSteamDir } = require('./pcstores');
const achievements = require('./achievements');
const { fetchIidb, applyIidb, iidbOptions, listCollections, gameIcons } = require('./iidb');
const { STORES } = require('./pcstores');

let pcLaunchers = new Map(); // id « steam:123 » → infos de lancement (rempli à chaque scan)
const WEB_COVER_HOSTS = /^https:\/\/(cdn\.cloudflare\.steamstatic\.com|shared\.cloudflare\.steamstatic\.com|steamcdn-a\.akamaihd\.net|cdn2\.steamgriddb\.com|assets\.iisu\.network|media\.retroachievements\.org|cdn[0-9]*\.epicgames\.com|cdn[0-9]*\.unrealengine\.com)\//;

protocol.registerSchemesAsPrivileged([
  { scheme: 'lumen-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// La fenêtre reste « visible » pendant qu'un jeu tourne pour pouvoir lire la manette (raccourci de sortie).
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const MEDIA_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mkv', '.mp3', '.ogg', '.opus', '.wav', '.m4a', '.flac']);
const QUIT_SHORTCUT = 'CommandOrControl+Shift+Q';
let win = null;
let currentGame = null; // { child, path }

// ---------- Configuration ----------
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const libraryCachePath = () => path.join(app.getPath('userData'), 'library-cache.json');

function defaultConfig() {
  const home = os.homedir();
  return {
    romsRoot: '',
    mediaRoot: path.join(home, 'ES-DE', 'downloaded_media'),
    gamelistsRoot: path.join(home, 'ES-DE', 'gamelists'),
    emulators: { retroarch: '', dolphin: '', pcsx2: '', cemu: '', eden: '', switch2: '', azahar: '', duckstation: '', melonds: '', ppsspp: '' },
    commands: {},
    swapAB: false,
    fullscreen: true,
    sounds: true,
    soundbites: true,
    videos: true,
    volume: 0.7,
    accent: '#5eead4',
    sort: 'name',
    favorites: [],
    collections: {},
    recent: [],
    playtime: {},
    lastPlayed: {},
    romm: { enabled: false, url: '', username: '', downloadDir: path.join(home, 'Documents', 'Lumen', 'RomM') },
    pcStores: { steam: true, epic: true, gog: true, steamUninstalled: true },
    retroachievements: { username: '' }, // la clé Web API est chiffrée à part
    // Musique de fond et sons d'interface : dossiers de Documents\Lumen pris par défaut s'ils existent.
    music: (() => { const d = path.join(home, 'Documents', 'Lumen', 'Musique iiSU'); const ok = fs.existsSync(d); return { enabled: ok, dir: ok ? d : '', volume: 0.35 }; })(),
    uiSoundsDir: (() => { const d = path.join(home, 'Documents', 'Lumen', 'Sons iiSU'); return fs.existsSync(d) ? d : ''; })(),
    iidb: { enabled: true, priority: true }, // images iiDB ; priority : elles remplacent les autres
    apps: [], // { id, name, target, image } : applications hors jeux (Word, navigateur…)
    platformDir: path.join(home, 'Documents', 'Lumen', 'Plateformes'),
  };
}

// ---------- Visuels de consoles (icônes, logos, bannières déposés par l'utilisateur) ----------
const PLATFORM_KINDS = { icons: 'icon', logos: 'logo', heroes: 'hero' };
function scanPlatformArt(dir) {
  const { findSystem } = require('./scanner');
  const out = {};
  if (!dir) return out;
  for (const [folder, kind] of Object.entries(PLATFORM_KINDS)) {
    const sub = path.join(dir, folder);
    try { fs.mkdirSync(sub, { recursive: true }); } catch { /* lecture seule */ }
    let files = [];
    try { files = fs.readdirSync(sub); } catch { continue; }
    for (const f of files) {
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(f).toLowerCase())) continue;
      const stem = path.parse(f).name.toLowerCase();
      const store = /^(pc-)?(steam|epic|gog)$/.exec(stem);
      const sys = store ? null : SYSTEMS.find((s) => s.id === stem) || findSystem(stem);
      const id = store ? `pc-${store[2]}` : sys && sys.id;
      if (!id) continue;
      (out[id] = out[id] || {})[kind] = path.join(sub, f);
    }
  }
  return out;
}

// ---------- SteamGridDB : clé chiffrée par Windows et cache des images trouvées ----------
const sgdbKeyPath = () => path.join(app.getPath('userData'), 'steamgriddb-key.bin');
const sgdbArtPath = () => path.join(app.getPath('userData'), 'steamgriddb-art.json');
function readSgdbKey() {
  try {
    const buf = fs.readFileSync(sgdbKeyPath());
    return (safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')).trim();
  } catch { return ''; }
}
function readSgdbArt() {
  try { return JSON.parse(fs.readFileSync(sgdbArtPath(), 'utf8')) || {}; } catch { return {}; }
}
// Noms français des étiquettes Steam (liste publique du Store), gardés une semaine.
const steamTagsPath = () => path.join(app.getPath('userData'), 'steam-tags.json');
async function refreshSteamTags() {
  const res = await net.fetch('https://store.steampowered.com/tagdata/populartags/french', { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(String(res.status));
  const list = await res.json();
  const names = Object.fromEntries(list.filter((t) => t && t.tagid && t.name).map((t) => [t.tagid, t.name]));
  fs.writeFileSync(steamTagsPath(), JSON.stringify({ at: Date.now(), names }));
  return names;
}
async function steamTagNames() {
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(steamTagsPath(), 'utf8')); } catch { /* pas encore de cache */ }
  if (!cached) { try { return await refreshSteamTags(); } catch { return {}; } }
  if (Date.now() - cached.at > 7 * 86400e3) refreshSteamTags().catch(() => {});
  return cached.names || {};
}
const scanPc = async (cfg) => scanPcStores(cfg.pcStores, readSgdbArt(), await steamTagNames());

// ---------- RomM : secret chiffré par Windows (DPAPI via safeStorage) ----------
const rommSecretPath = () => path.join(app.getPath('userData'), 'romm-secret.bin');
const rommLibPath = () => path.join(app.getPath('userData'), 'romm-library.json');

function readRommSecret() {
  try {
    const buf = fs.readFileSync(rommSecretPath());
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    return JSON.parse(text);
  } catch { return {}; }
}

function writeRommSecret(secret) {
  const text = JSON.stringify(secret);
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
  fs.mkdirSync(path.dirname(rommSecretPath()), { recursive: true });
  fs.writeFileSync(rommSecretPath(), buf);
}

function rommClient(cfg = loadConfig()) {
  const s = readRommSecret();
  return new romm.RommClient({ url: cfg.romm.url, token: s.token, username: cfg.romm.username, password: s.password });
}

async function rommLibrary(cfg, { refresh }) {
  if (!cfg.romm.enabled || !cfg.romm.url) return null;
  const dir = cfg.romm.downloadDir;
  if (refresh) {
    try {
      const lib = await romm.fetchRommLibrary(rommClient(cfg), dir);
      fs.writeFileSync(rommLibPath(), JSON.stringify(lib));
      return lib;
    } catch (err) {
      // Hors ligne : on garde la dernière liste connue, en signalant l'erreur.
      try {
        const cached = romm.refreshLocalState(JSON.parse(fs.readFileSync(rommLibPath(), 'utf8')), dir);
        cached.error = err.message;
        return cached;
      } catch { return { systems: [], skipped: [], error: err.message }; }
    }
  }
  try { return romm.refreshLocalState(JSON.parse(fs.readFileSync(rommLibPath(), 'utf8')), dir); } catch { return null; }
}

function detectRetroArch() {
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const candidates = [
    'C:\\RetroArch-Win64\\retroarch.exe',
    'C:\\RetroArch\\retroarch.exe',
    path.join(process.env.APPDATA || '', 'RetroArch', 'retroarch.exe'),
    path.join(pf, 'RetroArch', 'retroarch.exe'),
    path.join(pf86, 'Steam', 'steamapps', 'common', 'RetroArch', 'retroarch.exe'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || '';
}

function loadConfig() {
  const d = defaultConfig();
  let cfg = d;
  try {
    const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    cfg = { ...d, ...c, emulators: { ...d.emulators, ...(c.emulators || {}) }, romm: { ...d.romm, ...(c.romm || {}) }, pcStores: { ...d.pcStores, ...(c.pcStores || {}) }, iidb: { ...d.iidb, ...(c.iidb || {}) }, retroachievements: { ...d.retroachievements, ...(c.retroachievements || {}) } };
  } catch { /* première ouverture */ }
  if (!cfg.emulators.retroarch) cfg.emulators.retroarch = detectRetroArch();
  return cfg;
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

function isInside(child, parent) {
  if (!parent) return false;
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// ---------- Fenêtre ----------
function createWindow() {
  const cfg = loadConfig();
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Lumen',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#07090f',
    autoHideMenuBar: true,
    fullscreen: cfg.fullscreen && !process.argv.includes('--windowed'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { win = null; });
}

// ---------- Jeu en cours ----------
function quitCurrentGame() {
  if (!currentGame) return false;
  const { child } = currentGame;
  // taskkill /T ferme aussi les processus enfants (certains émulateurs en lancent).
  execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {});
  return true;
}

function onGameEnded(gamePath, code, started) {
  currentGame = null;
  globalShortcut.unregister(QUIT_SHORTCUT);
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send('game:exit', { path: gamePath, code, seconds: Math.round((Date.now() - started) / 1000) });
}

// ---------- IPC ----------
ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:set', (_e, cfg) => { saveConfig(cfg); return cfg; });
ipcMain.handle('systems', () => SYSTEMS);

ipcMain.handle('library:cached', () => {
  try { return JSON.parse(fs.readFileSync(libraryCachePath(), 'utf8')); } catch { return null; }
});
ipcMain.handle('library:scan', async (_e, opts = {}) => {
  const cfg = loadConfig();
  const lib = await buildLibrary(cfg, opts);
  if (cfg.iidb.enabled !== false) applyIidb(lib, readIidb(), { priority: cfg.iidb.priority !== false });
  try { fs.writeFileSync(libraryCachePath(), JSON.stringify(lib)); } catch { /* cache facultatif */ }
  return lib;
});

// ---------- iiDB : images des jeux, consoles et dossiers ----------
const iidbPath = () => path.join(app.getPath('userData'), 'iidb-art.json');
function readIidb() {
  try { return JSON.parse(fs.readFileSync(iidbPath(), 'utf8')) || {}; } catch { return {}; }
}
let iidbAbort = null;
ipcMain.handle('iidb:fetch', async (_e, opts = {}) => {
  if (iidbAbort) return { ok: false, error: 'Un téléchargement est déjà en cours.' };
  const cfg = loadConfig();
  const lib = await buildLibrary(cfg, { romm: false });
  let systems = lib.systems;
  if (opts.systemId) systems = systems.filter((s) => s.id === opts.systemId);
  const cache = readIidb();
  // « Réessayer » : on oublie les recherches restées sans résultat.
  if (opts.retry) for (const k of ['games', 'platforms', 'collections']) for (const [id, v] of Object.entries(cache[k] || {})) if (v === null) delete cache[k][id];
  iidbAbort = new AbortController();
  const save = () => { try { fs.writeFileSync(iidbPath(), JSON.stringify(cache)); } catch { /* cache facultatif */ } };
  let lastSave = Date.now();
  try {
    const stats = await fetchIidb({
      systems, collections: opts.systemId ? [] : Object.keys(cfg.collections || {}), cache,
      signal: iidbAbort.signal, fetchImpl: (u, o) => net.fetch(u, o),
      onProgress: (p) => {
        if (win) win.webContents.send('iidb:progress', p);
        if (Date.now() - lastSave > 5000) { save(); lastSave = Date.now(); }
      },
    });
    return { ok: true, ...stats };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    save();
    iidbAbort = null;
  }
});
ipcMain.handle('iidb:cancel', () => { if (iidbAbort) iidbAbort.abort(); });

// Variantes iiDB pour l'éditeur d'images (clic droit → Changer les images).
// target : { type: 'game' | 'platform' | 'collection', key, name, systemId }
ipcMain.handle('art:options', async (_e, target = {}) => {
  try {
    const cache = readIidb();
    const sysId = target.type === 'platform' ? target.key : target.systemId;
    const store = /^pc-(\w+)$/.exec(sysId || '');
    const base = SYSTEMS.find((x) => x.id === sysId) || (store && STORES[store[1]] ? { id: sysId, name: STORES[store[1]].name, short: STORES[store[1]].short, pc: true } : null);
    const plat = (cache.platforms || {})[sysId];
    const sys = base ? { ...base, iidbName: plat && plat.name } : null;
    let id = null;
    if (target.type === 'game') id = ((cache.games || {})[target.key] || {}).id;
    if (target.type === 'platform') id = plat && plat.id;
    if (target.type === 'collection' && !target.query) id = ((cache.collections || {})[target.name] || {}).id;
    // Recherche saisie par l'utilisateur : elle remplace le nom pour trouver la fiche iiDB.
    if (target.query) id = null;
    const opts = await iidbOptions({ type: target.type, name: target.query || target.name, query: target.query, sys, id }, { fetchImpl: (u, o) => net.fetch(u, o) });
    return { ok: true, ...opts };
  } catch (err) { return { ok: false, error: err.message, cover: [], icon: [], logo: [], hero: [] }; }
});
ipcMain.handle('iidb:collections', async () => { try { return await listCollections({ fetchImpl: (u, o) => net.fetch(u, o) }); } catch { return []; } });
ipcMain.handle('iidb:gameIcons', async (_e, name) => { try { return await gameIcons(String(name || ''), { fetchImpl: (u, o) => net.fetch(u, o) }); } catch { return []; } });
ipcMain.handle('dialog:image', async (_e, title) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
  return r.canceled ? null : r.filePaths[0];
});

async function buildLibrary(cfg, opts = {}) {
  const lib = await scanLibrary(cfg);
  lib.romsRoot = cfg.romsRoot;
  const rl = await rommLibrary(cfg, { refresh: opts.romm !== false });
  if (rl) {
    romm.mergeLibraries(lib, rl);
    lib.romm = { error: rl.error || null, skipped: rl.skipped || [], count: rl.systems.reduce((n, s) => n + s.games.length, 0) };
    if (lib.error && rl.systems.length) delete lib.error;
  }
  const pc = await scanPc(cfg);
  pcLaunchers = pc.launchers;
  lib.systems.push(...pc.systems);
  await ensureAppIcons(cfg);
  const apps = appsSystem(cfg);
  if (apps) lib.systems.push(apps);
  if ((pc.systems.length || apps) && lib.error && !cfg.romsRoot) delete lib.error;
  lib.platformArt = scanPlatformArt(cfg.platformDir);
  // Noms choisis par l'utilisateur (menu rapide → Renommer), aussi utilisés pour chercher les images.
  const renames = cfg.renames || {};
  for (const s of lib.systems) for (const g of s.games) if (renames[g.path]) g.name = renames[g.path];
  return lib;
}

ipcMain.handle('dialog:folder', async (_e, title, defaultPath) => {
  const r = await dialog.showOpenDialog(win, { title, defaultPath: defaultPath || undefined, properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

const AUDIO_EXT = new Set(['.mp3', '.ogg', '.opus', '.wav', '.m4a', '.flac', '.webm']);
ipcMain.handle('dialog:audio', async (_e, title) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters: [{ name: 'Sons', extensions: [...AUDIO_EXT].map((e) => e.slice(1)) }] });
  return r.canceled ? null : r.filePaths[0];
});
// Musiques de fond : fichiers audio du dossier choisi (sous-dossiers compris, 3 niveaux).
// Octets d'un petit son d'interface (décodé ensuite par Web Audio) : fichiers audio de moins de 8 Mo seulement.
ipcMain.handle('sound:read', async (_e, file) => {
  const p = String(file || '');
  if (!AUDIO_EXT.has(path.extname(p).toLowerCase())) return null;
  try {
    const st = await fs.promises.stat(p);
    if (!st.isFile() || st.size > 8 * 1024 * 1024) return null;
    return await fs.promises.readFile(p);
  } catch { return null; }
});
ipcMain.handle('music:list', async (_e, dir) => {
  const out = [];
  const walk = async (d, depth) => {
    let entries = [];
    try { entries = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && depth < 3) await walk(full, depth + 1);
      else if (e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
      if (out.length >= 2000) return;
    }
  };
  if (dir && fs.existsSync(dir)) await walk(dir, 0);
  return out;
});

ipcMain.handle('dialog:file', async (_e, title, defaultPath) => {
  const r = await dialog.showOpenDialog(win, {
    title,
    defaultPath: defaultPath || undefined,
    properties: ['openFile'],
    filters: [{ name: 'Programmes', extensions: ['exe', 'bat', 'cmd'] }, { name: 'Tous les fichiers', extensions: ['*'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

let thumbsAbort = null;
ipcMain.handle('thumbs:fetch', async (_e, systemId) => {
  if (thumbsAbort) return { ok: false, error: 'Un téléchargement est déjà en cours.' };
  const cfg = loadConfig();
  const lib = await scanLibrary(cfg);
  const systems = lib.systems.filter((s) => !systemId || s.id === systemId);
  if (!systems.length) return { ok: false, noRoms: true, error: 'Aucune ROM à traiter : libretro-thumbnails ne sert qu’aux consoles rétro (dossier des ROMs). Pour les jeux PC, utilise plutôt les images iiDB.' };
  thumbsAbort = new AbortController();
  try {
    const stats = await fetchMissingThumbnails({
      romsRoot: cfg.romsRoot,
      cacheDir: path.join(app.getPath('userData'), 'thumbnail-index'),
      systems,
      signal: thumbsAbort.signal,
      onProgress: (p) => { if (win) win.webContents.send('thumbs:progress', p); },
    });
    return { ok: true, ...stats };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    thumbsAbort = null;
  }
});
ipcMain.handle('thumbs:cancel', () => { if (thumbsAbort) thumbsAbort.abort(); });

// ---------- Succès (Steam, lus en local) ----------
ipcMain.handle('achievements:summary', async () => {
  const dir = await getSteamDir();
  if (!dir) return { games: [], recent: [], error: 'Steam introuvable sur ce PC.' };
  if (![...pcLaunchers.values()].some((l) => l.store === 'steam')) pcLaunchers = (await scanPc(loadConfig())).launchers;
  const games = [...pcLaunchers.values()].filter((l) => l.store === 'steam' && l.appid).map((l) => ({ path: l.id, appid: l.appid }));
  return achievements.steamSummary(dir, games);
});
ipcMain.handle('achievements:game', async (_e, gamePath) => {
  const m = /^steam:(\d+)$/.exec(String(gamePath || ''));
  const dir = m && await getSteamDir();
  return dir ? achievements.steamGame(dir, Number(m[1])) : null;
});

// ---------- RetroAchievements (pseudo + clé Web API de l'utilisateur) ----------
const raKeyPath = () => path.join(app.getPath('userData'), 'retroachievements-key.bin');
function readRaKey() {
  try {
    const buf = fs.readFileSync(raKeyPath());
    return (safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')).trim();
  } catch { return ''; }
}
const RA_MEDIA = 'https://media.retroachievements.org';
async function raCall(name, params) {
  const cfg = loadConfig();
  const key = readRaKey();
  const user = (cfg.retroachievements || {}).username;
  if (!key || !user) throw new Error('Indique ton pseudo et ta clé RetroAchievements dans les Réglages.');
  const qs = new URLSearchParams({ ...params, u: params.u || user, y: key });
  const res = await net.fetch(`https://retroachievements.org/API/${name}.php?${qs}`, { signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) throw new Error('Clé RetroAchievements refusée.');
  if (!res.ok) throw new Error(`RetroAchievements : erreur ${res.status}`);
  return res.json();
}
const raDate = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + (/[zZ+]/.test(s) ? '' : 'Z')) || 0 : 0);
ipcMain.handle('ra:status', () => ({ hasKey: !!readRaKey(), username: (loadConfig().retroachievements || {}).username || '' }));
ipcMain.handle('ra:setKey', (_e, value) => {
  const text = String(value || '').trim();
  if (!text) { fs.rmSync(raKeyPath(), { force: true }); return true; }
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
  fs.writeFileSync(raKeyPath(), buf);
  return true;
});
ipcMain.handle('ra:summary', async () => {
  try {
    const prog = await raCall('API_GetUserCompletionProgress', { c: 500 });
    const recent = await raCall('API_GetUserRecentAchievements', { m: 60 * 24 * 90 }).catch(() => []);
    return {
      games: ((prog && prog.Results) || []).map((r) => ({
        raId: r.GameID, title: r.Title, console: r.ConsoleName, icon: r.ImageIcon ? `web-cover:${RA_MEDIA}${r.ImageIcon}` : null,
        total: Number(r.MaxPossible) || 0, unlocked: Math.max(Number(r.NumAwarded) || 0, Number(r.NumAwardedHardcore) || 0), last: raDate(r.MostRecentAwardedDate),
      })).filter((r) => r.total),
      recent: (Array.isArray(recent) ? recent : []).map((a) => ({
        raId: a.GameID, gameName: a.GameTitle, name: a.Title, desc: a.Description, time: raDate(a.Date),
        icon: a.BadgeURL ? `web-cover:${RA_MEDIA}${a.BadgeURL}` : null,
      })),
    };
  } catch (err) { return { games: [], recent: [], error: err.message }; }
});
ipcMain.handle('ra:game', async (_e, gameId) => {
  try {
    const d = await raCall('API_GetGameInfoAndUserProgress', { g: Number(gameId) });
    const list = Object.values(d.Achievements || {}).map((a) => {
      const time = raDate(a.DateEarnedHardcore || a.DateEarned);
      return {
        id: a.ID, name: a.Title, desc: a.Description + (a.Points ? ` · ${a.Points} pts` : ''), hidden: false,
        icon: `web-cover:${RA_MEDIA}/Badge/${a.BadgeName}.png`, iconGray: `web-cover:${RA_MEDIA}/Badge/${a.BadgeName}_lock.png`,
        unlocked: !!(a.DateEarned || a.DateEarnedHardcore), time,
      };
    });
    const done = list.filter((a) => a.unlocked);
    return { title: d.Title, total: list.length, unlocked: done.length, list };
  } catch (err) { return { error: err.message }; }
});

// ---------- Applications (hors jeux) ----------
const appIconDir = () => path.join(app.getPath('userData'), 'app-icons');
const { extractIcon } = require('./appicon');
// Icône en grand format (-hd.png) ; l'ancienne petite icône sert de repli.
function appIconFile(id) {
  for (const name of [`${id}-hd.png`, `${id}.png`]) { const p = path.join(appIconDir(), name); if (fs.existsSync(p)) return p; }
  return null;
}
async function makeAppIcon(id, target) {
  fs.mkdirSync(appIconDir(), { recursive: true });
  if (await extractIcon(target, path.join(appIconDir(), `${id}-hd.png`))) return true;
  // Repli : icône Windows standard (32 px), depuis la cible du raccourci si possible.
  let src = target;
  if (/\.lnk$/i.test(target)) { try { src = shell.readShortcutLink(target).target || target; } catch { /* raccourci illisible */ } }
  try { fs.writeFileSync(path.join(appIconDir(), `${id}.png`), (await app.getFileIcon(src, { size: 'large' })).toPNG()); return true; } catch { return false; }
}
// Applications ajoutées avant les icônes grand format : on les régénère une fois.
async function ensureAppIcons(cfg) {
  for (const a of cfg.apps || []) {
    if (!a || !a.id || !a.target || a.image) continue;
    if (!fs.existsSync(path.join(appIconDir(), `${a.id}-hd.png`)) && fs.existsSync(a.target)) await makeAppIcon(a.id, a.target);
  }
}
function appsSystem(cfg) {
  const list = (cfg.apps || []).filter((a) => a && a.id && a.target);
  if (!list.length) return null;
  return {
    id: 'apps', name: 'Applications', short: 'Apps', color: '#0e7490', folder: null, pc: true, apps: true,
    games: list.map((a) => ({
      path: `app:${a.id}`, system: 'apps', name: a.name, source: 'app',
      cover: a.image || appIconFile(a.id),
      appIcon: !a.image, target: a.target,
      desc: '', developer: '', publisher: '', genre: '', players: '', year: '', rating: null,
    })).sort((x, y) => x.name.localeCompare(y.name, 'fr', { sensitivity: 'base' })),
  };
}
ipcMain.handle('apps:add', async () => {
  const startMenu = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const r = await dialog.showOpenDialog(win, {
    title: 'Choisir une application (programme ou raccourci du menu Démarrer)',
    defaultPath: startMenu,
    properties: ['openFile'],
    filters: [{ name: 'Applications', extensions: ['exe', 'lnk', 'url', 'bat', 'cmd'] }, { name: 'Tous les fichiers', extensions: ['*'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const target = r.filePaths[0];
  const cfg = loadConfig();
  const id = require('crypto').randomBytes(6).toString('hex');
  await makeAppIcon(id, target);
  const entry = { id, name: path.parse(target).name, target, image: '' };
  cfg.apps = [...(cfg.apps || []), entry];
  saveConfig(cfg);
  return entry;
});
ipcMain.handle('apps:remove', (_e, id) => {
  const cfg = loadConfig();
  cfg.apps = (cfg.apps || []).filter((a) => a.id !== id);
  saveConfig(cfg);
  for (const n of [`${id}.png`, `${id}-hd.png`]) fs.rmSync(path.join(appIconDir(), n), { force: true });
  return true;
});
ipcMain.handle('apps:update', async (_e, id, changes = {}) => {
  const cfg = loadConfig();
  const a = (cfg.apps || []).find((x) => x.id === id);
  if (!a) return null;
  if (typeof changes.name === 'string' && changes.name.trim()) a.name = changes.name.trim().slice(0, 80);
  if (changes.pickImage) {
    const r = await dialog.showOpenDialog(win, {
      title: `Image pour ${a.name}`, properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    a.image = r.filePaths[0];
  }
  if (changes.resetImage) a.image = '';
  saveConfig(cfg);
  return a;
});

let sgdbAbort = null;
ipcMain.handle('sgdb:status', () => ({ hasKey: !!readSgdbKey(), encrypted: safeStorage.isEncryptionAvailable() }));
ipcMain.handle('sgdb:setKey', (_e, value) => {
  const text = String(value || '').trim();
  if (!text) { fs.rmSync(sgdbKeyPath(), { force: true }); return true; }
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
  fs.mkdirSync(path.dirname(sgdbKeyPath()), { recursive: true });
  fs.writeFileSync(sgdbKeyPath(), buf);
  return true;
});
ipcMain.handle('sgdb:fetch', async () => {
  if (sgdbAbort) return { ok: false, error: 'Un téléchargement est déjà en cours.' };
  const key = readSgdbKey();
  if (!key) return { ok: false, error: 'Ajoute d’abord ta clé SteamGridDB.' };
  const cfg = loadConfig();
  const { systems } = await scanPcStores(cfg.pcStores, {});
  if (!systems.length) return { ok: false, error: 'Aucun jeu PC à traiter.' };
  const art = readSgdbArt();
  sgdbAbort = new AbortController();
  const save = () => { try { fs.writeFileSync(sgdbArtPath(), JSON.stringify(art)); } catch { /* cache facultatif */ } };
  let lastSave = Date.now();
  try {
    const stats = await fetchSteamGridDB({
      key, systems, art, signal: sgdbAbort.signal, fetchImpl: (u, o) => net.fetch(u, o),
      onProgress: (p) => {
        if (win) win.webContents.send('sgdb:progress', p);
        if (Date.now() - lastSave > 5000) { save(); lastSave = Date.now(); }
      },
    });
    return { ok: true, ...stats };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    save();
    sgdbAbort = null;
  }
});
ipcMain.handle('sgdb:cancel', () => { if (sgdbAbort) sgdbAbort.abort(); });

ipcMain.handle('app:quit', () => app.quit());
ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion(); });
// Manettes PlayStation lues en HID par Lumen (voir nativepad.js), transmises au rendu.
const nativepad = require('./nativepad');
app.whenReady().then(() => nativepad.start((ev) => { if (win && !win.isDestroyed()) win.webContents.send('pad:native', ev); }));
app.on('will-quit', () => nativepad.stop());

// Journal de diagnostic des manettes (limité à ~200 Ko, remis à zéro au-delà).
// ---------- Mises à jour automatiques (releases GitHub de Flaimeur/Lumen) ----------
// Lumen vérifie au démarrage puis toutes les 6 h, télécharge en arrière-plan et propose de redémarrer.
let updater = null;
const updateState = { status: 'idle', version: null, progress: 0, error: null };
function sendUpdate() { if (win && !win.isDestroyed()) win.webContents.send('update:state', updateState); }
function setupUpdater() {
  if (!app.isPackaged || updater) return;
  try { updater = require('electron-updater').autoUpdater; } catch { return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => { Object.assign(updateState, { status: 'checking', error: null }); sendUpdate(); });
  updater.on('update-available', (i) => { Object.assign(updateState, { status: 'downloading', version: i.version, progress: 0 }); sendUpdate(); });
  updater.on('update-not-available', () => { Object.assign(updateState, { status: 'uptodate' }); sendUpdate(); });
  updater.on('download-progress', (p) => { updateState.progress = Math.round(p.percent || 0); sendUpdate(); });
  updater.on('update-downloaded', (i) => { Object.assign(updateState, { status: 'ready', version: i.version, progress: 100 }); sendUpdate(); });
  updater.on('error', (err) => { Object.assign(updateState, { status: 'error', error: String(err && err.message || err).slice(0, 200) }); sendUpdate(); });
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 15000);
  setInterval(check, 6 * 60 * 60 * 1000);
}
app.whenReady().then(setupUpdater);
ipcMain.handle('update:state', () => ({ ...updateState, current: app.getVersion(), packaged: app.isPackaged }));
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { ...updateState, status: 'dev' };
  setupUpdater();
  try { await updater.checkForUpdates(); } catch (err) { Object.assign(updateState, { status: 'error', error: err.message }); }
  return updateState;
});
ipcMain.handle('update:install', () => { if (updater && updateState.status === 'ready') setImmediate(() => updater.quitAndInstall(false, true)); return true; });

// Sauvegarde / restauration : la config (favoris, dossiers, profils manette, images et sons choisis,
// accueil, applications…) dans un fichier .json. Les clés et mots de passe chiffrés n'y sont jamais.
ipcMain.handle('config:export', async () => {
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, { title: 'Sauvegarder la configuration de Lumen', defaultPath: path.join(app.getPath('documents'), `Lumen-sauvegarde-${stamp}.json`), filters: [{ name: 'Sauvegarde Lumen', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  const bundle = { lumen: 'backup', version: 1, app: app.getVersion(), date: new Date().toISOString(), config: loadConfig() };
  fs.writeFileSync(r.filePath, JSON.stringify(bundle, null, 2));
  return { ok: true, file: r.filePath };
});
ipcMain.handle('config:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Restaurer une sauvegarde de Lumen', properties: ['openFile'], filters: [{ name: 'Sauvegarde Lumen', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  try {
    const bundle = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (!bundle || bundle.lumen !== 'backup' || typeof bundle.config !== 'object') return { ok: false, error: 'Ce fichier n’est pas une sauvegarde de Lumen.' };
    // L'ancienne config est gardée à côté, au cas où.
    try { fs.copyFileSync(configPath(), configPath() + '.avant-restauration'); } catch { /* pas encore de config */ }
    saveConfig({ ...defaultConfig(), ...bundle.config });
    return { ok: true, date: bundle.date };
  } catch (err) { return { ok: false, error: `Sauvegarde illisible : ${err.message}` }; }
});

// Média en cours sur le PC (Spotify, YouTube…) pour le widget « Lecture en cours ».
const mediactl = require('./mediactl');
ipcMain.handle('media:ask', async (_e, cmd) => {
  const c = ['state', 'toggle', 'next', 'prev'].includes(cmd) ? cmd : 'state';
  return mediactl.ask(c, path.join(app.getPath('userData'), 'media-covers'));
});
app.on('will-quit', () => mediactl.stop());

// Météo du widget d'accueil : Open-Meteo (gratuit, sans clé), gardée 20 minutes.
const weatherCache = new Map();
ipcMain.handle('weather:get', async (_e, city) => {
  const q = String(city || '').trim();
  if (!q) return { error: 'Aucune ville' };
  const hit = weatherCache.get(q.toLowerCase());
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.data;
  try {
    const geo = await (await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10000) })).json();
    const place = geo && geo.results && geo.results[0];
    if (!place) return { error: `Ville introuvable : ${q}` };
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}`
      + '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto';
    const w = await (await net.fetch(url, { signal: AbortSignal.timeout(10000) })).json();
    const data = {
      city: place.name, temp: Math.round(w.current.temperature_2m), code: w.current.weather_code, day: !!w.current.is_day,
      max: Math.round(w.daily.temperature_2m_max[0]), min: Math.round(w.daily.temperature_2m_min[0]),
    };
    weatherCache.set(q.toLowerCase(), { at: Date.now(), data });
    return data;
  } catch (err) { return { error: 'Météo indisponible' }; }
});

ipcMain.on('pad:log', (_e, msg) => {
  try {
    const file = path.join(app.getPath('userData'), 'pad-diagnostic.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 200 * 1024) fs.writeFileSync(file, '');
    fs.appendFileSync(file, new Date().toISOString() + ' ' + String(msg).slice(0, 500) + '\n');
  } catch { /* journal facultatif */ }
});

// Manette → clavier/souris (profils par jeu) : le rendu lit la manette, le processus d'aide tape.
const padmapper = require('./padmapper');
ipcMain.handle('mapper:start', () => { padmapper.start(); return true; });
ipcMain.on('mapper:send', (_e, events) => padmapper.send(events));
ipcMain.handle('mapper:stop', () => { padmapper.stop(); return true; });
app.on('will-quit', () => padmapper.stop());
// Ouvre uniquement le dossier des visuels de consoles dans l'Explorateur.
ipcMain.handle('app:openPlatformDir', async () => {
  const dir = loadConfig().platformDir;
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});
ipcMain.handle('app:fullscreen', () => {
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});

ipcMain.handle('game:quit', () => quitCurrentGame());

// ---------- RomM ----------
ipcMain.handle('romm:status', () => {
  const s = readRommSecret();
  return { hasToken: !!s.token, hasPassword: !!s.password, encrypted: safeStorage.isEncryptionAvailable() };
});

ipcMain.handle('romm:setSecret', (_e, kind, value) => {
  const s = readRommSecret();
  if (kind === 'token') { s.token = value || ''; if (value) delete s.password; }
  if (kind === 'password') { s.password = value || ''; if (value) delete s.token; }
  if (kind === 'clear') { delete s.token; delete s.password; }
  writeRommSecret(s);
  return true;
});

ipcMain.handle('romm:test', async () => {
  const cfg = loadConfig();
  const client = rommClient(cfg);
  if (!client.base) return { ok: false, error: 'Adresse du serveur non définie.' };
  try {
    const hb = await client.heartbeat();
    if (!client.configured) return { ok: false, error: `Serveur trouvé (RomM ${hb.version || '?'}) mais aucun jeton ni mot de passe.` };
    const platforms = await client.platforms();
    const roms = platforms.reduce((n, p) => n + (p.rom_count || 0), 0);
    const unsupported = platforms.filter((p) => p.rom_count && !romm.systemFor(p)).map((p) => p.display_name || p.name);
    return { ok: true, version: hb.version, platforms: platforms.filter((p) => p.rom_count).length, roms, unsupported };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

let rommAbort = null;
ipcMain.handle('romm:download', async (_e, game) => {
  if (rommAbort) return { ok: false, error: 'Un téléchargement RomM est déjà en cours.' };
  const cfg = loadConfig();
  const sys = SYSTEMS.find((s) => s.id === game?.system);
  if (!sys || !game.rommId) return { ok: false, error: 'Jeu RomM inconnu.' };
  rommAbort = new AbortController();
  try {
    const file = await romm.downloadRom(rommClient(cfg), game, sys, cfg.romm.downloadDir, {
      signal: rommAbort.signal,
      onProgress: (p) => { if (win) win.webContents.send('romm:progress', p); },
    });
    return { ok: true, path: file };
  } catch (err) {
    return { ok: false, error: err.message, cancelled: rommAbort.signal.aborted };
  } finally {
    rommAbort = null;
  }
});
ipcMain.handle('romm:cancel', () => { if (rommAbort) rommAbort.abort(); });

ipcMain.handle('romm:deleteLocal', async (_e, game) => {
  const cfg = loadConfig();
  const sys = SYSTEMS.find((s) => s.id === game?.system);
  if (!sys || !game.rommId || !isInside(game.path, cfg.romm.downloadDir)) return { ok: false, error: 'Copie locale introuvable.' };
  const t = romm.localTarget(cfg.romm.downloadDir, sys.id, { fs_name: game.rommFile, fs_name_no_ext: game.rommNoExt, has_multiple_files: game.rommMulti });
  await fs.promises.rm(t.multi ? t.dir : t.file, { recursive: true, force: true });
  return { ok: true };
});

ipcMain.handle('game:launch', async (_e, game) => {
  if (currentGame) return { ok: false, error: 'Un jeu est déjà en cours.' };
  const cfg = loadConfig();

  // Applications ajoutées par l'utilisateur : ouvertes par Windows, depuis la cible enregistrée dans la config.
  if (/^app:/.test(String(game?.path))) {
    const a = (cfg.apps || []).find((x) => `app:${x.id}` === game.path);
    if (!a) return { ok: false, error: 'Application introuvable.' };
    if (!fs.existsSync(a.target)) return { ok: false, error: `Introuvable : ${a.target}` };
    const err = await shell.openPath(a.target);
    return err ? { ok: false, error: err } : { ok: true, detached: true };
  }

  // Jeux PC (Steam, Epic, GOG) : lancés par leur launcher, à partir de nos propres données de scan.
  if (/^(steam|epic|gog):/.test(String(game?.path))) {
    if (!pcLaunchers.has(game.path)) pcLaunchers = (await scanPc(cfg)).launchers;
    const l = pcLaunchers.get(game.path);
    if (!l) return { ok: false, error: 'Jeu PC introuvable : il a peut-être été désinstallé.' };
    try {
      if (l.uri) await shell.openExternal(l.uri);
      else spawn(l.exe, l.args || [], { cwd: l.cwd, detached: true, stdio: 'ignore' }).unref();
      return { ok: true, detached: true };
    } catch (err) {
      return { ok: false, error: `Impossible de lancer le jeu : ${err.message}` };
    }
  }
  const sys = SYSTEMS.find((s) => s.id === game?.system);
  if (!sys) return { ok: false, error: 'Console inconnue.' };
  if (!isInside(game.path, cfg.romsRoot) && !isInside(game.path, cfg.romm.downloadDir)) {
    return { ok: false, error: 'Ce fichier n’est ni dans ton dossier de ROMs ni dans les téléchargements RomM.' };
  }
  if (!fs.existsSync(game.path)) return { ok: false, error: 'Fichier introuvable. Rescanne la bibliothèque.' };

  const template = cfg.commands[sys.id] || sys.command;
  if (template.trim() === '{open}') {
    const err = await shell.openPath(game.path);
    return err ? { ok: false, error: err } : { ok: true, detached: true };
  }

  let cmd;
  try { cmd = buildLaunch(template, game.path, cfg.emulators); } catch (err) { return { ok: false, error: err.message }; }
  if (/[\\/]/.test(cmd.exe) && !fs.existsSync(cmd.exe)) {
    return { ok: false, error: `Émulateur introuvable : ${cmd.exe}` };
  }

  return new Promise((resolve) => {
    const started = Date.now();
    let child;
    try {
      child = spawn(cmd.exe, cmd.args, { cwd: path.dirname(cmd.exe) || undefined, stdio: 'ignore', windowsHide: false });
    } catch (err) {
      resolve({ ok: false, error: `Impossible de lancer ${path.basename(cmd.exe)} : ${err.message}` });
      return;
    }
    child.once('error', (err) => {
      currentGame = null;
      resolve({ ok: false, error: `Impossible de lancer ${path.basename(cmd.exe)} : ${err.message}` });
    });
    child.once('spawn', () => {
      currentGame = { child, path: game.path };
      globalShortcut.register(QUIT_SHORTCUT, quitCurrentGame);
      resolve({ ok: true });
    });
    child.once('exit', (code) => onGameEnded(game.path, code, started));
  });
});

// ---------- Démarrage ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    // Médias locaux (images, vidéos, sons) servis au rendu sans ouvrir tout le disque au navigateur.
    const coverCache = path.join(app.getPath('userData'), 'romm-covers');
    protocol.handle('lumen-media', async (req) => {
      const u = new URL(req.url);
      if (u.hostname === 'web') {
        // Image publique (ex. CDN Steam) : téléchargée une fois puis servie depuis le cache.
        const src = u.searchParams.get('u') || '';
        if (!WEB_COVER_HOSTS.test(src)) return new Response('', { status: 404 });
        // L'extension est gardée pour que les sons (mp3, wav…) soient reconnus à la lecture.
        let ext = '';
        try { ext = (/^\.[a-z0-9]{2,5}$/i.exec(path.extname(new URL(src).pathname)) || [''])[0].toLowerCase(); } catch { /* URL sans extension */ }
        const file = path.join(app.getPath('userData'), 'web-covers', require('crypto').createHash('sha1').update(src).digest('hex') + ext);
        try {
          if (!fs.existsSync(file)) {
            const res = await net.fetch(src);
            if (!res.ok) return new Response('', { status: 404 });
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
          }
          return net.fetch(pathToFileURL(file).toString());
        } catch { return new Response('', { status: 404 }); }
      }
      if (u.hostname === 'romm') {
        // Jaquette RomM : téléchargée une fois avec l'authentification, puis servie depuis le cache.
        try {
          const file = await romm.cachedCover(rommClient(), coverCache, u.searchParams.get('c') || '');
          if (file) return net.fetch(pathToFileURL(file).toString());
        } catch { /* hors ligne */ }
        return new Response('', { status: 404 });
      }
      const p = u.searchParams.get('p') || '';
      if (!p || !MEDIA_EXT.has(path.extname(p).toLowerCase()) || !fs.existsSync(p)) {
        return new Response('', { status: 404 });
      }
      return net.fetch(pathToFileURL(p).toString(), { headers: req.headers });
    });
    createWindow();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
