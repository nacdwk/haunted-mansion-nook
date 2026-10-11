// UI: picking, hover labels, room focus, dock controls, captions, ride overlay, the hitchhiker.
import { THREE, W, tween, easeInOut, lerp, clamp, damp, DEG, onUpdate, wait } from './core.js';

const ORDER = ['tower', 'library', 'hall', 'conserv', 'seance', 'ballroom', 'attic', 'basement', 'graveyard', 'yard'];
const RIDE_STEPS = [['portraits', 'Portraits'], ['library', 'Library'], ['hall', 'Endless Hall'], ['conserv', 'Conservatory'], ['seance', 'Séance'], ['ballroom', 'Grand Hall'], ['attic', 'Attic'], ['graveyard', 'Graveyard'], ['crypt', 'Crypt'], ['mirror', 'Mirror']];
const GHOST_PATH = 'M7.5 1C11.6 1 14 4.2 14 8.4V17l-1.6-1.5L10.8 17l-1.6-1.5L7.5 17l-1.7-1.5L4.2 17l-1.6-1.5L1 17V8.4C1 4.2 3.4 1 7.5 1z';

export function buildUI() {
  const $ = (id) => document.getElementById(id);
  const ui = {};
  W.ui = ui;
  const sfx = (n, ...a) => W.audio?.sfx?.(n, ...a);
  const show = (el, on) => el.classList.toggle('off', !on);

  // ------------------------------------------------ captions & toasts
  let capTimer = 0;
  ui.say = (text, { who = '', long = false } = {}) => {
    $('cap-who').textContent = who || '';
    $('cap-line').textContent = text;
    show($('caption'), true);
    clearTimeout(capTimer);
    capTimer = setTimeout(() => show($('caption'), false), Math.max(2600, text.length * (long ? 62 : 55)));
  };
  let toastTimer = 0;
  ui.toast = (text, secs = 4.5) => {
    const t = $('toast'); t.textContent = text; show(t, true);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => show(t, false), secs * 1000);
  };

  // ------------------------------------------------ haunts counter
  const row = $('haunt-row');
  ui.updateHaunts = (n, total, flash) => {
    row.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 15 18'); s.setAttribute('aria-hidden', 'true');
      if (i < n) s.classList.add('got');
      s.innerHTML = `<path d="${GHOST_PATH}"/>`;
      row.appendChild(s);
    }
    $('haunts').setAttribute('aria-label', `${n} of ${total} hidden haunts found`);
    $('haunt-hint').textContent = n === total ? 'All found! Click to hide them again.' : n > 0 ? `${n} of ${total} found. Keep looking.` : 'Light the lantern to find them.';
  };
  $('haunts').addEventListener('click', () => {
    if (W.fx.found() === W.fx.haunts.length) { W.fx.resetHaunts(); ui.toast('The haunts have hidden themselves again.'); }
    else ui.toast('Light the lantern and sweep it slowly over the rooms. Hidden haunts glow when the light finds them.', 6);
  });

  // ------------------------------------------------ camera helpers
  const cam = W.camera, controls = W.controls;
  const overview = () => {
    const a = cam.aspect;
    const dist = Math.max(150, 200 / Math.max(0.5, a));
    return { az: 30, el: 21, dist: Math.min(dist, 300), target: new THREE.Vector3(4, 9.5, 1) };
  };
  const spherical = (v) => {
    const t = v.target instanceof THREE.Vector3 ? v.target : new THREE.Vector3(...v.target);
    const az = v.az * DEG, el = v.el * DEG;
    return { target: t, pos: new THREE.Vector3(t.x + v.dist * Math.cos(el) * Math.sin(az), t.y + v.dist * Math.sin(el), t.z + v.dist * Math.cos(el) * Math.cos(az)) };
  };
  let camBusy = 0;
  ui.flyTo = async (v, dur = 1.6) => {
    const to = spherical(v);
    const p0 = cam.position.clone(), t0 = controls.target.clone();
    const myId = ++camBusy;
    controls.enabled = false;
    await tween(dur, (k) => {
      if (myId !== camBusy) return;
      cam.position.lerpVectors(p0, to.pos, k);
      controls.target.lerpVectors(t0, to.target, k);
      cam.lookAt(controls.target);
    });
    if (myId === camBusy && W.state.mode !== 'ride') { controls.enabled = true; controls.update(); }
  };
  W.resetView = (instant) => {
    const v = overview();
    if (instant) { const s = spherical(v); cam.position.copy(s.pos); controls.target.copy(s.target); cam.lookAt(s.target); controls.update(); }
    else ui.flyTo(v, 1.6);
  };

  // ------------------------------------------------ view shift (keeps a focused room clear of the side panel)
  const shift = { x: 0, y: 0, tx: 0, ty: 0 };
  onUpdate((t, dt) => {
    shift.x = damp(shift.x, shift.tx, 4, dt); shift.y = damp(shift.y, shift.ty, 4, dt);
    if (shift.tx === 0 && shift.ty === 0 && Math.abs(shift.x) < 0.5 && Math.abs(shift.y) < 0.5) { if (cam.view && cam.view.enabled) cam.clearViewOffset(); return; }
    cam.setViewOffset(innerWidth, innerHeight, shift.x, shift.y, innerWidth, innerHeight);
  });
  const setShift = (on) => {
    if (!on) { shift.tx = 0; shift.ty = 0; return; }
    const r = $('panel').getBoundingClientRect();
    if (innerWidth > 620) { shift.tx = Math.min(innerWidth * 0.3, (r.width + 24) * 0.5); shift.ty = 0; }
    else { shift.tx = 0; shift.ty = Math.min(innerHeight * 0.25, (r.height + 20) * 0.5); }
  };
  // ------------------------------------------------ room focus panel
  let current = null;
  const panel = $('panel');
  ui.focusRoom = (id) => {
    const r = W.rooms[id];
    if (!r || W.state.mode === 'ride') return;
    if (!W.state.open) setOpen(true);
    current = id;
    W.state.focus = id;
    W.state.mode = 'focus';
    $('p-eyebrow').textContent = (r.id === 'graveyard' || r.id === 'yard') ? 'THE GROUNDS' : r.id === 'basement' ? 'BELOW STAIRS' : r.id === 'attic' ? 'UNDER THE EAVES' : 'ROOM ' + (ORDER.indexOf(id) + 1) + ' OF ' + ORDER.length;
    $('p-title').textContent = r.name;
    $('p-blurb').textContent = r.blurb;
    const acts = $('p-acts'); acts.innerHTML = '';
    for (const a of r.actions) {
      const b = document.createElement('button'); b.className = 'act';
      b.innerHTML = `<svg viewBox="0 0 15 18" aria-hidden="true"><path d="${GHOST_PATH}"/></svg><span></span>`;
      b.querySelector('span').textContent = a.label;
      b.addEventListener('click', () => { sfx('click'); a.fn(); });
      acts.appendChild(b);
    }
    show(panel, true);
    requestAnimationFrame(() => setShift(true));
    setTimeout(() => setShift(true), 60);
    ui.flyTo(r.view, 1.5);
    controls.minDistance = 16; controls.maxDistance = 140;
    W.audio?.setFocus?.(id);
    W.post.tilt.amount = 1.3; W.post.tilt.band = 0.5;
  };
  ui.unfocus = () => {
    if (W.state.mode !== 'focus') return;
    current = null; W.state.focus = null; W.state.mode = 'explore';
    show(panel, false);
    setShift(false);
    controls.minDistance = 38; controls.maxDistance = 300;
    W.audio?.setFocus?.(null);
    W.post.tilt.amount = 1.7; W.post.tilt.band = 0.42;
    ui.flyTo(overview(), 1.5);
  };
  $('p-close').addEventListener('click', () => ui.unfocus());
  const step = (d) => { const i = ORDER.indexOf(current); ui.focusRoom(ORDER[(i + d + ORDER.length) % ORDER.length]); sfx('click'); };
  $('p-prev').addEventListener('click', () => step(-1));
  $('p-next').addEventListener('click', () => step(1));

  // ------------------------------------------------ dock
  const setOpen = (on) => {
    W.state.open = on;
    $('b-open').setAttribute('aria-pressed', String(on));
    $('b-open-l').textContent = on ? 'Close up' : 'Open up';
    sfx(on ? 'whoosh' : 'creak');
  };
  const press = (id, on) => $(id).setAttribute('aria-pressed', String(on));
  $('b-ride').addEventListener('click', () => { closeMenu(); startRide(); });
  $('b-open').addEventListener('click', () => { setOpen(!W.state.open); if (!W.state.open && W.state.mode === 'focus') ui.unfocus(); });
  let lanternTold = false;
  const toggleLantern = () => {
    const on = !W.state.lantern; W.fx.setLantern(on); press('b-lantern', on);
    canvas.style.cursor = on ? 'none' : '';
    if (on && !lanternTold) { lanternTold = true; ui.toast('The lights are out. Sweep the lantern across the rooms; hidden haunts only show up in its glow.', 6.5); }
  };
  $('b-lantern').addEventListener('click', toggleLantern);
  const toggleStorm = () => { const on = !W.state.storm; W.fx.setStorm(on); press('b-storm', on); if (on) ui.toast('A storm rolls in over the nook.'); };
  $('b-storm').addEventListener('click', toggleStorm);
  const toggleSound = async () => {
    if (!W.audio.started) { await W.audio.start(); W.audio.setMuted(false); }
    else W.audio.setMuted(!W.audio.muted);
    const on = W.audio.started && !W.audio.muted;
    press('b-sound', on);
    $('snd-wave').style.opacity = on ? 1 : 0.15;
    $('b-sound-l').textContent = on ? 'Sound' : 'Muted';
  };
  $('b-sound').addEventListener('click', toggleSound);
  // rooms menu
  const menu = $('rooms-menu');
  const buildMenu = () => {
    menu.innerHTML = '';
    for (const id of ORDER) { const r = W.rooms[id]; if (!r) continue; const b = document.createElement('button'); b.setAttribute('role', 'menuitem'); b.textContent = r.name; b.addEventListener('click', () => { closeMenu(); ui.focusRoom(id); }); menu.appendChild(b); }
  };
  const closeMenu = () => { menu.classList.add('hidden'); $('b-rooms').setAttribute('aria-expanded', 'false'); };
  $('b-rooms').addEventListener('click', (e) => { e.stopPropagation(); const open = menu.classList.contains('hidden'); if (open) { buildMenu(); menu.classList.remove('hidden'); } else closeMenu(); $('b-rooms').setAttribute('aria-expanded', String(open)); });
  window.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && e.target !== $('b-rooms')) closeMenu(); });

  // ------------------------------------------------ ride overlay
  const steps = $('ride-steps');
  steps.innerHTML = RIDE_STEPS.map(([k, n]) => `<span data-k="${k}">${n}</span>`).join('');
  ui.rideMode = (on) => {
    document.body.classList.toggle('riding', on);
    for (const id of ['ride-ui', 'ride-steps', 'ride-tip']) show($(id), on);
    for (const id of ['dock', 'hud-title', 'haunts']) show($(id), !on);
    show(panel, false);
    setShift(false);
    hideLabel();
    if (on) { steps.querySelectorAll('span').forEach((s) => s.classList.remove('on', 'done')); current = null; W.state.focus = null; }
  };
  ui.rideProgress = (tag) => {
    const idx = RIDE_STEPS.findIndex(([k]) => k === tag);
    if (idx < 0) return;
    steps.querySelectorAll('span').forEach((s, i) => { s.classList.toggle('on', i === idx); s.classList.toggle('done', i < idx); });
  };
  const startRide = async () => {
    if (W.state.mode === 'ride') return;
    if (!W.audio.started) { await toggleSound(); }
    if (W.state.lantern) toggleLantern();
    if (W.state.mode === 'focus') { current = null; W.state.focus = null; show(panel, false); }
    W.ride.start();
  };
  $('b-exit').addEventListener('click', () => W.ride.stop());

  // ------------------------------------------------ the hitchhiker who follows you home
  const hitch = $('hitch');
  const hs = { on: false, x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
  ui.hitchhiker = () => {
    if (hs.on) return;
    hs.on = true; hitch.classList.add('on');
    hs.x = innerWidth * 0.8; hs.y = innerHeight * 0.3;
    setTimeout(() => ui.toast('A hitchhiker has followed you home. Click him to shoo him away.', 6), 600);
  };
  hitch.addEventListener('click', () => { hs.on = false; hitch.classList.remove('on'); sfx('whoosh'); ui.toast('He will be back. They always come back.'); });
  onUpdate((t, dt) => {
    if (!hs.on) return;
    hs.x = damp(hs.x, hs.tx + 34, 2.2, dt); hs.y = damp(hs.y, hs.ty - 30 + Math.sin(t * 2.2) * 6, 2.2, dt);
    const tilt = clamp((hs.tx + 34 - hs.x) * 0.08, -18, 18);
    hitch.style.transform = `translate(${hs.x - 23}px, ${hs.y - 29}px) rotate(${tilt}deg)`;
  });

  // ------------------------------------------------ picking
  const canvas = W.renderer.domElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(-2, -2);
  let needPick = false, mouse = { x: 0, y: 0 }, down = null, hover = null, hoverRoom = null;
  const label = $('label');
  const hideLabel = () => { label.classList.remove('on'); hover = null; hoverRoom = null; canvas.style.cursor = W.state.lantern ? 'none' : ''; };
  canvas.addEventListener('pointermove', (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    hs.tx = e.clientX; hs.ty = e.clientY;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    needPick = true;
  });
  canvas.addEventListener('pointerleave', () => { hideLabel(); ndc.set(-2, -2); });
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved > 6 || !quick) return;
    if (W.state.mode === 'intro' || W.state.mode === 'ride' || W.state.mode === 'loading') return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const hit = pick();
    if (hit.h) {
      const h = hit.h;
      if (W.state.mode === 'explore' && h.room && W.rooms[h.room] && !h.noFocus) ui.focusRoom(h.room);
      h.onClick && h.onClick();
    } else if (hit.room) {
      if (current !== hit.room) ui.focusRoom(hit.room);
    }
  });
  const visibleChain = (o) => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
  const outdoor = new Set(['graveyard', 'yard']);
  function pick() {
    ray.setFromCamera(ndc, cam);
    const cands = [];
    for (const h of W.hotspots) {
      if (h.active && !h.active()) continue;
      if (!W.state.open && !outdoor.has(h.room)) continue;
      if (!visibleChain(h.obj)) continue;
      cands.push(h.obj);
    }
    const hits = ray.intersectObjects(cands, true);
    const proxies = ray.intersectObjects(W.roomProxies.children, false);
    let room = null, roomHit = null;
    if (proxies.length) { room = proxies[0].object.userData.room; roomHit = proxies[0]; }
    let h = null;
    for (const it of hits) { const hh = it.object.userData.hotspot; if (hh) { h = hh; break; } }
    return { h, room, roomHit, proxies, hits };
  }
  const lanternPoint = (res) => {
    if (res.hits.length) return res.hits[0].point;
    if (res.proxies.length) {
      const a = res.proxies[0];
      const r = W.rooms[a.object.userData.room];
      // walk into the room to ~60% of its depth along the ray
      const box = r.box;
      const far = new THREE.Ray(ray.ray.at(a.distance + 60, new THREE.Vector3()), ray.ray.direction.clone().negate());
      const p2 = far.intersectBox(box, new THREE.Vector3());
      if (p2) return a.point.clone().lerp(p2, 0.62);
      return a.point;
    }
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    return ray.ray.intersectPlane(pl, new THREE.Vector3());
  };
  onUpdate((t, dt) => {
    // room glow on hover
    for (const id in W.rooms) { const r = W.rooms[id]; r.lightMul = damp(r.lightMul, (id === hoverRoom || id === current) ? 1.3 : 1, 5, dt); }
    if (!needPick) return;
    needPick = false;
    if (W.state.mode === 'ride' || W.state.mode === 'intro' || W.state.mode === 'loading' || !controls.enabled && W.state.mode !== 'focus') { hideLabel(); return; }
    const res = pick();
    if (W.state.lantern) { const p = lanternPoint(res); if (p) W.fx.lanternAim(p); }
    let name = '', hint = '';
    if (res.h) {
      hover = res.h; hoverRoom = res.h.room;
      name = res.h.label; hint = W.state.mode === 'explore' && W.rooms[res.h.room] ? W.rooms[res.h.room].name : 'Click';
      canvas.style.cursor = W.state.lantern ? 'none' : 'pointer';
    } else if (res.room) {
      hover = null; hoverRoom = res.room;
      name = W.rooms[res.room].name; hint = current === res.room ? '' : 'Click to look inside';
      canvas.style.cursor = current === res.room ? (W.state.lantern ? 'none' : '') : (W.state.lantern ? 'none' : 'pointer');
    } else { hover = null; hoverRoom = null; canvas.style.cursor = W.state.lantern ? 'none' : ''; }
    if (name) {
      $('label-n').textContent = name; $('label-h').textContent = hint;
      label.style.left = mouse.x + 'px'; label.style.top = mouse.y + 'px';
      const flip = mouse.x > innerWidth - 260;
      label.style.transform = flip ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)';
      label.classList.add('on');
    } else label.classList.remove('on');
  });

  // idle sway: after a while untouched, the nook slowly turns back and forth on its own
  let idle = 0, swayDir = 1;
  const wake = () => { idle = 0; controls.autoRotate = false; };
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) window.addEventListener(ev, wake, { passive: true });
  onUpdate((t, dt) => {
    if (W.state.mode !== 'explore' || W.state.reduced || !controls.enabled) { controls.autoRotate = false; idle = 0; return; }
    idle += dt;
    if (idle > 12) {
      controls.autoRotate = true;
      const az = controls.getAzimuthalAngle() / DEG;
      if (az > 62) swayDir = -1; else if (az < -8) swayDir = 1;
      controls.autoRotateSpeed = 0.22 * swayDir;
    }
  });
  // tilt-shift follows what you are looking at
  const _p = new THREE.Vector3();
  onUpdate((t, dt) => {
    if (W.state.mode === 'ride') return;
    _p.copy(controls.target).project(cam);
    W.post.tilt.focus = damp(W.post.tilt.focus, clamp((_p.y + 1) / 2, 0.2, 0.8), 4, dt);
  });

  // ------------------------------------------------ keyboard
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (W.state.mode === 'intro' || W.state.mode === 'loading') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (W.state.mode === 'ride') W.ride.stop(); else if (W.state.mode === 'focus') ui.unfocus(); closeMenu(); }
    else if (W.state.mode === 'ride') return;
    else if (k === 'r') startRide();
    else if (k === 'l') toggleLantern();
    else if (k === 's') toggleStorm();
    else if (k === 'o') $('b-open').click();
    else if (k === 'm') toggleSound();
    else if (k === 'arrowright' && W.state.mode === 'focus') step(1);
    else if (k === 'arrowleft' && W.state.mode === 'focus') step(-1);
  });

  // ------------------------------------------------ intro & entering
  ui.showIntro = () => {
    W.state.mode = 'intro';
    W.state.open = false;
    controls.enabled = false;
    const v = { az: -8, el: 15, dist: Math.max(230, 280 / Math.max(0.6, cam.aspect)), target: new THREE.Vector3(4, 9, 1) };
    const s = spherical(v); cam.position.copy(s.pos); controls.target.copy(s.target); cam.lookAt(s.target);
    W.lightMul = 1;
    show($('intro'), true);
    $('enter-sound').focus({ preventScroll: true });
  };
  let introAz = -8;
  onUpdate((t, dt) => {
    if (W.state.mode !== 'intro') return;
    introAz += dt * 2.2;
    const v = { az: introAz, el: 15, dist: Math.max(230, 280 / Math.max(0.6, cam.aspect)), target: new THREE.Vector3(4, 9, 1) };
    const s = spherical(v); cam.position.copy(s.pos); controls.target.copy(s.target); cam.lookAt(s.target);
  });
  const enter = async (withSound) => {
    if (W.state.mode !== 'intro') return;
    show($('intro'), false);
    W.state.mode = 'explore';
    if (withSound) { await W.audio.start(); W.audio.setMuted(false); press('b-sound', true); }
    else { press('b-sound', false); $('b-sound-l').textContent = 'Sound'; $('snd-wave').style.opacity = 0.15; }
    const o = overview();
    const from = { az: ((introAz + 180) % 360) - 180 };
    await ui.flyTo({ ...o }, 3.2);
    W.fx.lightning(1);
    setOpen(true);
    await wait(0.8);
    for (const id of ['dock', 'hud-title', 'haunts']) show($(id), true);
    await wait(1.6);
    ui.toast('Drag to turn the nook. Scroll to lean in. Click any room to look inside.', 6);
  };
  $('enter-sound').addEventListener('click', () => enter(true));
  $('enter-quiet').addEventListener('click', () => enter(false));
  // local testing hook (ignored on the published page)
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    const q = new URLSearchParams(location.search);
    if (q.has('autoenter')) setTimeout(async () => {
      while (W.state.mode !== 'intro') await wait(0.05);
      await enter(false);
      if (q.get('focus')) ui.focusRoom(q.get('focus'));
      if (q.get('say')) ui.say(q.get('say'), { who: 'your ghost host' });
      if (q.has('ride')) W.ride.start();
    }, 50);
  }
  return ui;
}
