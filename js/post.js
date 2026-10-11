// Post-processing: bloom, tilt-shift miniature blur, film grade.
import { THREE, W } from './core.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TiltShader = {
  uniforms: {
    tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uFocus: { value: 0.5 },
    uBand: { value: 0.32 }, uAmount: { value: 2.2 }, uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uDir; uniform float uFocus; uniform float uBand; uniform float uAmount; uniform vec2 uRes;
    varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - uFocus);
      float b = smoothstep(uBand * 0.5, uBand * 0.5 + 0.38, d) * uAmount;
      if (b < 0.05) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec4 sum = vec4(0.0); float ws = 0.0;
      for (int i = -6; i <= 6; i++) {
        float fi = float(i);
        float w = exp(-fi * fi / 18.0);
        sum += texture2D(tDiffuse, vUv + uDir * fi * b / uRes) * w; ws += w;
      }
      gl_FragColor = sum / ws;
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.42 }, uRes: { value: new THREE.Vector2(1, 1) },
    uFlash: { value: 0 }, uFade: { value: 0 }, uSat: { value: 1.05 }, uCA: { value: 1.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform vec2 uRes; uniform float uFlash; uniform float uFade; uniform float uSat; uniform float uCA;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * 0.006 * r2 * uCA;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col += vec3(0.012, 0.004, 0.026) * (1.0 - smoothstep(0.0, 0.18, l));
      col += vec3(0.75, 0.82, 1.0) * uFlash * 0.22 * (0.3 + l);
      float v = smoothstep(1.0, 0.28, length(c * vec2(1.0, 0.92)) * 1.32);
      col *= mix(1.0 - uVignette, 1.0, v);
      float g = hash(vUv * uRes + fract(uTime * 7.13) * 91.0) - 0.5;
      col += g * 0.018 * (0.35 + l);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function setupPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const render = new RenderPass(scene, camera);
  composer.addPass(render);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.62, 0.55, 0.82);
  composer.addPass(bloom);
  const tiltH = new ShaderPass(TiltShader);
  const tiltV = new ShaderPass(TiltShader);
  tiltV.uniforms.uDir.value.set(0, 1);
  composer.addPass(tiltH); composer.addPass(tiltV);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  const P = {
    composer, bloom, tiltH, tiltV, grade,
    tilt: { amount: 1.7, band: 0.42, focus: 0.5 },
    resize(w, h) {
      composer.setSize(w, h);
      const r = renderer.getPixelRatio();
      for (const p of [tiltH, tiltV]) p.uniforms.uRes.value.set(w * r, h * r);
      grade.uniforms.uRes.value.set(w * r, h * r);
    },
    update(dt) {
      const r = renderer.getPixelRatio();
      for (const p of [tiltH, tiltV]) {
        p.uniforms.uAmount.value = P.tilt.amount * r;
        p.uniforms.uBand.value = P.tilt.band;
        p.uniforms.uFocus.value = P.tilt.focus;
      }
      grade.uniforms.uTime.value = W.t;
      grade.uniforms.uFlash.value = W.U.uFlash.value;
    },
  };
  P.resize(size.x, size.y);
  return P;
}
