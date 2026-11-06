'use strict';
// Téléchargement des jaquettes manquantes depuis libretro-thumbnails (thumbnails.libretro.com),
// le dépôt d'images utilisé par RetroArch. Les images sont rangées dans <ROMs>/<console>/media/<type>/.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const BASE = 'https://thumbnails.libretro.com/';
const UA = 'Lumen-frontend/0.1 (+libretro-thumbnails)';
const INDEX_TTL = 7 * 24 * 3600 * 1000;

const LIBRETRO_NAMES = {
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  n64: 'Nintendo - Nintendo 64',
  gc: 'Nintendo - GameCube',
  wii: 'Nintendo - Wii',
  wiiu: 'Nintendo - Wii U',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  gba: 'Nintendo - Game Boy Advance',
  nds: 'Nintendo - Nintendo DS',
  n3ds: 'Nintendo - Nintendo 3DS',
  psx: 'Sony - PlayStation',
  ps2: 'Sony - PlayStation 2',
  psp: 'Sony - PlayStation Portable',
  mastersystem: 'Sega - Master System - Mark III',
  genesis: 'Sega - Mega Drive - Genesis',
  segacd: 'Sega - Mega-CD - Sega CD',
  gamegear: 'Sega - Game Gear',
  saturn: 'Sega - Saturn',
  dreamcast: 'Sega - Dreamcast',
  pcengine: 'NEC - PC Engine - TurboGrafx 16',
  neogeo: 'SNK - Neo Geo',
  arcade: 'FBNeo - Arcade Games',
  atari2600: 'Atari - 2600',
  ngp: 'SNK - Neo Geo Pocket Color',
  wonderswan: 'Bandai - WonderSwan Color',
};

// Type libretro → dossier local lu par le scanner.
const KINDS = [
  { remote: 'Named_Boxarts', local: 'covers' },
  { remote: 'Named_Snaps', local: 'screenshots' },
  { remote: 'Named_Titles', local: 'titlescreens' },
  { remote: 'Named_Logos', local: 'logos' },
];

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp'];
const REGION_ORDER = ['world', 'usa', 'europe', 'france', 'japan'];

// libretro remplace ces caractères par « _ » dans les noms de fichiers.
const sanitize = (name) => name.replace(/[&*/:`<>?\\|"]/g, '_');
const loose = (name) => name.toLowerCase()
  .replace(/\s*[([][^)\]]*[)\]]/g, '')
  .replace(/&|_|\band\b/g, ' ')
  .replace(/^the\s+|,\s*the\b/g, '')
  .replace(/[^a-z0-9]/g, '');
const regions = (name) => [...name.toLowerCase().matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1].split(/,\s*/));

function regionScore(candidate, wanted) {
  const r = regions(candidate);
  if (wanted.some((w) => r.includes(w))) return 0;
  const idx = REGION_ORDER.findIndex((x) => r.includes(x));
  let score = idx === -1 ? REGION_ORDER.length + 1 : idx + 1;
  if (/\((beta|proto|sample|demo|kiosk|pirate|unl)/i.test(candidate)) score += 10;
  return score;
}

// Index des fichiers disponibles pour un système/type, mis en cache sur disque.
async function loadIndex(cacheDir, sysName, kind) {
  const file = path.join(cacheDir, `${sanitize(sysName)}__${kind}.json`);
  try {
    const st = await fsp.stat(file);
    if (Date.now() - st.mtimeMs < INDEX_TTL) return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch { /* pas de cache */ }
  const url = `${BASE}${encodeURIComponent(sysName)}/${kind}/`;
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60000) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`libretro-thumbnails a répondu ${res.status}`);
  const html = await res.text();
  const names = [...html.matchAll(/href="([^"?/]+\.png)"/g)].map((m) => decodeURIComponent(m[1]).slice(0, -4));
  await fsp.mkdir(cacheDir, { recursive: true });
  await fsp.writeFile(file, JSON.stringify(names));
  return names;
}

function buildMatcher(names) {
  const exact = new Set(names);
  const byLoose = new Map();
  for (const n of names) {
    const k = loose(n);
    if (!k) continue;
    if (!byLoose.has(k)) byLoose.set(k, []);
    byLoose.get(k).push(n);
  }
  return (stem, displayName) => {
    const s = sanitize(stem);
    if (exact.has(s)) return s;
    const wanted = regions(stem);
    for (const key of [loose(stem), displayName ? loose(displayName) : '']) {
      const list = key && byLoose.get(key);
      if (list && list.length) return [...list].sort((a, b) => regionScore(a, wanted) - regionScore(b, wanted))[0];
    }
    return null;
  };
}

function hasLocal(dir, stem) {
  return IMAGE_EXT.some((ext) => fs.existsSync(path.join(dir, stem + ext)));
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) return false;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  await fsp.writeFile(tmp, buf);
  await fsp.rename(tmp, dest);
  return true;
}

/**
 * Télécharge les images manquantes.
 * @param {object} opts { romsRoot, cacheDir, systems: [{id, folder, games:[{path,name}]}], kinds?, onProgress?, signal? }
 */
async function fetchMissingThumbnails(opts) {
  const kinds = KINDS.filter((k) => !opts.kinds || opts.kinds.includes(k.local));
  const jobs = [];
  const stats = { checked: 0, downloaded: 0, notFound: 0, unsupported: [], errors: 0 };

  for (const sys of opts.systems) {
    const sysName = LIBRETRO_NAMES[sys.id];
    if (!sysName) { stats.unsupported.push(sys.name || sys.id); continue; }
    const mediaBase = path.join(opts.romsRoot, sys.folder, 'media');
    for (const kind of kinds) {
      const dir = path.join(mediaBase, kind.local);
      const missing = sys.games.filter((g) => !hasLocal(dir, path.parse(g.path).name));
      if (!missing.length) continue;
      let names;
      try { names = await loadIndex(opts.cacheDir, sysName, kind.remote); } catch { stats.errors++; continue; }
      const match = buildMatcher(names);
      for (const g of missing) {
        const stem = path.parse(g.path).name;
        jobs.push({ game: g, kind, remote: match(stem, g.name), dest: path.join(dir, stem + '.png'), sysName });
      }
    }
  }

  const total = jobs.length;
  let done = 0;
  const report = (current) => opts.onProgress && opts.onProgress({ done, total, downloaded: stats.downloaded, current });
  report('');

  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      if (opts.signal && opts.signal.aborted) return;
      const job = jobs[next++];
      stats.checked++;
      if (!job.remote) {
        stats.notFound++;
      } else {
        const url = `${BASE}${encodeURIComponent(job.sysName)}/${job.kind.remote}/${encodeURIComponent(job.remote)}.png`;
        try {
          if (await download(url, job.dest)) stats.downloaded++;
          else stats.notFound++;
        } catch { stats.errors++; }
      }
      done++;
      report(job.game.name);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  stats.cancelled = !!(opts.signal && opts.signal.aborted);
  return stats;
}

module.exports = { fetchMissingThumbnails, buildMatcher, sanitize, LIBRETRO_NAMES };
