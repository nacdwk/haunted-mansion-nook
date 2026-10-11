// The grounds: front yard, hearse, pet cemetery, graveyard, crypt, fog, bats, moon & sky.
import {
  THREE, W, box, boxA, cyl, mesh, sphere, bake, TAU, rand, pick, onUpdate, clamp, lerp, damp, smooth,
  addLight, hotspot, wait, makeGhost, mat, glow, easeInOut, flat, toBin,
} from './core.js';
import { MAT, T, TX } from './materials.js';
import { D, subtractRects } from './house.js';
import { defineRoom } from './rooms.js';
import * as P from './props.js';

const sfx = (n, ...a) => W.audio?.sfx?.(n, ...a);
const say = (text, opts) => W.ui?.say?.(text, opts);

export function buildOutside(root) {
  const S = new THREE.Group(), G = new THREE.Group(); root.add(G);
  frontYard(S, G);
  graveyard(S, G);
  backYard(S, G);
  toBin(S);
  sky(root);
}

function fenceRun(S, x0, z0, x1, z1, h = 1.35) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = mesh(new THREE.PlaneGeometry(len, h), MAT.ironFence, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, S);
  m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 1.6);
  return m;
}
function pillar(S, x, z, h = 2.0) {
  boxA(x - 0.38, x + 0.38, 0, h, z - 0.38, z + 0.38, MAT.stoneWarm, S);
  boxA(x - 0.48, x + 0.48, h, h + 0.18, z - 0.48, z + 0.48, MAT.stoneDark, S);
}

// ------------------------------------------------------------------ front yard
function frontYard(S, G) {
  // porch & steps (the baked exterior brings its own)
  if (!W.bakedExterior) {
    boxA(-7.7, 7.7, 0, D.F1, 5.0, 7.75, MAT.stoneWarm, S);
    boxA(-7.8, 7.8, D.F1 - 0.05, D.F1 + 0.02, 4.95, 7.85, MAT.stoneDark, S);
    for (let i = 0; i < 3; i++) boxA(-2.3 + i * 0.12, 2.3 - i * 0.12, 0, D.F1 - i * 0.27 - 0.0, 7.75, 8.8 - i * 0.36, MAT.stone, S);
  }
  // flagstone path
  for (let z = 8.95; z < 10.1; z += 0.55) for (const x of [-0.6, 0.6]) boxA(x - 0.5 + rand(-0.05, 0.05), x + 0.5, 0, 0.05, z, z + 0.48, MAT.flags, S);
  // fence across the front with a gate
  fenceRun(S, D.PX0 + 0.3, 10.22, -1.6, 10.22);
  fenceRun(S, 1.6, 10.22, 15.0, 10.22);
  fenceRun(S, 22.9, 10.22, D.PX1 - 0.3, 10.22);
  fenceRun(S, D.PX0 + 0.3, 10.22, D.PX0 + 0.3, 5.6);
  pillar(S, -1.6, 10.2); pillar(S, 1.6, 10.2);
  pillar(S, 15.0, 10.2, 1.7); pillar(S, 22.9, 10.2, 1.7);
  const gl = [];
  for (const x of [-1.6, 1.6]) {
    const l = P.lantern(S, x, 2.18, 10.2, { s: 1.35 });
    gl.push(l);
  }
  // open gates
  for (const [x, ry] of [[-1.5, -1.2], [1.5, Math.PI + 1.2]]) {
    const g = mesh(new THREE.PlaneGeometry(1.5, 1.5), MAT.ironFence, 0, 0, 0, S);
    g.geometry.translate(0.75, 0.75, 0);
    g.position.set(x, 0.05, 10.2); g.rotation.y = ry;
  }
  // bushes along the foundation
  const bushM = flat('#22302a');
  for (const x of [-12.8, -10.0, -8.4, 8.5, 10.4, 12.9]) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), bushM); b.position.set(x, 0.45, 5.6); b.scale.set(1.2, 0.8, 0.8); S.add(b); }
  // jack-o'-lanterns on the steps and path
  P.jackOLantern(S, -1.9, D.F1 - 0.27, 8.2, 0.3, 1.0);
  P.jackOLantern(S, 2.0, D.F1 - 0.54, 8.55, -0.4, 0.85);
  P.jackOLantern(S, -2.6, 0.0, 9.3, 0.1, 1.2);
  P.jackOLantern(S, 6.6, D.F1, 7.2, -0.2, 0.9);
  // gas lamps
  for (const x of [-4.0, 4.0]) {
    cyl(0.07, 0.1, 2.6, MAT.iron, x, 1.3, 9.4, S, 8);
    const lt = P.lantern(S, x, 2.6, 9.4, { s: 1.2 });
  }
  // the hearse and its invisible horse
  const hz = hearse(G, -12.0, 0, 8.0);
  // pet cemetery
  const pets = [['FIFI', 'good girl'], ['MR. WHISKERS', '9 of 9'], ['CROAKER', 'ribbit'], ['POLLY', 'said it all']];
  pets.forEach(([n, l], i) => {
    const ep = TX.epitaph([l], { w: 192, h: 192, title: n });
    P.tombstone(S, -22.6 + i * 1.25, 0, 7.1 + (i % 2) * 1.1, rand(-0.2, 0.2), { kind: 0, s: 0.42, face: ep });
  });
  P.tombstone(S, -19.5, 0, 9.3, 0.3, { kind: 1, s: 0.5 });
  const pup = makeGhost({ height: 0.7, width: 0.28, arms: false, color: 0xb8fff0, eyes: true });
  pup.position.set(-20.8, 0.2, 8.4); G.add(pup);
  const ears = [];
  onUpdate((t) => { pup.position.set(-20.8 + Math.sin(t * 0.8) * 1.4, 0.25 + Math.abs(Math.sin(t * 3.2)) * 0.25, 8.4 + Math.sin(t * 1.6) * 0.5); pup.rotation.y = Math.cos(t * 0.8) > 0 ? Math.PI / 2 : -Math.PI / 2; });
  const petPup = () => { sfx('bark'); say('Woof. (Spectrally.)', {}); };
  hotspot(pup, 'yard', 'A very good ghost', petPup);
  // the great oak with hanging moss behind the tower
  P.deadTree(S, -21.5, 0, -5.2, { h: 15, r: 0.7, seed: 7, m: MAT.bark, moss: true, spread: 1.1 });
  P.deadTree(S, -23.0, 0, 3.0, { h: 6.5, r: 0.28, seed: 3, m: MAT.barkLight });
  const yard = defineRoom('yard', {
    name: 'The Front Lawn',
    blurb: 'The hearse is waiting for a passenger. The horse is waiting too, though nobody has ever seen it.',
    bounds: [-24, 14, 0, 3, 7.8, 10.5],
    view: { az: 8, el: 12, dist: 60, target: [-8, 1.6, 8.2] },
    noProxy: true,
  });
  yard.actions.push({ label: 'Pat the horse that is not there', fn: hz.pat }, { label: 'Pet the ghost dog', fn: petPup });
}

function hearse(G, x, y, z) {
  const h = new THREE.Group(); h.position.set(x, y, z); h.userData.keepGroup = true; G.add(h);
  const body = MAT.black, trim = MAT.gold;
  const S = new THREE.Group(); h.add(S);
  boxA(-1.4, 1.2, 0.85, 2.45, -0.62, 0.62, body, S);
  boxA(-1.5, 1.3, 2.45, 2.62, -0.7, 0.7, trim, S);
  boxA(-1.45, 1.25, 2.62, 2.85, -0.66, 0.66, body, S);
  const glassM = new THREE.MeshStandardMaterial({ color: 0x0a1a14, emissive: 0x1b6a48, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.4 });
  for (const sz of [-0.63, 0.63]) boxA(-1.1, 0.9, 1.15, 2.25, sz - 0.01, sz + 0.01, glassM, S);
  for (const sz of [-0.64, 0.64]) for (const sx of [-1.15, -0.1, 0.95]) boxA(sx - 0.06, sx + 0.06, 1.1, 2.3, sz - 0.02, sz + 0.02, trim, S);
  // coffin silhouette inside
  boxA(-1.0, 0.8, 1.25, 1.55, -0.3, 0.3, MAT.mahogany, S);
  // urn finials & plumes
  for (const sx of [-1.35, 1.15]) for (const sz of [-0.58, 0.58]) {
    cyl(0.06, 0.1, 0.18, trim, sx, 2.95, sz, S, 8);
    const pl = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 6), flat('#141018')); pl.position.set(sx, 3.33, sz); S.add(pl);
  }
  // driver's box
  boxA(1.2, 1.9, 1.5, 1.85, -0.55, 0.55, body, S);
  boxA(1.25, 1.6, 1.85, 2.35, -0.5, 0.5, body, S);
  // undercarriage
  boxA(-1.6, 1.8, 0.7, 0.85, -0.42, 0.42, body, S);
  const wheel = (wx, r) => {
    for (const sz of [-0.75, 0.75]) {
      const wg = new THREE.Group(); wg.position.set(wx, r, sz); S.add(wg);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 20), body); wg.add(tire);
      for (let k = 0; k < 10; k++) { const sp = box(0.03, r * 2, 0.03, trim, 0, 0, 0, wg); sp.rotation.z = k / 10 * Math.PI; }
      cyl(0.09, 0.09, 0.12, trim, 0, 0, 0, wg, 8).rotation.x = Math.PI / 2;
    }
  };
  wheel(-1.0, 0.72); wheel(1.25, 0.55);
  // lamps
  for (const sz of [-0.62, 0.62]) { const l = P.lantern(S, 1.95, 1.75, sz, { s: 0.85, m: MAT.flameGreen }); }
  // shafts and the harness of the horse that is not there
  for (const sz of [-0.42, 0.42]) { const sh = cyl(0.035, 0.035, 3.4, MAT.walnut, 3.4, 0.95, sz, S, 6); sh.rotation.z = Math.PI / 2 + 0.06; }
  const harness = new THREE.Group(); harness.position.set(3.7, 0, 0); harness.userData.keepGroup = true; h.add(harness);
  const strap = mat('#2a1a12', 0.6);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 8, 18), strap); collar.position.set(0.9, 1.75, 0); collar.rotation.y = Math.PI / 2; collar.scale.set(1, 1.25, 1); harness.add(collar);
  boxA(-0.6, 0.3, 1.78, 1.86, -0.42, 0.42, strap, harness);
  boxA(-0.45, 0.15, 1.86, 1.98, -0.3, 0.3, mat('#5a1a22', 0.7), harness);
  for (const sz of [-0.42, 0.42]) { boxA(-0.08, 0.0, 1.0, 1.84, sz - 0.02, sz + 0.02, strap, harness); boxA(-1.3, 0.85, 1.2, 1.26, sz - 0.02, sz + 0.02, strap, harness); }
  const head = new THREE.Group(); head.position.set(1.35, 2.25, 0); head.userData.keepGroup = true; harness.add(head);
  boxA(0, 0.85, -0.02, 0.04, -0.2, 0.2, strap, head);
  for (const sz of [-0.2, 0.2]) { boxA(0.05, 0.4, -0.12, 0.15, sz - 0.02, sz + 0.02, MAT.black, head); }
  const bit = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 5, 10), MAT.brass); bit.position.set(0.75, -0.35, 0.2); head.add(bit);
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), flat('#141018')); plume.position.set(0.1, 0.3, 0); head.add(plume);
  for (let i = 0; i < 5; i++) { boxA(0.7 + i * 0.03, 0.73 + i * 0.03, -0.25 - i * 0.08, -0.2 - i * 0.08, -0.01, 0.01, strap, head); }
  const hst = { toss: 0, next: rand(4, 8) };
  onUpdate((t, dt) => {
    hst.next -= dt;
    if (hst.next < 0) { hst.toss = 1; hst.next = rand(6, 12); }
    hst.toss = Math.max(0, hst.toss - dt * 0.9);
    const breathe = Math.sin(t * 1.6) * 0.025;
    harness.position.y = breathe;
    harness.scale.z = 1 + breathe * 0.8;
    head.rotation.z = Math.sin(t * 0.7) * 0.05 + Math.sin(hst.toss * Math.PI) * 0.45;
    head.rotation.y = Math.sin(t * 0.43) * 0.12;
    head.position.y = 2.25 + Math.sin(t * 0.9) * 0.05;
  });
  const pat = () => { hst.toss = 1; sfx('neigh'); say('Something warm snorts into your palm.', {}); };
  hotspot(harness, 'yard', 'Pat the horse (if you can find it)', pat);
  hotspot(S, 'yard', 'The hearse', () => { hst.toss = 1; sfx('neigh'); });
  return { h, pat };
}

// ------------------------------------------------------------------ graveyard
function graveyard(S, G) {
  // perimeter: low stone wall at the back & right, iron fence on top
  boxA(14.6, D.PX1 - 0.2, 0, 0.55, D.PZ0 + 0.2, D.PZ0 + 0.7, MAT.stoneWarm, S);
  boxA(D.PX1 - 0.7, D.PX1 - 0.2, 0, 0.55, D.PZ0 + 0.2, 10.0, MAT.stoneWarm, S);
  fenceRun(S, D.PX1 - 0.45, D.PZ0 + 0.45, D.PX1 - 0.45, 10.0, 1.1).position.y += 0.55;
  fenceRun(S, 14.8, D.PZ0 + 0.45, D.PX1 - 0.45, D.PZ0 + 0.45, 1.1).position.y += 0.55;
  // cellar doors flung open beside the ride's descent
  for (const [z, ry] of [[7.0, -1.0], [9.4, 1.0]]) {
    const dg = new THREE.Group(); dg.position.set(18.6, 0.02, z); dg.rotation.x = ry > 0 ? -0.35 : 0.35; S.add(dg);
    boxA(-2.6, 2.6, 0, 0.1, 0, ry > 0 ? 1.15 : -1.15, MAT.woodDark, dg);
    for (const x of [-1.8, 0, 1.8]) boxA(x - 0.08, x + 0.08, 0.1, 0.14, 0, ry > 0 ? 1.15 : -1.15, MAT.iron, dg);
  }
  boxA(15.4, 21.9, -0.02, 0.12, 6.85, 7.0, MAT.stoneDark, S);
  boxA(15.4, 21.9, -0.02, 0.12, 9.4, 9.55, MAT.stoneDark, S);
  // the spiral tree the ride descends around
  P.deadTree(S, 22.0, 0, -1.8, { h: 25, r: 0.75, seed: 11, m: MAT.bark, spread: 0.8, crown: true });
  // tombstones
  const lines = [
    ['DOCTOR GRAVE', 'prescribed rest', 'and rest he gave'],
    ['POOR NED', 'read in bed', 'a candle tipped', 'now Ned is well-read'],
    ['MADAME FLO', 'always early', 'first to arrive', 'first to leave'],
    ['COUSIN ELMER', 'ate the stew', 'the cook', 'was a ghost too'],
    ['SIR NIGEL', '“go on ahead,', 'I’ll wait', 'for you”'],
    ['OLD BARTLEBY', 'wound the clock', 'to thirteen', 'and stopped'],
  ];
  const faces = lines.map(([t, ...l]) => TX.epitaph(l, { title: t }));
  const graves = [
    [15.8, 4.2, 0.2, 0, 0], [17.2, 5.4, -0.15, 3, 1], [16.0, 2.0, 0.1, 1, -1], [18.6, 3.1, 0.25, 2, -1],
    [15.6, -5.6, 0.3, 0, 2], [17.8, -6.4, -0.2, 3, 3], [19.6, -6.0, 0.1, 1, -1],
    [25.0, -6.2, 0.0, 3, 4], [27.2, -6.6, -0.2, 0, 5], [29.6, -6.0, 0.25, 2, -1], [30.6, -3.6, -0.5, 1, -1],
    [20.4, 6.8, 0.4, 0, -1], [30.4, 1.4, -0.4, 3, -1], [26.4, -3.6, 0.15, 1, -1],
  ];
  const graveSpots = [];
  for (const [x, z, ry, kind, fi] of graves) {
    P.tombstone(S, x, 0, z, ry, { kind, s: rand(0.9, 1.15), m: pick([MAT.tomb, MAT.tombDark]), face: fi >= 0 ? faces[fi] : null });
    graveSpots.push(new THREE.Vector3(x + Math.sin(ry) * 0.9, 0, z + Math.cos(ry) * 0.9));
  }
  // singing busts
  const busts = [];
  const hats = ['top', 'bowler', null, 'curls', 'laurel'];
  const roles = ['the tenor', 'the baritone', 'the alto', 'the basso', 'the soprano'];
  for (let i = 0; i < 5; i++) {
    const x = 24.3 + i * 1.35, z = 1.0 + Math.sin(i * 1.7) * 0.25;
    P.pedestal(S, x, 0, z, 1.05, MAT.tomb);
    const b = P.bust(G, x, 1.05, z, { s: 0.95, ry: -0.18 + i * 0.05, faceMap: T.bust[i][0], hat: hats[i], m: new THREE.MeshStandardMaterial({ color: 0xb4bccc, roughness: 0.5, emissive: 0x3a4a68, emissiveIntensity: 0.18 }) });
    busts.push({ ...b, i, sing: 0, phase: rand(0, TAU), on: true });
  }
  const bustLight = new THREE.PointLight(0x8fb8ff, 9, 8, 1.6); bustLight.position.set(27.0, 3.2, 3.4);
  addLight(bustLight, { room: 'graveyard', flicker: 0.1 });
  onUpdate((t, dt) => {
    const singing = W.audio?.chorusLevel ? W.audio.chorusLevel() : null;
    for (const b of busts) {
      const lvl = singing ? singing[b.i] : (b.on ? 0.5 + 0.5 * Math.sin(t * 2.2 + b.phase) : 0);
      const fr = Math.min(3, Math.floor(lvl * 3.99));
      const fm = b.head.userData.face;
      if (fm && fm.map !== T.bust[b.i][fr]) { fm.map = T.bust[b.i][fr]; fm.emissiveMap = fm.map; }
      b.head.rotation.z = Math.sin(t * 1.4 + b.phase) * 0.06 * (0.3 + lvl);
      b.head.position.y = 0.6 + lvl * 0.03;
    }
  });
  busts.forEach((b) => hotspot(b.g, 'graveyard', `Hear ${roles[b.i]}`, () => { W.audio?.toggleVoice?.(b.i); b.on = !b.on; }));
  const singAll = () => { busts.forEach((b) => { b.on = true; }); W.audio?.setMusicBoost?.('all', 12); say('Five marble heads, one glorious chord.', {}); };
  // crypt with the hitchhikers
  const cg = new THREE.Group(); cg.position.set(25.6, 0, 5.0); S.add(cg);
  boxA(-1.9, 1.9, 0, 0.35, -1.3, 1.3, MAT.stoneWarm, cg);
  boxA(-1.6, 1.6, 0.35, 2.7, -1.1, 0.7, MAT.stone, cg);
  boxA(-0.6, 0.6, 0.35, 2.0, 0.69, 0.75, MAT.void, cg);
  for (const sx of [-1.25, 1.25]) cyl(0.17, 0.2, 2.4, MAT.tomb, sx, 1.55, 0.95, cg, 10);
  boxA(-1.8, 1.8, 2.7, 3.0, -1.25, 1.25, MAT.stoneWarm, cg);
  const ped = new THREE.Shape(); ped.moveTo(-1.85, 0); ped.lineTo(1.85, 0); ped.lineTo(0, 0.9); ped.closePath();
  const pg = new THREE.ExtrudeGeometry(ped, { depth: 2.5, bevelEnabled: false }); pg.translate(0, 3.0, -1.25);
  cg.add(new THREE.Mesh(pg, MAT.stoneWarm));
  const plaque = mesh(new THREE.PlaneGeometry(2.0, 0.4), new THREE.MeshStandardMaterial({ map: TX.labelTex('HITCHHIKERS’ REST', { w: 512, h: 96, fg: '#2a2234', size: 44 }), roughness: 0.9, transparent: true }), 0, 2.36, 0.76, cg);
  const cryptGlow = new THREE.PointLight(0x5dffa0, 10, 8, 1.5); cryptGlow.position.set(25.6, 1.6, 7.2);
  addLight(cryptGlow, { room: 'graveyard', flicker: 0.25, speed: 4 });
  const hikers = [
    makeGhost({ height: 2.5, width: 0.32, hat: 'top', arms: 'hitch', color: 0x9dffc8 }),
    makeGhost({ height: 1.45, width: 0.5, hat: null, arms: 'hitch', color: 0xa8ffd8 }),
    makeGhost({ height: 1.85, width: 0.62, hat: 'bowler', arms: 'hitch', color: 0x8ff5e0 }),
  ];
  const hx = [24.5, 25.6, 26.8];
  hikers.forEach((g, i) => { g.position.set(hx[i], 0.05, 6.75); g.rotation.y = 0.15 - i * 0.12; G.add(g); });
  // ball and chain for the short one, carpetbag for the round one
  const ball = sphere(0.16, MAT.iron, 25.95, 0.16, 7.15, G, 10, 8);
  const chain = cyl(0.02, 0.02, 0.6, MAT.iron, 25.75, 0.3, 7.0, G, 4); chain.rotation.z = 1.0;
  const bag = boxA(27.25, 27.75, 0.35, 0.8, 6.65, 6.95, mat('#5a3a2a', 0.8), G);
  const hst = { wave: 0 };
  onUpdate((t, dt) => {
    hst.wave = Math.max(0, hst.wave - dt * 0.5);
    hikers.forEach((g, i) => { g.position.y = 0.05 + Math.sin(t * 1.5 + i) * 0.05 + hst.wave * Math.abs(Math.sin(t * 6 + i)) * 0.3; g.rotation.z = Math.sin(t * 2 + i * 2) * (0.04 + hst.wave * 0.2); });
  });
  const hitchFn = () => { hst.wave = 1.5; sfx('hitch'); W.ui?.hitchhiker?.(); say('One of them is coming home with you.', {}); };
  hikers.forEach((g) => hotspot(g, 'graveyard', 'Pick up a hitchhiker', hitchFn));
  // the caretaker and his trembling dog
  const ct = new THREE.Group(); ct.position.set(20.6, 0, 5.2); ct.rotation.y = 0.9; G.add(ct);
  const coat = flat('#4a3a2e'), skin = flat('#d8b896');
  const legs = new THREE.Group(); legs.userData.keepGroup = true; ct.add(legs);
  for (const sx of [-0.12, 0.12]) { cyl(0.07, 0.06, 0.7, flat('#2a2420'), sx, 0.35, 0, legs, 6); boxA(sx - 0.08, sx + 0.08, 0, 0.08, -0.05, 0.16, MAT.black, legs); }
  const torso = new THREE.Group(); torso.position.y = 0.7; torso.userData.keepGroup = true; ct.add(torso);
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.8, 8), coat); tb.position.y = 0.38; torso.add(tb);
  torso.rotation.x = 0.35;
  const hd = sphere(0.17, skin, 0, 0.95, 0.08, torso, 8, 6);
  sphere(0.06, flat('#c8987a'), 0, 0.93, 0.25, torso, 5, 4);
  const hatB = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 10), flat('#2a2018')); hatB.position.y = 1.08; torso.add(hatB);
  const hatC = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.18, 10), flat('#2a2018')); hatC.position.y = 1.18; torso.add(hatC);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 5, 10), flat('#7a1a22')); scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.8; torso.add(scarf);
  for (const sx of [-1, 1]) { const arm = cyl(0.05, 0.05, 0.55, coat, sx * 0.26, 0.45, 0.12, torso, 5); arm.rotation.x = -0.9; arm.rotation.z = sx * 0.15; }
  const lan = P.lantern(torso, 0.24, 0.2, 0.42, { s: 0.75 });
  const ctLight = new THREE.PointLight(0xffb060, 8, 7, 1.6); ctLight.position.set(0.24, 1.2, 0.5); ct.add(ctLight);
  addLight(ctLight, { room: 'graveyard', flicker: 0.18, parent: ct });
  const dog = new THREE.Group(); dog.position.set(21.1, 0, 4.4); dog.rotation.y = 1.2; dog.userData.keepGroup = true; G.add(dog);
  const fur = flat('#4e463e');
  const db = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.62, 6), fur); db.rotation.x = Math.PI / 2; db.position.set(0, 0.45, 0); dog.add(db);
  for (const [lx, lz] of [[-0.07, 0.22], [0.07, 0.22], [-0.07, -0.22], [0.07, -0.22]]) cyl(0.02, 0.02, 0.42, fur, lx, 0.21, lz, dog, 4);
  const dh = new THREE.Group(); dh.position.set(0, 0.6, 0.32); dh.userData.keepGroup = true; dog.add(dh);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5), fur); snout.rotation.x = Math.PI / 2; snout.position.z = 0.12; dh.add(snout);
  sphere(0.08, fur, 0, 0.02, 0, dh, 6, 5);
  for (const sx of [-0.05, 0.05]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 3), fur); e.position.set(sx, 0.1, -0.03); e.rotation.x = -0.6; dh.add(e); }
  const tail = cyl(0.012, 0.01, 0.3, fur, 0, 0.36, -0.36, dog, 3); tail.rotation.x = 0.9;
  const cst = { fright: 0 };
  onUpdate((t, dt) => {
    cst.fright = Math.max(0, cst.fright - dt * 0.4);
    const k = 0.012 + cst.fright * 0.05;
    legs.position.x = Math.sin(t * 47) * k * 0.6;
    torso.rotation.z = Math.sin(t * 39) * k;
    dog.position.x = 21.1 + Math.sin(t * 53) * (0.008 + cst.fright * 0.03);
    dh.rotation.y = Math.sin(t * 0.8) * 0.4;
    dh.rotation.x = cst.fright > 0.3 ? -0.5 : 0;
  });
  const booFn = () => { cst.fright = 1.5; sfx('howl'); say('“Oh, it’s you. Don’t do that.”', { who: 'the caretaker' }); };
  hotspot(ct, 'graveyard', 'Say boo to the caretaker', booFn);
  hotspot(dog, 'graveyard', 'Say boo to the caretaker', () => { cst.fright = 1.5; sfx('howl'); });
  // ghosts rising from graves
  const risers = [];
  for (let i = 0; i < 5; i++) {
    const g = makeGhost({ height: rand(1.4, 1.9), width: 0.4, arms: pick(['up', 'out']), color: pick([0x9ffcf0, 0xc8b8ff, 0xa8ffc8]), opacity: 0.85 });
    G.add(g);
    risers.push({ g, spot: graveSpots[(i * 3) % graveSpots.length], t: rand(0, 1), sp: rand(0.07, 0.12) });
  }
  onUpdate((t, dt) => {
    for (const r of risers) {
      r.t += dt * r.sp;
      if (r.t > 1) { r.t = 0; r.spot = pick(graveSpots); }
      const k = r.t < 0.2 ? smooth(r.t / 0.2) : r.t > 0.8 ? smooth((1 - r.t) / 0.2) : 1;
      r.g.position.set(r.spot.x + Math.sin(t + r.sp * 50) * 0.2, -1.8 + k * 2.1 + Math.sin(t * 2) * 0.08, r.spot.z);
      r.g.material.uniforms.uOpacity.value = 0.85 * k;
      r.g.visible = k > 0.01;
      r.g.rotation.y = Math.sin(t * 0.5 + r.sp * 30) * 0.6 + 0.4;
    }
  });
  // tea party at the back
  const tp = new THREE.Group(); tp.position.set(28.4, 0, -4.3); tp.userData.keepGroup = true; G.add(tp);
  const tpS = new THREE.Group(); tp.add(tpS);
  P.roundTable(tpS, 0, 0, 0, 0.6, { h: 0.8, cloth: mat('#a99fb8', 0.9), hem: 0.6 });
  for (const sx of [-1, 1]) { P.chair(tpS, sx * 0.95, 0, 0, sx * -Math.PI / 2, { seat: MAT.velvet, s: 0.85 }); }
  const teaGuests = [makeGhost({ height: 1.6, width: 0.4, hat: 'bun', arms: 'front', color: 0xd8c8ff }), makeGhost({ height: 1.7, width: 0.4, hat: 'top', arms: 'front', color: 0xa8fff0 })];
  teaGuests[0].position.set(-0.95, 0.35, 0); teaGuests[0].rotation.y = Math.PI / 2; teaGuests[1].position.set(0.95, 0.35, 0); teaGuests[1].rotation.y = -Math.PI / 2;
  teaGuests.forEach((g) => { g.scale.y = 0.85; tp.add(g); });
  const pot = new THREE.Group(); pot.userData.keepGroup = true; tp.add(pot);
  const potB = sphere(0.16, mat('#e8eef8', 0.3), 0, 0, 0, pot, 12, 8); potB.scale.y = 0.85;
  const spout = cyl(0.025, 0.04, 0.22, mat('#e8eef8', 0.3), 0.18, 0.04, 0, pot, 6); spout.rotation.z = -1.0;
  onUpdate((t) => { pot.position.set(Math.sin(t * 0.7) * 0.4, 1.35 + Math.sin(t * 1.3) * 0.1, Math.cos(t * 0.7) * 0.15); pot.rotation.z = -0.4 + Math.sin(t * 1.5) * 0.35; teaGuests.forEach((g, i) => { g.position.y = 0.35 + Math.sin(t * 1.4 + i * 2) * 0.04; }); });
  // royal teeter-totter
  const tt = new THREE.Group(); tt.position.set(17.4, 0, -4.4); tt.rotation.y = 0.2; tt.userData.keepGroup = true; G.add(tt);
  const fulc = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 3), MAT.stoneWarm); fulc.position.y = 0.3; fulc.rotation.x = Math.PI / 2; fulc.rotation.z = Math.PI; tt.add(fulc);
  const plank = new THREE.Group(); plank.position.y = 0.62; plank.userData.keepGroup = true; tt.add(plank);
  boxA(-1.7, 1.7, -0.04, 0.04, -0.18, 0.18, MAT.woodWarm, plank);
  const king = makeGhost({ height: 1.6, width: 0.42, hat: 'crown', arms: 'up', color: 0xfff0b8 });
  const queen = makeGhost({ height: 1.5, width: 0.38, flare: 1.6, hat: 'crown', arms: 'up', color: 0xd8c8ff });
  king.position.set(-1.45, 0.02, 0); king.rotation.y = Math.PI / 2; queen.position.set(1.45, 0.02, 0); queen.rotation.y = -Math.PI / 2;
  king.scale.y = 0.8; queen.scale.y = 0.8;
  plank.add(king, queen);
  onUpdate((t) => { plank.rotation.z = Math.sin(t * 1.1) * 0.28; });
  // the opera singer
  const diva = makeGhost({ height: 2.4, width: 0.55, flare: 1.4, skirt: 0.2, hat: 'bun', arms: 'up', color: 0xffd8f0 });
  diva.position.set(30.0, 0.1, -2.0); diva.rotation.y = -0.5; G.add(diva);
  onUpdate((t) => { const cl = W.audio?.chorusLevel?.(); const lv = cl ? Math.max(...cl) : 0.5 + 0.5 * Math.sin(t * 2.2); diva.material.uniforms.uMouth.value = lv; diva.position.y = 0.1 + Math.sin(t * 0.9) * 0.08 + lv * 0.08; });
  const ariaFn = () => { sfx('aria'); say('A high note shatters a lantern somewhere.', { who: 'the soprano' }); };
  hotspot(diva, 'graveyard', 'Request an aria', ariaFn);
  // pumpkins & lanterns
  for (const [x, z, s] of [[19.2, 7.6, 1.1], [23.2, 3.0, 0.9], [29.6, 7.4, 1.2], [16.4, -2.2, 0.9], [22.8, -6.6, 1.0]]) P.jackOLantern(S, x, 0, z, rand(-0.6, 0.6), s);
  for (const [x, z] of [[15.6, 0.6], [24.0, -7.2]]) { cyl(0.06, 0.08, 1.8, MAT.iron, x, 0.9, z, S, 6); P.lantern(S, x, 1.8, z, { s: 1.0, m: MAT.flameGreen }); }
  const gy = defineRoom('graveyard', {
    name: 'The Graveyard',
    blurb: 'Where the happy haunts come out to socialize. The busts are singing, the caretaker’s knees are knocking, and three hitchhikers are looking for a ride.',
    bounds: [14.4, 31.8, 0, 4.2, -7.6, 10.0],
    view: { az: 38, el: 22, dist: 62, target: [23.4, 2.4, 1.6] },
  });
  gy.actions.push({ label: 'Let the busts sing', fn: singAll }, { label: 'Pick up a hitchhiker', fn: hitchFn }, { label: 'Say boo to the caretaker', fn: booFn }, { label: 'Request an aria', fn: ariaFn });
}

function backYard(S, G) {
  // a weeping angel behind the conservatory
  const ag = new THREE.Group(); ag.position.set(9.4, 0, -6.6); ag.rotation.y = Math.PI * 0.1; S.add(ag);
  boxA(-0.45, 0.45, 0, 0.6, -0.45, 0.45, MAT.stoneWarm, ag);
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 8), MAT.tomb); robe.position.y = 1.4; ag.add(robe);
  sphere(0.16, MAT.tomb, 0, 2.3, 0.05, ag, 8, 6);
  for (const sx of [-1, 1]) { const wing = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.4, 4), MAT.tomb); wing.position.set(sx * 0.35, 1.9, -0.25); wing.rotation.set(-0.3, 0, sx * 0.5); wing.scale.z = 0.3; ag.add(wing); }
  const bushM = flat('#1f2a26');
  for (const [x, z] of [[5.6, -6.6], [12.6, -6.9], [-4.0, -6.8], [-9.5, -6.6], [-12.0, -7.0]]) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), bushM); b.position.set(x, 0.5, z); b.scale.set(1.3, 0.75, 0.8); S.add(b); }
  P.deadTree(S, -2.6, 0, -6.7, { h: 7, r: 0.3, seed: 5, m: MAT.barkLight });
}

// ------------------------------------------------------------------ sky: moon, clouds, bats, fog, motes
function sky(root) {
  const moonM = new THREE.MeshBasicMaterial({ map: T.moon, transparent: true, depthWrite: false, color: new THREE.Color(1.55, 1.42, 1.2), fog: false });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), moonM);
  moon.renderOrder = -2;
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: T.glow, transparent: true, depthWrite: false, color: new THREE.Color(0.55, 0.42, 0.75), opacity: 0.45, blending: THREE.AdditiveBlending }));
  halo.renderOrder = -3;
  W.scene.add(moon, halo);
  // clouds
  const cloudTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'); for (let i = 0; i < 18; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 40); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.save(); x.translate(rand(40, 216), rand(40, 88)); x.scale(rand(1, 2.2), rand(0.6, 1)); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 40, 0, TAU); x.fill(); x.restore(); } const t = new THREE.CanvasTexture(c); return t; })();
  const clouds = [];
  for (let i = 0; i < 4; i++) {
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, color: new THREE.Color(0.2, 0.15, 0.32), opacity: 0.55 }));
    cm.renderOrder = -1;
    W.scene.add(cm);
    clouds.push({ m: cm, off: rand(-1, 1), y: rand(-0.35, 0.25), sp: rand(0.006, 0.014), s: rand(22, 34) });
  }
  const tmp = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
  onUpdate((t) => {
    const cam = W.camera;
    cam.getWorldDirection(fwd);
    right.crossVectors(fwd, cam.up).normalize();
    up.crossVectors(right, fwd).normalize();
    const base = tmp.copy(W.controls?.target || new THREE.Vector3(3, 9, 1));
    const far = W.state.mode === 'ride' ? 260 : 210;
    const mp = base.clone().addScaledVector(fwd, far).addScaledVector(right, far * 0.24).addScaledVector(up, far * 0.2);
    if (W.state.mode === 'ride') { mp.copy(cam.position).addScaledVector(fwd, far).addScaledVector(right, far * 0.25).addScaledVector(up, far * 0.25); }
    moon.position.copy(mp); moon.quaternion.copy(cam.quaternion); moon.scale.setScalar(far * 0.105);
    halo.position.copy(mp).addScaledVector(fwd, 2); halo.quaternion.copy(cam.quaternion); halo.scale.setScalar(far * 0.42);
    for (const c of clouds) {
      const k = ((t * c.sp + c.off + 1) % 2) - 1;
      c.m.position.copy(mp).addScaledVector(right, k * far * 0.9).addScaledVector(up, c.y * far * 0.2).addScaledVector(fwd, -6);
      c.m.quaternion.copy(cam.quaternion); c.m.scale.set(c.s * far / 120, c.s * far / 120, 1);
    }
    W.moonPos = mp;
  });
  // bats
  const batM = mat('#0a0810', 0.7, 0, { flat: true, side: THREE.DoubleSide });
  const bats = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), batM); body.scale.set(0.7, 0.7, 1.3); b.add(body);
    const wings = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(sx * 0.7, 0.25); sh.lineTo(sx * 0.6, 0.0); sh.lineTo(sx * 0.48, 0.1); sh.lineTo(sx * 0.36, -0.05); sh.lineTo(sx * 0.22, 0.05); sh.lineTo(0.0, -0.12); sh.closePath();
      const wgeo = new THREE.ShapeGeometry(sh); wgeo.rotateX(-Math.PI / 2);
      const wp = new THREE.Group(); b.add(wp);
      wp.add(new THREE.Mesh(wgeo, batM));
      wings.push({ wp, sx });
    }
    const center = i < 5 ? new THREE.Vector3(0, 27, 0) : new THREE.Vector3(-16.9, 28, 2.0);
    b.scale.setScalar(rand(1.2, 1.9));
    W.scene.add(b);
    bats.push({ b, wings, center, r: rand(5, 11), h: rand(-3, 4), sp: rand(0.35, 0.6) * (rand() < 0.5 ? 1 : -1), ph: rand(0, TAU), fl: rand(9, 13) });
  }
  onUpdate((t, dt) => {
    for (const bt of bats) {
      bt.ph += dt * bt.sp;
      const x = bt.center.x + Math.cos(bt.ph) * bt.r * 1.4, z = bt.center.z + Math.sin(bt.ph * 2) * bt.r * 0.6, y = bt.center.y + bt.h + Math.sin(bt.ph * 3) * 1.5 + (W.roof ? W.roof.roof.position.y * (bt.center.x === 0 ? 1 : 0) : 0);
      const nx = bt.center.x + Math.cos(bt.ph + 0.05 * Math.sign(bt.sp)) * bt.r * 1.4, nz = bt.center.z + Math.sin((bt.ph + 0.05 * Math.sign(bt.sp)) * 2) * bt.r * 0.6;
      bt.b.position.set(x, y, z);
      bt.b.rotation.y = Math.atan2(nx - x, nz - z);
      const f = Math.sin(t * bt.fl + bt.ph) * 0.9;
      for (const w of bt.wings) w.wp.rotation.z = w.sx * f;
    }
  });
  // ground fog sheets
  const fogMat = (color, op) => new THREE.ShaderMaterial({
    uniforms: { uTime: W.U.uTime, uMap: { value: T.fog }, uColor: { value: new THREE.Color(color) }, uOp: { value: op }, uFlash: W.U.uFlash },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uTime; uniform sampler2D uMap; uniform vec3 uColor; uniform float uOp; uniform float uFlash; varying vec2 vUv; varying vec3 vW;
      void main(){ vec2 p = vW.xz * 0.045; float a = texture2D(uMap, p + vec2(uTime*0.012, uTime*0.006)).a; float b = texture2D(uMap, p*1.7 - vec2(uTime*0.009, -uTime*0.011)).a;
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x) * smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
        float d = (a*0.6 + b*0.6) * edge * uOp; gl_FragColor = vec4(uColor * (1.0 + uFlash), d); }`,
    transparent: true, depthWrite: false,
  });
  const fogs = [];
  for (const [x, z, w, d, y, c, op] of [[23, 1.2, 18, 18, 0.35, 0x8fe8c8, 0.32], [23, 1.2, 17, 17, 0.85, 0x9a8ad8, 0.2], [-3, 8.2, 44, 4.6, 0.3, 0x9a8ad8, 0.22], [-1, 8.1, 42, 4.4, -4.9, 0x58e0cf, 0.2], [-21, 7.5, 6, 6, 0.3, 0x8fe8c8, 0.3]]) {
    const fm = mesh(new THREE.PlaneGeometry(w, d), fogMat(c, op), x, y, z, root);
    fm.rotation.x = -Math.PI / 2; fm.renderOrder = 4;
    fogs.push(fm);
  }
  // drifting motes & graveyard wisps
  const N = 260;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const zone = i % 3;
    if (zone === 0) { pos[i * 3] = rand(15, 31); pos[i * 3 + 1] = rand(0.2, 4.5); pos[i * 3 + 2] = rand(-7, 9.5); }
    else if (zone === 1) { pos[i * 3] = rand(-13.5, 13.5); pos[i * 3 + 1] = rand(1, 19); pos[i * 3 + 2] = rand(-4.4, 4.4); }
    else { pos[i * 3] = rand(-22, 14); pos[i * 3 + 1] = rand(0.2, 3.5); pos[i * 3 + 2] = rand(5.5, 10); }
    seed[i] = rand(0, 100);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const pm = new THREE.ShaderMaterial({
    uniforms: { uTime: W.U.uTime, uScale: { value: 1 }, uMap: { value: T.glow } },
    vertexShader: `attribute float seed; uniform float uTime; uniform float uScale; varying float vA; varying float vG;
      void main(){ vec3 p = position; p.x += sin(uTime*0.3 + seed)*0.6; p.y += sin(uTime*0.5 + seed*1.7)*0.4; p.z += cos(uTime*0.27 + seed)*0.6;
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; vG = step(50.0, seed);
        vA = 0.35 + 0.65*pow(0.5+0.5*sin(uTime*1.7 + seed*3.0), 3.0); gl_PointSize = uScale * (vG > 0.5 ? 26.0 : 16.0) / -mv.z * 10.0; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vA; varying float vG; void main(){ vec4 c = texture2D(uMap, gl_PointCoord); vec3 col = vG > 0.5 ? vec3(0.55,1.0,0.75) : vec3(1.0,0.82,0.55); gl_FragColor = vec4(col*1.6, c.a*vA*0.8); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(pg, pm);
  pts.frustumCulled = false;
  root.add(pts);
  onUpdate(() => { pm.uniforms.uScale.value = W.renderer.getPixelRatio() * (W.camera.fov < 30 ? 1.0 : 0.6); });
}
