/**
 * Shadow Warriors — WebAudio synth. No audio files: impacts are short noise
 * and oscillator envelopes; the music is a lookahead-scheduled loop (taiko
 * drums, pentatonic pluck, low drone) whose scale and tempo change per
 * chapter, with a heavier groove for boss fights.
 */
let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(comp);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
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

export function setMasterMute(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
}

function tone(freq, dur, vol, { slide = 1, type = "triangle", delay = 0, bus, at } = {}) {
  const c = ctx;
  if (!c) return;
  const t = at ?? c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus || sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol, { freq = 1200, q = 0.8, type = "bandpass", delay = 0, bus, at, sweep } = {}) {
  const c = ctx;
  if (!c) return;
  const t = at ?? c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus || sfxBus);
  src.start(t, Math.random() * 0.2);
  src.stop(t + dur + 0.02);
}

const SFX = {
  swing: () => noise(0.12, 0.12, { freq: 900, sweep: 2600, q: 1.2 }),
  swingHeavy: () => noise(0.24, 0.16, { freq: 400, sweep: 1400, q: 1 }),
  punch: () => {
    tone(140, 0.12, 0.5, { slide: 0.5, type: "sine" });
    noise(0.07, 0.35, { freq: 1800, type: "lowpass" });
  },
  kick: () => {
    tone(110, 0.16, 0.55, { slide: 0.45, type: "sine" });
    noise(0.09, 0.35, { freq: 1200, type: "lowpass" });
  },
  slash: () => {
    noise(0.16, 0.4, { freq: 3800, sweep: 1200, q: 2 });
    tone(220, 0.1, 0.25, { slide: 0.6, type: "sine" });
  },
  staff: () => {
    tone(420, 0.06, 0.35, { slide: 0.7, type: "square" });
    noise(0.06, 0.3, { freq: 2200, q: 3 });
    tone(120, 0.1, 0.3, { slide: 0.5, type: "sine" });
  },
  chain: () => {
    for (let i = 0; i < 4; i++) tone(2400 + i * 300, 0.05, 0.08, { type: "square", delay: i * 0.025 });
    noise(0.12, 0.3, { freq: 3000, q: 2 });
  },
  heavy: () => {
    tone(80, 0.32, 0.7, { slide: 0.4, type: "sine" });
    noise(0.22, 0.5, { freq: 700, type: "lowpass" });
  },
  block: () => {
    tone(1500, 0.12, 0.16, { type: "square", slide: 0.9 });
    tone(2300, 0.1, 0.1, { type: "triangle" });
    noise(0.05, 0.2, { freq: 4000, q: 2 });
  },
  parry: () => {
    tone(1900, 0.4, 0.22, { type: "triangle" });
    tone(2850, 0.35, 0.12, { type: "sine" });
    noise(0.08, 0.25, { freq: 5000, q: 3 });
  },
  guardbreak: () => {
    tone(300, 0.3, 0.4, { slide: 0.4, type: "sawtooth" });
    noise(0.25, 0.4, { freq: 1500 });
  },
  jump: () => noise(0.08, 0.08, { freq: 900, sweep: 1600 }),
  land: () => tone(90, 0.08, 0.25, { slide: 0.6, type: "sine" }),
  dash: () => noise(0.14, 0.14, { freq: 600, sweep: 2000 }),
  thud: () => {
    tone(60, 0.3, 0.6, { slide: 0.5, type: "sine" });
    noise(0.2, 0.3, { freq: 400, type: "lowpass" });
  },
  ko: () => {
    tone(98, 1.6, 0.5, { type: "sine" });
    tone(147, 1.4, 0.25, { type: "triangle" });
    noise(0.5, 0.3, { freq: 300, type: "lowpass" });
  },
  gong: () => {
    tone(110, 1.4, 0.35, { type: "sine" });
    tone(166, 1.2, 0.18, { type: "triangle" });
    tone(233, 1, 0.08, { type: "sine" });
  },
  fight: () => {
    tone(70, 0.3, 0.6, { slide: 0.6, type: "sine" });
    tone(70, 0.3, 0.6, { slide: 0.6, type: "sine", delay: 0.14 });
    noise(0.3, 0.3, { freq: 2600, delay: 0.14 });
  },
  special: () => {
    tone(200, 0.45, 0.25, { slide: 3, type: "sawtooth" });
    noise(0.4, 0.2, { freq: 600, sweep: 4000 });
  },
  buff: () => {
    tone(330, 0.3, 0.2, { slide: 1.5, type: "triangle" });
    tone(495, 0.4, 0.15, { slide: 1.5, type: "sine", delay: 0.08 });
  },
  telegraph: () => {
    tone(880, 0.12, 0.18, { type: "square" });
    tone(660, 0.18, 0.15, { type: "square", delay: 0.12 });
  },
  tired: () => tone(180, 0.15, 0.12, { type: "square", slide: 0.7 }),
  clash: () => {
    tone(1200, 0.3, 0.2, { type: "triangle", slide: 0.6 });
    noise(0.2, 0.3, { freq: 3000 });
  },
  geyser: () => noise(0.6, 0.4, { freq: 300, sweep: 1600, type: "lowpass" }),
  phase: () => {
    tone(60, 0.9, 0.5, { slide: 1.5, type: "sawtooth" });
    noise(0.8, 0.3, { freq: 200, sweep: 1200, type: "lowpass" });
  },
  vanish: () => noise(0.3, 0.2, { freq: 3000, sweep: 500 }),
  coin: () => {
    tone(1320, 0.08, 0.15, { type: "square" });
    tone(1760, 0.14, 0.12, { type: "square", delay: 0.07 });
  },
  click: () => tone(700, 0.05, 0.08, { type: "triangle" }),
  buy: () => {
    tone(660, 0.1, 0.15, { type: "triangle" });
    tone(990, 0.16, 0.13, { type: "triangle", delay: 0.08 });
    tone(1320, 0.2, 0.1, { type: "triangle", delay: 0.16 });
  },
  victory: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 0.18, { type: "triangle", delay: i * 0.12 })),
  defeat: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.6, 0.16, { type: "triangle", delay: i * 0.16 })),
};

let lastSfx = {};
export function playSfx(name) {
  if (!ctx || muted) return;
  const fn = SFX[name];
  if (!fn) return;
  const now = ctx.currentTime;
  if (lastSfx[name] && now - lastSfx[name] < 0.03) return;
  lastSfx[name] = now;
  try {
    fn();
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ music
const SCALES = [
  [0, 3, 5, 7, 10], // temple — minor pentatonic
  [0, 2, 5, 7, 9], // forest — major pentatonic
  [0, 1, 5, 7, 8], // rooftops — in scale (Japanese)
  [0, 1, 4, 5, 7, 8, 11], // desert — double harmonic
  [0, 2, 3, 7, 8], // snow — hirajoshi
];
const ROOTS = [57, 55, 52, 50, 53];
const TEMPO = [92, 100, 112, 104, 96];

let music = { on: false, ch: 0, boss: false, timer: null, next: 0, step: 0 };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function scheduleStep(t, step) {
  const ch = music.ch;
  const sc = SCALES[ch];
  const root = ROOTS[ch];
  const bar = step % 16;
  const boss = music.boss;
  const bus = musicBus;
  // taiko
  if (bar === 0 || bar === 8 || (boss && (bar === 6 || bar === 14)) || bar === 11) {
    tone(boss ? 55 : 62, 0.35, boss ? 0.55 : 0.4, { slide: 0.55, type: "sine", at: t, bus });
    noise(0.12, 0.12, { freq: 300, type: "lowpass", at: t, bus });
  }
  if (bar % 4 === 2) noise(0.05, boss ? 0.08 : 0.05, { freq: 5000, q: 2, at: t, bus });
  // drone every 16
  if (bar === 0) {
    tone(mtof(root - 24), 60 / TEMPO[ch] * 4, 0.12, { type: "sawtooth", at: t, bus });
    tone(mtof(root - 17), 60 / TEMPO[ch] * 4, 0.05, { type: "triangle", at: t, bus });
  }
  // pluck melody (koto-ish), sparse and seeded by step
  const r = Math.sin(step * 12.9898 + ch * 78.233) * 43758.5453;
  const rnd = r - Math.floor(r);
  if ((bar % 2 === 0 && rnd < 0.55) || (boss && rnd < 0.25)) {
    const deg = Math.floor(rnd * sc.length * 2);
    const oct = deg >= sc.length ? 12 : 0;
    const n = root + sc[deg % sc.length] + oct;
    tone(mtof(n), 0.5, 0.09, { type: "triangle", at: t, bus });
    tone(mtof(n) * 2, 0.2, 0.025, { type: "sine", at: t, bus });
  }
}

function tick() {
  if (!ctx || !music.on) return;
  const spb = 60 / TEMPO[music.ch] / 2; // eighth notes
  while (music.next < ctx.currentTime + 0.25) {
    scheduleStep(music.next, music.step++);
    music.next += spb;
  }
}

export function setMusic(on, chapter = 0, boss = false) {
  if (!ensure()) return;
  const changed = music.ch !== chapter || music.boss !== boss;
  music.ch = chapter;
  music.boss = boss;
  if (on && !music.on) {
    music.on = true;
    music.next = ctx.currentTime + 0.1;
    music.timer = setInterval(tick, 90);
  } else if (!on && music.on) {
    music.on = false;
    clearInterval(music.timer);
    music.timer = null;
  }
  if (changed && on) music.step = 0;
  musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.3);
}

export function stopAudio() {
  if (music.timer) clearInterval(music.timer);
  music.on = false;
  music.timer = null;
  if (ctx) {
    try {
      ctx.close();
    } catch {
      /* ignore */
    }
  }
  ctx = null;
  master = sfxBus = musicBus = null;
  lastSfx = {};
}
