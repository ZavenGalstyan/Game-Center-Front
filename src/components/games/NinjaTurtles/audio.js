/**
 * Tiny synthesized sound effects (Web Audio; no audio files). Silent until
 * the first user gesture unlocks the context; `setMuted` follows GamePlayer's
 * Mute button and the in-game Sound setting.
 */
let ctx = null;
let master = null;
let muted = false;

function ac() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(freq, dur, { type = "sine", vol = 0.3, slide = 0, delay = 0 } = {}) {
  const c = ac();
  if (!c || muted || c.state !== "running") return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
function noise(dur, { vol = 0.25, freq = 1200, q = 1, delay = 0, type = "bandpass" } = {}) {
  const c = ac();
  if (!c || muted || c.state !== "running") return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}
const PENTA = [330, 392, 440, 494, 587, 659];

export const audio = {
  unlock() {
    const c = ac();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.5;
  },
  swing() {
    noise(0.12, { vol: 0.18, freq: 2400, q: 0.8 });
  },
  hit(big) {
    noise(0.1, { vol: big ? 0.5 : 0.35, freq: big ? 500 : 800, q: 0.7 });
    tone(big ? 110 : 160, 0.12, { type: "triangle", vol: 0.3, slide: 0.5 });
  },
  hurt() {
    tone(220, 0.18, { type: "square", vol: 0.12, slide: 0.5 });
    noise(0.1, { vol: 0.3, freq: 400 });
  },
  whoosh() {
    noise(0.35, { vol: 0.3, freq: 900, q: 0.5 });
  },
  jump() {
    tone(330, 0.12, { type: "sine", vol: 0.12, slide: 1.8 });
  },
  dodge() {
    noise(0.18, { vol: 0.2, freq: 1600, q: 0.6 });
  },
  boom() {
    noise(0.5, { vol: 0.55, freq: 160, q: 0.6, type: "lowpass" });
    tone(70, 0.4, { type: "sine", vol: 0.4, slide: 0.5 });
  },
  taunt() {
    noise(0.7, { vol: 0.3, freq: 320, q: 1.4 });
    tone(110, 0.6, { type: "sawtooth", vol: 0.08, slide: 0.6 });
    tone(220, 0.5, { type: "square", vol: 0.03, slide: 0.7, delay: 0.05 });
  },
  alert() {
    tone(880, 0.07, { type: "square", vol: 0.06 });
    tone(1180, 0.09, { type: "square", vol: 0.06, delay: 0.07 });
  },
  clang() {
    tone(1400, 0.18, { type: "triangle", vol: 0.12, slide: 0.9 });
    noise(0.06, { vol: 0.2, freq: 4000, q: 2 });
  },
  rush() {
    noise(0.5, { vol: 0.4, freq: 700, q: 0.5 });
    tone(160, 0.45, { type: "sawtooth", vol: 0.07, slide: 2 });
  },
  pickup() {
    [0, 2, 4].forEach((n, i) => tone(PENTA[n] * 2, 0.18, { type: "triangle", vol: 0.15, delay: i * 0.07 }));
  },
  heal() {
    tone(523, 0.15, { vol: 0.15 });
    tone(784, 0.25, { vol: 0.15, delay: 0.1 });
  },
  step() {
    tone(660, 0.1, { type: "triangle", vol: 0.12 });
    tone(990, 0.16, { type: "triangle", vol: 0.12, delay: 0.08 });
  },
  start() {
    [0, 2, 4].forEach((n, i) => tone(PENTA[n], 0.16, { type: "square", vol: 0.07, delay: i * 0.09 }));
    tone(PENTA[5], 0.4, { type: "square", vol: 0.07, delay: 0.27 });
  },
  victory() {
    [0, 2, 3, 4, 5].forEach((n, i) => tone(PENTA[n], 0.35, { type: "triangle", vol: 0.18, delay: i * 0.14 }));
    tone(PENTA[5] * 2, 0.8, { type: "triangle", vol: 0.15, delay: 0.75 });
  },
  defeat() {
    [4, 2, 1, 0].forEach((n, i) => tone(PENTA[n] / 2, 0.4, { type: "triangle", vol: 0.15, delay: i * 0.18 }));
  },
  click() {
    tone(880, 0.05, { type: "triangle", vol: 0.08 });
  },
};
