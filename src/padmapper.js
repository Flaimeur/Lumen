'use strict';
// Manette → clavier/souris pour les jeux qui ne gèrent pas la manette.
// Un petit programme d'aide (PowerShell + C#, aucun téléchargement) reçoit des commandes sur son entrée
// standard et les envoie à Windows avec SendInput. Les touches passent par leurs scancodes : elles
// correspondent à des positions physiques (ZQSD sur AZERTY = WASD sur QWERTY) et marchent en DirectInput.
const { spawn } = require('child_process');

// Noms de touches (comme KeyboardEvent.code) → scancode « set 1 » ; e = touche étendue.
const SCAN = {
  Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05, Digit5: 0x06, Digit6: 0x07, Digit7: 0x08, Digit8: 0x09,
  Digit9: 0x0a, Digit0: 0x0b, Minus: 0x0c, Equal: 0x0d, Backspace: 0x0e, Tab: 0x0f,
  KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13, KeyT: 0x14, KeyY: 0x15, KeyU: 0x16, KeyI: 0x17, KeyO: 0x18, KeyP: 0x19,
  BracketLeft: 0x1a, BracketRight: 0x1b, Enter: 0x1c, ControlLeft: 0x1d,
  KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20, KeyF: 0x21, KeyG: 0x22, KeyH: 0x23, KeyJ: 0x24, KeyK: 0x25, KeyL: 0x26,
  Semicolon: 0x27, Quote: 0x28, Backquote: 0x29, ShiftLeft: 0x2a, Backslash: 0x2b,
  KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e, KeyV: 0x2f, KeyB: 0x30, KeyN: 0x31, KeyM: 0x32, Comma: 0x33, Period: 0x34, Slash: 0x35,
  ShiftRight: 0x36, AltLeft: 0x38, Space: 0x39, CapsLock: 0x3a,
  F1: 0x3b, F2: 0x3c, F3: 0x3d, F4: 0x3e, F5: 0x3f, F6: 0x40, F7: 0x41, F8: 0x42, F9: 0x43, F10: 0x44, F11: 0x57, F12: 0x58,
  Numpad0: 0x52, Numpad1: 0x4f, Numpad2: 0x50, Numpad3: 0x51, Numpad4: 0x4b, Numpad5: 0x4c, Numpad6: 0x4d, Numpad7: 0x47, Numpad8: 0x48, Numpad9: 0x49,
  IntlBackslash: 0x56,
  // Étendues
  ControlRight: 0x1d | 0x100, AltRight: 0x38 | 0x100, ArrowUp: 0x48 | 0x100, ArrowDown: 0x50 | 0x100, ArrowLeft: 0x4b | 0x100,
  ArrowRight: 0x4d | 0x100, Home: 0x47 | 0x100, End: 0x4f | 0x100, PageUp: 0x49 | 0x100, PageDown: 0x51 | 0x100,
  Insert: 0x52 | 0x100, Delete: 0x53 | 0x100,
};
const MOUSE = { MouseLeft: 'L', MouseRight: 'R', MouseMiddle: 'M' };

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LumenInput {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  static void Send(INPUT i) { SendInput(1, new[] { i }, Marshal.SizeOf(typeof(INPUT))); }
  public static void Key(int scan, bool up) {
    var i = new INPUT { type = 1 };
    i.u.ki.wScan = (ushort)(scan & 0xff);
    i.u.ki.dwFlags = 0x0008u | ((scan & 0x100) != 0 ? 0x0001u : 0u) | (up ? 0x0002u : 0u);
    Send(i);
  }
  public static void Move(int dx, int dy) { var i = new INPUT { type = 0 }; i.u.mi.dx = dx; i.u.mi.dy = dy; i.u.mi.dwFlags = 0x0001; Send(i); }
  public static void Button(string b, bool up) {
    uint f = b == "L" ? (up ? 0x0004u : 0x0002u) : b == "R" ? (up ? 0x0010u : 0x0008u) : (up ? 0x0040u : 0x0020u);
    var i = new INPUT { type = 0 }; i.u.mi.dwFlags = f; Send(i);
  }
  public static void Wheel(int d) { var i = new INPUT { type = 0 }; i.u.mi.mouseData = (uint)d; i.u.mi.dwFlags = 0x0800; Send(i); }
}
'@
[Console]::Out.WriteLine('ready')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  foreach ($c in $line.Split('|')) {
    $p = $c.Split(' ')
    switch ($p[0]) {
      'kd' { [LumenInput]::Key([int]$p[1], $false) }
      'ku' { [LumenInput]::Key([int]$p[1], $true) }
      'mm' { [LumenInput]::Move([int]$p[1], [int]$p[2]) }
      'md' { [LumenInput]::Button($p[1], $false) }
      'mu' { [LumenInput]::Button($p[1], $true) }
      'wh' { [LumenInput]::Wheel([int]$p[1]) }
    }
  }
}
`;

let proc = null;
let ready = false;
const down = new Set(); // touches/boutons enfoncés, relâchés à l'arrêt

function start() {
  if (proc) return;
  ready = false;
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  proc.stdout.on('data', (d) => { if (String(d).includes('ready')) ready = true; });
  proc.on('exit', () => { proc = null; ready = false; down.clear(); });
}

// Événements venant du rendu : [{ t: 'down'|'up', key }] ou [{ t: 'move', dx, dy }] ou [{ t: 'wheel', d }]
function send(events) {
  if (!proc || !ready || !Array.isArray(events)) return;
  const cmds = [];
  for (const e of events) {
    if (e.t === 'move') { const dx = Math.round(e.dx) | 0; const dy = Math.round(e.dy) | 0; if (dx || dy) cmds.push(`mm ${dx} ${dy}`); continue; }
    if (e.t === 'wheel') { cmds.push(`wh ${Math.round(e.d) | 0}`); continue; }
    const isDown = e.t === 'down';
    if (MOUSE[e.key]) { cmds.push(`${isDown ? 'md' : 'mu'} ${MOUSE[e.key]}`); }
    else if (e.key === 'WheelUp' || e.key === 'WheelDown') { if (isDown) cmds.push(`wh ${e.key === 'WheelUp' ? 120 : -120}`); continue; }
    else if (SCAN[e.key] !== undefined) { cmds.push(`${isDown ? 'kd' : 'ku'} ${SCAN[e.key]}`); }
    else continue;
    if (isDown) down.add(e.key); else down.delete(e.key);
  }
  if (cmds.length) proc.stdin.write(cmds.join('|') + '\n');
}

function stop() {
  if (!proc) return;
  // Rien ne doit rester enfoncé dans le jeu.
  send([...down].map((key) => ({ t: 'up', key })));
  const p = proc;
  setTimeout(() => { try { p.stdin.end(); p.kill(); } catch { /* déjà fermé */ } }, 150);
  proc = null;
}

module.exports = { start, send, stop, SCAN };
