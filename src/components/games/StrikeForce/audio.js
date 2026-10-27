/**
 * Strike Force — procedural Web Audio (no audio files).
 *
 * Gunshots are rendered once per weapon (OfflineAudioContext: crack + body
 * + low thump + mechanical tail, shaped by each weapon's `sound` params),
 * then played through filter → panner → gain chains: distance lowers the
 * level and the low-pass cutoff and adds reverb, so far fights sound far.
 * Everything else (reload foley, footsteps, hit markers, UI, capture
 * tones, ambience beds, menu music) is synthesised on the fly.
 *
 * Graph: voices → sfx bus ─┐
 *        reverb send ──────┼→ master → compressor → out
 *        music bus ────────┤
 *        ambience bus ─────┘
 */
import { WEAPONS } from "./engine/weapons.js";

let ctx = null;
let master;
let sfxBus;
let musicBus;
let ambBus;
let verb;
let verbSend;
let comp;
let noiseBuf = null;
const shotBufs = new Map();
let rendering = null;
const vol = { master: 0.8, sfx: 0.9, music: 0.45 };
let muted = false;
let voices = 0;
const MAX_VOICES = 28;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  master = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus = ctx.createGain();
  ambBus = ctx.createGain();
  verb = ctx.createConvolver();
  verb.buffer = impulse(1.8, 2.6);
  verbSend = ctx.createGain();
  verbSend.gain.value = 0.55;
  verbSend.connect(verb);
  verb.connect(master);
  sfxBus.connect(master);
  musicBus.connect(master);
  ambBus.connect(master);
  master.connect(comp);
  comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  return ctx;
}
function impulse(sec, decay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * sec);
  const b = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
  }
  return b;
}
function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.02);
  sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.02);
  musicBus.gain.setTargetAtTime(vol.music, t, 0.05);
  ambBus.gain.setTargetAtTime(vol.sfx * 0.6, t, 0.05);
}

/* ------------------------------------------------------------------ gunshot rendering */
async function renderShot(w) {
  const rate = 44100;
  const s = w.sound || {};
  const len = 0.25 + (s.tail || 0.3) * 0.9;
  const oc = new OfflineAudioContext(1, Math.floor(rate * len), rate);
  const nb = oc.createBuffer(1, rate * 1, rate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const out = oc.createGain();
  out.gain.value = 0.9;
  out.connect(oc.destination);
  const pitch = s.pitch || 1;
  const body = s.body || 1;
  const sil = !!s.silenced;
  // crack
  {
    const src = oc.createBufferSource();
    src.buffer = nb;
    const hp = oc.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = sil ? 2200 : 1400 * pitch;
    const g = oc.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime((sil ? 0.25 : 1) * (s.crack || 1), 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, sil ? 0.03 : 0.06);
    src.connect(hp).connect(g).connect(out);
    src.start(0);
  }
  // body (filtered noise)
  {
    const src = oc.createBufferSource();
    src.buffer = nb;
    src.playbackRate.value = 0.8;
    const lp = oc.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime((sil ? 900 : 2600) * pitch, 0);
    lp.frequency.exponentialRampToValueAtTime(300 * pitch, 0.18);
    lp.Q.value = 0.8;
    const g = oc.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.9 * body * (sil ? 0.5 : 1), 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, 0.14 + body * 0.08);
    src.connect(lp).connect(g).connect(out);
    src.start(0, 0.3);
  }
  // thump
  {
    const o = oc.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(140 * pitch, 0);
    o.frequency.exponentialRampToValueAtTime(45 * pitch, 0.12);
    const g = oc.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.75 * body * (sil ? 0.6 : 1), 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, 0.16);
    o.connect(g).connect(out);
    o.start(0);
    o.stop(0.2);
  }
  // tail: lower rumble / slap back
  if (!sil && (s.tail || 0) > 0.1) {
    const src = oc.createBufferSource();
    src.buffer = nb;
    const bp = oc.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500 * pitch;
    bp.Q.value = 0.7;
    const g = oc.createGain();
    g.gain.setValueAtTime(0, 0.03);
    g.gain.linearRampToValueAtTime(0.28 * s.tail, 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, 0.2 + s.tail * 0.7);
    src.connect(bp).connect(g).connect(out);
    src.start(0.03, 0.5);
  }
  // mechanical clack
  {
    const src = oc.createBufferSource();
    src.buffer = nb;
    const bp = oc.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3800;
    bp.Q.value = 6;
    const g = oc.createGain();
    g.gain.setValueAtTime(0, 0.012);
    g.gain.linearRampToValueAtTime(sil ? 0.35 : 0.18, 0.014);
    g.gain.exponentialRampToValueAtTime(0.001, 0.04);
    src.connect(bp).connect(g).connect(out);
    src.start(0.012, 0.7);
  }
  return oc.startRendering();
}
function prepareShots() {
  if (!ensure() || rendering) return rendering;
  rendering = Promise.all(
    WEAPONS.map(async (w) => {
      try {
        shotBufs.set(w.id, await renderShot(w));
      } catch {
        /* rendering unsupported — synth fallback below */
      }
    }),
  );
  return rendering;
}

/* ------------------------------------------------------------------ voice helpers */
/** play a buffer with distance/pan: rel = { dist, pan (-1..1) } */
function playBuf(buf, { gain = 1, dist = 0, pan = 0, rate = 1, wet = 0.12, bus = sfxBus } = {}) {
  if (!ctx || !buf) return;
  if (voices >= MAX_VOICES && dist > 10) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.max(700, 16000 / (1 + dist / 14));
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  const g = ctx.createGain();
  g.gain.value = gain / (1 + dist / 9);
  src.connect(lp).connect(p).connect(g).connect(bus);
  const send = ctx.createGain();
  send.gain.value = wet + Math.min(0.5, dist / 90);
  g.connect(send).connect(verbSend);
  voices++;
  src.onended = () => {
    voices--;
    src.disconnect();
    g.disconnect();
    send.disconnect();
  };
  src.start(t);
}
function noise(dur, { type = "bandpass", freq = 1000, q = 1, gain = 0.4, attack = 0.002, at = 0, dist = 0, pan = 0, sweep = null, offset = Math.random() } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain / (1 + dist / 9), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  src.connect(f).connect(g).connect(p).connect(sfxBus);
  src.start(t, offset * 1.5, dur + 0.05);
  src.onended = () => src.disconnect();
}
function tone(freq, dur, { type = "sine", gain = 0.2, at = 0, slide = null, attack = 0.005, bus = sfxBus } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
  o.onended = () => o.disconnect();
}
const click = (at = 0, freq = 3200, gain = 0.25, dist = 0, pan = 0) => noise(0.035, { freq, q: 4, gain, at, dist, pan });

/* ------------------------------------------------------------------ ambience */
let amb = null;
function startAmbience(kind) {
  stopAmbience();
  if (!ensure()) return;
  const nodes = [];
  const t = ctx.currentTime;
  const bed = (freq, q, gain, type = "lowpass", lfo = 0.08, depth = 0.4) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    const l = ctx.createOscillator();
    l.frequency.value = lfo;
    const lg = ctx.createGain();
    lg.gain.value = gain * depth;
    l.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(ambBus);
    src.start(t, Math.random());
    l.start(t);
    nodes.push(src, l, f, g, lg);
  };
  if (kind === "harbor") {
    bed(420, 0.6, 0.12, "lowpass", 0.11, 0.6);
    bed(1800, 0.4, 0.015, "bandpass", 0.05, 0.5);
  } else if (kind === "desert") {
    bed(700, 0.5, 0.06, "bandpass", 0.07, 0.8);
  } else if (kind === "city") {
    bed(2600, 0.3, 0.07, "highpass", 0.2, 0.15);
    bed(120, 0.7, 0.07, "lowpass", 0.03, 0.4);
  } else if (kind === "forest") {
    bed(900, 0.4, 0.035, "bandpass", 0.06, 0.8);
  } else if (kind === "snow") {
    bed(520, 1.6, 0.08, "bandpass", 0.09, 0.9);
    bed(1500, 2.2, 0.02, "bandpass", 0.13, 0.9);
  }
  let timer = null;
  if (kind === "forest" || kind === "harbor") {
    timer = setInterval(() => {
      if (!ctx || Math.random() < 0.5) return;
      if (kind === "forest") {
        const f = 2200 + Math.random() * 1800;
        for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) tone(f * (1 + Math.random() * 0.1), 0.09, { type: "sine", gain: 0.025, at: k * 0.12, slide: f * 1.3, bus: ambBus });
      } else {
        const f = 1300 + Math.random() * 500;
        tone(f, 0.25, { type: "triangle", gain: 0.018, slide: f * 0.7, bus: ambBus });
        tone(f * 1.1, 0.2, { type: "triangle", gain: 0.014, at: 0.28, slide: f * 0.75, bus: ambBus });
      }
    }, 2600);
  }
  amb = { nodes, timer };
}
function stopAmbience() {
  if (!amb) return;
  clearInterval(amb.timer);
  for (const n of amb.nodes) {
    try {
      n.stop?.();
    } catch {
      /* already stopped */
    }
    n.disconnect();
  }
  amb = null;
}

/* ------------------------------------------------------------------ music (menu) */
let music = null;
function startMusic() {
  if (!ensure() || music) return;
  const bpm = 96;
  const beat = 60 / bpm;
  let next = ctx.currentTime + 0.1;
  let step = 0;
  const roots = [55, 55, 49, 52]; // A, A, G, ~Ab… minor progression (Hz /2 octaves)
  const pad = [];
  const padG = ctx.createGain();
  padG.gain.value = 0.0;
  padG.connect(musicBus);
  const padF = ctx.createBiquadFilter();
  padF.type = "lowpass";
  padF.frequency.value = 900;
  padF.connect(padG);
  for (const m of [1, 1.5, 2, 2.4]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 110 * m;
    o.detune.value = (Math.random() - 0.5) * 12;
    o.connect(padF);
    o.start();
    pad.push(o);
  }
  padG.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2);
  const tick = () => {
    if (!ctx) return;
    while (next < ctx.currentTime + 0.25) {
      const bar = Math.floor(step / 16) % roots.length;
      const r = roots[bar];
      const s16 = step % 16;
      const at = next - ctx.currentTime;
      if (s16 === 0) for (const [i, o] of pad.entries()) o.frequency.setTargetAtTime(r * 2 * [1, 1.5, 2, 2.4][i], next, 0.4);
      if (s16 % 4 === 0) tone(r, 0.32, { type: "sine", gain: 0.32, at, slide: r * 0.6, bus: musicBus });
      if (s16 === 4 || s16 === 12) noise(0.18, { type: "bandpass", freq: 1800, q: 0.8, gain: 0.12, at });
      if (s16 % 2 === 1) noise(0.04, { type: "highpass", freq: 7000, q: 0.5, gain: 0.03, at });
      if ([0, 3, 6, 10, 14].includes(s16)) tone(r * 4 * (s16 === 10 ? 1.5 : s16 === 14 ? 1.2 : 1), 0.16, { type: "square", gain: 0.022, at, bus: musicBus });
      next += beat / 4;
      step++;
    }
  };
  const id = setInterval(tick, 60);
  tick();
  music = { id, pad, padG };
}
function stopMusic() {
  if (!music) return;
  clearInterval(music.id);
  const t = ctx.currentTime;
  music.padG.gain.setTargetAtTime(0, t, 0.3);
  const pads = music.pad;
  setTimeout(() => pads.forEach((o) => (o.stop(), o.disconnect())), 1500);
  music = null;
}

/* ------------------------------------------------------------------ public */
export const sound = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    prepareShots();
  },
  setVolumes(v) {
    Object.assign(vol, v);
    applyVolumes();
  },
  setMuted(m) {
    muted = m;
    applyVolumes();
  },
  suspend() {
    if (ctx && ctx.state === "running") ctx.suspend();
  },
  resume() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  },
  /** gunshot: own (dist 0) or remote */
  shot(wid, { dist = 0, pan = 0, own = false } = {}) {
    if (!ctx) return;
    const buf = shotBufs.get(wid);
    const rate = 0.96 + Math.random() * 0.08;
    if (buf) playBuf(buf, { gain: own ? 0.9 : 1.15, dist, pan, rate, wet: own ? 0.1 : 0.18 });
    else noise(0.12, { type: "lowpass", freq: 1800, gain: 0.6, dist, pan });
  },
  dry() {
    click(0, 2600, 0.3);
  },
  reload(kind, total, { dist = 0, pan = 0 } = {}) {
    if (!ctx || dist > 26) return;
    const g = 0.3;
    if (kind === "shell") return;
    click(0.05, 1800, g * 0.6, dist, pan); // release
    noise(0.12, { type: "bandpass", freq: 900, q: 1.5, gain: g * 0.5, at: total * 0.22, dist, pan }); // mag out slide
    noise(0.06, { type: "bandpass", freq: 1400, q: 2, gain: g * 0.8, at: total * 0.58, dist, pan }); // mag in
    click(total * 0.62, 2600, g, dist, pan);
    if (kind === "empty") {
      click(total * 0.8, 3200, g * 0.9, dist, pan);
      click(total * 0.86, 2200, g, dist, pan);
    }
  },
  shell({ dist = 0, pan = 0 } = {}) {
    noise(0.07, { type: "bandpass", freq: 1200, q: 2, gain: 0.32, dist, pan });
    click(0.05, 2400, 0.2, dist, pan);
  },
  cycle(kind) {
    if (kind === "bolt") {
      click(0.15, 2000, 0.35);
      noise(0.08, { type: "bandpass", freq: 1500, q: 3, gain: 0.3, at: 0.32 });
      noise(0.07, { type: "bandpass", freq: 1900, q: 3, gain: 0.32, at: 0.6 });
      click(0.82, 2400, 0.35);
    } else if (kind === "pump") {
      noise(0.1, { type: "bandpass", freq: 900, q: 2, gain: 0.4, at: 0.08 });
      noise(0.09, { type: "bandpass", freq: 1300, q: 2, gain: 0.42, at: 0.32 });
    }
  },
  swap() {
    noise(0.12, { type: "bandpass", freq: 700, q: 1, gain: 0.18 });
    click(0.12, 2400, 0.18);
  },
  step(surface, { dist = 0, pan = 0, sprint = false, own = false } = {}) {
    if (!ctx || dist > 30) return;
    const conf = {
      snow: { freq: 1400, q: 0.6, dur: 0.16, g: 0.2 },
      sand: { freq: 2200, q: 0.5, dur: 0.12, g: 0.13 },
      dirt: { freq: 900, q: 0.8, dur: 0.1, g: 0.16 },
      metal: { freq: 2400, q: 3, dur: 0.08, g: 0.15 },
      concrete: { freq: 1100, q: 1.2, dur: 0.07, g: 0.17 },
    }[surface] || { freq: 1100, q: 1.2, dur: 0.07, g: 0.17 };
    const g = conf.g * (sprint ? 1.25 : 1) * (own ? 0.6 : 1.4);
    noise(conf.dur, { type: "bandpass", freq: conf.freq * (0.9 + Math.random() * 0.2), q: conf.q, gain: g, dist, pan });
    noise(0.05, { type: "lowpass", freq: 260, q: 0.7, gain: g * 1.2, dist, pan });
  },
  jump() {
    noise(0.12, { type: "bandpass", freq: 600, q: 0.8, gain: 0.12 });
  },
  land(v) {
    noise(0.14, { type: "lowpass", freq: 380, q: 0.8, gain: Math.min(0.5, v * 0.05) });
    noise(0.08, { type: "bandpass", freq: 1500, q: 1, gain: 0.1 });
  },
  hitmarker(head, kill) {
    if (!ctx) return;
    noise(0.05, { type: "highpass", freq: 4500, q: 0.7, gain: 0.32 });
    tone(head ? 2300 : 1500, 0.06, { type: "triangle", gain: 0.1 });
    if (head) tone(3600, 0.24, { type: "sine", gain: 0.12, at: 0.02 });
    if (kill) {
      tone(880, 0.12, { type: "triangle", gain: 0.14, at: 0.04 });
      tone(1320, 0.22, { type: "triangle", gain: 0.12, at: 0.1 });
    }
  },
  hurt(amount) {
    noise(0.22, { type: "lowpass", freq: 320, q: 0.8, gain: Math.min(0.6, 0.2 + amount / 80) });
    noise(0.05, { type: "bandpass", freq: 1800, q: 1, gain: 0.12 });
  },
  whiz(pan) {
    noise(0.16, { type: "bandpass", freq: 5200, q: 3, gain: 0.18, sweep: 1600, pan });
  },
  heartbeat() {
    tone(58, 0.14, { type: "sine", gain: 0.28 });
    tone(52, 0.14, { type: "sine", gain: 0.2, at: 0.22 });
  },
  capture(good) {
    if (good) [523, 659, 784].forEach((f, i) => tone(f, 0.28, { type: "triangle", gain: 0.12, at: i * 0.09 }));
    else [392, 311, 262].forEach((f, i) => tone(f, 0.3, { type: "sawtooth", gain: 0.06, at: i * 0.1 }));
  },
  streak() {
    [440, 554, 659, 880].forEach((f, i) => tone(f, 0.3, { type: "square", gain: 0.05, at: i * 0.07 }));
  },
  countdown(last) {
    tone(last ? 1320 : 880, last ? 0.4 : 0.12, { type: "square", gain: 0.08 });
  },
  ui() {
    tone(1200, 0.05, { type: "triangle", gain: 0.06 });
    noise(0.02, { type: "highpass", freq: 6000, gain: 0.04 });
  },
  uiBack() {
    tone(700, 0.06, { type: "triangle", gain: 0.06 });
  },
  victory(won) {
    if (won) [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.6, { type: "triangle", gain: 0.12, at: i * 0.12, bus: musicBus }));
    else [392, 349, 311, 262].forEach((f, i) => tone(f, 0.7, { type: "sawtooth", gain: 0.05, at: i * 0.18, bus: musicBus }));
  },
  ambience: startAmbience,
  stopAmbience,
  music: startMusic,
  stopMusic,
  dispose() {
    stopAmbience();
    stopMusic();
  },
  get ready() {
    return !!ctx;
  },
};
