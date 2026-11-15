'use strict';
// Vérification des consoles avant de jouer : émulateur configuré et présent, cœur RetroArch installé,
// BIOS / clés trouvés là où l'émulateur les cherche. Lecture seule, rien n'est téléchargé.
const fs = require('fs');
const path = require('path');

const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const lower = (dir) => { try { return new Set(fs.readdirSync(dir).map((f) => f.toLowerCase())); } catch { return new Set(); } };
const hasAny = (dir, re) => { try { return fs.readdirSync(dir).some((f) => re.test(f)); } catch { return false; } };

// Dossier « system » de RetroArch : celui de retroarch.cfg, sinon <RetroArch>\system.
function raSystemDir(raExe) {
  const base = path.dirname(raExe);
  try {
    const cfg = fs.readFileSync(path.join(base, 'retroarch.cfg'), 'utf8');
    const m = /^\s*system_directory\s*=\s*"([^"]*)"/m.exec(cfg);
    if (m && m[1] && m[1] !== 'default') return m[1].replace(/^:[\\/]/, base + path.sep);
  } catch { /* pas de cfg */ }
  return path.join(base, 'system');
}

// BIOS par cœur RetroArch : chaque entrée = un des fichiers suffit. required:false = conseillé seulement.
const RA_BIOS = {
  genesis_plus_gx: [{ label: 'BIOS Mega-CD', any: ['bios_CD_U.bin', 'bios_CD_E.bin', 'bios_CD_J.bin'], only: ['segacd'] }],
  picodrive: [{ label: 'BIOS Mega-CD', any: ['bios_CD_U.bin', 'bios_CD_E.bin', 'bios_CD_J.bin'], only: ['segacd'] }],
  mednafen_saturn: [{ label: 'BIOS Saturn', any: ['sega_101.bin', 'mpr-17933.bin'] }],
  kronos: [{ label: 'BIOS Saturn', any: ['kronos/saturn_bios.bin', 'saturn_bios.bin'] }],
  yabause: [{ label: 'BIOS Saturn', any: ['saturn_bios.bin'], required: false }],
  flycast: [{ label: 'BIOS Dreamcast', any: ['dc/dc_boot.bin', 'dc_boot.bin'], required: false }],
  mednafen_psx_hw: [{ label: 'BIOS PlayStation', any: ['scph5501.bin', 'scph5500.bin', 'scph5502.bin'] }],
  mednafen_psx: [{ label: 'BIOS PlayStation', any: ['scph5501.bin', 'scph5500.bin', 'scph5502.bin'] }],
  swanstation: [{ label: 'BIOS PlayStation', any: ['scph5501.bin', 'scph1001.bin', 'scph5500.bin', 'scph5502.bin', 'scph7001.bin'] }],
  pcsx_rearmed: [{ label: 'BIOS PlayStation', any: ['scph5501.bin', 'scph1001.bin', 'scph7001.bin', 'scph101.bin'], required: false }],
  mednafen_pce_fast: [{ label: 'Carte système PC Engine CD', any: ['syscard3.pce'], required: false }],
  mednafen_pce: [{ label: 'Carte système PC Engine CD', any: ['syscard3.pce'], required: false }],
  fbneo: [{ label: 'BIOS Neo Geo', any: ['neogeo.zip', 'fbneo/neogeo.zip'], only: ['neogeo'], romDir: true }],
  mame2003_plus: [{ label: 'BIOS Neo Geo', any: ['neogeo.zip'], only: ['neogeo'], romDir: true }],
  pcsx2: [{ label: 'BIOS PlayStation 2', dir: 'pcsx2/bios', re: /\.bin$/i }],
  dolphin: [],
};

// Émulateurs autonomes : où ils rangent leurs BIOS ou leurs clés.
function standaloneChecks(key, exe) {
  const docs = path.join(process.env.USERPROFILE || '', 'Documents');
  const appdata = process.env.APPDATA || '';
  const dir = path.dirname(exe);
  if (key === 'duckstation') return [{ label: 'BIOS PlayStation', ok: [path.join(docs, 'DuckStation', 'bios'), path.join(dir, 'bios')].some((d) => hasAny(d, /\.(bin|rom)$/i)) }];
  if (key === 'pcsx2') return [{ label: 'BIOS PlayStation 2', ok: [path.join(docs, 'PCSX2', 'bios'), path.join(dir, 'bios')].some((d) => hasAny(d, /\.(bin|rom0)$/i)) }];
  if (key === 'eden' || key === 'switch2') {
    const name = path.parse(exe).name.toLowerCase().replace(/[^a-z]/g, '');
    const dirs = [path.join(dir, 'user', 'keys'), path.join(appdata, 'eden', 'keys'), path.join(appdata, 'yuzu', 'keys'), path.join(appdata, 'Ryujinx', 'system'), path.join(appdata, name, 'keys'), path.join(appdata, 'citron', 'keys'), path.join(appdata, 'sudachi', 'keys')];
    return [{ label: 'Clés Switch (prod.keys)', ok: dirs.some((d) => exists(path.join(d, 'prod.keys'))) }];
  }
  if (key === 'cemu') return [{ label: 'Clés Wii U (keys.txt)', ok: exists(path.join(dir, 'keys.txt')), required: false }];
  return [];
}

// systems : consoles qui ont des jeux ({ id, name, command }) ; emulators : chemins des Réglages.
function check(systems, emulators = {}, romsRoot = '') {
  const out = [];
  for (const s of systems) {
    const issues = [];
    const okList = [];
    const tpl = String(s.command || '');
    if (!tpl || tpl.trim() === '{open}') continue;
    const keys = [...new Set([...tpl.matchAll(/\{(\w+?)(Dir)?\}/g)].map((m) => m[1]).filter((k) => !['rom', 'romName', 'romDir'].includes(k)))];
    let emuOk = true;
    for (const k of keys) {
      const p = emulators[k];
      if (!p) { issues.push({ kind: 'emu', text: `Émulateur non configuré : ${k}`, fix: 'emulators' }); emuOk = false; }
      else if (!exists(p)) { issues.push({ kind: 'emu', text: `Émulateur introuvable : ${p}`, fix: 'emulators' }); emuOk = false; }
    }
    // Commande sans variable (chemin écrit en dur).
    if (!keys.length) { const m = /^"([^"]+\.exe)"/i.exec(tpl.trim()); if (m && !exists(m[1])) { issues.push({ kind: 'emu', text: `Émulateur introuvable : ${m[1]}`, fix: 'commands' }); emuOk = false; } }
    if (emuOk && keys.length) okList.push('Émulateur');
    // RetroArch : cœur et BIOS du cœur.
    const core = /cores[\\/]+([\w-]+)_libretro\.dll/i.exec(tpl);
    if (core && emulators.retroarch && exists(emulators.retroarch)) {
      const coreFile = path.join(path.dirname(emulators.retroarch), 'cores', `${core[1]}_libretro.dll`);
      if (!exists(coreFile)) issues.push({ kind: 'core', text: `Cœur RetroArch manquant : ${core[1]}`, help: 'RetroArch → Menu principal → Mise à jour en ligne → Télécharger un cœur.' });
      else okList.push('Cœur ' + core[1]);
      const sysDir = raSystemDir(emulators.retroarch);
      for (const b of RA_BIOS[core[1]] || []) {
        if (b.only && !b.only.includes(s.id)) continue;
        let ok;
        if (b.dir) ok = hasAny(path.join(sysDir, b.dir), b.re);
        else {
          const dirs = [sysDir, ...(b.romDir && romsRoot ? (s.folders || [s.id]).map((f) => path.join(romsRoot, f)) : [])];
          ok = b.any.some((f) => dirs.some((d) => exists(path.join(d, f)) || lower(path.dirname(path.join(d, f))).has(path.basename(f).toLowerCase())));
        }
        if (ok) okList.push(b.label);
        else issues.push({ kind: 'bios', required: b.required !== false, text: `${b.label} manquant${b.required === false ? ' (conseillé)' : ''}`, help: b.dir ? `À mettre dans ${path.join(sysDir, b.dir)}` : `Un de : ${b.any.map((f) => path.basename(f)).join(', ')} · dans ${sysDir}` });
      }
    }
    // Émulateurs autonomes.
    for (const k of keys) {
      if (k === 'retroarch' || !emulators[k] || !exists(emulators[k])) continue;
      for (const c of standaloneChecks(k, emulators[k])) {
        if (c.ok) okList.push(c.label);
        else issues.push({ kind: 'bios', required: c.required !== false, text: `${c.label} manquant${c.required === false ? ' (conseillé)' : ''}` });
      }
    }
    out.push({ id: s.id, name: s.name, ok: !issues.some((i) => i.kind !== 'bios' || i.required), issues, okList });
  }
  return out;
}

module.exports = { check };
