/**
 * Escape Quest — every sound is synthesized with WebAudio (no files).
 * `setMuted` is driven by both the in-game sound toggle and GamePlayer's
 * Mute button.
 */
let ctx = null;
let muted = false;

export function setMuted(m) {
  muted = !!m;
}

function ac() {
  if (typeof window === "undefined") return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, dur, vol = 0.05, type = "sine", delay = 0, slide = 0) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur, vol = 0.04, delay = 0, hp = 800) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

const NOTE = [523, 587, 659, 698, 784, 880, 988, 1047, 1175, 1319, 1397];

export const SFX = {
  tap: () => tone(700, 0.05, 0.025, "triangle"),
  open: () => {
    noise(0.12, 0.03, 0, 1200);
    tone(330, 0.12, 0.03, "triangle", 0.02, 120);
  },
  pick: () => [784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 0.045, "sine", i * 0.06)),
  unlock: () => {
    tone(220, 0.06, 0.05, "square", 0);
    tone(440, 0.08, 0.04, "square", 0.07);
    [659, 880].forEach((f, i) => tone(f, 0.22, 0.04, "sine", 0.14 + i * 0.07));
  },
  wrong: () => {
    tone(196, 0.16, 0.05, "sawtooth", 0, -60);
    tone(147, 0.22, 0.04, "sawtooth", 0.12, -40);
  },
  combine: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 0.04, "triangle", i * 0.05)),
  clue: () => tone(988, 0.25, 0.03, "sine", 0, 200),
  hint: () => [880, 1175].forEach((f, i) => tone(f, 0.2, 0.035, "sine", i * 0.1)),
  beep: (i = 0) => tone(NOTE[i % NOTE.length], 0.16, 0.045, "sine"),
  key: () => tone(1200, 0.035, 0.02, "square"),
  turn: () => noise(0.05, 0.03, 0, 2000),
  view: () => noise(0.18, 0.02, 0, 600),
  door: () => {
    tone(140, 0.5, 0.04, "sawtooth", 0, 90);
    noise(0.4, 0.025, 0.05, 400);
  },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, 0.05, "sine", 0.25 + i * 0.11)),
};
