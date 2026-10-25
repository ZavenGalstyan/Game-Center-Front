/**
 * Shadow Runner — WebAudio synth. No audio files: every effect is a short
 * oscillator/noise envelope, and the music is a lookahead-scheduled loop
 * (kick, hats, bass, arpeggio) whose key and tempo change per district.
 */
let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.5;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

function tone(freq, dur, vol, { slide = 1, type = "triangle", delay = 0, bus } = {}) {
  const c = ctx;
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus || sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol, { freq = 1200, q = 0.8, type = "bandpass", delay = 0, bus, at } = {}) {
  const c = ctx;
  if (!c) return;
  const t = at ?? c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus || sfxBus);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const SFX = {
  jump: () => {
    tone(300, 0.12, 0.12, { slide: 1.8 });
    noise(0.06, 0.05, { freq: 2400 });
  },
  airjump: () => {
    tone(520, 0.14, 0.1, { slide: 1.6, type: "sine" });
    noise(0.12, 0.06, { freq: 3500, q: 1.4 });
  },
  walljump: () => {
    noise(0.05, 0.12, { freq: 900 });
    tone(360, 0.1, 0.09, { slide: 1.6 });
  },
  land: () => noise(0.07, 0.12, { freq: 500, type: "lowpass" }),
  landHard: () => {
    noise(0.14, 0.2, { freq: 300, type: "lowpass" });
    tone(90, 0.12, 0.15, { slide: 0.6, type: "sine" });
  },
  slide: () => noise(0.3, 0.08, { freq: 1600, q: 0.5 }),
  vault: () => {
    noise(0.05, 0.1, { freq: 1200 });
    tone(420, 0.08, 0.06, { slide: 1.3 });
  },
  climb: () => {
    noise(0.05, 0.1, { freq: 800 });
    tone(260, 0.12, 0.07, { slide: 1.5 });
  },
  wall: () => noise(0.06, 0.08, { freq: 700 }),
  bonk: () => {
    tone(120, 0.2, 0.22, { slide: 0.5, type: "square" });
    noise(0.12, 0.18, { freq: 400, type: "lowpass" });
  },
  coin: () => {
    tone(1320, 0.07, 0.07, { type: "sine" });
    tone(1980, 0.12, 0.06, { type: "sine", delay: 0.05 });
  },
  spring: () => tone(220, 0.3, 0.14, { slide: 3.2, type: "sine" }),
  checkpoint: () => {
    tone(660, 0.1, 0.09, { type: "sine" });
    tone(880, 0.1, 0.09, { type: "sine", delay: 0.08 });
    tone(1320, 0.2, 0.08, { type: "sine", delay: 0.16 });
  },
  crack: () => noise(0.12, 0.1, { freq: 2200, q: 2 }),
  collapse: () => {
    noise(0.4, 0.18, { freq: 260, type: "lowpass" });
    tone(70, 0.3, 0.1, { slide: 0.6, type: "sine" });
  },
  "die:laser": () => {
    tone(900, 0.25, 0.12, { slide: 0.2, type: "sawtooth" });
    noise(0.25, 0.14, { freq: 3000 });
  },
  "die:fall": () => tone(500, 0.6, 0.12, { slide: 0.15, type: "triangle" }),
  "die:caught": () => {
    tone(160, 0.35, 0.22, { slide: 0.4, type: "square" });
    noise(0.3, 0.2, { freq: 600 });
  },
  respawn: () => tone(440, 0.18, 0.07, { slide: 1.5, type: "sine" }),
  finish: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 0.09, { type: "sine", delay: i * 0.09 }));
  },
  click: () => tone(700, 0.05, 0.05, { type: "sine" }),
  star: () => tone(1175, 0.18, 0.08, { type: "sine" }),
};

export function playSfx(name) {
  if (!ctx || !sfxBus) return;
  SFX[name]?.();
}

// ---------------------------------------------------------------- music

const SONGS = [
  { bpm: 112, root: 45, scale: [0, 3, 5, 7, 10], bass: [0, 0, 3, 5], arp: [0, 2, 4, 2] }, // A minor-pent, warm
  { bpm: 124, root: 49, scale: [0, 2, 3, 7, 8], bass: [0, 0, 4, 3], arp: [0, 1, 2, 4, 2, 1] }, // C# — neon
  { bpm: 118, root: 40, scale: [0, 1, 5, 7, 8], bass: [0, 0, 1, 0], arp: [0, 2, 3, 2] }, // E phrygian-ish, industrial
  { bpm: 132, root: 43, scale: [0, 3, 5, 7, 10], bass: [0, 3, 4, 2], arp: [0, 2, 4, 3, 2, 1] }, // G, storm
];

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
let timer = null;
let song = null;
let nextT = 0;
let stepN = 0;
let musicOn = false;

export function setMusic(on, district = 0) {
  ensure();
  if (!ctx) return;
  song = SONGS[district] || SONGS[0];
  musicOn = on;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(on ? 0.16 : 0, t, 0.3);
  if (on && !timer) {
    nextT = ctx.currentTime + 0.1;
    stepN = 0;
    timer = setInterval(schedule, 90);
  }
  if (!on && timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function setMasterMute(muted) {
  ensure();
  if (!ctx) return;
  master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
}

function schedule() {
  if (!ctx || !musicOn || !song) return;
  const sixteenth = 60 / song.bpm / 4;
  while (nextT < ctx.currentTime + 0.35) {
    const s = stepN % 64;
    const bar = Math.floor(s / 16);
    const inBar = s % 16;
    // kick on beats, hats on offbeats
    if (inBar % 4 === 0) kick(nextT);
    if (inBar % 4 === 2) noise(0.04, 0.09, { freq: 8000, type: "highpass", at: nextT, bus: musicBus });
    if (inBar === 4 || inBar === 12) noise(0.12, 0.12, { freq: 1800, q: 0.7, at: nextT, bus: musicBus });
    // bass: 8ths
    if (inBar % 2 === 0) {
      const deg = song.bass[bar % song.bass.length];
      const n = song.root + song.scale[deg % song.scale.length] - 12 + (inBar % 8 === 6 ? 12 : 0);
      note(midi(n), sixteenth * 1.6, 0.22, "sawtooth", nextT, 500);
    }
    // arpeggio: 16ths, quieter
    const a = song.arp[s % song.arp.length];
    const n2 = song.root + 12 + song.scale[(a + bar) % song.scale.length] + (s % 32 >= 16 ? 12 : 0);
    note(midi(n2), sixteenth * 0.9, 0.07, "square", nextT, 2400);
    nextT += sixteenth;
    stepN++;
  }
}

function note(f, dur, vol, type, t, cutoff) {
  const o = ctx.createOscillator();
  const fl = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  fl.type = "lowpass";
  fl.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl).connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function kick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + 0.2);
}

export function stopAudio() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  musicOn = false;
  if (ctx && musicBus) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}
