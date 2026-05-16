// Page-level super-properties for analytics
if (typeof Track !== 'undefined') {
  Track.set({ content_type: 'science_brief', topic: 'cosmic-web', author: 'BrandMeetsCode' });
}

// ── COSMIC BACKGROUND ──
(function () {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, stars = [], shooters = [], nebulae = [];

  function rng(seed) {
    let s = seed;
    return function () {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 4294967296;
    };
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    buildScene();
  }

  function buildScene() {
    const r = rng(0xC0531C);

    stars = [];
    for (let i = 0; i < 320; i++) {
      stars.push({
        x: r() * W, y: r() * H,
        radius: 0.3 + r() * 0.6,
        alpha: 0.08 + r() * 0.18,
        twinkleSpeed: 0.004 + r() * 0.008,
        twinklePhase: r() * Math.PI * 2,
        color: r() > 0.85 ? `200,220,255` : r() > 0.6 ? `220,210,255` : `210,220,240`,
      });
    }
    for (let i = 0; i < 60; i++) {
      stars.push({
        x: r() * W, y: r() * H,
        radius: 0.6 + r() * 1.0,
        alpha: 0.25 + r() * 0.35,
        twinkleSpeed: 0.003 + r() * 0.006,
        twinklePhase: r() * Math.PI * 2,
        color: r() > 0.7 ? `180,200,255` : `240,235,220`,
      });
    }
    for (let i = 0; i < 12; i++) {
      stars.push({
        x: r() * W, y: r() * H,
        radius: 1.2 + r() * 1.8,
        alpha: 0.5 + r() * 0.4,
        twinkleSpeed: 0.002 + r() * 0.004,
        twinklePhase: r() * Math.PI * 2,
        color: `240,240,255`,
        bloom: true,
      });
    }

    nebulae = [];
    const nebulaConfigs = [
      { x: 0.15, y: 0.22, rx: 0.28, ry: 0.18, color: '60,40,120',  alpha: 0.06 },
      { x: 0.80, y: 0.15, rx: 0.22, ry: 0.16, color: '30,80,140',  alpha: 0.07 },
      { x: 0.70, y: 0.72, rx: 0.30, ry: 0.20, color: '20,80,90',   alpha: 0.06 },
      { x: 0.28, y: 0.78, rx: 0.24, ry: 0.16, color: '80,30,100',  alpha: 0.055 },
      { x: 0.52, y: 0.48, rx: 0.35, ry: 0.25, color: '25,50,110',  alpha: 0.04 },
    ];
    nebulaConfigs.forEach(n => nebulae.push({
      x: n.x * W, y: n.y * H,
      rx: n.rx * W, ry: n.ry * H,
      color: n.color, alpha: n.alpha,
    }));

    shooters = [];
  }

  function spawnShooter(r) {
    const edge = Math.floor(r() * 3);
    let x, y, angle;
    if (edge === 0) { x = r() * W; y = -5; angle = (Math.PI / 4) + r() * (Math.PI / 4); }
    else if (edge === 1) { x = -5; y = r() * H * 0.6; angle = -Math.PI / 6 + r() * (Math.PI / 5); }
    else { x = W + 5; y = r() * H * 0.6; angle = Math.PI + Math.PI / 6 - r() * (Math.PI / 5); }
    return {
      x, y,
      vx: Math.cos(angle) * (2.5 + r() * 3.5),
      vy: Math.sin(angle) * (2.5 + r() * 3.5),
      len: 60 + r() * 90,
      alpha: 0.5 + r() * 0.4,
      life: 1.0,
      decay: 0.012 + r() * 0.008,
      width: 0.6 + r() * 0.8,
    };
  }

  let frame = 0;
  const shooterRng = rng(0xABCDE);

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const baseGrad = ctx.createLinearGradient(0, 0, 0, H);
    baseGrad.addColorStop(0,   '#06070e');
    baseGrad.addColorStop(0.4, '#080a14');
    baseGrad.addColorStop(1,   '#070810');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, W, H);

    nebulae.forEach(n => {
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.scale(1, n.ry / n.rx);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, n.rx);
      grad.addColorStop(0,   `rgba(${n.color},${n.alpha})`);
      grad.addColorStop(0.5, `rgba(${n.color},${n.alpha * 0.4})`);
      grad.addColorStop(1,   `rgba(${n.color},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, n.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    const mw = ctx.createLinearGradient(W * 0.1, 0, W * 0.6, H);
    mw.addColorStop(0,   'rgba(100,110,160,0)');
    mw.addColorStop(0.3, 'rgba(80,90,140,0.035)');
    mw.addColorStop(0.5, 'rgba(100,115,170,0.05)');
    mw.addColorStop(0.7, 'rgba(80,90,140,0.03)');
    mw.addColorStop(1,   'rgba(60,70,120,0)');
    ctx.fillStyle = mw;
    ctx.fillRect(0, 0, W, H);

    stars.forEach(s => {
      const twinkle = 0.5 + 0.5 * Math.sin(frame * s.twinkleSpeed + s.twinklePhase);
      const a = s.alpha * (0.7 + 0.3 * twinkle);

      if (s.bloom) {
        const bloom = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius * 8);
        bloom.addColorStop(0, `rgba(${s.color},${a * 0.4})`);
        bloom.addColorStop(1, `rgba(${s.color},0)`);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 8, 0, Math.PI * 2);
        ctx.fillStyle = bloom;
        ctx.fill();

        ctx.save();
        ctx.globalAlpha = a * 0.35;
        ctx.strokeStyle = `rgba(${s.color},1)`;
        ctx.lineWidth = 0.4;
        const sLen = s.radius * 14;
        [[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,-0.7],[0.7,-0.7],[-0.7,0.7]].forEach(([dx,dy]) => {
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + dx * sLen, s.y + dy * sLen);
          ctx.stroke();
        });
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${s.color},${a})`;
      ctx.fill();
    });

    if (frame % 280 === 0 && Math.random() < 0.6) {
      shooters.push(spawnShooter(shooterRng));
    }

    shooters = shooters.filter(s => s.life > 0);
    shooters.forEach(s => {
      const tailX = s.x - Math.cos(Math.atan2(s.vy, s.vx)) * s.len * s.life;
      const tailY = s.y - Math.sin(Math.atan2(s.vy, s.vx)) * s.len * s.life;
      const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
      grad.addColorStop(0, `rgba(200,220,255,0)`);
      grad.addColorStop(1, `rgba(220,235,255,${s.alpha * s.life})`);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = s.width;
      ctx.stroke();
      s.x += s.vx;
      s.y += s.vy;
      s.life -= s.decay;
    });

    frame++;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
})();

// ── FADE-IN OBSERVER ──
const fadeObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      fadeObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-in').forEach(el => fadeObserver.observe(el));

// ── COSMIC WEB CANVAS ──
(function () {
  const canvas = document.getElementById('cosmicCanvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
  resize();
  window.addEventListener('resize', () => { resize(); buildWeb(); });

  const W = () => canvas.getBoundingClientRect().width;
  const H = () => canvas.getBoundingClientRect().height;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(0xDEADBEEF);

  let nodes = [], edges = [], particles = [];

  function buildWeb() {
    const w = W(), h = H();
    nodes = []; edges = []; particles = [];

    const majorSeeds = [
      [0.50, 0.46],
      [0.20, 0.28],
      [0.78, 0.32],
      [0.30, 0.70],
      [0.68, 0.72],
      [0.12, 0.58],
      [0.88, 0.55],
      [0.48, 0.15],
      [0.55, 0.82],
      [0.92, 0.20],
      [0.08, 0.85],
      [0.38, 0.38],
      [0.62, 0.55],
      [0.24, 0.50],
      [0.76, 0.48],
    ];

    majorSeeds.forEach(([nx, ny], i) => {
      const jx = (rng() - 0.5) * 0.04;
      const jy = (rng() - 0.5) * 0.04;
      nodes.push({
        x: (nx + jx) * w,
        y: (ny + jy) * h,
        r: i === 0 ? 7 : 3 + rng() * 4,
        type: i < 4 ? 'major' : 'minor',
        brightness: 0.6 + rng() * 0.4,
      });
    });

    for (let i = 0; i < 55; i++) {
      let x, y, tooClose;
      let attempts = 0;
      do {
        x = rng() * w;
        y = rng() * h;
        tooClose = nodes.some(n => Math.hypot(n.x - x, n.y - y) < 30);
        attempts++;
      } while (tooClose && attempts < 20);
      nodes.push({ x, y, r: 0.8 + rng() * 2, type: 'small', brightness: 0.2 + rng() * 0.5 });
    }

    const maxDist = Math.min(w, h) * 0.38;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d < maxDist) {
          const strength = 1 - d / maxDist;
          if (strength > 0.18 || (nodes[i].type !== 'small' && nodes[j].type !== 'small' && strength > 0.08)) {
            edges.push({ a: i, b: j, strength, d });
          }
        }
      }
    }

    edges.forEach((e, ei) => {
      const count = e.strength > 0.5 ? 3 : e.strength > 0.3 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        particles.push({
          edge: ei,
          t: rng(),
          speed: 0.0004 + rng() * 0.0005,
          dir: rng() > 0.5 ? 1 : -1,
          size: 0.6 + rng() * 1.2,
          phase: rng() * Math.PI * 2,
        });
      }
    });
  }

  buildWeb();

  let frame = 0;

  function lerp(a, b, t) { return a + (b - a) * t; }

  function drawFilamentGlow(ax, ay, bx, by, strength) {
    const grad = ctx.createLinearGradient(ax, ay, bx, by);
    const alpha = Math.min(0.12, strength * 0.15);
    grad.addColorStop(0, `rgba(79,155,255,${alpha})`);
    grad.addColorStop(0.5, `rgba(127,216,200,${alpha * 1.4})`);
    grad.addColorStop(1, `rgba(79,155,255,${alpha})`);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5 + strength * 4;
    ctx.stroke();

    const coreAlpha = Math.min(0.35, strength * 0.4);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = `rgba(127,216,200,${coreAlpha})`;
    ctx.lineWidth = 0.5 + strength * 1.2;
    ctx.stroke();
  }

  function drawNode(n) {
    const { x, y, r, type, brightness } = n;

    if (type === 'major' || type === 'minor') {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
      const hc = type === 'major' ? '232,196,106' : '79,155,255';
      halo.addColorStop(0, `rgba(${hc},${brightness * 0.5})`);
      halo.addColorStop(1, `rgba(${hc},0)`);
      ctx.beginPath();
      ctx.arc(x, y, r * 6, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();

      const mid = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
      mid.addColorStop(0, `rgba(${hc},${brightness * 0.8})`);
      mid.addColorStop(1, `rgba(${hc},0)`);
      ctx.beginPath();
      ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = mid;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = type === 'major'
        ? `rgba(240,210,130,${brightness})`
        : `rgba(160,220,210,${brightness})`;
      ctx.fill();

    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(127,200,200,${brightness * 0.7})`;
      ctx.fill();
    }
  }

  function drawParticle(p) {
    const e = edges[p.edge];
    const na = nodes[e.a], nb = nodes[e.b];
    const t = p.t;
    const x = lerp(na.x, nb.x, t);
    const y = lerp(na.y, nb.y, t);
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.04 + p.phase);
    const alpha = e.strength * pulse * 0.9;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, p.size * 3);
    grd.addColorStop(0, `rgba(200,240,230,${alpha})`);
    grd.addColorStop(1, `rgba(200,240,230,0)`);
    ctx.beginPath();
    ctx.arc(x, y, p.size * 3, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, p.size * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
    ctx.fill();
  }

  function drawLabels(w, h) {
    ctx.font = '500 9px JetBrains Mono, monospace';
    ctx.letterSpacing = '0.12em';
    ctx.textAlign = 'center';

    const voidSpots = [
      [0.14, 0.42, 'VOID'],
      [0.83, 0.42, 'VOID'],
      [0.48, 0.92, 'VOID'],
    ];
    voidSpots.forEach(([nx, ny, label]) => {
      ctx.fillStyle = 'rgba(40,46,80,0.9)';
      ctx.fillText(label, nx * w, ny * h);
    });

    const cx = nodes[0].x, cy = nodes[0].y;
    ctx.font = '500 8px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(232,196,106,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText('SUPERCLUSTER NODE', cx + 14, cy - 8);
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy - 2);
    ctx.lineTo(cx + 13, cy - 6);
    ctx.strokeStyle = 'rgba(232,196,106,0.4)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    ctx.fillStyle = 'rgba(127,216,200,0.55)';
    ctx.font = '400 7.5px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DARK MATTER FILAMENT', w * 0.26, h * 0.12);

    const axY = h - 16;
    ctx.beginPath();
    ctx.moveTo(24, axY);
    ctx.lineTo(w - 24, axY);
    ctx.strokeStyle = 'rgba(40,46,80,0.7)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.fillStyle = 'rgba(58,61,85,0.9)';
    ctx.font = '400 7px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TODAY', 26, axY - 4);
    ctx.textAlign = 'right';
    ctx.fillText('~1 BYR AFTER BIG BANG', w - 26, axY - 4);
    ctx.textAlign = 'center';
    ctx.fillText('← 13.7 BILLION YEARS OF COSMIC HISTORY →', w / 2, axY - 4);
  }

  function render() {
    const w = W(), h = H();
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    bg.addColorStop(0, '#0d0f20');
    bg.addColorStop(1, '#07080f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const stars = 180;
    for (let i = 0; i < stars; i++) {
      const sx = (mulberry32(i * 137 + 1)() * w);
      const sy = (mulberry32(i * 137 + 2)() * h);
      const sr = mulberry32(i * 137 + 3)() * 0.9;
      const sa = 0.1 + mulberry32(i * 137 + 4)() * 0.25;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,210,240,${sa})`;
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    edges.forEach(e => {
      const na = nodes[e.a], nb = nodes[e.b];
      drawFilamentGlow(na.x, na.y, nb.x, nb.y, e.strength);
    });

    particles.forEach(p => drawParticle(p));

    ctx.restore();

    nodes.slice().reverse().forEach(n => drawNode(n));

    drawLabels(w, h);

    particles.forEach(p => {
      p.t += p.speed * p.dir;
      if (p.t > 1) { p.t = 0; }
      if (p.t < 0) { p.t = 1; }
    });

    frame++;
    requestAnimationFrame(render);
  }

  render();
})();
