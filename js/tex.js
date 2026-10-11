// Procedural canvas textures for the nook. Everything here is drawn at load time.
import { THREE, mulberry32 } from './core.js';

const R = mulberry32(4242);
export const rr = (a = 0, b = 1) => a + (b - a) * R();

export function cnv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
export function tex(c, { repeat = true, srgb = true, aniso = 8, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.flipY = flipY;
  t.needsUpdate = true;
  return t;
}

// ---------- tileable value noise ----------
function hash2(ix, iy, s) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
export function pnoise(x, y, per, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (i) => ((i % per) + per) % per;
  const a = hash2(w(xi), w(yi), s), b = hash2(w(xi + 1), w(yi), s), c = hash2(w(xi), w(yi + 1), s), d = hash2(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, per, oct = 4, s = 0) {
  let v = 0, a = 0.5, f = 1, tot = 0;
  for (let o = 0; o < oct; o++) { v += a * pnoise(x * f, y * f, per * f, s + o * 17); tot += a; a *= 0.5; f *= 2; }
  return v / tot;
}
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function grain(ctx, w, h, amount = 0.06, n = 3000) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = R() < 0.5 ? `rgba(0,0,0,${amount * R()})` : `rgba(255,255,255,${amount * 0.6 * R()})`;
    const s = 1 + R() * 2;
    ctx.fillRect(R() * w, R() * h, s, s);
  }
}

// ---------- surfaces ----------
export function woodPlanks(base = '#5b3720', { w = 512, h = 512, rows = 8, contrast = 0.22, gap = '#1c0f08' } = {}) {
  const [c, ctx] = cnv(w, h);
  const b = hex(base);
  const ph = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rr(0, w);
    while (x < w) {
      const len = rr(w * 0.45, w * 1.1);
      const k = rr(-contrast, contrast);
      const col = b.map((v) => Math.max(0, Math.min(255, v * (1 + k))));
      ctx.fillStyle = `rgb(${col.join(',')})`;
      for (const off of [0, w]) {
        ctx.fillRect(x + off - w, r * ph, len, ph);
        ctx.fillRect(x + off, r * ph, len, ph);
      }
      // grain
      ctx.save();
      ctx.beginPath(); ctx.rect(Math.max(0, x), r * ph, len, ph); ctx.clip();
      for (let g = 0; g < 9; g++) {
        ctx.strokeStyle = `rgba(20,8,2,${rr(0.08, 0.22)})`;
        ctx.lineWidth = rr(0.6, 1.6);
        ctx.beginPath();
        const y0 = r * ph + rr(2, ph - 2), amp = rr(0.5, 2.5), fr = rr(0.01, 0.04), ph0 = rr(0, 6);
        for (let xx = Math.max(0, x); xx <= x + len; xx += 6) ctx.lineTo(xx, y0 + Math.sin(xx * fr + ph0) * amp);
        ctx.stroke();
      }
      if (R() < 0.2) {
        ctx.fillStyle = 'rgba(25,10,4,0.45)';
        ctx.beginPath(); ctx.ellipse(x + rr(10, len - 10), r * ph + ph / 2, rr(3, 7), rr(2, 4), 0, 0, 7); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = gap; ctx.fillRect(x + len - 1.5, r * ph, 2, ph);
      x += len;
    }
    ctx.fillStyle = gap; ctx.fillRect(0, r * ph, w, 2);
    ctx.fillStyle = 'rgba(255,230,200,0.06)'; ctx.fillRect(0, r * ph + 2, w, 2);
  }
  grain(ctx, w, h, 0.05, 2500);
  return tex(c);
}

// Ornamental damask motif, mirrored left/right
function motif(ctx, cx, cy, s, col, col2) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
  for (const m of [1, -1]) {
    ctx.save(); ctx.scale(m, 1);
    ctx.beginPath(); // central flame
    ctx.moveTo(0, -64); ctx.bezierCurveTo(10, -50, 22, -28, 14, -6); ctx.bezierCurveTo(9, 8, 4, 18, 0, 28); ctx.lineTo(0, -64); ctx.fill();
    ctx.lineWidth = 5; // big scroll
    ctx.beginPath(); ctx.moveTo(4, 30); ctx.bezierCurveTo(30, 36, 58, 16, 54, -14); ctx.bezierCurveTo(51, -38, 26, -44, 24, -26); ctx.bezierCurveTo(23, -14, 36, -12, 38, -22); ctx.stroke();
    ctx.beginPath(); // leaf
    ctx.moveTo(10, 34); ctx.bezierCurveTo(26, 46, 40, 56, 34, 70); ctx.bezierCurveTo(22, 64, 12, 52, 10, 34); ctx.fill();
    ctx.beginPath(); // upper sprig
    ctx.moveTo(4, -62); ctx.bezierCurveTo(16, -76, 30, -78, 36, -70); ctx.bezierCurveTo(26, -66, 16, -64, 4, -62); ctx.fill();
    ctx.beginPath(); ctx.arc(46, -60, 4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(60, 6, 3.2, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 46); ctx.bezierCurveTo(8, 56, 8, 70, 0, 80); ctx.stroke();
    ctx.restore();
  }
  if (col2) { ctx.fillStyle = col2; ctx.beginPath(); ctx.ellipse(0, -18, 5, 12, 0, 0, 7); ctx.fill(); }
  ctx.restore();
}
export function damask(bg = '#3d1a2a', fg = '#5e2a3e', { stripe = true, accent = null, size = 256, lower = null } = {}) {
  const [c, ctx] = cnv(size, size);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
  if (stripe) for (let x = 0; x < size; x += 16) { ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fillRect(x, 0, 8, size); }
  const s = size / 256;
  for (const [x, y] of [[128, 128], [0, 0], [256, 0], [0, 256], [256, 256]]) motif(ctx, x * s, y * s, 0.92 * s, fg, accent);
  for (const [x, y] of [[0, 128], [256, 128], [128, 0], [128, 256]]) {
    ctx.fillStyle = fg; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x * s, y * s - 14 * s); ctx.lineTo(x * s + 8 * s, y * s); ctx.lineTo(x * s, y * s + 14 * s); ctx.lineTo(x * s - 8 * s, y * s); ctx.fill();
    ctx.globalAlpha = 1;
  }
  grain(ctx, size, size, 0.05, 1500);
  return tex(c);
}

// The famous eye-filled wallpaper (our own take): scrollwork faces with glowing eyes.
export function eyePaper() {
  const S = 256;
  const [c, ctx] = cnv(S, S);
  const [ce, cte] = cnv(S, S);
  ctx.fillStyle = '#2e1540'; ctx.fillRect(0, 0, S, S);
  cte.fillStyle = '#000'; cte.fillRect(0, 0, S, S);
  const face = (cx, cy, sc) => {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
    ctx.strokeStyle = '#6b2f7a'; ctx.fillStyle = '#4a1f5c'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const m of [1, -1]) {
      ctx.save(); ctx.scale(m, 1);
      ctx.beginPath(); ctx.moveTo(4, -56); ctx.bezierCurveTo(46, -64, 66, -30, 52, 0); ctx.bezierCurveTo(44, 18, 24, 20, 22, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 30); ctx.bezierCurveTo(30, 34, 50, 50, 44, 72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -10); ctx.bezierCurveTo(30, -24, 46, -16, 46, -6); ctx.bezierCurveTo(36, 2, 22, 2, 10, -10); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#5b2a6d'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(10, 26); ctx.lineTo(-10, 26); ctx.fill();
    ctx.restore();
    for (const m of [1, -1]) {
      const ex = cx + m * 26 * sc, ey = cy - 6 * sc;
      for (const [g, col, a] of [[ctx, '#f2c14e', 1], [cte, '#ffcf55', 1]]) {
        g.save(); g.translate(ex, ey); g.scale(sc, sc);
        g.fillStyle = col; g.globalAlpha = a;
        g.beginPath(); g.moveTo(-14, 0); g.quadraticCurveTo(0, -11, 14, 0); g.quadraticCurveTo(0, 11, -14, 0); g.fill();
        g.fillStyle = '#1a0b10'; g.beginPath(); g.ellipse(m * 1.5, 0, 3.2, 6, 0, 0, 7); g.fill();
        g.restore();
      }
    }
  };
  face(128, 128, 0.95); face(0, 0, 0.95); face(256, 0, 0.95); face(0, 256, 0.95); face(256, 256, 0.95);
  grain(ctx, S, S, 0.06, 1500);
  return { map: tex(c), emissive: tex(ce) };
}

export function stoneBlocks(base = '#7d7690', { w = 512, h = 512, rows = 6, mortar = '#2a2433', var: v = 0.18, rough = true } = {}) {
  const [c, ctx] = cnv(w, h);
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, w, h);
  const b = hex(base);
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rr(20, 80) : -rr(0, 40);
    while (x < w) {
      const bw = rr(rh * 1.1, rh * 2.4);
      const k = rr(-v, v);
      const col = b.map((q) => Math.max(0, Math.min(255, q * (1 + k))));
      const g = ctx.createLinearGradient(0, r * rh, 0, r * rh + rh);
      g.addColorStop(0, `rgb(${col.map((q) => Math.min(255, q * 1.12)).join(',')})`);
      g.addColorStop(1, `rgb(${col.map((q) => q * 0.82).join(',')})`);
      ctx.fillStyle = g;
      const inset = 3;
      for (const off of [0, w, -w]) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x + off + inset, r * rh + inset, bw - inset * 2, rh - inset * 2, 5);
        else ctx.rect(x + off + inset, r * rh + inset, bw - inset * 2, rh - inset * 2);
        ctx.fill();
      }
      if (rough) for (let i = 0; i < 18; i++) {
        ctx.fillStyle = `rgba(0,0,0,${rr(0.04, 0.12)})`;
        ctx.beginPath(); ctx.ellipse(x + rr(6, bw - 6), r * rh + rr(6, rh - 6), rr(2, 9), rr(1, 5), rr(0, 3), 0, 7); ctx.fill();
      }
      x += bw;
    }
  }
  grain(ctx, w, h, 0.07, 4000);
  return tex(c);
}

export function bricks(base = '#6a3a3a', { w = 256, h = 256, rows = 8, mortar = '#2b1d22' } = {}) {
  const [c, ctx] = cnv(w, h);
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, w, h);
  const b = hex(base); const rh = h / rows; const bw = rh * 2.1;
  for (let r = 0; r < rows; r++) {
    for (let x = (r % 2) * -bw / 2; x < w + bw; x += bw) {
      const k = rr(-0.18, 0.18);
      ctx.fillStyle = `rgb(${b.map((q) => Math.max(0, Math.min(255, q * (1 + k)))).join(',')})`;
      ctx.fillRect(x + 2, r * rh + 2, bw - 4, rh - 4);
    }
  }
  grain(ctx, w, h, 0.08, 2500);
  return tex(c);
}

export function shingles(base = '#463657', { w = 256, h = 256, rows = 8 } = {}) {
  const [c, ctx] = cnv(w, h);
  const b = hex(base);
  ctx.fillStyle = `rgb(${b.map((q) => q * 0.5).join(',')})`; ctx.fillRect(0, 0, w, h);
  const rh = h / rows, sw = rh * 1.15;
  for (let r = rows; r >= -1; r--) {
    for (let x = (r % 2) * sw / 2 - sw; x < w + sw; x += sw) {
      const k = rr(-0.16, 0.12);
      const col = b.map((q) => Math.max(0, Math.min(255, q * (1 + k))));
      const y = r * rh;
      const g = ctx.createLinearGradient(0, y - rh, 0, y + rh * 0.5);
      g.addColorStop(0, `rgb(${col.map((q) => q * 0.75).join(',')})`);
      g.addColorStop(1, `rgb(${col.map((q) => Math.min(255, q * 1.15)).join(',')})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y - rh * 1.2); ctx.lineTo(x, y); ctx.arc(x + sw / 2, y, sw / 2, Math.PI, 0, true); ctx.lineTo(x + sw, y - rh * 1.2); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,5,15,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x + sw / 2, y, sw / 2, Math.PI, 0, true); ctx.stroke();
    }
  }
  grain(ctx, w, h, 0.06, 1500);
  return tex(c);
}

export function siding(base = '#cbc3d6', { w = 256, h = 256, boards = 8 } = {}) {
  const [c, ctx] = cnv(w, h);
  const b = hex(base); const bh = h / boards;
  for (let i = 0; i < boards; i++) {
    const k = rr(-0.04, 0.04);
    const g = ctx.createLinearGradient(0, i * bh, 0, (i + 1) * bh);
    g.addColorStop(0, `rgb(${b.map((q) => Math.min(255, q * (1.04 + k))).join(',')})`);
    g.addColorStop(0.85, `rgb(${b.map((q) => q * (0.94 + k)).join(',')})`);
    g.addColorStop(1, `rgb(${b.map((q) => q * 0.62).join(',')})`);
    ctx.fillStyle = g; ctx.fillRect(0, i * bh, w, bh);
    for (let s = 0; s < 6; s++) { ctx.fillStyle = `rgba(60,40,70,${rr(0.02, 0.06)})`; ctx.fillRect(rr(0, w), i * bh + rr(0, bh), rr(20, 90), 1); }
  }
  for (let i = 0; i < 40; i++) { // grime streaks
    ctx.fillStyle = `rgba(40,30,55,${rr(0.02, 0.05)})`;
    ctx.fillRect(rr(0, w), rr(0, h), rr(1, 3), rr(10, 60));
  }
  grain(ctx, w, h, 0.04, 1500);
  return tex(c);
}

export function plaster(base = '#d8d0c4', { w = 256, h = 256 } = {}) {
  const [c, ctx] = cnv(w, h);
  const img = ctx.createImageData(w, h); const b = hex(base);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / 64, y / 64, 4, 4, 3) - 0.5;
    const i = (y * w + x) * 4;
    img.data[i] = b[0] * (1 + n * 0.18); img.data[i + 1] = b[1] * (1 + n * 0.18); img.data[i + 2] = b[2] * (1 + n * 0.18); img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

export function soil({ w = 1024, h = 512 } = {}) {
  const [c, ctx] = cnv(w, h);
  const layers = [
    [0.0, '#4a3b2c'], [0.07, '#2f2420'], [0.24, '#4d3426'], [0.42, '#3a2b25'], [0.58, '#5b4535'], [0.74, '#332a2c'], [0.88, '#262026'],
  ];
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const warp = (fbm(x / 128, y / 128, 8, 3, 11) - 0.5) * 0.12;
    const t = y / h + warp + Math.sin(x / w * Math.PI * 4) * 0.012;
    let col = hex(layers[0][1]);
    for (let L = 0; L < layers.length; L++) if (t >= layers[L][0]) col = hex(layers[L][1]);
    const n = fbm(x / 24, y / 24, 42, 3, 5) - 0.5;
    const i = (y * w + x) * 4;
    img.data[i] = col[0] * (1 + n * 0.5); img.data[i + 1] = col[1] * (1 + n * 0.5); img.data[i + 2] = col[2] * (1 + n * 0.5); img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 260; i++) { // pebbles
    const x = rr(0, w), y = rr(h * 0.1, h), rx = rr(2, 9), ry = rx * rr(0.5, 0.9);
    const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.3, 0, x, y, rx);
    const base = R() < 0.5 ? [120, 108, 112] : [96, 82, 72];
    g.addColorStop(0, `rgb(${base.map((q) => q * 1.3).join(',')})`); g.addColorStop(1, `rgb(${base.map((q) => q * 0.6).join(',')})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rr(0, 3), 0, 7); ctx.fill();
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) { // roots
    let x = rr(0, w), y = 0, wdt = rr(2, 5);
    ctx.strokeStyle = `rgba(${rr(70, 100)},${rr(50, 64)},${rr(36, 44)},0.9)`;
    for (let s = 0; s < 22 && wdt > 0.4; s++) {
      const nx = x + rr(-14, 14), ny = y + rr(6, 18);
      ctx.lineWidth = wdt; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      x = nx; y = ny; wdt *= 0.9;
      if (y > h * 0.5) break;
    }
  }
  return tex(c);
}

export function grass(base = '#34453f', { w = 256, h = 256 } = {}) {
  const [c, ctx] = cnv(w, h);
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const cols = ['#2a3a36', '#3e5249', '#4a5a4d', '#2f2f40', '#45523e', '#526153'];
  for (let i = 0; i < 4200; i++) {
    const x = rr(0, w), y = rr(0, h), l = rr(2, 7), a = rr(-0.6, 0.6);
    ctx.strokeStyle = cols[i % cols.length]; ctx.globalAlpha = rr(0.4, 0.9); ctx.lineWidth = rr(0.8, 1.8);
    for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.sin(a) * l, y + oy - Math.cos(a) * l); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  return tex(c);
}

export function parquet(a = '#6e4026', b = '#8a5532', { size = 512 } = {}) {
  const [c, ctx] = cnv(size, size);
  ctx.fillStyle = '#2a160c'; ctx.fillRect(0, 0, size, size);
  const L = size / 4, W2 = L / 3;
  const ca = hex(a), cb = hex(b);
  for (let i = -6; i < 12; i++) for (let j = -6; j < 12; j++) {
    for (const dir of [0, 1]) {
      const k = rr(-0.12, 0.12);
      const col = (dir ? cb : ca).map((q) => Math.max(0, Math.min(255, q * (1 + k))));
      ctx.save();
      ctx.translate(i * W2 * 2 + j * W2 * 0, j * W2 * 2 + i * 0);
      ctx.translate(dir ? W2 : 0, dir ? 0 : 0);
      ctx.rotate(Math.PI / 4 * (dir ? 1 : -1));
      ctx.fillStyle = `rgb(${col.join(',')})`;
      ctx.fillRect(0, 0, L - 2, W2 - 2);
      ctx.strokeStyle = 'rgba(30,12,4,0.15)';
      for (let g = 0; g < 3; g++) { ctx.beginPath(); ctx.moveTo(0, rr(2, W2 - 4)); ctx.lineTo(L - 2, rr(2, W2 - 4)); ctx.stroke(); }
      ctx.restore();
    }
  }
  grain(ctx, size, size, 0.05, 2000);
  return tex(c);
}

export function checker(a = '#e9e3ea', b = '#231b2b', { size = 512, n = 4 } = {}) {
  const [c, ctx] = cnv(size, size);
  const s = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = (i + j) % 2 ? b : a;
    ctx.fillRect(i * s, j * s, s, s);
  }
  ctx.lineCap = 'round';
  for (let v = 0; v < 26; v++) { // marble veins
    let x = rr(0, size), y = rr(0, size);
    ctx.strokeStyle = R() < 0.5 ? 'rgba(120,110,140,0.25)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = rr(0.6, 1.8);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 10; k++) { x += rr(-20, 30); y += rr(-20, 30); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, size); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(size, i * s); ctx.stroke(); }
  return tex(c);
}

export function rug(c1 = '#5a1a2a', c2 = '#c69a4a', c3 = '#1d2a4a', { w = 512, h = 320 } = {}) {
  const [c, ctx] = cnv(w, h);
  ctx.fillStyle = c1; ctx.fillRect(0, 0, w, h);
  const band = (inset, col, wd) => { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2); };
  band(10, c3, 14); band(26, c2, 4); band(40, c3, 6);
  for (let x = 30; x < w - 30; x += 22) { ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + 6, 10); ctx.lineTo(x, 16); ctx.lineTo(x - 6, 10); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, h - 4); ctx.lineTo(x + 6, h - 10); ctx.lineTo(x, h - 16); ctx.lineTo(x - 6, h - 10); ctx.fill(); }
  ctx.save(); ctx.translate(w / 2, h / 2);
  ctx.fillStyle = c3; ctx.beginPath(); ctx.ellipse(0, 0, 110, 72, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(0, 0, 88, 54, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(0, 0, 70, 40, 0, 0, 7); ctx.fill();
  for (let a = 0; a < 16; a++) { ctx.save(); ctx.rotate(a / 16 * Math.PI * 2); ctx.fillStyle = a % 2 ? c2 : c3; ctx.beginPath(); ctx.ellipse(46, 0, 14, 5, 0, 0, 7); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
  ctx.restore();
  for (const [x, y] of [[70, 62], [w - 70, 62], [70, h - 62], [w - 70, h - 62]]) { ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill(); ctx.fillStyle = c3; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); }
  grain(ctx, w, h, 0.12, 6000);
  return tex(c, { repeat: false });
}

export function wainscot(base = '#3a2216', { w = 256, h = 128 } = {}) {
  const [c, ctx] = cnv(w, h);
  const b = hex(base);
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const pw = w / 2;
  for (let i = 0; i < 2; i++) {
    const x = i * pw + 12, y = 14, ww = pw - 24, hh = h - 28;
    ctx.fillStyle = `rgb(${b.map((q) => q * 0.7).join(',')})`; ctx.fillRect(x - 3, y - 3, ww + 6, hh + 6);
    ctx.fillStyle = `rgb(${b.map((q) => Math.min(255, q * 1.25)).join(',')})`; ctx.fillRect(x, y, ww, hh);
    const g = ctx.createLinearGradient(x, y, x, y + hh); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g; ctx.fillRect(x + 6, y + 6, ww - 12, hh - 12);
  }
  grain(ctx, w, h, 0.06, 800);
  return tex(c);
}

export function curtain(base = '#5a1530', { w = 128, h = 256 } = {}) {
  const [c, ctx] = cnv(w, h);
  const b = hex(base);
  for (let x = 0; x < w; x++) {
    const k = 0.62 + 0.38 * Math.pow(0.5 + 0.5 * Math.sin((x / w) * Math.PI * 2 * 4), 1.5);
    ctx.fillStyle = `rgb(${b.map((q) => q * k).join(',')})`; ctx.fillRect(x, 0, 1, h);
  }
  return tex(c);
}

export function tufted(base = '#6b3f8a', { size = 256 } = {}) {
  const [c, ctx] = cnv(size, size);
  const b = hex(base);
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  const n = 4, s = size / n;
  for (let i = -1; i <= n; i++) for (let j = -1; j <= n; j++) {
    const x = i * s + (j % 2 ? s / 2 : 0), y = j * s * 0.75;
    const g = ctx.createRadialGradient(x, y, 2, x, y, s * 0.6);
    g.addColorStop(0, `rgb(${b.map((q) => q * 0.55).join(',')})`); g.addColorStop(0.25, `rgb(${b.map((q) => Math.min(255, q * 1.2)).join(',')})`); g.addColorStop(1, `rgb(${b.map((q) => q * 0.85).join(',')})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, s * 0.55, s * 0.42, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#d7b46a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  }
  return tex(c);
}

// wrought-iron scrollwork with alpha (use with alphaTest)
export function ironwork({ w = 256, h = 128, style = 'rail' } = {}) {
  const [c, ctx] = cnv(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineCap = 'round';
  ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(w, 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, h - 5); ctx.lineTo(w, h - 5); ctx.stroke();
  ctx.lineWidth = 4;
  if (style === 'rail') {
    for (let x = 0; x <= w; x += w / 4) { ctx.beginPath(); ctx.moveTo(x, 5); ctx.lineTo(x, h - 5); ctx.stroke(); }
    for (let i = 0; i < 4; i++) {
      const cx = i * w / 4 + w / 8;
      for (const m of [1, -1]) {
        ctx.beginPath(); ctx.moveTo(cx, h / 2);
        ctx.bezierCurveTo(cx + m * 22, h / 2 - 34, cx + m * 30, h / 2 + 4, cx + m * 14, h / 2 + 10);
        ctx.bezierCurveTo(cx + m * 4, h / 2 + 12, cx + m * 6, h / 2 - 4, cx + m * 14, h / 2 - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, h / 2);
        ctx.bezierCurveTo(cx + m * 22, h / 2 + 34, cx + m * 30, h / 2 - 4, cx + m * 14, h / 2 - 10); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, h / 2, 6, 0, 7); ctx.fill();
    }
  } else if (style === 'fence') {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, h * 0.28); ctx.lineTo(w, h * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h - 8); ctx.lineTo(w, h - 8); ctx.stroke();
    for (let x = w / 16; x < w; x += w / 8) {
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 7, 16); ctx.lineTo(x, 12); ctx.lineTo(x - 7, 16); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + w / 16, h * 0.28 + 14, 10, Math.PI, 0); ctx.stroke();
    }
  } else if (style === 'cresting') {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, h - 6); ctx.lineTo(w, h - 6); ctx.stroke();
    for (let x = w / 8; x < w; x += w / 4) {
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, h - 6); ctx.lineTo(x, 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 14, 14, x + 6, 22, x, 26); ctx.bezierCurveTo(x - 6, 22, x - 14, 14, x, 0); ctx.fill();
      for (const m of [1, -1]) { ctx.beginPath(); ctx.moveTo(x, h * 0.6); ctx.bezierCurveTo(x + m * 30, h * 0.3, x + m * 34, h * 0.8, x + m * 22, h * 0.75); ctx.stroke(); }
    }
  }
  return tex(c, { srgb: false });
}

// laser-cut lace trim for the book nook frame
export function filigree({ w = 512, h = 64 } = {}) {
  const [c, ctx] = cnv(w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, 10);
  for (let x = 0; x < w; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 10); ctx.quadraticCurveTo(x + 16, 60, x + 32, 10); ctx.fill();
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.arc(x + 16, 22, 6, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x + 16, 36, 2.5, 0, 7); ctx.fill(); }
  return tex(c, { srgb: false });
}

export function glowSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const [c, ctx] = cnv(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)')); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return tex(c, { repeat: false });
}

export function fogTex({ size = 256 } = {}) {
  const [c, ctx] = cnv(size, size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / 64, y / 64, 4, 5, 21);
    const a = Math.max(0, Math.min(1, (n - 0.38) * 2.2));
    const i = (y * size + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

export function windowTex({ panesX = 2, panesY = 3, warm = true, arch = false, figure = false } = {}) {
  const [c, ctx] = cnv(128, 256);
  const g = ctx.createRadialGradient(64, 150, 6, 64, 140, 170);
  if (warm) { g.addColorStop(0, '#ffe2a0'); g.addColorStop(0.45, '#ffad4a'); g.addColorStop(1, '#a0441c'); }
  else { g.addColorStop(0, '#bfe9ff'); g.addColorStop(0.5, '#4d79b8'); g.addColorStop(1, '#1b2550'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 256);
  if (figure) { // a silhouette lurking
    ctx.fillStyle = 'rgba(30,10,10,0.85)';
    ctx.beginPath(); ctx.ellipse(70, 112, 15, 18, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(40, 256); ctx.quadraticCurveTo(44, 140, 70, 128); ctx.quadraticCurveTo(98, 140, 102, 256); ctx.fill();
  }
  ctx.fillStyle = '#20141c';
  const fw = 9;
  ctx.fillRect(0, 0, 128, fw); ctx.fillRect(0, 256 - fw, 128, fw); ctx.fillRect(0, 0, fw, 256); ctx.fillRect(128 - fw, 0, fw, 256);
  for (let i = 1; i < panesX; i++) ctx.fillRect(i * 128 / panesX - 2.5, 0, 5, 256);
  for (let j = 1; j < panesY; j++) ctx.fillRect(0, j * 256 / panesY - 2.5, 128, 5);
  if (arch) {
    ctx.fillStyle = '#20141c';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(128, 0); ctx.lineTo(128, 64); ctx.arc(64, 64, 64, 0, Math.PI, true); ctx.closePath(); ctx.fill();
  }
  return tex(c, { repeat: false });
}

export function nightGlass() {
  const [c, ctx] = cnv(64, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#2d3a78'); g.addColorStop(1, '#120d2a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#140c14';
  ctx.fillRect(0, 0, 64, 5); ctx.fillRect(0, 123, 64, 5); ctx.fillRect(0, 0, 5, 128); ctx.fillRect(59, 0, 5, 128);
  ctx.fillRect(30, 0, 4, 128); ctx.fillRect(0, 42, 64, 3); ctx.fillRect(0, 84, 64, 3);
  return tex(c, { repeat: false });
}

export function bookSpine() {
  const [c, ctx] = cnv(64, 256);
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, 64, 256);
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.3, 'rgba(255,255,255,0.12)'); g.addColorStop(0.7, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  ctx.fillStyle = '#ffffff';
  for (const y of [18, 30, 220, 232]) ctx.fillRect(0, y, 64, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(14, 70, 36, 60);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (let y = 78; y < 124; y += 10) ctx.fillRect(18, y, 28, 3);
  return tex(c, { repeat: false });
}

export function moonTex() {
  const S = 512;
  const [c, ctx] = cnv(S, S);
  const g = ctx.createRadialGradient(S * 0.46, S * 0.44, S * 0.05, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, '#fff8e6'); g.addColorStop(0.7, '#f3dfb2'); g.addColorStop(0.97, '#d8b98a'); g.addColorStop(1, 'rgba(216,185,138,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.49, 0, 7); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.48, 0, 7); ctx.clip();
  for (let i = 0; i < 30; i++) {
    const x = rr(S * 0.1, S * 0.9), y = rr(S * 0.1, S * 0.9), r = rr(8, 60);
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
    cg.addColorStop(0, 'rgba(170,140,110,0.28)'); cg.addColorStop(1, 'rgba(170,140,110,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.restore();
  return tex(c, { repeat: false });
}

export function background() {
  const W = 1024, H = 1024;
  const [c, ctx] = cnv(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#120c26'); g.addColorStop(0.45, '#2a1d4f'); g.addColorStop(0.8, '#3b2860'); g.addColorStop(1, '#1a1232');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W * 0.62, H * 0.42, 10, W * 0.62, H * 0.42, W * 0.7);
  rg.addColorStop(0, 'rgba(150,110,210,0.38)'); rg.addColorStop(0.5, 'rgba(90,60,150,0.12)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const y = Math.pow(R(), 1.6) * H * 0.7;
    ctx.fillStyle = `rgba(230,220,255,${rr(0.15, 0.7)})`;
    const s = R() < 0.92 ? 1 : 2;
    ctx.fillRect(rr(0, W), y, s, s);
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(5,2,12,0.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 0.025, 20000);
  const t = tex(c, { repeat: false });
  return t;
}

export function zodiac() {
  const S = 512;
  const [c, ctx] = cnv(S, S);
  ctx.fillStyle = '#121433'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) { ctx.fillStyle = `rgba(255,230,160,${rr(0.3, 0.9)})`; const s = rr(1, 2.5); ctx.fillRect(rr(0, S), rr(0, S), s, s); }
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 3;
  for (const r of [200, 170, 110]) { ctx.beginPath(); ctx.arc(S / 2, S / 2, r, 0, 7); ctx.stroke(); }
  ctx.fillStyle = '#c9a24a'; ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const glyphs = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
  glyphs.forEach((gl, i) => { const a = i / 12 * Math.PI * 2; ctx.fillText(gl, S / 2 + Math.cos(a) * 185, S / 2 + Math.sin(a) * 185); ctx.beginPath(); ctx.moveTo(S / 2 + Math.cos(a + 0.26) * 170, S / 2 + Math.sin(a + 0.26) * 170); ctx.lineTo(S / 2 + Math.cos(a + 0.26) * 200, S / 2 + Math.sin(a + 0.26) * 200); ctx.stroke(); });
  ctx.beginPath(); ctx.arc(S / 2, S / 2, 40, 0, 7); ctx.fill();
  return tex(c, { repeat: false });
}

export function clockFace() {
  const S = 256;
  const [c, ctx] = cnv(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#f2e6c8'); g.addColorStop(1, '#b89a68');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, 7); ctx.fill();
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 10, 0, 7); ctx.stroke();
  ctx.fillStyle = '#2a1a10'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px "IM Fell English SC", Georgia, serif';
  for (let i = 1; i <= 13; i++) {
    const a = i / 13 * Math.PI * 2 - Math.PI / 2;
    ctx.fillText(String(i), S / 2 + Math.cos(a) * 92, S / 2 + Math.sin(a) * 92);
    ctx.fillRect(S / 2 + Math.cos(a) * 112 - 2, S / 2 + Math.sin(a) * 112 - 2, 4, 4);
  }
  return tex(c, { repeat: false });
}

// carved text on stone
export function epitaph(lines, { w = 256, h = 320, base = '#8c8698', title = '' } = {}) {
  const [c, ctx] = cnv(w, h);
  const b = hex(base);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / 40, y / 40, 8, 4, 33) - 0.5;
    const i = (y * w + x) * 4;
    img.data[i] = b[0] * (1 + n * 0.45); img.data[i + 1] = b[1] * (1 + n * 0.45); img.data[i + 2] = b[2] * (1 + n * 0.45); img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 30; i++) { // lichen
    ctx.fillStyle = `rgba(${rr(80, 120)},${rr(110, 140)},${rr(70, 90)},${rr(0.12, 0.3)})`;
    ctx.beginPath(); ctx.ellipse(rr(0, w), rr(h * 0.5, h), rr(4, 18), rr(3, 10), 0, 0, 7); ctx.fill();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const all = title ? [title, ...lines] : lines;
  const lh = Math.min(34, (h * 0.62) / all.length);
  const y0 = h * 0.5 - (all.length - 1) * lh / 2 + h * 0.04;
  all.forEach((ln, i) => {
    const fs = i === 0 && title ? lh * 0.95 : lh * 0.7;
    ctx.font = `${fs}px "IM Fell English SC", Georgia, serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillText(ln, w / 2 + 1, y0 + i * lh + 1.5);
    ctx.fillStyle = 'rgba(28,22,34,0.85)'; ctx.fillText(ln, w / 2, y0 + i * lh);
  });
  return tex(c, { repeat: false });
}

export function labelTex(text, { w = 512, h = 96, bg = null, fg = '#e8c77a', font = 'IM Fell English SC', size = 54, stroke = null } = {}) {
  const [c, ctx] = cnv(w, h);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${size}px "${font}", Georgia, serif`;
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.strokeText(text, w / 2, h / 2 + 2); }
  ctx.fillStyle = fg; ctx.fillText(text, w / 2, h / 2 + 2);
  return tex(c, { repeat: false });
}

// leather book cover/spine for the giant books flanking the nook
export function leather(base = '#4a1f24', { w = 256, h = 256 } = {}) {
  const [c, ctx] = cnv(w, h);
  const b = hex(base);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / 16, y / 16, 16, 3, 7) - 0.5;
    const i = (y * w + x) * 4;
    img.data[i] = b[0] * (1 + n * 0.35); img.data[i + 1] = b[1] * (1 + n * 0.35); img.data[i + 2] = b[2] * (1 + n * 0.35); img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}
export function giantSpine(title, base = '#4a1f24', { w = 256, h = 1024, author = '' } = {}) {
  const [c, ctx] = cnv(w, h);
  const b = hex(base);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / 16, y / 16, 16, 3, 9) - 0.5;
    const edge = Math.pow(Math.abs(x / w - 0.5) * 2, 3) * 0.35;
    const i = (y * w + x) * 4;
    const k = (1 + n * 0.3) * (1 - edge);
    img.data[i] = b[0] * k; img.data[i + 1] = b[1] * k; img.data[i + 2] = b[2] * k; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = '#d4af5f';
  for (const y of [60, 84, h - 84, h - 60]) { ctx.fillRect(0, y, w, 7); }
  for (const y of [200, h - 220]) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, y, w, 22); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, y - 3, w, 3); }
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `64px "IM Fell English SC", Georgia, serif`;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(title, 2, 3);
  ctx.fillStyle = '#e2c27a'; ctx.fillText(title, 0, 0);
  if (author) { ctx.font = `34px "IM Fell English", Georgia, serif`; ctx.fillStyle = '#cfae68'; ctx.fillText(author, 0, 62); }
  ctx.restore();
  return tex(c, { repeat: false });
}
export function pageEdges({ w = 256, h = 64 } = {}) {
  const [c, ctx] = cnv(w, h);
  ctx.fillStyle = '#e6dcc2'; ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) { ctx.fillStyle = `rgba(120,100,70,${rr(0.05, 0.25)})`; ctx.fillRect(0, y, w, 1); }
  return tex(c);
}
