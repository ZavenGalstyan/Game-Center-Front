/**
 * Space Station Escape — WebAudio synth: a low reactor hum with air-vent
 * noise, an emergency klaxon while power is out, and short UI / machine cues.
 * Everything is generated; nothing is downloaded.
 */
let ctx = null, master = null, sfx = null, amb = null, noise = null;
let muted = false;
let ambNodes = [];
let alarmTimer = 0;

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  sfx = ctx.createGain();
  sfx.connect(master);
  amb = ctx.createGain();
  amb.gain.value = 0;
  amb.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
const live = () => ctx && ctx.state === "running";
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(t, freq, dur, vol, type = "sine", glide = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  const g = ctx.createGain();
  env(g, t, 0.01, vol, dur);
  o.connect(g).connect(sfx);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function burst(t, dur, freq, q, vol, type = "bandpass", toFreq = 0) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, Math.min(0.05, dur / 3), vol, dur);
  src.connect(f).connect(g).connect(sfx);
  src.start(t, Math.random(), dur + 0.05);
}
function startAmbient() {
  if (ambNodes.length || !ctx) return;
  const t = ctx.currentTime;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 220;
  lp.connect(amb);
  for (const [f, v] of [[48, 0.12], [48.4, 0.1], [96, 0.03]]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = v;
    o.connect(g).connect(lp);
    o.start(t);
    ambNodes.push(o);
  }
  const w = ctx.createBufferSource();
  w.buffer = noise;
  w.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = "highpass";
  wf.frequency.value = 1800;
  const wg = ctx.createGain();
  wg.gain.value = 0.018;
  w.connect(wf).connect(wg).connect(amb);
  w.start(t);
  ambNodes.push(w);
}

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    startAmbient();
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
  },
  ambient(level) {
    if (amb) amb.gain.setTargetAtTime(level, ctx.currentTime, 0.6);
  },
  /** Two-tone klaxon every few seconds while `on`. */
  alarm(on) {
    clearInterval(alarmTimer);
    alarmTimer = 0;
    if (!on) return;
    alarmTimer = setInterval(() => {
      if (!live()) return;
      const t = ctx.currentTime;
      tone(t, 620, 0.35, 0.035, "square", 440);
      tone(t + 0.4, 620, 0.35, 0.035, "square", 440);
    }, 4200);
  },
  key() {
    if (live()) burst(ctx.currentTime, 0.03, 3200, 5, 0.12);
  },
  note(i) {
    if (live()) tone(ctx.currentTime, 520 + i * 70, 0.12, 0.06, "triangle");
  },
  cue(kind) {
    if (!live()) return;
    const t = ctx.currentTime + 0.01;
    switch (kind) {
      case "pickup":
        [990, 1480].forEach((f, i) => tone(t + i * 0.07, f, 0.25, 0.07, "sine"));
        break;
      case "beep":
        tone(t, 1320, 0.08, 0.06, "sine");
        tone(t + 0.1, 1760, 0.08, 0.05, "sine");
        break;
      case "granted":
        [660, 880, 1320].forEach((f, i) => tone(t + i * 0.08, f, 0.2, 0.07, "triangle"));
        burst(t + 0.2, 0.6, 900, 1, 0.12, "bandpass", 300);
        break;
      case "denied":
        tone(t, 220, 0.18, 0.08, "square");
        tone(t + 0.2, 180, 0.25, 0.08, "square");
        break;
      case "unlock":
        burst(t, 0.06, 2400, 5, 0.25);
        tone(t + 0.05, 140, 0.18, 0.12, "square", 90);
        break;
      case "solve":
        [523, 784, 1047, 1568].forEach((f, i) => tone(t + i * 0.09, f, 0.8, 0.07, "triangle"));
        break;
      case "power":
        tone(t, 60, 2.2, 0.18, "sawtooth", 240);
        burst(t, 0.4, 5000, 2, 0.15, "highpass");
        break;
      case "hiss":
        burst(t, 1.2, 4000, 0.7, 0.18, "highpass");
        break;
      case "spark":
        for (let i = 0; i < 4; i++) burst(t + i * 0.04, 0.03, 4000 + Math.random() * 3000, 4, 0.12);
        break;
      case "warn":
        tone(t, 880, 0.12, 0.06, "square");
        tone(t + 0.18, 880, 0.12, 0.06, "square");
        break;
      case "ui":
        tone(t, 1200, 0.05, 0.04, "triangle");
        break;
      case "door":
        burst(t, 0.7, 700, 1.2, 0.22, "bandpass", 250);
        tone(t, 90, 0.6, 0.08, "sawtooth", 60);
        break;
      case "launch":
        burst(t, 4, 300, 0.5, 0.4, "lowpass", 1800);
        tone(t, 40, 4, 0.25, "sawtooth", 120);
        [523, 659, 784, 1047].forEach((f, i) => tone(t + 1.5 + i * 0.2, f, 2, 0.06, "triangle"));
        break;
      case "dead":
        tone(t, 300, 1.6, 0.12, "sine", 60);
        break;
      default:
        tone(t, 880, 0.08, 0.04);
    }
  },
  dispose() {
    clearInterval(alarmTimer);
    alarmTimer = 0;
    ambNodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    });
    ambNodes = [];
    if (ctx) ctx.close().catch(() => {});
    ctx = master = sfx = amb = noise = null;
  },
};
