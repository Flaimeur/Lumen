'use strict';
// Temps de jeu des jeux PC sans compteur lisible (Epic, itch, GOG, EA, Ubisoft, Battle.net, Amazon, Xbox) :
// toutes les 30 s, on regarde quels programmes tournent depuis le dossier d'installation d'un jeu.
// Ça compte aussi les parties lancées en dehors de Lumen (Fortnite depuis Epic…). Steam a son propre compteur.
const { execFile } = require('child_process');
const path = require('path');

const SCRIPT = '(Get-CimInstance Win32_Process -Property ExecutablePath | Where-Object { $_.ExecutablePath } | ForEach-Object { $_.ExecutablePath }) -join "`n"';

function runningPaths() {
  if (process.platform === 'darwin') {
    // Mac : chemin complet du programme de chaque processus.
    return new Promise((resolve) => {
      execFile('/bin/ps', ['-axo', 'comm='], { timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
        (err, out) => resolve(err ? null : String(out).split(/\n/).map((p) => p.trim().toLowerCase()).filter(Boolean)));
    });
  }
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
      (err, out) => resolve(err ? null : String(out).split(/\r?\n/).map((p) => p.trim().toLowerCase()).filter(Boolean)));
  });
}

let timer = null;
// getLaunchers() → Map id → { store, dir } ; onTick({ running: [ids] }).
function start(getLaunchers, onTick, every = 30000) {
  if (timer || !['win32', 'darwin'].includes(process.platform)) return;
  const tick = async () => {
    const dirs = [];
    for (const [id, l] of getLaunchers()) {
      if (!l || l.store === 'steam' || !l.dir) continue;
      dirs.push([id, path.resolve(l.dir).toLowerCase().replace(/[\\/]+$/, '') + path.sep]);
    }
    if (!dirs.length) return;
    const procs = await runningPaths();
    if (!procs) return;
    const running = dirs.filter(([, d]) => procs.some((p) => p.startsWith(d))).map(([id]) => id);
    onTick({ running, at: Date.now() });
  };
  timer = setInterval(() => { tick().catch(() => {}); }, every);
  setTimeout(() => { tick().catch(() => {}); }, 15000);
}

module.exports = { start };
