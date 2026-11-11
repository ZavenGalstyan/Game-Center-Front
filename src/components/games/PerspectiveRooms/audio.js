/**
 * Perspective: Impossible Rooms — procedural WebAudio (no sound files): a soft
 * airy pad, glassy chimes, a resize shimmer and deep thuds that scale with an
 * object's size. The context starts on the first user gesture; one master
 * gain makes mute/volume instant.
 */
let ctx = null,
  master = null,
  noiseBuf = null,
  pad = null;
let muted = false,
  volume = 0.8;

function ensure() {
  if (ctx) return true;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return false;
  try {
    ctx = new AC();
  } catch {
    return false;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
}
function tone(type, f0, f1, dur, peak, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, Math.min(0.02, dur / 4), peak, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.1);
}
function noise(dur, peak, f, type = "bandpass", q = 1, delay = 0, fEnd = null) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.01, peak, dur);
  s.connect(fl).connect(g).connect(master);
  s.start(t, Math.random());
  s.stop(t + dur + 0.1);
}
const chime = (f, delay = 0, peak = 0.08) => {
  tone("sine", f, f, 1.1, peak, delay);
  tone("sine", f * 2.76, f * 2.76, 0.4, peak * 0.25, delay);
};

const SOUNDS = {
  step: () => noise(0.06, 0.035, 1800 + Math.random() * 400, "bandpass", 1.2),
  jump: () => tone("sine", 300, 420, 0.12, 0.04),
  land: () => noise(0.12, 0.07, 300, "lowpass", 0.8),
  grab: () => {
    tone("sine", 520, 880, 0.14, 0.07);
    tone("triangle", 1320, 1320, 0.18, 0.025, 0.05);
  },
  drop: (w = 1) => {
    const f = Math.max(60, 420 / Math.sqrt(Math.max(0.2, w)));
    tone("sine", f, f * 0.6, 0.22 + Math.min(0.6, w * 0.08), 0.12);
    noise(0.12, 0.05, f * 4, "lowpass");
  },
  thud: (w = 1) => {
    const f = Math.max(40, 260 / Math.sqrt(Math.max(0.2, w)));
    tone("sine", f, f * 0.5, 0.3 + Math.min(0.8, w * 0.1), Math.min(0.22, 0.08 + w * 0.03));
    noise(0.25, Math.min(0.16, 0.05 + w * 0.02), 400, "lowpass", 0.7, 0, 90);
  },
  wheel: () => tone("triangle", 1500 + Math.random() * 300, 1500, 0.04, 0.02),
  rotate: () => {
    tone("triangle", 700, 980, 0.09, 0.05);
    noise(0.08, 0.03, 3000, "bandpass", 3);
  },
  deny: () => {
    tone("square", 180, 140, 0.12, 0.04);
    tone("square", 150, 110, 0.14, 0.035, 0.1);
  },
  plateOn: () => {
    tone("sine", 220, 330, 0.18, 0.1);
    chime(660, 0.05, 0.05);
  },
  plateOff: () => tone("sine", 330, 200, 0.2, 0.08),
  door: () => {
    noise(1.1, 0.06, 900, "bandpass", 0.8, 0, 300);
    [392, 523].forEach((f, i) => chime(f, i * 0.12, 0.05));
  },
  doorClose: () => noise(0.7, 0.06, 500, "lowpass", 0.8, 0, 200),
  jam: () => {
    tone("sine", 140, 120, 0.4, 0.1);
    noise(0.2, 0.08, 800, "bandpass", 2);
  },
  aligned: () => {
    [523, 659, 784, 988, 1175].forEach((f, i) => chime(f, i * 0.07, 0.07));
    noise(1.2, 0.03, 7000, "highpass", 0.6);
  },
  exitOpen: () => [784, 988, 1175].forEach((f, i) => chime(f, i * 0.1, 0.06)),
  fall: () => tone("sine", 600, 120, 0.6, 0.08),
  objReturn: () => [880, 660].forEach((f, i) => chime(f, i * 0.08, 0.05)),
  complete: () => [523, 659, 784, 1047, 1319].forEach((f, i) => chime(f, i * 0.1, 0.1)),
  gameComplete: () => [262, 392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => chime(f, i * 0.13, 0.1)),
  click: () => tone("triangle", 900, 900, 0.03, 0.03),
};

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (!pad) {
      // a slow, airy chord: four sines with a gently moving filter
      const g = ctx.createGain();
      g.gain.value = 0.028;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.connect(g).connect(master);
      const nodes = [];
      for (const f of [130.8, 196, 261.6, 329.6]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 8;
        o.connect(lp);
        o.start();
        nodes.push(o);
      }
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05;
      const lg = ctx.createGain();
      lg.gain.value = 400;
      lfo.connect(lg).connect(lp.frequency);
      lfo.start();
      nodes.push(lfo);
      pad = { g, nodes };
    }
  },
  play(name, arg) {
    if (!ctx || muted || ctx.state !== "running") return;
    try {
      SOUNDS[name]?.(arg);
    } catch {
      /* ignore */
    }
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
  },
  setVolume(v) {
    volume = v;
    if (master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
  },
  dispose() {
    if (!ctx) return;
    try {
      pad?.nodes.forEach((n) => n.stop());
      ctx.close();
    } catch {
      /* ignore */
    }
    ctx = master = noiseBuf = pad = null;
  },
};
