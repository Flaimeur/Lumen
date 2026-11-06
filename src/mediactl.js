'use strict';
// Ce qui joue sur le PC (Spotify, YouTube dans un navigateur, lecteurs Windows…) via les contrôles
// multimédias du système (SMTC) : titre, artiste, pochette, lecture/pause, suivant, précédent.
// Un processus PowerShell reste ouvert et répond à une commande par ligne.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$TProps = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$TStream = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$lastKey = ''
$thumb = ''
function Say($s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }
Say('{"ready":true}')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $s = $mgr.GetCurrentSession()
    if ($line -eq 'toggle' -or $line -eq 'next' -or $line -eq 'prev') {
      if ($s) {
        if ($line -eq 'toggle') { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
        elseif ($line -eq 'next') { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
        else { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
      }
      Say('{"ok":true}')
    } elseif (-not $s) {
      Say('{"active":false}')
    } else {
      $p = Await ($s.TryGetMediaPropertiesAsync()) $TProps
      $status = $s.GetPlaybackInfo().PlaybackStatus.ToString()
      $key = $s.SourceAppUserModelId + '|' + $p.Title + '|' + $p.Artist
      if ($key -ne $lastKey) {
        $lastKey = $key
        $thumb = ''
        if ($p.Thumbnail) {
          try {
            $stream = Await ($p.Thumbnail.OpenReadAsync()) $TStream
            $size = [uint32]$stream.Size
            $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
            $null = Await ($reader.LoadAsync($size)) ([uint32])
            $bytes = New-Object byte[] $size
            $reader.ReadBytes($bytes)
            $file = Join-Path $env:LUMEN_MEDIA_DIR ('cover-' + [Math]::Abs($key.GetHashCode()) + '.jpg')
            [IO.File]::WriteAllBytes($file, $bytes)
            $thumb = $file
          } catch { $thumb = '' }
        }
      }
      Say((@{ active = $true; app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; status = $status; thumb = $thumb } | ConvertTo-Json -Compress))
    }
  } catch {
    Say((@{ active = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`;

let proc = null;
let ready = null;
const waiting = [];
let coverDir = '';

function start(dir) {
  if (proc || process.platform !== 'win32') return;
  coverDir = dir;
  fs.mkdirSync(dir, { recursive: true });
  // Pochettes d'anciens morceaux : on ne garde que les 20 plus récentes.
  try {
    const files = fs.readdirSync(dir).map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const f of files.slice(20)) fs.rmSync(f, { force: true });
  } catch { /* dossier vide */ }
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, LUMEN_MEDIA_DIR: dir },
  });
  let resolveReady;
  ready = new Promise((r) => { resolveReady = r; });
  let rest = '';
  proc.stdout.on('data', (d) => {
    rest += d.toString();
    const lines = rest.split(/\r?\n/);
    rest = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.ready) { resolveReady(true); continue; }
      const w = waiting.shift();
      if (w) w(msg);
    }
  });
  proc.on('exit', () => { proc = null; ready = null; while (waiting.length) waiting.shift()({ active: false, error: 'arrêté' }); });
}

// Envoie une commande ('state', 'toggle', 'next', 'prev') et attend la réponse (8 s max).
async function ask(cmd, dir) {
  if (process.platform !== 'win32') return { active: false };
  if (!proc) start(dir || coverDir);
  if (!proc) return { active: false };
  const ok = await Promise.race([ready, new Promise((r) => setTimeout(() => r(false), 20000))]);
  if (!ok || !proc) return { active: false, error: 'indisponible' };
  return new Promise((resolve) => {
    const timer = setTimeout(() => { const i = waiting.indexOf(done); if (i >= 0) waiting.splice(i, 1); resolve({ active: false, error: 'délai' }); }, 8000);
    function done(msg) { clearTimeout(timer); resolve(msg); }
    waiting.push(done);
    proc.stdin.write(cmd + '\n');
  });
}

function stop() { if (proc) { try { proc.kill(); } catch { /* déjà arrêté */ } proc = null; } }

module.exports = { ask, stop };
