/**
 * Bowling Master 3D — tiny WebAudio synth: lane rumble, pin clatter, cues.
 * Everything is generated; nothing is downloaded.
 */
let ctx = null;
let master = null;
let noise = null;
let roll = null;
let muted = false;
let lastHit = 0;

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

function burst(t, dur, freq, q, vol, type = "bandpass") {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

function tone(t, freq, dur, vol, type = "sine") {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
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
  /** speed 0 stops the rumble; gutter changes its colour. */
  roll(speed, gutter = false) {
    if (!ctx || ctx.state !== "running") return;
    if (!roll && speed > 0) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      roll = { src, f, g };
    }
    if (!roll) return;
    const t = ctx.currentTime;
    roll.f.frequency.setTargetAtTime(gutter ? 520 : 170 + speed * 22, t, 0.05);
    roll.g.gain.setTargetAtTime(speed > 0 ? Math.min(0.55, 0.08 + speed * 0.05) : 0, t, 0.08);
    if (speed <= 0) {
      const r = roll;
      roll = null;
      setTimeout(() => {
        try { r.src.stop(); } catch { /* already stopped */ }
      }, 400);
    }
  },
  hit(v, ball) {
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    if (t - lastHit < 0.02) return;
    lastHit = t;
    const vol = Math.min(0.9, 0.12 + v * 0.07) * (ball ? 1.2 : 0.8);
    burst(t, 0.09 + Math.random() * 0.06, 2200 + Math.random() * 1800, 2.5, vol);
    burst(t, 0.22, 500 + Math.random() * 300, 1.2, vol * 0.6);
    tone(t, 700 + Math.random() * 500, 0.08, vol * 0.25, "triangle");
  },
  cue(kind) {
    if (!ensure() || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.02;
    const seq = { strike: [523, 659, 784, 1047, 1319], spare: [587, 784, 988], gutter: [196, 147], over: [392, 494, 587, 784], ui: [880] }[kind] || [660];
    const step = kind === "ui" ? 0 : 0.09;
    seq.forEach((f, i) => tone(t + i * step, f, kind === "ui" ? 0.07 : 0.35, kind === "gutter" ? 0.18 : 0.14, kind === "gutter" ? "sawtooth" : "triangle"));
  },
  dispose() {
    if (roll) {
      try { roll.src.stop(); } catch { /* ignore */ }
      roll = null;
    }
    if (ctx) ctx.close().catch(() => {});
    ctx = master = noise = null;
  },
};
