/**
 * Zoo Simulator 3D — tiny Web Audio synth (no sample files).
 * `setMuted` follows the GamePlayer Mute button; the context is created on
 * the first user gesture (`unlock`). Animal calls are distance-attenuated by
 * the caller passing `vol`. A soft park ambience (breeze + birdsong) loops.
 */
let ctx = null;
let master = null;
let noise = null;
let amb = null;
let muted = false;
let birdT = null;
const VOLUME = 0.55;

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(freq, dur, { type = "sine", vol = 0.25, to = null, at = 0, vib = 0, vibF = 6, attack = 0.01, filter = null } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
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

function hiss(dur, { freq = 900, to = null, q = 1, vol = 0.25, type = "bandpass", at = 0, attack = 0.01 } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

const CALLS = {
  rabbit(v) {
    tone(1900, 0.07, { vol: 0.08 * v, to: 2600 });
    tone(2100, 0.06, { vol: 0.06 * v, to: 2700, at: 0.1 });
  },
  deer(v) {
    tone(620, 0.42, { type: "sawtooth", vol: 0.1 * v, to: 430, vib: 25, vibF: 18, filter: { f: 1400, q: 2 } });
  },
  zebra(v) {
    for (let i = 0; i < 3; i++) tone(820 - i * 90, 0.13, { type: "square", vol: 0.06 * v, to: 520 - i * 60, at: i * 0.16, filter: { f: 1800 } });
  },
  giraffe(v) {
    tone(95, 0.7, { type: "sine", vol: 0.16 * v, to: 80, vib: 4, vibF: 7 });
  },
  lion(v) {
    hiss(1.5, { freq: 260, to: 120, q: 0.8, vol: 0.35 * v, type: "lowpass", attack: 0.12 });
    tone(120, 1.4, { type: "sawtooth", vol: 0.13 * v, to: 62, vib: 9, vibF: 11, attack: 0.15, filter: { f: 500 } });
  },
  elephant(v) {
    tone(440, 0.95, { type: "sawtooth", vol: 0.12 * v, to: 560, vib: 30, vibF: 9, attack: 0.08, filter: { type: "bandpass", f: 900, q: 1.5 } });
    tone(880, 0.8, { type: "square", vol: 0.03 * v, to: 1040, vib: 50, vibF: 9, attack: 0.1, filter: { f: 2000 } });
  },
};

export const audio = {
  unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.03);
  },
  get muted() {
    return muted;
  },
  /** Breeze + random birdsong; level 0..1 (0 stops). */
  ambience(level) {
    if (!ctx) return;
    if (!amb && level > 0) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      amb = { src, g };
    }
    if (amb) amb.g.gain.setTargetAtTime(0.05 * level, ctx.currentTime, 0.5);
    clearInterval(birdT);
    birdT = null;
    if (level > 0) {
      birdT = setInterval(() => {
        if (muted || Math.random() < 0.45) return;
        const base = 2400 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) tone(base * (1 + Math.random() * 0.15), 0.07, { vol: 0.025 * level, to: base * 1.3, at: i * 0.11 });
      }, 2300);
    }
  },
  step(surface, sprint) {
    hiss(0.09, { freq: surface === "path" ? 1300 : 650, q: 0.9, vol: sprint ? 0.07 : 0.05, type: surface === "path" ? "bandpass" : "lowpass" });
  },
  animal(species, vol = 1) {
    CALLS[species]?.(Math.min(1, vol));
  },
  feed() {
    hiss(0.35, { freq: 2600, to: 1500, q: 0.7, vol: 0.12 });
    for (let i = 0; i < 5; i++) tone(900 + Math.random() * 700, 0.03, { type: "triangle", vol: 0.04, at: 0.05 + i * 0.05 });
  },
  water() {
    hiss(0.7, { freq: 1600, to: 600, q: 2.5, vol: 0.14, attack: 0.05 });
    tone(420, 0.25, { vol: 0.04, to: 820, at: 0.1 });
  },
  tap() {
    hiss(0.5, { freq: 2000, to: 900, q: 3, vol: 0.1, attack: 0.04 });
  },
  clean() {
    for (let i = 0; i < 3; i++) hiss(0.12, { freq: 3200, to: 1800, q: 0.6, vol: 0.09, at: i * 0.12 });
    tone(1568, 0.18, { vol: 0.04, at: 0.38 });
    tone(2093, 0.22, { vol: 0.04, at: 0.45 });
  },
  collect() {
    tone(520, 0.09, { type: "triangle", vol: 0.12 });
    tone(780, 0.12, { type: "triangle", vol: 0.1, at: 0.07 });
  },
  cash(vol = 1) {
    tone(1318, 0.08, { type: "triangle", vol: 0.07 * vol });
    tone(1760, 0.14, { type: "triangle", vol: 0.06 * vol, at: 0.06 });
  },
  purchase() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: "triangle", vol: 0.12, at: i * 0.06 }));
    hiss(0.25, { freq: 5000, q: 0.5, vol: 0.04, at: 0.02 });
  },
  mission() {
    [659, 784, 988, 1318, 1568].forEach((f, i) => tone(f, 0.3, { type: "square", vol: 0.05, at: i * 0.09, filter: { f: 3000 } }));
    [523, 659, 784].forEach((f) => tone(f, 0.7, { type: "triangle", vol: 0.07, at: 0.45 }));
  },
  error() {
    tone(180, 0.18, { type: "square", vol: 0.06, filter: { f: 900 } });
    tone(150, 0.2, { type: "square", vol: 0.06, at: 0.12, filter: { f: 900 } });
  },
  ui() {
    tone(880, 0.05, { type: "triangle", vol: 0.06 });
  },
  dispose() {
    clearInterval(birdT);
    birdT = null;
    try {
      amb?.src.stop();
    } catch {
      /* already stopped */
    }
    amb = null;
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    master = null;
  },
};
