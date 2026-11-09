'use strict';
// Jeux PC installés : Steam, Epic Games Launcher, GOG Galaxy et itch.
// Lecture seule des fichiers et du registre de ces launchers ; le lancement passe par le launcher lui-même.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');

const STEAM_SKIP_IDS = new Set([228980, 1070560, 1391110, 1628350, 1493710, 250820, 1826330, 2180100]);
const STEAM_SKIP_NAME = /steamworks|redistributable|proton|steam linux runtime|steamvr|soundtrack|dedicated server|\bsdk\b/i;

function regQuery(args) {
  return new Promise((resolve) => {
    execFile('reg', ['query', ...args], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => resolve(err ? '' : out));
  });
}

async function regValue(key, name) {
  const out = await regQuery([key, '/v', name]);
  const m = new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.*)$`, 'mi').exec(out);
  return m ? m[1].trim() : '';
}

// Format texte « VDF » de Valve → objet.
function parseVdf(text) {
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|[{}]/g) || [];
  let i = 0;
  const unq = (t) => t.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  function block() {
    const obj = {};
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t === '}') return obj;
      const key = unq(t);
      const next = tokens[i++];
      obj[key] = next === '{' ? block() : unq(next || '""');
    }
    return obj;
  }
  return block();
}

async function readText(file) {
  try { return await fsp.readFile(file, 'utf8'); } catch { return ''; }
}

// ---------- Steam ----------
async function findSteamImages(steamDir, appid) {
  const found = {};
  const want = (name) => {
    const n = name.toLowerCase();
    if (/^library_(capsule|600x900)(_2x)?\.(jpg|png)$/.test(n)) return 'cover';
    if (/^library_hero\.(jpg|png)$/.test(n)) return 'hero';
    if (/^logo\.png$/.test(n)) return 'logo';
    if (/^(library_)?header\.(jpg|png)$/.test(n)) return 'header';
    return null;
  };
  const base = path.join(steamDir, 'appcache', 'librarycache');
  // Ancien format : <appid>_library_600x900.jpg à plat.
  for (const [file, kind] of [[`${appid}_library_600x900.jpg`, 'cover'], [`${appid}_library_hero.jpg`, 'hero'], [`${appid}_logo.png`, 'logo'], [`${appid}_header.jpg`, 'header']]) {
    const p = path.join(base, file);
    if (fs.existsSync(p)) found[kind] = found[kind] || p;
  }
  // Nouveau format : librarycache/<appid>/<hash>/library_capsule.jpg…
  const walk = async (dir, depth) => {
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 2) await walk(full, depth + 1);
      else if (e.isFile()) {
        const kind = want(e.name);
        if (kind && !found[kind]) found[kind] = full;
      }
    }
  };
  await walk(path.join(base, String(appid)), 0);
  return found;
}

// Genres Steam (identifiants de appinfo) → libellés. Les étiquettes de contenu et l'accès anticipé sont ignorés.
const STEAM_GENRES = {
  1: 'Action', 2: 'Stratégie', 3: 'RPG', 4: 'Occasionnel', 9: 'Course', 18: 'Sport', 23: 'Indépendant',
  25: 'Aventure', 28: 'Simulation', 29: 'MMO', 37: 'Free-to-play',
};

// Contenu pour adultes : avertissements Steam 1 (nudité ou contenu sexuel), 3 (contenu sexuel adulte),
// 4 (nudité ou contenu sexuel fréquents) ; étiquettes Contenu sexuel, Nudité, Hentai, NSFW.
const ADULT_DESCRIPTORS = new Set([1, 3, 4]);
const ADULT_TAGS = new Set([12095, 6650, 9130, 24904]);

// Métadonnées depuis le cache binaire de Steam (appcache/appinfo.vdf, versions 27 à 29) :
// nom, type (game, dlc, tool…), genres, année, développeur, éditeur.
let appInfoCache = { file: '', mtime: 0, info: new Map() };
async function readSteamAppInfo(steamDir, wanted) {
  const file = path.join(steamDir, 'appcache', 'appinfo.vdf');
  let stat;
  try { stat = await fsp.stat(file); } catch { return new Map(); }
  if (appInfoCache.file === file && appInfoCache.mtime === stat.mtimeMs && [...wanted].every((id) => appInfoCache.info.has(id))) {
    return appInfoCache.info;
  }
  let buf;
  try { buf = await fsp.readFile(file); } catch { return new Map(); }
  const info = new Map();
  try {
    const magic = buf.readUInt32LE(0);
    const version = magic & 0xff;
    if ((magic & 0xffffff00) !== 0x07564400 || version < 0x27 || version > 0x29) return info;
    let pos = 8;
    let strings = null;
    if (version >= 0x29) {
      const tableOff = Number(buf.readBigInt64LE(8));
      pos = 16;
      strings = [];
      let p = tableOff + 4;
      const count = buf.readUInt32LE(tableOff);
      for (let k = 0; k < count && p < buf.length; k++) {
        const end = buf.indexOf(0, p);
        strings.push(buf.toString('utf8', p, end));
        p = end + 1;
      }
    }
    const cstr = (p) => { const end = buf.indexOf(0, p); return [buf.toString('utf8', p, end), end + 1]; };
    const readKey = (p) => (strings ? [strings[buf.readUInt32LE(p)], p + 4] : cstr(p));
    // Bloc KV binaire → objet.
    const parse = (p, end) => {
      const obj = {};
      while (p < end) {
        const type = buf[p++];
        if (type === 0x08) return [obj, p];
        let key;
        [key, p] = readKey(p);
        if (type === 0x00) [obj[key], p] = parse(p, end);
        else if (type === 0x01 || type === 0x05) [obj[key], p] = cstr(p);
        else if (type === 0x02 || type === 0x04 || type === 0x06) { obj[key] = buf.readInt32LE(p); p += 4; }
        else if (type === 0x03) { obj[key] = buf.readFloatLE(p); p += 4; }
        else if (type === 0x07 || type === 0x0a) { obj[key] = Number(buf.readBigUInt64LE(p)); p += 8; }
        else throw new Error('type KV inconnu');
      }
      return [obj, p];
    };
    const headerAfterSize = version >= 0x28 ? 60 : 40;
    while (pos + 8 <= buf.length) {
      const appid = buf.readUInt32LE(pos);
      if (!appid) break;
      const size = buf.readUInt32LE(pos + 4);
      const next = pos + 8 + size;
      if (wanted.has(appid)) {
        try {
          const [root] = parse(pos + 8 + headerAfterSize, next);
          const a = root.appinfo || root;
          const c = a.common || {};
          const ext = a.extended || {};
          const assoc = Object.values(c.associations || {});
          const who = (t) => (assoc.find((x) => x && x.type === t) || {}).name || '';
          let genres = Object.values(c.genres || {}).map((g) => STEAM_GENRES[Number(g)]).filter(Boolean);
          genres = [...new Set(genres)];
          // Étiquettes Steam (déjà classées par pertinence) et avertissements de contenu.
          const tags = Object.values(c.store_tags || {}).map(Number).filter(Boolean);
          const descriptors = Object.values(c.content_descriptors || {}).map(Number);
          // « Indépendant » n'est pas un vrai genre : on le met en dernier.
          genres.sort((x, y) => (x === 'Indépendant') - (y === 'Indépendant'));
          const release = Number(c.original_release_date || c.steam_release_date) || 0;
          info.set(appid, {
            name: c.name || '',
            type: String(c.type || '').toLowerCase(),
            genres,
            tags,
            adult: descriptors.some((d) => ADULT_DESCRIPTORS.has(d)) || tags.some((t) => ADULT_TAGS.has(t)),
            year: release ? String(new Date(release * 1000).getFullYear()) : '',
            developer: who('developer') || ext.developer || '',
            publisher: who('publisher') || ext.publisher || '',
          });
        } catch { /* entrée illisible */ }
      }
      pos = next;
    }
  } catch { /* fichier tronqué ou format inconnu */ }
  appInfoCache = { file, mtime: stat.mtimeMs, info };
  return info;
}

// Temps de jeu noté par Steam (userdata/<compte>/config/localconfig.vdf, en minutes) ; plusieurs comptes : le plus grand.
// ---------- Comptes Steam du PC ----------
// Plusieurs comptes peuvent avoir servi sur ce PC : le temps de jeu et les succès suivent un seul compte.
// steamAccountMode : 'current' (dernier connecté, par défaut), 'all' (temps cumulés) ou un identifiant de compte.
let steamAccountMode = 'current';
function setSteamAccountMode(mode) { steamAccountMode = mode || 'current'; }
async function steamAccounts(steamDir) {
  const out = [];
  const text = await readText(path.join(steamDir, 'config', 'loginusers.vdf'));
  const users = text ? (parseVdf(text).users || parseVdf(text).Users || {}) : {};
  for (const [id64, u] of Object.entries(users)) {
    let id = '';
    try { id = String(BigInt(id64) - 76561197960265728n); } catch { continue; }
    const k = (n) => u[n] ?? u[n.toLowerCase()];
    out.push({ id, name: k('PersonaName') || k('AccountName') || id, last: Number(k('Timestamp')) || 0, mostRecent: String(k('MostRecent')) === '1' });
  }
  return out.sort((a, b) => (b.mostRecent - a.mostRecent) || (b.last - a.last));
}
// Compte(s) retenu(s) : null = tous.
async function steamAccountFilter(steamDir) {
  if (steamAccountMode === 'all') return null;
  if (/^\d+$/.test(steamAccountMode)) return steamAccountMode;
  const list = await steamAccounts(steamDir);
  return list.length ? list[0].id : null;
}

async function readSteamPlaytime(steamDir) {
  const out = new Map();
  let accounts = [];
  try { accounts = await fsp.readdir(path.join(steamDir, 'userdata')); } catch { return out; }
  const only = await steamAccountFilter(steamDir);
  if (only) accounts = accounts.filter((a) => a === only);
  for (const acc of accounts) {
    const text = await readText(path.join(steamDir, 'userdata', acc, 'config', 'localconfig.vdf'));
    if (!text) continue;
    const v = parseVdf(text);
    const store = v.UserLocalConfigStore || {};
    const sw = store.Software || store.software || {};
    const valve = sw.Valve || sw.valve || {};
    const apps = (valve.Steam || valve.steam || {}).apps || (valve.Steam || valve.steam || {}).Apps || {};
    for (const [id, a] of Object.entries(apps)) {
      const minutes = Number(a && a.Playtime) || 0;
      const last = (Number(a && a.LastPlayed) || 0) * 1000;
      if (!minutes && !last) continue;
      const prev = out.get(Number(id)) || { seconds: 0, last: 0 };
      out.set(Number(id), { seconds: prev.seconds + minutes * 60, last: Math.max(prev.last, last) });
    }
  }
  return out;
}

async function getSteamDir() {
  const raw = await regValue('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  const dir = raw ? path.normalize(raw) : '';
  return dir && fs.existsSync(dir) ? dir : '';
}

async function scanSteam() {
  const steamDir = await getSteamDir();
  if (!steamDir) return [];

  const libs = new Set([steamDir]);
  const vdf = parseVdf(await readText(path.join(steamDir, 'steamapps', 'libraryfolders.vdf')));
  const root = vdf.libraryfolders || vdf.LibraryFolders || {};
  for (const v of Object.values(root)) {
    if (typeof v === 'object' && v.path) libs.add(path.normalize(v.path));
    else if (typeof v === 'string' && /^[a-z]:/i.test(v)) libs.add(path.normalize(v));
  }

  // 1. Jeux installés (appmanifest_<appid>.acf dans chaque bibliothèque).
  const installed = new Map();
  for (const lib of libs) {
    const appsDir = path.join(lib, 'steamapps');
    let files = [];
    try { files = (await fsp.readdir(appsDir)).filter((f) => /^appmanifest_\d+\.acf$/i.test(f)); } catch { continue; }
    for (const f of files) {
      const st = (parseVdf(await readText(path.join(appsDir, f))).AppState) || {};
      const appid = Number(st.appid);
      if (!appid || installed.has(appid) || !(Number(st.StateFlags) & 4)) continue; // pas entièrement installé
      installed.set(appid, st);
    }
  }

  // 2. Jeux ajoutés via le dossier config/stplug-in (<appid>.lua), installés ou non.
  const plugin = new Set();
  try {
    for (const f of await fsp.readdir(path.join(steamDir, 'config', 'stplug-in'))) {
      const m = /^(\d+)\.lua$/i.exec(f);
      if (m && Number(m[1])) plugin.add(Number(m[1]));
    }
  } catch { /* dossier absent */ }

  const ids = new Set([...installed.keys(), ...plugin]);
  const steamTime = await readSteamPlaytime(steamDir);
  const info = await readSteamAppInfo(steamDir, ids);
  const games = [];
  for (const appid of ids) {
    const st = installed.get(appid);
    const meta = info.get(appid) || {};
    const name = meta.name || (st && st.name) || '';
    if (STEAM_SKIP_IDS.has(appid) || STEAM_SKIP_NAME.test(name)) continue;
    // Un .lua peut viser un DLC, un outil ou une démo : on ne garde que les jeux.
    if (!st && meta.type && meta.type !== 'game') continue;
    const img = await findSteamImages(steamDir, appid);
    const web = (file) => `web-cover:https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/${file}`;
    games.push({
      id: `steam:${appid}`,
      store: 'steam',
      appid,
      name: name || `Steam ${appid}`,
      installed: !!st,
      cover: img.cover || null,
      hero: img.hero || null,
      background: img.hero || img.header || null,
      logo: img.logo || null,
      webCover: web('library_600x900_2x.jpg'),
      webHero: web('library_hero.jpg'),
      // Non installé : Steam ouvre sa fenêtre d'installation.
      uri: st ? `steam://rungameid/${appid}` : `steam://install/${appid}`,
      lastPlayed: Math.max(st && Number(st.LastPlayed) ? Number(st.LastPlayed) * 1000 : 0, (steamTime.get(appid) || {}).last || 0),
      playtime: (steamTime.get(appid) || {}).seconds || 0,
      size: st ? Number(st.SizeOnDisk) || 0 : 0,
      genres: meta.genres || [],
      tags: meta.tags || [],
      adult: !!meta.adult,
      year: meta.year || '',
      developer: meta.developer || '',
      publisher: meta.publisher || '',
    });
  }
  return games;
}

// ---------- Epic Games ----------
// Visuels Epic : cache du catalogue tenu par le launcher (Data/Catalog/catcache.bin, JSON en base64).
async function readEpicCatalog(dataDir) {
  const byId = new Map();
  try {
    const raw = await fsp.readFile(path.join(dataDir, 'Catalog', 'catcache.bin'), 'utf8');
    for (const item of JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'))) {
      if (item && item.id) byId.set(item.id, item);
    }
  } catch { /* pas de cache */ }
  return byId;
}
function epicImages(item) {
  const imgs = (item && item.keyImages) || [];
  const find = (...types) => { for (const t of types) { const k = imgs.find((x) => x.type === t && x.url); if (k) return `web-cover:${k.url}`; } return null; };
  return {
    cover: find('Featured', 'DieselGameBoxTall', 'Thumbnail', 'OfferImageTall'),
    background: find('DieselGameBox', 'OfferImageWide', 'DieselStoreFrontWide'),
    logo: find('DieselGameBoxLogo'),
    icon: find('AndroidIcon'),
  };
}

async function scanEpic() {
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const dataDir = path.join(programData, 'Epic', 'EpicGamesLauncher', 'Data');
  const dir = path.join(dataDir, 'Manifests');
  let files = [];
  try { files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.item')); } catch { return []; }
  const catalog = await readEpicCatalog(dataDir);
  const games = [];
  for (const f of files) {
    let m;
    try { m = JSON.parse(await readText(path.join(dir, f))); } catch { continue; }
    if (!m || !m.AppName || m.bIsIncompleteInstall || m.bIsApplication === false) continue;
    if (m.MainGameAppName && m.MainGameAppName !== m.AppName) continue; // DLC
    if (!m.InstallLocation || !fs.existsSync(m.InstallLocation)) continue;
    const id = `${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}`;
    games.push({
      id: `epic:${m.AppName}`,
      store: 'epic',
      name: m.DisplayName || m.AppName,
      ...(() => {
        const im = epicImages(catalog.get(m.CatalogItemId));
        // Les visuels Epic sont en ligne : rangés comme les replis web de Steam (SteamGridDB/iiDB peuvent les remplacer).
        return { cover: null, webCover: im.cover, background: null, webHero: im.background, logo: null, webLogo: im.logo, webIcon: im.icon };
      })(),
      uri: `com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=launch&silent=true`,
      size: Number(m.InstallSize) || 0,
    });
  }
  return games;
}

// ---------- GOG Galaxy ----------
async function scanGog() {
  const out = await regQuery(['HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games', '/s']);
  if (!out) return [];
  const games = [];
  for (const block of out.split(/\r?\n(?=HKEY_)/)) {
    const get = (name) => { const m = new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.*)$`, 'mi').exec(block); return m ? m[1].trim() : ''; };
    const gameId = get('gameID');
    const name = get('gameName');
    const exe = get('exe') || get('launchCommand');
    const dir = get('path');
    if (!gameId || !name || !dir || !fs.existsSync(dir)) continue;
    const galaxy = await regValue('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\GalaxyClient\\paths', 'client');
    games.push({
      id: `gog:${gameId}`,
      store: 'gog',
      name,
      cover: null,
      background: null,
      exe: galaxy ? path.join(galaxy, 'GalaxyClient.exe') : exe,
      args: galaxy ? ['/command=runGame', `/gameId=${gameId}`, `/path=${dir}`] : [],
      cwd: galaxy || dir,
    });
  }
  return games;
}

// ---------- itch ----------
// Chaque jeu installé par l'appli itch a un reçu « .itch/receipt.json.gz » dans son dossier : titre, image,
// liste des fichiers. Les jeux itch sont sans DRM : on lance directement leur exécutable.
const ITCH_SKIP_EXE = /unitycrashhandler|crashpad|unins\d*|setup|vc_?redist|dxsetup|ue4prereq|notification_helper|uninstall|crash_?report/i;
function itchInstallDirs() {
  const appdata = process.env.APPDATA || '';
  const dirs = [path.join(appdata, 'itch', 'apps')];
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(appdata, 'itch', 'preferences.json'), 'utf8'));
    for (const loc of Object.values(prefs.installLocations || {})) if (loc && loc.path) dirs.push(String(loc.path));
  } catch { /* itch absent */ }
  return [...new Set(dirs)];
}
function itchExe(dir, files) {
  const exes = (files || []).filter((f) => /\.exe$/i.test(f) && !ITCH_SKIP_EXE.test(path.basename(f)));
  // Le moins profond d'abord, puis le plus gros (le vrai jeu plutôt qu'un outil).
  const scored = exes.map((f) => { let size = 0; try { size = fs.statSync(path.join(dir, f)).size; } catch { return null; } return { f, depth: f.split(/[\\/]/).length, size }; }).filter(Boolean);
  scored.sort((a, b) => a.depth - b.depth || b.size - a.size);
  return scored.length ? path.join(dir, scored[0].f) : '';
}
async function scanItch() {
  const zlib = require('zlib');
  const games = [];
  for (const base of itchInstallDirs()) {
    let entries = [];
    try { entries = await fsp.readdir(base, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(base, e.name);
      let r;
      try { r = JSON.parse(zlib.gunzipSync(await fsp.readFile(path.join(dir, '.itch', 'receipt.json.gz'))).toString('utf8')); } catch { continue; }
      const g = r && r.game;
      if (!g || !g.id || (g.classification && g.classification !== 'game')) continue;
      const exe = itchExe(dir, r.files);
      if (!exe) continue;
      let mtime = 0; try { mtime = (await fsp.stat(dir)).mtimeMs; } catch { /* rien */ }
      games.push({
        id: `itch:${g.id}`,
        store: 'itch',
        name: g.title || e.name,
        cover: null,
        // Images en ligne (format paysage, GIF animé parfois : on prend la version fixe).
        webCover: (g.stillCoverUrl || g.coverUrl) ? 'web-cover:' + (g.stillCoverUrl || g.coverUrl) : null,
        background: null,
        exe,
        args: [],
        cwd: path.dirname(exe),
        installedAt: mtime,
      });
    }
  }
  return games;
}

const STORES = {
  steam: { name: 'Steam', short: 'Steam', color: '#2a475e', scan: scanSteam },
  epic: { name: 'Epic Games', short: 'Epic', color: '#3a3a3a', scan: scanEpic },
  gog: { name: 'GOG', short: 'GOG', color: '#6b2fa6', scan: scanGog },
  itch: { name: 'itch', short: 'itch', color: '#fa5c5c', scan: scanItch },
};

// enabled : { steam, epic, gog, steamUninstalled } ; art : images SteamGridDB en cache, par id de jeu ;
// tagNames : { id d'étiquette Steam → nom }.
async function scanPcStores(enabled = {}, art = {}, tagNames = {}) {
  const systems = [];
  const launchers = new Map();
  for (const [id, store] of Object.entries(STORES)) {
    if (enabled[id] === false) continue;
    let games = [];
    try { games = await store.scan(); } catch { games = []; }
    if (enabled.steamUninstalled === false) games = games.filter((g) => g.installed !== false);
    if (!games.length) continue;
    for (const g of games) launchers.set(g.id, g);
    systems.push({
      id: `pc-${id}`,
      name: store.name,
      short: store.short,
      color: store.color,
      folder: null,
      pc: true,
      games: games
        .map((g) => {
          // Priorité : fichiers locaux du launcher > SteamGridDB > CDN Steam.
          const a = art[g.id] || {};
          const hero = g.hero || a.hero || g.webHero || null;
          return {
            path: g.id,
            system: `pc-${id}`,
            name: g.name,
            cover: g.cover || a.cover || g.webCover || null,
            background: g.background || a.hero || g.webHero || null,
            hero,
            logo: g.logo || a.logo || g.webLogo || null,
            icon: a.icon || g.webIcon || null,
            source: 'pc',
            store: id,
            installed: g.installed !== false,
            storeLastPlayed: g.lastPlayed || 0,
            storePlaytime: g.playtime || 0,
            size: g.size || 0,
            genres: g.genres || [],
            // Les 10 étiquettes les plus pertinentes, sans celles qui doublent un genre.
            tags: (g.tags || []).map((t) => tagNames[t]).filter((t) => t && !(g.genres || []).includes(t)).slice(0, 10),
            adult: !!g.adult,
            genre: (g.genres || []).join(', '),
            year: g.year || '',
            developer: g.developer || '',
            publisher: g.publisher || '',
            desc: '', players: '', rating: null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })),
    });
  }
  return { systems, launchers };
}

// ---------- SteamGridDB (jaquettes, bannières, logos, icônes) ----------
const SGDB_API = 'https://www.steamgriddb.com/api/v2';
const SGDB_KINDS = {
  cover: ['grids', 'dimensions=600x900,342x482,660x930&types=static&mimes=image/png,image/jpeg'],
  hero: ['heroes', 'types=static&mimes=image/png,image/jpeg'],
  logo: ['logos', 'types=static&mimes=image/png'],
  icon: ['icons', 'types=static&mimes=image/png'],
};

// Complète le cache `art` pour les jeux PC qui n'ont pas d'image locale. Chaque recherche est mémorisée,
// même sans résultat (null), pour ne pas la refaire au prochain passage.
async function fetchSteamGridDB({ key, systems, art, signal, onProgress, fetchImpl = fetch }) {
  const call = async (url) => {
    const res = await fetchImpl(SGDB_API + url, { headers: { Authorization: `Bearer ${key}` }, signal });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Clé SteamGridDB refusée.'), { auth: true });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`SteamGridDB : erreur ${res.status}`);
    const j = await res.json();
    return j && j.success ? j.data : null;
  };
  // `systems` vient d'un scan sans `art` : une image « web-cover: » n'est qu'un repli du CDN Steam.
  const isLocal = (v) => !!v && !/^web-cover:/.test(v);
  const jobs = [];
  for (const s of systems) {
    for (const g of s.games) {
      const have = art[g.path] || {};
      const kinds = Object.keys(SGDB_KINDS).filter((k) => !(k in have) && !isLocal(g[k]));
      if (kinds.length) jobs.push({ g, kinds });
    }
  }
  const stats = { total: jobs.length, done: 0, found: 0, notFound: 0, errors: 0, cancelled: false };
  let next = 0;
  const worker = async () => {
    while (next < jobs.length && !signal.aborted) {
      const { g, kinds } = jobs[next++];
      const entry = { ...(art[g.path] || {}) };
      try {
        let target = null;
        const appid = /^steam:(\d+)$/.exec(g.path);
        if (appid) target = `steam/${appid[1]}`;
        else {
          const hits = await call(`/search/autocomplete/${encodeURIComponent(g.name)}`);
          if (hits && hits[0]) target = `game/${hits[0].id}`;
        }
        for (const k of kinds) {
          const [ep, q] = SGDB_KINDS[k];
          const data = target ? await call(`/${ep}/${target}?${q}`) : null;
          entry[k] = data && data[0] && data[0].url ? `web-cover:${data[0].url}` : null;
          if (entry[k]) stats.found++; else stats.notFound++;
        }
        art[g.path] = entry;
      } catch (err) {
        if (err.auth) throw err;
        if (signal.aborted) break;
        stats.errors++;
      }
      stats.done++;
      if (onProgress) onProgress({ done: stats.done, total: stats.total, current: g.name });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  stats.cancelled = signal.aborted;
  return stats;
}

module.exports = { scanPcStores, parseVdf, STORES, fetchSteamGridDB, getSteamDir, steamAccounts, setSteamAccountMode, steamAccountFilter };