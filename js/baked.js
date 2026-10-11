// Sets modelled in Blender and lit with Cycles: the Grand Hall (blender/grand_hall.py) and the mansion's
// exterior (blender/exterior.py). Each set's light is baked into two lightmaps, warm and cool. Keeping them
// apart lets the set still dim for the lantern, brighten on hover, flicker and flash with lightning. Surfaces
// are otherwise unlit, apart from the lantern, glints of the flames in polished surfaces and a cheap fake
// reflection on metals, so they cost less to draw than the procedural sets they replace.
// ?lightmap shows the lighting alone.
import { THREE, W, onUpdate, noise1, NOISE_GLSL, glow } from './core.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { T } from './materials.js';
import * as P from './props.js';

const DIR = './assets/';
const DRACO = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/';
const Q = new URLSearchParams(location.search);
const num = (k, d) => parseFloat(Q.get(k) || d);
// Blender's watts read about three times brighter than the procedural rooms' candela; these bring the baked
// light in line with the rest of the house (?kw= and ?kc= etc. override them for tuning). The Grand Hall's
// bake folds the sky light into its cool map assuming kc = 0.5 (COOL_K in blender/grand_hall.py).
const KW = num('kw', '0.34'), KC = num('kc', '0.5');
const EXT_KW = num('ekw', '0.3'), EXT_KC = num('ekc', '0.65');   // matched to the procedural facades' brightness and colour

let gltf = null;
function loader() {
  if (!gltf) {
    const draco = new DRACOLoader().setDecoderPath(DRACO);
    gltf = new GLTFLoader().setDRACOLoader(draco);
    gltf.draco = draco;
  }
  return gltf;
}
// once every set has loaded, the Draco decoder's workers can go
export function releaseLoaders() { gltf?.draco.dispose(); gltf = null; }

// Fetch a set's geometry, lightmaps and bake stats. Runs while the rest of the mansion is being built.
export async function loadBakedSet(name) {
  const tl = new THREE.TextureLoader();
  const lightmap = (f) => tl.loadAsync(DIR + f).then((t) => {
    t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    return t;
  });
  const [model, warm, cool, meta] = await Promise.all([
    loader().loadAsync(`${DIR}${name}.glb`), lightmap(`${name}_warm.webp`), lightmap(`${name}_cool.webp`),
    fetch(`${DIR}${name}.json`).then((r) => { if (!r.ok) throw new Error(`${name}.json: ${r.status}`); return r.json(); }),
  ]);
  const set = { name, scene: model.scene, warm, cool, meta, pipes: [], flames: [], fire: null };
  model.scene.traverse((o) => {
    if (o.name.startsWith('PipeTop_')) set.pipes.push(o.position.clone());
    else if (o.name.startsWith('Flame_')) set.flames.push({ p: o.position.clone(), s: o.userData.flameScale ?? 0.7 });
    else if (o.name === 'Fire') set.fire = o.position.clone();
  });
  return set;
}

// albedo for each Blender material: a flat colour, or one of the site's painted textures mapped in world space.
// metal: fake environment reflection; gloss: glints of the set's flames in polished surfaces; vein: marble.
const HALL_LOOK = {
  parquet: { map: 'parquet', uv: 4, gloss: 0.55 }, wallpaper: { map: 'papBall', uv: 2.6 }, wood_panel: { map: 'woodDark', uv: 3, gloss: 0.15 },
  ceiling: { map: 'plaster', uv: 6, color: '#8a6f86' }, runner: { map: 'rugRed', uv: 2.2 }, curtain: { map: 'curtainRose', uv: 1.6 }, rug: { map: 'rugBlue', rug: [-11.8, 3.2, 2.4, 3.2] },
  inlay_dark: { color: '#2a170d', gloss: 0.55 }, inlay_light: { map: 'woodWarm', uv: 2, color: '#d0b090', gloss: 0.55 }, inlay_gold: { color: '#c9a24a', metal: 0.45, gloss: 0.3 },
  gilt: { color: '#c9a24a', metal: 1 }, brass: { color: '#a8844e', metal: 1 }, silver: { color: '#b8b8c8', metal: 1 },
  iron: { color: '#17131d', metal: 0.5 }, mirror: { color: '#3a3e5a', metal: 1 },
  marble: { color: '#c4bccb', gloss: 0.35, vein: 1 }, marble_dark: { color: '#5e5668', gloss: 0.35, vein: 1 }, velvet: { color: '#5e1426' }, cloth: { color: '#a99fb8' },
  porcelain: { color: '#f4f0f6', gloss: 0.3 }, walnut: { color: '#2a170d', gloss: 0.2 }, mahogany: { color: '#4a1e14', gloss: 0.25 }, ivory: { color: '#efe8da', gloss: 0.2 },
  ebony: { color: '#0d0b10', gloss: 0.3 }, void: { color: '#050308' }, sheet: { color: '#e8dcc0' }, wax: { color: '#efe6cf' }, bark: { color: '#2b2129' },
};
const EXTERIOR_LOOK = {
  siding: { map: 'siding', uv: 2.6 }, trim: { color: '#ebe4f0' }, trim_dark: { color: '#2a2236' }, shutter: { color: '#2c2b45' },
  brick: { map: 'brick', uv: 2.2 }, stone: { map: 'stoneWarm', uv: 3.5 }, stone_dark: { map: 'stoneDark', uv: 3.5 },
  shingle: { map: 'shingle', uv: 2.2 }, shingle_dark: { map: 'shingleDark', uv: 2.0 }, wood_dark: { map: 'woodDark', uv: 5 },
  iron: { color: '#17131d', metal: 0.5 }, gold: { color: '#c9a24a', metal: 1 }, door: { color: '#4a1e14', gloss: 0.2 },
  bark: { color: '#4a3a40' },   // lighter than the site's bark, which gets most of its brightness from its sheen
};
// the Grand Hall's brightest flames, which polished surfaces pick up as glints: position and strength
const HALL_GLINTS = [[-5.0, 12.5, 1.6, 7], [-10.3, 7.9, -4.1, 5], [-6.4, 9.1, -0.45, 2.2], [-2.8, 9.1, -0.45, 2.2],
  [4.17, 10.6, 0.0, 1.4], [4.17, 10.6, 3.0, 1.4], [-12.4, 11.2, -4.28, 1.4], [-4.6, 9.3, -0.55, 1.2]];
const MAX_GLINTS = 8;

const VERT = /* glsl */`
  varying vec2 vLm; varying vec3 vW; varying vec3 vN;
  void main() {
    vLm = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FRAG = /* glsl */`
  uniform sampler2D uWarm, uCool, uMap;
  uniform vec3 uColor, uWarmK, uCoolK, uLampPos, uLampDir, uLampCol, uEdge, uHot, uHotCol, uEnvLow, uEnvHigh;
  uniform vec2 uLampCone, uUv;
  uniform vec4 uRug, uFire, uGlints[${MAX_GLINTS}];
  uniform float uMode, uMetal, uGloss, uVein, uGlintK, uDissolve, uDebug;
  varying vec2 vLm; varying vec3 vW; varying vec3 vN;
  ${NOISE_GLSL}
  void main() {
    float dEdge = 0.0;
    if (uDissolve > 0.001) {          // the same ectoplasm dissolve as the facade walls
      float dn = snoise(vW * 0.22) * 0.5 + 0.5;
      dn = dn * 0.72 + (snoise(vW * 1.1 + 7.0) * 0.5 + 0.5) * 0.28;
      dn = dn * 0.85 + 0.15 * clamp(1.0 - vW.y / 24.0, 0.0, 1.0);
      float thr = uDissolve * 1.12 - 0.04;
      if (dn < thr) discard;
      dEdge = 1.0 - smoothstep(0.0, 0.045, dn - thr);
    }
    vec3 albedo = uColor;
    if (uMode > 1.5) albedo *= texture2D(uMap, vec2(vW.x - uRug.x, uRug.y - vW.z) / uRug.zw).rgb;
    else if (uMode > 0.5) {           // box-mapped by the facet's dominant axis, like worldUV() in core.js
      vec3 fn = abs(cross(dFdx(vW), dFdy(vW)));
      vec2 tuv = fn.x >= fn.y && fn.x >= fn.z ? vW.zy : (fn.y >= fn.z ? vW.xz : vW.xy);
      albedo *= texture2D(uMap, tuv / uUv).rgb;
    }
    if (uVein > 0.0) {                // marble veins
      float v = abs(snoise(vW * vec3(1.3, 0.8, 1.3) + snoise(vW * 0.6) * 1.4));
      albedo *= mix(0.62, 1.0, smoothstep(0.015, 0.11, v));
    }
    if (uDebug > 0.5) albedo = vec3(0.6);
    // lightmaps store sqrt(irradiance / scale)
    vec3 w = texture2D(uWarm, vLm).rgb, c = texture2D(uCool, vLm).rgb;
    vec3 N = normalize(vN);
    float fire = 1.0 + uFire.w * (1.0 - smoothstep(0.6, 3.6, distance(vW, uFire.xyz)));
    vec3 E = w * w * uWarmK * fire + c * c * uCoolK;
    vec3 col = albedo * E;
    // the lantern, with the same spotlight falloff three.js gives the procedural rooms
    vec3 L = uLampPos - vW; float d = length(L); L /= d;
    float spot = smoothstep(uLampCone.x, uLampCone.y, dot(-L, uLampDir));
    float att = pow(clamp(1.0 - pow(d / 34.0, 4.0), 0.0, 1.0), 2.0) / max(pow(d, 1.5), 0.01);
    col += albedo * uLampCol * (max(dot(N, L), 0.0) * att * spot * 0.3183099);
    if (uMetal > 0.0) {               // metals reflect a simple environment with the brightest light as a hot spot
      vec3 V = normalize(cameraPosition - vW);
      vec3 R = reflect(-V, N);
      vec3 env = mix(uEnvLow, uEnvHigh, smoothstep(-0.4, 0.9, R.y));
      env += uHotCol * pow(max(dot(R, normalize(uHot - vW)), 0.0), 24.0);
      float lit = clamp(dot(E, vec3(0.4)), 0.04, 2.5);
      col = mix(col, albedo * (E * 0.35 + env * lit * 1.4), uMetal * 0.8);
    }
    if (uGloss > 0.0) {               // polish: the flames reflected as glints, brightest at grazing angles
      vec3 V = normalize(cameraPosition - vW);
      vec3 R = reflect(-V, N);
      float fres = 0.2 + 0.8 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
      float g = 0.0;
      for (int i = 0; i < ${MAX_GLINTS}; i++) {
        vec3 Lg = uGlints[i].xyz - vW;
        float dl = length(Lg);
        g += uGlints[i].w * pow(max(dot(R, Lg / dl), 0.0), 120.0) / (1.0 + 0.04 * dl * dl);
      }
      col += vec3(1.0, 0.7, 0.4) * (g * uGloss * fres * uGlintK);
    }
    col += uEdge * dEdge;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const NO_DISSOLVE = { uDissolve: { value: 0 }, uEdge: { value: new THREE.Color(0) } };
let WHITE = null;

// Uniforms shared by every material of a set, the lantern included (its spotlight is created after the
// rooms, so it is looked up on first use).
function sharedUniforms(set, { hot, hotCol, envLow, envHigh, glints = [] }) {
  const v3 = (a) => new THREE.Vector3(...a);
  const u = {
    uWarm: { value: set.warm }, uCool: { value: set.cool },
    uWarmK: { value: new THREE.Vector3() }, uCoolK: { value: new THREE.Vector3() },
    uLampPos: { value: new THREE.Vector3(0, -100, 0) }, uLampDir: { value: new THREE.Vector3(0, -1, 0) },
    uLampCol: { value: new THREE.Vector3() }, uLampCone: { value: new THREE.Vector2(0.9, 0.99) },
    uFire: { value: new THREE.Vector4(...(set.fire || new THREE.Vector3(0, -100, 0)).toArray(), 0) },
    uHot: { value: v3(hot) }, uHotCol: { value: v3(hotCol) }, uEnvLow: { value: v3(envLow) }, uEnvHigh: { value: v3(envHigh) },
    uGlints: { value: Array.from({ length: MAX_GLINTS }, (_, i) => new THREE.Vector4(...(glints[i] || [0, -100, 0, 0]))) },
    uGlintK: { value: 1 },
    uDebug: { value: Q.has('lightmap') ? 1 : 0 },
  };
  let lamp = null;
  const c = new THREE.Color();
  onUpdate(() => {
    lamp ??= W.scene.children.find((o) => o.isSpotLight);
    if (!lamp) return;
    u.uLampPos.value.copy(lamp.position);
    u.uLampDir.value.copy(lamp.target.position).sub(lamp.position).normalize();
    c.copy(lamp.color).multiplyScalar(lamp.intensity);
    u.uLampCol.value.set(c.r, c.g, c.b);
    u.uLampCone.value.set(Math.cos(lamp.angle), Math.cos(lamp.angle * (1 - lamp.penumbra)));
  });
  return u;
}

// Put each of a set's objects where `place(name)` says: { parent } or { dissolver: name } (it then melts and
// hides with that facade), and whether it casts shadows into the moon's shadow map.
function attach(set, shared, looks, place) {
  if (!WHITE) { WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); WHITE.needsUpdate = true; }
  const cache = new Map();
  const material = (name, wall, dis) => {
    const key = `${name}|${wall}`;
    if (cache.has(key)) return cache.get(key);
    const look = looks[name] || { color: '#808080' };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        ...shared, ...dis,
        uMap: { value: (look.map && T[look.map]) || WHITE }, uMode: { value: look.rug ? 2 : look.map ? 1 : 0 },
        uColor: { value: new THREE.Color(look.color || '#ffffff') }, uUv: { value: new THREE.Vector2(look.uv || 1, look.uv || 1) },
        uRug: { value: new THREE.Vector4(...(look.rug || [0, 0, 1, 1])) }, uMetal: { value: look.metal || 0 },
        uGloss: { value: look.gloss || 0 }, uVein: { value: look.vein || 0 },
      },
    });
    m.name = `${set.name}:${name}`;
    cache.set(key, m);
    return m;
  };
  for (const node of [...set.scene.children]) {
    const where = node.isMesh || node.children.length ? place(node.name) : null;
    if (!where) continue;
    const d = where.dissolver ? W.dissolvers.find((x) => x.name === where.dissolver) : null;
    const dis = d ? { uDissolve: d.u.uDissolve, uEdge: d.u.uEdge } : NO_DISSOLVE;
    node.traverse((o) => {
      if (!o.isMesh) return;
      o.material = material(o.material.name, d ? d.name : '', dis);
      o.castShadow = !!where.cast; o.receiveShadow = false;
      if (d && where.cast) { o.userData.cast = true; d.meshes.push(o); }   // the facade turns its shadow off as it melts
    });
    node.userData.noCompact = true;
    (d ? d.group : where.parent).add(node);
  }
}

// ---------------------------------------------------------------- the Grand Hall
export function addBakedHall(root) {
  const H = W.bakedHall;
  const shared = sharedUniforms(H, { hot: [-5.0, 12.5, 1.6], hotCol: [2.6, 1.8, 1.0], envLow: [0.05, 0.035, 0.05], envHigh: [0.6, 0.42, 0.28], glints: HALL_GLINTS });
  const G = new THREE.Group(); G.name = 'bakedHall'; G.userData.noCompact = true;
  root.add(G);
  attach(H, shared, HALL_LOOK, (name) => (name.startsWith('Hall_') ? ({ Hall_Back: { dissolver: 'back' }, Hall_Left: { dissolver: 'left' } }[name] || { parent: G }) : null));
  // candle flames (drawn with everyone else's in one instanced mesh) and a fire in the grate
  for (const f of H.flames) P.flame(G, f.p.x, f.p.y, f.p.z, f.s);
  if (H.fire) {
    const fires = [];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.12 + (i % 3) * 0.035, 0.55 + (i % 2) * 0.25, 6), glow(i % 2 ? '#ff7a1a' : '#ffc04a', 4));
      f.position.set(H.fire.x - 0.4 + i * 0.2, H.fire.y + 0.2, H.fire.z + 0.02 * (i % 2));
      f.castShadow = false;
      G.add(f); fires.push(f);
    }
    onUpdate((t) => fires.forEach((f, i) => { f.scale.y = 0.75 + 0.35 * Math.abs(Math.sin(t * (6 + i) + i * 1.7)); f.position.y = H.fire.y + 0.05 + f.scale.y * 0.25; }));
  }
  onUpdate((t) => {
    const room = W.rooms.ballroom;
    const mul = (room ? room.lightMul : 1) * W.lightMul;
    const flick = 0.95 + 0.05 * (0.65 * noise1(t * 6 + 3.1) + 0.35 * (0.5 + 0.5 * Math.sin(t * 11.4 + 1.3)));
    const storm = W.fx?.stormK || 0, flash = W.U.uFlash.value;
    shared.uWarmK.value.setScalar(H.meta.warm.scale * KW * flick * mul);
    shared.uGlintK.value = flick * mul;
    shared.uCoolK.value.setScalar(H.meta.cool.scale * KC * mul * (1 - storm * 0.25) * (1 + flash * 2.5));
    shared.uFire.value.w = 0.7 * (noise1(t * 7 + 11.3) - 0.5);
  });
  W.bakedGroup = G;
  return G;
}

// ---------------------------------------------------------------- the exterior
// Facades and mansard slopes melt with their procedural dissolvers, the roof rides on the floating roof's group,
// and the porch stays put. Warm light follows the shelf candle's flicker (and the lantern dims it with the rest
// of the house); cool light follows the moon, which dims in storms and under the lantern, plus lightning.
export function addBakedExterior(root) {
  const X = W.bakedExterior;
  const shared = sharedUniforms(X, { hot: [48, 18.5, -1], hotCol: [2.2, 1.3, 0.55], envLow: [0.02, 0.02, 0.04], envHigh: [0.22, 0.2, 0.4] });
  const G = new THREE.Group(); G.name = 'bakedExterior'; G.userData.noCompact = true;
  root.add(G);
  attach(X, shared, EXTERIOR_LOOK, (name) => {
    if (!name.startsWith('Ext_')) return null;
    const part = name.slice(4);
    if (part === 'roof') return { parent: W.roof.roof, cast: true };
    if (part === 'porch' || part === 'tree') return { parent: G, cast: true };
    return { dissolver: part, cast: true };
  });
  const candle = W.lights.find((e) => e.light.isPointLight && e.light.position.x > 40);
  onUpdate(() => {
    const warm = candle ? candle.light.intensity / candle.base : W.lightMul;
    const { moon, moonBase } = W.sky;
    shared.uWarmK.value.setScalar(X.meta.warm.scale * EXT_KW * warm);
    shared.uCoolK.value.setScalar(X.meta.cool.scale * EXT_KC * (moon.intensity / moonBase + W.U.uFlash.value * 1.5));
  });
  W.bakedExteriorGroup = G;
  return G;
}
