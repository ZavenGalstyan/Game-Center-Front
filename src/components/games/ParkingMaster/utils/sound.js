/**
 * Parking Master — minimal WebAudio synth. No files, no libraries.
 *
 * `sfx.*` are one-shots for UI and events. `EngineAudio` is a small held graph
 * for the gameplay screen (idle hum + throttle whine). Everything checks an
 * `enabled` flag so the GamePlayer Mute button silences it instantly without
 * touching the player's saved sound setting.
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

function blip(freq, dur, type = "sine", gain = 0.12, slideTo = null) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}

function noise(dur, gain = 0.2, lp = 1200) {
  const a = ac();
  if (!a) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export const sfx = {
  ui(on) { if (on) blip(520, 0.06, "triangle", 0.05, 660); },
  back(on) { if (on) blip(340, 0.08, "triangle", 0.05, 260); },
  hitSoft(on) { if (on) { noise(0.12, 0.12, 900); blip(180, 0.1, "square", 0.05); } },
  hitHard(on) { if (on) { noise(0.22, 0.28, 500); blip(90, 0.18, "sawtooth", 0.12, 50); } },
  brake(on) { if (on) noise(0.18, 0.06, 2600); },
  check(on) { if (on) blip(740, 0.07, "sine", 0.06, 880); },
  success(on) {
    if (!on) return;
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, "sine", 0.09), i * 90));
  },
  perfect(on) {
    if (!on) return;
    [659, 784, 988, 1318, 1568].forEach((f, i) => setTimeout(() => blip(f, 0.26, "triangle", 0.09), i * 80));
  },
  fail(on) {
    if (!on) return;
    [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, "sawtooth", 0.08), i * 130));
  },
};

export class EngineAudio {
  constructor(enabled) {
    this.enabled = enabled;
    this.node = null;
    const a = ac();
    if (!a) return;
    this.osc = a.createOscillator();
    this.osc2 = a.createOscillator();
    this.gain = a.createGain();
    this.filter = a.createBiquadFilter();
    this.osc.type = "sawtooth";
    this.osc2.type = "square";
    this.osc.frequency.value = 46;
    this.osc2.frequency.value = 92;
    this.filter.type = "lowpass";
    this.filter.frequency.value = 380;
    this.gain.gain.value = 0;
    this.osc.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.gain).connect(a.destination);
    try { this.osc.start(); this.osc2.start(); } catch { /* already started */ }
  }
  update(speedFrac, throttle) {
    if (!this.gain) return;
    const a = ac();
    if (!a) return;
    const target = this.enabled ? 0.02 + Math.min(0.08, speedFrac * 0.09 + Math.abs(throttle) * 0.03) : 0;
    this.gain.gain.setTargetAtTime(target, a.currentTime, 0.1);
    const f = 42 + speedFrac * 120 + Math.abs(throttle) * 30;
    this.osc.frequency.setTargetAtTime(f, a.currentTime, 0.08);
    this.osc2.frequency.setTargetAtTime(f * 2, a.currentTime, 0.08);
    this.filter.frequency.setTargetAtTime(320 + speedFrac * 900, a.currentTime, 0.1);
  }
  setEnabled(v) { this.enabled = v; }
  dispose() {
    try { this.osc?.stop(); this.osc2?.stop(); } catch { /* noop */ }
    this.gain = this.osc = this.osc2 = this.filter = null;
  }
}
