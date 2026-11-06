'use strict';
// Client pour un serveur RomM (https://romm.app) : plateformes, jeux, jaquettes et téléchargement des ROMs.
// API RomM 4.x / 5.x. Authentification par jeton client « rmm_… » (recommandé) ou identifiant + mot de passe.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { findSystem } = require('./scanner');

const UA = 'Lumen-frontend/0.2';

// Slugs RomM/IGDB qui ne correspondent pas directement à un dossier Lumen.
const SLUG_ALIASES = {
  ngc: 'gc', ps: 'psx', '3ds': 'n3ds', 'new-nintendo-3ds': 'n3ds',
  'genesis-slash-megadrive': 'genesis', sms: 'mastersystem', dc: 'dreamcast',
  'turbografx16--1': 'pcengine', 'turbografx-16-slash-pc-engine-cd': 'pcengine',
  neogeoaes: 'neogeo', neogeomvs: 'neogeo', 'neo-geo-pocket': 'ngp', 'neo-geo-pocket-color': 'ngp',
  wonderswan: 'wonderswan', 'wonderswan-color': 'wonderswan', win: 'windows', 'sega-cd': 'segacd',
  'nintendo-ds': 'nds', 'game-boy': 'gb',
};

const LAUNCH_PRIORITY = ['m3u', 'cue', 'gdi', 'cdi', 'chd', 'iso', 'rvz', 'wbfs', 'nsp', 'xci', 'wua', 'rpx'];

function systemFor(platform) {
  const candidates = [platform.fs_slug, platform.slug, platform.igdb_slug].filter(Boolean);
  for (const c of candidates) {
    const direct = findSystem(c);
    if (direct) return direct;
    const alias = SLUG_ALIASES[String(c).toLowerCase()];
    if (alias) return findSystem(alias);
  }
  return null;
}

class RommClient {
  constructor({ url, token, username, password }) {
    this.base = String(url || '').trim().replace(/\/+$/, '');
    if (this.base && !/^https?:\/\//i.test(this.base)) this.base = 'http://' + this.base;
    this.token = token || '';
    this.username = username || '';
    this.password = password || '';
  }

  get configured() {
    return !!this.base && (!!this.token || (!!this.username && !!this.password));
  }

  headers(extra = {}) {
    const h = { 'user-agent': UA, accept: 'application/json', ...extra };
    if (this.token) h.authorization = `Bearer ${this.token}`;
    else if (this.username) h.authorization = 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return h;
  }

  async request(p, { signal, timeout = 30000, raw = false } = {}) {
    const url = p.startsWith('http') ? p : this.base + p;
    const res = await fetch(url, { headers: this.headers(), signal: signal || AbortSignal.timeout(timeout) });
    if (res.status === 401 || res.status === 403) throw new Error('RomM a refusé l’accès : vérifie le jeton ou les identifiants.');
    if (!res.ok) throw new Error(`RomM a répondu ${res.status} pour ${p.split('?')[0]}`);
    return raw ? res : res.json();
  }

  async heartbeat() {
    const res = await fetch(this.base + '/api/heartbeat', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Serveur RomM injoignable (${res.status})`);
    const data = await res.json().catch(() => ({}));
    const version = (data.SYSTEM && data.SYSTEM.VERSION) || data.VERSION || '';
    return { version };
  }

  async platforms() {
    const data = await this.request('/api/platforms');
    return Array.isArray(data) ? data : data.items || [];
  }

  async romsForPlatform(platformId) {
    const out = [];
    const limit = 500;
    for (let offset = 0; offset < 100000; offset += limit) {
      const data = await this.request(`/api/roms?platform_ids=${platformId}&limit=${limit}&offset=${offset}&order_by=name&order_dir=asc`, { timeout: 60000 });
      const items = Array.isArray(data) ? data : data.items || [];
      out.push(...items);
      const total = Array.isArray(data) ? items.length : data.total;
      if (!items.length || items.length < limit || (total != null && out.length >= total)) break;
    }
    return out;
  }
}

// ---------- Bibliothèque RomM → jeux Lumen ----------
function yearOf(rom) {
  const m = rom.metadatum || {};
  const ts = m.first_release_date || (rom.igdb_metadata && rom.igdb_metadata.first_release_date);
  if (!ts) return '';
  // Secondes (IGDB) ou millisecondes selon la version de RomM : au-delà de 1e10, ce sont forcément des ms.
  const d = new Date(ts > 1e10 ? ts : ts * 1000);
  return Number.isNaN(d.getTime()) ? '' : String(d.getUTCFullYear());
}

function localTarget(downloadDir, sysId, rom) {
  const dir = path.join(downloadDir, sysId);
  if (rom.has_multiple_files || rom.multi) return { dir: path.join(dir, rom.fs_name_no_ext || rom.fs_name), multi: true };
  return { dir, file: path.join(dir, rom.fs_name), multi: false };
}

function findLaunchFile(dir, exts) {
  let files = [];
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && depth < 3) walk(full, depth + 1);
      else if (e.isFile()) files.push(full);
    }
  };
  try { walk(dir, 0); } catch { return null; }
  files = files.filter((f) => exts.includes(path.extname(f).slice(1).toLowerCase()));
  for (const ext of LAUNCH_PRIORITY) {
    const hit = files.find((f) => f.toLowerCase().endsWith('.' + ext));
    if (hit) return hit;
  }
  return files[0] || null;
}

function localPathFor(downloadDir, sys, rom) {
  const t = localTarget(downloadDir, sys.id, rom);
  if (!t.multi) return fs.existsSync(t.file) ? t.file : null;
  return fs.existsSync(t.dir) ? findLaunchFile(t.dir, sys.ext) : null;
}

function toGame(rom, sys, downloadDir) {
  const cover = rom.path_cover_large || rom.path_cover_small || rom.url_cover || '';
  const local = localPathFor(downloadDir, sys, rom);
  const m = rom.metadatum || {};
  return {
    path: local || `romm://${rom.id}`,
    system: sys.id,
    name: rom.name || rom.fs_name_no_tags || rom.fs_name,
    cover: cover ? `romm-cover:${rom.id}:${cover}` : null,
    background: cover ? `romm-cover:${rom.id}:${cover}` : null,
    desc: rom.summary || '',
    developer: (m.companies && m.companies[0]) || '',
    publisher: '',
    genre: (m.genres && m.genres.join(', ')) || '',
    players: '',
    year: yearOf(rom),
    rating: m.average_rating ? Math.round(m.average_rating / 10) / 2 : null,
    source: 'romm',
    rommId: rom.id,
    rommFile: rom.fs_name,
    rommMulti: !!rom.has_multiple_files,
    rommNoExt: rom.fs_name_no_ext || '',
    size: rom.fs_size_bytes || 0,
    downloaded: !!local,
  };
}

async function fetchRommLibrary(client, downloadDir) {
  const platforms = await client.platforms();
  const systems = new Map();
  const skipped = [];
  for (const p of platforms) {
    if (!p.rom_count) continue;
    const sys = systemFor(p);
    if (!sys) { skipped.push(p.display_name || p.name || p.slug); continue; }
    const roms = await client.romsForPlatform(p.id);
    if (!systems.has(sys.id)) systems.set(sys.id, { sys, games: [] });
    systems.get(sys.id).games.push(...roms.map((r) => toGame(r, sys, downloadDir)));
  }
  return { systems: [...systems.values()].map(({ sys, games }) => ({ id: sys.id, games })), skipped };
}

// Met à jour l'état « téléchargé » d'une bibliothèque en cache sans repasser par le réseau.
function refreshLocalState(rommLib, downloadDir) {
  const SYSTEMS = require('./systems');
  for (const s of rommLib.systems) {
    const sys = SYSTEMS.find((x) => x.id === s.id);
    if (!sys) continue;
    for (const g of s.games) {
      const local = localPathFor(downloadDir, sys, { fs_name: g.rommFile, fs_name_no_ext: g.rommNoExt, has_multiple_files: g.rommMulti });
      g.downloaded = !!local;
      g.path = local || `romm://${g.rommId}`;
    }
  }
  return rommLib;
}

// Fusionne RomM dans la bibliothèque locale (les fichiers locaux du même nom gagnent).
function mergeLibraries(local, rommLib) {
  const SYSTEMS = require('./systems');
  const byId = new Map(local.systems.map((s) => [s.id, s]));
  for (const rs of rommLib.systems) {
    const sys = SYSTEMS.find((x) => x.id === rs.id);
    if (!sys) continue;
    let target = byId.get(rs.id);
    if (!target) {
      target = { id: sys.id, name: sys.name, short: sys.short, color: sys.color, folder: sys.id, games: [] };
      byId.set(sys.id, target);
      local.systems.push(target);
    }
    const have = new Set(target.games.map((g) => path.basename(g.path).toLowerCase()));
    for (const g of rs.games) {
      if (g.downloaded && target.games.some((x) => x.path === g.path)) continue;
      if (!g.downloaded && have.has(String(g.rommFile).toLowerCase())) continue;
      target.games.push(g);
    }
    target.games.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  }
  const order = SYSTEMS.map((s) => s.id);
  local.systems.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return local;
}

// ---------- Téléchargement d'une ROM ----------
async function downloadRom(client, game, sys, downloadDir, { onProgress, signal } = {}) {
  const t = localTarget(downloadDir, sys.id, { fs_name: game.rommFile, fs_name_no_ext: game.rommNoExt, has_multiple_files: game.rommMulti });
  await fsp.mkdir(t.multi ? path.dirname(t.dir) : t.dir, { recursive: true });
  const res = await client.request(`/api/roms/${game.rommId}/content/${encodeURIComponent(game.rommFile)}`, { signal, raw: true });
  const total = Number(res.headers.get('content-length')) || game.size || 0;
  const tmp = (t.multi ? t.dir + '.zip' : t.file) + '.part';
  const out = fs.createWriteStream(tmp);
  let done = 0;
  let last = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      done += value.length;
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      const now = Date.now();
      if (onProgress && now - last > 150) { last = now; onProgress({ done, total }); }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  } catch (err) {
    out.destroy();
    await fsp.rm(tmp, { force: true });
    throw signal && signal.aborted ? new Error('Téléchargement annulé.') : err;
  }
  if (onProgress) onProgress({ done, total, finishing: t.multi });

  if (!t.multi) {
    await fsp.rename(tmp, t.file);
    return t.file;
  }
  // Jeu en plusieurs fichiers : RomM envoie un zip, extrait avec le tar intégré à Windows.
  await fsp.mkdir(t.dir, { recursive: true });
  await new Promise((resolve, reject) => execFile('tar', ['-xf', tmp, '-C', t.dir], (err) => (err ? reject(new Error('Extraction impossible : ' + err.message)) : resolve())));
  await fsp.rm(tmp, { force: true });
  const file = findLaunchFile(t.dir, sys.ext);
  if (!file) throw new Error('Aucun fichier jouable trouvé dans l’archive RomM.');
  return file;
}

// ---------- Jaquettes (téléchargées à la demande puis gardées en cache) ----------
async function cachedCover(client, cacheDir, spec) {
  const m = /^romm-cover:(\d+):(.+)$/.exec(spec);
  if (!m) return null;
  const [, id, src] = m;
  const key = crypto.createHash('sha1').update(src).digest('hex').slice(0, 16);
  const file = path.join(cacheDir, `${id}-${key}`);
  if (fs.existsSync(file)) return file;
  const url = src.startsWith('http') ? src : client.base + (src.startsWith('/') ? '' : '/') + src;
  const res = await fetch(url, { headers: src.startsWith('http') ? { 'user-agent': UA } : client.headers(), signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  await fsp.mkdir(cacheDir, { recursive: true });
  await fsp.writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

module.exports = { RommClient, fetchRommLibrary, mergeLibraries, refreshLocalState, downloadRom, cachedCover, systemFor, localTarget };
