'use strict';
// Manettes PlayStation lues directement en HID (DualSense, DualShock 4 ; USB et Bluetooth).
// Chromium ne comprend pas le mode Bluetooth « étendu » (rapport 0x31/0x11) qu'un autre logiciel active
// souvent : la manette est alors invisible pour lui. Ce lecteur la décode et envoie un état « standard ».
const { spawn } = require('child_process');

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class LumenPad {
  [DllImport("hid.dll")] static extern void HidD_GetHidGuid(out Guid g);
  [DllImport("hid.dll")] static extern bool HidD_GetAttributes(SafeFileHandle h, ref ATTR a);
  [StructLayout(LayoutKind.Sequential)] struct ATTR { public int Size; public ushort Vid, Pid, Ver; }
  [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] static extern IntPtr SetupDiGetClassDevs(ref Guid g, string e, IntPtr p, int f);
  [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] static extern bool SetupDiEnumDeviceInterfaces(IntPtr s, IntPtr d, ref Guid g, int i, ref IFACE data);
  [DllImport("setupapi.dll", CharSet = CharSet.Unicode)] static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr s, ref IFACE data, IntPtr detail, int size, out int req, IntPtr di);
  [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr s);
  [StructLayout(LayoutKind.Sequential)] struct IFACE { public int cbSize; public Guid g; public int flags; public IntPtr reserved; }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern SafeFileHandle CreateFile(string n, uint a, uint s, IntPtr sec, uint c, uint f, IntPtr t);

  static readonly object Out = new object();
  static readonly HashSet<string> Open = new HashSet<string>();
  static void Emit(string line) { lock (Out) { Console.Out.WriteLine(line); Console.Out.Flush(); } }

  static List<string> Paths() {
    var res = new List<string>(); Guid g; HidD_GetHidGuid(out g);
    IntPtr set = SetupDiGetClassDevs(ref g, null, IntPtr.Zero, 0x12);
    var d = new IFACE(); d.cbSize = Marshal.SizeOf(d);
    for (int i = 0; SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref g, i, ref d); i++) {
      int req; SetupDiGetDeviceInterfaceDetail(set, ref d, IntPtr.Zero, 0, out req, IntPtr.Zero);
      IntPtr buf = Marshal.AllocHGlobal(req); Marshal.WriteInt32(buf, IntPtr.Size == 8 ? 8 : 6);
      if (SetupDiGetDeviceInterfaceDetail(set, ref d, buf, req, out req, IntPtr.Zero)) res.Add(Marshal.PtrToStringUni(IntPtr.Add(buf, 4)));
      Marshal.FreeHGlobal(buf);
    }
    SetupDiDestroyDeviceInfoList(set);
    return res;
  }

  // Décodage → "S id type b0..b17 lx ly rx ry"
  // Windows renvoie chaque paquet à la taille maximale : la longueur ne distingue pas USB et Bluetooth,
  // c'est le chemin du périphérique (service HID Bluetooth 00001124) qui le fait.
  static string Decode(byte[] r, int n, bool ds5, bool bt) {
    int o;
    if (ds5) {
      if (r[0] == 0x31 && n >= 12) o = 2;          // Bluetooth étendu
      else if (r[0] == 0x01 && bt && n >= 10) return Simple(r); // Bluetooth simple
      else if (r[0] == 0x01 && n >= 12) o = 1;     // USB
      else return null;
      byte b0 = r[o + 7], b1 = r[o + 8], b2 = r[o + 9];
      return Pack(r[o], r[o + 1], r[o + 2], r[o + 3], b0, b1, b2, r[o + 4], r[o + 5]);
    } else {
      if (r[0] == 0x11 && n >= 12) o = 3;          // DualShock 4 Bluetooth étendu
      else if (r[0] == 0x01 && n >= 10) o = 1;     // USB ou Bluetooth simple
      else return null;
      return Pack(r[o], r[o + 1], r[o + 2], r[o + 3], r[o + 4], r[o + 5], r[o + 6], r[o + 7], r[o + 8]);
    }
  }
  // Batterie → "niveau(0-100) charge(0/1)" ou null. DualSense : octet 53 (USB) / 54 (Bluetooth étendu),
  // 4 bits bas = niveau 0-10, 4 bits hauts = état (1 en charge, 2 pleine). DualShock 4 : octet 30 (USB) / 32 (BT),
  // 4 bits bas = niveau, bit 4 = câble branché.
  static string Battery(byte[] r, int n, bool ds5, bool bt) {
    int i;
    if (ds5) { if (r[0] == 0x31) i = 54; else if (r[0] == 0x01 && !bt) i = 53; else return null; }
    else { if (r[0] == 0x11) i = 32; else if (r[0] == 0x01 && !bt) i = 30; else return null; }
    if (n <= i) return null;
    int v = r[i], lvl, chg;
    if (ds5) { lvl = Math.Min(100, (v & 0x0F) * 10 + 5); int st = (v >> 4) & 0x0F; chg = st == 1 || st == 2 ? 1 : 0; if (st == 2) lvl = 100; }
    else { chg = (v & 0x10) != 0 ? 1 : 0; lvl = Math.Min(100, (v & 0x0F) * (chg == 1 ? 9 : 10) + 5); }
    return lvl + " " + chg;
  }
  static string Simple(byte[] r) { return Pack(r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9]); }
  static string Pack(byte lx, byte ly, byte rx, byte ry, byte b0, byte b1, byte b2, byte l2, byte r2) {
    int hat = b0 & 0x0F;
    bool up = hat == 7 || hat == 0 || hat == 1, right = hat >= 1 && hat <= 3, down = hat >= 3 && hat <= 5, left = hat >= 5 && hat <= 7;
    bool[] b = {
      (b0 & 0x20) != 0, (b0 & 0x40) != 0, (b0 & 0x10) != 0, (b0 & 0x80) != 0,   // ✕ ○ □ △
      (b1 & 0x01) != 0, (b1 & 0x02) != 0, (b1 & 0x04) != 0 || l2 > 40, (b1 & 0x08) != 0 || r2 > 40,
      (b1 & 0x10) != 0, (b1 & 0x20) != 0, (b1 & 0x40) != 0, (b1 & 0x80) != 0,
      up, down, left, right, (b2 & 0x01) != 0, (b2 & 0x02) != 0 };
    var s = new char[b.Length]; for (int i = 0; i < b.Length; i++) s[i] = b[i] ? '1' : '0';
    return new string(s) + " " + lx + " " + ly + " " + rx + " " + ry + " " + l2 + " " + r2;
  }

  static void Reader(string path, int id, string type, bool ds5) {
    bool bt = path.ToLowerInvariant().Contains("00001124");
    try {
      var h = CreateFile(path, 0x80000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
      if (h.IsInvalid) { Emit("E " + id + " " + Marshal.GetLastWin32Error()); lock (Open) Open.Remove(path); return; }
      using (var fs = new FileStream(h, FileAccess.Read, 1, false)) {
        Emit("C " + id + " " + type);
        var buf = new byte[600]; string last = null, lastBat = null; DateTime batAt = DateTime.MinValue;
        while (true) {
          int n = fs.Read(buf, 0, buf.Length);
          if (n <= 0) break;
          string s = Decode(buf, n, ds5, bt);
          if (s != null && s != last) { last = s; Emit("S " + id + " " + type + " " + s); }
          if ((DateTime.Now - batAt).TotalSeconds > 20) {
            batAt = DateTime.Now;
            string bat = Battery(buf, n, ds5, bt);
            if (bat != null && bat != lastBat) { lastBat = bat; Emit("B " + id + " " + type + " " + bat); }
          }
        }
      }
    } catch { }
    Emit("D " + id);
    lock (Open) Open.Remove(path);
  }

  [StructLayout(LayoutKind.Sequential)] struct XBAT { public byte Type; public byte Level; }
  [DllImport("xinput1_4.dll")] static extern int XInputGetBatteryInformation(int user, byte devType, out XBAT info);
  static readonly string[] XLast = new string[4];
  static void XboxBattery() {
    for (int u = 0; u < 4; u++) {
      XBAT b; string s;
      try { s = XInputGetBatteryInformation(u, 0, out b) == 0 && b.Type != 0 ? (b.Type == 1 ? "100 1" : (b.Level * 33 + 1) + " 0") : null; }
      catch { return; }
      if (s != XLast[u]) { XLast[u] = s; Emit(s == null ? "X " + u + " gone" : "X " + u + " " + s); }
    }
  }
  public static void Run() {
    int next = 0;
    Emit("ready");
    new Thread(() => { while (true) { XboxBattery(); Thread.Sleep(30000); } }) { IsBackground = true }.Start();
    while (true) {
      foreach (var p in Paths()) {
        string lp = p.ToLowerInvariant();
        if (lp.IndexOf("054c") < 0) continue;
        lock (Open) { if (Open.Contains(p)) continue; }
        string type = null; bool ds5 = false;
        if (lp.Contains("pid_0ce6") || lp.Contains("pid&0ce6") || lp.Contains("pid_0df2") || lp.Contains("pid&0df2")) { type = "ps5"; ds5 = true; }
        else if (lp.Contains("05c4") || lp.Contains("09cc") || lp.Contains("0ba0")) type = "ps4";
        if (type == null) continue;
        lock (Open) Open.Add(p);
        int id = next++;
        var t = new Thread(() => Reader(p, id, type, ds5)); t.IsBackground = true; t.Start();
      }
      Thread.Sleep(3000);
    }
  }
}
'@
[LumenPad]::Run()
`;

let proc = null;

// onEvent({ kind: 'connect' | 'state' | 'disconnect', id, type, buttons, axes })
function start(onEvent) {
  if (proc || process.platform !== 'win32') return;
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let rest = '';
  proc.stdout.on('data', (d) => {
    rest += d.toString();
    const lines = rest.split(/\r?\n/);
    rest = lines.pop();
    for (const line of lines) {
      const p = line.trim().split(' ');
      if (p[0] === 'C') onEvent({ kind: 'connect', id: Number(p[1]), type: p[2] });
      else if (p[0] === 'B' && p.length >= 5) onEvent({ kind: 'battery', key: 'ps' + p[1], type: p[2], level: Number(p[3]), charging: p[4] === '1' });
      else if (p[0] === 'X' && p.length >= 3) onEvent(p[2] === 'gone' ? { kind: 'battery', key: 'xb' + p[1], gone: true } : { kind: 'battery', key: 'xb' + p[1], type: 'xbox', level: Number(p[2]), charging: p[3] === '1' });
      else if (p[0] === 'D') onEvent({ kind: 'disconnect', id: Number(p[1]) });
      else if (p[0] === 'S' && p.length >= 10) {
        const axis = (v) => { const x = (Number(v) - 128) / 127; return Math.abs(x) < 0.08 ? 0 : Math.max(-1, Math.min(1, x)); };
        onEvent({
          kind: 'state', id: Number(p[1]), type: p[2],
          buttons: p[3].split('').map((c) => c === '1'),
          axes: [axis(p[4]), axis(p[5]), axis(p[6]), axis(p[7])],
          triggers: [Number(p[8]) / 255, Number(p[9]) / 255],
        });
      }
    }
  });
  proc.on('exit', () => { proc = null; });
}

function stop() { if (proc) { try { proc.kill(); } catch { /* déjà arrêté */ } proc = null; } }

module.exports = { start, stop };
