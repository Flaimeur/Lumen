'use strict';

// Commande RetroArch standard : plein écran + cœur libretro.
const RA = (core) => `"{retroarch}" -f -L "{retroarchDir}\\cores\\${core}_libretro.dll" "{rom}"`;

// folders : noms de dossiers reconnus (comparés en minuscules, sans espaces ni tirets).
// Les noms suivent la convention ES-DE pour que les bibliothèques existantes marchent directement.
module.exports = [
  { id: 'nes', name: 'Nintendo Entertainment System', short: 'NES', color: '#d1495b', folders: ['nes', 'famicom', 'fc'], ext: ['nes', 'fds', 'unf', 'unif', 'zip', '7z'], command: RA('mesen') },
  { id: 'snes', name: 'Super Nintendo', short: 'SNES', color: '#7b5ea7', folders: ['snes', 'sfc', 'superfamicom', 'supernintendo'], ext: ['sfc', 'smc', 'fig', 'swc', 'bs', 'zip', '7z'], command: RA('snes9x') },
  { id: 'n64', name: 'Nintendo 64', short: 'N64', color: '#2a9d8f', folders: ['n64', 'nintendo64'], ext: ['n64', 'z64', 'v64', 'zip', '7z'], command: RA('mupen64plus_next') },
  { id: 'gc', name: 'GameCube', short: 'GC', color: '#6d4fc2', folders: ['gc', 'gamecube', 'ngc'], ext: ['iso', 'gcm', 'gcz', 'rvz', 'ciso'], command: '"{dolphin}" -b -e "{rom}"' },
  { id: 'wii', name: 'Wii', short: 'Wii', color: '#4aa3df', folders: ['wii'], ext: ['iso', 'wbfs', 'rvz', 'wad', 'gcz'], command: '"{dolphin}" -b -e "{rom}"' },
  { id: 'wiiu', name: 'Wii U', short: 'Wii U', color: '#1f8fbf', folders: ['wiiu'], ext: ['wua', 'wud', 'wux', 'rpx'], command: '"{cemu}" -f -g "{rom}"' },
  { id: 'switch2', name: 'Nintendo Switch 2', short: 'Switch 2', color: '#e11d48', folders: ['switch2', 'ns2', 'nx2', 'nintendoswitch2'], ext: ['nup', 'nsp', 'xci', 'nca', 'nro'], command: '"{switch2}" -f -g "{rom}"', iidbQuery: 'Switch 2', iidbKey: 'switch2' },
  { id: 'switch', name: 'Nintendo Switch', short: 'Switch', color: '#e63946', folders: ['switch', 'nx'], ext: ['nsp', 'xci', 'nca', 'nro'], command: '"{eden}" -f -g "{rom}"' },
  { id: 'gb', name: 'Game Boy', short: 'GB', color: '#8a9a2c', folders: ['gb', 'gameboy'], ext: ['gb', 'zip', '7z'], command: RA('gambatte') },
  { id: 'gbc', name: 'Game Boy Color', short: 'GBC', color: '#c9a227', folders: ['gbc', 'gameboycolor'], ext: ['gbc', 'zip', '7z'], command: RA('gambatte') },
  { id: 'gba', name: 'Game Boy Advance', short: 'GBA', color: '#5b4fcf', folders: ['gba', 'gameboyadvance'], ext: ['gba', 'zip', '7z'], command: RA('mgba') },
  { id: 'nds', name: 'Nintendo DS', short: 'DS', color: '#7d8597', folders: ['nds', 'ds'], ext: ['nds', 'zip', '7z'], command: RA('melondsds') },
  { id: 'n3ds', name: 'Nintendo 3DS', short: '3DS', color: '#c1121f', folders: ['n3ds', '3ds'], ext: ['3ds', 'cci', 'cia', '3dsx', 'app', 'cxi'], command: '"{azahar}" "{rom}"' },
  { id: 'psx', name: 'PlayStation', short: 'PS1', color: '#8a94a6', folders: ['psx', 'ps1', 'playstation'], ext: ['cue', 'chd', 'pbp', 'm3u', 'iso', 'ecm'], command: RA('swanstation') },
  { id: 'ps2', name: 'PlayStation 2', short: 'PS2', color: '#2b4c9b', folders: ['ps2', 'playstation2'], ext: ['iso', 'chd', 'cso', 'gz', 'zso'], command: '"{pcsx2}" -batch -fullscreen -- "{rom}"' },
  { id: 'psp', name: 'PlayStation Portable', short: 'PSP', color: '#3d3d5c', folders: ['psp'], ext: ['iso', 'cso', 'pbp', 'chd'], command: RA('ppsspp') },
  { id: 'mastersystem', name: 'Master System', short: 'SMS', color: '#c0392b', folders: ['mastersystem', 'sms'], ext: ['sms', 'zip', '7z'], command: RA('genesis_plus_gx') },
  { id: 'genesis', name: 'Mega Drive / Genesis', short: 'MD', color: '#34495e', folders: ['genesis', 'megadrive', 'md'], ext: ['md', 'gen', 'smd', 'bin', '68k', 'zip', '7z'], command: RA('genesis_plus_gx') },
  { id: 'segacd', name: 'Mega-CD', short: 'MCD', color: '#4b5d73', folders: ['segacd', 'megacd'], ext: ['cue', 'chd', 'm3u'], command: RA('genesis_plus_gx') },
  { id: 'gamegear', name: 'Game Gear', short: 'GG', color: '#3c3c3c', folders: ['gamegear', 'gg'], ext: ['gg', 'zip', '7z'], command: RA('genesis_plus_gx') },
  { id: 'saturn', name: 'Saturn', short: 'SAT', color: '#5a5a7a', folders: ['saturn'], ext: ['cue', 'chd', 'm3u', 'ccd'], command: RA('mednafen_saturn') },
  { id: 'dreamcast', name: 'Dreamcast', short: 'DC', color: '#e07a1f', folders: ['dreamcast', 'dc'], ext: ['cdi', 'gdi', 'chd', 'm3u'], command: RA('flycast') },
  { id: 'pcengine', name: 'PC Engine / TurboGrafx', short: 'PCE', color: '#b5651d', folders: ['pcengine', 'tg16', 'turbografx16', 'pcenginecd', 'tgcd'], ext: ['pce', 'cue', 'chd', 'zip', '7z'], command: RA('mednafen_pce_fast') },
  { id: 'neogeo', name: 'Neo Geo', short: 'NEO', color: '#a8862b', folders: ['neogeo'], ext: ['zip', '7z'], command: RA('fbneo') },
  { id: 'arcade', name: 'Arcade', short: 'ARC', color: '#d62828', folders: ['arcade', 'fbneo', 'mame', 'cps1', 'cps2', 'cps3'], ext: ['zip', '7z'], command: RA('fbneo') },
  { id: 'atari2600', name: 'Atari 2600', short: '2600', color: '#9c6644', folders: ['atari2600', 'a2600'], ext: ['a26', 'bin', 'zip'], command: RA('stella') },
  { id: 'ngp', name: 'Neo Geo Pocket', short: 'NGP', color: '#6c757d', folders: ['ngp', 'ngpc'], ext: ['ngp', 'ngc', 'zip'], command: RA('mednafen_ngp') },
  { id: 'wonderswan', name: 'WonderSwan', short: 'WS', color: '#577590', folders: ['wonderswan', 'wonderswancolor', 'ws', 'wsc'], ext: ['ws', 'wsc', 'zip'], command: RA('mednafen_wswan') },
  // Jeux PC : raccourcis .lnk / .url (Steam, GOG…) ou exécutables. Ouverts directement par Windows.
  { id: 'windows', name: 'Jeux PC', short: 'PC', color: '#0f766e', folders: ['windows', 'pc', 'steam'], ext: ['lnk', 'url', 'exe', 'bat'], command: '{open}' },
];

// ---------- Fiches des consoles : fabricant, année de sortie, émulateurs au choix ----------
const META = {
  nes: ['Nintendo', 1983], snes: ['Nintendo', 1990], n64: ['Nintendo', 1996], gc: ['Nintendo', 2001], wii: ['Nintendo', 2006],
  wiiu: ['Nintendo', 2012], switch2: ['Nintendo', 2025], switch: ['Nintendo', 2017], gb: ['Nintendo', 1989], gbc: ['Nintendo', 1998],
  gba: ['Nintendo', 2001], nds: ['Nintendo', 2004], n3ds: ['Nintendo', 2011], psx: ['Sony', 1994], ps2: ['Sony', 2000], psp: ['Sony', 2004],
  mastersystem: ['Sega', 1985], genesis: ['Sega', 1988], segacd: ['Sega', 1991], gamegear: ['Sega', 1990], saturn: ['Sega', 1994],
  dreamcast: ['Sega', 1998], pcengine: ['NEC', 1987], neogeo: ['SNK', 1990], arcade: ['Arcade', null], atari2600: ['Atari', 1977],
  ngp: ['SNK', 1998], wonderswan: ['Bandai', 1999], windows: ['PC', null],
};
// Cœurs RetroArch connus pour chaque console (le premier est celui par défaut), puis émulateurs autonomes.
const CORES = {
  nes: [['Mesen', 'mesen'], ['Nestopia', 'nestopia'], ['FCEUmm', 'fceumm']],
  snes: [['Snes9x', 'snes9x'], ['bsnes', 'bsnes'], ['Mesen-S', 'mesen-s']],
  n64: [['Mupen64Plus-Next', 'mupen64plus_next'], ['ParaLLEl N64', 'parallel_n64']],
  gb: [['Gambatte', 'gambatte'], ['SameBoy', 'sameboy'], ['mGBA', 'mgba']],
  gbc: [['Gambatte', 'gambatte'], ['SameBoy', 'sameboy'], ['mGBA', 'mgba']],
  gba: [['mGBA', 'mgba'], ['VBA-M', 'vbam'], ['gpSP', 'gpsp']],
  nds: [['melonDS DS', 'melondsds'], ['melonDS', 'melonds'], ['DeSmuME', 'desmume']],
  psx: [['SwanStation', 'swanstation'], ['Beetle PSX HW', 'mednafen_psx_hw'], ['PCSX ReARMed', 'pcsx_rearmed']],
  psp: [['PPSSPP', 'ppsspp']],
  mastersystem: [['Genesis Plus GX', 'genesis_plus_gx'], ['PicoDrive', 'picodrive'], ['SMS Plus GX', 'smsplus']],
  genesis: [['Genesis Plus GX', 'genesis_plus_gx'], ['PicoDrive', 'picodrive'], ['BlastEm', 'blastem']],
  segacd: [['Genesis Plus GX', 'genesis_plus_gx'], ['PicoDrive', 'picodrive']],
  gamegear: [['Genesis Plus GX', 'genesis_plus_gx'], ['SMS Plus GX', 'smsplus']],
  saturn: [['Beetle Saturn', 'mednafen_saturn'], ['Yabause', 'yabause'], ['Kronos', 'kronos']],
  dreamcast: [['Flycast', 'flycast']],
  pcengine: [['Beetle PCE Fast', 'mednafen_pce_fast'], ['Beetle PCE', 'mednafen_pce']],
  neogeo: [['FinalBurn Neo', 'fbneo'], ['MAME 2003-Plus', 'mame2003_plus']],
  arcade: [['FinalBurn Neo', 'fbneo'], ['MAME', 'mame'], ['MAME 2003-Plus', 'mame2003_plus']],
  atari2600: [['Stella', 'stella'], ['Stella 2014', 'stella2014']],
  ngp: [['Beetle NeoPop', 'mednafen_ngp'], ['RACE', 'race']],
  wonderswan: [['Beetle WonderSwan', 'mednafen_wswan']],
};
const STANDALONE = {
  psx: [['DuckStation (autonome)', '"{duckstation}" -fullscreen -- "{rom}"']],
  nds: [['melonDS (autonome)', '"{melonds}" -f "{rom}"']],
  gc: [['Dolphin', '"{dolphin}" -b -e "{rom}"'], ['RetroArch · Dolphin', RA('dolphin')]],
  wii: [['Dolphin', '"{dolphin}" -b -e "{rom}"'], ['RetroArch · Dolphin', RA('dolphin')]],
  ps2: [['PCSX2', '"{pcsx2}" -batch -fullscreen -- "{rom}"'], ['RetroArch · LRPS2', RA('pcsx2')]],
  psp: [['PPSSPP (autonome)', '"{ppsspp}" --fullscreen "{rom}"']],
  n3ds: [['Azahar', '"{azahar}" "{rom}"'], ['Azahar (plein écran)', '"{azahar}" -f "{rom}"']],
  switch: [['Eden / Ryujinx (plein écran)', '"{eden}" -f -g "{rom}"'], ['Eden / Ryujinx (fenêtre)', '"{eden}" -g "{rom}"']],
  switch2: [['Lichii / Eden (plein écran)', '"{switch2}" -f -g "{rom}"'], ['Lichii / Eden (fenêtre)', '"{switch2}" -g "{rom}"']],
  wiiu: [['Cemu (plein écran)', '"{cemu}" -f -g "{rom}"'], ['Cemu (fenêtre)', '"{cemu}" -g "{rom}"']],
};
for (const s of module.exports) {
  const m = META[s.id];
  if (m) { s.maker = m[0]; s.year = m[1]; }
  s.alts = [
    ...(CORES[s.id] || []).map(([label, core]) => ({ label: `RetroArch · ${label}`, command: RA(core) })),
    ...(STANDALONE[s.id] || []).map(([label, command]) => ({ label, command })),
  ].filter((a, i, all) => all.findIndex((b) => b.command === a.command) === i);
}
