/**
 * Portal Shift — procedural WebAudio (no sound files). A low facility hum
 * plus one-shots for portals, teleports, cubes, plates, doors, beams and
 * timers. The context is created on the first user gesture; everything runs
 * through one master gain so mute/volume are instant.
 */
let ctx = null, master = null, noiseBuf = null, hum = null;
let muted = false, volume = 0.8;

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
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function env(g, t, a, peak, d) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(type, f0, f1, dur, peak, delay = 0, filter = null) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, Math.min(0.02, dur / 4), peak, dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || "lowpass";
    f.frequency.value = filter.f;
    f.Q.value = filter.q || 1;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.1);
}

function noise(dur, peak, f, type = "bandpass", q = 1, delay = 0, fEnd = null) {
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
  env(g, t, 0.01, peak, dur);
  s.connect(fl);
  fl.connect(g);
  g.connect(master);
  s.start(t);
  s.stop(t + dur + 0.1);
}

function startHum() {
  if (hum || !ctx) return;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  const o1 = ctx.createOscillator();
  o1.type = "sawtooth";
  o1.frequency.value = 55;
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = 110.4;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lg = ctx.createGain();
  lg.gain.value = 60;
  lfo.connect(lg);
  lg.connect(lp.frequency);
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(g);
  g.connect(master);
  o1.start();
  o2.start();
  lfo.start();
  hum = { g, nodes: [o1, o2, lfo] };
}

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    startHum();
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03);
  },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03);
  },
  ambient(on) {
    if (hum) hum.g.gain.setTargetAtTime(on ? 0.05 : 0.015, ctx.currentTime, 0.4);
  },
  play(name, e = {}) {
    if (!ctx || muted) return;
    switch (name) {
      case "portal": {
        const base = e.color === "blue" ? 520 : 380;
        tone("sawtooth", base * 2.2, base * 0.6, 0.22, 0.12, 0, { f: 2400 });
        tone("sine", base, base * 1.5, 0.35, 0.12, 0.04);
        noise(0.25, 0.06, 3000, "bandpass", 2, 0, 900);
        break;
      }
      case "portalFail":
        tone("square", 180, 90, 0.18, 0.08, 0, { f: 900 });
        noise(0.12, 0.05, 1800, "bandpass", 3);
        break;
      case "portalLocked":
        tone("square", 140, 140, 0.1, 0.06, 0, { f: 700 });
        tone("square", 140, 140, 0.1, 0.06, 0.13, { f: 700 });
        break;
      case "teleport":
        tone("sine", 900, 220, 0.3, 0.12);
        noise(0.35, 0.08, 600, "bandpass", 1.5, 0, 4000);
        break;
      case "pickup":
        tone("sine", 300, 600, 0.12, 0.1);
        tone("triangle", 900, 1200, 0.1, 0.04, 0.03);
        break;
      case "drop":
        tone("sine", 500, 260, 0.12, 0.08);
        break;
      case "land":
        noise(0.12, Math.min(0.2, 0.05 + (e.v || 0) * 0.006), 260, "lowpass", 1);
        tone("sine", 90, 50, 0.15, 0.1);
        break;
      case "jump":
        noise(0.06, 0.03, 900, "bandpass", 1);
        break;
      case "plateOn":
        tone("square", 220, 220, 0.06, 0.05, 0, { f: 1200 });
        tone("sine", 660, 880, 0.18, 0.08, 0.05);
        break;
      case "plateOff":
        tone("sine", 660, 440, 0.16, 0.06);
        break;
      case "doorOpen":
        noise(0.7, 0.07, 400, "lowpass", 1, 0, 1400);
        tone("sawtooth", 70, 110, 0.6, 0.04, 0, { f: 300 });
        if (e.exit) {
          tone("sine", 523, 523, 0.25, 0.08, 0.1);
          tone("sine", 784, 784, 0.4, 0.08, 0.28);
        }
        break;
      case "doorClose":
        noise(0.5, 0.07, 1200, "lowpass", 1, 0, 300);
        tone("sine", 70, 45, 0.2, 0.12, 0.45);
        break;
      case "switch":
        tone("square", 1200, 1200, 0.04, 0.05, 0, { f: 3000 });
        tone("sine", 700, 1050, 0.15, 0.08, 0.04);
        break;
      case "tick":
        tone("square", e.left <= 2 ? 1500 : 1100, e.left <= 2 ? 1500 : 1100, 0.04, 0.05, 0, { f: 4000 });
        break;
      case "timerEnd":
        tone("sawtooth", 300, 150, 0.4, 0.07, 0, { f: 1200 });
        break;
      case "receiverOn":
        tone("sine", 440, 880, 0.3, 0.08);
        tone("sine", 1320, 1320, 0.3, 0.04, 0.12);
        break;
      case "receiverOff":
        tone("sine", 660, 330, 0.25, 0.06);
        break;
      case "respawn":
        noise(0.5, 0.1, 300, "lowpass", 1, 0, 2000);
        tone("sine", 200, 600, 0.45, 0.08);
        break;
      case "cubeRespawn":
        tone("triangle", 400, 800, 0.25, 0.06);
        break;
      case "checkpoint":
        tone("sine", 660, 660, 0.12, 0.07);
        tone("sine", 990, 990, 0.2, 0.07, 0.1);
        break;
      case "complete":
        [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, 0.35, 0.09, i * 0.11));
        tone("sine", 1568, 1568, 0.8, 0.05, 0.5);
        break;
      case "gameComplete":
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone("triangle", f, f, 0.5, 0.09, i * 0.14));
        break;
      case "ui":
        tone("sine", 880, 880, 0.05, 0.04);
        break;
      case "pad":
        tone("sine", 200, 900, 0.3, 0.1);
        break;
      default:
        break;
    }
  },
  dispose() {
    if (hum) {
      hum.nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      });
      hum = null;
    }
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
      master = null;
    }
  },
};
