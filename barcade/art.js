/* BARCADE Art Engine v3 — deterministic generative art from UPC codes.
   Public API: generate(upc), getRarity(upc), getRarityComponents(upc), getArtName(upc) */
const ArtEngine = (() => {
  const S = 1000; // viewBox size

  /* ---------- deterministic randomness ---------- */

  function upcToSeed(upc) {
    let h = 2166136261 >>> 0;
    const s = String(upc);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    const next = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rng = next;
    rng.range = (lo, hi) => lo + next() * (hi - lo);
    rng.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
    rng.pick = arr => arr[Math.floor(next() * arr.length)];
    rng.chance = p => next() < p;
    return rng;
  }

  /* ---------- value noise / fBm ---------- */

  function makeNoise(rng) {
    const G = 64, grid = new Float32Array(G * G);
    for (let i = 0; i < G * G; i++) grid[i] = rng();
    const at = (ix, iy) => grid[((iy % G + G) % G) * G + ((ix % G + G) % G)];
    const sm = t => t * t * (3 - 2 * t);
    function noise(x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy, u = sm(fx), v = sm(fy);
      return at(ix, iy) * (1 - u) * (1 - v) + at(ix + 1, iy) * u * (1 - v) +
             at(ix, iy + 1) * (1 - u) * v + at(ix + 1, iy + 1) * u * v;
    }
    noise.fbm = (x, y, oct = 4) => {
      let s = 0, amp = 0.5, f = 1;
      for (let o = 0; o < oct; o++) { s += amp * noise(x * f, y * f); amp *= 0.5; f *= 2.03; }
      return s;
    };
    return noise;
  }

  /* ---------- color ---------- */

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  function lighten(h, t) { return mix(h, '#ffffff', t); }
  function darken(h, t) { return mix(h, '#000000', t); }

  // Each palette: very dark bg pair, 5-step hue ramp, luminous accent.
  const PALETTES = [
    { name: 'Ember Nocturne', bg: ['#0b0507', '#160a10'], ramp: ['#3d1635', '#7a2048', '#c23b4e', '#ef7b45', '#ffc861'], glow: '#ffb35c' },
    { name: 'Abyssal Jade',   bg: ['#03080a', '#07131a'], ramp: ['#0b3a3f', '#0f6259', '#2c9c76', '#7fd08d', '#e8f5c8'], glow: '#9fe8a8' },
    { name: 'Ultraviolet',    bg: ['#070511', '#100a22'], ramp: ['#241a54', '#4326a8', '#7d3ce8', '#c05ffb', '#f2a7ff'], glow: '#d18aff' },
    { name: 'Solar Bronze',   bg: ['#0a0703', '#171006'], ramp: ['#4a2c10', '#8a5314', '#c9871c', '#eebc4e', '#fdf0b0'], glow: '#ffd86b' },
    { name: 'Glacier Signal', bg: ['#040810', '#08121f'], ramp: ['#123a63', '#1a6a9e', '#2fa7c9', '#77dbe0', '#defbf0'], glow: '#8ceef2' },
    { name: 'Rose Circuit',   bg: ['#0d0508', '#1b0a12'], ramp: ['#511a3a', '#93275d', '#d84577', '#ff7d9c', '#ffc9d1'], glow: '#ff9db4' },
    { name: 'Verdigris',      bg: ['#050a07', '#0b1610'], ramp: ['#173d2e', '#1f6b48', '#3aa066', '#8ccf8e', '#eef7d0'], glow: '#a9e39c' },
    { name: 'Midnight Gold',  bg: ['#050508', '#0d0d14'], ramp: ['#22263f', '#3c4470', '#6b74a8', '#b6a86a', '#f4d97a'], glow: '#ffe08a' },
    { name: 'Coral Static',   bg: ['#0a0606', '#170d0b'], ramp: ['#43222c', '#87343f', '#d05a4a', '#f7965f', '#ffe0a3'], glow: '#ffb37d' },
    { name: 'Iolite Storm',   bg: ['#060612', '#0d0d24'], ramp: ['#1f2a6b', '#2f4bb0', '#4f7ce0', '#8fb4f5', '#dceafc'], glow: '#a9c8ff' },
    { name: 'Absinthe',       bg: ['#070a04', '#101707'], ramp: ['#2c4a12', '#4f7d17', '#87b32a', '#c8e05e', '#f6ffc2'], glow: '#d7f36e' },
    { name: 'Amethyst Tide',  bg: ['#08050c', '#120a18'], ramp: ['#33175a', '#5c2591', '#9440c4', '#cf7de6', '#f7d4fb'], glow: '#e3a9f7' },
    { name: 'Cinder Ice',     bg: ['#070709', '#111116'], ramp: ['#2c3038', '#4d5666', '#7f8ea3', '#c0d2de', '#f2fbff'], glow: '#d7ecf7' },
    { name: 'Mango Dusk',     bg: ['#0b0508', '#180a10'], ramp: ['#552062', '#8f2f74', '#d04a6a', '#f97e4e', '#ffcf57'], glow: '#ffc06a' },
    { name: 'Deep Current',   bg: ['#030509', '#061019'], ramp: ['#0e2f52', '#14567e', '#1e88a8', '#41c4c4', '#a6f0d6'], glow: '#7fe6cf' },
    { name: 'Garnet Vault',   bg: ['#0a0405', '#160809'], ramp: ['#471020', '#7c1a2e', '#b52f39', '#e4655a', '#ffb08f'], glow: '#ff9a7d' },
  ];

  function ramp(pal, t) {
    const r = pal.ramp, n = r.length - 1;
    const x = Math.max(0, Math.min(0.9999, t)) * n;
    const i = Math.floor(x);
    return mix(r[i], r[i + 1], x - i);
  }

  /* ---------- svg helpers ---------- */

  function fmt(n) { return Math.round(n * 10) / 10; }

  // Bucket many strokes into a small number of <path> elements (mobile perf).
  function StrokeBuckets() {
    const buckets = new Map();
    return {
      add(points, color, width, opacity) {
        if (points.length < 2) return;
        let d = 'M' + fmt(points[0][0]) + ' ' + fmt(points[0][1]);
        for (let i = 1; i < points.length; i++) d += 'L' + fmt(points[i][0]) + ' ' + fmt(points[i][1]);
        this.addPath(d, color, width, opacity);
      },
      addPath(d, color, width, opacity) {
        const key = color + '|' + fmt(width) + '|' + fmt(opacity * 100);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(d);
      },
      render() {
        let out = '';
        for (const [key, ds] of buckets) {
          const [color, width, op] = key.split('|');
          out += `<path d="${ds.join('')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${Number(op) / 100}" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        return out;
      }
    };
  }

  function smoothPath(pts) {
    if (pts.length < 3) {
      let d = 'M' + fmt(pts[0][0]) + ' ' + fmt(pts[0][1]);
      if (pts[1]) d += 'L' + fmt(pts[1][0]) + ' ' + fmt(pts[1][1]);
      return d;
    }
    let d = 'M' + fmt(pts[0][0]) + ' ' + fmt(pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += 'Q' + fmt(pts[i][0]) + ' ' + fmt(pts[i][1]) + ' ' + fmt(mx) + ' ' + fmt(my);
    }
    return d;
  }

  function defsBlock(pal, id) {
    return `<defs>
<radialGradient id="bg${id}" cx="50%" cy="42%" r="75%">
<stop offset="0%" stop-color="${pal.bg[1]}"/><stop offset="100%" stop-color="${pal.bg[0]}"/>
</radialGradient>
<radialGradient id="halo${id}" cx="50%" cy="50%" r="50%">
<stop offset="0%" stop-color="${pal.glow}" stop-opacity="0.55"/>
<stop offset="45%" stop-color="${pal.glow}" stop-opacity="0.12"/>
<stop offset="100%" stop-color="${pal.glow}" stop-opacity="0"/>
</radialGradient>
<radialGradient id="vig${id}" cx="50%" cy="50%" r="72%">
<stop offset="0%" stop-color="#000000" stop-opacity="0"/>
<stop offset="78%" stop-color="#000000" stop-opacity="0"/>
<stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
</radialGradient>
<filter id="blur1${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="blur2${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="22"/></filter>
<filter id="grain${id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.04 0"/></filter>
</defs>`;
  }

  function atmosphere(pal, id, rng) {
    let out = '';
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      out += `<circle cx="${fmt(rng.range(S * 0.15, S * 0.85))}" cy="${fmt(rng.range(S * 0.15, S * 0.85))}" r="${fmt(rng.range(90, 260))}" fill="url(#halo${id})" opacity="${fmt(rng.range(0.25, 0.6))}"/>`;
    }
    return `<g filter="url(#blur2${id})">${out}</g>`;
  }

  function frameAndFinish(id, tier) {
    let gild = '';
    if (tier === 'LEGENDARY') {
      gild = `<rect x="26" y="26" width="${S - 52}" height="${S - 52}" fill="none" stroke="#f4d97a" stroke-opacity="0.9" stroke-width="2"/>
<rect x="34" y="34" width="${S - 68}" height="${S - 68}" fill="none" stroke="#f4d97a" stroke-opacity="0.35" stroke-width="1"/>`;
    } else if (tier === 'EPIC') {
      gild = `<rect x="28" y="28" width="${S - 56}" height="${S - 56}" fill="none" stroke="#d18aff" stroke-opacity="0.55" stroke-width="1.5"/>`;
    }
    return `<rect width="${S}" height="${S}" fill="url(#vig${id})"/>
<rect width="${S}" height="${S}" filter="url(#grain${id})" opacity="0.6"/>
${gild}`;
  }

  /* ---------- composition families ---------- */

  // 1. Silk Currents — flow-field streamlines
  function drawSilk(rng, pal, id) {
    const noise = makeNoise(rng);
    const B = StrokeBuckets();
    const scale = rng.range(0.0016, 0.003);
    const swirl = rng.range(2.5, 5.5);
    const drift = rng.range(0, Math.PI * 2);
    for (let i = 0; i < 240; i++) {
      let x = rng.range(-60, S + 60), y = rng.range(-60, S + 60);
      const pts = [[x, y]];
      const steps = rng.int(40, 90);
      const tone = noise.fbm(x * scale * 2, y * scale * 2, 3);
      for (let s = 0; s < steps; s++) {
        const a = noise.fbm(x * scale, y * scale, 4) * Math.PI * swirl + drift;
        x += Math.cos(a) * 9; y += Math.sin(a) * 9;
        if (x < -80 || x > S + 80 || y < -80 || y > S + 80) break;
        pts.push([x, y]);
      }
      if (pts.length < 6) continue;
      const c = ramp(pal, tone * 1.25);
      const w = rng.range(0.6, 2.6);
      B.addPath(smoothPath(pts), c, w, rng.range(0.25, 0.75));
      if (rng.chance(0.12)) B.addPath(smoothPath(pts), lighten(c, 0.5), w * 0.35, 0.9);
    }
    // luminous lead ribbons
    for (let i = 0; i < 5; i++) {
      let x = rng.range(S * 0.15, S * 0.85), y = rng.range(S * 0.15, S * 0.85);
      const pts = [[x, y]];
      for (let s = 0; s < 110; s++) {
        const a = noise.fbm(x * scale, y * scale, 4) * Math.PI * swirl + drift;
        x += Math.cos(a) * 8; y += Math.sin(a) * 8;
        pts.push([x, y]);
      }
      B.addPath(smoothPath(pts), pal.glow, 3.2, 0.5);
      B.addPath(smoothPath(pts), '#ffffff', 1, 0.55);
    }
    return B.render();
  }

  // 2. Meridian Bloom — k-fold mandala linework
  function drawBloom(rng, pal, id) {
    const k = rng.pick([6, 8, 9, 10, 12, 14, 16]);
    const cx = S / 2, cy = S / 2;
    const B = StrokeBuckets();
    const layers = rng.int(4, 6);
    for (let L = 0; L < layers; L++) {
      const r0 = 60 + L * rng.range(58, 82);
      const r1 = r0 + rng.range(70, 150);
      const bow = rng.range(0.25, 0.85);
      const c = ramp(pal, 0.3 + (L / (layers - 0.5)) * 0.7 + rng.range(-0.06, 0.06));
      const w = rng.range(1.2, 2.2);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + L * 0.12;
        const span = (Math.PI * 2 / k) * bow;
        for (const dir of [1, -1]) {
          const a2 = a + span * dir;
          const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0;
          const x1 = cx + Math.cos(a2) * r1, y1 = cy + Math.sin(a2) * r1;
          const xm = cx + Math.cos(a + span * dir / 2) * (r1 * 1.18);
          const ym = cy + Math.sin(a + span * dir / 2) * (r1 * 1.18);
          const d = `M${fmt(x0)} ${fmt(y0)}Q${fmt(xm)} ${fmt(ym)} ${fmt(x1)} ${fmt(y1)}`;
          B.addPath(d, c, w, dir === 1 ? 0.95 : 0.7);
          if (dir === 1) B.addPath(d, lighten(c, 0.45), w * 0.4, 0.75);
        }
      }
      // fine ring hatching
      const hatch = rng.int(40, 90);
      for (let h = 0; h < hatch; h++) {
        const a = (h / hatch) * Math.PI * 2;
        const rr = r0 + rng.range(-6, 6);
        B.add([[cx + Math.cos(a) * rr, cy + Math.sin(a) * rr],
               [cx + Math.cos(a) * (rr + rng.range(8, 24)), cy + Math.sin(a) * (rr + rng.range(8, 24))]],
              darken(c, 0.15), 0.7, 0.5);
      }
    }
    const core = `<circle cx="${cx}" cy="${cy}" r="${fmt(rng.range(26, 44))}" fill="${pal.glow}" filter="url(#blur1${id})" opacity="0.8"/>
<circle cx="${cx}" cy="${cy}" r="${fmt(rng.range(8, 15))}" fill="#ffffff" opacity="0.95"/>`;
    return B.render() + core;
  }

  // 3. Interference — multi-center wave moiré
  function drawInterference(rng, pal, id) {
    const centers = [];
    const nC = rng.int(2, 3);
    for (let i = 0; i < nC; i++) {
      centers.push([rng.range(S * 0.22, S * 0.78), rng.range(S * 0.22, S * 0.78), rng.range(13, 22)]);
    }
    const B = StrokeBuckets();
    for (const [cx, cy, gap] of centers) {
      const rings = Math.ceil(S * 0.95 / gap);
      for (let r = 1; r < rings; r++) {
        const rad = r * gap + rng.range(-1, 1);
        let inter = 1;
        for (const [ox, oy, og] of centers) {
          if (ox === cx && oy === cy) continue;
          const d = Math.hypot(cx - ox, cy - oy);
          inter *= 0.5 + 0.5 * Math.cos((rad - d) / og * Math.PI);
        }
        const t = r / rings;
        const c = ramp(pal, Math.max(0, Math.min(1, 0.45 + inter * 0.55 - t * 0.2)));
        const arc = `M${fmt(cx + rad)} ${fmt(cy)}A${fmt(rad)} ${fmt(rad)} 0 1 0 ${fmt(cx - rad)} ${fmt(cy)}A${fmt(rad)} ${fmt(rad)} 0 1 0 ${fmt(cx + rad)} ${fmt(cy)}`;
        const op = Math.max(0.18, Math.min(1, 0.3 + Math.pow(inter, 1.2) * 0.7)) * (1 - t * 0.25);
        B.addPath(arc, c, 1.5 + inter * 1.6, op);
        // luminous crest where the waves reinforce
        if (inter > 0.72) B.addPath(arc, lighten(c, 0.6), 0.9, 0.95);
      }
    }
    let glows = '';
    for (const [cx, cy] of centers) {
      glows += `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="130" fill="url(#halo${id})"/><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="3.5" fill="#ffffff" opacity="0.95"/>`;
    }
    return glows + B.render();
  }

  // 4. Strata — topographic contours over fBm terrain (marching squares)
  function drawStrata(rng, pal, id) {
    const noise = makeNoise(rng);
    const B = StrokeBuckets();
    const G = 72, cell = S / (G - 1);
    const sc = rng.range(1.8, 3.2);
    const field = [];
    for (let y = 0; y < G; y++) {
      const row = [];
      for (let x = 0; x < G; x++) row.push(noise.fbm(x / G * sc, y / G * sc, 5));
      field.push(row);
    }
    let lo = Infinity, hi = -Infinity;
    for (const row of field) for (const v of row) { if (v < lo) lo = v; if (v > hi) hi = v; }
    // elevation glow: luminous halos on the high ground, dark pools in basins
    let relief = '';
    const peaks = [];
    for (let y = 2; y < G - 2; y++) {
      for (let x = 2; x < G - 2; x++) {
        const v = field[y][x];
        if (v > lo + (hi - lo) * 0.82 &&
            v >= field[y][x - 1] && v >= field[y][x + 1] && v >= field[y - 1][x] && v >= field[y + 1][x]) {
          peaks.push([x * cell, y * cell, (v - lo) / (hi - lo)]);
        }
      }
    }
    for (const [px, py, tv] of peaks.slice(0, 7)) {
      relief += `<circle cx="${fmt(px)}" cy="${fmt(py)}" r="${fmt(70 + tv * 90)}" fill="url(#halo${id})" opacity="${fmt(0.5 + tv * 0.4)}"/>`;
    }
    const levels = rng.int(16, 24);
    const SEGS = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 10: [[0, 1], [2, 3]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]] };
    for (let l = 0; l < levels; l++) {
      const iso = lo + (l + 0.5) / levels * (hi - lo);
      const t = l / (levels - 1);
      const c = ramp(pal, 0.2 + t * 0.8);
      const w = l % 5 === 0 ? 2.4 : 1.1;
      const op = 0.55 + 0.45 * t;
      for (let y = 0; y < G - 1; y++) {
        for (let x = 0; x < G - 1; x++) {
          const v = [field[y][x], field[y][x + 1], field[y + 1][x + 1], field[y + 1][x]];
          let idx = 0;
          for (let i = 0; i < 4; i++) if (v[i] > iso) idx |= (1 << i);
          if (idx === 0 || idx === 15) continue;
          const px = x * cell, py = y * cell;
          const lerp = (a, b) => (iso - a) / (b - a);
          const E = [
            [px + cell * lerp(v[0], v[1]), py],
            [px + cell, py + cell * lerp(v[1], v[2])],
            [px + cell * lerp(v[3], v[2]), py + cell],
            [px, py + cell * lerp(v[0], v[3])]
          ];
          for (const [a, b] of (SEGS[idx] || [])) B.add([E[a], E[b]], c, w, op);
        }
      }
    }
    let mx = 0, my = 0, mv = -Infinity;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (field[y][x] > mv) { mv = field[y][x]; mx = x; my = y; }
    return relief + B.render() +
      `<circle cx="${fmt(mx * cell)}" cy="${fmt(my * cell)}" r="60" fill="url(#halo${id})"/><circle cx="${fmt(mx * cell)}" cy="${fmt(my * cell)}" r="4" fill="#ffffff" opacity="0.95"/>`;
  }

  // 5. Aurora Veil — stacked translucent curtains + starfield + ridge
  function drawAurora(rng, pal, id) {
    const noise = makeNoise(rng);
    let out = '';
    const nStars = rng.int(70, 130);
    for (let i = 0; i < nStars; i++) {
      const r = rng.chance(0.85) ? rng.range(0.6, 1.4) : rng.range(1.6, 2.6);
      out += `<circle cx="${fmt(rng() * S)}" cy="${fmt(rng() * S)}" r="${fmt(r)}" fill="#ffffff" opacity="${fmt(rng.range(0.15, 0.85))}"/>`;
    }
    const curtains = rng.int(4, 6);
    for (let cIdx = 0; cIdx < curtains; cIdx++) {
      const t = cIdx / (curtains - 1);
      const baseY = S * (0.2 + t * 0.45) + rng.range(-40, 40);
      const amp = rng.range(60, 150);
      const height = rng.range(220, 420);
      const c = ramp(pal, 0.45 + t * 0.55);
      const top = [], bot = [];
      for (let x = -40; x <= S + 40; x += 25) {
        const w = noise.fbm(x * 0.0021 + cIdx * 9, cIdx * 3.7, 4);
        const y = baseY + Math.sin(x * 0.004 + cIdx * 2) * amp * 0.4 + (w - 0.5) * amp * 2;
        top.push([x, y]); bot.push([x, y + height * (0.7 + w * 0.6)]);
      }
      let d = smoothPath(top);
      for (let i = bot.length - 1; i >= 0; i--) d += 'L' + fmt(bot[i][0]) + ' ' + fmt(bot[i][1]);
      d += 'Z';
      out += `<path d="${d}" fill="${c}" opacity="${fmt(rng.range(0.2, 0.34))}" filter="url(#blur2${id})"/>`;
      out += `<path d="${smoothPath(top)}" fill="none" stroke="${lighten(c, 0.35)}" stroke-width="6" stroke-opacity="0.55" filter="url(#blur1${id})"/>`;
      out += `<path d="${smoothPath(top)}" fill="none" stroke="${lighten(c, 0.6)}" stroke-width="1.6" stroke-opacity="0.9"/>`;
      // dense vertical shimmer rays hanging from the crest
      const B = StrokeBuckets();
      for (let i = 0; i < top.length; i++) {
        if (rng.chance(0.8)) {
          const [x, y] = top[i];
          const len = rng.range(80, height * 0.95);
          B.add([[x, y], [x + rng.range(-6, 6), y + len]], c, rng.range(1.4, 3), rng.range(0.12, 0.4));
          if (rng.chance(0.3)) B.add([[x, y], [x, y + len * 0.5]], lighten(c, 0.5), 0.9, 0.5);
        }
      }
      out += B.render();
    }
    let ridge = 'M-20 ' + fmt(S * 0.98);
    for (let x = -20; x <= S + 20; x += 30) {
      ridge += 'L' + fmt(x) + ' ' + fmt(S * 0.9 + noise.fbm(x * 0.003, 12.3, 4) * 90);
    }
    ridge += `L${S + 20} ${S + 20}L-20 ${S + 20}Z`;
    out += `<path d="${ridge}" fill="#020204" opacity="0.9"/>`;
    return out;
  }

  // 6. Orbital Cathedral — tilted rings, chords, satellites
  function drawOrbital(rng, pal, id) {
    const cx = S / 2, cy = S * rng.range(0.44, 0.56);
    const B = StrokeBuckets();
    let out = `<circle cx="${cx}" cy="${fmt(cy)}" r="${fmt(rng.range(120, 180))}" fill="url(#halo${id})"/>`;
    const rings = rng.int(7, 12);
    const baseTilt = rng.range(0.15, 0.5);
    let satellites = '';
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      const rx = 90 + t * rng.range(320, 400);
      const ry = rx * Math.max(0.08, baseTilt + t * rng.range(-0.06, 0.12));
      const rot = rng.range(-30, 30) + i * rng.range(-4, 4);
      const c = ramp(pal, t);
      const rad = rot * Math.PI / 180;
      out += `<ellipse cx="${cx}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="none" stroke="${c}" stroke-width="${i % 3 === 0 ? 2 : 0.9}" stroke-opacity="${fmt(0.75 - t * 0.3)}" transform="rotate(${fmt(rot)} ${cx} ${fmt(cy)})"/>`;
      const nSat = rng.int(1, 4);
      for (let sIdx = 0; sIdx < nSat; sIdx++) {
        const a = rng() * Math.PI * 2;
        const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
        const x = cx + ex * Math.cos(rad) - ey * Math.sin(rad);
        const y = cy + ex * Math.sin(rad) + ey * Math.cos(rad);
        const r = rng.chance(0.8) ? rng.range(2, 5) : rng.range(6, 12);
        satellites += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${lighten(c, 0.3)}"/>`;
        if (r > 5) satellites += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r * 3)}" fill="url(#halo${id})"/>`;
        if (rng.chance(0.4)) B.add([[cx, cy], [x, y]], c, 0.6, 0.25);
      }
    }
    out += B.render() + satellites;
    out += `<circle cx="${cx}" cy="${fmt(cy)}" r="${fmt(rng.range(22, 40))}" fill="${pal.glow}" filter="url(#blur1${id})" opacity="0.9"/>`;
    out += `<circle cx="${cx}" cy="${fmt(cy)}" r="${fmt(rng.range(7, 12))}" fill="#ffffff"/>`;
    return out;
  }

  // 7. Botanic Circuit — luminous tree with glowing canopy and ground mist
  function drawBotanic(rng, pal, id) {
    const B = StrokeBuckets();
    let leaves = '';
    const tips = [];
    const rootX = S / 2 + rng.range(-60, 60), rootY = S * 0.92;
    const maxDepth = 9;
    let budget = 420; // hard cap on branch segments to keep the SVG lean
    function branch(x, y, angle, len, depth, width) {
      if (depth <= 0 || len < 7 || budget-- <= 0) { tips.push([x, y]); return; }
      const segs = 5;
      const pts = [[x, y]];
      let a = angle, px = x, py = y;
      for (let i = 0; i < segs; i++) {
        a += rng.range(-0.16, 0.16);
        // phototropism: gently pull growth upward
        a = a * 0.94 + (-Math.PI / 2) * 0.06;
        px += Math.cos(a) * (len / segs); py += Math.sin(a) * (len / segs);
        pts.push([px, py]);
      }
      const t = 1 - depth / maxDepth;
      const c = ramp(pal, 0.15 + t * 0.75);
      B.addPath(smoothPath(pts), c, width, 0.9);
      if (width > 3) B.addPath(smoothPath(pts), lighten(c, 0.25), width * 0.3, 0.5);
      if (depth <= 3) {
        tips.push([px, py]);
        // leaf dabs clustered at the twig ends
        const nL = rng.int(2, 5);
        for (let l = 0; l < nL; l++) {
          const lx = px + rng.range(-16, 16), ly = py + rng.range(-16, 10);
          const lc = ramp(pal, rng.range(0.6, 1));
          leaves += `<circle cx="${fmt(lx)}" cy="${fmt(ly)}" r="${fmt(rng.range(1.6, 4.2))}" fill="${lc}" opacity="${fmt(rng.range(0.5, 0.95))}"/>`;
        }
      }
      const nKids = rng.chance(0.8) ? 2 : 3;
      for (let k = 0; k < nKids; k++) {
        branch(px, py, a + rng.range(-0.7, 0.7), len * rng.range(0.66, 0.8), depth - 1, Math.max(0.5, width * 0.66));
      }
    }
    branch(rootX, rootY, -Math.PI / 2, rng.range(160, 200), maxDepth, 11);
    // canopy glow centered on the tip cloud
    let cxm = 0, cym = 0;
    for (const [x, y] of tips) { cxm += x; cym += y; }
    if (tips.length) { cxm /= tips.length; cym /= tips.length; }
    const canopy = `<circle cx="${fmt(cxm)}" cy="${fmt(cym)}" r="${fmt(rng.range(200, 280))}" fill="url(#halo${id})" opacity="0.9"/>` +
      `<circle cx="${fmt(cxm + rng.range(-90, 90))}" cy="${fmt(cym + rng.range(-70, 40))}" r="${fmt(rng.range(120, 180))}" fill="url(#halo${id})" opacity="0.6"/>`;
    // fireflies drifting around the canopy
    let fireflies = '';
    const nF = rng.int(24, 44);
    for (let i = 0; i < nF; i++) {
      const a = rng() * Math.PI * 2, r = rng.range(40, 330);
      const x = cxm + Math.cos(a) * r, y = cym + Math.sin(a) * r * 0.8;
      if (y > rootY) continue;
      fireflies += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(rng.range(0.8, 2.2))}" fill="${pal.glow}" opacity="${fmt(rng.range(0.3, 0.95))}"/>`;
    }
    // ground: mist band + faint reflection
    const ground = `<rect x="0" y="${fmt(rootY - 6)}" width="${S}" height="${fmt(S - rootY + 6)}" fill="${darken(pal.ramp[0], 0.5)}" opacity="0.85"/>` +
      `<ellipse cx="${fmt(rootX)}" cy="${fmt(rootY)}" rx="330" ry="26" fill="url(#halo${id})" opacity="0.55"/>` +
      `<line x1="60" y1="${fmt(rootY)}" x2="${S - 60}" y2="${fmt(rootY)}" stroke="${ramp(pal, 0.7)}" stroke-width="1" stroke-opacity="0.5"/>`;
    return canopy + ground + B.render() + leaves + fireflies;
  }

  // 8. Prism Shards — stained-glass quad fracture with per-facet gradients
  function drawShards(rng, pal, id) {
    // quads only: split a quad into two quads via points on opposite edges — no area loss
    const quads = [];
    const lerpPt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    function split(q, depth) {
      // q = [p0,p1,p2,p3]; stop with size-aware probability
      const w = Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1]);
      const h = Math.hypot(q[1][0] - q[2][0], q[1][1] - q[2][1]);
      if (depth <= 0 || (w * h < 14000 && rng.chance(0.5)) || w * h < 5000) { quads.push(q); return; }
      if (w > h) {
        const t1 = rng.range(0.32, 0.68), t2 = rng.range(0.32, 0.68);
        const a = lerpPt(q[0], q[1], t1), b = lerpPt(q[3], q[2], t2);
        split([q[0], a, b, q[3]], depth - 1);
        split([a, q[1], q[2], b], depth - 1);
      } else {
        const t1 = rng.range(0.32, 0.68), t2 = rng.range(0.32, 0.68);
        const a = lerpPt(q[1], q[2], t1), b = lerpPt(q[0], q[3], t2);
        split([q[0], q[1], a, b], depth - 1);
        split([b, a, q[2], q[3]], depth - 1);
      }
    }
    const m = 60;
    // tilt the whole lattice slightly for energy
    const tilt = rng.range(-0.06, 0.06);
    const rot = ([x, y]) => {
      const dx = x - S / 2, dy = y - S / 2;
      return [S / 2 + dx * Math.cos(tilt) - dy * Math.sin(tilt), S / 2 + dx * Math.sin(tilt) + dy * Math.cos(tilt)];
    };
    split([[m, m], [S - m, m], [S - m, S - m], [m, S - m]].map(rot), rng.int(7, 9));

    const lightAngle = rng.range(0, Math.PI * 2);
    const lx = Math.cos(lightAngle), ly = Math.sin(lightAngle);
    let defs = '', out = '', edges = '', glints = '';
    let gi = 0;
    for (const q of quads) {
      let cx = 0, cy = 0;
      for (const [x, y] of q) { cx += x; cy += y; }
      cx /= 4; cy /= 4;
      // facet luminance from light direction + distance from center
      const facing = (cx - S / 2) / S * lx + (cy - S / 2) / S * ly;
      const t = Math.max(0, Math.min(1, 0.55 + facing * 1.6 + rng.range(-0.15, 0.15)));
      const c0 = darken(ramp(pal, t), 0.45);
      const c1 = lighten(ramp(pal, Math.min(1, t + 0.25)), 0.08);
      const gid = `sh${id}${gi++}`;
      defs += `<linearGradient id="${gid}" x1="${fmt(50 - lx * 50)}%" y1="${fmt(50 - ly * 50)}%" x2="${fmt(50 + lx * 50)}%" y2="${fmt(50 + ly * 50)}%"><stop offset="0%" stop-color="${c0}"/><stop offset="100%" stop-color="${c1}"/></linearGradient>`;
      const shrink = 0.975;
      const p = q.map(([x, y]) => [cx + (x - cx) * shrink, cy + (y - cy) * shrink]);
      const d = 'M' + p.map(pt => fmt(pt[0]) + ' ' + fmt(pt[1])).join('L') + 'Z';
      out += `<path d="${d}" fill="url(#${gid})" opacity="${fmt(rng.range(0.8, 0.98))}"/>`;
      edges += `<path d="${d}" fill="none" stroke="${lighten(c1, 0.4)}" stroke-width="0.8" stroke-opacity="${fmt(rng.range(0.35, 0.7))}"/>`;
      // occasional inner glint
      if (rng.chance(0.12)) {
        glints += `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(rng.range(20, 55))}" fill="url(#halo${id})" opacity="0.75"/>`;
      }
    }
    // one glowing fracture seam across the piece
    const y0 = rng.range(S * 0.25, S * 0.75);
    const pts = [];
    for (let x = m - 20; x <= S - m + 20; x += 40) pts.push(rot([x, y0 + rng.range(-60, 60)]));
    let seams = `<path d="${smoothPath(pts)}" fill="none" stroke="${pal.glow}" stroke-width="7" stroke-opacity="0.5" filter="url(#blur1${id})"/>`;
    seams += `<path d="${smoothPath(pts)}" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-opacity="0.9"/>`;
    return `<defs>${defs}</defs>` + out + glints + edges + seams;
  }

  const FAMILIES = [
    { key: 'silk', draw: drawSilk, label: 'Silk Currents' },
    { key: 'bloom', draw: drawBloom, label: 'Meridian Bloom' },
    { key: 'interference', draw: drawInterference, label: 'Interference' },
    { key: 'strata', draw: drawStrata, label: 'Strata' },
    { key: 'aurora', draw: drawAurora, label: 'Aurora Veil' },
    { key: 'orbital', draw: drawOrbital, label: 'Orbital Cathedral' },
    { key: 'botanic', draw: drawBotanic, label: 'Botanic Circuit' },
    { key: 'shards', draw: drawShards, label: 'Prism Shards' },
  ];

  /* ---------- rarity ---------- */

  const TIERS = [
    { tier: 'LEGENDARY', maxMints: 1, color: '#ffd76b', glow: 'rgba(255,215,107,0.16)', cut: 0.98 },
    { tier: 'EPIC', maxMints: 5, color: '#d18aff', glow: 'rgba(209,138,255,0.16)', cut: 0.93 },
    { tier: 'RARE', maxMints: 10, color: '#7fb8ff', glow: 'rgba(127,184,255,0.16)', cut: 0.80 },
    { tier: 'UNCOMMON', maxMints: 25, color: '#8ce8a8', glow: 'rgba(140,232,168,0.16)', cut: 0.55 },
    { tier: 'COMMON', maxMints: 100, color: '#9aa3b2', glow: 'rgba(154,163,178,0.16)', cut: 0 },
  ];

  // score ranges per tier so the visible breakdown justifies the tier
  const TIER_SCORE_RANGE = {
    LEGENDARY: [78, 100], EPIC: [66, 97], RARE: [54, 93], UNCOMMON: [34, 84], COMMON: [5, 74]
  };

  function getRarityComponents(upc) {
    const seed = upcToSeed(upc);
    // tier from a clean uniform roll — matches the advertised ~2/5/13/25/55 odds
    const roll = mulberry32(seed ^ 0x9e3779b9)();
    let chosen = TIERS[TIERS.length - 1];
    for (const t of TIERS) { if (roll >= t.cut) { chosen = t; break; } }
    const rng = mulberry32(seed ^ 0x5f3759df);
    const [lo, hi] = TIER_SCORE_RANGE[chosen.tier];
    const scores = [rng.int(lo, hi), rng.int(lo, hi), rng.int(lo, hi), rng.int(lo, hi), rng.int(lo, hi)];
    const comps = [
      { name: 'Chromatic Resonance', score: scores[0], icon: '◈' },
      { name: 'Structural Complexity', score: scores[1], icon: '⬡' },
      { name: 'Harmonic Symmetry', score: scores[2], icon: '✶' },
      { name: 'Luminous Depth', score: scores[3], icon: '◐' },
      { name: 'Cosmic Alignment', score: scores[4], icon: '✦' },
    ];
    return { tier: chosen.tier, maxMints: chosen.maxMints, color: chosen.color, glow: chosen.glow, components: comps };
  }

  function getRarity(upc) {
    const r = getRarityComponents(upc);
    return { tier: r.tier, maxMints: r.maxMints, color: r.color, glow: r.glow };
  }

  /* ---------- naming ---------- */

  const NAME_A = ['Ethereal', 'Sovereign', 'Meridian', 'Lucent', 'Halcyon', 'Obsidian', 'Gilded', 'Feral', 'Silent', 'Radiant', 'Hollow', 'Solar', 'Tidal', 'Vesper', 'Boreal', 'Astral', 'Velvet', 'Iron', 'Amber', 'Cobalt', 'Saffron', 'Umbral', 'Crystalline', 'Winter'];
  const NAME_B = ['Cartography', 'Reverie', 'Threshold', 'Synapse', 'Chorus', 'Procession', 'Bloom', 'Cathedral', 'Drift', 'Signal', 'Tessellation', 'Communion', 'Horizon', 'Antiphon', 'Circuit', 'Monolith', 'Current', 'Aperture', 'Resonance', 'Veil', 'Ascension', 'Frequency', 'Covenant', 'Meridian'];

  function getArtName(upc) {
    const seed = upcToSeed(upc);
    const rng = mulberry32(seed + 999);
    const num = 1000 + (seed % 9000);
    return `${rng.pick(NAME_A)} ${rng.pick(NAME_B)} #${num}`;
  }

  function getFamily(upc) {
    const seed = upcToSeed(upc);
    const famRng = mulberry32(seed ^ 0xabcdef01);
    return FAMILIES[Math.floor(famRng() * FAMILIES.length)].label;
  }

  function getPalette(upc) {
    const seed = upcToSeed(upc);
    const palRng = mulberry32(seed ^ 0x1234abcd);
    return PALETTES[Math.floor(palRng() * PALETTES.length)].name;
  }

  /* ---------- main ---------- */

  function generate(upc) {
    const seed = upcToSeed(upc);
    const rng = mulberry32(seed);
    const famRng = mulberry32(seed ^ 0xabcdef01);
    const palRng = mulberry32(seed ^ 0x1234abcd);
    const fam = FAMILIES[Math.floor(famRng() * FAMILIES.length)];
    const pal = PALETTES[Math.floor(palRng() * PALETTES.length)];
    const tier = getRarity(upc).tier;
    const id = (seed % 100000).toString(36);

    const body = fam.draw(rng, pal, id);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
${defsBlock(pal, id)}
<rect width="${S}" height="${S}" fill="url(#bg${id})"/>
${atmosphere(pal, id, rng)}
${body}
${frameAndFinish(id, tier)}
</svg>`;
  }

  return { generate, getRarity, getRarityComponents, getArtName, getFamily, getPalette };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = ArtEngine; }
