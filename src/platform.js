'use strict';
// Différences Windows / macOS regroupées ici : dossiers de données, applications .app, RetroArch.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const home = () => os.homedir();
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };

// Dossier où les applis rangent leurs données : %APPDATA% sur Windows, ~/Library/Application Support sur Mac.
const appData = () => (IS_MAC ? path.join(home(), 'Library', 'Application Support') : process.env.APPDATA || '');
const documents = () => path.join(IS_WIN ? process.env.USERPROFILE || home() : home(), 'Documents');

// Valeur d'une clé de l'Info.plist d'une application (.app), ou ''.
function plistValue(appPath, key) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  if (!exists(plist)) return '';
  try { return execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8', timeout: 5000 }).trim(); } catch { return ''; }
}

// « /Applications/Dolphin.app » → « /Applications/Dolphin.app/Contents/MacOS/Dolphin » (le vrai programme).
// Tout autre chemin est rendu tel quel.
const exeCache = new Map();
function resolveApp(p) {
  if (!IS_MAC || !p || !/\.app\/?$/i.test(p)) return p;
  if (exeCache.has(p)) return exeCache.get(p);
  const macos = path.join(p, 'Contents', 'MacOS');
  let exe = plistValue(p, 'CFBundleExecutable');
  exe = exe ? path.join(macos, exe) : '';
  if (!exists(exe)) {
    // Repli : le seul (ou premier) fichier du dossier MacOS, ou le nom de l'appli.
    const guess = path.join(macos, path.basename(p).replace(/\.app\/?$/i, ''));
    if (exists(guess)) exe = guess;
    else { try { exe = path.join(macos, fs.readdirSync(macos)[0]); } catch { exe = p; } }
  }
  exeCache.set(p, exe);
  return exe;
}

// Dossier de données de RetroArch (cœurs, system, retroarch.cfg).
// Windows : à côté de retroarch.exe. Mac : ~/Library/Application Support/RetroArch.
function retroarchHome(raPath) {
  if (IS_MAC) return path.join(appData(), 'RetroArch');
  return raPath ? path.dirname(raPath) : '';
}
function retroarchCfg(raPath) {
  const base = retroarchHome(raPath);
  return IS_MAC ? path.join(base, 'config', 'retroarch.cfg') : path.join(base, 'retroarch.cfg');
}
// Valeur d'un réglage de retroarch.cfg (« :/ » = dossier de RetroArch, « ~/ » = dossier personnel).
function retroarchSetting(raPath, key) {
  try {
    const cfg = fs.readFileSync(retroarchCfg(raPath), 'utf8');
    const m = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm').exec(cfg);
    if (!m || !m[1] || m[1] === 'default') return '';
    return m[1].replace(/^:[\\/]/, retroarchHome(raPath) + path.sep).replace(/^~(?=[\\/])/, home());
  } catch { return ''; }
}
const retroarchCores = (raPath) => retroarchSetting(raPath, 'libretro_directory') || path.join(retroarchHome(raPath), 'cores');
const CORE_EXT = IS_MAC ? 'dylib' : IS_WIN ? 'dll' : 'so';

module.exports = { IS_MAC, IS_WIN, home, exists, appData, documents, plistValue, resolveApp, retroarchHome, retroarchSetting, retroarchCores, CORE_EXT };
