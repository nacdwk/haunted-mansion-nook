// Interiors: every room's set dressing, its residents, and what happens when you poke them.
import {
  THREE, W, box, boxA, cyl, mesh, sphere, bake, TAU, DEG, rand, pick, onUpdate, clamp, lerp, damp, smooth,
  addLight, hotspot, proxy, tween, wait, makeGhost, ghostMaterial, mat, glow, easeInOut, easeOut, toBin,
} from './core.js';
import { MAT, T, paintingMat } from './materials.js';
import { D } from './house.js';
import * as P from './props.js';

const sfx = (n, ...a) => W.audio?.sfx?.(n, ...a);
const say = (text, opts) => W.ui?.say?.(text, opts);
const _v = new THREE.Vector3();

export function defineRoom(id, def) {
  const r = { id, lightMul: 1, hoverK: 0, actions: [], ...def };
  const [x0, x1, y0, y1, z0, z1] = def.bounds;
  r.box = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  r.center = r.box.getCenter(new THREE.Vector3());
  r.proxy = proxy(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, W.roomProxies);
  r.proxy.userData.room = id;
  W.rooms[id] = r;
  return r;
}
function act(room, label, fn) { room.actions.push({ label, fn }); return fn; }

// head-turning helper: yaw an object toward the camera within limits
function trackCamera(obj, { limit = 1.0, speed = 3, offset = 0 } = {}) {
  const st = { yaw: 0 };
  onUpdate((t, dt) => {
    obj.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    const parentYaw = obj.parent ? new THREE.Euler().setFromQuaternion(obj.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
    const target = W.lookAt || W.camera.position;
    let want = Math.atan2(target.x - p.x, target.z - p.z) - parentYaw + offset;
    want = Math.atan2(Math.sin(want), Math.cos(want));
    want = clamp(want, -limit, limit);
    st.yaw = damp(st.yaw, want, speed, dt);
    obj.rotation.y = st.yaw;
  });
  return st;
}

export function buildRooms(root) {
  W.roomProxies = new THREE.Group(); W.roomProxies.name = 'roomProxies'; W.roomProxies.userData.noCompact = true;
  root.add(W.roomProxies);
  library(root);
  hall(root);
  conservatory(root);
  seance(root);
  ballroom(root);
  attic(root);
  basement(root);
  towerRoom(root);
}

// ======================================================================= LIBRARY
function library(root) {
  const room = defineRoom('library', {
    name: 'The Library',
    blurb: 'Every volume on these shelves was written by a guest who stayed a little too long. The marble busts are great admirers of yours. They will not take their eyes off you.',
    bounds: [-13.6, -4.87, 0.8, 7.0, -4.6, 4.6],
    view: { az: 24, el: 14, dist: 44, target: [-9.2, 3.6, 0] },
  });
  const S = new THREE.Group(), G = new THREE.Group(); root.add(G);
  const y0 = D.F1;
  // shelves along the back wall
  const shelf = P.bookshelf(S, -13.25, -5.3, y0, 6.55, -4.58, { depth: 0.55, shelves: 6, facing: 1 });
  boxA(-13.3, -5.25, 6.28, 6.33, -3.93, -3.88, MAT.brass, S); // ladder rail
  // fireplace on the left wall, aging portrait above
  P.fireplace(S, -13.58, y0, 0.2, Math.PI / 2, { w: 2.6, h: 2.3, stone: MAT.marble });
  const ageing = P.framed(G, T.aging[0], 1.45, 1.8, { ei: 0.25 });
  ageing.position.set(-13.48, 4.75, 0.2); ageing.rotation.y = Math.PI / 2;
  P.candelabra(S, -13.25, y0 + 2.44, -0.75, { arms: 1, s: 0.8 });
  P.candelabra(S, -13.25, y0 + 2.44, 1.15, { arms: 1, s: 0.8 });
  // rug, chair, tables
  P.rugPlane(S, -8.8, y0, 0.2, 4.6, 3.1, T.rugRed);
  const chairG = P.wingback(S, -10.4, y0, 0.3, -0.85, { fabric: MAT.velvetRed });
  P.table(S, -7.0, y0, 1.0, 1.2, 0.8, { h: 0.85, wood: MAT.mahogany });
  P.candelabra(S, -7.0, y0 + 0.85, 1.0, { arms: 3, s: 0.6 });
  // globe on a stand
  const globeG = new THREE.Group(); globeG.position.set(-6.0, y0, -2.4); G.add(globeG);
  for (const a of [0, 2.1, 4.2]) { const l = cyl(0.03, 0.03, 0.9, MAT.walnut, Math.cos(a) * 0.18, 0.45, Math.sin(a) * 0.18, globeG, 5); l.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); }
  const mer = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 5, 24, Math.PI * 1.4), MAT.brass); mer.position.y = 1.3; mer.rotation.z = 0.4; globeG.add(mer);
  const gcan = document.createElement('canvas'); gcan.width = 256; gcan.height = 128; const gc = gcan.getContext('2d');
  gc.fillStyle = '#2b4a5a'; gc.fillRect(0, 0, 256, 128);
  gc.fillStyle = '#c2a86a'; for (let i = 0; i < 14; i++) { gc.beginPath(); gc.ellipse(rand(0, 256), rand(20, 108), rand(10, 34), rand(6, 20), rand(0, 3), 0, 7); gc.fill(); }
  const gt = new THREE.CanvasTexture(gcan); gt.colorSpace = THREE.SRGBColorSpace;
  const globe = sphere(0.36, new THREE.MeshStandardMaterial({ map: gt, roughness: 0.6 }), 0, 1.3, 0, globeG, 20, 14);
  globe.userData.keep = true;
  onUpdate((t, dt) => { globe.rotation.y += dt * 0.3; });
  // busts that watch you
  P.pedestal(S, -12.9, y0, -2.3, 1.15);
  P.pedestal(S, -8.2, y0, -3.45, 1.0);
  const busts = [
    P.bust(G, -12.9, y0 + 1.15, -2.3, { s: 0.9, ry: 1.0, hat: 'laurel' }),
    P.bust(G, -8.2, y0 + 1.0, -3.45, { s: 0.85, ry: 0.2, hat: 'curls' }),
    P.bust(G, -11.0, 6.72, -4.25, { s: 0.55, ry: 0.4 }),
    P.bust(G, -7.0, 6.72, -4.25, { s: 0.55, ry: 0.1 }),
  ];
  for (const b of busts) trackCamera(b.head, { limit: 1.2, speed: 2.2 });
  // the sliding ladder
  const ladder = new THREE.Group(); ladder.position.set(-10, y0, -3.7); ladder.userData.keepGroup = true; G.add(ladder);
  for (const sx of [-0.32, 0.32]) { const rail = boxA(sx - 0.04, sx + 0.04, 0, 5.6, -0.04, 0.04, MAT.walnut, ladder); }
  for (let y = 0.4; y < 5.5; y += 0.45) boxA(-0.32, 0.32, y, y + 0.05, -0.03, 0.03, MAT.walnut, ladder);
  ladder.rotation.x = -0.1;
  const lst = { x: -10, v: 0.35, kick: 0 };
  onUpdate((t, dt) => {
    const sp = lst.v * (1 + lst.kick * 6);
    lst.kick = Math.max(0, lst.kick - dt * 0.6);
    lst.x += sp * dt;
    if (lst.x > -6.2) { lst.x = -6.2; lst.v = -Math.abs(lst.v); if (lst.kick > 0.05) sfx('creak'); }
    if (lst.x < -12.4) { lst.x = -12.4; lst.v = Math.abs(lst.v); if (lst.kick > 0.05) sfx('creak'); }
    ladder.position.x = lst.x;
  });
  // flying books (they flap like birds)
  const flock = [];
  const addBook = (from) => {
    const bg = new THREE.Group(); bg.userData.keepGroup = true;
    const col = mat(pick(['#6a1a22', '#1f4a3a', '#3a2a5a', '#7a5a1a', '#2a3a6a']), 0.7);
    const left = new THREE.Group(), right = new THREE.Group(); left.userData.keepGroup = right.userData.keepGroup = true; bg.add(left, right);
    boxA(-0.36, 0, -0.01, 0.01, -0.25, 0.25, col, left);
    boxA(0, 0.36, -0.01, 0.01, -0.25, 0.25, col, right);
    boxA(-0.32, -0.02, 0.01, 0.04, -0.22, 0.22, MAT.pages, left);
    boxA(0.02, 0.32, 0.01, 0.04, -0.22, 0.22, MAT.pages, right);
    G.add(bg);
    const b = { g: bg, left, right, ph: rand(0, TAU), r: rand(1.0, 2.2), h: rand(4.6, 6.2), sp: rand(0.35, 0.6) * (rand() < 0.5 ? 1 : -1), from: from ? from.clone() : null, k: from ? 0 : 1 };
    flock.push(b);
    return b;
  };
  for (let i = 0; i < 5; i++) addBook();
  onUpdate((t, dt) => {
    for (const b of flock) {
      b.ph += b.sp * dt;
      const tx = -9.2 + Math.cos(b.ph) * b.r * 1.5, tz = 0.2 + Math.sin(b.ph) * b.r * 0.9, ty = b.h + Math.sin(t * 1.3 + b.ph * 3) * 0.25;
      if (b.k < 1) { b.k = Math.min(1, b.k + dt * 0.5); _v.set(tx, ty, tz); b.g.position.lerpVectors(b.from, _v, easeInOut(b.k)); }
      else b.g.position.set(tx, ty, tz);
      b.g.rotation.y = -b.ph * Math.sign(b.sp) + (b.sp > 0 ? 0 : Math.PI);
      const f = Math.sin(t * 7 + b.ph * 5) * 0.75;
      b.left.rotation.z = 0.5 + f; b.right.rotation.z = -0.5 - f;
    }
  });
  // the ghost reader
  const reader = makeGhost({ height: 1.9, width: 0.48, arms: 'front', color: 0xb6ffe6, hat: 'bowler' });
  reader.position.set(-10.4, y0 + 0.35, 0.3); reader.rotation.y = -0.85; reader.scale.set(1, 0.82, 1); G.add(reader);
  const rbook = new THREE.Group(); rbook.position.set(-10.95, y0 + 1.45, 0.75); rbook.rotation.y = -0.85; rbook.userData.keepGroup = true; G.add(rbook);
  boxA(-0.3, 0.3, -0.01, 0.02, -0.2, 0.2, mat('#3a1a22', 0.7), rbook);
  boxA(-0.28, 0.28, 0.02, 0.05, -0.18, 0.18, MAT.pages, rbook);
  rbook.rotation.x = -0.6;
  const page = new THREE.Group(); page.userData.keepGroup = true; rbook.add(page);
  mesh(new THREE.PlaneGeometry(0.27, 0.36), new THREE.MeshStandardMaterial({ color: 0xe6dcc2, side: THREE.DoubleSide }), 0.135, 0.06, 0, page).rotation.x = -Math.PI / 2;
  onUpdate((t) => { const k = (t * 0.35) % 1; page.rotation.z = k < 0.25 ? -smooth(k / 0.25) * Math.PI : 0; reader.position.y = y0 + 0.35 + Math.sin(t * 1.2) * 0.04; });
  // lights
  const fire = new THREE.PointLight(0xff9a4c, 30, 15, 1.35); fire.position.set(-11.2, y0 + 2.6, 0.6);
  addLight(fire, { room: 'library', flicker: 0.3, speed: 9 });
  toBin(S);
  // interactions
  const age = { busy: false };
  const doAge = act(room, 'Look closer at the portrait', async () => {
    if (age.busy) return; age.busy = true;
    W.fx?.lightning?.(0.9);
    ageing.userData.paint.map = T.aging[1]; ageing.userData.paint.emissiveMap = T.aging[1]; ageing.userData.paint.needsUpdate = true;
    sfx('gasp');
    await wait(3.2);
    W.fx?.lightning?.(0.5);
    ageing.userData.paint.map = T.aging[0]; ageing.userData.paint.emissiveMap = T.aging[0];
    age.busy = false;
  });
  hotspot(ageing, 'library', 'A handsome young man…', doAge);
  const push = act(room, 'Give the ladder a push', () => { lst.kick = 1; lst.v = (lst.x > -9 ? -1 : 1) * Math.abs(lst.v); sfx('creak'); });
  hotspot(ladder, 'library', 'Give the ladder a push', push);
  const fly = act(room, 'Pull a book from the shelf', () => {
    if (flock.length > 14) { const b = flock.shift(); G.remove(b.g); }
    const b = shelf.books[Math.floor(rand(0, shelf.books.length))];
    addBook(new THREE.Vector3(b.x, b.y, -4.0));
    sfx('flutter');
  });
  hotspot(shelf.im, 'library', 'Pull a book from the shelf', fly);
  for (const b of busts) hotspot(b.g, 'library', 'They are watching you', () => { sfx('whisper'); say('“We have read about you.”', { who: 'the busts' }); });
  hotspot(reader, 'library', 'Disturb the reader', () => { sfx('shush'); say('“Shhh.”', { who: 'the reader' }); for (let i = 0; i < 3; i++) addBook(new THREE.Vector3(-10.9, 2.2, 0.8)); });
  room.actions.push({ label: 'Make the busts look away', fn: () => { W.lookAt = new THREE.Vector3(-30, 3, -30); setTimeout(() => { W.lookAt = null; }, 2600); sfx('whisper'); } });
}

// ======================================================================= HALL OF DOORS + ENDLESS HALLWAY
function hall(root) {
  const room = defineRoom('hall', {
    name: 'The Endless Hall',
    blurb: 'A corridor that goes on forever, and a candelabra with no hand to carry it. The doors along this hall are all locked from the other side. Someone is knocking anyway.',
    bounds: [-4.47, 4.47, 0.8, 7.0, -4.6, 4.6],
    view: { az: 14, el: 12, dist: 42, target: [0, 3.4, -1] },
  });
  const S = new THREE.Group(), G = new THREE.Group(); root.add(G);
  const y0 = D.F1;
  // the baked hall (blender/endless_hall.py) brings its own chandelier, rug, sconces, door frames and clock case
  const BK = !!W.bakedEndless, frame = BK ? null : MAT.gold;
  if (!BK) {
    P.chandelier(S, 0, 7.0, 0.6, { r: 0.8, candles: 8, chain: 0.9 });
    P.rugPlane(S, 0, y0, 0, 1.8, 8.8, T.rugPurple);
    P.sconce(S, -1.95, 4.2, -4.58, 0, { m: MAT.flame });
    P.sconce(S, 1.95, 4.2, -4.58, 0, { m: MAT.flame });
    P.sconce(S, -4.45, 4.2, 1.6, Math.PI / 2);
  }
  // knocking doors
  const doors = [
    P.door(G, -4.45, y0, -2.9, Math.PI / 2, { w: 1.4, h: 3.2, frame }),
    P.door(G, -4.45, y0, 0.1, Math.PI / 2, { w: 1.3, h: 3.0, wood: mat('#3a1c2a', 0.6), frame }),
    P.door(G, 3.0, y0, -4.58, 0, { w: 1.4, h: 3.2, wood: mat('#2c1f3a', 0.6), frame }),
  ];
  const dst = doors.map(() => ({ knock: 0, bulge: 0, next: rand(3, 9) }));
  onUpdate((t, dt) => {
    doors.forEach((d, i) => {
      const s = dst[i];
      s.next -= dt;
      if (s.next < 0) { s.knock = 1.2; s.next = rand(6, 14); if (W.state.focus === 'hall' || W.state.mode === 'ride') sfx('knock', { soft: true }); }
      s.knock = Math.max(0, s.knock - dt);
      s.bulge = Math.max(0, s.bulge - dt * 0.6);
      const k = s.knock > 0 ? Math.max(0, Math.sin(s.knock * 28)) * 0.05 : 0;
      const b = Math.sin(t * 1.4 + i * 2) * 0.012 + smooth(Math.min(1, s.bulge)) * 0.16;
      d.slab.position.z = k + b * 0.5;
      d.slab.scale.set(1 + b * 0.18, 1 + b * 0.1, 1 + b * 3);
      d.ring.rotation.x = s.knock > 0 ? Math.sin(s.knock * 30) * 0.5 : 0;
    });
  });
  // the clock with thirteen hours
  const clock = P.grandfatherClock(G, -3.0, y0, -4.32, 0, { body: !BK });
  if (BK) proxy(0.95, 3.75, 0.55, 0, 1.87, 0, clock.g);   // the baked case is still the thing to click
  // floating candelabra in the endless hall
  const cand = P.candelabra(G, 0, 0, 0, { arms: 3, s: 0.55, anim: true });
  cand.g.userData.keepGroup = true;
  const cst = { k: 0, dash: 0 };
  onUpdate((t, dt) => {
    cst.dash = Math.max(0, cst.dash - dt * 0.35);
    const along = 0.5 + 0.5 * Math.sin(t * 0.25);
    const d = cst.dash > 0 ? Math.sin((1 - cst.dash) * Math.PI) : 0;
    const z = lerp(-5.5, -6.9, along * (1 - d) + d);
    const s = lerp(0.55, 0.22, (-(z) - 5.2) / 2.7);
    cand.g.position.set(Math.sin(t * 0.7) * 0.12 * s, y0 + 1.45 * (s / 0.55) + Math.sin(t * 1.6) * 0.06, z);
    cand.g.scale.setScalar(s);
    cand.g.rotation.y = Math.sin(t * 0.5) * 0.3;
  });
  const cl = new THREE.PointLight(0xffb873, 20, 12, 1.4); cl.position.set(0, 5.4, 0.8);
  addLight(cl, { room: 'hall', flicker: 0.08 });
  // eyes in the wallpaper breathe
  onUpdate((t) => { MAT.papEyes.emissiveIntensity = (0.35 + 0.25 * Math.sin(t * 0.8)) * (W.state.lantern ? 2.4 : 1); });
  toBin(S);
  const knockAll = act(room, 'Knock on the doors', () => { dst.forEach((s, i) => setTimeout(() => { s.knock = 1.2; s.bulge = 1.4; sfx('knock'); }, i * 260)); say('Someone on the other side knocks back.', { who: '' }); });
  doors.forEach((d, i) => hotspot(d.g, 'hall', 'Knock on the door', () => { dst[i].knock = 1.2; dst[i].bulge = 1.6; sfx('knock'); }));
  const wind = act(room, 'Wind the clock to thirteen', () => { clock.st.spin = 3.5; sfx('chime', 13); });
  hotspot(clock.g, 'hall', 'Wind the clock to thirteen', wind);
  const follow = act(room, 'Follow the candelabra', () => { cst.dash = 1; sfx('whoosh'); say('It never comes back. It never needs to.', {}); });
  hotspot(cand.g, 'hall', 'Follow the candelabra', follow);
}

// ======================================================================= CONSERVATORY
function conservatory(root) {
  const room = defineRoom('conserv', {
    name: 'The Conservatory',
    blurb: 'Nothing grows here but restlessness. The flowers were sent for a funeral, and the guest of honour has not finished attending it.',
    bounds: [4.87, 13.6, 0.8, 7.0, -4.6, 4.6],
    view: { az: 22, el: 13, dist: 42, target: [9.2, 3.2, -0.5] },
  });
  const S = new THREE.Group(), G = new THREE.Group(); root.add(G);
  const y0 = D.F1;
  // the baked conservatory (blender/conservatory.py) brings its own bier, candle stands, wreaths, plants, plant stand and
  // vines. Those that roll the house's dice are still built, into a group that's thrown away, so everything after
  // them comes out the same.
  const BK = !!W.bakedConserv, junk = new THREE.Group(), SB = BK ? junk : S;
  // the bier
  if (!BK) P.table(S, 8.6, y0, -1.1, 2.7, 1.1, { h: 0.85, wood: MAT.walnut, cloth: MAT.velvet });
  const cof = P.coffin(G, { len: 2.4, w: 0.8, h: 0.55 });
  cof.g.position.set(8.6, y0 + 0.85, -1.1);
  // bony hands that peek from under the lid
  const hands = new THREE.Group(); hands.position.set(0, 0.5, 0.42); hands.userData.keepGroup = true; cof.g.add(hands);
  for (const hx of [-0.4, 0.35]) {
    const h = new THREE.Group(); h.position.x = hx; hands.add(h);
    if (W.figures) {                                   // sculpted bones, the right hand mirrored for the left
      P.figure('bony-hand', h, { bone: P.withAO(MAT.bone) });
      if (hx > 0) h.scale.x = -1;
      continue;
    }
    boxA(-0.08, 0.08, -0.03, 0.03, -0.06, 0.08, MAT.bone, h);
    for (let f = 0; f < 4; f++) { const fg = cyl(0.016, 0.014, 0.14, MAT.bone, -0.06 + f * 0.04, 0.0, 0.14, h, 4); fg.rotation.x = Math.PI / 2 - 0.4; }
  }
  hands.visible = false;
  const inner = new THREE.PointLight(0x6dffb0, 0, 4, 2); inner.position.set(8.6, y0 + 1.6, -1.1);
  const innerE = addLight(inner, { room: 'conserv', flicker: 0.3, speed: 12 });
  W.coffinGlow = inner;   // js/baked.js lights the baked room with it too
  const cst = { open: 0, burst: 0, next: rand(5, 10) };
  onUpdate((t, dt) => {
    cst.next -= dt;
    if (cst.next < 0 && cst.burst <= 0) { cst.burst = 1.6; cst.next = rand(8, 15); if (W.state.focus === 'conserv' || W.state.mode === 'ride') sfx('creak', { low: true }); }
    cst.burst = Math.max(0, cst.burst - dt);
    const want = cst.burst > 0 ? (cst.big ? 0.9 : 0.32 + Math.abs(Math.sin(cst.burst * 9)) * 0.12) : 0;
    if (cst.burst <= 0) cst.big = false;
    cst.open = damp(cst.open, want, 9, dt);
    cof.lid.rotation.x = -cst.open;
    hands.visible = cst.open > 0.12;
    hands.position.y = 0.42 + cst.open * 0.4;
    innerE.base = cst.open * 30;
  });
  // candle stands and wreaths
  if (!BK) for (const x of [6.8, 10.4]) { cyl(0.08, 0.16, 1.6, MAT.iron, x, y0 + 0.8, -1.1, S, 6); cyl(0.14, 0.08, 0.06, MAT.iron, x, y0 + 1.63, -1.1, S, 8); P.candle(S, x, y0 + 1.66, -1.1, { h: 0.5, r: 0.07 }); }
  for (const [x, z] of [[6.0, -3.4], [11.3, -3.4]]) {
    const wr = new THREE.Group(); wr.position.set(x, y0, z); SB.add(wr);
    for (const sx of [-0.25, 0.25]) { const l = cyl(0.025, 0.025, 1.6, MAT.walnut, sx, 0.8, 0.1, wr, 4); l.rotation.x = -0.12; }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 6, 14), MAT.deadLeaf); ring.position.y = 1.45; wr.add(ring);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; sphere(0.07, mat(pick(['#5a1a2a', '#4a2a3a', '#6a5a3a']), 0.8, 0, { flat: true }), Math.cos(a) * 0.42, 1.45 + Math.sin(a) * 0.42, 0.08, wr, 5, 4); }
  }
  // dead plants
  P.pot(SB, 5.7, y0, -3.9, { s: 1.1 }); P.pot(SB, 7.6, y0, -4.0, { s: 0.9 }); P.pot(SB, 9.9, y0, -4.0, { s: 1.0 });
  P.pot(SB, 12.7, y0, -3.7, { s: 1.4, tall: true }); P.pot(SB, 13.0, y0, -1.2, { s: 1.0 }); P.pot(SB, 5.5, y0, 1.2, { s: 0.85 });
  // plant stand with a raven
  if (!BK) { cyl(0.06, 0.12, 1.6, MAT.iron, 11.6, y0 + 0.8, 0.6, S, 6); cyl(0.3, 0.3, 0.06, MAT.iron, 11.6, y0 + 1.62, 0.6, S, 10); }
  const rv = P.raven(G, 11.6, y0 + 1.65, 0.6, -0.7, 1.4);
  // creeping vines on the glass
  for (let i = 0; i < 6; i++) {
    const pts = []; let x = rand(5.6, 12.6), y = y0; const z = -4.45;
    for (let k = 0; k < 9; k++) { pts.push(new THREE.Vector3(x, y, z)); x += rand(-0.5, 0.5); y += rand(0.4, 0.75); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.03, 4);
    mesh(tube, MAT.bark, 0, 0, 0, SB);
    for (let k = 1; k < pts.length; k++) { const lf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 3), MAT.deadLeaf); lf.position.copy(pts[k]); lf.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); SB.add(lf); }
  }
  const gl = new THREE.PointLight(0x7dffb8, 13, 12, 1.4); gl.position.set(9.0, 5.0, 0.4);
  addLight(gl, { room: 'conserv', flicker: 0.12 });
  toBin(S);
  const knock = act(room, 'Knock on the coffin', () => { cst.burst = 2.4; cst.big = true; sfx('creak', { low: true }); setTimeout(() => sfx('knock', { muffled: true }), 300); say('“Let me out! …Actually, no. Leave me in. It’s cozy.”', { who: 'the coffin' }); });
  hotspot(cof.g, 'conserv', 'Knock on the coffin', knock);
  const caw = act(room, 'Startle the raven', () => { rv.caw(); sfx('caw'); });
  hotspot(rv.g, 'conserv', 'Startle the raven', caw);
}

// ======================================================================= SÉANCE
function seance(root) {
  const room = defineRoom('seance', {
    name: 'The Séance Circle',
    blurb: 'The medium in the crystal ball calls the spirits out to play. Mind the tambourine; it has opinions about rhythm.',
    bounds: [4.87, 13.6, 7.4, 13.6, -4.6, 4.6],
    view: { az: 20, el: 15, dist: 42, target: [9.2, 9.8, 0] },
  });
  const S = new THREE.Group(), G = new THREE.Group(); root.add(G);
  const y0 = D.F2, cx = 9.4, cz = 0.9;
  const tableG = P.roundTable(G, cx, y0, cz, 1.25, { h: 0.95, cloth: MAT.velvet, hem: 0.95, anim: true });
  tableG.userData.keepGroup = true;
  const tFlames = [];
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; tFlames.push(P.candle(tableG, Math.cos(a) * 0.8, 1.0, Math.sin(a) * 0.8, { h: 0.3, m: MAT.flameGreen })); }
  // the crystal ball
  const ball = new THREE.Group(); ball.userData.keepGroup = true; G.add(ball);
  const ballMat = new THREE.ShaderMaterial({
    uniforms: { uTime: W.U.uTime, uSpeak: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-wp.xyz); vP = position; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uTime; uniform float uSpeak; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0-abs(dot(normalize(vN),normalize(vV))), 2.5);
        float sw = 0.5+0.5*sin(vP.y*14.0+uTime*2.0+sin(vP.x*9.0+uTime)*2.0);
        vec3 col = mix(vec3(0.1,0.6,0.45), vec3(0.5,1.0,0.85), sw) * (0.25 + 0.4*uSpeak) + vec3(0.7,1.0,0.9)*f*1.6;
        gl_FragColor = vec4(col, 0.25 + f*0.6); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 24), ballMat); ball.add(orb);
  const faceM = new THREE.SpriteMaterial({ map: T.leota[0], color: 0xbfffe8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 });
  // Madame Leota: a sculpted head that glows from within (unlit, its shading baked in) and turns to face you, her
  // eyes and speaking lips painted on (blender/figures.py); or, with ?figures=0, a painted face
  let leota = null, featM = null;
  if (W.figures) {
    leota = new THREE.Group(); leota.scale.setScalar(1.2); leota.position.y = -0.03; leota.userData.keepGroup = true; ball.add(leota);
    const lit = (c) => new THREE.MeshBasicMaterial({ color: c, vertexColors: true });
    featM = new THREE.MeshBasicMaterial({ map: T.leotaFeatures[0], transparent: true, depthWrite: false });
    P.figure('leota-head', leota, { leota_skin: lit(0xc8ffe6) });
    P.figure('leota-hair', leota, { leota_hair: lit(0x4aa684), leota_band: lit(0x2e7258), leota_jewel: glow('#bfffe8', 3) });
    P.figure('leota-face', leota, { leota_face: featM });
  } else {
    const face = new THREE.Sprite(faceM); face.scale.set(1.05, 1.05, 1); ball.add(face);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0x5dffc8, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(2.6, 2.6, 1); ball.add(halo);
  const stand = new THREE.Group(); G.add(stand);
  const bl = new THREE.PointLight(0x5dffc8, 30, 13, 1.3);
  addLight(bl, { room: 'seance', flicker: 0.15, speed: 4 });
  // chairs that rattle
  const chairs = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + 0.3;
    const c = P.chair(G, cx + Math.cos(a) * 1.75, y0, cz + Math.sin(a) * 1.75, Math.atan2(-Math.cos(a), -Math.sin(a)), { seat: MAT.velvet, s: 1.05, anim: true });
    c.userData.keepGroup = true;
    chairs.push({ g: c, x: c.position.x, z: c.position.z, ry: c.rotation.y });
  }
  const rv = P.raven(G, chairs[1].x, y0 + 1.9, chairs[1].z, chairs[1].ry + Math.PI, 1.3);
  // floating instruments
  const inst = [];
  const mkInst = (build) => { const g = new THREE.Group(); g.userData.keepGroup = true; build(g); G.add(g); inst.push({ g, ph: inst.length / 5 * TAU, h: rand(1.7, 3.2), r: rand(2.3, 2.9), spin: rand(0.6, 1.4) }); };
  mkInst((g) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 16), mat('#8a5a2a', 0.6)); g.add(r); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const j = cyl(0.05, 0.05, 0.02, MAT.brass, Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0, g, 8); j.rotation.x = Math.PI / 2; } });
  mkInst((g) => { const bell = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 14, 1, true), MAT.brass); bell.rotation.z = Math.PI / 2; bell.position.x = 0.4; g.add(bell); const tube = cyl(0.03, 0.03, 0.7, MAT.brass, 0, 0, 0, g, 6); tube.rotation.z = Math.PI / 2; });
  mkInst((g) => { const dr = cyl(0.3, 0.3, 0.35, mat('#7a1a2a', 0.6), 0, 0, 0, g, 16); for (const yy of [-0.17, 0.17]) { const rr = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 5, 16), MAT.gold); rr.rotation.x = Math.PI / 2; rr.position.y = yy; g.add(rr); } });
  mkInst((g) => { const fr = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 5, 16, Math.PI * 1.3), MAT.gold); fr.rotation.z = 0.6; g.add(fr); for (let i = 0; i < 6; i++) boxA(-0.25 + i * 0.09 - 0.004, -0.25 + i * 0.09 + 0.004, -0.3, 0.3 - i * 0.05, -0.004, 0.004, mat('#e6e0c8', 0.5), g); });
  mkInst((g) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, TAU, 0, Math.PI / 2), MAT.brass); b.rotation.x = Math.PI; g.add(b); cyl(0.03, 0.03, 0.3, MAT.walnut, 0, 0.15, 0, g, 6); });
  const sst = { speak: 0, frenzy: 0, lev: 0 };
  onUpdate((t, dt) => {
    sst.frenzy = Math.max(0, sst.frenzy - dt * 0.2);
    sst.speak = Math.max(0, sst.speak - dt);
    const fz = 1 + sst.frenzy * 3;
    const a = t * 0.35;
    ball.position.set(cx + Math.cos(a) * 0.45, y0 + 2.25 + Math.sin(t * 1.1) * 0.12 + sst.lev * 0.5, cz + Math.sin(a) * 0.45);
    bl.position.copy(ball.position);
    ballMat.uniforms.uSpeak.value = sst.speak > 0 ? 1 : 0.15;
    const mouthF = sst.speak > 0 ? Math.floor((Math.sin(t * 17) * 0.5 + 0.5) * 3.99) : 0;
    if (leota) {
      if (featM.map !== T.leotaFeatures[mouthF]) featM.map = T.leotaFeatures[mouthF];
      let turn = Math.atan2(W.camera.position.x - ball.position.x, W.camera.position.z - ball.position.z) - leota.rotation.y;
      turn = ((turn + Math.PI) % TAU + TAU) % TAU - Math.PI;   // the short way round
      leota.rotation.y += turn * (1 - Math.exp(-3 * dt));
    } else if (faceM.map !== T.leota[mouthF]) faceM.map = T.leota[mouthF];
    halo.material.opacity = 0.4 + 0.2 * Math.sin(t * 2) + (sst.speak > 0 ? 0.3 : 0);
    inst.forEach((it, i) => {
      it.ph += dt * 0.25 * fz;
      it.g.position.set(cx + Math.cos(it.ph) * it.r, y0 + it.h + Math.sin(t * 1.4 + i) * 0.3 * fz, cz + Math.sin(it.ph) * it.r * 0.85);
      it.g.rotation.set(Math.sin(t * it.spin + i) * 0.6 * fz, t * it.spin * 0.5 * fz, Math.cos(t * it.spin * 0.8 + i) * 0.5);
    });
    chairs.forEach((c, i) => {
      const j = (Math.max(0, Math.sin(t * 0.9 + i * 1.7)) > 0.93 || sst.frenzy > 0.2) ? 1 : 0;
      c.g.position.y = y0 + j * Math.abs(Math.sin(t * 40 + i)) * 0.05 * fz;
      c.g.rotation.z = j * Math.sin(t * 33 + i) * 0.04;
    });
    tableG.position.y = y0 + sst.lev * 0.35 + (sst.lev > 0 ? Math.sin(t * 3) * 0.05 : 0);
    sst.lev = damp(sst.lev, sst.frenzy > 0.3 ? 1 : 0, 2, dt);
  });
  // left partition: drapes + a cabinet of curiosities
  boxA(4.9, 5.08, y0, 13.4, -1.2, -0.4, MAT.curtainPurple, S);
  boxA(4.9, 5.08, y0, 13.4, 3.0, 3.8, MAT.curtainPurple, S);
  boxA(4.9, 5.12, 12.6, 13.5, -1.4, 4.0, MAT.curtainPurple, S);
  const pt = P.framed(S, T.portraits[3], 1.3, 1.65, { ei: 0.25 }); pt.position.set(4.92, 10.7, 1.3); pt.rotation.y = Math.PI / 2;
  boxA(4.9, 5.6, y0, y0 + 2.2, -3.6, -1.9, MAT.walnut, S);
  for (let i = 0; i < 7; i++) { const b = cyl(0.07, 0.09, rand(0.2, 0.35), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(pick(['#6dffb0', '#c070ff', '#ff6a3a', '#5ad8ff'])), emissiveIntensity: 1.6, transparent: true, opacity: 0.85 }), 5.3, y0 + 2.35, -3.4 + i * 0.22, S, 8); b.material.userData.noShadow = true; }
  // celestial ceiling
  const zc = mesh(new THREE.PlaneGeometry(8.7, 9.2), new THREE.MeshStandardMaterial({ map: T.zodiac, roughness: 0.8, emissiveMap: T.zodiac, emissive: 0xffffff, emissiveIntensity: 0.3 }), 9.24, 13.58, 0, S);
  zc.rotation.x = Math.PI / 2;
  P.rugPlane(S, cx, y0, cz, 3.8, 3.8, T.rugPurple);
  P.sconce(S, 7.0, 11.0, -4.58, 0, { m: MAT.flameGreen });
  P.sconce(S, 11.6, 11.0, -4.58, 0, { m: MAT.flameGreen });
  toBin(S);
  const conjure = act(room, 'Ask the medium to call the spirits', async () => {
    sst.speak = 9; sst.frenzy = 1.2;
    sfx('incant');
    W.fx?.ghostSurge?.();
    const lines = ['Candle and cobweb, lantern and bone,', 'spirits who wander and spirits alone,', 'rattle the rafters and knock on the door —', 'waltz from the shadows and dance on the floor!'];
    for (const l of lines) { say(l, { who: 'the medium', long: true }); await wait(2.2); }
  });
  hotspot(ball, 'seance', 'Ask the medium to call the spirits', conjure);
  const band = act(room, 'Strike up the band', () => { sst.frenzy = 1; sfx('tambourine'); });
  for (const it of inst) hotspot(it.g, 'seance', 'Strike up the band', band);
  hotspot(rv.g, 'seance', 'Startle the raven', () => { rv.caw(); sfx('caw'); });
  W.seance = { sst };
}

// ======================================================================= BALLROOM
function ballroom(root) {
  const room = defineRoom('ballroom', {
    name: 'The Grand Hall',
    blurb: 'A birthday party that has been going on for a hundred years. Nobody remembers whose birthday it is, the dancers have never once stepped on a toe, and the organist takes requests from beyond.',
    bounds: [-13.6, 4.47, 7.4, 13.6, -4.6, 4.6],
    view: { az: 22, el: 17, dist: 56, target: [-4.8, 10.0, 0.4] },
  });
  const S = new THREE.Group(), G = new THREE.Group(); root.add(G);
  const y0 = D.F2;
  // with the Blender-built set loaded (js/baked.js) the furniture, organ, fireplace and ramp come from there
  const baked = W.bakedHall;
  const pipes = baked ? baked.pipes : [];
  if (!baked) {
    // the gallery ramp the ride climbs
    const ax = 4.4, ay = y0, bx = -9.0, by = 13.25;
    const len = Math.hypot(ax - bx, by - ay), ang = Math.atan2(by - ay, ax - bx);
    const ramp = new THREE.Group(); ramp.position.set((ax + bx) / 2, (ay + by) / 2 - 0.1, -3.4); ramp.rotation.z = -ang; S.add(ramp);
    boxA(-len / 2, len / 2, -0.12, 0.08, -1.2, 1.2, MAT.woodDark, ramp);
    boxA(-len / 2, len / 2, -0.3, -0.12, 1.05, 1.25, MAT.gold, ramp);
    const rr = mesh(new THREE.PlaneGeometry(len, 0.55), MAT.ironRail, 0, 0.36, 1.2, ramp);
    { const uv = rr.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 2.2); }
    boxA(-len / 2, len / 2, 0.62, 0.69, 1.15, 1.27, MAT.gold, ramp);
    for (let k = 0.15; k < 1; k += 0.22) { const px = lerp(ax, bx, k), py = lerp(ay, by, k); cyl(0.09, 0.11, py - y0, MAT.gold, px, y0 + (py - y0) / 2, -2.3, S, 10); }
    // organ on the left wall
    const og = new THREE.Group(); og.position.set(-13.55, y0, 0.9); S.add(og);
    boxA(0, 1.25, 0, 1.15, -1.7, 1.7, MAT.walnut, og);
    boxA(0.05, 1.45, 1.1, 1.18, -1.6, 1.6, MAT.walnut, og);
    for (let k = 0; k < 3; k++) { boxA(0.55 + k * 0.18, 0.75 + k * 0.18, 0.95 + k * 0.12, 1.0 + k * 0.12, -1.4, 1.4, mat('#efe8da', 0.4), og); boxA(0.55 + k * 0.18, 0.62 + k * 0.18, 1.0 + k * 0.12, 1.03 + k * 0.12, -1.4, 1.4, MAT.black, og); }
    boxA(0, 0.25, 1.15, 5.9, -2.4, 2.4, MAT.walnut, og);
    const pipeH = [2.4, 2.9, 3.4, 3.9, 4.3, 4.7, 5.0, 4.7, 4.3, 3.9, 3.4, 2.9, 2.4];
    pipeH.forEach((h, i) => {
      const z = -2.1 + i * 0.35;
      cyl(0.13, 0.13, h, MAT.gold, 0.4, 1.3 + h / 2, z, og, 10);
      const mouth = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.25, 10), MAT.gold); mouth.position.set(0.4, 1.3 + 0.12, z); mouth.rotation.z = Math.PI; og.add(mouth);
      boxA(0.5, 0.54, 1.62, 1.72, z - 0.06, z + 0.06, MAT.void, og);
      pipes.push(new THREE.Vector3(-13.55 + 0.4, y0 + 1.3 + h, 0.9 + z));
    });
    boxA(-0.05, 0.6, 5.9, 6.15, -2.6, 2.6, MAT.gold, og);
    P.chair(S, -12.0, y0, 0.9, -Math.PI / 2, { seat: MAT.velvetRed, back: 0.4 });
  }
  const organist = makeGhost({ height: 2.0, width: 0.5, hat: 'hood', arms: 'front', color: 0xa8ffd8 });
  organist.position.set(-12.05, y0 + 0.35, 0.9); organist.rotation.y = -Math.PI / 2; organist.scale.set(1, 0.9, 1); G.add(organist);
  const ost = { play: 0 };
  onUpdate((t, dt) => { ost.play = Math.max(0, ost.play - dt * 0.08); const k = 1 + ost.play * 3; organist.rotation.z = Math.sin(t * 2.2 * k) * 0.06 * k; organist.position.y = y0 + 0.35 + Math.abs(Math.sin(t * 4 * k)) * 0.04 * k; });
  // banshees rising from the pipes
  const wisps = [];
  for (let i = 0; i < 5; i++) {
    const w = makeGhost({ height: 0.95, width: 0.3, arms: 'out', color: 0xc9b8ff, opacity: 0.0 });
    G.add(w); wisps.push({ g: w, t: rand(0, 1), pipe: Math.floor(rand(0, pipes.length)), sp: rand(0.12, 0.2) });
  }
  onUpdate((t, dt) => {
    for (const w of wisps) {
      w.t += dt * w.sp * (1 + ost.play * 2);
      if (w.t > 1) { w.t = 0; w.pipe = Math.floor(rand(0, pipes.length)); }
      const p = pipes[w.pipe];
      w.g.position.set(p.x + w.t * 3.2 + Math.sin(w.t * 9) * 0.3, p.y + w.t * 1.6 - 0.4, p.z + Math.sin(w.t * 6 + w.pipe) * 0.6);
      w.g.rotation.y = Math.PI / 2 + Math.sin(w.t * 5) * 0.5;
      w.g.material.uniforms.uOpacity.value = Math.sin(w.t * Math.PI) * 0.75 * (0.5 + ost.play * 0.5);
      w.g.visible = w.g.material.uniforms.uOpacity.value > 0.01;
    }
  });
  // dining table, birthday cake & diners
  if (!baked) P.table(S, -4.8, y0, -0.65, 6.0, 1.25, { h: 0.95, cloth: mat('#a99fb8', 0.9) });
  const diners = [];
  [[-7.0, 'top', 0xa8fff0], [-5.8, 'bun', 0xd2c4ff], [-4.6, 'bun', 0xfff0c8], [-3.4, null, 0xa8ffd8], [-2.2, 'bowler', 0xb8e8ff]].forEach(([x, hat, col], i) => {
    if (!baked) P.chair(S, x, y0, -1.75, 0, { seat: MAT.velvetRed, s: 1.05 });
    const g = makeGhost({ height: i === 2 ? 1.75 : 1.95, width: 0.45, hat, arms: i === 2 ? 'front' : 'down', color: col, flare: 0.9 });
    g.position.set(x, y0 + 0.5, -1.7); g.scale.set(1, 0.85, 1); G.add(g);
    diners.push(g);
  });
  if (!baked) {
    for (let i = 0; i < 5; i++) {
      const x = -7.0 + i * 1.2;
      cyl(0.2, 0.2, 0.02, mat('#f4f0f6', 0.4), x, y0 + 0.96, -0.95, S, 16);
      cyl(0.035, 0.05, 0.22, MAT.gold, x + 0.3, y0 + 1.06, -0.75, S, 8);
      cyl(0.06, 0.035, 0.1, MAT.gold, x + 0.3, y0 + 1.2, -0.75, S, 8);
    }
    P.candelabra(S, -6.4, y0 + 0.95, -0.45, { arms: 3, s: 0.7 });
    P.candelabra(S, -2.8, y0 + 0.95, -0.45, { arms: 3, s: 0.7 });
  }
  const cake = new THREE.Group(); cake.position.set(-4.6, y0 + 0.95, -0.55); S.add(cake);
  cake.userData.keepGroup = true;
  const icing = mat('#f6e8f0', 0.6), sponge = mat('#e8b8c8', 0.7);
  cyl(0.42, 0.44, 0.24, sponge, 0, 0.12, 0, cake, 20); cyl(0.32, 0.33, 0.22, icing, 0, 0.35, 0, cake, 20); cyl(0.22, 0.23, 0.2, sponge, 0, 0.56, 0, cake, 20);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const d = cyl(0.03, 0.03, rand(0.06, 0.14), icing, Math.cos(a) * 0.43, 0.2, Math.sin(a) * 0.43, cake, 5); }
  const cakeFlames = [];
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; cakeFlames.push(P.candle(cake, Math.cos(a) * 0.15, 0.66, Math.sin(a) * 0.15, { h: 0.14, r: 0.018 })); }
  const bst = { out: 0, next: rand(6, 12) };
  onUpdate((t, dt) => {
    bst.next -= dt;
    if (bst.next < 0) { bst.out = 2.6; bst.next = rand(10, 18); }
    bst.out = Math.max(0, bst.out - dt);
    const lean = bst.out > 1.8 ? smooth((2.6 - bst.out) / 0.8) : bst.out > 0 ? smooth(bst.out / 1.8) * 0.6 : 0;
    diners[2].rotation.x = lean * 0.35;
    diners[2].material.uniforms.uMouth.value = bst.out > 1.6 && bst.out < 2.3 ? 1 : 0;
    for (const f of cakeFlames) f.visible = bst.out <= 0 || bst.out > 2.0;
    diners.forEach((d, i) => { if (i !== 2) d.position.y = y0 + 0.5 + Math.sin(t * 1.6 + i) * 0.05; });
  });
  // fireplace with a lounging ghost on the mantel
  if (!baked) P.fireplace(S, -10.3, y0, -4.58, 0, { w: 2.7, h: 2.3, stone: MAT.marble });
  const lounger = makeGhost({ height: 1.9, width: 0.45, arms: 'up', color: 0xb8fff0, hat: 'top' });
  lounger.position.set(-11.1, y0 + 2.62, -4.0); lounger.rotation.set(0, 0, -Math.PI / 2 + 0.15); G.add(lounger);
  onUpdate((t) => { lounger.position.y = y0 + 2.62 + Math.sin(t * 0.9) * 0.06; lounger.rotation.x = Math.sin(t * 0.6) * 0.1; });
  // duelling portraits
  const duel = [P.framed(G, T.duel[0], 1.3, 1.7, { ei: 0.28 }), P.framed(G, T.duel[1], 1.3, 1.7, { ei: 0.28 })];
  duel[0].position.set(-0.4, 11.7, -4.56); duel[1].position.set(2.6, 11.7, -4.56);
  const duelists = [0, 1].map((i) => { const g = makeGhost({ height: 1.3, width: 0.35, arms: 'front', hat: 'top', color: 0xd0fff2, opacity: 0 }); g.position.set(i ? 2.6 : -0.4, 11.0, -4.3); g.rotation.y = i ? -0.6 : 0.6; G.add(g); return g; });
  const flashes = [0, 1].map((i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xffd080, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(0.9, 0.9, 1); s.position.set(i ? 2.0 : 0.2, 11.6, -3.6); G.add(s); return s; });
  const dst = { t: 0, next: rand(9, 16) };
  onUpdate((t, dt) => {
    dst.next -= dt;
    if (dst.next < 0 && dst.t <= 0) { dst.t = 3.0; dst.next = rand(14, 24); }
    if (dst.t > 0) {
      dst.t -= dt;
      const k = 3.0 - dst.t;
      const out = k < 0.6 ? smooth(k / 0.6) : k > 2.4 ? smooth((3.0 - k) / 0.6) : 1;
      duelists.forEach((d, i) => { d.material.uniforms.uOpacity.value = out * 0.9; d.position.z = -4.3 + out * 0.55; d.visible = out > 0.01; });
      const fire = k > 1.2 && k < 1.5;
      flashes.forEach((f) => { f.material.opacity = fire ? 1 : Math.max(0, f.material.opacity - dt * 4); });
      if (fire && !dst.fired) { dst.fired = true; sfx('bang'); }
    } else { dst.fired = false; duelists.forEach((d) => { d.material.uniforms.uOpacity.value = 0; d.visible = false; }); }
  });
  // chandelier with a swinging ghost
  const chand = P.chandelier(G, -5.0, 13.6, 1.6, { r: 1.15, candles: 10, chain: 0.7, anim: true });
  const swinger = makeGhost({ height: 1.5, width: 0.38, arms: 'up', color: 0xc8fff0 });
  swinger.position.set(0.9, -2.65, 0); chand.g.add(swinger);
  const chst = { amp: 0.06, kick: 0 };
  onUpdate((t, dt) => { chst.kick = Math.max(0, chst.kick - dt * 0.25); const a = (0.05 + chst.kick * 0.35); chand.g.rotation.z = Math.sin(t * 1.3) * a; chand.g.rotation.x = Math.cos(t * 1.1) * a * 0.4; swinger.rotation.z = Math.sin(t * 1.3 - 0.6) * a * 1.5; });
  // waltzing couples
  const couples = [];
  const ecx = -5.4, ecz = 2.45, rx = 3.5, rz = 1.25;
  for (let i = 0; i < 4; i++) {
    const cg = new THREE.Group(); cg.userData.keepGroup = true; G.add(cg);
    const ladyCol = i % 2 ? 0xd8c8ff : 0xa8fff0, gentCol = i % 2 ? 0xb8f0ff : 0xc8b8ff;
    const lady = makeGhost({ height: 2.0, width: 0.38, flare: 1.9, skirt: 0.3, hat: 'bun', arms: 'front', color: ladyCol, opacity: 0.85 });
    const gent = makeGhost({ height: 2.15, width: 0.38, flare: 1.0, hat: i % 2 ? 'top' : null, arms: 'front', color: gentCol, opacity: 0.85 });
    lady.position.set(0, 0, 0.3); lady.rotation.y = Math.PI; gent.position.set(0, 0, -0.3);
    cg.add(lady, gent);
    couples.push({ g: cg, ph: i / 4 * TAU });
  }
  const wst = { speed: 1 };
  onUpdate((t, dt) => {
    wst.speed = damp(wst.speed, wst.boost ? 3 : 1, 1.5, dt);
    for (const c of couples) {
      c.ph += dt * 0.32 * wst.speed;
      c.g.position.set(ecx + Math.cos(c.ph) * rx, y0 + 0.12 + Math.abs(Math.sin(c.ph * 6)) * 0.12, ecz + Math.sin(c.ph) * rz);
      c.g.rotation.y = -c.ph * 3 * wst.speed;
    }
  });
  if (!baked) P.rugPlane(S, -10.6, y0, 1.6, 2.4, 3.2, T.rugBlue);
  // lights
  const chl = new THREE.PointLight(0xffc27a, 24, 16, 1.35); chl.position.set(-5.0, 11.6, 1.6);
  addLight(chl, { room: 'ballroom', flicker: 0.07 });
  const ghl = new THREE.PointLight(0x7af0ff, 9, 10, 1.5); ghl.position.set(-5.4, 9.2, 2.4);
  addLight(ghl, { room: 'ballroom', flicker: 0.2, speed: 3 });
  toBin(S);
  const play = act(room, 'Ask the organist for a tune', () => { ost.play = 1; sfx('organ'); W.audio?.setMusicBoost?.('organ', 14); });
  hotspot(organist, 'ballroom', 'Ask the organist for a tune', play);
  const spin = act(room, 'Quicken the waltz', () => { wst.boost = true; sfx('swirl'); setTimeout(() => { wst.boost = false; }, 5000); });
  for (const c of couples) hotspot(c.g, 'ballroom', 'Quicken the waltz', spin);
  const blow = act(room, 'Make a birthday wish', () => { bst.out = 2.6; bst.next = rand(12, 20); setTimeout(() => sfx('blow'), 500); setTimeout(() => say('Happy death-day to you…', { who: 'the party' }), 900); });
  hotspot(cake, 'ballroom', 'Make a birthday wish', blow);
  const swing = act(room, 'Give the chandelier a shove', () => { chst.kick = 1; sfx('whee'); });
  hotspot(chand.g, 'ballroom', 'Give the chandelier a shove', swing);
  const fire = act(room, 'Call for the duel', () => { dst.t = 3.0; dst.fired = false; });
  for (const d of duel) hotspot(d, 'ballroom', 'Call for the duel', fire);
}

// ======================================================================= ATTIC
function attic(root) {
  const room = defineRoom('attic', {
    name: 'The Attic',
    blurb: 'Under the eaves waits a bride with a candle and a heart that will not stop beating. The wedding portraits on the wall keep losing their grooms.',
    bounds: [-12.4, 12.4, 14.0, 19.4, -4.6, 4.6],
    view: { az: 20, el: 26, dist: 56, target: [0, 15.6, 0] },
  });
  const S = new THREE.Group(), G = new THREE.Group(); root.add(G);
  const y0 = D.AT;
  // the bride
  const bride = makeGhost({ height: 2.7, width: 0.42, flare: 2.1, skirt: 0.35, hat: 'veil', arms: 'front', color: 0xd2e4ff, opacity: 0.9 });
  bride.position.set(1.0, y0 + 0.08, -1.6); G.add(bride);
  const heart = sphere(0.09, glow('#ff2a3a', 6), 0, 1.92, 0.27, bride, 10, 8);
  heart.scale.set(1, 0.9, 0.7);
  const bc = P.candelabra(bride, 0, 1.25, 0.72, { arms: 3, s: 0.5, m: MAT.flameBlue });
  const bl = new THREE.PointLight(0xa8c8ff, 22, 16, 1.25); bl.position.set(1.0, y0 + 2.9, -0.4);
  addLight(bl, { room: 'attic', flicker: 0.12 });
  const hle = { base: 0 };
  const brst = { beat: 1 };
  onUpdate((t, dt) => {
    bride.position.y = y0 + 0.08 + Math.sin(t * 0.8) * 0.08;
    bride.rotation.y = Math.sin(t * 0.3) * 0.15;
    const r = (t * 1.25 * brst.beat) % 1;
    const p = Math.exp(-r * 18) + 0.6 * Math.exp(-Math.max(0, r - 0.18) * 18) * (r > 0.18 ? 1 : 0);
    heart.scale.setScalar(1 + p * 0.45);
    hle.base = 1 + p * 9;
    brst.beat = damp(brst.beat, 1, 0.5, dt);
  });
  // wedding portraits on the back slope (tilted)
  const slopeTilt = Math.atan2(1.95, 5.4);
  const zAt = (y) => -(5.25 - 0.24) + (y - 14) / 5.4 * 1.95 + 0.1;
  const wps = [];
  [-7.4, -4.9, 3.8, 6.3].forEach((x, i) => {
    const f = P.framed(G, T.wedding[i][0], 1.2, 1.5, { ei: 0.3 });
    f.position.set(x, 16.4, zAt(16.4)); f.rotation.x = slopeTilt;
    f.userData.keepGroup = true;
    wps.push({ f, i, headless: false, next: rand(2, 8) });
  });
  onUpdate((t, dt) => {
    for (const w of wps) {
      w.next -= dt;
      if (w.next < 0) { w.headless = !w.headless; w.next = w.headless ? rand(1.5, 3) : rand(5, 11); const m = w.f.userData.paint; m.map = T.wedding[w.i][w.headless ? 1 : 0]; m.emissiveMap = m.map; }
    }
  });
  // the piano and its shadowy player
  const pg = new THREE.Group(); pg.position.set(-6.6, y0, 0.1); pg.rotation.y = 0.35; G.add(pg);
  const pshape = new THREE.Shape(); pshape.moveTo(-0.8, -0.7); pshape.lineTo(0.8, -0.7); pshape.lineTo(0.8, 0.3); pshape.bezierCurveTo(0.8, 1.6, -0.2, 1.4, -0.4, 0.8); pshape.lineTo(-0.8, 0.7); pshape.closePath();
  const pgeo = new THREE.ExtrudeGeometry(pshape, { depth: 0.45, bevelEnabled: false }); pgeo.rotateX(-Math.PI / 2); pgeo.translate(0, 0.62, 0);
  mesh(pgeo, MAT.black, 0, 0, 0, pg);
  const lidg = new THREE.ExtrudeGeometry(pshape, { depth: 0.03, bevelEnabled: false }); lidg.rotateX(-Math.PI / 2);
  const lid = mesh(lidg, MAT.black, 0, 1.07, 0, pg); lid.rotation.x = -0.0; lid.rotation.z = 0.0;
  const lidPivot = new THREE.Group(); lidPivot.position.set(0.8, 1.07, 0); pg.add(lidPivot); lid.position.set(-0.8, 0, 0); lidPivot.add(lid); lidPivot.rotation.z = 0.55;
  for (const [lx, lz] of [[-0.6, -0.55], [0.6, -0.55], [0.2, 0.9]]) cyl(0.06, 0.05, 0.62, MAT.black, lx, 0.31, lz, pg, 6);
  boxA(-0.78, 0.78, 0.86, 0.92, -0.86, -0.66, mat('#f2ecde', 0.4), pg);
  for (let k = 0; k < 18; k++) boxA(-0.76 + k * 0.088, -0.76 + k * 0.088 + 0.04, 0.92, 0.95, -0.86, -0.74, MAT.black, pg);
  P.chair(S, -6.85, y0, -1.0, 0.35, { seat: MAT.velvet, back: 0.3, s: 0.9 });
  const pianist = makeGhost({ height: 1.9, width: 0.44, arms: 'front', color: 0x3a2050, blend: 'normal', opacity: 0.75, eyes: false });
  pianist.position.set(-6.85, y0 + 0.4, -1.0); pianist.rotation.y = 0.35; pianist.scale.y = 0.85; G.add(pianist);
  onUpdate((t) => { pianist.rotation.z = Math.sin(t * 2.4) * 0.08; pianist.position.y = y0 + 0.4 + Math.abs(Math.sin(t * 4.8)) * 0.04; });
  // trunks with pop-up ghosts
  const pops = [];
  [[6.8, -2.6, 0.3], [8.9, -1.2, -0.4], [10.6, -2.9, 0.15]].forEach(([x, z, r], i) => {
    const tg = new THREE.Group(); tg.position.set(x, y0, z); tg.rotation.y = r; S.add(tg);
    boxA(-0.6, 0.6, 0, 0.62, -0.38, 0.38, mat(pick(['#4a2a1a', '#3a2a3a', '#2a3a3a']), 0.7), tg);
    for (const sx of [-0.45, 0.45]) boxA(sx - 0.04, sx + 0.04, 0, 0.64, -0.4, 0.4, MAT.brass, tg);
    const gh = makeGhost({ height: 1.35, width: 0.36, arms: 'up', color: 0x9ffcf0, opacity: 0.9 });
    gh.position.set(x, y0, z); G.add(gh);
    pops.push({ g: gh, k: 0, next: rand(1, 6) + i * 2, up: 0 });
  });
  onUpdate((t, dt) => {
    for (const p of pops) {
      p.next -= dt;
      if (p.next < 0 && p.up <= 0) { p.up = 1.8; p.next = rand(5, 11); if (W.state.focus === 'attic') sfx('pop'); }
      p.up = Math.max(0, p.up - dt);
      const want = p.up > 0 ? 1 : 0;
      p.k = damp(p.k, want, p.up > 0 ? 14 : 5, dt);
      p.g.position.y = y0 - 1.0 + p.k * 1.35;
      p.g.scale.y = 0.4 + p.k * 0.6;
      p.g.visible = p.k > 0.02;
    }
  });
  // clutter
  for (const [x, z, n] of [[-2.6, -3.6, 3], [9.8, 1.0, 2], [-10.2, 0.2, 2]]) for (let k = 0; k < n; k++) cyl(0.32 - k * 0.04, 0.32 - k * 0.04, 0.3, mat(pick(['#7a4a5a', '#4a5a7a', '#8a7a4a']), 0.8), x + rand(-0.05, 0.05), y0 + 0.15 + k * 0.31, z, S, 14);
  // dress form with a veil
  const df = new THREE.Group(); df.position.set(4.6, y0, -3.2); S.add(df);
  cyl(0.03, 0.03, 1.0, MAT.walnut, 0, 0.5, 0, df, 6); boxA(-0.3, 0.3, 0, 0.04, -0.3, 0.3, MAT.walnut, df);
  const torsoG = new THREE.LatheGeometry([[0.0, 0], [0.26, 0.02], [0.2, 0.3], [0.28, 0.62], [0.24, 0.78], [0.08, 0.86], [0.07, 0.95], [0.0, 0.96]].map(([r, h]) => new THREE.Vector2(r, h)), 14);
  const torso = new THREE.Mesh(torsoG, mat('#8a7a6a', 0.85)); torso.scale.set(1, 1, 0.75); torso.position.y = 1.05; df.add(torso);
  sphere(0.05, MAT.walnut, 0, 2.05, 0, df, 8, 6);
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.05, 16, 1, true), mat('#c9b8c8', 0.9, 0, { side: THREE.DoubleSide })); skirt.position.y = 0.58; df.add(skirt);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 5, 14), mat('#7a2a3a', 0.8)); sash.rotation.x = Math.PI / 2; sash.position.y = 1.36; df.add(sash);
  // rocking chair rocking by itself
  const rock = new THREE.Group(); rock.position.set(-3.4, y0, 0.0); rock.rotation.y = 0.6; rock.userData.keepGroup = true; S.add(rock);
  P.chair(rock, 0, 0.1, 0, 0, { seat: MAT.velvetRed, wood: MAT.walnut, back: 1.0 });
  for (const sx of [-0.27, 0.27]) { const rk = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.03, 4, 16, 0.9), MAT.walnut); rk.rotation.y = Math.PI / 2; rk.rotation.z = -Math.PI / 2 - 0.45; rk.position.set(sx, 1.12, 0); rock.add(rk); }
  onUpdate((t) => { rock.rotation.x = Math.sin(t * 1.6) * 0.13; });
  // birdcage
  const bcg = new THREE.Group(); bcg.position.set(-1.4, y0, -3.7); S.add(bcg);
  cyl(0.03, 0.03, 1.5, MAT.brass, 0, 0.75, 0, bcg, 5);
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; cyl(0.008, 0.008, 0.6, MAT.brass, Math.cos(a) * 0.25, 1.8, Math.sin(a) * 0.25, bcg, 3); }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 6, 0, TAU, 0, Math.PI / 2), mat('#a8844e', 0.4, 0.8, { side: THREE.DoubleSide })); dome.position.y = 2.1; bcg.add(dome);
  cyl(0.26, 0.26, 0.04, MAT.brass, 0, 1.5, 0, bcg, 12);
  // cobwebs in the corners
  P.cobweb(S, -12.0, 18.9, -3.0, 0.5, 1.6); P.cobweb(S, 12.0, 18.9, -3.0, -Math.PI / 2 - 0.3, 1.4); P.cobweb(S, -12.3, 16.0, 2.0, Math.PI / 2, 1.2);
  // floor-standing candles and a leaning mirror
  P.candelabra(S, -1.0, y0, -2.8, { arms: 3, s: 0.9, m: MAT.flame });
  P.candelabra(S, 3.2, y0, 0.4, { arms: 1, s: 1.2, m: MAT.flame });
  const mir = new THREE.Group(); mir.position.set(11.6, y0, -1.0); mir.rotation.set(-0.15, -1.1, 0); S.add(mir);
  boxA(-0.55, 0.55, 0, 1.9, -0.04, 0.04, MAT.gold, mir);
  boxA(-0.45, 0.45, 0.1, 1.8, 0.04, 0.05, mat('#4a5070', 0.08, 0.9), mir);
  P.rugPlane(S, 1.0, y0, -0.8, 3.2, 2.4, T.rugBlue);
  toBin(S);
  const beat = act(room, 'Listen to her heart', () => { brst.beat = 2.4; sfx('heartbeat'); say('Thump. Thump. Thump-thump.', { who: '' }); });
  hotspot(bride, 'attic', 'Listen to her heart', beat);
  const pop = act(room, 'Open the trunks', () => { pops.forEach((p, i) => setTimeout(() => { p.up = 2.2; sfx('pop'); }, i * 220)); });
  for (const p of pops) hotspot(p.g, 'attic', 'Open the trunks', pop);
  hotspot(pg, 'attic', 'A shadow plays the piano', () => { sfx('piano'); });
  room.actions.push({ label: 'Play the piano', fn: () => sfx('piano') });
}

// ======================================================================= BASEMENT (portrait hall + load area)
function basement(root) {
  const room = defineRoom('basement', {
    name: 'The Portrait Hall',
    blurb: 'Below stairs, where the Doom Buggies wait. The portraits here look perfectly respectable, until the lightning catches them.',
    bounds: [-21.6, 20.5, -5.5, -0.6, 5.8, 10.5],
    view: { az: 12, el: 11, dist: 56, target: [-1, -2.6, 8] },
  });
  const S = new THREE.Group(), G = new THREE.Group(); root.add(G);
  const y0 = D.BY0, zw = D.BZ0 + 0.3;
  const frames = [];
  [-13.4, -7.6, -1.8, 4.0].forEach((x, i) => {
    const f = P.framed(G, T.lightning[i][0], 1.55, 1.95, { ei: 0.3 });
    f.position.set(x, -2.75, zw + 0.02);
    f.userData.keepGroup = true;
    frames.push({ f, i });
  });
  W.lightningPortraits = (on) => { for (const fr of frames) { const m = fr.f.userData.paint; m.map = T.lightning[fr.i][on ? 1 : 0]; m.emissiveMap = m.map; } };
  for (const x of [-16.2, -10.5, -4.7, 1.1, 6.9]) P.sconce(S, x, -2.4, zw + 0.06, 0, { m: MAT.flameBlue });
  for (const x of [-15.0, -6.0, 3.0, 12.6]) { const lt = P.lantern(S, x, -2.0, 8.6, { s: 1.1, hang: true }); cyl(0.01, 0.01, 1.0, MAT.iron, x, -0.9, 8.6, S, 3); }
  // mirror niche with a gilded frame
  const mx0 = 8.0, mx1 = 12.0, my0 = -5.15, my1 = -1.45;
  boxA(mx0 - 0.25, mx0, my0 - 0.25, my1 + 0.25, D.BZ0 - 0.1, D.BZ0 + 0.45, MAT.gold, S);
  boxA(mx1, mx1 + 0.25, my0 - 0.25, my1 + 0.25, D.BZ0 - 0.1, D.BZ0 + 0.45, MAT.gold, S);
  boxA(mx0, mx1, my1, my1 + 0.25, D.BZ0 - 0.1, D.BZ0 + 0.45, MAT.gold, S);
  boxA(mx0, mx1, my0 - 0.25, my0, D.BZ0 - 0.1, D.BZ0 + 0.45, MAT.gold, S);
  const crest = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 16, Math.PI), MAT.gold); crest.position.set((mx0 + mx1) / 2, my1 + 0.25, D.BZ0 + 0.3); S.add(crest);
  const mirrorDark = new THREE.MeshStandardMaterial({ color: 0x1a1830, roughness: 0.05, metalness: 0.95, emissive: 0x0c0a18 });
  const mirror = mesh(new THREE.PlaneGeometry(mx1 - mx0, my1 - my0), mirrorDark, (mx0 + mx1) / 2, (my0 + my1) / 2, D.BZ0 + 0.02, G);
  mirror.userData.keep = true;
  W.mirrorSpot = { x: (mx0 + mx1) / 2, y: (my0 + my1) / 2, z: D.BZ0 + 0.03, w: mx1 - mx0, h: my1 - my0, dark: mirror };
  // load platform & sign
  boxA(13.0, 18.6, y0, y0 + 0.25, 9.5, 10.45, MAT.woodDark, S);
  boxA(13.0, 18.6, y0 + 0.25, y0 + 0.3, 9.48, 9.6, MAT.gold, S);
  const sign = mesh(new THREE.PlaneGeometry(4.2, 0.62), new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 768; c.height = 112; const x = c.getContext('2d'); x.fillStyle = '#1c1224'; x.fillRect(0, 0, 768, 112); x.strokeStyle = '#c9a24a'; x.lineWidth = 6; x.strokeRect(6, 6, 756, 100); x.fillStyle = '#e9cf8a'; x.font = '50px "IM Fell English SC", Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Doom Buggies · Board Here', 384, 60); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.6 }), 15.7, -1.55, zw + 0.03, S);
  sign.material.emissiveMap = sign.material.map;
  // the attendant
  const att = makeGhost({ height: 1.8, width: 0.42, arms: 'down', color: 0xa8fff0, hat: 'bowler' });
  att.position.set(15.0, y0 + 0.25, 7.0); att.rotation.y = 0.5; G.add(att);
  const atl = P.lantern(G, 15.5, y0 + 1.2, 7.35, { s: 0.9 });
  atl.g.userData.keepGroup = true;
  onUpdate((t) => { att.position.y = y0 + 0.25 + Math.sin(t * 1.3) * 0.06; att.rotation.y = 0.5 + Math.sin(t * 0.4) * 0.3; });
  // ramp from the cellar doors
  const rx0 = 22.0, ry0 = -0.2, rx1 = 14.4, ry1 = y0;
  const rl = Math.hypot(rx0 - rx1, ry0 - ry1), ra = Math.atan2(ry0 - ry1, rx0 - rx1);
  const rg = new THREE.Group(); rg.position.set((rx0 + rx1) / 2, (ry0 + ry1) / 2 - 0.15, 8.2); rg.rotation.z = ra; S.add(rg);
  boxA(-rl / 2, rl / 2, -0.12, 0.05, -1.2, 1.2, MAT.woodDark, rg);
  for (let k = 0; k < 6; k++) { const px = lerp(rx1, rx0, k / 5); cyl(0.1, 0.1, Math.max(0.1, lerp(ry1, ry0, k / 5) - y0), MAT.walnut, px, y0 + Math.max(0.1, lerp(ry1, ry0, k / 5) - y0) / 2, 9.2, S, 6); }
  P.cobweb(S, -21.3, -0.8, 6.0, 0, 1.4); P.cobweb(S, 20.2, -0.8, 6.0, -Math.PI / 2, 1.2);
  const rv = P.raven(G, -9.25, -0.98, 9.6, 0.4, 1.2);
  const b1 = new THREE.PointLight(0x58e0cf, 12, 14, 1.4); b1.position.set(-9.5, -1.6, 8.6);
  addLight(b1, { room: 'basement', flicker: 0.12 });
  const b2 = new THREE.PointLight(0x7aa8ff, 11, 14, 1.4); b2.position.set(3.0, -1.6, 8.6);
  addLight(b2, { room: 'basement', flicker: 0.12 });
  toBin(S);
  const flash = act(room, 'Summon the lightning', () => { W.fx?.lightning?.(1); });
  for (const fr of frames) hotspot(fr.f, 'basement', 'Wait for the lightning…', flash);
  hotspot(att, 'basement', 'Ask the attendant', () => { say('“Keep your hands, arms and ectoplasm inside the buggy at all times.”', { who: 'the attendant' }); sfx('whisper'); });
  hotspot(rv.g, 'basement', 'Startle the raven', () => { rv.caw(); sfx('caw'); });
}

// ======================================================================= STRETCHING ROOM (the tower's ground floor)
function towerRoom(root) {
  const room = defineRoom('tower', {
    name: 'The Stretching Room',
    blurb: 'This chamber has no windows and no doors. Is the room actually stretching, or is it your imagination? Watch the portraits and decide for yourself.',
    bounds: [-19.9, -13.9, 0.8, 7.4, -1.0, 5.0],
    view: { az: -8, el: 14, dist: 40, target: [-16.9, 4.4, 2.0] },
  });
  const tw = W.tower;
  const stretch = act(room, 'Stretch the room', async () => {
    if (tw.st.busy) return;
    tw.st.busy = true;
    tw.st.target = 1;
    sfx('stretch');
    await wait(5.2);
    W.fx?.lightning?.(1);
    sfx('scream');
    await wait(2.6);
    tw.st.target = 0;
    await wait(3.0);
    tw.st.busy = false;
  });
  hotspot(tw.group, 'tower', 'Stretch the room', stretch);
  room.actions.push({ label: 'Read the portraits', fn: () => say('A lady with a parasol. A gentleman of means. Three friends. A widow. Perfectly ordinary, until they stretch.', {}) });
}
