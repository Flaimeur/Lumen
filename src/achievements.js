'use strict';
// Succès Steam lus en local, sans compte ni clé d'API :
//   appcache/stats/UserGameStatsSchema_<appid>.bin        → liste des succès (noms, descriptions, icônes)
//   appcache/stats/UserGameStats_<compte>_<appid>.bin     → progression (un champ de bits par groupe + dates)
// Plusieurs comptes peuvent exister : on prend le fichier de progression le plus récent.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ICON_URL = (appid, file) => `web-cover:https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appid}/${file}`;

// KeyValues binaire de Valve (clés en texte) → objet.
function parseKV(buf) {
  let p = 0;
  const cstr = () => { const e = buf.indexOf(0, p); const s = buf.toString('utf8', p, e < 0 ? buf.length : e); p = (e < 0 ? buf.length : e) + 1; return s; };
  const obj = () => {
    const o = {};
    while (p < buf.length) {
      const t = buf[p++];
      if (t === 0x08 || t === 0x0b) return o;
      const k = cstr();
      if (t === 0x00) o[k] = obj();
      else if (t === 0x01) o[k] = cstr();
      else if (t === 0x02 || t === 0x04 || t === 0x06) { o[k] = buf.readInt32LE(p); p += 4; }
      else if (t === 0x03) { o[k] = buf.readFloatLE(p); p += 4; }
      else if (t === 0x07 || t === 0x0a) { o[k] = Number(buf.readBigUInt64LE(p)); p += 8; }
      else throw new Error('type KV inconnu');
    }
    return o;
  };
  return obj();
}

const pickText = (v) => {
  if (!v || typeof v !== 'object') return typeof v === 'string' ? v : '';
  return v.french || v.english || Object.values(v).find((x) => typeof x === 'string' && x && x !== v.token) || '';
};

// Index des fichiers de progression : appid → chemin le plus récent.
async function progressIndex(statsDir, account) {
  const index = new Map();
  let files = [];
  try { files = await fsp.readdir(statsDir); } catch { return index; }
  for (const f of files) {
    const m = /^UserGameStats_(\d+)_(\d+)\.bin$/.exec(f);
    if (!m) continue;
    if (account && m[1] !== String(account)) continue;
    const full = path.join(statsDir, f);
    let mtime = 0;
    try { mtime = (await fsp.stat(full)).mtimeMs; } catch { continue; }
    const prev = index.get(Number(m[2]));
    if (!prev || mtime > prev.mtime) index.set(Number(m[2]), { file: full, mtime });
  }
  return index;
}

// Succès d'un jeu : { total, unlocked, last, list } ou null s'il n'en a pas.
async function readGame(statsDir, appid, progressFile) {
  let schema;
  try { schema = parseKV(await fsp.readFile(path.join(statsDir, `UserGameStatsSchema_${appid}.bin`))); } catch { return null; }
  const root = schema[String(appid)] || Object.values(schema)[0] || {};
  let cache = {};
  if (progressFile) { try { cache = parseKV(await fsp.readFile(progressFile)).cache || {}; } catch { /* progression illisible */ } }
  const list = [];
  for (const [statId, stat] of Object.entries(root.stats || {})) {
    const isAch = stat && (String(stat.type).toUpperCase() === 'ACHIEVEMENTS' || String(stat.type) === '4');
    if (!isAch || !stat.bits) continue;
    const state = cache[statId] || {};
    const data = Number(state.data) || 0;
    for (const [bit, a] of Object.entries(stat.bits)) {
      const d = (a && a.display) || {};
      const unlocked = ((data >>> Number(bit)) & 1) === 1;
      const time = unlocked ? Number((state.AchievementTimes || {})[bit]) || 0 : 0;
      list.push({
        id: a.name || `${statId}_${bit}`,
        name: pickText(d.name) || a.name || 'Succès',
        desc: pickText(d.desc),
        hidden: Number(d.hidden) === 1,
        icon: d.icon ? ICON_URL(appid, d.icon) : null,
        iconGray: d.icon_gray ? ICON_URL(appid, d.icon_gray) : null,
        unlocked,
        time: time * 1000,
      });
    }
  }
  if (!list.length) return null;
  const done = list.filter((a) => a.unlocked);
  return { total: list.length, unlocked: done.length, last: Math.max(0, ...done.map((a) => a.time)), list };
}

// Vue d'ensemble pour une liste de jeux Steam { path, appid }.
async function steamSummary(steamDir, games, account) {
  const statsDir = path.join(steamDir, 'appcache', 'stats');
  const progress = await progressIndex(statsDir, account);
  const out = { games: [], recent: [] };
  for (const g of games) {
    const r = await readGame(statsDir, g.appid, (progress.get(g.appid) || {}).file);
    if (!r) continue;
    out.games.push({ path: g.path, total: r.total, unlocked: r.unlocked, last: r.last });
    for (const a of r.list) if (a.unlocked && a.time) out.recent.push({ path: g.path, name: a.name, desc: a.desc, icon: a.icon, time: a.time });
  }
  out.recent.sort((a, b) => b.time - a.time);
  out.recent = out.recent.slice(0, 24);
  return out;
}

async function steamGame(steamDir, appid, account) {
  const statsDir = path.join(steamDir, 'appcache', 'stats');
  const progress = await progressIndex(statsDir, account);
  return readGame(statsDir, appid, (progress.get(appid) || {}).file);
}

module.exports = { steamSummary, steamGame, parseKV };
