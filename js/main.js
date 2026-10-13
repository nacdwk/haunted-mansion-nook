// Entry: renderer, camera, world assembly and the frame loop.
import { THREE, W, updateTweens, updateDissolvers, updateLights, clamp, DEG, compactAll, bake } from './core.js';
import { initFlames } from './props.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setupPost } from './post.js';
import { buildMaterials, T } from './materials.js';
import { buildBase, buildShelf, buildShell, buildMansard, buildRoof, buildTower } from './house.js';
import { buildRooms } from './rooms.js';
import { buildOutside } from './outside.js';
import { buildRide } from './ride.js';
import { buildFx, buildSoil } from './fx.js';
import { createAudio } from './audio.js';
import { buildUI } from './ui.js';
import { loadOfficialArt, applyOfficialArt } from './art.js';

const canvas = document.getElementById('stage');
const status = (s) => { const el = document.getElementById('loader-status'); if (el) el.textContent = s; };
const frame = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; setTimeout(r, 0); } }; requestAnimationFrame(go); setTimeout(go, 60); });

async function boot() {
  W.state.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const query = new URLSearchParams(location.search);
  W.classicFigures = query.get('figures') === '0';   // the older, simpler ghosts and caretaker, for comparison
  const timeout = (ms) => new Promise((_, no) => setTimeout(() => no(new Error('timed out')), ms));
  // the Blender-built sets download while everything else is set up. ?baked=0 shows the procedural house, and
  // ?exterior=0, ?grounds=0, ?endless=0, ?conserv=0 or ?seance=0 the procedural version of just that set; it is also the fallback for any set that fails
  const set = (m, name) => Promise.race([m.loadBakedSet(name), timeout(25000)])
    .catch((e) => { console.warn(`Baked ${name} unavailable, building the procedural one instead:`, e); return null; });
  const bakedSets = query.get('baked') === '0' ? null
    : import('./baked.js').then(async (m) => {
      const [hall, exterior, grounds, endless, conserv, seance, figures] = await Promise.all([set(m, 'grandhall'), query.get('exterior') === '0' ? null : set(m, 'exterior'),
        query.get('grounds') === '0' ? null : set(m, 'grounds'), query.get('endless') === '0' ? null : set(m, 'endless'),
        query.get('conserv') === '0' ? null : set(m, 'conserv'), query.get('seance') === '0' ? null : set(m, 'seance'),
        W.classicFigures ? null : Promise.race([m.loadFigures(), timeout(25000)]).catch((e) => { console.warn('Figures unavailable:', e); return null; })]);
      m.releaseLoaders();
      return { m, hall, exterior, grounds, endless, conserv, seance, figures };
    }).catch((e) => { console.warn('Baked sets unavailable:', e); return null; });
  // the official portraits and wallpaper (js/art.js); ?art=0 shows the house's own painted versions
  const officialArt = query.get('art') === '0' ? null
    : Promise.race([loadOfficialArt(), timeout(15000)])
      .catch((e) => { console.warn('Official art unavailable, using the painted versions:', e); return null; });
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  } catch (e) {
    status('This nook needs WebGL, and your browser declined. Try a recent Chrome, Safari, Edge or Firefox.');
    return;
  }
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const maxDpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
  renderer.setPixelRatio(maxDpr);
  renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight), false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  W.renderer = renderer;

  const scene = new THREE.Scene();
  W.scene = scene;
  const camera = new THREE.PerspectiveCamera(20, Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight), 1, 2000);
  W.camera = camera;
  scene.add(camera);

  status('Mixing the paint…');
  await Promise.race([
    Promise.all([document.fonts.load('48px "IM Fell English SC"'), document.fonts.load('32px "IM Fell English"'), document.fonts.load('italic 32px "IM Fell English"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});
  await frame();
  buildMaterials();
  const art = officialArt && await officialArt;
  if (art) applyOfficialArt(art);
  scene.background = T.bg;

  // lighting
  const hemi = new THREE.HemisphereLight(0x9a86e0, 0x1a1030, 1.15);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb9c4ff, 1.9);
  moon.position.set(46, 62, -38);
  moon.target.position.set(4, 4, 1);
  moon.castShadow = true;
  moon.shadow.mapSize.set(small ? 2048 : 4096, small ? 2048 : 4096);
  const sc = moon.shadow.camera;
  sc.left = -50; sc.right = 50; sc.top = 44; sc.bottom = -44; sc.near = 10; sc.far = 230;
  moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.035;
  scene.add(moon, moon.target);
  const fill = new THREE.DirectionalLight(0xff9ec8, 0.28);
  fill.position.set(-40, 30, 60);
  scene.add(fill);
  W.sky = { hemi, moon, fill, hemiBase: 1.15, moonBase: 1.9, fillBase: 0.28 };

  // controls (needed by some builders)
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.screenSpacePanning = true;
  controls.minDistance = 38; controls.maxDistance = 300;
  controls.minPolarAngle = 45 * DEG; controls.maxPolarAngle = 86 * DEG;
  controls.minAzimuthAngle = -62 * DEG; controls.maxAzimuthAngle = 104 * DEG;
  controls.target.set(4, 9.5, 1);
  W.controls = controls;

  status('Raising the walls…');
  await frame();
  const baked = bakedSets && await bakedSets;
  W.bakedHall = baked?.hall || null;
  W.bakedExterior = baked?.exterior || null;
  W.bakedGrounds = baked?.grounds || null;
  W.bakedEndless = baked?.endless || null;
  W.bakedConserv = baked?.conserv || null;
  W.bakedSeance = baked?.seance || null;
  W.figures = baked?.figures || null;
  const world = new THREE.Group(); world.name = 'world';
  scene.add(world);
  W.world = world;
  buildBase(world);
  buildShelf(world);
  buildShell(world);
  buildMansard(world);
  W.roof = buildRoof(world);
  W.tower = buildTower(world);
  status('Waking the residents…');
  await frame();
  buildRooms(world);
  if (W.bakedHall) baked.m.addBakedHall(world);
  if (W.bakedEndless) baked.m.addBakedEndless(world);
  if (W.bakedConserv) baked.m.addBakedConservatory(world);
  if (W.bakedSeance) baked.m.addBakedSeance(world);
  status('Digging the graveyard…');
  await frame();
  buildOutside(world);
  buildSoil(world);
  if (W.bakedExterior) baked.m.addBakedExterior(world);
  if (W.bakedGrounds) baked.m.addBakedGrounds(world);
  status('Oiling the Doom Buggies…');
  await frame();
  const post = setupPost(renderer, scene, camera);
  W.post = post;
  buildRide(world);
  buildFx(world);
  W.audio = createAudio();
  buildUI();
  W.ui.updateHaunts(W.fx.found(), W.fx.haunts.length);

  let lastW = 0, lastH = 0;
  function onResize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.resize(w, h);
  }
  window.addEventListener('resize', onResize);
  onResize();

  // merge static props, then warm up shaders for the render target we actually draw into
  status('Lighting the candles…');
  await frame();
  if (W.staticBin) bake(W.staticBin, world);
  compactAll(world);
  // things that move must not cast shadows (the shadow map is only redrawn when the architecture moves)
  const anim = (o) => { while (o && o !== world) { if (o.userData.keep || o.userData.keepGroup) return true; o = o.parent; } return false; };
  world.traverse((o) => { if (o.isMesh && anim(o)) o.castShadow = false; });
  initFlames(scene);
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  try {
    renderer.setRenderTarget(post.composer.renderTarget1);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);
  } catch (e) { /* ignore */ }
  renderer.setRenderTarget(null);
  performance.mark('nook-ready');
  W.ui.showIntro();
  document.getElementById('loader')?.classList.add('done');
  window.__W = W;

  let last = performance.now();
  let perfAcc = 0, perfN = 0, dpr = maxDpr, shadowClock = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(Math.max(dt, 0), 0.05);
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) onResize();
    if (window.innerWidth < 2 || window.innerHeight < 2) return;
    W.dt = dt; W.t += dt;
    W.U.uTime.value = W.t;
    for (let i = 0; i < W.updaters.length; i++) {
      try { W.updaters[i](W.t, dt); }
      catch (err) { console.error('updater failed and was removed', err); W.updaters.splice(i, 1); i--; }
    }
    updateTweens(dt);
    if (controls.enabled) {
      controls.update();
      const tg = controls.target;
      tg.x = clamp(tg.x, -30, 40); tg.y = clamp(tg.y, -6, 30); tg.z = clamp(tg.z, -10, 14);
    }
    updateDissolvers(dt);
    updateLights(W.t, dt);
    shadowClock += dt;
    if (W.shadowDirty > 0 || shadowClock > 0.6) { renderer.shadowMap.needsUpdate = true; W.shadowDirty = Math.max(0, W.shadowDirty - 1); shadowClock = 0; }
    post.update(dt);
    post.composer.render(dt);
    // adaptive resolution (steps down only)
    perfAcc += dt; perfN++;
    if (perfAcc > 3) {
      const avg = perfAcc / perfN;
      if (avg > 1 / 36 && dpr > 1.0) { dpr = Math.max(1.0, dpr - 0.25); renderer.setPixelRatio(dpr); onResize(); }
      perfAcc = 0; perfN = 0;
    }
  }
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  status('The spirits are unsettled: ' + (e && e.message ? e.message : e));
});
