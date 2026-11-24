'use strict';
// Mac : ce qui joue dans Spotify ou Musique, via AppleScript (osascript). Même format de réponse que mediactl
// sur Windows : { active, app, title, artist, album, status: 'Playing' | 'Paused', thumb, vol }.
// macOS demande une fois l'autorisation de piloter chaque appli (Réglages → Confidentialité → Automatisation).
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APPS = ['Spotify', 'Music'];
const SEP = '\u001f';

function osa(script) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e', script], { timeout: 6000 }, (err, out) => resolve(err ? null : String(out).replace(/\n$/, '')));
  });
}

// Lit l'état d'une appli sans la lancer (« is running » d'abord).
async function stateOf(app) {
  const art = app === 'Spotify' ? ' & sep & (artwork url of current track)' : ' & sep & ""';
  const out = await osa(`set sep to (ASCII character 31)
if application "${app}" is running then
  tell application "${app}"
    if player state is stopped then return "stopped"
    return (player state as string) & sep & (name of current track) & sep & (artist of current track) & sep & (album of current track) & sep & (sound volume as string)${art}
  end tell
end if
return "off"`);
  if (!out || out === 'off' || out === 'stopped') return null;
  const [st, title, artist, album, vol, artUrl] = out.split(SEP);
  return { app, playing: st === 'playing', title, artist, album, vol: Math.max(0, Math.min(1, Number(vol) / 100)), artUrl };
}

let last = null; // dernière appli suivie
async function current() {
  const list = (await Promise.all(APPS.map(stateOf))).filter(Boolean);
  const s = list.find((x) => x.playing) || list.find((x) => last && x.app === last) || list[0] || null;
  if (s) last = s.app;
  return s;
}

// Pochette Spotify (URL https://i.scdn.co/…) mise en cache dans dir.
async function cover(url, dir) {
  if (!url || !/^https:\/\/i\.scdn\.co\//.test(url) || !dir) return '';
  const file = path.join(dir, 'cover-' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 16) + '.jpg');
  if (fs.existsSync(file)) return file;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return file;
  } catch { return ''; }
}

async function ask(cmd, dir) {
  const s = await current();
  if (!s) return { active: false };
  const tell = (what) => osa(`tell application "${s.app}" to ${what}`);
  if (cmd === 'toggle') { await tell('playpause'); return { ok: true }; }
  if (cmd === 'next') { await tell('next track'); return { ok: true }; }
  if (cmd === 'prev') { await tell('previous track'); return { ok: true }; }
  const m = /^vol (\d(?:\.\d+)?)$/.exec(String(cmd || ''));
  if (m) {
    const v = Math.max(0, Math.min(1, Number(m[1])));
    await tell(`set sound volume to ${Math.round(v * 100)}`);
    return { ok: true, vol: v };
  }
  return {
    active: true, app: s.app === 'Music' ? 'Apple Music' : s.app, title: s.title, artist: s.artist, album: s.album,
    status: s.playing ? 'Playing' : 'Paused', thumb: await cover(s.artUrl, dir), vol: s.vol,
  };
}

module.exports = { ask, stop: () => {} };
