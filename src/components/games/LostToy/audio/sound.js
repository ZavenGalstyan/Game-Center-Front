/**
 * Lost Toy — WebAudio synth (no audio files, no libraries).
 *
 * Buses: sfx / ambience / music → master → compressor → out.
 *   - Settings volumes: master, music, sfx (0..1)
 *   - Game Center Mute: master gain → 0 immediately. EVERY sound — music,
 *     footsteps, pets, vacuum, UI, anything created later — routes through
 *     master, so nothing can slip past the mute.
 *   - stopLoops(): silences continuous sounds (vacuum, fan, water, motor) on
 *     pause / results / menu / hidden tab; dispose() also stops the music
 *     scheduler so nothing stacks across restarts or fullscreen toggles.
 *
 * Scale is in the sound: the toy's footsteps are tiny, light and high;
 * giant things (pets, drawers, the vacuum, a block landing) are deep and slow.
 *
 * Music: a small generative "music box" score — chord progression + seeded
 * melody per bar, an instrument set per world (bedroom acoustic pluck,
 * kitchen marimba, garage woodblock + low synth, garden airy flute, night
 * celesta + pad, menu lullaby waltz, homecoming variation).
 */
let ctx = null;
let master = null;
let sfx = null;
let amb = null;
let mus = null;
let noiseBuf = null;
let muted = false;
let vol = { master: 0.85, music: 0.55, sfx: 0.9 };
const loops = {};
const lastPlay = {};
let musicTimer = null;
let musicCfg = null;
let step = 0;
let nextT = 0;
let unlocked = false;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    sfx = ctx.createGain();
    amb = ctx.createGain();
    mus = ctx.createGain();
    sfx.connect(master);
    amb.connect(master);
    mus.connect(master);
    applyVolumes();
  }
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(muted ? 0 : vol.master, t);
  sfx.gain.setValueAtTime(vol.sfx, t);
  amb.gain.setValueAtTime(vol.sfx * 0.75, t);
  mus.gain.setValueAtTime(vol.music * 0.38, t);
}

function noise() {
  if (!noiseBuf) {
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b = 0.96 * b + 0.04 * w;
      d[i] = w * 0.65 + b * 2.4;
    }
  }
  return noiseBuf;
}

const ok = () => ctx && ctx.state === "running" && !muted;
function throttle(name, ms) {
  const now = performance.now();
  if (lastPlay[name] && now - lastPlay[name] < ms) return false;
  lastPlay[name] = now;
  return true;
}

/** noise burst through a filter with an envelope */
function burst({ dur = 0.1, freq = 1200, q = 1, type = "bandpass", gain = 0.3, attack = 0.004, sweep = null, bus = sfx, when = 0, rate = 1 }) {
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  src.playbackRate.value = rate * (0.85 + Math.random() * 0.3);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}
/** tonal blip */
function tone({ f = 440, f2 = null, dur = 0.15, type = "sine", gain = 0.2, attack = 0.005, bus = sfx, when = 0, vib = 0 }) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  let lfo = null;
  if (vib) {
    lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = vib;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/* ------------------------------------------------------------------ continuous loops */
function makeLoop(name, kind) {
  if (loops[name]) return loops[name];
  const g = ctx.createGain();
  g.gain.value = 0;
  let src;
  let f = null;
  let o = null;
  if (kind === "noise" || kind === "motor") {
    src = ctx.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = kind === "motor" ? 700 : 500;
    f.Q.value = kind === "motor" ? 1.2 : 0.6;
    src.connect(f).connect(g);
    src.start();
  }
  if (kind === "motor") {
    o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 95;
    const of = ctx.createBiquadFilter();
    of.type = "lowpass";
    of.frequency.value = 400;
    const og = ctx.createGain();
    og.gain.value = 0.35;
    o.connect(of).connect(og).connect(g);
    o.start();
  }
  g.connect(amb);
  const l = { g, f, src, o };
  loops[name] = l;
  return l;
}
function loopLevel(name, kind, v, freq) {
  const c = ac();
  if (!c) return;
  const l = makeLoop(name, kind);
  const t = c.currentTime;
  l.g.gain.setTargetAtTime(muted ? 0 : Math.max(0, v), t, 0.12);
  if (freq && l.f) l.f.frequency.setTargetAtTime(freq, t, 0.2);
  if (l.o && freq) l.o.frequency.setTargetAtTime(freq / 7, t, 0.2);
}

/* ------------------------------------------------------------------ music */
const NOTE = (n) => 220 * Math.pow(2, n / 12); // n semitones from A3
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MOODS = {
  menu: { prog: [0, 5, 3, 4], beats: 3, lead: "box", bass: true, perc: null, oct: 12, density: 0.55 },
  bedroom: { prog: [0, 3, 5, 4], beats: 4, lead: "pluck", bass: true, perc: "brush", oct: 12, density: 0.6 },
  kitchen: { prog: [0, 4, 5, 3], beats: 4, lead: "marimba", bass: true, perc: "shaker", oct: 12, density: 0.7 },
  garage: { prog: [0, 6, 3, 4], beats: 4, lead: "pluck", bass: true, perc: "block", oct: 7, density: 0.5 },
  garden: { prog: [0, 3, 0, 4], beats: 4, lead: "flute", bass: true, perc: null, oct: 12, density: 0.45 },
  night: { prog: [0, 5, 3, 4], beats: 3, lead: "box", bass: true, perc: null, oct: 19, density: 0.42, pad: true },
  home: { prog: [0, 3, 4, 0], beats: 4, lead: "box", bass: true, perc: "brush", oct: 12, density: 0.6, pad: true },
};
function seeded(n) {
  let s = (n * 2654435761) >>> 0;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return ((s >>> 0) % 1000) / 1000;
}
function instrument(kind, freq, when, dur, gain) {
  const t = when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  if (kind === "marimba") {
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 0.45));
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 4;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(gain * 0.25, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o2.connect(g2).connect(mus);
    o2.start(t);
    o2.stop(t + 0.1);
  } else if (kind === "flute") {
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * 0.8, t + 0.08);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.8, 0.12);
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 5;
    lg.gain.value = freq * 0.006;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.6);
  } else if (kind === "pad") {
    o.type = "triangle";
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  } else if (kind === "box") {
    // music box: bright sine + a quick high partial, long-ish ring
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(1.4, dur * 2));
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 3;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(gain * 0.18, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o2.connect(g2).connect(mus);
    o2.start(t);
    o2.stop(t + 0.3);
  } else if (kind === "bass") {
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  } else {
    // pluck (soft triangle with a fast decay)
    o.type = "triangle";
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.9, dur * 1.5));
  }
  o.frequency.setValueAtTime(freq, t);
  o.connect(g).connect(mus);
  o.start(t);
  o.stop(t + dur * 2 + 0.6);
}
function perc(kind, when, v = 1) {
  const t = when - ctx.currentTime;
  if (kind === "brush") burst({ dur: 0.09, freq: 6000, q: 0.6, type: "highpass", gain: 0.035 * v, bus: mus, when: t });
  else if (kind === "shaker") burst({ dur: 0.05, freq: 7000, q: 0.8, type: "highpass", gain: 0.04 * v, bus: mus, when: t });
  else if (kind === "block") {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(v > 0.9 ? 900 : 1300, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.09 * v, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    o.connect(g).connect(mus);
    o.start(when);
    o.stop(when + 0.1);
  }
}
function scheduleMusic() {
  if (!ctx || !musicCfg) return;
  const M = MOODS[musicCfg.mood] || MOODS.bedroom;
  const spb = 60 / musicCfg.bpm / 2; // eighth notes
  while (nextT < ctx.currentTime + 0.25) {
    playStep(M, nextT, spb);
    nextT += spb;
    step++;
  }
}
function playStep(M, t, spb) {
  const steps = M.beats * 2;
  const bar = Math.floor(step / steps);
  const s = step % steps;
  const key = musicCfg.key || 0;
  const degree = M.prog[bar % M.prog.length];
  const chord = [0, 2, 4].map((k) => MAJOR[(degree + k) % 7] + 12 * Math.floor((degree + k) / 7));
  if (M.bass && s === 0) instrument("bass", NOTE(key - 12 + chord[0]), t, spb * steps * 0.9, 0.11);
  if (M.bass && M.beats === 3 && (s === 2 || s === 4)) instrument("pluck", NOTE(key + chord[1 + (s >> 2)]), t, spb * 1.5, 0.035);
  if (M.pad && s === 0) for (const n of chord) instrument("pad", NOTE(key + n), t, spb * steps, 0.022);
  // melody: seeded per bar so it's coherent yet varied
  const r = seeded(bar * 31 + s * 7 + (musicCfg.mood.length << 4));
  if (r < M.density && (s % 2 === 0 || r < M.density * 0.4)) {
    const pick = Math.floor(seeded(bar * 13 + s) * 5);
    const scaleDeg = (degree + [0, 2, 4, 5, 7][pick]) % 7;
    const oct = Math.floor((degree + [0, 2, 4, 5, 7][pick]) / 7) * 12;
    instrument(M.lead, NOTE(key + M.oct + MAJOR[scaleDeg] + oct), t, spb * (s % 4 === 0 ? 2 : 1), M.lead === "flute" ? 0.05 : 0.06);
  }
  if (M.perc) {
    if (M.perc === "block") {
      if (s % 2 === 0) perc("block", t, s % 4 === 0 ? 1 : 0.6);
    } else if (s % 2 === 1 || M.perc === "shaker") perc(M.perc, t, s % 4 === 1 ? 1 : 0.6);
  }
}

/* ------------------------------------------------------------------ footsteps per surface */
const STEP = {
  wood: { f: 2600, q: 2.4, g: 0.05, type: "bandpass" },
  paper: { f: 4200, q: 1.0, g: 0.045, type: "highpass" },
  fabric: { f: 900, q: 0.8, g: 0.04, type: "lowpass" },
  plastic: { f: 3200, q: 3, g: 0.05, type: "bandpass", tone: 2400 },
  metal: { f: 4200, q: 6, g: 0.045, type: "bandpass", tone: 3100 },
  ceramic: { f: 3800, q: 5, g: 0.04, type: "bandpass", tone: 3400 },
  cardboard: { f: 1400, q: 1.5, g: 0.05, type: "bandpass" },
  rubber: { f: 800, q: 1, g: 0.05, type: "lowpass" },
  grass: { f: 5200, q: 0.7, g: 0.04, type: "highpass" },
  stone: { f: 2000, q: 2, g: 0.05, type: "bandpass" },
  tile: { f: 3000, q: 3, g: 0.05, type: "bandpass", tone: 2600 },
  wall: { f: 2000, q: 1, g: 0.03, type: "bandpass" },
  water: { f: 1600, q: 0.8, g: 0.06, type: "bandpass" },
};

export const sound = {
  unlock() {
    const c = ac();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    unlocked = true;
  },
  get unlocked() {
    return unlocked;
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    applyVolumes();
  },
  setMuted(m) {
    muted = !!m;
    applyVolumes();
    if (muted) this.stopLoops();
  },

  /* --- toy movement (tiny, light, high) */
  step(mat, sprint, inWater) {
    if (!ok() || !throttle("step", 55)) return;
    const s = STEP[inWater ? "water" : mat] || STEP.wood;
    burst({ dur: 0.04, freq: s.f * (0.9 + Math.random() * 0.2), q: s.q, type: s.type, gain: s.g * (sprint ? 1.25 : 1), rate: 1.6 });
    if (s.tone) tone({ f: s.tone * (0.95 + Math.random() * 0.1), dur: 0.04, gain: 0.012, type: "sine" });
  },
  jump(soft) {
    if (!ok()) return;
    burst({ dur: 0.08, freq: 2400, sweep: 3600, q: 1, gain: 0.05, rate: 1.4 });
    tone({ f: soft ? 420 : 520, f2: soft ? 680 : 820, dur: 0.1, gain: 0.025, type: "triangle" });
  },
  land(hard, mat) {
    if (!ok()) return;
    const s = STEP[mat] || STEP.wood;
    burst({ dur: hard ? 0.16 : 0.07, freq: s.f * 0.6, q: s.q * 0.6, type: s.type, gain: s.g * (hard ? 2.6 : 1.4) });
    if (hard) {
      burst({ dur: 0.18, freq: 300, q: 0.7, type: "lowpass", gain: 0.12 });
      tone({ f: 640, f2: 420, dur: 0.12, gain: 0.03, type: "square" }); // a little squeak: toys squeak
    }
  },
  bounce(strength = 1) {
    if (!ok()) return;
    tone({ f: 170, f2: 380 + strength * 18, dur: 0.28, gain: 0.08, type: "sine" });
    burst({ dur: 0.2, freq: 700, q: 0.7, type: "lowpass", gain: 0.12 });
  },
  ledge() {
    if (!ok()) return;
    burst({ dur: 0.05, freq: 1500, q: 1.5, gain: 0.08 });
  },
  pullup() {
    if (!ok()) return;
    burst({ dur: 0.22, freq: 900, sweep: 1700, q: 0.9, gain: 0.05 });
    tone({ f: 500, f2: 700, dur: 0.12, gain: 0.015, type: "triangle", when: 0.05 });
  },
  climb(mat) {
    if (!ok() || !throttle("climb", 120)) return;
    burst({ dur: 0.06, freq: mat === "fabric" ? 1200 : 2400, q: 1, gain: 0.04 });
  },
  push(on) {
    // a deep wooden scrape: the block is big for the toy
    const c = ac();
    if (!c) return;
    loopLevel("push", "noise", on ? 0.09 : 0, 260);
  },
  pushLand(mat) {
    if (!ok()) return;
    burst({ dur: 0.3, freq: 160, q: 0.6, type: "lowpass", gain: 0.3 });
    tone({ f: 90, f2: 50, dur: 0.25, gain: 0.12 });
    void mat;
  },
  hurt() {
    if (!ok()) return;
    tone({ f: 980, f2: 520, dur: 0.22, gain: 0.06, type: "square" }); // a toy squeak "oops"
    burst({ dur: 0.15, freq: 500, q: 0.8, type: "lowpass", gain: 0.12 });
  },
  stumble() {
    if (!ok()) return;
    tone({ f: 760, f2: 560, dur: 0.14, gain: 0.04, type: "square" });
    burst({ dur: 0.12, freq: 600, q: 0.8, type: "lowpass", gain: 0.1 });
  },
  fall(reason) {
    if (!ok()) return;
    if (reason === "water") {
      burst({ dur: 0.45, freq: 900, sweep: 300, q: 0.6, gain: 0.22 });
      for (let i = 0; i < 4; i++) tone({ f: 600 + i * 180, dur: 0.06, gain: 0.02, type: "sine", when: 0.08 + i * 0.07 });
    } else tone({ f: 900, f2: 300, dur: 0.6, gain: 0.04, type: "sine" });
  },
  respawn() {
    if (!ok()) return;
    [660, 880, 1320].forEach((f, i) => tone({ f, dur: 0.18, gain: 0.03, type: "triangle", when: i * 0.05 }));
  },
  splash() {
    if (!ok() || !throttle("splash", 90)) return;
    burst({ dur: 0.18, freq: 1800, q: 0.7, gain: 0.08 });
  },

  /* --- pickups / progress */
  button(n = 1) {
    if (!ok()) return;
    // a music-box arpeggio climbing with each button found
    const base = 784 * Math.pow(1.1225, n - 1);
    [0, 0.08, 0.16, 0.26].forEach((w, i) => tone({ f: base * [1, 1.26, 1.5, 2][i], dur: 0.5, gain: 0.05, type: "sine", when: w }));
    tone({ f: base * 3, dur: 0.6, gain: 0.015, type: "sine", when: 0.26 });
  },
  checkpoint() {
    if (!ok()) return;
    tone({ f: 523, dur: 0.6, gain: 0.05, type: "sine" });
    tone({ f: 784, dur: 0.8, gain: 0.04, type: "sine", when: 0.12 });
    tone({ f: 1568, dur: 0.5, gain: 0.012, type: "sine", when: 0.12 });
  },
  finish() {
    if (!ok()) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ f, dur: 0.7, gain: 0.05, type: "sine", when: i * 0.09 }));
    burst({ dur: 0.7, freq: 6000, q: 0.5, type: "highpass", gain: 0.03, when: 0.15 });
  },
  complete() {
    if (!ok()) return;
    [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone({ f, dur: 0.55, gain: 0.045, type: "triangle", when: 0.1 + i * 0.11 }));
  },
  interact(kind) {
    if (!ok()) return;
    if (kind === "crank" || kind === "windup") for (let i = 0; i < 6; i++) burst({ dur: 0.025, freq: 3200, q: 4, gain: 0.07, when: i * 0.06 });
    else {
      burst({ dur: 0.05, freq: 1800, q: 2, gain: 0.1 });
      tone({ f: 300, f2: 200, dur: 0.12, gain: 0.05, type: "square" });
    }
  },
  ride() {
    if (!ok()) return;
    tone({ f: 600, f2: 900, dur: 0.12, gain: 0.02, type: "triangle" });
  },

  /* --- big things: pets, machines (deep and slow = huge) */
  petStep(dist) {
    if (!ok() || !throttle("petStep", 260)) return;
    const v = Math.max(0, 0.25 - dist * 0.012);
    if (v <= 0.01) return;
    burst({ dur: 0.2, freq: 180, q: 0.7, type: "lowpass", gain: v });
  },
  meow(dist = 5) {
    if (!ok() || !throttle("meow", 1200)) return;
    const c = ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.18);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.55);
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 3;
    f.frequency.setValueAtTime(800, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.2);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.55);
    const g = c.createGain();
    const v = Math.max(0.02, 0.12 - dist * 0.004);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(f).connect(g).connect(sfx);
    o.start(t);
    o.stop(t + 0.65);
  },
  purr() {
    if (!ok() || !throttle("purr", 2500)) return;
    for (let i = 0; i < 8; i++) burst({ dur: 0.12, freq: 120, q: 0.8, type: "lowpass", gain: 0.06, when: i * 0.14 });
  },
  bark(dist = 5) {
    if (!ok() || !throttle("bark", 1600)) return;
    const v = Math.max(0.03, 0.16 - dist * 0.005);
    for (let i = 0; i < 2; i++) {
      burst({ dur: 0.12, freq: 700, q: 1.5, gain: v, when: i * 0.22 });
      tone({ f: 330, f2: 220, dur: 0.12, gain: v * 0.6, type: "square", when: i * 0.22 });
    }
  },
  sniff() {
    if (!ok() || !throttle("sniff", 900)) return;
    for (let i = 0; i < 3; i++) burst({ dur: 0.06, freq: 2500, q: 1, type: "highpass", gain: 0.05, when: i * 0.09 });
  },
  drawer() {
    if (!ok() || !throttle("drawer", 400)) return;
    burst({ dur: 0.5, freq: 300, sweep: 180, q: 0.8, type: "lowpass", gain: 0.2 });
  },
  hazard(kind) {
    if (!ok() || !throttle("hz:" + kind, 300)) return;
    if (kind === "drip") tone({ f: 1400, f2: 700, dur: 0.09, gain: 0.05, type: "sine" });
    else if (kind === "sprinkler") burst({ dur: 0.3, freq: 3000, q: 0.5, type: "highpass", gain: 0.08 });
    else if (kind === "roller") burst({ dur: 0.25, freq: 220, q: 0.7, type: "lowpass", gain: 0.25 });
    else burst({ dur: 0.2, freq: 1200, q: 1, gain: 0.08 });
  },
  warn() {
    if (!ok() || !throttle("warn", 500)) return;
    tone({ f: 880, dur: 0.07, gain: 0.025, type: "triangle" });
  },

  /* --- continuous (0..1 proximity / activity) */
  vacuum(v) {
    loopLevel("vacuum", "motor", v * 0.22, 600 + v * 500);
  },
  fan(v) {
    loopLevel("fan", "noise", v * 0.12, 900);
  },
  water(v) {
    loopLevel("water", "noise", v * 0.08, 2400);
  },
  motor(v) {
    loopLevel("motor", "motor", v * 0.08, 1400);
  },

  /* --- UI */
  uiHover() {
    if (!ok() || !throttle("hover", 60)) return;
    tone({ f: 1500, dur: 0.035, gain: 0.02, type: "triangle" });
  },
  uiClick() {
    if (!ok()) return;
    tone({ f: 880, f2: 1320, dur: 0.07, gain: 0.04, type: "triangle" });
  },
  denied() {
    if (!ok()) return;
    tone({ f: 240, f2: 170, dur: 0.15, gain: 0.05, type: "square" });
  },

  stopLoops() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const l of Object.values(loops)) {
      l.g.gain.cancelScheduledValues(t);
      l.g.gain.setTargetAtTime(0, t, 0.03);
    }
  },
  music(cfg) {
    const c = ac();
    if (!c) return;
    if (!cfg) {
      musicCfg = null;
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
      return;
    }
    const same = musicCfg && musicCfg.bpm === cfg.bpm && musicCfg.key === cfg.key && musicCfg.mood === cfg.mood;
    musicCfg = cfg;
    if (same && musicTimer) return;
    step = 0;
    nextT = c.currentTime + 0.1;
    if (!musicTimer) musicTimer = setInterval(scheduleMusic, 40);
  },
  dispose() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    musicCfg = null;
    for (const k of Object.keys(loops)) {
      try {
        loops[k].src && loops[k].src.stop();
        loops[k].o && loops[k].o.stop();
      } catch {
        /* already stopped */
      }
      delete loops[k];
    }
    if (ctx) {
      const c = ctx;
      ctx = null;
      noiseBuf = null;
      c.close().catch(() => {});
    }
  },
};
