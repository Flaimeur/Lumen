'use strict';
// Arcade cachée de Lumen : ↑ ↑ ↓ ↓ ← → ← → B A lance un des 10 mini-jeux au hasard.
// Chaque jeu : { name, help, init(g), update(g, dt, k), draw(g, c) } ; g = état, k = touches.
// Commandes : flèches / croix / stick, A (Entrée, Espace) ; B ou Échap pour quitter, A pour rejouer.
(() => {
  const W = 640, H = 400;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const COL = { bg: '#0b0e17', grid: 'rgba(255,255,255,0.04)', text: '#e5e7eb', muted: '#8b93a7', a: '#5eead4', b: '#a78bfa', c: '#f472b6', d: '#fbbf24', e: '#60a5fa', bad: '#f87171' };
  let GLOW = 14;
  const rect = (c, x, y, w, h, col, r = 4) => { c.shadowColor = col; c.shadowBlur = GLOW; c.fillStyle = col; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); c.shadowBlur = 0; };
  const dot = (c, x, y, r, col) => { c.shadowColor = col; c.shadowBlur = GLOW; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; };
  // Éclats de particules et secousse de l'écran (fx.burst(g, x, y, couleur)).
  const fx = {
    burst(g, x, y, col, n = 14) { g.parts = g.parts || []; for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = rnd(60, 260); g.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.35, 0.7), max: 0.7, col }); } },
    shake(g, k = 6) { g.shake = Math.max(g.shake || 0, k); },
    step(g, dt) { if (g.parts) { for (const p of g.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy = p.vy * 0.96 + 240 * dt; p.life -= dt; } g.parts = g.parts.filter((p) => p.life > 0); } if (g.shake) g.shake = Math.max(0, g.shake - dt * 30); },
    draw(g, c) { if (!g.parts) return; for (const p of g.parts) { c.globalAlpha = Math.max(0, p.life / p.max); dot(c, p.x, p.y, 2.4, p.col); } c.globalAlpha = 1; },
  };
  // Fond : dégradé nocturne, étoiles qui défilent lentement, quadrillage discret.
  const STARS = Array.from({ length: 70 }, () => ({ x: Math.random() * 640, y: Math.random() * 400, z: Math.random() }));
  function background(c, t, hue) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${hue}, 45%, 9%)`); g.addColorStop(1, '#05060c');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (const s of STARS) { const y = (s.y + t * (8 + s.z * 22)) % H; c.globalAlpha = 0.25 + s.z * 0.55; c.fillStyle = '#fff'; c.fillRect(s.x, y, s.z > 0.7 ? 2 : 1, s.z > 0.7 ? 2 : 1); }
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(255,255,255,0.035)'; c.lineWidth = 1; c.beginPath();
    for (let x = 0; x <= W; x += 40) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); } for (let y = 0; y <= H; y += 40) { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); } c.stroke();
  }
  function vignette(c) { const g = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }

  const GAMES = [
    { name: 'Serpent', help: 'Mange les points, ne te mords pas la queue.',
      init(g) { g.cell = 20; g.cols = W / 20; g.rows = H / 20; g.s = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }]; g.dir = { x: 1, y: 0 }; g.next = g.dir; g.t = 0; g.speed = 0.11; this.food(g); },
      food(g) { do { g.f = { x: Math.floor(rnd(0, g.cols)), y: Math.floor(rnd(0, g.rows)) }; } while (g.s.some((p) => p.x === g.f.x && p.y === g.f.y)); },
      update(g, dt, k) {
        const d = k.left ? { x: -1, y: 0 } : k.right ? { x: 1, y: 0 } : k.up ? { x: 0, y: -1 } : k.down ? { x: 0, y: 1 } : null;
        if (d && (d.x !== -g.dir.x || d.y !== -g.dir.y)) g.next = d;
        g.t += dt; if (g.t < g.speed) return; g.t = 0; g.dir = g.next;
        const h = { x: (g.s[0].x + g.dir.x + g.cols) % g.cols, y: (g.s[0].y + g.dir.y + g.rows) % g.rows };
        if (g.s.some((p) => p.x === h.x && p.y === h.y)) { g.over = true; return; }
        g.s.unshift(h);
        if (h.x === g.f.x && h.y === g.f.y) { fx.burst(g, g.f.x * 20 + 10, g.f.y * 20 + 10, COL.c); g.score += 10; g.speed = Math.max(0.05, g.speed - 0.003); this.food(g); } else g.s.pop();
      },
      draw(g, c) { dot(c, g.f.x * 20 + 10, g.f.y * 20 + 10, 7, COL.c); g.s.forEach((p, i) => rect(c, p.x * 20 + 1, p.y * 20 + 1, 18, 18, i ? COL.a : '#ccfbf1', 6)); } },

    { name: 'Casse-briques', help: '← → pour la raquette, casse toutes les briques.',
      init(g) { g.p = { x: W / 2 - 50, y: H - 24, w: 100, h: 10 }; g.b = { x: W / 2, y: H - 60, vx: 180, vy: -240, r: 6 }; g.br = []; const cs = [COL.c, COL.d, COL.a, COL.e, COL.b]; for (let r = 0; r < 5; r++) for (let i = 0; i < 10; i++) g.br.push({ x: 20 + i * 60, y: 40 + r * 22, w: 54, h: 16, col: cs[r] }); },
      update(g, dt, k) {
        g.p.x = clamp(g.p.x + ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 420 * dt, 0, W - g.p.w);
        const b = g.b; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < b.r || b.x > W - b.r) b.vx *= -1; if (b.y < b.r) b.vy = Math.abs(b.vy);
        if (b.y > H) { fx.shake(g, 10); g.over = true; return; }
        if (b.vy > 0 && hit({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, g.p)) { b.vy = -Math.abs(b.vy) * 1.02; b.vx = ((b.x - (g.p.x + g.p.w / 2)) / (g.p.w / 2)) * 300; }
        const i = g.br.findIndex((q) => hit({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, q));
        if (i >= 0) { const q = g.br[i]; fx.burst(g, q.x + q.w / 2, q.y + q.h / 2, q.col, 10); fx.shake(g, 3); g.br.splice(i, 1); b.vy *= -1; g.score += 10; if (!g.br.length) { this.init(g); g.score += 100; } }
      },
      draw(g, c) { g.br.forEach((q) => rect(c, q.x, q.y, q.w, q.h, q.col)); rect(c, g.p.x, g.p.y, g.p.w, g.p.h, COL.text, 5); dot(c, g.b.x, g.b.y, g.b.r, COL.a); } },

    { name: 'Duel', help: '↑ ↓ pour ta raquette. Premier à 7 points.',
      init(g) { g.l = { x: 20, y: H / 2 - 40, w: 10, h: 80 }; g.r = { x: W - 30, y: H / 2 - 40, w: 10, h: 80 }; g.me = 0; g.cpu = 0; this.serve(g, 1); },
      serve(g, d) { g.b = { x: W / 2, y: H / 2, vx: 260 * d, vy: rnd(-160, 160), s: 10 }; },
      update(g, dt, k) {
        g.l.y = clamp(g.l.y + ((k.down ? 1 : 0) - (k.up ? 1 : 0)) * 380 * dt, 0, H - g.l.h);
        g.r.y = clamp(g.r.y + clamp(g.b.y - (g.r.y + 40), -1, 1) * 250 * dt, 0, H - g.r.h);
        const b = g.b; b.x += b.vx * dt; b.y += b.vy * dt; if (b.y < 0 || b.y > H - b.s) b.vy *= -1;
        const box = { x: b.x, y: b.y, w: b.s, h: b.s };
        if (b.vx < 0 && hit(box, g.l)) { b.vx = -b.vx * 1.06; b.vy += (b.y - (g.l.y + 40)) * 4; }
        if (b.vx > 0 && hit(box, g.r)) { b.vx = -b.vx * 1.06; b.vy += (b.y - (g.r.y + 40)) * 4; }
        if (b.x < -20) { g.cpu++; fx.shake(g, 6); this.serve(g, 1); } if (b.x > W + 20) { g.me++; g.score += 10; fx.burst(g, W - 20, b.y, COL.a, 20); this.serve(g, -1); }
        if (g.cpu >= 7) g.over = true; if (g.me >= 7) { g.score += 50; g.me = 0; g.cpu = 0; }
      },
      draw(g, c) { for (let y = 0; y < H; y += 20) rect(c, W / 2 - 1, y, 2, 10, COL.grid, 1); rect(c, g.l.x, g.l.y, g.l.w, g.l.h, COL.a); rect(c, g.r.x, g.r.y, g.r.w, g.r.h, COL.c); rect(c, g.b.x, g.b.y, g.b.s, g.b.s, COL.text, 3); c.fillStyle = COL.muted; c.font = '700 28px system-ui'; c.textAlign = 'center'; c.fillText(`${g.me}   ${g.cpu}`, W / 2, 40); } },

    { name: 'Pluie d’étoiles', help: '← → pour attraper les étoiles, évite les bombes.',
      init(g) { g.p = { x: W / 2 - 40, y: H - 26, w: 80, h: 14 }; g.it = []; g.t = 0; g.life = 3; },
      update(g, dt, k) {
        g.p.x = clamp(g.p.x + ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 460 * dt, 0, W - g.p.w);
        g.t -= dt; if (g.t <= 0) { g.t = Math.max(0.25, 0.8 - g.score / 1500); g.it.push({ x: rnd(10, W - 22), y: -14, w: 14, h: 14, v: rnd(140, 220) + g.score / 6, bad: Math.random() < 0.25 }); }
        for (const o of g.it) o.y += o.v * dt;
        g.it = g.it.filter((o) => {
          if (hit(o, g.p)) { if (o.bad) { g.life--; fx.shake(g, 8); fx.burst(g, o.x + 7, o.y + 7, COL.bad, 18); if (g.life <= 0) g.over = true; } else { g.score += 10; fx.burst(g, o.x + 7, o.y + 7, COL.d, 10); } return false; }
          if (o.y > H) { if (!o.bad) { g.life--; if (g.life <= 0) g.over = true; } return false; }
          return true;
        });
      },
      draw(g, c) { g.it.forEach((o) => dot(c, o.x + 7, o.y + 7, 7, o.bad ? COL.bad : COL.d)); rect(c, g.p.x, g.p.y, g.p.w, g.p.h, COL.a, 7); c.fillStyle = COL.c; c.font = '700 18px system-ui'; c.textAlign = 'right'; c.fillText('♥'.repeat(Math.max(0, g.life)), W - 14, 26); } },

    { name: 'Esquive', help: 'Flèches pour bouger, survis le plus longtemps.',
      init(g) { g.p = { x: W / 2, y: H / 2, w: 16, h: 16 }; g.bl = []; g.t = 0; g.time = 0; },
      update(g, dt, k) {
        g.p.x = clamp(g.p.x + ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 300 * dt, 0, W - 16); g.p.y = clamp(g.p.y + ((k.down ? 1 : 0) - (k.up ? 1 : 0)) * 300 * dt, 0, H - 16);
        g.time += dt; g.score = Math.floor(g.time * 10);
        g.t -= dt; if (g.t <= 0) { g.t = Math.max(0.12, 0.6 - g.time / 60); const s = Math.floor(rnd(0, 4)), sz = rnd(14, 34), sp = rnd(120, 200) + g.time * 4;
          const o = s === 0 ? { x: rnd(0, W), y: -sz, vx: 0, vy: sp } : s === 1 ? { x: rnd(0, W), y: H, vx: 0, vy: -sp } : s === 2 ? { x: -sz, y: rnd(0, H), vx: sp, vy: 0 } : { x: W, y: rnd(0, H), vx: -sp, vy: 0 };
          g.bl.push({ ...o, w: sz, h: sz }); }
        for (const o of g.bl) { o.x += o.vx * dt; o.y += o.vy * dt; if (hit(o, g.p) && !g.over) { g.over = true; fx.shake(g, 10); fx.burst(g, g.p.x + 8, g.p.y + 8, COL.a, 24); } }
        g.bl = g.bl.filter((o) => o.x > -60 && o.x < W + 60 && o.y > -60 && o.y < H + 60);
      },
      draw(g, c) { g.bl.forEach((o) => rect(c, o.x, o.y, o.w, o.h, COL.b, 5)); rect(c, g.p.x, g.p.y, 16, 16, COL.a, 5); } },

    { name: 'Envol', help: 'A pour battre des ailes, passe entre les colonnes.',
      init(g) { g.y = H / 2; g.v = 0; g.cols = []; g.t = 0.6; },
      update(g, dt, k) {
        if (k.aPressed) g.v = -280; g.v += 820 * dt; g.y += g.v * dt;
        g.t -= dt; if (g.t <= 0) { g.t = 1.45; g.cols.push({ x: W, gap: rnd(80, H - 170), done: false }); }
        const me = { x: 120, y: g.y - 10, w: 20, h: 20 };
        for (const o of g.cols) { o.x -= 170 * dt; if (hit(me, { x: o.x, y: 0, w: 46, h: o.gap }) || hit(me, { x: o.x, y: o.gap + 130, w: 46, h: H })) g.over = true; if (!o.done && o.x + 46 < 120) { o.done = true; g.score += 10; } }
        g.cols = g.cols.filter((o) => o.x > -60); if (g.y > H || g.y < -20) g.over = true;
      },
      draw(g, c) { g.cols.forEach((o) => { rect(c, o.x, -10, 46, o.gap + 10, COL.b, 8); rect(c, o.x, o.gap + 130, 46, H, COL.b, 8); }); dot(c, 130, g.y, 11, COL.d); dot(c, 134, g.y - 3, 3, COL.bg); } },

    { name: 'Tir spatial', help: '← → pour bouger, A pour tirer sur les envahisseurs.',
      init(g) { g.x = W / 2; g.sh = []; g.en = []; g.cd = 0; g.dir = 1; g.sp = 40; this.wave(g); },
      wave(g) { for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) g.en.push({ x: 60 + i * 56, y: 40 + r * 36, w: 30, h: 20, col: [COL.c, COL.b, COL.e, COL.a][r] }); g.sp += 14; },
      update(g, dt, k) {
        g.x = clamp(g.x + ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 340 * dt, 20, W - 20);
        g.cd -= dt; if (k.a && g.cd <= 0) { g.cd = 0.28; g.sh.push({ x: g.x - 2, y: H - 40, w: 4, h: 12 }); }
        for (const s of g.sh) s.y -= 520 * dt; g.sh = g.sh.filter((s) => s.y > -20);
        let edge = false; for (const e of g.en) { e.x += g.dir * g.sp * dt; if (e.x < 10 || e.x > W - 40) edge = true; }
        if (edge) { g.dir *= -1; for (const e of g.en) { e.y += 16; if (e.y > H - 60) g.over = true; } }
        g.en = g.en.filter((e) => { const i = g.sh.findIndex((s) => hit(s, e)); if (i >= 0) { g.sh.splice(i, 1); g.score += 10; fx.burst(g, e.x + 15, e.y + 10, e.col, 12); return false; } return true; });
        if (!g.en.length) this.wave(g);
      },
      draw(g, c) { g.en.forEach((e) => { rect(c, e.x, e.y, e.w, e.h, e.col, 6); dot(c, e.x + 9, e.y + 9, 3, COL.bg); dot(c, e.x + 21, e.y + 9, 3, COL.bg); }); g.sh.forEach((s) => rect(c, s.x, s.y, s.w, s.h, COL.d, 2)); c.fillStyle = COL.a; c.beginPath(); c.moveTo(g.x, H - 40); c.lineTo(g.x - 16, H - 16); c.lineTo(g.x + 16, H - 16); c.fill(); } },

    { name: 'Course infinie', help: 'A ou ↑ pour sauter par-dessus les obstacles.',
      init(g) { g.y = 0; g.v = 0; g.ob = []; g.t = 1; g.speed = 300; g.time = 0; },
      update(g, dt, k) {
        g.time += dt; g.speed = 300 + g.time * 12; g.score = Math.floor(g.time * 10);
        const ground = g.y === 0; if ((k.aPressed || k.upPressed) && ground) g.v = 520; g.v -= 1500 * dt; g.y = Math.max(0, g.y + g.v * dt); if (g.y === 0) g.v = 0;
        g.t -= dt; if (g.t <= 0) { g.t = rnd(0.7, 1.5) * 300 / g.speed; const tall = Math.random() < 0.4; g.ob.push({ x: W, w: tall ? 18 : 26, h: tall ? 46 : 26 }); }
        const me = { x: 80, y: H - 60 - g.y - 30, w: 26, h: 30 };
        for (const o of g.ob) { o.x -= g.speed * dt; if (hit(me, { x: o.x, y: H - 60 - o.h, w: o.w, h: o.h })) g.over = true; }
        g.ob = g.ob.filter((o) => o.x > -40);
      },
      draw(g, c) { rect(c, 0, H - 60, W, 2, COL.muted, 0); g.ob.forEach((o) => rect(c, o.x, H - 60 - o.h, o.w, o.h, COL.c, 4)); rect(c, 80, H - 90 - g.y, 26, 30, COL.a, 7); dot(c, 98, H - 82 - g.y, 3, COL.bg); } },

    { name: 'Flèches', help: 'Appuie sur la bonne direction avant la fin du temps.',
      init(g) { g.lim = 1.6; this.next(g); g.life = 3; },
      next(g) { g.want = ['up', 'down', 'left', 'right'][Math.floor(rnd(0, 4))]; g.left = g.lim; g.flash = 0; },
      update(g, dt, k) {
        g.left -= dt; g.flash = Math.max(0, g.flash - dt);
        const p = ['up', 'down', 'left', 'right'].find((d) => k[d + 'Pressed']);
        if (p) { if (p === g.want) { fx.burst(g, W / 2, H / 2 - 10, COL.a, 16); g.score += 10; g.lim = Math.max(0.45, g.lim * 0.96); this.next(g); } else { g.life--; g.flash = 0.3; this.next(g); } }
        if (g.left <= 0) { g.life--; g.flash = 0.3; this.next(g); }
        if (g.life <= 0) g.over = true;
      },
      draw(g, c) {
        const a = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[g.want];
        c.save(); c.translate(W / 2, H / 2 - 10); c.rotate(a); c.fillStyle = g.flash ? COL.bad : COL.a; c.beginPath(); c.moveTo(70, 0); c.lineTo(-10, -55); c.lineTo(-10, -22); c.lineTo(-70, -22); c.lineTo(-70, 22); c.lineTo(-10, 22); c.lineTo(-10, 55); c.fill(); c.restore();
        rect(c, W / 2 - 150, H - 50, 300 * clamp(g.left / g.lim, 0, 1), 8, COL.d); c.fillStyle = COL.c; c.font = '700 18px system-ui'; c.textAlign = 'right'; c.fillText('♥'.repeat(Math.max(0, g.life)), W - 14, 26);
      } },

    { name: 'Suite de couleurs', help: 'Regarde la suite, puis refais-la avec les directions.',
      init(g) { g.seq = []; g.i = 0; this.grow(g); },
      grow(g) { g.seq.push(Math.floor(rnd(0, 4))); g.show = 0; g.st = 'show'; g.t = 0.7; g.i = 0; g.lit = -1; },
      update(g, dt, k) {
        if (g.st === 'show') { g.t -= dt; if (g.t <= 0) { if (g.lit >= 0) { g.lit = -1; g.t = 0.18; g.show++; } else if (g.show < g.seq.length) { g.lit = g.seq[g.show]; g.t = 0.45; } else { g.st = 'play'; } } return; }
        g.t = Math.max(0, g.t - dt); if (g.t === 0) g.lit = -1;
        const p = ['up', 'right', 'down', 'left'].findIndex((d) => k[d + 'Pressed']);
        if (p < 0) return; g.lit = p; g.t = 0.2;
        if (p !== g.seq[g.i]) { g.over = true; return; }
        g.i++; if (g.i >= g.seq.length) { g.score += g.seq.length * 10; this.grow(g); g.t = 0.9; }
      },
      draw(g, c) {
        const pads = [[W / 2 - 50, 40, COL.a], [W / 2 + 70, 150, COL.c], [W / 2 - 50, 260, COL.d], [W / 2 - 170, 150, COL.e]];
        pads.forEach(([x, y, col], i) => { c.globalAlpha = g.lit === i ? 1 : 0.28; rect(c, x, y, 100, 90, col, 18); }); c.globalAlpha = 1;
        c.fillStyle = COL.muted; c.font = '700 15px system-ui'; c.textAlign = 'center'; c.fillText(g.st === 'show' ? 'Regarde…' : 'À toi !', W / 2, H / 2 + 6);
      } },
  ];

  let st = null;
  const keys = {};
  const kb = {};
  let pad = {};
  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'up', s: 'down', q: 'left', d: 'right', w: 'up', a: 'left', Enter: 'a', ' ': 'a', Escape: 'b', Backspace: 'b' };
  const onKey = (down) => (e) => {
    const k = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
    if (!k || !st) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (down && !kb[k]) keys[k + 'Pressed'] = true;
    kb[k] = down;
  };
  const kd = onKey(true), ku = onKey(false);
  let padPrev = {};
  function readPad() {
    const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean);
    const now = {};
    for (const p of pads) {
      const b = (i) => p.buttons[i] && p.buttons[i].pressed;
      const ax = p.axes || [];
      now.up = now.up || b(12) || ax[1] < -0.5; now.down = now.down || b(13) || ax[1] > 0.5;
      now.left = now.left || b(14) || ax[0] < -0.5; now.right = now.right || b(15) || ax[0] > 0.5;
      now.a = now.a || b(0); now.b = now.b || b(1) || b(9);
    }
    for (const k of ['up', 'down', 'left', 'right', 'a', 'b']) if (now[k] && !padPrev[k]) keys[k + 'Pressed'] = true;
    padPrev = now;
    pad = now;
    for (const k of ['up', 'down', 'left', 'right', 'a', 'b']) keys[k] = !!(kb[k] || pad[k]);
  }

  function open(opts = {}) {
    if (st) return;
    const idx = Number.isInteger(opts.index) ? opts.index : Math.floor(Math.random() * GAMES.length);
    const game = GAMES[idx];
    const root = document.createElement('div');
    root.className = 'arcade';
    root.innerHTML = `<div class="arc-box"><div class="arc-head"><span class="arc-kicker">Arcade secrète · ${idx + 1}/10</span><b>${game.name}</b><span class="arc-score">0</span></div>
      <canvas width="${W}" height="${H}"></canvas><div class="arc-foot"><span>${game.help}</span><span>B / Échap : quitter</span></div></div>`;
    document.body.append(root);
    const canvas = root.querySelector('canvas');
    const c = canvas.getContext('2d');
    const scoreEl = root.querySelector('.arc-score');
    const bestKey = 'best-' + idx;
    st = { root, game, idx, g: null, raf: 0, last: performance.now(), opts };
    const start = () => { st.g = { score: 0, over: false }; game.init(st.g); st.ended = false; st.ready = false; };
    start();
    document.addEventListener('keydown', kd, true);
    document.addEventListener('keyup', ku, true);
    padPrev = { a: true, b: true }; // le A du code ne doit pas valider tout de suite
    const frame = (now) => {
      if (!st) return;
      const dt = Math.min(0.05, (now - st.last) / 1000); st.last = now;
      readPad();
      if (keys.bPressed) { close(); return; }
      const g = st.g;
      if (!st.ready) { if (keys.aPressed) { st.ready = true; keys.aPressed = false; } }
      else if (!g.over) game.update(g, dt, keys);
      else if (!st.ended) {
        st.ended = true;
        const best = Math.max(g.score, (opts.best && opts.best(bestKey)) || 0);
        if (opts.saveBest && g.score >= best) opts.saveBest(bestKey, g.score);
        st.best = best;
      } else if (keys.aPressed) start();
      // Dessin
      fx.step(g, dt);
      st.t = (st.t || 0) + dt;
      background(c, st.t, [180, 265, 300, 40, 220, 280, 250, 330, 160, 200][idx]);
      c.save();
      if (g.shake) c.translate(rnd(-g.shake, g.shake), rnd(-g.shake, g.shake));
      game.draw(g, c);
      fx.draw(g, c);
      c.restore();
      vignette(c);
      scoreEl.textContent = String(g.score);
      if (!st.ready && !g.over) {
        c.fillStyle = 'rgba(5,6,12,0.6)'; c.fillRect(0, 0, W, H);
        c.textAlign = 'center'; c.fillStyle = COL.text; c.font = '800 32px system-ui'; c.fillText(game.name, W / 2, H / 2 - 22);
        c.fillStyle = COL.a; c.font = '700 17px system-ui'; c.fillText('Appuie sur A (Entrée) pour commencer', W / 2, H / 2 + 14);
        const best = (opts.best && opts.best(bestKey)) || 0;
        if (best) { c.fillStyle = COL.muted; c.font = '600 14px system-ui'; c.fillText('Record : ' + best, W / 2, H / 2 + 44); }
      }
      if (g.over) {
        c.fillStyle = 'rgba(5,6,12,0.72)'; c.fillRect(0, 0, W, H);
        c.textAlign = 'center'; c.fillStyle = COL.text; c.font = '800 34px system-ui'; c.fillText('Partie terminée', W / 2, H / 2 - 26);
        c.font = '600 18px system-ui'; c.fillStyle = COL.a; c.fillText(`Score ${g.score} · record ${st.best || g.score}`, W / 2, H / 2 + 10);
        c.fillStyle = COL.muted; c.font = '600 15px system-ui'; c.fillText('A : rejouer · B : quitter', W / 2, H / 2 + 42);
      }
      for (const k of Object.keys(keys)) if (k.endsWith('Pressed')) keys[k] = false;
      st.raf = requestAnimationFrame(frame);
    };
    st.raf = requestAnimationFrame(frame);
  }
  function close() {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    document.removeEventListener('keydown', kd, true);
    document.removeEventListener('keyup', ku, true);
    st.root.remove();
    const cb = st.opts.onClose;
    st = null;
    for (const k of Object.keys(keys)) keys[k] = false;
    for (const k of Object.keys(kb)) kb[k] = false;
    if (cb) cb();
  }
  window.LumenArcade = { open, close, isOpen: () => !!st, count: GAMES.length, names: GAMES.map((g) => g.name) };
})();
