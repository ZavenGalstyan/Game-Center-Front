/**
 * Car Wash Studio — WebAudio synth (no files, no libraries).
 *
 * Tool sounds are filtered-noise / oscillator LOOPS whose gain is driven
 * every frame by the gameplay loop (`loop(name, level)`); anything not
 * refreshed for ~120ms fades out on its own, and `stopAll()` cuts every loop
 * at once. Gameplay calls stopAll on pointerup / cancel / leave, window blur,
 * tool or view switch, pause, mute, restart, completion and unmount — a tool
 * can never keep hissing in the background.
 *
 * `setEnabled(sound && !muted)` gates everything, so the Game Center Mute
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
  hose: { noise: [["bandpass", 1500, 0.7], ["lowpass", 5200, 0.7]], gain: 0.13 },
  pressure: { noise: [["highpass", 800, 0.7], ["peaking", 2600, 1.2, 6]], gain: 0.15, osc: { type: "sawtooth", f: 72, lp: 220, gain: 0.05 } },
  foam: { noise: [["bandpass", 900, 0.5]], gain: 0.12, lfo: 9 },
  spray: { noise: [["highpass", 2800, 0.7]], gain: 0.07 },
  vacuum: { noise: [["bandpass", 700, 0.8]], gain: 0.06, osc: { type: "sawtooth", f: 118, lp: 900, gain: 0.05 } },
  polisher: { noise: [["bandpass", 400, 1]], gain: 0.03, osc: { type: "square", f: 92, lp: 480, gain: 0.05 }, lfo: 5 },
  sponge: { noise: [["bandpass", 650, 1.1]], gain: 0.14 },
  cloth: { noise: [["bandpass", 2300, 1.4]], gain: 0.1 },
  towel: { noise: [["bandpass", 1100, 0.9]], gain: 0.12 },
  brush: { noise: [["bandpass", 4200, 1.6]], gain: 0.1, lfo: 22 },
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
    tone(660, 0.07, { type: "triangle", gain: 0.05, slide: 880 });
  },
  select() {
    tone(520, 0.06, { type: "triangle", gain: 0.05 });
    tone(780, 0.08, { type: "sine", gain: 0.035, delay: 0.04 });
  },
  whoosh() {
    burst(0.32, { gain: 0.05, freq: 900, q: 0.4 });
  },
  soft() {
    tone(300, 0.14, { type: "sine", gain: 0.045, slide: 240 });
  },
  pickup() {
    tone(420, 0.08, { type: "triangle", gain: 0.06, slide: 700 });
    burst(0.08, { gain: 0.03, freq: 2600, q: 1.5 });
  },
  squeak() {
    tone(1900 + Math.random() * 500, 0.05, { type: "sine", gain: 0.02, slide: 2600 });
  },
  sparkle() {
    tone(1760, 0.25, { gain: 0.03 });
    tone(2637, 0.3, { gain: 0.022, delay: 0.06 });
  },
  stage() {
    tone(784, 0.14, { type: "triangle", gain: 0.06 });
    tone(1175, 0.22, { type: "triangle", gain: 0.05, delay: 0.09 });
  },
  complete() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => tone(f, 0.45, { type: "triangle", gain: 0.06, delay: i * 0.09 }));
    tone(2093, 0.8, { gain: 0.025, delay: 0.5 });
  },
  star(i) {
    tone(880 * (1 + i * 0.25), 0.3, { type: "triangle", gain: 0.06 });
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

/** A slow, quiet garage pad: four chords, soft lowpass, long fades. */
function startMusic() {
  const a = ac();
  if (!a) return null;
  const out = a.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(0.03, a.currentTime, 1.5);
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1100;
  lp.connect(out).connect(master);
  const chords = [[261.6, 329.6, 392], [220, 277.2, 329.6], [246.9, 311.1, 370], [196, 246.9, 293.7]];
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
