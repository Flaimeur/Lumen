// Teste le client RomM contre un faux serveur local qui imite l'API RomM 5.x.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const romm = require('../src/romm');
const { scanLibrary } = require('../src/scanner');

const TOKEN = 'rmm_' + 'a'.repeat(64);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-romm-'));

// Archive zip pour un jeu PS1 multi-fichiers (créée avec le tar de Windows).
const zipSrc = path.join(tmp, 'zipsrc');
fs.mkdirSync(zipSrc);
fs.writeFileSync(path.join(zipSrc, 'Saga (Disc 1).cue'), 'FILE x');
fs.writeFileSync(path.join(zipSrc, 'Saga (Disc 2).cue'), 'FILE y');
fs.writeFileSync(path.join(zipSrc, 'Saga.m3u'), 'Saga (Disc 1).cue\nSaga (Disc 2).cue\n');
const zipFile = path.join(tmp, 'saga.zip');
execFileSync('tar', ['-a', '-c', '-f', zipFile, '-C', zipSrc, '.']);

const SNES_ROM = Buffer.alloc(256 * 1024, 7);
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ffbf1e000502027fa1d6e40000000049454e44ae426082', 'hex');

const platforms = [
  { id: 1, slug: 'snes', fs_slug: 'snes', name: 'Super Nintendo', rom_count: 3 },
  { id: 2, slug: 'ps', fs_slug: 'psx', name: 'PlayStation', rom_count: 1 },
  { id: 3, slug: 'vectrex', fs_slug: 'vectrex', name: 'Vectrex', rom_count: 2 },
];
const roms = {
  1: [
    { id: 10, name: 'Aventure', fs_name: 'Aventure (Europe).sfc', fs_name_no_ext: 'Aventure (Europe)', fs_size_bytes: SNES_ROM.length, has_multiple_files: false, path_cover_large: '/assets/romm/resources/roms/1/10/cover/big.png', summary: 'Un jeu.', metadatum: { genres: ['RPG'], first_release_date: 794016000000 } },
    { id: 11, name: 'Course', fs_name: 'Course (USA).sfc', fs_name_no_ext: 'Course (USA)', fs_size_bytes: 10, has_multiple_files: false },
    { id: 12, name: 'Déjà là', fs_name: 'Local (USA).sfc', fs_name_no_ext: 'Local (USA)', fs_size_bytes: 10, has_multiple_files: false },
  ],
  2: [{ id: 20, name: 'Saga', fs_name: 'Saga', fs_name_no_ext: 'Saga', fs_size_bytes: fs.statSync(zipFile).size, has_multiple_files: true }],
};

let lastAuth = '';
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/api/heartbeat') return json({ SYSTEM: { VERSION: '5.4.0' } });
  lastAuth = req.headers.authorization || '';
  if (lastAuth !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end(); }
  if (u.pathname === '/api/platforms') return json(platforms);
  if (u.pathname === '/api/roms') {
    const list = roms[u.searchParams.get('platform_ids')] || [];
    const limit = Number(u.searchParams.get('limit'));
    const offset = Number(u.searchParams.get('offset'));
    return json({ items: list.slice(offset, offset + limit), total: list.length, limit, offset });
  }
  if (u.pathname.startsWith('/assets/')) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PNG); }
  const m = /^\/api\/roms\/(\d+)\/content\/(.+)$/.exec(u.pathname);
  if (m) {
    const body = m[1] === '20' ? fs.readFileSync(zipFile) : SNES_ROM;
    res.writeHead(200, { 'content-length': body.length });
    return res.end(body);
  }
  res.writeHead(404); res.end();
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dl = path.join(tmp, 'downloads');

  // Correspondance des plateformes
  assert.strictEqual(romm.systemFor({ slug: 'ps', fs_slug: 'psx' }).id, 'psx');
  assert.strictEqual(romm.systemFor({ slug: 'ngc', fs_slug: 'ngc' }).id, 'gc');
  assert.strictEqual(romm.systemFor({ slug: 'genesis-slash-megadrive', fs_slug: 'genesis-slash-megadrive' }).id, 'genesis');
  assert.strictEqual(romm.systemFor({ slug: 'vectrex', fs_slug: 'vectrex' }), null);

  // Mauvais jeton → message clair
  const bad = new romm.RommClient({ url: base, token: 'rmm_mauvais' });
  await assert.rejects(bad.platforms(), /refusé/);

  const client = new romm.RommClient({ url: base.replace('http://', ''), token: TOKEN });
  assert.strictEqual((await client.heartbeat()).version, '5.4.0');
  const lib = await romm.fetchRommLibrary(client, dl);
  assert.deepStrictEqual(lib.skipped, ['Vectrex']);
  const snes = lib.systems.find((s) => s.id === 'snes');
  assert.strictEqual(snes.games.length, 3);
  const av = snes.games.find((g) => g.rommId === 10);
  assert.strictEqual(av.downloaded, false);
  assert.strictEqual(av.path, 'romm://10');
  assert.strictEqual(av.year, '1995');
  assert.strictEqual(av.genre, 'RPG');

  // Fusion : le fichier local du même nom gagne sur RomM
  const romsRoot = path.join(tmp, 'ROMs');
  fs.mkdirSync(path.join(romsRoot, 'snes'), { recursive: true });
  fs.writeFileSync(path.join(romsRoot, 'snes', 'Local (USA).sfc'), '');
  const merged = romm.mergeLibraries(await scanLibrary({ romsRoot }), JSON.parse(JSON.stringify(lib)));
  const msnes = merged.systems.find((s) => s.id === 'snes');
  assert.strictEqual(msnes.games.length, 3, 'Local (USA) ne doit pas apparaître deux fois');
  assert.ok(merged.systems.find((s) => s.id === 'psx'), 'la PS1 de RomM est ajoutée même sans dossier local');

  // Téléchargement d'un jeu simple, avec progression
  let progressCalls = 0;
  const file = await romm.downloadRom(client, av, { id: 'snes', ext: ['sfc'] }, dl, { onProgress: () => { progressCalls++; } });
  assert.ok(file.endsWith(path.join('snes', 'Aventure (Europe).sfc')));
  assert.strictEqual(fs.statSync(file).size, SNES_ROM.length);
  assert.ok(progressCalls >= 1);

  // Jeu multi-disques : zip extrait, le .m3u est choisi pour le lancement
  const saga = lib.systems.find((s) => s.id === 'psx').games[0];
  const sagaFile = await romm.downloadRom(client, saga, require('../src/systems').find((s) => s.id === 'psx'), dl);
  assert.ok(sagaFile.endsWith('Saga.m3u'), sagaFile);

  // L'état « téléchargé » se met à jour depuis le disque
  const refreshed = romm.refreshLocalState(JSON.parse(JSON.stringify(lib)), dl);
  assert.strictEqual(refreshed.systems.find((s) => s.id === 'snes').games.find((g) => g.rommId === 10).downloaded, true);
  assert.strictEqual(refreshed.systems.find((s) => s.id === 'psx').games[0].path, sagaFile);

  // Jaquette : téléchargée avec le jeton puis servie depuis le cache
  const cover = await romm.cachedCover(client, path.join(tmp, 'covers'), av.cover);
  assert.ok(cover && fs.readFileSync(cover).equals(PNG));
  assert.strictEqual(lastAuth, `Bearer ${TOKEN}`);

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('OK : client RomM (connexion, bibliothèque, fusion, téléchargements, jaquettes).');
})().catch((err) => { console.error(err); server.close(); process.exit(1); });
