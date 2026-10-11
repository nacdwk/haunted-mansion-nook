// Painted portraits and faces (original artwork drawn with canvas paths).
import { cnv, tex, rr } from './tex.js';

const TAU = Math.PI * 2;

function paintBg(ctx, w, h, top, bottom, glow = 'rgba(255,220,170,0.25)') {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const rg = ctx.createRadialGradient(w * 0.5, Math.min(h, 400) * 0.4, 10, w * 0.5, Math.min(h, 400) * 0.45, w * 0.8);
  rg.addColorStop(0, glow); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  brush(ctx, w, h, 260);
}
function brush(ctx, w, h, n = 200, a = 0.05) {
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = a * rr(0.4, 1);
    ctx.strokeStyle = rr() < 0.5 ? '#000' : '#fff';
    ctx.lineWidth = rr(2, 8);
    const x = rr(0, w), y = rr(0, h);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rr(-30, 30), y + rr(-20, 20)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function finish(ctx, w, h, { vig = 0.55, warm = 0.3 } = {}) {
  brush(ctx, w, h, 120, 0.035);
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(10,4,2,${vig})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = warm; ctx.fillStyle = '#e9cf9a'; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(30,20,10,0.12)'; ctx.lineWidth = 0.7; // craquelure
  for (let i = 0; i < 90; i++) {
    let x = rr(0, w), y = rr(0, h);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += rr(-14, 14); y += rr(-14, 14); ctx.lineTo(x, y); }
    ctx.stroke();
  }
}
function ell(ctx, x, y, rx, ry, fill, rot = 0) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); }
function shade(ctx, x, y, r, base, dark) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, base); g.addColorStop(1, dark);
  return g;
}

// A simple stylised face. Front facing.
function face(ctx, x, y, r, o = {}) {
  const skin = o.skin || '#f0c9a8', dark = o.skinDark || '#b98466';
  if (o.hairBack) { ctx.fillStyle = o.hairBack; ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r * 1.18, r * 1.4, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = shade(ctx, x, y, r, skin, dark);
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.86, r, 0, 0, TAU); ctx.fill();
  if (o.ears !== false) { ell(ctx, x - r * 0.86, y + r * 0.05, r * 0.14, r * 0.22, dark); ell(ctx, x + r * 0.86, y + r * 0.05, r * 0.14, r * 0.22, dark); }
  const ey = y - r * 0.08, ex = r * 0.34;
  if (o.closed) {
    ctx.strokeStyle = '#3a2418'; ctx.lineWidth = r * 0.06;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * ex, ey - r * 0.02, r * 0.13, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  } else if (o.sockets) {
    for (const s of [-1, 1]) ell(ctx, x + s * ex, ey, r * 0.17, r * 0.2, '#120806');
    for (const s of [-1, 1]) ell(ctx, x + s * ex, ey, r * 0.05, r * 0.05, o.eyeGlow || '#e8f');
  } else {
    for (const s of [-1, 1]) {
      ell(ctx, x + s * ex, ey, r * 0.15, r * 0.1, o.eyeWhite || '#f7f1e6');
      ell(ctx, x + s * ex + (o.look || 0) * r * 0.05, ey, r * 0.07, r * 0.08, o.eyeColor || '#2a1810');
      ell(ctx, x + s * ex + r * 0.03, ey - r * 0.03, r * 0.025, r * 0.025, '#fff');
    }
  }
  ctx.strokeStyle = o.brow || '#3a2418'; ctx.lineWidth = r * 0.08; ctx.lineCap = 'round';
  const bt = o.browTilt || 0;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * ex - r * 0.16, ey - r * 0.2 + s * bt * r * 0.08); ctx.lineTo(x + s * ex + r * 0.16, ey - r * 0.22 - s * bt * r * 0.08); ctx.stroke(); }
  ctx.strokeStyle = dark; ctx.lineWidth = r * 0.06; // nose
  ctx.beginPath(); ctx.moveTo(x + r * 0.02, ey + r * 0.05); ctx.quadraticCurveTo(x + r * 0.12, y + r * 0.22, x - r * 0.02, y + r * 0.26); ctx.stroke();
  if (o.blush) { ell(ctx, x - r * 0.45, y + r * 0.3, r * 0.15, r * 0.09, 'rgba(230,90,90,0.35)'); ell(ctx, x + r * 0.45, y + r * 0.3, r * 0.15, r * 0.09, 'rgba(230,90,90,0.35)'); }
  const my = y + r * 0.52;
  ctx.strokeStyle = o.lips || '#8a3a30'; ctx.fillStyle = '#3a1210'; ctx.lineWidth = r * 0.07;
  const mood = o.mood || 'smile';
  if (mood === 'smile') { ctx.beginPath(); ctx.arc(x, my - r * 0.16, r * 0.24, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
  else if (mood === 'grin') { ctx.beginPath(); ctx.ellipse(x, my - r * 0.04, r * 0.3, r * 0.14, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x - r * 0.24, my - r * 0.04, r * 0.48, r * 0.06); }
  else if (mood === 'frown') { ctx.beginPath(); ctx.arc(x, my + r * 0.12, r * 0.2, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke(); }
  else if (mood === 'o') { ell(ctx, x, my, r * 0.12, r * 0.17, '#2a0c0a'); }
  else if (mood === 'prim') { ctx.beginPath(); ctx.moveTo(x - r * 0.14, my); ctx.lineTo(x + r * 0.14, my); ctx.stroke(); }
  else if (mood === 'strain') { ctx.beginPath(); ctx.moveTo(x - r * 0.22, my); for (let i = 0; i <= 6; i++) ctx.lineTo(x - r * 0.22 + i * r * 0.073, my + (i % 2 ? -r * 0.05 : r * 0.05)); ctx.stroke(); }
  if (o.mustache) {
    ctx.fillStyle = o.mustache;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x, y + r * 0.32);
      ctx.bezierCurveTo(x + s * r * 0.25, y + r * 0.22, x + s * r * 0.5, y + r * 0.42, x + s * r * (o.handlebar ? 0.78 : 0.48), y + r * (o.handlebar ? 0.18 : 0.42));
      ctx.bezierCurveTo(x + s * r * 0.45, y + r * 0.5, x + s * r * 0.2, y + r * 0.44, x, y + r * 0.4); ctx.fill();
    }
  }
  if (o.beard) { ctx.fillStyle = o.beard; ctx.beginPath(); ctx.moveTo(x - r * 0.8, y + r * 0.1); ctx.quadraticCurveTo(x - r * 0.7, y + r * 1.25, x, y + r * 1.35); ctx.quadraticCurveTo(x + r * 0.7, y + r * 1.25, x + r * 0.8, y + r * 0.1); ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.7, x, y + r * 0.72); ctx.quadraticCurveTo(x - r * 0.5, y + r * 0.7, x - r * 0.8, y + r * 0.1); ctx.fill(); }
  if (o.glasses) { ctx.strokeStyle = '#c8a050'; ctx.lineWidth = r * 0.04; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * ex, ey, r * 0.18, 0, TAU); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(x - ex + r * 0.18, ey); ctx.lineTo(x + ex - r * 0.18, ey); ctx.stroke(); }
  const hair = o.hair;
  if (hair) {
    ctx.fillStyle = hair;
    const hs = o.hairStyle || 'side';
    if (hs === 'side') { ctx.beginPath(); ctx.moveTo(x - r * 0.9, y - r * 0.05); ctx.quadraticCurveTo(x - r * 0.95, y - r * 1.15, x + r * 0.1, y - r * 1.1); ctx.quadraticCurveTo(x + r * 0.95, y - r * 1.05, x + r * 0.9, y - r * 0.1); ctx.quadraticCurveTo(x + r * 0.6, y - r * 0.75, x - r * 0.1, y - r * 0.62); ctx.quadraticCurveTo(x - r * 0.65, y - r * 0.55, x - r * 0.9, y - r * 0.05); ctx.fill(); }
    else if (hs === 'bun' || hs === 'updo') { ctx.beginPath(); ctx.ellipse(x, y - r * 0.58, r * 0.92, r * 0.55, 0, Math.PI, TAU); ctx.fill(); ell(ctx, x, y - r * 1.15, r * (hs === 'bun' ? 0.32 : 0.5), r * (hs === 'bun' ? 0.28 : 0.38), hair); }
    else if (hs === 'long') { ctx.beginPath(); ctx.ellipse(x, y - r * 0.55, r * 0.95, r * 0.6, 0, Math.PI, TAU); ctx.fill(); }
    else if (hs === 'wisps') { ctx.strokeStyle = hair; ctx.lineWidth = r * 0.05; for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.9); ctx.quadraticCurveTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3 + rr(-8, 8), x + Math.cos(a) * r * 1.2 + rr(-10, 10), y + Math.sin(a) * r * 1.1 + 20); ctx.stroke(); } }
  }
  if (o.bald) ell(ctx, x - r * 0.25, y - r * 0.62, r * 0.22, r * 0.1, 'rgba(255,255,255,0.45)', -0.4);
}
function shoulders(ctx, x, y, w, h, color, { collar = '#efe7d8', tie = null, lapel = null, puff = false, ruff = false } = {}) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - w * 0.18, y); ctx.quadraticCurveTo(x - w * 0.5, y + h * 0.05, x - w * 0.52, y + h); ctx.lineTo(x + w * 0.52, y + h); ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.05, x + w * 0.18, y); ctx.fill();
  if (puff) { ell(ctx, x - w * 0.42, y + h * 0.12, w * 0.16, h * 0.14, color); ell(ctx, x + w * 0.42, y + h * 0.12, w * 0.16, h * 0.14, color); }
  if (lapel) { ctx.fillStyle = lapel; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * w * 0.06, y + h * 0.05); ctx.lineTo(x + s * w * 0.24, y + h * 0.05); ctx.lineTo(x + s * w * 0.08, y + h * 0.6); ctx.fill(); } }
  if (collar) { ctx.fillStyle = collar; ctx.beginPath(); ctx.moveTo(x - w * 0.12, y - h * 0.02); ctx.lineTo(x, y + h * 0.16); ctx.lineTo(x + w * 0.12, y - h * 0.02); ctx.lineTo(x + w * 0.1, y + h * 0.04); ctx.lineTo(x, y + h * 0.22); ctx.lineTo(x - w * 0.1, y + h * 0.04); ctx.fill(); }
  if (tie === 'bow') { ctx.fillStyle = '#9a1c2a'; ctx.beginPath(); ctx.moveTo(x, y + h * 0.08); ctx.lineTo(x - w * 0.1, y + h * 0.02); ctx.lineTo(x - w * 0.1, y + h * 0.15); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, y + h * 0.08); ctx.lineTo(x + w * 0.1, y + h * 0.02); ctx.lineTo(x + w * 0.1, y + h * 0.15); ctx.closePath(); ctx.fill(); }
  else if (tie) { ctx.fillStyle = tie; ctx.beginPath(); ctx.moveTo(x - w * 0.03, y + h * 0.12); ctx.lineTo(x + w * 0.03, y + h * 0.12); ctx.lineTo(x + w * 0.05, y + h * 0.6); ctx.lineTo(x, y + h * 0.7); ctx.lineTo(x - w * 0.05, y + h * 0.6); ctx.fill(); }
  if (ruff) { ctx.fillStyle = '#f4efe6'; for (let i = 0; i < 14; i++) { const a = (i / 13) * Math.PI; ell(ctx, x + Math.cos(a) * w * 0.3, y - h * 0.02 + Math.sin(a) * h * 0.04, w * 0.07, h * 0.06, '#f4efe6'); } }
}
function hat(ctx, x, y, r, kind, color = '#1c1418') {
  ctx.fillStyle = color;
  if (kind === 'bowler') { ctx.beginPath(); ctx.ellipse(x, y - r * 0.75, r * 1.05, r * 0.16, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y - r * 0.8, r * 0.72, r * 0.62, 0, Math.PI, TAU); ctx.fill(); }
  if (kind === 'top') { ctx.beginPath(); ctx.ellipse(x, y - r * 0.78, r * 1.05, r * 0.15, 0, 0, TAU); ctx.fill(); ctx.fillRect(x - r * 0.62, y - r * 1.9, r * 1.24, r * 1.14); ctx.fillStyle = '#5a1a2a'; ctx.fillRect(x - r * 0.62, y - r * 0.98, r * 1.24, r * 0.14); }
  if (kind === 'captain') { ctx.beginPath(); ctx.ellipse(x, y - r * 0.8, r * 1.0, r * 0.28, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y - r * 0.95, r * 0.9, r * 0.5, 0, Math.PI, TAU); ctx.fill(); ctx.fillStyle = '#d4af5f'; ctx.fillRect(x - r * 0.5, y - r * 0.92, r, r * 0.08); }
}
const P = (w, h) => cnv(w, h);

// ---------- the stretching portraits (tall; the top ~35% is the polite part) ----------
export function stretchPortraits() {
  const W = 320, H = 1360;
  const out = [];
  { // A: the tightrope walker
    const [c, ctx] = P(W, H);
    paintBg(ctx, W, H, '#3d3050', '#1d3a3a');
    const wg = ctx.createLinearGradient(0, 1060, 0, H); wg.addColorStop(0, '#1f4a40'); wg.addColorStop(1, '#0a1a18');
    ctx.fillStyle = wg; ctx.fillRect(0, 1060, W, H - 1060);
    ctx.strokeStyle = 'rgba(160,220,200,0.25)'; ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) { const y = rr(1075, H - 10), x = rr(0, W); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20, y - 5, x + 40, y); ctx.stroke(); }
    // crocodile jaws
    ctx.fillStyle = '#3d6b3a';
    ctx.beginPath(); ctx.moveTo(10, 1150); ctx.lineTo(210, 1000); ctx.lineTo(240, 1010); ctx.lineTo(70, 1170); ctx.fill();
    ctx.beginPath(); ctx.moveTo(30, 1210); ctx.lineTo(260, 1110); ctx.lineTo(270, 1130); ctx.lineTo(60, 1240); ctx.fill();
    ctx.fillStyle = '#9fd17a'; ctx.beginPath(); ctx.moveTo(60, 1168); ctx.lineTo(236, 1020); ctx.lineTo(258, 1118); ctx.lineTo(64, 1206); ctx.fill();
    ctx.fillStyle = '#c63a3a'; ctx.beginPath(); ctx.moveTo(80, 1175); ctx.lineTo(225, 1050); ctx.lineTo(245, 1112); ctx.lineTo(80, 1195); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 9; i++) { const t = i / 8; const x = 70 + t * 160, y = 1162 - t * 135; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8, y + 16); ctx.lineTo(x + 14, y - 4); ctx.fill(); const x2 = 75 + t * 175, y2 = 1205 - t * 85; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 + 7, y2 - 15); ctx.lineTo(x2 + 13, y2 + 3); ctx.fill(); }
    ell(ctx, 120, 1110, 16, 11, '#3d6b3a'); ell(ctx, 120, 1106, 8, 7, '#f2e04a'); ell(ctx, 121, 1106, 2.5, 6, '#111');
    // rope
    ctx.strokeStyle = '#d9c7a0'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 880); ctx.quadraticCurveTo(W / 2, 905, W, 880); ctx.stroke();
    // legs in striped stockings
    for (const lx of [142, 178]) {
      for (let y = 640; y < 880; y += 20) { ctx.fillStyle = ((y - 640) / 20) % 2 ? '#1a1a22' : '#f1ece2'; ctx.fillRect(lx - 9, y, 18, 20); }
      ell(ctx, lx + 4, 888, 16, 8, '#c44a6a');
    }
    // bell skirt with ruffles
    ctx.fillStyle = '#e7a8b8'; ctx.beginPath(); ctx.moveTo(110, 430); ctx.quadraticCurveTo(60, 560, 50, 650); ctx.lineTo(270, 650); ctx.quadraticCurveTo(260, 560, 210, 430); ctx.fill();
    for (let x = 50; x < 270; x += 22) ell(ctx, x + 11, 650, 13, 9, '#f5d2dc');
    // body & arms
    shoulders(ctx, 160, 262, 150, 190, '#f0b9c6', { collar: '#fff6f8', puff: true });
    ctx.strokeStyle = '#f0c9a8'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(95, 300); ctx.lineTo(40, 360); ctx.lineTo(18, 330); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(225, 300); ctx.lineTo(236, 230); ctx.stroke();
    // parasol
    ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(238, 236); ctx.lineTo(214, 70); ctx.stroke();
    ctx.fillStyle = '#d9577f'; ctx.beginPath(); ctx.arc(214, 92, 92, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    for (let i = 0; i < 6; i++) { const a = Math.PI * (1.02 + i * 0.16); ell(ctx, 214 + Math.cos(a + 0.08) * 88, 92 + Math.sin(a + 0.08) * 10 + 4, 16, 9, '#f4b7c9'); }
    face(ctx, 160, 200, 46, { hair: '#9a3d1c', hairStyle: 'updo', mood: 'smile', blush: true, brow: '#6a2a14' });
    finish(ctx, W, H); out.push(tex(c, { repeat: false }));
  }
  { // B: the gentleman on the powder keg
    const [c, ctx] = P(W, H);
    paintBg(ctx, W, H, '#3a2a22', '#20140f');
    ctx.fillStyle = '#2a1a12'; ctx.fillRect(0, 1180, W, H - 1180);
    // fuse & spark
    ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(240, 1080); ctx.bezierCurveTo(300, 1140, 200, 1210, 110, 1240); ctx.stroke();
    const sg = ctx.createRadialGradient(108, 1240, 2, 108, 1240, 50); sg.addColorStop(0, '#fffbe0'); sg.addColorStop(0.3, 'rgba(255,190,60,0.8)'); sg.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(108, 1240, 50, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 2; for (let i = 0; i < 10; i++) { const a = rr(0, TAU); ctx.beginPath(); ctx.moveTo(108, 1240); ctx.lineTo(108 + Math.cos(a) * rr(16, 34), 1240 + Math.sin(a) * rr(16, 34)); ctx.stroke(); }
    // keg
    ctx.fillStyle = '#7a4a26'; ctx.beginPath(); ctx.moveTo(70, 760); ctx.quadraticCurveTo(46, 960, 70, 1170); ctx.lineTo(250, 1170); ctx.quadraticCurveTo(274, 960, 250, 760); ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,8,0.6)'; ctx.lineWidth = 3; for (let x = 90; x < 250; x += 26) { ctx.beginPath(); ctx.moveTo(x, 762); ctx.quadraticCurveTo(x + (x - 160) * 0.18, 965, x, 1168); ctx.stroke(); }
    ctx.fillStyle = '#3a3a40'; for (const y of [800, 1120]) ctx.fillRect(60, y, 200, 14);
    ctx.fillStyle = '#efe6cf'; ctx.font = 'bold 64px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('TNT', 160, 990);
    // long-john legs
    for (const lx of [118, 202]) { for (let x = -18; x < 18; x += 9) { ctx.fillStyle = ((x + 18) / 9) % 2 ? '#e8dcc6' : '#b2353a'; ctx.fillRect(lx + x, 600, 9, 190); } ell(ctx, lx, 800, 24, 12, '#1c1410'); }
    ctx.fillStyle = '#b2353a'; ctx.beginPath(); ctx.ellipse(160, 600, 110, 70, 0, 0, TAU); ctx.fill();
    for (let x = 60; x < 260; x += 16) { ctx.fillStyle = 'rgba(232,220,198,0.85)'; ctx.fillRect(x, 540, 7, 120); }
    // coat (only above the waist)
    shoulders(ctx, 160, 250, 230, 300, '#2c4a3a', { collar: '#f5efe2', tie: 'bow', lapel: '#22382c' });
    ctx.fillStyle = '#2c4a3a'; ctx.beginPath(); ctx.ellipse(160, 480, 120, 90, 0, Math.PI, TAU); ctx.fill();
    ell(ctx, 128, 470, 20, 16, '#f0c9a8'); ell(ctx, 192, 470, 20, 16, '#f0c9a8');
    face(ctx, 160, 180, 52, { bald: true, mustache: '#1c1410', handlebar: true, mood: 'prim', browTilt: 1, brow: '#1c1410' });
    finish(ctx, W, H); out.push(tex(c, { repeat: false }));
  }
  { // C: three gentlemen, one on top of another, sinking
    const [c, ctx] = P(W, H);
    paintBg(ctx, W, H, '#2e3a4a', '#2a1f18');
    // man 3 (bottom) torso & head, terrified
    shoulders(ctx, 160, 900, 200, 260, '#6a6a70', { collar: '#efe7d8', tie: '#2a2a33' });
    face(ctx, 160, 840, 44, { bald: true, mood: 'o', browTilt: -1.2, brow: '#2a1c14' });
    // quicksand
    const mg = ctx.createLinearGradient(0, 1000, 0, H); mg.addColorStop(0, '#6e5232'); mg.addColorStop(1, '#2e2010');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.moveTo(0, 1010); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 1000 + Math.sin(x * 0.07) * 8); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    for (let i = 0; i < 14; i++) { ctx.strokeStyle = 'rgba(200,170,120,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rr(10, W - 10), rr(1040, H - 20), rr(4, 12), Math.PI, TAU); ctx.stroke(); }
    // man 2 (middle), strained, with man 1's legs dangling on his chest
    shoulders(ctx, 160, 620, 200, 230, '#6b4a2a', { collar: '#efe7d8', tie: '#4a1a1a' });
    face(ctx, 160, 560, 44, { hair: '#3a2418', hairStyle: 'side', mustache: '#3a2418', mood: 'strain', browTilt: -0.8 });
    for (const s of [-1, 1]) { ctx.fillStyle = '#24324a'; ctx.beginPath(); ctx.moveTo(160 + s * 40, 470); ctx.lineTo(160 + s * 70, 470); ctx.lineTo(160 + s * 78, 700); ctx.lineTo(160 + s * 52, 700); ctx.fill(); ell(ctx, 160 + s * 68, 708, 22, 11, '#111'); }
    // man 1 (top), pleased
    shoulders(ctx, 160, 240, 200, 240, '#24324a', { collar: '#efe7d8', tie: '#a03030', lapel: '#1b2638' });
    face(ctx, 160, 178, 44, { mood: 'grin', mustache: '#5a3418', brow: '#5a3418' });
    hat(ctx, 160, 178, 44, 'bowler');
    finish(ctx, W, H); out.push(tex(c, { repeat: false }));
  }
  { // D: the widow, perched upon her late husband
    const [c, ctx] = P(W, H);
    paintBg(ctx, W, H, '#30283e', '#151218');
    ctx.fillStyle = '#1f2a22'; ctx.fillRect(0, 1250, W, H - 1250);
    // tombstone
    const tg = ctx.createLinearGradient(40, 0, 280, 0); tg.addColorStop(0, '#7b7686'); tg.addColorStop(1, '#4a4656');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(50, 1300); ctx.lineTo(50, 940); ctx.quadraticCurveTo(160, 860, 270, 940); ctx.lineTo(270, 1300); ctx.fill();
    ctx.fillStyle = '#2a2632'; ctx.font = '34px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('R.I.P.', 160, 1010); ctx.font = '30px Georgia, serif'; ctx.fillText('ALFRED', 160, 1060); ctx.font = 'italic 20px Georgia, serif'; ctx.fillText('beloved, mostly', 160, 1100);
    // marble bust of Alfred
    ctx.fillStyle = shade(ctx, 160, 800, 90, '#e8e4ec', '#9a96a6'); ctx.beginPath(); ctx.ellipse(160, 880, 95, 50, 0, Math.PI, TAU); ctx.fill();
    face(ctx, 160, 760, 52, { skin: '#e3dfe8', skinDark: '#9a96a6', bald: true, mustache: '#bdb8c6', handlebar: true, mood: 'frown', eyeWhite: '#fff', eyeColor: '#8a8696', browTilt: -1, brow: '#8a8696' });
    // the widow's black skirt draped over Alfred's head
    ctx.fillStyle = '#1a141c'; ctx.beginPath(); ctx.moveTo(90, 520); ctx.quadraticCurveTo(70, 650, 98, 712); ctx.quadraticCurveTo(160, 690, 222, 712); ctx.quadraticCurveTo(250, 650, 230, 520); ctx.fill();
    for (const s of [-1, 1]) { ctx.fillStyle = '#1a141c'; ctx.fillRect(160 + s * 34 - 8, 700, 16, 40); ell(ctx, 160 + s * 40, 744, 16, 8, '#0a0808'); }
    shoulders(ctx, 160, 250, 190, 280, '#1f1922', { collar: '#e8e0d6' });
    ell(ctx, 160, 300, 13, 16, '#d8b56a'); ell(ctx, 160, 300, 8, 11, '#efe1c6');
    ctx.strokeStyle = '#2f5a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(170, 440); ctx.lineTo(140, 330); ctx.stroke();
    ell(ctx, 138, 322, 15, 13, '#b0202e'); ell(ctx, 134, 318, 7, 6, '#d8404c');
    ell(ctx, 160, 420, 46, 18, '#f0c9a8');
    face(ctx, 160, 186, 46, { hair: '#e8e4ee', hairStyle: 'bun', glasses: true, mood: 'prim', skin: '#ecc8ae', brow: '#9a94a0' });
    finish(ctx, W, H); out.push(tex(c, { repeat: false }));
  }
  return out;
}

// ---------- the aging portrait ----------
export function agingPortrait() {
  const make = (old) => {
    const [c, ctx] = P(320, 400);
    paintBg(ctx, 320, 400, old ? '#2c3328' : '#4a3424', old ? '#141810' : '#20140c', old ? 'rgba(170,220,170,0.18)' : 'rgba(255,215,160,0.3)');
    shoulders(ctx, 160, 250, 250, 160, old ? '#1f2a33' : '#22304a', { collar: old ? '#9a958a' : '#f3ede2', tie: old ? '#3a1414' : '#7a1a24', lapel: old ? '#18212a' : '#1a253a' });
    if (!old) face(ctx, 160, 170, 60, { hair: '#4a2a16', hairStyle: 'side', mood: 'smile', brow: '#3a2010' });
    else {
      ctx.fillStyle = shade(ctx, 160, 170, 64, '#e9e6d8', '#8c8a78');
      ctx.beginPath(); ctx.ellipse(160, 160, 54, 62, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(160, 212, 34, 26, 0, 0, TAU); ctx.fill();
      for (const s of [-1, 1]) ell(ctx, 160 + s * 22, 160, 15, 18, '#120c08');
      for (const s of [-1, 1]) ell(ctx, 160 + s * 22, 162, 3, 3, '#7dffb0');
      ctx.fillStyle = '#120c08'; ctx.beginPath(); ctx.moveTo(160, 182); ctx.lineTo(152, 200); ctx.lineTo(168, 200); ctx.fill();
      ctx.fillStyle = '#f2efe2'; for (let i = -3; i <= 3; i++) ctx.fillRect(160 + i * 7 - 3, 214, 6, 12);
      ctx.strokeStyle = '#2a2418'; ctx.lineWidth = 1.5; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(160 + i * 7 - 3, 214); ctx.lineTo(160 + i * 7 - 3, 226); ctx.stroke(); }
      ctx.strokeStyle = '#d8d4c4'; ctx.lineWidth = 2; for (let i = 0; i < 12; i++) { const a = Math.PI * (1.05 + i * 0.075); ctx.beginPath(); ctx.moveTo(160 + Math.cos(a) * 52, 160 + Math.sin(a) * 60); ctx.quadraticCurveTo(160 + Math.cos(a) * 80, 150 + Math.sin(a) * 70, 160 + Math.cos(a) * 70 + rr(-12, 12), 190 + Math.sin(a) * 30); ctx.stroke(); }
    }
    finish(ctx, 320, 400);
    return tex(c, { repeat: false });
  };
  return [make(false), make(true)];
}

// ---------- lightning portraits: [calm, monstrous] pairs ----------
export function lightningPairs() {
  const pairs = [];
  const W = 300, H = 380;
  { // the lady / the gorgon
    const m = (mon) => {
      const [c, ctx] = P(W, H);
      paintBg(ctx, W, H, mon ? '#1b2a1a' : '#3a2a3c', mon ? '#0a120a' : '#1a1220', mon ? 'rgba(120,255,140,0.25)' : 'rgba(255,200,170,0.28)');
      shoulders(ctx, 150, 240, 230, 150, mon ? '#1f3a24' : '#2f5a3a', { collar: null });
      ell(ctx, 150, 250, 50, 14, mon ? '#8bb07c' : '#f0c9a8');
      if (mon) {
        ctx.lineCap = 'round';
        for (let i = 0; i < 11; i++) {
          const a = Math.PI * (0.95 + i * 0.11); let x = 150 + Math.cos(a) * 44, y = 160 + Math.sin(a) * 50;
          ctx.strokeStyle = i % 2 ? '#3f7a2a' : '#5a9a34'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x, y);
          const ex = 150 + Math.cos(a) * 110, ey = 160 + Math.sin(a) * 100;
          ctx.bezierCurveTo(x + rr(-40, 40), y - 40, ex + rr(-30, 30), ey + 30, ex, ey); ctx.stroke();
          ell(ctx, ex, ey, 9, 7, '#6ab040'); ell(ctx, ex + 2, ey - 2, 2, 2, '#ff3030');
        }
        face(ctx, 150, 168, 50, { skin: '#9ec48c', skinDark: '#4f7a46', eyeWhite: '#f6ff60', eyeColor: '#b01010', mood: 'grin', brow: '#1f3a1a', browTilt: -1 });
      } else face(ctx, 150, 168, 50, { hair: '#a8401c', hairStyle: 'long', hairBack: '#8a3214', mood: 'smile', blush: true, brow: '#6a2a14' });
      finish(ctx, W, H); return tex(c, { repeat: false });
    };
    pairs.push([m(false), m(true)]);
  }
  { // the ship / the ghost ship
    const m = (mon) => {
      const [c, ctx] = P(W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if (mon) { g.addColorStop(0, '#0e1a1a'); g.addColorStop(0.6, '#1c3a34'); g.addColorStop(1, '#081210'); }
      else { g.addColorStop(0, '#e9a868'); g.addColorStop(0.55, '#f2d29a'); g.addColorStop(1, '#2a4a6a'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (!mon) ell(ctx, 220, 120, 34, 34, '#fff3d0');
      else { ctx.strokeStyle = '#d9fff0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(60, 0); ctx.lineTo(80, 60); ctx.lineTo(62, 70); ctx.lineTo(90, 150); ctx.stroke(); }
      ctx.fillStyle = mon ? '#12302a' : '#2d5a7a'; ctx.beginPath(); ctx.moveTo(0, 250); for (let x = 0; x <= W; x += 15) ctx.lineTo(x, 250 + Math.sin(x * (mon ? 0.08 : 0.05)) * (mon ? 14 : 4)); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      ctx.fillStyle = mon ? '#0e1612' : '#3a2214'; ctx.beginPath(); ctx.moveTo(70, 238); ctx.lineTo(230, 238); ctx.lineTo(210, 268); ctx.lineTo(92, 268); ctx.fill();
      ctx.fillStyle = mon ? '#0e1612' : '#3a2214'; ctx.fillRect(146, 90, 6, 150); ctx.fillRect(196, 120, 5, 120); ctx.fillRect(100, 125, 5, 115);
      ctx.fillStyle = mon ? 'rgba(140,255,200,0.55)' : '#f6efe0';
      const sail = (x, y, w, h) => { ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x, y + h * 0.15, x + w / 2, y); ctx.lineTo(x + w / 2 + 4, y + h); ctx.quadraticCurveTo(x, y + h * 1.15, x - w / 2 - 4, y + h); ctx.fill(); if (mon) { ctx.fillStyle = '#0e1a1a'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + rr(-w / 3, w / 3), y + rr(h * 0.2, h * 0.9), rr(4, 9), 0, TAU); ctx.fill(); } ctx.fillStyle = 'rgba(140,255,200,0.55)'; } };
      sail(149, 100, 60, 56); sail(149, 165, 70, 60); sail(198, 130, 44, 46); sail(102, 135, 44, 46);
      finish(ctx, W, H, { warm: mon ? 0.12 : 0.3 }); return tex(c, { repeat: false });
    };
    pairs.push([m(false), m(true)]);
  }
  { // the knight / the bone knight
    const m = (mon) => {
      const [c, ctx] = P(W, H);
      paintBg(ctx, W, H, mon ? '#120e16' : '#5a7a8a', mon ? '#05040a' : '#3a5a32', mon ? 'rgba(160,140,255,0.2)' : 'rgba(255,240,200,0.3)');
      const body = mon ? '#efe9dc' : '#e8e4dc', dark = mon ? '#efe9dc' : '#8a8a90';
      ctx.strokeStyle = body; ctx.fillStyle = body; ctx.lineCap = 'round';
      if (!mon) {
        ell(ctx, 150, 250, 80, 36, '#f2eee6');
        ctx.lineWidth = 12; for (const x of [95, 125, 175, 205]) { ctx.strokeStyle = '#e0dbd0'; ctx.beginPath(); ctx.moveTo(x, 270); ctx.lineTo(x + rr(-6, 6), 330); ctx.stroke(); }
        ctx.fillStyle = '#f2eee6'; ctx.beginPath(); ctx.moveTo(210, 240); ctx.lineTo(250, 180); ctx.lineTo(268, 200); ctx.lineTo(236, 260); ctx.fill(); ell(ctx, 262, 188, 18, 12, '#f2eee6', -0.6);
        ctx.fillStyle = '#4a4e5a'; ctx.fillRect(130, 160, 40, 80); ell(ctx, 150, 150, 22, 24, '#6a6e7a');
        ctx.fillStyle = '#b02030'; ctx.beginPath(); ctx.moveTo(150, 130); ctx.lineTo(140, 100); ctx.lineTo(160, 104); ctx.fill();
        ctx.strokeStyle = '#c0c4cc'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(170, 190); ctx.lineTo(260, 110); ctx.stroke();
      } else {
        ctx.lineWidth = 5; ctx.strokeStyle = body;
        for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(150, 250, 30 + i * 2, Math.PI * (1.1 + i * 0.02), Math.PI * 1.9); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(80, 250); ctx.lineTo(220, 245); ctx.stroke();
        ctx.lineWidth = 6; for (const x of [95, 125, 175, 205]) { ctx.beginPath(); ctx.moveTo(x, 262); ctx.lineTo(x + 4, 300); ctx.lineTo(x - 2, 334); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(215, 245); ctx.lineTo(250, 185); ctx.stroke(); ell(ctx, 262, 188, 18, 11, body, -0.6); ell(ctx, 258, 186, 4, 4, '#a0f');
        ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(150, 170); ctx.lineTo(150, 240); ctx.stroke();
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(134, 180 + i * 12); ctx.quadraticCurveTo(150, 186 + i * 12, 166, 180 + i * 12); ctx.stroke(); }
        ell(ctx, 150, 150, 20, 22, body); ell(ctx, 143, 148, 5, 6, '#111'); ell(ctx, 157, 148, 5, 6, '#111');
        ctx.strokeStyle = '#9a9aa6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(170, 190); ctx.lineTo(260, 110); ctx.stroke();
      }
      finish(ctx, W, H, { warm: mon ? 0.1 : 0.28 }); return tex(c, { repeat: false });
    };
    pairs.push([m(false), m(true)]);
  }
  { // april / december
    const m = (mon) => {
      const [c, ctx] = P(W, H);
      paintBg(ctx, W, H, mon ? '#2a2a34' : '#5a6a3a', mon ? '#121218' : '#2a3a1a', mon ? 'rgba(200,210,255,0.18)' : 'rgba(255,240,190,0.3)');
      shoulders(ctx, 150, 245, 220, 150, mon ? '#3a3440' : '#c8a0c8', { collar: null });
      ell(ctx, 150, 252, 46, 12, mon ? '#bcae9e' : '#f2cdb0');
      face(ctx, 150, 168, 50, mon
        ? { skin: '#c9b9a6', skinDark: '#7a6a5a', hair: '#e8e4ee', hairStyle: 'wisps', mood: 'frown', brow: '#d8d4dc', browTilt: -0.6 }
        : { hair: '#e0b050', hairStyle: 'long', hairBack: '#c89a40', mood: 'smile', blush: true, brow: '#9a7030' });
      if (!mon) for (let i = 0; i < 7; i++) { const a = Math.PI * (1.1 + i * 0.13); ell(ctx, 150 + Math.cos(a) * 52, 160 + Math.sin(a) * 56, 9, 9, ['#f07090', '#f5f0f0', '#f0c040'][i % 3]); }
      else { ctx.strokeStyle = '#7a6a5a'; ctx.lineWidth = 1.5; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(110 + rr(0, 80), 150 + rr(0, 60)); ctx.lineTo(110 + rr(0, 80), 150 + rr(0, 60)); ctx.stroke(); } ell(ctx, 160, 186, 8, 12, '#a08a78'); }
      finish(ctx, W, H); return tex(c, { repeat: false });
    };
    pairs.push([m(false), m(true)]);
  }
  return pairs;
}

// ---------- assorted portraits for walls ----------
export function wallPortraits() {
  const W = 300, H = 380;
  const list = [];
  const mk = (fn) => { const [c, ctx] = P(W, H); fn(ctx); finish(ctx, W, H); list.push(tex(c, { repeat: false })); };
  mk((ctx) => { // the captain
    paintBg(ctx, W, H, '#2a3a4a', '#121a22');
    shoulders(ctx, 150, 250, 240, 140, '#1c2a44', { collar: '#efe7d8', lapel: '#15203a' });
    for (const y of [290, 320, 350]) for (const s of [-1, 1]) ell(ctx, 150 + s * 30, y, 5, 5, '#d4af5f');
    face(ctx, 150, 175, 52, { beard: '#d8d4cc', mustache: '#d8d4cc', mood: 'prim', brow: '#c8c4bc' });
    hat(ctx, 150, 175, 52, 'captain');
  });
  mk((ctx) => { // the lady with a fan
    paintBg(ctx, W, H, '#3a2a4a', '#1a1222');
    shoulders(ctx, 150, 245, 220, 150, '#2a4a8a', { collar: null, puff: true });
    ell(ctx, 150, 252, 48, 12, '#f2cdb0');
    face(ctx, 150, 168, 48, { hair: '#2a1a14', hairStyle: 'updo', mood: 'smile', blush: true });
    ctx.save(); ctx.translate(195, 300);
    for (let i = 0; i < 9; i++) { ctx.save(); ctx.rotate(-1.4 + i * 0.16); ctx.fillStyle = i % 2 ? '#e8a8c0' : '#f6dbe6'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -70); ctx.lineTo(8, -70); ctx.fill(); ctx.restore(); }
    ctx.restore();
  });
  mk((ctx) => { // a cat of great importance
    paintBg(ctx, W, H, '#4a3a2a', '#1e160e');
    shoulders(ctx, 150, 250, 230, 140, '#5a1a2a', { collar: null, ruff: true });
    ctx.fillStyle = '#6e6a72';
    ctx.beginPath(); ctx.moveTo(98, 140); ctx.lineTo(110, 80); ctx.lineTo(132, 120); ctx.fill();
    ctx.beginPath(); ctx.moveTo(202, 140); ctx.lineTo(190, 80); ctx.lineTo(168, 120); ctx.fill();
    ctx.fillStyle = shade(ctx, 150, 175, 60, '#8a8690', '#4a464e'); ctx.beginPath(); ctx.ellipse(150, 178, 62, 56, 0, 0, TAU); ctx.fill();
    for (const s of [-1, 1]) { ell(ctx, 150 + s * 24, 168, 14, 11, '#e8d040'); ell(ctx, 150 + s * 24, 168, 3, 9, '#111'); }
    ctx.fillStyle = '#d88a9a'; ctx.beginPath(); ctx.moveTo(144, 192); ctx.lineTo(156, 192); ctx.lineTo(150, 200); ctx.fill();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(150 + s * 14, 200 + i * 4); ctx.lineTo(150 + s * 60, 192 + i * 8); ctx.stroke(); }
  });
  mk((ctx) => { // the raven
    paintBg(ctx, W, H, '#3a3448', '#141018', 'rgba(220,210,255,0.2)');
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, 290); ctx.quadraticCurveTo(150, 270, 300, 300); ctx.stroke();
    ctx.fillStyle = '#0e0c12'; ctx.beginPath(); ctx.ellipse(150, 220, 54, 76, -0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(170, 136, 34, 32, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(196, 130); ctx.lineTo(244, 146); ctx.lineTo(198, 152); ctx.fill();
    ctx.beginPath(); ctx.moveTo(110, 270); ctx.lineTo(80, 340); ctx.lineTo(130, 290); ctx.fill();
    ell(ctx, 178, 130, 6, 6, '#e23a3a');
  });
  mk((ctx) => { // the twins
    paintBg(ctx, W, H, '#3a3a2e', '#18180f');
    for (const s of [-1, 1]) {
      shoulders(ctx, 150 + s * 62, 255, 120, 130, '#2a3a6a', { collar: '#f4efe6' });
      face(ctx, 150 + s * 62, 190, 40, { hair: '#e8cc80', hairStyle: 'side', mood: 'smile', look: -s, blush: true });
    }
  });
  return list;
}

// ---------- the duelists (each faces inward) ----------
export function duelists() {
  const make = (dir) => {
    const [c, ctx] = P(300, 400);
    paintBg(ctx, 300, 400, '#3e2e26', '#18110c');
    ctx.save(); if (dir < 0) { ctx.translate(300, 0); ctx.scale(-1, 1); }
    shoulders(ctx, 120, 250, 220, 160, dir > 0 ? '#3a1a22' : '#1a2a3a', { collar: '#efe7d8', lapel: '#111' });
    ctx.strokeStyle = dir > 0 ? '#3a1a22' : '#1a2a3a'; ctx.lineWidth = 26; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(170, 290); ctx.lineTo(250, 250); ctx.stroke();
    ell(ctx, 254, 248, 14, 12, '#f0c9a8');
    ctx.fillStyle = '#2a2420'; ctx.fillRect(254, 236, 40, 9); ctx.fillStyle = '#5a3a20'; ctx.fillRect(246, 240, 12, 24);
    face(ctx, 120, 175, 50, { hair: dir > 0 ? '#2a1a10' : '#6a4a2a', hairStyle: 'side', mustache: dir > 0 ? '#2a1a10' : '#6a4a2a', handlebar: dir < 0, mood: 'prim', look: 1.5, browTilt: -1 });
    hat(ctx, 120, 175, 50, 'top');
    ctx.restore();
    finish(ctx, 300, 400);
    return tex(c, { repeat: false });
  };
  return [make(1), make(-1)];
}

// ---------- wedding portraits (the bride's many grooms) ----------
export function weddingPortraits() {
  const grooms = [
    { hat: 'top', hair: '#2a1a10', mustache: '#2a1a10' },
    { hat: 'bowler', hair: '#6a4a2a', mustache: null },
    { hat: null, hair: '#1a1410', mustache: '#1a1410', handlebar: true },
    { hat: null, hair: null, bald: true, mustache: '#7a6a5a' },
  ];
  return grooms.map((g) => {
    const make = (headless) => {
      const [c, ctx] = P(300, 380);
      paintBg(ctx, 300, 380, '#3a3448', '#18141c', 'rgba(220,230,255,0.25)');
      // bride
      ctx.fillStyle = 'rgba(240,240,250,0.85)'; ctx.beginPath(); ctx.moveTo(90, 120); ctx.quadraticCurveTo(20, 260, 30, 380); ctx.lineTo(160, 380); ctx.quadraticCurveTo(150, 250, 90, 120); ctx.fill();
      shoulders(ctx, 92, 250, 130, 140, '#f4f2f8', { collar: null });
      face(ctx, 92, 180, 38, { hair: '#4a3020', hairStyle: 'bun', mood: 'smile', blush: true });
      // groom
      shoulders(ctx, 205, 248, 150, 140, '#15151c', { collar: '#f4efe6', tie: 'bow', lapel: '#0c0c10' });
      if (!headless) {
        face(ctx, 205, 176, 40, { hair: g.hair, hairStyle: 'side', bald: g.bald, mustache: g.mustache, handlebar: g.handlebar, mood: 'smile', look: -1 });
        if (g.hat) hat(ctx, 205, 176, 40, g.hat);
      }
      ell(ctx, 150, 330, 20, 14, '#e8e0e8'); ell(ctx, 146, 326, 8, 6, '#c0304a');
      finish(ctx, 300, 380);
      return tex(c, { repeat: false });
    };
    return [make(false), make(true)];
  });
}

// ---------- Madame's face for the crystal ball (transparent bg, luminous) ----------
export function crystalFaces() {
  const frames = [];
  for (let k = 0; k < 4; k++) {
    const [c, ctx] = P(256, 256);
    const cx = 128, cy = 132;
    const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 120);
    glow.addColorStop(0, 'rgba(160,255,220,0.55)'); glow.addColorStop(1, 'rgba(60,200,160,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(40,120,90,0.9)';
    ctx.beginPath(); ctx.ellipse(cx, cy - 24, 70, 62, 0, Math.PI, TAU); ctx.fill();
    ctx.fillRect(cx - 70, cy - 26, 18, 60); ctx.fillRect(cx + 52, cy - 26, 18, 60);
    const fg = ctx.createRadialGradient(cx - 10, cy - 14, 8, cx, cy, 70);
    fg.addColorStop(0, 'rgba(230,255,245,1)'); fg.addColorStop(1, 'rgba(110,220,180,0.95)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(cx, cy + 6, 50, 62, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(30,90,70,0.9)'; ctx.fillRect(cx - 62, cy - 42, 124, 14);
    ell(ctx, cx, cy - 35, 9, 10, 'rgba(200,255,240,1)');
    ctx.strokeStyle = 'rgba(20,70,55,0.95)'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(cx + s * 20, cy - 2, 11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 8, cy - 16); ctx.quadraticCurveTo(cx + s * 20, cy - 26, cx + s * 32, cy - 16); ctx.stroke();
    }
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx + 2, cy + 2); ctx.quadraticCurveTo(cx + 8, cy + 20, cx - 2, cy + 24); ctx.stroke();
    const open = [0.0, 0.35, 0.7, 1.0][k];
    ctx.fillStyle = 'rgba(20,60,45,0.95)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 40, 15, 3 + open * 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(30,110,85,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, cy + 40, 16, 4 + open * 9, 0, 0, TAU); ctx.stroke();
    frames.push(tex(c, { repeat: false, srgb: true }));
  }
  return frames;
}

// singing-bust faces: projected features (eyes + mouth frames), transparent background
export function bustFaces(kind = 0) {
  const frames = [];
  for (let k = 0; k < 4; k++) {
    const [c, ctx] = P(128, 128);
    ctx.fillStyle = 'rgba(232,240,255,0)'; ctx.fillRect(0, 0, 128, 128);
    const ey = 50;
    ctx.fillStyle = '#2a2f3a';
    for (const s of [-1, 1]) {
      ell(ctx, 64 + s * 20, ey, 9, 6.5, '#f6f8ff'); ell(ctx, 64 + s * 20, ey, 4, 5, '#1a2030');
      ctx.strokeStyle = '#3a4050'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(64 + s * 12, ey - 11 - (kind === 2 ? 3 : 0)); ctx.lineTo(64 + s * 30, ey - 13 + (kind === 1 ? 4 : 0)); ctx.stroke();
    }
    const open = [0.1, 0.45, 0.8, 1.0][k];
    ell(ctx, 64, 92, 11 + (kind === 3 ? 4 : 0), 2 + open * 12, '#2a1a22');
    if (open > 0.3) ell(ctx, 64, 92 + open * 6, 7, 3, '#a04050');
    if (kind === 1) { ctx.fillStyle = '#6a6e80'; ctx.beginPath(); ctx.moveTo(40, 78); ctx.quadraticCurveTo(64, 70, 88, 78); ctx.quadraticCurveTo(64, 84, 40, 78); ctx.fill(); }
    frames.push(tex(c, { repeat: false }));
  }
  return frames;
}
