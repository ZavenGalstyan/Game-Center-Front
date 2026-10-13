/**
 * Swimming Champions — tiny Web Audio synth (no sample files).
 * `setMuted` follows the GamePlayer Mute button; the context is created on
 * the first user gesture (`unlock`) so browsers don't block it. A quiet
 * filtered-noise crowd bed swells at the finish.
 */
let ctx = null;
let master = null;
let noise = null;
let crowd = null;
let muted = false;
const VOLUME = 0.5;

function tone(freq, dur, { type = "sine", vol = 0.3, to = null, at = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hiss(dur, { freq = 900, to = null, q = 1, vol = 0.3, type = "bandpass", at = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
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
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.02);
  },
  /** Crowd ambience level 0..1 (looped noise, created lazily). */
  crowd(level) {
    if (!ctx) return;
    if (!crowd) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 700;
      f.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      crowd = { src, g };
    }
    crowd.g.gain.setTargetAtTime(level * 0.07, ctx.currentTime, 0.4);
  },
  ui() {
    tone(660, 0.07, { type: "triangle", vol: 0.12 });
  },
  beep(n) {
    tone(n > 0 ? 880 : 1320, n > 0 ? 0.16 : 0.5, { type: "square", vol: 0.1 });
  },
  /** Electronic start signal. */
  start() {
    tone(988, 0.55, { type: "sawtooth", vol: 0.12 });
    tone(1976, 0.55, { type: "sine", vol: 0.08 });
  },
  stroke(q = 1) {
    hiss(0.16, { freq: 1100 + q * 500, to: 500, q: 1.2, vol: 0.13 + q * 0.06 });
  },
  splash(power = 1) {
    hiss(0.25 + power * 0.35, { freq: 2200, to: 300, q: 0.7, vol: 0.18 + power * 0.22, type: "lowpass" });
    hiss(0.2, { freq: 3800, q: 2, vol: 0.06 * power, at: 0.03 });
  },
  turn(q = 1) {
    hiss(0.45, { freq: 300, to: 1600, q: 1.5, vol: 0.18 });
    tone(220 + q * 220, 0.18, { type: "triangle", vol: 0.08, to: 440 + q * 330, at: 0.12 });
  },
  bad() {
    tone(180, 0.14, { type: "square", vol: 0.05 });
  },
  victory() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.32, { type: "triangle", vol: 0.16, at: i * 0.12 }));
    tone(1319, 0.7, { type: "sine", vol: 0.12, at: 0.5 });
  },
  finish(place) {
    if (place === 1) return this.victory();
    const base = place <= 3 ? 523 : 392;
    [base, base * 1.25, base * 1.5].forEach((f, i) => tone(f, 0.25, { type: "triangle", vol: 0.12, at: i * 0.11 }));
  },
  dispose() {
    try {
      crowd?.src.stop();
    } catch {
      /* already stopped */
    }
    crowd = null;
    ctx?.close().catch(() => {});
    ctx = null;
    master = null;
  },
};
