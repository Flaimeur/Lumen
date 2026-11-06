// Vérifications rapides du scanner et de la construction des commandes, sans lancer Electron.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanLibrary, findSystem, cleanName } = require('../src/scanner');
const { buildLaunch, tokenize } = require('../src/launcher');

(async () => {
  // Commandes
  assert.deepStrictEqual(tokenize('"C:\\Program Files\\RA\\retroarch.exe" -f -L "C:\\a b\\core.dll" "D:\\Jeux\\x (USA).sfc"'),
    ['C:\\Program Files\\RA\\retroarch.exe', '-f', '-L', 'C:\\a b\\core.dll', 'D:\\Jeux\\x (USA).sfc']);
  const cmd = buildLaunch('"{retroarch}" -f -L "{retroarchDir}\\cores\\snes9x_libretro.dll" "{rom}"', 'D:\\ROMs\\snes\\Jeu.sfc', { retroarch: 'C:\\RetroArch\\retroarch.exe' });
  assert.strictEqual(cmd.exe, 'C:\\RetroArch\\retroarch.exe');
  assert.deepStrictEqual(cmd.args, ['-f', '-L', 'C:\\RetroArch\\cores\\snes9x_libretro.dll', 'D:\\ROMs\\snes\\Jeu.sfc']);
  assert.throws(() => buildLaunch('"{dolphin}" -e "{rom}"', 'x.iso', { dolphin: '' }), /dolphin/);

  // Détection des dossiers et noms
  assert.strictEqual(findSystem('SNES').id, 'snes');
  assert.strictEqual(findSystem('megadrive').id, 'genesis');
  assert.strictEqual(findSystem('Game Boy Advance').id, 'gba');
  assert.strictEqual(findSystem('documents'), null);
  assert.strictEqual(cleanName('Super_Jeu (USA) [!]'), 'Super Jeu');

  // Bibliothèque factice
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-check-'));
  const w = (rel, content = '') => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
  w('ROMs/snes/Aventure (Europe).sfc');
  w('ROMs/snes/notes.txt');
  w('ROMs/snes/media/covers/Aventure (Europe).png');
  w('ROMs/snes/media/soundbites/Aventure (Europe).ogg');
  w('ROMs/snes/media/videos/Aventure (Europe).mp4');
  w('ROMs/psx/Saga (Disc 1).cue'); w('ROMs/psx/Saga (Disc 2).cue');
  w('ROMs/psx/Saga.m3u', 'Saga (Disc 1).cue\nSaga (Disc 2).cue\n');
  w('ROMs/gba/sous-dossier/Course.gba');
  w('ROMs/gba/gamelist.xml', '<gameList><game><path>./sous-dossier/Course.gba</path><name>Course &amp; Turbo</name><desc>Une course.</desc><releasedate>20030101T000000</releasedate><rating>0.8</rating></game></gameList>');
  w('ROMs/divers/fichier.zip');

  const lib = await scanLibrary({ romsRoot: path.join(root, 'ROMs'), mediaRoot: '', gamelistsRoot: '' });
  const ids = lib.systems.map((s) => s.id);
  assert.deepStrictEqual(ids, ['snes', 'gba', 'psx']);
  const snes = lib.systems.find((s) => s.id === 'snes');
  assert.strictEqual(snes.games.length, 1);
  assert.strictEqual(snes.games[0].name, 'Aventure');
  assert.ok(snes.games[0].cover.endsWith('Aventure (Europe).png'));
  assert.ok(snes.games[0].soundbite.endsWith('Aventure (Europe).ogg'));
  assert.ok(snes.games[0].video.endsWith('Aventure (Europe).mp4'));
  const psx = lib.systems.find((s) => s.id === 'psx');
  assert.deepStrictEqual(psx.games.map((g) => path.basename(g.path)), ['Saga.m3u']);
  const gba = lib.systems.find((s) => s.id === 'gba').games[0];
  assert.strictEqual(gba.name, 'Course & Turbo');
  assert.strictEqual(gba.year, '2003');
  assert.strictEqual(gba.rating, 4);

  fs.rmSync(root, { recursive: true, force: true });
  console.log('OK : toutes les vérifications passent.');
})().catch((err) => { console.error(err); process.exit(1); });
