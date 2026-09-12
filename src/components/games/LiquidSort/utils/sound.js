/**
 * Liquid Sort — tiny WebAudio synth. No files, no libraries.
 *
 * Every call takes an `on` flag; the game passes `settings.sound && !muted`
 * so the shared GamePlayer Mute button silences everything instantly without
 * touching the saved sound preference. `music` is a soft ambient pad, gated
 * the same way.
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

function tone(freq, dur, type = "sine", gain = 0.11, slideTo = null) {
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

/** Soft filtered noise burst — used for the pour trickle and glass touches. */
function trickle(dur = 0.5, gain = 0.05, freq = 1200) {
  const a = ac();
  if (!a) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const env = Math.sin((Math.PI * i) / n);
    d[i] = (Math.random() * 2 - 1) * env * 0.6;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 0.7;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
  return src;
}

export const sfx = {
  select(on) { if (on) tone(560, 0.06, "sine", 0.045, 720); },
  deselect(on) { if (on) tone(420, 0.05, "sine", 0.03, 340); },
  invalid(on) { if (on) { tone(220, 0.09, "triangle", 0.05, 160); } },
  pourStart(on) { if (on) trickle(0.14, 0.02, 500); },
  pour(on, durMs) { if (on) trickle(Math.max(0.12, durMs / 1000), 0.045, 1500); },
  bottleComplete(on) {
    if (!on) return;
    [659, 880, 1108].forEach((f, i) => setTimeout(() => tone(f, 0.18, "sine", 0.06), i * 70));
  },
  undo(on) { if (on) tone(340, 0.09, "triangle", 0.045, 480); },
  hint(on) { if (on) { tone(760, 0.09, "sine", 0.04, 980); setTimeout(() => tone(980, 0.09, "sine", 0.035), 90); } },
  ui(on) { if (on) tone(540, 0.05, "triangle", 0.04, 680); },
  back(on) { if (on) tone(360, 0.07, "triangle", 0.04, 280); },
  win(on) {
    if (!on) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.24, "sine", 0.08), i * 90));
  },
  perfect(on) {
    if (!on) return;
    [659, 784, 988, 1318, 1568, 2093].forEach((f, i) =>
      setTimeout(() => tone(f, 0.26, "triangle", 0.07), i * 75));
  },
  deadEnd(on) {
    if (!on) return;
    [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.22, "sine", 0.05), i * 110));
  },
};

/** Soft ambient pad for the calm menu/level-select/gameplay screens. */
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
      [220, 277, 330], [246, 311, 370], [196, 247, 294], [220, 277, 349],
    ];
    let i = 0;
    const step = () => {
      if (!this.gain) return;
      const now = a.currentTime;
      const target = this.enabled ? 0.03 : 0;
      this.gain.gain.setTargetAtTime(target, now, 0.7);
      const chord = chords[i % chords.length];
      i++;
      chord.forEach((f) => {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.45, now + 1.0);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);
        o.connect(g).connect(this.gain);
        o.start(now);
        o.stop(now + 4.0);
      });
      this.timer = setTimeout(step, 3400);
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
