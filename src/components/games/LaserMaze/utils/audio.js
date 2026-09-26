/**
 * Laser Maze — tiny WebAudio synth (no files, no libraries).
 *
 * One module-level gate controls ALL effects and one controls the music
 * pad; LaserMaze.jsx sets them from `settings && !muted`, so the shared
 * GamePlayer Mute button silences everything instantly (music gain is cut
 * to zero at once) without overwriting the saved preferences.
 */

let ctx = null;
let sfxOn = true;
let master = null;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, { type = "sine", gain = 0.08, slide = null, delay = 0, attack = 0.006 } = {}) {
  if (!sfxOn) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(dur, { gain = 0.03, freq = 1800, q = 0.8, delay = 0 } = {}) {
  if (!sfxOn) return;
  const a = ac();
  if (!a) return;
  const n = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(a.currentTime + delay);
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

export const sfx = {
  setEnabled(v) {
    sfxOn = Boolean(v);
  },
  rotate() {
    tone(880, 0.07, { type: "triangle", gain: 0.04, slide: 1320 });
    noise(0.05, { gain: 0.018, freq: 4200, q: 2 });
  },
  /** one soft shimmer when the beam path actually changes (not per segment) */
  reflect() {
    tone(1568, 0.16, { gain: 0.015, slide: 2093, delay: 0.03 });
  },
  target(i = 0) {
    const f = PENTA[i % PENTA.length];
    tone(f, 0.32, { gain: 0.06 });
    tone(f * 1.5, 0.28, { gain: 0.03, delay: 0.05 });
  },
  targetOff() {
    tone(392, 0.12, { gain: 0.025, slide: 330 });
  },
  mismatch() {
    tone(233, 0.14, { type: "triangle", gain: 0.03, slide: 207 });
  },
  switchOn() {
    tone(660, 0.06, { type: "square", gain: 0.02 });
    tone(990, 0.1, { type: "triangle", gain: 0.03, delay: 0.05 });
  },
  gate() {
    noise(0.35, { gain: 0.045, freq: 320, q: 0.6 });
    tone(196, 0.3, { gain: 0.03, slide: 294 });
  },
  portal() {
    tone(440, 0.3, { gain: 0.03, slide: 1320 });
    tone(660, 0.3, { type: "triangle", gain: 0.015, slide: 220, delay: 0.04 });
  },
  crank() {
    for (let i = 0; i < 3; i++) noise(0.04, { gain: 0.04, freq: 2600, q: 3, delay: i * 0.05 });
    tone(220, 0.12, { type: "triangle", gain: 0.02 });
  },
  pick() {
    tone(740, 0.08, { gain: 0.035, slide: 988 });
  },
  slide() {
    noise(0.18, { gain: 0.03, freq: 5200, q: 1.2 });
    tone(988, 0.12, { gain: 0.02, slide: 740 });
  },
  undo() {
    tone(620, 0.09, { type: "triangle", gain: 0.035, slide: 440 });
  },
  hint() {
    tone(988, 0.12, { gain: 0.035 });
    tone(1318, 0.16, { gain: 0.03, delay: 0.09 });
  },
  ui() {
    tone(620, 0.05, { type: "triangle", gain: 0.03, slide: 760 });
  },
  back() {
    tone(480, 0.06, { type: "triangle", gain: 0.03, slide: 360 });
  },
  complete() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone(f, 0.5, { gain: 0.055, delay: i * 0.075 }));
    tone(2093, 0.9, { gain: 0.02, delay: 0.4 });
  },
};

/** Slow ambient pad. One instance, owned by LaserMaze.jsx. */
export class MusicPad {
  constructor() {
    this.enabled = false;
    this.timer = null;
    this.bus = null;
    this.root = 220;
  }
  setWorld(worldId) {
    // each world gets its own key, a gentle change of mood
    const roots = [220, 207.65, 246.94, 196, 261.63, 233.08, 185, 174.61, 196, 164.81];
    this.root = roots[(worldId - 1) % roots.length];
  }
  setEnabled(v) {
    this.enabled = Boolean(v);
    const a = this.enabled ? ac() : ctx;
    if (!a) return;
    if (this.enabled && !this.bus) {
      this.bus = a.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(a.destination);
      this._step();
    }
    if (this.bus) {
      this.bus.gain.cancelScheduledValues(a.currentTime);
      if (this.enabled) this.bus.gain.setTargetAtTime(0.028, a.currentTime, 0.8);
      else this.bus.gain.setValueAtTime(0, a.currentTime); // mute is immediate
    }
  }
  _step() {
    const a = ctx;
    if (!a || !this.bus) return;
    const chords = [[1, 1.25, 1.5], [0.889, 1.122, 1.335], [0.75, 1, 1.25], [0.844, 1.125, 1.5]];
    const i = (this.i = ((this.i || 0) + 1) % chords.length);
    if (this.enabled) {
      const now = a.currentTime;
      chords[i].forEach((m) => {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = "sine";
        o.frequency.value = this.root * m;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.5, now + 1.6);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 5.6);
        o.connect(g).connect(this.bus);
        o.start(now);
        o.stop(now + 5.8);
      });
    }
    this.timer = setTimeout(() => this._step(), 4800);
  }
  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      this.bus?.disconnect();
    } catch {
      /* already gone */
    }
    this.bus = null;
  }
}
