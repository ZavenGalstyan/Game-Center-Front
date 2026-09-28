/**
 * Parking Jam — tiny WebAudio synth (no files, no libraries).
 *
 * Two gates: `sfx.setEnabled` for effects and `Ambience.setEnabled` for the
 * music + per-world background. ParkingJam.jsx drives both from
 * `setting && !muted`, so the shared GamePlayer Mute silences everything at
 * once (buses are cut to zero immediately) without overwriting preferences.
 * Every effect gets a little pitch/volume variation so repeated exits never
 * sound like the same sample.
 */

let ctx = null;
let master = null;
let sfxOn = true;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

const vary = (x, amt = 0.08) => x * (1 + (Math.random() * 2 - 1) * amt);

function tone(freq, dur, { type = "sine", gain = 0.06, slide = null, delay = 0, attack = 0.006, filter = null, bus = null } = {}) {
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
  let node = o;
  if (filter) {
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filter;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(bus || master);
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

function noise(dur, { gain = 0.03, freq = 1800, q = 0.8, delay = 0, type = "bandpass", sweep = null, attack = 0.01, bus = null } = {}) {
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
  src.connect(f).connect(g).connect(bus || master);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
}

export const sfx = {
  setEnabled(v) {
    sfxOn = Boolean(v);
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(sfxOn ? 0.85 : 0, ctx.currentTime);
    }
  },
  /** engine start + pull away; bigger vehicles sound lower */
  engine(size = 2) {
    if (!sfxOn) return;
    const base = vary(size >= 4 ? 44 : size === 3 ? 52 : 62, 0.1);
    tone(base, 0.5, { type: "sawtooth", gain: vary(0.05, 0.15), slide: base * 2.6, filter: 420, attack: 0.03 });
    tone(base * 1.5, 0.42, { type: "square", gain: 0.012, slide: base * 3.4, filter: 300, attack: 0.04 });
    noise(0.36, { gain: vary(0.028, 0.2), freq: 700, q: 0.7, sweep: 1600, delay: 0.08 }); // tyres
  },
  blocked() {
    if (!sfxOn) return;
    tone(vary(130, 0.05), 0.14, { type: "sine", gain: 0.09, slide: 72 });
    noise(0.05, { gain: 0.03, freq: 420, q: 1.2 });
  },
  tap() {
    if (!sfxOn) return;
    tone(vary(880, 0.04), 0.05, { type: "triangle", gain: 0.022, slide: 1180 });
  },
  undo() {
    if (!sfxOn) return;
    noise(0.28, { gain: 0.03, freq: 1800, sweep: 500, q: 0.9 });
    tone(740, 0.12, { type: "triangle", gain: 0.03, slide: 520 });
    tone(988, 0.08, { type: "sine", gain: 0.022, delay: 0.22 }); // soft reverse beep
  },
  hint() {
    if (!sfxOn) return;
    tone(988, 0.12, { gain: 0.035 });
    tone(1318, 0.18, { gain: 0.03, delay: 0.09 });
  },
  ui() {
    if (!sfxOn) return;
    tone(620, 0.05, { type: "triangle", gain: 0.03, slide: 760 });
  },
  back() {
    if (!sfxOn) return;
    tone(480, 0.06, { type: "triangle", gain: 0.03, slide: 360 });
  },
  lastCar() {
    if (!sfxOn) return;
    tone(1046.5, 0.25, { gain: 0.03, delay: 0.1 });
  },
  complete() {
    if (!sfxOn) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.5, { gain: 0.05, delay: i * 0.09 }));
    tone(1568, 0.8, { gain: 0.018, delay: 0.36 });
  },
  star(i) {
    if (!sfxOn) return;
    tone([880, 1108.7, 1318.5][i] || 1318.5, 0.3, { type: "triangle", gain: 0.04 });
  },
  unlock() {
    if (!sfxOn) return;
    [659.25, 987.77, 1318.5].forEach((f, i) => tone(f, 0.35, { gain: 0.035, delay: i * 0.07 }));
  },
};

/**
 * Background: a slow puzzle pad + a per-world ambience bed with occasional
 * events (birds, distant jets, a far-off horn…). One instance, owned by
 * ParkingJam.jsx; everything routes through one bus so mute is instant.
 */
export class Ambience {
  constructor() {
    this.enabled = false;
    this.bus = null;
    this.bed = null;
    this.timer = null;
    this.eventTimer = null;
    this.kind = "birds";
    this.root = 220;
    this.i = 0;
  }
  setWorld(kind) {
    const roots = { birds: 220, garage: 196, mall: 246.94, airport: 207.65, night: 174.61 };
    if (kind === this.kind) return;
    this.kind = kind;
    this.root = roots[kind] || 220;
    if (this.bus) this._startBed();
  }
  setEnabled(v) {
    this.enabled = Boolean(v);
    const a = this.enabled ? ac() : ctx;
    if (!a) return;
    if (this.enabled && !this.bus) {
      this.bus = a.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(a.destination);
      this._startBed();
      this._step();
      this._event();
    }
    if (this.bus) {
      this.bus.gain.cancelScheduledValues(a.currentTime);
      if (this.enabled) this.bus.gain.setTargetAtTime(1, a.currentTime, 0.8);
      else this.bus.gain.setValueAtTime(0, a.currentTime); // mute is immediate
    }
  }
  _startBed() {
    const a = ctx;
    if (!a || !this.bus) return;
    if (this.bed) {
      try {
        this.bed.src.stop();
      } catch {
        /* already stopped */
      }
    }
    const src = a.createBufferSource();
    src.buffer = noiseBuffer(a);
    src.loop = true;
    const f = a.createBiquadFilter();
    const conf = {
      birds: ["lowpass", 900, 0.004], garage: ["lowpass", 260, 0.012], mall: ["bandpass", 700, 0.006],
      airport: ["lowpass", 180, 0.014], night: ["lowpass", 320, 0.008],
    }[this.kind] || ["lowpass", 600, 0.006];
    f.type = conf[0];
    f.frequency.value = conf[1];
    const g = a.createGain();
    g.gain.value = conf[2];
    src.connect(f).connect(g).connect(this.bus);
    src.start();
    this.bed = { src };
  }
  _step() {
    const a = ctx;
    if (!a || !this.bus) return;
    if (this.enabled) {
      const chords = [[1, 1.25, 1.5], [0.889, 1.122, 1.335], [0.75, 1, 1.25], [0.844, 1.125, 1.5]];
      this.i = (this.i + 1) % chords.length;
      const now = a.currentTime;
      chords[this.i].forEach((m) => {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = "sine";
        o.frequency.value = this.root * m;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.012, now + 1.6);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 5.8);
        o.connect(g).connect(this.bus);
        o.start(now);
        o.stop(now + 6);
      });
      // an occasional soft pluck on top
      if (Math.random() > 0.4) {
        const penta = [1, 1.125, 1.25, 1.5, 1.667, 2];
        tone(this.root * 2 * penta[Math.floor(Math.random() * penta.length)], 0.9, { type: "triangle", gain: 0.012, delay: 1 + Math.random() * 2, bus: this.bus });
      }
    }
    this.timer = setTimeout(() => this._step(), 5200);
  }
  _event() {
    if (this.bus && this.enabled) {
      const k = this.kind;
      if (k === "birds") {
        const f = 2400 + Math.random() * 1400;
        for (let n = 0; n < 2 + Math.floor(Math.random() * 3); n++) {
          tone(f, 0.08, { gain: 0.012, slide: f * 1.3, delay: n * 0.12, bus: this.bus });
        }
      } else if (k === "airport") {
        noise(4.5, { gain: 0.02, freq: 240, sweep: 120, q: 0.5, attack: 1.8, type: "lowpass", bus: this.bus });
      } else if (k === "night") {
        if (Math.random() > 0.5) tone(392, 0.35, { type: "square", gain: 0.006, filter: 900, delay: 0.1, bus: this.bus });
        else noise(2.4, { gain: 0.012, freq: 400, sweep: 900, q: 0.6, attack: 0.9, bus: this.bus });
      } else if (k === "garage") {
        noise(1.8, { gain: 0.01, freq: 300, sweep: 600, q: 0.6, attack: 0.6, bus: this.bus });
      } else {
        noise(1.2, { gain: 0.008, freq: 1400, q: 1.5, attack: 0.3, bus: this.bus });
      }
    }
    this.eventTimer = setTimeout(() => this._event(), 5000 + Math.random() * 7000);
  }
  dispose() {
    clearTimeout(this.timer);
    clearTimeout(this.eventTimer);
    this.timer = null;
    this.eventTimer = null;
    try {
      this.bed?.src.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.bus?.disconnect();
    } catch {
      /* already gone */
    }
    this.bed = null;
    this.bus = null;
  }
}
