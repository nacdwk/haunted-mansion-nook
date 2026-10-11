// All sound is synthesized: ambience, an original waltz in D minor, and sound effects.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// --- the score (original) ---
const BPM = 84, BEAT = 60 / BPM, BAR = BEAT * 3;
const CHORDS = [
  ['Dm', 38, [50, 53, 57]], ['Dm', 38, [50, 53, 57]], ['Gm', 43, [50, 55, 58]], ['Dm', 38, [50, 53, 57]],
  ['Bb', 46, [50, 53, 58]], ['A7', 45, [49, 52, 55]], ['Dm', 38, [50, 53, 57]], ['A7', 45, [49, 52, 55]],
  ['Dm', 38, [50, 53, 57]], ['Dm', 38, [50, 53, 57]], ['Gm', 43, [50, 55, 58]], ['Gm', 43, [50, 55, 58]],
  ['Dm', 45, [50, 53, 57]], ['A7', 45, [49, 52, 55]], ['Dm', 38, [50, 53, 57]], ['Dm', 38, [50, 53, 57]],
];
// melody as [midi, beats] per bar
const MEL = [
  [[69, 2], [65, 1]], [[62, 2], [57, 1]], [[58, 1], [62, 1], [67, 1]], [[65, 3]],
  [[65, 1], [67, 1], [69, 1]], [[64, 2], [61, 1]], [[62, 1], [64, 1], [65, 1]], [[64, 3]],
  [[69, 2], [74, 1]], [[72, 1], [69, 1], [65, 1]], [[67, 2], [70, 1]], [[69, 1], [67, 1], [65, 1]],
  [[64, 1], [65, 1], [69, 1]], [[67, 1], [64, 1], [61, 1]], [[62, 3]], [[0, 2], [57, 1]],
];
// choir voices: bass, baritone, alto, tenor (chord tones), soprano (melody)
const SCENE_MIX = {
  explore: { box: 0.55, organ: 0.18, bass: 0.35, ther: 0.0, choir: 0.0, wind: 0.5 },
  focus_library: { box: 0.6, organ: 0.1, bass: 0.3, ther: 0.0, choir: 0, wind: 0.2 },
  focus_hall: { box: 0.45, organ: 0.05, bass: 0.25, ther: 0.35, choir: 0, wind: 0.2 },
  focus_conserv: { box: 0.25, organ: 0.3, bass: 0.3, ther: 0.15, choir: 0, wind: 0.3 },
  focus_seance: { box: 0.1, organ: 0.1, bass: 0.25, ther: 0.6, choir: 0.15, wind: 0.2 },
  focus_ballroom: { box: 0.15, organ: 0.85, bass: 0.6, ther: 0.0, choir: 0.0, wind: 0.1 },
  focus_attic: { box: 0.7, organ: 0.0, bass: 0.15, ther: 0.2, choir: 0, wind: 0.4 },
  focus_basement: { box: 0.35, organ: 0.25, bass: 0.35, ther: 0.15, choir: 0, wind: 0.15 },
  focus_tower: { box: 0.3, organ: 0.3, bass: 0.3, ther: 0.3, choir: 0, wind: 0.2 },
  focus_graveyard: { box: 0.15, organ: 0.25, bass: 0.6, ther: 0.0, choir: 0.85, wind: 0.6 },
  focus_yard: { box: 0.4, organ: 0.15, bass: 0.35, ther: 0.1, choir: 0.1, wind: 0.7 },
  ride: { box: 0.35, organ: 0.25, bass: 0.3, ther: 0.25, choir: 0, wind: 0.3 },
  board: { box: 0.45, organ: 0.2, bass: 0.35, ther: 0.1, choir: 0, wind: 0.15 },
  portraits: { box: 0.45, organ: 0.2, bass: 0.35, ther: 0.2, choir: 0, wind: 0.15 },
  library: { box: 0.6, organ: 0.1, bass: 0.3, ther: 0.0, choir: 0, wind: 0.1 },
  hall: { box: 0.45, organ: 0.05, bass: 0.25, ther: 0.4, choir: 0, wind: 0.1 },
  conserv: { box: 0.25, organ: 0.35, bass: 0.3, ther: 0.15, choir: 0, wind: 0.2 },
  outside: { box: 0.3, organ: 0.2, bass: 0.3, ther: 0.2, choir: 0, wind: 0.8 },
  seance: { box: 0.05, organ: 0.1, bass: 0.25, ther: 0.65, choir: 0.15, wind: 0.1 },
  ballroom: { box: 0.1, organ: 0.95, bass: 0.65, ther: 0.0, choir: 0.0, wind: 0.05 },
  attic: { box: 0.75, organ: 0.0, bass: 0.15, ther: 0.25, choir: 0, wind: 0.4 },
  drop: { box: 0.2, organ: 0.3, bass: 0.5, ther: 0.3, choir: 0.2, wind: 1.0 },
  graveyard: { box: 0.1, organ: 0.25, bass: 0.65, ther: 0.0, choir: 0.95, wind: 0.6 },
  crypt: { box: 0.2, organ: 0.2, bass: 0.55, ther: 0.15, choir: 0.7, wind: 0.5 },
  mirror: { box: 0.6, organ: 0.0, bass: 0.2, ther: 0.35, choir: 0.1, wind: 0.2 },
};

export function createAudio() {
  const A = { started: false, muted: false };
  let ctx = null, master, comp, reverb, revSend, music, sfxBus, amb;
  const busGain = {};
  let windGain, windFilter, rainGain, noiseBuf, brownBuf;
  let mix = { ...SCENE_MIX.explore }, target = { ...SCENE_MIX.explore };
  let boost = { organ: 0, all: 0 };
  let nextBar = 0, barIdx = 0, timer = null;
  const voiceOn = [true, true, true, true, true];
  const voiceEnv = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
  let stormOn = false;

  function makeNoise(seconds, brown = false) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
    }
    return buf;
  }
  function makeIR(seconds = 3.2, decay = 2.6) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1);
    }
    return buf;
  }
  function out(node, { rev = 0.35, bus = sfxBus, pan = 0 } = {}) {
    let n = node;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
    n.connect(bus);
    if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; n.connect(s); s.connect(revSend); }
    return n;
  }
  function env(g, t, a, peak, d, sustain = 0, r = 0.1, hold = 0) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (sustain > 0) { g.gain.setTargetAtTime(sustain, t + a, d / 3); g.gain.setTargetAtTime(0.0001, t + a + hold, r / 3); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  A.start = async () => {
    if (ctx) { if (ctx.state !== 'running') await ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = A.muted ? 0 : 0.8;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = makeIR();
    revSend = ctx.createGain(); revSend.gain.value = 0.8;
    revSend.connect(reverb); reverb.connect(master);
    music = ctx.createGain(); music.gain.value = 0.42; music.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0.5; amb.connect(master);
    for (const k of ['box', 'organ', 'bass', 'ther', 'choir']) {
      const g = ctx.createGain(); g.gain.value = mix[k]; g.connect(music);
      const s = ctx.createGain(); s.gain.value = k === 'bass' ? 0.12 : 0.45; g.connect(s); s.connect(revSend);
      busGain[k] = g;
    }
    noiseBuf = makeNoise(2.5); brownBuf = makeNoise(4, true);
    // wind
    const w = ctx.createBufferSource(); w.buffer = brownBuf; w.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 420; windFilter.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0.25;
    w.connect(windFilter); windFilter.connect(windGain); windGain.connect(amb); w.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lfoG = ctx.createGain(); lfoG.gain.value = 260; lfo.connect(lfoG); lfoG.connect(windFilter.frequency); lfo.start();
    // rain
    const r = ctx.createBufferSource(); r.buffer = noiseBuf; r.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1800;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    r.connect(rf); rf.connect(rainGain); rainGain.connect(amb); r.start();
    nextBar = ctx.currentTime + 0.2;
    timer = setInterval(schedule, 40);
    A.started = true;
    ambientCritters();
  };
  A.setMuted = (m) => { A.muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.15); };
  A.setScene = (tag) => { const m = SCENE_MIX[tag] || SCENE_MIX[`focus_${tag}`] || SCENE_MIX.explore; target = { ...m }; };
  A.setFocus = (room) => { A.setScene(room ? `focus_${room}` : 'explore'); };
  A.setStorm = (on) => { stormOn = on; };
  A.setMusicBoost = (k, secs) => { boost[k] = secs; };
  A.toggleVoice = (i) => { voiceOn[i] = !voiceOn[i]; if (!ctx) return; if (voiceOn[i]) { target.choir = Math.max(target.choir, 0.85); } };
  A.chorusLevel = () => {
    if (!ctx || target.choir < 0.05) return null;
    const t = ctx.currentTime;
    return voiceEnv.map(([s, e], i) => (voiceOn[i] && t >= s && t <= e ? 0.55 + 0.45 * Math.abs(Math.sin((t - s) * 7 + i)) : 0.05));
  };

  // ------------------------------------------------ instruments
  function organ(t, m, dur, vel = 1) {
    const f = mtof(m);
    const g = ctx.createGain(); g.connect(busGain.organ);
    const trem = ctx.createOscillator(); trem.frequency.value = 5.6; const tg = ctx.createGain(); tg.gain.value = 0.04; trem.connect(tg); tg.connect(g.gain);
    const parts = [[1, 0.5], [2, 0.32], [3, 0.12], [4, 0.18], [6, 0.06], [0.5, 0.25]];
    for (const [h, a] of parts) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * h; o.detune.value = (Math.random() - 0.5) * 6;
      const og = ctx.createGain(); og.gain.value = a * 0.11 * vel; o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 0.5);
    }
    trem.start(t); trem.stop(t + dur + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.04); g.gain.setValueAtTime(1, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.35);
  }
  function box(t, m, vel = 1, dest = busGain.box) {
    const f = mtof(m);
    const g = ctx.createGain(); g.connect(dest);
    for (const [h, a, d] of [[1, 0.5, 1.6], [4, 0.12, 0.4], [6.9, 0.05, 0.2]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * h;
      const og = ctx.createGain(); env(og, t, 0.004, a * 0.5 * vel, d); o.connect(og); og.connect(g);
      o.start(t); o.stop(t + d + 0.1);
    }
  }
  function bass(t, m, dur) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
    const g = ctx.createGain(); env(g, t, 0.01, 0.42, dur * 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    o.connect(lp); lp.connect(g); g.connect(busGain.bass); o.start(t); o.stop(t + dur + 0.2);
  }
  function theremin(t, m, dur, prevM) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = mtof(m + 12), pf = prevM ? mtof(prevM + 12) : f;
    o.frequency.setValueAtTime(pf, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const vib = ctx.createOscillator(); vib.frequency.value = 6.2; const vg = ctx.createGain(); vg.gain.value = f * 0.012; vib.connect(vg); vg.connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.09); g.gain.setValueAtTime(0.16, t + dur * 0.85); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(g); g.connect(busGain.ther); o.start(t); vib.start(t); o.stop(t + dur + 0.2); vib.stop(t + dur + 0.2);
  }
  function voice(t, m, dur, i, vowel = 0) {
    const f = mtof(m);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const vib = ctx.createOscillator(); vib.frequency.value = 5 + i * 0.3; const vg = ctx.createGain(); vg.gain.value = f * 0.01; vib.connect(vg); vg.connect(o.frequency);
    const formants = vowel ? [[400, 1], [1600, 0.4], [2700, 0.2]] : [[750, 1], [1150, 0.6], [2700, 0.25]];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + 0.12); g.gain.setValueAtTime(0.11, t + dur * 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
    for (const [ff, a] of formants) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff * (i === 4 ? 1.15 : 1); bp.Q.value = 7; const bg = ctx.createGain(); bg.gain.value = a * 1.3; o.connect(bp); bp.connect(bg); bg.connect(g); }
    g.connect(busGain.choir);
    o.start(t); vib.start(t); o.stop(t + dur + 0.2); vib.stop(t + dur + 0.2);
    voiceEnv[i] = [t, t + dur];
  }
  let prevMel = 0;
  function schedule() {
    if (!ctx) return;
    // mix smoothing
    const dt = 0.04;
    for (const k of Object.keys(target)) {
      if (!(k in mix)) mix[k] = 0;
      mix[k] += (target[k] - mix[k]) * Math.min(1, dt * 1.6);
      if (busGain[k]) {
        let v = mix[k];
        if (k === 'organ' && boost.organ > 0) v = Math.max(v, 0.9);
        if (boost.all > 0) v = Math.max(v, k === 'choir' ? 0.8 : 0.7);
        busGain[k].gain.setTargetAtTime(v, ctx.currentTime, 0.2);
      }
    }
    boost.organ = Math.max(0, boost.organ - dt); boost.all = Math.max(0, boost.all - dt);
    if (windGain) windGain.gain.setTargetAtTime(0.12 + (mix.wind || 0) * 0.25 + (stormOn ? 0.3 : 0), ctx.currentTime, 0.5);
    if (rainGain) rainGain.gain.setTargetAtTime(stormOn ? 0.09 : 0, ctx.currentTime, 0.8);
    while (nextBar < ctx.currentTime + 0.25) {
      const bi = barIdx % 16;
      const [, root, chord] = CHORDS[bi];
      const t = nextBar;
      if (mix.bass > 0.02) bass(t, root, BEAT * 0.95);
      if (mix.organ > 0.02 || boost.organ > 0 || boost.all > 0) {
        organ(t, root + 12, BAR * 0.97, 0.8);
        for (const b of [1, 2]) for (const n of chord) organ(t + b * BEAT, n + 12, BEAT * 0.55, 0.55);
      }
      let beat = 0;
      for (const [m, len] of MEL[bi]) {
        const nt = t + beat * BEAT;
        if (m > 0) {
          if (mix.box > 0.02 || boost.all > 0) box(nt, m + 12, 1);
          if (mix.ther > 0.02) theremin(nt, m, len * BEAT * 0.95, prevMel);
          if ((mix.choir > 0.02 || boost.all > 0) && voiceOn[4]) voice(nt, m, len * BEAT * 0.95, 4, bi % 4 === 3 ? 1 : 0);
          prevMel = m;
        }
        beat += len;
      }
      if (mix.choir > 0.02 || boost.all > 0) {
        const tones = [root - 12 + 12, chord[0], chord[1], chord[2]];
        tones.forEach((m, i) => { if (voiceOn[i]) voice(t, m, BAR * 0.98, i, 0); });
      }
      nextBar += BAR;
      barIdx++;
    }
  }
  // ------------------------------------------------ ambience critters
  function ambientCritters() {
    const go = () => {
      if (!ctx) return;
      const t = ctx.currentTime + 0.05;
      if (Math.random() < 0.5) owl(t); else howl(t, 0.35);
      setTimeout(go, 18000 + Math.random() * 26000);
    };
    setTimeout(go, 9000);
  }
  function owl(t) {
    for (const [dt, f] of [[0, 380], [0.42, 360], [0.62, 360]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t + dt); o.frequency.linearRampToValueAtTime(f * 0.92, t + dt + 0.25);
      const g = ctx.createGain(); env(g, t + dt, 0.04, 0.07, 0.3); o.connect(g); out(g, { rev: 0.9, bus: amb, pan: -0.5 }); o.start(t + dt); o.stop(t + dt + 0.4);
    }
  }
  function howl(t, vol = 0.5) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(380, t); o.frequency.linearRampToValueAtTime(640, t + 0.7); o.frequency.linearRampToValueAtTime(600, t + 1.6); o.frequency.linearRampToValueAtTime(420, t + 2.6);
    const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = 9; vib.connect(vg); vg.connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12 * vol, t + 0.5); g.gain.linearRampToValueAtTime(0.0001, t + 2.7);
    o.connect(g); out(g, { rev: 1.0, bus: amb, pan: 0.6 }); o.start(t); vib.start(t); o.stop(t + 2.8); vib.stop(t + 2.8);
  }
  // ------------------------------------------------ sound effects
  function noise(t, dur, { type = 'bandpass', f = 1000, q = 1, gain = 0.4, a = 0.005, rev = 0.3, f2 = null, pan = 0, hp = 0 } = {}) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = ctx.createGain(); env(g, t, a, gain, dur);
    s.connect(fl); fl.connect(g);
    if (hp) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; g.connect(h); out(h, { rev, pan }); } else out(g, { rev, pan });
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1);
  }
  function tone(t, f, dur, { type = 'sine', gain = 0.3, a = 0.005, f2 = null, rev = 0.3, vib = 0, pan = 0, bus } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    if (vib) { const v = ctx.createOscillator(); v.frequency.value = vib; const vg = ctx.createGain(); vg.gain.value = f * 0.02; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + dur + 0.1); }
    const g = ctx.createGain(); env(g, t, a, gain, dur);
    o.connect(g); out(g, { rev, pan, bus: bus || sfxBus }); o.start(t); o.stop(t + dur + 0.1);
  }
  function bell(t, f, gain = 0.25, rev = 0.6) {
    for (const [h, a, d] of [[1, 1, 3.2], [2.76, 0.5, 1.8], [5.4, 0.3, 1.0], [8.93, 0.15, 0.6]]) tone(t, f * h, d, { gain: gain * a, a: 0.002, rev });
  }
  const FX = {
    knock(o = {}) { const t = ctx.currentTime; const n = o.soft ? 2 : 3; for (let i = 0; i < n; i++) { const tt = t + i * 0.19; noise(tt, 0.09, { type: 'lowpass', f: o.muffled ? 260 : 520, gain: o.soft ? 0.25 : 0.6, rev: 0.25 }); tone(tt, o.muffled ? 70 : 105, 0.12, { gain: o.soft ? 0.25 : 0.5, rev: 0.2 }); } },
    creak(o = {}) { const t = ctx.currentTime; const os = ctx.createOscillator(); os.type = 'sawtooth'; const f = o.low ? 70 : 120; os.frequency.setValueAtTime(f, t); os.frequency.linearRampToValueAtTime(f * 1.35, t + 0.5); os.frequency.linearRampToValueAtTime(f * 0.9, t + 0.9); const lfo = ctx.createOscillator(); lfo.frequency.value = 23; const lg = ctx.createGain(); lg.gain.value = f * 0.25; lfo.connect(lg); lg.connect(os.frequency); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.low ? 600 : 1100; bp.Q.value = 5; const g = ctx.createGain(); env(g, t, 0.08, 0.35, 0.9); os.connect(bp); bp.connect(g); out(g, { rev: 0.4 }); os.start(t); lfo.start(t); os.stop(t + 1.1); lfo.stop(t + 1.1); },
    chime(n = 13) { const t = ctx.currentTime; for (let i = 0; i < n; i++) bell(t + i * 0.55, i === n - 1 ? 196 : 220, 0.16 - i * 0.004); },
    whoosh() { noise(ctx.currentTime, 0.9, { f: 300, f2: 2400, q: 1.5, gain: 0.35, a: 0.35, rev: 0.4 }); },
    gasp() { noise(ctx.currentTime, 0.45, { f: 1600, q: 1.2, gain: 0.3, a: 0.12, rev: 0.4 }); },
    flutter() { const t = ctx.currentTime; for (let i = 0; i < 9; i++) noise(t + i * 0.055, 0.05, { f: 2400, q: 2, gain: 0.2, rev: 0.2 }); },
    whisper() { const t = ctx.currentTime; for (let i = 0; i < 6; i++) noise(t + i * 0.16 + Math.random() * 0.05, 0.18, { f: 2800 + Math.random() * 1200, q: 3, gain: 0.12, rev: 0.6, pan: Math.random() * 2 - 1 }); },
    shush() { noise(ctx.currentTime, 0.7, { type: 'highpass', f: 3000, gain: 0.25, a: 0.08, rev: 0.3 }); },
    caw() { const t = ctx.currentTime; for (const d of [0, 0.32]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(560, t + d); o.frequency.exponentialRampToValueAtTime(330, t + d + 0.26); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 2.5; const g = ctx.createGain(); env(g, t + d, 0.01, 0.4, 0.28); o.connect(bp); bp.connect(g); out(g, { rev: 0.5 }); o.start(t + d); o.stop(t + d + 0.35); } },
    tambourine() { const t = ctx.currentTime; for (let i = 0; i < 7; i++) noise(t + i * 0.14 + (i % 2) * 0.03, 0.16, { type: 'highpass', f: 6000, gain: 0.3, rev: 0.35 }); },
    organ() { const t = ctx.currentTime + 0.02; for (const m of [38, 50, 57, 62, 65, 69]) organ(t, m, 2.2, 0.9); },
    swirl() { const t = ctx.currentTime; [62, 65, 69, 74, 77, 81].forEach((m, i) => box(t + i * 0.08, m + 12, 0.9, sfxBus)); FX.whoosh(); },
    blow() { noise(ctx.currentTime, 0.5, { type: 'lowpass', f: 1600, f2: 300, gain: 0.4, a: 0.05, rev: 0.2 }); },
    whee() { tone(ctx.currentTime, 520, 1.1, { gain: 0.15, f2: 980, vib: 6, a: 0.1, rev: 0.7 }); },
    bang() { const t = ctx.currentTime; noise(t, 0.35, { type: 'lowpass', f: 1800, f2: 200, gain: 0.8, rev: 0.7 }); tone(t, 90, 0.3, { gain: 0.6, f2: 40, rev: 0.5 }); },
    heartbeat() { const t = ctx.currentTime; for (let i = 0; i < 4; i++) { tone(t + i * 0.8, 62, 0.16, { gain: 0.7, f2: 38, rev: 0.15 }); tone(t + i * 0.8 + 0.22, 55, 0.14, { gain: 0.5, f2: 34, rev: 0.15 }); } },
    pop() { const t = ctx.currentTime; tone(t, 280, 0.16, { gain: 0.25, f2: 900, rev: 0.3 }); noise(t, 0.04, { f: 3000, gain: 0.2 }); },
    piano() { const t = ctx.currentTime; [50, 53, 57, 60, 62, 60, 57, 53].forEach((m, i) => { tone(t + i * 0.22, mtof(m + 12), 1.4, { type: 'triangle', gain: 0.13, rev: 0.6 }); }); },
    stretch() { const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(62, t); o.frequency.linearRampToValueAtTime(42, t + 5); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 1.2); g.gain.linearRampToValueAtTime(0.0001, t + 5.2); o.connect(lp); lp.connect(g); out(g, { rev: 0.6 }); o.start(t); o.stop(t + 5.3); for (let i = 0; i < 4; i++) setTimeout(() => FX.creak({ low: true }), 700 + i * 1100); },
    scream() { const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(950, t); o.frequency.exponentialRampToValueAtTime(520, t + 1.3); const vib = ctx.createOscillator(); vib.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = 40; vib.connect(vg); vg.connect(o.frequency); const g = ctx.createGain(); env(g, t, 0.05, 0.12, 1.3); for (const [ff, q] of [[900, 6], [1400, 5]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q; o.connect(bp); bp.connect(g); } out(g, { rev: 1.2 }); o.start(t); vib.start(t); o.stop(t + 1.4); vib.stop(t + 1.4); },
    thunder(s = 1) { const t = ctx.currentTime; noise(t, 0.25, { type: 'highpass', f: 1500, gain: 0.25 * s, rev: 0.6 }); noise(t + 0.05, 3.2 * s + 0.8, { type: 'lowpass', f: 700, f2: 90, gain: 0.85 * s, a: 0.06, rev: 0.8 }); noise(t + 0.6, 2.4, { type: 'lowpass', f: 220, f2: 60, gain: 0.5 * s, a: 0.3, rev: 0.6 }); },
    incant() { const t = ctx.currentTime; [74, 72, 69, 70, 69, 65, 64, 62].forEach((m, i) => theremin(t + i * 0.55, m - 12, 0.6, i ? 74 : 0)); FX.whisper(); },
    bark() { const t = ctx.currentTime; for (const d of [0, 0.28]) tone(t + d, 340, 0.16, { type: 'sawtooth', gain: 0.12, f2: 200, rev: 1.0 }); },
    neigh() { tone(ctx.currentTime, 620, 1.1, { type: 'sawtooth', gain: 0.07, f2: 480, vib: 14, a: 0.05, rev: 0.6 }); },
    howl() { howl(ctx.currentTime, 1); },
    hitch() { const t = ctx.currentTime; tone(t, 330, 0.5, { gain: 0.15, f2: 520, vib: 5, rev: 0.9 }); tone(t + 0.5, 520, 0.7, { gain: 0.15, f2: 300, vib: 5, rev: 0.9 }); [69, 74, 77].forEach((m, i) => box(t + 1.1 + i * 0.12, m + 12, 0.8, sfxBus)); },
    aria() { const t = ctx.currentTime; [[81, 0.5], [84, 0.5], [86, 1.2], [84, 0.4], [81, 1.4]].reduce((acc, [m, d]) => { voice(t + acc, m - 12, d, 4, 0); return acc + d; }, 0); },
    collect() { const t = ctx.currentTime; [74, 78, 81, 86, 90].forEach((m, i) => tone(t + i * 0.07, mtof(m), 0.6, { gain: 0.12, rev: 0.7 })); },
    jubilee() { const t = ctx.currentTime + 0.05; for (const m of [38, 50, 57, 62, 65, 69, 74]) organ(t, m, 3.2, 0.9); FX.collect(); FX.whee(); },
    match() { const t = ctx.currentTime; noise(t, 0.12, { type: 'highpass', f: 2500, gain: 0.35, rev: 0.1 }); noise(t + 0.1, 0.6, { type: 'bandpass', f: 800, q: 0.7, gain: 0.18, a: 0.08, rev: 0.2 }); },
    blowout() { FX.blow(); },
    click() { tone(ctx.currentTime, 1800, 0.04, { gain: 0.06, rev: 0.05 }); },
    ride() { FX.whoosh(); },
  };
  A.sfx = (name, ...args) => {
    if (!ctx || A.muted) return;
    const f = FX[name];
    if (f) try { f(...args); } catch (e) { /* ignore */ }
  };
  return A;
}
