/**
 * Last Shelter — procedural audio (WebAudio, no sample files).
 *
 * master → music | sfx | ambience buses (+ a soft compressor).
 *  - Scavenge: a two-tone air-raid siren whose sweep tightens as the clock
 *    runs down, ticking seconds (beeps + heartbeat in the last ten),
 *    footsteps, pickup chimes, the hatch thunk and the final blast.
 *  - Shelter: a low ventilation drone, drips, radio static, page turns and
 *    outcome stings; music is a slow music-box lullaby on a lookahead
 *    scheduler (major on the menu, minor underground).
 */
let ctx = null;
let master;
let musicBus;
let sfxBus;
let ambBus;
let noiseBuf;
let vol = { master: 0.8, music: 0.45, sfx: 0.85 };
let muted = false;
let sirenNodes = null;
let amb = null;
let mus = null;

function init() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  ambBus = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 3;
  for (const b of [musicBus, sfxBus, ambBus]) b.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);
  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  applyVol();
  return ctx;
}
function applyVol() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.03);
  musicBus.gain.setTargetAtTime(vol.music * 0.55, t, 0.1);
  sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.05);
  ambBus.gain.setTargetAtTime(vol.sfx * 0.6, t, 0.2);
}

function tone(freq, dur, { type = "sine", gain = 0.2, at = 0, bus = sfxBus, attack = 0.005, slide = 0, filter = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
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
  node.connect(g);
  g.connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function noise(dur, { gain = 0.2, at = 0, type = "bandpass", freq = 1200, q = 1, bus = sfxBus, attack = 0.005, sweep = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(bus);
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
}

const SFX = {
  click: () => tone(880, 0.06, { type: "triangle", gain: 0.08 }),
  hover: () => tone(1200, 0.03, { type: "sine", gain: 0.03 }),
  pickup: (k = 0) => {
    tone(660 + k * 40, 0.12, { type: "triangle", gain: 0.16 });
    tone(990 + k * 60, 0.18, { type: "sine", gain: 0.12, at: 0.06 });
  },
  deposit: () => {
    tone(140, 0.25, { type: "sine", gain: 0.3, slide: 0.6 });
    noise(0.12, { gain: 0.15, freq: 400, q: 0.8 });
    tone(784, 0.2, { type: "triangle", gain: 0.1, at: 0.08 });
    tone(1046, 0.25, { type: "triangle", gain: 0.1, at: 0.16 });
  },
  rescue: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, { type: "triangle", gain: 0.12, at: i * 0.07 })),
  saved: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.35, { type: "sine", gain: 0.14, at: i * 0.09 })),
  blocked: () => tone(140, 0.18, { type: "square", gain: 0.06, filter: 900 }),
  step: () => noise(0.05, { gain: 0.05, freq: 600 + Math.random() * 400, q: 1.5 }),
  tick: () => tone(1500, 0.03, { type: "square", gain: 0.03, filter: 3000 }),
  beep: () => tone(1320, 0.12, { type: "square", gain: 0.08, filter: 2600 }),
  heart: () => {
    tone(58, 0.14, { type: "sine", gain: 0.5 });
    tone(52, 0.16, { type: "sine", gain: 0.4, at: 0.18 });
  },
  go: () => {
    tone(440, 0.15, { type: "square", gain: 0.06, filter: 2000 });
    tone(880, 0.3, { type: "square", gain: 0.07, filter: 2000, at: 0.15 });
  },
  count: () => tone(660, 0.12, { type: "square", gain: 0.06, filter: 2000 }),
  boom: () => {
    noise(2.6, { gain: 0.9, type: "lowpass", freq: 900, sweep: 0.08, attack: 0.01 });
    tone(48, 2.2, { type: "sine", gain: 0.8, slide: 0.5 });
    noise(1.2, { gain: 0.3, freq: 2400, q: 0.5, at: 0.05, sweep: 0.2 });
  },
  hatch: () => {
    tone(90, 0.5, { type: "square", gain: 0.12, filter: 500, slide: 0.7 });
    noise(0.3, { gain: 0.3, freq: 300, q: 2 });
    tone(1800, 0.4, { type: "sine", gain: 0.04, at: 0.02 });
  },
  page: () => noise(0.22, { gain: 0.12, freq: 3200, q: 0.6, sweep: 0.4, attack: 0.04 }),
  good: () => [523, 659, 784].forEach((f, i) => tone(f, 0.3, { type: "triangle", gain: 0.1, at: i * 0.08 })),
  bad: () => {
    tone(311, 0.35, { type: "triangle", gain: 0.1 });
    tone(233, 0.5, { type: "triangle", gain: 0.1, at: 0.15 });
  },
  newday: () => {
    tone(392, 0.6, { type: "sine", gain: 0.08 });
    tone(587, 0.8, { type: "sine", gain: 0.07, at: 0.2 });
  },
  depart: () => {
    noise(0.4, { gain: 0.15, freq: 500, q: 1 });
    tone(220, 0.5, { type: "triangle", gain: 0.08, slide: 1.5 });
  },
  static: () => noise(0.9, { gain: 0.08, freq: 2500, q: 0.3, bus: ambBus }),
  death: () => [330, 262, 196].forEach((f, i) => tone(f, 0.9, { type: "sine", gain: 0.1, at: i * 0.35 })),
  ending: (good) => (good ? [392, 494, 587, 784, 988] : [392, 311, 262, 196]).forEach((f, i) => tone(f, 1.2, { type: "triangle", gain: 0.09, at: i * 0.3 })),
};

/* ------------------------------------------------------------------ siren */
function startSiren() {
  if (!ctx || sirenNodes) return;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.18;
  const lg = ctx.createGain();
  lg.gain.value = 170;
  lfo.connect(lg);
  lg.connect(o.frequency);
  lg.connect(o2.frequency);
  o.frequency.value = 520;
  o2.frequency.value = 523;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  o.connect(f);
  o2.connect(f);
  f.connect(g);
  g.connect(ambBus);
  o.start();
  o2.start();
  lfo.start();
  g.gain.setTargetAtTime(0.07, ctx.currentTime, 0.6);
  sirenNodes = { o, o2, lfo, g };
}
function sirenUrgency(k) {
  if (!sirenNodes) return;
  sirenNodes.lfo.frequency.setTargetAtTime(0.18 + k * 0.5, ctx.currentTime, 0.4);
  sirenNodes.g.gain.setTargetAtTime(0.06 + k * 0.05, ctx.currentTime, 0.4);
}
function stopSiren(fast = false) {
  if (!sirenNodes) return;
  const s = sirenNodes;
  sirenNodes = null;
  const t = ctx.currentTime;
  s.g.gain.setTargetAtTime(0.0001, t, fast ? 0.05 : 0.8);
  s.lfo.frequency.setTargetAtTime(0.02, t, 0.5);
  for (const n of [s.o, s.o2, s.lfo]) n.stop(t + (fast ? 0.3 : 3));
}

/* ------------------------------------------------------------------ bunker ambience */
function startAmb() {
  if (!ctx || amb) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 180;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  s.connect(f);
  f.connect(g);
  g.connect(ambBus);
  s.start();
  const hum = ctx.createOscillator();
  hum.frequency.value = 50;
  const hg = ctx.createGain();
  hg.gain.value = 0.012;
  hum.connect(hg);
  hg.connect(ambBus);
  hum.start();
  g.gain.setTargetAtTime(0.14, ctx.currentTime, 1.2);
  const drip = setInterval(() => {
    if (Math.random() < 0.45) tone(1600 + Math.random() * 900, 0.08, { type: "sine", gain: 0.05, slide: 0.5, bus: ambBus });
  }, 2300);
  amb = { s, g, hum, drip };
}
function stopAmb() {
  if (!amb) return;
  const a = amb;
  amb = null;
  clearInterval(a.drip);
  a.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
  a.s.stop(ctx.currentTime + 1.5);
  a.hum.stop(ctx.currentTime + 0.5);
}

/* ------------------------------------------------------------------ music box */
const SONGS = {
  menu: { bpm: 76, scale: [0, 2, 4, 7, 9], root: 67, bass: [0, -5, -3, -7], mel: [0, 2, 4, 2, 7, 4, 2, 0, 4, 7, 9, 7, 4, 2, 4, -1] },
  shelter: { bpm: 62, scale: [0, 2, 3, 5, 7, 8, 10], root: 62, bass: [0, -4, -2, -5], mel: [0, -1, 2, 3, 2, -1, 0, -1, 4, 3, 2, 0, 3, 2, -1, -1] },
  ending: { bpm: 70, scale: [0, 2, 4, 5, 7, 9, 11], root: 65, bass: [0, -3, -5, -7], mel: [4, 2, 0, 2, 4, 4, 4, -1, 2, 2, 2, -1, 4, 7, 7, -1] },
};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function startMusic(name) {
  if (!ctx) return;
  if (mus && mus.name === name) return;
  stopMusic();
  const song = SONGS[name];
  if (!song) return;
  const beat = 60 / song.bpm / 2;
  let step = 0;
  let next = ctx.currentTime + 0.2;
  const deg = (d) => {
    const s = song.scale;
    const o = Math.floor(d / s.length);
    return song.root + s[((d % s.length) + s.length) % s.length] + o * 12;
  };
  const id = setInterval(() => {
    while (next < ctx.currentTime + 0.4) {
      const m = song.mel[step % song.mel.length];
      if (m >= 0) {
        const f = midi(deg(m));
        tone(f, beat * 2.6, { type: "sine", gain: 0.07, at: next - ctx.currentTime, bus: musicBus, attack: 0.004 });
        tone(f * 2, beat * 1.4, { type: "sine", gain: 0.015, at: next - ctx.currentTime, bus: musicBus, attack: 0.004 });
      }
      if (step % 8 === 0) {
        const b = song.bass[(step / 8) % song.bass.length];
        tone(midi(song.root - 12 + b), beat * 8, { type: "triangle", gain: 0.05, at: next - ctx.currentTime, bus: musicBus, attack: 0.3 });
      }
      next += beat;
      step++;
    }
  }, 100);
  mus = { name, id };
}
function stopMusic() {
  if (!mus) return;
  clearInterval(mus.id);
  mus = null;
}

export const sound = {
  unlock() {
    const c = init();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  },
  play(name, arg) {
    if (!init() || muted) return;
    if (ctx.state === "suspended") return;
    SFX[name]?.(arg);
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    applyVol();
  },
  setMuted(m) {
    muted = !!m;
    applyVol();
  },
  siren(on, urgency = 0) {
    if (!init()) return;
    if (on) {
      startSiren();
      sirenUrgency(urgency);
    } else stopSiren();
  },
  sirenCut() {
    stopSiren(true);
  },
  ambience(on) {
    if (!init()) return;
    if (on) startAmb();
    else stopAmb();
  },
  music(name) {
    if (!init()) return;
    if (name) startMusic(name);
    else stopMusic();
  },
  suspend() {
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  },
  resume() {
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  stopAll() {
    stopSiren(true);
    stopAmb();
    stopMusic();
  },
};
