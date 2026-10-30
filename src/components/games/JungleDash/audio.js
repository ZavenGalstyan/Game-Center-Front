/**
 * Synthesized sound effects and a light procedural music loop (Web Audio;
 * no audio files). Silent until the first user gesture unlocks the context;
 * `setMuted` follows GamePlayer's Mute button and the in-game Sound toggle.
 */
let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let muted = false;

function ac() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.16;
    musicBus.connect(master);
  } catch {
    ctx = null;
  }
  return ctx;
}
// sounds only play once unlock() (a user gesture) has created and resumed the context
const live = () => (ctx && !muted && ctx.state === "running" ? ctx : null);

function tone(freq, dur, { type = "sine", vol = 0.3, slide = 0, delay = 0, bus = null, attack = 0.005 } = {}) {
  const c = live();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(bus || sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}
let noiseBuf = null;
function noise(dur, { vol = 0.25, freq = 1200, q = 1, delay = 0, type = "bandpass", slide = 0 } = {}) {
  const c = live();
  if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

const PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319];
let fruitStep = 0;
let fruitT = 0;

/* ------------------------------------------------------------- music */
const SONGS = {
  sunny: { bpm: 112, root: 196, mel: [0, 2, 4, 7, 4, 2, 4, 9, 7, 4, 2, 0, 2, 4, 2, -1], bass: [0, 0, 5, 5, 3, 3, 4, 4], wave: "triangle" },
  river: { bpm: 104, root: 220, mel: [0, 4, 7, 9, 7, 4, 2, 4, 0, 2, 4, 7, 4, 2, 0, -1], bass: [0, 0, 3, 3, 5, 5, 4, 4], wave: "triangle" },
  temple: { bpm: 96, root: 185, mel: [0, 1, 4, 5, 7, 5, 4, 1, 0, -1, 1, 4, 1, 0, -1, -1], bass: [0, 0, 1, 1, 0, 0, -2, -2], wave: "square" },
  volcano: { bpm: 128, root: 165, mel: [0, 3, 5, 7, 5, 3, 0, 3, 7, 10, 7, 5, 3, 5, 3, -1], bass: [0, 0, 0, 0, -2, -2, -4, -4], wave: "sawtooth" },
  moon: { bpm: 88, root: 208, mel: [0, 4, 7, 11, 7, 4, 2, -1, 0, 2, 4, 7, 9, 7, 4, -1], bass: [0, 0, 5, 5, 2, 2, 4, 4], wave: "sine" },
  fortress: { bpm: 120, root: 175, mel: [0, 0, 3, 5, 7, 5, 3, 2, 0, 0, 3, 7, 8, 7, 5, -1], bass: [0, 0, -4, -4, -2, -2, -5, -5], wave: "square" },
  boss: { bpm: 140, root: 147, mel: [0, 3, 0, 6, 5, 3, 0, -1, 0, 3, 7, 6, 5, 3, 1, -1], bass: [0, 0, 0, 0, 1, 1, -1, -1], wave: "sawtooth" },
};
let music = null;
const semis = (root, n) => root * Math.pow(2, n / 12);
function musicTick() {
  const c = live();
  if (!c || !music) return;
  const S = SONGS[music.song];
  const step = 60 / S.bpm / 2; // eighth notes
  if (music.next < c.currentTime) music.next = c.currentTime + 0.05; // after a suspend, don't replay the backlog
  while (music.next < c.currentTime + 0.25) {
    const i = music.i++;
    const t = music.next;
    const m = S.mel[i % S.mel.length];
    if (m >= 0 && i % 2 === 0) note(semis(S.root * 2, m), step * 1.7, S.wave, 0.22, t);
    else if (m >= 0 && Math.random() < 0.35) note(semis(S.root * 2, m + 12), step * 0.6, "sine", 0.08, t);
    if (i % 4 === 0) note(semis(S.root / 2, S.bass[(i / 4) % S.bass.length]), step * 3.6, "triangle", 0.4, t);
    if (i % 2 === 1) hat(t);
    music.next += step;
  }
}
function note(f, dur, type, vol, t0) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(musicBus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function hat(t0) {
  if (!noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.08, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  src.connect(f).connect(g).connect(musicBus);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + 0.06);
}

let wantSong = null;
function startMusic(song) {
  if (music) clearInterval(music.timer);
  music = null;
  if (!song || !ctx) return;
  music = { song, i: 0, next: ctx.currentTime + 0.1, timer: setInterval(musicTick, 90) };
}

export const audio = {
  /** call from a user gesture: creates / resumes the audio context (browsers block it before one) */
  unlock() {
    const c = ac();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    if (c && wantSong && (!music || music.song !== wantSong)) startMusic(wantSong);
  },
  setMuted(m) {
    muted = !!m;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.03);
  },
  music(song) {
    wantSong = song || null;
    if (music && music.song === song) return;
    startMusic(wantSong); // no-op until unlock() has created the context
  },
  click: () => tone(660, 0.07, { type: "square", vol: 0.1 }),
  jump: () => tone(330, 0.16, { type: "square", vol: 0.12, slide: 1.9 }),
  land: () => noise(0.06, { vol: 0.12, freq: 400 }),
  spin() {
    noise(0.32, { vol: 0.22, freq: 900, q: 2, slide: 2.5 });
    tone(220, 0.25, { type: "sawtooth", vol: 0.05, slide: 1.6 });
  },
  crate() {
    noise(0.16, { vol: 0.35, freq: 700, q: 0.8 });
    tone(140, 0.12, { type: "square", vol: 0.12, slide: 0.5 });
  },
  wall() {
    noise(0.35, { vol: 0.4, freq: 300, q: 0.6 });
    tone(90, 0.3, { type: "sawtooth", vol: 0.15, slide: 0.5 });
  },
  fruit() {
    const now = performance.now();
    fruitStep = now - fruitT < 600 ? Math.min(PENTA.length - 1, fruitStep + 1) : 0;
    fruitT = now;
    tone(PENTA[fruitStep], 0.12, { type: "sine", vol: 0.18 });
    tone(PENTA[fruitStep] * 2, 0.08, { type: "sine", vol: 0.06, delay: 0.03 });
  },
  heart() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: "triangle", vol: 0.16, delay: i * 0.06 }));
  },
  spring: () => tone(200, 0.3, { type: "sine", vol: 0.25, slide: 3.2 }),
  stomp() {
    tone(180, 0.1, { type: "square", vol: 0.18, slide: 0.5 });
    noise(0.1, { vol: 0.2, freq: 600 });
  },
  pop() {
    tone(500, 0.12, { type: "sine", vol: 0.2, slide: 2 });
    noise(0.12, { vol: 0.2, freq: 1500, q: 1.5 });
  },
  clank: () => tone(900, 0.12, { type: "square", vol: 0.12, slide: 0.7 }),
  hurt() {
    tone(420, 0.25, { type: "sawtooth", vol: 0.18, slide: 0.45 });
    noise(0.15, { vol: 0.15, freq: 500 });
  },
  fall: () => tone(600, 0.7, { type: "triangle", vol: 0.2, slide: 0.2 }),
  splash: () => noise(0.5, { vol: 0.3, freq: 1200, q: 0.5, slide: 0.3 }),
  sizzle: () => noise(0.6, { vol: 0.3, freq: 3000, q: 0.4, type: "highpass" }),
  respawn: () => [392, 523, 659].forEach((f, i) => tone(f, 0.15, { type: "sine", vol: 0.14, delay: i * 0.07 })),
  checkpoint() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { type: "triangle", vol: 0.15, delay: i * 0.07 }));
  },
  secret() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.2, { type: "sine", vol: 0.14, delay: i * 0.08 }));
  },
  shoot: (fire) => (fire ? noise(0.25, { vol: 0.22, freq: 900, q: 0.7, slide: 0.4 }) : tone(300, 0.12, { type: "square", vol: 0.12, slide: 0.6 })),
  windup: () => tone(200, 0.6, { type: "sine", vol: 0.08, slide: 2.2 }),
  jet: () => noise(0.5, { vol: 0.18, freq: 500, q: 0.5 }),
  crush() {
    noise(0.3, { vol: 0.35, freq: 200, q: 0.6 });
    tone(70, 0.3, { type: "sine", vol: 0.3 });
  },
  complete() {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: "square", vol: 0.1, delay: i * 0.11 }));
    [262, 392, 523].forEach((f, i) => tone(f, 0.5, { type: "triangle", vol: 0.15, delay: 0.45 + i * 0.05 }));
  },
  gameover() {
    [392, 349, 311, 262].forEach((f, i) => tone(f, 0.35, { type: "triangle", vol: 0.16, delay: i * 0.2 }));
  },
  roar() {
    noise(1.2, { vol: 0.35, freq: 250, q: 0.7, slide: 0.6 });
    tone(80, 1.1, { type: "sawtooth", vol: 0.16, slide: 0.7 });
  },
  slam() {
    noise(0.5, { vol: 0.5, freq: 150, q: 0.5 });
    tone(55, 0.5, { type: "sine", vol: 0.45, slide: 0.6 });
  },
  throwRock: () => noise(0.3, { vol: 0.2, freq: 600, q: 1, slide: 0.5 }),
  boulder() {
    noise(0.3, { vol: 0.3, freq: 250, q: 0.6 });
    tone(80, 0.2, { type: "sine", vol: 0.25 });
  },
  bossHit() {
    [1319, 1047, 1568].forEach((f, i) => tone(f, 0.25, { type: "triangle", vol: 0.16, delay: i * 0.04 }));
    tone(110, 0.4, { type: "sawtooth", vol: 0.15, slide: 0.6 });
  },
  warn: () => tone(880, 0.12, { type: "square", vol: 0.08, delay: 0 }),
  bossDown() {
    noise(2.2, { vol: 0.4, freq: 300, q: 0.5, slide: 0.3 });
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, { type: "sawtooth", vol: 0.1, delay: i * 0.3 }));
  },
  stopAll() {
    this.music(null);
  },
};
