// Test réseau réel : télécharge quelques jaquettes libretro dans une bibliothèque factice.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fetchMissingThumbnails, buildMatcher } = require('../src/thumbnails');
const { scanLibrary } = require('../src/scanner');

(async () => {
  // Correspondance des noms (sans réseau)
  const match = buildMatcher(['Super Mario World (USA)', 'Super Mario World (Europe) (Rev 1)', 'Legend of Zelda, The - A Link to the Past (USA)', 'Tom & Jerry (USA)']);
  assert.strictEqual(match('Super Mario World (USA)'), 'Super Mario World (USA)');
  assert.strictEqual(match('Super Mario World (France)'), 'Super Mario World (USA)');
  assert.strictEqual(match('Super Mario World (Europe)'), 'Super Mario World (Europe) (Rev 1)');
  assert.strictEqual(match('Tom _ Jerry (USA)'), 'Tom & Jerry (USA)');
  assert.strictEqual(match('Tom and Jerry'), 'Tom & Jerry (USA)');
  assert.strictEqual(match('Inconnu (USA)'), null);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-thumbs-'));
  const roms = path.join(root, 'ROMs');
  for (const f of ['snes/Super Mario World (USA).sfc', 'gba/Metroid Fusion (Europe).gba', 'snes/Jeu Qui N Existe Pas.sfc']) {
    fs.mkdirSync(path.dirname(path.join(roms, f)), { recursive: true });
    fs.writeFileSync(path.join(roms, f), '');
  }
  const lib = await scanLibrary({ romsRoot: roms });
  const stats = await fetchMissingThumbnails({
    romsRoot: roms, cacheDir: path.join(root, 'cache'), systems: lib.systems, kinds: ['covers', 'logos'],
    onProgress: (p) => process.stdout.write(`\r${p.done}/${p.total} `),
  });
  console.log('\n', stats);
  assert.ok(fs.existsSync(path.join(roms, 'snes/media/covers/Super Mario World (USA).png')));
  assert.ok(fs.existsSync(path.join(roms, 'gba/media/covers/Metroid Fusion (Europe).png')));
  const after = await scanLibrary({ romsRoot: roms });
  const smw = after.systems.find((s) => s.id === 'snes').games.find((g) => g.name === 'Super Mario World');
  assert.ok(smw.cover, 'le scanner doit trouver la jaquette téléchargée');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('OK : jaquettes libretro téléchargées et reconnues.');
})().catch((err) => { console.error(err); process.exit(1); });
