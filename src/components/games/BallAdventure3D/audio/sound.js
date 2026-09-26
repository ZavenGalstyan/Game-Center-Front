/**
 * Ball Adventure 3D — synthesised audio (no sound files), same approach as
 * Delivery Rush's engine sound: a small WebAudio graph, everything hanging
 * off one master gain so muting is a single ramp. `BallAudio` owns the
 * continuous rolling sound (filtered noise, cutoff/gain track speed and
 * surface); one-shot sfx are plain functions.
 */

let ctx = null;
function audioCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}
function resume() {
  const ac = audioCtx();
  if (ac && ac.state === "suspended") ac.resume().catch(() => {});
  return ac;
}

function blip(freqs, { type = "sine", duration = 0.12, gain = 0.06, slide = 0, delay = 0 } = {}) {
  const ac = resume();
  if (!ac) return;
  try {
    const now = ac.currentTime + delay;
    freqs.forEach((f, i) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const t0 = now + i * duration * 0.5;
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t0 + duration);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.03);
    });
  } catch { /* audio is never load-bearing */ }
}

export const sfx = {
  jump: (on) => on && blip([420], { type: "sine", duration: 0.1, gain: 0.07, slide: 160 }),
  land: (on) => on && blip([160], { type: "sine", duration: 0.08, gain: 0.05, slide: -60 }),
  crystal: (on) => on && blip([660, 990], { type: "triangle", duration: 0.1, gain: 0.06 }),
  checkpoint: (on) => on && blip([440, 660], { type: "sine", duration: 0.16, gain: 0.05 }),
  fall: (on) => on && blip([300], { type: "sawtooth", duration: 0.3, gain: 0.05, slide: -220 }),
  finish: (on) => on && blip([523, 659, 784, 1047], { type: "triangle", duration: 0.13, gain: 0.07 }),
  worldComplete: (on) => on && blip([392, 523, 659, 784, 1047, 1319], { type: "triangle", duration: 0.14, gain: 0.08 }),
  boost: (on) => on && blip([200], { type: "sawtooth", duration: 0.2, gain: 0.06, slide: 500 }),
  bounce: (on) => on && blip([300], { type: "sine", duration: 0.14, gain: 0.06, slide: 300 }),
  ui: (on) => on && blip([500], { type: "sine", duration: 0.06, gain: 0.04 }),
  back: (on) => on && blip([340], { type: "sine", duration: 0.06, gain: 0.04 }),
};

/** Continuous rolling sound: filtered noise loop, cutoff/gain follow speed. */
export class BallAudio {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this._surface = "normal";
    const ac = audioCtx();
    if (!ac) return;
    try {
      const bufSize = 2 * ac.sampleRate;
      const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      this.src = ac.createBufferSource();
      this.src.buffer = buf;
      this.src.loop = true;
      this.filter = ac.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 200;
      this.gain = ac.createGain();
      this.gain.gain.value = 0;
      this.src.connect(this.filter).connect(this.gain).connect(ac.destination);
      this.src.start();
    } catch { /* silent fallback */ }
  }

  setSurface(surface) { this._surface = surface; }

  /** speed01: 0..1 of max speed; grounded: whether currently rolling on ground */
  update(speed01, grounded) {
    if (!this.gain) return;
    const ac = audioCtx();
    if (!ac) return;
    const surfaceGain = { ice: 0.55, sand: 0.75, mud: 0.8 }[this._surface] ?? 1;
    const targetGain = this.enabled && grounded ? Math.min(0.09, 0.02 + speed01 * 0.07) * surfaceGain : 0;
    const targetFreq = 120 + speed01 * (this._surface === "ice" ? 900 : 500);
    const t = ac.currentTime;
    this.gain.gain.setTargetAtTime(targetGain, t, 0.08);
    this.filter.frequency.setTargetAtTime(targetFreq, t, 0.1);
  }

  setEnabled(enabled) { this.enabled = enabled; }

  dispose() {
    try { this.src?.stop(); } catch { /* already stopped */ }
    this.src = null;
  }
}
