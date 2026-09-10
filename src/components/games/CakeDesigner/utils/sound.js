/**
 * Cake Designer — tiny WebAudio synth. No files, no libraries.
 *
 * Every call takes an `on` flag; the editor passes `settings.sound && !muted`
 * so the GamePlayer Mute button silences everything instantly without touching
 * the saved sound preference. `music` is a soft looping pad, gated the same way.
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

function swish(dur = 0.22, gain = 0.05, lp = 1800) {
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
  f.type = "bandpass";
  f.frequency.value = lp;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export const sfx = {
  ui(on) { if (on) tone(540, 0.05, "triangle", 0.04, 680); },
  back(on) { if (on) tone(360, 0.07, "triangle", 0.04, 280); },
  tab(on) { if (on) tone(620, 0.045, "sine", 0.035, 720); },
  pick(on) { if (on) tone(720, 0.06, "sine", 0.05, 900); },
  frosting(on) { if (on) swish(0.34, 0.055, 1400); },
  drip(on) { if (on) { tone(300, 0.16, "sine", 0.05, 150); swish(0.2, 0.03, 900); } },
  place(on) { if (on) { tone(480, 0.05, "sine", 0.06, 640); tone(900, 0.05, "sine", 0.03); } },
  remove(on) { if (on) tone(300, 0.08, "triangle", 0.045, 200); },
  sprinkle(on) {
    if (!on) return;
    for (let i = 0; i < 7; i++) setTimeout(() => tone(900 + Math.random() * 700, 0.05, "sine", 0.025), i * 45);
  },
  candle(on) { if (on) tone(520, 0.06, "sine", 0.05, 760); },
  coin(on) {
    if (!on) return;
    [880, 1180].forEach((f, i) => setTimeout(() => tone(f, 0.12, "sine", 0.06), i * 70));
  },
  success(on) {
    if (!on) return;
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.24, "sine", 0.08), i * 95));
  },
  perfect(on) {
    if (!on) return;
    [659, 784, 988, 1318, 1568, 2093].forEach((f, i) =>
      setTimeout(() => tone(f, 0.26, "triangle", 0.07), i * 80));
  },
  fail(on) {
    if (!on) return;
    [392, 311, 262].forEach((f, i) => setTimeout(() => tone(f, 0.26, "sine", 0.06), i * 120));
  },
};

/** Soft two-oscillator pad for the menu / editor. */
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
      [262, 330, 392], [294, 370, 440], [349, 440, 523], [330, 392, 494],
    ];
    let i = 0;
    const step = () => {
      if (!this.gain) return;
      const now = a.currentTime;
      const target = this.enabled ? 0.035 : 0;
      this.gain.gain.setTargetAtTime(target, now, 0.6);
      const chord = chords[i % chords.length];
      i++;
      chord.forEach((f) => {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.5, now + 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
        o.connect(g).connect(this.gain);
        o.start(now);
        o.stop(now + 3.6);
      });
      this.timer = setTimeout(step, 3000);
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
