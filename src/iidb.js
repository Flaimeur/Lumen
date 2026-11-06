'use strict';
// iiDB (iidb.iisu.network) : jaquettes iiSU 1:1, icônes, logos, héros, bannières et soundbites
// pour les jeux, les consoles et les dossiers. API publique en lecture seule, 50 éléments max par page.
const API = 'https://iidb.iisu.network/api/v1';
const FILES = 'https://assets.iisu.network/';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const file = (f) => (f ? `web-cover:${FILES}${String(f).replace(/^\/+/, '')}` : null);

// Type iiDB → champ Lumen. Pour la jaquette : la version iiSU en priorité, sinon la boxart classique.
const GAME_TYPES = [['iisu_boxart', 'cover'], ['boxart', 'cover'], ['hero', 'hero'], ['banner', 'background'], ['logo', 'logo'], ['icon', 'icon'], ['soundbite', 'soundbite']];
const PLATFORM_TYPES = [['platform_icon', 'icon'], ['platform_logo', 'logo'], ['platform_hero', 'hero']];

function client({ signal, fetchImpl = fetch }) {
  return async (url) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetchImpl(API + url, { signal, headers: { Accept: 'application/json', 'User-Agent': 'Lumen (frontend de jeux)' } });
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`iiDB : erreur ${res.status}`);
      return res.json();
    }
    throw new Error('iiDB : trop de requêtes, réessaie plus tard.');
  };
}

// Premier asset de chaque type, en préférant les plus aimés.
function pickAssets(items, types) {
  const out = {};
  const sorted = [...(items || [])].filter((a) => !a.is_deleted).sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
  for (const [type, field] of types) {
    if (out[field]) continue;
    const a = sorted.find((x) => x.type === type && (x.raw_url || x.filename));
    if (a) out[field] = a.raw_url ? `web-cover:${a.raw_url}` : file(a.filename);
  }
  return out;
}

// Console Lumen → plateforme iiDB (recherche par nom, puis par clé de console).
async function findPlatform(call, sys) {
  const keys = new Set([sys.id, ...(sys.folders || []), sys.iidbKey].filter(Boolean).map((k) => String(k).toLowerCase()));
  for (const q of [sys.iidbQuery || sys.name, sys.short]) {
    if (!q) continue;
    const list = await call(`/platforms/search/enriched?skip=0&limit=10&q=${encodeURIComponent(q)}`);
    if (!Array.isArray(list) || !list.length) continue;
    return list.find((p) => keys.has(String(p.console_key || '').toLowerCase())) || list[0];
  }
  return null;
}

// Jeu → fiche iiDB : nom identique (sans ponctuation), de préférence sur la bonne plateforme.
async function findGame(call, name, platformName) {
  const q = String(name || '').replace(/\s*[([].*?[)\]]\s*/g, ' ').trim();
  if (!q) return null;
  const res = await call(`/parents/search/enriched/page?q=${encodeURIComponent(q)}&skip=0&limit=10&assets_only=false&search_mode=default`);
  const items = (res && res.items) || [];
  const want = fold(q);
  const plat = fold(platformName);
  const onPlat = (it) => !plat || fold(`${it.primary_platform}, ${it.platform_list}`).includes(plat);
  return items.find((it) => fold(it.name) === want && onPlat(it))
    || items.find((it) => fold(it.name) === want)
    || null;
}

// Remplit `cache` ({ games, platforms, collections }) pour ce qui n'a pas encore été cherché.
// Chaque recherche est mémorisée, même sans résultat, pour ne pas la refaire.
async function fetchIidb({ systems, collections = [], cache, signal, onProgress, fetchImpl }) {
  const call = client({ signal, fetchImpl });
  cache.games = cache.games || {};
  cache.platforms = cache.platforms || {};
  cache.collections = cache.collections || {};
  const stats = { total: 0, done: 0, found: 0, notFound: 0, errors: 0, cancelled: false };
  const tick = (current) => { stats.done++; if (onProgress) onProgress({ done: stats.done, total: stats.total, current }); };

  // 1. Consoles.
  const platformName = {};
  const sysJobs = systems.filter((s) => !s.apps);
  const gameJobs = [];
  for (const s of sysJobs) for (const g of s.games) if (!(g.path in cache.games)) gameJobs.push({ s, g });
  const colJobs = collections.filter((n) => !(n in cache.collections));
  stats.total = sysJobs.filter((s) => !(s.id in cache.platforms)).length + gameJobs.length + (colJobs.length ? 1 : 0);

  for (const s of sysJobs) {
    if (signal.aborted) break;
    const known = cache.platforms[s.id];
    if (known !== undefined) { platformName[s.id] = known && known.name; continue; }
    try {
      const p = await findPlatform(call, s);
      if (p) {
        const res = await call(`/assets/browse/enriched?skip=0&limit=50&platform_id=${p.id}&asset_type=platform_icon`);
        const extra = [];
        for (const t of ['platform_logo', 'platform_hero']) {
          const r = await call(`/assets/browse/enriched?skip=0&limit=10&platform_id=${p.id}&asset_type=${t}`);
          extra.push(...((r && r.items) || []));
        }
        const art = pickAssets([...((res && res.items) || []), ...extra], PLATFORM_TYPES);
        if (!art.icon && p.icon_filename) art.icon = file(p.icon_filename);
        cache.platforms[s.id] = { id: p.id, name: p.name, ...art };
        stats.found++;
      } else { cache.platforms[s.id] = null; stats.notFound++; }
      platformName[s.id] = p && p.name;
    } catch (err) { if (signal.aborted) break; stats.errors++; }
    tick(s.name);
  }

  // 2. Jeux (3 requêtes en parallèle pour rester raisonnable avec le site).
  let next = 0;
  const worker = async () => {
    while (next < gameJobs.length && !signal.aborted) {
      const { s, g } = gameJobs[next++];
      try {
        const plat = s.pc ? 'PC' : platformName[s.id];
        const hit = await findGame(call, g.name, plat);
        if (hit) {
          const res = await call(`/assets/browse/enriched?skip=0&limit=50&parent_id=${hit.id}`);
          const art = pickAssets((res && res.items) || [], GAME_TYPES);
          if (!art.cover && hit.boxart_filename) art.cover = file(hit.boxart_filename);
          cache.games[g.path] = { id: hit.id, ...art };
          if (Object.keys(art).length) stats.found++; else stats.notFound++;
        } else { cache.games[g.path] = null; stats.notFound++; }
      } catch (err) { if (signal.aborted) break; stats.errors++; }
      tick(g.name);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));

  // 3. Dossiers : la liste des collections iiDB (quelques pages), comparée au nom du dossier.
  if (colJobs.length && !signal.aborted) {
    try {
      const all = [];
      for (let skip = 0; skip < 2000; skip += 50) {
        const r = await call(`/collections/browse?skip=${skip}&limit=50`);
        const items = (r && r.items) || [];
        all.push(...items);
        if (items.length < 50 || all.length >= (r.total || 0)) break;
      }
      for (const name of colJobs) {
        const c = all.find((x) => fold(x.name) === fold(name) || fold(x.query) === fold(name));
        cache.collections[name] = c ? { id: c.id, icon: file(c.icon_filename), hero: file(c.hero_filename), logo: file(c.title_image_filename) } : null;
        if (c) stats.found++; else stats.notFound++;
      }
    } catch (err) { if (!signal.aborted) stats.errors++; }
    tick('Dossiers');
  }
  stats.cancelled = signal.aborted;
  return stats;
}

// Applique le cache à la bibliothèque. priority : les images iiDB remplacent celles déjà trouvées.
function applyIidb(lib, cache, { priority = true } = {}) {
  if (!cache) return lib;
  const games = cache.games || {};
  for (const s of lib.systems || []) {
    for (const g of s.games) {
      const a = games[g.path];
      if (!a) continue;
      for (const k of ['cover', 'hero', 'logo', 'icon', 'soundbite']) {
        if (a[k] && (priority || !g[k])) g[k] = a[k];
      }
      const bg = a.background || a.hero;
      if (bg && (priority || !g.background)) g.background = bg;
      if (a.cover && g.appIcon) g.appIcon = false;
    }
  }
  // Les visuels déposés par l'utilisateur dans son dossier Plateformes gardent la priorité.
  const art = lib.platformArt || (lib.platformArt = {});
  for (const [id, p] of Object.entries(cache.platforms || {})) {
    if (!p) continue;
    art[id] = { ...Object.fromEntries(['icon', 'logo', 'hero'].filter((k) => p[k]).map((k) => [k, p[k]])), ...(art[id] || {}) };
  }
  lib.collectionArt = Object.fromEntries(Object.entries(cache.collections || {}).filter(([, v]) => v));
  return lib;
}

// Toutes les variantes iiDB d'un jeu, d'une console ou d'un dossier, rangées par usage Lumen.
// target : { type: 'game' | 'platform' | 'collection', name, sys?, id? (id iiDB déjà connu) }
const OPTION_FIELDS = {
  iisu_boxart: 'cover', boxart: 'cover', icon: 'icon', logo: 'logo', hero: 'hero', banner: 'hero',
  platform_icon: 'icon', platform_logo: 'logo', platform_hero: 'hero',
  collection_icon: 'icon', collection_logo: 'logo', collection_hero: 'hero', collection_title_image: 'logo',
};
async function iidbOptions(target, { signal, fetchImpl } = {}) {
  const call = client({ signal: signal || new AbortController().signal, fetchImpl });
  let query = '';
  if (target.type === 'game') {
    let id = target.id;
    if (!id) { const hit = await findGame(call, target.name, target.sys && target.sys.pc ? 'PC' : (target.sys && target.sys.iidbName) || ''); id = hit && hit.id; }
    if (id) query = `parent_id=${id}`;
  } else if (target.type === 'platform') {
    let id = target.id;
    if (!id && target.sys) { const p = await findPlatform(call, target.sys); id = p && p.id; }
    if (id) query = `platform_id=${id}`;
  } else if (target.type === 'collection') {
    let id = target.id;
    if (!id) {
      for (let skip = 0; skip < 2000 && !id; skip += 50) {
        const r = await call(`/collections/browse?skip=${skip}&limit=50`);
        const items = (r && r.items) || [];
        const c = items.find((x) => fold(x.name) === fold(target.name) || fold(x.query) === fold(target.name))
          || items.find((x) => fold(x.name).includes(fold(target.name)) || fold(target.name).includes(fold(x.name)));
        if (c) id = c.id;
        if (items.length < 50) break;
      }
    }
    if (id) query = `collection_id=${id}`;
  }
  const out = { cover: [], icon: [], logo: [], hero: [] };
  if (!query) return out;
  for (let skip = 0; skip < 200; skip += 50) {
    const r = await call(`/assets/browse/enriched?skip=${skip}&limit=50&${query}`);
    const items = (r && r.items) || [];
    for (const a of items) {
      const field = OPTION_FIELDS[a.type];
      // Pour une console, on ignore les jaquettes de ses jeux renvoyées avec elle.
      if (!field || a.is_deleted || (target.type === 'platform' && !/^platform_/.test(a.type))) continue;
      const url = a.raw_url ? `web-cover:${a.raw_url}` : file(a.filename);
      if (!url) continue;
      out[field].push({ url, thumb: a.preview_url ? `web-cover:${a.preview_url}` : url, label: [a.type.replace(/_/g, ' '), a.credits || a.username].filter(Boolean).join(' · '), likes: a.like_count || 0 });
    }
    if (items.length < 50) break;
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => b.likes - a.likes);
  return out;
}

module.exports = { fetchIidb, applyIidb, iidbOptions, fold };
