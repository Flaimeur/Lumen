'use strict';
// Sauvegardes des émulateurs copiées dans un dossier cloud (OneDrive, Google Drive…) : Lumen copie seulement
// les fichiers nouveaux ou modifiés, dans <dossier>\<émulateur>\…, et ne supprime ni ne remplace jamais rien
// du côté des émulateurs. Restaurer = recopier soi-même depuis le dossier cloud.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const MAX_FILE = 150 * 1024 * 1024; // un état de sauvegarde énorme (> 150 Mo) n'est pas copié
const home = () => process.env.USERPROFILE || '';
const appData = () => process.env.APPDATA || '';
const docs = () => path.join(home(), 'Documents');
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };

// Dossier cloud par défaut : OneDrive, sinon Google Drive.
function defaultDest() {
  const od = process.env.OneDrive || process.env.OneDriveConsumer || path.join(home(), 'OneDrive');
  if (exists(od)) return path.join(od, 'Lumen', 'Sauvegardes');
  for (const g of ['G:\\Mon Drive', 'G:\\My Drive', path.join(home(), 'Google Drive'), path.join(home(), 'Google Drive', 'Mon Drive')]) if (exists(g)) return path.join(g, 'Lumen', 'Sauvegardes');
  return '';
}

// Dossiers de sauvegarde connus, selon les émulateurs réglés dans Lumen et les emplacements habituels.
function sources(cfg) {
  const e = cfg.emulators || {};
  const dirOf = (exe) => (exe ? path.dirname(exe) : '');
  const list = [
    ['RetroArch', 'saves', path.join(dirOf(e.retroarch), 'saves')],
    ['RetroArch', 'states', path.join(dirOf(e.retroarch), 'states')],
    ['Dolphin', 'GC', path.join(appData(), 'Dolphin Emulator', 'GC')],
    ['Dolphin', 'Wii', path.join(appData(), 'Dolphin Emulator', 'Wii', 'title')],
    ['Dolphin', 'GC (Documents)', path.join(docs(), 'Dolphin Emulator', 'GC')],
    ['Eden', 'save', path.join(appData(), 'eden', 'nand', 'user', 'save')],
    ['Yuzu', 'save', path.join(appData(), 'yuzu', 'nand', 'user', 'save')],
    ['Ryujinx', 'save', path.join(appData(), 'Ryujinx', 'bis', 'user', 'save')],
    ['Azahar', 'sdmc', path.join(appData(), 'Azahar', 'sdmc', 'Nintendo 3DS')],
    ['Citra', 'sdmc', path.join(appData(), 'Citra', 'sdmc', 'Nintendo 3DS')],
    ['PCSX2', 'memcards', path.join(docs(), 'PCSX2', 'memcards')],
    ['DuckStation', 'memcards', path.join(docs(), 'DuckStation', 'memcards')],
    ['PPSSPP', 'SAVEDATA', path.join(docs(), 'PPSSPP', 'PSP', 'SAVEDATA')],
    ['PPSSPP', 'SAVEDATA (portable)', path.join(dirOf(e.ppsspp), 'memstick', 'PSP', 'SAVEDATA')],
    ['Cemu', 'save', path.join(dirOf(e.cemu), 'mlc01', 'usr', 'save')],
  ];
  for (const c of (cfg.cloudSaves && cfg.cloudSaves.extra) || []) if (c && c.path) list.push([c.name || path.basename(c.path), '', c.path]);
  const seen = new Set();
  return list.filter(([, , p]) => {
    if (!p || !exists(p)) return false;
    const k = path.resolve(p).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(([name, sub, p]) => ({ name, sub, path: p }));
}

async function mirror(src, dst, stats) {
  let entries = [];
  try { entries = await fsp.readdir(src, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    const a = path.join(src, ent.name);
    const b = path.join(dst, ent.name);
    if (ent.isDirectory()) { await mirror(a, b, stats); continue; }
    if (!ent.isFile()) continue;
    try {
      const sa = await fsp.stat(a);
      if (sa.size > MAX_FILE) { stats.skipped++; continue; }
      let sb = null;
      try { sb = await fsp.stat(b); } catch { /* pas encore copié */ }
      if (sb && sb.size === sa.size && sb.mtimeMs >= sa.mtimeMs - 1000) continue;
      await fsp.mkdir(dst, { recursive: true });
      await fsp.copyFile(a, b);
      await fsp.utimes(b, sa.atime, sa.mtime).catch(() => {});
      stats.copied++;
      stats.bytes += sa.size;
    } catch { stats.errors++; }
  }
}

let running = null;
async function backup(cfg) {
  if (running) return running;
  running = (async () => {
    const dest = (cfg.cloudSaves && cfg.cloudSaves.dest) || defaultDest();
    if (!dest) return { ok: false, error: 'Aucun dossier cloud : choisis-en un dans les Réglages.' };
    const stats = { copied: 0, bytes: 0, skipped: 0, errors: 0, sources: 0 };
    const t0 = Date.now();
    for (const s of sources(cfg)) {
      stats.sources++;
      await mirror(s.path, path.join(dest, s.name, s.sub || path.basename(s.path)), stats);
    }
    return { ok: true, dest, ms: Date.now() - t0, ...stats, at: Date.now() };
  })().finally(() => { running = null; });
  return running;
}

module.exports = { backup, sources, defaultDest };
