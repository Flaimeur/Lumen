// Entrées unifiées : clavier + manette (Gamepad API, disposition « standard » type Xbox).
// Actions émises : up, down, left, right, a, b, x, y, lb, rb, menu, fullscreen.
(function () {
  'use strict';
  const listeners = new Set();
  const deviceListeners = new Set();
  let lockUntil = 0;

  const Input = {
    swapAB: false,
    lastDevice: 'keyboard',
    on(fn) { listeners.add(fn); },
    onDevice(fn) { deviceListeners.add(fn); },
    lock(ms) { lockUntil = performance.now() + ms; },
    emit(action) {
      if (performance.now() < lockUntil) return;
      listeners.forEach((fn) => fn(action));
    },
  };

  function setDevice(d) {
    if (Input.lastDevice === d) return;
    Input.lastDevice = d;
    deviceListeners.forEach((fn) => fn(d));
  }

  // ---- Clavier ----
  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Enter: 'a', ' ': 'a', Escape: 'b', Backspace: 'b',
    f: 'x', i: 'y', q: 'lb', e: 'rb', Tab: 'menu', // M est réservée au son (couper / remettre)
    PageUp: 'lt', PageDown: 'rt', '/': 'search',
  };
  window.addEventListener('keydown', (ev) => {
    const t = ev.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (typing) {
      if (ev.key === 'Enter') { ev.preventDefault(); Input.emit('a'); }
      else if (ev.key === 'Escape') { ev.preventDefault(); Input.emit('b'); }
      return;
    }
    if (ev.key === 'F11') { ev.preventDefault(); Input.emit('fullscreen'); return; }
    const action = KEYS[ev.key.length === 1 ? ev.key.toLowerCase() : ev.key];
    if (!action) return;
    ev.preventDefault();
    setDevice('keyboard');
    Input.emit(action);
  });

  // ---- Manette ----
  // Disposition « standard » du W3C : index → position physique (0 = bouton du bas, 1 = droite, 2 = gauche, 3 = haut).
  const BUTTONS = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'menu', 9: 'menu', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  // Manettes vues sans disposition standard (pilote DirectInput) : correspondances connues par famille.
  const RAW_BUTTONS = {
    // DualShock 4 / DualSense en DirectInput : □ ✕ ○ △ L1 R1 L2 R2 Share Options L3 R3 PS Pavé
    playstation: { 0: 'x', 1: 'a', 2: 'b', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'menu', 9: 'menu' },
    // Manette Pro / Joy-Con en DirectInput : B A Y X L R ZL ZR - +
    nintendo: { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'menu', 9: 'menu' },
  };
  const SWAP = { a: 'b', b: 'a', x: 'y', y: 'x' };
  const REPEAT = new Set(['up', 'down', 'left', 'right', 'lb', 'rb', 'lt', 'rt']);
  const held = new Map();

  // Famille d'une manette d'après son identifiant (nom + identifiants USB vendeur/produit).
  function padType(id) {
    const s = String(id || '').toLowerCase();
    const vendor = (/vendor:\s*([0-9a-f]{4})/.exec(s) || /^([0-9a-f]{4})-/.exec(s) || [])[1];
    const product = (/product:\s*([0-9a-f]{4})/.exec(s) || /^[0-9a-f]{4}-([0-9a-f]{4})/.exec(s) || [])[1];
    if (vendor === '054c' || /dualsense|dualshock|playstation|wireless controller/.test(s)) {
      return ['0ce6', '0df2'].includes(product) || /dualsense/.test(s) ? 'ps5' : 'ps4';
    }
    if (vendor === '057e' || /pro controller|joy-con|nintendo|switch/.test(s)) return 'switch';
    if (vendor === '045e' || /xbox|xinput|x-box/.test(s)) return 'xbox';
    return 'generic';
  }
  const family = (t) => (t === 'ps4' || t === 'ps5' ? 'playstation' : t === 'switch' ? 'nintendo' : t);

  // Croix directionnelle « chapeau » sur un axe (manettes non standard) : -1 = haut, puis sens horaire par 2/7.
  function hatDirections(v, out) {
    if (v === undefined || v < -1.05 || v > 1.05) return;
    const steps = Math.round((v + 1) / (2 / 7));
    if (steps > 7) return;
    if ([7, 0, 1].includes(steps)) out.add('up');
    if ([1, 2, 3].includes(steps)) out.add('right');
    if ([3, 4, 5].includes(steps)) out.add('down');
    if ([5, 6, 7].includes(steps)) out.add('left');
  }

  // Manettes lues directement par Lumen (PlayStation en HID), au format d'un Gamepad « standard ».
  const nativePads = new Map();
  const NATIVE_NAMES = { ps5: 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)', ps4: 'Wireless Controller (Vendor: 054c Product: 05c4)' };
  function onNative(e) {
    if (e.kind === 'disconnect') {
      const p = nativePads.get(e.id);
      nativePads.delete(e.id);
      if (p) window.dispatchEvent(new CustomEvent('lumen:pad', { detail: { connected: false, id: p.id, type: p.type } }));
      return;
    }
    let p = nativePads.get(e.id);
    if (!p) {
      p = { index: 100 + e.id, id: NATIVE_NAMES[e.type] || 'Manette PlayStation', type: e.type, mapping: 'standard', connected: true, native: true,
        buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], announced: false };
      nativePads.set(e.id, p);
    }
    if (e.kind === 'state') {
      e.buttons.forEach((v, i) => { p.buttons[i] = { pressed: v, value: v ? 1 : 0 }; });
      if (e.triggers) { p.buttons[6].value = e.triggers[0]; p.buttons[7].value = e.triggers[1]; }
      p.axes = e.axes;
      // Annoncée au premier état reçu (comme Chromium, qui attend un premier appui).
      if (!p.announced) {
        p.announced = true;
        notePad(p);
        setDevice('gamepad');
        window.dispatchEvent(new CustomEvent('lumen:pad', { detail: { connected: true, id: p.id, type: p.type } }));
        diagNative('manette native : ' + p.id);
      }
    }
  }
  const diagNative = (m) => { try { window.lumen && window.lumen.padLog && window.lumen.padLog(m); } catch { /* facultatif */ } };
  if (window.lumen && window.lumen.onNativePad) window.lumen.onNativePad(onNative);

  // Toutes les manettes : celles de Chromium, sauf une PlayStation déjà lue en natif (pas de doublon).
  Input.getPads = () => {
    const web = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const native = [...nativePads.values()].filter((p) => p.announced);
    const hasNativeSony = native.length > 0;
    return [...web.filter((p) => !(hasNativeSony && /054c|dualsense|wireless controller/i.test(p.id))), ...native];
  };

  // Disposition Nintendo : sur une Switch, valider se fait avec A (à droite) et non avec le bouton du bas.
  Input.nintendoConfirm = true;
  Input.padType = 'generic';
  Input.padName = '';
  Input.swapActive = () => !!Input.swapAB !== (Input.padType === 'switch' && Input.nintendoConfirm);

  // Vibration courte, si la manette la gère.
  Input.rumble = (strength = 0.4, ms = 60) => {
    for (const p of Input.getPads()) {
      const act = p.vibrationActuator;
      if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength }).catch(() => {});
    }
  };

  // Manettes connectées, pour l'écran de réglages : [{ index, name, type, mapping, buttons, axes }]
  Input.pads = () => Input.getPads()
    .map((p) => ({ index: p.index, name: p.id, type: padType(p.id), mapping: p.mapping || 'aucune', buttons: p.buttons.length, axes: p.axes.length, rumble: !!(p.vibrationActuator && p.vibrationActuator.playEffect) }));

  function notePad(p) {
    const t = padType(p.id);
    if (t === Input.padType && p.id === Input.padName) return;
    Input.padType = t;
    Input.padName = p.id;
    deviceListeners.forEach((fn) => fn('gamepad'));
  }

  function poll(now) {
    requestAnimationFrame(poll);
    if (!document.hasFocus() || Input.paused) { held.clear(); return; }
    const pads = Input.getPads();
    if (!pads.length) return;
    const active = new Set();
    for (const p of pads) {
      const standard = p.mapping === 'standard';
      const map = standard ? BUTTONS : RAW_BUTTONS[family(padType(p.id))] || BUTTONS;
      let any = false;
      p.buttons.forEach((b, i) => {
        let a = map[i];
        if (!a || !b.pressed) return;
        any = true;
        active.add(a);
      });
      const x = p.axes[0] || 0;
      const y = p.axes[1] || 0;
      if (x < -0.5) active.add('left');
      if (x > 0.5) active.add('right');
      if (y < -0.5) active.add('up');
      if (y > 0.5) active.add('down');
      // Croix directionnelle sur un axe « chapeau » (souvent l'axe 9) quand la disposition n'est pas standard.
      if (!standard) for (let i = 4; i < p.axes.length; i++) if (Math.abs(p.axes[i]) <= 1.05 && i === 9) hatDirections(p.axes[i], active);
      if (any || Math.abs(x) > 0.5 || Math.abs(y) > 0.5) notePad(p);
    }
    // A/B et X/Y inversés : réglage manuel, ou automatiquement sur une manette Nintendo.
    if (Input.swapActive()) for (const a of [...active]) if (SWAP[a]) { active.delete(a); active.add('_' + SWAP[a]); }
    for (const a of [...active]) if (a.startsWith('_')) { active.delete(a); active.add(a.slice(1)); }
    for (const a of active) {
      const h = held.get(a);
      if (!h) {
        held.set(a, { since: now, last: now });
        setDevice('gamepad');
        Input.emit(a);
      } else if (REPEAT.has(a) && now - h.since > 380 && now - h.last > 85) {
        h.last = now;
        Input.emit(a);
      }
    }
    for (const a of [...held.keys()]) if (!active.has(a)) held.delete(a);
  }
  requestAnimationFrame(poll);

  // Journal de diagnostic (fichier pad-diagnostic.log dans les données de Lumen) : connexions, focus,
  // et les premiers changements de boutons de chaque session.
  const diag = (m) => { try { if (window.lumen && window.lumen.padLog) window.lumen.padLog(m); } catch { /* journal facultatif */ } };
  let diagChanges = 0;
  let diagLast = '';
  diag('démarrage · manettes visibles : ' + (navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean).length : 'API absente'));
  window.addEventListener('focus', () => diag('focus · manettes visibles : ' + Input.getPads().map((p) => p.id + ' [' + p.mapping + ']').join(' ; ')));
  setInterval(() => {
    if (diagChanges > 40) return;
    const p = Input.getPads()[0];
    if (!p) return;
    const s = 'boutons ' + p.buttons.map((b, i) => (b.pressed ? i : null)).filter((x) => x !== null).join(',') + ' · axes ' + p.axes.map((a) => a.toFixed(1)).join(' ');
    if (s !== diagLast) { diagLast = s; diagChanges++; diag(s + ' · focus=' + document.hasFocus()); }
  }, 100);
  window.addEventListener('gamepaddisconnected', (e) => diag('déconnectée : ' + e.gamepad.id));

  window.addEventListener('gamepadconnected', (e) => {
    diag('connectée : ' + e.gamepad.id + ' · mapping=' + (e.gamepad.mapping || 'aucun') + ' · ' + e.gamepad.buttons.length + ' boutons, ' + e.gamepad.axes.length + ' axes · type=' + padType(e.gamepad.id));
    notePad(e.gamepad);
    setDevice('gamepad');
    window.dispatchEvent(new CustomEvent('lumen:pad', { detail: { connected: true, id: e.gamepad.id, type: padType(e.gamepad.id) } }));
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    window.dispatchEvent(new CustomEvent('lumen:pad', { detail: { connected: false, id: e.gamepad.id } }));
  });

  window.Input = Input;
})();
