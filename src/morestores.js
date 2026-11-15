'use strict';
// Autres launchers PC : EA app, Ubisoft Connect, Battle.net, Amazon Games et jeux Xbox (Game Pass / Microsoft Store).
// Lecture seule du registre Windows (programmes installés) et de la liste des applis du Store.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };

function ps(script, timeout = 20000) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
        if (err) return resolve([]);
        try { const j = JSON.parse(String(out).trim() || '[]'); resolve(Array.isArray(j) ? j : [j]); } catch { resolve([]); }
      });
  });
}

// Programmes installés (les trois emplacements « Désinstaller » de Windows), lus une fois par scan.
let uninstallCache = null;
function uninstallEntries() {
  if (uninstallCache && Date.now() - uninstallCache.at < 60000) return uninstallCache.p;
  const script = [
    "$k = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
    '@(Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object PSChildName, DisplayName, Publisher, InstallLocation, DisplayIcon, UninstallString) | ConvertTo-Json -Compress',
  ].join('; ');
  const p = ps(script);
  uninstallCache = { at: Date.now(), p };
  return p;
}

// « "C:\…\jeu.exe",0 » → C:\…\jeu.exe (si c'est bien un .exe présent).
function iconExe(icon) {
  const f = String(icon || '').replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '').trim();
  return /\.exe$/i.test(f) && exists(f) ? f : '';
}
const inOtherStore = (dir) => /[\\/](steamapps|Epic Games|GOG Galaxy)[\\/]/i.test(dir || '');
const slug = (s) => String(s || '').replace(/[{}]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-');

// ---------- EA app ----------
// Jeux installés par l'EA app : dossier avec « __Installer », exécutable donné par l'icône de désinstallation.
// Lancer l'exécutable suffit : le jeu ouvre lui-même l'EA app pour la connexion.
async function scanEa() {
  const out = [];
  for (const e of await uninstallEntries()) {
    if (!/Electronic Arts/i.test(e.Publisher || '') || /^(EA app|Origin)\b/i.test(e.DisplayName)) continue;
    const dir = e.InstallLocation;
    if (!exists(dir) || inOtherStore(dir) || !exists(path.join(dir, '__Installer'))) continue;
    const exe = iconExe(e.DisplayIcon);
    if (!exe) continue;
    out.push({ id: `ea:${slug(e.PSChildName)}`, store: 'ea', name: e.DisplayName.replace(/[™®]/g, '').trim(), cover: null, background: null, exe, args: [], cwd: path.dirname(exe), dir, uninstall: e.UninstallString || '' });
  }
  return out;
}

// ---------- Ubisoft Connect ----------
async function scanUbisoft() {
  const rows = await ps("@(Get-ChildItem 'HKLM:\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs' -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ id = $_.PSChildName; dir = (Get-ItemProperty $_.PSPath).InstallDir } }) | ConvertTo-Json -Compress");
  if (!rows.length) return [];
  const entries = await uninstallEntries();
  const out = [];
  for (const r of rows) {
    const dir = String(r.dir || '').replace(/[\\/]+$/, '');
    if (!r.id || !exists(dir)) continue;
    const e = entries.find((x) => x.PSChildName === `Uplay Install ${r.id}`);
    out.push({ id: `ubisoft:${r.id}`, store: 'ubisoft', name: (e && e.DisplayName) || path.basename(dir), cover: null, background: null, uri: `uplay://launch/${r.id}/0`, dir, uninstall: (e && e.UninstallString) || '' });
  }
  return out;
}

// ---------- Battle.net ----------
// L'exécutable de l'icône est le « Launcher » du jeu, qui passe par Battle.net.
async function scanBattlenet() {
  const out = [];
  for (const e of await uninstallEntries()) {
    if (!/Blizzard/i.test(e.Publisher || '') || /^Battle\.net$/i.test(e.DisplayName)) continue;
    const dir = e.InstallLocation;
    const exe = iconExe(e.DisplayIcon);
    if (!exists(dir) || !exe || /Battle\.net/i.test(path.basename(exe))) continue;
    out.push({ id: `battlenet:${slug(e.PSChildName)}`, store: 'battlenet', name: e.DisplayName, cover: null, background: null, exe, args: [], cwd: path.dirname(exe), dir, uninstall: e.UninstallString || '' });
  }
  return out;
}

// ---------- Amazon Games ----------
// Désinstallation via « Amazon Game Remover.exe … -p <id> » : l'id sert aussi au lancement.
async function scanAmazon() {
  const out = [];
  for (const e of await uninstallEntries()) {
    const m = /Amazon Game Remover\.exe.*?-p\s+"?([A-Za-z0-9._-]+)/i.exec(e.UninstallString || '');
    if (!m) continue;
    const dir = e.InstallLocation;
    if (dir && !exists(dir)) continue;
    out.push({ id: `amazon:${m[1]}`, store: 'amazon', name: e.DisplayName, cover: null, background: null, uri: `amazon-games://play/${m[1]}`, dir: dir || '', uninstall: e.UninstallString || '' });
  }
  return out;
}

// ---------- Xbox (Game Pass, Microsoft Store) ----------
// Un jeu Xbox PC a un MicrosoftGame.config dans son paquet ; son nom et son identifiant de lancement
// viennent du menu Démarrer (Get-StartApps).
let xboxCache = null; // la liste des paquets Windows est lente à lire (~6 s) : gardée 10 min
async function scanXbox() {
  if (xboxCache && Date.now() - xboxCache.at < 10 * 60 * 1000) return xboxCache.list;
  const list = await scanXboxNow();
  xboxCache = { at: Date.now(), list };
  return list;
}
async function scanXboxNow() {
  const script = [
    '$apps = Get-StartApps',
    "@(Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.InstallLocation -and (Test-Path (Join-Path $_.InstallLocation 'MicrosoftGame.config')) } | ForEach-Object { $pfn = $_.PackageFamilyName; $a = $apps | Where-Object { $_.AppID -like ($pfn + '!*') } | Select-Object -First 1; if ($a) { [pscustomobject]@{ name = $a.Name; aumid = $a.AppID; dir = $_.InstallLocation } } }) | ConvertTo-Json -Compress",
  ].join('; ');
  const rows = await ps(script, 30000);
  return rows.filter((r) => r && r.aumid && r.name).map((r) => ({
    id: `xbox:${r.aumid}`, store: 'xbox', name: String(r.name).replace(/[™®]/g, '').trim(), cover: null, background: null,
    exe: 'explorer.exe', args: [`shell:AppsFolder\\${r.aumid}`], cwd: undefined, dir: r.dir,
  }));
}

const MORE_STORES = {
  ea: { name: 'EA app', short: 'EA', color: '#ff4747', scan: scanEa },
  ubisoft: { name: 'Ubisoft Connect', short: 'Ubisoft', color: '#0070ff', scan: scanUbisoft },
  battlenet: { name: 'Battle.net', short: 'Battle.net', color: '#148eff', scan: scanBattlenet },
  amazon: { name: 'Amazon Games', short: 'Amazon', color: '#ff9900', scan: scanAmazon },
  xbox: { name: 'Xbox', short: 'Xbox', color: '#107c10', scan: scanXbox },
};

// Ouvrir le launcher lui-même.
function launcherCommand(store) {
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  if (store === 'ea') { const exe = [path.join(pf, 'Electronic Arts', 'EA Desktop', 'EA Desktop', 'EADesktop.exe')].find(exists); return exe ? { exe } : null; }
  if (store === 'ubisoft') { const exe = [path.join(pf86, 'Ubisoft', 'Ubisoft Game Launcher', 'UbisoftConnect.exe')].find(exists); return exe ? { exe } : { uri: 'uplay://' }; }
  if (store === 'battlenet') { const exe = [path.join(pf86, 'Battle.net', 'Battle.net Launcher.exe'), path.join(pf, 'Battle.net', 'Battle.net Launcher.exe')].find(exists); return exe ? { exe } : { uri: 'battlenet://' }; }
  if (store === 'amazon') return { uri: 'amazon-games://' };
  if (store === 'xbox') return { exe: 'explorer.exe', args: ['shell:AppsFolder\\Microsoft.GamingApp_8wekyb3d8bbwe!Microsoft.Xbox.App'] };
  return null;
}

module.exports = { MORE_STORES, launcherCommand };
