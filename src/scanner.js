'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const SYSTEMS = require('./systems');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const AUDIO_EXT = new Set(['.ogg', '.opus', '.mp3', '.wav', '.m4a', '.flac']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv']);
const SKIP_DIRS = new Set(['media', 'images', 'videos', 'downloaded_media', 'manuals', 'covers', 'screenshots', 'snap', 'boxart', 'bios', 'soundbites']);
// Dossiers ES-DE + types d'assets façon iiDB (boxart, icons, banners, heroes, logos).
const MEDIA_KINDS = ['boxart', 'icons', 'covers', 'miximages', 'screenshots', 'fanart', 'titlescreens', 'marquees', 'banners', 'heroes', 'logos'];

const norm = (s) => s.toLowerCase().replace(/[\s_\-.]/g, '');

function findSystem(folderName) {
  const key = norm(folderName);
  return SYSTEMS.find((s) => s.folders.some((f) => norm(f) === key)) || null;
}

async function listDir(dir) {
  if (!dir) return [];
  try { return await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
}

// Index « nom de fichier sans extension (minuscules) → chemin » pour un dossier de médias.
async function indexImages(dirs, exts = IMAGE_EXT) {
  const map = new Map();
  for (const dir of dirs) {
    for (const e of await listDir(dir)) {
      if (e.isFile() && exts.has(path.extname(e.name).toLowerCase())) {
        const key = path.parse(e.name).name.toLowerCase();
        if (!map.has(key)) map.set(key, path.join(dir, e.name));
      }
    }
  }
  return map;
}

async function walk(dir, exts, depth, out) {
  for (const e of await listDir(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0 && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name.toLowerCase())) {
        await walk(full, exts, depth - 1, out);
      }
    } else if (exts.has(path.extname(e.name).slice(1).toLowerCase())) {
      out.push(full);
    }
  }
}

// Les fichiers listés dans un .m3u (jeux multi-disques) sont masqués : seul le .m3u apparaît.
async function m3uMembers(files) {
  const hidden = new Set();
  for (const f of files) {
    if (path.extname(f).toLowerCase() !== '.m3u') continue;
    try {
      const lines = (await fsp.readFile(f, 'utf8')).split(/\r?\n/);
      for (const line of lines) {
        const t = line.trim();
        if (t && !t.startsWith('#')) hidden.add(path.resolve(path.dirname(f), t).toLowerCase());
      }
    } catch { /* fichier illisible : on ignore */ }
  }
  return hidden;
}

function decodeXml(s) {
  return s
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Lecture minimaliste des gamelist.xml (format ES / ES-DE).
async function loadGamelists(files) {
  const map = new Map();
  for (const file of files) {
    if (!file) continue;
    let xml;
    try { xml = await fsp.readFile(file, 'utf8'); } catch { continue; }
    const re = /<game\b[^>]*>([\s\S]*?)<\/game>/g;
    let m;
    while ((m = re.exec(xml))) {
      const body = m[1];
      const get = (tag) => {
        const r = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body);
        return r ? decodeXml(r[1].trim()) : '';
      };
      const p = get('path');
      if (!p) continue;
      const key = path.basename(p).toLowerCase();
      if (map.has(key)) continue;
      map.set(key, {
        name: get('name'), desc: get('desc'), developer: get('developer'), publisher: get('publisher'),
        genre: get('genre'), players: get('players'), releasedate: get('releasedate'),
        rating: get('rating'), image: get('image'), dir: path.dirname(file),
      });
    }
  }
  return map;
}

function cleanName(stem) {
  return stem
    .replace(/_/g, ' ')
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || stem;
}

async function scanSystemFolder(cfg, sys, folder) {
  const sysDir = path.join(cfg.romsRoot, folder);
  const files = [];
  await walk(sysDir, new Set(sys.ext), 2, files);
  const hidden = await m3uMembers(files);
  const roms = files.filter((f) => !hidden.has(path.resolve(f).toLowerCase()));
  if (!roms.length) return [];

  const meta = await loadGamelists([
    path.join(sysDir, 'gamelist.xml'),
    cfg.gamelistsRoot ? path.join(cfg.gamelistsRoot, folder, 'gamelist.xml') : null,
  ]);
  const idx = {};
  for (const kind of MEDIA_KINDS) {
    idx[kind] = await indexImages([
      cfg.mediaRoot ? path.join(cfg.mediaRoot, folder, kind) : null,
      path.join(sysDir, 'media', kind),
    ]);
  }
  const legacy = await indexImages([path.join(sysDir, 'images')]);
  const mediaPair = (kind) => [cfg.mediaRoot ? path.join(cfg.mediaRoot, folder, kind) : null, path.join(sysDir, 'media', kind)];
  const sounds = await indexImages(mediaPair('soundbites'), AUDIO_EXT);
  const videos = await indexImages([...mediaPair('videos'), path.join(sysDir, 'videos')], VIDEO_EXT);

  return roms.map((rom) => {
    const stem = path.parse(rom).name;
    const key = stem.toLowerCase();
    const m = meta.get(path.basename(rom).toLowerCase()) || {};
    let gamelistImage = null;
    if (m.image) {
      const p = path.resolve(sysDir, m.image);
      if (fs.existsSync(p)) gamelistImage = p;
    }
    const cover = idx.boxart.get(key) || idx.icons.get(key) || idx.covers.get(key) || idx.miximages.get(key) || gamelistImage
      || legacy.get(key + '-image') || legacy.get(key) || idx.screenshots.get(key) || null;
    const background = idx.banners.get(key) || idx.heroes.get(key) || idx.fanart.get(key)
      || idx.screenshots.get(key) || idx.titlescreens.get(key) || cover;
    const hero = idx.heroes.get(key) || idx.banners.get(key) || idx.fanart.get(key) || null;
    const logo = idx.logos.get(key) || idx.marquees.get(key) || null;
    const rating = m.rating ? Math.round(parseFloat(m.rating) * 10) / 2 : null;
    return {
      path: rom,
      system: sys.id,
      name: m.name || cleanName(stem),
      cover,
      background,
      hero,
      logo,
      soundbite: sounds.get(key) || null,
      video: videos.get(key) || null,
      desc: m.desc || '',
      developer: m.developer || '',
      publisher: m.publisher || '',
      genre: m.genre || '',
      players: m.players || '',
      year: (m.releasedate || '').slice(0, 4),
      rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    };
  });
}

async function scanLibrary(cfg) {
  const root = cfg.romsRoot;
  if (!root) return { systems: [] };
  if (!fs.existsSync(root)) return { systems: [], error: `Dossier de ROMs introuvable : ${root}` };

  const bySystem = new Map();
  for (const e of await listDir(root)) {
    if (!e.isDirectory()) continue;
    const sys = findSystem(e.name);
    if (!sys) continue;
    const games = await scanSystemFolder(cfg, sys, e.name);
    if (!games.length) continue;
    if (!bySystem.has(sys.id)) {
      bySystem.set(sys.id, { id: sys.id, name: sys.name, short: sys.short, color: sys.color, folder: e.name, games: [] });
    }
    bySystem.get(sys.id).games.push(...games);
  }
  const order = SYSTEMS.map((s) => s.id);
  const systems = [...bySystem.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const s of systems) s.games.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  return { systems };
}

module.exports = { scanLibrary, findSystem, cleanName, loadGamelists };
