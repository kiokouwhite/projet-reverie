// ============================================================
// AQUARIUM-BUTTON.JS — Bouton "Poster sur X" version aquarium
// Vue de dessus, eau noire, lettres dérivant à la souris.
// Port vanilla JS du design (claude.ai/design).
// ============================================================

(function() {
  // ── Constantes physiques ─────────────────────────────────────
  const DRAG = 0.992;
  const ANG_DRAG = 0.985;
  const WALL_BOUNCE = 0.75;
  const MOUSE_MOVE_THRESHOLD = 0.25;

  // ── Pill clamp : retourne le contact avec les parois (normale vers l'intérieur)
  function pillClamp(x, y, halfW, halfH, W, H, R) {
    const halfMax = Math.max(halfW, halfH);
    let nx = x, ny = y, hitNX = 0, hitNY = 0, hit = false;

    if (x < R) {
      const cx = R, cy = H / 2;
      const dx = x - cx, dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const innerR = R - halfMax;
      if (dist > innerR) {
        const ang = Math.atan2(dy, dx);
        nx = cx + Math.cos(ang) * innerR;
        ny = cy + Math.sin(ang) * innerR;
        hitNX = -Math.cos(ang); hitNY = -Math.sin(ang);
        hit = true;
      }
    } else if (x > W - R) {
      const cx = W - R, cy = H / 2;
      const dx = x - cx, dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const innerR = R - halfMax;
      if (dist > innerR) {
        const ang = Math.atan2(dy, dx);
        nx = cx + Math.cos(ang) * innerR;
        ny = cy + Math.sin(ang) * innerR;
        hitNX = -Math.cos(ang); hitNY = -Math.sin(ang);
        hit = true;
      }
    } else {
      if (y < halfH) { ny = halfH; hitNY = 1; hit = true; }
      if (y > H - halfH) { ny = H - halfH; hitNY = -1; hit = true; }
    }
    return { x: nx, y: ny, hitNX, hitNY, hit };
  }

  // ── Init d'un bouton ─────────────────────────────────────────
  function mountAquariumButton(btn) {
    if (btn.dataset.aqMounted === '1') return;
    btn.dataset.aqMounted = '1';

    const text = (btn.dataset.aqText || btn.textContent || 'Poster sur X').trim();
    const W = btn.offsetWidth || 260;
    const H = btn.offsetHeight || 64;
    const R = H / 2;
    const FONT = Math.round(H * 0.34);
    const LOGO_FONT = Math.round(H * 0.46);
    const MOUSE_RANGE = Math.round(H * 0.85);

    // Marque le 1er ou dernier 'X' comme "logo" (rendu SVG au lieu de texte)
    const arr = text.split('');
    const chars = arr.map((c, i) => ({
      c, i,
      isLogo: c === 'X' && (i === 0 || i === arr.length - 1),
    }));

    // SVG du logo X officiel (chemin compact, viewBox carré)
    const X_LOGO_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>' +
      '</svg>';

    function letterContent(ch) {
      if (ch.isLogo) return X_LOGO_SVG;
      return ch.c === ' ' ? '&nbsp;' : escapeHtml(ch.c);
    }

    // Construire la structure interne
    btn.classList.add('aq-btn');
    btn.innerHTML = '';

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.classList.add('aq-water');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = `
      <defs>
        <clipPath id="aq-pill-clip-${btn._aqId = Math.random().toString(36).slice(2, 8)}">
          <rect x="0" y="0" width="${W}" height="${H}" rx="${R}" ry="${R}"/>
        </clipPath>
        <radialGradient id="aq-shine-${btn._aqId}" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.07)"/>
          <stop offset="60%" stop-color="rgba(255,255,255,0.015)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </radialGradient>
        <radialGradient id="aq-vignette-${btn._aqId}" cx="50%" cy="50%" r="60%">
          <stop offset="60%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.45)"/>
        </radialGradient>
      </defs>
      <g clip-path="url(#aq-pill-clip-${btn._aqId})">
        <rect x="0" y="0" width="${W}" height="${H}" fill="#000"/>
        <rect x="0" y="0" width="${W}" height="${H}" fill="url(#aq-shine-${btn._aqId})"/>
        <rect x="0" y="0" width="${W}" height="${H}" fill="url(#aq-vignette-${btn._aqId})"/>
        <g class="aq-ripples"></g>
        <rect x="0" y="0" width="${W}" height="2" fill="rgba(255,255,255,0.18)"/>
      </g>
    `;
    btn.appendChild(svg);

    // Span de mesure (caché) pour calculer les positions home
    const measure = document.createElement('span');
    measure.className = 'aq-measure';
    measure.setAttribute('aria-hidden', 'true');
    measure.style.fontSize = FONT + 'px';
    measure.innerHTML = chars.map(ch =>
      `<span class="m-letter${ch.isLogo ? ' is-logo' : ''}" style="${
        ch.isLogo ? `width:${LOGO_FONT}px;height:${LOGO_FONT}px;` : `font-size:${FONT}px;`
      }">${letterContent(ch)}</span>`
    ).join('');
    btn.appendChild(measure);

    // Couche animée des lettres
    const lettersLayer = document.createElement('span');
    lettersLayer.className = 'aq-letters';
    lettersLayer.setAttribute('aria-hidden', 'true');
    lettersLayer.innerHTML = chars.map(ch =>
      `<span class="aq-letter${ch.isLogo ? ' is-logo' : ''}" style="${
        ch.isLogo ? `width:${LOGO_FONT}px;height:${LOGO_FONT}px;` : `font-size:${FONT}px;`
      }">${letterContent(ch)}</span>`
    ).join('');
    btn.appendChild(lettersLayer);

    // Texte SR + reflet de bord
    const sr = document.createElement('span');
    sr.className = 'aq-sr';
    sr.textContent = text;
    btn.appendChild(sr);

    const rim = document.createElement('span');
    rim.className = 'aq-rim';
    btn.appendChild(rim);

    // Calcul des positions home après layout
    const ms = measure.querySelectorAll('.m-letter');
    const mr = measure.getBoundingClientRect();
    const els = lettersLayer.querySelectorAll('.aq-letter');

    const letters = [];
    ms.forEach((span, i) => {
      const r = span.getBoundingClientRect();
      const homeX = r.left - mr.left + r.width / 2;
      const homeY = r.top - mr.top + r.height / 2;
      const w = Math.max(r.width, 8);
      const h = Math.max(r.height, 14);
      const el = els[i];
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      letters.push({
        el, char: chars[i].c,
        homeX, homeY, x: homeX, y: homeY,
        vx: 0, vy: 0, angle: 0, angularVel: 0,
        w, h,
        radius: Math.min(w, h) * 0.42,
      });
    });

    letters.forEach((L) => {
      L.el.style.transform = `translate(${L.homeX - L.w / 2}px, ${L.homeY - L.h / 2}px)`;
    });

    // ── État partagé ─────────────────────────────────────────
    const state = {
      letters,
      ripples: [],
      mouse: { x: -999, y: -999, vx: 0, vy: 0, over: false, lastRippleT: 0 },
      W, H, R,
      lastT: performance.now(),
    };

    const ripplesGroup = svg.querySelector('.aq-ripples');

    // ── Mouvement de la souris ───────────────────────────────
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const m = state.mouse;
      if (m.over) {
        m.vx = x - m.x;
        m.vy = y - m.y;
      }
      m.x = x; m.y = y;
    });
    btn.addEventListener('mouseenter', (e) => {
      btn.classList.add('is-hover');
      const rect = btn.getBoundingClientRect();
      state.mouse.x = e.clientX - rect.left;
      state.mouse.y = e.clientY - rect.top;
      state.mouse.vx = 0; state.mouse.vy = 0;
      state.mouse.over = true;
      spawnRipple(state.mouse.x, state.mouse.y, 2);
    });
    btn.addEventListener('mouseleave', () => {
      btn.classList.remove('is-hover');
      state.mouse.over = false;
    });

    function spawnRipple(x, y, strength = 1) {
      if (state.ripples.length >= 6) return;
      state.ripples.push({
        x, y, r: 3,
        speed: 0.4 + Math.min(1.2, strength * 0.1),
        alpha: Math.min(0.22, 0.08 + strength * 0.025),
        width: 0.9 + Math.min(0.4, strength * 0.03),
      });
    }

    // ── Boucle d'animation ───────────────────────────────────
    function step() {
      const now = performance.now();
      const dt = Math.min(2, (now - state.lastT) / 16.667);
      state.lastT = now;

      const { letters, ripples, mouse, W, H, R } = state;

      // Update ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.r += r.speed * dt;
        r.alpha *= Math.pow(0.965, dt);
        if (r.alpha < 0.015 || r.r > 220) ripples.splice(i, 1);
      }

      // Force de la souris (delta-only) sur les lettres proches
      const mouseSpeed = mouse.over ? Math.hypot(mouse.vx, mouse.vy) : 0;
      if (mouse.over && mouseSpeed > MOUSE_MOVE_THRESHOLD) {
        if (mouseSpeed > 1.6 && now - mouse.lastRippleT > 180) {
          spawnRipple(mouse.x, mouse.y, 0.6 + mouseSpeed * 0.15);
          mouse.lastRippleT = now;
        }
        for (const L of letters) {
          const dx = L.x - mouse.x;
          const dy = L.y - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d < MOUSE_RANGE) {
            const falloff = 1 - d / MOUSE_RANGE;
            const f = falloff;
            L.vx += mouse.vx * f * 0.06;
            L.vy += mouse.vy * f * 0.06;
            if (d > 0.1 && d < 22) {
              const close = 1 - d / 22;
              L.vx += (dx / d) * close * f * 0.04;
              L.vy += (dy / d) * close * f * 0.04;
            }
            L.angularVel += (Math.random() - 0.5) * f * 0.008;
          }
        }
      }
      mouse.vx *= 0.6;
      mouse.vy *= 0.6;

      // Lettres : drift quand survol, retour exponentiel sinon
      for (const L of letters) {
        if (mouse.over) {
          const sp = Math.hypot(L.vx, L.vy);
          const max = 1.6;
          if (sp > max) { L.vx = (L.vx / sp) * max; L.vy = (L.vy / sp) * max; }
          if (Math.abs(L.angularVel) > 0.06) L.angularVel = Math.sign(L.angularVel) * 0.06;
          L.vx *= Math.pow(DRAG, dt);
          L.vy *= Math.pow(DRAG, dt);
          L.angularVel *= Math.pow(ANG_DRAG, dt);
          L.x += L.vx * dt;
          L.y += L.vy * dt;
          L.angle += L.angularVel * dt;
        } else {
          const k = 1 - Math.pow(0.955, dt);
          L.x += (L.homeX - L.x) * k;
          L.y += (L.homeY - L.y) * k;
          L.angle += (0 - L.angle) * k;
          L.vx = 0; L.vy = 0; L.angularVel = 0;
        }

        // Snap sur le repos exact
        const dxh = L.x - L.homeX, dyh = L.y - L.homeY;
        if (!mouse.over && Math.abs(dxh) < 0.6 && Math.abs(dyh) < 0.6 && Math.abs(L.angle) < 0.02) {
          L.x = L.homeX; L.y = L.homeY;
          L.vx = 0; L.vy = 0; L.angle = 0; L.angularVel = 0;
        }

        // Collision avec les parois (uniquement quand actif)
        const c = mouse.over ? pillClamp(L.x, L.y, L.w / 2, L.h / 2, W, H, R) : { hit: false };
        if (c.hit) {
          L.x = c.x; L.y = c.y;
          const outX = -c.hitNX, outY = -c.hitNY;
          const vDotOut = L.vx * outX + L.vy * outY;
          if (vDotOut > 0) {
            L.vx -= (1 + WALL_BOUNCE) * vDotOut * outX;
            L.vy -= (1 + WALL_BOUNCE) * vDotOut * outY;
            L.angularVel += (Math.random() - 0.5) * Math.abs(vDotOut) * 0.06;
            if (Math.abs(vDotOut) > 1.5) spawnRipple(c.x, c.y, Math.abs(vDotOut) * 0.6);
          }
        }
      }

      // Collisions lettre-lettre uniquement en drift
      if (mouse.over) {
        for (let i = 0; i < letters.length; i++) {
          const A = letters[i];
          for (let j = i + 1; j < letters.length; j++) {
            const B = letters[j];
            const dx = B.x - A.x, dy = B.y - A.y;
            const d2 = dx * dx + dy * dy;
            const minD = A.radius + B.radius;
            if (d2 < minD * minD && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              const overlap = minD - d;
              const nx = dx / d, ny = dy / d;
              const push = overlap * 0.5;
              A.x -= nx * push; A.y -= ny * push;
              B.x += nx * push; B.y += ny * push;
              const relVx = B.vx - A.vx, relVy = B.vy - A.vy;
              const dot = relVx * nx + relVy * ny;
              if (dot < 0) {
                const imp = dot * 0.7;
                A.vx += nx * imp; A.vy += ny * imp;
                B.vx -= nx * imp; B.vy -= ny * imp;
                A.angularVel += (Math.random() - 0.5) * 0.06;
                B.angularVel += (Math.random() - 0.5) * 0.06;
                if (Math.abs(dot) > 1.6) {
                  spawnRipple((A.x + B.x) / 2, (A.y + B.y) / 2, Math.abs(dot) * 0.4);
                }
              }
            }
          }
        }
      }

      // Application au DOM
      for (const L of letters) {
        L.el.style.transform =
          `translate(${(L.x - L.w / 2).toFixed(2)}px, ${(L.y - L.h / 2).toFixed(2)}px) ` +
          `rotate(${L.angle.toFixed(3)}rad)`;
      }

      // Ripples → SVG circles
      while (ripplesGroup.children.length < ripples.length) {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('fill', 'none');
        c.setAttribute('stroke', 'white');
        ripplesGroup.appendChild(c);
      }
      while (ripplesGroup.children.length > ripples.length) {
        ripplesGroup.removeChild(ripplesGroup.lastChild);
      }
      for (let i = 0; i < ripples.length; i++) {
        const r = ripples[i];
        const c = ripplesGroup.children[i];
        c.setAttribute('cx', r.x.toFixed(2));
        c.setAttribute('cy', r.y.toFixed(2));
        c.setAttribute('r', r.r.toFixed(2));
        c.setAttribute('stroke-width', r.width.toFixed(2));
        c.style.opacity = r.alpha.toFixed(3);
      }

      raf = requestAnimationFrame(step);
    }
    let raf = requestAnimationFrame(step);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function initAll() {
    document.querySelectorAll('.btn-aquarium').forEach(mountAquariumButton);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Expose pour init manuelle si besoin (ex: après injection dynamique)
  window.mountAquariumButton = mountAquariumButton;
})();
