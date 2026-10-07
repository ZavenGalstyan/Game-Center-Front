/**
 * Water Tanks — tiny WebAudio synth (no files, no libraries).
 *
 * Two gates driven by WaterTanks.jsx from `setting && !muted`:
 *   sfx.setEnabled   — effects (master bus cut to zero immediately)
 *   music.setEnabled — the soft lab pad
 * The pour sound is a held, filtered noise "trickle" started by the view when
 * the stream appears and stopped when it ends; `sfx.stopAll()` kills any held
 * sound at once (restart, screen change, unmount, mute, completion).
 */

let ctx = null;
let master = null;
let sfxOn = false;
const held = new Set();

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = sfxOn ? 0.8 : 0;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

const vary = (x, amt = 0.06) => x * (1 + (Math.random() * 2 - 1) * amt);

function tone(freq, dur, { type = "sine", gain = 0.05, slide = null, delay = 0, attack = 0.006, bus = null } = {}) {
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
  o.connect(g).connect(bus || master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

let noiseBuf = null;
function noiseBuffer(a) {
  if (!noiseBuf) {
    const n = a.sampleRate * 2;
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise(dur, { gain = 0.03, freq = 1800, q = 0.8, delay = 0, type = "bandpass", sweep = null, attack = 0.01 } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
}

/** A bubbly droplet: short sine chirp. */
function drop(delay = 0, base = 900) {
  const f = vary(base, 0.25);
  tone(f, 0.07, { gain: 0.03, slide: f * 1.9, delay, attack: 0.003 });
}

export const sfx = {
  setEnabled(v) {
    sfxOn = Boolean(v);
    if (!sfxOn) this.stopAll();
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(sfxOn ? 0.8 : 0, ctx.currentTime);
    }
  },
  get enabled() {
    return sfxOn;
  },
  select() {
    if (!sfxOn) return;
    tone(vary(1320, 0.03), 0.06, { type: "triangle", gain: 0.03 });
    tone(vary(1980, 0.03), 0.09, { type: "sine", gain: 0.02, delay: 0.02 }); // glass "tink"
  },
  deselect() {
    if (!sfxOn) return;
    tone(980, 0.06, { type: "triangle", gain: 0.022, slide: 760 });
  },
  lift() {
    if (!sfxOn) return;
    noise(0.16, { gain: 0.012, freq: 2600, q: 3, sweep: 3400 }); // glass sliding
  },
  /** Held trickle; returns a stop function. Volume follows the litres moved. */
  pourStart(litres = 2, kind = "pour") {
    if (!sfxOn) return () => {};
    const a = ac();
    if (!a) return () => {};
    const t0 = a.currentTime;
    const src = a.createBufferSource();
    src.buffer = noiseBuffer(a);
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = kind === "drain" ? 520 : vary(1350, 0.05);
    f.Q.value = kind === "drain" ? 1.4 : 0.9;
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.frequency.value = 7 + Math.random() * 3;
    lfoGain.gain.value = kind === "drain" ? 90 : 260;
    lfo.connect(lfoGain).connect(f.frequency);
    const g = a.createGain();
    const level = Math.min(0.06, 0.03 + litres * 0.003);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(level, t0 + 0.06);
    src.connect(f).connect(g).connect(master);
    src.start(t0, Math.random());
    lfo.start(t0);
    const dropTimer = setInterval(() => sfxOn && kind !== "drain" && drop(0, 700 + Math.random() * 600), 150);
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      held.delete(stop);
      clearInterval(dropTimer);
      const t = a.currentTime;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        src.stop(t + 0.12);
        lfo.stop(t + 0.12);
      } catch {
        /* already stopped */
      }
    };
    held.add(stop);
    return stop;
  },
  splash() {
    if (!sfxOn) return;
    noise(0.22, { gain: 0.02, freq: 900, q: 0.7, sweep: 400 });
    drop(0.03, 600);
    drop(0.09, 820);
  },
  stopAll() {
    for (const stop of [...held]) stop();
  },
  /** DEV inspection: how many held (looping) sounds are playing right now. */
  heldCount() {
    return held.size;
  },
  invalid() {
    if (!sfxOn) return;
    tone(vary(196, 0.03), 0.13, { type: "sine", gain: 0.07, slide: 150 });
    tone(392, 0.05, { type: "triangle", gain: 0.012 });
  },
  unlock() {
    if (!sfxOn) return;
    noise(0.08, { gain: 0.03, freq: 3000, q: 2 });
    [659.25, 987.77, 1318.5].forEach((f, i) => tone(f, 0.3, { gain: 0.03, delay: 0.05 + i * 0.07 }));
  },
  undo() {
    if (!sfxOn) return;
    noise(0.2, { gain: 0.016, freq: 1600, sweep: 700, q: 1 });
    tone(880, 0.1, { type: "triangle", gain: 0.022, slide: 620 });
  },
  hint() {
    if (!sfxOn) return;
    tone(988, 0.12, { gain: 0.03 });
    tone(1318, 0.18, { gain: 0.026, delay: 0.09 });
  },
  target() {
    if (!sfxOn) return;
    [783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.45, { gain: 0.035, delay: i * 0.08 }));
    drop(0.32, 1200);
  },
  complete() {
    if (!sfxOn) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.55, { gain: 0.04, delay: i * 0.09 }));
    tone(1568, 0.9, { gain: 0.014, delay: 0.38 });
  },
  star(i) {
    if (!sfxOn) return;
    tone([880, 1108.7, 1318.5][i] || 1318.5, 0.3, { type: "triangle", gain: 0.035 });
  },
  ui() {
    if (!sfxOn) return;
    tone(660, 0.05, { type: "triangle", gain: 0.026, slide: 820 });
  },
};

/**
 * Background: a slow, quiet lab pad — two detuned sines per chord through
 * one bus (mute is immediate), plus an occasional distant drip.
 */
export class Music {
  constructor() {
    this.enabled = false;
    this.bus = null;
    this.timer = null;
    this.i = 0;
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
      if (this.enabled) this.bus.gain.setTargetAtTime(1, a.currentTime, 0.9);
      else this.bus.gain.setValueAtTime(0, a.currentTime);
    }
  }
  _step() {
    const a = ctx;
    if (!a || !this.bus) return;
    if (this.enabled && document.visibilityState !== "hidden") {
      const root = 196;
      const chords = [[1, 1.5, 2.52], [0.89, 1.335, 2], [0.75, 1.125, 1.888], [0.84, 1.26, 2.25]];
      this.i = (this.i + 1) % chords.length;
      const now = a.currentTime;
      chords[this.i].forEach((m, k) => {
        for (const det of [-2, 2]) {
          const o = a.createOscillator();
          const g = a.createGain();
          o.type = "sine";
          o.frequency.value = root * m;
          o.detune.value = det;
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(k === 2 ? 0.004 : 0.008, now + 2);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 7);
          o.connect(g).connect(this.bus);
          o.start(now);
          o.stop(now + 7.2);
        }
      });
      if (Math.random() > 0.45) {
        const f = vary(1400, 0.2);
        tone(f, 0.08, { gain: 0.006, slide: f * 1.8, delay: 1.5 + Math.random() * 3, bus: this.bus });
      }
    }
    this.timer = setTimeout(() => this._step(), 6200);
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
