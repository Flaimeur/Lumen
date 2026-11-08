'use strict';
// Icônes de l'interface : un seul jeu de pictos SVG au trait (24 × 24, trait 2, bouts arrondis).
// Les libellés écrits avec un emoji en tête (« 🎲 Relancer », « ▶ Jouer »…) sont convertis
// automatiquement : l'emoji est remplacé par le picto correspondant. Les emojis n'ont pas le même
// dessin ni la même taille selon la police ; les pictos, eux, suivent la couleur et la taille du texte.
(() => {
  const P = {
    play: '<path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.6-7.2a.8.8 0 0 0 0-1.4L8.2 4.1a.8.8 0 0 0-1.2.7z" fill="currentColor" stroke="none"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
    up: '<path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-8.5 8.5"/>',
    edit: '<path d="M14.5 5.5l4 4M4 20l1-4.5L15.8 4.7a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L8.5 19z"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    starFill: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>',
    gamepad: '<rect x="2.5" y="6.5" width="19" height="12" rx="6"/><path d="M7.5 10.5v4M5.5 12.5h4M15.5 11.5h.01M17.5 13.5h.01"/>',
    joystick: '<circle cx="12" cy="7" r="3"/><path d="M12 10v6M5 16.5h14v3H5z"/>',
    music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>',
    hide: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.6-.8 1.2-1.7-.5-1.1.2-2.3 1.4-2.3h1.9a3.9 3.9 0 0 0 3.9-3.9C20.4 7.4 16.6 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="15" cy="8" r="1.1" fill="currentColor"/>',
    sort: '<path d="M8 4v16M4.5 7.5 8 4l3.5 3.5M16 20V4M12.5 16.5 16 20l3.5-3.5"/>',
    swap: '<path d="M8 20V4M4.5 16.5 8 20l3.5-3.5M16 4v16M12.5 7.5 16 4l3.5 3.5"/>',
    filter: '<path d="M4 5.5h16l-6 7.2v5.3l-4 2v-7.3z"/>',
    list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
    move: '<path d="M12 3v18M3 12h18M9.5 5.5 12 3l2.5 2.5M9.5 18.5 12 21l2.5-2.5M5.5 9.5 3 12l2.5 2.5M18.5 9.5 21 12l-2.5 2.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
    library: '<rect x="4" y="4" width="4.5" height="16" rx="1.2"/><rect x="10.5" y="4" width="4.5" height="16" rx="1.2"/><path d="m16.8 5.4 3.4-.9 2.3 15-3.4.9z" transform="translate(-1.5 0)"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none"/>',
    stats: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>',
    sound: '<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" fill="currentColor"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.6 7.6 0 0 1 0 10.8"/>',
    mute: '<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    fullscreen: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
    power: '<path d="M12 3.5v8M7.2 6.5a7.5 7.5 0 1 0 9.6 0"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    back: '<path d="M14.5 6 8.5 12l6 6"/>',
    more: '<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M9.5 3h5"/>',
    note: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M9 11h6M9 14.5h6M9 18h3.5"/>',
    box: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
    adult: '<circle cx="12" cy="12" r="8.5"/><path d="M8 9.5 9.5 8.5v7"/><circle cx="14.5" cy="10.2" r="1.6"/><circle cx="14.5" cy="13.8" r="1.9"/>',
    sparkle: '<path d="M11 3.5l1.8 5.2 5.2 1.8-5.2 1.8L11 17.5l-1.8-5.2L4 10.5l5.2-1.8z"/><path d="M18.5 15.5v5M16 18h5"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5 3.8 3.8 0 0 1-.5 7.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    sunCloud: '<path d="M9 3v1.5M3.5 9H5M4.9 4.9l1 1M13.1 4.9l-1 1M6.3 11.5A3.5 3.5 0 0 1 12 7.6"/><path d="M8.5 20a3.5 3.5 0 0 1-.3-7 5 5 0 0 1 9.6 1.3 3 3 0 0 1-.3 5.7z"/>',
    rain: '<path d="M7 15.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5 3.8 3.8 0 0 1-.5 7.5z"/><path d="M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/>',
    snow: '<path d="M7 15.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5 3.8 3.8 0 0 1-.5 7.5z"/><path d="M8.5 19.5h.01M12 20.5h.01M15.5 19.5h.01"/>',
    storm: '<path d="M7 15.5a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5 3.8 3.8 0 0 1-.5 7.5z"/><path d="m12.5 15.5-2 3.5h3l-2 3"/>',
    fog: '<path d="M4 9h16M6.5 13h11M4 17h16"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>',
    mouse: '<rect x="6.5" y="3.5" width="11" height="17" rx="5.5"/><path d="M12 7v3"/>',
  };
  // Emoji ou symbole en tête de libellé → picto.
  const MAP = {
    '▶': 'play', '⬇': 'download', '⤓': 'download', '⬆': 'up', '🖼': 'image', '✎': 'edit', '✏': 'edit', '✕': 'close',
    '📁': 'folder', '✩': 'star', '☆': 'star', '★': 'starFill', '⭐': 'starFill', 'ℹ': 'info', '🏆': 'trophy', '🎮': 'gamepad',
    '🕹': 'joystick', '♪': 'music', '🎵': 'music', '🎧': 'headphones', '⦸': 'hide', '🚫': 'hide', '⚙': 'gear', '🎨': 'palette',
    '⇅': 'sort', '⇵': 'swap', '⏷': 'filter', '☰': 'list', '✥': 'move', '＋': 'plus', '⟳': 'refresh', '↻': 'refresh',
    '📚': 'library', '🔍': 'search', '🔎': 'search', '🎲': 'dice', '📊': 'stats', '🔇': 'mute', '🔊': 'sound', '🔉': 'sound',
    '⛶': 'fullscreen', '⏻': 'power', '✓': 'check', '‹': 'back', '⋯': 'more', '🕒': 'clock', '⏱': 'timer', '📝': 'note',
    '📦': 'box', '🔞': 'adult', '🆕': 'sparkle', '☁': 'cloud', '☀': 'sun', '🌙': 'moon', '🌤': 'sunCloud', '🌦': 'sunCloud',
    '⛅': 'sunCloud', '🌧': 'rain', '🌨': 'snow', '❄': 'snow', '⛈': 'storm', '🌩': 'storm', '🌫': 'fog', '⚠': 'alert', '⚡': 'bolt',
    '⌨': 'keyboard', '🖱': 'mouse',
  };
  const keys = Object.keys(MAP).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const LEAD = new RegExp('^\\s*(' + keys.join('|') + ')\\uFE0F?\\s*');

  function svg(name) {
    const s = document.createElement('span');
    s.className = 'gi gi-' + name;
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>`;
    return s;
  }

  // Où chercher les libellés à convertir.
  const SEL = '#update-pill, .cw-art-ico, .btn, .chip, .badge-cloud, .folder-plus, .w-sub, .w-hint, .folder-name, .set-label, .set-desc, .ach-sub, .st-name, .st-tile span, .mi-icon, .mc-icon, .eyebrow, .w-big, .w-ico, .vh-badge, .menu-section, .toast, .set-value, .wiz-status, .stars-label, .roll-actions .btn, .np-empty';
  function convert(el) {
    if (el.dataset.gi) return;
    const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!t || t !== [...el.childNodes].find((n) => n.nodeType !== 3 || n.nodeValue.trim())) return; // le texte doit être en tête
    const m = LEAD.exec(t.nodeValue);
    if (!m) return;
    el.dataset.gi = '1';
    const rest = t.nodeValue.slice(m[0].length);
    const ic = svg(MAP[m[1]]);
    if (!rest.trim() && t.nextSibling == null && el.childNodes.length === 1) ic.classList.add('solo');
    el.insertBefore(ic, t);
    if (rest) t.nodeValue = rest; else t.remove();
  }
  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(SEL)) convert(root);
    root.querySelectorAll(SEL).forEach(convert);
  }
  const mo = new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'characterData') { const p = r.target.parentElement; if (p && p.matches(SEL)) { delete p.dataset.gi; convert(p); } continue; }
      r.addedNodes.forEach((n) => { if (n.nodeType === 3) { const p = n.parentElement; if (p && p.matches(SEL)) { delete p.dataset.gi; convert(p); } } else scan(n); });
    }
  });
  const start = () => { scan(document.body); mo.observe(document.body, { childList: true, subtree: true, characterData: true }); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.LumenGlyphs = { svg, names: Object.keys(P) };
})();
