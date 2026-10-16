/**
 * Wild Kingdom 3D — a small Web Audio synth (no sample files). Animal calls,
 * footsteps, combat, eating/drinking and the ambience (wind, water, rain,
 * birdsong, night crickets, thunder) are all generated. Everything routes
 * through one master gain, so the GamePlayer Mute button silences it all.
 * The AudioContext is created on the first user gesture (`unlock`).
 */
let ctx = null;
let master = null;
let noise = null;
let muted = false;
let volume = 0.8;
let loops = null;
let birdT = 2;
let cricketT = 1;
const BASE = 0.6;

function now() {
  return ctx.currentTime;
}
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function osc(freq, dur, { type = "sine", vol = 0.2, to = null, at = 0, attack = 0.01, filter = null, vib = 0, vibF = 6 } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = now() + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) {
    if (Array.isArray(to)) {
      let tt = t;
      for (const [f, d] of to) {
        tt += d;
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f), tt);
      }
    } else o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  }
  if (vib) {
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    l.frequency.value = vibF;
    lg.gain.value = vib;
    l.connect(lg).connect(o.frequency);
    l.start(t);
    l.stop(t + dur + 0.05);
  }
  env(g, t, attack, vol, dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || "lowpass";
    f.frequency.value = filter.f;
    f.Q.value = filter.q || 1;
    node = o.connect(f);
  }
  node.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function hiss(dur, { freq = 900, to = null, q = 1, vol = 0.2, type = "bandpass", at = 0, attack = 0.005, rate = 1 } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = now() + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 2);
  src.stop(t + dur + 0.05);
}
function loopNoise(type, f0, q = 0.7) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = f0;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(master);
  src.start(0, Math.random() * 2);
  return { src, f, g };
}
const set = (param, v, k = 0.25) => param.setTargetAtTime(v, now(), k);
const dv = (d, ref = 25) => Math.max(0, Math.min(1, ref / Math.max(ref, d)));

export const audio = {
  unlock() {
    if (typeof window === "undefined") return;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : BASE * volume;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loops = {
        wind: loopNoise("bandpass", 420, 0.5),
        water: loopNoise("lowpass", 900, 0.4),
        rain: loopNoise("highpass", 2600, 0.3),
        rumble: loopNoise("lowpass", 120, 0.8),
      };
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = !!m;
    if (master) set(master.gain, muted ? 0 : BASE * volume, 0.05);
  },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master && !muted) set(master.gain, BASE * volume, 0.05);
  },
  /** Fade the ambient loops out (menus, death). */
  silence() {
    if (!ctx || !loops) return;
    for (const k in loops) set(loops[k].g.gain, 0, 0.3);
  },
  dispose() {
    if (!ctx) return;
    try {
      for (const k in loops || {}) loops[k].src.stop();
      ctx.close();
    } catch {
      /* ignore */
    }
    ctx = null;
    master = null;
    loops = null;
  },
  /** Ambience every frame. s: {dt, wind, rain, storm, water (m to water), day, alt, flying, speed, inCave, sleeping, active} */
  step(s) {
    if (!ctx || !loops || muted) return;
    const L = loops;
    const act = s.active ? 1 : 0;
    const windV = (0.015 + s.wind * 0.06 + (s.flying ? Math.min(0.12, s.speed * 0.004) : 0) + Math.min(0.05, s.alt * 0.0004)) * act * (s.inCave ? 0.3 : 1);
    set(L.wind.g.gain, windV, 0.4);
    set(L.wind.f.frequency, 300 + s.wind * 500 + (s.flying ? s.speed * 25 : 0), 0.4);
    set(L.water.g.gain, act * 0.09 * dv(s.water, 10), 0.4);
    set(L.rain.g.gain, act * s.rain * (s.inCave ? 0.05 : 0.12), 0.6);
    set(L.rumble.g.gain, act * s.storm * 0.05, 0.6);
    if (!act) return;
    // birdsong by day, crickets by night
    birdT -= s.dt;
    if (birdT <= 0) {
      birdT = 1.2 + Math.random() * 3.5;
      if (s.day > 0.4 && s.rain < 0.4 && !s.inCave) this.songbird(0.25 + Math.random() * 0.4);
    }
    cricketT -= s.dt;
    if (cricketT <= 0) {
      cricketT = 0.4 + Math.random() * 0.8;
      if (s.day < 0.25 && s.rain < 0.5) {
        const f = 4200 + Math.random() * 500;
        for (let i = 0; i < 3; i++) osc(f, 0.04, { type: "sine", vol: 0.012, at: i * 0.07 });
      }
    }
  },
  /* ---------------------------------------------------------------- one-shots */
  ui() {
    osc(660, 0.08, { type: "triangle", vol: 0.08 });
  },
  songbird(v = 0.5) {
    const f = 2400 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) osc(f * (0.9 + Math.random() * 0.25), 0.07, { type: "sine", vol: 0.035 * v, to: f * (1.2 + Math.random() * 0.3), at: i * 0.09 });
  },
  footstep(size = 1, surface = "grass", v = 1) {
    if (surface === "water") return hiss(0.12, { freq: 900, vol: 0.05 * v * size, type: "lowpass" });
    const f = surface === "rock" ? 1800 : surface === "sand" ? 1300 : 700;
    hiss(0.06 + size * 0.04, { freq: f / Math.sqrt(size), q: 1.2, vol: 0.05 * v * Math.min(1.6, size), attack: 0.003 });
    if (size > 1.4) osc(70, 0.12, { type: "sine", vol: 0.05 * v * (size - 1), to: 45 });
  },
  flap(v = 1) {
    hiss(0.18, { freq: 420, to: 260, q: 0.8, vol: 0.08 * v, attack: 0.03 });
  },
  howl(v = 1) {
    osc(330, 2.6, { type: "sine", vol: 0.16 * v, to: [[520, 0.5], [560, 1.4], [380, 0.7]], attack: 0.25, vib: 6, vibF: 5, filter: { f: 1600 } });
    osc(660, 2.4, { type: "triangle", vol: 0.03 * v, to: [[1040, 0.5], [1100, 1.3], [760, 0.6]], attack: 0.3, vib: 10, vibF: 5 });
  },
  roar(v = 1) {
    hiss(1.6, { freq: 380, to: 160, q: 1.6, vol: 0.32 * v, attack: 0.08 });
    osc(110, 1.5, { type: "sawtooth", vol: 0.14 * v, to: [[150, 0.3], [90, 1.2]], attack: 0.08, filter: { f: 600 }, vib: 8, vibF: 22 });
    osc(55, 1.5, { type: "sine", vol: 0.18 * v, to: 40, attack: 0.1 });
  },
  growl(v = 1) {
    osc(90, 0.9, { type: "sawtooth", vol: 0.1 * v, to: 70, attack: 0.05, filter: { f: 500 }, vib: 12, vibF: 26 });
    hiss(0.8, { freq: 300, q: 2, vol: 0.08 * v });
  },
  chuff(v = 1) {
    for (let i = 0; i < 2; i++) hiss(0.12, { freq: 600, q: 1.5, vol: 0.12 * v, at: i * 0.18 });
  },
  bear(v = 1) {
    osc(80, 1.1, { type: "sawtooth", vol: 0.16 * v, to: [[120, 0.25], [60, 0.8]], attack: 0.06, filter: { f: 420 }, vib: 9, vibF: 18 });
    hiss(1.0, { freq: 250, q: 1.8, vol: 0.12 * v });
  },
  eagleCall(v = 1) {
    for (let i = 0; i < 3; i++) osc(2300 - i * 120, 0.16, { type: "square", vol: 0.04 * v, to: 1700, at: i * 0.17, filter: { f: 3200, type: "lowpass" }, vib: 60, vibF: 40 });
    osc(2600, 0.5, { type: "sawtooth", vol: 0.03 * v, to: 1500, at: 0.55, filter: { f: 3500 } });
  },
  yip(v = 1) {
    for (let i = 0; i < 3; i++) osc(900 + i * 60, 0.09, { type: "triangle", vol: 0.08 * v, to: 1400, at: i * 0.13 });
  },
  call(species, v = 1) {
    if (species === "wolf") this.howl(v);
    else if (species === "lion") this.roar(v);
    else if (species === "tiger") this.growl(v);
    else if (species === "bear") this.bear(v);
    else if (species === "eagle") this.eagleCall(v);
    else if (species === "fox") this.yip(v);
  },
  bite(v = 1) {
    hiss(0.07, { freq: 2200, q: 2, vol: 0.13 * v });
    osc(160, 0.08, { type: "square", vol: 0.06 * v, to: 90, filter: { f: 900 } });
  },
  swipe(v = 1) {
    hiss(0.2, { freq: 1600, to: 600, q: 1, vol: 0.12 * v, attack: 0.02 });
  },
  hit(big = false, v = 1) {
    osc(big ? 90 : 140, 0.14, { type: "sine", vol: (big ? 0.28 : 0.18) * v, to: big ? 45 : 70 });
    hiss(0.1, { freq: 700, q: 1, vol: 0.12 * v });
  },
  hurt(v = 1) {
    osc(420, 0.22, { type: "sawtooth", vol: 0.08 * v, to: 220, filter: { f: 1400 } });
  },
  whine(v = 1) {
    osc(900, 0.4, { type: "sine", vol: 0.06 * v, to: 600, vib: 20, vibF: 9 });
  },
  kick() {
    osc(110, 0.12, { type: "sine", vol: 0.25, to: 50 });
    hiss(0.08, { freq: 500, vol: 0.12 });
  },
  chew(v = 1) {
    hiss(0.07, { freq: 1500 + Math.random() * 500, q: 3, vol: 0.06 * v });
  },
  lap(v = 1) {
    hiss(0.08, { freq: 1100, to: 700, q: 4, vol: 0.06 * v });
  },
  splash(v = 1) {
    hiss(0.5, { freq: 1200, to: 400, q: 0.6, vol: 0.18 * v, type: "lowpass" });
  },
  thunder(dist = 200) {
    const v = Math.max(0.2, Math.min(1, 220 / dist));
    hiss(2.8, { freq: 160, to: 60, q: 0.7, vol: 0.4 * v, type: "lowpass", at: dist / 900, attack: 0.05 });
    osc(45, 2.2, { type: "sine", vol: 0.2 * v, to: 30, at: dist / 900 });
  },
  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) => osc(f, 0.35, { type: "triangle", vol: 0.12, at: i * 0.1 }));
  },
  mission() {
    [587, 740, 880].forEach((f, i) => osc(f, 0.3, { type: "triangle", vol: 0.1, at: i * 0.09 }));
  },
  claim() {
    [392, 523, 659, 784].forEach((f, i) => osc(f, 0.5, { type: "sine", vol: 0.12, at: i * 0.15 }));
  },
  heart() {
    osc(880, 0.2, { type: "sine", vol: 0.08, to: 1320 });
  },
  denied() {
    osc(200, 0.15, { type: "square", vol: 0.05, filter: { f: 800 } });
  },
  death() {
    osc(300, 1.6, { type: "sine", vol: 0.12, to: 90, attack: 0.05 });
  },
  dive() {
    osc(1500, 1.0, { type: "sine", vol: 0.05, to: 600 });
    hiss(1.0, { freq: 2000, to: 900, vol: 0.08 });
  },
};
