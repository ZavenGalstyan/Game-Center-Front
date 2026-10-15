/**
 * Throw Masters — tiny Web Audio synth (no sample files). The context is
 * created on the first user gesture (`unlock`), so nothing plays before the
 * player interacts; `setMuted` follows the GamePlayer Mute button and gates
 * every sound through one master gain.
 */
let ctx = null;
let master = null;
let noise = null;
let muted = false;
const VOLUME = 0.5;

function tone(freq, dur, { type = "sine", vol = 0.3, to = null, at = 0, attack = 0.004 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function hiss(dur, { freq = 1200, to = null, q = 1.2, vol = 0.4, type = "bandpass", at = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.03);
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
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.02);
  },
  get muted() {
    return muted;
  },
  ui() {
    tone(760, 0.06, { type: "triangle", vol: 0.14 });
    tone(1140, 0.05, { type: "sine", vol: 0.08, at: 0.03 });
  },
  charge(p) {
    tone(260 + p * 640, 0.05, { type: "triangle", vol: 0.05 + p * 0.05 });
  },
  throw(weapon, power = 0.6) {
    if (weapon === "arrow") {
      tone(190, 0.18, { type: "triangle", vol: 0.25, to: 120 });
      hiss(0.18, { freq: 3000, to: 1200, vol: 0.18 });
      return;
    }
    if (weapon === "fireball") {
      hiss(0.45, { freq: 500, to: 1500, q: 0.7, vol: 0.4 });
      tone(120, 0.3, { type: "sawtooth", vol: 0.06, to: 220 });
      return;
    }
    if (weapon === "crystal") {
      [1320, 1760, 2093].forEach((f, i) => tone(f, 0.25, { type: "sine", vol: 0.08, at: i * 0.04 }));
    }
    hiss(0.22 + power * 0.1, { freq: 1800 + power * 1200, to: 500, q: 0.9, vol: 0.3 + power * 0.15 });
  },
  whoosh(weapon) {
    if (weapon === "fireball") hiss(0.2, { freq: 700, q: 0.6, vol: 0.12 });
    else hiss(0.14, { freq: 1300, to: 700, q: 1.6, vol: 0.09 });
  },
  impact(kind, weapon) {
    if (weapon === "hammer") {
      tone(110, 0.35, { type: "sine", vol: 0.5, to: 45 });
      hiss(0.25, { freq: 400, type: "lowpass", vol: 0.5 });
      return;
    }
    if (kind === "obstacle") {
      tone(620, 0.12, { type: "square", vol: 0.06, to: 400 });
      hiss(0.08, { freq: 2600, q: 3, vol: 0.25 });
    }
    tone(210, 0.12, { type: "sine", vol: 0.3, to: 90 });
    hiss(0.1, { freq: 900, q: 1, vol: 0.3 });
  },
  burst(weapon) {
    if (weapon === "fireball") {
      hiss(0.5, { freq: 900, to: 200, q: 0.5, vol: 0.5 });
      tone(160, 0.3, { type: "sine", vol: 0.3, to: 60 });
    } else {
      [2637, 2093, 1568, 2349].forEach((f, i) => tone(f, 0.3, { type: "sine", vol: 0.09, at: i * 0.035 }));
      hiss(0.25, { freq: 5000, q: 2, vol: 0.18 });
    }
  },
  explode() {
    hiss(0.9, { freq: 1200, to: 80, type: "lowpass", q: 0.4, vol: 0.9 });
    tone(90, 0.7, { type: "sine", vol: 0.6, to: 30 });
    tone(60, 0.9, { type: "triangle", vol: 0.3, to: 25, at: 0.04 });
  },
  hit(zone) {
    tone(520, 0.16, { type: "square", vol: 0.08, to: 230 });
    tone(150, 0.14, { type: "sine", vol: 0.4, to: 70 });
    hiss(0.08, { freq: 1500, q: 1, vol: 0.3 });
    if (zone === "head") {
      tone(1568, 0.25, { type: "sine", vol: 0.18, at: 0.05 });
      tone(2093, 0.3, { type: "sine", vol: 0.14, at: 0.1 });
    }
  },
  bounce() {
    tone(180, 0.16, { type: "sine", vol: 0.3, to: 360 });
  },
  ricochet() {
    tone(2400, 0.18, { type: "sine", vol: 0.15, to: 1500 });
  },
  catch() {
    tone(880, 0.08, { type: "triangle", vol: 0.15 });
    tone(1320, 0.12, { type: "triangle", vol: 0.12, at: 0.06 });
  },
  target(bull) {
    tone(bull ? 1320 : 990, 0.12, { type: "triangle", vol: 0.2 });
    tone(bull ? 1760 : 1320, 0.2, { type: "triangle", vol: 0.18, at: 0.08 });
    hiss(0.1, { freq: 3000, q: 1, vol: 0.2 });
  },
  turn(mine) {
    tone(mine ? 660 : 520, 0.12, { type: "sine", vol: 0.12 });
    tone(mine ? 990 : 440, 0.16, { type: "sine", vol: 0.1, at: 0.08 });
  },
  victory() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i > 3 ? 0.4 : 0.18, { type: "triangle", vol: 0.2, at: i * 0.12 }));
  },
  defeat() {
    [440, 392, 349, 262].forEach((f, i) => tone(f, 0.3, { type: "triangle", vol: 0.18, at: i * 0.18 }));
    tone(130, 0.6, { type: "sine", vol: 0.15, at: 0.7, to: 90 });
  },
  coin() {
    tone(1568, 0.08, { type: "square", vol: 0.06 });
    tone(2093, 0.25, { type: "square", vol: 0.06, at: 0.07 });
  },
  dispose() {
    if (ctx) ctx.close().catch(() => {});
    ctx = master = noise = null;
  },
};
