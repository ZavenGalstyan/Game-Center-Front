/**
 * Bunker audio, synthesised with the Web Audio API (no audio files): the
 * ventilation hum and mains buzz, generator rumble, distant metal impacts and
 * drips through a concrete-room reverb, radio static, knocking, footsteps on
 * the ceiling, wall scratching, creature breathing and shrieks, the lockdown
 * siren, the blast door, card foley and the rescue rotor + chord.
 * Nothing starts before a user gesture (unlock()); volume / mute follow the
 * game settings and the Game Center mute button.
 */
let ctx = null;
let master, sfx, amb, verb, verbSend, comp;
let muted = false;
let volume = 0.8;
let noiseBuf = null;
let loops = {};
let timers = [];

const now = () => (ctx ? ctx.currentTime : 0);
const rnd = (a, b) => a + Math.random() * (b - a);

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ctx.destination);
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.connect(master);
  sfx = ctx.createGain();
  sfx.gain.value = 0.9;
  sfx.connect(comp);
  amb = ctx.createGain();
  amb.gain.value = 0.6;
  amb.connect(comp);
  // small concrete room: short dense early reflections + a metallic tail
  verb = ctx.createConvolver();
  const len = (ctx.sampleRate * 2.2) | 0;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4) * (1 + 0.4 * Math.sin(i * 0.031 + c));
    }
  }
  verb.buffer = ir;
  verbSend = ctx.createGain();
  verbSend.gain.value = 0.4;
  verbSend.connect(verb);
  verb.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return ctx;
}

function send(g, amount) {
  if (!amount) return;
  const s = ctx.createGain();
  s.gain.value = amount;
  g.connect(s).connect(verbSend);
}

function noise(dur, { type = "lowpass", freq = 1000, q = 1, gain = 0.5, attack = 0.005, rev = 0.2, at = 0, sweep = null, to = sfx } = {}) {
  if (!ctx) return;
  const t = now() + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(to);
  send(g, rev);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

function tone(freq, dur, { type = "sine", gain = 0.3, attack = 0.01, rev = 0.2, at = 0, glide = null, filter = null, to = sfx } = {}) {
  if (!ctx) return;
  const t = now() + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(10, glide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filter;
    o.connect(f);
    node = f;
  }
  node.connect(g).connect(to);
  send(g, rev);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A metal hit: inharmonic partials + a noise click. */
function metal(base = 180, { gain = 0.25, dur = 1.6, at = 0, rev = 0.5, dull = 1 } = {}) {
  for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]]) tone(base * m, dur / (m * 0.5 + 0.6), { type: "sine", gain: (gain * a) / dull, at, rev, attack: 0.002 });
  noise(0.08, { type: "bandpass", freq: base * 6, q: 1.2, gain: gain * 0.8, at, rev });
}

/* ------------------------------------------------------------------ loops */
function loopNoise(key, { type = "lowpass", freq = 300, q = 0.7, gain = 0.1, lfo = 0, lfoRate = 0.1 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(gain, now(), 1.2);
  src.connect(f).connect(g).connect(amb);
  const nodes = [src, f, g];
  if (lfo) {
    const o = ctx.createOscillator();
    o.frequency.value = lfoRate;
    const og = ctx.createGain();
    og.gain.value = lfo;
    o.connect(og).connect(f.frequency);
    o.start();
    nodes.push(o, og);
  }
  src.start();
  loops[key] = { nodes, g };
}

function loopTone(key, freqs, { type = "sine", gain = 0.03, filter = 400 }) {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(gain, now(), 1.5);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = filter;
  f.connect(g).connect(amb);
  const nodes = [g, f];
  for (const fr of freqs) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = fr;
    o.detune.value = rnd(-6, 6);
    o.connect(f);
    o.start();
    nodes.push(o);
  }
  loops[key] = { nodes, g, f };
}

function stopLoop(key, fade = 0.6) {
  const L = loops[key];
  if (!L) return;
  delete loops[key];
  L.g.gain.setTargetAtTime(0, now(), fade / 3);
  setTimeout(() => {
    for (const n of L.nodes) {
      try {
        n.stop?.();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
  }, fade * 1000 + 200);
}

function every(ms, jitter, fn) {
  let id;
  const go = () => {
    id = setTimeout(() => {
      fn();
      go();
    }, ms + Math.random() * jitter);
    timers.push(() => clearTimeout(id));
  };
  go();
}

/* ------------------------------------------------------------------ public */
export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : volume, now(), 0.05);
  },
  setVolume(v) {
    volume = v;
    if (master && !muted) master.gain.setTargetAtTime(v, now(), 0.05);
  },

  /** Bunker bed: vent hum, mains buzz, generator, distant impacts and drips. */
  startAmbience({ generator = true, tension = 0 } = {}) {
    if (!ensure() || loops.vent) return;
    loopNoise("vent", { type: "lowpass", freq: 380, q: 0.6, gain: 0.11, lfo: 60, lfoRate: 0.07 });
    loopTone("mains", [50, 100, 150], { type: "sawtooth", gain: 0.012, filter: 260 });
    if (generator) this.generator(true);
    every(5200, 9000, () => {
      const r = Math.random();
      if (r < 0.35) metal(rnd(70, 140), { gain: 0.05, dur: 2.4, rev: 0.9, dull: 2 });
      else if (r < 0.7) tone(rnd(1400, 2400), 0.12, { gain: 0.03, rev: 0.7, glide: rnd(900, 1300) });
      else noise(1.6, { type: "lowpass", freq: 120, gain: 0.08, attack: 0.4, rev: 0.6 });
    });
    this.tension(tension);
  },
  stopAmbience() {
    for (const k of Object.keys(loops)) stopLoop(k);
    for (const t of timers) t();
    timers = [];
  },
  generator(on) {
    if (!ensure()) return;
    if (on && !loops.gen) loopTone("gen", [31, 62, 93.5], { type: "sawtooth", gain: 0.02, filter: 180 });
    if (!on) stopLoop("gen", 1.6);
  },
  /** 0..1 unease drone under everything. */
  tension(v) {
    if (!ensure()) return;
    if (v > 0 && !loops.drone) loopTone("drone", [41.2, 43.65, 61.7], { type: "triangle", gain: 0.0001, filter: 320 });
    if (loops.drone) loops.drone.g.gain.setTargetAtTime(0.004 + v * 0.03, now(), 2);
  },
  static(on) {
    if (!ensure()) return;
    if (on && !loops.static) loopNoise("static", { type: "bandpass", freq: 2400, q: 0.5, gain: 0.05, lfo: 900, lfoRate: 3.3 });
    if (!on) stopLoop("static", 0.3);
  },
  siren(on) {
    if (!ensure()) return;
    if (on && !loops.siren) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.45;
      const lg = ctx.createGain();
      lg.gain.value = 180;
      lfo.connect(lg).connect(o.frequency);
      o.frequency.value = 520;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.045, now(), 0.3);
      o.connect(f).connect(g).connect(amb);
      send(g, 0.6);
      o.start();
      lfo.start();
      loops.siren = { nodes: [o, lfo, lg, f, g], g };
    }
    if (!on) stopLoop("siren", 0.8);
  },

  /* one-shots */
  flicker() {
    if (!ensure()) return;
    noise(0.12, { type: "bandpass", freq: 3200, q: 2, gain: 0.05, rev: 0.1 });
    tone(100, 0.15, { type: "square", gain: 0.02, filter: 900, rev: 0 });
  },
  knock(n = 3, at = 0) {
    if (!ensure()) return;
    for (let i = 0; i < n; i++) {
      const t = at + i * 0.42;
      metal(95, { gain: 0.35, dur: 1.1, at: t, rev: 0.7, dull: 1.5 });
      noise(0.09, { type: "lowpass", freq: 260, gain: 0.5, at: t, rev: 0.5 });
    }
  },
  bang() {
    if (!ensure()) return;
    metal(62, { gain: 0.5, dur: 2.6, rev: 0.9 });
    noise(0.5, { type: "lowpass", freq: 160, gain: 0.6, rev: 0.6 });
  },
  footsteps(n = 6, gap = 0.62) {
    if (!ensure()) return;
    for (let i = 0; i < n; i++) noise(0.14, { type: "lowpass", freq: 180 + Math.random() * 60, gain: 0.22 * (1 - i / (n + 2)) + 0.05, at: i * gap + rnd(-0.04, 0.04), rev: 0.6 });
  },
  scratch(dur = 3) {
    if (!ensure()) return;
    for (let t = 0; t < dur; t += rnd(0.12, 0.3)) noise(rnd(0.05, 0.16), { type: "bandpass", freq: rnd(1800, 4200), q: 3, gain: rnd(0.04, 0.1), at: t, rev: 0.4, sweep: rnd(1200, 5000) });
  },
  breath(big = false) {
    if (!ensure()) return;
    const f = big ? 300 : 700;
    noise(1.3, { type: "bandpass", freq: f, q: 0.8, gain: big ? 0.2 : 0.08, attack: 0.5, rev: 0.4 });
    noise(1.6, { type: "bandpass", freq: f * 0.7, q: 0.8, gain: big ? 0.16 : 0.06, attack: 0.6, at: 1.5, rev: 0.4 });
    if (big) tone(55, 2.5, { type: "sawtooth", gain: 0.05, filter: 220, at: 0.2 });
  },
  shriek() {
    if (!ensure()) return;
    tone(880, 1.1, { type: "sawtooth", gain: 0.12, glide: 420, filter: 2600, rev: 0.6 });
    tone(1230, 0.9, { type: "sawtooth", gain: 0.08, glide: 610, filter: 3000, rev: 0.6 });
    noise(1.2, { type: "bandpass", freq: 1800, q: 1.4, gain: 0.25, rev: 0.6, sweep: 700 });
  },
  growl() {
    if (!ensure()) return;
    tone(48, 1.8, { type: "sawtooth", gain: 0.12, filter: 300, glide: 38 });
    noise(1.8, { type: "bandpass", freq: 260, q: 1.5, gain: 0.2, attack: 0.2, rev: 0.4 });
  },
  door(open = true) {
    if (!ensure()) return;
    metal(48, { gain: 0.5, dur: 3, rev: 0.8 });
    for (let i = 0; i < 6; i++) tone(rnd(160, 300), 0.5, { type: "sawtooth", gain: 0.02, filter: 900, at: 0.3 + i * 0.25, glide: rnd(140, 360) });
    noise(2.2, { type: "lowpass", freq: open ? 600 : 300, gain: 0.25, attack: 0.3, rev: 0.5, at: 0.2, sweep: 140 });
  },
  powerDown() {
    if (!ensure()) return;
    this.generator(false);
    tone(220, 2.2, { type: "sawtooth", gain: 0.06, glide: 30, filter: 800, rev: 0.5 });
    metal(70, { gain: 0.3, dur: 2, rev: 0.7 });
  },
  powerUp() {
    if (!ensure()) return;
    tone(30, 2.4, { type: "sawtooth", gain: 0.06, glide: 120, filter: 700, rev: 0.4 });
    setTimeout(() => this.generator(true), 1500);
  },
  drip() {
    if (!ensure()) return;
    tone(rnd(1500, 2200), 0.1, { gain: 0.05, rev: 0.8, glide: 900 });
  },
  radioVoice() {
    if (!ensure()) return;
    // a voice-like formant burble under static, deliberately unintelligible
    for (let i = 0; i < 9; i++) {
      const t = i * 0.28 + rnd(0, 0.08);
      noise(0.22, { type: "bandpass", freq: rnd(500, 1300), q: 6, gain: 0.08, at: t, rev: 0.1 });
      tone(rnd(110, 160), 0.2, { type: "sawtooth", gain: 0.02, filter: 1200, at: t, rev: 0 });
    }
  },
  rotor(on) {
    if (!ensure()) return;
    if (on && !loops.rotor) {
      loopNoise("rotor", { type: "lowpass", freq: 160, q: 2, gain: 0.0001 });
      const L = loops.rotor;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 9;
      const lg = ctx.createGain();
      lg.gain.value = 0.08;
      lfo.connect(lg).connect(L.g.gain);
      lfo.start();
      L.nodes.push(lfo, lg);
    }
    if (!on) stopLoop("rotor", 2);
  },
  rescueChord() {
    if (!ensure()) return;
    for (const [f, d] of [[130.8, 0], [196, 0.3], [261.6, 0.6], [329.6, 0.9], [392, 1.2]]) tone(f, 6, { type: "triangle", gain: 0.06, attack: 1.4, at: d, rev: 0.7, filter: 1600 });
  },
  sting() {
    if (!ensure()) return;
    tone(58, 2.6, { type: "sawtooth", gain: 0.1, filter: 500, rev: 0.7 });
    tone(61.7, 2.6, { type: "sawtooth", gain: 0.08, filter: 500, rev: 0.7 });
    noise(0.6, { type: "highpass", freq: 3000, gain: 0.08, rev: 0.8, sweep: 9000 });
  },
  heartbeat(n = 4) {
    if (!ensure()) return;
    for (let i = 0; i < n; i++) {
      tone(52, 0.18, { gain: 0.25, at: i * 0.9, rev: 0.1, filter: 200 });
      tone(46, 0.2, { gain: 0.18, at: i * 0.9 + 0.22, rev: 0.1, filter: 200 });
    }
  },
  hurt() {
    if (!ensure()) return;
    noise(0.3, { type: "lowpass", freq: 500, gain: 0.3, rev: 0.3 });
    tone(90, 0.4, { type: "sine", gain: 0.2, glide: 50 });
  },
  shuffle() {
    if (!ensure()) return;
    for (let i = 0; i < 9; i++) noise(0.05, { type: "highpass", freq: 2500, gain: 0.05, at: i * 0.04, rev: 0.05 });
  },
  draw() {
    if (!ensure()) return;
    noise(0.12, { type: "bandpass", freq: 3200, q: 0.8, gain: 0.08, rev: 0.05, sweep: 1500 });
  },
  flip() {
    if (!ensure()) return;
    noise(0.07, { type: "highpass", freq: 2000, gain: 0.09, rev: 0.05 });
  },
  play(good = true) {
    if (!ensure()) return;
    noise(0.1, { type: "lowpass", freq: 900, gain: 0.18, rev: 0.2 });
    tone(good ? 196 : 98, 0.6, { type: "triangle", gain: 0.06, rev: 0.4 });
  },
  gain() {
    if (!ensure()) return;
    tone(392, 0.25, { type: "triangle", gain: 0.04, rev: 0.3 });
    tone(523, 0.35, { type: "triangle", gain: 0.035, at: 0.08, rev: 0.3 });
  },
  click() {
    if (!ensure()) return;
    noise(0.03, { type: "highpass", freq: 3000, gain: 0.06, rev: 0 });
  },
  stopAll() {
    this.stopAmbience();
  },
  dispose() {
    this.stopAmbience();
    if (ctx) {
      const c = ctx;
      ctx = null;
      setTimeout(() => c.close().catch(() => {}), 1200);
    }
    loops = {};
  },
};
