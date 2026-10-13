// Core: shared world state, math helpers, geometry baking, special materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const W = {
  staticBin: null, shadowDirty: 4,
  scene: null, camera: null, renderer: null, controls: null, composer: null,
  t: 0, dt: 0,
  updaters: [],
  hotspots: [],
  rooms: {},
  dissolvers: [],
  lights: [],
  lightMul: 1,
  state: { mode: 'loading', open: false, lantern: false, storm: false, sound: false, focus: null, reduced: false },
  U: {
    uTime: { value: 0 },
    uLantern: { value: new THREE.Vector3(0, -100, 0) },
    uLanternOn: { value: 0 },
    uFlash: { value: 0 },
  },
  rng: mulberry32(1337),
  audio: null,
  ui: null,
};

// ---------- math ----------
export const rand = (a = 0, b = 1) => a + (b - a) * W.rng();
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(W.rng() * arr.length)];
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// smooth 1D value noise
const _nt = new Float32Array(512);
for (let i = 0; i < 512; i++) _nt[i] = mulberry32(99 + i)();
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const a = _nt[i & 511], b = _nt[(i + 1) & 511];
  return lerp(a, b, f * f * (3 - 2 * f));
}

export function onUpdate(fn) { W.updaters.push(fn); return fn; }
export function toBin(S) { if (!W.staticBin) W.staticBin = new THREE.Group(); W.staticBin.add(S); return S; }

// ---------- tweens & timers ----------
const tweens = [];
export function tween(dur, fn, ease = easeInOut) {
  return new Promise((res) => tweens.push({ t: 0, dur: Math.max(0.0001, dur), fn, ease, res }));
}
export const wait = (s) => tween(s, () => {});
export function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.ease(k), k);
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
}

// ---------- materials ----------
const _mc = new Map();
export function mat(color, rough = 0.85, metal = 0, opts = {}) {
  const k = `${color}|${rough}|${metal}|${opts.flat ? 1 : 0}|${opts.side || 0}|${opts.key || ''}`;
  let m = _mc.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: metal, flatShading: !!opts.flat,
      side: opts.side || THREE.FrontSide,
    });
    if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.ei ?? 1; }
    _mc.set(k, m);
  }
  return m;
}
export const flat = (color, rough = 0.9, metal = 0) => mat(color, rough, metal, { flat: true });
export function glow(color, intensity = 2.5) {
  const k = `glow|${color}|${intensity}`;
  let m = _mc.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 1 });
    m.userData.noShadow = true;
    _mc.set(k, m);
  }
  return m;
}
export function texMat(map, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map, color: opts.color ?? 0xffffff, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0,
    side: opts.side ?? THREE.FrontSide, flatShading: !!opts.flat,
  });
  if (opts.uv) m.userData.uvScale = opts.uv;
  if (opts.emissiveMap) { m.emissiveMap = opts.emissiveMap; m.emissive = new THREE.Color(opts.emissive ?? 0xffffff); m.emissiveIntensity = opts.ei ?? 1; }
  if (opts.bump) { m.bumpMap = opts.bump; m.bumpScale = opts.bumpScale ?? 1; }
  if (opts.noShadow) m.userData.noShadow = true;
  return m;
}

// ---------- geometry helpers ----------
export function mesh(geo, material, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
export function box(w, h, d, material, x = 0, y = 0, z = 0, parent = null) {
  return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
}
// box spanning [x0,x1]x[y0,y1]x[z0,z1]
export function boxA(x0, x1, y0, y1, z0, z1, material, parent = null) {
  return box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), material, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, parent);
}
export function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, parent = null, seg = 12, open = false) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), material, x, y, z, parent);
}
export function sphere(r, material, x = 0, y = 0, z = 0, parent = null, ws = 14, hs = 10) {
  return mesh(new THREE.SphereGeometry(r, ws, hs), material, x, y, z, parent);
}
export function lathe(points, material, seg = 16, parent = null) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  return mesh(g, material, 0, 0, 0, parent);
}
export function group(parent = null, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}
// quad prism from 4 outer corners (CCW seen from outside) pushed inward along -normal by thickness
export function quadPrism(a, b, c, d, thick) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), C = new THREE.Vector3(...c), Dv = new THREE.Vector3(...d);
  const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(Dv, A)).normalize();
  const off = n.clone().multiplyScalar(-thick);
  const a2 = A.clone().add(off), b2 = B.clone().add(off), c2 = C.clone().add(off), d2 = Dv.clone().add(off);
  const pos = [];
  const quad = (p, q, r, s) => { pos.push(...p.toArray(), ...q.toArray(), ...r.toArray(), ...p.toArray(), ...r.toArray(), ...s.toArray()); };
  quad(A, B, C, Dv);          // outer
  quad(d2, c2, b2, a2);       // inner
  quad(A, a2, b2, B);         // edges
  quad(B, b2, c2, C);
  quad(C, c2, d2, Dv);
  quad(Dv, d2, a2, A);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

// ---------- baking (merge static meshes per material) ----------
function flipWinding(g) {
  for (const key of Object.keys(g.attributes)) {
    const a = g.attributes[key], s = a.itemSize, arr = a.array;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < s; k++) {
        const t = arr[(i + 1) * s + k];
        arr[(i + 1) * s + k] = arr[(i + 2) * s + k];
        arr[(i + 2) * s + k] = t;
      }
    }
  }
}
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3(), _fn = new THREE.Vector3();
export function worldUV(g, s) {
  const p = g.attributes.position, uv = g.attributes.uv;
  const su = Array.isArray(s) ? s[0] : s, sv = Array.isArray(s) ? s[1] : s;
  for (let i = 0; i < p.count; i += 3) {
    _va.fromBufferAttribute(p, i); _vb.fromBufferAttribute(p, i + 1); _vc.fromBufferAttribute(p, i + 2);
    _fn.subVectors(_vb, _va).cross(_vc.clone().sub(_va));
    const nx = Math.abs(_fn.x), ny = Math.abs(_fn.y), nz = Math.abs(_fn.z);
    for (let j = 0; j < 3; j++) {
      const x = p.getX(i + j), y = p.getY(i + j), z = p.getZ(i + j);
      let u, v;
      if (nx >= ny && nx >= nz) { u = z; v = y; }
      else if (ny >= nx && ny >= nz) { u = x; v = z; }
      else { u = x; v = y; }
      uv.setXY(i + j, u / su, v / sv);
    }
  }
  uv.needsUpdate = true;
}
export function prepGeo(src, matrix) {
  let g = src.index ? src.toNonIndexed() : src.clone();
  if (matrix) {
    g.applyMatrix4(matrix);
    if (matrix.determinant() < 0) flipWinding(g);
  }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
export function bake(src, parent, { cast = true, receive = true } = {}) {
  src.updateMatrixWorld(true);
  const buckets = new Map();
  const keeps = [];
  const visit = (o) => {
    if (o !== src && (o.userData.keep || o.userData.keepGroup || o.isInstancedMesh || o.isLight || o.isSprite || o.isPoints || o.isLine)) { keeps.push(o); return; }
    if (o.isMesh) {
      const m = o.material;
      if (Array.isArray(m) || m.transparent && m.userData.noBake) { keeps.push(o); return; }
      const g = prepGeo(o.geometry, o.matrixWorld);
      const uvScale = o.userData.uvScale || m.userData.uvScale;   // a mesh may override its material's scale
      if (uvScale) worldUV(g, uvScale);
      if (!buckets.has(m)) buckets.set(m, []);
      buckets.get(m).push(g);
    }
    for (const c of o.children) visit(c);
  };
  visit(src);
  for (const k of keeps) {
    const par = k.parent;
    if (par === src || !par) parent.add(k);
    else {
      // keep the object's own local transform untouched (animations set its components directly);
      // a holder carries the transform of the merged-away ancestors
      const holder = new THREE.Group();
      par.updateWorldMatrix(true, false);
      par.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale);
      holder.add(k);
      parent.add(holder);
    }
    if (k.isMesh) {
      const mm = Array.isArray(k.material) ? k.material[0] : k.material;
      if (!k.castShadow) k.castShadow = cast && !mm.transparent && !mm.userData.noShadow && !k.userData.noShadow;
      k.receiveShadow = true;
    }
  }
  const out = [];
  for (const [m, list] of buckets) {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const ms = new THREE.Mesh(merged, m);
    ms.castShadow = cast && !m.userData.noShadow && !m.transparent;
    ms.receiveShadow = receive && !m.userData.noReceive;
    ms.userData.cast = ms.castShadow;
    parent.add(ms);
    out.push(ms);
  }
  return out;
}
// Merge a group's static descendants in place (animated parts must be marked keep / keepGroup).
export function compact(g) {
  if (g.userData.compacted || g.userData.noCompact) return;
  const tmp = new THREE.Group();
  for (const k of [...g.children]) tmp.add(k);
  bake(tmp, g);
  g.userData.compacted = true;
  const h = g.userData.hotspot;
  if (h) g.traverse((o) => { if (!o.userData.hotspot) o.userData.hotspot = h; });
}
export function compactAll(root) {
  const visit = (o) => {
    if (o.userData.noCompact) return;
    if (o.isGroup || o.type === 'Object3D') {
      compact(o);
      for (const c of [...o.children]) visit(c);
    }
  };
  for (const c of [...root.children]) visit(c);
}
// make a single (non-baked) mesh use world-scale uvs given its current world matrix
export function applyWorldUV(m, s) {
  m.updateMatrixWorld(true);
  const g = prepGeo(m.geometry, m.matrixWorld);
  worldUV(g, s);
  const inv = m.matrixWorld.clone().invert();
  g.applyMatrix4(inv);
  m.geometry = g;
}

// ---------- GLSL ----------
export const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// ---------- ectoplasm dissolve (walls that melt away when facing the camera) ----------
export function patchDissolve(material, u) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uDissolve = u.uDissolve;
    sh.uniforms.uEdge = u.uEdge;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 dwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dwp = instanceMatrix * dwp;
        #endif
        vDW = (modelMatrix * dwp).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDW; uniform float uDissolve; uniform vec3 uEdge;
        ${NOISE_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float dEdge = 0.0;
        if (uDissolve > 0.001) {
          float dn = snoise(vDW * 0.22) * 0.5 + 0.5;
          dn = dn * 0.72 + (snoise(vDW * 1.1 + 7.0) * 0.5 + 0.5) * 0.28;
          dn = dn * 0.85 + 0.15 * clamp(1.0 - vDW.y / 24.0, 0.0, 1.0);
          float thr = uDissolve * 1.12 - 0.04;
          if (dn < thr) discard;
          dEdge = 1.0 - smoothstep(0.0, 0.045, dn - thr);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uEdge * dEdge;`);
  };
  material.customProgramCacheKey = () => 'dissolve-v1';
}
export function makeDissolver(grp, normal, center, opts = {}) {
  const u = { uDissolve: { value: 0 }, uEdge: { value: new THREE.Color(0x5dffb0).multiplyScalar(6) } };
  const clones = new Map();
  const meshes = [];
  grp.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m.isMeshStandardMaterial) return;
    let c = clones.get(m);
    if (!c) { c = m.clone(); patchDissolve(c, u); clones.set(m, c); }
    o.material = c;
    o.userData.cast = o.castShadow;
    meshes.push(o);
  });
  const d = {
    group: grp, normal: normal.clone().setY(0).normalize(), center: center.clone(), u,
    value: 0, target: 0, threshold: opts.threshold ?? 0.18, meshes, force: null, name: opts.name || '',
  };
  grp.userData.noCompact = true;
  W.dissolvers.push(d);
  return d;
}
const _dv = new THREE.Vector3();
export function updateDissolvers(dt) {
  const st = W.state;
  for (const d of W.dissolvers) {
    let target = 0;
    if (st.open && st.mode !== 'ride') {
      _dv.copy(W.camera.position).sub(d.center).setY(0).normalize();
      const dot = _dv.dot(d.normal);
      if (dot > d.threshold + 0.06) target = 1;
      else if (dot < d.threshold - 0.06) target = 0;
      else target = d.target;
    }
    if (d.force !== null) target = d.force;
    d.target = target;
    const speed = st.mode === 'ride' ? 3 : 0.85;
    const before = d.value;
    d.value += Math.sign(target - d.value) * Math.min(Math.abs(target - d.value), dt * speed);
    if (d.value !== before) W.shadowDirty = Math.max(W.shadowDirty, 1);
    d.u.uDissolve.value = smooth(d.value);
    d.group.visible = d.value < 0.995;
    const cast = d.value < 0.35;
    for (const m of d.meshes) m.castShadow = cast && m.userData.cast;
  }
}

// ---------- ghosts ----------
export function ghostMaterial({ color = 0x9ffcf0, opacity = 0.9, wobble = 1, hidden = false, eyes = true, eyeY = 1.42, side = THREE.FrontSide, blend = 'add' } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: W.U.uTime, uLantern: W.U.uLantern, uLanternOn: W.U.uLanternOn, uFlash: W.U.uFlash,
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uWobble: { value: wobble },
      uHidden: { value: hidden ? 1 : 0 }, uEyes: { value: eyes ? 1 : 0 }, uEyeY: { value: eyeY },
      uSeed: { value: Math.random() * 20 }, uMouth: { value: 0 },
    },
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uWobble; uniform float uSeed;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vL;
      void main(){
        vec3 p = position;
        float h = clamp(1.0 - p.y / 1.25, 0.0, 1.0);
        float t = uTime + uSeed;
        p.x += sin(t * 2.3 + p.y * 5.0 + p.z * 4.0) * 0.07 * h * uWobble;
        p.z += cos(t * 2.0 + p.y * 4.0 + p.x * 3.0) * 0.07 * h * uWobble;
        vL = p;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uSeed;
      uniform vec3 uLantern; uniform float uLanternOn; uniform float uHidden; uniform float uFlash;
      uniform float uEyes; uniform float uEyeY; uniform float uMouth;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vL;
      void main(){
        vec3 n = normalize(vN);
        float ndv = abs(dot(n, normalize(vV)));
        float fres = pow(1.0 - ndv, 2.0);
        float flick = 0.86 + 0.14 * sin(uTime * 5.0 + uSeed * 3.0 + vW.y * 2.5);
        float hem = smoothstep(-0.12, 0.5, vL.y);
        float wisp = 0.72 + 0.28 * sin(vL.y * 9.0 - uTime * 1.7 + uSeed + sin(vL.x * 7.0 + uTime) * 1.5);
        vec3 col = uColor * (0.14 + 1.9 * fres) * flick;
        float a = uOpacity * (0.17 + 0.83 * fres) * mix(0.12, 1.0, hem) * wisp;
        if (uEyes > 0.5 && vL.z > 0.05) {
          vec2 q = vL.xy;
          float de = min(length((q - vec2(-0.105, uEyeY)) * vec2(1.0, 0.72)), length((q - vec2(0.105, uEyeY)) * vec2(1.0, 0.72)));
          float eye = 1.0 - smoothstep(0.040, 0.056, de);
          float dm = length((q - vec2(0.0, uEyeY - 0.15)) * vec2(0.95, 1.6 - uMouth * 0.9));
          float mouth = 1.0 - smoothstep(0.045 + uMouth * 0.02, 0.06 + uMouth * 0.02, dm);
          float hole = max(eye, mouth);
          col *= 1.0 - hole * 0.92;
          a *= 1.0 - hole * 0.55;
        }
        if (uHidden > 0.5) {
          float d = distance(vW, uLantern);
          a *= (1.0 - smoothstep(1.6, 3.4, d)) * uLanternOn;
        }
        a *= 1.0 + uFlash * 0.6;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending, side,
  });
}

// A robed ghost grown from rings: an egg-shaped head on a neck and sloping shoulders, a robe with folds whose hem
// trails off into wisps (swept back, as if drifting forward), sleeves on curved arms with flared cuffs and mitten
// hands, and hats sized to the head. Local y runs from the hem (0) to the top of the head (height); the face looks
// down +z, where ghostMaterial paints the eyes and mouth (at y = 1.47 s, x = ±0.105). ?figures=0 shows the older,
// simpler ghosts (classicGhostGeometry).
const GHOST_PROFILE = [ // y / s, half-width / w, depth (front-to-back / side-to-side), z offset / s
  [0.0, 1.0, 0.92, -0.08], [0.1, 0.98, 0.92, -0.065], [0.25, 0.92, 0.9, -0.045], [0.46, 0.82, 0.88, -0.02], [0.66, 0.74, 0.86, -0.005],
  [0.84, 0.66, 0.84, 0], [0.98, 0.62, 0.74, 0], [1.08, 0.66, 0.62, 0], [1.15, 0.58, 0.62, 0.005], [1.21, 0.4, 0.75, 0.01],
  [1.255, 0.27, 0.95, 0.015], [1.3, 0.36, 1.05, 0.025], [1.38, 0.48, 1.04, 0.03], [1.47, 0.54, 1.02, 0.03], [1.56, 0.53, 1.0, 0.02],
  [1.64, 0.43, 0.98, 0.01], [1.69, 0.28, 0.95, 0.005], [1.715, 0.12, 0.95, 0], [1.72, 0.0, 1.0, 0],
];
const crSpline = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
function ghostRows(sub) {
  const P = GHOST_PROFILE, n = P.length, out = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sub; j++) {
      const t = j / sub, a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(n - 1, i + 2)];
      out.push(b.map((_, k) => crSpline(a[k], b[k], c[k], d[k], t)));
    }
  }
  out.push(P[n - 1]);
  return out;
}
// a closed, smooth surface through rings of points (each ring an array of Vector3s, all the same length)
function ringSurface(rings) {
  const R = rings[0].length, pos = [], idx = [];
  for (const ring of rings) for (const v of ring) pos.push(v.x, v.y, v.z);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * R + j, b = i * R + (j + 1) % R, c = (i + 1) * R + (j + 1) % R, d = (i + 1) * R + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// a tube along a curve whose radius varies along it, ending in a rounded tip; hand ends a sleeve with a cuff
// and a mitten hand grown out of it in one piece (a separate little hand would glow as an outlined bubble)
function ghostTube(pts, radiusAt, { N = 12, R = 10, hand = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const fr = curve.computeFrenetFrames(N, false);
  const ring = (c, n, b, rn, rb = rn) => Array.from({ length: R }, (_, j) => {
    const a = (j / R) * TAU;
    return c.clone().addScaledVector(n, Math.cos(a) * rn).addScaledVector(b, Math.sin(a) * rb);
  });
  const r0 = radiusAt(0);                         // a rounded start, so the shoulder end isn't an open ring
  const rings = [ring(curve.getPointAt(0).addScaledVector(fr.tangents[0], -r0 * 0.6), fr.normals[0], fr.binormals[0], r0 * 0.05)];
  for (let i = 0; i <= N; i++) rings.push(ring(curve.getPointAt(i / N), fr.normals[i], fr.binormals[i], radiusAt(i / N)));
  const end = curve.getPointAt(1), T = fr.tangents[N], n = fr.normals[N], b = fr.binormals[N], r1 = radiusAt(1);
  const at = (d) => end.clone().addScaledVector(T, r1 * d);
  if (hand) {                                      // [distance past the cuff, thickness, width] in cuff radii
    for (const [d, rn, rb] of [[0.12, 1.03, 1.03], [0.02, 0.42, 0.42], [0.35, 0.3, 0.36], [0.9, 0.26, 0.5], [1.4, 0.24, 0.47], [1.8, 0.16, 0.3], [2.0, 0.02, 0.02]]) {
      rings.push(ring(at(d), n, b, r1 * rn, r1 * rb));
    }
  } else {
    rings.push(ring(at(0.4), n, b, r1 * 0.02));
  }
  return { geo: ringSurface(rings), end, T, n, b, palm: at(0.9) };
}
// the same indexed surface facing the other way, with smooth normals
function insideOut(g) {
  const back = g.clone(), idx = back.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  back.computeVertexNormals();
  return back;
}
// a ghost's parts stay indexed, with positions and normals only (prepGeo would unshare every vertex, and each
// would then be wobbled once per triangle instead of once)
function ghostPart(geo, m) {
  const g = geo.clone();
  if (m) g.applyMatrix4(m);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
// a lathe, closed when its profile starts and ends on the axis; phi limits it to part of the way round, and
// twoSided adds the inside as well, for sheets like a veil or a hood that are seen from both sides
function ghostLathe(profile, { segs = 24, phiStart = 0, phiLength = TAU, twoSided = false } = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLength);
  return twoSided ? mergeGeometries([ghostPart(g), ghostPart(insideOut(g))], false) : g;
}
export function ghostGeometry(opts = {}) {
  if (W.classicFigures) return classicGhostGeometry(opts);
  const { height = 1.7, width = 0.5, flare = 1.0, arms = 'out', hat = null, skirt = 0 } = opts;
  const s = height / 1.72, w = width, f = flare, k = skirt;
  const phase = (height * 7.31 + width * 13.7 + flare * 3.1) % TAU;          // folds and wisps differ from ghost to ghost
  const R = 28;
  const rows = ghostRows(2).map(([yn, rx0, depth, zo]) => {
    const g = Math.max(0, 1 - yn / 0.9) ** 1.3, h = Math.max(0, 1 - yn / 0.66) ** 1.2;
    return [yn, rx0 * w * (1 + (f - 1) * g) * (1 + k * h), depth, zo];
  });
  const body = ringSurface(rows.map(([yn, rx, depth, zo]) => {
    const A = 0.04 * Math.max(0, 1 - yn / 0.95) ** 1.5;                     // folds, deepest at the hem
    return Array.from({ length: R }, (_, j) => {
      const th = (j / R) * TAU;
      const fold = 1 + A * Math.sin(8 * th + phase) + 0.4 * A * Math.sin(13 * th + 2 * phase);
      const tail = yn < 0.32 ? -0.17 * s * (0.5 + 0.5 * Math.sin(7 * th + phase * 1.7)) ** 2 * (1 - yn / 0.32) ** 2 : 0;
      return new THREE.Vector3(Math.sin(th) * rx * fold, yn * s + tail, Math.cos(th) * rx * depth * fold + zo * s);
    });
  }));
  const parts = [ghostPart(body)];
  const add = (geo, m) => parts.push(ghostPart(geo, m));
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  if (arms) {
    const sx = 0.56 * w;
    const SH = (side) => v(side * sx, 1.11 * s, -0.01 * s);
    const pose = {
      out: (side) => [SH(side), v(side * (sx + 0.28 * s), 1.0 * s, 0.06 * s), v(side * (sx + 0.55 * s), 0.93 * s, 0.17 * s)],
      up: (side) => [SH(side), v(side * (sx + 0.17 * s), 1.33 * s, 0.07 * s), v(side * (sx + 0.2 * s), 1.6 * s, 0.13 * s)],
      front: (side) => [SH(side), v(side * (sx - 0.01 * s), 1.0 * s, 0.27 * s), v(side * (sx - 0.09 * s), 1.03 * s, 0.55 * s)],
      down: (side) => [SH(side), v(side * (sx + 0.07 * s), 0.83 * s, 0.03 * s), v(side * (sx + 0.09 * s), 0.57 * s, 0.1 * s)],
      hitch: (side) => (side < 0 ? [SH(-1), v(-(sx + 0.3 * s), 1.08 * s, 0.03 * s), v(-(sx + 0.58 * s), 1.13 * s, 0.06 * s)] : null),
    };
    for (const side of [-1, 1]) {
      const pts = (pose[arms] || pose.out)(side) || pose.down(side);
      const sl = ghostTube(pts, (t) => (0.068 + 0.034 * t ** 1.4) * s, { hand: true });
      parts.push(ghostPart(sl.geo));
      if (arms === 'hitch' && side < 0) {                                        // thumb up for a ride
        parts.push(ghostPart(ghostTube([sl.palm, sl.palm.clone().add(v(0, 0.06 * s, 0)), sl.palm.clone().add(v(0, 0.12 * s, 0.01 * s))],
          (t) => (0.026 - 0.008 * t) * s, { N: 4, R: 8 }).geo));
      }
    }
  }
  const hr = 0.54 * w, top = 1.72 * s, eyeY = 1.47 * s;                       // the head's half-width, its top and its middle
  const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  if (hat === 'top') {
    add(ghostLathe([[hr * 0.75, 0], [hr * 1.32, 0.005], [hr * 1.4, hr * 0.12], [hr * 1.3, hr * 0.1], [hr * 0.75, hr * 0.08], [hr * 0.75, 0]], { segs: 24 }), at(0, top - hr * 0.42, 0));
    add(ghostLathe([[0.001, 0], [hr * 0.8, 0], [hr * 0.82, hr * 0.25], [hr * 0.88, hr * 1.5], [hr * 0.9, hr * 1.58], [0.001, hr * 1.6]], { segs: 20 }), at(0, top - hr * 0.42, 0));
    add(ghostLathe([[0.001, 0], [hr * 0.84, 0], [hr * 0.85, hr * 0.26], [0.001, hr * 0.26]], { segs: 20 }), at(0, top - hr * 0.4, 0));
  } else if (hat === 'bowler') {
    add(ghostLathe([[hr * 0.75, 0], [hr * 1.12, 0.005], [hr * 1.2, hr * 0.14], [hr * 1.1, hr * 0.1], [hr * 0.75, hr * 0.08], [hr * 0.75, 0]], { segs: 24 }), at(0, top - hr * 0.42, 0));
    add(ghostLathe([[0.001, 0], [hr * 0.84, 0], [hr * 0.88, hr * 0.3], [hr * 0.75, hr * 0.65], [hr * 0.45, hr * 0.82], [0.001, hr * 0.86]], { segs: 20 }), at(0, top - hr * 0.42, 0));
  } else if (hat === 'crown') {
    const c = new THREE.CylinderGeometry(hr * 0.78, hr * 0.72, hr * 0.5, 16, 1, true);
    const p = c.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + (Math.round(Math.atan2(p.getZ(i), p.getX(i)) / TAU * 16) % 2 ? hr * 0.42 : 0));
    c.computeVertexNormals();
    add(c, at(0, top - hr * 0.15, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * TAU;
      add(new THREE.SphereGeometry(hr * 0.09, 6, 5), at(Math.cos(a) * hr * 0.78, top - hr * 0.15 + hr * 0.67, Math.sin(a) * hr * 0.78));
    }
  } else if (hat === 'bun') {
    add(new THREE.SphereGeometry(hr * 0.55, 12, 10), at(0, top - hr * 0.2, -hr * 0.62));
    add(ghostLathe([[0.001, hr * 1.12], [hr * 0.6, hr * 1.0], [hr * 0.98, hr * 0.55], [hr * 1.06, 0]], { segs: 24, phiStart: Math.PI * 0.62, phiLength: Math.PI * 0.76, twoSided: true }), at(0, eyeY - hr * 0.1, -0.015 * s));
  } else if (hat === 'veil') {
    add(new THREE.TorusGeometry(hr * 0.72, hr * 0.06, 6, 20), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, top - hr * 0.25, -hr * 0.12));
    const hem = 0.55 * w * f * (1 + k);
    add(ghostLathe([[hr * 0.7, top - hr * 0.2], [hr * 1.05, top - hr * 0.6], [hem * 0.55, 1.0 * s], [hem * 0.8, 0.5 * s], [hem * 0.95, 0.12 * s]], { segs: 28, phiStart: Math.PI * 0.35, phiLength: Math.PI * 1.3, twoSided: true }), at(0, 0, -0.05 * s));   // open in front of her face
  } else if (hat === 'hood') {
    const hood = new THREE.SphereGeometry(hr * 1.2, 20, 12, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI * 0.62);
    const p = hood.attributes.position;
    for (let i = 0; i < p.count; i++) {                                        // drawn up to a point at the back
      const y = p.getY(i), z = p.getZ(i);
      if (y > hr * 0.5) p.setXYZ(i, p.getX(i) * 0.85, y + (y - hr * 0.5) * 0.9, z - (y - hr * 0.5) * 0.7);
    }
    hood.computeVertexNormals();
    add(hood, at(0, eyeY + 0.02 * s, -0.04 * s)); add(insideOut(hood), at(0, eyeY + 0.02 * s, -0.04 * s));
    add(ghostLathe([[0.4 * w, 1.26 * s], [0.7 * w, 1.12 * s], [0.78 * w, 0.92 * s]], { segs: 24, phiStart: Math.PI * 0.62, phiLength: Math.PI * 0.76, twoSided: true }));   // the cowl's cape
  }
  return mergeGeometries(parts, false);
}

// the original sheet-ghost lathe (hem at y=0, head top near `height`, front faces +z), shown with ?figures=0
export function classicGhostGeometry({ height = 1.7, width = 0.5, flare = 1.0, arms = 'out', hat = null, skirt = 0 } = {}) {
  const s = height / 1.72;
  const prof = [
    [width * flare * (1 + skirt), 0.0], [width * 0.95 * flare * (1 + skirt * 0.6), 0.16], [width * 0.82 * (1 + skirt * 0.25), 0.46],
    [width * 0.68, 0.84], [width * 0.58, 1.04], [width * 0.44, 1.17], [width * 0.33, 1.24],
    [width * 0.5, 1.33], [width * 0.56, 1.45], [width * 0.5, 1.57], [width * 0.32, 1.67], [0.001, 1.72],
  ].map(([r, y]) => new THREE.Vector2(r, y * s));
  let g = new THREE.LatheGeometry(prof, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0.05 * s) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      p.setY(i, y + Math.sin(a * 7.0) * 0.075 * height);
    }
  }
  g.computeVertexNormals();
  const parts = [prepGeo(g)];
  const add = (geo, m) => parts.push(prepGeo(geo, m));
  const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sc = 1) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sc, sc, sc));
  if (arms) {
    const arm = new THREE.CylinderGeometry(0.075 * s, 0.13 * s, 0.62 * s, 8, 1, false);
    arm.translate(0, -0.06 * s, 0);
    const hand = new THREE.SphereGeometry(0.085 * s, 8, 6);
    const ay = 1.06 * s;
    if (arms === 'out') {
      add(arm, M4(-width * 0.78, ay - 0.1 * s, 0.05, 0, 0, -1.1));
      add(arm, M4(width * 0.78, ay - 0.1 * s, 0.05, 0, 0, 1.1));
    } else if (arms === 'up') {
      add(arm, M4(-width * 0.66, ay + 0.22 * s, 0.05, 0, 0, -0.35));
      add(arm, M4(width * 0.66, ay + 0.22 * s, 0.05, 0, 0, 0.35));
    } else if (arms === 'front') {
      add(arm, M4(-width * 0.5, ay - 0.05 * s, 0.32 * s, 1.25, 0, -0.2));
      add(arm, M4(width * 0.5, ay - 0.05 * s, 0.32 * s, 1.25, 0, 0.2));
    } else if (arms === 'down') {
      add(arm, M4(-width * 0.66, ay - 0.26 * s, 0.02, 0, 0, -0.32));
      add(arm, M4(width * 0.66, ay - 0.26 * s, 0.02, 0, 0, 0.32));
    } else if (arms === 'hitch') {
      add(arm, M4(-width * 0.8, ay + 0.02 * s, 0.05, 0, 0, -1.35));
      add(hand, M4(-width * 0.8 - 0.36 * s, ay + 0.06 * s, 0.05));
      add(new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.16 * s, 6), M4(-width * 0.8 - 0.38 * s, ay + 0.17 * s, 0.05));
      add(arm, M4(width * 0.62, ay - 0.28 * s, 0.02, 0, 0, 0.3));
    }
  }
  if (hat === 'top') {
    add(new THREE.CylinderGeometry(0.34 * s, 0.34 * s, 0.03 * s, 14), M4(0, 1.66 * s, 0));
    add(new THREE.CylinderGeometry(0.2 * s, 0.22 * s, 0.38 * s, 14), M4(0, 1.86 * s, 0));
  } else if (hat === 'bowler') {
    add(new THREE.CylinderGeometry(0.3 * s, 0.3 * s, 0.03 * s, 14), M4(0, 1.64 * s, 0));
    add(new THREE.SphereGeometry(0.21 * s, 12, 8, 0, TAU, 0, Math.PI / 2), M4(0, 1.65 * s, 0));
  } else if (hat === 'veil') {
    add(new THREE.ConeGeometry(0.62 * s, 1.2 * s, 16, 1, true), M4(0, 1.18 * s, -0.08 * s, -0.12, 0, 0));
  } else if (hat === 'bun') {
    add(new THREE.SphereGeometry(0.16 * s, 10, 8), M4(0, 1.75 * s, -0.12 * s));
  } else if (hat === 'crown') {
    add(new THREE.CylinderGeometry(0.2 * s, 0.17 * s, 0.17 * s, 8, 1, true), M4(0, 1.75 * s, 0));
  } else if (hat === 'hood') {
    add(new THREE.ConeGeometry(0.5 * s, 0.9 * s, 14, 1, true), M4(0, 1.62 * s, -0.04 * s));
  }
  return mergeGeometries(parts, false);
}

export function makeGhost(opts = {}) {
  const geo = ghostGeometry(opts);
  const m = ghostMaterial({ color: opts.color, opacity: opts.opacity ?? 0.9, hidden: opts.hidden, eyes: opts.eyes ?? true, eyeY: 1.47 * (opts.height ?? 1.7) / 1.72, wobble: opts.wobble ?? 1, blend: opts.blend || 'add' });
  const g = new THREE.Mesh(geo, m);
  g.renderOrder = 5;
  g.frustumCulled = true;
  g.userData.ghost = true;
  g.userData.keep = true;
  return g;
}

// ---------- hotspots ----------
// { obj, room, label, onClick, active?: ()=>bool }
export function hotspot(obj, room, label, onClick, extra = {}) {
  const h = { obj, room, label, onClick, ...extra };
  if (obj.isMesh) obj.userData.keep = true; else obj.userData.keepGroup = true;
  obj.userData.hotspot = h;
  obj.traverse((o) => { o.userData.hotspot = h; });
  W.hotspots.push(h);
  return h;
}
// an invisible box used as a clickable proxy
export function proxy(w, h, d, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ---------- lights ----------
export function addLight(light, { room = null, flicker = 0.12, speed = 6, parent = null } = {}) {
  const e = { light, base: light.intensity, room, flicker, speed, seed: Math.random() * 100, mul: 1, boost: 0 };
  W.lights.push(e);
  (parent || W.scene).add(light);
  return e;
}
export function updateLights(t, dt) {
  for (const e of W.lights) {
    const f = e.flicker ? 1 - e.flicker + e.flicker * (0.65 * noise1(t * e.speed + e.seed) + 0.35 * (0.5 + 0.5 * Math.sin(t * e.speed * 1.9 + e.seed))) : 1;
    const roomMul = e.room && W.rooms[e.room] ? W.rooms[e.room].lightMul : 1;
    e.light.intensity = e.base * f * e.mul * roomMul * (e.global === false ? 1 : W.lightMul) * (1 + e.boost);
  }
}
