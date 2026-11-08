'use strict';
// Durée de vie d'un jeu d'après HowLongToBeat (histoire, histoire + annexes, 100 %).
// Le site n'a pas d'API publique : on fait comme sa propre page de recherche (jeton puis recherche).
// Résultats gardés 30 jours dans un cache local ; si le site change, la fiche n'affiche simplement rien.
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';
const HEAD = { 'User-Agent': UA, Referer: 'https://howlongtobeat.com/', Origin: 'https://howlongtobeat.com' };
const TTL = 30 * 864e5;
let token = null;
let cacheFile = '';
let cache = null;

// Nom propre pour la recherche : sans ™ ®, sans « Edition », sans tags de ROM.
function cleanName(n) {
  return String(n || '')
    .replace(/[™®©]/g, '')
    .replace(/[’‘´`]/g, "'")
    .replace(/\s*[([].*?[)\]]\s*/g, ' ')
    .replace(/\b(game of the year|goty|definitive|deluxe|complete|ultimate|remastered|anniversary|director'?s cut)\s+edition\b/gi, '')
    .replace(/\s+/g, ' ').trim();
}
const norm = (s) => cleanName(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
  return cache;
}
function save() { try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch { /* cache facultatif */ } }

async function getToken(fetchImpl, force) {
  if (token && !force) return token;
  const r = await fetchImpl('https://howlongtobeat.com/api/search/site/init?t=' + Date.now(), { headers: HEAD });
  if (!r.ok) throw new Error('HLTB ' + r.status);
  token = (await r.json()).token;
  return token;
}

async function search(name, fetchImpl, retry = true) {
  const t = await getToken(fetchImpl);
  const body = {
    searchType: 'games', searchTerms: cleanName(name).split(' ').filter(Boolean), searchPage: 1, size: 8,
    searchOptions: { games: { userId: 0, platform: { mode: 'include', values: [] }, sortCategory: 'popular', rangeCategory: 'main', rangeTime: { min: null, max: null },
      gameplay: { perspective: { mode: 'include', values: [] }, flow: { mode: 'include', values: [] }, genre: { mode: 'include', values: [] } }, year: { mode: 'include', values: [] }, modifier: '' },
    users: { sortCategory: 'postcount' }, lists: { sortCategory: 'follows' }, filter: '', sort: 0, randomizer: 0 },
    useCache: true,
  };
  const r = await fetchImpl('https://howlongtobeat.com/api/search/site', { method: 'POST', headers: { ...HEAD, 'Content-Type': 'application/json', 'x-auth-token': t }, body: JSON.stringify(body) });
  if (r.status === 403 && retry) { await getToken(fetchImpl, true); return search(name, fetchImpl, false); }
  if (!r.ok) throw new Error('HLTB ' + r.status);
  return (await r.json()).data || [];
}

// { name, main, plus, full } en heures, ou null si rien de fiable.
async function lookup(name, fetchImpl, dir) {
  cacheFile = path.join(dir, 'hltb.json');
  const c = load();
  const key = norm(name);
  if (!key) return null;
  if (c[key] && Date.now() - c[key].at < TTL) return c[key].v;
  let v = null;
  try {
    const list = await search(name, fetchImpl);
    // Le titre exact d'abord, sinon le plus populaire dont le nom contient la recherche.
    const pick = list.find((g) => norm(g.game_name) === key) || list.find((g) => norm(g.game_name).includes(key) || key.includes(norm(g.game_name)));
    if (pick && (pick.comp_main || pick.comp_plus || pick.comp_100)) {
      const hrs = (s) => (s > 0 ? Math.round((s / 3600) * 2) / 2 : 0);
      v = { name: pick.game_name, id: pick.game_id, main: hrs(pick.comp_main), plus: hrs(pick.comp_plus), full: hrs(pick.comp_100) };
    }
  } catch { return null; } // hors ligne ou site changé : on ne met pas en cache
  c[key] = { at: Date.now(), v };
  save();
  return v;
}

module.exports = { lookup, cleanName };
