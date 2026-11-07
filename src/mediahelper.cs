// Lumen : ce qui joue sur le PC (contrôles multimédias de Windows). Compilé à la volée par mediactl.js
// avec le compilateur C# de .NET Framework. Une commande par ligne sur l'entrée : state, toggle, next, prev.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.IO;
using System.Linq;
using System.Text;
using Windows.Media.Control;

// ---- Mélangeur de volume Windows (Core Audio) : volume de chaque application ----
// Appels directs par la table des méthodes COM (plus robuste que l'interop .NET sur les versions récentes de Windows).
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int a, int b, out IntPtr d); int GetDefaultAudioEndpoint(int f, int r, out IMMDevice d); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, out IntPtr iface); }

static class AppVolume {
  delegate int PtrOut(IntPtr self, out IntPtr e);
  delegate int IntOut(IntPtr self, out int n);
  delegate int UIntOut(IntPtr self, out uint v);
  delegate int GetSessionFn(IntPtr self, int i, out IntPtr s);
  delegate int FloatOut(IntPtr self, out float f);
  delegate int SetMaster(IntPtr self, float v, ref Guid ctx);
  delegate int ChanGet(IntPtr self, uint i, out float f);
  delegate int ChanSet(IntPtr self, uint i, float v, ref Guid ctx);
  static D F<D>(IntPtr obj, int slot) { IntPtr vt = Marshal.ReadIntPtr(obj); return (D)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vt, slot * IntPtr.Size), typeof(D)); }
  static readonly Guid IID_Simple = new Guid("87CE5498-68D6-44E5-9215-6F7EED6F7C2B");
  static readonly Guid IID_Channel = new Guid("1C158861-B533-4B30-B1CF-E853E51C59B8");

  // « Spotify.exe », « SpotifyAB.SpotifyMusic_xxx!Spotify », « Chrome », « MSEdge » → nom de processus probable.
  static string Token(string aumid) {
    string t = aumid ?? "";
    if (t.Contains("!")) t = t.Substring(t.LastIndexOf('!') + 1);
    t = Path.GetFileName(t);
    if (t.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) t = t.Substring(0, t.Length - 4);
    t = t.ToLowerInvariant();
    if (t.StartsWith("spotify")) return "spotify";
    if (t == "308046b0af4a39cb" || t.Contains("firefox")) return "firefox";
    return t;
  }

  // Volume d'une session : le volume principal si Windows le donne, sinon celui des canaux (gauche/droite…).
  static float Session(IntPtr s, float set) {
    Guid ctx = Guid.Empty, g = IID_Simple;
    IntPtr p;
    if (Marshal.QueryInterface(s, ref g, out p) == 0 && p != IntPtr.Zero) {
      try {
        if (set >= 0) F<SetMaster>(p, 3)(p, set, ref ctx);
        float v; F<FloatOut>(p, 4)(p, out v); return v;
      } finally { Marshal.Release(p); }
    }
    g = IID_Channel;
    if (Marshal.QueryInterface(s, ref g, out p) != 0 || p == IntPtr.Zero) return -1;
    try {
      uint n; F<UIntOut>(p, 3)(p, out n);
      if (n == 0) return -1;
      if (set >= 0) for (uint i = 0; i < n; i++) F<ChanSet>(p, 4)(p, i, set, ref ctx);
      float max = 0;
      for (uint i = 0; i < n; i++) { float v; F<ChanGet>(p, 5)(p, i, out v); if (v > max) max = v; }
      return max;
    } finally { Marshal.Release(p); }
  }

  // Volume (0 à 1) de l'application ; set >= 0 le change. -1 si introuvable.
  public static float Run(string aumid, float set) {
    string tok = Token(aumid);
    if (tok.Length < 2) return -1;
    if (set > 1) set = 1;
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice dev;
    if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return -1;
    Guid iid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    IntPtr mgr;
    if (dev.Activate(ref iid, 23, IntPtr.Zero, out mgr) != 0 || mgr == IntPtr.Zero) return -1;
    float found = -1;
    IntPtr e = IntPtr.Zero;
    try {
      if (F<PtrOut>(mgr, 5)(mgr, out e) != 0 || e == IntPtr.Zero) return -1;
      int n; F<IntOut>(e, 3)(e, out n);
      for (int i = 0; i < n; i++) {
        IntPtr s; if (F<GetSessionFn>(e, 4)(e, i, out s) != 0 || s == IntPtr.Zero) continue;
        try {
          uint pid; F<UIntOut>(s, 14)(s, out pid);
          if (pid == 0) continue;
          string name;
          try { name = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch { continue; }
          if (!(name == tok || name.StartsWith(tok) || tok.StartsWith(name))) continue;
          float v = Session(s, set);
          if (v > found) found = v;
        } finally { Marshal.Release(s); }
      }
    } finally { if (e != IntPtr.Zero) Marshal.Release(e); Marshal.Release(mgr); }
    return found;
  }
}

public static class LumenMedia {
  static GlobalSystemMediaTransportControlsSessionManager mgr;
  static string lastKey = "", thumb = "";

  // Attend une opération Windows sans passer par les extensions .NET (conflit de métadonnées).
  static T Wait<T>(Windows.Foundation.IAsyncOperation<T> op) {
    for (int i = 0; i < 1000 && op.Status == Windows.Foundation.AsyncStatus.Started; i++) System.Threading.Thread.Sleep(5);
    return op.GetResults();
  }

  static string Esc(string s) {
    if (s == null) return "";
    var b = new StringBuilder();
    foreach (char c in s) {
      if (c == '"' || c == '\\') b.Append('\\').Append(c);
      else if (c < 32) b.Append("\\u").Append(((int)c).ToString("x4"));
      else b.Append(c);
    }
    return b.ToString();
  }

  // Lumen lui-même (sa musique de fond) est ignoré ; on préfère la session qui joue.
  static GlobalSystemMediaTransportControlsSession Pick() {
    var all = mgr.GetSessions().Where(s => !System.Text.RegularExpressions.Regex.IsMatch(s.SourceAppUserModelId ?? "", "lumen|electron", System.Text.RegularExpressions.RegexOptions.IgnoreCase)).ToList();
    var playing = all.FirstOrDefault(s => s.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing);
    return playing ?? all.FirstOrDefault();
  }

  static string State(string dir) {
    var s = Pick();
    if (s == null) return "{\"active\":false}";
    var p = Wait(s.TryGetMediaPropertiesAsync());
    string key = s.SourceAppUserModelId + "|" + p.Title + "|" + p.Artist;
    if (key != lastKey) {
      lastKey = key;
      thumb = "";
      try {
        if (p.Thumbnail != null) {
          var st = Wait(p.Thumbnail.OpenReadAsync());
          string file = Path.Combine(dir, "cover-" + Math.Abs(key.GetHashCode()) + ".jpg");
          var reader = new Windows.Storage.Streams.DataReader(st);
          uint n = Wait(reader.LoadAsync((uint)st.Size));
          var bytes = new byte[n];
          reader.ReadBytes(bytes);
          File.WriteAllBytes(file, bytes);
          thumb = file;
        }
      } catch { thumb = ""; }
    }
    return "{\"active\":true,\"app\":\"" + Esc(s.SourceAppUserModelId) + "\",\"title\":\"" + Esc(p.Title) + "\",\"artist\":\"" + Esc(p.Artist)
      + "\",\"album\":\"" + Esc(p.AlbumTitle) + "\",\"status\":\"" + s.GetPlaybackInfo().PlaybackStatus + "\",\"thumb\":\"" + Esc(thumb) + "\",\"vol\":" + Vol(s.SourceAppUserModelId, -1) + "}";
  }

  static string Vol(string aumid, float set) {
    try { float v = AppVolume.Run(aumid, set); return v < 0 ? "null" : v.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture); }
    catch { return "null"; }
  }

  public static void Main(string[] args) {
    Console.OutputEncoding = new UTF8Encoding(false);
    string dir = args.Length > 0 ? args[0] : Path.GetTempPath();
    Directory.CreateDirectory(dir);
    mgr = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
    Console.WriteLine("{\"ready\":true}");
    Console.Out.Flush();
    string line;
    while ((line = Console.ReadLine()) != null) {
      string outp;
      try {
        line = line.Trim();
        if (line == "toggle" || line == "next" || line == "prev") {
          var s = Pick();
          if (s != null) {
            var op = line == "toggle" ? s.TryTogglePlayPauseAsync() : line == "next" ? s.TrySkipNextAsync() : s.TrySkipPreviousAsync();
            for (int i = 0; i < 300 && op.Status == Windows.Foundation.AsyncStatus.Started; i++) System.Threading.Thread.Sleep(10);
          }
          outp = "{\"ok\":true}";
        } else if (line.StartsWith("vol ")) {
          var s = Pick();
          float want;
          if (s == null || !float.TryParse(line.Substring(4), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out want)) outp = "{\"vol\":null}";
          else outp = "{\"vol\":" + Vol(s.SourceAppUserModelId, want) + "}";
        } else outp = State(dir);
      } catch (Exception e) { outp = "{\"active\":false,\"error\":\"" + Esc(e.Message) + "\"}"; }
      Console.WriteLine(outp);
      Console.Out.Flush();
    }
  }
}
