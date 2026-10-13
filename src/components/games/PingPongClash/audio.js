/**
 * Ping Pong Clash — tiny Web Audio synth (no sample files).
 * `setMuted` follows the GamePlayer Mute button; the context is created on
 * the first user gesture (`unlock`) so browsers don't block it.
 */
let ctx = null;
let master = null;
let noise = null;
let muted = false;
const VOLUME = 0.55;

function tone(freq, dur, { type = "sine", vol = 0.3, to = null, at = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function click(freq, dur, vol) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 2.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
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
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.02);
  },
  hit(power = 0.5) {
    click(2600, 0.05, 0.7);
    tone(1150 + power * 300, 0.07, { type: "triangle", vol: 0.28 });
  },
  bounce() {
    click(1800, 0.035, 0.4);
    tone(820, 0.05, { type: "sine", vol: 0.2 });
  },
  net() {
    click(500, 0.12, 0.6);
    tone(180, 0.15, { type: "sine", vol: 0.25, to: 90 });
  },
  point(mine) {
    if (mine) {
      tone(660, 0.12, { type: "triangle", vol: 0.22 });
      tone(990, 0.2, { type: "triangle", vol: 0.22, at: 0.09 });
    } else {
      tone(392, 0.14, { type: "triangle", vol: 0.2 });
      tone(294, 0.22, { type: "triangle", vol: 0.2, at: 0.1 });
    }
  },
  end(won) {
    const notes = won ? [523, 659, 784, 1046] : [392, 349, 294, 247];
    notes.forEach((f, i) => tone(f, 0.25, { type: "triangle", vol: 0.22, at: i * 0.12 }));
  },
  ui() {
    tone(880, 0.05, { type: "sine", vol: 0.12 });
  },
  dispose() {
    if (ctx) ctx.close().catch(() => {});
    ctx = master = noise = null;
  },
};
