/**
 * Element Merge — tiny WebAudio synth. No files, no libraries.
 * Every call takes an `on` flag; ElementMerge.jsx passes `settings.sound &&
 * !muted` so the shared GamePlayer Mute button silences everything instantly
 * without touching the saved preference.
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

function tone(freq, dur, type = "sine", gain = 0.09, slideTo = null, delay = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBurst(dur = 0.2, gain = 0.05, freq = 900, type = "bandpass") {
  const a = ac();
  if (!a) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const env = Math.sin((Math.PI * i) / n);
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

/** Per-category reaction stingers, keyed by element `family` (data/elements.js). */
const FAMILY_SFX = {
  energy: (on) => on && (tone(680, 0.09, "sawtooth", 0.05, 340), noiseBurst(0.08, 0.03, 2200)),
  fluid: (on) => on && noiseBurst(0.22, 0.045, 1100),
  mineral: (on) => on && noiseBurst(0.1, 0.05, 350, "lowpass"),
  air: (on) => on && (tone(500, 0.16, "sine", 0.03, 780)),
  organic: (on) => on && tone(520, 0.14, "triangle", 0.045, 640),
  creature: (on) => on && tone(440, 0.12, "sine", 0.05, 560),
  human: (on) => on && tone(360, 0.12, "square", 0.03, 480),
  mechanical: (on) => on && (tone(220, 0.1, "square", 0.04), tone(880, 0.06, "square", 0.02, null, 0.05)),
  cosmic: (on) => on && [660, 990, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.3, "sine", 0.03), i * 60)),
};

export const sfx = {
  pickUp(on) { if (on) tone(600, 0.05, "sine", 0.035, 720); },
  dropOnTarget(on) { if (on) tone(440, 0.04, "sine", 0.025, 520); },
  reactionFamily(on, family) { (FAMILY_SFX[family] || FAMILY_SFX.mineral)(on); },
  noReaction(on) { if (on) tone(200, 0.1, "triangle", 0.035, 150); },
  knownDiscovery(on) { if (on) tone(700, 0.09, "sine", 0.05, 900); },
  newDiscovery(on) {
    if (!on) return;
    [523, 659, 880, 1174].forEach((f, i) => setTimeout(() => tone(f, 0.22, "sine", 0.06), i * 65));
  },
  milestone(on) {
    if (!on) return;
    [392, 523, 659, 784, 988, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.26, "triangle", 0.06), i * 60));
  },
  ui(on) { if (on) tone(540, 0.05, "triangle", 0.03, 680); },
  back(on) { if (on) tone(360, 0.06, "triangle", 0.03, 280); },
  trash(on) { if (on) noiseBurst(0.12, 0.03, 500, "lowpass"); },
};

/** Soft ambient pad, gated the same way as LiquidSort's — see that game for the pattern this mirrors. */
export class Music {
  constructor(enabled) {
    this.enabled = enabled;
    this.timer = null;
    const a = ac();
    if (!a) return;
    this.gain = a.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(a.destination);
    this._loop();
  }
  _loop() {
    const a = ac();
    if (!a || !this.gain) return;
    const chords = [
      [174, 220, 261], [196, 246, 293], [220, 277, 329], [164, 207, 246],
    ];
    let i = 0;
    const step = () => {
      if (!this.gain) return;
      const now = a.currentTime;
      this.gain.gain.setTargetAtTime(this.enabled ? 0.028 : 0, now, 0.8);
      const chord = chords[i % chords.length];
      i++;
      chord.forEach((f) => {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.4, now + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);
        o.connect(g).connect(this.gain);
        o.start(now);
        o.stop(now + 4.3);
      });
      this.timer = setTimeout(step, 3800);
    };
    step();
  }
  setEnabled(v) { this.enabled = v; }
  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try { this.gain?.disconnect(); } catch { /* noop */ }
    this.gain = null;
  }
}
