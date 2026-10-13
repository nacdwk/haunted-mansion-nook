// Sets modelled in Blender and lit with Cycles: the Grand Hall (blender/grand_hall.py), the Endless Hall
// (blender/endless_hall.py), the Conservatory (blender/conservatory.py), the Séance Circle (blender/seance.py), the
// mansion's exterior (blender/exterior.py) and
// the grounds round it (blender/grounds.py).
// Each set's light is baked into two lightmaps, warm and cool. Keeping them
// apart lets the set still dim for the lantern, brighten on hover, flicker and flash with lightning. Surfaces
// are otherwise unlit, apart from the lantern, glints of the flames in polished surfaces and a cheap fake
// reflection on metals, so they cost less to draw than the procedural sets they replace.
// ?lightmap shows the lighting alone.
import { THREE, W, onUpdate, noise1, NOISE_GLSL, glow } from './core.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { T, MAT } from './materials.js';
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
const END_KW = num('nkw', '0.34'), END_KC = num('nkc', '0.5');
const CON_KW = num('ckw', '1.0'), CON_KC = num('ckc', '1.2');      // its green glow and moonlight bake dimmer than candles
const SEA_KW = num('skw', '0.7'), SEA_KC = num('skc', '1.4');      // the crystal ball lights it live
const ATT_KW = num('akw', '1.0'), ATT_KC = num('akc', '6.0');     // the house's ambient light fills the Attic, as it did
const BAS_KW = num('bkw', '2.0'), BAS_KC = num('bkc', '4.0');

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
    else if (o.name.startsWith('Flame_')) set.flames.push({ p: o.position.clone(), s: o.userData.flameScale ?? 0.7, green: !!o.userData.flameGreen, blue: !!o.userData.flameBlue });
    else if (o.name === 'Fire') set.fire = o.position.clone();
  });
  return set;
}

// The sculpted figures (blender/figures.py): one object per moving part, in the frame js/outside.js animates it in,
// each lit live with its ambient occlusion in its vertex colours. Returns { part name: object }.
export async function loadFigures() {
  const model = await loader().loadAsync(`${DIR}figures.glb`);
  const parts = {};
  for (const o of model.scene.children) if (o.name.startsWith('Fig_')) parts[o.name.slice(4)] = o;
  return parts;
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
};
// the site's dark matt materials get much of their brightness from their sheen; the baked ones, being matt, are lighter
const GROUNDS_LOOK = {
  stone_warm: { map: 'stoneWarm', uv: 3.5 }, stone: { map: 'stone', uv: 4 }, stone_dark: { map: 'stoneDark', uv: 3.5 }, flags: { map: 'flags', uv: 3 },
  tomb: { color: '#888395' }, tomb_dark: { color: '#655f73' }, dirt: { color: '#362e28' }, wood_dark: { map: 'woodDark', uv: 5 },
  bark: { color: '#4a3a40' }, bark_light: { color: '#5e4f5b' }, moss: { color: '#66745c' }, foliage: { color: '#384c43' }, foliage_dark: { color: '#33433e' },
  gold: { color: '#c9a24a', metal: 1 }, black: { color: '#26212c', gloss: 0.3 }, plume: { color: '#221c27' }, walnut: { color: '#2a170d', gloss: 0.2 },
  mahogany: { color: '#4a1e14', gloss: 0.25 }, velvet: { color: '#5e1426' }, cloth: { color: '#a99fb8' }, void: { color: '#050308' },
};
// the Endless Hall: the official wallpaper (or the house's own) with its eyes glowing, as the room's material has
// them; down the corridor every texture shrinks with it, as if it ran on straight (warp() in blender/endless_hall.py:
// from z0 to z1 it shrinks to s1 about the floor at y0, standing for a corridor len long)
const TAPER = [-5.0, -7.9, 0.66 / 2.8, 0.8, 16];   // z0, z1, s1, y0, len
const ENDLESS_LOOK = {
  wallpaper: { mat: 'papEyes', glow: true }, wainscot: { map: 'wainscotDark', uv: 2.4, gloss: 0.15 }, walnut: { color: '#2a170d', gloss: 0.2 },
  gilt: { color: '#c9a24a', metal: 1 }, brass: { color: '#a8844e', metal: 1 }, plaster: { map: 'plaster', uv: 3 }, ceiling: { map: 'plaster', uv: 6 },
  checker: { map: 'checker', uv: 4, gloss: 0.5 }, marble_dark: { color: '#2e2834', gloss: 0.4, vein: 1 }, rug: { map: 'rugPurple', rug: [-0.9, 4.4, 1.8, 8.8] },
  wax: { color: '#efe6cf' }, crystal: { color: '#cfe8ff', metal: 0.6 }, mirror: { color: '#3a3e5a', metal: 1 }, void: { color: '#050308' },
  stone_dark: { map: 'stoneDark', uv: 3.5 },
  c_paper: { mat: 'papEyes', glow: true, taper: TAPER }, c_wainscot: { map: 'wainscotDark', uv: 2.4, gloss: 0.15, taper: TAPER },
  c_runner: { map: 'rugRed', uv: 2.2, taper: TAPER }, c_floor: { map: 'woodDark', uv: 3, gloss: 0.2, taper: TAPER },
};
// the Conservatory: its own damask, and the dead plants, wreaths and pall in the site's colours
const CONSERV_LOOK = {
  wallpaper: { mat: 'papConserv' }, wainscot: { map: 'wainscot', uv: 2.4, gloss: 0.15 }, walnut: { color: '#2a170d', gloss: 0.2 },
  gilt: { color: '#c9a24a', metal: 1 }, brass: { color: '#a8844e', metal: 1 }, iron: { color: '#17131d', metal: 0.5 },
  plaster: { map: 'plaster', uv: 3 }, ceiling: { map: 'plaster', uv: 6 }, checker: { map: 'checkerGreen', uv: 4, gloss: 0.45 },
  marble_dark: { color: '#2e2834', gloss: 0.4, vein: 1 }, stone: { map: 'stone', uv: 3 }, velvet: { color: '#4b2563' }, curtain: { map: 'curtainGreen', uv: 1.6 },
  wax: { color: '#efe6cf' }, terracotta: { color: '#8a4a32' }, soil: { color: '#2a1a12' }, dead_leaf: { color: '#5a4a2e' }, stem: { color: '#3a2e26' },
  flower: { color: '#4a1a2a' }, ribbon: { color: '#3a1f45' }, wicker: { color: '#5a4630' },
};
// the Séance Circle: its damask and drapes, a zodiac ceiling that glows a little, as the room's own does, and bottles
// that glow on the cabinet of curiosities
const bottle = (c) => ({ color: '#000000', emit: c, emitK: 1.6 });
const SEANCE_LOOK = {
  wallpaper: { mat: 'papSeance' }, wainscot: { map: 'wainscot', uv: 2.4, gloss: 0.15 }, walnut: { color: '#2a170d', gloss: 0.2 },
  gilt: { color: '#c9a24a', metal: 1 }, brass: { color: '#a8844e', metal: 1 }, plaster: { map: 'plaster', uv: 3 },
  zodiac: { map: 'zodiac', rug: [4.87, 4.6, 8.73, 9.2], glowMap: 'zodiac', glowK: 0.3 }, parquet: { map: 'parquet', uv: 4, gloss: 0.4, color: '#8a7868' },
  marble_dark: { color: '#2e2834', gloss: 0.4, vein: 1 }, rug: { map: 'rugPurple', rug: [7.5, 2.8, 3.8, 3.8] }, curtain: { map: 'curtainPurple', uv: 1.6 },
  wax: { color: '#efe6cf' }, glass: { color: '#141822', metal: 0.5 }, bone: { color: '#e9e3cf' }, void: { color: '#050308' },
  bottle_green: bottle('#6dffb0'), bottle_violet: bottle('#c070ff'), bottle_orange: bottle('#ff6a3a'), bottle_blue: bottle('#5ad8ff'),
};
// the Attic: plank floor and lining in the house's own wood, a lacquered piano, and the rug laid where the site had it
const ATTIC_LOOK = {
  floor: { map: 'wood', uv: 5, gloss: 0.15 }, lining: { map: 'woodDark', uv: 5 }, beam: { color: '#2e1c12', gloss: 0.1 },
  piano: { color: '#0d0b10', gloss: 0.6 }, ivory: { color: '#f2ecde', gloss: 0.2 }, brass: { color: '#a8844e', metal: 1 }, gilt: { color: '#c9a24a', metal: 1 },
  walnut: { color: '#2a170d', gloss: 0.2 }, velvet: { color: '#5e1426' }, slat: { color: '#6a4a2a' }, ribbon: { color: '#d8cfc0' },
  trunk_a: { color: '#4a2a1a', gloss: 0.15 }, trunk_b: { color: '#3a2a3a', gloss: 0.15 }, trunk_c: { color: '#2a3a3a', gloss: 0.15 },
  hatbox_a: { color: '#7a4a5a' }, hatbox_b: { color: '#4a5a7a' }, hatbox_c: { color: '#8a7a4a' }, canvas: { color: '#b9b0a2' },
  dress: { color: '#d9cfd6' }, form: { color: '#8a7a6a' }, sash: { color: '#7a2a3a' }, wax: { color: '#efe6cf' },
  mirror: { color: '#4a5070', metal: 1 }, rug: { map: 'rugBlue', rug: [-0.6, 0.4, 3.2, 2.4] },
};
// the basement: the house's stone, flagstones, its own dark damask and wainscot, and lanterns whose glass glows
const BASEMENT_LOOK = {
  stone: { map: 'stoneDark', uv: 3.5 }, flags: { map: 'flags', uv: 3, gloss: 0.2 }, damask: { map: 'papBase', uv: 2.2 },
  wainscot: { map: 'wainscotDark', uv: 2.4, gloss: 0.15 }, walnut: { color: '#2a170d', gloss: 0.2 }, wood_dark: { map: 'woodDark', uv: 5 },
  gilt: { color: '#c9a24a', metal: 1 }, brass: { color: '#a8844e', metal: 1 }, iron: { color: '#17131d', metal: 0.5 },
  velvet: { color: '#5e1426' }, wax: { color: '#efe6cf' }, glass: { color: '#000000', emit: '#ffb060', emitK: 2.6 },
};
// the lanterns over the track and the sconces between the portraits, which polished floors and gilt pick up as glints
const BASEMENT_GLINTS = [[-15.0, -1.8, 8.6, 2], [-6.0, -1.8, 8.6, 2], [3.0, -1.8, 8.6, 2], [12.6, -1.8, 8.6, 2],
  [-10.5, -2.1, 6.38, 1], [-4.7, -2.1, 6.38, 1], [1.1, -2.1, 6.38, 1], [6.9, -2.1, 6.38, 1]];
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
  uniform sampler2D uWarm, uCool, uMap, uGlowMap;
  uniform vec3 uColor, uWarmK, uCoolK, uLampPos, uLampDir, uLampCol, uEdge, uHot, uHotCol, uEnvLow, uEnvHigh, uGlowCol;
  uniform vec2 uLampCone, uUv;
  uniform vec4 uRug, uFire, uGlints[${MAX_GLINTS}], uTaper, uPoint;
  uniform vec3 uPointCol, uEmit;
  uniform float uPointDecay;
  uniform float uMode, uMetal, uGloss, uVein, uGlintK, uDissolve, uDebug, uTaperLen, uGlowK;
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
    vec3 P = vW;
    if (uTaperLen > 0.0 && vW.z < uTaper.x) {   // a forced-perspective corridor: textures as if it ran on straight
      float c = (uTaper.x - vW.z) / (uTaper.x - uTaper.y) * uTaperLen;
      float s = mix(1.0, uTaper.z, c / uTaperLen);
      P = vec3(vW.x / s, uTaper.w + (vW.y - uTaper.w) / s, uTaper.x - c);
    }
    vec2 tuv = vec2(0.0);
    if (uMode > 1.5) {                // laid on once across a rectangle (rugs, the zodiac ceiling)
      tuv = vec2(vW.x - uRug.x, uRug.y - vW.z) / uRug.zw;
      albedo *= texture2D(uMap, tuv).rgb;
    } else if (uMode > 0.5) {         // box-mapped by the facet's dominant axis, like worldUV() in core.js
      vec3 fn = abs(cross(dFdx(vW), dFdy(vW)));
      tuv = (fn.x >= fn.y && fn.x >= fn.z ? P.zy : (fn.y >= fn.z ? P.xz : P.xy)) / uUv;
      albedo *= texture2D(uMap, tuv).rgb;
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
    if (uPoint.w > 0.0) {             // a live light the bake can't know about (the coffin's glow when its lid lifts)
      vec3 Lp = uPoint.xyz - vW; float dp = length(Lp); Lp /= dp;
      float fall = pow(clamp(1.0 - pow(dp / uPoint.w, 4.0), 0.0, 1.0), 2.0) / max(pow(dp, uPointDecay), 0.01);
      vec3 Ep = uPointCol * (max(dot(N, Lp), 0.0) * fall * 0.3183099);
      col += albedo * Ep;
      E += Ep;                        // so that metals catch it too
    }
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
    if (uGlowK > 0.0) col += texture2D(uGlowMap, tuv).rgb * uGlowCol * uGlowK;   // the wallpaper's eyes, the zodiac
    col += uEmit;                     // things that glow by themselves (bottles)
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
    uPoint: { value: new THREE.Vector4(0, -100, 0, 0) }, uPointCol: { value: new THREE.Vector3() }, uPointDecay: { value: 2 },
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
// place(name) says where each of the set's objects goes: { parent } or { dissolver } (a facade it melts with), cast
// for shadows, and world when the parent has moved (the hearse) so the object keeps its baked position. The set's
// lit groups (meta.lit: thin ironwork) skip the lightmap and use the site's own lit materials.
const camel = (n) => n.replace(/_(\w)/g, (_, c) => c.toUpperCase());
function attach(set, shared, looks, place) {
  if (!WHITE) { WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); WHITE.needsUpdate = true; }
  const cache = new Map();
  const lit = set.meta.lit || [];
  const litMaterial = (name) => MAT[camel(name)] || new THREE.MeshStandardMaterial({ color: looks[name]?.color || '#808080', roughness: 0.6 });
  const material = (name, wall, dis) => {
    const key = `${name}|${wall}`;
    if (cache.has(key)) return cache.get(key);
    const look = looks[name] || { color: '#808080' };
    const src = look.mat ? MAT[look.mat] : null;      // a site material lends its texture and scale (the official wallpaper)
    const uv = src?.userData.uvScale ?? look.uv ?? 1;
    const glowK = { value: look.glowK || 0 };          // a fixed glow (glowMap), or the site material's, as it breathes
    if (look.glow && src?.emissiveMap) onUpdate(() => { glowK.value = src.emissiveIntensity; });
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        ...shared, ...dis,
        uMap: { value: src?.map || (look.map && T[look.map]) || WHITE }, uMode: { value: look.rug ? 2 : (look.map || src) ? 1 : 0 },
        uColor: { value: new THREE.Color(look.color || '#ffffff') }, uUv: { value: new THREE.Vector2(...(Array.isArray(uv) ? uv : [uv, uv])) },
        uRug: { value: new THREE.Vector4(...(look.rug || [0, 0, 1, 1])) }, uMetal: { value: look.metal || 0 },
        uGloss: { value: look.gloss || 0 }, uVein: { value: look.vein || 0 },
        uTaper: { value: new THREE.Vector4(...(look.taper || [0, 0, 1, 0]).slice(0, 4)) }, uTaperLen: { value: look.taper ? look.taper[4] : 0 },
        uGlowMap: { value: (look.glow && src?.emissiveMap) || (look.glowMap && T[look.glowMap]) || WHITE },
        uGlowCol: { value: look.glow && src ? src.emissive.clone() : new THREE.Color(look.glowMap ? 0xffffff : 0) }, uGlowK: glowK,
        uEmit: { value: new THREE.Color(look.emit || 0).multiplyScalar(look.emitK || 1) },
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
    const live = lit.some((g) => node.name.endsWith(`_${g}`));
    node.traverse((o) => {
      if (!o.isMesh) return;
      if (live) { o.material = litMaterial(o.material.name); o.castShadow = !!where.cast; o.receiveShadow = true; return; }
      o.material = material(o.material.name, d ? d.name : '', dis);
      o.castShadow = !!where.cast; o.receiveShadow = false;
      if (d && where.cast) { o.userData.cast = true; d.meshes.push(o); }   // the facade turns its shadow off as it melts
    });
    node.userData.noCompact = true;
    const parent = where.parent || d.group;
    if (where.world) { parent.updateWorldMatrix(true, false); node.applyMatrix4(parent.matrixWorld.clone().invert()); }
    parent.add(node);
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

// ---------------------------------------------------------------- the Endless Hall
// Its back wall melts with the back facade; the room and the corridor stay put. Like the Grand Hall's, its light
// follows the room's (hovering brightens it, the lantern dims it), flickers with the candles and flashes with lightning.
export function addBakedEndless(root) {
  const H = W.bakedEndless;
  const chandelier = H.flames.filter((f) => f.p.y > 5.8).map((f) => [f.p.x, f.p.y, f.p.z, 1.6]);   // glints in the polished floor
  const shared = sharedUniforms(H, { hot: [0, 5.9, 0.6], hotCol: [2.6, 1.8, 1.0], envLow: [0.05, 0.035, 0.05], envHigh: [0.6, 0.42, 0.28], glints: chandelier });
  const G = new THREE.Group(); G.name = 'bakedEndless'; G.userData.noCompact = true;
  root.add(G);
  attach(H, shared, ENDLESS_LOOK, (name) => (name === 'End_back' ? { dissolver: 'back' } : name.startsWith('End_') ? { parent: G } : null));
  for (const f of H.flames) P.flame(G, f.p.x, f.p.y, f.p.z, f.s);
  onUpdate((t) => {
    const room = W.rooms.hall;
    const mul = (room ? room.lightMul : 1) * W.lightMul;
    const flick = 0.95 + 0.05 * (0.65 * noise1(t * 6 + 7.7) + 0.35 * (0.5 + 0.5 * Math.sin(t * 10.3 + 2.1)));
    const storm = W.fx?.stormK || 0, flash = W.U.uFlash.value;
    shared.uWarmK.value.setScalar(H.meta.warm.scale * END_KW * flick * mul);
    shared.uGlintK.value = flick * mul;
    shared.uCoolK.value.setScalar(H.meta.cool.scale * END_KC * mul * (1 - storm * 0.25) * (1 + flash * 2.5));
  });
  W.bakedEndlessGroup = G;
  return G;
}

// ---------------------------------------------------------------- the Conservatory
// Its glass wall's dressing melts with the back facade and its side wall's with the right; the rest stays put. Its
// warm light (the green glow and the candles) follows the room's, and the coffin's own light, when the lid lifts, is
// added live, as the site lights the coffin with it.
export function addBakedConservatory(root) {
  const H = W.bakedConserv;
  const shared = sharedUniforms(H, { hot: [9.0, 5.0, 0.4], hotCol: [0.6, 2.4, 1.4], envLow: [0.02, 0.04, 0.04], envHigh: [0.2, 0.32, 0.4] });
  const G = new THREE.Group(); G.name = 'bakedConserv'; G.userData.noCompact = true;
  root.add(G);
  attach(H, shared, CONSERV_LOOK, (name) => ({ Con_back: { dissolver: 'back' }, Con_right: { dissolver: 'right' } }[name] || (name.startsWith('Con_') ? { parent: G } : null)));
  for (const f of H.flames) P.flame(G, f.p.x, f.p.y, f.p.z, f.s);
  const glow = W.coffinGlow, at = new THREE.Vector3();
  onUpdate((t) => {
    const room = W.rooms.conserv;
    const mul = (room ? room.lightMul : 1) * W.lightMul;
    const flick = 0.93 + 0.07 * (0.65 * noise1(t * 4 + 5.3) + 0.35 * (0.5 + 0.5 * Math.sin(t * 7.1 + 0.4)));
    const storm = W.fx?.stormK || 0, flash = W.U.uFlash.value;
    shared.uWarmK.value.setScalar(H.meta.warm.scale * CON_KW * flick * mul);
    shared.uCoolK.value.setScalar(H.meta.cool.scale * CON_KC * mul * (1 - storm * 0.25) * (1 + flash * 2.5));
    if (glow) {
      glow.getWorldPosition(at);
      shared.uPoint.value.set(at.x, at.y, at.z, glow.intensity > 0.01 ? glow.distance : 0);
      shared.uPointCol.value.set(glow.color.r, glow.color.g, glow.color.b).multiplyScalar(glow.intensity);
    }
  });
  W.bakedConservGroup = G;
  return G;
}

// ---------------------------------------------------------------- the Séance Circle
// Its back and side walls' dressing melts with those facades; the rest stays put. The crystal ball's light moves with
// it, so it is added live, the way the site lights the room's moving furniture with it; the sconces' green candles
// and the moonlight are baked.
export function addBakedSeance(root) {
  const H = W.bakedSeance;
  const shared = sharedUniforms(H, { hot: [9.4, 9.65, 0.9], hotCol: [0.6, 2.4, 1.6], envLow: [0.03, 0.03, 0.06], envHigh: [0.25, 0.3, 0.45] });
  const G = new THREE.Group(); G.name = 'bakedSeance'; G.userData.noCompact = true;
  root.add(G);
  attach(H, shared, SEANCE_LOOK, (name) => ({ Sea_back: { dissolver: 'back' }, Sea_right: { dissolver: 'right' } }[name] || (name.startsWith('Sea_') ? { parent: G } : null)));
  for (const f of H.flames) P.flame(G, f.p.x, f.p.y, f.p.z, f.s, f.green ? MAT.flameGreen : undefined);
  const ball = W.seance?.light, at = new THREE.Vector3();
  onUpdate((t) => {
    const room = W.rooms.seance;
    const mul = (room ? room.lightMul : 1) * W.lightMul;
    const flick = 0.93 + 0.07 * (0.65 * noise1(t * 5 + 2.9) + 0.35 * (0.5 + 0.5 * Math.sin(t * 9.2 + 1.1)));
    const storm = W.fx?.stormK || 0, flash = W.U.uFlash.value;
    shared.uWarmK.value.setScalar(H.meta.warm.scale * SEA_KW * flick * mul);
    shared.uCoolK.value.setScalar(H.meta.cool.scale * SEA_KC * mul * (1 - storm * 0.25) * (1 + flash * 2.5));
    if (ball) {
      ball.getWorldPosition(at);
      shared.uPoint.value.set(at.x, at.y, at.z, ball.intensity > 0.01 ? ball.distance : 0);
      shared.uPointCol.value.set(ball.color.r, ball.color.g, ball.color.b).multiplyScalar(ball.intensity);
      shared.uPointDecay.value = ball.decay;
    }
  });
  W.bakedSeanceGroup = G;
  return G;
}

// ---------------------------------------------------------------- the Attic
// Each slope's lining melts with that slope of the mansard; the floor and the furniture stay put. The bride's light
// never moves, so it is baked with the candles; the night through the ride's way out is the cool light.
export function addBakedAttic(root) {
  const H = W.bakedAttic;
  const shared = sharedUniforms(H, { hot: [1.0, 16.9, -0.4], hotCol: [1.0, 1.5, 2.6], envLow: [0.03, 0.03, 0.06], envHigh: [0.25, 0.3, 0.45] });
  const G = new THREE.Group(); G.name = 'bakedAttic'; G.userData.noCompact = true;
  root.add(G);
  attach(H, shared, ATTIC_LOOK, (name) => (name.startsWith('Att_slope-') ? { dissolver: `mansard-${name.slice(10)}` } : (name.startsWith('Att_') ? { parent: G } : null)));
  for (const f of H.flames) P.flame(G, f.p.x, f.p.y, f.p.z, f.s);
  onUpdate((t) => {
    const room = W.rooms.attic;
    const mul = (room ? room.lightMul : 1) * W.lightMul;
    const flick = 0.93 + 0.07 * (0.65 * noise1(t * 4.5 + 7.7) + 0.35 * (0.5 + 0.5 * Math.sin(t * 8.3 + 2.2)));
    const storm = W.fx?.stormK || 0, flash = W.U.uFlash.value;
    shared.uWarmK.value.setScalar(H.meta.warm.scale * ATT_KW * flick * mul);
    shared.uCoolK.value.setScalar(H.meta.cool.scale * ATT_KC * mul * (1 - storm * 0.25) * (1 + flash * 2.5));
  });
  W.bakedAtticGroup = G;
  return G;
}

// ---------------------------------------------------------------- the basement
// The Portrait Hall never melts away. Its sconces' blue candles, its lanterns and its two fill lights are baked;
// the night comes down the cellar opening the ride descends through. The light the ride turns on at the mirror
// is added live.
export function addBakedBasement(root) {
  const H = W.bakedBasement;
  const shared = sharedUniforms(H, { hot: [3.0, -1.8, 8.6], hotCol: [2.0, 1.4, 0.8], envLow: [0.03, 0.025, 0.04], envHigh: [0.3, 0.25, 0.3], glints: BASEMENT_GLINTS });
  const G = new THREE.Group(); G.name = 'bakedBasement'; G.userData.noCompact = true;
  root.add(G);
  attach(H, shared, BASEMENT_LOOK, (name) => (name.startsWith('Base_') ? { parent: G } : null));
  for (const f of H.flames) P.flame(G, f.p.x, f.p.y, f.p.z, f.s, f.blue ? MAT.flameBlue : undefined);
  onUpdate((t) => {
    const room = W.rooms.basement;
    const mul = (room ? room.lightMul : 1) * W.lightMul;
    const flick = 0.93 + 0.07 * (0.65 * noise1(t * 4.2 + 3.3) + 0.35 * (0.5 + 0.5 * Math.sin(t * 7.7 + 0.8)));
    const storm = W.fx?.stormK || 0, flash = W.U.uFlash.value;
    shared.uWarmK.value.setScalar(H.meta.warm.scale * BAS_KW * flick * mul);
    shared.uCoolK.value.setScalar(H.meta.cool.scale * BAS_KC * mul * (1 - storm * 0.25) * (1 + flash * 2.5));
    const ml = W.ride?.st.mirrorLight;
    if (ml) {
      shared.uPoint.value.set(ml.position.x, ml.position.y, ml.position.z, ml.intensity > 0.01 ? ml.distance : 0);
      shared.uPointCol.value.set(ml.color.r, ml.color.g, ml.color.b).multiplyScalar(ml.intensity);
      shared.uPointDecay.value = ml.decay;
    }
  });
  W.bakedBasementGroup = G;
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
    if (part === 'porch' || part === 'tower-base') return { parent: G, cast: true };
    // the tower: its upper half rises as the Stretching Room stretches, and each wall stretches and melts with its facet
    if (part === 'tower-upper' || part === 'tower-iron') return { parent: W.tower.upper, cast: true, world: true };
    const facet = part.match(/^tower(\d)$/);
    if (facet) return { dissolver: part, parent: W.tower.facets[+facet[1]].stretchG, cast: true, world: true };
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

// ---------------------------------------------------------------- the grounds
export function addBakedGrounds(root) {
  const X = W.bakedGrounds;
  const shared = sharedUniforms(X, { hot: [48, 18.5, -1], hotCol: [2.2, 1.3, 0.55], envLow: [0.02, 0.02, 0.04], envHigh: [0.22, 0.2, 0.4] });
  const G = new THREE.Group(); G.name = 'bakedGrounds'; G.userData.noCompact = true;
  root.add(G);
  const hearse = W.hearseBody;
  attach(X, shared, GROUNDS_LOOK, (name) => {
    if (!name.startsWith('Grd_')) return null;
    if (name.startsWith('Grd_hearse')) return hearse ? { parent: hearse, cast: true, world: true } : null;
    return { parent: G, cast: true };
  });
  const hs = hearse?.userData.hotspot;                // the baked hearse is clickable like the one it replaces
  if (hs) hearse.traverse((o) => { o.userData.hotspot = hs; });
  const candle = W.lights.find((e) => e.light.isPointLight && e.light.position.x > 40);
  onUpdate(() => {
    const warm = candle ? candle.light.intensity / candle.base : W.lightMul;
    const { moon, moonBase } = W.sky;
    shared.uWarmK.value.setScalar(X.meta.warm.scale * EXT_KW * warm);
    shared.uCoolK.value.setScalar(X.meta.cool.scale * EXT_KC * (moon.intensity / moonBase + W.U.uFlash.value * 1.5));
  });
  W.bakedGroundsGroup = G;
  return G;
}
