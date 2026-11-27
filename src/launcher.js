'use strict';
const path = require('path');
const { resolveApp, retroarchCores } = require('./platform');

// Découpe une ligne de commande en arguments en respectant les guillemets.
// Les antislashs sont gardés tels quels (chemins Windows).
function tokenize(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  let started = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; started = true; continue; }
    if (!inQuotes && /\s/.test(ch)) {
      if (started) { out.push(cur); cur = ''; started = false; }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

// Remplace {rom}, {romDir}, {romName}, {retroarch}, {retroarchDir}, {dolphin}… puis découpe.
function buildLaunch(template, rom, emulators) {
  const vars = { rom, romDir: path.dirname(rom), romName: path.parse(rom).name };
  for (const [key, raw] of Object.entries(emulators || {})) {
    // Mac : une appli « Dolphin.app » est lancée par son vrai programme (Contents/MacOS/…).
    const value = resolveApp(raw || '');
    vars[key] = value || '';
    vars[key + 'Dir'] = value ? path.dirname(value) : '';
  }
  // Dossier des cœurs RetroArch (Mac : ~/Library/Application Support/RetroArch/cores).
  if (vars.retroarch) vars.retroarchCores = retroarchCores(vars.retroarch);
  const missing = new Set();
  const filled = template.replace(/\{(\w+)\}/g, (_m, key) => {
    if (!(key in vars) || !vars[key]) {
      missing.add(key.replace(/(Dir|Cores)$/, ''));
      return '';
    }
    return vars[key];
  });
  if (missing.size) {
    throw new Error(`Chemin non configuré : ${[...missing].join(', ')}. Va dans Réglages → Émulateurs.`);
  }
  const parts = tokenize(filled);
  if (!parts.length) throw new Error('Commande de lancement vide.');
  return { exe: parts[0], args: parts.slice(1) };
}

module.exports = { tokenize, buildLaunch };
