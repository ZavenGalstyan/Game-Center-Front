/**
 * Supermarket Rush — WebAudio synth sound effects and light ambience. No
 * audio files, matching Parking Master / Stonewild's approach. `sfx.*` are
 * one-shot events; `Ambience` is a small held graph (fridge hum + a soft
 * pad) for the gameplay screen. Every call checks an `enabled` flag so the
 * GamePlayer Mute button silences everything instantly without touching the
 * player's saved sound setting.
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

function blip(freq, dur, type = "sine", gain = 0.12, slideTo = null, delay = 0) {
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
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, gain = 0.2, lp = 1200, gainNode = null) {
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
  src.connect(f).connect(g).connect(gainNode || a.destination);
  src.start();
}

export const sfx = {
  ui(on) { if (on) blip(520, 0.06, "triangle", 0.05, 660); },
  back(on) { if (on) blip(340, 0.08, "triangle", 0.05, 260); },
  footstep(on) { if (on) noise(0.06, 0.03, 500); },
  doorSlide(on) { if (on) { blip(220, 0.3, "sine", 0.04, 260); noise(0.3, 0.02, 700); } },
  boxPickup(on) { if (on) blip(180, 0.12, "square", 0.06, 140); },
  boxDrop(on) { if (on) { noise(0.1, 0.1, 400); blip(120, 0.1, "square", 0.05); } },
  placeItem(on) { if (on) blip(660, 0.07, "triangle", 0.06, 880); },
  taskDone(on) {
    if (!on) return;
    [523, 659, 784].forEach((f, i) => blip(f, 0.16, "sine", 0.07, null, i * 0.07));
  },
  scanBeep(on) { if (on) blip(1400, 0.09, "square", 0.06); },
  cashRegister(on) {
    if (!on) return;
    blip(880, 0.08, "square", 0.05);
    blip(660, 0.1, "square", 0.05, null, 0.09);
  },
  cartClack(on) { if (on) blip(300, 0.08, "square", 0.05, 220); },
  cartRoll(on) { if (on) noise(0.15, 0.02, 1800); },
  spillClean(on) { if (on) noise(0.08, 0.05, 2500); },
  helpChime(on) { if (on) blip(740, 0.1, "sine", 0.06, 990); },
  shiftComplete(on) {
    if (!on) return;
    [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.24, "sine", 0.09, null, i * 0.1));
  },
  starPop(on) { if (on) blip(1046, 0.18, "sine", 0.08, 1568); },
  purchase(on) {
    if (!on) return;
    [440, 660].forEach((f, i) => blip(f, 0.15, "triangle", 0.07, null, i * 0.08));
  },
  fail(on) {
    if (!on) return;
    [330, 262].forEach((f, i) => blip(f, 0.22, "sawtooth", 0.06, null, i * 0.11));
  },
};

/** A soft continuous store hum — fridge buzz + faint ceiling-light whine. */
export class Ambience {
  constructor(enabled) {
    this.enabled = enabled;
    const a = ac();
    if (!a) return;
    this.gain = a.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(a.destination);

    this.hum = a.createOscillator();
    this.hum.type = "sine";
    this.hum.frequency.value = 60;
    const humGain = a.createGain();
    humGain.gain.value = 0.4;
    this.hum.connect(humGain).connect(this.gain);

    this.whine = a.createOscillator();
    this.whine.type = "sine";
    this.whine.frequency.value = 220;
    const whineGain = a.createGain();
    whineGain.gain.value = 0.08;
    this.whine.connect(whineGain).connect(this.gain);

    try {
      this.hum.start();
      this.whine.start();
    } catch {
      /* already started */
    }
  }
  setVolume(v) {
    if (!this.gain) return;
    const a = ac();
    if (!a) return;
    const target = this.enabled ? Math.max(0, Math.min(1, v)) * 0.05 : 0;
    this.gain.gain.setTargetAtTime(target, a.currentTime, 0.4);
  }
  setEnabled(v) {
    this.enabled = v;
  }
  dispose() {
    try {
      this.hum?.stop();
      this.whine?.stop();
    } catch {
      /* noop */
    }
    this.gain = this.hum = this.whine = null;
  }
}
