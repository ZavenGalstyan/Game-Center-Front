/**
 * Kart Legends — all sound is synthesized with Web Audio (no assets).
 *
 *   master ─┬─ music  a bouncy sequencer (bass, chords, arpeggio, drums);
 *           │         key + tempo per world, calmer groove in the menus
 *           ├─ sfx    countdown beeps, GO, pads, pickups, bumps, walls,
 *           │         drift tiers, mini-turbos, laps, finish fanfare, UI
 *           └─ loops  the player's engine (pitch follows speed and boost),
 *                     tyre skid (drift / ice), off-road rumble, boost roar,
 *                     the nearest rival's engine
 *
 * The context starts on the first user gesture (start()). Mute zeroes the
 * master at once without touching saved volumes; pause suspends the context.
 * dispose() closes it; a later start() rebuilds (StrictMode remounts).
 */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MOODS = {
  menu: { root: 57, tempo: 104, minor: false },
  tropical: { root: 60, tempo: 132, minor: false },
  desert: { root: 62, tempo: 128, minor: true },
  snow: { root: 64, tempo: 124, minor: false },
  neon: { root: 57, tempo: 138, minor: true },
  sky: { root: 65, tempo: 130, minor: false },
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

export class KartAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
    this.vol = { master: 0.85, music: 0.5, sfx: 0.9 };
    this.mood = MOODS.menu;
    this.musicOn = true;
    this.step16 = 0;
    this.nextNote = 0;
    this.loops = null;
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
    this.musicBus.gain.value = this.vol.music * 0.45;
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
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.45, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.03);
  }

  setPaused(p) {
    this.paused = !!p;
    if (!this.ctx) return;
    if (this.paused) {
      this.ctx.suspend().catch(() => {});
    } else if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setMood(theme) {
    this.mood = MOODS[theme] || MOODS.menu;
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.loops = null;
  }

  // --- continuous loops (engine / skid / rumble / boost) --------------------
  ensureLoops() {
    if (this.loops || !this.ctx) return this.loops;
    const c = this.ctx;
    const mk = () => {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.sfxBus);
      return g;
    };
    // engine: saw + square an octave down, through a lowpass
    const eg = mk();
    const ef = c.createBiquadFilter();
    ef.type = "lowpass";
    ef.frequency.value = 900;
    ef.Q.value = 2;
    ef.connect(eg);
    const o1 = c.createOscillator();
    o1.type = "sawtooth";
    const o2 = c.createOscillator();
    o2.type = "square";
    const o2g = c.createGain();
    o2g.gain.value = 0.5;
    o1.connect(ef);
    o2.connect(o2g).connect(ef);
    o1.start();
    o2.start();
    // rival engine (nearest)
    const rg = mk();
    const rf = c.createBiquadFilter();
    rf.type = "lowpass";
    rf.frequency.value = 700;
    rf.connect(rg);
    const r1 = c.createOscillator();
    r1.type = "sawtooth";
    r1.connect(rf);
    r1.start();
    const noiseLoop = (type, freq, q) => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = mk();
      s.connect(f).connect(g);
      s.start();
      return { g, f };
    };
    const skid = noiseLoop("bandpass", 2400, 3);
    const rumble = noiseLoop("lowpass", 260, 1);
    const roar = noiseLoop("bandpass", 900, 0.8);
    this.loops = { eg, ef, o1, o2, rg, r1, skid, rumble, roar };
    return this.loops;
  }

  silenceLoops() {
    if (!this.loops || !this.ctx) return;
    const t = this.ctx.currentTime;
    const L = this.loops;
    for (const g of [L.eg, L.rg, L.skid.g, L.rumble.g, L.roar.g]) g.gain.setTargetAtTime(0, t, 0.08);
  }

  /** Per frame while racing. */
  update(race) {
    if (!this.ctx || this.paused) return;
    const L = this.ensureLoops();
    if (!L) return;
    const t = this.ctx.currentTime;
    const K = race.player.kart;
    const sp = Math.abs(K.vF) / K.p.maxSpeed;
    const rev = K.revving ? 0.55 + Math.sin(t * 9) * 0.05 : 0;
    const v = Math.max(sp, rev);
    // a little "gear" saw-tooth in the pitch so it isn't a siren
    const gear = (v * 3.2) % 1;
    const pitch = 55 + v * 120 + gear * 22 + (K.boostT > 0 ? 30 : 0);
    L.o1.frequency.setTargetAtTime(pitch, t, 0.04);
    L.o2.frequency.setTargetAtTime(pitch / 2, t, 0.04);
    L.ef.frequency.setTargetAtTime(500 + v * 1600 + (K.boostT > 0 ? 900 : 0), t, 0.05);
    L.eg.gain.setTargetAtTime(0.05 + v * 0.07, t, 0.05);
    const sliding = (K.drift.on || (K.ice && Math.abs(K.vS) > 2.5)) && Math.abs(K.vF) > 6;
    L.skid.g.gain.setTargetAtTime(sliding ? 0.07 + K.drift.tier * 0.015 : 0, t, 0.05);
    L.skid.f.frequency.setTargetAtTime(K.ice ? 3600 : 2200 + K.drift.tier * 300, t, 0.05);
    L.rumble.g.gain.setTargetAtTime(K.offroad && Math.abs(K.vF) > 3 ? 0.22 * Math.min(1, sp * 1.5) : 0, t, 0.06);
    L.roar.g.gain.setTargetAtTime(K.boostT > 0 ? 0.12 : 0, t, 0.06);
    // nearest rival
    let best = Infinity;
    let rv = 0;
    for (const r of race.racers) {
      if (r.isPlayer) continue;
      const d = Math.hypot(r.kart.x - K.x, r.kart.z - K.z);
      if (d < best) {
        best = d;
        rv = Math.abs(r.kart.vF) / r.kart.p.maxSpeed;
      }
    }
    const near = Math.max(0, 1 - best / 30);
    L.r1.frequency.setTargetAtTime(60 + rv * 125, t, 0.06);
    L.rg.gain.setTargetAtTime(near * near * 0.05, t, 0.08);
  }

  // --- one-shots -----------------------------------------------------------------
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
        case "pad":
          this.tone({ freq: 300, type: "sawtooth", dur: 0.45, gain: 0.08, to: 1400 });
          this.noiseHit({ type: "bandpass", freq: 500, sweep: 3000, dur: 0.45, gain: 0.18, q: 1.2 });
          break;
        case "pickup":
          this.tone({ freq: 1320, type: "sine", dur: 0.18, gain: 0.1 });
          this.tone({ freq: 1760, type: "sine", dur: 0.28, gain: 0.09, at: 0.07 });
          break;
        case "bump":
          this.noiseHit({ type: "lowpass", freq: 500, dur: 0.18, gain: 0.25 + e.hard * 0.3 });
          this.tone({ freq: 140, type: "sine", dur: 0.16, gain: 0.15, to: 70 });
          break;
        case "wall":
          this.noiseHit({ type: "lowpass", freq: 340, dur: 0.22, gain: 0.2 + Math.min(0.3, (e.hard || 0.5) * 0.3) });
          break;
        case "driftStart":
          this.tone({ freq: 220, type: "triangle", dur: 0.1, gain: 0.06, to: 330 });
          break;
        case "driftTier": {
          const f = [784, 988, 1319][Math.min(2, e.tier - 1)] || 784;
          this.tone({ freq: f, type: "square", dur: 0.12, gain: 0.05 });
          this.tone({ freq: f * 1.5, type: "triangle", dur: 0.16, gain: 0.05, at: 0.05 });
          break;
        }
        case "miniTurbo":
          this.noiseHit({ type: "bandpass", freq: 600, sweep: 2600, dur: 0.35 + e.tier * 0.1, gain: 0.16 + e.tier * 0.04, q: 1 });
          this.tone({ freq: 200, type: "sawtooth", dur: 0.3, gain: 0.05, to: 600 + e.tier * 200 });
          break;
        case "boost":
          this.noiseHit({ type: "bandpass", freq: 400, sweep: 2200, dur: 0.6, gain: 0.22, q: 0.9 });
          this.tone({ freq: 180, type: "sawtooth", dur: 0.5, gain: 0.06, to: 720 });
          break;
        case "checkpoint":
          this.tone({ freq: 1568, type: "sine", dur: 0.08, gain: 0.03 });
          break;
        case "lap":
          if (e.final) [72, 76, 79, 84, 88].forEach((m, i) => this.tone({ freq: mtof(m), type: "square", dur: 0.16, gain: 0.06, at: i * 0.09 }));
          else [76, 84].forEach((m, i) => this.tone({ freq: mtof(m), type: "square", dur: 0.18, gain: 0.07, at: i * 0.1 }));
          break;
        case "finishLine":
          this.noiseHit({ type: "highpass", freq: 3000, dur: 1.2, gain: 0.08 });
          break;
        case "finished": {
          const win = e.place === 1;
          const seq = win ? [72, 76, 79, 84, 79, 84, 88] : e.place <= 3 ? [72, 76, 79, 84] : [67, 65, 64, 60];
          seq.forEach((m, i) => this.tone({ freq: mtof(m), type: win ? "square" : "triangle", dur: 0.28, gain: 0.08, at: 0.25 + i * 0.13 }));
          break;
        }
        default:
          break;
      }
    }
  }

  // --- music ----------------------------------------------------------------------------
  setMusic(on) {
    this.musicOn = on;
  }

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
    // drums
    if (s % 4 === 0) {
      this.tone({ freq: 120, type: "sine", dur: 0.16, gain: calm ? 0.2 : 0.32, to: 45, at, bus });
    }
    if (!calm && s % 8 === 4) this.musicNoise(at, 1800, 0.12, 0.16);
    if (s % 2 === 1) this.musicNoise(at, 7000, 0.03, calm ? 0.03 : 0.05);
    // bass: root on the beat, fifth on the off-beat
    if (s % 4 === 0 || s % 4 === 3) {
      const n = root - 24 + chord[0] + (s % 4 === 3 ? 7 : 0);
      this.tone({ freq: mtof(n), type: "triangle", dur: sixteenthDur(M) * 1.6, gain: 0.16, at, bus });
    }
    // chord stabs
    if (!calm && (s % 16 === 2 || s % 16 === 10)) {
      for (const k of chord) this.tone({ freq: mtof(root + k), type: "square", dur: 0.12, gain: 0.025, at, bus });
    }
    if (calm && s % 16 === 0) {
      for (const k of chord) this.tone({ freq: mtof(root + k), type: "triangle", dur: 1.6, gain: 0.035, attack: 0.08, at, bus });
    }
    // arpeggio
    if (s % 2 === 0) {
      const i = (s / 2) % 4;
      const n = root + 12 + chord[i % 3] + (i === 3 ? 12 : 0);
      if (!calm || s % 4 === 0) this.tone({ freq: mtof(n), type: calm ? "sine" : "triangle", dur: 0.14, gain: calm ? 0.035 : 0.04, at, bus });
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

const sixteenthDur = (M) => 60 / M.tempo / 4;
