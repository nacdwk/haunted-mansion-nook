// Reusable miniature props.
import { THREE, W, box, boxA, cyl, mesh, sphere, group, TAU, rand, onUpdate, mat, glow, pick } from './core.js';
import { MAT, T, paintingMat } from './materials.js';

// ---- flames (one updater flickers them all)
const FLAMES = [];
// each flame is an invisible anchor; all flames of a colour draw as one instanced mesh
export function flame(parent, x, y, z, s = 1, m = MAT.flame) {
  const f = new THREE.Object3D();
  f.position.set(x, y, z);
  f.scale.set(s, s, s);
  f.userData.seed = Math.random() * 100;
  f.userData.keep = true;
  f.userData.flameMat = m;
  parent.add(f);
  FLAMES.push(f);
  return f;
}
const FLAME_GEO = (() => { const g = new THREE.SphereGeometry(0.05, 7, 6); g.scale(1, 2.1, 1); g.translate(0, 0.07, 0); return g; })();
export function initFlames(scene) {
  const byMat = new Map();
  for (const f of FLAMES) { const m = f.userData.flameMat; if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(f); }
  const sets = [];
  for (const [m, list] of byMat) {
    const im = new THREE.InstancedMesh(FLAME_GEO, m, list.length);
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im);
    sets.push({ im, list });
  }
  const m4 = new THREE.Matrix4(), sm = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  onUpdate((t) => {
    for (const s of sets) {
      for (let i = 0; i < s.list.length; i++) {
        const f = s.list[i];
        let vis = f.visible && !!f.parent, p = f.parent;
        while (vis && p) { if (!p.visible) vis = false; p = p.parent; }
        if (!vis) { s.im.setMatrixAt(i, zero); continue; }
        f.updateWorldMatrix(true, false);
        const k = f.userData.seed;
        const a = 0.85 + 0.15 * Math.sin(t * 13 + k) + 0.08 * Math.sin(t * 29.3 + k * 2);
        sm.makeScale(0.95 + 0.05 * Math.sin(t * 7 + k), a, 1);
        m4.multiplyMatrices(f.matrixWorld, sm);
        s.im.setMatrixAt(i, m4);
      }
      s.im.instanceMatrix.needsUpdate = true;
    }
  });
}

export function candle(parent, x, y, z, { h = 0.34, r = 0.055, m = MAT.flame, s = 1 } = {}) {
  cyl(r * s, r * s * 1.1, h * s, MAT.wax, x, y + h * s / 2, z, parent, 8);
  return flame(parent, x, y + h * s + 0.01, z, s, m);
}
export function candelabra(parent, x, y, z, { arms = 3, s = 1, m = MAT.flame, metal = MAT.gold, anim = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); if (anim) g.userData.keepGroup = true; parent.add(g);
  cyl(0.16, 0.2, 0.06, metal, 0, 0.03, 0, g, 10);
  cyl(0.035, 0.05, 0.8, metal, 0, 0.43, 0, g, 8);
  const flames = [];
  if (arms === 1) { flames.push(candle(g, 0, 0.83, 0, { m })); return { g, flames }; }
  const bar = cyl(0.025, 0.025, 0.7, metal, 0, 0.72, 0, g, 6); bar.rotation.z = Math.PI / 2;
  const xs = arms === 3 ? [-0.35, 0, 0.35] : [-0.35, -0.12, 0.12, 0.35, 0];
  for (const ax of xs.slice(0, arms)) {
    const yy = ax === 0 ? 0.86 : 0.74;
    cyl(0.06, 0.04, 0.05, metal, ax, yy, 0, g, 8);
    flames.push(candle(g, ax, yy + 0.02, 0, { m, h: 0.26 }));
  }
  return { g, flames };
}
export function chandelier(parent, x, y, z, { r = 0.9, candles = 8, chain = 1.0, m = MAT.flame, metal = MAT.gold, crystals = true, anim = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); if (anim) g.userData.keepGroup = true; parent.add(g);
  cyl(0.02, 0.02, chain, MAT.iron, 0, -chain / 2, 0, g, 5);
  const hub = sphere(0.16, metal, 0, -chain - 0.1, 0, g, 10, 8);
  cyl(0.05, 0.12, 0.5, metal, 0, -chain - 0.4, 0, g, 8);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 24), metal); ring.rotation.x = Math.PI / 2; ring.position.y = -chain - 0.45; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, 0.03, 6, 18), metal); ring2.rotation.x = Math.PI / 2; ring2.position.y = -chain - 0.15; g.add(ring2);
  const flames = [];
  for (let i = 0; i < candles; i++) {
    const a = i / candles * TAU;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    cyl(0.05, 0.035, 0.05, metal, cx, -chain - 0.42, cz, g, 6);
    flames.push(candle(g, cx, -chain - 0.4, cz, { h: 0.22, r: 0.04, m }));
    const arm = cyl(0.015, 0.015, r * 0.55, metal, Math.cos(a) * r * 0.75, -chain - 0.3, Math.sin(a) * r * 0.75, g, 4);
    arm.rotation.z = Math.PI / 2; arm.rotation.y = -a;
    if (crystals) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), glow('#cfe8ff', 0.6)); c.position.set(Math.cos(a + 0.4) * r, -chain - 0.62, Math.sin(a + 0.4) * r); c.scale.y = 1.8; g.add(c); }
  }
  return { g, flames };
}
export function chair(parent, x, y, z, ry = 0, { seat = MAT.velvet, wood = MAT.mahogany, s = 1, back = 1.15, anim = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s); if (anim) g.userData.keepGroup = true; parent.add(g);
  for (const [lx, lz] of [[-0.24, -0.22], [0.24, -0.22], [-0.24, 0.22], [0.24, 0.22]]) cyl(0.03, 0.025, 0.5, wood, lx, 0.25, lz, g, 5);
  boxA(-0.29, 0.29, 0.48, 0.58, -0.27, 0.27, seat, g);
  boxA(-0.27, 0.27, 0.58, 0.58 + back, -0.29, -0.21, wood, g);
  boxA(-0.21, 0.21, 0.68, 0.48 + back, -0.215, -0.19, seat, g);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 12, 1, false, -Math.PI / 2, Math.PI), wood);
  top.rotation.x = Math.PI / 2; top.rotation.z = Math.PI / 2; top.scale.set(1, 1, 0.5); top.position.set(0, 0.58 + back, -0.25); g.add(top);
  return g;
}
export function wingback(parent, x, y, z, ry = 0, { fabric = MAT.velvetRed, s = 1 } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s); parent.add(g);
  boxA(-0.5, 0.5, 0.15, 0.55, -0.45, 0.45, fabric, g);
  boxA(-0.5, 0.5, 0.55, 1.75, -0.48, -0.3, fabric, g);
  for (const sx of [-1, 1]) { boxA(sx * 0.5 - 0.12, sx * 0.5 + 0.12, 0.55, 1.0, -0.45, 0.4, fabric, g); boxA(sx * 0.5 - 0.1, sx * 0.5 + 0.1, 1.0, 1.55, -0.45, -0.1, fabric, g); }
  for (const [lx, lz] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]]) cyl(0.04, 0.03, 0.15, MAT.walnut, lx, 0.075, lz, g, 5);
  return g;
}
export function table(parent, x, y, z, w, d, { h = 0.95, wood = MAT.mahogany, cloth = null, legs = true } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  boxA(-w / 2, w / 2, h - 0.08, h, -d / 2, d / 2, cloth || wood, g);
  if (cloth) { boxA(-w / 2 - 0.02, w / 2 + 0.02, h - 0.38, h - 0.06, -d / 2 - 0.02, -d / 2 + 0.02, cloth, g); boxA(-w / 2 - 0.02, w / 2 + 0.02, h - 0.38, h - 0.06, d / 2 - 0.02, d / 2 + 0.02, cloth, g); boxA(-w / 2 - 0.02, -w / 2 + 0.02, h - 0.38, h - 0.06, -d / 2, d / 2, cloth, g); boxA(w / 2 - 0.02, w / 2 + 0.02, h - 0.38, h - 0.06, -d / 2, d / 2, cloth, g); }
  if (legs) for (const [lx, lz] of [[-w / 2 + 0.12, -d / 2 + 0.12], [w / 2 - 0.12, -d / 2 + 0.12], [-w / 2 + 0.12, d / 2 - 0.12], [w / 2 - 0.12, d / 2 - 0.12]]) cyl(0.05, 0.035, h - 0.08, wood, lx, (h - 0.08) / 2, lz, g, 6);
  return g;
}
export function roundTable(parent, x, y, z, r, { h = 0.95, cloth = MAT.velvet, hem = 0.9, anim = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); if (anim) g.userData.keepGroup = true; parent.add(g);
  cyl(r, r, 0.08, cloth, 0, h, 0, g, 24);
  const prof = []; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(r + t * 0.12, h - t * h * hem)); }
  const sk = new THREE.LatheGeometry(prof, 36);
  const p = sk.attributes.position;
  for (let i = 0; i < p.count; i++) { const yy = p.getY(i); if (yy < h - 0.05) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.06 * Math.sin(a * 9) * ((h - yy) / h); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
  sk.computeVertexNormals();
  mesh(sk, cloth, 0, 0, 0, g).material = cloth;
  return g;
}
export function framed(parent, map, w, h, { frame = MAT.gold, depth = 0.08, ei = 0.2, border = 0.14, oval = false } = {}) {
  const g = new THREE.Group(); parent.add(g);
  const pm = paintingMat(map, { ei });
  if (oval) {
    const sh = new THREE.Shape(); sh.absellipse(0, 0, w / 2, h / 2, 0, TAU);
    const geo = new THREE.ShapeGeometry(sh, 32);
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
    mesh(geo, pm, 0, 0, depth * 0.6, g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, border * 0.5, 6, 40), frame); ring.scale.set(w / 2 + border * 0.3, h / 2 + border * 0.3, 1); ring.position.z = depth * 0.6; g.add(ring);
  } else {
    mesh(new THREE.PlaneGeometry(w, h), pm, 0, 0, depth * 0.55, g);
    boxA(-w / 2 - border, w / 2 + border, h / 2, h / 2 + border, 0, depth, frame, g);
    boxA(-w / 2 - border, w / 2 + border, -h / 2 - border, -h / 2, 0, depth, frame, g);
    boxA(-w / 2 - border, -w / 2, -h / 2, h / 2, 0, depth, frame, g);
    boxA(w / 2, w / 2 + border, -h / 2, h / 2, 0, depth, frame, g);
    boxA(-w / 2 - border * 0.3, w / 2 + border * 0.3, h / 2 + border, h / 2 + border * 1.6, depth * 0.3, depth * 0.9, frame, g);
  }
  g.userData.paint = pm;
  return g;
}
const BOOK_COLS = ['#5a1a22', '#1f3a2a', '#2a2346', '#6a4a1a', '#3a1a3a', '#1a2a4a', '#4a3020', '#5e5a3a', '#2a1a14', '#7a2a2a', '#20302a', '#3e2a52'];
export function bookshelf(parent, x0, x1, y0, y1, z, { depth = 0.55, shelves = 6, facing = 1, wood = MAT.walnut, fill = 0.92 } = {}) {
  const S = new THREE.Group(); parent.add(S);
  const zb = z, zf = z + facing * depth;
  const z0 = Math.min(zb, zf), z1 = Math.max(zb, zf);
  boxA(x0, x1, y0, y1, facing > 0 ? z0 : z1 - 0.05, facing > 0 ? z0 + 0.05 : z1, wood, S);
  boxA(x0 - 0.08, x0 + 0.06, y0, y1 + 0.1, z0, z1, wood, S);
  boxA(x1 - 0.06, x1 + 0.08, y0, y1 + 0.1, z0, z1, wood, S);
  boxA(x0 - 0.18, x1 + 0.18, y1, y1 + 0.18, z0 - 0.04, z1 + 0.08, wood, S);
  const sh = (y1 - y0) / shelves;
  const books = [];
  for (let i = 0; i <= shelves; i++) {
    const yy = y0 + i * sh;
    boxA(x0, x1, yy, yy + 0.06, z0, z1 + 0.03, wood, S);
    if (i === shelves) break;
    let x = x0 + 0.08;
    while (x < x1 - 0.12) {
      const bw = rand(0.07, 0.15), bh = sh * rand(0.62, 0.88), bd = depth * rand(0.75, 0.92);
      if (rand() > fill) { x += bw * 2; continue; }
      const lean = rand() < 0.06 ? rand(-0.25, 0.25) : 0;
      books.push({ x: x + bw / 2, y: yy + 0.06 + bh / 2, w: bw, h: bh, d: bd, lean, c: pick(BOOK_COLS) });
      x += bw + 0.005;
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  // spine faces outward: put spine texture on the +z (or -z) face only via a material array
  const spine = new THREE.MeshStandardMaterial({ map: T.book, roughness: 0.7 });
  const plain = new THREE.MeshStandardMaterial({ color: 0xcfc4ae, roughness: 0.9 });
  const mats = facing > 0 ? [plain, plain, plain, plain, spine, plain] : [plain, plain, plain, plain, plain, spine];
  const im = new THREE.InstancedMesh(geo, mats, books.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const zc = (z0 + z1) / 2 + facing * 0.02;
  books.forEach((b, i) => {
    e.set(0, 0, b.lean); q.setFromEuler(e);
    m4.compose(v.set(b.x, b.y - (b.lean ? 0.03 : 0), zc + facing * (depth - b.d) / 2), q, sc.set(b.w, b.h, b.d));
    im.setMatrixAt(i, m4);
    im.setColorAt(i, new THREE.Color(b.c));
  });
  im.castShadow = true; im.receiveShadow = true;
  parent.add(im);
  return { S, im, books };
}
export function pedestal(parent, x, y, z, h = 1.1, m = MAT.marble) {
  boxA(x - 0.3, x + 0.3, y, y + 0.12, z - 0.3, z + 0.3, m, parent);
  cyl(0.18, 0.22, h - 0.24, m, x, y + 0.12 + (h - 0.24) / 2, z, parent, 10);
  boxA(x - 0.28, x + 0.28, y + h - 0.12, y + h, z - 0.28, z + 0.28, m, parent);
}
// marble bust; returns the head group so it can turn
export function bust(parent, x, y, z, { s = 1, m = MAT.marble, ry = 0, faceMap = null, hat = null } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s); parent.add(g);
  const sh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, TAU, 0, Math.PI / 2), m); sh.scale.set(1, 0.6, 0.62); g.add(sh);
  boxA(-0.36, 0.36, -0.06, 0.02, -0.2, 0.2, m, g);
  cyl(0.11, 0.13, 0.26, m, 0, 0.32, 0, g, 10);
  const head = new THREE.Group(); head.position.y = 0.6; head.userData.keepGroup = true; g.add(head);
  const hd = sphere(0.24, m, 0, 0, 0, head, 16, 12); hd.scale.set(0.9, 1.08, 0.98);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 6), m); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.02, 0.24); head.add(nose);
  if (faceMap) {
    const fm = new THREE.MeshStandardMaterial({ map: faceMap, transparent: true, roughness: 0.6, emissiveMap: faceMap, emissive: 0xffffff, emissiveIntensity: 0.35, depthWrite: false });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.248, 16, 12, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.22, Math.PI * 0.62), fm);
    cap.scale.set(0.9, 1.08, 0.98); cap.rotation.y = 0; head.add(cap);
    head.userData.face = fm;
  } else {
    for (const sx of [-1, 1]) { const e = sphere(0.035, mat('#cfcad6', 0.5), sx * 0.08, 0.04, 0.2, head, 6, 5); }
  }
  if (hat === 'laurel') { const l = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 5, 16), m); l.rotation.x = Math.PI / 2; l.position.y = 0.12; head.add(l); }
  if (hat === 'top') { cyl(0.26, 0.26, 0.02, MAT.black, 0, 0.2, 0, head, 12); cyl(0.15, 0.16, 0.26, MAT.black, 0, 0.34, 0, head, 12); }
  if (hat === 'bowler') { cyl(0.25, 0.25, 0.02, MAT.black, 0, 0.2, 0, head, 12); const d = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, TAU, 0, Math.PI / 2), MAT.black); d.position.y = 0.2; head.add(d); }
  if (hat === 'curls') for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; sphere(0.07, m, Math.cos(a) * 0.2, 0.14, Math.sin(a) * 0.2 - 0.02, head, 6, 5); }
  return { g, head };
}
export function pot(parent, x, y, z, { s = 1, dead = true, tall = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.42, 10), mat('#8a4a32', 0.85)); p.position.y = 0.21; g.add(p);
  cyl(0.3, 0.3, 0.07, mat('#7a3f2a', 0.85), 0, 0.42, 0, g, 10);
  cyl(0.25, 0.25, 0.02, mat('#2a1a12', 1), 0, 0.42, 0, g, 10);
  const leafM = dead ? MAT.deadLeaf : MAT.leaf;
  const stems = tall ? 3 : 5;
  for (let i = 0; i < stems; i++) {
    const a = i / stems * TAU + rand(-0.3, 0.3);
    const h = tall ? rand(1.4, 2.2) : rand(0.45, 0.9);
    const st = cyl(0.015, 0.02, h, MAT.bark, Math.cos(a) * 0.08, 0.42 + h / 2, Math.sin(a) * 0.08, g, 4);
    st.rotation.z = Math.cos(a) * 0.25; st.rotation.x = -Math.sin(a) * 0.25;
    const tx = Math.cos(a) * (0.08 + h * 0.25), tz = Math.sin(a) * (0.08 + h * 0.25), ty = 0.42 + h * 0.97;
    const nl = tall ? 5 : 3;
    for (let k = 0; k < nl; k++) {
      const lf = new THREE.Mesh(new THREE.ConeGeometry(0.07, tall ? 0.7 : 0.35, 4), leafM);
      lf.position.set(tx, ty - k * 0.05, tz);
      lf.rotation.set(rand(1.6, 2.6), a + k * 1.3, rand(-0.4, 0.4));
      g.add(lf);
    }
  }
  return g;
}
export function rugPlane(parent, x, y, z, w, d, map, ry = 0) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  const r = mesh(new THREE.PlaneGeometry(w, d), m, x, y + 0.012, z, parent);
  r.rotation.x = -Math.PI / 2; r.rotation.z = ry;
  r.receiveShadow = true;
  return r;
}
export function fireplace(parent, x, y, z, ry, { w = 2.5, h = 2.3, d = 0.6, stone = MAT.marble } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.userData.keepGroup = true; parent.add(g);
  boxA(-w / 2, -w / 2 + 0.42, 0, h, 0, d, stone, g);
  boxA(w / 2 - 0.42, w / 2, 0, h, 0, d, stone, g);
  boxA(-w / 2, w / 2, h - 0.5, h, 0, d, stone, g);
  boxA(-w / 2 - 0.2, w / 2 + 0.2, h, h + 0.14, -0.05, d + 0.16, stone, g);
  boxA(-w / 2 + 0.42, w / 2 - 0.42, 0, h - 0.5, 0, 0.08, MAT.void, g);
  boxA(-w / 2 - 0.1, w / 2 + 0.1, -0.01, 0.06, 0, d + 0.4, MAT.stoneDark, g);
  // logs + fire
  for (const [lx, ry2] of [[-0.25, 0.2], [0.2, -0.3]]) { const l = cyl(0.09, 0.09, 0.9, MAT.bark, lx * 0.6, 0.15, 0.3, g, 6); l.rotation.z = Math.PI / 2; l.rotation.y = ry2; }
  const fires = [];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.13 + rand(0, 0.08), 0.5 + rand(0, 0.3), 6), glow(i % 2 ? '#ff7a1a' : '#ffc04a', 4));
    f.position.set(-0.4 + i * 0.2, 0.42, 0.3); f.userData.keep = true; g.add(f); fires.push(f);
  }
  const s = Math.random() * 10;
  onUpdate((t) => { fires.forEach((f, i) => { f.scale.y = 0.75 + 0.35 * Math.abs(Math.sin(t * (6 + i) + s + i)); f.position.y = 0.2 + f.scale.y * 0.25; }); });
  return g;
}
// coffin outline (top view) as an extruded hexagon; returns { g, lid (pivot group) }
export function coffin(parent, { len = 2.2, w = 0.75, h = 0.5, wood = MAT.mahogany, lining = MAT.tufted } = {}) {
  const g = new THREE.Group(); parent.add(g);
  const sh = new THREE.Shape();
  sh.moveTo(-len / 2, -w * 0.32); sh.lineTo(-len * 0.22, -w / 2); sh.lineTo(len / 2, -w * 0.36); sh.lineTo(len / 2, w * 0.36); sh.lineTo(-len * 0.22, w / 2); sh.lineTo(-len / 2, w * 0.32); sh.closePath();
  const hole = new THREE.Path();
  const k = 0.88;
  hole.moveTo(-len / 2 * k, -w * 0.32 * k); hole.lineTo(-len * 0.22, -w / 2 * k); hole.lineTo(len / 2 * k, -w * 0.36 * k); hole.lineTo(len / 2 * k, w * 0.36 * k); hole.lineTo(-len * 0.22, w / 2 * k); hole.lineTo(-len / 2 * k, w * 0.32 * k); hole.closePath();
  const walls = new THREE.Shape(sh.getPoints()); walls.holes.push(hole);
  const wg = new THREE.ExtrudeGeometry(walls, { depth: h, bevelEnabled: false }); wg.rotateX(-Math.PI / 2);
  mesh(wg, wood, 0, 0, 0, g);
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }); bg.rotateX(-Math.PI / 2);
  mesh(bg, wood, 0, 0, 0, g);
  const lg = new THREE.ExtrudeGeometry(new THREE.Shape(hole.getPoints()), { depth: 0.02, bevelEnabled: false }); lg.rotateX(-Math.PI / 2);
  mesh(lg, lining, 0, 0.07, 0, g);
  const lid = new THREE.Group(); lid.position.set(0, h, -w / 2); lid.userData.keepGroup = true; g.add(lid);
  const lidG = new THREE.ExtrudeGeometry(sh, { depth: 0.09, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }); lidG.rotateX(-Math.PI / 2);
  const lm = mesh(lidG, wood, 0, 0, w / 2, lid);
  const crossV = boxA(-0.04, 0.32, 0.12, 0.15, -0.035 + w / 2, 0.035 + w / 2, MAT.gold, lid);
  const crossH = boxA(0.04, 0.12, 0.12, 0.15, -0.15 + w / 2, 0.15 + w / 2, MAT.gold, lid);
  for (const sx of [-0.8, 0.1, 0.9]) for (const sz of [-1, 1]) { const hnd = boxA(sx * len / 2 - 0.08, sx * len / 2 + 0.08, h * 0.45, h * 0.55, sz * (w * 0.38 + 0.04), sz * (w * 0.38 + 0.06), MAT.brass, g); }
  return { g, lid };
}
export function raven(parent, x, y, z, ry = 0, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s); g.userData.keepGroup = true; parent.add(g);
  const m = mat('#0c0a10', 0.55, 0.1, { flat: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), m); body.scale.set(0.8, 0.85, 1.4); body.position.y = 0.2; body.rotation.x = -0.4; g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 4), m); tail.position.set(0, 0.1, -0.26); tail.rotation.x = -2.2; g.add(tail);
  const head = new THREE.Group(); head.position.set(0, 0.38, 0.12); head.userData.keepGroup = true; g.add(head);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 5), m); head.add(hd);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4), mat('#1e1a22', 0.4)); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.01, 0.12); head.add(beak);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), glow('#ff3030', 6)); e.position.set(sx * 0.055, 0.02, 0.06); head.add(e); }
  const wings = [];
  for (const sx of [-1, 1]) {
    const wp = new THREE.Group(); wp.position.set(sx * 0.1, 0.26, 0); wp.userData.keepGroup = true; g.add(wp);
    const wm = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.36, 3), m); wm.rotation.set(-1.9, 0, sx * 0.2); wm.position.set(sx * 0.02, -0.02, -0.08); wm.scale.set(1, 1, 0.35); wp.add(wm);
    wings.push(wp);
  }
  for (const sx of [-1, 1]) cyl(0.008, 0.008, 0.1, mat('#3a3020', 0.6), sx * 0.04, 0.05, 0.02, g, 3);
  const st = { flap: 0, look: 0, seed: Math.random() * 10 };
  onUpdate((t, dt) => {
    const k = st.seed;
    head.rotation.y = Math.sin(t * 0.7 + k) * 0.6 + (Math.sin(t * 0.23 + k) > 0.6 ? 0.8 : 0);
    head.rotation.x = Math.sin(t * 1.3 + k) * 0.08;
    st.flap = Math.max(0, st.flap - dt);
    const f = st.flap > 0 ? Math.sin(t * 30) * 0.9 : 0;
    wings[0].rotation.z = 0.2 + f; wings[1].rotation.z = -0.2 - f;
  });
  return { g, head, st, caw() { st.flap = 0.8; } };
}
export function cobweb(parent, x, y, z, ry = 0, s = 1) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  if (!cobweb.tex) {
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(235,235,255,0.85)'; ctx.lineWidth = 1.1;
    for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 128, Math.sin(a) * 128); ctx.stroke(); }
    for (let r = 14; r < 128; r += 14) { ctx.beginPath(); for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; const rr = r * (0.92 + 0.08 * Math.sin(i * 2.3)); if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.quadraticCurveTo(Math.cos(a - 0.1) * rr * 0.9, Math.sin(a - 0.1) * rr * 0.9, Math.cos(a) * rr, Math.sin(a) * rr); } ctx.stroke(); }
    cobweb.tex = new THREE.CanvasTexture(c);
    cobweb.mat = new THREE.MeshBasicMaterial({ map: cobweb.tex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  }
  const m = mesh(new THREE.PlaneGeometry(1.2 * s, 1.2 * s), cobweb.mat, x, y, z, parent);
  m.geometry.translate(0.6 * s, -0.6 * s, 0);
  m.rotation.y = ry; m.rotation.x = 0.0;
  m.renderOrder = 3;
  return m;
}
// ornamental wall sconce with one candle (facing +z in local space)
export function sconce(parent, x, y, z, ry = 0, { m = MAT.flame, metal = MAT.brass } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  boxA(-0.08, 0.08, -0.2, 0.2, 0, 0.04, metal, g);
  const arm = cyl(0.02, 0.02, 0.3, metal, 0, 0, 0.15, g, 5); arm.rotation.x = Math.PI / 2;
  cyl(0.07, 0.04, 0.05, metal, 0, 0.02, 0.28, g, 8);
  const f = candle(g, 0, 0.05, 0.28, { h: 0.22, m });
  return { g, flame: f };
}
// a classic grandfather clock with 13 hours; returns hands
export function grandfatherClock(parent, x, y, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.userData.keepGroup = true; parent.add(g);
  const wood = MAT.walnut;
  boxA(-0.45, 0.45, 0, 0.5, -0.25, 0.25, wood, g);
  boxA(-0.36, 0.36, 0.5, 2.3, -0.2, 0.2, wood, g);
  boxA(-0.46, 0.46, 2.3, 3.25, -0.26, 0.26, wood, g);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 3, 1), wood); crown.rotation.set(Math.PI / 2, 0, Math.PI / 2); crown.position.set(0, 3.4, 0); crown.scale.set(1, 1, 0.6); g.add(crown);
  const face = mesh(new THREE.CircleGeometry(0.36, 28), new THREE.MeshStandardMaterial({ map: T.clock, roughness: 0.6, emissiveMap: T.clock, emissive: 0xffffff, emissiveIntensity: 0.15 }), 0, 2.78, 0.265, g);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.03, 6, 28), MAT.gold); ring.position.set(0, 2.78, 0.27); g.add(ring);
  const hour = new THREE.Group(); hour.position.set(0, 2.78, 0.28); hour.userData.keepGroup = true; g.add(hour);
  boxA(-0.015, 0.015, 0, 0.2, 0, 0.01, MAT.black, hour);
  const minute = new THREE.Group(); minute.position.set(0, 2.78, 0.29); minute.userData.keepGroup = true; g.add(minute);
  boxA(-0.01, 0.01, 0, 0.3, 0, 0.01, MAT.black, minute);
  // pendulum window + pendulum
  boxA(-0.2, 0.2, 0.9, 2.1, 0.2, 0.21, MAT.void, g);
  const pend = new THREE.Group(); pend.position.set(0, 2.05, 0.22); pend.userData.keepGroup = true; g.add(pend);
  cyl(0.008, 0.008, 0.9, MAT.brass, 0, -0.45, 0, pend, 4);
  const disc = cyl(0.11, 0.11, 0.02, MAT.gold, 0, -0.95, 0, pend, 14); disc.rotation.x = Math.PI / 2;
  const st = { spin: 0 };
  onUpdate((t, dt) => {
    pend.rotation.z = Math.sin(t * 2.6) * 0.18;
    st.spin = Math.max(0, st.spin - dt);
    const sp = st.spin > 0 ? 9 : 0.04;
    minute.rotation.z -= dt * sp * 2.2;
    hour.rotation.z -= dt * sp * 0.25;
  });
  return { g, st };
}
// a paneled door with a knocker; returns the slab (for bulging/knocking)
export function door(parent, x, y, z, ry = 0, { w = 1.4, h = 3.1, wood = MAT.mahogany, frame = MAT.gold } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.userData.keepGroup = true; parent.add(g);
  boxA(-w / 2 - 0.16, -w / 2, 0, h + 0.16, 0, 0.12, frame, g);
  boxA(w / 2, w / 2 + 0.16, 0, h + 0.16, 0, 0.12, frame, g);
  boxA(-w / 2 - 0.16, w / 2 + 0.16, h, h + 0.16, 0, 0.12, frame, g);
  boxA(-w / 2 - 0.3, w / 2 + 0.3, h + 0.16, h + 0.32, -0.02, 0.2, frame, g);
  const slabP = new THREE.Group(); slabP.position.set(0, 0, 0.02); slabP.userData.keepGroup = true; g.add(slabP);
  const slab = new THREE.Group(); slab.userData.keepGroup = true; slabP.add(slab);
  boxA(-w / 2, w / 2, 0, h, 0, 0.07, wood, slab);
  for (const [px, py, ph] of [[-w / 4, 0.3, 1.0], [w / 4, 0.3, 1.0], [-w / 4, 1.55, 1.3], [w / 4, 1.55, 1.3]]) boxA(px - w * 0.18, px + w * 0.18, py, py + ph, 0.07, 0.11, MAT.walnut, slab);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 16), MAT.brass); ring.position.set(0, 1.55, 0.14); ring.userData.keep = true; slab.add(ring);
  sphere(0.05, MAT.brass, 0, 1.7, 0.12, slab, 8, 6);
  sphere(0.045, MAT.brass, w / 2 - 0.15, 1.2, 0.13, slab, 8, 6);
  return { g, slab, ring };
}
// spooky dead tree from recursive tapered branches
export function deadTree(parent, x, y, z, { h = 6, r = 0.35, seed = 1, m = MAT.bark, spread = 1, moss = false, crown = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const branch = (p, dir, len, rad, depth) => {
    const pts = [p.clone()];
    let cur = p.clone(), d = dir.clone();
    for (let i = 0; i < 4; i++) {
      const wob = crown && depth === 3 ? 0.12 : 0.5;
      d.x += (rnd() - 0.5) * wob * spread; d.z += (rnd() - 0.5) * wob * spread; d.y += 0.05; d.normalize();
      cur = cur.clone().addScaledVector(d, len / 4); pts.push(cur);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tg = new THREE.TubeGeometry(curve, 6, rad, 6, false);
    // taper
    const pos = tg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const seg = Math.floor(i / 7) / 6;
      const c = curve.getPoint(Math.min(1, seg));
      const k = 1 - seg * 0.75;
      pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
    }
    tg.computeVertexNormals();
    g.add(new THREE.Mesh(tg, m));
    if (moss && depth >= 1 && rnd() < 0.6) {
      const ms = new THREE.Mesh(new THREE.ConeGeometry(0.18 * len / 2, 0.9 * len / 2, 4, 1, true), mat('#5d6a52', 0.95, 0, { side: THREE.DoubleSide, flat: true }));
      ms.position.copy(cur); ms.position.y -= 0.4 * len / 2; ms.rotation.x = Math.PI; g.add(ms);
    }
    if (depth <= 0) return;
    const n = depth > 1 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const nd = d.clone(); nd.x += (rnd() - 0.5) * 1.6 * spread; nd.z += (rnd() - 0.5) * 1.6 * spread; nd.y = Math.max(0.15, nd.y - rnd() * 0.3); nd.normalize();
      const at = curve.getPoint(crown && depth === 3 ? 0.88 + rnd() * 0.12 : 0.6 + rnd() * 0.4);
      branch(at, nd, len * (0.55 + rnd() * 0.2), rad * 0.55, depth - 1);
    }
  };
  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), h * 0.55, r, 3);
  // root flare
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + rnd(); const rt = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, r * 3, 5), m); rt.position.set(Math.cos(a) * r * 0.9, r * 0.4, Math.sin(a) * r * 0.9); rt.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); g.add(rt); }
  return g;
}
// faceOnly: just the epitaph, for a baked stone that sits in the same place (blender/grounds.py)
export function tombstone(parent, x, y, z, ry = 0, { kind = 0, s = 1, m = MAT.tomb, face = null, tilt = null, faceOnly = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.rotation.z = tilt ?? rand(-0.06, 0.06); g.scale.setScalar(s); parent.add(g);
  if (kind === 0) { // rounded top
    if (!faceOnly) {
      boxA(-0.4, 0.4, 0, 0.8, -0.1, 0.1, m, g);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 12, 1, false, -Math.PI / 2, Math.PI), m); top.rotation.x = Math.PI / 2; top.rotation.z = Math.PI / 2; top.position.y = 0.8; g.add(top);
    }
    if (face) { const f = mesh(new THREE.PlaneGeometry(0.72, 0.9), new THREE.MeshStandardMaterial({ map: face, roughness: 0.9 }), 0, 0.62, 0.101, g); }
  } else if (kind === 1) { // cross
    boxA(-0.08, 0.08, 0, 1.3, -0.08, 0.08, m, g);
    boxA(-0.36, 0.36, 0.82, 0.98, -0.08, 0.08, m, g);
  } else if (kind === 2) { // obelisk
    boxA(-0.3, 0.3, 0, 0.3, -0.3, 0.3, m, g);
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 1.6, 4), m); ob.rotation.y = Math.PI / 4; ob.position.y = 1.1; g.add(ob);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.25, 4), m); tip.rotation.y = Math.PI / 4; tip.position.y = 2.02; g.add(tip);
  } else { // slab with a pointed gothic top
    if (!faceOnly) {
      boxA(-0.34, 0.34, 0, 0.9, -0.09, 0.09, m, g);
      const sh = new THREE.Shape(); sh.moveTo(-0.34, 0); sh.quadraticCurveTo(-0.3, 0.32, 0, 0.5); sh.quadraticCurveTo(0.3, 0.32, 0.34, 0); sh.closePath();
      const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: false }); eg.translate(0, 0.9, -0.09);
      g.add(new THREE.Mesh(eg, m));
    }
    if (face) { const f = mesh(new THREE.PlaneGeometry(0.6, 0.75), new THREE.MeshStandardMaterial({ map: face, roughness: 0.9 }), 0, 0.55, 0.091, g); }
  }
  if (faceOnly) return g;
  // dirt mound
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 5, 0, TAU, 0, Math.PI / 2), mat('#2c2420', 1, 0, { flat: true })); mound.scale.set(0.9, 0.18, 1.6); mound.position.set(0, 0, 0.75); g.add(mound);
  return g;
}
export function lantern(parent, x, y, z, { s = 1, m = MAT.flame, hang = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
  boxA(-0.12, 0.12, 0, 0.04, -0.12, 0.12, MAT.iron, g);
  for (const [px, pz] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]]) boxA(px - 0.015, px + 0.015, 0.04, 0.34, pz - 0.015, pz + 0.015, MAT.iron, g);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.18, 4), MAT.iron); cap.rotation.y = Math.PI / 4; cap.position.y = 0.43; g.add(cap);
  if (!lantern.glass) lantern.glass = new Map();
  if (!lantern.glass.has(m)) lantern.glass.set(m, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: m.emissive, emissiveIntensity: 1.2, transparent: true, opacity: 0.55 }));
  const gl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), lantern.glass.get(m));
  gl.position.y = 0.19; g.add(gl);
  const f = flame(g, 0, 0.1, 0, 1.3, m);
  if (hang) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 5, 10), MAT.iron); ring.position.y = 0.56; g.add(ring); }
  return { g, flame: f };
}
export function jackOLantern(parent, x, y, z, ry = 0, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s); parent.add(g);
  const geo = new THREE.SphereGeometry(0.3, 14, 10);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.07 * Math.cos(a * 8); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, MAT.pumpkin); body.scale.y = 0.78; body.position.y = 0.23; g.add(body);
  cyl(0.03, 0.04, 0.12, mat('#3a4a20', 0.8), 0, 0.5, 0, g, 5);
  // carved face (glowing)
  const fm = MAT.pumpkinGlow;
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.08, 3), fm); e.position.set(sx * 0.1, 0.3, 0.27); e.rotation.x = Math.PI / 2; e.rotation.z = Math.PI; g.add(e); }
  const mth = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 4, 10, Math.PI), fm); mth.position.set(0, 0.2, 0.275); mth.rotation.z = Math.PI; g.add(mth);
  return g;
}
