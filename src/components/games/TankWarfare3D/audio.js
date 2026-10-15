/**
 * Tank Warfare 3D — Web Audio synth (no sample files).
 *
 * Every voice routes through one master gain: `setMuted` (driven by the
 * GamePlayer Mute button) silences the engine, tracks, turret servo, guns,
 * explosions, alarms and stingers at once. The AudioContext is created on the
 * first user gesture (`unlock`) and closed by `dispose` on unmount.
 *
 * Loops (engine, tracks, turret) are steered every frame by `step()`; one-shots
 * take a distance so far-away fights sound muffled and quiet.
 */
let ctx = null;
let master = null;
let noise = null;
let muted = false;
let volume = 0.8;
let loops = null;
let critT = 0;
const BASE = 0.6;

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function osc(freq, dur, { type = "sine", vol = 0.2, to = null, at = 0, attack = 0.005, lp = null } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, attack, vol, dur);
  let n = o;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    n = o.connect(f);
  }
  n.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function hiss(dur, { freq = 900, to = null, q = 1, vol = 0.2, type = "bandpass", at = 0, attack = 0.004, rate = 1 } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}
/** Distance attenuation (0..1) and a muffle cutoff. */
const att = (d) => Math.max(0, Math.min(1, 1 / (1 + (d || 0) / 45)));
const muffle = (d) => Math.max(500, 9000 - (d || 0) * 32);

function buildLoops() {
  const mk = (type) => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(master);
    return g;
  };
  // engine: two detuned low oscillators + filtered noise, amplitude "chug" from an LFO
  const eng = mk();
  const engF = ctx.createBiquadFilter();
  engF.type = "lowpass";
  engF.frequency.value = 380;
  engF.Q.value = 2;
  const chug = ctx.createGain();
  chug.gain.value = 0.6;
  engF.connect(chug).connect(eng);
  const o1 = ctx.createOscillator();
  o1.type = "sawtooth";
  o1.frequency.value = 38;
  const o2 = ctx.createOscillator();
  o2.type = "square";
  o2.frequency.value = 57;
  const g2 = ctx.createGain();
  g2.gain.value = 0.35;
  o1.connect(engF);
  o2.connect(g2).connect(engF);
  const en = ctx.createBufferSource();
  en.buffer = noise;
  en.loop = true;
  const enF = ctx.createBiquadFilter();
  enF.type = "lowpass";
  enF.frequency.value = 220;
  const enG = ctx.createGain();
  enG.gain.value = 0.6;
  en.connect(enF).connect(enG).connect(engF);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 9;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.35;
  lfo.connect(lfoG).connect(chug.gain);
  // tracks: rattling metal — band-passed noise gated by a clank LFO
  const trk = mk();
  const tn = ctx.createBufferSource();
  tn.buffer = noise;
  tn.loop = true;
  const tF = ctx.createBiquadFilter();
  tF.type = "bandpass";
  tF.frequency.value = 1500;
  tF.Q.value = 1.4;
  const tGate = ctx.createGain();
  tGate.gain.value = 0.5;
  tn.connect(tF).connect(tGate).connect(trk);
  const tl = ctx.createOscillator();
  tl.type = "square";
  tl.frequency.value = 6;
  const tlG = ctx.createGain();
  tlG.gain.value = 0.45;
  tl.connect(tlG).connect(tGate.gain);
  // turret servo whine
  const tur = mk();
  const so = ctx.createOscillator();
  so.type = "triangle";
  so.frequency.value = 300;
  const sF = ctx.createBiquadFilter();
  sF.type = "bandpass";
  sF.frequency.value = 700;
  sF.Q.value = 3;
  so.connect(sF).connect(tur);
  for (const n of [o1, o2, en, lfo, tn, tl, so]) n.start();
  return { eng, engF, o1, o2, lfo, trk, tF, tl, tur, so, nodes: [o1, o2, en, lfo, tn, tl, so] };
}

export const audio = {
  unlock() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return;
    }
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try {
      ctx = new AC();
    } catch {
      ctx = null;
      return;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : BASE * volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    loops = buildLoops();
  },
  setMuted(m) {
    muted = !!m;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : BASE * volume, ctx.currentTime, 0.02);
  },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master && ctx && !muted) master.gain.setTargetAtTime(BASE * volume, ctx.currentTime, 0.05);
  },
  get muted() {
    return muted;
  },
  /** Per-frame steering of the looping voices. */
  step({ active = false, throttle = 0, speed = 0, maxSpeed = 13, boost = false, turret = 0, crit = false, dt = 0.016 } = {}) {
    if (!ctx || !loops) return;
    const t = ctx.currentTime;
    const L = loops;
    const sp = Math.min(1.4, Math.abs(speed) / Math.max(1, maxSpeed));
    const rpm = active ? 0.25 + Math.abs(throttle) * 0.5 + sp * 0.4 + (boost ? 0.25 : 0) : 0;
    L.eng.gain.setTargetAtTime(active ? 0.13 + rpm * 0.16 : 0, t, 0.12);
    L.o1.frequency.setTargetAtTime(32 + rpm * 34, t, 0.15);
    L.o2.frequency.setTargetAtTime(48 + rpm * 52, t, 0.15);
    L.engF.frequency.setTargetAtTime(260 + rpm * 520, t, 0.15);
    L.lfo.frequency.setTargetAtTime(7 + rpm * 16, t, 0.2);
    L.trk.gain.setTargetAtTime(active ? sp * 0.14 : 0, t, 0.1);
    L.tl.frequency.setTargetAtTime(3 + sp * 16, t, 0.1);
    L.tF.frequency.setTargetAtTime(1100 + sp * 900, t, 0.2);
    L.tur.gain.setTargetAtTime(active ? Math.min(1, turret) * 0.05 : 0, t, 0.05);
    L.so.frequency.setTargetAtTime(260 + Math.min(1, turret) * 160, t, 0.08);
    // critical-damage alarm
    if (crit && active) {
      critT -= dt;
      if (critT <= 0) {
        critT = 0.85;
        osc(880, 0.12, { type: "square", vol: 0.06 });
        osc(660, 0.12, { type: "square", vol: 0.06, at: 0.16 });
      }
    } else critT = 0;
  },
  /** Silence the loops (menus, results). */
  silence() {
    if (!ctx || !loops) return;
    const t = ctx.currentTime;
    for (const g of [loops.eng, loops.trk, loops.tur]) g.gain.setTargetAtTime(0, t, 0.08);
  },
  cannon(dist = 0, big = 1) {
    const a = att(dist);
    const lp = muffle(dist);
    hiss(1.3 * big, { freq: lp, to: 120, type: "lowpass", q: 0.7, vol: 0.9 * a * big, attack: 0.002 });
    osc(70, 0.7, { type: "sine", vol: 0.7 * a * big, to: 28 });
    osc(130, 0.25, { type: "triangle", vol: 0.25 * a, to: 50 });
    if (dist < 30) hiss(0.12, { freq: 3200, type: "highpass", vol: 0.35 * a });
    if (dist < 25) hiss(0.5, { freq: 800, to: 300, type: "bandpass", q: 2, vol: 0.12, at: 0.15 }); // casing clank
  },
  explosion(dist = 0, big = 1) {
    const a = att(dist * 0.8);
    hiss(1.8 * big, { freq: muffle(dist) * 0.6, to: 90, type: "lowpass", vol: 0.85 * a * big, attack: 0.005 });
    osc(55, 1.1, { type: "sine", vol: 0.65 * a * big, to: 22 });
    hiss(0.9, { freq: 2400, to: 400, type: "bandpass", q: 0.8, vol: 0.18 * a, at: 0.05 });
  },
  impact(kind, dist = 0) {
    const a = att(dist);
    if (kind === "tank") {
      osc(880, 0.35, { type: "triangle", vol: 0.25 * a, to: 620 });
      osc(1320, 0.25, { type: "sine", vol: 0.12 * a, to: 900 });
      hiss(0.25, { freq: 2600, type: "bandpass", q: 1.5, vol: 0.35 * a });
    } else if (kind === "water") {
      hiss(0.6, { freq: 1500, to: 500, type: "bandpass", vol: 0.3 * a });
    } else {
      hiss(0.45, { freq: muffle(dist) * 0.25, to: 120, type: "lowpass", vol: 0.45 * a });
      osc(90, 0.3, { type: "sine", vol: 0.25 * a, to: 40 });
    }
  },
  ricochet(dist = 0) {
    const a = att(dist);
    osc(2400, 0.45, { type: "sine", vol: 0.14 * a, to: 800 });
    hiss(0.1, { freq: 3000, type: "highpass", vol: 0.2 * a });
  },
  hitConfirm() {
    osc(1500, 0.06, { type: "square", vol: 0.05 });
    osc(2100, 0.08, { type: "square", vol: 0.04, at: 0.05 });
  },
  playerHit(dmg = 10) {
    const k = Math.min(1, dmg / 20);
    hiss(0.5, { freq: 700, to: 200, type: "lowpass", vol: 0.5 + k * 0.3 });
    osc(500, 0.4, { type: "triangle", vol: 0.25, to: 260 });
    osc(60, 0.4, { type: "sine", vol: 0.5, to: 30 });
  },
  reloaded() {
    hiss(0.05, { freq: 2500, type: "bandpass", q: 3, vol: 0.22 });
    hiss(0.07, { freq: 1200, type: "bandpass", q: 3, vol: 0.2, at: 0.09 });
    osc(320, 0.06, { type: "square", vol: 0.04, at: 0.09 });
  },
  ammoSwitch() {
    hiss(0.08, { freq: 1800, type: "bandpass", q: 2, vol: 0.18 });
    osc(500, 0.05, { type: "square", vol: 0.03 });
  },
  empty() {
    osc(220, 0.12, { type: "square", vol: 0.07 });
    osc(160, 0.15, { type: "square", vol: 0.07, at: 0.12 });
  },
  repair() {
    for (let i = 0; i < 5; i++) hiss(0.06, { freq: 2200 + i * 200, type: "bandpass", q: 4, vol: 0.12, at: i * 0.09 });
    osc(660, 0.18, { vol: 0.08, at: 0.45 });
    osc(990, 0.25, { vol: 0.08, at: 0.58 });
  },
  smoke() {
    hiss(0.9, { freq: 900, to: 300, type: "lowpass", vol: 0.35 });
  },
  destruct(dist = 0) {
    const a = att(dist);
    hiss(0.5, { freq: 900, to: 200, type: "bandpass", vol: 0.35 * a });
    osc(140, 0.2, { type: "triangle", vol: 0.15 * a, to: 60 });
  },
  crash() {
    hiss(0.4, { freq: 500, to: 150, type: "lowpass", vol: 0.5 });
    osc(110, 0.3, { type: "triangle", vol: 0.2, to: 50 });
  },
  warn() {
    osc(1040, 0.14, { type: "square", vol: 0.07 });
    osc(780, 0.14, { type: "square", vol: 0.07, at: 0.18 });
    osc(1040, 0.14, { type: "square", vol: 0.07, at: 0.36 });
  },
  objective() {
    [523, 659, 784].forEach((f, i) => osc(f, 0.22, { type: "triangle", vol: 0.1, at: i * 0.09 }));
  },
  stage() {
    osc(392, 0.2, { type: "triangle", vol: 0.08 });
    osc(523, 0.3, { type: "triangle", vol: 0.08, at: 0.12 });
  },
  victory() {
    [392, 523, 659, 784, 1047].forEach((f, i) => osc(f, 0.5, { type: "triangle", vol: 0.12, at: i * 0.13 }));
    osc(262, 1.2, { type: "sine", vol: 0.12, at: 0.5 });
  },
  defeat() {
    [392, 349, 311, 262].forEach((f, i) => osc(f, 0.5, { type: "sawtooth", vol: 0.07, at: i * 0.2, lp: 1200 }));
    osc(65, 1.6, { type: "sine", vol: 0.2, at: 0.4, to: 40 });
  },
  ui() {
    osc(700, 0.05, { type: "square", vol: 0.04 });
  },
  dispose() {
    if (loops) for (const n of loops.nodes) try { n.stop(); } catch { /* already stopped */ }
    loops = null;
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    master = null;
    noise = null;
  },
};
