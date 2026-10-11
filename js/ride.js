// The Doom Buggy track, the buggies, and the first-person ride.
import { THREE, W, cyl, mesh, sphere, TAU, rand, onUpdate, clamp, lerp, damp, smooth, tween, wait, easeInOut, makeGhost, mat, prepGeo } from './core.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { MAT } from './materials.js';

const sfx = (n, ...a) => W.audio?.sfx?.(n, ...a);
const say = (text, opts) => W.ui?.say?.(text, opts);

// control points: p = rail position; look = what riders face (null: straight ahead); tag = narration cue
const HX = 22.0, HZ = -1.8, HR = 3.4;
function helixPts() {
  const out = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const a = (135 - 360 * k) * Math.PI / 180;
    out.push({ p: [HX + Math.cos(a) * HR, lerp(12.6, 0.75, k), HZ + Math.sin(a) * HR], look: [8, 12 - k * 8, 0], out: true, brace: true, tag: i === 3 ? 'drop' : null });
  }
  return out;
}
const CP = [
  { p: [6.6, -5.25, 8.2], look: [3.0, -2.8, 5.8], tag: 'board' },
  { p: [1.0, -5.25, 8.2], look: [-2.0, -2.8, 5.8], tag: 'portraits' },
  { p: [-5.0, -5.25, 8.2], look: [-8.0, -2.8, 5.8] },
  { p: [-11.0, -5.25, 8.2], look: [-14.0, -2.8, 5.8] },
  { p: [-16.2, -5.22, 8.1], look: null },
  { p: [-19.2, -5.0, 7.2], look: null, tunnel: true },
  { p: [-19.4, -4.4, 5.2], look: null, tunnel: true },
  { p: [-17.8, -3.0, 3.6], look: null, tunnel: true },
  { p: [-15.2, -1.6, 3.2], look: null, tunnel: true },
  { p: [-13.0, -0.5, 3.3], look: null, tunnel: true },
  { p: [-12.0, 0.95, 3.45], look: [-11.0, 3.6, -3.5], tag: 'library' },
  { p: [-9.8, 1.05, 3.5], look: [-11.5, 3.2, -1.5] },
  { p: [-6.8, 1.05, 3.5], look: [-9.0, 3.0, -4.0] },
  { p: [-4.67, 1.05, 3.5], look: [-2.0, 2.6, -4.0] },
  { p: [-1.6, 1.05, 3.5], look: [0, 2.4, -7.5], tag: 'hall' },
  { p: [1.6, 1.05, 3.5], look: [0, 2.4, -7.5] },
  { p: [4.67, 1.05, 3.5], look: [8.6, 1.9, -1.1] },
  { p: [7.6, 1.05, 3.5], look: [8.6, 1.9, -1.1], tag: 'conserv' },
  { p: [11.0, 1.05, 3.5], look: [8.6, 1.9, -1.1] },
  { p: [13.9, 1.15, 3.5], look: null },
  { p: [15.9, 1.9, 3.15], look: [24, 4, 6], out: true, post: true, tag: 'outside' },
  { p: [17.2, 3.4, 1.4], look: [26, 5, 2], out: true, post: true },
  { p: [17.4, 5.0, -0.9], look: [26, 6, -4], out: true, post: true },
  { p: [16.3, 6.5, -2.9], look: null, out: true, post: true },
  { p: [14.4, 7.6, -3.4], look: null },
  { p: [12.4, 7.65, -3.4], look: [9.4, 9.6, 0.9], tag: 'seance' },
  { p: [8.6, 7.65, -3.4], look: [9.4, 9.4, 0.9] },
  { p: [4.67, 7.68, -3.4], look: [0, 8.6, 2.0] },
  { p: [2.0, 8.82, -3.4], look: [-3.5, 8.4, 2.4], tag: 'ballroom' },
  { p: [-2.0, 10.57, -3.4], look: [-5.4, 8.4, 2.0] },
  { p: [-6.0, 12.32, -3.4], look: [-9.5, 8.8, 1.5] },
  { p: [-9.0, 13.62, -3.4], look: [-12.5, 9.5, 1.0] },
  { p: [-11.0, 14.25, -3.25], look: null },
  { p: [-12.3, 14.25, -1.6], look: null },
  { p: [-12.0, 14.25, 1.0], look: [-6.6, 15.0, -0.5] },
  { p: [-10.2, 14.25, 2.3], look: [-6.6, 15.0, -0.6], tag: 'attic' },
  { p: [-5.5, 14.25, 2.3], look: [-1.0, 15.4, -1.8] },
  { p: [0.0, 14.25, 2.3], look: [1.0, 15.6, -1.6] },
  { p: [5.0, 14.25, 2.3], look: [8.6, 15.0, -2.0] },
  { p: [10.0, 14.3, 2.3], look: [9.6, 15.0, -2.2] },
  { p: [13.8, 14.55, 2.3], look: null },
  { p: [16.8, 14.0, 2.0], look: [6, 15, 0] },
  ...helixPts().slice(1),
  { p: [21.8, 0.55, 2.9], look: [26.5, 2.0, 0.8], out: true, tag: 'graveyard' },
  { p: [25.0, 0.55, 3.35], look: [26.0, 2.0, 0.9], out: true },
  { p: [28.4, 0.55, 3.0], look: [28.8, 1.8, -3.0], out: true },
  { p: [30.2, 0.55, 5.0], look: [27.0, 1.6, 1.0], out: true },
  { p: [29.4, 0.55, 8.1], look: [26.0, 1.5, 6.3], out: true, tag: 'crypt' },
  { p: [26.6, 0.55, 9.15], look: [25.6, 1.5, 6.2], out: true },
  { p: [23.4, 0.55, 8.9], look: [21.0, 1.2, 5.0], out: true },
  { p: [21.4, 0.3, 8.2], look: null },
  { p: [19.0, -1.4, 8.2], look: null },
  { p: [16.2, -3.6, 8.2], look: null },
  { p: [13.6, -5.2, 8.2], look: [10.0, -3.6, 5.8], tag: 'mirror' },
  { p: [10.0, -5.25, 8.2], look: [10.0, -3.7, 5.8] },
];

export function buildRide(root) {
  const pts = CP.map((c) => new THREE.Vector3(...c.p));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  curve.arcLengthDivisions = 2400;
  const L = curve.getLength();
  // u for each control point
  const samples = 1600;
  const sp = [];
  for (let i = 0; i < samples; i++) sp.push(curve.getPointAt(i / samples));
  const cpU = pts.map((p, idx) => {
    let best = 0, bd = 1e9;
    for (let i = 0; i < samples; i++) { const d = sp[i].distanceToSquared(p); if (d < bd) { bd = d; best = i; } }
    return best / samples;
  });
  // keep cpU monotonic
  for (let i = 1; i < cpU.length; i++) if (cpU[i] < cpU[i - 1]) cpU[i] = cpU[i - 1] + 1e-4;
  const keys = CP.map((c, i) => ({ ...c, u: cpU[i] }));
  const segAt = (u) => {
    u = ((u % 1) + 1) % 1;
    let i = keys.length - 1;
    for (let k = 0; k < keys.length; k++) { if (keys[k].u > u) { i = k - 1; break; } }
    if (i < 0) i = keys.length - 1;
    const a = keys[i], b = keys[(i + 1) % keys.length];
    let span = b.u - a.u; if (span <= 0) span += 1;
    let f = u - a.u; if (f < 0) f += 1;
    return { a, b, f: clamp(f / span), i };
  };
  const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _ta = new THREE.Vector3(), _tb = new THREE.Vector3();
  const lookAtU = (u, out) => {
    const { a, b, f } = segAt(u);
    const pos = curve.getPointAt(((u % 1) + 1) % 1, _p);
    const ahead = curve.getPointAt((((u + 6 / L) % 1) + 1) % 1, _q);
    const fwd = _ta.copy(ahead).add(new THREE.Vector3(0, 1.3, 0));
    const ta = a.look ? _tb.set(...a.look) : fwd.clone();
    const tb = b.look ? new THREE.Vector3(...b.look) : fwd.clone();
    out.copy(ta).lerp(tb, smooth(f));
    return out;
  };
  // ---------------------------------------------------------------- rail
  const railG = new THREE.Group(); root.add(railG);
  const tube = new THREE.TubeGeometry(curve, 1400, 0.075, 6, true);
  const railM = mat('#18141e', 0.4, 0.7);
  const rail = new THREE.Mesh(tube, railM); rail.castShadow = true; railG.add(rail);
  const tube2 = new THREE.TubeGeometry(curve, 1400, 0.03, 4, true);
  const rail2 = new THREE.Mesh(tube2, MAT.brass); rail2.position.y = 0.16; railG.add(rail2);
  // supports for the outdoor stretches
  const postM = mat('#1d1824', 0.5, 0.6);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!k.out) continue;
    const nxt = keys[(i + 1) % keys.length];
    if (!nxt.out) continue;
    for (const f of [0.0, 0.5]) {
      const u = k.u + (nxt.u - k.u) * f;
      const p = curve.getPointAt(u);
      if (k.brace) {
        const dx = HX - p.x, dz = HZ - p.z, dist = Math.hypot(dx, dz);
        const br = cyl(0.04, 0.04, dist, postM, (p.x + HX) / 2, p.y - 0.1, (p.z + HZ) / 2, railG, 5);
        br.rotation.z = Math.PI / 2; br.rotation.y = -Math.atan2(dz, dx);
      } else if (p.y > 1.0) {
        const pc = cyl(0.06, 0.09, p.y, postM, p.x, p.y / 2, p.z, railG, 6); pc.castShadow = true;
      }
    }
  }
  // ---------------------------------------------------------------- buggies (instanced)
  const prof = [[0.02, 0.0], [0.42, 0.02], [0.7, 0.16], [0.82, 0.42], [0.86, 0.78], [0.84, 1.18], [0.76, 1.56], [0.6, 1.88], [0.36, 2.08], [0.1, 2.16], [0.0, 2.17]].map(([r, y]) => new THREE.Vector2(r, y));
  const lower = prof.filter((v) => v.y <= 0.95); lower.push(new THREE.Vector2(0.86, 0.95));
  const upper = [new THREE.Vector2(0.86, 0.95), ...prof.filter((v) => v.y > 0.95)];
  const outerG = mergeGeometries([
    prepGeo(new THREE.LatheGeometry(lower, 22)),
    prepGeo(new THREE.LatheGeometry(upper, 22, 1.0, TAU - 2.0)),
  ]);
  const innerLower = lower.map((v) => new THREE.Vector2(v.x * 0.93, v.y + 0.02));
  const innerUpper = upper.map((v) => new THREE.Vector2(v.x * 0.93, Math.min(v.y, 2.12)));
  const ig1 = new THREE.LatheGeometry(innerLower, 22), ig2 = new THREE.LatheGeometry(innerUpper, 22, 1.0, TAU - 2.0);
  const seat = new THREE.BoxGeometry(1.2, 0.28, 0.62); seat.translate(0, 0.8, -0.12);
  const back = new THREE.BoxGeometry(1.2, 0.8, 0.16); back.translate(0, 1.3, -0.48);
  const innerG = mergeGeometries([prepGeo(ig1), prepGeo(ig2), prepGeo(seat), prepGeo(back)]);
  const bar = new THREE.TorusGeometry(0.58, 0.05, 6, 18, Math.PI * 0.9); bar.rotateZ(Math.PI * 0.05); bar.rotateX(-Math.PI / 2 + 0.2); bar.translate(0, 1.02, 0.36);
  const mount = new THREE.CylinderGeometry(0.1, 0.16, 0.4, 8); mount.translate(0, -0.12, 0);
  const trim = new THREE.TorusGeometry(0.86, 0.035, 5, 28, TAU - 2.0); trim.rotateX(Math.PI / 2); trim.rotateY(1.0 - Math.PI / 2); trim.translate(0, 0.95, 0);
  const metalG = mergeGeometries([prepGeo(bar), prepGeo(mount), prepGeo(trim)]);
  const outerM = new THREE.MeshStandardMaterial({ color: 0x2a1c3c, roughness: 0.32, metalness: 0.35, emissive: 0x120820, emissiveIntensity: 0.6 });
  const innerM = new THREE.MeshStandardMaterial({ color: 0x8a5ec2, roughness: 0.85, side: THREE.BackSide, emissive: 0x2a1240, emissiveIntensity: 0.4 });
  const innerFront = new THREE.MeshStandardMaterial({ color: 0x8a5ec2, roughness: 0.85, emissive: 0x2a1240, emissiveIntensity: 0.4 });
  const metalM = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.35, metalness: 0.85 });
  const N = Math.max(12, Math.floor(L / 8.6));
  const scale = 0.74;
  const imOuter = new THREE.InstancedMesh(outerG, outerM, N);
  const imInner = new THREE.InstancedMesh(innerG, innerM, N);
  const imMetal = new THREE.InstancedMesh(metalG, metalM, N);
  for (const im of [imOuter, imInner, imMetal]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(im); im.frustumCulled = false; }
  imInner.castShadow = false;
  // first-person buggy (used during the ride, so the mirror can see it)
  const fp = new THREE.Group(); fp.visible = false; fp.userData.noCompact = true; root.add(fp);
  const fpLining = new THREE.MeshStandardMaterial({ color: 0x3a2552, roughness: 0.9, side: THREE.DoubleSide });
  const fpShell = [new THREE.Mesh(outerG, outerM), new THREE.Mesh(innerG, fpLining)];
  fpShell.forEach((m) => { m.visible = false; });
  fp.add(...fpShell, new THREE.Mesh(metalG, metalM));
  fp.scale.setScalar(scale);
  const hitch = makeGhost({ height: 1.55, width: 0.4, hat: 'top', arms: 'hitch', color: 0xb8ffe0, opacity: 0 });
  hitch.position.set(-0.42, 0.62, -0.18); hitch.visible = false; fp.add(hitch);
  // ---------------------------------------------------------------- state & update
  const st = { trainU: 0.0, speed: 2.9, rider: -1, riding: false, riderU: 0, fade: 0, mirrorOn: false, hitch: 0, look: new THREE.Vector3(), yawOff: 0, pitchOff: 0, drag: null, lastTag: null };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(scale, scale, scale), zero = new THREE.Vector3(0, 0, 0);
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3(), tan = new THREE.Vector3();
  const buggyPose = (u, outPos, outQuat) => {
    u = ((u % 1) + 1) % 1;
    curve.getPointAt(u, outPos);
    lookAtU(u, tgt);
    curve.getTangentAt(u, tan);
    const yaw = Math.atan2(tgt.x - outPos.x, tgt.z - outPos.z);
    const pitch = clamp(-Math.asin(clamp(tan.y, -1, 1)) * 0.45, -0.35, 0.35) * Math.abs(Math.cos(yaw - Math.atan2(tan.x, tan.z)));
    e.set(pitch, yaw, 0, 'YXZ');
    outQuat.setFromEuler(e);
    outPos.y += 0.18;
  };
  const tmpQ = new THREE.Quaternion();
  onUpdate((t, dt) => {
    // the train eases down for the mirror reveal while you are riding
    let slow = 1;
    if (st.riding && W.mirrorSpot) {
      const fx = fp.position.x, fy = fp.position.y;
      if (fy < -2.5 && fx < 15.5 && fx > 6.0) slow = 0.32;
    }
    st.slow = damp(st.slow ?? 1, slow, 2.5, dt);
    const sp = st.speed * st.slow * (W.state.reduced ? 0.8 : 1);
    st.trainU = (((st.trainU + dt * sp / L) % 1) + 1) % 1;
    if (!Number.isFinite(st.trainU)) st.trainU = 0;
    for (let i = 0; i < N; i++) {
      const u = (st.trainU + i / N) % 1;
      buggyPose(u, pos, tmpQ);
      if (st.riding && i === st.rider) { m4.compose(pos, tmpQ, zero); fp.position.copy(pos); fp.quaternion.copy(tmpQ); st.riderU = u; }
      else m4.compose(pos, tmpQ, sc);
      imOuter.setMatrixAt(i, m4); imInner.setMatrixAt(i, m4); imMetal.setMatrixAt(i, m4);
    }
    imOuter.instanceMatrix.needsUpdate = true; imInner.instanceMatrix.needsUpdate = true; imMetal.instanceMatrix.needsUpdate = true;
  });
  // ---------------------------------------------------------------- mirror
  let reflector = null;
  { const ms = W.mirrorSpot; const ml = new THREE.PointLight(0xc8b8ff, 0, 9, 1.4); ml.position.set(ms.x, ms.y + 0.4, ms.z + 2.6); root.add(ml); st.mirrorLight = ml; }
  const ensureMirror = () => {
    if (reflector) return reflector;
    const ms = W.mirrorSpot;
    reflector = new Reflector(new THREE.PlaneGeometry(ms.w, ms.h), { textureWidth: 768, textureHeight: 672, color: 0xd8d4f0, clipBias: 0.003 });
    reflector.position.set(ms.x, ms.y, ms.z + 0.01);
    reflector.visible = false;
    const orig = reflector.onBeforeRender.bind(reflector);
    reflector.onBeforeRender = (r, s, c) => { hitch.visible = st.hitch > 0.01; fpShell.forEach((m) => { m.visible = true; }); orig(r, s, c); hitch.visible = false; fpShell.forEach((m) => { m.visible = false; }); };
    root.add(reflector);
    return reflector;
  };
  W.ride = { curve, keys, L, st, start: () => startRide(), stop: () => stopRide(), active: () => st.riding || st.intro, lookAtU, N };
  // ---------------------------------------------------------------- the ride itself
  const cam = () => W.camera;
  const lines = {
    board: ['Your Doom Buggy awaits. Keep your hands inside. The residents grab.'],
    portraits: ['Mind the portraits. They change their minds when the lightning strikes.'],
    library: ['The library. Every book was written by a guest who stayed a little too long.', 'The busts are great admirers of yours. They will not look away.'],
    hall: ['A hallway with no end, and a candelabra with no one to carry it. Do not follow it.'],
    conserv: ['The conservatory, where nothing grows but restlessness.', 'Someone in that box is very eager to meet you.'],
    outside: ['A breath of night air before we go up. Do not look down.'],
    seance: ['The medium will call the spirits out for us. Listen closely…', 'Candle and cobweb, lantern and bone, spirits who wander and spirits alone…'],
    ballroom: ['They have gathered for a party. It has been going on for a hundred years.', 'Nobody remembers whose birthday it is. Nobody minds.'],
    attic: ['The attic. A bride, a candle, and a heart that will not stop beating.', 'Best not to keep her company.'],
    drop: ['And now we go down, backwards, as all the best exits are.'],
    graveyard: ['The happy haunts have come out to socialize, and the busts insist on singing.'],
    crypt: ['Beware of hitchhiking ghosts. They are looking for a ride, and they are not picky.'],
    mirror: ['Look into the mirror. Did you bring a friend?'],
  };
  async function startRide() {
    if (st.riding || st.intro) return;
    st.intro = true;
    W.state.mode = 'ride';
    W.ui?.rideMode?.(true);
    W.audio?.setScene?.('ride');
    const c = cam();
    W.controls.enabled = false;
    const fromPos = c.position.clone(), fromQ = c.quaternion.clone(), fromFov = c.fov;
    const T0 = W.tower.group.position;
    const inPos = new THREE.Vector3(T0.x + 0.6, 2.35, T0.z + 1.4);
    const inLook = new THREE.Vector3(T0.x, 4.2, T0.z - 2.77);
    const toQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(inPos, inLook, new THREE.Vector3(0, 1, 0)));
    W.post.tilt.amount = 0;
    await tween(2.6, (k) => {
      c.position.lerpVectors(fromPos, inPos, k);
      c.quaternion.slerpQuaternions(fromQ, toQ, k);
      c.fov = lerp(fromFov, 58, k); c.updateProjectionMatrix();
    });
    if (!st.intro) return;
    say('Good evening, and welcome, curious mortal.', { who: 'your ghost host', long: true });
    await wait(3.0);
    if (!st.intro) return;
    say('This chamber has no windows and no doors. Kindly look at the portraits.', { who: 'your ghost host', long: true });
    W.tower.st.target = 1; sfx('stretch');
    const lookUp = new THREE.Vector3(T0.x, 7.5, T0.z - 2.77);
    const q2 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(inPos, lookUp, new THREE.Vector3(0, 1, 0)));
    tween(6.0, (k) => { c.quaternion.slerpQuaternions(toQ, q2, k); c.fov = lerp(58, 48, k); c.updateProjectionMatrix(); });
    await wait(3.4);
    if (!st.intro) return;
    say('Is this room actually stretching? Or is it your imagination?', { who: 'your ghost host', long: true });
    await wait(3.4);
    if (!st.intro) return;
    W.fx?.lightning?.(1); sfx('scream');
    await wait(0.5);
    await tween(0.9, (k) => { W.post.grade.uniforms.uFade.value = k; });
    W.tower.st.target = 0;
    // board the buggy whose u is just before the load point
    const uLoad = keys[0].u;
    let best = 0, bd = 9;
    for (let i = 0; i < N; i++) { const u = (st.trainU + i / N) % 1; let d = uLoad - u; if (d < 0) d += 1; if (d < bd) { bd = d; best = i; } }
    st.rider = best; st.riding = true; st.intro = false; st.startU = (st.trainU + best / N) % 1; st.travelled = 0; st.prevU = st.startU;
    st.lastTag = null; st.hitch = 0; fp.visible = true; hitch.material.uniforms.uOpacity.value = 0;
    st.look.copy(lookAtU(st.startU, new THREE.Vector3()));
    ensureMirror();
    await wait(0.4);
    await tween(1.0, (k) => { W.post.grade.uniforms.uFade.value = 1 - k; });
  }
  async function stopRide(fromEnd = false) {
    if (!st.riding && !st.intro) return;
    const wasIntro = st.intro;
    st.intro = false;
    await tween(0.7, (k) => { W.post.grade.uniforms.uFade.value = Math.max(W.post.grade.uniforms.uFade.value, k); });
    st.riding = false; fp.visible = false;
    if (reflector) reflector.visible = false;
    if (W.mirrorSpot) W.mirrorSpot.dark.visible = true;
    W.tower.st.target = 0;
    const c = cam();
    c.fov = 20; c.updateProjectionMatrix();
    W.state.mode = 'explore';
    W.ui?.rideMode?.(false);
    W.audio?.setScene?.('explore');
    W.post.tilt.amount = 1.7;
    W.controls.enabled = true;
    W.resetView?.(true);
    await tween(1.0, (k) => { W.post.grade.uniforms.uFade.value = 1 - k; });
    if (fromEnd && st.hitch > 0.5) { W.ui?.hitchhiker?.(); }
    if (fromEnd) say('Hurry back. We will leave a candle burning for you.', { who: 'your ghost host', long: true });
  }
  const _lt = new THREE.Vector3(), _cq = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _eye = new THREE.Vector3(), _fw = new THREE.Vector3();
  onUpdate((t, dt) => {
    if (!st.riding) return;
    const c = cam();
    const u = st.riderU;
    // progress & end
    let du = u - st.prevU; if (du < -0.5) du += 1;
    st.travelled += Math.max(0, du); st.prevU = u;
    if (st.travelled > 0.999) { stopRide(true); return; }
    // narration cues
    const { a, b, f } = segAt(u);
    const tag = a.tag;
    if (tag && tag !== st.lastTag) {
      st.lastTag = tag;
      const ls = lines[tag];
      if (ls) ls.forEach((l, i) => setTimeout(() => { if (st.riding) say(l, { who: 'your ghost host', long: true }); }, i * 3600));
      W.audio?.setScene?.(tag);
      W.ui?.rideProgress?.(tag);
      if (tag === 'seance') W.seance && (W.seance.sst.speak = 6, W.seance.sst.frenzy = 0.8);
      if (tag === 'crypt') st.hitchOn = true;
      if (tag === 'drop') sfx('whoosh');
    }
    // tunnel fades
    const inTunnel = (a.tunnel && (b.tunnel || f < 0.7)) || (b.tunnel && f > 0.5);
    st.fade = damp(st.fade, inTunnel ? 1 : 0, 6, dt);
    if (!st.ending) W.post.grade.uniforms.uFade.value = st.fade * 0.96;
    // hitchhiker appears after the crypt
    if (st.hitchOn) st.hitch = Math.min(1, st.hitch + dt * 0.5);
    hitch.material.uniforms.uOpacity.value = st.hitch * 1.25;
    // mirror
    const nearMirror = Math.abs(fp.position.x - W.mirrorSpot.x) < 9 && fp.position.y < -2;
    if (reflector) { reflector.visible = nearMirror; W.mirrorSpot.dark.visible = !nearMirror; if (st.mirrorLight) st.mirrorLight.intensity = nearMirror ? 22 : 0; }
    // camera: eye in the buggy, looking toward the scene with smoothing + drag offsets
    _eye.set(0, 1.4, -0.3).applyQuaternion(fp.quaternion).multiplyScalar(scale).add(fp.position);
    c.position.copy(_eye);
    lookAtU(u, _lt);
    st.look.lerp(_lt, 1 - Math.exp(-dt * 2.2));
    if (!st.drag) { st.yawOff = damp(st.yawOff, 0, 0.8, dt); st.pitchOff = damp(st.pitchOff, 0, 0.8, dt); }
    _m.lookAt(_eye, st.look, _up);
    _cq.setFromRotationMatrix(_m);
    const off = new THREE.Quaternion().setFromEuler(new THREE.Euler(st.pitchOff, st.yawOff, 0, 'YXZ'));
    _cq.multiply(off);
    c.quaternion.slerp(_cq, 1 - Math.exp(-dt * 6));
    if (Math.abs(c.fov - 64) > 0.1) { c.fov = damp(c.fov, 64, 3, dt); c.updateProjectionMatrix(); }
  });
  // drag to look around while riding
  const el = W.renderer.domElement;
  el.addEventListener('pointerdown', (ev) => { if (st.riding) st.drag = { x: ev.clientX, y: ev.clientY, yaw: st.yawOff, pitch: st.pitchOff }; });
  window.addEventListener('pointermove', (ev) => { if (st.drag) { st.yawOff = clamp(st.drag.yaw - (ev.clientX - st.drag.x) * 0.004, -1.2, 1.2); st.pitchOff = clamp(st.drag.pitch - (ev.clientY - st.drag.y) * 0.003, -0.6, 0.6); } });
  window.addEventListener('pointerup', () => { st.drag = null; });
  return W.ride;
}
