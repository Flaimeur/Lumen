'use strict';
const path = require('path');

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
  for (const [key, value] of Object.entries(emulators || {})) {
    vars[key] = value || '';
    vars[key + 'Dir'] = value ? path.dirname(value) : '';
  }
  const missing = new Set();
  const filled = template.replace(/\{(\w+)\}/g, (_m, key) => {
    if (!(key in vars) || !vars[key]) {
      missing.add(key.replace(/Dir$/, ''));
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
