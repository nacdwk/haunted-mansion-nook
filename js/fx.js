// Weather & magic: lightning, storm rain, the lantern, the hidden haunts and their jubilee.
import { THREE, W, rand, onUpdate, clamp, lerp, damp, smooth, tween, wait, makeGhost, mat, glow, hotspot, TAU, pick, toBin } from './core.js';
import { MAT, T, TX } from './materials.js';
import * as P from './props.js';

const sfx = (n, ...a) => W.audio?.sfx?.(n, ...a);
const say = (text, opts) => W.ui?.say?.(text, opts);

export function buildFx(root) {
  const fx = {};
  W.fx = fx;
  // ---------------------------------------------------------------- lightning
  const L = { t: -1, strength: 1, next: rand(10, 18) };
  const bolt = new THREE.DirectionalLight(0xc8d8ff, 0);
  bolt.position.set(30, 70, -20);
  W.scene.add(bolt);
  fx.lightning = (s = 1) => {
    if (W.state.reduced) s = Math.min(s, 0.45);
    L.t = 0; L.strength = s;
    W.lightningPortraits?.(true);
    setTimeout(() => W.lightningPortraits?.(false), 1400);
    setTimeout(() => sfx('thunder', s), rand(250, 900));
  };
  onUpdate((t, dt) => {
    L.next -= dt;
    if (L.next < 0 && (W.state.mode === 'explore' || W.state.mode === 'focus')) {
      fx.lightning(W.state.storm ? rand(0.7, 1) : rand(0.35, 0.6));
      L.next = W.state.storm ? rand(5, 11) : rand(18, 34);
    }
    let f = 0;
    if (L.t >= 0) {
      L.t += dt;
      const k = L.t;
      f = (k < 0.08 ? k / 0.08 : k < 0.16 ? 1 - (k - 0.08) / 0.08 * 0.7 : k < 0.24 ? 0.3 + (k - 0.16) / 0.08 * 0.6 : Math.max(0, 0.9 - (k - 0.24) * 2.2)) * L.strength;
      if (k > 0.7) L.t = -1;
    }
    W.U.uFlash.value = f;
    bolt.intensity = f * 5.5;
    const sky = W.sky;
    const storm = fx.stormK || 0;
    sky.hemi.intensity = sky.hemiBase * (1 - storm * 0.3) * (W.state.lantern ? 0.42 : 1) + f * 1.2;
    sky.moon.intensity = sky.moonBase * (1 - storm * 0.45) * (W.state.lantern ? 0.45 : 1);
  });
  // ---------------------------------------------------------------- storm (rain)
  const RN = 2600;
  const rp = new Float32Array(RN * 6);
  const rs = new Float32Array(RN * 2);
  for (let i = 0; i < RN; i++) {
    const x = rand(-26, 34), z = rand(-9, 11), y = rand(-2, 40), len = rand(0.6, 1.2), sp = rand(28, 38);
    rp.set([x, y, z, x - 0.12, y - len, z + 0.05], i * 6);
    rs[i * 2] = sp; rs[i * 2 + 1] = sp;
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rg.setAttribute('speed', new THREE.BufferAttribute(rs, 1));
  const rm = new THREE.ShaderMaterial({
    uniforms: { uTime: W.U.uTime, uK: { value: 0 }, uFlash: W.U.uFlash },
    vertexShader: `attribute float speed; uniform float uTime; varying float vA;
      void main(){ vec3 p = position; float yy = mod(p.y - uTime * speed + 2.0, 42.0) - 2.0; p.y = yy + (position.y - floor(position.y)); p.x -= (40.0 - yy) * 0.06;
        vA = smoothstep(-1.5, 2.0, yy); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uK; uniform float uFlash; varying float vA; void main(){ gl_FragColor = vec4(vec3(0.62,0.66,0.95) * (0.6 + uFlash * 2.0), 0.15 * uK * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const rain = new THREE.LineSegments(rg, rm);
  rain.frustumCulled = false; rain.visible = false;
  root.add(rain);
  fx.stormK = 0;
  onUpdate((t, dt) => {
    fx.stormK = damp(fx.stormK, W.state.storm && W.state.mode !== 'ride' ? 1 : 0, 1.2, dt);
    rm.uniforms.uK.value = fx.stormK;
    rain.visible = fx.stormK > 0.01;
    W.post.grade.uniforms.uSat.value = 1.05 - fx.stormK * 0.18;
  });
  fx.setStorm = (on) => { W.state.storm = on; W.audio?.setStorm?.(on); if (on) { L.next = 1.2; } };
  // ---------------------------------------------------------------- lantern
  const lamp = new THREE.SpotLight(0xffc27a, 0, 34, 0.42, 0.75, 1.5);
  lamp.castShadow = false;
  W.scene.add(lamp, lamp.target);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.0, 1, 40), new THREE.MeshBasicMaterial({ map: T.glow, color: 0xffb060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.rotation.x = -Math.PI / 2; halo.renderOrder = 6;
  W.scene.add(halo);
  const LT = { hit: new THREE.Vector3(0, 4, 0), k: 0, has: false };
  fx.lanternAim = (p) => { if (p) { LT.hit.lerp(p, LT.has ? 0.5 : 1); LT.has = true; } };
  fx.setLantern = (on) => { W.state.lantern = on; sfx(on ? 'match' : 'blowout'); };
  const _dir = new THREE.Vector3();
  onUpdate((t, dt) => {
    LT.k = damp(LT.k, W.state.lantern && W.state.mode !== 'ride' ? 1 : 0, 4, dt);
    W.lightMul = lerp(1, 0.32, LT.k);
    W.U.uLanternOn.value = LT.k;
    W.U.uLantern.value.copy(LT.hit);
    _dir.copy(W.camera.position).sub(LT.hit).normalize();
    lamp.position.copy(LT.hit).addScaledVector(_dir, 9).add(new THREE.Vector3(0, 4, 0));
    lamp.target.position.copy(LT.hit);
    lamp.intensity = LT.k * (190 + Math.sin(t * 9) * 9 + Math.sin(t * 23) * 6);
    halo.position.copy(LT.hit).add(new THREE.Vector3(0, 0.08, 0));
    halo.scale.setScalar(2.6);
    halo.material.opacity = LT.k * 0.12;
    halo.visible = LT.k > 0.01;
    for (const h of fx.haunts || []) if (!h.got) h.g.visible = LT.k > 0.01;
  });
  // ---------------------------------------------------------------- hidden haunts
  const spots = [
    { p: [-13.0, 0.95, 0.2], ry: Math.PI / 2, room: 'library', h: 1.0 },
    { p: [0.0, 0.95, -7.3], ry: 0, room: 'hall', h: 0.7 },
    { p: [13.0, 0.85, -4.25], ry: -0.6, room: 'conserv', h: 0.9 },
    { p: [9.1, 7.42, 1.4], ry: 0.4, room: 'seance', h: 0.7 },
    { p: [-6.2, 7.42, -0.55], ry: 0, room: 'ballroom', h: 0.75 },
    { p: [-1.4, 15.35, -3.7], ry: 0.3, room: 'attic', h: 0.5 },
    { p: [-19.2, -5.45, 6.6], ry: 0.5, room: 'basement', h: 0.9 },
    { p: [24.9, -2.3, 10.75], ry: 0, room: 'graveyard', h: 0.9 },
    { p: [-12.2, 2.88, 8.0], ry: 0.8, room: 'yard', h: 0.75 },
  ];
  let found = new Set();
  try { const raw = localStorage.getItem('hmn-haunts'); if (raw) found = new Set(JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  const haunts = spots.map((s, i) => {
    const g = makeGhost({ height: s.h, width: s.h * 0.32, arms: 'out', color: pick([0xffe8a0, 0xa8fff0, 0xffb8e8]), hidden: true, opacity: 1 });
    g.position.set(...s.p); g.rotation.y = s.ry;
    root.add(g);
    const hz = { g, i, room: s.room, got: found.has(i), k: 0 };
    if (hz.got) g.visible = false;
    hotspot(g, s.room, 'A hidden haunt!', () => collect(hz), { active: () => !hz.got && W.state.lantern && LT.hit.distanceTo(g.position) < 3.6 });
    return hz;
  });
  fx.haunts = haunts;
  fx.found = () => haunts.filter((h) => h.got).length;
  const sparkle = (p) => {
    const n = 26;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { arr.set([p.x, p.y + 0.4, p.z], i * 3); vel.push(new THREE.Vector3(rand(-1, 1), rand(0.5, 2.2), rand(-1, 1))); }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ map: T.glow, color: 0xfff0b0, size: 0.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, m); root.add(pts);
    let life = 1.4;
    const fn = (t, dt) => {
      life -= dt;
      for (let i = 0; i < n; i++) { arr[i * 3] += vel[i].x * dt; arr[i * 3 + 1] += vel[i].y * dt; arr[i * 3 + 2] += vel[i].z * dt; vel[i].y -= dt * 1.2; }
      geo.attributes.position.needsUpdate = true;
      m.opacity = Math.max(0, life / 1.4);
      if (life <= 0) { root.remove(pts); geo.dispose(); m.dispose(); W.updaters.splice(W.updaters.indexOf(fn), 1); }
    };
    onUpdate(fn);
  };
  async function collect(hz) {
    if (hz.got) return;
    hz.got = true;
    found.add(hz.i);
    try { localStorage.setItem('hmn-haunts', JSON.stringify([...found])); } catch (e) { /* ignore */ }
    sfx('collect');
    sparkle(hz.g.position);
    hz.g.material.uniforms.uHidden.value = 0;
    const y0 = hz.g.position.y;
    await tween(1.2, (k) => { hz.g.position.y = y0 + k * 3; hz.g.scale.setScalar(1 + k * 0.6); hz.g.material.uniforms.uOpacity.value = 1 - k; });
    hz.g.visible = false;
    const n = fx.found();
    W.ui?.updateHaunts?.(n, haunts.length, true);
    if (n === haunts.length) fx.jubilee();
    else say(`A hidden haunt! ${n} of ${haunts.length} found.`, {});
  }
  fx.resetHaunts = () => {
    found.clear();
    try { localStorage.removeItem('hmn-haunts'); } catch (e) { /* ignore */ }
    haunts.forEach((h, i) => { h.got = false; h.g.visible = true; h.g.position.set(...spots[i].p); h.g.scale.setScalar(1); h.g.material.uniforms.uHidden.value = 1; h.g.material.uniforms.uOpacity.value = 1; });
    W.ui?.updateHaunts?.(0, haunts.length);
  };
  // ---------------------------------------------------------------- jubilee: all the happy haunts come out
  const jub = [];
  fx.jubilee = async () => {
    sfx('jubilee');
    W.audio?.setMusicBoost?.('all', 18);
    say('All the hidden haunts are accounted for. The other 990 would like a word.', { long: true });
    for (let i = 0; i < 36; i++) {
      const g = makeGhost({ height: rand(0.8, 1.6), width: 0.35, arms: pick(['up', 'out']), color: pick([0xa8fff0, 0xd8c8ff, 0xffe8a0, 0xffb8e8, 0x9dffc8]), opacity: 0.9 });
      g.position.set(rand(-14, 14), rand(0, 14), rand(-4, 4));
      root.add(g);
      jub.push({ g, ph: rand(0, TAU), r: rand(10, 26), y: rand(4, 30), sp: rand(0.3, 0.7) * (rand() < 0.5 ? 1 : -1), life: rand(16, 22) });
    }
  };
  onUpdate((t, dt) => {
    for (let i = jub.length - 1; i >= 0; i--) {
      const j = jub[i];
      j.life -= dt; j.ph += dt * j.sp;
      const tx = 4 + Math.cos(j.ph) * j.r, tz = Math.sin(j.ph) * j.r * 0.45, ty = j.y + Math.sin(t * 1.3 + j.ph) * 1.5;
      j.g.position.x = damp(j.g.position.x, tx, 1.2, dt); j.g.position.y = damp(j.g.position.y, ty, 1.2, dt); j.g.position.z = damp(j.g.position.z, tz, 1.2, dt);
      j.g.rotation.y = -j.ph;
      j.g.material.uniforms.uOpacity.value = clamp(j.life / 3) * 0.9;
      if (j.life <= 0) { j.g.removeFromParent(); jub.splice(i, 1); }
    }
  });
  fx.ghostSurge = () => { fx.lightning(0.35); };
  return fx;
}

// coffins, bones and roots in the soil cross-section under the graveyard
export function buildSoil(root) {
  const S = new THREE.Group(); toBin(S);
  const z = 10.5;
  const cof = (x, y, ry, open) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.z = ry; S.add(g);
    const len = 2.6, w = 0.8, h = 0.75;
    const outline = new THREE.Shape();
    outline.moveTo(-len / 2, -h * 0.3); outline.lineTo(-len * 0.2, -h / 2); outline.lineTo(len / 2, -h * 0.36); outline.lineTo(len / 2, h * 0.36); outline.lineTo(-len * 0.2, h / 2); outline.lineTo(-len / 2, h * 0.3); outline.closePath();
    const inner = new THREE.Path(outline.getPoints().map((p) => p.clone().multiplyScalar(0.86)).reverse());
    const frame = new THREE.Shape(outline.getPoints()); frame.holes.push(inner);
    g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(frame, { depth: 0.28, bevelEnabled: false }), MAT.mahogany));
    const back = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(inner.getPoints())), MAT.tufted); back.position.z = 0.02; g.add(back);
    if (open === 'skeleton') {
      const bone = MAT.bone;
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bone); skull.position.set(-0.95, 0, 0.12); g.add(skull);
      for (const sx of [-0.06, 0.06]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), MAT.void); e.position.set(-0.84, sx, 0.25); g.add(e); }
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), bone); spine.rotation.z = Math.PI / 2; spine.position.set(-0.2, 0, 0.1); g.add(spine);
      for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 4, 10, Math.PI), bone); rib.position.set(-0.65 + i * 0.1, 0, 0.1); rib.rotation.y = Math.PI / 2; g.add(rib); }
      for (const sy of [-0.1, 0.1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 5), bone); leg.rotation.z = Math.PI / 2; leg.position.set(0.7, sy, 0.1); g.add(leg); }
      for (const sy of [-0.18, 0.18]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), bone); arm.rotation.z = Math.PI / 2 + sy; arm.position.set(-0.45, sy * 1.1, 0.1); g.add(arm); }
    }
    return g;
  };
  cof(22.6, -3.3, 0.04, 'skeleton');
  cof(27.6, -4.4, -0.06, 'empty');
  cof(30.4, -2.2, 0.12, 'skeleton');
  // a ghost seeping up through the soil from the empty coffin
  const seep = makeGhost({ height: 1.6, width: 0.4, arms: 'up', color: 0x9dffc8, opacity: 0.8 });
  seep.position.set(27.6, -3.8, z + 0.35); S.add(seep);
  onUpdate((t) => { const k = (t * 0.08) % 1; seep.position.y = -4.0 + k * 4.2; seep.material.uniforms.uOpacity.value = Math.sin(k * Math.PI) * 0.8; });
  // roots, a few stray bones, a lost lantern
  for (let i = 0; i < 9; i++) {
    const pts = []; let x = rand(20.8, 31.6), y = -0.6;
    for (let k = 0; k < 6; k++) { pts.push(new THREE.Vector3(x, y, z + 0.02)); x += rand(-0.7, 0.7); y -= rand(0.3, 0.7); }
    S.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, rand(0.04, 0.09), 5), MAT.bark));
  }
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, rand(0.3, 0.6), 5), MAT.bone); b.position.set(rand(21, 31), rand(-5.4, -1.2), z + 0.03); b.rotation.z = rand(0, 3); S.add(b); }
  const sk = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), MAT.bone); sk.position.set(25.2, -1.5, z + 0.06); S.add(sk);
  const lan = P.lantern(S, 29.0, -5.5, z + 0.25, { s: 1.0, m: MAT.flameGreen });
  return S;
}
