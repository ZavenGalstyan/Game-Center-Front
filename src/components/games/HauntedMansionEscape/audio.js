/**
 * Haunted Mansion Escape — WebAudio synth. A low ambient drone with wind, the
 * piano (real pitches, so the lullaby actually sounds like one) and short cues.
 * Everything is generated; nothing is downloaded.
 */
let ctx = null, master = null, sfx = null, amb = null, noise = null;
let muted = false;
let ambNodes = [];

const FREQ = { C: 261.63, "C#": 277.18, D: 293.66, "D#": 311.13, E: 329.63, F: 349.23, "F#": 369.99, G: 392.0, "G#": 415.3, A: 440.0, "A#": 466.16, B: 493.88, C2: 523.25 };

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.85;
  master.connect(ctx.destination);
  sfx = ctx.createGain();
  sfx.gain.value = 0.9;
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
function tone(t, freq, dur, vol, type = "sine", dest = sfx, glide = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  const g = ctx.createGain();
  env(g, t, 0.01, vol, dur);
  o.connect(g).connect(dest);
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
  env(g, t, Math.min(0.04, dur / 3), vol, dur);
  src.connect(f).connect(g).connect(sfx);
  src.start(t, Math.random(), dur + 0.05);
}

function startAmbient() {
  if (ambNodes.length || !ctx) return;
  const t = ctx.currentTime;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 320;
  lp.connect(amb);
  for (const [f, v] of [[55, 0.09], [55.6, 0.08], [82.4, 0.04], [110.3, 0.02]]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = v;
    o.connect(g).connect(lp);
    o.start(t);
    ambNodes.push(o);
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lg = ctx.createGain();
  lg.gain.value = 140;
  lfo.connect(lg).connect(lp.frequency);
  lfo.start(t);
  ambNodes.push(lfo);
  // wind
  const w = ctx.createBufferSource();
  w.buffer = noise;
  w.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = "bandpass";
  wf.frequency.value = 420;
  wf.Q.value = 0.8;
  const wg = ctx.createGain();
  wg.gain.value = 0.05;
  const wl = ctx.createOscillator();
  wl.frequency.value = 0.05;
  const wlg = ctx.createGain();
  wlg.gain.value = 260;
  wl.connect(wlg).connect(wf.frequency);
  w.connect(wf).connect(wg).connect(amb);
  w.start(t);
  wl.start(t);
  ambNodes.push(w, wl);
}

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    startAmbient();
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05);
  },
  ambient(level) {
    if (amb) amb.gain.setTargetAtTime(level, ctx.currentTime, 0.8);
  },
  note(name) {
    if (!live()) return;
    const f = FREQ[name];
    if (!f) return;
    const t = ctx.currentTime;
    tone(t, f, 1.6, 0.22, "triangle");
    tone(t, f * 2, 0.9, 0.06, "sine");
    tone(t, f * 3, 0.4, 0.025, "sine");
    burst(t, 0.03, 2400, 1, 0.03);
  },
  cue(kind) {
    if (!live()) return;
    const t = ctx.currentTime + 0.01;
    switch (kind) {
      case "pickup":
        [880, 1318, 1760].forEach((f, i) => tone(t + i * 0.06, f, 0.5, 0.08, "sine"));
        break;
      case "unlock":
        burst(t, 0.06, 1800, 4, 0.35);
        burst(t + 0.12, 0.09, 900, 3, 0.4);
        tone(t + 0.12, 120, 0.2, 0.2, "square", sfx, 70);
        break;
      case "locked":
        for (let i = 0; i < 3; i++) burst(t + i * 0.07, 0.05, 600 + i * 120, 5, 0.3);
        break;
      case "wrong":
        tone(t, 155, 0.35, 0.12, "sawtooth", sfx, 110);
        tone(t, 160, 0.35, 0.08, "square", sfx, 112);
        break;
      case "solve":
        [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.1, f, 1.2, 0.09, "triangle"));
        burst(t + 0.3, 1.2, 3000, 0.6, 0.05, "highpass");
        break;
      case "page":
        burst(t, 0.25, 2600, 0.8, 0.12, "bandpass", 1200);
        break;
      case "reveal":
        [660, 990, 1320, 1980].forEach((f, i) => tone(t + i * 0.08, f, 1.4, 0.05, "sine"));
        break;
      case "click":
        burst(t, 0.03, 3000, 6, 0.18);
        break;
      case "tick":
        burst(t, 0.02, 4200, 8, 0.15);
        break;
      case "ui":
        tone(t, 740, 0.08, 0.05, "triangle");
        break;
      case "door":
        tone(t, 90, 1.2, 0.15, "sawtooth", sfx, 140);
        burst(t, 1.0, 500, 2, 0.12, "bandpass", 900);
        break;
      case "whisper":
        for (let i = 0; i < 4; i++) burst(t + i * 0.22, 0.35, 1400 + Math.random() * 1600, 6, 0.05, "bandpass", 900 + Math.random() * 900);
        break;
      case "creak":
        tone(t, 70 + Math.random() * 30, 0.9, 0.06, "sawtooth", sfx, 50 + Math.random() * 40);
        break;
      case "musicbox":
        [1568, 1318, 1175, 1318, 1568, 1568, 1568].forEach((f, i) => tone(t + i * 0.22, f, 0.6, 0.05, "sine"));
        break;
      case "power":
        tone(t, 40, 2.0, 0.2, "sawtooth", sfx, 60);
        burst(t, 0.3, 5000, 2, 0.2, "highpass");
        break;
      case "escape":
        [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.18, f, 2.2, 0.08, "triangle"));
        burst(t, 3, 800, 0.4, 0.06, "lowpass", 4000);
        break;
      default:
        tone(t, 660, 0.1, 0.05);
    }
  },
  dispose() {
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
