'use strict';
// Captures d'écran en jeu : image de l'écran principal, rangée dans Images\Lumen\<nom du jeu>\.
// Marche en plein écran fenêtré / sans bordure ; un plein écran exclusif peut donner une image noire.
const { app, desktopCapturer, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const root = () => path.join(app.getPath('pictures'), 'Lumen');
// Nom de dossier sûr pour Windows.
const folderName = (name) => String(name || 'Jeu').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'Jeu';
const gameDir = (name) => path.join(root(), folderName(name));
const pad = (n) => String(n).padStart(2, '0');

async function take(gameName) {
  const d = screen.getPrimaryDisplay();
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = sources.find((s) => String(s.display_id) === String(d.id)) || sources[0];
  if (!src || src.thumbnail.isEmpty()) throw new Error('Écran impossible à capturer.');
  const now = new Date();
  const dir = gameDir(gameName);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.jpg`);
  fs.writeFileSync(file, src.thumbnail.toJPEG(92));
  return { file, thumb: src.thumbnail.resize({ width: 200 }).toDataURL() };
}

// Captures d'un jeu, les plus récentes d'abord.
function list(gameName) {
  const dir = gameDir(gameName);
  try {
    return fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => { const p = path.join(dir, f); return { path: p, time: fs.statSync(p).mtimeMs }; })
      .sort((a, b) => b.time - a.time);
  } catch { return []; }
}

module.exports = { take, list, gameDir, root };
