(() => {
  'use strict';
  const api = window.lumen || window.LumenMock;
  const Input = window.Input;
  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------- Petit utilitaire DOM ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else if (k.startsWith('on') && typeof v === 'function') el[k.toLowerCase()] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    systems: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6.5" width="20" height="12" rx="6"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r="1" fill="currentColor"/><circle cx="18" cy="14" r="1" fill="currentColor"/></svg>',
    favorites: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    achievements: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  };
  const icon = (name) => { const s = h('span', { class: 'ico' }); s.innerHTML = ICONS[name]; return s; };

  const TABS = [
    { id: 'home', label: 'Accueil' },
    { id: 'search', label: 'Recherche' },
    { id: 'systems', label: 'Consoles' },
    { id: 'favorites', label: 'Dossiers' },
    { id: 'achievements', label: 'Succès' },
    { id: 'settings', label: 'Réglages' },
  ];
  const SORTS = [
    { id: 'name', label: 'Nom' },
    { id: 'recent', label: 'Joué récemment' },
    { id: 'playtime', label: 'Temps de jeu' },
    { id: 'year', label: 'Année' },
    { id: 'genre', label: 'Genre' },
  ];
  const VOLUMES = [0.3, 0.5, 0.7, 1];
  const EMULATORS = [
    { id: 'retroarch', name: 'RetroArch', desc: 'Utilisé pour la plupart des consoles rétro.' },
    { id: 'dolphin', name: 'Dolphin', desc: 'GameCube et Wii.' },
    { id: 'pcsx2', name: 'PCSX2', desc: 'PlayStation 2.' },
    { id: 'cemu', name: 'Cemu', desc: 'Wii U.' },
    { id: 'eden', name: 'Émulateur Switch', desc: 'Eden, Ryujinx ou compatible (options -f -g).' },
    { id: 'switch2', name: 'Émulateur Switch 2', desc: 'Lichii ou autre dérivé d’Eden (options -f -g).' },
    { id: 'azahar', name: 'Azahar', desc: 'Nintendo 3DS.' },
    { id: 'duckstation', name: 'DuckStation', desc: 'PlayStation (optionnel, sinon RetroArch).' },
    { id: 'melonds', name: 'melonDS', desc: 'Nintendo DS (optionnel, sinon RetroArch).' },
    { id: 'ppsspp', name: 'PPSSPP', desc: 'PSP (optionnel, sinon RetroArch).' },
  ];
  const ACCENTS = ['#5eead4', '#a78bfa', '#f472b6', '#fbbf24', '#60a5fa', '#4ade80', '#fb7185'];

  const S = {
    cfg: null,
    defs: [],
    lib: { systems: [] },
    byPath: new Map(),
    route: { view: 'home' },
    stack: [],
    tabMemory: {},
    focusEl: null,
    overlay: null,
    dirty: false,
    launching: false,
    mouse: false,
    hintKind: 'none',
  };

  // ---------- Curseur de sélection ----------
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cursor = h('div', { id: 'cursor' });

  function focusScale(el) {
    if (el.classList.contains('tile') || el.classList.contains('syscard') || el.classList.contains('folder')) return 1.07;
    if (el.classList.contains('btn')) return 1.04;
    return 1;
  }

  // Place le curseur autour de l'élément focalisé (taille finale, une fois le zoom appliqué).
  function placeCursor(instant) {
    const el = S.focusEl;
    if (!el || !document.contains(el) || el.offsetParent === null) { cursor.classList.remove('on'); return; }
    const r = el.getBoundingClientRect();
    const s = focusScale(el);
    const w = el.offsetWidth * s + 12;
    const hh = el.offsetHeight * s + 12;
    const x = r.left + r.width / 2 - w / 2;
    const y = r.top + r.height / 2 - hh / 2;
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 14;
    cursor.classList.toggle('track', !!instant);
    cursor.style.width = `${w}px`;
    cursor.style.height = `${hh}px`;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    cursor.style.borderRadius = `${radius * s + 6}px`;
    if (!S.cursorHold) cursor.classList.add('on');
  }

  function holdCursor(ms) {
    S.cursorHold = true;
    cursor.classList.remove('on');
    clearTimeout(S.holdTimer);
    S.holdTimer = setTimeout(() => {
      S.cursorHold = false;
      placeCursor(true);
    }, reduceMotion ? 0 : ms);
  }

  let trackRaf = 0;
  function trackCursor() {
    if (trackRaf) return;
    trackRaf = requestAnimationFrame(() => { trackRaf = 0; placeCursor(true); });
  }
  document.addEventListener('scroll', trackCursor, true);
  // La mise en page bouge sans défilement (scan, images, polices, contenu qui change de hauteur) :
  // le cadre suit l'élément sélectionné au lieu de rester à son ancienne place.
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => trackCursor());
    const watch = () => { const v = document.getElementById('view'); if (v) { ro.observe(v); for (const c of v.children) ro.observe(c); } ro.observe(document.body); };
    new MutationObserver(() => { watch(); trackCursor(); }).observe(document.documentElement, { childList: true, subtree: false });
    window.addEventListener('DOMContentLoaded', watch);
    setTimeout(watch, 0);
    // Contenu remplacé dans la vue (rendu, panneau des Réglages) : on recale aussi.
    setTimeout(() => { const v = document.getElementById('view'); if (v) new MutationObserver(() => { watch(); trackCursor(); }).observe(v, { childList: true, subtree: true }); }, 0);
  }
  window.addEventListener('resize', () => { trackCursor(); renderDock(); });

  function pressFx(el) {
    if (!el || reduceMotion) return;
    for (const target of [el, cursor]) {
      target.classList.remove('press');
      void target.offsetWidth;
      target.classList.add('press');
    }
  }

  // ---------- Helpers ----------
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const totalGames = () => S.lib.systems.reduce((n, s) => n + s.games.length, 0);
  const sysById = (id) => S.lib.systems.find((s) => s.id === id) || S.defs.find((s) => s.id === id);
  const isFav = (g) => S.cfg.favorites.includes(g.path);
  const tabOf = (route) => (route.view === 'games' ? 'systems' : route.view === 'folder' ? 'favorites' : route.view);
  const saveCfg = () => api.setConfig(S.cfg);

  function fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace('.', ',')} Go`;
    if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} Mo`;
    return `${Math.max(1, Math.round(bytes / 1e3))} Ko`;
  }

  function formatTime(sec) {
    const hrs = Math.floor(sec / 3600);
    const min = Math.round((sec % 3600) / 60);
    return hrs ? `${hrs} h ${String(min).padStart(2, '0')}` : `${min} min`;
  }

  // ---------- Sons d'interface (synthétisés, pas de fichier à fournir) ----------
  let audio;
  let master;
  function tone(freq, at, dur, { type = 'sine', gain = 0.05, to = null, attack = 0.006 } = {}) {
    const t = audio.currentTime + at;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  function noise(at, dur, { gain = 0.03, from = 800, to = 3000 } = {}) {
    const t = audio.currentTime + at;
    const len = Math.floor(audio.sampleRate * dur);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource();
    src.buffer = buf;
    const f = audio.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = audio.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }
  // ---------- Sons d'interface depuis un dossier (ex. Documents\Lumen\Sons iiSU) ----------
  // Action Lumen → noms de fichiers reconnus (sans extension, en minuscules), du plus précis au plus général.
  const UI_SOUND_NAMES = {
    move: ['move', 'navigation'],
    letter: ['letter', 'navigation'],
    select: ['select', 'open'],
    back: ['back', 'close'],
    tab: ['tab', 'menu navigate'],
    menu: ['menu', 'open contextmenu', 'open'],
    enter: ['enter', 'enter consolesapps', 'open'],
    launch: ['launch', 'open rom'],
    launchApp: ['launch app', 'open app', 'open approm', 'open rom'],
    key: ['key', 'key click'],
    error: ['error'],
    boot: ['boot', 'friends tab'],
  };
  const uiSamples = new Map(); // action → AudioBuffer
  async function loadUiSounds() {
    uiSamples.clear();
    const dir = S.cfg.uiSoundsDir;
    if (!dir || !api.listMusic) return 0;
    let files = [];
    try { files = await api.listMusic(dir); } catch { return 0; }
    const byName = new Map(files.map((p) => [p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').toLowerCase(), p]));
    ensureAudio();
    for (const [kind, names] of Object.entries(UI_SOUND_NAMES)) {
      const file = names.map((n) => byName.get(n)).find(Boolean);
      if (!file) continue;
      try {
        const bytes = api.readSound ? await api.readSound(file) : null;
        if (!bytes) continue;
        uiSamples.set(kind, await audio.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
      } catch { /* fichier illisible : le son synthétisé reste */ }
    }
    return uiSamples.size;
  }
  function playSample(kind) {
    const buf = uiSamples.get(kind);
    if (!buf) return false;
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start();
    return true;
  }
  function ensureAudio() {
    if (audio) return;
    audio = new AudioContext();
    master = audio.createGain();
    const lp = audio.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;
    master.connect(lp).connect(audio.destination);
  }

  function sfx(kind) {
    if (!S.cfg || !S.cfg.sounds || S.cfg.muted) return;
    try {
      ensureAudio();
      master.gain.value = 0.9 * (S.cfg.volume ?? 0.7);
      if (playSample(kind)) return;
      // Pas de fichier pour ces actions : on retombe sur le son synthétisé le plus proche.
      if (kind === 'menu' || kind === 'enter') kind = 'select';
      if (kind === 'launchApp') kind = 'launch';
      switch (kind) {
        case 'move': tone(1250, 0, 0.045, { type: 'triangle', gain: 0.03 }); break;
        case 'select': tone(880, 0, 0.09, { gain: 0.05 }); tone(1320, 0.05, 0.14, { gain: 0.045 }); break;
        case 'back': tone(740, 0, 0.08, { gain: 0.045 }); tone(520, 0.05, 0.12, { gain: 0.04 }); break;
        case 'tab': noise(0, 0.16, { gain: 0.05, from: 600, to: 2400 }); tone(990, 0.02, 0.08, { type: 'triangle', gain: 0.025 }); break;
        case 'launch':
          [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.35, { type: 'triangle', gain: 0.045 }));
          noise(0.05, 0.5, { gain: 0.035, from: 400, to: 5000 });
          break;
        case 'boot':
          [392, 523, 659, 988].forEach((f, i) => tone(f, i * 0.09, 0.6 - i * 0.05, { gain: 0.04, attack: 0.02 }));
          break;
        case 'letter': tone(660, 0, 0.07, { type: 'square', gain: 0.018 }); break;
        case 'key': tone(1500, 0, 0.03, { type: 'square', gain: 0.012 }); break;
        case 'error': tone(220, 0, 0.18, { type: 'sawtooth', gain: 0.03, to: 160 }); break;
        default: tone(700, 0, 0.08);
      }
    } catch { /* audio indisponible */ }
  }

  // ---------- Musique de fond (dossier de l'utilisateur) et mode muet ----------
  const music = new Audio();
  let musicList = [];
  let musicIdx = 0;
  let musicDucked = false;
  let windowAway = false;
  music.onended = () => nextTrack();
  music.onerror = () => { if (musicList.length > 1) setTimeout(nextTrack, 500); };
  const musicCfg = () => S.cfg.music || (S.cfg.music = { enabled: false, dir: '', volume: 0.35 });
  async function loadMusic() {
    const m = musicCfg();
    musicList = [];
    music.pause();
    music.removeAttribute('src');
    if (!api.listMusic || !m.enabled || !m.dir) return;
    try { musicList = await api.listMusic(m.dir); } catch { musicList = []; }
    for (let i = musicList.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [musicList[i], musicList[j]] = [musicList[j], musicList[i]]; }
    musicIdx = 0;
    updateMusic();
  }
  function updateMusic() {
    if (!S.cfg) return;
    const m = musicCfg();
    const play = m.enabled && musicList.length && !S.cfg.muted && !S.inGame && !musicDucked && !windowAway && !(S.media && S.media.status === 'Playing');
    if (!play) { music.pause(); return; }
    if (!music.getAttribute('src')) music.src = api.mediaUrl(musicList[musicIdx]);
    music.volume = Math.min(1, (m.volume ?? 0.35) * (S.cfg.volume ?? 0.7));
    music.play().catch(() => {});
  }
  function nextTrack() {
    if (!musicList.length) return;
    musicIdx = (musicIdx + 1) % musicList.length;
    music.src = api.mediaUrl(musicList[musicIdx]);
    updateMusic();
  }
  function duckMusic(on) { musicDucked = on; updateMusic(); }
  // Fenêtre quittée (jeu PC lancé, autre application) : la musique s'arrête, puis reprend au retour.
  window.addEventListener('blur', () => { windowAway = true; updateMusic(); });
  window.addEventListener('focus', () => { windowAway = false; updateMusic(); });

  function renderMuteIndicator() {
    let el = document.getElementById('mute-ind');
    if (!el) {
      el = h('span', { id: 'mute-ind', title: 'Son coupé (M)', onClick: () => toggleMute() }, '🔇');
      const status = document.querySelector('#topbar .status');
      if (status) status.prepend(el);
    }
    el.hidden = !(S.cfg && S.cfg.muted);
  }
  function toggleMute() {
    S.cfg.muted = !S.cfg.muted;
    saveCfg();
    if (S.cfg.muted) stopPreview();
    updateMusic();
    renderMuteIndicator();
    toast(S.cfg.muted ? '🔇 Son coupé (M pour le remettre)' : '🔊 Son rétabli');
    if (!S.cfg.muted) sfx('select');
  }
  // Touche M : couper / remettre le son (sauf pendant une saisie).
  window.addEventListener('keydown', (ev) => {
    if (!S.cfg || ev.ctrlKey || ev.altKey || ev.repeat || (ev.key !== 'm' && ev.key !== 'M')) return;
    if (S.route.view === 'search' || (S.overlay && S.overlay.root.querySelector('.input-wrap, .vkb'))) return;
    ev.preventDefault();
    toggleMute();
  });

  // ---------- Images choisies (clic droit → Changer les images) ----------
  // S.cfg.artOverrides : { <chemin du jeu> | sys:<id> | col:<nom> : { cover, icon, logo, hero } }
  const ART_KINDS = { cover: 'Jaquette', icon: 'Icône', logo: 'Logo', hero: 'Bannière / héros' };
  function applyArtOverrides() {
    const all = S.cfg.artOverrides || {};
    S.lib.platformArt = S.lib.platformArt || {};
    S.lib.collectionArt = S.lib.collectionArt || {};
    // « none » = image retirée volontairement (ex. pas de logo sur la carte d'une console).
    const clean = (art) => Object.fromEntries(Object.entries(art).map(([k, v]) => [k, v === 'none' ? null : v]));
    for (const [key, raw] of Object.entries(all)) {
      const art = clean(raw);
      if (key.startsWith('sys:')) { S.lib.platformArt[key.slice(4)] = { ...(S.lib.platformArt[key.slice(4)] || {}), ...art }; continue; }
      if (key.startsWith('col:')) { S.lib.collectionArt[key.slice(4)] = { ...(S.lib.collectionArt[key.slice(4)] || {}), ...art }; continue; }
      const g = S.byPath.get(key);
      if (!g) continue;
      Object.assign(g, art);
      if (art.hero) g.background = art.hero;
      if (art.cover) g.appIcon = false;
    }
  }

  function artTarget(type, x) {
    if (type === 'game') return { type, key: x.path, name: x.name, systemId: x.system, kinds: ['cover', 'icon', 'logo', 'hero'], current: x };
    if (type === 'platform') return { type, key: x.id, name: x.name, kinds: ['icon', 'logo', 'hero'], current: platformArt(x.id) };
    const name = x === '★' ? 'Favoris' : x;
    return { type, key: name, name, kinds: ['icon', 'hero'], current: (S.lib.collectionArt || {})[name] || {} };
  }
  const overrideKey = (t) => (t.type === 'game' ? t.key : t.type === 'platform' ? 'sys:' + t.key : 'col:' + t.key);

  async function setArt(t, kind, value) {
    const all = S.cfg.artOverrides || (S.cfg.artOverrides = {});
    const k = overrideKey(t);
    if (value) all[k] = { ...(all[k] || {}), [kind]: value };
    else if (all[k]) { delete all[k][kind]; if (!Object.keys(all[k]).length) delete all[k]; }
    await saveCfg();
    if (value) applyArtOverrides();
    else applyLib(await api.scan({ romm: false })); // retour à l'origine : on relit la bibliothèque
    S.dirty = true;
  }

  function artThumb(src, kind) {
    return h('div', { class: 'art-thumb ' + kind }, src ? h('img', { src: api.mediaUrl(src), alt: '', loading: 'lazy' }) : h('span', { class: 'muted small' }, 'Aucune'));
  }

  async function openArtEditor(t) {
    if (!t.options && api.artOptions) {
      toast('Recherche des images sur iiDB…', 'info', 8000);
      t.options = await api.artOptions({ type: t.type, key: t.key, name: t.name, query: t.query, systemId: t.systemId });
      document.getElementById('toast').hidden = true;
    }
    const cur = t.type === 'game' ? S.byPath.get(t.key) || t.current : t.type === 'platform' ? platformArt(t.key) : (S.lib.collectionArt || {})[t.key] || {};
    const custom = (S.cfg.artOverrides || {})[overrideKey(t)] || {};
    openOverlay(h('div', { class: 'modal art-editor' },
      h('div', { class: 'eyebrow' }, t.type === 'game' ? 'Images du jeu' : t.type === 'platform' ? 'Images de la console' : 'Icône du dossier'),
      h('h2', {}, t.name),
      t.options && !t.options.ok ? h('p', { class: 'small error-text' }, `iiDB : ${t.options.error}`) : null,
      t.kinds.map((kind) => {
        const n = ((t.options || {})[kind] || []).length;
        return focusable(h('div', { class: 'art-row' },
          artThumb(cur[kind], kind),
          h('div', { class: 'ach-text' },
            h('b', {}, ART_KINDS[kind]),
            h('span', { class: 'muted small' }, [custom[kind] === 'none' ? 'Masquée' : custom[kind] ? 'Choisie par toi' : 'Automatique', n ? `${n} sur iiDB` : 'rien sur iiDB'].join(' · ')))), {
          a: () => openArtKindMenu(t, kind),
          focus: () => setHints('action'),
        });
      }),
      t.type === 'collection' && api.iidbCollections ? focusable(h('div', { class: 'art-row' },
        h('div', { class: 'art-thumb' }, '📚'),
        h('div', { class: 'ach-text' }, h('b', {}, 'Parcourir les collections iiDB'), h('span', { class: 'muted small' }, 'Mario, Sonic, Zelda, Pokémon, Disney… plus de 500 icônes'))), {
        a: () => openCollectionBrowser(t), focus: () => setHints('action'),
      }) : null,
      t.type === 'collection' && api.iidbGameIcons ? focusable(h('div', { class: 'art-row' },
        h('div', { class: 'art-thumb' }, '🎮'),
        h('div', { class: 'ach-text' }, h('b', {}, 'Prendre l’icône d’un jeu…'), h('span', { class: 'muted small' }, 'Par exemple un dossier « RPG » avec l’icône de Final Fantasy'))), {
        a: async () => {
          const v = await openPrompt({ title: 'Nom du jeu', value: '', help: 'Le jeu dont tu veux l’icône (ex. Final Fantasy VII, Zelda, Pokémon Rouge…)' });
          if (v === null || !v.trim()) return openArtEditor(t);
          toast('Recherche des icônes…', 'info', 6000);
          const opts = await api.iidbGameIcons(v.trim());
          document.getElementById('toast').hidden = true;
          if (!opts.length) { toast(`Aucune icône trouvée pour « ${v.trim()} »`, 'error'); return openArtEditor(t); }
          t.options = { ...(t.options || {}), ok: true, icon: opts };
          openArtGallery(t, 'icon');
        },
        focus: () => setHints('action'),
      }) : null,
      // Le nom ne correspond pas à iiDB (dossier perso, abréviation…) : recherche manuelle.
      focusable(h('div', { class: 'art-row' },
        h('div', { class: 'art-thumb' }, '🔎'),
        h('div', { class: 'ach-text' },
          h('b', {}, t.type === 'collection' ? 'Chercher une collection iiDB…' : 'Chercher sous un autre nom…'),
          h('span', { class: 'muted small' }, t.query ? `Recherche actuelle : « ${t.query} »` : `Recherche actuelle : « ${t.name} »`))), {
        a: async () => {
          const v = await openPrompt({ title: t.type === 'collection' ? 'Collection iiDB' : 'Nom à chercher sur iiDB', value: t.query || t.name,
            help: t.type === 'collection' ? 'Par exemple Mario, Sonic, Zelda, Pokémon… (nom d’une collection d’iidb.iisu.network)' : 'Le nom du jeu tel qu’il apparaît sur iiDB.' });
          if (v === null || !v.trim()) return;
          t.query = v.trim();
          t.options = null;
          openArtEditor(t);
        },
        focus: () => setHints('action'),
      })));
    sfx('select');
  }

  function openArtKindMenu(t, kind) {
    const opts = ((t.options || {})[kind]) || [];
    const custom = ((S.cfg.artOverrides || {})[overrideKey(t)] || {})[kind];
    const items = [];
    if (opts.length) items.push([`Choisir sur iiDB (${opts.length})`, () => openArtGallery(t, kind)]);
    if (api.pickImage) items.push(['Choisir un fichier sur le PC…', async () => {
      const file = await api.pickImage(`${ART_KINDS[kind]} · ${t.name}`);
      if (!file) return;
      await setArt(t, kind, file);
      toast(`${ART_KINDS[kind]} changée`);
      openArtEditor(t);
    }]);
    if (custom !== 'none') items.push(['🚫 Ne pas afficher', async () => { await setArt(t, kind, 'none'); toast(`${ART_KINDS[kind]} retirée`); openArtEditor(t); }]);
    if (custom) items.push(['Revenir à l’image automatique', async () => { await setArt(t, kind, null); toast('Image d’origine rétablie'); openArtEditor(t); }]);
    items.push(['← Retour', () => openArtEditor(t)]);
    openMenu(ART_KINDS[kind], items);
  }

  // Catalogue des collections iiDB, filtrable en tapant (un morceau de nom suffit).
  async function openCollectionBrowser(t, filter = '') {
    if (!S.iidbCollections) {
      toast('Chargement des collections iiDB…', 'info', 8000);
      S.iidbCollections = await api.iidbCollections();
      document.getElementById('toast').hidden = true;
    }
    const q = fold(filter);
    const list = S.iidbCollections.filter((c) => !q || fold(c.name).includes(q));
    const pickCol = async (c) => {
      await setArt(t, 'icon', c.icon);
      if (c.hero) await setArt(t, 'hero', c.hero);
      toast(`Icône « ${c.name} » choisie`);
      openArtEditor(t);
    };
    openOverlay(h('div', { class: 'modal art-gallery' },
      h('div', { class: 'eyebrow' }, 'iiDB · Collections'),
      h('h2', {}, t.name),
      h('div', { class: 'roll-options', style: 'justify-content:flex-start' },
        focusable(h('div', { class: 'chip' + (filter ? ' active' : '') }, filter ? `🔎 « ${filter} » · ${list.length}` : `🔎 Filtrer (${list.length})`), {
          a: async () => { const v = await openPrompt({ title: 'Filtrer les collections', value: filter, help: 'Un morceau de nom : mar, poke, zel, dragon…' }); openCollectionBrowser(t, v === null ? filter : v.trim()); },
          focus: () => setHints('action'),
        })),
      list.length
        ? h('div', { class: 'art-grid icon' }, list.slice(0, 240).map((c) => focusable(h('div', { class: 'art-pick icon' },
          h('img', { src: api.mediaUrl(c.icon), alt: '', loading: 'lazy' }), h('span', { class: 'art-credit small', style: 'opacity:1' }, c.name)), {
          a: () => pickCol(c), focus: () => { setTitle(c.name, plural(c.count, 'jeu', 'jeux')); setHints('action'); },
        })))
        : h('p', { class: 'muted' }, 'Aucune collection ne contient ce texte.')), { onBack: () => openArtEditor(t) });
  }

  function openArtGallery(t, kind) {
    const opts = ((t.options || {})[kind]) || [];
    openOverlay(h('div', { class: 'modal art-gallery' },
      h('div', { class: 'eyebrow' }, `iiDB · ${ART_KINDS[kind]}`),
      h('h2', {}, t.name),
      h('div', { class: 'art-grid ' + kind }, opts.map((o) => focusable(h('div', { class: 'art-pick ' + kind },
        h('img', { src: api.mediaUrl(o.thumb), alt: '', loading: 'lazy' }),
        h('span', { class: 'art-credit small' }, o.label)), {
        a: async () => { await setArt(t, kind, o.url); toast(`${ART_KINDS[kind]} changée`); openArtEditor(t); },
        focus: () => { setTitle(ART_KINDS[kind], o.label); setHints('action'); },
      })))), { onBack: () => openArtEditor(t) });
    sfx('select');
  }

  // Clic droit sur un jeu, un dossier ou une console : menu rapide de cet élément.
  document.addEventListener('contextmenu', (ev) => {
    if (!S.cfg || S.inGame) return;
    ev.preventDefault();
    const el = ev.target.closest('.tile, .folder, .syscard');
    if (S.overlay || !el || !el.classList.contains('f')) return;
    setFocus(el, { silent: true });
    openQuickMenu();
  });

  // ---------- Profils manette → clavier/souris (jeux sans prise en charge de la manette) ----------
  // S.cfg.padProfiles[chemin du jeu] = { enabled, preset, map: { a: 'Space', … }, lstick, rstick, sens }
  // Les boutons sont désignés par leur position physique (disposition standard) : a = bas, b = droite, x = gauche, y = haut.
  const PAD_SLOTS = [
    ['a', 0], ['b', 1], ['x', 2], ['y', 3], ['lb', 4], ['rb', 5], ['lt', 6], ['rt', 7],
    ['back', 8], ['start', 9], ['l3', 10], ['r3', 11], ['up', 12], ['down', 13], ['left', 14], ['right', 15],
  ];
  const SLOT_NAMES = {
    xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', back: 'View', start: 'Menu', l3: 'L3', r3: 'R3' },
    playstation: { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', back: 'Share / Create', start: 'Options', l3: 'L3', r3: 'R3' },
    switch: { a: 'B', b: 'A', x: 'Y', y: 'X', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR', back: '−', start: '+', l3: 'L3', r3: 'R3' },
  };
  const DPAD_NAMES = { up: 'Croix ↑', down: 'Croix ↓', left: 'Croix ←', right: 'Croix →' };
  const slotName = (slot) => {
    if (DPAD_NAMES[slot]) return DPAD_NAMES[slot];
    const t = Input.padType;
    return SLOT_NAMES[t === 'ps4' || t === 'ps5' ? 'playstation' : t === 'switch' ? 'switch' : 'xbox'][slot];
  };
  const STICK_MODES = { wasd: 'ZQSD / WASD', arrows: 'Flèches', mouse: 'Souris', wheel: 'Molette', none: 'Rien' };
  const PROFILE_PRESETS = {
    fps: { label: 'Action / FPS (ZQSD + souris)', lstick: 'wasd', rstick: 'mouse', map: {
      a: 'Space', b: 'ControlLeft', x: 'KeyR', y: 'KeyE', lb: 'KeyQ', rb: 'KeyF', lt: 'MouseRight', rt: 'MouseLeft',
      back: 'Tab', start: 'Escape', l3: 'ShiftLeft', r3: 'KeyV', up: 'Digit1', down: 'Digit2', left: 'Digit3', right: 'Digit4' } },
    retro: { label: 'Jeu 2D / rétro (flèches)', lstick: 'arrows', rstick: 'none', map: {
      a: 'Space', b: 'ShiftLeft', x: 'KeyX', y: 'KeyC', lb: 'KeyA', rb: 'KeyS', lt: 'KeyQ', rt: 'KeyW',
      back: 'Escape', start: 'Enter', l3: '', r3: '', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } },
    mouse: { label: 'Souris (point & click, visual novel)', lstick: 'mouse', rstick: 'wheel', map: {
      a: 'MouseLeft', b: 'MouseRight', x: 'Space', y: 'Enter', lb: 'PageUp', rb: 'PageDown', lt: 'ControlLeft', rt: 'MouseMiddle',
      back: 'Tab', start: 'Escape', l3: '', r3: '', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } },
  };
  const KEY_CODES = [
    'Space', 'Enter', 'Escape', 'Tab', 'Backspace', 'ShiftLeft', 'ControlLeft', 'AltLeft', 'CapsLock',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Insert', 'Delete',
    ...'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').map((c) => 'Key' + c),
    ...'1234567890'.split('').map((d) => 'Digit' + d),
    ...Array.from({ length: 12 }, (_v, i) => 'F' + (i + 1)),
    'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Backquote', 'Backslash', 'Comma', 'Period', 'Slash', 'IntlBackslash',
    'ShiftRight', 'ControlRight', 'AltRight',
    ...'0123456789'.split('').map((d) => 'Numpad' + d),
  ];
  const MOUSE_KEYS = { MouseLeft: 'Clic gauche', MouseRight: 'Clic droit', MouseMiddle: 'Clic molette', WheelUp: 'Molette ↑', WheelDown: 'Molette ↓' };
  const KEY_NAMES = {
    Space: 'Espace', Enter: 'Entrée', Escape: 'Échap', Tab: 'Tab', Backspace: 'Retour arrière', ShiftLeft: 'Maj', ShiftRight: 'Maj droite',
    ControlLeft: 'Ctrl', ControlRight: 'Ctrl droit', AltLeft: 'Alt', AltRight: 'Alt Gr', CapsLock: 'Verr. maj',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', PageUp: 'Page ↑', PageDown: 'Page ↓', Home: 'Début', End: 'Fin', Insert: 'Inser', Delete: 'Suppr',
  };
  // Nom affiché selon la disposition réelle du clavier (KeyQ s'affiche « A » en AZERTY).
  S.kbLayout = null;
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then((m) => { S.kbLayout = m; }).catch(() => {});
  function keyLabel(code) {
    if (!code) return 'Rien';
    if (MOUSE_KEYS[code]) return MOUSE_KEYS[code];
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    // Rangée des chiffres : on affiche le chiffre (sur AZERTY la touche donne « & » sans Maj).
    if (code.startsWith('Digit')) return code.slice(5);
    const ch = S.kbLayout && S.kbLayout.get(code);
    if (ch) return code.startsWith('Numpad') ? 'Pavé ' + ch : ch.toUpperCase();
    return code.replace(/^Key|^Digit/, '');
  }

  const profileOf = (g) => (S.cfg.padProfiles || {})[g.path] || null;
  async function saveProfile(g, p) {
    (S.cfg.padProfiles || (S.cfg.padProfiles = {}))[g.path] = p;
    await saveCfg();
  }
  function newProfile(preset = 'fps') {
    const pr = PROFILE_PRESETS[preset];
    return { enabled: true, preset, map: { ...pr.map }, lstick: pr.lstick, rstick: pr.rstick, sens: 1 };
  }

  function openProfileEditor(g, focusLabel) {
    const p = profileOf(g) || newProfile('fps');
    const rows = [];
    const add = (label, value, act, desc) => rows.push(focusable(h('div', { class: 'set-row' },
      h('div', { class: 'set-text' }, h('div', { class: 'set-label' }, label), desc ? h('div', { class: 'set-desc' }, desc) : null),
      h('div', { class: 'set-value' }, value)), { a: act, focus: () => setHints('settings') }));
    const reopen = async (label) => { await saveProfile(g, p); openProfileEditor(g, label); };
    const cycle = (list, v) => list[(list.indexOf(v) + 1) % list.length];

    add('Profil actif', h('span', { class: 'toggle' + (p.enabled ? ' on' : '') }), () => { p.enabled = !p.enabled; reopen('Profil actif'); },
      'Pendant que ce jeu tourne, la manette tape au clavier et bouge la souris. Select + Start maintenus 1,5 s : désactiver jusqu’au prochain lancement.');
    add('Modèle', (PROFILE_PRESETS[p.preset] || {}).label || 'Personnalisé', () => openMenu('Modèle de profil', Object.entries(PROFILE_PRESETS).map(([id, pr]) => [pr.label, () => {
      Object.assign(p, newProfile(id), { enabled: p.enabled });
      reopen('Modèle');
    }])), 'Remplace toutes les touches par celles du modèle.');
    add('Stick gauche', STICK_MODES[p.lstick], () => { p.lstick = cycle(['wasd', 'arrows', 'mouse', 'none'], p.lstick); p.preset = 'custom'; reopen('Stick gauche'); });
    add('Stick droit', STICK_MODES[p.rstick], () => { p.rstick = cycle(['mouse', 'wheel', 'wasd', 'arrows', 'none'], p.rstick); p.preset = 'custom'; reopen('Stick droit'); });
    add('Sensibilité de la souris', `× ${p.sens}`, () => { p.sens = cycle([0.5, 0.75, 1, 1.5, 2, 3], p.sens); reopen('Sensibilité de la souris'); });
    for (const [slot] of PAD_SLOTS) {
      add(slotName(slot), keyLabel(p.map[slot]), () => openKeyPicker(g, p, slot));
    }
    add('Supprimer ce profil', '', async () => { delete S.cfg.padProfiles[g.path]; await saveCfg(); closeOverlay(); toast('Profil supprimé'); });
    openOverlay(h('div', { class: 'modal art-editor profile-editor' },
      h('div', { class: 'eyebrow' }, 'Profil manette → clavier'),
      h('h2', {}, g.name),
      ...rows));
    if (!profileOf(g)) saveProfile(g, p);
    if (focusLabel) {
      const el = rows.find((r) => r.querySelector('.set-label').textContent === focusLabel);
      if (el) setFocus(el, { silent: true });
    }
  }

  function openKeyPicker(g, p, slot) {
    const set = async (code) => { p.map[slot] = code; p.preset = 'custom'; await saveProfile(g, p); openProfileEditor(g, slotName(slot)); };
    const items = [
      ['⌨ Appuyer sur une touche du clavier…', () => captureKey((code) => set(code), () => openProfileEditor(g, slotName(slot)))],
      ...Object.entries(MOUSE_KEYS).map(([code, label]) => [`🖱 ${label}`, () => set(code)]),
      ...KEY_CODES.map((code) => [keyLabel(code), () => set(code)]),
      ['Rien', () => set('')],
    ];
    openMenu(`${slotName(slot)} →`, items);
  }

  function captureKey(done, cancel) {
    const box = h('div', { class: 'modal prompt' }, h('div', { class: 'eyebrow' }, 'Profil manette'), h('h2', {}, 'Appuie sur une touche…'),
      h('p', { class: 'muted small' }, 'La touche du clavier à envoyer quand ce bouton de la manette est pressé. Bouton B / ○ de la manette pour annuler.'));
    const onKey = (ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!KEY_CODES.includes(ev.code)) { toast(`Touche non prise en charge : ${ev.code}`, 'error'); return; }
      window.removeEventListener('keydown', onKey, true);
      done(ev.code);
    };
    window.addEventListener('keydown', onKey, true);
    openOverlay(box, { onBack: () => { window.removeEventListener('keydown', onKey, true); cancel(); } });
  }

  function openProfilesList() {
    const entries = Object.keys(S.cfg.padProfiles || {}).map((p) => S.byPath.get(p)).filter(Boolean);
    if (!entries.length) {
      toast('Aucun profil : ouvre le menu rapide d’un jeu (clic droit, Tab ou Start) → « Profil manette → clavier ».', 'info', 6000);
      return;
    }
    openMenu('Profils manette → clavier', entries.map((g) => [`${profileOf(g).enabled ? '●' : '○'} ${g.name}`, () => openProfileEditor(g)]));
  }

  // Boucle active pendant le jeu : lit la manette et envoie les différences au processus d'aide.
  let mapperTimer = 0;
  let mapperPrev = new Set();
  let mapperWheelAt = 0;
  let mapperSeenBlur = false;
  let mapperCombo = 0;
  function startMapper(p) {
    if (!api.mapper) return;
    stopMapper();
    api.mapper.start();
    mapperPrev = new Set();
    mapperSeenBlur = false;
    mapperCombo = 0;
    S.mapper = p;
    const stickKeys = (mode, x, y, out) => {
      const keys = mode === 'wasd' ? ['KeyW', 'KeyS', 'KeyA', 'KeyD'] : mode === 'arrows' ? ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] : null;
      if (!keys) return;
      if (y < -0.4) out.add(keys[0]);
      if (y > 0.4) out.add(keys[1]);
      if (x < -0.4) out.add(keys[2]);
      if (x > 0.4) out.add(keys[3]);
    };
    mapperTimer = setInterval(() => {
      const pad = Input.getPads()[0];
      if (!pad) return;
      const events = [];
      const now = new Set();
      for (const [slot, i] of PAD_SLOTS) {
        const b = pad.buttons[i];
        const code = p.map[slot];
        if (code && b && (b.pressed || b.value > 0.5)) now.add(code);
      }
      const ax = (i) => { const v = pad.axes[i] || 0; return Math.abs(v) < 0.15 ? 0 : v; };
      stickKeys(p.lstick, ax(0), ax(1), now);
      stickKeys(p.rstick, ax(2), ax(3), now);
      // Souris : vitesse progressive (petits gestes précis, grands gestes rapides).
      const mouseFrom = (x, y) => { const k = 22 * (p.sens || 1); events.push({ t: 'move', dx: Math.sign(x) * x * x * k, dy: Math.sign(y) * y * y * k }); };
      if (p.lstick === 'mouse') mouseFrom(ax(0), ax(1));
      if (p.rstick === 'mouse') mouseFrom(ax(2), ax(3));
      const wheelY = p.lstick === 'wheel' ? ax(1) : p.rstick === 'wheel' ? ax(3) : 0;
      if (Math.abs(wheelY) > 0.5 && performance.now() - mapperWheelAt > 120) { mapperWheelAt = performance.now(); events.push({ t: 'wheel', d: wheelY < 0 ? 120 : -120 }); }
      for (const code of now) if (!mapperPrev.has(code)) events.push({ t: 'down', key: code });
      for (const code of mapperPrev) if (!now.has(code)) events.push({ t: 'up', key: code });
      mapperPrev = now;
      if (events.length) api.mapper.send(events);
      // Select + Start maintenus 1,5 s : on coupe le profil.
      const combo = pad.buttons[8] && pad.buttons[9] && pad.buttons[8].pressed && pad.buttons[9].pressed;
      if (!combo) mapperCombo = 0;
      else if (!mapperCombo) mapperCombo = performance.now();
      else if (performance.now() - mapperCombo > 1500) { stopMapper(); toast('Profil manette désactivé'); }
    }, 10);
  }
  function stopMapper() {
    if (!mapperTimer) return;
    clearInterval(mapperTimer);
    mapperTimer = 0;
    if (mapperPrev.size && api.mapper) api.mapper.send([...mapperPrev].map((key) => ({ t: 'up', key })));
    mapperPrev = new Set();
    S.mapper = null;
    if (api.mapper) api.mapper.stop();
  }
  // Retour dans Lumen après être passé dans le jeu : le profil s'arrête.
  window.addEventListener('blur', () => { if (mapperTimer) mapperSeenBlur = true; });
  window.addEventListener('focus', () => { if (mapperTimer && mapperSeenBlur) stopMapper(); });

  // Test en direct : boutons et sticks tels que Lumen les reçoit.
  function openPadTest() {
    const out = h('pre', { class: 'pad-test' }, '');
    const box = h('div', { class: 'modal prompt' },
      h('div', { class: 'eyebrow' }, 'Manettes'), h('h2', {}, 'Test de la manette'),
      h('p', { class: 'muted small' }, 'Appuie sur des boutons et bouge les sticks. Clic en dehors ou Échap pour fermer.'), out);
    openOverlay(box);
    const timer = setInterval(() => {
      if (!box.isConnected) { clearInterval(timer); return; }
      const pads = Input.getPads();
      out.textContent = pads.length
        ? pads.map((p) => `Manette n°${p.native ? 'PS (lue par Lumen)' : p.index + 1} : ${p.id}\nType détecté : ${Input.padType} · disposition : ${p.mapping || 'non standard'}\n`
          + `Boutons pressés : ${p.buttons.map((b, i) => (b.pressed ? i : null)).filter((x) => x !== null).join(', ') || 'aucun'}\n`
          + `Sticks : ${p.axes.map((a) => a.toFixed(2)).join('  ')}`).join('\n\n')
        : `Aucune manette visible par Lumen.\nFenêtre au premier plan : ${document.hasFocus() ? 'oui' : 'non'}\n\nAppuie sur un bouton de la manette. Si rien ne change, Windows ne la transmet pas à Lumen (Bluetooth, pilote ou logiciel qui la capture).`;
    }, 60);
  }

  // ---------- Sons perso par jeu ----------
  async function pickGameSound(g) {
    const file = api.pickAudio && await api.pickAudio(`Son pour ${g.name}`);
    if (!file) return;
    (S.cfg.customSounds || (S.cfg.customSounds = {}))[g.path] = file;
    await saveCfg();
    g.soundbite = file;
    g.customSound = true;
    toast('Son enregistré pour ce jeu');
    startPreview(g, null);
  }
  async function clearGameSound(g) {
    if (!S.cfg.customSounds) return;
    delete S.cfg.customSounds[g.path];
    await saveCfg();
    toast('Son personnalisé retiré');
    applyLib(await api.scan({ romm: false }));
    rerender();
  }

  // ---------- Soundbites et vidéos d'aperçu (fichiers locaux) ----------
  const bite = new Audio();
  bite.onplay = () => duckMusic(true);
  bite.onpause = () => duckMusic(false);
  bite.onended = () => duckMusic(false);
  let biteTimer = 0;
  let previewTimer = 0;
  function stopPreview() {
    clearTimeout(biteTimer);
    clearTimeout(previewTimer);
    if (!bite.paused) {
      const start = bite.volume;
      const fade = setInterval(() => {
        bite.volume = Math.max(0, bite.volume - start / 6);
        if (bite.volume <= 0.01) { clearInterval(fade); bite.pause(); }
      }, 30);
    }
    document.querySelectorAll('.tile-video').forEach((v) => { v.classList.remove('on'); setTimeout(() => v.remove(), 300); });
  }
  function startPreview(g, tile) {
    stopPreview();
    if (S.inGame || S.launching) return;
    if (g.soundbite && S.cfg.soundbites && !S.cfg.muted) {
      biteTimer = setTimeout(() => {
        bite.src = api.mediaUrl(g.soundbite);
        bite.volume = S.cfg.volume ?? 0.7;
        bite.currentTime = 0;
        bite.play().catch(() => {});
      }, 450);
    }
    if (g.video && S.cfg.videos && tile) {
      previewTimer = setTimeout(() => {
        if (S.focusEl !== tile) return;
        const v = h('video', { class: 'tile-video', src: api.mediaUrl(g.video), muted: true, loop: true, playsinline: true });
        v.muted = true;
        v.oncanplay = () => v.classList.add('on');
        tile.append(v);
        v.play().catch(() => {});
      }, 1200);
    }
  }

  // ---------- Notifications ----------
  let toastTimer;
  function toast(msg, kind = 'info', ms = 2600) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = kind === 'error' ? 'error' : '';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
    if (kind === 'error') sfx('error');
  }

  // ---------- Fond & titre ----------
  let bgTimer;
  let bgKey = null;
  let bgFront = 0;
  function setBackground(file, color) {
    clearTimeout(bgTimer);
    if (document.body.classList.contains('wp-fixed')) { document.documentElement.style.setProperty('--ambient', color || 'var(--accent)'); return; }
    bgTimer = setTimeout(() => {
      const key = file || color || 'none';
      document.documentElement.style.setProperty('--ambient', color || 'var(--accent)');
      if (key === bgKey) return;
      bgKey = key;
      const layers = document.querySelectorAll('.bg-layer');
      bgFront ^= 1;
      const layer = layers[bgFront];
      const c = color || 'var(--accent)';
      layer.style.backgroundImage = file
        ? `url("${api.mediaUrl(file)}")`
        : `radial-gradient(60% 70% at 25% 15%, ${c} 0%, transparent 70%), radial-gradient(50% 60% at 85% 80%, #312e81 0%, transparent 70%)`;
      layer.classList.add('on');
      layers[bgFront ^ 1].classList.remove('on');
    }, 120);
  }

  function setTitle(text, sub) {
    const pill = $('#title-pill');
    const key = `${text || ''}|${sub || ''}`;
    if (pill.dataset.key === key) return;
    pill.dataset.key = key;
    pill.replaceChildren();
    if (text) pill.append(text);
    if (text && sub) pill.append(h('span', { class: 'sub' }, sub));
    if (text && !reduceMotion) {
      pill.classList.remove('swap');
      void pill.offsetWidth;
      pill.classList.add('swap');
    }
  }

  // ---------- Indications de boutons ----------
  const KB_GLYPH = { a: 'Entrée', b: 'Échap', x: 'F', y: 'I', menu: 'Tab', lb: 'Q', rb: 'E', lt: 'PgUp', rt: 'PgDn' };
  const HINTS = {
    game: [[['b', 'Retour'], ['y', 'Détails'], ['rt', 'Lettre']], [['x', 'Favori'], ['menu', 'Menu'], ['a', 'Jouer']]],
    keyboard: [[['b', 'Retour']], [['x', 'Effacer'], ['a', 'Taper']]],
    system: [[['b', 'Retour']], [['menu', 'Menu'], ['a', 'Ouvrir']]],
    settings: [[['b', 'Retour']], [['a', 'Modifier']]],
    action: [[['b', 'Retour']], [['menu', 'Menu'], ['a', 'Valider']]],
    overlay: [[['b', 'Fermer']], [['a', 'Valider']]],
    none: [[['b', 'Retour']], [['menu', 'Menu']]],
  };
  // Symboles par famille de manette. Pour une Switch, l'action « a » vient de A (à droite) si la
  // disposition Nintendo est active, sinon du bouton du bas, marqué B.
  const PAD_GLYPHS = {
    xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', menu: '☰' },
    playstation: { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', menu: 'Options' },
    switch: { a: 'B', b: 'A', x: 'Y', y: 'X', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR', menu: '+' },
  };
  function padGlyph(btn) {
    const t = Input.padType;
    const fam = t === 'ps4' || t === 'ps5' ? 'playstation' : t === 'switch' ? 'switch' : 'xbox';
    // Position physique du bouton qui déclenche cette action (l'inversion échange a/b et x/y).
    const SW = { a: 'b', b: 'a', x: 'y', y: 'x' };
    const physical = Input.swapActive && Input.swapActive() && SW[btn] ? SW[btn] : btn;
    return { text: PAD_GLYPHS[fam][physical] || btn.toUpperCase(), fam, physical };
  }
  function hint(btn, label) {
    const kb = Input.lastDevice === 'keyboard';
    if (kb) return h('div', { class: 'hint', onClick: () => Input.emit(btn) }, h('span', { class: 'glyph kb' }, KB_GLYPH[btn]), label);
    const g = padGlyph(btn);
    return h('div', { class: 'hint', onClick: () => Input.emit(btn) }, h('span', { class: `glyph pad-${g.physical} fam-${g.fam}` }, g.text), label);
  }
  function setHints(kind) {
    S.hintKind = kind;
    const [left, right] = HINTS[kind] || HINTS.none;
    $('#hints-left').replaceChildren(...left.map((x) => hint(...x)));
    $('#hints-right').replaceChildren(...right.map((x) => hint(...x)));
  }

  // Le dock est construit une fois ; l'indicateur glisse d'un onglet à l'autre.
  function renderDock() {
    const dock = $('#dock');
    if (!S.cfg) return;
    if (!dock.firstChild) {
      dock.append(
        h('div', { id: 'dock-ind' }),
        h('span', { class: 'dock-bumper', onClick: () => switchTab(-1) }),
        ...TABS.map((t) => h('div', {
          class: 'dock-item',
          'data-tab': t.id,
          onClick: () => { if (tabOf(S.route) !== t.id) { S.trans = 'v-fade'; openTab(t.id); } },
        }, icon(t.id), h('span', {}, t.label))),
        h('span', { class: 'dock-bumper', onClick: () => switchTab(1) }),
      );
    }
    const kb = Input.lastDevice === 'keyboard';
    const bumpers = dock.querySelectorAll('.dock-bumper');
    bumpers[0].textContent = kb ? 'Q' : 'LB';
    bumpers[1].textContent = kb ? 'E' : 'RB';
    const active = tabOf(S.route);
    let activeEl = null;
    for (const it of dock.querySelectorAll('.dock-item')) {
      const on = it.dataset.tab === active;
      it.classList.toggle('active', on);
      if (on) activeEl = it;
    }
    const ind = $('#dock-ind');
    if (activeEl) {
      ind.style.left = `${activeEl.offsetLeft}px`;
      ind.style.width = `${activeEl.offsetWidth}px`;
      if (!ind.classList.contains('ready')) requestAnimationFrame(() => ind.classList.add('ready'));
    }
  }

  // ---------- Focus & navigation spatiale ----------
  function focusable(el, act) {
    el.classList.add('f');
    el._act = act || {};
    el.addEventListener('mouseenter', () => { if (S.mouse) setFocus(el, { silent: true, noScroll: true }); });
    el.addEventListener('click', () => {
      setFocus(el, { silent: true, noScroll: true });
      if (el._act.a) { pressFx(el); sfx('select'); el._act.a(); }
    });
    return el;
  }

  function setFocus(el, opts = {}) {
    if (!el || S.focusEl === el) return;
    if (S.focusEl) S.focusEl.classList.remove('focused');
    stopPreview();
    S.focusEl = el;
    el.classList.add('focused');
    if (!opts.noScroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: opts.instant ? 'auto' : 'smooth' });
    if (!opts.silent) sfx('move');
    placeCursor(opts.instant);
    if (el._act.focus) el._act.focus();
  }

  const scopeRoot = () => (S.overlay ? S.overlay.root : $('#view'));
  const focusables = (root) => [...root.querySelectorAll('.f')].filter((e) => e.offsetParent !== null);
  const indexOfFocus = (el = S.focusEl) => focusables($('#view')).indexOf(el);

  function move(dir) {
    const items = focusables(scopeRoot());
    const cur = S.focusEl && scopeRoot().contains(S.focusEl) ? S.focusEl : null;
    if (!cur) { if (items[0]) setFocus(items[0]); return; }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const horizontal = dir === 'left' || dir === 'right';
    const sign = dir === 'right' || dir === 'down' ? 1 : -1;
    let best = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      const main = (horizontal ? bx - cx : by - cy) * sign;
      if (main <= 4) continue;
      const overlap = horizontal
        ? b.top < r.bottom - 2 && b.bottom > r.top + 2
        : b.left < r.right - 2 && b.right > r.left + 2;
      const crossRaw = Math.abs(horizontal ? by - cy : bx - cx);
      const score = main + (overlap ? 0 : crossRaw * 3) + crossRaw * 0.05;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) setFocus(best);
  }

  // ---------- Routage ----------
  function render(focusIndex = 0) {
    const v = S.route.view;
    document.body.classList.toggle('home-clock', v === 'home' && !!S.cfg && homeCfg().widgets.includes('clock'));
    let content;
    if (v === 'home') content = viewHome();
    else if (v === 'search') content = viewSearch();
    else if (v === 'systems') content = viewSystems();
    else if (v === 'games') content = viewGames(S.route.systemId, focusIndex);
    else if (v === 'favorites') content = viewFavorites();
    else if (v === 'folder') content = viewFolder(S.route.id, focusIndex);
    else if (v === 'achievements') content = viewAchievements();
    else content = viewSettings();

    const view = $('#view');
    const animate = !S.keepAnim && !reduceMotion;
    const trans = animate ? S.trans || 'v-fade' : null;
    S.trans = null;
    const prevScroll = v === 'settings' && view.firstChild ? view.firstChild.scrollTop : 0;
    const inner = h('div', { class: 'view-inner' + (trans ? ' ' + trans : '') }, content);
    view.replaceChildren(inner);
    inner.scrollTop = prevScroll;
    S.keepAnim = false;
    S.focusEl = null;
    setTitle('');
    renderDock();

    const items = focusables(view);
    const index = Math.max(0, Math.min(focusIndex, items.length - 1));
    const target = items[index];

    // Apparition en cascade des éléments visibles.
    let targetDelay = 0;
    if (animate) {
      const viewBox = view.getBoundingClientRect();
      let i = 0;
      for (const el of inner.querySelectorAll('.tile, .syscard, .folder, .set-row, .set-section, .shelf-title, .view-head, .empty, .hero')) {
        const r = el.getBoundingClientRect();
        if (r.top > viewBox.bottom || r.left > viewBox.right) continue;
        const delay = Math.min(i++, 22) * 26;
        el.style.setProperty('--d', `${delay}ms`);
        el.classList.add('enter');
        const done = el.classList.contains('hero') ? 1300 : delay + 600;
        setTimeout(() => el.classList.remove('enter'), done);
        if (el === target) targetDelay = delay;
      }
      holdCursor(Math.max(420, targetDelay + 480));
    }

    if (target) setFocus(target, { silent: true, instant: true });
    else { setHints('none'); setBackground(null); placeCursor(); }
  }

  function rerender() { S.keepAnim = true; render(indexOfFocus()); }

  function go(route) {
    S.stack.push({ route: S.route, index: indexOfFocus() });
    S.route = route;
    S.trans = 'v-in';
    render();
  }

  function back() {
    if (S.stack.length) {
      const prev = S.stack.pop();
      S.route = prev.route;
      S.trans = 'v-out';
      render(prev.index);
      sfx('back');
    } else if (S.route.view !== 'home') {
      S.trans = 'v-out';
      openTab('home');
      sfx('back');
    }
  }

  function openTab(id) {
    const cur = tabOf(S.route);
    if (S.stack.length === 0) S.tabMemory[cur] = indexOfFocus();
    S.stack = [];
    S.route = { view: id };
    render(S.tabMemory[id] || 0);
  }

  function switchTab(delta) {
    const i = TABS.findIndex((t) => t.id === tabOf(S.route));
    S.trans = delta > 0 ? 'v-right' : 'v-left';
    openTab(TABS[(i + delta + TABS.length) % TABS.length].id);
    sfx('tab');
  }

  // ---------- Composants ----------
  function hash(str) {
    let x = 2166136261;
    for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
    return x >>> 0;
  }

  // Jaquette générée (motif + couleurs déterministes) quand aucune image n'existe.
  function fallbackArt(name, color, short) {
    const n = hash(name);
    const hue = n % 360;
    return h('div', {
      class: `gen p${(n >>> 9) % 4}`,
      '--a': color || '#475569',
      '--b': `hsl(${hue} 80% 62%)`,
      '--rx': `${20 + ((n >>> 12) % 60)}%`,
      '--ry': `${10 + ((n >>> 17) % 45)}%`,
    },
    short ? h('div', { class: 'gen-chip' }, short) : h('div'),
    h('div', { class: 'gen-title' }, name));
  }

  function heroCard(g, eyebrow, variant = '') {
    const sys = sysById(g.system) || {};
    const art = g.hero || g.background || g.cover;
    const focus = () => {
      setTitle(g.name, sys.short);
      setBackground(art, sys.color);
      setHints('action');
      startPreview(g, null);
    };
    const btn = (label, fn, primary) => focusable(h('div', { class: 'btn' + (primary ? ' primary' : '') }, label), { a: fn, focus });
    return h('section', { class: 'hero ' + variant, '--c': sys.color || '#475569' },
      h('div', { class: 'hero-art' }, art ? h('img', { src: api.mediaUrl(art), alt: '' }) : fallbackArt(g.name, sys.color)),
      h('div', { class: 'hero-body' },
        h('div', { class: 'eyebrow' }, eyebrow),
        g.logo ? h('img', { class: 'hero-logo', src: api.mediaUrl(g.logo), alt: g.name }) : h('h1', {}, g.name),
        h('div', { class: 'hero-meta' }, [sys.name, g.year, g.genre].filter(Boolean).join('  ·  ')),
        h('div', { class: 'actions' },
          btn('▶  Jouer', () => launch(g), true),
          btn('Détails', () => openDetails(g)))));
  }

  function gameTile(g, collection) {
    const sys = sysById(g.system);
    const tile = h('div', { class: 'tile', '--c': sys ? sys.color : '#475569' });
    tile._collection = collection || null;
    if (g.cover) {
      const img = h('img', { class: 'art', src: api.mediaUrl(g.cover), loading: 'lazy', alt: '', draggable: 'false' });
      img.onerror = () => img.replaceWith(fallbackArt(g.name, sys && sys.color, sys && sys.short));
      tile.append(img);
    } else {
      tile.append(fallbackArt(g.name, sys && sys.color, sys && sys.short));
    }
    if (isFav(g)) tile.append(starIcon());
    if (g.soundbite || g.video) tile.append(h('span', { class: 'badge-media' }, g.video ? '▶' : '♪'));
    if (g.source === 'romm' && !g.downloaded) tile.append(h('span', { class: 'badge-cloud', title: 'Sur ton serveur RomM' }, '☁'));
    if (g.appIcon) tile.classList.add('app-tile');
    // Applications : le nom reste lisible sous l'icône.
    if (g.source === 'app' && g.cover) tile.append(h('div', { class: 'app-name' }, g.name));
    const ai = achInfo(g);
    if (ai && ai.total && ai.unlocked === ai.total) tile.append(trophyIcon('on-tile'));
    if (g.installed === false) { tile.classList.add('not-installed'); tile.append(h('span', { class: 'badge-cloud badge-dl', title: 'Non installé' }, '⬇')); }
    tile._game = g;
    return focusable(tile, {
      a: () => launch(g),
      x: () => toggleFav(g),
      y: () => openDetails(g),
      focus: () => {
        setTitle(g.name, sys ? sys.short : '');
        setBackground(g.background || g.cover, sys && sys.color);
        setHints('game');
        startPreview(g, tile);
      },
    });
  }

  // Les grandes grilles sont remplies par paquets pour garder une ouverture instantanée.
  function fillGrid(grid, games, minCount = 0, collection) {
    const first = Math.max(96, minCount + 24);
    grid.append(...games.slice(0, first).map((g) => gameTile(g, collection)));
    let i = first;
    const step = () => {
      if (i >= games.length || !grid.isConnected) return;
      grid.append(...games.slice(i, i + 160).map((g) => gameTile(g, collection)));
      i += 160;
      setTimeout(step, 16);
    };
    grid._flush = () => { if (i < games.length) { grid.append(...games.slice(i).map((g) => gameTile(g, collection))); i = games.length; } };
    setTimeout(step, 400);
    return grid;
  }

  // Temps de jeu : celui compté par Lumen, ou celui de Steam s'il est plus grand (jeux lancés hors de Lumen).
  const playtimeOf = (g) => Math.max((S.cfg.playtime || {})[g.path] || 0, g.storePlaytime || 0);

  function sortGames(games) {
    const mode = S.cfg.sort || 'name';
    if (mode === 'name') return games;
    const list = [...games];
    const last = S.cfg.lastPlayed || {};
    const lastOf = (g) => Math.max(last[g.path] || 0, g.storeLastPlayed || 0);
    if (mode === 'recent') list.sort((a, b) => lastOf(b) - lastOf(a) || a.name.localeCompare(b.name));
    if (mode === 'playtime') list.sort((a, b) => playtimeOf(b) - playtimeOf(a) || a.name.localeCompare(b.name));
    if (mode === 'year') list.sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999') || a.name.localeCompare(b.name));
    if (mode === 'genre') list.sort((a, b) => (genresOf(a)[0] || '\uffff').localeCompare(genresOf(b)[0] || '\uffff', 'fr') || a.name.localeCompare(b.name));
    return list;
  }

  // Genres d'un jeu : liste fournie par le scan PC, sinon le champ texte d'ES-DE (« Action / Plateforme »).
  function genresOf(g) {
    if (g.genres && g.genres.length) return g.genres;
    if (!g._genres) g._genres = String(g.genre || '').split(/\s*[,/;]\s*/).map((x) => x.trim()).filter(Boolean);
    return g._genres;
  }

  // Filtre d'une console (pour la session) : 'all', 'installed', 'missing' ou 'g:<genre>'.
  const filterOf = (sysId) => (S.filters || {})[sysId] || 'all';
  function filterLabel(f) {
    if (f === 'installed') return 'Installés';
    if (f === 'missing') return 'Non installés';
    if (f === 'safe') return 'Sans NSFW';
    if (f === 'adult') return 'NSFW';
    if (f.startsWith('g:') || f.startsWith('t:')) return f.slice(2);
    return 'Tous les jeux';
  }
  function applyFilter(games, f) {
    if (f === 'installed') return games.filter((g) => g.installed !== false);
    if (f === 'missing') return games.filter((g) => g.installed === false);
    if (f === 'safe') return games.filter((g) => !g.adult);
    if (f === 'adult') return games.filter((g) => g.adult);
    if (f.startsWith('g:')) return games.filter((g) => genresOf(g).includes(f.slice(2)));
    if (f.startsWith('t:')) return games.filter((g) => (g.tags || []).includes(f.slice(2)));
    return games;
  }
  function setFilter(sysId, f) {
    (S.filters || (S.filters = {}))[sysId] = f;
    toast(`Filtre : ${filterLabel(f)}`);
    sfx('select');
    S.keepAnim = false;
    S.trans = 'v-fade';
    render(0);
  }
  function openFilterMenu(s) {
    const counts = new Map();
    for (const g of s.games) for (const x of genresOf(g)) counts.set(x, (counts.get(x) || 0) + 1);
    const items = [[`Tous les jeux (${s.games.length})`, () => { closeOverlay(true); setFilter(s.id, 'all'); }]];
    const missing = s.games.filter((g) => g.installed === false).length;
    if (missing) {
      items.push([`Installés (${s.games.length - missing})`, () => { closeOverlay(true); setFilter(s.id, 'installed'); }]);
      items.push([`Non installés (${missing})`, () => { closeOverlay(true); setFilter(s.id, 'missing'); }]);
    }
    const adult = s.games.filter((g) => g.adult).length;
    if (adult) {
      items.push([`Sans NSFW (${s.games.length - adult})`, () => { closeOverlay(true); setFilter(s.id, 'safe'); }]);
      items.push([`NSFW uniquement (${adult})`, () => { closeOverlay(true); setFilter(s.id, 'adult'); }]);
    }
    const tags = new Map();
    for (const g of s.games) for (const t of g.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
    if (tags.size) items.push(['Étiquettes (horreur, anime, multijoueur…)', () => { closeOverlay(true); openTagMenu(s, tags); }]);
    for (const [x, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0], 'fr'))) {
      items.push([`${x} (${n})`, () => { closeOverlay(true); setFilter(s.id, 'g:' + x); }]);
    }
    openMenu('Afficher', items);
  }
  // Étiquettes Steam présentes sur au moins 2 jeux, les plus fréquentes d'abord.
  function openTagMenu(s, tags) {
    const list = [...tags].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).slice(0, 60);
    openMenu('Étiquettes', list.map(([t, n]) => [`${t} (${n})`, () => { closeOverlay(true); setFilter(s.id, 't:' + t); }]));
  }
  function filterChip(s) {
    const has = s.games.some((g) => g.installed === false || g.adult || (g.tags && g.tags.length) || genresOf(g).length);
    if (!has) return null;
    return focusable(h('div', { class: 'chip' + (filterOf(s.id) !== 'all' ? ' active' : '') }, '⏷ ', filterLabel(filterOf(s.id))), {
      a: () => openFilterMenu(s),
      focus: () => { setTitle('Afficher', filterLabel(filterOf(s.id))); setHints('action'); },
    });
  }
  const sortLabel = () => (SORTS.find((s) => s.id === (S.cfg.sort || 'name')) || SORTS[0]).label;

  const platformArt = (id) => (S.lib.platformArt || {})[id] || {};

  function systemCard(s) {
    const art = platformArt(s.id);
    const card = h('div', { class: 'syscard' + (art.icon ? ' has-icon' : '') + (art.logo ? ' has-logo' : ''), '--c': s.color, 'data-short': art.icon || art.logo ? '' : s.short },
      art.hero ? h('img', { class: 'sys-hero', src: api.mediaUrl(art.hero), alt: '' }) : null,
      art.icon ? h('img', { class: 'sys-icon', src: api.mediaUrl(art.icon), alt: '' }) : null,
      h('div', { class: 'sys-count' }, plural(s.games.length, 'jeu', 'jeux')),
      art.logo ? h('img', { class: 'sys-logo', src: api.mediaUrl(art.logo), alt: s.name }) : h('div', { class: 'sys-short' }, s.short),
      h('div', { class: 'sys-name' }, s.name, sysMeta(s) ? h('span', { class: 'sys-meta' }, sysMeta(s)) : null));
    const withBg = art.hero ? { background: art.hero } : s.games.find((g) => g.background || g.cover);
    card._system = s.id;
    return focusable(card, {
      a: () => { sfx('enter'); go({ view: 'games', systemId: s.id }); },
      focus: () => {
        setTitle(s.name, plural(s.games.length, 'jeu', 'jeux'));
        setBackground(withBg ? withBg.background || withBg.cover : null, s.color);
        setHints('system');
      },
    });
  }

  function actionButton(label, fn, primary) {
    return focusable(h('div', { class: 'btn' + (primary ? ' primary' : '') }, label), {
      a: fn,
      focus: () => { setHints(S.overlay ? 'overlay' : 'action'); },
    });
  }

  function emptyLibrary() {
    const hasRoot = !!S.cfg.romsRoot;
    return h('div', { class: 'empty' },
      h('div', { class: 'logo-mark big', style: 'margin:0 auto 14px' }),
      h('h2', {}, hasRoot ? 'Aucun jeu trouvé' : 'Ta bibliothèque est vide'),
      h('p', {}, hasRoot
        ? `Lumen cherche des sous-dossiers nommés par console (snes, gba, psx, ps2, gc…) dans ${S.cfg.romsRoot}.`
        : 'Choisis le dossier où sont rangées tes ROMs, avec un sous-dossier par console.'),
      h('div', { class: 'actions' },
        actionButton(hasRoot ? 'Changer de dossier' : 'Choisir le dossier de ROMs', pickRoms, true),
        hasRoot ? actionButton('Rescanner', () => rescan()) : null));
  }

  // ---------- Vues ----------
  function viewHome() {
    if (!S.lib.systems.length) return emptyLibrary();
    const recent = S.cfg.recent.map((p) => S.byPath.get(p)).filter(Boolean).slice(0, 14);
    const favs = S.cfg.favorites.map((p) => S.byPath.get(p)).filter(Boolean).slice(0, 14);
    const all = S.lib.systems.flatMap((s) => s.games);
    if (!S.featured || !S.byPath.has(S.featured)) {
      const pool = all.filter((g) => g.background || g.cover);
      const src = pool.length ? pool : all;
      S.featured = src[Math.floor(Math.random() * src.length)].path;
    }
    const featured = recent[0] || S.byPath.get(S.featured);
    const home = homeCfg();
    const shelves = [];
    const shelfOf = {};
    const pushShelf = (id, title, items) => { shelves.push([title, items]); shelfOf[title] = id; };
    if (home.blocks.recent && recent.length > 1) pushShelf('recent', 'Joués récemment', recent.slice(1).map(gameTile));
    if (home.blocks.favorites && favs.length) pushShelf('favorites', 'Favoris', favs.map(gameTile));
    if (home.blocks.systems) pushShelf('systems', 'Consoles', sortedSystems().map(systemCard));
    const folders = collectionsList().filter((c) => c.id !== '★' || favs.length);
    if (home.blocks.folders && folders.length) pushShelf('folders', 'Dossiers', folders.map(folderTile));
    if (home.blocks.discover && (!recent.length || home.blocks.discoverAlways)) {
      const picks = [];
      const seen = new Set([featured.path]);
      while (picks.length < Math.min(12, all.length - 1)) {
        const g = all[Math.floor(Math.random() * all.length)];
        if (!seen.has(g.path)) { seen.add(g.path); picks.push(g); }
      }
      pushShelf('discover', 'À découvrir', picks.map(gameTile));
    }
    const widgets = home.widgets.filter((w) => WIDGETS[w]);
    const cols = widgets.reduce((n, w) => n + (home.wide[w] ? 2 : 1), 0);
    const blocks = {
      widgets: widgets.length ? h('section', { class: 'widgets', style: `--n:${Math.min(Math.max(cols, 1), 4)}` }, widgets.map((w) => widgetCard(w))) : null,
      hero: home.blocks.hero ? heroCard(featured, recent.length ? 'Reprendre' : 'À la une', widgets.length ? 'compact' : '') : null,
    };
    for (const [title, items] of shelves) blocks[shelfOf[title]] = h('section', { class: 'shelf' }, h('div', { class: 'shelf-title' }, title), h('div', { class: 'row' }, items));
    const ordered = [...home.order.filter((id) => id in blocks), ...Object.keys(blocks).filter((id) => !home.order.includes(id))];
    const els = ordered.map((id) => {
      const el = blocks[id];
      if (!el) return null;
      el.dataset.block = id;
      if (S.homeEdit) makeDraggable(el, 'block', id);
      return el;
    });
    return h('div', { class: 'home' + (S.homeEdit ? ' editing' : '') },
      S.homeEdit ? h('div', { class: 'edit-banner' }, '✏ Réorganisation : glisse les widgets et les blocs où tu veux · Échap pour terminer') : null,
      ...els);
  }

  // ---------- Réorganisation à la souris (mode édition de l'accueil) ----------
  function makeDraggable(el, kind, id) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => { e.stopPropagation(); S.drag = { kind, id }; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); document.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target')); });
    el.addEventListener('dragover', (e) => { if (S.drag && S.drag.kind === kind && S.drag.id !== id) { e.preventDefault(); e.stopPropagation(); el.classList.add('drop-target'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const d = S.drag;
      S.drag = null;
      if (!d || d.kind !== kind || d.id === id) return;
      const home = homeCfg();
      const list = kind === 'widget' ? home.widgets : home.order;
      if (kind === 'block') for (const b of Object.keys(HOME_ORDER_NAMES)) if (!list.includes(b)) list.push(b);
      const from = list.indexOf(d.id);
      const to = list.indexOf(id);
      if (from < 0 || to < 0) return;
      list.splice(from, 1);
      list.splice(to, 0, d.id);
      await saveCfg();
      sfx('select');
      S.keepAnim = true;
      render(0);
    });
  }
  function toggleHomeEdit(on) {
    S.homeEdit = on;
    if (S.route.view !== 'home') openTab('home'); else { S.keepAnim = true; render(0); }
    if (on) toast('Glisse les widgets et les blocs à la souris · à la manette : Réglages → Personnaliser l’accueil', 'info', 5000);
  }

  // Coupe en or : la récompense d'un jeu terminé à 100 %.
  function trophyIcon(cls = '') {
    const el = h('span', { class: 'trophy ' + cls, title: 'Tous les succès débloqués' });
    el.innerHTML = '<svg viewBox="0 0 24 24"><defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7c2"/><stop offset=".45" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs>'
      + '<path fill="url(#tg)" stroke="#78350f" stroke-width=".8" d="M7 3h10v4.5a5 5 0 0 1-4 4.9V15h2.5a1 1 0 0 1 1 1v1.2H7.5V16a1 1 0 0 1 1-1H11v-2.6a5 5 0 0 1-4-4.9z"/>'
      + '<path fill="none" stroke="#b45309" stroke-width="1.6" stroke-linecap="round" d="M7 5H4.6a.6.6 0 0 0-.6.6C4 8 5.4 9.6 7.4 9.9M17 5h2.4c.3 0 .6.3.6.6 0 2.4-1.4 4-3.4 4.3"/>'
      + '<rect x="6.5" y="17.6" width="11" height="3.2" rx="1" fill="url(#tg)" stroke="#78350f" stroke-width=".8"/><path d="M9.3 4.6c0 2 .5 3.5 1.6 4.4" stroke="#fffbea" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".9"/></svg>';
    return el;
  }
  function starIcon() {
    const el = h('span', { class: 'badge-fav', title: 'Favori' });
    el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
    return el;
  }

  // ---------- Accueil : widgets et blocs (Réglages → Affichage → Personnaliser l'accueil) ----------
  const HOME_DEFAULT = {
    widgets: ['nowplaying', 'achievements', 'surprise', 'favorites'],
    order: ['widgets', 'hero', 'recent', 'favorites', 'systems', 'folders', 'discover'],
    wide: {},
    blocks: { hero: true, recent: true, favorites: false, systems: true, folders: true, discover: true, discoverAlways: false },
  };
  function homeCfg() {
    const c = S.cfg.home || (S.cfg.home = JSON.parse(JSON.stringify(HOME_DEFAULT)));
    c.widgets = Array.isArray(c.widgets) ? c.widgets : HOME_DEFAULT.widgets.slice();
    c.blocks = { ...HOME_DEFAULT.blocks, ...(c.blocks || {}) };
    c.order = Array.isArray(c.order) ? c.order : HOME_DEFAULT.order.slice();
    c.wide = c.wide || {};
    return c;
  }
  const HOME_ORDER_NAMES = { widgets: 'Widgets', hero: 'Bandeau « Reprendre »', recent: 'Joués récemment', favorites: 'Favoris', systems: 'Consoles', folders: 'Dossiers', discover: 'À découvrir' };
  const HOME_BLOCKS = [
    ['hero', 'Bandeau « Reprendre »'], ['recent', 'Joués récemment'], ['favorites', 'Favoris'], ['systems', 'Consoles'],
    ['folders', 'Dossiers'], ['discover', 'À découvrir'], ['discoverAlways', 'À découvrir, même avec des jeux récents'],
  ];
  const WEATHER_ICONS = (code, day) => (code === 0 ? (day ? '☀️' : '🌙') : code <= 2 ? (day ? '🌤️' : '☁️') : code === 3 ? '☁️' : code <= 48 ? '🌫️'
    : code <= 57 ? '🌦️' : code <= 67 ? '🌧️' : code <= 77 ? '🌨️' : code <= 82 ? '🌧️' : code <= 86 ? '🌨️' : '⛈️');

  // Chaque widget : nom, puis rendu (contenu) et action (bouton A).
  const WIDGETS = {
    clock: { name: 'Horloge', render: () => {
      const now = new Date();
      const hh = now.getHours();
      const hello = hh < 6 ? 'Bonne nuit' : hh < 12 ? 'Bonjour' : hh < 18 ? 'Bon après-midi' : 'Bonsoir';
      return [h('div', { class: 'w-big', 'data-clock': '1' }, now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
        h('div', { class: 'w-sub' }, `${hello} · ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`)];
    } },
    weather: { name: 'Météo', render: () => {
      const w = S.weather;
      const city = (S.cfg.weatherCity || '').trim();
      if (!city) return [h('div', { class: 'w-big' }, '🌤️'), h('div', { class: 'w-sub' }, 'Choisis ta ville (bouton A)')];
      if (!w) { loadWeather(); return [h('div', { class: 'w-big' }, '…'), h('div', { class: 'w-sub' }, city)]; }
      if (w.error) return [h('div', { class: 'w-big' }, '⚠️'), h('div', { class: 'w-sub' }, w.error)];
      return [h('div', { class: 'w-big' }, `${WEATHER_ICONS(w.code, w.day)} ${w.temp}°`), h('div', { class: 'w-sub' }, `${w.city} · ${w.min}° / ${w.max}°`)];
    }, act: async () => {
      const v = await openPrompt({ title: 'Ville pour la météo', value: S.cfg.weatherCity || '', help: 'Par exemple Paris, Lyon, Bruxelles, Montréal…' });
      if (v === null) return;
      S.cfg.weatherCity = v.trim();
      S.weather = null;
      await saveCfg();
      rerender();
    } },
    achievements: { name: 'Rang et XP', render: () => {
      if (!S.ach) return [h('div', { class: 'w-big' }, '🏆'), h('div', { class: 'w-sub' }, 'Lecture des succès…')];
      const st = achStats(S.ach);
      return [h('div', { class: 'w-rank', '--rc': st.rank.color }, rankEmblem(st), h('div', { class: 'w-rank-text' }, h('b', {}, `Rang ${st.rank.name}`), h('div', { class: 'w-sub' }, `Niveau ${st.lvl} · ${st.unlocked} succès`),
        h('div', { class: 'xp-bar', '--rc': st.rank.color }, h('div', { class: 'xp-fill', style: `width:${Math.max(3, Math.round((st.into / st.need) * 100))}%` })),
        h('div', { class: 'w-xp' }, `${st.into} / ${st.need} XP`)))];
    }, act: () => openTab('achievements') },
    playtime: { name: 'Temps de jeu', render: () => {
      const pt = {};
      for (const sys of S.lib.systems) for (const g of sys.games) { const t = playtimeOf(g); if (t) pt[g.path] = t; }
      const total = Object.values(pt).reduce((n, v) => n + v, 0);
      const best = Object.entries(pt).sort((a, b) => b[1] - a[1]).map(([p]) => S.byPath.get(p)).find(Boolean);
      return [h('div', { class: 'w-big' }, total ? formatTime(total) : '0 min'), h('div', { class: 'w-sub' }, best ? `Le plus joué : ${best.name}` : 'Temps passé en jeu depuis Lumen')];
    } },
    music: { name: 'Musique', render: () => {
      const m = musicCfg();
      if (!m.enabled || !musicList.length) return [h('div', { class: 'w-big' }, '🎵'), h('div', { class: 'w-sub' }, 'Musique de fond désactivée')];
      const name = (musicList[musicIdx] || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      return [h('div', { class: 'w-music' }, h('span', { class: 'w-eq' }, h('i'), h('i'), h('i')), h('b', {}, name)), h('div', { class: 'w-sub' }, 'A : morceau suivant')];
    }, act: () => { if (musicList.length) { nextTrack(); setTimeout(rerender, 100); } else openTab('settings'); } },
    nowplaying: { name: 'Lecture en cours', render: () => mediaBody(), bg: () => (S.media && S.media.active && S.media.thumb) || null, act: () => mediaCmd('toggle'), x: () => mediaCmd('next'), y: () => mediaCmd('prev') },
    favorites: { name: 'Favoris', render: () => {
      const favs = (S.cfg.favorites || []).map((p) => S.byPath.get(p)).filter(Boolean);
      if (!favs.length) return [h('div', { class: 'w-big' }, '☆'), h('div', { class: 'w-sub' }, 'X sur un jeu pour l’ajouter')];
      return [h('div', { class: 'w-favs' }, favs.slice(0, 4).map((g) => g.cover ? h('img', { src: api.mediaUrl(g.cover), alt: '' }) : h('div', { class: 'w-fav-empty' }, g.name.slice(0, 2)))),
        h('div', { class: 'w-sub' }, plural(favs.length, 'favori', 'favoris'))];
    }, act: () => go({ view: 'folder', id: '★' }) },
    surprise: { name: 'Jeu surprise', bg: () => { const g = S.surprise && S.byPath.get(S.surprise); return g ? g.hero || g.background || g.cover : null; }, render: () => {
      const all = S.lib.systems.flatMap((x) => x.games).filter((g) => g.cover);
      if (!S.surprise || !S.byPath.has(S.surprise)) S.surprise = all.length ? all[Math.floor(Math.random() * all.length)].path : null;
      const g = S.surprise && S.byPath.get(S.surprise);
      if (!g) return [h('div', { class: 'w-big' }, '🎲'), h('div', { class: 'w-sub' }, 'Aucun jeu')];
      return [h('div', { class: 'w-surprise' }, h('img', { src: api.mediaUrl(g.cover), alt: '' }),
        h('div', { class: 'w-surprise-text' }, h('b', {}, g.name), h('div', { class: 'w-sub' }, (sysById(g.system) || {}).name || ''), h('div', { class: 'w-hint' }, '🎲 A : roulette · X : autre')))];
    }, act: () => openRoll(), x: () => { S.surprise = null; rerender(); } },
    note: { name: 'Mémo', render: () => [h('div', { class: 'w-note' }, (S.cfg.homeNote || '').trim() || 'Écris un petit mot ici (bouton A)')], act: async () => {
      const v = await openPrompt({ title: 'Mémo', value: S.cfg.homeNote || '', help: 'Un rappel, une liste de jeux à finir…' });
      if (v === null) return;
      S.cfg.homeNote = v;
      await saveCfg();
      rerender();
    } },
    stats: { name: 'Bibliothèque', render: () => {
      const n = totalGames();
      return [h('div', { class: 'w-big' }, String(n)), h('div', { class: 'w-sub' }, `${plural(n, 'jeu', 'jeux')} · ${plural(S.lib.systems.length, 'console', 'consoles')} · ${plural((S.cfg.favorites || []).length, 'favori', 'favoris')}`)];
    }, act: () => openTab('systems') },
  };

  // ---------- Lecture en cours (Spotify, YouTube…) ----------
  const APP_NAMES = [[/spotify/i, 'Spotify'], [/chrome/i, 'Chrome'], [/msedge|edge/i, 'Edge'], [/firefox/i, 'Firefox'], [/opera/i, 'Opera'], [/brave/i, 'Brave'],
    [/deezer/i, 'Deezer'], [/vlc/i, 'VLC'], [/zunemusic|music\.ui/i, 'Lecteur multimédia'], [/discord/i, 'Discord'], [/apple/i, 'Apple Music'], [/tidal/i, 'Tidal']];
  const appName = (id) => {
    const hit = APP_NAMES.find(([re]) => re.test(id || ''));
    if (hit) return hit[1];
    const raw = String(id || '');
    const part = raw.includes('!') ? raw.split('!').pop() : raw.split(/[\\/]/).pop().replace(/\.exe$/i, '');
    return part.replace(/_[a-z0-9]{8,}$/i, '').replace(/^App$/i, 'Lecteur') || 'Lecteur';
  };
  function mediaBody() {
    const m = S.media;
    if (!api.media) return [h('div', { class: 'w-big' }, '🎧'), h('div', { class: 'w-sub' }, 'Disponible dans l’application')];
    if (m === undefined) setTimeout(pollMedia, 0); // premier affichage : on lit l'état tout de suite
    if (!m || !m.active) return [h('div', { class: 'w-big' }, '🎧'), h('div', { class: 'w-sub' }, 'Rien en lecture (Spotify, YouTube…)')];
    const playing = m.status === 'Playing';
    const btn = (label, cmd, extra = '') => h('button', { class: 'w-mbtn ' + extra, onClick: (e) => { e.stopPropagation(); mediaCmd(cmd); } }, label);
    return [h('div', { class: 'w-np' },
      m.thumb ? h('img', { class: 'w-np-cover', src: api.mediaUrl(m.thumb), alt: '' }) : h('div', { class: 'w-np-cover empty' }, playing ? h('span', { class: 'w-eq' }, h('i'), h('i'), h('i')) : '♪'),
      h('div', { class: 'w-np-text' },
        h('b', {}, m.title || 'Sans titre'),
        h('div', { class: 'w-sub' }, [m.artist, appName(m.app)].filter(Boolean).join(' · ')),
        h('div', { class: 'w-np-ctrl' }, btn('⏮', 'prev'), btn(playing ? '⏸' : '▶', 'toggle', 'main'), btn('⏭', 'next'))))];
  }
  function refreshMediaWidget() {
    const card = document.querySelector('.widget.wg-nowplaying');
    if (!card) return;
    const bg = card.querySelector('.w-bgimg img');
    const thumb = S.media && S.media.active && S.media.thumb ? api.mediaUrl(S.media.thumb) : null;
    if ((bg ? bg.getAttribute('src') : null) !== thumb) {
      if (bg && thumb) bg.setAttribute('src', thumb);
      else if (!bg && thumb) { card.classList.add('has-bg'); card.prepend(h('div', { class: 'w-bgimg' }, h('img', { src: thumb, alt: '' }))); }
      else if (bg && !thumb) { bg.parentElement.remove(); card.classList.remove('has-bg'); }
    }
    const el = card.querySelector('.w-body');
    if (el) el.replaceChildren(...mediaBody());
  }
  async function pollMedia() {
    if (!api.media || S.mediaBusy) return;
    S.mediaBusy = true;
    try { S.media = await api.media('state'); } catch { S.media = null; }
    S.mediaBusy = false;
    refreshMediaWidget();
    updateMusic();
  }
  async function mediaCmd(cmd) {
    if (!api.media) return;
    sfx('select');
    await api.media(cmd);
    setTimeout(pollMedia, 350);
  }
  // Suivi toutes les 3 s tant que le widget est affiché à l'accueil.
  setInterval(() => { if (S.cfg && S.route.view === 'home' && homeCfg().widgets.includes('nowplaying') && document.hasFocus()) pollMedia(); }, 3000);

  // ---------- Roulette : un jeu au hasard, façon machine à sous ----------
  const rollCfg = () => S.cfg.roll || (S.cfg.roll = { scope: 'installed', nsfw: false });
  function openRoll(systemId) {
    const rc = rollCfg();
    if (systemId === undefined) systemId = rc.systemId || null;
    const pool = S.lib.systems.filter((x) => !x.apps && (!systemId || x.id === systemId)).flatMap((x) => x.games)
      .filter((g) => g.cover && (rc.scope === 'all' || (rc.scope === 'missing' ? g.installed === false : g.installed !== false)) && (rc.nsfw || !g.adult));
    // Options en haut de la roulette.
    const SCOPES = { installed: 'Installés', missing: 'À télécharger', all: 'Tous les jeux' };
    const reroll = async () => { await saveCfg(); closeOverlay(true); openRoll(rc.systemId || null); };
    const opt = (label, act) => focusable(h('div', { class: 'chip' }, label), { a: act, focus: () => setHints('action') });
    const options = h('div', { class: 'roll-options' },
      opt(`📦 ${SCOPES[rc.scope] || SCOPES.installed}`, () => { const k = Object.keys(SCOPES); rc.scope = k[(k.indexOf(rc.scope) + 1) % k.length]; reroll(); }),
      opt(rc.nsfw ? '🔞 NSFW inclus' : '🚫 Sans NSFW', () => { rc.nsfw = !rc.nsfw; reroll(); }),
      opt(`🎮 ${systemId ? (S.lib.systems.find((x) => x.id === systemId) || {}).name || 'Console' : 'Toutes les consoles'}`, () => openMenu('Roulette sur', [
        ['Toutes les consoles', () => { rc.systemId = null; reroll(); }],
        ...S.lib.systems.filter((x) => !x.apps).map((x) => [x.name, () => { rc.systemId = x.id; reroll(); }])])));
    if (pool.length < 2) {
      openOverlay(h('div', { class: 'modal roll' }, h('div', { class: 'eyebrow' }, '🎲 Jeu au hasard'), h('h2', {}, 'Pas assez de jeux avec ces options'), options));
      return;
    }
    const pick = () => pool[Math.floor(Math.random() * pool.length)];
    const STOP = 34;
    const items = Array.from({ length: STOP + 4 }, pick);
    const winner = items[STOP];
    const strip = h('div', { class: 'roll-strip' }, items.map((g, i) => h('div', { class: 'roll-item' + (i === STOP ? ' winner' : '') }, h('img', { src: api.mediaUrl(g.cover), alt: '' }))));
    const title = h('h2', { class: 'roll-title' }, 'La roulette tourne…');
    const actions = h('div', { class: 'actions roll-actions' });
    const box = h('div', { class: 'modal roll' }, h('div', { class: 'eyebrow' }, '🎲 Jeu au hasard'), options, title,
      h('div', { class: 'roll-window' }, h('div', { class: 'roll-marker' }), strip), actions);
    openOverlay(box);
    const step = 172; // largeur d'une case + espace
    requestAnimationFrame(() => {
      const center = box.querySelector('.roll-window').clientWidth / 2 - 80;
      strip.style.transform = `translateX(${center}px)`;
      requestAnimationFrame(() => {
        strip.classList.add('spin');
        strip.style.transform = `translateX(${center - STOP * step}px)`;
      });
    });
    // Tic-tac qui ralentit, comme une vraie roue.
    let t = 0;
    for (let i = 0; i < 26; i++) { t += 40 + i * i * 0.55; setTimeout(() => { if (box.isConnected) sfx('move'); }, t); }
    setTimeout(() => {
      if (!box.isConnected) return;
      sfx('launch');
      Input.rumble && Input.rumble(0.5, 140);
      strip.querySelector('.winner').classList.add('won');
      title.textContent = winner.name;
      const sys = sysById(winner.system);
      actions.append(
        actionButton('▶ Jouer', () => { closeOverlay(true); launch(winner); }, true),
        actionButton('Détails', () => { closeOverlay(true); openDetails(winner); }),
        actionButton('🎲 Relancer', () => openRoll(systemId)),
        sys ? h('span', { class: 'muted small' }, sys.name) : null);
      const first = actions.querySelector('.f');
      if (first) setFocus(first, { silent: true });
    }, 3600);
  }

  const WIDGET_ICONS = { clock: '🕒', weather: '🌤️', achievements: '🏆', playtime: '⏱️', music: '🎵', nowplaying: '🎧', favorites: '⭐', surprise: '🎲', note: '📝', stats: '📚' };
  function widgetCard(id) {
    const w = WIDGETS[id];
    let body;
    try { body = w.render(); } catch { body = [h('div', { class: 'w-sub' }, 'Indisponible')]; }
    let bgSrc = null;
    try { bgSrc = w.bg ? w.bg() : null; } catch { bgSrc = null; }
    const card = focusable(h('div', { class: 'widget wg-' + id + (homeCfg().wide[id] ? ' wide' : '') + (bgSrc ? ' has-bg' : '') },
      bgSrc ? h('div', { class: 'w-bgimg' }, h('img', { src: api.mediaUrl(bgSrc), alt: '' })) : null,
      h('div', { class: 'w-head' }, h('span', { class: 'w-ico' }, WIDGET_ICONS[id] || '•'), h('span', { class: 'w-title' }, w.name)),
      h('div', { class: 'w-body' }, ...body)), {
      a: w.act || (() => openHomeEditor()),
      x: w.x,
      y: w.y,
      focus: () => { setTitle(w.name, 'Widget'); setHints('action'); },
    });
    if (S.homeEdit) makeDraggable(card, 'widget', id);
    return card;
  }

  async function loadWeather() {
    if (S.weatherLoading || !api.weather) return;
    S.weatherLoading = true;
    S.weather = await api.weather(S.cfg.weatherCity);
    S.weatherLoading = false;
    if (S.route.view === 'home' && !S.overlay) rerender();
  }
  // L'horloge du widget suit l'heure sans redessiner l'accueil.
  setInterval(() => {
    const el = document.querySelector('[data-clock]');
    if (el) el.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }, 15000);
  setInterval(() => { S.weather = null; }, 20 * 60 * 1000);

  // ---------- Fond d'écran ----------
  const WALL_THEMES = {
    aurore: { name: 'Aurore', css: 'linear-gradient(125deg, #0f1b4d, #0d7a7a 30%, #5b2bb5 60%, #1e3a8a 85%, #0f766e)' },
    coucher: { name: 'Coucher de soleil', css: 'linear-gradient(160deg, #2e1065, #9d174d 40%, #ea580c 75%, #fbbf24)' },
    ocean: { name: 'Océan', css: 'linear-gradient(170deg, #0c1e5b, #1d4ed8 40%, #0891b2 75%, #67e8f9)' },
    foret: { name: 'Forêt', css: 'linear-gradient(160deg, #052e16, #166534 40%, #15803d 70%, #a3e635)' },
    nuit: { name: 'Nuit étoilée', css: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.9) 0 1px, transparent 2px) 0 0 / 140px 140px, radial-gradient(circle at 70% 60%, rgba(255,255,255,0.7) 0 1px, transparent 2px) 0 0 / 220px 220px, linear-gradient(180deg, #05060f, #111a3b)' },
    synthwave: { name: 'Synthwave', css: 'linear-gradient(transparent 62%, rgba(236,72,153,0.35) 62.3%, transparent 63%), repeating-linear-gradient(90deg, rgba(236,72,153,0.28) 0 1px, transparent 1px 70px), linear-gradient(180deg, #120428, #3b0764 55%, #9d174d 62%, #1e0336 63%)' },
    sakura: { name: 'Sakura', css: 'linear-gradient(150deg, #4a044e, #be185d 45%, #f472b6 80%, #fbcfe8)' },
  };
  const wallCfg = () => S.cfg.wallpaper || (S.cfg.wallpaper = { mode: 'auto', theme: 'aurore', image: '', dim: 0.25, gameArt: false });
  function applyWallpaper() {
    const w = wallCfg();
    let el = document.getElementById('wallpaper');
    if (!el) { el = h('div', { id: 'wallpaper' }); const bg = document.getElementById('bg'); if (bg) bg.prepend(el); }
    document.body.classList.toggle('wp-on', w.mode !== 'auto');
    // « Images des jeux par-dessus » : le fond perso reste visible quand rien n'est sélectionné.
    document.body.classList.toggle('wp-fixed', w.mode !== 'auto' && !w.gameArt);
    document.documentElement.style.setProperty('--wp-dim', String(w.dim ?? 0.25));
    if (w.mode === 'image' && w.image) el.style.background = `center / cover no-repeat url("${api.mediaUrl(w.image)}")`;
    else if (w.mode === 'theme') el.style.background = (WALL_THEMES[w.theme] || WALL_THEMES.aurore).css;
    else el.style.background = '';
    el.dataset.theme = w.mode === 'theme' ? w.theme : '';
  }

  // Styles tout prêts : fond, couleur, widgets et ordre de l'accueil en un clic.
  const STYLE_PRESETS = {
    portable: { name: 'Console portable (3DS)', desc: 'Horloge, météo, jeu surprise et mémo en haut, couleurs douces.', accent: '#5eead4',
      wall: { mode: 'theme', theme: 'ocean', dim: 0.35 }, widgets: ['clock', 'weather', 'surprise', 'note'], wide: {},
      order: ['widgets', 'recent', 'systems', 'folders', 'hero', 'favorites', 'discover'], blocks: { hero: false, recent: true, favorites: true, systems: true, folders: true, discover: true } },
    salon: { name: 'Salon (Switch)', desc: 'Gros bandeau du jeu en cours et jeux récents d’abord, peu de widgets.', accent: '#fb7185',
      wall: { mode: 'auto' }, widgets: ['nowplaying', 'achievements'], wide: { nowplaying: true, achievements: true },
      order: ['hero', 'recent', 'widgets', 'systems', 'favorites', 'folders', 'discover'], blocks: { hero: true, recent: true, favorites: false, systems: true, folders: true, discover: true } },
    nextgen: { name: 'Next-gen (PS5)', desc: 'Images des jeux en fond, rang et musique en cours, tout en grand.', accent: '#60a5fa',
      wall: { mode: 'auto' }, widgets: ['achievements', 'nowplaying', 'surprise'], wide: { nowplaying: true },
      order: ['hero', 'widgets', 'recent', 'favorites', 'systems', 'folders', 'discover'], blocks: { hero: true, recent: true, favorites: true, systems: true, folders: true, discover: true } },
    synthwave: { name: 'Rétro synthwave', desc: 'Grille néon animée, rose et violet.', accent: '#f472b6',
      wall: { mode: 'theme', theme: 'synthwave', dim: 0.15 }, widgets: ['clock', 'nowplaying', 'surprise', 'achievements'], wide: {},
      order: ['widgets', 'hero', 'recent', 'systems', 'favorites', 'folders', 'discover'], blocks: { hero: true, recent: true, favorites: false, systems: true, folders: true, discover: true } },
    minimal: { name: 'Minimal', desc: 'Pas de widgets ni de bandeau : seulement tes jeux.', accent: '#a78bfa',
      wall: { mode: 'theme', theme: 'nuit', dim: 0.4 }, widgets: [], wide: {},
      order: ['recent', 'favorites', 'systems', 'folders', 'discover', 'widgets', 'hero'], blocks: { hero: false, recent: true, favorites: true, systems: true, folders: true, discover: false } },
  };
  async function applyStylePreset(id) {
    const p = STYLE_PRESETS[id];
    if (!p) return;
    const home = homeCfg();
    Object.assign(home, { widgets: p.widgets.slice(), wide: { ...p.wide }, order: p.order.slice(), blocks: { ...home.blocks, ...p.blocks } });
    Object.assign(wallCfg(), p.wall);
    S.cfg.accent = p.accent;
    applyCfg();
    applyWallpaper();
    await saveCfg();
    S.dirty = true;
    toast(`Style « ${p.name} » appliqué`);
  }

  function openHomeEditor(focusLabel) {
    const home = homeCfg();
    const w = wallCfg();
    const rows = [];
    const add = (label, value, act, desc, extra = {}) => rows.push(focusable(h('div', { class: 'set-row' },
      h('div', { class: 'set-text' }, h('div', { class: 'set-label' }, label), desc ? h('div', { class: 'set-desc' }, desc) : null),
      h('div', { class: 'set-value' }, value)), { a: act, x: extra.x, y: extra.y, focus: () => setHints('settings') }));
    const reopen = async (label) => { await saveCfg(); applyWallpaper(); S.dirty = true; openHomeEditor(label); };
    const tog = (on) => h('span', { class: 'toggle' + (on ? ' on' : '') });
    const section = (t) => rows.push(h('div', { class: 'set-section' }, t));

    section('Styles tout prêts');
    for (const [id, p] of Object.entries(STYLE_PRESETS)) add(p.name, 'Appliquer', async () => { await applyStylePreset(id); openHomeEditor(p.name); }, p.desc);

    section('Fond d’écran');
    const MODES = { auto: 'Automatique (image du jeu)', theme: 'Thème animé', image: 'Mon image' };
    add('Type de fond', MODES[w.mode] || MODES.auto, () => openMenu('Type de fond', Object.entries(MODES).map(([id, label]) => [label, async () => {
      if (id === 'image' && !w.image) {
        const file = api.pickImage && await api.pickImage('Image de fond');
        if (!file) return openHomeEditor('Type de fond');
        w.image = file;
      }
      w.mode = id;
      reopen('Type de fond');
    }])));
    if (w.mode === 'theme') add('Thème', (WALL_THEMES[w.theme] || WALL_THEMES.aurore).name, () => openMenu('Thème', Object.entries(WALL_THEMES).map(([id, t]) => [t.name, () => { w.theme = id; reopen('Thème'); }])));
    if (w.mode === 'image') add('Image', w.image ? w.image.split(/[\\/]/).pop() : 'Aucune', async () => {
      const file = api.pickImage && await api.pickImage('Image de fond');
      if (!file) return;
      w.image = file;
      reopen('Image');
    });
    if (w.mode !== 'auto') {
      add('Images des jeux par-dessus', tog(w.gameArt), () => { w.gameArt = !w.gameArt; reopen('Images des jeux par-dessus'); }, 'Le fond change selon le jeu sélectionné, et ton fond revient ailleurs.');
      add('Assombrir le fond', `${Math.round((w.dim ?? 0.25) * 100)} %`, () => {
        const steps = [0, 0.15, 0.25, 0.4, 0.55, 0.7];
        w.dim = steps[(steps.indexOf(w.dim ?? 0.25) + 1) % steps.length];
        reopen('Assombrir le fond');
      }, 'Pour garder le texte lisible.');
    }

    section('Widgets');
    rows.push(h('p', { class: 'muted small', style: 'margin: 0 6px 6px' }, 'A : activer ou retirer · X : monter · Y : descendre'));
    const ordered = [...home.widgets.filter((id) => WIDGETS[id]), ...Object.keys(WIDGETS).filter((id) => !home.widgets.includes(id))];
    for (const id of ordered) {
      const on = home.widgets.includes(id);
      const move = (d) => {
        const i = home.widgets.indexOf(id);
        if (i < 0) return;
        const j = i + d;
        if (j < 0 || j >= home.widgets.length) return;
        [home.widgets[i], home.widgets[j]] = [home.widgets[j], home.widgets[i]];
        reopen(WIDGETS[id].name);
      };
      add(WIDGETS[id].name, on ? h('span', {}, `n°${home.widgets.indexOf(id) + 1}${home.wide[id] ? ' · large' : ''} `, tog(true)) : tog(false), () => {
        if (!on) { home.widgets.push(id); return reopen(WIDGETS[id].name); }
        openMenu(WIDGETS[id].name, [
          ['Retirer de l’accueil', () => { home.widgets = home.widgets.filter((x) => x !== id); reopen(WIDGETS[id].name); }],
          [home.wide[id] ? 'Taille normale' : 'Grand (double largeur)', () => { home.wide[id] = !home.wide[id]; reopen(WIDGETS[id].name); }],
          ['↑ Monter', () => move(-1)], ['↓ Descendre', () => move(1)],
        ]);
      }, null, { x: () => move(-1), y: () => move(1) });
    }

    section('Blocs de l’accueil');
    for (const [id, label] of HOME_BLOCKS) add(label, tog(home.blocks[id]), () => { home.blocks[id] = !home.blocks[id]; reopen(label); });

    section('Ordre de l’accueil');
    rows.push(h('p', { class: 'muted small', style: 'margin: 0 6px 6px' }, 'X : monter · Y : descendre · ou « Réorganiser à la souris » depuis le menu de l’accueil'));
    for (const b of Object.keys(HOME_ORDER_NAMES)) if (!home.order.includes(b)) home.order.push(b);
    home.order.forEach((id, i) => {
      const moveBlock = (d) => {
        const j = i + d;
        if (j < 0 || j >= home.order.length) return;
        [home.order[i], home.order[j]] = [home.order[j], home.order[i]];
        reopen(`${j + 1}. ${HOME_ORDER_NAMES[home.order[j]]}`);
      };
      add(`${i + 1}. ${HOME_ORDER_NAMES[id]}`, '⇅', () => openMenu(HOME_ORDER_NAMES[id], [['↑ Monter', () => moveBlock(-1)], ['↓ Descendre', () => moveBlock(1)]]), null,
        { x: () => moveBlock(-1), y: () => moveBlock(1) });
    });

    openOverlay(h('div', { class: 'modal art-editor profile-editor' },
      h('div', { class: 'eyebrow' }, 'Personnaliser'), h('h2', {}, 'Accueil et fond d’écran'), ...rows));
    if (focusLabel) {
      const el = rows.find((r) => r.querySelector && r.querySelector('.set-label') && r.querySelector('.set-label').textContent === focusLabel);
      if (el) setFocus(el, { silent: true });
    }
  }

  // Fabricant et année d'une console (fiches de systems.js ; les launchers PC ont les leurs).
  const PC_META = { 'pc-steam': ['Valve', 2003], 'pc-epic': ['Epic Games', 2018], 'pc-gog': ['CD Projekt', 2008] };
  function sysMetaOf(s) {
    const d = (S.defs || []).find((x) => x.id === s.id);
    if (d && d.maker) return { maker: d.maker, year: d.year };
    const p = PC_META[s.id];
    return p ? { maker: p[0], year: p[1] } : null;
  }
  const sysMeta = (s) => { const m = sysMetaOf(s); return m ? [m.maker, m.year].filter(Boolean).join(' · ') : ''; };
  const SYS_SORTS = [['default', 'Ordre de la bibliothèque'], ['name', 'Nom'], ['maker', 'Fabricant'], ['year', 'Année'], ['count', 'Nombre de jeux']];
  function sortedSystems() {
    const mode = S.cfg.sysSort || 'default';
    const list = [...S.lib.systems];
    const meta = (s) => sysMetaOf(s) || {};
    if (mode === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (mode === 'maker') list.sort((a, b) => (meta(a).maker || 'zz').localeCompare(meta(b).maker || 'zz') || (meta(a).year || 9999) - (meta(b).year || 9999));
    if (mode === 'year') list.sort((a, b) => (meta(a).year || 9999) - (meta(b).year || 9999));
    if (mode === 'count') list.sort((a, b) => b.games.length - a.games.length);
    return list;
  }

  function addSystemCard() {
    return focusable(h('div', { class: 'syscard add-sys' }, h('div', { class: 'folder-plus' }, '＋'), h('div', { class: 'sys-name' }, 'Ajouter une console', h('span', { class: 'sys-meta' }, 'PS3, Xbox, Amiga, DOS…'))), {
      a: () => addCustomSystem(),
      focus: () => { setTitle('Ajouter une console', 'Une plateforme que Lumen ne connaît pas'); setHints('action'); setBackground(null); },
    });
  }

  // Assistant : nom, dossier des jeux, extensions, émulateur.
  async function addCustomSystem(existing) {
    const c = existing ? { ...existing } : { id: 'custom-' + Date.now().toString(36), color: ACCENTS[Math.floor(Math.random() * ACCENTS.length)] };
    const name = await openPrompt({ title: 'Nom de la console', value: c.name || '', help: 'Par exemple PlayStation 3, Xbox 360, Amiga, MS-DOS…' });
    if (name === null || !name.trim()) return;
    c.name = name.trim();
    const short = await openPrompt({ title: 'Nom court', value: c.short || c.name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 4) || c.name.slice(0, 4), help: 'Le badge sur les jaquettes : PS3, X360, AMI…' });
    if (short === null) return;
    c.short = short.trim() || c.name.slice(0, 4);
    const dir = await api.pickFolder(`Dossier des jeux · ${c.name}`, c.dir);
    if (!dir) { if (!existing) return; } else c.dir = dir;
    const ext = await openPrompt({ title: 'Extensions des jeux', value: (c.ext || []).join(', '), help: 'Séparées par des virgules : iso, chd, pkg, adf, exe… Vide = tous les fichiers.' });
    if (ext === null) return;
    c.ext = ext.split(/[,\s;]+/).map((x) => x.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
    const exe = await api.pickFile(`Émulateur pour ${c.name} (Annuler = ouvrir avec Windows)`, '');
    if (exe) {
      const args = await openPrompt({ title: 'Options de lancement', value: c.args || '"{rom}"', help: 'Ce qui suit l’émulateur. {rom} = le jeu. Exemples : "{rom}" · -f "{rom}" · -L "C:\\cores\\core.dll" "{rom}"' });
      if (args === null) return;
      c.args = args.trim() || '"{rom}"';
      c.command = `"${exe}" ${c.args}`;
    } else if (!c.command) c.command = '{open}';
    const list = (S.cfg.customSystems || (S.cfg.customSystems = [])).filter((x) => x.id !== c.id);
    list.push(c);
    S.cfg.customSystems = list;
    await saveCfg();
    S.defs = await api.systems();
    applyLib(await api.scan({ romm: false }));
    const n = ((S.lib.systems.find((x) => x.id === c.id) || {}).games || []).length;
    toast(n ? `${c.name} : ${plural(n, 'jeu trouvé', 'jeux trouvés')}` : `${c.name} ajoutée, mais aucun jeu trouvé avec ces extensions`, n ? 'info' : 'error', 5000);
    rerender();
  }
  async function removeCustomSystem(id) {
    S.cfg.customSystems = (S.cfg.customSystems || []).filter((x) => x.id !== id);
    await saveCfg();
    S.defs = await api.systems();
    applyLib(await api.scan({ romm: false }));
    toast('Console retirée (tes fichiers ne sont pas touchés)');
    rerender();
  }

  async function renameSystem(s) {
    const names = S.cfg.sysNames || (S.cfg.sysNames = {});
    const v = await openPrompt({ title: 'Nom de la console', value: s.name, help: `Par exemple « Switch » au lieu de « Nintendo Switch ». Vide = nom d’origine${s.origName ? ' (' + s.origName + ')' : ''}.` });
    if (v === null) return;
    const short = await openPrompt({ title: 'Nom court (badge)', value: s.short, help: 'Le petit nom sur les jaquettes et les cartes : NS, 3DS, PS1… Vide = celui d’origine.' });
    if (v.trim() || (short && short.trim())) names[s.id] = { name: v.trim() || undefined, short: short && short.trim() ? short.trim() : undefined };
    else delete names[s.id];
    await saveCfg();
    applyLib(await api.scan({ romm: false }));
    rerender();
    toast('Console renommée');
  }

  function viewSystems() {
    if (!S.lib.systems.length) return emptyLibrary();
    return h('div', {},
      h('div', { class: 'view-head' }, h('div', { class: 'vh-text' },
        h('h1', {}, 'Consoles'),
        h('p', { class: 'muted' }, `${plural(S.lib.systems.length, 'console', 'consoles')} · ${plural(totalGames(), 'jeu', 'jeux')}`)),
        focusable(h('div', { class: 'chip' }, '⇅ ', (SYS_SORTS.find(([id]) => id === (S.cfg.sysSort || 'default')) || SYS_SORTS[0])[1]), {
          a: () => { const i = SYS_SORTS.findIndex(([id]) => id === (S.cfg.sysSort || 'default')); S.cfg.sysSort = SYS_SORTS[(i + 1) % SYS_SORTS.length][0]; saveCfg(); S.keepAnim = true; render(indexOfFocus()); },
          focus: () => { setTitle('Trier les consoles', ''); setHints('action'); },
        })),
      h('div', { class: 'grid systems' }, sortedSystems().map(systemCard), addSystemCard()));
  }

  function sortChip() {
    return focusable(h('div', { class: 'chip' }, '⇅ ', sortLabel()), {
      a: () => cycleSort(),
      focus: () => { setTitle('Trier par', sortLabel()); setHints('action'); },
    });
  }

  function viewGames(id, focusIndex) {
    const s = S.lib.systems.find((x) => x.id === id);
    if (!s) return emptyLibrary();
    const shown = applyFilter(s.games, filterOf(s.id));
    const grid = fillGrid(h('div', { class: 'grid', 'data-letters': '1' }), sortGames(shown), focusIndex);
    const art = platformArt(s.id);
    return h('div', {},
      art.hero ? h('div', { class: 'sys-banner' }, h('img', { src: api.mediaUrl(art.hero), alt: '' })) : null,
      h('div', { class: 'view-head' },
        art.icon
          ? h('img', { class: 'vh-icon', src: api.mediaUrl(art.icon), alt: '' })
          : h('div', { class: 'vh-badge', '--c': s.color }, s.short),
        h('div', { class: 'vh-text' }, h('h1', {}, s.name), h('p', { class: 'muted' }, shown.length === s.games.length ? plural(s.games.length, 'jeu', 'jeux') : `${shown.length} / ${plural(s.games.length, 'jeu', 'jeux')}`)),
        filterChip(s),
        sortChip()),
      grid);
  }

  function collectionsList() {
    const list = [{ id: '★', name: 'Favoris', paths: S.cfg.favorites }];
    for (const [name, paths] of Object.entries(S.cfg.collections || {})) list.push({ id: name, name, paths });
    return list;
  }

  // ---------- Dossiers ----------
  const folderGames = (c) => c.paths.map((p) => S.byPath.get(p)).filter(Boolean);
  const folderName = (id) => (id === '★' ? 'Favoris' : id);

  function folderTile(c) {
    const games = folderGames(c);
    const color = folderColor(c.id);
    const minis = h('div', { class: 'folder-minis' }, [0, 1, 2, 3].map((i) => {
      const g = games[i];
      if (!g) return h('div', { class: 'mini empty' });
      const sys = sysById(g.system);
      return h('div', { class: 'mini' }, g.cover
        ? h('img', { src: api.mediaUrl(g.cover), loading: 'lazy', alt: '', draggable: 'false' })
        : fallbackArt(g.name, sys && sys.color));
    }));
    const cArt = (S.lib.collectionArt || {})[c.id === '★' ? 'Favoris' : c.name];
    const el = h('div', { class: 'folder' + (cArt && cArt.icon ? ' has-icon' : ''), '--fc': color },
      h('div', { class: 'folder-back' }),
      cArt && cArt.icon ? h('div', { class: 'folder-icon' }, h('img', { src: api.mediaUrl(cArt.icon), alt: '', draggable: 'false' })) : minis,
      h('div', { class: 'folder-front' }, h('span', { class: 'folder-name' }, c.id === '★' ? '★ Favoris' : c.name), h('span', { class: 'folder-count' }, String(games.length))));
    el._folder = c.id;
    return focusable(el, {
      a: () => { sfx('enter'); go({ view: 'folder', id: c.id }); },
      focus: () => {
        setTitle(folderName(c.id), plural(games.length, 'jeu', 'jeux'));
        setBackground(cArt && cArt.hero ? cArt.hero : games[0] ? games[0].background || games[0].cover : null, color);
        setHints('system');
      },
    });
  }

  function newFolderTile() {
    return focusable(h('div', { class: 'folder new' }, h('div', { class: 'folder-plus' }, '＋'), h('div', { class: 'folder-name' }, 'Nouveau dossier')), {
      a: () => createCollection(),
      focus: () => { setTitle('Nouveau dossier'); setHints('action'); },
    });
  }

  function viewFavorites() {
    const cols = collectionsList();
    return h('div', {},
      h('div', { class: 'view-head' },
        h('div', { class: 'vh-text' }, h('h1', {}, 'Dossiers'), h('p', { class: 'muted' }, 'Range tes jeux comme tu veux : un jeu peut être dans plusieurs dossiers.'))),
      h('div', { class: 'grid folders' }, cols.map(folderTile), newFolderTile()));
  }

  function viewFolder(id, focusIndex) {
    const c = collectionsList().find((x) => x.id === id);
    if (!c) return emptyLibrary();
    const games = folderGames(c);
    const color = folderColor(id);
    const head = h('div', { class: 'view-head' },
      h('div', { class: 'vh-folder', '--fc': color }, h('span', {}, id === '★' ? '★' : (id[0] || '?').toUpperCase())),
      h('div', { class: 'vh-text' }, h('h1', {}, folderName(id)), h('p', { class: 'muted' }, plural(games.length, 'jeu', 'jeux'))));
    if (!games.length) {
      return h('div', {}, head, h('div', { class: 'empty' },
        h('h2', {}, 'Dossier vide'),
        h('p', {}, id === '★'
          ? `Appuie sur ${Input.lastDevice === 'keyboard' ? 'F' : 'X'} sur un jeu pour l’ajouter aux favoris.`
          : 'Ouvre le menu rapide (☰) sur un jeu et choisis « Ranger dans un dossier ».')));
    }
    return h('div', { class: 'folder-view', '--fc': color }, head, fillGrid(h('div', { class: 'grid' }), games, focusIndex, id));
  }

  // ---------- Recherche ----------
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function searchGames(q) {
    const words = fold(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const s of S.lib.systems) {
      if (S.searchSys && s.id !== S.searchSys) continue;
      for (const g of s.games) {
        const name = g._fold || (g._fold = fold(g.name));
        if (words.every((w) => name.includes(w))) out.push(g);
      }
    }
    const first = words[0];
    out.sort((a, b) => (b._fold.startsWith(first) - a._fold.startsWith(first)) || a.name.localeCompare(b.name));
    return out.slice(0, 200);
  }

  function vkeyboard(onKey, mode) {
    const rows = mode === 'url'
      ? ['1234567890', 'azertyuiop', 'qsdfghjklm', 'wxcvbn.:/_', '-@?=&#']
      : ['1234567890', 'AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN-\'&:'];
    const kb = h('div', { class: 'vkb' });
    for (const r of rows) {
      kb.append(h('div', { class: 'vkb-row' }, [...r].map((ch) => focusable(h('div', { class: 'key' }, ch), {
        a: () => { sfx('key'); onKey(ch); },
        focus: () => setHints('keyboard'),
      }))));
    }
    kb.append(h('div', { class: 'vkb-row' },
      focusable(h('div', { class: 'key wide' }, 'Espace'), { a: () => { sfx('key'); onKey(' '); }, focus: () => setHints('keyboard') }),
      focusable(h('div', { class: 'key wide' }, '⌫ Effacer'), { a: () => { sfx('key'); onKey('\b'); }, x: () => onKey('\b'), focus: () => setHints('keyboard') }),
      focusable(h('div', { class: 'key wide' }, 'Tout effacer'), { a: () => { sfx('key'); onKey('\u0018'); }, focus: () => setHints('keyboard') })));
    return kb;
  }

  function applyKey(value, ch, max = 200) {
    if (ch === '\b') return value.slice(0, -1);
    if (ch === '\u0018') return '';
    return (value + ch).slice(0, max);
  }

  function viewSearch() {
    S.search = S.search || '';
    const field = h('div', { class: 'search-field' + (S.search ? '' : ' empty') }, S.search || 'Tape le nom d’un jeu…');
    const results = h('div', { class: 'grid search-results' });
    const count = h('p', { class: 'muted' });
    const update = () => {
      field.textContent = S.search || 'Tape le nom d’un jeu…';
      field.classList.toggle('empty', !S.search);
      field.append(h('span', { class: 'caret' }));
      const found = searchGames(S.search);
      const wasInResults = S.focusEl && results.contains(S.focusEl);
      results.replaceChildren(...found.map((g) => gameTile(g)));
      // La tuile sélectionnée a disparu : on replace le focus au lieu de laisser un cadre vide.
      if (wasInResults && results.isConnected) {
        const target = results.querySelector('.tile') || results.parentNode.querySelector('.vkb .key.wide:last-child');
        if (target) setFocus(target, { silent: true });
      }
      count.textContent = S.search ? (found.length ? plural(found.length, 'résultat', 'résultats') : 'Aucun résultat') : `${plural(totalGames(), 'jeu', 'jeux')} dans ta bibliothèque`;
    };
    S.searchType = (ch) => { S.search = applyKey(S.search, ch, 60); update(); };
    update();
    // Filtre par console : la puce fait défiler « Toutes » puis chaque console.
    const sysLabel = () => (S.searchSys ? (S.lib.systems.find((x) => x.id === S.searchSys) || {}).name || 'Toutes les consoles' : 'Toutes les consoles');
    const sysChip = focusable(h('div', { class: 'chip' + (S.searchSys ? ' active' : '') }, '⏷ ', sysLabel()), {
      a: () => openMenu('Chercher dans', [['Toutes les consoles', () => { S.searchSys = null; closeOverlay(true); render(0); }],
        ...S.lib.systems.map((x) => [`${x.name} (${x.games.length})`, () => { S.searchSys = x.id; closeOverlay(true); render(0); }])]),
      focus: () => { setTitle('Chercher dans', sysLabel()); setHints('action'); },
    });
    return h('div', { class: 'search' },
      h('div', { class: 'search-top' },
        h('div', { class: 'search-box' }, icon('search'), field),
        count, sysChip),
      vkeyboard((ch) => S.searchType(ch)),
      results);
  }

  // Saisie au clavier physique dans la recherche (avant les raccourcis de navigation).
  window.addEventListener('keydown', (ev) => {
    if (!S.cfg || S.overlay || S.route.view !== 'search' || ev.ctrlKey || ev.altKey) return;
    if (!S.search && /^[qe]$/i.test(ev.key)) return; // champ vide : Q / E restent « onglet précédent / suivant »
    if (ev.key === 'Backspace' || (ev.key.length === 1 && /[\p{L}\p{N} '\-&:]/u.test(ev.key))) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      S.searchType(ev.key === 'Backspace' ? '\b' : ev.key.toUpperCase());
    }
  }, true);

  // ---------- Saut par lettre (LT / RT) ----------
  function letterOf(g) {
    const c = fold(g.name).charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : '#';
  }
  function jumpLetter(dir) {
    const grid = S.focusEl && S.focusEl.closest('.grid');
    if (!grid || !S.focusEl._game) return;
    if (grid._flush) grid._flush();
    const tiles = [...grid.querySelectorAll('.tile')];
    const i = tiles.indexOf(S.focusEl);
    let target;
    if ((S.cfg.sort || 'name') === 'name' && grid.dataset.letters) {
      const cur = letterOf(S.focusEl._game);
      if (dir > 0) target = tiles.slice(i + 1).find((t) => letterOf(t._game) !== cur);
      else {
        const prevStart = tiles.slice(0, i).reverse().find((t) => letterOf(t._game) !== cur);
        if (prevStart) { const L = letterOf(prevStart._game); target = tiles.find((t) => letterOf(t._game) === L); }
      }
      if (!target) target = dir > 0 ? tiles[tiles.length - 1] : tiles[0];
      showLetter(letterOf(target._game));
    } else {
      target = tiles[Math.max(0, Math.min(tiles.length - 1, i + dir * 24))];
    }
    if (target && target !== S.focusEl) { sfx('letter'); setFocus(target, { silent: true }); }
  }
  let letterTimer;
  function showLetter(L) {
    let el = $('#letter-pop');
    if (!el) { el = h('div', { id: 'letter-pop' }); document.body.append(el); }
    el.textContent = L;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(letterTimer);
    letterTimer = setTimeout(() => el.classList.remove('show'), 650);
  }

  const SET_CATS = [
    ['library', 'Bibliothèque', 'Dossiers, scan, jeux masqués'],
    ['pc', 'Jeux PC', 'Steam, Epic, GOG'],
    ['images', 'Images', 'iiDB, SteamGridDB, consoles'],
    ['sound', 'Son et musique', 'Volume, musique, sons'],
    ['controls', 'Manettes', 'PS4, PS5, Xbox, Switch'],
    ['emus', 'Émulateurs', 'Chemins et commandes'],
    ['accounts', 'Comptes', 'RomM, RetroAchievements'],
    ['apps', 'Applications', 'Programmes hors jeux'],
    ['display', 'Affichage', 'Plein écran, couleur, tri'],
    ['about', 'Lumen', 'Aide et sortie'],
  ];

  function viewSettings() {
    const c = S.cfg;
    S.setCat = S.setCat || 'library';
    const list = h('div', { class: 'settings' });
    let cur = null;
    const cat = (id) => { cur = id; };
    const on = () => cur === S.setCat;
    const section = (title) => { if (on()) list.append(h('div', { class: 'set-section' }, title)); };
    const row = (label, value, action, desc, warn) => {
      if (!on()) return;
      const el = h('div', { class: 'set-row' },
        h('div', { class: 'set-text' }, h('div', { class: 'set-label' }, label), desc ? h('div', { class: 'set-desc' }, desc) : null),
        h('div', { class: 'set-value' + (warn ? ' warn' : '') }, value));
      list.append(focusable(el, {
        a: action,
        focus: () => { setTitle('Réglages', label); setHints('settings'); setBackground(null); },
      }));
    };
    const toggle = (v) => h('span', { class: 'toggle' + (v ? ' on' : '') });

    const fill = () => {
    list.replaceChildren();
    cat('library');
    section('Bibliothèque');
    row('Dossier des ROMs', c.romsRoot || 'Non défini', pickRoms, 'Un sous-dossier par console : snes, gba, psx, ps2, gc…', !c.romsRoot);
    row('Médias ES-DE', c.mediaRoot || 'Non défini', () => pickPath('mediaRoot', 'Dossier downloaded_media d’ES-DE'), 'Jaquettes, captures et fonds (dossier downloaded_media).');
    row('Gamelists ES-DE', c.gamelistsRoot || 'Non défini', () => pickPath('gamelistsRoot', 'Dossier gamelists d’ES-DE'), 'Noms, descriptions, années et notes.');
    row('Rescanner la bibliothèque', plural(totalGames(), 'jeu', 'jeux'), () => rescan());
    row('Télécharger les jaquettes manquantes', 'libretro-thumbnails', () => openThumbs(), 'Jaquettes, captures, écrans-titres et logos, rangés dans <console>/media.');
    cat('images');
    section('iiDB');
    if (api.iidb) {
      const ii = c.iidb || (c.iidb = { enabled: true, priority: true });
      row('Images iiDB', toggle(ii.enabled !== false), async () => { ii.enabled = ii.enabled === false; await saveCfg(); rescan(); },
        'Jaquettes iiSU, icônes, logos, héros et soundbites de iidb.iisu.network pour les jeux, consoles et dossiers.');
      if (ii.enabled !== false) {
        row('Télécharger les images iiDB', 'Jeux, consoles, dossiers', () => openIidb(), 'Ne cherche que ce qui ne l’a jamais été. Les images sont gardées en cache.');
        row('iiDB en priorité', toggle(ii.priority !== false), async () => { ii.priority = ii.priority === false; await saveCfg(); rescan(); },
          'Activé : les images iiDB remplacent celles de Steam, ES-DE ou SteamGridDB. Désactivé : elles ne comblent que les trous.');
        row('Rechercher à nouveau les introuvables', '', () => openIidb({ retry: true }), 'Utile quand de nouvelles images ont été ajoutées sur iiDB.');
      }
    }
    cat('pc');
    section('Launchers');
    const stores = c.pcStores || (c.pcStores = { steam: true, epic: true, gog: true, steamUninstalled: true });
    for (const [id, label] of [['steam', 'Jeux Steam'], ['epic', 'Jeux Epic Games'], ['gog', 'Jeux GOG Galaxy']]) {
      row(label, toggle(stores[id] !== false), async () => { stores[id] = stores[id] === false; await saveCfg(); rescan(); },
        id === 'steam' ? 'Jeux installés sur ce PC, lancés via leur launcher.' : null);
      if (id === 'steam' && stores.steam !== false) {
        row('Jeux Steam non installés', toggle(stores.steamUninstalled !== false), async () => { stores.steamUninstalled = stores.steamUninstalled === false; await saveCfg(); rescan(); },
          'Affiche aussi les jeux du dossier stplug-in pas encore installés (badge ⬇) ; les lancer ouvre l’installation Steam.');
      }
    }
    cat('images');
    section('SteamGridDB et consoles');
    if (api.sgdb) {
      const sg = S.sgdbStatus || {};
      row('Clé SteamGridDB', sg.hasKey ? '•••••••• enregistrée' : 'Non définie', async () => {
        const v = await openPrompt({ title: 'Clé API SteamGridDB', value: '', keyboard: 'url', secret: true, help: 'Gratuite : connecte-toi sur steamgriddb.com, puis Préférences → API → générer une clé. Colle-la avec Ctrl+V. Elle est chiffrée par Windows sur ce PC.' });
        if (v === null || !v.trim()) return;
        await api.sgdb.setKey(v.trim());
        S.sgdbStatus = await api.sgdb.status();
        rerender();
      }, 'Pour les jaquettes, bannières, logos et icônes des jeux PC.');
      row('Télécharger les images des jeux PC', 'SteamGridDB', () => openSgdb(), 'Ne cherche que ce qui manque ; les images sont gardées en cache.');
    }
    row('Visuels des consoles', 'Ouvrir le dossier', () => api.openPlatformDir && api.openPlatformDir(),
      `Dépose des images dans ${c.platformDir || 'Documents\\Lumen\\Plateformes'} : icons\\, logos\\ ou heroes\\, nommées par console (snes.png, gba.png, psx.png, steam.png…). Puis « Rescanner ».`);
    cat('library');
    section('Affichage des jeux');
    row('Masquer les jeux NSFW', toggle(!!c.hideNsfw), async () => { c.hideNsfw = !c.hideNsfw; await saveCfg(); rescan(); },
      'Retire partout les jeux Steam signalés pour nudité ou contenu sexuel. Sinon, filtre-les console par console avec « Afficher ».');
    row('Jeux masqués', (c.hidden || []).length ? `${(c.hidden || []).length} · tout réafficher` : 'Aucun', async () => {
      if (!(c.hidden || []).length) return;
      c.hidden = [];
      await saveCfg();
      await rescan();
      toast('Tous les jeux sont de nouveau visibles');
    }, 'Masque un jeu depuis son menu rapide (☰).');

    if (api.ra) {
      const ra = c.retroachievements || (c.retroachievements = { username: '' });
      const st = S.raStatus || {};
      cat('accounts');
      section('RetroAchievements');
      row('Pseudo RetroAchievements', ra.username || 'Non défini', async () => {
        const v = await openPrompt({ title: 'Pseudo RetroAchievements', value: ra.username || '', keyboard: 'url' });
        if (v === null) return;
        ra.username = v.trim();
        await saveCfg();
        S.raStatus = await api.ra.status();
        loadAchievements(true);
        rerender();
      }, 'Tes succès des jeux rétro (RetroArch, etc.) dans l’onglet Succès.');
      row('Clé Web API', st.hasKey ? '•••••••• enregistrée' : 'Non définie', async () => {
        const v = await openPrompt({ title: 'Clé Web API RetroAchievements', value: '', keyboard: 'url', secret: true, help: 'Sur retroachievements.org : connecte-toi, puis Paramètres → Clé Web API. Colle-la avec Ctrl+V. Elle est chiffrée par Windows sur ce PC.' });
        if (v === null || !v.trim()) return;
        await api.ra.setKey(v.trim());
        S.raStatus = await api.ra.status();
        loadAchievements(true);
        rerender();
      }, 'Lecture seule : Lumen ne fait que lire ta progression.');
    }

    if (api.apps) {
      cat('apps');
      section('Applications');
      row('Ajouter une application', '＋', () => addApp(), 'Word, navigateur, Discord… : un programme (.exe) ou un raccourci du menu Démarrer. Elles apparaissent dans Consoles → Applications.');
      for (const a of c.apps || []) {
        row(a.name, 'Modifier', () => openMenu(a.name, appMenuItems(a.id)), a.target);
      }
    }

    if (api.romm) {
      const r = c.romm || (c.romm = {});
      const st = S.rommStatus || {};
      cat('accounts');
      section('RomM');
      row('Utiliser mon serveur RomM', toggle(r.enabled), async () => {
        r.enabled = !r.enabled;
        await saveCfg();
        if (r.enabled && r.url) await rescan(); else rerender();
      }, 'Affiche les jeux de ton serveur à côté des tiens ; un jeu se télécharge au premier lancement puis reste sur le PC.');
      row('Adresse du serveur', r.url || 'Non définie', async () => {
        const v = await openPrompt({ title: 'Adresse du serveur RomM', value: r.url || 'http://', keyboard: 'url', help: 'Par exemple http://192.168.1.20:8080 ou https://romm.mondomaine.fr' });
        if (v === null) return;
        r.url = v.trim();
        await saveCfg();
        rerender();
      }, null, r.enabled && !r.url);
      row('Jeton client (recommandé)', st.hasToken ? '•••••••• enregistré' : 'Non défini', async () => {
        const v = await openPrompt({ title: 'Jeton client RomM', value: '', keyboard: 'url', secret: true, help: 'Dans RomM : Administration → Client API Tokens → nouveau jeton (la portée « roms.read » suffit). Il commence par rmm_. Colle-le avec Ctrl+V. Il est chiffré par Windows sur ce PC.' });
        if (v === null || !v.trim()) return;
        await api.romm.setSecret('token', v.trim());
        await refreshRommStatus();
        rerender();
        testRomm();
      }, 'Ou bien identifiant + mot de passe ci-dessous.');
      row('Identifiant', r.username || 'Non défini', async () => {
        const v = await openPrompt({ title: 'Identifiant RomM', value: r.username || '', keyboard: 'url' });
        if (v === null) return;
        r.username = v.trim();
        await saveCfg();
        rerender();
      });
      row('Mot de passe', st.hasPassword ? '•••••••• enregistré' : 'Non défini', async () => {
        const v = await openPrompt({ title: 'Mot de passe RomM', value: '', keyboard: 'url', secret: true, help: 'Chiffré par Windows sur ce PC. Le jeton client est préférable : il peut être révoqué sans changer ton mot de passe.' });
        if (v === null || !v) return;
        await api.romm.setSecret('password', v);
        await refreshRommStatus();
        rerender();
      });
      row('Tester la connexion', S.rommTest || '', () => testRomm());
      row('Synchroniser maintenant', S.lib.romm ? plural(S.lib.romm.count, 'jeu RomM', 'jeux RomM') : '', () => rescan(), S.lib.romm && S.lib.romm.error ? `Dernière erreur : ${S.lib.romm.error}` : null, !!(S.lib.romm && S.lib.romm.error));
      row('Dossier des jeux téléchargés', r.downloadDir || 'Non défini', async () => {
        const p = await api.pickFolder('Où ranger les jeux téléchargés depuis RomM ?', r.downloadDir);
        if (!p) return;
        r.downloadDir = p;
        await saveCfg();
        rescan();
      });
      if (st.hasToken || st.hasPassword) {
        row('Oublier les identifiants RomM', '', async () => { await api.romm.setSecret('clear'); await refreshRommStatus(); toast('Identifiants RomM effacés'); rerender(); });
      }
    }

    cat('emus');
    section('Émulateurs');
    for (const emu of EMULATORS) {
      row(emu.name, c.emulators[emu.id] || 'Non défini', () => pickEmulator(emu.id), emu.desc, emu.id === 'retroarch' && !c.emulators.retroarch);
    }

    section('Commandes par console');
    for (const sys of S.defs) {
      const custom = c.commands[sys.id];
      const alt = (sys.alts || []).find((a) => a.command === (custom || sys.command));
      row(sys.name, alt ? alt.label + (custom ? '' : ' (défaut)') : custom ? 'Personnalisée' : 'Par défaut', () => editCommand(sys));
    }

    cat('controls');
    section('Manettes connectées');
    const pads = Input.pads ? Input.pads() : [];
    const PAD_LABEL = { ps4: 'PlayStation 4', ps5: 'PlayStation 5', xbox: 'Xbox', switch: 'Nintendo Switch', generic: 'Manette' };
    if (!pads.length) row('Aucune manette détectée', '', null, 'Branche-la ou connecte-la en Bluetooth, puis appuie sur un bouton : Lumen la reconnaît tout seul.');
    for (const p of pads) {
      row(`${PAD_LABEL[p.type] || 'Manette'} · n°${p.index + 1}`, p.rumble ? 'Tester la vibration' : '', p.rumble ? () => Input.rumble(0.8, 400) : null,
        `${p.name.replace(/\s*\(.*$/, '')} · disposition ${p.mapping === 'standard' ? 'standard' : 'non standard (corrigée par Lumen)'} · ${p.buttons} boutons`);
    }
    row('Tester la manette', 'Ouvrir', () => openPadTest(), 'Affiche en direct ce que Lumen reçoit : boutons pressés et sticks. Appuie d’abord sur un bouton, Windows ne montre la manette qu’après.');
    section('Boutons');
    row('Inverser A/B et X/Y', toggle(c.swapAB), () => { c.swapAB = !c.swapAB; Input.swapAB = c.swapAB; saveCfg(); rerender(); }, 'Pour toutes les manettes.');
    row('Manette Switch : valider avec A', toggle(c.nintendoConfirm !== false), () => {
      c.nintendoConfirm = c.nintendoConfirm === false; Input.nintendoConfirm = c.nintendoConfirm; saveCfg(); rerender();
    }, 'A (à droite) valide et B (en bas) revient, comme sur la Switch. Automatique dès qu’une manette Nintendo est utilisée.');
    section('Jeux sans prise en charge de la manette');
    row('Profils manette → clavier', `${plural(Object.keys(c.padProfiles || {}).length, 'profil', 'profils')}`, () => openProfilesList(),
      'Pour les jeux PC ou les applications qui ne gèrent pas la manette : Lumen la transforme en clavier et souris pendant que le jeu tourne. Un profil par jeu, depuis son menu rapide.');
    cat('display');
    section('Personnalisation');
    row('Personnaliser l’accueil', 'Widgets, fond, blocs', () => openHomeEditor(), 'Horloge, météo, rang, musique, jeu surprise, mémo… et ton fond d’écran (image ou thème animé).');
    section('Affichage');
    row('Démarrer en plein écran', toggle(c.fullscreen), () => { c.fullscreen = !c.fullscreen; saveCfg(); rerender(); }, 'F11 bascule à tout moment.');
    cat('sound');
    section('Son');
    row('Sons de navigation', toggle(c.sounds), () => { c.sounds = !c.sounds; saveCfg(); rerender(); });
    row('Volume', `${Math.round((c.volume ?? 0.7) * 100)} %`, () => {
      c.volume = VOLUMES[(VOLUMES.indexOf(c.volume ?? 0.7) + 1) % VOLUMES.length];
      saveCfg(); sfx('select'); rerender();
    }, 'Sons d’interface et soundbites.');
    row('Sons d’interface', c.uiSoundsDir ? c.uiSoundsDir.split(/[\\/]/).pop() : 'Sons de Lumen', async () => {
      const p = await api.pickFolder('Dossier de sons d’interface (Navigation.wav, Open.wav, Close.wav…)', c.uiSoundsDir);
      if (p === null || p === undefined) return;
      c.uiSoundsDir = p;
      await saveCfg();
      const n = await loadUiSounds();
      toast(n ? `${plural(n, 'son reconnu', 'sons reconnus')}` : 'Aucun son reconnu dans ce dossier', n ? 'info' : 'error');
      sfx('select');
      rerender();
    }, 'Un dossier de .wav/.ogg nommés comme ceux d’iiSU (Navigation, Open, Close, Menu Navigate, Key Click, Open Rom…). Sinon, les sons générés par Lumen.');
    if (c.uiSoundsDir) row('Revenir aux sons de Lumen', '', async () => { c.uiSoundsDir = ''; await saveCfg(); await loadUiSounds(); sfx('select'); rerender(); });
    row('Couper tout le son', toggle(!!c.muted), () => { toggleMute(); rerender(); }, 'Raccourci : touche M, ou le menu rapide (Tab / Start).');
    row('Soundbites', toggle(c.soundbites), () => { c.soundbites = !c.soundbites; saveCfg(); rerender(); },
      'Joue l’extrait audio d’un jeu quand il est sélectionné : ceux d’iiDB, ceux de <console>/media/soundbites, ou le tien (menu rapide → Choisir un son pour ce jeu).');
    if (api.listMusic) {
      const m = musicCfg();
      row('Musique de fond', toggle(m.enabled), async () => { m.enabled = !m.enabled; await saveCfg(); await loadMusic(); rerender(); },
        'Joue tes musiques en boucle aléatoire dans les menus. Se met en pause en jeu et pendant les soundbites.');
      row('Dossier de musique', m.dir || 'Non défini', async () => {
        const p = await api.pickFolder('Dossier de tes musiques (mp3, ogg, flac, wav…)', m.dir);
        if (!p) return;
        m.dir = p;
        m.enabled = true;
        await saveCfg();
        await loadMusic();
        toast(musicList.length ? `${plural(musicList.length, 'morceau', 'morceaux')} trouvés` : 'Aucun fichier audio dans ce dossier', musicList.length ? 'info' : 'error');
        rerender();
      }, 'Sous-dossiers compris.', m.enabled && !m.dir);
      row('Volume de la musique', `${Math.round((m.volume ?? 0.35) * 100)} %`, async () => {
        const steps = [0.15, 0.25, 0.35, 0.5, 0.75, 1];
        m.volume = steps[(steps.indexOf(m.volume ?? 0.35) + 1) % steps.length];
        await saveCfg();
        updateMusic();
        rerender();
      });
      if (m.enabled && musicList.length > 1) row('Morceau suivant', '⏭', () => { nextTrack(); toast('Morceau suivant'); });
    }
    cat('display');
    row('Vidéos d’aperçu', toggle(c.videos), () => { c.videos = !c.videos; saveCfg(); rerender(); },
      'Lit la vidéo du jeu dans sa tuile après un instant (dossier videos d’ES-DE ou <console>/media/videos).');
    row('Tri des jeux', sortLabel(), () => { cycleSort(); openTab('settings'); });
    row('Couleur d’accent', h('span', { class: 'swatch' }), () => {
      c.accent = ACCENTS[(ACCENTS.indexOf(c.accent) + 1) % ACCENTS.length];
      applyCfg(); saveCfg(); rerender();
    });

    cat('about');
    section('Lumen');
    row('Version', api.version || '', null, 'Frontend de jeux pour Windows : ROMs, jeux PC et applications.');
    if (api.update) {
      const u = S.update || {};
      const label = { checking: 'Recherche…', downloading: `Téléchargement ${u.version || ''} · ${u.progress || 0} %`, ready: `${u.version} prête · redémarrer`,
        uptodate: 'À jour', error: 'Erreur · réessayer', dev: 'Version de développement' }[u.status] || 'Vérifier';
      row('Mises à jour', label, async () => {
        if (u.status === 'ready') { toast('Installation de la mise à jour…'); api.update.install(); return; }
        toast('Recherche de mises à jour…');
        S.update = await api.update.check();
        rerender();
      }, u.status === 'error' ? `Dernière erreur : ${u.error}` : 'Automatiques : Lumen vérifie au démarrage, télécharge en arrière-plan et s’installe à la fermeture.');
    }
    row('Quitter un jeu en cours', 'Select + Start (2 s)', null, 'Ou Ctrl + Maj + Q au clavier. Ferme l’émulateur et revient dans Lumen.');
    section('Sauvegarde');
    row('Sauvegarder ma configuration', 'Exporter…', async () => {
      await saveCfg();
      const r = await api.exportConfig();
      if (r && r.ok) toast('Sauvegarde enregistrée : ' + r.file.split(/[\\/]/).pop());
    }, 'Favoris, dossiers, profils manette, images et sons choisis, accueil, applications… (sans tes clés ni mots de passe).');
    row('Restaurer une sauvegarde', 'Importer…', async () => {
      const r = await api.importConfig();
      if (!r || !r.ok) { if (r && r.error) toast(r.error, 'error', 6000); return; }
      toast('Sauvegarde restaurée, Lumen redémarre…');
      setTimeout(() => location.reload(), 1200);
    }, 'Remplace la configuration actuelle (une copie de l’ancienne est gardée).');
    section('Aide');
    row('Configuration guidée', '', () => openWelcome());
    row('Quitter Lumen', '', () => api.quit());
    };
    fill();

    // Colonne des catégories : se déplacer dessus change le panneau de droite.
    const nav = h('div', { class: 'set-nav' }, SET_CATS.map(([id, label, sub]) => {
      const el = h('div', { class: 'set-cat' + (id === S.setCat ? ' current' : '') },
        h('b', {}, label), h('span', { class: 'muted small' }, sub));
      el._setCat = id;
      return focusable(el, {
        a: () => { const first = list.querySelector('.f'); if (first) setFocus(first); },
        focus: () => {
          setTitle('Réglages', label); setHints('settings'); setBackground(null);
          if (S.setCat === id) return;
          S.setCat = id;
          nav.querySelectorAll('.set-cat').forEach((x) => x.classList.toggle('current', x._setCat === id));
          fill();
          const scroller = document.querySelector('#view .view-inner');
          if (scroller) scroller.scrollTop = 0;
        },
      });
    }));
    return h('div', { class: 'settings-layout' }, nav, list);
  }

  // ---------- Modales ----------
  function openOverlay(content, opts = {}) {
    if (S.overlay) closeOverlay(true);
    const root = $('#overlay');
    root.replaceChildren(content);
    root.hidden = false;
    S.overlay = { root, prevFocus: S.focusEl, opts };
    if (S.focusEl) S.focusEl.classList.remove('focused');
    S.focusEl = null;
    root.onclick = (e) => { if (e.target === root) closeOverlay(); };
    holdCursor(240);
    const first = focusables(root)[0];
    if (first) setFocus(first, { silent: true, noScroll: true });
    setHints('overlay');
  }

  function closeOverlay(silent) {
    if (!S.overlay) return;
    const { root, prevFocus, opts } = S.overlay;
    S.overlay = null;
    root.hidden = true;
    root.replaceChildren();
    if (S.focusEl) S.focusEl.classList.remove('focused');
    S.focusEl = null;
    if (opts.onClose) opts.onClose();
    if (S.dirty) {
      S.dirty = false;
      S.keepAnim = true;
      render(Math.max(0, indexOfFocus(prevFocus)));
    } else if (prevFocus && document.contains(prevFocus)) {
      prevFocus.classList.remove('focused');
      setFocus(prevFocus, { silent: true, noScroll: true });
    } else {
      render(0);
    }
    if (!silent) sfx('back');
  }

  function openDetails(g) {
    const sys = sysById(g.system);
    const played = playtimeOf(g);
    const meta = [sys && sys.name, g.year, g.developer].filter(Boolean).join(' · ');
    const facts = [
      ['Genre', g.genre], ['Étiquettes', (g.tags || []).slice(0, 6).join(', ')], ['Contenu', g.adult ? 'NSFW (adultes)' : null],
      ['Joueurs', g.players], ['Éditeur', g.publisher],
      ['Note', g.rating != null ? `${g.rating} / 5` : null],
      ['Temps de jeu', played ? formatTime(played) : null],
      ['Dernière session', (() => { const t = Math.max((S.cfg.lastPlayed || {})[g.path] || 0, g.storeLastPlayed || 0); return t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null; })()],
      ['Source', g.source === 'romm' ? (g.downloaded ? 'RomM · sur ce PC' : `RomM · ${fmtSize(g.size) || 'à télécharger'}`) : null],
      ['État', g.source === 'pc' ? (g.installed === false ? 'Non installé · s’installe via le launcher' : `Installé${g.size ? ' · ' + fmtSize(g.size) : ''}`) : null],
    ].filter(([, v]) => v);
    const favLabel = () => (isFav(g) ? '★ Retirer des favoris' : '☆ Ajouter aux favoris');
    const favBtn = actionButton(favLabel(), () => { toggleFav(g); favBtn.textContent = favLabel(); });
    const art = g.cover
      ? h('img', { class: 'details-art', src: api.mediaUrl(g.cover), alt: '' })
      : h('div', { class: 'details-art' }, fallbackArt(g.name, sys && sys.color, sys && sys.short));
    const banner = g.hero || g.background;
    // Titre : le logo du jeu quand il existe, sinon le nom (avec l'icône).
    const titleEl = g.logo
      ? h('h1', { class: 'details-logo' }, h('img', { src: api.mediaUrl(g.logo), alt: g.name, onerror: (e) => { e.target.replaceWith(document.createTextNode(g.name)); } }))
      : h('h1', { class: g.icon ? 'with-icon' : null }, g.icon ? h('img', { class: 'title-icon', src: api.mediaUrl(g.icon), alt: '' }) : null, g.name);
    openOverlay(h('div', { class: 'modal details' + (banner ? ' has-banner' : '') },
      banner ? h('div', { class: 'details-banner' }, h('img', { src: api.mediaUrl(banner), alt: '' })) : null,
      art,
      h('div', { class: 'details-main' },
        h('div', { class: 'eyebrow' }, meta),
        titleEl,
        facts.length ? h('div', { class: 'facts' }, facts.map(([k, v]) => h('div', { class: 'fact' }, h('span', {}, k), h('b', {}, v)))) : null,
        g.desc
          ? h('p', { class: 'desc' }, g.desc)
          : g.source === 'pc' || g.source === 'app' ? null
            : h('p', { class: 'desc muted' }, 'Pas de description. Indique tes dossiers ES-DE dans les Réglages pour enrichir les fiches.'),
        h('div', { class: 'actions' }, actionButton(g.installed === false ? '⬇ Installer' : '▶ Jouer', () => { closeOverlay(true); launch(g); }, true), favBtn,
          achInfo(g) ? actionButton(`🏆 Succès ${achInfo(g).unlocked} / ${achInfo(g).total}`, () => openAchievements(g)) : null,
          actionButton('⋯ Plus', () => { closeOverlay(true); const el = [...document.querySelectorAll('.tile')].find((t) => t._game === g); if (el) setFocus(el, { silent: true }); S.menuGame = g; openQuickMenu(); })),
        h('div', { class: 'file muted' }, g.source === 'romm' && !g.downloaded ? `RomM · ${g.rommFile}` : g.target || g.path))));
    sfx('select');
  }

  function openMenu(title, items, sound = 'select') {
    openOverlay(h('div', { class: 'modal menu' },
      h('h2', {}, title),
      items.map(([label, fn]) => focusable(h('div', { class: 'menu-item' }, label), { a: fn }))));
    sfx(sound);
  }

  function openQuickMenu() {
    const g = S.menuGame || (S.focusEl && S.focusEl._game);
    S.menuGame = null;
    const coll = S.focusEl && S.focusEl._collection;
    const sysCard = S.focusEl && S.focusEl._system;
    const items = [];
    if (sysCard) {
      const s = S.lib.systems.find((x) => x.id === sysCard);
      if (s) {
        items.push(['🖼 Changer les images de la console…', () => { closeOverlay(true); openArtEditor(artTarget('platform', s)); }]);
        items.push([`Ouvrir ${s.name}`, () => { closeOverlay(true); go({ view: 'games', systemId: s.id }); }]);
        const custom = (S.cfg.customSystems || []).find((x) => x.id === s.id);
        if (custom) {
          items.push(['✎ Modifier la console (nom, dossier, émulateur)…', () => { closeOverlay(true); addCustomSystem(custom); }]);
          items.push(['Retirer cette console', () => { closeOverlay(true); removeCustomSystem(s.id); }]);
        } else items.push(['✎ Renommer la console…', () => { closeOverlay(true); renameSystem(s); }]);
      }
    }
    if (g) {
      items.push(['🖼 Changer les images…', () => { closeOverlay(true); openArtEditor(artTarget('game', g)); }]);
      items.push([isFav(g) ? 'Retirer des favoris' : 'Ajouter aux favoris', () => { closeOverlay(true); toggleFav(g); }]);
      items.push(['Ranger dans un dossier…', () => { closeOverlay(true); openCollectionPicker(g); }]);
      if (coll && coll !== '★') items.push([`Retirer du dossier « ${coll} »`, () => { closeOverlay(true); removeFromCollection(coll, g); }]);
      if (g.source === 'app') items.push(...appMenuItems(g.path.slice(4)));
      else items.push(['Détails du jeu', () => { closeOverlay(true); openDetails(g); }]);
      if (achInfo(g) || (/^steam:/.test(g.path) && api.achievements)) items.push(['Succès', () => { closeOverlay(true); openAchievements(g); }]);
      if (api.mapper) items.push([profileOf(g) ? `🎮 Profil manette → clavier (${profileOf(g).enabled ? 'actif' : 'inactif'})` : '🎮 Profil manette → clavier…', () => { closeOverlay(true); openProfileEditor(g); }]);
      if (api.pickAudio) items.push([g.customSound ? 'Changer mon son pour ce jeu…' : 'Choisir un son pour ce jeu…', () => { closeOverlay(true); pickGameSound(g); }]);
      if (g.customSound) items.push(['Retirer mon son', () => { closeOverlay(true); clearGameSound(g); }]);
      if (g.source !== 'app') items.push(['Renommer le jeu…', async () => {
        closeOverlay(true);
        const v = await openPrompt({ title: 'Nom du jeu', value: g.name, help: 'Le nom affiché, aussi utilisé pour chercher les images iiDB (ex. « Mario Kart World » plutôt que « MKW »). Vide = nom d’origine.' });
        if (v === null) return;
        const renames = S.cfg.renames || (S.cfg.renames = {});
        if (v.trim()) renames[g.path] = v.trim(); else delete renames[g.path];
        await saveCfg();
        applyLib(await api.scan({ romm: false }));
        rerender();
        toast(v.trim() ? 'Jeu renommé · relance « Images iiDB » pour ses images' : 'Nom d’origine rétabli');
      }]);
      items.push(['Masquer ce jeu', () => { closeOverlay(true); hideGame(g); }]);
      if (g.source === 'romm' && !g.downloaded) items.push([`Télécharger sans lancer (${fmtSize(g.size) || 'RomM'})`, () => { closeOverlay(true); downloadOnly(g); }]);
      if (g.source === 'romm' && g.downloaded) items.push(['Supprimer la copie locale', () => { closeOverlay(true); deleteRommCopy(g); }]);
    }
    const folder = (S.focusEl && S.focusEl._folder) || (S.route.view === 'folder' ? S.route.id : null);
    if (folder && !g) items.push(['🖼 Changer l’icône du dossier…', () => { closeOverlay(true); openArtEditor(artTarget('collection', folder)); }]);
    if (folder && folder !== '★') {
      items.push([`Renommer le dossier « ${folder} »`, () => { closeOverlay(true); renameFolder(folder); }]);
      items.push(['Changer la couleur du dossier', () => { closeOverlay(true); cycleFolderColor(folder); }]);
      items.push([`Supprimer le dossier « ${folder} »`, () => { closeOverlay(true); deleteCollection(folder); }]);
    }
    if (!g) items.push(['Nouveau dossier', () => { closeOverlay(true); createCollection(); }]);
    const sysId = S.route.view === 'games' ? S.route.systemId : null;
    if (sysId) {
      items.push([`Trier par : ${sortLabel()}`, () => { closeOverlay(true); cycleSort(); }]);
      const cur = S.lib.systems.find((x) => x.id === sysId);
      if (cur && filterChip(cur)) items.push([`Afficher : ${filterLabel(filterOf(sysId))}`, () => { closeOverlay(true); openFilterMenu(cur); }]);
      if (api.iidb && S.cfg.iidb && S.cfg.iidb.enabled !== false && !(cur && cur.apps)) items.push(['Images iiDB de cette console', () => { closeOverlay(true); openIidb({ systemId: sysId }); }]);
      if (cur && cur.pc && !cur.apps) items.push(['Images SteamGridDB', () => { closeOverlay(true); openSgdb(); }]);
      else items.push(['Jaquettes de cette console', () => { closeOverlay(true); openThumbs(sysId); }]);
    }
    if (S.route.view === 'home') items.push(['🎨 Personnaliser l’accueil', () => { closeOverlay(true); openHomeEditor(); }]);
    if (S.route.view === 'home') items.push([S.homeEdit ? '✓ Terminer la réorganisation' : '✏ Réorganiser à la souris', () => { closeOverlay(true); toggleHomeEdit(!S.homeEdit); }]);
    if (!g || S.route.view === 'games') items.push([sysId ? '🎲 Jeu au hasard (cette console)' : '🎲 Jeu au hasard', () => { closeOverlay(true); openRoll(sysId || undefined); }]);
    if (S.route.view !== 'search') items.push(['Rechercher un jeu', () => { closeOverlay(true); openTab('search'); }]);
    items.push(
      ['Télécharger les jaquettes manquantes', () => { closeOverlay(true); openThumbs(); }],
      ['Rescanner la bibliothèque', () => { closeOverlay(true); rescan(); }],
      [S.cfg.muted ? '🔊 Remettre le son (M)' : '🔇 Couper le son (M)', () => { closeOverlay(true); toggleMute(); }],
      ['Plein écran (F11)', () => { closeOverlay(true); api.toggleFullscreen(); }],
      ['Réglages', () => { closeOverlay(true); openTab('settings'); }],
      ['Quitter Lumen', () => api.quit()],
    );
    openMenu(g ? g.name : 'Menu', items, 'menu');
  }

  // ---------- RomM ----------
  async function refreshRommStatus() {
    if (api.romm) S.rommStatus = await api.romm.status();
  }

  async function testRomm() {
    toast('Connexion à RomM…', 'info', 15000);
    const res = await api.romm.test();
    if (!res.ok) {
      S.rommTest = 'Échec';
      toast(res.error, 'error', 7000);
    } else {
      S.rommTest = `RomM ${res.version || ''} · ${plural(res.platforms, 'console', 'consoles')} · ${plural(res.roms, 'jeu', 'jeux')}`;
      toast(`Connecté · ${S.rommTest}`);
      if (res.unsupported.length) setTimeout(() => toast(`Consoles RomM non gérées par Lumen : ${res.unsupported.join(', ')}`, 'info', 6000), 2700);
    }
    if (S.route.view === 'settings' && !S.overlay) rerender();
    return res.ok;
  }

  // Télécharge un jeu RomM pendant l'écran de lancement. B annule.
  async function downloadFromRomm(g, fx) {
    S.downloading = true;
    fx.downloading();
    if (!S.rommListener) {
      S.rommListener = true;
      api.romm.onProgress((p) => S.onRommProgress && S.onRommProgress(p));
    }
    S.onRommProgress = (p) => fx.progress(p);
    const res = await api.romm.download(g);
    S.downloading = false;
    S.onRommProgress = null;
    if (!res.ok) {
      toast(res.cancelled ? 'Téléchargement annulé' : `RomM : ${res.error}`, res.cancelled ? 'info' : 'error', 6000);
      return false;
    }
    S.byPath.delete(g.path);
    g.path = res.path;
    g.downloaded = true;
    S.byPath.set(g.path, g);
    S.dirty = true;
    return true;
  }

  async function deleteRommCopy(g) {
    const res = await api.romm.deleteLocal(g);
    if (!res.ok) { toast(res.error, 'error'); return; }
    const old = g.path;
    S.byPath.delete(old);
    g.path = `romm://${g.rommId}`;
    g.downloaded = false;
    S.byPath.set(g.path, g);
    S.cfg.recent = S.cfg.recent.filter((p) => p !== old);
    saveCfg();
    toast(`Copie locale de ${g.name} supprimée (le jeu reste sur RomM)`);
    rerender();
  }

  async function downloadOnly(g) {
    if (S.launching) return;
    S.launching = true;
    const fx = launchFx(g, S.focusEl && S.focusEl._game === g ? S.focusEl : null);
    const ok = await downloadFromRomm(g, fx);
    S.launching = false;
    fx.close();
    if (ok) { toast(`${g.name} est maintenant sur ce PC`); rerender(); }
  }

  // ---------- Collections ----------
  function openCollectionPicker(g) {
    const names = Object.keys(S.cfg.collections || {});
    const items = names.map((n) => {
      const inside = S.cfg.collections[n].includes(g.path);
      return [`${inside ? '✓ ' : ''}${n}`, () => {
        closeOverlay(true);
        if (inside) removeFromCollection(n, g);
        else addToCollection(n, g);
      }];
    });
    items.push(['＋ Nouveau dossier…', () => { closeOverlay(true); createCollection(g); }]);
    openMenu(`Ranger · ${g.name}`, items);
  }

  const FOLDER_COLORS = ['#6d5bd0', '#1d9e75', '#d85a30', '#d4537e', '#378add', '#ba7517', '#5f5e5a'];
  const folderColor = (id) => (id === '★' ? '#c9971c' : (S.cfg.folderColors || {})[id] || FOLDER_COLORS[hash(id) % FOLDER_COLORS.length]);

  function cycleFolderColor(id) {
    S.cfg.folderColors = S.cfg.folderColors || {};
    const cur = folderColor(id);
    S.cfg.folderColors[id] = FOLDER_COLORS[(FOLDER_COLORS.indexOf(cur) + 1) % FOLDER_COLORS.length];
    saveCfg();
    sfx('select');
    rerender();
  }

  async function renameFolder(oldName) {
    const v = await openPrompt({ title: 'Renommer le dossier', value: oldName, keyboard: true });
    const name = (v || '').trim().slice(0, 40);
    if (!name || name === oldName) return;
    if (S.cfg.collections[name] || name === '★') { toast('Un dossier porte déjà ce nom.', 'error'); return; }
    // On reconstruit l'objet pour garder l'ordre des dossiers.
    S.cfg.collections = Object.fromEntries(Object.entries(S.cfg.collections).map(([k, v2]) => [k === oldName ? name : k, v2]));
    if (S.cfg.folderColors && S.cfg.folderColors[oldName]) { S.cfg.folderColors[name] = S.cfg.folderColors[oldName]; delete S.cfg.folderColors[oldName]; }
    if (S.route.view === 'folder' && S.route.id === oldName) S.route.id = name;
    saveCfg();
    toast(`Dossier renommé en « ${name} »`);
    rerender();
  }

  async function createCollection(g) {
    const name = await openPrompt({ title: 'Nouveau dossier', value: '', keyboard: true, help: 'Par exemple : RPG, Coop, À finir…' });
    const clean = (name || '').trim().slice(0, 40);
    if (!clean) return;
    if (clean === '★' || /^favoris$/i.test(clean)) { toast('Ce nom est réservé.', 'error'); return; }
    S.cfg.collections = S.cfg.collections || {};
    if (!S.cfg.collections[clean]) S.cfg.collections[clean] = [];
    if (g) addToCollection(clean, g);
    else { saveCfg(); toast(`Dossier « ${clean} » créé`); rerender(); }
  }

  function addToCollection(name, g) {
    const list = S.cfg.collections[name];
    if (!list.includes(g.path)) list.unshift(g.path);
    saveCfg();
    toast(`${g.name} rangé dans « ${name} »`);
    sfx('select');
    rerender();
  }

  function removeFromCollection(name, g) {
    S.cfg.collections[name] = S.cfg.collections[name].filter((p) => p !== g.path);
    saveCfg();
    toast(`${g.name} retiré de « ${name} »`);
    rerender();
  }

  function deleteCollection(name) {
    delete S.cfg.collections[name];
    if (S.cfg.folderColors) delete S.cfg.folderColors[name];
    saveCfg();
    toast(`Dossier « ${name} » supprimé (les jeux restent dans ta bibliothèque)`);
    if (S.route.view === 'folder' && S.route.id === name) { back(); return; }
    rerender();
  }

  function cycleSort() {
    const i = SORTS.findIndex((s) => s.id === (S.cfg.sort || 'name'));
    S.cfg.sort = SORTS[(i + 1) % SORTS.length].id;
    saveCfg();
    toast(`Tri : ${sortLabel()}`);
    sfx('select');
    S.keepAnim = false;
    S.trans = 'v-fade';
    render(0);
  }

  function openPrompt({ title, value, help, resetValue, keyboard, secret }) {
    return new Promise((resolve) => {
      let done = false;
      const input = h('input', { class: 'input', value: value || '', spellcheck: 'false', type: secret ? 'password' : 'text', autocomplete: 'off' });
      const finish = (v) => { if (done) return; done = true; resolve(v); closeOverlay(true); };
      const wrap = focusable(h('div', { class: 'input-wrap' }, input), { a: () => input.focus() });
      const kb = keyboard ? vkeyboard((ch) => {
        const raw = keyboard === 'url' || ch === ' ' || ch === '\b' || ch === '\u0018';
        const v = raw ? ch : (input.value ? ch.toLowerCase() : ch);
        input.value = applyKey(input.value, v).slice(0, 200);
      }, keyboard === 'url' ? 'url' : null) : null;
      openOverlay(h('div', { class: 'modal prompt' + (keyboard ? ' with-kb' : '') },
        h('h2', {}, title),
        help ? h('p', { class: 'muted small' }, help) : null,
        wrap,
        kb,
        h('div', { class: 'actions' },
          actionButton('Valider', () => finish(input.value), true),
          resetValue !== undefined ? actionButton('Par défaut', () => finish(resetValue)) : null,
          actionButton('Annuler', () => finish(null)))), {
        onA: () => { if (document.activeElement === input) { finish(input.value); return true; } return false; },
        onBack: () => { if (document.activeElement === input) input.blur(); else finish(null); },
        onClose: () => { if (!done) { done = true; resolve(null); } },
      });
      if (!keyboard || Input.lastDevice === 'keyboard') setTimeout(() => input.focus(), 60);
    });
  }

  // Configuration guidée en 4 étapes.
  function openWelcome(step = 0) {
    const STEPS = 5;
    const dots = h('div', { class: 'steps-dots' }, Array.from({ length: STEPS }, (_v, i) => h('span', { class: i === step ? 'on' : i < step ? 'done' : '' })));
    const next = () => { closeOverlay(true); openWelcome(step + 1); };
    let body;
    if (step === 0) {
      body = [
        h('div', { class: 'logo-mark big' }),
        h('h1', {}, 'Bienvenue dans Lumen'),
        h('p', { class: 'muted' }, 'Tes ROMs, tes jeux Steam, Epic et GOG et tes applis au même endroit, à piloter à la manette. Lumen n’inclut ni jeux ni émulateurs : il range tes jeux et lance tes émulateurs et launchers. On règle tout en quelques étapes.'),
        h('div', { class: 'actions' }, actionButton('Commencer', next, true), actionButton('Plus tard', () => closeOverlay())),
      ];
    } else if (step === 1) {
      const n = totalGames();
      body = [
        h('div', { class: 'eyebrow' }, 'Étape 1 · Tes jeux'),
        h('h1', {}, 'Où sont tes ROMs ?'),
        h('p', { class: 'muted' }, 'Un dossier avec un sous-dossier par console : ', h('code', {}, 'snes'), ' ', h('code', {}, 'gba'), ' ', h('code', {}, 'psx'), ' ', h('code', {}, 'ps2'), ' ', h('code', {}, 'gc'), '… (mêmes noms qu’ES-DE).'),
        h('div', { class: 'wiz-status' + (S.cfg.romsRoot ? ' ok' : '') },
          S.cfg.romsRoot ? `${S.cfg.romsRoot} · ${plural(n, 'jeu trouvé', 'jeux trouvés')} sur ${plural(S.lib.systems.length, 'console', 'consoles')}` : 'Aucun dossier choisi'),
        h('div', { class: 'actions' },
          actionButton(S.cfg.romsRoot ? 'Changer de dossier' : 'Choisir le dossier', async () => { closeOverlay(true); await pickRoms(); openWelcome(1); }, !S.cfg.romsRoot),
          actionButton('Continuer', next, !!S.cfg.romsRoot)),
      ];
    } else if (step === 2) {
      body = [
        h('div', { class: 'eyebrow' }, 'Étape 2 · Émulateurs'),
        h('h1', {}, 'RetroArch'),
        h('p', { class: 'muted' }, 'RetroArch fait tourner la plupart des consoles rétro. Les émulateurs autonomes (Dolphin, PCSX2…) se règlent dans Réglages → Émulateurs.'),
        h('div', { class: 'wiz-status' + (S.cfg.emulators.retroarch ? ' ok' : '') }, S.cfg.emulators.retroarch ? `Trouvé : ${S.cfg.emulators.retroarch}` : 'RetroArch n’a pas été détecté automatiquement'),
        h('div', { class: 'actions' },
          actionButton(S.cfg.emulators.retroarch ? 'Changer' : 'Indiquer retroarch.exe', async () => { closeOverlay(true); await pickEmulator('retroarch'); openWelcome(2); }, !S.cfg.emulators.retroarch),
          actionButton('Continuer', next, !!S.cfg.emulators.retroarch)),
      ];
    } else if (step === 3) {
      body = [
        h('div', { class: 'eyebrow' }, 'Étape 3 · Images'),
        h('h1', {}, 'Des images pour tous tes jeux'),
        h('p', { class: 'muted' }, 'Jaquettes iiSU, icônes, logos, bannières et soundbites depuis iiDB, pour tes jeux, tes consoles et tes dossiers. Tu pourras en choisir d’autres plus tard (clic droit → Changer les images).'),
        h('div', { class: 'actions' },
          api.iidb ? actionButton('Télécharger les images iiDB', () => { closeOverlay(true); openIidb(); }, true) : null,
          actionButton('Plus tard', next, !api.iidb)),
      ];
    } else if (step === 4) {
      const pads = Input.getPads ? Input.getPads() : [];
      const PAD = { ps4: 'PlayStation 4', ps5: 'PlayStation 5', xbox: 'Xbox', switch: 'Switch' };
      body = [
        h('div', { class: 'eyebrow' }, 'Étape 4 · À ton goût'),
        h('h1', {}, 'Personnalise ton accueil'),
        h('p', { class: 'muted' }, 'Fond d’écran (thème animé ou ton image), widgets (horloge, météo, musique en cours, rang, jeu surprise…) et blocs de l’accueil. Tout se change ensuite dans Réglages → Affichage.'),
        h('div', { class: 'wiz-status' + (pads.length ? ' ok' : '') }, pads.length ? `Manette détectée : ${PAD[Input.padType] || 'manette'}` : 'Aucune manette pour l’instant : appuie sur un bouton, elle sera reconnue.'),
        h('div', { class: 'actions' },
          actionButton('Personnaliser', () => { closeOverlay(true); openHomeEditor(); }, true),
          actionButton('Continuer', next)),
      ];
    } else {
      body = [
        h('div', { class: 'logo-mark big' }),
        h('h1', {}, 'C’est prêt !'),
        h('ul', { class: 'steps' },
          h('li', {}, 'LB / RB : changer d’onglet · LT / RT : sauter à la lettre suivante'),
          h('li', {}, 'X : favori · Y : détails · Start / clic droit : menu rapide (images, dossiers, profil manette…)'),
          h('li', {}, 'Select + Start maintenus : quitter le jeu en cours · M : couper le son'),
          h('li', {}, 'Onglet Succès : tes succès Steam et RetroAchievements, ton rang et ton XP')),
        h('div', { class: 'actions' }, actionButton('C’est parti', () => { closeOverlay(); S.trans = 'v-in'; openTab('home'); }, true)),
      ];
    }
    openOverlay(h('div', { class: 'modal welcome' }, step > 0 && step < STEPS ? dots : null, ...body));
  }

  // ---------- Succès (Steam en local, RetroAchievements en ligne) ----------
  // Chaque entrée : { key, path?, raId?, title, icon, total, unlocked, last, source } ; key sert à ouvrir la liste.
  const achInfo = (g) => (S.ach && S.ach.byPath && S.ach.byPath.get(g.path)) || null;
  const fmtDay = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const achFold = (x) => fold(String(x || '').replace(/~[^~]*~/g, ' ').replace(/\s*[([].*?[)\]]\s*/g, ' '));

  // Petit badge de plateforme sur la jaquette : Steam (bleu), RetroAchievements (doré).
  function sourceBadge(source, extra = '') {
    const ra = /retro/i.test(source || '');
    const el = h('span', { class: `src-badge ${ra ? 'ra' : 'steam'} ${extra}`, title: source || '' });
    el.innerHTML = ra
      ? '<b>RA</b>'
      : '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-9.96 9.04l5.35 2.21a2.83 2.83 0 0 1 1.6-.49l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43a2.84 2.84 0 0 1-5.62.6L2.2 14.5A10 10 0 1 0 12 2Zm-4.7 15.17-1.23-.51a2.13 2.13 0 1 0 1.16-2.9l1.27.53a1.57 1.57 0 1 1-1.2 2.88Zm9.2-7.47a2.51 2.51 0 1 0-2.51 2.51 2.51 2.51 0 0 0 2.51-2.51Zm-4.4 0a1.89 1.89 0 1 1 1.89 1.89 1.89 1.89 0 0 1-1.89-1.89Z"/></svg>';
    return el;
  }

  async function loadAchievements(force) {
    if (S.achLoading) return;
    if (!force && S.ach && Date.now() - S.ach.at < 60000) return;
    S.achLoading = true;
    const out = { games: [], recent: [], errors: [], at: Date.now(), byPath: new Map() };
    try {
      if (api.achievements) {
        const st = await api.achievements.summary();
        if (st.error) out.errors.push(st.error);
        for (const x of st.games) out.games.push({ ...x, key: x.path, source: 'Steam' });
        for (const r of st.recent) out.recent.push({ ...r, key: r.path, source: 'Steam' });
      }
      S.raStatus = api.ra ? await api.ra.status() : null;
      if (S.raStatus && S.raStatus.hasKey && S.raStatus.username) {
        const ra = await api.ra.summary();
        if (ra.error) out.errors.push(ra.error);
        // Jeu RetroAchievements → ROM de la bibliothèque portant le même titre.
        const roms = new Map();
        for (const s of S.lib.systems) if (!s.pc) for (const g of s.games) { const k = achFold(g.name); if (!roms.has(k)) roms.set(k, g); }
        const pathOf = new Map();
        for (const x of ra.games) {
          const g = roms.get(achFold(x.title));
          if (g) pathOf.set(x.raId, g.path);
          out.games.push({ ...x, key: 'ra:' + x.raId, path: g ? g.path : null, source: 'RetroAchievements' });
        }
        for (const r of ra.recent) out.recent.push({ ...r, key: 'ra:' + r.raId, path: pathOf.get(r.raId) || null, source: 'RetroAchievements' });
      }
    } catch (err) { out.errors.push(err.message); }
    out.recent.sort((a, b) => b.time - a.time);
    for (const x of out.games) if (x.path) out.byPath.set(x.path, x);
    out.byKey = new Map(out.games.map((x) => [x.key, x]));
    const first = !S.ach;
    S.ach = out;
    S.achLoading = false;
    announceProgress(out);
    if ((S.route.view === 'achievements' || (first && (S.route.view === 'home' || out.games.some((x) => x.unlocked === x.total)))) && !S.overlay && !S.inGame) { S.keepAnim = true; render(indexOfFocus()); }
  }

  // XP : 10 par succès + 100 par jeu terminé à 100 %. Chaque niveau demande 25 XP de plus que le précédent.
  const XP_PER_ACH = 10;
  const XP_PERFECT = 100;
  const RANKS = [
    { min: 1, name: 'Bronze', color: '#cd7f32' },
    { min: 10, name: 'Argent', color: '#cbd5e1' },
    { min: 20, name: 'Or', color: '#fbbf24' },
    { min: 35, name: 'Platine', color: '#5eead4' },
    { min: 50, name: 'Diamant', color: '#60a5fa' },
    { min: 75, name: 'Maître', color: '#c084fc' },
    { min: 100, name: 'Légende', color: '#f43f5e' },
  ];
  function achStats(ach) {
    const games = (ach && ach.games) || [];
    const unlocked = games.reduce((n, x) => n + x.unlocked, 0);
    const perfect = games.filter((x) => x.total && x.unlocked === x.total).length;
    const xp = unlocked * XP_PER_ACH + perfect * XP_PERFECT;
    let lvl = 1; let into = xp; let need = 100;
    while (into >= need) { into -= need; lvl++; need = 100 + 25 * (lvl - 1); }
    const rank = [...RANKS].reverse().find((r) => lvl >= r.min) || RANKS[0];
    const next = RANKS.find((r) => r.min > lvl) || null;
    return { unlocked, perfect, xp, lvl, into, need, rank, next };
  }

  function rankEmblem(st, size = '') {
    return h('div', { class: 'rank-emblem ' + size, '--rc': st.rank.color },
      h('span', { class: 'rank-lvl' }, String(st.lvl)));
  }

  // XP totale nécessaire pour atteindre un niveau (niveau 1 = 0 XP).
  const xpForLevel = (lvl) => { let t = 0; for (let l = 1; l < lvl; l++) t += 100 + 25 * (l - 1); return t; };
  const fmtXp = (n) => n.toLocaleString('fr-FR');

  // Fenêtre « Progression » : prochain niveau, rangs à venir, détail de l'XP.
  function openProgress(st) {
    const toNext = st.need - st.into;
    const achNeeded = Math.ceil(toNext / XP_PER_ACH);
    const ranks = RANKS.map((r) => {
      const reached = st.lvl >= r.min;
      const missing = Math.max(0, xpForLevel(r.min) - st.xp);
      return h('div', { class: 'prog-rank' + (reached ? ' reached' : '') + (r === st.rank ? ' current' : ''), '--rc': r.color },
        h('div', { class: 'rank-emblem' }, h('span', { class: 'rank-lvl' }, String(r.min))),
        h('div', { class: 'ach-text' },
          h('b', {}, r.name + (r === st.rank ? ' · ton rang' : '')),
          h('span', { class: 'muted small' }, reached ? `Atteint (niveau ${r.min})`
            : `Niveau ${r.min} · encore ${fmtXp(missing)} XP (≈ ${fmtXp(Math.ceil(missing / XP_PER_ACH))} succès)`)));
    });
    const pct = Math.round((st.into / st.need) * 100);
    openOverlay(h('div', { class: 'modal progress-modal', '--rc': st.rank.color },
      h('div', { class: 'eyebrow' }, 'Progression'),
      h('div', { class: 'prog-head' }, rankEmblem(st, 'big'),
        h('div', { class: 'ach-text' },
          h('h2', {}, `Niveau ${st.lvl} · Rang ${st.rank.name}`),
          h('div', { class: 'xp-bar' }, h('div', { class: 'xp-fill', style: `width:${pct}%` })),
          h('span', { class: 'muted' }, `${fmtXp(st.into)} / ${fmtXp(st.need)} XP · niveau ${st.lvl + 1} dans ${fmtXp(toNext)} XP (≈ ${achNeeded} succès, ou 1 jeu à 100 %${toNext > XP_PERFECT ? ' et ' + Math.ceil((toNext - XP_PERFECT) / XP_PER_ACH) + ' succès' : ''})`))),
      h('div', { class: 'facts' },
        h('div', { class: 'fact' }, h('span', {}, 'XP totale'), h('b', {}, fmtXp(st.xp))),
        h('div', { class: 'fact' }, h('span', {}, 'Succès'), h('b', {}, `${fmtXp(st.unlocked)} × ${XP_PER_ACH} = ${fmtXp(st.unlocked * XP_PER_ACH)} XP`)),
        h('div', { class: 'fact' }, h('span', {}, 'Jeux à 100 %'), h('b', {}, `${st.perfect} × ${XP_PERFECT} = ${fmtXp(st.perfect * XP_PERFECT)} XP`)),
        st.next ? h('div', { class: 'fact' }, h('span', {}, 'Prochain rang'), h('b', {}, `${st.next.name} au niveau ${st.next.min}`)) : null),
      h('div', { class: 'set-section' }, 'Les rangs'),
      h('div', { class: 'prog-ranks' }, ranks),
      h('p', { class: 'muted small' }, `${XP_PER_ACH} XP par succès débloqué, ${XP_PERFECT} XP par jeu terminé à 100 %. Chaque niveau demande 25 XP de plus que le précédent.`),
      h('div', { class: 'actions' }, actionButton('Fermer', () => closeOverlay(), true))));
    sfx('select');
  }

  function profileCard(st) {
    const pct = Math.round((st.into / st.need) * 100);
    return focusable(h('div', { class: 'ach-profile', '--rc': st.rank.color },
      rankEmblem(st, 'big'),
      h('div', { class: 'ach-text' },
        h('div', { class: 'rank-name' }, `Rang ${st.rank.name}`, h('span', { class: 'muted' }, ` · Niveau ${st.lvl}`)),
        h('div', { class: 'xp-bar' }, h('div', { class: 'xp-fill', style: `width:${pct}%` })),
        h('span', { class: 'muted small' }, `${st.into.toLocaleString('fr-FR')} / ${st.need.toLocaleString('fr-FR')} XP · ${st.xp.toLocaleString('fr-FR')} XP au total${st.next ? ` · ${st.next.name} au niveau ${st.next.min}` : ' · rang maximal'}`)),
      h('div', { class: 'ach-profile-stats' },
        h('div', {}, h('b', {}, String(st.unlocked)), h('span', { class: 'muted small' }, 'succès')),
        h('div', {}, h('b', { class: 'gg-text' }, trophyIcon('inline small'), String(st.perfect)), h('span', { class: 'muted small' }, 'jeux à 100 %')))), {
      a: () => openProgress(st),
      focus: () => { setTitle(`Niveau ${st.lvl}`, `Rang ${st.rank.name}`); setHints('action'); },
    });
  }

  // Après lecture : prévient des nouveaux succès et des passages de niveau depuis la dernière fois.
  function announceProgress(ach) {
    const st = achStats(ach);
    const prev = S.cfg.achSeen || null;
    const seen = { unlocked: st.unlocked, lvl: st.lvl, perfect: st.perfect };
    if (prev && !ach.errors.length) {
      const gained = st.unlocked - (prev.unlocked || 0);
      const gg = st.perfect - (prev.perfect || 0);
      if (st.lvl > (prev.lvl || 1)) setTimeout(() => toast(`⬆ Niveau ${st.lvl} atteint ! Rang ${st.rank.name}`, 'info', 6000), 600);
      else if (gg > 0) setTimeout(() => toast(`🏆 Coupe d’or ! ${plural(gg, 'jeu terminé', 'jeux terminés')} à 100 % (+${gg * XP_PERFECT} XP)`, 'info', 6000), 600);
      else if (gained > 0) setTimeout(() => toast(`🏆 +${plural(gained, 'succès', 'succès')} (+${gained * XP_PER_ACH} XP)`, 'info', 5000), 600);
    }
    if (!prev || prev.unlocked !== seen.unlocked || prev.lvl !== seen.lvl || prev.perfect !== seen.perfect) {
      S.cfg.achSeen = seen;
      saveCfg();
    }
  }

  function progressBar(done, total) {
    return h('div', { class: 'ach-bar' }, h('div', { class: 'ach-bar-fill', style: `width:${total ? Math.round((done / total) * 100) : 0}%` }));
  }

  // Jeu de la bibliothèque, ou fiche minimale pour un jeu RetroAchievements absent des ROMs.
  const achGame = (x) => (x.path && S.byPath.get(x.path)) || { name: x.title || x.gameName || 'Jeu', cover: x.icon, path: x.key, background: null };

  function viewAchievements() {
    loadAchievements();
    const head = (sub, ...chips) => h('div', { class: 'view-head' },
      h('div', { class: 'vh-badge ach-badge' }, icon('achievements')),
      h('div', { class: 'vh-text' }, h('h1', {}, 'Succès'), h('p', { class: 'muted' }, sub)), ...chips);
    if (!S.ach) return h('div', {}, head('Lecture des succès…'));
    // Filtre par plateforme (Steam, RetroAchievements).
    const SOURCES = [...new Set(S.ach.games.map((x) => x.source))];
    const src = S.achSource && SOURCES.includes(S.achSource) ? S.achSource : null;
    const games = S.ach.games.filter((x) => !src || x.source === src);
    const started = games.filter((x) => x.unlocked);
    const total = games.reduce((n, x) => n + x.unlocked, 0);
    const perfect = started.filter((x) => x.unlocked === x.total).length;
    const shown = [...(S.achAll ? games : started)].sort((a, b) => (b.last - a.last) || (b.unlocked / b.total - a.unlocked / a.total));

    const recent = S.ach.recent.filter((r) => !src || r.source === src).slice(0, 16).map((r) => {
      const g = achGame(r);
      return focusable(h('div', { class: 'ach-card' },
        h('div', { class: 'ach-icon-wrap' }, r.icon ? h('img', { class: 'ach-icon', src: api.mediaUrl(r.icon), alt: '', loading: 'lazy' }) : h('div', { class: 'ach-icon' }), sourceBadge(r.source)),
        h('div', { class: 'ach-text' }, h('b', {}, r.name), h('span', { class: 'muted' }, g.name), h('span', { class: 'muted small' }, `${r.source} · ${fmtDay(r.time)}`))), {
        a: () => openAchievements(r.key),
        focus: () => { setTitle(r.name, g.name); setBackground(g.background || g.cover, null); setHints('action'); },
      });
    });

    const rows = shown.slice(0, 300).map((x) => {
      const g = achGame(x);
      return focusable(h('div', { class: 'ach-game' + (x.unlocked === x.total ? ' perfect' : '') },
        x.unlocked === x.total ? trophyIcon('on-card') : null,
        h('div', { class: 'ach-cover-wrap' }, g.cover ? h('img', { class: 'ach-cover', src: api.mediaUrl(g.cover), alt: '', loading: 'lazy' }) : h('div', { class: 'ach-cover' }), sourceBadge(x.source)),
        h('div', { class: 'ach-text' },
          h('b', {}, g.name),
          progressBar(x.unlocked, x.total),
          h('span', { class: 'muted small' }, `${x.source}${x.console ? ' · ' + x.console : ''} · ${x.unlocked} / ${x.total}${x.unlocked === x.total ? ' · 100 %' : ''}${x.last ? ' · ' + fmtDay(x.last) : ''}`))), {
        a: () => openAchievements(x.key),
        y: () => { if (x.path && S.byPath.get(x.path)) openDetails(S.byPath.get(x.path)); },
        focus: () => { setTitle(g.name, `${x.unlocked} / ${x.total} succès`); setBackground(g.background || g.cover, null); setHints('action'); },
      });
    });
    const toggleAll = focusable(h('div', { class: 'chip' + (S.achAll ? ' active' : '') }, S.achAll ? `Tous les jeux (${games.length})` : `Commencés (${started.length})`), {
      a: () => { S.achAll = !S.achAll; S.keepAnim = true; render(indexOfFocus()); },
      focus: () => { setTitle('Afficher', S.achAll ? 'Tous les jeux' : 'Jeux commencés'); setHints('action'); },
    });
    const refresh = focusable(h('div', { class: 'chip' }, '↻ Actualiser'), {
      a: () => { toast('Lecture des succès…'); loadAchievements(true); },
      focus: () => { setTitle('Actualiser', 'Relit Steam et RetroAchievements'); setHints('action'); },
    });
    const raLinked = S.raStatus && S.raStatus.hasKey && S.raStatus.username;
    const raChip = api.ra && !raLinked ? focusable(h('div', { class: 'chip' }, '＋ RetroAchievements'), {
      a: () => openTab('settings'),
      focus: () => { setTitle('RetroAchievements', 'À connecter dans les Réglages'); setHints('action'); },
    }) : null;
    return h('div', {},
      head(`${src ? src + ' · ' : ''}${plural(total, 'succès débloqué', 'succès débloqués')} · ${plural(started.length, 'jeu commencé', 'jeux commencés')}${perfect ? ' · ' + plural(perfect, 'jeu à 100 %', 'jeux à 100 %') : ''}`, SOURCES.length > 1 || src ? focusable(h('div', { class: 'chip' + (src ? ' active' : '') }, src ? sourceBadge(src, 'inline') : '🎮', ' ', src || 'Toutes les plateformes'), {
        a: () => { const list = [null, ...SOURCES]; S.achSource = list[(list.indexOf(src) + 1) % list.length]; S.keepAnim = true; render(0); },
        focus: () => { setTitle('Plateforme', src || 'Toutes'); setHints('action'); },
      }) : null, toggleAll, refresh, raChip),
      S.ach.errors.length ? h('p', { class: 'muted small error-text', style: 'margin: 0 10px 8px' }, S.ach.errors.join(' · ')) : null,
      profileCard(achStats(S.ach)),
      recent.length ? h('section', { class: 'shelf' }, h('div', { class: 'shelf-title' }, 'Débloqués récemment'), h('div', { class: 'row' }, recent)) : null,
      h('div', { class: 'ach-list' }, rows.length ? rows : h('p', { class: 'muted empty' }, 'Aucun succès débloqué pour l’instant. Steam est lu sur ce PC ; pour les jeux rétro, connecte RetroAchievements dans les Réglages.')));
  }

  // key : chemin d'un jeu (« steam:123 », ROM…) ou « ra:<id> ».
  async function openAchievements(key) {
    if (key && typeof key === 'object') key = (achInfo(key) || {}).key || key.path;
    const entry = (S.ach && S.ach.byKey && S.ach.byKey.get(key)) || null;
    let d = null;
    if (/^ra:/.test(key) && api.ra) d = await api.ra.game(key.slice(3));
    else if (/^steam:/.test(key) && api.achievements) d = await api.achievements.game({ path: key });
    if (!d || d.error) { toast(d && d.error ? d.error : 'Pas de succès trouvés pour ce jeu.', 'error', 5000); return; }
    const g = entry ? achGame(entry) : S.byPath.get(key) || { name: d.title || 'Jeu' };
    const list = [...d.list].sort((a, b) => (b.unlocked - a.unlocked) || (b.time - a.time));
    openOverlay(h('div', { class: 'modal ach-modal' },
      h('div', { class: 'eyebrow' }, `Succès · ${/^ra:/.test(key) ? 'RetroAchievements' : 'Steam'}`),
      h('h2', {}, g.name),
      h('div', { class: 'ach-head' }, progressBar(d.unlocked, d.total), h('b', {}, `${d.unlocked} / ${d.total}`),
        d.total && d.unlocked === d.total ? trophyIcon('inline') : null),
      h('div', { class: 'ach-items' }, list.map((a) => {
        const secret = a.hidden && !a.unlocked;
        const img = a.unlocked ? a.icon : a.iconGray || a.icon;
        return focusable(h('div', { class: 'ach-item' + (a.unlocked ? ' done' : '') },
          img ? h('img', { class: 'ach-icon', src: api.mediaUrl(img), alt: '', loading: 'lazy' }) : h('div', { class: 'ach-icon' }),
          h('div', { class: 'ach-text' },
            h('b', {}, secret ? 'Succès caché' : a.name),
            h('span', { class: 'muted' }, secret ? 'Continue à jouer pour le découvrir.' : a.desc)),
          h('span', { class: 'ach-date muted small' }, a.unlocked ? (a.time ? fmtDay(a.time) : 'Débloqué') : '')), { a: () => {} });
      }))));
    sfx('select');
  }

  // ---------- Applications (hors jeux) ----------
  // Le processus principal modifie la config : on recopie la liste pour ne pas l'écraser au prochain enregistrement.
  async function syncApps() {
    S.cfg.apps = (await api.getConfig()).apps || [];
    applyLib(await api.scan({ romm: false }));
    rerender();
  }
  async function addApp() {
    const a = await api.apps.add();
    if (!a) return;
    await syncApps();
    toast(`« ${a.name} » ajoutée aux applications`);
  }
  function appMenuItems(id) {
    const a = (S.cfg.apps || []).find((x) => x.id === id);
    if (!a) return [];
    return [
      ['Renommer', async () => {
        closeOverlay(true);
        const v = await openPrompt({ title: 'Nom de l’application', value: a.name });
        if (v === null || !v.trim()) return;
        await api.apps.update(id, { name: v });
        await syncApps();
      }],
      ['Choisir une image…', async () => { closeOverlay(true); if (await api.apps.update(id, { pickImage: true })) await syncApps(); }],
      a.image ? ['Revenir à l’icône du programme', async () => { closeOverlay(true); await api.apps.update(id, { resetImage: true }); await syncApps(); }] : null,
      ['Retirer des applications', async () => {
        closeOverlay(true);
        await api.apps.remove(id);
        await syncApps();
        toast(`« ${a.name} » retirée`);
      }],
    ].filter(Boolean);
  }

  // ---------- Images iiDB (jeux, consoles, dossiers) ----------
  function openIidb(opts = {}) {
    if (!api.iidb) return;
    const sys = opts.systemId ? sysById(opts.systemId) || S.lib.systems.find((x) => x.id === opts.systemId) : null;
    return openArtFetch({
      eyebrow: 'iiDB · iidb.iisu.network',
      title: sys ? `Images · ${sys.name}` : 'Images iiDB',
      help: 'Jaquettes iiSU, icônes, logos, héros et soundbites pour tes jeux, tes consoles et tes dossiers. Seul ce qui n’a jamais été cherché est demandé ; la première fois, cela peut prendre plusieurs minutes.',
      listenKey: 'iidbListener', onKey: 'onIidb', listen: api.iidb.onProgress,
      run: () => api.iidb.fetch(opts), cancel: () => api.iidb.cancel(),
    });
  }

  async function openArtFetch({ eyebrow, title, help, listenKey, onKey, listen, run, cancel }) {
    const bar = h('div', { class: 'progress-fill' });
    const status = h('p', { class: 'muted small' }, 'Recherche des images manquantes…');
    const count = h('div', { class: 'progress-count' }, '');
    let finished = false;
    const stop = () => { if (finished) closeOverlay(); else { cancel(); status.textContent = 'Annulation…'; } };
    const closeBtn = actionButton('Annuler', stop);
    openOverlay(h('div', { class: 'modal prompt' },
      h('div', { class: 'eyebrow' }, eyebrow), h('h2', {}, title), h('p', { class: 'muted small' }, help),
      h('div', { class: 'progress' }, bar),
      h('div', { class: 'progress-row' }, status, count),
      h('div', { class: 'actions' }, closeBtn)), { onBack: stop });
    if (!S[listenKey]) { S[listenKey] = true; listen((p) => S[onKey] && S[onKey](p)); }
    S[onKey] = (p) => {
      if (finished) return;
      bar.style.width = (p.total ? Math.round((p.done / p.total) * 100) : 0) + '%';
      count.textContent = p.total ? `${p.done} / ${p.total}` : '';
      if (p.current) status.textContent = p.current;
    };
    const res = await run();
    finished = true;
    closeBtn.textContent = 'Fermer';
    if (!res.ok) { status.textContent = res.error; status.className = 'small error-text'; return; }
    bar.style.width = '100%';
    if (!res.total) { status.textContent = 'Tout a déjà été cherché.'; return; }
    const parts = [plural(res.found, 'trouvé', 'trouvés')];
    if (res.notFound) parts.push(`${res.notFound} introuvable${res.notFound > 1 ? 's' : ''}`);
    if (res.errors) parts.push(plural(res.errors, 'erreur', 'erreurs'));
    if (res.cancelled) parts.push('annulé');
    status.textContent = parts.join(' · ');
    if (res.found) { S.dirty = true; applyLib(await api.scan({ romm: false })); }
  }

  // ---------- Images SteamGridDB (jeux PC) ----------
  async function openSgdb() {
    if (!api.sgdb) return;
    S.sgdbStatus = await api.sgdb.status();
    if (!S.sgdbStatus.hasKey) {
      toast('Ajoute d’abord ta clé SteamGridDB dans les Réglages.', 'error', 5000);
      return;
    }
    const bar = h('div', { class: 'progress-fill' });
    const status = h('p', { class: 'muted small' }, 'Recherche des images manquantes…');
    const count = h('div', { class: 'progress-count' }, '');
    let finished = false;
    const stop = () => { if (finished) closeOverlay(); else { api.sgdb.cancel(); status.textContent = 'Annulation…'; } };
    const closeBtn = actionButton('Annuler', stop);
    openOverlay(h('div', { class: 'modal prompt' },
      h('div', { class: 'eyebrow' }, 'SteamGridDB'),
      h('h2', {}, 'Images des jeux PC'),
      h('p', { class: 'muted small' }, 'Lumen cherche les jaquettes, bannières, logos et icônes qui manquent. La première fois, cela peut prendre quelques minutes.'),
      h('div', { class: 'progress' }, bar),
      h('div', { class: 'progress-row' }, status, count),
      h('div', { class: 'actions' }, closeBtn)), { onBack: stop });

    if (!S.sgdbListener) {
      S.sgdbListener = true;
      api.sgdb.onProgress((p) => S.onSgdb && S.onSgdb(p));
    }
    S.onSgdb = (p) => {
      if (finished) return;
      bar.style.width = (p.total ? Math.round((p.done / p.total) * 100) : 0) + '%';
      count.textContent = p.total ? `${p.done} / ${p.total}` : '';
      if (p.current) status.textContent = p.current;
    };
    const res = await api.sgdb.fetch();
    finished = true;
    closeBtn.textContent = 'Fermer';
    if (!res.ok) {
      status.textContent = res.error;
      status.className = 'small error-text';
      return;
    }
    bar.style.width = '100%';
    if (!res.total) { status.textContent = 'Toutes les images ont déjà été cherchées.'; return; }
    const parts = [plural(res.found, 'image trouvée', 'images trouvées')];
    if (res.notFound) parts.push(`${res.notFound} introuvable${res.notFound > 1 ? 's' : ''}`);
    if (res.errors) parts.push(plural(res.errors, 'erreur', 'erreurs'));
    if (res.cancelled) parts.push('annulé');
    status.textContent = parts.join(' · ');
    if (res.found) { S.dirty = true; applyLib(await api.scan()); }
  }

  // ---------- Jaquettes libretro ----------
  async function openThumbs(systemId) {
    if (!api.fetchThumbnails) return;
    const sys = systemId ? sysById(systemId) : null;
    const bar = h('div', { class: 'progress-fill' });
    const status = h('p', { class: 'muted small' }, 'Récupération de la liste des images…');
    const count = h('div', { class: 'progress-count' }, '');
    let finished = false;
    const closeBtn = actionButton('Annuler', () => {
      if (finished) closeOverlay();
      else { api.cancelThumbnails(); status.textContent = 'Annulation…'; }
    });
    openOverlay(h('div', { class: 'modal prompt' },
      h('div', { class: 'eyebrow' }, 'libretro-thumbnails'),
      h('h2', {}, sys ? `Jaquettes · ${sys.name}` : 'Jaquettes manquantes'),
      h('p', { class: 'muted small' }, 'Lumen télécharge les jaquettes, captures, écrans-titres et logos qui manquent, et les range dans le dossier media de chaque console.'),
      h('div', { class: 'progress' }, bar),
      h('div', { class: 'progress-row' }, status, count),
      h('div', { class: 'actions' }, closeBtn)), {
      onBack: () => { if (finished) closeOverlay(); else { api.cancelThumbnails(); status.textContent = 'Annulation…'; } },
    });

    if (!S.thumbListener && api.onThumbProgress) {
      S.thumbListener = true;
      api.onThumbProgress((p) => S.onThumb && S.onThumb(p));
    }
    S.onThumb = (p) => {
      if (finished) return;
      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      bar.style.width = pct + '%';
      count.textContent = p.total ? `${p.done} / ${p.total}` : '';
      if (p.current) status.textContent = p.current;
    };

    const res = await api.fetchThumbnails(systemId);
    finished = true;
    closeBtn.textContent = 'Fermer';
    if (!res.ok) {
      status.textContent = res.error;
      status.className = 'small error-text';
      // Pas de ROMs : on propose directement les images iiDB (qui couvrent aussi les jeux PC).
      if (res.noRoms && api.iidb) {
        const go = actionButton('Images iiDB', () => { closeOverlay(true); openIidb(); }, true);
        closeBtn.before(go);
        setFocus(go, { silent: true });
      }
      return;
    }
    bar.style.width = '100%';
    const parts = [`${plural(res.downloaded, 'image téléchargée', 'images téléchargées')}`];
    if (res.notFound) parts.push(`${res.notFound} introuvable${res.notFound > 1 ? 's' : ''}`);
    if (res.errors) parts.push(`${plural(res.errors, 'erreur', 'erreurs')}`);
    if (res.cancelled) parts.push('annulé');
    status.textContent = parts.join(' · ');
    if (res.unsupported && res.unsupported.length) {
      status.after(h('p', { class: 'muted small' }, `Pas de source libretro pour : ${res.unsupported.join(', ')}.`));
    }
    if (res.checked === 0 && !res.cancelled) status.textContent = 'Toutes les images sont déjà présentes.';
    if (res.downloaded) S.dirty = true;
    if (res.downloaded) applyLib(await api.scan());
  }

  // ---------- Actions ----------
  function applyLib(lib) {
    S.lib = lib && lib.systems ? lib : { systems: [] };
    // Jeux masqués par l'utilisateur : retirés de toutes les vues.
    const hidden = new Set(S.cfg.hidden || []);
    if (hidden.size || S.cfg.hideNsfw) {
      for (const s of S.lib.systems) s.games = s.games.filter((g) => !hidden.has(g.path) && !(S.cfg.hideNsfw && g.adult));
      S.lib.systems = S.lib.systems.filter((s) => s.games.length);
    }
    S.byPath = new Map();
    for (const s of S.lib.systems) for (const g of s.games) S.byPath.set(g.path, g);
    for (const s of S.lib.systems) {
      const n = (S.cfg.sysNames || {})[s.id];
      if (n) { s.origName = s.origName || s.name; s.name = n.name || s.name; if (n.short) s.short = n.short; }
    }
    applyArtOverrides();
    for (const [p, file] of Object.entries(S.cfg.customSounds || {})) {
      const g = S.byPath.get(p);
      if (g) { g.soundbite = file; g.customSound = true; }
    }
  }

  function hideGame(g) {
    S.cfg.hidden = [...new Set([...(S.cfg.hidden || []), g.path])];
    saveCfg();
    applyLib(S.lib);
    toast(`${g.name} est masqué (Réglages → Jeux masqués pour le réafficher)`);
    rerender();
  }

  // Rescan silencieux après un démarrage depuis le cache : on ne redessine que si quelque chose a changé.
  async function refreshInBackground() {
    let lib;
    try { lib = await api.scan(); } catch { return; }
    const sig = (l) => JSON.stringify(l.systems.map((s) => [s.id, s.games.length, s.games.map((g) => g.path + (g.cover || '') + (g.soundbite || '') + (g.video || '')).join('|').length]));
    if (sig(lib) === sig(S.lib)) return;
    applyLib(lib);
    if (!S.overlay && !S.inGame) rerender();
  }

  async function rescan(silent) {
    if (!silent) toast('Analyse de la bibliothèque…', 'info', 60000);
    try {
      applyLib(await api.scan());
    } catch (err) {
      applyLib(null);
      toast(`Erreur pendant l’analyse : ${err.message}`, 'error', 5000);
    }
    if (S.lib.error) toast(S.lib.error, 'error', 5000);
    else if (S.lib.romm && S.lib.romm.error) toast(`RomM indisponible (liste en cache utilisée) : ${S.lib.romm.error}`, 'error', 6000);
    else if (!silent) toast(`${plural(totalGames(), 'jeu trouvé', 'jeux trouvés')} sur ${plural(S.lib.systems.length, 'console', 'consoles')}`);
    if (S.route.view === 'settings') rerender();
    else render(0);
  }

  async function pickRoms() {
    const p = await api.pickFolder('Choisis ton dossier de ROMs', S.cfg.romsRoot);
    if (!p) return;
    S.cfg.romsRoot = p;
    await saveCfg();
    await rescan();
  }

  async function pickPath(key, title) {
    const p = await api.pickFolder(title, S.cfg[key]);
    if (!p) return;
    S.cfg[key] = p;
    await saveCfg();
    await rescan();
  }

  async function pickEmulator(id) {
    const emu = EMULATORS.find((e) => e.id === id);
    const p = await api.pickFile(`Où se trouve ${emu.name} ?`, S.cfg.emulators[id]);
    if (!p) return;
    S.cfg.emulators[id] = p;
    await saveCfg();
    toast(`${emu.name} configuré`);
    if (S.route.view === 'settings') rerender();
  }

  // Choix de l'émulateur d'une console dans une liste ; la commande à la main reste possible.
  function editCommand(sys) {
    const current = S.cfg.commands[sys.id] || sys.command;
    const items = (sys.alts || []).map((a) => [(a.command === current ? '✓ ' : '　 ') + a.label, async () => {
      if (a.command === sys.command) delete S.cfg.commands[sys.id]; else S.cfg.commands[sys.id] = a.command;
      await saveCfg();
      closeOverlay(true);
      toast(`${sys.name} : ${a.label}`);
      rerender();
    }]);
    items.push(['✎ Commande personnalisée…', () => { closeOverlay(true); editCommandText(sys); }]);
    if (S.cfg.commands[sys.id]) items.push(['Revenir à la commande par défaut', async () => { delete S.cfg.commands[sys.id]; await saveCfg(); closeOverlay(true); rerender(); }]);
    openMenu(`Émulateur · ${sys.name}`, items);
  }

  async function editCommandText(sys) {
    const current = S.cfg.commands[sys.id] || sys.command;
    const v = await openPrompt({
      title: `Commande · ${sys.name}`,
      value: current,
      resetValue: '',
      help: 'Variables : {rom}, {romDir}, {romName}, {retroarch}, {retroarchDir}, {dolphin}, {pcsx2}, {cemu}, {eden}, {azahar}. Mets {open} pour ouvrir le fichier avec Windows.',
    });
    if (v === null) return;
    if (!v.trim() || v.trim() === sys.command) delete S.cfg.commands[sys.id];
    else S.cfg.commands[sys.id] = v.trim();
    await saveCfg();
    rerender();
  }

  function toggleFav(g) {
    const on = !isFav(g);
    S.cfg.favorites = on ? [g.path, ...S.cfg.favorites] : S.cfg.favorites.filter((p) => p !== g.path);
    saveCfg();
    toast(on ? `★ ${g.name} ajouté aux favoris` : `${g.name} retiré des favoris`);
    sfx('select');
    if (S.overlay) S.dirty = true;
    else rerender();
  }

  // Écran de lancement : la jaquette part de la tuile et vient se poser au centre.
  function launchFx(g, fromEl) {
    const sys = sysById(g.system) || {};
    const art = h('div', { class: 'lf-art' + (fromEl ? '' : ' pop') },
      g.cover ? h('img', { src: api.mediaUrl(g.cover), alt: '' }) : fallbackArt(g.name, sys.color, sys.short));
    const bg = h('div', { class: 'lf-bg' });
    const bgImg = g.background || g.cover;
    bg.style.backgroundImage = bgImg
      ? `url("${api.mediaUrl(bgImg)}")`
      : `radial-gradient(circle at 50% 42%, ${sys.color || '#334155'} 0%, transparent 65%)`;
    const sub = h('div', { class: 'lf-sub' }, h('span', { class: 'lf-spin' }), h('span', {}, `Lancement · ${sys.name || ''}`));
    const fill = h('div', { class: 'lf-progress-fill' });
    const progText = h('div', { class: 'lf-progress-text' });
    const root = h('div', { class: 'launch-fx', '--c': sys.color || '#475569' },
      bg,
      h('div', { class: 'lf-stage' }, h('span', { class: 'lf-ring' }), h('span', { class: 'lf-ring' }), h('span', { class: 'lf-ring' }), art),
      h('div', { class: 'lf-title' }, g.name),
      sub,
      h('div', { class: 'lf-progress' }, fill),
      progText);
    document.body.append(root);
    cursor.classList.remove('on');
    if (fromEl && !reduceMotion) {
      const a = fromEl.getBoundingClientRect();
      const b = art.getBoundingClientRect();
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      art.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${a.width / b.width})` }, { transform: 'none' }],
        { duration: 650, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    }
    return {
      downloading() {
        root.classList.add('downloading');
        sub.replaceChildren(h('span', { class: 'lf-spin' }), h('span', {}, 'Téléchargement depuis RomM'));
        progText.textContent = `Connexion… · ${Input.lastDevice === 'keyboard' ? 'Échap' : 'B'} pour annuler`;
      },
      progress(p) {
        const pct = p.total ? Math.min(100, (p.done / p.total) * 100) : 0;
        fill.style.width = `${pct}%`;
        const cancel = `${Input.lastDevice === 'keyboard' ? 'Échap' : 'B'} pour annuler`;
        progText.textContent = p.finishing
          ? 'Extraction de l’archive…'
          : `${fmtSize(p.done)}${p.total ? ` / ${fmtSize(p.total)} · ${Math.round(pct)} %` : ''} · ${cancel}`;
      },
      launching() {
        root.classList.remove('downloading');
        sub.replaceChildren(h('span', { class: 'lf-spin' }), h('span', {}, `Lancement · ${sys.name || ''}`));
      },
      playing() {
        root.classList.add('playing');
        sub.replaceChildren(h('span', { class: 'lf-dot' }), h('span', {}, 'En jeu · maintiens Select + Start pour quitter'));
      },
      close() {
        root.classList.add('out');
        setTimeout(() => root.remove(), 420);
        placeCursor(true);
      },
    };
  }

  // Pendant une partie, Lumen reste ouvert derrière l'émulateur et surveille Select + Start.
  let gameWatch = 0;
  function watchQuitCombo() {
    clearInterval(gameWatch);
    let heldSince = 0;
    gameWatch = setInterval(() => {
      if (!S.inGame) { clearInterval(gameWatch); return; }
      const pads = Input.getPads();
      const combo = pads.some((p) => p.buttons[8] && p.buttons[9] && p.buttons[8].pressed && p.buttons[9].pressed);
      if (!combo) { heldSince = 0; return; }
      if (!heldSince) heldSince = performance.now();
      else if (performance.now() - heldSince > 1500) {
        heldSince = Infinity;
        api.quitGame && api.quitGame();
      }
    }, 100);
  }

  async function launch(g) {
    if (S.launching || S.inGame) return;
    S.launching = true;
    stopPreview();
    sfx(g.source === 'pc' || g.source === 'app' ? 'launchApp' : 'launch');
    const from = S.focusEl && S.focusEl._game === g ? S.focusEl : null;
    const fx = launchFx(g, from);
    if (g.source === 'romm' && !g.downloaded) {
      const ok = await downloadFromRomm(g, fx);
      if (!ok) { S.launching = false; fx.close(); return; }
      fx.launching();
    }
    await wait(reduceMotion ? 0 : 950);
    let res;
    try { res = await api.launch(g); } catch (err) { res = { ok: false, error: err.message }; }
    S.launching = false;
    if (!res.ok) { fx.close(); toast(res.error, 'error', 6000); return; }
    S.cfg.recent = [g.path, ...S.cfg.recent.filter((p) => p !== g.path)].slice(0, 30);
    S.cfg.lastPlayed = S.cfg.lastPlayed || {};
    S.cfg.lastPlayed[g.path] = Date.now();
    saveCfg();
    S.launchFx = fx;
    const prof = profileOf(g);
    if (prof && prof.enabled) { startMapper(prof); toast('🎮 Profil manette → clavier actif (Select + Start pour le couper)', 'info', 4000); }
    // Pas d'événement de fin pour un jeu PC ouvert par Windows : on referme l'écran après un moment.
    if (res.detached) { setTimeout(() => { if (S.launchFx === fx) { fx.close(); S.launchFx = null; } }, 3000); return; }
    S.inGame = true;
    updateMusic();
    Input.paused = true;
    fx.playing();
    watchQuitCombo();
  }

  function onGameExit(d) {
    stopMapper();
    S.inGame = false;
    updateMusic();
    Input.paused = false;
    clearInterval(gameWatch);
    Input.lock(900);
    if (S.launchFx) { S.launchFx.close(); S.launchFx = null; }
    if (d.seconds > 5) {
      S.cfg.playtime[d.path] = (S.cfg.playtime[d.path] || 0) + d.seconds;
      saveCfg();
    }
    if (!S.overlay && (S.route.view === 'home' || S.dirty)) { S.dirty = false; rerender(); }
  }

  function applyCfg() {
    document.documentElement.style.setProperty('--accent', S.cfg.accent);
    Input.swapAB = !!S.cfg.swapAB;
    Input.nintendoConfirm = S.cfg.nintendoConfirm !== false;
  }

  // ---------- Entrées ----------
  function onAction(a) {
    handleAction(a);
    // Le contenu peut bouger après une action (texte, résultats…) : on recale le curseur.
    requestAnimationFrame(() => { if (!S.cursorHold) placeCursor(); });
  }

  function handleAction(a) {
    if (a === 'b' && S.homeEdit && !S.overlay) { toggleHomeEdit(false); return; }
    if (S.mouse) { S.mouse = false; document.body.classList.add('no-cursor'); }
    // Pendant un lancement ou un téléchargement, seule l'annulation (B) est active.
    if (S.launching) {
      if (a === 'b' && S.downloading && api.romm) api.romm.cancel();
      return;
    }
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') { move(a); return; }
    if (a === 'fullscreen') { api.toggleFullscreen(); return; }
    const act = S.focusEl && S.focusEl._act;

    if (a === 'a' && act && act.a) pressFx(S.focusEl);
    if (S.overlay) {
      const o = S.overlay.opts;
      if (a === 'a') { if (o.onA && o.onA()) return; if (act && act.a) { sfx('select'); act.a(); } }
      else if (a === 'b') { if (o.onBack) o.onBack(); else closeOverlay(); }
      else if (a === 'menu') closeOverlay();
      return;
    }
    switch (a) {
      case 'a': if (act && act.a) act.a(); break;
      case 'x': if (act && act.x) act.x(); break;
      case 'y': if (act && act.y) act.y(); break;
      case 'b': back(); break;
      case 'lb': switchTab(-1); break;
      case 'rb': switchTab(1); break;
      case 'lt': jumpLetter(-1); break;
      case 'rt': jumpLetter(1); break;
      case 'search': if (S.route.view !== 'search') { S.trans = 'v-fade'; openTab('search'); } break;
      case 'menu': openQuickMenu(); break;
      default: break;
    }
  }

  document.addEventListener('mousemove', (e) => {
    if (!e.movementX && !e.movementY) return;
    if (!S.mouse) { S.mouse = true; document.body.classList.remove('no-cursor'); }
  });

  window.addEventListener('lumen:pad', (e) => {
    const PAD_NAMES = { ps4: 'PS4 (DualShock 4)', ps5: 'PS5 (DualSense)', xbox: 'Xbox', switch: 'Switch' };
    const name = PAD_NAMES[e.detail.type] || '';
    toast(e.detail.connected ? `🎮 Manette ${name} connectée`.replace('  ', ' ') : 'Manette déconnectée');
    if (e.detail.connected) { Input.rumble(0.5, 120); setHints(S.hintKind); }
  });

  // ---------- Horloge & batterie ----------
  function startClock() {
    const tick = () => {
      const now = new Date();
      $('#clock').textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      $('#date').textContent = now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    };
    tick();
    setInterval(tick, 10000);
    if (navigator.getBattery) {
      navigator.getBattery().then((b) => {
        const upd = () => {
          const hide = b.charging && b.level >= 0.999;
          $('#battery').textContent = hide ? '' : `${b.charging ? '⚡' : ''}${Math.round(b.level * 100)} %`;
        };
        upd();
        b.addEventListener('levelchange', upd);
        b.addEventListener('chargingchange', upd);
      }).catch(() => {});
    }
  }

  // ---------- Démarrage ----------
  async function init() {
    const started = performance.now();
    document.body.append(cursor);
    document.body.classList.add('has-cursor');
    Input.lock(reduceMotion ? 0 : 1400);
    S.cfg = await api.getConfig();
    S.defs = await api.systems();
    await refreshRommStatus();
    if (api.sgdb) S.sgdbStatus = await api.sgdb.status();
    if (api.ra) S.raStatus = await api.ra.status();
    renderMuteIndicator();
    applyWallpaper();
    if (api.update) {
      api.update.state().then((st) => { S.update = st; });
      api.update.onState((st) => {
        const was = S.update && S.update.status;
        S.update = st;
        if (st.status === 'ready' && was !== 'ready') toast(`⬆ Lumen ${st.version} est prête : elle s’installera à la fermeture (ou Réglages → Lumen → Mises à jour).`, 'info', 8000);
        if (S.route.view === 'settings' && S.setCat === 'about' && !S.overlay) rerender();
      });
    }
    loadMusic();
    loadUiSounds();
    // Les succès sont lus en arrière-plan pour pouvoir les afficher dans les fiches.
    if (api.achievements || api.ra) setTimeout(() => loadAchievements(), 4000);
    applyCfg();
    Input.on(onAction);
    Input.onDevice(() => { setHints(S.hintKind); renderDock(); });
    api.onGameExit(onGameExit);
    // Jaquettes iiDB revérifiées en arrière-plan : on recharge la bibliothèque sans interrompre.
    if (api.onLibraryChanged) api.onLibraryChanged(async () => { try { applyLib(await api.scan({ romm: false })); if (!document.querySelector('.overlay')) rerender(); } catch { /* rien */ } });
    startClock();
    setHints('none');
    S.cursorHold = true;
    // Démarrage instantané depuis le cache, puis vérification du disque en arrière-plan.
    const cached = api.cachedLibrary ? await api.cachedLibrary() : null;
    const useCache = cached && cached.romsRoot && cached.romsRoot === S.cfg.romsRoot;
    if (useCache) applyLib(cached);
    else await rescan(true);

    // Écran de démarrage : on attend un minimum pour laisser l'animation du logo se jouer.
    await wait(reduceMotion ? 0 : Math.max(0, 1150 - (performance.now() - started)));
    const boot = $('#boot');
    if (boot) {
      boot.classList.add('out');
      setTimeout(() => boot.remove(), 700);
    }
    document.body.classList.remove('booting');
    S.cursorHold = false;
    S.trans = 'v-in';
    render(0);
    sfx('boot');
    if (useCache) refreshInBackground();
    if (!S.cfg.romsRoot) openWelcome();
  }

  init().catch((err) => toast(`Erreur au démarrage : ${err.message}`, 'error', 10000));
})();
