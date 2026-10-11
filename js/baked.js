// The Grand Hall's set, modelled in Blender and lit with Cycles (blender/grand_hall.py).
// Its light is baked into two lightmaps: warm (candles, chandelier, fire) and cool (moonlight, the ghosts' glow,
// and the house's sky and fill light). Keeping them apart lets the room still dim for the lantern, brighten on
// hover, flicker and flash with lightning. Surfaces are otherwise unlit, apart from the lantern, glints of the
// flames in polished surfaces and a cheap fake reflection on metals, so they cost less to draw than the
// procedural set they replace. ?lightmap shows the lighting alone.
import { THREE, W, onUpdate, noise1, NOISE_GLSL, glow } from './core.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { T } from './materials.js';
import * as P from './props.js';

const DIR = './assets/';
const DRACO = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/';
const Q = new URLSearchParams(location.search);
// Blender's watts read about three times brighter than the procedural rooms' candela; these bring the baked
// light in line with the rest of the house (?kw= and ?kc= override them for tuning). The bake folds the sky
// light into the cool map assuming kc = 0.5 (COOL_K in blender/grand_hall.py).
const KW = parseFloat(Q.get('kw') || '0.34'), KC = parseFloat(Q.get('kc') || '0.5');

// Fetch geometry and lightmaps. Runs while the rest of the mansion is being built.
export async function loadBakedHall() {
  const draco = new DRACOLoader().setDecoderPath(DRACO);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const tl = new THREE.TextureLoader();
  const lightmap = (f) => tl.loadAsync(DIR + f).then((t) => {
    t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    return t;
  });
  const [gltf, warm, cool, meta] = await Promise.all([
    loader.loadAsync(DIR + 'grandhall.glb'), lightmap('grandhall_warm.webp'), lightmap('grandhall_cool.webp'),
    fetch(DIR + 'grandhall.json').then((r) => { if (!r.ok) throw new Error(`grandhall.json: ${r.status}`); return r.json(); }),
  ]);
  draco.dispose();
  const H = { scene: gltf.scene, warm, cool, meta, pipes: [], flames: [], fire: null };
  gltf.scene.traverse((o) => {
    if (o.name.startsWith('PipeTop_')) H.pipes.push(o.position.clone());
    else if (o.name.startsWith('Flame_')) H.flames.push({ p: o.position.clone(), s: o.userData.flameScale ?? 0.7 });
    else if (o.name === 'Fire') H.fire = o.position.clone();
  });
  return H;
}

// albedo for each Blender material: a flat colour, or one of the site's painted textures mapped in world space.
// metal: fake environment reflection; gloss: glints of the room's flames in polished surfaces; vein: marble.
const LOOK = {
  parquet: { map: 'parquet', uv: 4, gloss: 0.55 }, wallpaper: { map: 'papBall', uv: 2.6 }, wood_panel: { map: 'woodDark', uv: 3, gloss: 0.15 },
  ceiling: { map: 'plaster', uv: 6, color: '#8a6f86' }, runner: { map: 'rugRed', uv: 2.2 }, curtain: { map: 'curtainRose', uv: 1.6 }, rug: { map: 'rugBlue', rug: [-11.8, 3.2, 2.4, 3.2] },
  inlay_dark: { color: '#2a170d', gloss: 0.55 }, inlay_light: { map: 'woodWarm', uv: 2, color: '#d0b090', gloss: 0.55 }, inlay_gold: { color: '#c9a24a', metal: 0.45, gloss: 0.3 },
  gilt: { color: '#c9a24a', metal: 1 }, brass: { color: '#a8844e', metal: 1 }, silver: { color: '#b8b8c8', metal: 1 },
  iron: { color: '#17131d', metal: 0.5 }, mirror: { color: '#3a3e5a', metal: 1 },
  marble: { color: '#c4bccb', gloss: 0.35, vein: 1 }, marble_dark: { color: '#5e5668', gloss: 0.35, vein: 1 }, velvet: { color: '#5e1426' }, cloth: { color: '#a99fb8' },
  porcelain: { color: '#f4f0f6', gloss: 0.3 }, walnut: { color: '#2a170d', gloss: 0.2 }, mahogany: { color: '#4a1e14', gloss: 0.25 }, ivory: { color: '#efe8da', gloss: 0.2 },
  ebony: { color: '#0d0b10', gloss: 0.3 }, void: { color: '#050308' }, sheet: { color: '#e8dcc0' }, wax: { color: '#efe6cf' }, bark: { color: '#2b2129' },
};
// the brightest flames, which polished surfaces pick up as glints: position and strength
const GLINTS = [[-5.0, 12.5, 1.6, 7], [-10.3, 7.9, -4.1, 5], [-6.4, 9.1, -0.45, 2.2], [-2.8, 9.1, -0.45, 2.2],
  [4.17, 10.6, 0.0, 1.4], [4.17, 10.6, 3.0, 1.4], [-12.4, 11.2, -4.28, 1.4], [-4.6, 9.3, -0.55, 1.2]];

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
  uniform vec3 uColor, uWarmK, uCoolK, uLampPos, uLampDir, uLampCol, uEdge, uHot;
  uniform vec2 uLampCone, uUv;
  uniform vec4 uRug, uFire, uGlints[${GLINTS.length}];
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
    // lightmaps store sqrt(irradiance / scale); the cool one also holds the house's sky and fill light
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
    if (uMetal > 0.0) {               // gilt and silver: reflect a candle-lit room with the chandelier as a hot spot
      vec3 V = normalize(cameraPosition - vW);
      vec3 R = reflect(-V, N);
      vec3 env = mix(vec3(0.05, 0.035, 0.05), vec3(0.6, 0.42, 0.28), smoothstep(-0.4, 0.9, R.y));
      env += vec3(2.6, 1.8, 1.0) * pow(max(dot(R, normalize(uHot - vW)), 0.0), 24.0);
      float lit = clamp(dot(E, vec3(0.4)), 0.04, 2.5);
      col = mix(col, albedo * (E * 0.35 + env * lit * 1.4), uMetal * 0.8);
    }
    if (uGloss > 0.0) {               // polish: the flames reflected as glints, brightest at grazing angles
      vec3 V = normalize(cameraPosition - vW);
      vec3 R = reflect(-V, N);
      float fres = 0.2 + 0.8 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
      float g = 0.0;
      for (int i = 0; i < ${GLINTS.length}; i++) {
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

export function addBakedHall(root) {
  const H = W.bakedHall;
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;
  const shared = {
    uWarm: { value: H.warm }, uCool: { value: H.cool },
    uWarmK: { value: new THREE.Vector3() }, uCoolK: { value: new THREE.Vector3() },
    uLampPos: { value: new THREE.Vector3(0, -100, 0) }, uLampDir: { value: new THREE.Vector3(0, -1, 0) },
    uLampCol: { value: new THREE.Vector3() }, uLampCone: { value: new THREE.Vector2(0.9, 0.99) },
    uFire: { value: new THREE.Vector4(...(H.fire || new THREE.Vector3(0, -100, 0)).toArray(), 0) },
    uHot: { value: new THREE.Vector3(-5.0, 12.5, 1.6) },
    uGlints: { value: GLINTS.map((g) => new THREE.Vector4(...g)) }, uGlintK: { value: 1 },
    uDebug: { value: Q.has('lightmap') ? 1 : 0 },
  };
  const noDissolve = { uDissolve: { value: 0 }, uEdge: { value: new THREE.Color(0) } };
  const cache = new Map();
  const material = (name, wall, dis) => {
    const key = `${name}|${wall}`;
    if (cache.has(key)) return cache.get(key);
    const look = LOOK[name] || { color: '#808080' };
    const mode = look.rug ? 2 : look.map ? 1 : 0;
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        ...shared, ...dis,
        uMap: { value: (look.map && T[look.map]) || white }, uMode: { value: mode },
        uColor: { value: new THREE.Color(look.color || '#ffffff') }, uUv: { value: new THREE.Vector2(look.uv || 1, look.uv || 1) },
        uRug: { value: new THREE.Vector4(...(look.rug || [0, 0, 1, 1])) }, uMetal: { value: look.metal || 0 },
        uGloss: { value: look.gloss || 0 }, uVein: { value: look.vein || 0 },
      },
    });
    m.name = `baked:${name}`;
    cache.set(key, m);
    return m;
  };
  const G = new THREE.Group(); G.name = 'bakedHall'; G.userData.noCompact = true;
  root.add(G);
  for (const node of [...H.scene.children]) {
    if (!node.name.startsWith('Hall_')) continue;
    const wall = { Hall_Back: 'back', Hall_Left: 'left' }[node.name] || '';
    const d = wall ? W.dissolvers.find((x) => x.name === wall) : null;
    const dis = d ? { uDissolve: d.u.uDissolve, uEdge: d.u.uEdge } : noDissolve;
    node.traverse((o) => {
      if (!o.isMesh) return;
      o.material = material(o.material.name, d ? wall : '', dis);
      o.castShadow = false; o.receiveShadow = false;
    });
    node.userData.noCompact = true;
    (d ? d.group : G).add(node);     // wall dressings hide along with their facade once it has melted away
  }
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
  // per-frame light levels (the lantern's spotlight is created after the rooms, so it is found on first use)
  let lamp = null;
  const _c = new THREE.Color();
  onUpdate((t) => {
    lamp ??= W.scene.children.find((o) => o.isSpotLight);
    const room = W.rooms.ballroom;
    const mul = (room ? room.lightMul : 1) * W.lightMul;
    const flick = 0.95 + 0.05 * (0.65 * noise1(t * 6 + 3.1) + 0.35 * (0.5 + 0.5 * Math.sin(t * 11.4 + 1.3)));
    const storm = W.fx?.stormK || 0, flash = W.U.uFlash.value;
    shared.uWarmK.value.setScalar(H.meta.warm.scale * KW * flick * mul);
    shared.uGlintK.value = flick * mul;
    shared.uCoolK.value.setScalar(H.meta.cool.scale * KC * mul * (1 - storm * 0.25) * (1 + flash * 2.5));
    shared.uFire.value.w = 0.7 * (noise1(t * 7 + 11.3) - 0.5);
    if (lamp) {
      shared.uLampPos.value.copy(lamp.position);
      shared.uLampDir.value.copy(lamp.target.position).sub(lamp.position).normalize();
      _c.copy(lamp.color).multiplyScalar(lamp.intensity);
      shared.uLampCol.value.set(_c.r, _c.g, _c.b);
      shared.uLampCone.value.set(Math.cos(lamp.angle), Math.cos(lamp.angle * (1 - lamp.penumbra)));
    }
  });
  W.bakedGroup = G;
  return G;
}
