/**
 * Police Escape 3D — all sound is synthesized with Web Audio (no assets).
 *
 *   master ─┬─ music  a pulsing chase sequencer (bass, stabs, arpeggio,
 *           │         drums); key + tempo per district, calmer in the menus
 *           ├─ sfx    countdown, GO, impacts, nitro, checkpoint, near miss,
 *           │         roadblock warning, escape fanfare, busted sting, UI
 *           └─ loops  engine (two oscillators through a fake gearbox), tyre
 *                     skid, nitro roar, wind, the police SIREN (a two-tone
 *                     wail whose volume follows the nearest pursuing car),
 *                     distant traffic hum, rain (Rain City)
 *
 * The context starts on the first user gesture (start()). Mute zeroes the
 * master at once without touching saved volumes; pause suspends the context.
 */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MOODS = {
  menu: { root: 57, tempo: 96, minor: true },
  downtown: { root: 57, tempo: 132, minor: true },
  industrial: { root: 55, tempo: 126, minor: true },
  coastal: { root: 62, tempo: 128, minor: false },
  rain: { root: 52, tempo: 124, minor: true },
  metro: { root: 59, tempo: 140, minor: true },
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
const GEARS = [0, 10, 18, 26, 34, 44, 70];

export class ChaseAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
    this.vol = { master: 0.85, music: 0.4, sfx: 0.9 };
    this.mood = MOODS.menu;
    this.step16 = 0;
    this.nextNote = 0;
    this.loops = null;
    this.gear = 1;
    this.rain = false;
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

  setMood(theme, rain = false) {
    this.mood = MOODS[theme] || MOODS.menu;
    this.rain = rain;
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.loops = null;
  }

  // --- continuous loops -----------------------------------------------------------
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
    // siren: a triangle wave swept by a slow LFO (wail) through a bandpass
    const sg = c.createGain();
    sg.gain.value = 0;
    const so = c.createOscillator();
    so.type = "triangle";
    so.frequency.value = 900;
    const lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.45;
    const lg = c.createGain();
    lg.gain.value = 320;
    lfo.connect(lg).connect(so.frequency);
    const sf = c.createBiquadFilter();
    sf.type = "bandpass";
    sf.frequency.value = 1100;
    sf.Q.value = 0.8;
    so.connect(sf).connect(sg).connect(this.sfxBus);
    so.start();
    lfo.start();
    const skid = noiseLoop("bandpass", 2400, 3.5);
    const roar = noiseLoop("bandpass", 700, 0.8);
    const wind = noiseLoop("bandpass", 500, 0.6);
    const hum = noiseLoop("lowpass", 260, 0.5);
    const rain = noiseLoop("highpass", 2600, 0.4);
    this.loops = { eg, ef, o1, o2, sg, skid, roar, wind, hum, rain };
    return this.loops;
  }

  silenceLoops() {
    if (!this.loops || !this.ctx) return;
    const t = this.ctx.currentTime;
    const L = this.loops;
    for (const g of [L.eg, L.sg, L.skid.g, L.roar.g, L.wind.g, L.hum.g, L.rain.g]) g.gain.setTargetAtTime(0, t, 0.08);
  }

  /** Per frame while playing. */
  update(run) {
    if (!this.ctx || this.paused) return;
    const L = this.ensureLoops();
    if (!L) return;
    const t = this.ctx.currentTime;
    const car = run.player;
    const v = Math.abs(car.fwd);
    const over = run.state === "BUSTED" || run.state === "MISSION_COMPLETE";
    let g = 1;
    while (g < GEARS.length - 1 && v > GEARS[g]) g++;
    const k = Math.min(1, (v - GEARS[g - 1]) / Math.max(1, GEARS[g] - GEARS[g - 1]));
    const load = car.throttle > 0 || car.nitroOn ? 1 : 0.35;
    const rpm = 0.28 + k * 0.62;
    const base = 44 + rpm * 118 + (car.nitroOn ? 16 : 0);
    L.o1.frequency.setTargetAtTime(base, t, g !== this.gear ? 0.09 : 0.04);
    L.o2.frequency.setTargetAtTime(base * 0.5, t, 0.04);
    L.ef.frequency.setTargetAtTime(500 + load * 1400 + rpm * 900, t, 0.06);
    this.gear = g;
    L.eg.gain.setTargetAtTime(over ? 0.02 : 0.05 + load * 0.06 + rpm * 0.04, t, 0.06);
    const vn = Math.min(1.4, v / 40);
    L.wind.f.frequency.setTargetAtTime(350 + vn * 900, t, 0.1);
    L.wind.g.gain.setTargetAtTime(0.01 + vn * vn * 0.1, t, 0.1);
    const slide = v > 6 && (car.handbrake || Math.abs(car.slip) > 3 || car.braking);
    L.skid.g.gain.setTargetAtTime(slide && !over ? 0.05 + Math.min(0.08, Math.abs(car.slip) * 0.01) : 0, t, 0.04);
    L.roar.g.gain.setTargetAtTime(car.nitroOn ? 0.16 : 0, t, 0.05);
    L.roar.f.frequency.setTargetAtTime(600 + vn * 900, t, 0.06);
    // siren: louder as the nearest pursuing car gets closer
    let near = Infinity;
    for (const c of run.police) if (c.state !== "LOST" && c.state !== "DISABLED") near = Math.min(near, c.distToPlayer);
    const sv = run.state === "COUNTDOWN" ? 0.05 : Number.isFinite(near) ? Math.max(0, 1 - near / 220) : 0;
    L.sg.gain.setTargetAtTime(over && run.state !== "BUSTED" ? 0 : sv * sv * 0.11 + (sv > 0 ? 0.008 : 0), t, 0.15);
    let traffic = 0;
    for (const tc of run.traffic.cars) if (tc.active) traffic = Math.max(traffic, Math.max(0, 1 - Math.hypot(tc.x - car.x, tc.z - car.z) / 60));
    L.hum.g.gain.setTargetAtTime(0.01 + traffic * 0.05, t, 0.2);
    L.rain.g.gain.setTargetAtTime(this.rain ? 0.05 : 0, t, 0.3);
  }

  // --- one-shots --------------------------------------------------------------------
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
        case "hit": {
          const k = Math.min(1, (e.vn || 5) / 20);
          this.noiseHit({ type: "lowpass", freq: 420 + k * 300, dur: 0.18 + k * 0.2, gain: 0.2 + k * 0.4 });
          this.noiseHit({ type: "highpass", freq: 3200, dur: 0.12 + k * 0.15, gain: 0.05 + k * 0.12 });
          this.tone({ freq: 150, type: "triangle", dur: 0.14, gain: 0.08 + k * 0.08, to: 70 });
          if (e.kind === "traffic" && k > 0.2) this.tone({ freq: 415, type: "square", dur: 0.35, gain: 0.05, at: 0.12 }); // horn
          break;
        }
        case "nitro":
          this.tone({ freq: 660, type: "triangle", dur: 0.12, gain: 0.08 });
          this.tone({ freq: 1320, type: "triangle", dur: 0.2, gain: 0.07, at: 0.06 });
          break;
        case "nearMiss":
          this.noiseHit({ type: "bandpass", freq: 900, sweep: 300, dur: 0.35, gain: 0.12, q: 1.2 });
          break;
        case "checkpoint":
          this.tone({ freq: 1568, type: "sine", dur: 0.12, gain: 0.07 });
          this.tone({ freq: 2093, type: "sine", dur: 0.18, gain: 0.06, at: 0.07 });
          break;
        case "copDisabled":
          this.noiseHit({ type: "lowpass", freq: 300, dur: 0.6, gain: 0.3 });
          this.tone({ freq: 700, type: "sine", dur: 0.6, gain: 0.05, to: 200 });
          break;
        case "copLost":
          this.tone({ freq: 880, type: "triangle", dur: 0.12, gain: 0.05 });
          this.tone({ freq: 660, type: "triangle", dur: 0.2, gain: 0.05, at: 0.1 });
          break;
        case "roadblockWarn":
          [0, 0.18].forEach((a) => this.tone({ freq: 740, type: "square", dur: 0.12, gain: 0.06, at: a }));
          break;
        case "zoneOpen":
          [72, 79, 84].forEach((m, i) => this.tone({ freq: mtof(m), type: "triangle", dur: 0.2, gain: 0.07, at: i * 0.08 }));
          break;
        case "intensity":
          this.tone({ freq: 330, type: "sawtooth", dur: 0.5, gain: 0.05, to: 660 });
          break;
        case "complete":
          this.noiseHit({ type: "highpass", freq: 3000, dur: 1.2, gain: 0.08 });
          [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => this.tone({ freq: mtof(m), type: "square", dur: 0.28, gain: 0.08, at: 0.15 + i * 0.13 }));
          break;
        case "busted":
          [64, 60, 57, 52].forEach((m, i) => this.tone({ freq: mtof(m), type: "sawtooth", dur: 0.4, gain: 0.07, at: i * 0.2 }));
          break;
        default:
          break;
      }
    }
  }

  // --- music -----------------------------------------------------------------------
  schedule() {
    if (!this.ctx || this.paused || this.ctx.state !== "running") return;
    const c = this.ctx;
    const M = this.mood;
    const sixteenth = 60 / M.tempo / 4;
    if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.05;
    while (this.nextNote < c.currentTime + 0.2) {
      if (this.vol.music > 0) this.beat(this.nextNote, this.step16, M);
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
    if (s % 4 === 0) this.tone({ freq: 100, type: "sine", dur: 0.2, gain: calm ? 0.18 : 0.32, to: 40, at, bus });
    if (!calm && s % 8 === 4) this.musicNoise(at, 1500, 0.14, 0.16);
    if (s % 2 === 1) this.musicNoise(at, 7800, 0.03, calm ? 0.02 : 0.045);
    // driving bass (8ths)
    if (s % 2 === 0) {
      const n = root - 24 + chord[0] + (s % 8 === 6 ? 12 : 0);
      this.tone({ freq: mtof(n), type: calm ? "triangle" : "sawtooth", dur: sx * 1.6, gain: calm ? 0.1 : 0.06, at, bus });
    }
    if (!calm && (s % 16 === 0 || s % 16 === 6)) for (const k of chord) this.tone({ freq: mtof(root + k), type: "square", dur: 0.14, gain: 0.02, at, bus });
    if (calm && s % 16 === 0) for (const k of chord) this.tone({ freq: mtof(root + k), type: "triangle", dur: 1.9, gain: 0.03, attack: 0.15, at, bus });
    if (!calm && s % 4 === 2) this.tone({ freq: mtof(root + 12 + chord[(s / 4) % 3 | 0]), type: "triangle", dur: 0.12, gain: 0.03, at, bus });
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
