/**
 * Corridor 9 — procedural WebAudio (no sound files).
 *
 * Beds: electrical hum, ventilation air, a faint fluorescent buzz.
 * Spatial one-shots (panned + attenuated from the player's view): the wall
 * clock's tick, the leak's drips, crackle from a flickering tube, a door
 * creak. Footsteps go through a short underground reverb. Rare ambience
 * (distant steps, a far knock, a vent groan, a breath of a whisper) never
 * marks an anomaly — only what you SEE does. Everything feeds one master
 * gain so mute is instant. The context is created on the first gesture.
 */
import { PROPS, W } from "./data.js";

let ctx = null, master = null, verb = null, noiseBuf = null;
let muted = false;
let beds = null;
let tickT = 0, dripT = 0, crackT = 0, creakT = 6, eventT = 35, lastFlick = 1;
let lastLoop = -1;

const now = () => ctx.currentTime;
function makeNoise(seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = w * 0.4 + last * 3;
  }
  return b;
}
function impulse(seconds = 2.4, decay = 3) {
  const n = ctx.sampleRate * seconds;
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}
function noiseSrc(loop = true) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = loop;
  return s;
}
function env(g, t, a, peak, d) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
/** output node: panned, with a reverb send */
function out(pan = 0, wet = 0.3) {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  if (wet > 0) {
    const s = ctx.createGain();
    s.gain.value = wet;
    p.connect(s).connect(verb);
  }
  return p;
}
function burst({ f = 800, f2 = null, q = 1, type = "bandpass", a = 0.004, d = 0.12, gain = 0.3, rate = 1, pan = 0, wet = 0.3, at = 0 }) {
  const t = now() + at;
  const s = noiseSrc(false);
  s.playbackRate.value = rate;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  fl.Q.value = q;
  const g = ctx.createGain();
  s.connect(fl).connect(g).connect(out(pan, wet));
  env(g, t, a, gain, d);
  s.start(t, Math.random() * 1.5);
  s.stop(t + a + d + 0.05);
}
function tone({ f = 440, f2 = null, type = "sine", a = 0.01, d = 0.3, gain = 0.2, pan = 0, wet = 0.3, at = 0 }) {
  const t = now() + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  const g = ctx.createGain();
  o.connect(g).connect(out(pan, wet));
  env(g, t, a, gain, d);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

/** gain + pan for a source at (x, z) heard by the player */
function spatial(g, x, z, range = 12) {
  const P = g.player;
  const dx = x - P.x, dz = z - P.z;
  const d = Math.hypot(dx, dz);
  // player's right vector = (cos yaw, -sin yaw)
  const right = (dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw)) / Math.max(d, 0.001);
  return { gain: Math.max(0, 1 - d / range) ** 1.6, pan: right * 0.8, d };
}

function buildBeds() {
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.connect(master);
  // mains hum
  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 50;
  const humF = ctx.createBiquadFilter();
  humF.type = "lowpass";
  humF.frequency.value = 220;
  const humG = ctx.createGain();
  humG.gain.value = 0.05;
  hum.connect(humF).connect(humG).connect(g);
  const hum2 = ctx.createOscillator();
  hum2.frequency.value = 100.4;
  const hum2G = ctx.createGain();
  hum2G.gain.value = 0.025;
  hum2.connect(hum2G).connect(g);
  // ventilation air
  const air = noiseSrc();
  const airF = ctx.createBiquadFilter();
  airF.type = "bandpass";
  airF.frequency.value = 380;
  airF.Q.value = 0.6;
  const airG = ctx.createGain();
  airG.gain.value = 0.05;
  air.connect(airF).connect(airG).connect(g);
  // fluorescent buzz
  const buzz = ctx.createOscillator();
  buzz.type = "square";
  buzz.frequency.value = 120;
  const buzzF = ctx.createBiquadFilter();
  buzzF.type = "bandpass";
  buzzF.frequency.value = 2400;
  buzzF.Q.value = 3;
  const buzzG = ctx.createGain();
  buzzG.gain.value = 0.006;
  buzz.connect(buzzF).connect(buzzG).connect(g);
  // slow unease: a detuned low drone that breathes
  const dr = ctx.createOscillator();
  dr.type = "triangle";
  dr.frequency.value = 36.7;
  const drG = ctx.createGain();
  drG.gain.value = 0.0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.03;
  lfo.connect(lfoG).connect(drG.gain);
  dr.connect(drG).connect(g);
  [hum, hum2, air, buzz, dr, lfo].forEach((n) => n.start());
  return { g, buzzG, airG };
}

/* ------------------------------------------------------------------ sounds */
const SFX = {
  step({ run }) {
    const r = 0.85 + Math.random() * 0.3;
    burst({ f: run ? 1500 : 1150, q: 1.2, a: 0.002, d: run ? 0.07 : 0.09, gain: run ? 0.16 : 0.11, rate: r, wet: 0.45 });
    tone({ f: 95 * r, f2: 55, a: 0.003, d: 0.08, gain: run ? 0.14 : 0.09, wet: 0.25 });
  },
  correct() {
    tone({ f: 196, a: 0.4, d: 2.6, gain: 0.05, wet: 0.7 });
    tone({ f: 293.7, a: 0.5, d: 2.4, gain: 0.03, wet: 0.7 });
  },
  wrong() {
    tone({ f: 110, f2: 82, type: "sawtooth", a: 0.3, d: 2.2, gain: 0.05, wet: 0.6 });
    tone({ f: 116.5, f2: 87, type: "sawtooth", a: 0.3, d: 2.2, gain: 0.045, wet: 0.6 });
    burst({ f: 300, f2: 90, q: 0.7, a: 0.2, d: 1.8, gain: 0.08, wet: 0.7 });
  },
  win() {
    [261.6, 329.6, 392, 523.3].forEach((f, i) => tone({ f, a: 0.8 + i * 0.2, d: 4, gain: 0.05, wet: 0.6, at: i * 0.15 }));
    burst({ f: 900, f2: 3000, q: 0.4, a: 1.2, d: 2.5, gain: 0.06, wet: 0.5 });
  },
  figureGone() {
    burst({ f: 500, f2: 160, q: 0.5, a: 0.35, d: 1.1, gain: 0.07, wet: 0.8 });
  },
  start() {
    burst({ f: 200, f2: 60, q: 0.6, a: 0.05, d: 1.6, gain: 0.12, wet: 0.8 }); // heavy door shutting far behind
    tone({ f: 48, f2: 36, a: 0.02, d: 1.2, gain: 0.12, wet: 0.6 });
  },
};

/** rare, unexplained ambience (never an anomaly) */
const AMBIENT = [
  () => {
    // distant footsteps that stop
    const pan = Math.random() * 1.6 - 0.8;
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) burst({ f: 900, q: 1, a: 0.003, d: 0.08, gain: 0.03, pan, wet: 1, at: i * 0.58 });
  },
  () => {
    // three knocks behind a wall
    const pan = Math.random() < 0.5 ? -0.7 : 0.7;
    for (let i = 0; i < 3; i++) {
      tone({ f: 120, f2: 70, a: 0.002, d: 0.12, gain: 0.08, pan, wet: 0.8, at: i * 0.42 });
      burst({ f: 500, q: 1.5, a: 0.002, d: 0.05, gain: 0.04, pan, wet: 0.8, at: i * 0.42 });
    }
  },
  () => {
    // the ventilation groans
    tone({ f: 70, f2: 52, type: "sawtooth", a: 1.2, d: 2.5, gain: 0.025, wet: 0.9 });
    burst({ f: 260, f2: 140, q: 3, a: 1, d: 2.6, gain: 0.05, wet: 0.9 });
  },
  () => {
    // a breath, very close
    const pan = Math.random() < 0.5 ? -0.9 : 0.9;
    burst({ f: 1800, f2: 900, q: 2, a: 0.5, d: 0.9, gain: 0.025, pan, wet: 0.15 });
  },
  () => {
    // far metal clang
    tone({ f: 523, f2: 510, type: "triangle", a: 0.003, d: 2.2, gain: 0.025, pan: Math.random() - 0.5, wet: 1 });
    tone({ f: 787, f2: 770, type: "triangle", a: 0.003, d: 1.6, gain: 0.015, pan: Math.random() - 0.5, wet: 1 });
  },
];

export const audio = {
  unlock() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    } catch {
      ctx = null;
      return;
    }
    noiseBuf = makeNoise(3);
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    verb = ctx.createConvolver();
    verb.buffer = impulse(2.6, 2.6);
    const vg = ctx.createGain();
    vg.gain.value = 0.5;
    verb.connect(vg).connect(master);
    beds = buildBeds();
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.03);
  },
  play(name, e = {}) {
    if (!ctx || muted || ctx.state !== "running") return;
    SFX[name]?.(e);
  },
  /** per-frame: bed level, spatial props, rare ambience */
  update(g, dt, active, flickerLevel) {
    if (!ctx || !beds) return;
    const t = now();
    beds.g.gain.setTargetAtTime(active ? 1 : g ? 0.25 : 0.35, t, 0.4);
    if (!g || !active || muted || ctx.state !== "running") return;
    if (g.loop.index !== lastLoop) {
      lastLoop = g.loop.index;
      tickT = 0;
      creakT = 4 + Math.random() * 4;
    }
    const a = g.loop.anomaly;
    // clock tick (forward once a second; the backward clock whirs softly)
    tickT -= dt;
    if (tickT <= 0) {
      const s = spatial(g, -W / 2, PROPS.clock.z, 9);
      if (a === "clock") {
        tickT = 0.2;
        if (s.gain > 0.01) burst({ f: 3200, q: 4, a: 0.001, d: 0.02, gain: 0.05 * s.gain, pan: s.pan, wet: 0.2 });
      } else {
        tickT = 1;
        if (s.gain > 0.01) burst({ f: 2600, q: 5, a: 0.001, d: 0.025, gain: 0.08 * s.gain, pan: s.pan, wet: 0.2 });
      }
    }
    if (a === "leak") {
      dripT -= dt;
      if (dripT <= 0) {
        dripT = 0.37;
        const s = spatial(g, -W / 2 + 0.33, PROPS.leak.z, 14);
        if (s.gain > 0.01) tone({ f: 1300 + Math.random() * 500, f2: 700, a: 0.002, d: 0.08, gain: 0.09 * s.gain, pan: s.pan, wet: 0.6 });
      }
    }
    if (a === "flicker" && flickerLevel != null) {
      const s = spatial(g, 0, PROPS.fixturesZ[PROPS.flickerIndex], 14);
      crackT -= dt;
      if (flickerLevel < 0.8 && lastFlick >= 0.8 && crackT <= 0 && s.gain > 0.01) {
        crackT = 0.1;
        burst({ f: 3500, q: 0.8, a: 0.002, d: 0.06, gain: 0.07 * s.gain, pan: s.pan, wet: 0.2 });
      }
      lastFlick = flickerLevel;
      beds.buzzG.gain.setTargetAtTime(0.006 + 0.02 * s.gain * (1 - flickerLevel), t, 0.03);
    } else beds.buzzG.gain.setTargetAtTime(0.006, t, 0.2);
    if (a === "door") {
      creakT -= dt;
      const s = spatial(g, -W / 2, PROPS.doors[1].z, 12);
      if (creakT <= 0) {
        creakT = 7 + Math.random() * 6;
        if (s.gain > 0.05) tone({ f: 190, f2: 260, type: "sawtooth", a: 0.3, d: 0.9, gain: 0.03 * s.gain, pan: s.pan, wet: 0.5 });
      }
    }
    // rare ambience
    eventT -= dt;
    if (eventT <= 0) {
      eventT = 40 + Math.random() * 55;
      AMBIENT[Math.floor(Math.random() * AMBIENT.length)]();
    }
  },
  dispose() {
    try {
      ctx?.close();
    } catch {
      /* ignore */
    }
    ctx = null;
    master = null;
    verb = null;
    beds = null;
    lastLoop = -1;
  },
};
