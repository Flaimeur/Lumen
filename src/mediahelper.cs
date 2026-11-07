// Lumen : ce qui joue sur le PC (contrôles multimédias de Windows). Compilé à la volée par mediactl.js
// avec le compilateur C# de .NET Framework. Une commande par ligne sur l'entrée : state, toggle, next, prev.
using System;
using System.IO;
using System.Linq;
using System.Text;
using Windows.Media.Control;

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
      + "\",\"album\":\"" + Esc(p.AlbumTitle) + "\",\"status\":\"" + s.GetPlaybackInfo().PlaybackStatus + "\",\"thumb\":\"" + Esc(thumb) + "\"}";
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
        } else outp = State(dir);
      } catch (Exception e) { outp = "{\"active\":false,\"error\":\"" + Esc(e.Message) + "\"}"; }
      Console.WriteLine(outp);
      Console.Out.Flush();
    }
  }
}
