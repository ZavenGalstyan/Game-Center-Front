/**
 * Stunt Racer 3D — all sound is synthesized with Web Audio (no assets).
 *
 *   master ─┬─ music  a driving sequencer (bass, chords, arpeggio, drums);
 *           │         key + tempo per world, calmer groove in the menus
 *           ├─ sfx    countdown, GO, jumps, landings, hits, falls, stars,
 *           │         nitro / boost, checkpoints, finish fanfare, UI
 *           └─ loops  engine (two detuned oscillators through a fake
 *                     gearbox: pitch climbs through each gear and drops on
 *                     the shift), wind (rises with speed and in the air),
 *                     tyre skid (handbrake / slides / braking), nitro roar
 *
 * The context starts on the first user gesture (start()). Mute zeroes the
 * master at once without touching saved volumes; pause suspends the context.
 * dispose() closes it; a later start() rebuilds (StrictMode remounts).
 */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MOODS = {
  menu: { root: 57, tempo: 100, minor: false },
  sky: { root: 64, tempo: 132, minor: false },
  desert: { root: 62, tempo: 128, minor: true },
  ocean: { root: 65, tempo: 126, minor: false },
  neon: { root: 57, tempo: 138, minor: true },
  extreme: { root: 60, tempo: 142, minor: true },
};
const PROG_MAJ = [
  [0, 4, 7],
  [-3, 0, 4],
  [5, 9, 12],
  [7, 11, 14],
];
const PROG_MIN = [
  [0, 3, 7],
  [-4, 0, 3],
  [-2, 2, 5],
  [-5, -1, 2],
];
const GEARS = [0, 11, 20, 29, 38, 48, 70];

export class RaceAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
    this.vol = { master: 0.85, music: 0.45, sfx: 0.9 };
    this.mood = MOODS.menu;
    this.musicOn = true;
    this.step16 = 0;
    this.nextNote = 0;
    this.loops = null;
    this.gear = 1;
  }

  start() {
    if (!this.ctx) {
      const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === "suspended" && !this.paused) this.ctx.resume().catch(() => {});
  }

  build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol.master;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.vol.music * 0.4;
    this.musicBus.connect(this.master);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.vol.sfx;
    this.sfxBus.connect(this.master);
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.loops = null;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  setMuted(m) {
    this.muted = !!m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.muted ? 0 : this.vol.master, t);
  }

  setVolumes(v) {
    this.vol = { ...this.vol, ...v };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.muted) this.master.gain.setTargetAtTime(this.vol.master, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.4, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.03);
  }

  setPaused(p) {
    this.paused = !!p;
    if (!this.ctx) return;
    if (this.paused) this.ctx.suspend().catch(() => {});
    else if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setMood(theme) {
    this.mood = MOODS[theme] || MOODS.menu;
  }

  setMusic(on) {
    this.musicOn = on;
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.loops = null;
  }

  // --- continuous loops -------------------------------------------------------------
  ensureLoops() {
    if (this.loops || !this.ctx) return this.loops;
    const c = this.ctx;
    const noiseLoop = (type, freq, q) => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      s.connect(f).connect(g).connect(this.sfxBus);
      s.start(0, Math.random());
      return { g, f };
    };
    // engine: saw + square an octave down, through a lowpass that opens with load
    const eg = c.createGain();
    eg.gain.value = 0;
    const ef = c.createBiquadFilter();
    ef.type = "lowpass";
    ef.frequency.value = 900;
    ef.Q.value = 2;
    const o1 = c.createOscillator();
    o1.type = "sawtooth";
    const o2 = c.createOscillator();
    o2.type = "square";
    const o2g = c.createGain();
    o2g.gain.value = 0.5;
    o1.connect(ef);
    o2.connect(o2g).connect(ef);
    ef.connect(eg).connect(this.sfxBus);
    o1.start();
    o2.start();
    const wind = noiseLoop("bandpass", 500, 0.6);
    const skid = noiseLoop("bandpass", 2400, 3.5);
    const roar = noiseLoop("bandpass", 700, 0.8);
    this.loops = { eg, ef, o1, o2, wind, skid, roar };
    return this.loops;
  }

  silenceLoops() {
    if (!this.loops || !this.ctx) return;
    const t = this.ctx.currentTime;
    const L = this.loops;
    for (const g of [L.eg, L.wind.g, L.skid.g, L.roar.g]) g.gain.setTargetAtTime(0, t, 0.08);
  }

  /** Per frame while driving. */
  update(run) {
    if (!this.ctx || this.paused) return;
    const L = this.ensureLoops();
    if (!L) return;
    const t = this.ctx.currentTime;
    const car = run.car;
    const v = Math.abs(car.fwd);
    const ground = car.mode === "ground";
    const falling = car.mode === "fall";
    // fake gearbox
    let g = 1;
    while (g < GEARS.length - 1 && v > GEARS[g]) g++;
    const lo = GEARS[g - 1];
    const hi = GEARS[g];
    const k = Math.min(1, (v - lo) / Math.max(1, hi - lo));
    const load = car.throttle > 0 || car.nitroOn ? 1 : 0.35;
    const air = car.mode === "air";
    const rpm = falling ? 0.3 : air && load > 0.5 ? 0.95 : 0.28 + k * 0.62;
    const base = 46 + rpm * 120 + (car.nitroOn ? 18 : 0);
    L.o1.frequency.setTargetAtTime(base, t, g !== this.gear ? 0.09 : 0.04);
    L.o2.frequency.setTargetAtTime(base * 0.5, t, 0.04);
    L.ef.frequency.setTargetAtTime(500 + load * 1400 + rpm * 900, t, 0.06);
    this.gear = g;
    const idle = run.state === "COMPLETE" ? 0.03 : 0.05;
    L.eg.gain.setTargetAtTime(falling ? 0 : idle + load * 0.06 + rpm * 0.04, t, 0.06);
    // wind
    const vn = Math.min(1.4, v / 42);
    L.wind.f.frequency.setTargetAtTime(350 + vn * 900 + (air ? 300 : 0), t, 0.1);
    L.wind.g.gain.setTargetAtTime(0.01 + vn * vn * 0.12 + (air ? 0.06 : 0) + (falling ? 0.12 : 0), t, 0.1);
    // skid
    const slide = ground && v > 6 && (car.handbrake || Math.abs(car.slip) > 2.5 || car.braking);
    L.skid.g.gain.setTargetAtTime(slide ? 0.05 + Math.min(0.08, Math.abs(car.slip) * 0.01) : 0, t, 0.04);
    // nitro / boost roar
    L.roar.g.gain.setTargetAtTime(car.nitroOn ? 0.16 : car.boostT > 0 ? 0.08 : 0, t, 0.05);
    L.roar.f.frequency.setTargetAtTime(600 + vn * 900, t, 0.06);
  }

  // --- one-shots -----------------------------------------------------------------------
  tone({ freq = 440, type = "sine", dur = 0.2, gain = 0.15, attack = 0.005, to = null, at = 0, bus = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseHit({ type = "lowpass", freq = 800, q = 0.7, dur = 0.1, gain = 0.3, sweep = null, at = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  ui() {
    this.tone({ freq: 880, type: "triangle", dur: 0.07, gain: 0.08, to: 1320 });
  }
  select() {
    this.tone({ freq: 660, type: "square", dur: 0.09, gain: 0.05 });
    this.tone({ freq: 990, type: "square", dur: 0.12, gain: 0.05, at: 0.07 });
  }
  locked() {
    this.tone({ freq: 220, type: "square", dur: 0.14, gain: 0.05, to: 160 });
  }
  unlock() {
    [72, 76, 79, 84].forEach((m, i) => this.tone({ freq: mtof(m), type: "triangle", dur: 0.35, gain: 0.1, at: i * 0.08 }));
  }

  onEvents(events) {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.type) {
        case "count":
          this.tone({ freq: 587, type: "square", dur: 0.22, gain: 0.09 });
          break;
        case "go":
          this.tone({ freq: 1175, type: "square", dur: 0.5, gain: 0.1 });
          this.tone({ freq: 880, type: "triangle", dur: 0.5, gain: 0.08 });
          break;
        case "takeoff":
          this.noiseHit({ type: "bandpass", freq: 400, sweep: 2000, dur: 0.45, gain: 0.16, q: 0.8 });
          break;
        case "land": {
          if (e.tiny) break;
          const k = Math.min(1, (e.hard || 0) + (e.airT > 0.8 ? 0.3 : 0));
          this.noiseHit({ type: "lowpass", freq: 240 + k * 200, dur: 0.2 + k * 0.15, gain: 0.25 + k * 0.35 });
          this.tone({ freq: 110, type: "sine", dur: 0.22, gain: 0.14 + k * 0.14, to: 45 });
          if (e.quality === "sketchy") this.noiseHit({ type: "bandpass", freq: 2600, q: 3, dur: 0.4, gain: 0.12 });
          break;
        }
        case "clean":
          [79, 84].forEach((m, i) => this.tone({ freq: mtof(m), type: "triangle", dur: 0.14, gain: 0.06, at: i * 0.07 }));
          break;
        case "wall":
        case "hit":
          this.noiseHit({ type: "lowpass", freq: 520, dur: 0.22, gain: 0.25 + (e.hard || 0.5) * 0.3 });
          this.noiseHit({ type: "highpass", freq: 3000, dur: 0.12, gain: 0.06 + (e.hard || 0.5) * 0.08 });
          this.tone({ freq: 140, type: "triangle", dur: 0.14, gain: 0.08, to: 70 });
          break;
        case "crash":
          this.tone({ freq: 900, type: "sine", dur: 1.0, gain: 0.08, to: 180 });
          this.noiseHit({ type: "bandpass", freq: 900, sweep: 200, dur: 1.0, gain: 0.12, q: 1 });
          break;
        case "respawn":
          this.tone({ freq: 440, type: "triangle", dur: 0.15, gain: 0.07, to: 880 });
          break;
        case "nitroOn":
          this.noiseHit({ type: "bandpass", freq: 300, sweep: 2400, dur: 0.5, gain: 0.2, q: 0.9 });
          this.tone({ freq: 160, type: "sawtooth", dur: 0.4, gain: 0.05, to: 600 });
          break;
        case "boost":
          this.noiseHit({ type: "bandpass", freq: 500, sweep: 2600, dur: 0.45, gain: 0.18, q: 1 });
          this.tone({ freq: 523, type: "square", dur: 0.08, gain: 0.05 });
          this.tone({ freq: 784, type: "square", dur: 0.1, gain: 0.05, at: 0.06 });
          break;
        case "nitro":
          this.tone({ freq: 660, type: "triangle", dur: 0.12, gain: 0.08 });
          this.tone({ freq: 1320, type: "triangle", dur: 0.2, gain: 0.07, at: 0.06 });
          break;
        case "star":
          [88, 91, 96].forEach((m, i) => this.tone({ freq: mtof(m), type: "sine", dur: 0.25, gain: 0.08, at: i * 0.06 }));
          break;
        case "checkpoint":
          this.tone({ freq: 1568, type: "sine", dur: 0.12, gain: 0.07 });
          this.tone({ freq: 2093, type: "sine", dur: 0.18, gain: 0.06, at: 0.07 });
          break;
        case "crumble":
          this.noiseHit({ type: "lowpass", freq: 300, dur: 0.35, gain: 0.12 });
          break;
        case "finish": {
          const gold = e.results && e.results.medal === "gold";
          const seq = gold ? [72, 76, 79, 84, 79, 84, 88] : [72, 76, 79, 84];
          this.noiseHit({ type: "highpass", freq: 3000, dur: 1.2, gain: 0.08 });
          seq.forEach((m, i) => this.tone({ freq: mtof(m), type: gold ? "square" : "triangle", dur: 0.28, gain: 0.08, at: 0.15 + i * 0.13 }));
          break;
        }
        default:
          break;
      }
    }
  }

  // --- music ------------------------------------------------------------------------------
  schedule() {
    if (!this.ctx || this.paused || this.ctx.state !== "running") return;
    const c = this.ctx;
    const M = this.mood;
    const sixteenth = 60 / M.tempo / 4;
    if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.05;
    while (this.nextNote < c.currentTime + 0.2) {
      if (this.musicOn && this.vol.music > 0) this.beat(this.nextNote, this.step16, M);
      this.step16 = (this.step16 + 1) % 64;
      this.nextNote += sixteenth;
    }
  }

  beat(t, s, M) {
    const c = this.ctx;
    const prog = M.minor ? PROG_MIN : PROG_MAJ;
    const chord = prog[Math.floor(s / 16) % 4];
    const root = M.root;
    const bus = this.musicBus;
    const at = t - c.currentTime;
    const calm = M === MOODS.menu;
    const sx = 60 / M.tempo / 4;
    if (s % 4 === 0) this.tone({ freq: 110, type: "sine", dur: 0.18, gain: calm ? 0.16 : 0.3, to: 42, at, bus });
    if (!calm && s % 8 === 4) this.musicNoise(at, 1600, 0.14, 0.15);
    if (s % 2 === 1) this.musicNoise(at, 7500, 0.03, calm ? 0.025 : 0.045);
    if (s % 4 === 0 || s % 4 === 3) {
      const n = root - 24 + chord[0] + (s % 4 === 3 ? 7 : 0);
      this.tone({ freq: mtof(n), type: calm ? "triangle" : "sawtooth", dur: sx * 1.6, gain: calm ? 0.12 : 0.07, at, bus });
    }
    if (!calm && (s % 16 === 2 || s % 16 === 10)) for (const k of chord) this.tone({ freq: mtof(root + k), type: "square", dur: 0.12, gain: 0.022, at, bus });
    if (calm && s % 16 === 0) for (const k of chord) this.tone({ freq: mtof(root + k), type: "triangle", dur: 1.8, gain: 0.035, attack: 0.1, at, bus });
    if (s % 2 === 0) {
      const i = (s / 2) % 4;
      const n = root + 12 + chord[i % 3] + (i === 3 ? 12 : 0);
      if (!calm || s % 4 === 0) this.tone({ freq: mtof(n), type: calm ? "sine" : "triangle", dur: 0.14, gain: calm ? 0.032 : 0.036, at, bus });
    }
  }

  musicNoise(at, freq, dur, gain) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }
}
