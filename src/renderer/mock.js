// Données de démonstration quand l'interface est ouverte dans un navigateur (hors Electron).
(function () {
  'use strict';
  if (window.lumen) return;

  const SYS = [
    ['snes', 'Super Nintendo', 'SNES', '#7b5ea7'],
    ['gba', 'Game Boy Advance', 'GBA', '#5b4fcf'],
    ['n64', 'Nintendo 64', 'N64', '#2a9d8f'],
    ['psx', 'PlayStation', 'PS1', '#8a94a6'],
    ['genesis', 'Mega Drive / Genesis', 'MD', '#34495e'],
    ['gc', 'GameCube', 'GC', '#6d4fc2'],
    ['dreamcast', 'Dreamcast', 'DC', '#e07a1f'],
  ];
  const A = ['Star', 'Pixel', 'Neon', 'Shadow', 'Crystal', 'Turbo', 'Sky', 'Iron', 'Moon', 'Echo', 'Rogue', 'Lunar', 'Thunder', 'Velvet', 'Comet', 'Ember'];
  const B = ['Courier', 'Knight', 'Racer', 'Odyssey', 'Legends', 'Quest', 'Drift', 'Tactics', 'Rally', 'Saga', 'Runner', 'Kingdom', 'Arena', 'Voyage', 'Fighters', 'Islands'];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const systems = SYS.map(([id, name, short, color]) => {
    const count = 10 + Math.floor(rnd() * 24);
    const games = Array.from({ length: count }, (_v, i) => {
      const n = `${pick(A)} ${pick(B)}${rnd() > 0.7 ? ' ' + (2 + Math.floor(rnd() * 3)) : ''}`;
      return {
        path: `C:/Demo/${id}/${n} ${i}.rom`, system: id, name: n, cover: null, background: null,
        desc: 'Jeu de démonstration généré pour l’aperçu de l’interface. Dans l’application, cette zone affiche la description venant de tes métadonnées ES-DE.',
        developer: 'Studio Démo', publisher: '', genre: pick(['Action', 'Plateforme', 'Course', 'RPG', 'Combat']),
        players: pick(['1', '1-2', '1-4']), year: String(1990 + Math.floor(rnd() * 15)), rating: Math.round(rnd() * 10) / 2 || null,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    // Quelques jeux « RomM » de démo, pas encore téléchargés.
    for (const g of games.slice(-3)) Object.assign(g, { source: 'romm', rommId: Math.floor(rnd() * 9999), rommFile: g.name + '.zip', size: 48e6, downloaded: false, path: `romm://${g.name}` });
    return { id, name, short, color, folder: id, games };
  });
  // Jeux Steam de démo : genres et jeux non installés ; une application.
  const GENRES = ['Action', 'Aventure', 'RPG', 'Simulation', 'Stratégie', 'Indépendant'];
  systems.push({
    id: 'pc-steam', name: 'Steam', short: 'Steam', color: '#2a475e', folder: null, pc: true,
    games: Array.from({ length: 14 }, (_v, i) => {
      const genres = [pick(GENRES), pick(GENRES)].filter((x, k, a) => a.indexOf(x) === k);
      return { path: `steam:${100 + i}`, system: 'pc-steam', name: `${pick(A)} ${pick(B)} ${i}`, cover: "demo-cover", source: 'pc', store: 'steam',
        installed: i % 3 === 0, genres, genre: genres.join(', '), adult: i % 4 === 1, tags: [pick(['Horreur', 'Anime', 'Multijoueur', 'Jeu solo']), pick(['2D', '3D', 'Exploration'])], year: '2024', developer: 'Studio Démo', desc: '' };
    }).sort((a, b) => a.name.localeCompare(b.name)),
  });
  systems.push({ id: 'apps', name: 'Applications', short: 'Apps', color: '#0e7490', folder: null, pc: true, apps: true,
    games: [{ path: 'app:demo', system: 'apps', name: 'Word', source: 'app', cover: null, appIcon: true, target: 'C:/Demo/WINWORD.EXE' }] });

  let cfg = {
    romsRoot: 'C:/Demo', mediaRoot: '', gamelistsRoot: '',
    emulators: { retroarch: '', dolphin: '', pcsx2: '', cemu: '', eden: '', azahar: '' },
    commands: {}, swapAB: false, fullscreen: true, sounds: true, soundbites: true, videos: true, volume: 0.7,
    sort: 'name', lastPlayed: {}, accent: '#5eead4', hidden: [], pcStores: { steam: true, epic: true, gog: true },
    collections: {
      RPG: [systems[0].games[1].path, systems[3].games[4].path, systems[2].games[2].path, systems[5].games[0].path],
      Coop: [systems[2].games[5].path, systems[4].games[1].path],
      'À finir': [],
    },
    favorites: [systems[0].games[2].path, systems[2].games[1].path],
    recent: [systems[1].games[3].path, systems[0].games[5].path, systems[3].games[0].path, systems[5].games[2].path],
    // Démo : du temps de jeu et des sessions pour la page Statistiques.
    playtime: Object.fromEntries(systems.slice(0, 5).flatMap((x, i) => x.games.slice(0, 3).map((g, j) => [g.path, (i * 3 + j + 1) * 5400 + j * 900]))),
    sessions: Array.from({ length: 40 }, (_, i) => ({ p: systems[i % 4].games[i % 3].path, t: Date.now() - i * 2.1 * 864e5, s: 1200 + ((i * 2731) % 9000) })),
    ratings: { [systems[0].games[0].path]: 5, [systems[0].games[2].path]: 4, [systems[1].games[1].path]: 3 },
  };

  window.LumenMock = {
    preview: true,
    getConfig: async () => JSON.parse(JSON.stringify(cfg)),
    setConfig: async (c) => (cfg = JSON.parse(JSON.stringify(c))),
    systems: async () => SYS.map(([id, name, short, color]) => ({ id, name, short, color, command: '"{retroarch}" -f -L "{retroarchDir}\\cores\\…_libretro.dll" "{rom}"' })),
    artOptions: async () => {
      const opt = (n, t) => Array.from({ length: n }, (_v, i) => ({ url: `demo:${t}${i}`, thumb: `demo:${t}${i}`, label: `${t} · auteur ${i + 1}`, likes: n - i }));
      return { ok: true, cover: opt(8, 'iisu boxart'), icon: opt(3, 'icon'), logo: opt(2, 'logo'), hero: opt(4, 'hero') };
    },
    pickImage: async () => null,
    media: (() => { let playing = true; let vol = 0.7; return async (cmd) => { if (cmd === 'toggle') playing = !playing; if (/^vol /.test(cmd || '')) { vol = Number(cmd.slice(4)); return { vol }; } return cmd === 'state' || !cmd ? { active: true, status: playing ? 'Playing' : 'Paused', title: 'Blinding Lights', artist: 'The Weeknd', app: 'Spotify.exe', thumb: '', vol } : { ok: true }; }; })(),
    mapper: { start: async () => true, send: () => {}, stop: async () => true },
    achievements: {
      summary: async () => ({
        games: systems.find((s) => s.id === 'pc-steam').games.slice(0, 6).map((g, i) => ({ path: g.path, total: 20 + i * 5, unlocked: i === 0 ? 20 : i * 3, last: Date.now() - i * 864e5 })),
        recent: systems.find((s) => s.id === 'pc-steam').games.slice(0, 4).map((g, i) => ({ path: g.path, name: `Succès ${i + 1}`, desc: 'Description', icon: null, time: Date.now() - i * 36e5 })),
      }),
      game: async () => ({ total: 4, unlocked: 2, list: [
        { name: 'Premier pas', desc: 'Finir le tutoriel.', unlocked: true, time: Date.now() },
        { name: 'Explorateur', desc: 'Visiter 10 zones.', unlocked: true, time: Date.now() - 864e5 },
        { name: 'Secret', desc: '', hidden: true, unlocked: false, time: 0 },
        { name: 'Maître', desc: 'Tout finir.', unlocked: false, time: 0 }] }),
    },
    scan: async () => ({ systems, collectionArt: { RPG: { icon: 'demo-cover' } } }),
    cachedLibrary: async () => null,
    romm: {
      _cb: null,
      _stop: false,
      status: async () => ({ hasToken: false, hasPassword: false, encrypted: true }),
      setSecret: async () => true,
      test: async () => ({ ok: false, error: 'Aperçu navigateur : RomM n’est disponible que dans l’application.' }),
      onProgress(cb) { this._cb = cb; },
      cancel() { this._stop = true; },
      async download(g) {
        this._stop = false;
        const total = 48e6;
        for (let done = 0; done <= total; done += 2.4e6) {
          if (this._stop) return { ok: false, cancelled: true, error: 'Téléchargement annulé.' };
          if (this._cb) this._cb({ done, total });
          await new Promise((r) => setTimeout(r, 90));
        }
        return { ok: true, path: `C:/Demo/romm/${g.rommFile}` };
      },
      deleteLocal: async () => ({ ok: true }),
    },
    quitGame: async () => false,
    launch: async () => {
      await new Promise((r) => setTimeout(r, 400));
      return { ok: false, error: 'Aperçu navigateur : le lancement ne fonctionne que dans l’application.' };
    },
    pickFolder: async () => null,
    pickFile: async () => null,
    quit: () => {},
    toggleFullscreen: async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      return !!document.fullscreenElement;
    },
    onGameExit: () => {},
    companions: { list: async () => [{ id: 'lueur', name: 'Lueur', exe: 'C:/Demo/Lueur.exe', running: true, color: '#ff9227', status: 'Blanc 2200 K · 40 %', actions: [{ id: 'on', label: 'Allumer', icon: '☀' }, { id: 'off', label: 'Éteindre', icon: '🌙' }, { id: 'toggle', label: 'Basculer', icon: '⟳' }, { id: 'screen', label: 'Mode écran', icon: '⛶' }] }], run: async () => ({ ok: true }) },
    capture: { arm: async () => true, take: async () => ({ ok: true }), list: async (name) => (/Ember|Echo/.test(name) ? [{ path: 'demo-cover', time: Date.now() - 36e5 }, { path: 'demo-cover', time: Date.now() - 864e5 }] : []), open: async () => '', onTaken: () => {} },
    // Mises à jour (démo) : window.__lumenUpdate({ status: 'ready', version: '9.9.9', notes: [...] }) simule une version prête.
    update: { state: async () => ({ status: 'uptodate', current: '0.19.0', packaged: false }), check: async () => ({ status: 'dev' }), install: async () => true, notes: async () => null, onState: (cb) => { window.__lumenUpdate = (st) => cb({ current: '0.19.0', ...st }); } },
    _thumbCb: null,
    _thumbStop: false,
    onThumbProgress(cb) { this._thumbCb = cb; },
    cancelThumbnails() { this._thumbStop = true; },
    async fetchThumbnails() {
      this._thumbStop = false;
      const total = 40;
      for (let done = 0; done <= total; done++) {
        if (this._thumbStop) return { ok: true, checked: done, downloaded: Math.floor(done * 0.8), notFound: 0, unsupported: [], errors: 0, cancelled: true };
        if (this._thumbCb) this._thumbCb({ done, total, downloaded: Math.floor(done * 0.8), current: `Jeu de démo ${done}` });
        await new Promise((r) => setTimeout(r, 60));
      }
      return { ok: true, checked: total, downloaded: 32, notFound: 8, unsupported: [], errors: 0, cancelled: false };
    },
    mediaUrl: (p) => (p === 'demo-cover' ? 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="hsl(' + Math.floor(Math.random() * 360) + ',60%,45%)"/></svg>') : ''),
  };
})();
