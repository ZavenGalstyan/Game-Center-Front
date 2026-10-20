/**
 * Outpost 47 — WebAudio synth. Wind/blizzard bed that swells outdoors, a
 * station hum once power is back, cave drips/ice creaks below, footsteps per
 * surface, and short cues (doors, pickups, puzzles, radio static, metallic
 * groans). Everything is generated; nothing is downloaded.
 */
let ctx = null, master = null, sfx = null, noise = null;
let muted = false, volume = 0.8;
let bed = null;

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ctx.destination);
  sfx = ctx.createGain();
  sfx.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
const live = () => ctx && ctx.state === "running";
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(t, freq, dur, vol, type = "sine", glide = 0, dest = sfx) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  const g = ctx.createGain();
  env(g, t, Math.min(0.02, dur / 4), vol, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function burst(t, dur, freq, q, vol, type = "bandpass", toFreq = 0, att = 0) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, att || Math.min(0.04, dur / 3), vol, dur);
  src.connect(f).connect(g).connect(sfx);
  src.start(t, Math.random(), dur + 0.05);
}
function loopNoise(type, freq, q) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  s.connect(f).connect(g).connect(master);
  s.start();
  return { s, f, g };
}
function startBed() {
  if (bed || !ctx) return;
  const wind = loopNoise("bandpass", 420, 0.7);
  const howl = loopNoise("bandpass", 900, 6);
  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 50;
  const humF = ctx.createBiquadFilter();
  humF.type = "lowpass";
  humF.frequency.value = 160;
  const humG = ctx.createGain();
  humG.gain.value = 0;
  hum.connect(humF).connect(humG).connect(master);
  hum.start();
  const deep = loopNoise("lowpass", 120, 0.5);
  bed = { wind, howl, hum, humG, deep, t: 0 };
}
const ramp = (param, v, k = 0.6) => {
  if (!ctx) return;
  param.setTargetAtTime(v, ctx.currentTime, k);
};

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    startBed();
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : volume, ctx.currentTime, 0.05);
  },
  setVolume(v) {
    volume = v;
    if (master && !muted) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  },
  /** Called ~10×/s with the current environment. */
  ambience({ env = "menu", power = false, active = true, cold = 0 } = {}) {
    if (!bed) return;
    const out = env === "outdoor" || env === "menu";
    const muffled = env === "indoor" || env === "shelter";
    const gust = 0.75 + Math.sin(Date.now() / 1700) * 0.25 + Math.sin(Date.now() / 530) * 0.1;
    const a = active ? 1 : 0.35;
    ramp(bed.wind.g.gain, (out ? 0.34 * gust : muffled ? 0.07 * gust : env === "cave" ? 0.05 : 0.02) * a);
    ramp(bed.wind.f.frequency, out ? 380 + gust * 260 : 220);
    ramp(bed.howl.g.gain, (out ? 0.05 * gust : muffled ? 0.012 : 0) * a);
    ramp(bed.howl.f.frequency, 700 + gust * 500);
    ramp(bed.humG.gain, ((power && (env === "indoor")) || env === "lab" || env === "hangar" ? 0.05 : env === "tunnel" ? 0.02 : 0) * a);
    ramp(bed.deep.g.gain, (env === "cave" || env === "tunnel" ? 0.12 : 0.04) * a);
    if (cold > 0.6 && live() && Math.random() < 0.08) this.cue("heart");
  },
  step(surface, sprint, crouch) {
    if (!live()) return;
    const t = ctx.currentTime;
    const v = (crouch ? 0.05 : sprint ? 0.16 : 0.1) * (0.8 + Math.random() * 0.4);
    if (surface === "snow") {
      burst(t, 0.16, 1400 + Math.random() * 600, 0.8, v * 1.2, "bandpass", 700);
      burst(t + 0.02, 0.1, 3800, 1.5, v * 0.5, "highpass");
    } else if (surface === "ice") {
      burst(t, 0.08, 2600, 2, v, "bandpass");
      tone(t, 1800 + Math.random() * 400, 0.05, v * 0.15, "triangle");
    } else {
      burst(t, 0.07, 900 + Math.random() * 300, 1.4, v, "bandpass");
      tone(t, 140 + Math.random() * 40, 0.08, v * 0.5, "triangle");
    }
  },
  cue(name) {
    if (!live()) return;
    const t = ctx.currentTime;
    switch (name) {
      case "ui":
        tone(t, 880, 0.06, 0.05, "triangle");
        break;
      case "click":
        burst(t, 0.03, 3000, 2, 0.12, "bandpass");
        break;
      case "pickup":
        tone(t, 620, 0.12, 0.08, "triangle");
        tone(t + 0.08, 930, 0.18, 0.07, "triangle");
        break;
      case "doc":
        burst(t, 0.25, 2600, 0.8, 0.07, "highpass");
        break;
      case "deny":
        tone(t, 180, 0.18, 0.08, "square");
        tone(t + 0.12, 140, 0.2, 0.07, "square");
        break;
      case "door":
        burst(t, 0.9, 500, 0.8, 0.12, "bandpass", 180);
        tone(t, 90, 0.8, 0.06, "sawtooth", 60);
        break;
      case "doorHeavy":
        tone(t, 70, 1.6, 0.12, "sawtooth", 45);
        burst(t, 1.5, 300, 0.7, 0.14, "lowpass", 120);
        burst(t + 1.4, 0.3, 200, 1, 0.2, "lowpass");
        break;
      case "ice":
        for (let i = 0; i < 4; i++) burst(t + i * 0.12, 0.09, 3200, 3, 0.16, "bandpass");
        break;
      case "switch":
        burst(t, 0.04, 1800, 3, 0.15, "bandpass");
        tone(t + 0.05, 100, 0.6, 0.05, "sawtooth");
        break;
      case "clunk":
        tone(t, 110, 0.25, 0.14, "triangle", 70);
        burst(t, 0.15, 700, 1.5, 0.15, "bandpass");
        break;
      case "success":
        tone(t, 523, 0.18, 0.08, "triangle");
        tone(t + 0.12, 659, 0.18, 0.08, "triangle");
        tone(t + 0.24, 784, 0.35, 0.08, "triangle");
        break;
      case "fail":
        tone(t, 220, 0.25, 0.08, "sawtooth", 160);
        break;
      case "power":
        tone(t, 40, 2.5, 0.16, "sawtooth", 100);
        burst(t, 2.4, 200, 0.6, 0.12, "lowpass", 900);
        for (let i = 0; i < 6; i++) burst(t + 0.4 + i * 0.22, 0.05, 2400, 2, 0.12, "bandpass");
        break;
      case "boiler":
        burst(t, 2.5, 120, 0.6, 0.2, "lowpass", 400, 0.5);
        tone(t + 0.4, 55, 2, 0.06, "sawtooth");
        break;
      case "steam":
        burst(t, 3.5, 3000, 0.5, 0.18, "highpass", 1200, 0.2);
        break;
      case "dig":
        for (let i = 0; i < 5; i++) burst(t + i * 0.35, 0.25, 900, 0.8, 0.18, "bandpass", 500);
        break;
      case "scan":
        for (let i = 0; i < 8; i++) tone(t + i * 0.15, 1200 + i * 150, 0.08, 0.04, "sine");
        break;
      case "chain":
        for (let i = 0; i < 7; i++) {
          burst(t + i * 0.07, 0.05, 4000 + Math.random() * 2000, 4, 0.12, "bandpass");
          tone(t + i * 0.07, 2200 + Math.random() * 800, 0.06, 0.03, "triangle");
        }
        break;
      case "lift":
        tone(t, 60, 2.6, 0.1, "sawtooth", 50);
        burst(t, 2.6, 300, 1, 0.08, "lowpass");
        burst(t + 2.5, 0.2, 200, 1, 0.2, "lowpass");
        break;
      case "wind":
        burst(t, 1.6, 600, 0.6, 0.18, "bandpass", 300, 0.3);
        break;
      case "unlock":
        tone(t, 440, 0.1, 0.06, "square");
        tone(t + 0.1, 880, 0.15, 0.06, "square");
        break;
      case "static":
      case "radio":
        burst(t, 1.6, 2000, 0.4, 0.1, "bandpass");
        for (let i = 0; i < 6; i++) tone(t + 0.2 + i * 0.18, 300 + Math.random() * 300, 0.1, 0.02, "square");
        break;
      case "clank":
        tone(t, 210, 1.4, 0.08, "triangle", 190);
        tone(t, 317, 1.1, 0.05, "triangle", 300);
        burst(t, 0.12, 1500, 2, 0.14, "bandpass");
        break;
      case "groan":
        tone(t, 75, 2.4, 0.09, "sawtooth", 52);
        tone(t + 0.3, 112, 2, 0.04, "sawtooth", 96);
        break;
      case "crack":
        for (let i = 0; i < 3; i++) burst(t + i * 0.08 + Math.random() * 0.1, 0.12, 2400, 3, 0.18, "bandpass", 900);
        tone(t, 60, 0.8, 0.08, "sine", 40);
        break;
      case "drip":
        for (let i = 0; i < 3; i++) tone(t + i * 0.6 + Math.random() * 0.3, 1400 + Math.random() * 500, 0.09, 0.04, "sine", 700);
        break;
      case "hum":
        tone(t, 110, 2.5, 0.05, "sine", 116);
        break;
      case "heart":
        tone(t, 52, 0.18, 0.18, "sine", 40);
        tone(t + 0.28, 48, 0.2, 0.14, "sine", 38);
        break;
      case "jump":
        burst(t, 0.08, 700, 1, 0.05);
        break;
      case "land":
        burst(t, 0.12, 400, 1, 0.12, "lowpass");
        break;
      case "collapse":
        tone(t, 200, 2.5, 0.08, "sine", 50);
        break;
      case "chapter":
        tone(t, 196, 1.8, 0.07, "sine");
        tone(t + 0.25, 294, 1.6, 0.05, "sine");
        tone(t + 0.5, 392, 2.2, 0.04, "sine");
        break;
      case "ending":
        tone(t, 147, 4, 0.08, "sine");
        tone(t + 0.6, 220, 4, 0.06, "sine");
        tone(t + 1.2, 294, 4, 0.05, "sine");
        break;
      default:
    }
  },
  dispose() {
    if (!ctx) return;
    try {
      bed?.wind.s.stop();
      bed?.howl.s.stop();
      bed?.deep.s.stop();
      bed?.hum.stop();
    } catch {
      /* already stopped */
    }
    ctx.close().catch(() => {});
    ctx = null;
    bed = null;
  },
};
