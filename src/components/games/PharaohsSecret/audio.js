/**
 * Pharaoh's Secret — procedural WebAudio (no sound files): a low desert-wind
 * drone, stone grinds, chimes, clanks and rumbles. The context starts on the
 * first user gesture; one master gain makes mute/volume instant.
 */
let ctx = null,
  master = null,
  noiseBuf = null,
  drone = null;
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
  let b = 0;
  for (let i = 0; i < d.length; i++) {
    b = b * 0.97 + (Math.random() * 2 - 1) * 0.3; // brown-ish
    d[i] = b;
  }
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
function noise(dur, peak, f, type = "bandpass", q = 1, delay = 0, fEnd = null, attack = 0.01) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, peak, dur);
  s.connect(fl).connect(g).connect(master);
  s.start(t, Math.random());
  s.stop(t + dur + attack + 0.1);
}
const bell = (f, delay = 0, peak = 0.12) => {
  tone("sine", f, f, 1.2, peak, delay);
  tone("sine", f * 2.01, f * 2.01, 0.6, peak * 0.35, delay);
};

const SOUNDS = {
  step: () => noise(0.09, 0.05, 260 + Math.random() * 80, "lowpass", 0.7),
  pickup: () => [880, 1320, 1760].forEach((f, i) => bell(f, i * 0.06, 0.08)),
  unlock: () => {
    tone("square", 300, 200, 0.06, 0.06);
    tone("square", 520, 380, 0.08, 0.05, 0.08);
    noise(0.15, 0.08, 2400, "bandpass", 4, 0.05);
  },
  door: () => {
    noise(1.6, 0.18, 140, "lowpass", 1, 0, 70, 0.2);
    tone("sawtooth", 46, 38, 1.6, 0.05);
  },
  doorClose: () => noise(0.9, 0.16, 120, "lowpass", 1, 0, 60, 0.05),
  dial: () => {
    tone("triangle", 1400, 900, 0.05, 0.08);
    noise(0.12, 0.08, 600, "bandpass", 2);
  },
  grind: () => noise(0.45, 0.14, 300, "bandpass", 1.2, 0, 160, 0.05),
  push: () => noise(0.4, 0.2, 180, "lowpass", 1, 0, 90, 0.03),
  deny: () => {
    tone("sine", 120, 90, 0.18, 0.15);
    noise(0.1, 0.07, 400, "lowpass");
  },
  plate: () => {
    tone("sine", 90, 60, 0.25, 0.2);
    noise(0.12, 0.1, 500, "lowpass");
  },
  lever: () => {
    tone("square", 180, 120, 0.08, 0.06);
    noise(0.2, 0.1, 900, "bandpass", 2);
  },
  solve: () => [523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.11, 0.1)),
  light: () => {
    [1047, 1319, 1568].forEach((f, i) => bell(f, i * 0.05, 0.06));
    noise(0.6, 0.04, 6000, "highpass", 0.7);
  },
  flame: () => noise(0.6, 0.14, 900, "bandpass", 0.6, 0, 300, 0.05),
  fizzle: () => noise(0.7, 0.12, 3000, "highpass", 0.5, 0, 800),
  read: () => noise(0.25, 0.05, 3500, "bandpass", 1.5),
  chest: () => {
    noise(0.3, 0.1, 400, "lowpass", 1, 0, 200);
    tone("triangle", 220, 160, 0.2, 0.04);
  },
  crack: () => noise(0.25, 0.12, 1800, "bandpass", 1.5),
  collapse: () => {
    noise(0.8, 0.22, 200, "lowpass", 1, 0, 60);
    tone("sine", 70, 40, 0.6, 0.12);
  },
  death: () => {
    tone("sawtooth", 160, 40, 0.9, 0.12);
    noise(0.6, 0.2, 300, "lowpass", 1, 0, 80);
  },
  respawn: () => [392, 330].forEach((f, i) => bell(f, i * 0.12, 0.07)),
  checkpoint: () => bell(660, 0, 0.06),
  complete: () => [392, 523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.12, 0.12)),
  gameComplete: () => [262, 330, 392, 523, 659, 784, 1047, 1319].forEach((f, i) => bell(f, i * 0.14, 0.12)),
  rumble: () => {
    noise(2.5, 0.3, 90, "lowpass", 1, 0, 50, 0.3);
    tone("sine", 42, 30, 2.5, 0.15);
  },
  tick: () => tone("square", 1000, 1000, 0.03, 0.04),
};

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (!drone) {
      // two detuned low sines + filtered wind
      const g = ctx.createGain();
      g.gain.value = 0.05;
      g.connect(master);
      const o1 = ctx.createOscillator(),
        o2 = ctx.createOscillator();
      o1.frequency.value = 55;
      o2.frequency.value = 55.6;
      o1.connect(g);
      o2.connect(g);
      const w = ctx.createBufferSource();
      w.buffer = noiseBuf;
      w.loop = true;
      const wf = ctx.createBiquadFilter();
      wf.type = "bandpass";
      wf.frequency.value = 420;
      wf.Q.value = 0.6;
      const wg = ctx.createGain();
      wg.gain.value = 0.18;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lg = ctx.createGain();
      lg.gain.value = 180;
      lfo.connect(lg).connect(wf.frequency);
      w.connect(wf).connect(wg).connect(g);
      o1.start();
      o2.start();
      w.start();
      lfo.start();
      drone = { g, nodes: [o1, o2, w, lfo] };
    }
  },
  play(name) {
    if (!ctx || muted || ctx.state !== "running") return;
    try {
      SOUNDS[name]?.();
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
      drone?.nodes.forEach((n) => n.stop());
      ctx.close();
    } catch {
      /* ignore */
    }
    ctx = master = noiseBuf = drone = null;
  },
};
