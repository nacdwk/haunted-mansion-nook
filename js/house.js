// The mansion's architecture: plinth & basement, shell with dissolving facades, mansard attic,
// levitating roof, the stretching tower, and the bookshelf it all sits on.
import {
  THREE, W, box, boxA, cyl, mesh, group, bake, makeDissolver, quadPrism, sphere, TAU, DEG, onUpdate,
  smooth, lerp, clamp, addLight, hotspot, proxy, tween, easeInOut, makeGhost, rand, mat, glow, compact, toBin,
} from './core.js';
import { MAT, T, paintingMat, TX } from './materials.js';

export const D = {
  X0: -14, X1: 14, Z0: -5, Z1: 5, T: 0.4,
  F1: 0.8, F2: 7.4, AT: 14.0, TOP: 19.4,
  PA: -4.67, PB: 4.67,
  BX0: -21.6, BX1: 20.5, BZ0: 5.8, BZ1: 10.5, BY0: -5.5, BY1: -0.6,
  PX0: -24, PX1: 32, PZ0: -8, PZ1: 10.5, PY0: -6,
  TW: { x: -16.9, z: 2.0, R: 3.0 },
};

// ---------------------------------------------------------------- wall building
export function subtractRects(u0, u1, v0, v1, holes) {
  const us = new Set([u0, u1]), vs = new Set([v0, v1]);
  const hs = holes.filter((h) => !(h.u1 <= u0 || h.u0 >= u1 || h.v1 <= v0 || h.v0 >= v1));
  for (const h of hs) { us.add(clamp(h.u0, u0, u1)); us.add(clamp(h.u1, u0, u1)); vs.add(clamp(h.v0, v0, v1)); vs.add(clamp(h.v1, v0, v1)); }
  const U = [...us].sort((a, b) => a - b), V = [...vs].sort((a, b) => a - b);
  const rects = [];
  for (let j = 0; j < V.length - 1; j++) {
    let run = null;
    for (let i = 0; i < U.length - 1; i++) {
      if (U[i + 1] - U[i] < 1e-4 || V[j + 1] - V[j] < 1e-4) continue;
      const cu = (U[i] + U[i + 1]) / 2, cv = (V[j] + V[j + 1]) / 2;
      const inHole = hs.some((h) => cu > h.u0 && cu < h.u1 && cv > h.v0 && cv < h.v1);
      if (!inHole) { if (run) run.u1 = U[i + 1]; else run = { u0: U[i], u1: U[i + 1], v0: V[j], v1: V[j + 1] }; }
      else if (run) { rects.push(run); run = null; }
    }
    if (run) rects.push(run);
  }
  return rects;
}
// Wall in local coords: u along +x, v = y, outer face at z=0, thickness toward -z.
export function buildWall({ openings = [], outer = [], inner = [], t = 0.4, split = 0.16, trims = true }) {
  const g = new THREE.Group();
  for (const reg of outer) for (const r of subtractRects(reg.u0, reg.u1, reg.v0, reg.v1, openings)) boxA(r.u0, r.u1, r.v0, r.v1, -split, 0, reg.mat, g);
  for (const reg of inner) {
    if (reg.bare) { // just the wall core: something else (the baked Grand Hall) dresses this face
      for (const r of subtractRects(reg.u0, reg.u1, reg.v0, reg.v1, openings)) boxA(r.u0, r.u1, r.v0, r.v1, -t, -split, MAT.walnut, g);
      continue;
    }
    const wh = reg.wainscot || 0;
    const vSplit = reg.v0 + wh;
    if (wh > 0) {
      for (const r of subtractRects(reg.u0, reg.u1, reg.v0, vSplit, openings)) boxA(r.u0, r.u1, r.v0, r.v1, -t, -split, reg.wmat || MAT.wainscot, g);
      for (const r of subtractRects(reg.u0, reg.u1, vSplit, vSplit + 0.12, openings)) boxA(r.u0, r.u1, r.v0, r.v1, -t - 0.06, -t, MAT.walnut, g);
    }
    for (const r of subtractRects(reg.u0, reg.u1, vSplit, reg.v1, openings)) boxA(r.u0, r.u1, r.v0, r.v1, -t, -split, reg.mat, g);
    if (trims) {
      for (const r of subtractRects(reg.u0, reg.u1, reg.v0, reg.v0 + 0.32, openings)) boxA(r.u0, r.u1, r.v0, r.v1, -t - 0.05, -t, MAT.walnut, g);
      for (const r of subtractRects(reg.u0, reg.u1, reg.v1 - 0.26, reg.v1, openings)) boxA(r.u0, r.u1, r.v0, r.v1, -t - 0.12, -t, reg.crown || MAT.walnut, g);
    }
  }
  return g;
}
export function place(obj, x, y, z, ry = 0) { obj.position.set(x, y, z); obj.rotation.y = ry; return obj; }

// exterior window dressing + interior glass/curtains for one opening
function dressWindow(g, o, { curtain = MAT.curtainRed, glowMat = MAT.windowGlow, shutters = true, inside = true, trimInside = true, outside = true, t = 0.4 } = {}) {
  const w = o.u1 - o.u0, h = o.v1 - o.v0, cu = (o.u0 + o.u1) / 2, cv = (o.v0 + o.v1) / 2;
  if (outside) { // the baked exterior brings its own casings, heads, sills and shutters
    boxA(o.u0 - 0.16, o.u0, o.v0 - 0.08, o.v1 + 0.05, 0, 0.07, MAT.trim, g);
    boxA(o.u1, o.u1 + 0.16, o.v0 - 0.08, o.v1 + 0.05, 0, 0.07, MAT.trim, g);
    boxA(o.u0 - 0.3, o.u1 + 0.3, o.v1, o.v1 + 0.24, 0, 0.12, MAT.trim, g);
    boxA(o.u0 - 0.4, o.u1 + 0.4, o.v1 + 0.24, o.v1 + 0.34, 0, 0.22, MAT.trim, g);
    boxA(o.u0 - 0.22, o.u1 + 0.22, o.v0 - 0.16, o.v0, 0, 0.2, MAT.trim, g);
    if (shutters) {
      const sw = Math.min(0.8, w * 0.52);
      boxA(o.u0 - 0.16 - sw, o.u0 - 0.16, o.v0, o.v1, 0.02, 0.09, MAT.shutter, g);
      boxA(o.u1 + 0.16, o.u1 + 0.16 + sw, o.v0, o.v1, 0.02, 0.09, MAT.shutter, g);
      for (let v = o.v0 + 0.35; v < o.v1 - 0.2; v += 0.3) {
        boxA(o.u0 - 0.13 - sw, o.u0 - 0.19, v, v + 0.06, 0.09, 0.12, MAT.trimDark, g);
        boxA(o.u1 + 0.19, o.u1 + 0.13 + sw, v, v + 0.06, 0.09, 0.12, MAT.trimDark, g);
      }
    }
  }
  const glowPlane = mesh(new THREE.PlaneGeometry(w, h), glowMat, cu, cv, -0.12, g);
  glowPlane.castShadow = false;
  if (inside) {
    const ng = mesh(new THREE.PlaneGeometry(w, h), MAT.nightGlass, cu, cv, -0.3, g);
    ng.rotation.y = Math.PI;
    if (!trimInside) return glowPlane;
    boxA(o.u0 - 0.14, o.u0, o.v0 - 0.08, o.v1 + 0.08, -t - 0.08, -t, MAT.walnut, g);
    boxA(o.u1, o.u1 + 0.14, o.v0 - 0.08, o.v1 + 0.08, -t - 0.08, -t, MAT.walnut, g);
    boxA(o.u0 - 0.14, o.u1 + 0.14, o.v1, o.v1 + 0.14, -t - 0.08, -t, MAT.walnut, g);
    boxA(o.u0 - 0.2, o.u1 + 0.2, o.v0 - 0.14, o.v0, -t - 0.2, -t, MAT.walnut, g);
    if (curtain) {
      boxA(o.u0 - 0.55, o.u0 + 0.15, o.v0 - 0.4, o.v1 + 0.5, -t - 0.22, -t - 0.12, curtain, g);
      boxA(o.u1 - 0.15, o.u1 + 0.55, o.v0 - 0.4, o.v1 + 0.5, -t - 0.22, -t - 0.12, curtain, g);
      boxA(o.u0 - 0.7, o.u1 + 0.7, o.v1 + 0.5, o.v1 + 0.95, -t - 0.26, -t - 0.08, curtain, g);
      const rod = cyl(0.04, 0.04, w + 1.6, MAT.gold, cu, o.v1 + 0.55, -t - 0.3, g, 8);
      rod.rotation.z = Math.PI / 2;
    }
  }
  return glowPlane;
}

// ---------------------------------------------------------------- plinth / basement / shelf
export function buildBase(root) {
  const S = new THREE.Group();
  const { BX0, BX1, BZ0, BZ1, BY0, BY1, PX0, PX1, PZ0, PZ1, PY0 } = D;
  // grass top (with the cellar hole the ride descends through)
  const hole = { x0: 15.4, x1: 21.9, z0: 7.0, z1: 9.4 };
  const topRects = subtractRects(PX0, PX1, PZ0, PZ1, [{ u0: hole.x0, u1: hole.x1, v0: hole.z0, v1: hole.z1 }]);
  for (const r of topRects) {
    boxA(r.u0, r.u1, -0.14, 0, r.v0, r.v1, MAT.grass, S);
    boxA(r.u0, r.u1, BY1, -0.14, r.v0, r.v1, MAT.soil, S);
  }
  // earth masses (cross-section faces)
  boxA(PX0, PX1, PY0, BY1, PZ0, BZ0, MAT.soil, S);          // behind the corridor
  boxA(PX0, BX0, PY0, BY1, BZ0, PZ1, MAT.soil, S);          // left end
  boxA(BX1, PX1, PY0, BY1, BZ0, PZ1, MAT.soil, S);          // right end (under the graveyard)
  boxA(BX0, BX1, PY0, BY0, BZ0, PZ1, MAT.flags, S);         // corridor floor
  // corridor back wall (stone) with the tunnel arch & mirror niche
  const tunnel = { u0: -20.6, u1: -18.0, v0: BY0, v1: -2.4 };
  const mirrorN = { u0: 8.0, u1: 12.0, v0: -5.15, v1: -1.45 };
  for (const r of subtractRects(BX0, BX1, BY0, BY1, [tunnel, mirrorN])) boxA(r.u0, r.u1, r.v0, r.v1, BZ0 - 0.01, BZ0 + 0.22, MAT.stoneDark, S);
  // wainscot + damask on the corridor's back wall (between tunnel and the ramp)
  for (const r of subtractRects(-17.6, 13.0, -5.2, -1.2, [mirrorN])) boxA(r.u0, r.u1, r.v0, r.v1, BZ0 + 0.22, BZ0 + 0.3, MAT.papBase, S);
  for (const r of subtractRects(-17.6, 13.0, BY0, -4.1, [mirrorN])) boxA(r.u0, r.u1, r.v0, r.v1, BZ0 + 0.22, BZ0 + 0.36, MAT.wainscotDark, S);
  boxA(-17.6, 13.0, -4.12, -3.98, BZ0 + 0.22, BZ0 + 0.42, MAT.walnut, S);
  // tunnel throat (dark)
  boxA(tunnel.u0, tunnel.u1, BY0, tunnel.v1, BZ0 - 2.5, BZ0 - 0.4, MAT.void, S);
  for (let i = 0; i < 7; i++) { // arch voussoirs
    const a = Math.PI * (i / 6);
    const bx = (tunnel.u0 + tunnel.u1) / 2 + Math.cos(a) * 1.55, by = tunnel.v1 - 0.6 + Math.sin(a) * 1.0;
    const b = box(0.55, 0.4, 0.5, MAT.stone, bx, by, BZ0 + 0.3, S); b.rotation.z = a - Math.PI / 2;
  }
  // ceiling beams & joists
  for (let x = BX0 + 1.2; x < BX1; x += 2.6) boxA(x - 0.18, x + 0.18, BY1 - 0.38, BY1, BZ0, PZ1, MAT.walnut, S);
  boxA(BX0, BX1, BY1 - 0.06, BY1, BZ0, PZ1, MAT.woodDark, S);
  // the book-nook frame: walnut lips, posts, base tray with brass corners
  boxA(PX0 - 0.35, PX1 + 0.35, -0.28, 0.18, PZ1, PZ1 + 0.35, MAT.walnut, S);
  boxA(PX0 - 0.35, PX1 + 0.35, -0.28, 0.18, PZ0 - 0.35, PZ0, MAT.walnut, S);
  boxA(PX0 - 0.35, PX0, -0.28, 0.18, PZ0, PZ1, MAT.walnut, S);
  boxA(PX1, PX1 + 0.35, -0.28, 0.18, PZ0, PZ1, MAT.walnut, S);
  boxA(PX0 - 0.7, PX1 + 0.7, PY0 - 0.9, PY0, PZ0 - 0.7, PZ1 + 0.7, MAT.walnut, S);
  boxA(PX0 - 0.55, PX1 + 0.55, PY0, PY0 + 0.22, PZ0 - 0.55, PZ1 + 0.55, MAT.mahogany, S);
  boxA(PX0 - 0.72, PX1 + 0.72, PY0 - 0.5, PY0 - 0.42, PZ1 + 0.68, PZ1 + 0.74, MAT.brass, S);
  for (const x of [PX0 - 0.5, PX1 + 0.5]) for (const z of [PZ0 - 0.5, PZ1 + 0.5]) {
    boxA(x - 0.32, x + 0.32, PY0 - 0.95, -0.2, z - 0.32, z + 0.32, MAT.walnut, S);
    boxA(x - 0.38, x + 0.38, -0.25, 0.25, z - 0.38, z + 0.38, MAT.brass, S);
    boxA(x - 0.38, x + 0.38, PY0 - 1.0, PY0 - 0.6, z - 0.38, z + 0.38, MAT.brass, S);
  }
  // corridor proscenium: top beam with corbels + lace filigree
  boxA(BX0, BX1, BY1 - 0.55, BY1 + 0.25, PZ1 - 0.25, PZ1 + 0.18, MAT.walnut, S);
  for (let x = BX0 + 1.2; x < BX1; x += 2.6) boxA(x - 0.2, x + 0.2, BY1 - 1.1, BY1 - 0.5, PZ1 - 0.6, PZ1 + 0.1, MAT.walnut, S);
  const fil = mesh(new THREE.PlaneGeometry(BX1 - BX0, 0.55), MAT.filigree, (BX0 + BX1) / 2, BY1 - 0.78, PZ1 + 0.02, S);
  { const uv = fil.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (BX1 - BX0) / 2.2); }
  // engraved brass nameplate on the front of the tray
  const plateTex = TX.labelTex('THE HAUNTED MANSION', { w: 1024, h: 64, bg: '#b8945a', fg: '#3a2812', size: 46 });
  const plate = mesh(new THREE.PlaneGeometry(10.5, 0.62), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.35, metalness: 0.6, emissiveMap: plateTex, emissive: 0xffffff, emissiveIntensity: 0.18 }), 4, PY0 - 0.45, PZ1 + 0.712, S);
  boxA(-1.35, 9.35, PY0 - 0.8, PY0 - 0.1, PZ1 + 0.69, PZ1 + 0.705, MAT.brass, S);
  for (const sx of [-1.15, 9.15]) sphere(0.06, MAT.gold, sx, PY0 - 0.45, PZ1 + 0.72, S, 6, 4);
  boxA(BX0 - 0.25, BX0 + 0.25, PY0, 0, PZ1 - 0.4, PZ1 + 0.2, MAT.walnut, S);
  boxA(BX1 - 0.25, BX1 + 0.25, PY0, 0, PZ1 - 0.4, PZ1 + 0.2, MAT.walnut, S);
  // corridor right end wall & left end
  boxA(BX1 - 0.3, BX1, BY0, BY1, BZ0, PZ1, MAT.stoneDark, S);
  boxA(BX0, BX0 + 0.3, BY0, BY1, BZ0, PZ1, MAT.stoneDark, S);
  // carpet runner along the corridor
  boxA(BX0 + 0.4, 13.2, BY0, BY0 + 0.04, 6.9, 9.5, MAT.velvetRed, S);
  boxA(BX0 + 0.4, 13.2, BY0, BY0 + 0.05, 6.85, 6.95, MAT.gold, S);
  boxA(BX0 + 0.4, 13.2, BY0, BY0 + 0.05, 9.45, 9.55, MAT.gold, S);
  toBin(S);
  return { hole };
}

// The shelf, the giant books and the candle that sit around the nook
export function buildShelf(root) {
  const S = new THREE.Group();
  // shelf board
  boxA(-90, 100, -9.2, -6.9, -22, 18, MAT.woodWarm, S);
  boxA(-90, 100, -9.6, -6.6, 18, 18.8, MAT.walnut, S);
  // books on the left
  const books = [
    { x: -29.5, w: 4.2, h: 36, d: 28, c: '#4a1a24', t: 'GRIMOIRE', a: 'Vol. XIII', tilt: 0 },
    { x: -34.3, w: 5.0, h: 40, d: 29, c: '#1f3a32', t: 'HAPPY HAUNTS', a: 'A Field Guide', tilt: 0 },
    { x: -39.6, w: 4.4, h: 34, d: 27, c: '#2c2346', t: 'THE NOOK', a: 'Annotated', tilt: 0 },
    { x: -46.0, w: 5.6, h: 38, d: 28, c: '#5a3a1a', t: 'ECTOPLASM', a: 'Its Uses', tilt: 0.16 },
  ];
  const meshes = [];
  for (const b of books) {
    const g = new THREE.Group();
    const spineTex = TX.giantSpine(b.t, b.c, { author: b.a });
    const leather = new THREE.MeshStandardMaterial({ map: TX.leather(b.c), roughness: 0.7 });
    leather.map.repeat.set(3, 3);
    const spine = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.6 });
    // cover boards
    boxA(-b.w / 2, b.w / 2, 0, b.h, -b.d / 2, b.d / 2 - 0.6, leather, g);
    // page block, inset
    boxA(-b.w / 2 + 0.35, b.w / 2 - 0.35, 0.4, b.h - 0.4, -b.d / 2 - 0.05, b.d / 2 - 1.2, MAT.pages, g);
    const sp = mesh(new THREE.PlaneGeometry(b.w, b.h), spine, 0, b.h / 2, b.d / 2 - 0.58, g);
    g.position.set(b.x, -6.9, -2);
    if (b.tilt) { g.rotation.z = b.tilt; g.position.x += Math.sin(b.tilt) * b.h * 0.0; g.position.y += 0; }
    root.add(g);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    meshes.push(g);
  }
  // a stack of books on the right with a tall candle
  const stack = [
    { y: 0, w: 26, h: 4.2, d: 18, c: '#3a1a2a', r: 0.05 },
    { y: 4.2, w: 23, h: 3.4, d: 16, c: '#1a2a3a', r: -0.08 },
    { y: 7.6, w: 24, h: 3.0, d: 17, c: '#4a2a1a', r: 0.12 },
  ];
  const sg = new THREE.Group(); sg.position.set(50, -6.9, -2);
  for (const b of stack) {
    const leather = new THREE.MeshStandardMaterial({ map: TX.leather(b.c), roughness: 0.7 });
    const bg = new THREE.Group(); bg.position.y = b.y; bg.rotation.y = b.r;
    boxA(-b.w / 2, b.w / 2, 0, b.h, -b.d / 2, b.d / 2, leather, bg);
    boxA(-b.w / 2 + 0.6, b.w / 2 - 0.2, 0.3, b.h - 0.3, -b.d / 2 - 0.05, b.d / 2 + 0.05, MAT.pages, bg);
    boxA(-b.w / 2 - 0.02, -b.w / 2 + 0.6, 0.2, b.h - 0.2, -b.d / 2 + 0.3, b.d / 2 - 0.3, MAT.gold, bg);
    sg.add(bg);
  }
  root.add(sg);
  sg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // candle on the stack
  const cg = new THREE.Group(); cg.position.set(48, 3.7, -1); root.add(cg);
  const holder = cyl(3.2, 3.6, 0.8, MAT.brass, 0, 0.4, 0, cg, 24); holder.castShadow = true;
  const candle = cyl(1.5, 1.6, 12, MAT.wax, 0, 6.8, 0, cg, 20); candle.castShadow = true;
  for (let i = 0; i < 9; i++) { const a = rand(0, TAU); const drip = cyl(0.22, 0.28, rand(1.5, 5), MAT.wax, Math.cos(a) * 1.5, 12.5 - rand(1, 3), Math.sin(a) * 1.5, cg, 6); drip.castShadow = true; }
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), glow('#ffcf6a', 7));
  flame.userData.keep = true;
  flame.scale.set(1, 2.2, 1); flame.position.set(0, 14.2, 0); cg.add(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xffa040, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(16, 16, 1); halo.position.set(0, 14.4, 0); cg.add(halo);
  const light = new THREE.PointLight(0xffa24a, 900, 130, 1.4);
  light.position.set(48, 18.5, -1);
  addLight(light, { flicker: 0.12, speed: 5 });
  onUpdate((t) => { const f = 0.9 + 0.1 * Math.sin(t * 11) + 0.06 * Math.sin(t * 23.7); flame.scale.set(1, 2.2 * f, 1); flame.position.x = Math.sin(t * 3.1) * 0.1; halo.material.opacity = 0.45 + 0.1 * f; });
  toBin(S);
  return { books: meshes, candleLight: light };
}

// ---------------------------------------------------------------- the mansion shell
export function buildShell(root) {
  const { F1, F2, AT } = D;
  const facades = {};
  const bare = !!W.bakedHall; // the baked Grand Hall brings its own wall dressing
  const endless = !!W.bakedEndless; // and the baked Endless Hall its own, its floor, the arch and the corridor beyond
  const conserv = !!W.bakedConserv; // and the baked Conservatory its own, its floor and its side window's drapes
  const seance = !!W.bakedSeance; // and the baked Séance Circle its own, its floor and its windows' drapes
  const ext = !!W.bakedExterior; // and the baked exterior its own siding, trim, portico and doors (js/baked.js)
  const siding = (L) => (ext ? [] : [{ u0: 0, u1: L, v0: F1, v1: AT, mat: MAT.siding }]);
  const ROOM = { lib: [0, 9.33], foy: [9.33, 18.67], con: [18.67, 28] };

  // FRONT (+z) — origin (-14, 0, 5)
  {
    const G = new THREE.Group();
    const win = (x, v0, v1) => ({ u0: x + 14 - 0.78, u1: x + 14 + 0.78, v0, v1, kind: 'win' });
    const op = [];
    for (const x of [-11.5, -7.2, -2.6, 2.6, 7.2, 11.5]) { op.push(win(x, 2.0, 5.8)); op.push(win(x, 8.6, 12.4)); }
    op.push({ u0: 12.8, u1: 15.2, v0: F1, v1: 5.7, kind: 'door' });
    op.push({ u0: 13.0, u1: 15.0, v0: F2, v1: 12.4, kind: 'door2' });
    const w = buildWall({
      openings: op,
      outer: siding(28),
      inner: [
        { u0: 0, u1: 9.33, v0: F1, v1: 7.0, mat: MAT.papLibrary, wainscot: 2.0 },
        { u0: 9.33, u1: 18.67, v0: F1, v1: 7.0, mat: MAT.papEyes, wainscot: 2.0, wmat: MAT.wainscotDark },
        { u0: 18.67, u1: 28, v0: F1, v1: 7.0, mat: MAT.papConserv, wainscot: 1.6 },
        { u0: 0, u1: 18.67, v0: F2, v1: 13.6, mat: MAT.papBall, wainscot: 2.2, crown: MAT.gold },
        { u0: 18.67, u1: 28, v0: F2, v1: 13.6, mat: MAT.papSeance, wainscot: 1.8 },
      ],
    });
    G.add(w);
    const curt = (u) => (u < 9.33 ? MAT.curtainGreen : u < 18.67 ? MAT.curtainPurple : MAT.curtainGreen);
    const curt2 = (u) => (u < 18.67 ? MAT.curtainRose : MAT.curtainPurple);
    for (const o of op) {
      if (o.kind === 'win') {
        const upper = o.v0 > 7;
        dressWindow(G, o, { curtain: upper ? curt2(o.u0) : curt(o.u0), glowMat: (o.u0 > 20 && upper) ? MAT.windowFig : MAT.windowGlow, outside: !ext });
      }
    }
    if (!ext) exteriorTrim(G, 28);
    // front door: double doors + fanlight
    const door = { u0: 12.8, u1: 15.2, v0: F1, v1: 5.7 };
    if (!ext) {
      boxA(door.u0, 14, F1, 5.0, -0.32, -0.2, MAT.mahogany, G);
      boxA(14, door.u1, F1, 5.0, -0.32, -0.2, MAT.mahogany, G);
      for (const u of [13.4, 14.6]) for (const v of [1.6, 3.4]) boxA(u - 0.35, u + 0.35, v, v + 1.2, -0.2, -0.14, MAT.walnut, G);
    }
    mesh(new THREE.PlaneGeometry(2.4, 0.7), MAT.windowArch, 14, 5.35, -0.12, G);
    { const fi = mesh(new THREE.PlaneGeometry(2.4, 0.7), MAT.nightGlass, 14, 5.35, -0.3, G); fi.rotation.y = Math.PI; }
    if (!ext) {
      boxA(12.4, 15.6, 5.7, 6.2, 0, 0.3, MAT.trim, G);
      sphere(0.08, MAT.brass, 13.8, 2.9, -0.12, G); sphere(0.08, MAT.brass, 14.2, 2.9, -0.12, G);
    }
    // balcony door upstairs
    { const bd = mesh(new THREE.PlaneGeometry(2.0, 5.0), MAT.windowGlow, 14, F2 + 2.5, -0.12, G); }
    { const bi = mesh(new THREE.PlaneGeometry(2.0, 5.0), MAT.nightGlass, 14, F2 + 2.5, -0.3, G); bi.rotation.y = Math.PI; }
    boxA(12.9, 13.05, F2, 12.4, -0.42, -0.1, MAT.walnut, G); boxA(14.95, 15.1, F2, 12.4, -0.42, -0.1, MAT.walnut, G); boxA(13.95, 14.05, F2, 12.4, -0.34, -0.26, MAT.walnut, G);
    if (!ext) boxA(12.85, 15.15, 12.4, 12.7, 0, 0.12, MAT.trim, G);
    // portico (in world coords relative to the facade group: local x = worldX + 14, local z = worldZ - 5)
    const P = new THREE.Group(); P.position.set(14, 0, -5); G.add(P);
    if (!ext) { // (the baked exterior has its own columns, entablature and balcony floor; the iron work stays)
      for (const x of [-7.0, -4.3, -1.6, 1.6, 4.3, 7.0]) {
        boxA(x - 0.48, x + 0.48, F1, F1 + 0.36, 6.6, 7.56, MAT.trim, P);
        const col = cyl(0.33, 0.39, 12.6, MAT.trim, x, F1 + 0.36 + 6.3, 7.08, P, 18);
        boxA(x - 0.5, x + 0.5, 13.3, 13.55, 6.58, 7.58, MAT.trim, P);
        boxA(x - 0.42, x + 0.42, 13.05, 13.3, 6.66, 7.5, MAT.trim, P);
      }
      boxA(-7.7, 7.7, 13.55, 14.5, 5.0, 7.75, MAT.trim, P);
      boxA(-7.9, 7.9, 14.5, 14.75, 5.0, 7.95, MAT.trim, P);
      for (let x = -7.4; x <= 7.4; x += 0.9) boxA(x - 0.1, x + 0.1, 13.3, 13.55, 7.6, 7.8, MAT.trim, P);
      // second-floor balcony
      boxA(-7.6, 7.6, 7.15, 7.45, 5.0, 7.7, MAT.trim, P);
    }
    const rail = (len, x, y, z, ry) => { const m = mesh(new THREE.PlaneGeometry(len, 1.15), MAT.ironRail, x, y, z, P); m.rotation.y = ry; const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 2.4); return m; };
    rail(14.6, 0, 8.03, 7.62, 0); rail(2.6, -7.45, 8.03, 6.3, Math.PI / 2); rail(2.6, 7.45, 8.03, 6.3, Math.PI / 2);
    boxA(-7.6, 7.6, 8.6, 8.7, 7.55, 7.7, MAT.iron, P);
    // cresting on the portico roof
    const cr = mesh(new THREE.PlaneGeometry(15.4, 0.9), MAT.cresting, 0, 15.2, 7.8, P);
    { const uv = cr.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 15.4 / 2.2); }
    place(G, -14, 0, 5, 0);
    root.add(G);
    facades.front = G;
  }
  // BACK (-z) — origin (14, 0, -5), rotY PI: x = 14 - u
  {
    const G = new THREE.Group();
    const op = [
      { u0: 1.0, u1: 8.6, v0: 1.4, v1: 6.6, kind: 'glass' },
      { u0: 12.6, u1: 15.4, v0: F1, v1: 5.2, kind: 'arch' },
      { u0: 3.9, u1: 5.5, v0: 9.4, v1: 11.8, kind: 'win' },
    ];
    const w = buildWall({
      openings: op,
      outer: siding(28),
      inner: [
        { u0: 0, u1: 9.33, v0: F1, v1: 7.0, mat: MAT.papConserv, wainscot: 1.6, bare: conserv },
        { u0: 9.33, u1: 18.67, v0: F1, v1: 7.0, mat: MAT.papEyes, wainscot: 2.0, wmat: MAT.wainscotDark, bare: endless },
        { u0: 18.67, u1: 28, v0: F1, v1: 7.0, mat: MAT.papLibrary, wainscot: 2.0 },
        { u0: 0, u1: 9.33, v0: F2, v1: 13.6, mat: MAT.papSeance, wainscot: 1.8, bare: seance },
        { u0: 9.33, u1: 28, v0: F2, v1: 13.6, mat: MAT.papBall, wainscot: 2.2, crown: MAT.gold, bare },
      ],
    });
    G.add(w);
    if (!ext) exteriorTrim(G, 28);
    dressWindow(G, op[2], { curtain: MAT.curtainPurple, glowMat: MAT.windowCold, outside: !ext, trimInside: !seance });
    // conservatory glass wall: iron grid + panes
    const o = op[0];
    for (let u = o.u0; u <= o.u1 + 0.01; u += (o.u1 - o.u0) / 8) boxA(u - 0.05, u + 0.05, o.v0, o.v1, -0.3, -0.1, MAT.iron, G);
    for (const v of [o.v0, 3.4, 5.1, o.v1]) boxA(o.u0, o.u1, v - 0.05, v + 0.05, -0.3, -0.1, MAT.iron, G);
    const gp = mesh(new THREE.PlaneGeometry(o.u1 - o.u0, o.v1 - o.v0), MAT.glass, (o.u0 + o.u1) / 2, (o.v0 + o.v1) / 2, -0.2, G);
    gp.renderOrder = 2;
    // arch trim around the hallway opening (inside face)
    const a = op[1];
    if (!endless) for (let i = 0; i <= 8; i++) {
      const ang = Math.PI * i / 8;
      const b = box(0.4, 0.25, 0.2, MAT.gold, (a.u0 + a.u1) / 2 + Math.cos(ang) * 1.5, a.v1 - 0.9 + Math.sin(ang) * 0.95, -0.5, G);
      b.rotation.z = ang + Math.PI / 2;
    }
    place(G, 14, 0, -5, Math.PI);
    root.add(G);
    facades.back = G;
  }
  // LEFT (-x) — origin (-14, 0, -5), rotY -PI/2: z = -5 + u
  {
    const G = new THREE.Group();
    const op = [{ u0: 1.2, u1: 2.6, v0: 9.0, v1: 12.2, kind: 'win' }];
    const w = buildWall({
      openings: op,
      outer: siding(10),
      inner: [
        { u0: 0, u1: 10, v0: F1, v1: 7.0, mat: MAT.papLibrary, wainscot: 2.0 },
        { u0: 0, u1: 10, v0: F2, v1: 13.6, mat: MAT.papBall, wainscot: 2.2, crown: MAT.gold, bare },
      ],
    });
    G.add(w);
    if (!ext) exteriorTrim(G, 10);
    dressWindow(G, op[0], { curtain: MAT.curtainRose, glowMat: MAT.windowGlow, trimInside: !bare, outside: !ext });
    place(G, -14, 0, -5, -Math.PI / 2);
    root.add(G);
    facades.left = G;
  }
  // RIGHT (+x) — origin (14, 0, 5), rotY PI/2: z = 5 - u
  {
    const G = new THREE.Group();
    const op = [
      { u0: 0.3, u1: 2.6, v0: F1, v1: 4.4, kind: 'track' },
      { u0: 5.3, u1: 6.7, v0: 2.0, v1: 5.8, kind: 'win' },
      { u0: 7.25, u1: 9.65, v0: F2, v1: 11.0, kind: 'track' },
      { u0: 2.8, u1: 4.2, v0: 8.6, v1: 12.4, kind: 'win' },
    ];
    const w = buildWall({
      openings: op,
      outer: siding(10),
      inner: [
        { u0: 0, u1: 10, v0: F1, v1: 7.0, mat: MAT.papConserv, wainscot: 1.6, bare: conserv },
        { u0: 0, u1: 10, v0: F2, v1: 13.6, mat: MAT.papSeance, wainscot: 1.8, bare: seance },
      ],
    });
    G.add(w);
    if (!ext) exteriorTrim(G, 10);
    dressWindow(G, op[1], { curtain: MAT.curtainGreen, outside: !ext, trimInside: !conserv });
    dressWindow(G, op[3], { curtain: MAT.curtainPurple, glowMat: MAT.windowFig, outside: !ext, trimInside: !seance });
    if (!ext) for (const o of [op[0], op[2]]) { // archways for the ride
      boxA(o.u0 - 0.2, o.u0, o.v0, o.v1 + 0.2, 0, 0.14, MAT.trim, G);
      boxA(o.u1, o.u1 + 0.2, o.v0, o.v1 + 0.2, 0, 0.14, MAT.trim, G);
      boxA(o.u0 - 0.35, o.u1 + 0.35, o.v1, o.v1 + 0.35, 0, 0.2, MAT.trim, G);
    }
    place(G, 14, 0, 5, Math.PI / 2);
    root.add(G);
    facades.right = G;
  }
  // bake each facade into its own dissolve group
  const mk = (src, n, c, name) => { const dst = new THREE.Group(); dst.name = name; root.remove(src); bake(src, dst); root.add(dst); return makeDissolver(dst, n, c, { name }); };
  mk(facades.front, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 7, 5), 'front');
  mk(facades.back, new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 7, -5), 'back');
  mk(facades.left, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-14, 7, 0), 'left');
  mk(facades.right, new THREE.Vector3(1, 0, 0), new THREE.Vector3(14, 7, 0), 'right');

  // ---- static interior structure: foundation, floors, partitions, hallway annex
  const S = new THREE.Group();
  boxA(-14.15, 14.15, 0, 0.42, -5.15, 5.15, MAT.brick, S);
  // F1 floors
  const libHole = { u0: -13.6, u1: -10.9, v0: 2.0, v1: 4.6 };
  for (const r of subtractRects(-13.6, -4.67, -4.6, 4.6, [libHole])) boxA(r.u0, r.u1, 0.42, F1, r.v0, r.v1, MAT.wood, S);
  boxA(libHole.u0, libHole.u1, 0.05, 0.1, libHole.v0, libHole.v1, MAT.void, S);
  for (const [x, z] of [[-10.9, 2.0], [-10.9, 4.6], [-13.4, 2.0]]) { cyl(0.07, 0.07, 1.0, MAT.gold, x, F1 + 0.5, z, S, 8); sphere(0.11, MAT.gold, x, F1 + 1.02, z, S, 8, 6); }
  boxA(-13.4, -10.9, F1 + 0.95, F1 + 1.02, 1.97, 2.03, MAT.gold, S);
  boxA(-10.93, -10.87, F1 + 0.95, F1 + 1.02, 2.0, 4.6, MAT.gold, S);
  if (!endless) boxA(-4.67, 4.67, 0.42, F1, -4.6, 4.6, MAT.checker, S);
  if (!conserv) boxA(4.67, 13.6, 0.42, F1, -4.6, 4.6, MAT.checkerGreen, S);
  // F2 slab (ceiling of F1, floor of F2)
  boxA(-13.6, 13.6, 7.0, 7.32, -4.6, 4.6, MAT.plaster, S);
  boxA(-13.6, 4.67, 7.32, F2, -4.6, 4.6, MAT.parquet, S);
  if (!seance) boxA(4.67, 13.6, 7.32, F2, -4.6, 4.6, MAT.woodDark, S);
  // attic slab with the slot the ride climbs through
  const slot = { u0: -13.4, u1: -9.0, v0: -4.6, v1: -2.0 };
  for (const r of subtractRects(-13.6, 13.6, -4.6, 4.6, [slot])) {
    boxA(r.u0, r.u1, 13.6, 13.92, r.v0, r.v1, MAT.plaster, S);
    boxA(r.u0, r.u1, 13.92, AT, r.v0, r.v1, MAT.wood, S);
  }
  // sill plates over the wall tops inside the attic
  boxA(-14.05, 14.05, 13.98, 14.07, -5.06, -4.55, MAT.woodDark, S);
  boxA(-14.05, 14.05, 13.98, 14.07, 4.55, 5.06, MAT.woodDark, S);
  boxA(-14.06, -13.55, 13.98, 14.07, -5.0, 5.0, MAT.woodDark, S);
  boxA(13.55, 14.06, 13.98, 14.07, -5.0, 5.0, MAT.woodDark, S);
  // cut-edge trims on slabs (the dollhouse cross-section look)
  for (const [y0, y1] of [[0.42, F1], [7.0, F2], [13.6, AT]]) {
    boxA(-13.65, 13.65, y0, y1, 4.58, 4.7, MAT.walnut, S);
    boxA(13.58, 13.7, y0, y1, -4.6, 4.7, MAT.walnut, S);
  }
  // partitions (never dissolve)
  const part = (x, v0, v1, op, leftMat, rightMat, lw, rw, bareLeft = false, bareRight = false) => {
    const g = buildWall({
      openings: op, t: 0.4, split: 0.2,
      outer: [{ u0: 0, u1: 9.2, v0, v1, mat: bareRight ? MAT.walnut : rightMat }],
      inner: [{ u0: 0, u1: 9.2, v0, v1: v1 - 0.0, mat: leftMat, wainscot: lw, bare: bareLeft }],
      trims: true,
    });
    // add the right-side trims manually (buildWall trims only the inner side)
    if (!bareRight) for (const r of subtractRects(0, 9.2, v0, v0 + 0.32, op)) boxA(r.u0, r.u1, r.v0, r.v1, 0, 0.05, MAT.walnut, g);
    if (rw && !bareRight) {
      for (const r of subtractRects(0, 9.2, v0, v0 + rw.h, op)) boxA(r.u0, r.u1, r.v0, r.v1, 0, 0.03, rw.mat, g);
      for (const r of subtractRects(0, 9.2, v0 + rw.h, v0 + rw.h + 0.12, op)) boxA(r.u0, r.u1, r.v0, r.v1, 0, 0.07, MAT.walnut, g);
    }
    place(g, x + 0.2, 0, 4.6, Math.PI / 2);
    S.add(g);
    return g;
  };
  const doorF1 = [{ u0: -0.1, u1: 2.3, v0: F1, v1: 4.4 }];
  part(-4.67, F1, 7.0, doorF1, MAT.papLibrary, MAT.papEyes, 2.0, { h: 2.0, mat: MAT.wainscotDark }, false, endless);
  part(4.67, F1, 7.0, doorF1, MAT.papEyes, MAT.papConserv, 2.0, { h: 1.6, mat: MAT.wainscot }, endless, conserv);
  part(4.67, F2, 13.6, [{ u0: 6.9, u1: 9.3, v0: F2, v1: 11.0 }], MAT.papBall, MAT.papSeance, 2.2, { h: 1.8, mat: MAT.wainscot }, bare, seance);
  // door casings for the track openings in partitions
  for (const x of [-4.67, 4.67]) {
    boxA(x - 0.3, x + 0.3, 4.4, 4.75, 2.25, 4.6, MAT.walnut, S);
    boxA(x - 0.3, x + 0.3, F1, 4.4, 2.25, 2.45, MAT.walnut, S);
  }
  boxA(4.37, 4.97, 11.0, 11.35, -4.6, -2.15, MAT.gold, S);
  boxA(4.37, 4.97, F2, 11.0, -2.35, -2.15, MAT.gold, S);
  // endless hallway annex (forced perspective) behind the foyer
  if (!endless) buildEndlessHall(S);
  toBin(S);
  return {};
}
function exteriorTrim(G, L) {
  boxA(-0.05, 0.45, D.F1, D.AT, 0, 0.14, MAT.trim, G);
  boxA(L - 0.45, L + 0.05, D.F1, D.AT, 0, 0.14, MAT.trim, G);
  boxA(0, L, 7.08, 7.42, 0, 0.12, MAT.trim, G);
  boxA(-0.3, L + 0.3, 13.55, 14.05, 0, 0.36, MAT.trim, G);
  for (let u = 0.6; u < L - 0.3; u += 1.1) boxA(u - 0.11, u + 0.11, 13.12, 13.55, 0, 0.26, MAT.trim, G);
  boxA(-0.12, L + 0.12, 0, D.F1, -0.4, 0.08, MAT.brick, G);
}
function buildEndlessHall(S) {
  // tapering corridor from z=-5 (2.8w x 4.4h) to z=-7.9 (0.7w x 1.1h)
  const N = 9;
  const z0 = -5.2, z1 = -7.9;
  const wAt = (k) => lerp(2.8, 0.66, k), hAt = (k) => lerp(4.4, 1.05, k);
  for (let i = 0; i < N; i++) {
    const k0 = i / N, k1 = (i + 1) / N;
    const za = lerp(z0, z1, k0), zb = lerp(z0, z1, k1);
    const w = wAt((k0 + k1) / 2), h = hAt((k0 + k1) / 2);
    const y0 = D.F1;
    // floor, walls, ceiling slices
    boxA(-w / 2, w / 2, y0 - 0.1, y0, zb, za, MAT.velvetRed, S);
    // the Endless Hall's wallpaper, shrinking with the corridor so the pattern sells the perspective
    const ps = w / 2.8, base = MAT.papEyes.userData.uvScale;
    const wallUV = Array.isArray(base) ? [base[0] * ps, base[1] * ps] : base * ps;
    for (const x of [-w / 2 - 0.15, w / 2]) boxA(x, x + 0.15, y0, y0 + h, zb, za, MAT.papEyes, S).userData.uvScale = wallUV;
    boxA(-w / 2 - 0.15, w / 2 + 0.15, y0 + h, y0 + h + 0.15, zb, za, MAT.woodDark, S);
    // portal frame every slice
    const s = w / 2.8;
    boxA(-w / 2, -w / 2 + 0.18 * s, y0, y0 + h, za - 0.06, za, MAT.gold, S);
    boxA(w / 2 - 0.18 * s, w / 2, y0, y0 + h, za - 0.06, za, MAT.gold, S);
    boxA(-w / 2, w / 2, y0 + h - 0.22 * s, y0 + h, za - 0.06, za, MAT.gold, S);
    if (i % 2 === 0) for (const sx of [-1, 1]) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s + 0.02, 6, 5), MAT.flame);
      fl.position.set(sx * (w / 2 - 0.12), y0 + h * 0.62, (za + zb) / 2); S.add(fl);
    }
  }
  boxA(-0.4, 0.4, D.F1, D.F1 + 1.1, z1 - 0.06, z1, MAT.void, S);
  // thin stone skins so the annex reads from behind
  boxA(-1.85, -1.68, 0.0, 5.6, -8.05, -5.0, MAT.stoneDark, S);
  boxA(1.68, 1.85, 0.0, 5.6, -8.05, -5.0, MAT.stoneDark, S);
  boxA(-1.85, 1.85, 5.42, 5.6, -8.05, -5.0, MAT.stoneDark, S);
  boxA(-1.85, 1.85, 0.0, 5.6, -8.1, -7.98, MAT.stoneDark, S);
}

// ---------------------------------------------------------------- mansard attic (dissolving slopes)
export function buildMansard(root) {
  const y0 = D.AT, y1 = D.TOP;
  const ext = !!W.bakedExterior; // the baked exterior has the shingled slopes and the dormers (their panes stay)
  const B = 14.25, Bz = 5.25, Tx = 12.3, Tz = 3.3;
  const slopes = [];
  const mk = (name, quads, n, c, extras) => {
    const g = new THREE.Group();
    for (const q of quads) {
      if (!ext) g.add(new THREE.Mesh(quadPrism(q[0], q[1], q[2], q[3], 0.12), MAT.shingle));
      // inner skin (offset inward by 0.12)
      const A = new THREE.Vector3(...q[0]), Bv = new THREE.Vector3(...q[1]), Dv = new THREE.Vector3(...q[3]);
      const nn = new THREE.Vector3().subVectors(Bv, A).cross(new THREE.Vector3().subVectors(Dv, A)).normalize().multiplyScalar(-0.12);
      const qi = q.map((p) => new THREE.Vector3(...p).add(nn).toArray());
      g.add(new THREE.Mesh(quadPrism(qi[0], qi[1], qi[2], qi[3], 0.1), MAT.woodDark));
    }
    if (extras) extras(g);
    const dst = new THREE.Group(); dst.name = 'mansard-' + name;
    bake(g, dst); root.add(dst);
    slopes.push(makeDissolver(dst, n, c, { name: 'mansard-' + name }));
  };
  // front with three dormers
  mk('front', [[[-B, y0, Bz], [B, y0, Bz], [Tx, y1, Tz], [-Tx, y1, Tz]]], new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 16, 5), (g) => {
    for (const x of [-8, 0, 8]) dormer(g, x, 4.25, ext);
  });
  mk('back', [[[B, y0, -Bz], [-B, y0, -Bz], [-Tx, y1, -Tz], [Tx, y1, -Tz]]], new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 16, -5));
  mk('left', [[[-B, y0, -Bz], [-B, y0, Bz], [-Tx, y1, Tz], [-Tx, y1, -Tz]]], new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-14, 16, 0));
  // right slope with an opening for the ride (z in [1.0, 3.6], up to t=0.52)
  {
    const pt = (t, z) => [B - (B - Tx) * t, y0 + (y1 - y0) * t, z];
    const zA = 1.0, zB = 3.6, tO = 0.52, tH = (Bz - zB) / (Bz - Tz);
    mk('right', [
      [pt(0, Bz), pt(0, zB), pt(tH, zB), pt(tH, zB)].map((p, i) => (i === 3 ? pt(tH * 0.999, zB + 0.001) : p)),
      [pt(0, zA), pt(0, -Bz), pt(1, -Tz), pt(1, zA)],
      [pt(tO, zB), pt(tO, zA), pt(1, zA), pt(1, Tz)],
    ], new THREE.Vector3(1, 0, 0), new THREE.Vector3(14, 16, 0), (g) => {
      if (ext) return;
      const p0 = pt(tO, zA), p1 = pt(tO, zB);
      boxA(p0[0] - 0.2, p0[0] + 0.3, p0[1] - 0.15, p0[1] + 0.2, zA - 0.2, zB + 0.2, MAT.trim, g);
    });
  }
  // a fix for the degenerate front corner piece of the right slope: a small triangle cap
  return slopes;
}
function dormer(g, x, z, paneOnly = false) {
  const w = 2.3, y0 = 14.6, h = 2.5, d = 2.2;
  const gw = mesh(new THREE.PlaneGeometry(1.2, 1.7), MAT.windowArch, x, y0 + 1.15, z + 0.02, g);
  if (paneOnly) return;
  boxA(x - w / 2, x + w / 2, y0, y0 + h, z - d, z, MAT.siding, g);
  boxA(x - w / 2 - 0.12, x + w / 2 + 0.12, y0 - 0.1, y0 + 0.05, z - d, z + 0.12, MAT.trim, g);
  const op = { u0: x - 0.6, u1: x + 0.6, v0: y0 + 0.3, v1: y0 + 2.0 };
  boxA(op.u0 - 0.14, op.u0, op.v0, op.v1, z, z + 0.08, MAT.trim, g);
  boxA(op.u1, op.u1 + 0.14, op.v0, op.v1, z, z + 0.08, MAT.trim, g);
  boxA(op.u0 - 0.14, op.u1 + 0.14, op.v0 - 0.14, op.v0, z, z + 0.14, MAT.trim, g);
  // gable roof
  const ry = y0 + h;
  const r1 = quadPrism([x - w / 2 - 0.3, ry, z + 0.3], [x, ry + 1.2, z + 0.3], [x, ry + 1.2, z - d], [x - w / 2 - 0.3, ry, z - d], 0.12);
  const r2 = quadPrism([x, ry + 1.2, z + 0.3], [x + w / 2 + 0.3, ry, z + 0.3], [x + w / 2 + 0.3, ry, z - d], [x, ry + 1.2, z - d], 0.12);
  g.add(new THREE.Mesh(r1, MAT.shingleDark)); g.add(new THREE.Mesh(r2, MAT.shingleDark));
  const tri = new THREE.Shape(); tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, 1.15); tri.closePath();
  const pg = mesh(new THREE.ShapeGeometry(tri), MAT.trim, x, ry, z + 0.01, g);
  sphere(0.1, MAT.gold, x, ry + 1.35, z + 0.25, g, 8, 6);
}

// ---------------------------------------------------------------- the levitating roof
export function buildRoof(root) {
  const R = new THREE.Group(); R.name = 'roof'; R.userData.noCompact = true;
  const S = new THREE.Group();
  const y = D.TOP;
  const ext = !!W.bakedExterior; // the baked exterior has the deck, chimneys and cupola; the panes and cresting stay
  if (!ext) {
    boxA(-12.45, 12.45, y - 0.06, y + 0.32, -3.45, 3.45, MAT.shingleDark, S);
    boxA(-12.1, 12.1, y - 0.2, y - 0.06, -3.1, 3.1, MAT.woodDark, S);
    boxA(-12.6, 12.6, y + 0.32, y + 0.42, -3.6, 3.6, MAT.trimDark, S);
    boxA(-12.2, 12.2, y + 0.42, y + 0.5, -3.2, 3.2, mat('#2a2238', 0.8), S);
  }
  // cresting
  const crest = (len, x, z, ry) => { const m = mesh(new THREE.PlaneGeometry(len, 0.95), MAT.cresting, x, y + 0.95, z, S); m.rotation.y = ry; const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 2.0); };
  crest(25.0, 0, 3.55, 0); crest(25.0, 0, -3.55, 0); crest(7.1, 12.5, 0, Math.PI / 2); crest(7.1, -12.5, 0, Math.PI / 2);
  // chimneys
  if (!ext) for (const x of [-9.4, 9.4]) {
    boxA(x - 0.75, x + 0.75, y, y + 3.6, -2.4, -0.9, MAT.brick, S);
    boxA(x - 0.9, x + 0.9, y + 3.6, y + 3.9, -2.55, -0.75, MAT.stoneDark, S);
    for (const dx of [-0.35, 0.35]) cyl(0.18, 0.2, 0.7, MAT.brick, x + dx, y + 4.25, -1.65, S, 8);
  }
  // cupola
  const cy0 = y + 0.5;
  const oct = (r, h, m, yy, open = false) => { const c = cyl(r, r, h, m, 0, yy + h / 2, 0, S, 8, open); c.rotation.y = Math.PI / 8; return c; };
  if (!ext) {
    oct(2.25, 0.5, MAT.trim, cy0);
    oct(2.0, 2.6, MAT.siding, cy0 + 0.5);
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    const wpl = mesh(new THREE.PlaneGeometry(0.95, 1.7), MAT.windowArch, Math.sin(a) * 1.86, cy0 + 1.85, Math.cos(a) * 1.86, S);
    wpl.rotation.y = a;
    if (!ext) box(0.22, 2.6, 0.22, MAT.trim, Math.sin(a + Math.PI / 8) * 1.98, cy0 + 1.8, Math.cos(a + Math.PI / 8) * 1.98, S);
  }
  if (!ext) {
    oct(2.35, 0.35, MAT.trim, cy0 + 3.1);
    const dome = new THREE.LatheGeometry([[0, 2.0], [1.95, 0], [2.05, 0.15], [1.6, 0.7], [0.9, 1.3], [0.45, 1.8], [0.2, 2.25], [0.0, 2.4]].map(([r, h]) => new THREE.Vector2(r, h)), 8);
    const dm = mesh(dome, MAT.shingle, 0, cy0 + 3.45, 0, S); dm.rotation.y = Math.PI / 8;
    cyl(0.06, 0.06, 2.4, MAT.iron, 0, cy0 + 6.9, 0, S, 6);
    sphere(0.2, MAT.gold, 0, cy0 + 5.95, 0, S, 10, 8);
  }
  bake(S, R);
  // weathervane ship (turns with the wind)
  const vane = new THREE.Group(); vane.position.set(0, cy0 + 7.4, 0); R.add(vane);
  const hull = new THREE.Shape(); hull.moveTo(-0.9, 0); hull.lineTo(0.9, 0); hull.lineTo(0.7, -0.35); hull.lineTo(-0.6, -0.35); hull.closePath();
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 0.06, bevelEnabled: false }); hg.translate(0, 0, -0.03);
  mesh(hg, MAT.iron, 0, 0, 0, vane);
  for (const [x, h, w] of [[-0.35, 1.1, 0.7], [0.3, 1.3, 0.8]]) {
    box(0.04, h, 0.04, MAT.iron, x, h / 2, 0, vane);
    const sail = new THREE.Shape(); sail.moveTo(0, 0.15); sail.quadraticCurveTo(w * 0.6, h * 0.5, 0, h - 0.1); sail.closePath();
    const sg = mesh(new THREE.ShapeGeometry(sail), mat('#17131d', 0.5, 0.5, { side: THREE.DoubleSide }), x + 0.02, 0, 0, vane);
  }
  box(0.9, 0.04, 0.04, MAT.iron, 0, -0.5, 0, vane);
  compact(vane);
  onUpdate((t) => { vane.rotation.y = Math.sin(t * 0.13) * 1.2 + Math.sin(t * 0.71) * 0.15; });
  // porter ghosts who hold the roof aloft
  const porters = [];
  for (const [x, z] of [[-10.5, 2.4], [10.5, 2.4], [-10.5, -2.4], [10.5, -2.4]]) {
    const gh = makeGhost({ height: 3.2, width: 0.62, arms: 'up', color: 0xa8ffe6, opacity: 0 });
    gh.position.set(x, y - 3.4, z);
    gh.rotation.y = Math.atan2(-x, 6) * 0.3;
    R.add(gh); porters.push(gh);
  }
  root.add(R);
  const state = { lift: 0 };
  onUpdate((t, dt) => {
    const target = (W.state.open && W.state.mode !== 'ride') ? 1 : 0;
    state.lift += Math.sign(target - state.lift) * Math.min(Math.abs(target - state.lift), dt * 0.45);
    const k = easeInOut(state.lift);
    const ny = k * 6.2 + Math.sin(t * 0.9) * 0.18 * k;
    if (Math.abs(ny - R.position.y) > 0.002 && (state.lift > 0 && state.lift < 1)) W.shadowDirty = Math.max(W.shadowDirty, 1);
    R.position.y = ny;
    R.rotation.z = Math.sin(t * 0.6) * 0.012 * k;
    R.rotation.x = Math.sin(t * 0.47) * 0.01 * k;
    for (const p of porters) { p.material.uniforms.uOpacity.value = k * 0.85; p.visible = k > 0.01; p.scale.y = 0.6 + 0.4 * k; }
  });
  return { roof: R, state };
}

// ---------------------------------------------------------------- the stretching tower
export function buildTower(root) {
  const { x: cx, z: cz, R } = D.TW;
  const TG = new THREE.Group(); TG.position.set(cx, 0, cz); TG.name = 'tower'; TG.userData.noCompact = true; root.add(TG);
  const apo = R * Math.cos(Math.PI / 8);
  const side = 2 * R * Math.sin(Math.PI / 8) + 0.08;
  const th = 0.32;
  // the baked exterior (blender/exterior.py) brings the tower's stonework; its windows and the room inside stay here
  const BK = !!W.bakedExterior;
  // foundation
  const S = new THREE.Group();
  if (!BK) { const f = cyl(R + 0.25, R + 0.35, D.F1, MAT.stoneWarm, 0, D.F1 / 2, 0, S, 8); f.rotation.y = Math.PI / 8; }
  const fl = cyl(R - 0.1, R - 0.1, 0.05, MAT.woodDark, 0, D.F1 + 0.02, 0, S, 8); fl.rotation.y = Math.PI / 8;
  bake(S, TG);
  // rug in the stretching room
  const rugM = new THREE.MeshStandardMaterial({ map: T.rugRed, roughness: 0.95 });
  const rug = mesh(new THREE.CircleGeometry(2.0, 24), rugM, 0, D.F1 + 0.06, 0, TG); rug.rotation.x = -Math.PI / 2; rug.receiveShadow = true;
  // the stretchable octagon room: 8 facets, each its own dissolver
  const facets = [];
  const portraits = [];
  const H0 = 6.6;
  const Hp0 = 2.5, topY0 = 6.2, maxS = 4.4;   // portrait height at rest, its top, and how far the room stretches
  const stretchPortraitIdx = { 3: 0, 4: 1, 5: 2, 6: 3 }; // facets 135,180,225,270 degrees
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const fg = new THREE.Group();
    fg.rotation.y = a; // local +z is the outward normal
    const stretchG = new THREE.Group(); stretchG.position.y = D.F1; fg.add(stretchG);
    const SS = new THREE.Group();
    if (i !== 2) { // facet 2 (normal +x) is buried against the house
      if (!BK) boxA(-side / 2, side / 2, 0, H0, apo - 0.14, apo, MAT.stoneWarm, SS);
      boxA(-side / 2 + 0.05, side / 2 - 0.05, 0, H0, apo - th, apo - 0.14, MAT.papTower, SS);
      boxA(-side / 2 + 0.05, side / 2 - 0.05, 0, 1.6, apo - th - 0.04, apo - th + 0.01, MAT.wainscotDark, SS);
      boxA(-side / 2 + 0.05, side / 2 - 0.05, 1.6, 1.72, apo - th - 0.08, apo - th, MAT.gold, SS);
      boxA(-side / 2 + 0.05, side / 2 - 0.05, H0 - 0.3, H0, apo - th - 0.12, apo - th, MAT.gold, SS);
      // pilaster at the corner
      if (!BK) boxA(side / 2 - 0.2, side / 2 + 0.05, 0, H0, apo - 0.02, apo + 0.12, MAT.stoneDark, SS);
    }
    bake(SS, stretchG);
    // stretching portrait
    if (stretchPortraitIdx[i] !== undefined) {
      const tx = T.stretch[stretchPortraitIdx[i]].clone();
      tx.needsUpdate = true;
      const pm = paintingMat(tx, { ei: T.stretchGlow ?? 0.22 });   // the painted versions are dark and need the extra glow
      // as wide as the painting's proportions ask at full stretch, up to what fits between the octagon's corners
      const pw = Math.min(1.76, tx.image.width / tx.image.height * (Hp0 + maxS));
      const pg = new THREE.PlaneGeometry(pw, 1); pg.translate(0, -0.5, 0);
      const pmesh = new THREE.Mesh(pg, pm);
      pmesh.position.set(0, 0, apo - th - 0.05); pmesh.rotation.y = Math.PI; // faces inward
      fg.add(pmesh);
      const frameM = MAT.gold;
      const fL = box(0.1, 1, 0.1, frameM, -pw / 2 - 0.05, 0, apo - th - 0.06, fg);
      const fR = box(0.1, 1, 0.1, frameM, pw / 2 + 0.05, 0, apo - th - 0.06, fg);
      const fT = box(pw + 0.2, 0.16, 0.12, frameM, 0, 0, apo - th - 0.06, fg);
      const fB = box(pw + 0.2, 0.16, 0.12, frameM, 0, 0, apo - th - 0.06, fg);
      portraits.push({ mesh: pmesh, tex: tx, fL, fR, fT, fB });
    }
    TG.add(fg);
    const center = new THREE.Vector3(cx + Math.sin(a) * apo, 4, cz + Math.cos(a) * apo);
    const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    if (i !== 2) facets.push({ fg, stretchG, d: makeDissolver(fg, n, center, { name: 'tower' + i, threshold: 0.12 }) });
    else facets.push({ fg, stretchG, d: null });
  }
  // upper tower (moves up when stretching)
  const UP = new THREE.Group(); TG.add(UP);
  const U = new THREE.Group();
  const y0 = D.F2;
  const ceil = cyl(R - 0.15, R - 0.15, 0.3, MAT.woodDark, 0, y0 + 0.0, 0, U, 8); ceil.rotation.y = Math.PI / 8;
  const trap = cyl(0.7, 0.7, 0.05, MAT.void, 0, y0 - 0.17, 0, U, 16);
  if (!BK) {
    const body = cyl(R, R, 13.1, MAT.stoneWarm, 0, y0 + 0.15 + 6.55, 0, U, 8); body.rotation.y = Math.PI / 8;
    for (const yy of [y0 + 0.15, y0 + 6.6, y0 + 13.1]) { const band = cyl(R + 0.18, R + 0.18, 0.4, MAT.stoneDark, 0, yy, 0, U, 8); band.rotation.y = Math.PI / 8; }
  }
  for (let i = 0; i < 8; i++) {
    if (i === 2) continue;
    const a = i * Math.PI / 4;
    const wm = mesh(new THREE.PlaneGeometry(0.7, 2.0), MAT.windowArch, Math.sin(a) * (apo + 0.02), y0 + 3.4, Math.cos(a) * (apo + 0.02), U); wm.rotation.y = a;
    if (!BK) boxA(-0.5, 0.5, 0, 0.12, 0, 0.2, MAT.stoneDark, (() => { const gg = new THREE.Group(); gg.position.set(Math.sin(a) * apo, y0 + 2.3, Math.cos(a) * apo); gg.rotation.y = a; U.add(gg); return gg; })());
    if (i % 2 === 0) { const rw = mesh(new THREE.CircleGeometry(0.42, 16), MAT.windowGlow, Math.sin(a) * (apo + 0.02), y0 + 9.3, Math.cos(a) * (apo + 0.02), U); rw.rotation.y = a; }
  }
  // balcony ring
  if (!BK) { const ring = cyl(R + 0.9, R + 0.9, 0.25, MAT.stoneDark, 0, y0 + 6.7, 0, U, 8); ring.rotation.y = Math.PI / 8; }
  if (!BK) for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + Math.PI / 8;
    const rr2 = (R + 0.85) * Math.cos(Math.PI / 8);
    const len = 2 * (R + 0.85) * Math.sin(Math.PI / 8);
    const rp = mesh(new THREE.PlaneGeometry(len, 0.9), MAT.ironRail, Math.sin(a - Math.PI / 8 + Math.PI / 8) * rr2, y0 + 7.27, Math.cos(a) * rr2, U);
    rp.position.set(Math.sin(a) * rr2, y0 + 7.27, Math.cos(a) * rr2); rp.rotation.y = a;
    const uv = rp.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * len / 2.0);
  }
  // spire
  const sp0 = y0 + 13.3;
  if (!BK) {
    const eave = cyl(R + 0.55, R + 0.3, 0.35, MAT.trim, 0, sp0, 0, U, 8); eave.rotation.y = Math.PI / 8;
    const spire = new THREE.LatheGeometry([[R + 0.55, 0], [R * 0.82, 1.4], [R * 0.45, 4.2], [0.2, 7.6], [0.0, 8.2]].map(([r, h]) => new THREE.Vector2(r, h)), 8);
    const spm = mesh(spire, MAT.shingle, 0, sp0 + 0.15, 0, U); spm.rotation.y = Math.PI / 8;
    cyl(0.05, 0.05, 2.0, MAT.iron, 0, sp0 + 9.1, 0, U, 6);
    sphere(0.18, MAT.gold, 0, sp0 + 8.5, 0, U, 10, 8);
  }
  // tiny dormer windows on the spire
  for (const a of [Math.PI / 4, -Math.PI / 4 * 3]) {
    const dg = new THREE.Group(); dg.position.set(Math.sin(a) * 2.25, sp0 + 2.0, Math.cos(a) * 2.25); dg.rotation.y = a; U.add(dg);
    if (!BK) boxA(-0.45, 0.45, 0, 1.1, -0.5, 0.15, MAT.stoneWarm, dg);
    mesh(new THREE.PlaneGeometry(0.45, 0.7), MAT.windowGlow, 0, 0.5, BK ? 0.165 : 0.16, dg);
    if (!BK) { const r1 = new THREE.ConeGeometry(0.7, 0.8, 4, 1); const rc = mesh(r1, MAT.shingleDark, 0, 1.45, -0.1, dg); rc.rotation.y = Math.PI / 4; }
  }
  bake(U, UP);
  // chandelier in the stretching room (hangs from the moving ceiling)
  const ch = new THREE.Group(); ch.position.set(0, y0 - 0.15, 0); UP.add(ch);
  cyl(0.02, 0.02, 1.2, MAT.iron, 0, -0.6, 0, ch, 6);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 16), MAT.gold); ring2.rotation.x = Math.PI / 2; ring2.position.y = -1.2; ch.add(ring2);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; cyl(0.04, 0.04, 0.2, MAT.wax, Math.cos(a) * 0.55, -1.08, Math.sin(a) * 0.55, ch, 6); const fl2 = sphere(0.05, MAT.flame, Math.cos(a) * 0.55, -0.92, Math.sin(a) * 0.55, ch, 6, 5); fl2.scale.y = 1.8; }
  compact(ch);
  const tl = new THREE.PointLight(0xffa860, 26, 9, 1.6); tl.position.set(0, 4.8, 0); TG.add(tl);
  addLight(tl, { room: 'tower', flicker: 0.15, parent: TG });
  // gears down in the shaft (visible from the basement)
  const gears = [];
  const gearM = MAT.brass;
  for (const [gx, gy, gr] of [[-19.3, -3.3, 0.9], [-18.0, -2.4, 0.55], [-19.9, -1.7, 0.45]]) {
    const gg = new THREE.Group(); gg.position.set(gx, gy, 6.2);
    const disc = cyl(gr, gr, 0.15, gearM, 0, 0, 0, gg, 18); disc.rotation.x = Math.PI / 2;
    const teeth = Math.round(gr * 14);
    for (let k = 0; k < teeth; k++) { const a = k / teeth * TAU; const tt = box(0.18, 0.2, 0.15, gearM, Math.cos(a) * (gr + 0.08), Math.sin(a) * (gr + 0.08), 0, gg); tt.rotation.z = a; }
    cyl(0.12, 0.12, 0.3, MAT.iron, 0, 0, 0, gg, 8).rotation.x = Math.PI / 2;
    root.add(gg); compact(gg); gg.userData.noCompact = true; gears.push({ g: gg, r: gr });
  }
  // chains hanging in the shaft
  for (const x of [-18.6, -17.4]) { const ch2 = cyl(0.04, 0.04, 4.6, MAT.iron, x, -3.0, 6.3, root, 5); }

  // stretch state
  const st = { s: 0, target: 0, busy: false };
  onUpdate((t, dt) => {
    const s0 = st.s;
    st.s += Math.sign(st.target - st.s) * Math.min(Math.abs(st.target - st.s), dt * (st.target > st.s ? 0.22 : 0.4));
    if (st.s !== s0) W.shadowDirty = Math.max(W.shadowDirty, 1);
    const k = easeInOut(clamp(st.s));
    const S2 = k * maxS;
    UP.position.y = S2;
    for (const f of facets) f.stretchG.scale.y = (H0 + S2) / H0;
    for (const p of portraits) {
      const top = D.F1 + topY0 + S2, H = Hp0 + S2;
      p.mesh.position.y = top; p.mesh.scale.y = H;
      const full = Hp0 + maxS;
      p.tex.repeat.set(1, H / full); p.tex.offset.set(0, 1 - H / full);
      p.fL.position.y = top - H / 2; p.fL.scale.y = H + 0.16; p.fR.position.y = top - H / 2; p.fR.scale.y = H + 0.16;
      p.fT.position.y = top + 0.04; p.fB.position.y = top - H - 0.04;
    }
    for (const g of gears) g.g.rotation.z += (st.target > st.s ? 1 : -1) * dt * (Math.abs(st.target - st.s) > 0.001 ? 2.0 : 0) / g.r;
  });
  return { group: TG, upper: UP, st, facets, portraits, maxS };
}
