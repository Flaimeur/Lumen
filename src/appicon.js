'use strict';
// Icône d'un programme ou d'un raccourci en grand format (jusqu'à 256 px), via la liste d'images « jumbo »
// du Shell Windows. Un raccourci (.lnk) donne l'icône qu'il affiche dans l'Explorateur.
const { execFile } = require('child_process');

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
public static class LumenIcon {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct SHFILEINFO { public IntPtr hIcon; public int iIcon; public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName; }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SHGetFileInfo(string p, uint a, ref SHFILEINFO i, uint s, uint f);
  [DllImport("shell32.dll")] static extern int SHGetImageList(int list, ref Guid riid, out IImageList ppv);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr h);
  [ComImport, Guid("46EB5926-582E-4017-9FDF-E8998DAA0950"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IImageList {
    [PreserveSig] int Add(IntPtr a, IntPtr b, ref int c);
    [PreserveSig] int ReplaceIcon(int i, IntPtr h, ref int p);
    [PreserveSig] int SetOverlayImage(int a, int b);
    [PreserveSig] int Replace(int i, IntPtr a, IntPtr b);
    [PreserveSig] int AddMasked(IntPtr a, int c, ref int p);
    [PreserveSig] int Draw(IntPtr p);
    [PreserveSig] int Remove(int i);
    [PreserveSig] int GetIcon(int i, int flags, ref IntPtr icon);
  }
  public static void Save(string path, string png) {
    var info = new SHFILEINFO();
    SHGetFileInfo(path, 0, ref info, (uint)Marshal.SizeOf(info), 0x4000);
    var iid = new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");
    IImageList list;
    if (SHGetImageList(4, ref iid, out list) != 0) throw new Exception("jumbo");
    IntPtr h = IntPtr.Zero;
    list.GetIcon(info.iIcon, 1, ref h);
    if (h == IntPtr.Zero) throw new Exception("icon");
    using (var ico = Icon.FromHandle(h))
    using (var bmp = ico.ToBitmap()) {
      // Recadre sur la partie non transparente : les petits programmes n'ont souvent qu'une icône 32 px au centre.
      int minX = bmp.Width, minY = bmp.Height, maxX = -1, maxY = -1;
      for (int y = 0; y < bmp.Height; y++) for (int x = 0; x < bmp.Width; x++) {
        if (bmp.GetPixel(x, y).A > 8) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
      }
      if (maxX < 0) throw new Exception("vide");
      int side = Math.Max(maxX - minX + 1, maxY - minY + 1);
      using (var outBmp = new Bitmap(side, side, PixelFormat.Format32bppArgb))
      using (var g = Graphics.FromImage(outBmp)) {
        g.DrawImage(bmp, new Rectangle((side - (maxX - minX + 1)) / 2, (side - (maxY - minY + 1)) / 2, maxX - minX + 1, maxY - minY + 1),
          new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1), GraphicsUnit.Pixel);
        outBmp.Save(png, ImageFormat.Png);
      }
    }
    DestroyIcon(h);
  }
}
'@
[LumenIcon]::Save($env:LUMEN_ICON_SRC, $env:LUMEN_ICON_OUT)
`;

// Chemins passés par variables d'environnement : rien n'est interprété par PowerShell.
function extractIcon(src, out) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true, timeout: 20000, env: { ...process.env, LUMEN_ICON_SRC: src, LUMEN_ICON_OUT: out },
    }, (err) => resolve(!err));
  });
}

module.exports = { extractIcon };
