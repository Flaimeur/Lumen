'use strict';
// Désinstallation itch « pour de vrai » : via butler, l'outil d'itch (installé avec l'appli itch).
// On démarre un butler en mode daemon sur la base de l'appli itch, puis JSON-RPC : Meta.Authenticate,
// Fetch.Caves (jeux installés), Uninstall.Perform. L'appli itch voit donc le jeu désinstallé.
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

function butlerExe() {
  const base = path.join(process.env.APPDATA || '', 'itch', 'broth', 'butler');
  let v = '';
  try { v = fs.readFileSync(path.join(base, '.chosen-version'), 'utf8').trim(); } catch { /* pas de version choisie */ }
  const cands = [];
  if (v) cands.push(path.join(base, 'versions', v, 'butler.exe'));
  try { for (const d of fs.readdirSync(path.join(base, 'versions')).sort().reverse()) cands.push(path.join(base, 'versions', d, 'butler.exe')); } catch { /* rien */ }
  return cands.find((p) => fs.existsSync(p)) || '';
}
const dbPath = () => path.join(process.env.APPDATA || '', 'itch', 'db', 'butler.db');

// Ouvre une session butler : fn(call) reçoit call(method, params) → result (ou lève l'erreur).
function withButler(fn, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const exe = butlerExe();
    if (!exe || !fs.existsSync(dbPath())) return reject(new Error('Appli itch introuvable (butler absent).'));
    const p = spawn(exe, ['--json', 'daemon', '--dbpath', dbPath(), '--transport', 'tcp', '--destiny-pid', String(process.pid)], { windowsHide: true });
    let done = false, sock = null;
    const finish = (err, val) => { if (done) return; done = true; clearTimeout(t); try { sock && sock.end(); } catch { /* */ } try { p.kill(); } catch { /* */ } err ? reject(err) : resolve(val); };
    const t = setTimeout(() => finish(new Error('butler ne répond pas.')), timeout);
    p.on('error', (e) => finish(e));
    p.on('exit', () => finish(new Error('butler s’est arrêté.')));
    let out = '';
    p.stdout.on('data', (d) => {
      out += d; let i;
      while ((i = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, i); out = out.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.type !== 'butlerd/listen-notification' || sock) continue;
        const [host, port] = String(m.tcp && m.tcp.address || '').split(':');
        sock = net.connect(Number(port), host);
        let id = 0, rb = '';
        const wait = new Map();
        const call = (method, params) => new Promise((res, rej) => {
          const n = ++id; wait.set(n, { res, rej });
          sock.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params: params || {} }) + '\n');
        });
        sock.on('data', (d2) => {
          rb += d2; let j;
          while ((j = rb.indexOf('\n')) >= 0) {
            const l = rb.slice(0, j); rb = rb.slice(j + 1);
            let r; try { r = JSON.parse(l); } catch { continue; }
            if (r.method) { // requête de butler vers nous : on n'en gère aucune
              if (r.id != null) sock.write(JSON.stringify({ jsonrpc: '2.0', id: r.id, error: { code: -32601, message: 'non géré' } }) + '\n');
              continue;
            }
            const w = wait.get(r.id); if (!w) continue; wait.delete(r.id);
            if (r.error) w.rej(new Error(r.error.message || 'erreur butler')); else w.res(r.result);
          }
        });
        sock.on('error', (e) => finish(e));
        sock.on('connect', async () => {
          try { await call('Meta.Authenticate', { secret: m.secret }); finish(null, await fn(call)); } catch (e) { finish(e); }
        });
      }
    });
  });
}

// Désinstalle le jeu itch d'id gameId. Nettoie aussi les fiches dont le dossier n'existe plus
// (jeux déjà supprimés à la main ou par une ancienne version de Lumen).
async function uninstall(gameId) {
  return withButler(async (call) => {
    const all = ((await call('Fetch.Caves', {})) || {}).items || [];
    const mine = all.filter((c) => c.game && String(c.game.id) === String(gameId));
    if (!mine.length) throw new Error('Ce jeu n’est pas installé dans l’appli itch.');
    for (const c of mine) {
      try { await call('Uninstall.Perform', { caveId: c.id }); } catch { await call('Uninstall.Perform', { caveId: c.id, hard: true }); }
    }
    let cleaned = 0;
    for (const c of all) {
      if (mine.includes(c)) continue;
      const dir = c.installInfo && c.installInfo.installFolder;
      if (!dir || fs.existsSync(dir) || !fs.existsSync(path.dirname(dir))) continue; // disque débranché : on ne touche pas
      try { await call('Uninstall.Perform', { caveId: c.id, hard: true }); cleaned++; } catch { /* tant pis */ }
    }
    return { removed: mine.length, cleaned };
  });
}

module.exports = { uninstall, butlerExe };
