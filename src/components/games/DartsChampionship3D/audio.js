/**
 * Darts Championship 3D — tiny WebAudio synth: throw whoosh, board thud,
 * result cues. Everything is generated; nothing is downloaded.
 */
let ctx = null;
let master = null;
let noise = null;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
const live = () => ctx && ctx.state === "running";

function burst(t, dur, freq, q, vol, toFreq = 0) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(freq, t);
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.4, dur + 0.05);
}

function tone(t, freq, dur, vol, type = "triangle") {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const audio = {
  unlock() {
    if (ensure() && ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.03);
  },
  whoosh() {
    if (!live()) return;
    burst(ctx.currentTime, 0.28, 900, 1.4, 0.22, 3200);
  },
  /** Dart into sisal (board) or a duller knock off the board. */
  thud(onBoard = true) {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(t, 0.07, onBoard ? 1800 : 700, 3, 0.5);
    tone(t, onBoard ? 150 : 95, 0.12, 0.35, "sine");
  },
  cue(kind) {
    if (!ensure() || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.02;
    const seq = {
      double: [660, 880],
      treble: [660, 880, 1100],
      bull: [784, 988, 1175, 1568],
      bust: [220, 165, 123],
      win: [523, 659, 784, 1047, 784, 1047, 1319],
      lose: [392, 330, 262],
      max: [523, 659, 784, 1047, 1319, 1568],
      ui: [880],
      turn: [587],
    }[kind] || [660];
    const step = kind === "ui" || kind === "turn" ? 0 : kind === "win" || kind === "max" ? 0.11 : 0.08;
    const wave = kind === "bust" || kind === "lose" ? "sawtooth" : "triangle";
    seq.forEach((f, i) => tone(t + i * step, f, kind === "ui" ? 0.06 : 0.3, kind === "bust" ? 0.12 : 0.14, wave));
    if (kind === "max" || kind === "win") burst(t, 1.4, 1200, 0.5, 0.12); // crowd-ish swell
  },
  dispose() {
    if (ctx) ctx.close().catch(() => {});
    ctx = master = noise = null;
  },
};
