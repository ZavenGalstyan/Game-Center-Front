/**
 * Downhill Riders — all sound is synthesized with Web Audio (no assets).
 *
 *   master ─┬─ music  a driving sequencer (bass, chords, arpeggio, drums);
 *           │         key + tempo per region, calmer groove in the menus
 *           ├─ sfx    countdown, GO, jumps, landings, hits, crashes, orbs,
 *           │         trick chimes, checkpoints, finish fanfare, UI
 *           └─ loops  tyre roll (surface-coloured), wind (rises with speed),
 *                     brake skid, pedal whirr, boost rush, nearest rival's
 *                     tyres; freehub ticks while coasting
 *
 * The context starts on the first user gesture (start()). Mute zeroes the
 * master at once without touching saved volumes; pause suspends the context.
 * dispose() closes it; a later start() rebuilds (StrictMode remounts).
 */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MOODS = {
  menu: { root: 57, tempo: 96, minor: false },
  forest: { root: 62, tempo: 128, minor: false },
  canyon: { root: 57, tempo: 132, minor: true },
  alpine: { root: 64, tempo: 124, minor: false },
  snow: { root: 59, tempo: 126, minor: true },
  summit: { root: 60, tempo: 138, minor: true },
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
const SURF_TONE = { dirt: 900, dust: 1200, rock: 700, snow: 2600, ice: 3200, wood: 450, grass: 600, mud: 380, roots: 520, air: 0 };

export class RideAudio {
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
    this.tickT = 0;
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
    this.musicBus.gain.value = this.vol.music * 0.42;
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
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.42, t, 0.03);
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
    const tyre = noiseLoop("bandpass", 900, 0.9);
    const wind = noiseLoop("bandpass", 500, 0.5);
    const skid = noiseLoop("bandpass", 2600, 4);
    const boost = noiseLoop("bandpass", 800, 0.7);
    const rival = noiseLoop("bandpass", 800, 1);
    // pedal / chain whirr
    const wg = c.createGain();
    wg.gain.value = 0;
    const wf = c.createBiquadFilter();
    wf.type = "lowpass";
    wf.frequency.value = 600;
    const wo = c.createOscillator();
    wo.type = "triangle";
    wo.frequency.value = 90;
    wo.connect(wf).connect(wg).connect(this.sfxBus);
    wo.start();
    this.loops = { tyre, wind, skid, boost, rival, wg, wo };
    return this.loops;
  }

  silenceLoops() {
    if (!this.loops || !this.ctx) return;
    const t = this.ctx.currentTime;
    const L = this.loops;
    for (const g of [L.tyre.g, L.wind.g, L.skid.g, L.boost.g, L.rival.g, L.wg]) g.gain.setTargetAtTime(0, t, 0.08);
  }

  /** Per frame while racing. */
  update(race) {
    if (!this.ctx || this.paused) return;
    const L = this.ensureLoops();
    if (!L) return;
    const t = this.ctx.currentTime;
    const B = race.player.bike;
    const v = Math.max(0, B.vF);
    const vn = Math.min(1.4, v / B.p.vmax);
    const onGround = !B.air && !B.crash;
    const surf = B.surf || "dirt";
    const tone = SURF_TONE[surf] || 900;
    L.tyre.f.frequency.setTargetAtTime(tone * (0.6 + vn * 0.8), t, 0.06);
    L.tyre.g.gain.setTargetAtTime(onGround ? (0.05 + vn * 0.16) * (surf === "snow" || surf === "ice" ? 0.7 : 1) * (1 + (B.rough || 0) * 0.6) : 0, t, 0.05);
    L.wind.f.frequency.setTargetAtTime(380 + vn * 900, t, 0.1);
    L.wind.g.gain.setTargetAtTime(B.crash ? 0.02 : 0.015 + vn * vn * 0.16 + (B.air ? 0.04 : 0), t, 0.1);
    L.skid.g.gain.setTargetAtTime(B.braking && onGround && v > 5 ? 0.06 + vn * 0.05 : Math.abs(B.vS) > 2.5 && onGround ? 0.05 : 0, t, 0.04);
    L.boost.g.gain.setTargetAtTime(B.boostT > 0 ? 0.12 : 0, t, 0.06);
    L.boost.f.frequency.setTargetAtTime(700 + vn * 900, t, 0.06);
    L.wg.gain.setTargetAtTime(B.pedaling ? 0.025 : 0, t, 0.06);
    L.wo.frequency.setTargetAtTime(70 + v * 6, t, 0.06);
    // freehub ticks while coasting on the ground
    if (onGround && !B.pedaling && v > 2 && !race.paused) {
      this.tickT -= 1 / 60;
      if (this.tickT <= 0) {
        this.tickT = 1 / Math.min(22, 6 + v);
        this.noiseHit({ type: "highpass", freq: 5200, dur: 0.012, gain: 0.05 });
      }
    }
    // nearest rival
    let best = Infinity;
    let rv = 0;
    for (const r of race.racers) {
      if (r.isPlayer) continue;
      const d = Math.hypot(r.bike.x - B.x, r.bike.z - B.z);
      if (d < best) {
        best = d;
        rv = Math.max(0, r.bike.vF) / r.bike.p.vmax;
      }
    }
    const near = Math.max(0, 1 - best / 25);
    L.rival.f.frequency.setTargetAtTime(600 + rv * 700, t, 0.08);
    L.rival.g.gain.setTargetAtTime(near * near * 0.08, t, 0.08);
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
          this.noiseHit({ type: "highpass", freq: 1500, dur: 0.25, gain: 0.08 });
          break;
        case "hop":
          this.noiseHit({ type: "bandpass", freq: 900, sweep: 1800, dur: 0.15, gain: 0.12, q: 1.2 });
          break;
        case "takeoff":
          this.noiseHit({ type: "bandpass", freq: 500, sweep: e.big ? 2400 : 1600, dur: e.big ? 0.5 : 0.3, gain: e.big ? 0.2 : 0.13, q: 0.8 });
          break;
        case "land": {
          const k = Math.min(1, (e.hard || 0) + (e.airT > 0.5 ? 0.3 : 0));
          this.noiseHit({ type: "lowpass", freq: 260 + k * 200, dur: 0.18 + k * 0.12, gain: 0.25 + k * 0.3 });
          this.tone({ freq: 120, type: "sine", dur: 0.18, gain: 0.12 + k * 0.12, to: 55 });
          break;
        }
        case "hit":
        case "wall":
        case "bump":
          this.noiseHit({ type: "lowpass", freq: 420, dur: 0.18, gain: 0.22 + (e.hard || 0.5) * 0.3 });
          this.tone({ freq: 160, type: "triangle", dur: 0.12, gain: 0.08, to: 80 });
          break;
        case "clearLog":
          this.tone({ freq: 1320, type: "sine", dur: 0.1, gain: 0.05 });
          break;
        case "crash":
          this.noiseHit({ type: "lowpass", freq: 700, sweep: 120, dur: 0.6, gain: 0.5 });
          this.noiseHit({ type: "bandpass", freq: 2400, dur: 0.3, gain: 0.15, q: 2, at: 0.05 });
          this.tone({ freq: 90, type: "sine", dur: 0.4, gain: 0.25, to: 40 });
          break;
        case "respawn":
          this.tone({ freq: 440, type: "triangle", dur: 0.15, gain: 0.07, to: 880 });
          break;
        case "boost":
          this.noiseHit({ type: "bandpass", freq: 400, sweep: 2200, dur: 0.6, gain: 0.22, q: 0.9 });
          this.tone({ freq: 180, type: "sawtooth", dur: 0.45, gain: 0.05, to: 640 });
          break;
        case "orb":
          this.tone({ freq: 1320, type: "sine", dur: 0.18, gain: 0.1 });
          this.tone({ freq: 1760, type: "sine", dur: 0.28, gain: 0.09, at: 0.07 });
          break;
        case "trickStart":
          this.noiseHit({ type: "bandpass", freq: 1400, sweep: 3000, dur: 0.2, gain: 0.08, q: 1.5 });
          break;
        case "trickDone":
          this.tone({ freq: 988, type: "triangle", dur: 0.12, gain: 0.06 });
          break;
        case "trickLanded":
          [76, 79, 84, 88].slice(0, 2 + Math.min(2, e.combo)).forEach((m, i) => this.tone({ freq: mtof(m), type: "square", dur: 0.14, gain: 0.06, at: i * 0.07 }));
          break;
        case "trickDenied":
          this.tone({ freq: 300, type: "triangle", dur: 0.08, gain: 0.04 });
          break;
        case "sketchy":
          this.tone({ freq: 330, type: "triangle", dur: 0.25, gain: 0.07, to: 220 });
          break;
        case "checkpoint":
          this.tone({ freq: 1568, type: "sine", dur: 0.1, gain: 0.06 });
          this.tone({ freq: 2093, type: "sine", dur: 0.14, gain: 0.05, at: 0.06 });
          break;
        case "overtake":
          this.tone({ freq: 784, type: "triangle", dur: 0.1, gain: 0.05 });
          this.tone({ freq: 1175, type: "triangle", dur: 0.14, gain: 0.05, at: 0.06 });
          break;
        case "finished": {
          const win = e.place === 1;
          const seq = win ? [72, 76, 79, 84, 79, 84, 88] : e.place <= 3 ? [72, 76, 79, 84] : [67, 65, 64, 60];
          this.noiseHit({ type: "highpass", freq: 3000, dur: 1.2, gain: 0.08 });
          seq.forEach((m, i) => this.tone({ freq: mtof(m), type: win ? "square" : "triangle", dur: 0.28, gain: 0.08, at: 0.25 + i * 0.13 }));
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
      if (!calm || s % 4 === 0) this.tone({ freq: mtof(n), type: calm ? "sine" : "triangle", dur: 0.14, gain: calm ? 0.032 : 0.038, at, bus });
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
