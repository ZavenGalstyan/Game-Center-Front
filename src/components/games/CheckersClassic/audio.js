/** Checkers Classic — tiny Web Audio synth; follows the GamePlayer Mute button. */
let ctx = null, master = null, noise = null, muted = false;
const VOLUME = 0.5;

function knock(freq, dur, vol, at = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(freq, dur, vol, at = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const audio = {
  unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.02);
  },
  move() { knock(900, 0.07, 0.7); tone(240, 0.06, 0.1); },
  capture() { knock(520, 0.12, 0.9); tone(170, 0.14, 0.18); tone(130, 0.18, 0.12, 0.05); },
  promote() { [659, 880, 1175].forEach((f, i) => tone(f, 0.22, 0.14, 0.08 + i * 0.08)); },
  warn() { tone(180, 0.09, 0.08); },
  end(kind) {
    const notes = kind === "win" ? [523, 659, 784, 1046] : kind === "lose" ? [392, 349, 294, 247] : [440, 494, 440];
    notes.forEach((f, i) => tone(f, 0.32, 0.2, i * 0.14));
  },
  dispose() {
    if (ctx) ctx.close().catch(() => {});
    ctx = master = noise = null;
  },
};
