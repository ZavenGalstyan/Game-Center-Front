/**
 * Rooftop Sniper — WebAudio synth sound effects and light wind ambience. No
 * audio files, same approach as Supermarket Rush / Parking Master / Stonewild.
 * Every call checks an `enabled` flag so the GamePlayer Mute button silences
 * everything instantly without touching the player's saved sound setting.
 */

let ctx = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function blip(freq, dur, type = "sine", gain = 0.12, slideTo = null, delay = 0, dest = null) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest || a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, gain = 0.2, lp = 1200, hp = 0, delay = 0, dest = null) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  let node = src.connect(f);
  if (hp > 0) {
    const hpf = a.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = hp;
    node = node.connect(hpf);
  }
  const g = a.createGain();
  g.gain.value = gain;
  node.connect(g).connect(dest || a.destination);
  src.start(t0);
}

export const sfx = {
  ui(on) { if (on) blip(520, 0.06, "triangle", 0.05, 660); },
  back(on) { if (on) blip(340, 0.08, "triangle", 0.05, 260); },

  /** Rifle shot: sharp crack (noise burst) + low thump, one shared transient. */
  gunshot(on) {
    if (!on) return;
    noise(0.16, 0.4, 3200, 200);
    blip(90, 0.14, "square", 0.22, 40);
  },
  emptyClick(on) { if (on) blip(700, 0.04, "square", 0.08, 500); },
  boltAction(on) {
    if (!on) return;
    blip(260, 0.05, "square", 0.08, 180, 0);
    blip(320, 0.05, "square", 0.07, 220, 0.16);
  },
  magOut(on) { if (on) noise(0.08, 0.06, 900, 300, 0); },
  magIn(on) { if (on) { noise(0.07, 0.08, 700, 200, 0); blip(160, 0.06, "square", 0.06, 100, 0.03); } },

  scopeIn(on) { if (on) blip(180, 0.14, "sine", 0.05, 340); },
  scopeOut(on) { if (on) blip(340, 0.1, "sine", 0.04, 180); },
  zoomStep(on) { if (on) blip(900, 0.04, "triangle", 0.04, 1100); },
  breathHold(on) { if (on) blip(220, 0.5, "sine", 0.02, 200); },

  impactMetal(on) {
    if (!on) return;
    blip(1400, 0.1, "square", 0.1, 700);
    blip(2200, 0.08, "triangle", 0.05, 1600, 0.02);
    noise(0.12, 0.05, 4000, 800, 0.01);
  },
  impactMiss(on) { if (on) noise(0.12, 0.05, 2600, 400); },

  targetDown(on) {
    if (!on) return;
    [523, 659].forEach((f, i) => blip(f, 0.14, "sine", 0.07, null, i * 0.06));
  },
  missionComplete(on) {
    if (!on) return;
    [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.24, "sine", 0.09, null, i * 0.1));
  },
  missionFailed(on) {
    if (!on) return;
    [330, 262].forEach((f, i) => blip(f, 0.22, "sawtooth", 0.06, null, i * 0.11));
  },
  starPop(on) { if (on) blip(1046, 0.18, "sine", 0.08, 1568); },
};

/** A soft continuous wind/city bed for the gameplay screen. */
export class Ambience {
  constructor(enabled) {
    this.enabled = enabled;
    const a = ac();
    if (!a) return;
    this.gain = a.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(a.destination);

    this.wind = a.createBufferSource();
    const n = a.sampleRate * 2;
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    this.wind.buffer = buf;
    this.wind.loop = true;
    const windFilter = a.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 900;
    const windGain = a.createGain();
    windGain.gain.value = 0.5;
    this.wind.connect(windFilter).connect(windGain).connect(this.gain);

    try {
      this.wind.start();
    } catch {
      /* already started */
    }
  }
  setVolume(v) {
    if (!this.gain) return;
    const a = ac();
    if (!a) return;
    const target = this.enabled ? Math.max(0, Math.min(1, v)) * 0.06 : 0;
    this.gain.gain.setTargetAtTime(target, a.currentTime, 0.4);
  }
  setEnabled(v) {
    this.enabled = v;
  }
  dispose() {
    try {
      this.wind?.stop();
    } catch {
      /* noop */
    }
    this.gain = this.wind = null;
  }
}
