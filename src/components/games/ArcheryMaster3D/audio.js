/**
 * Archery Master 3D — tiny WebAudio synth: bow creak, string twang, arrow
 * whoosh, impacts, result cues and a wind bed that follows the level's wind.
 * Everything is generated; nothing is downloaded.
 */
let ctx = null;
let master = null;
let noise = null;
let windGain = null;
let windFilter = null;
let creak = null;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // looping wind bed
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  windFilter = ctx.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 400;
  windGain = ctx.createGain();
  windGain.gain.value = 0;
  src.connect(windFilter).connect(windGain).connect(master);
  src.start();
  return ctx;
}
const live = () => ctx && ctx.state === "running";

function burst(t, dur, freq, q, vol, toFreq = 0, type = "bandpass") {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random(), dur + 0.05);
}

function tone(t, freq, dur, vol, type = "triangle", toFreq = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
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
  /** Wind bed level from wind speed in m/s (0 = calm ambience). */
  setWind(speed) {
    if (!ctx) return;
    const t = ctx.currentTime;
    windGain.gain.setTargetAtTime(0.012 + Math.min(1, speed / 6) * 0.07, t, 0.6);
    windFilter.frequency.setTargetAtTime(300 + speed * 120, t, 0.6);
  },
  /** Bow creak while the string is drawn. */
  drawStart() {
    if (!live()) return;
    this.drawStop();
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 9;
    f.frequency.setValueAtTime(260, ctx.currentTime);
    f.frequency.linearRampToValueAtTime(620, ctx.currentTime + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.1);
    g.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 0.9);
    src.connect(f).connect(g).connect(master);
    src.start();
    creak = { src, g };
  },
  drawStop() {
    if (!creak || !ctx) return;
    const { src, g } = creak;
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
    src.stop(ctx.currentTime + 0.1);
    creak = null;
  },
  release(power = 1) {
    this.drawStop();
    if (!live()) return;
    const t = ctx.currentTime;
    tone(t, 110 + power * 60, 0.22, 0.28, "triangle", 70);
    tone(t, 330 + power * 90, 0.08, 0.1, "sawtooth", 160);
    burst(t, 0.35, 700, 1.2, 0.12 + power * 0.1, 2400);
  },
  /** kind: target | obstacle | ground | lost */
  impact(kind, score = 0) {
    if (!live()) return;
    const t = ctx.currentTime;
    if (kind === "target") {
      burst(t, 0.08, 900, 2, 0.45);
      tone(t, 130, 0.14, 0.4, "sine", 80);
      if (score >= 10) [988, 1319, 1568].forEach((f, i) => tone(t + 0.06 + i * 0.07, f, 0.35, 0.12));
      else if (score >= 9) [880, 1175].forEach((f, i) => tone(t + 0.06 + i * 0.07, f, 0.25, 0.09));
    } else if (kind === "obstacle") {
      burst(t, 0.06, 2600, 4, 0.35);
      tone(t, 520, 0.09, 0.12, "square", 300);
    } else if (kind === "ground") {
      burst(t, 0.12, 300, 1, 0.3);
    }
  },
  cue(kind) {
    if (!ensure() || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.02;
    const seq = {
      perfect: [1047, 1319, 1568, 2093],
      miss: [220, 175],
      win: [523, 659, 784, 1047, 784, 1047, 1319],
      lose: [392, 330, 262, 196],
      star: [1319],
      champion: [523, 659, 784, 1047, 1319, 1047, 1319, 1568, 2093],
      ui: [880],
      start: [587, 784],
    }[kind] || [660];
    const step = kind === "ui" ? 0 : kind === "win" || kind === "champion" ? 0.12 : 0.08;
    const wave = kind === "miss" || kind === "lose" ? "sawtooth" : "triangle";
    seq.forEach((f, i) => tone(t + i * step, f, kind === "ui" ? 0.06 : 0.32, kind === "miss" ? 0.07 : 0.13, wave));
    if (kind === "win" || kind === "champion" || kind === "perfect") burst(t, 1.2, 1400, 0.6, 0.08); // crowd-ish swell
  },
  dispose() {
    if (ctx) ctx.close().catch(() => {});
    ctx = master = noise = windGain = windFilter = creak = null;
  },
};
