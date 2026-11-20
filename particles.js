/*
 * Leichtgewichtiger Partikel-Hintergrund (Stil wie react-particles / tsParticles "links").
 * Keine externe Library, läuft lokal, lädt nichts von Drittanbietern.
 *  - Punkte bewegen sich langsam und werden bei Nähe mit Linien verbunden
 *  - Die Partikel reagieren NICHT aufs normale Bewegen der Maus.
 *    Erst bei einem Klick (bzw. solange die Maustaste/der Finger gedrückt ist)
 *    erscheinen Linien zum Zeiger, eine Welle breitet sich aus und neue Partikel kommen dazu.
 *    Nach dem Loslassen blendet der Effekt sanft aus.
 *  - pausiert, wenn der Bereich nicht sichtbar oder der Tab im Hintergrund ist
 *  - respektiert "Bewegung reduzieren" im Betriebssystem
 */
(() => {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const area = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CFG = {
    density: 11000,     // Fläche (px²) pro Partikel, kleiner = mehr Partikel
    maxCount: 120,
    maxPush: 160,
    pushPerClick: 4,
    speed: 0.45,
    linkDist: 140,
    grabDist: 200,
    fadeOutMs: 700,
    rippleMs: 800,
    rippleRadius: 140,
    colors: ['79,140,255', '124,92,255', '169,196,255'],
    linkColor: '79,140,255',
    grabColor: '124,92,255',
  };

  let w = 0, h = 0, dpr = 1;
  let particles = [];
  let ripples = [];
  let inView = true;
  let rafId = null;
  let lastTime = 0;
  // pointer.strength: 0 = unsichtbar, 1 = voll sichtbar
  const pointer = { x: 0, y: 0, down: false, strength: 0 };

  const rand = (min, max) => Math.random() * (max - min) + min;

  function makeParticle(x = rand(0, w), y = rand(0, h)) {
    const angle = rand(0, Math.PI * 2);
    const v = rand(0.15, 1) * CFG.speed;
    return {
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      r: rand(0.8, 2.4),
      c: CFG.colors[(Math.random() * CFG.colors.length) | 0],
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = area.clientWidth;
    h = area.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Anzahl an Fläche anpassen, bestehende Partikel behalten (kein Springen beim Scrollen am Handy)
    const target = Math.min(CFG.maxCount, Math.max(25, Math.round((w * h) / CFG.density)));
    while (particles.length < target) particles.push(makeParticle());
    if (particles.length > target) particles.length = target;
    for (const p of particles) {
      if (p.x > w) p.x = rand(0, w);
      if (p.y > h) p.y = rand(0, h);
    }
    if (!rafId) draw(performance.now());
  }

  function update(dt) {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) { p.x = 0; p.vx *= -1; }
      else if (p.x > w) { p.x = w; p.vx *= -1; }
      if (p.y < 0) { p.y = 0; p.vy *= -1; }
      else if (p.y > h) { p.y = h; p.vy *= -1; }
    }
    // Klick-Effekt ein- bzw. ausblenden
    if (pointer.down) pointer.strength = 1;
    else if (pointer.strength > 0) pointer.strength = Math.max(0, pointer.strength - dt / CFG.fadeOutMs);
  }

  function draw(now) {
    ctx.clearRect(0, 0, w, h);
    const linkD2 = CFG.linkDist * CFG.linkDist;
    const grab = pointer.strength;

    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkD2) {
          const o = (1 - Math.sqrt(d2) / CFG.linkDist) * 0.35;
          ctx.strokeStyle = `rgba(${CFG.linkColor},${o})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      if (grab > 0) {
        const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (d < CFG.grabDist) {
          ctx.strokeStyle = `rgba(${CFG.grabColor},${(1 - d / CFG.grabDist) * 0.8 * grab})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }
    }

    // Wellen nach einem Klick
    ripples = ripples.filter(r => now - r.t0 < CFG.rippleMs);
    for (const r of ripples) {
      // Klick kann minimal nach dem Frame-Zeitstempel liegen, daher auf 0 begrenzen
      const p = Math.min(1, Math.max(0, (now - r.t0) / CFG.rippleMs));
      const ease = 1 - Math.pow(1 - p, 3);
      ctx.strokeStyle = `rgba(${CFG.grabColor},${(1 - p) * 0.6})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, ease * CFG.rippleRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 1;

    for (const p of particles) {
      ctx.fillStyle = `rgba(${p.c},0.85)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame(now) {
    // nächsten Frame zuerst anmelden, damit ein Fehler die Animation nie stoppt
    rafId = requestAnimationFrame(frame);
    const dt = lastTime ? Math.max(0, Math.min(now - lastTime, 50)) : 16;
    lastTime = now;
    update(dt);
    draw(now);
  }

  function start() {
    if (reduceMotion || rafId || !inView || document.hidden) return;
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Interaktion nur beim Klicken bzw. gedrückt halten
  if (!reduceMotion) {
    const toLocal = e => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    area.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('a, button, img')) return;
      toLocal(e);
      pointer.down = true;
      pointer.strength = 1;
      ripples.push({ x: pointer.x, y: pointer.y, t0: performance.now() });
      for (let i = 0; i < CFG.pushPerClick && particles.length < CFG.maxPush; i++) {
        particles.push(makeParticle(pointer.x, pointer.y));
      }
    });
    area.addEventListener('pointermove', e => { if (pointer.down) toLocal(e); });
    const release = () => { pointer.down = false; };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    area.addEventListener('pointerleave', release);
  }

  // Nur animieren, wenn sichtbar
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    inView ? start() : stop();
  }).observe(area);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  resize();
  start();
})();
