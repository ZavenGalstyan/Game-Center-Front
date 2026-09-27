/**
 * Dentist Studio — WebAudio synth (no files, no libraries).
 *
 * Tool sounds are soft filtered-noise / oscillator LOOPS whose gain the
 * gameplay loop drives every frame (`loop(name, level)`); anything not
 * refreshed for ~120ms fades out by itself, and `stopAll()` cuts every
 * loop at once. Gameplay calls stopAll on pointerup / cancel / leave,
 * window blur, tool change, pause, mute, restart, completion and unmount,
 * so a brush or polisher can never keep humming in the background.
 *
 * Everything is kept quiet and rounded — nothing like a real drill.
 * `setEnabled(sound && !muted)` gates it all, so the Game Center Mute
 * silences instantly without touching saved settings.
 */

let ctx = null;
let master = null;
let sfxOn = true;
let musicOn = false;
let noiseBuf = null;
const loops = new Map();
let music = null;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function noise() {
  const a = ac();
  if (!a) return null;
  if (!noiseBuf) {
    const n = a.sampleRate * 2;
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b = 0.97 * b + 0.03 * w; // a little pink-ish body
      d[i] = w * 0.6 + b * 2.2;
    }
  }
  const s = a.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

const RECIPES = {
  brush: { noise: [["bandpass", 3600, 1.3]], gain: 0.085, lfo: 11 },
  scaler: { noise: [["highpass", 3200, 0.7], ["peaking", 5200, 2, 4]], gain: 0.026, lfo: 17 },
  water: { noise: [["bandpass", 2100, 0.6], ["lowpass", 6000, 0.7]], gain: 0.085 },
  suction: { noise: [["bandpass", 850, 0.9]], gain: 0.07, osc: { type: "sine", f: 150, lp: 420, gain: 0.02 } },
  polisher: { noise: [["bandpass", 620, 1]], gain: 0.016, osc: { type: "triangle", f: 176, lp: 560, gain: 0.032 }, lfo: 24 },
  floss: { noise: [["bandpass", 2500, 3]], gain: 0.05, lfo: 8 },
  cavity: { noise: [["highpass", 4200, 0.7]], gain: 0.012, osc: { type: "sine", f: 520, lp: 900, gain: 0.018 }, lfo: 6 },
  fill: { noise: [["bandpass", 520, 1.1]], gain: 0.05, lfo: 5 },
  smooth: { noise: [["bandpass", 1500, 2]], gain: 0.04, lfo: 7 },
};

function makeLoop(name) {
  const a = ac();
  const r = RECIPES[name];
  if (!a || !r) return null;
  const out = a.createGain();
  out.gain.value = 0;
  out.connect(master);
  const nodes = [];
  let chainIn = out;
  if (r.lfo) {
    const trem = a.createGain();
    trem.gain.value = 0.7;
    const lfo = a.createOscillator();
    lfo.frequency.value = r.lfo;
    const depth = a.createGain();
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(trem.gain);
    trem.connect(out);
    lfo.start();
    nodes.push(lfo);
    chainIn = trem;
  }
  const src = noise();
  let node = src;
  for (const [type, f, q, g] of r.noise) {
    const fl = a.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    if (g != null) fl.gain.value = g;
    node.connect(fl);
    node = fl;
  }
  const ng = a.createGain();
  ng.gain.value = r.gain;
  node.connect(ng).connect(chainIn);
  src.start();
  nodes.push(src);
  if (r.osc) {
    const o = a.createOscillator();
    o.type = r.osc.type;
    o.frequency.value = r.osc.f;
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = r.osc.lp;
    const og = a.createGain();
    og.gain.value = r.osc.gain;
    o.connect(lp).connect(og).connect(chainIn);
    o.start();
    nodes.push(o);
  }
  return { out, nodes, last: 0, level: 0 };
}

function killLoop(name) {
  const l = loops.get(name);
  if (!l) return;
  loops.delete(name);
  try {
    const t = ctx.currentTime;
    l.out.gain.cancelScheduledValues(t);
    l.out.gain.setTargetAtTime(0, t, 0.02);
    for (const n of l.nodes) n.stop(t + 0.12);
    setTimeout(() => {
      try {
        l.out.disconnect();
      } catch {
        /* already gone */
      }
    }, 250);
  } catch {
    /* context closed */
  }
}

function tone(freq, dur, { type = "sine", gain = 0.08, slide = null, delay = 0, attack = 0.008 } = {}) {
  if (!sfxOn) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function burst(dur, { gain = 0.05, freq = 1800, q = 0.8, delay = 0, type = "bandpass" } = {}) {
  if (!sfxOn) return;
  const a = ac();
  if (!a) return;
  const src = noise();
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  const t0 = a.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

export const audio = {
  setEnabled(v) {
    sfxOn = Boolean(v);
    if (!sfxOn) this.stopAll();
    this._syncMusic();
  },
  setMusic(v) {
    musicOn = Boolean(v);
    this._syncMusic();
  },
  isEnabled() {
    return sfxOn;
  },
  activeLoops() {
    return loops.size;
  },
  /** unlock on first user gesture */
  unlock() {
    ac();
  },
  /** keep a tool loop alive at `level` (0..1); call every frame while active */
  loop(name, level = 1) {
    if (!sfxOn || !RECIPES[name]) return;
    let l = loops.get(name);
    if (!l) {
      l = makeLoop(name);
      if (!l) return;
      loops.set(name, l);
    }
    const t = ctx.currentTime;
    const target = Math.max(0, Math.min(1, level));
    if (Math.abs(target - l.level) > 0.02) {
      l.out.gain.setTargetAtTime(target, t, 0.035);
      l.level = target;
    }
    l.last = performance.now();
  },
  /** fade out loops that were not refreshed recently */
  reap() {
    const now = performance.now();
    for (const [k, l] of loops) if (now - l.last > 120) killLoop(k);
  },
  stopAll() {
    for (const k of [...loops.keys()]) killLoop(k);
  },
  ui() {
    tone(660, 0.07, { type: "triangle", gain: 0.045, slide: 880 });
  },
  select() {
    tone(560, 0.06, { type: "triangle", gain: 0.045 });
    tone(840, 0.08, { type: "sine", gain: 0.03, delay: 0.04 });
  },
  soft() {
    tone(330, 0.14, { type: "sine", gain: 0.04, slide: 260 });
  },
  grab() {
    tone(900, 0.05, { type: "sine", gain: 0.035, slide: 1300 });
  },
  pop() {
    tone(420, 0.09, { type: "triangle", gain: 0.06, slide: 780 });
    burst(0.05, { gain: 0.025, freq: 3000, q: 1.5 });
  },
  plop() {
    tone(260, 0.12, { type: "sine", gain: 0.05, slide: 180, delay: 0.02 });
  },
  tick() {
    burst(0.025, { gain: 0.018, freq: 4200, q: 3 });
  },
  chip() {
    burst(0.06, { gain: 0.035, freq: 2600, q: 2 });
    tone(1250, 0.07, { type: "triangle", gain: 0.03, slide: 900 });
  },
  slurp() {
    burst(0.18, { gain: 0.04, freq: 700, q: 1.2 });
    tone(500, 0.15, { type: "sine", gain: 0.025, slide: 900 });
  },
  snap() {
    tone(1400, 0.05, { type: "sine", gain: 0.03 });
  },
  reveal() {
    tone(1320, 0.12, { gain: 0.03 });
    tone(1760, 0.16, { gain: 0.022, delay: 0.05 });
  },
  sparkle() {
    tone(1760, 0.22, { gain: 0.028 });
    tone(2637, 0.28, { gain: 0.02, delay: 0.06 });
  },
  stage() {
    tone(784, 0.14, { type: "triangle", gain: 0.055 });
    tone(1175, 0.22, { type: "triangle", gain: 0.045, delay: 0.09 });
  },
  complete() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => tone(f, 0.45, { type: "triangle", gain: 0.055, delay: i * 0.09 }));
    tone(2093, 0.8, { gain: 0.022, delay: 0.5 });
  },
  star(i) {
    tone(880 * (1 + i * 0.25), 0.3, { type: "triangle", gain: 0.055 });
  },
  _syncMusic() {
    const want = sfxOn && musicOn;
    if (want && !music) music = startMusic();
    if (!want && music) {
      music.stop();
      music = null;
    }
  },
  dispose() {
    this.stopAll();
    if (music) {
      music.stop();
      music = null;
    }
  },
};

/** A slow, calm studio pad: four chords, soft lowpass, long fades. */
function startMusic() {
  const a = ac();
  if (!a) return null;
  const out = a.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(0.028, a.currentTime, 1.5);
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1100;
  lp.connect(out).connect(master);
  const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
  const oscs = [0, 1, 2].map(() => {
    const o = a.createOscillator();
    o.type = "sine";
    const g = a.createGain();
    g.gain.value = 0.33;
    o.connect(g).connect(lp);
    o.start();
    return o;
  });
  let k = 0;
  const step = () => {
    const c = chords[k++ % chords.length];
    oscs.forEach((o, i) => o.frequency.setTargetAtTime(c[i], a.currentTime, 0.8));
  };
  step();
  const id = setInterval(step, 7000);
  return {
    stop() {
      clearInterval(id);
      const t = a.currentTime;
      out.gain.setTargetAtTime(0, t, 0.2);
      oscs.forEach((o) => o.stop(t + 1));
    },
  };
}
