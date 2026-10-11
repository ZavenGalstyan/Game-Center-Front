/**
 * Alpine Rush — all sound is synthesized with Web Audio (original, no
 * assets).
 *
 *   master ─┬─ music  a bright winter-sports groove (kick, bass, bells,
 *           │         plucked arpeggio, sleigh-bell shaker); key + tempo per
 *           │         world, a calm version in the menus
 *           ├─ sfx    countdown, GO, jump, takeoff, landing, gate chime,
 *           │         missed-gate buzz, wobble, fall, nets, finish, medal, UI
 *           └─ loops  snow hiss (pitched by surface, louder with speed),
 *                     carving scrape, snowplough spray, wind (rises with
 *                     speed / blizzard), nearest rival's skis
 *
 * The context starts on the first user gesture (start()). Mute zeroes the
 * master at once without touching the saved volumes; pause suspends the
 * context; dispose() closes it.
 */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MOODS = {
  menu: { root: 62, tempo: 92, minor: false },
  sunny: { root: 64, tempo: 128, minor: false },
  pine: { root: 62, tempo: 124, minor: false },
  frozen: { root: 59, tempo: 130, minor: true },
  blizzard: { root: 57, tempo: 126, minor: true },
  summit: { root: 60, tempo: 136, minor: false },
};
const PROG_MAJ = [
  [0, 4, 7],
  [7, 11, 14],
  [9, 12, 16],
  [5, 9, 12],
];
const PROG_MIN = [
  [0, 3, 7],
  [-4, 0, 3],
  [3, 7, 10],
  [-2, 2, 5],
];
const SURF_TONE = { normal: 3200, packed: 3800, powder: 1600, ice: 5200, rough: 2400, wood: 900, air: 0 };

export class SkiAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
    this.vol = { master: 0.85, music: 0.45, sfx: 0.9 };
    this.mood = MOODS.menu;
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

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.loops = null;
  }

  // --- continuous loops -----------------------------------------------------------------
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
    this.loops = {
      hiss: noiseLoop("bandpass", 3200, 0.7),
      carve: noiseLoop("bandpass", 4200, 3.5),
      spray: noiseLoop("bandpass", 1800, 0.8),
      wind: noiseLoop("bandpass", 500, 0.5),
      rival: noiseLoop("bandpass", 3000, 1),
    };
    return this.loops;
  }

  silenceLoops() {
    if (!this.loops || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const L of Object.values(this.loops)) L.g.gain.setTargetAtTime(0, t, 0.08);
  }

  /** Per frame while racing. */
  update(race) {
    if (!this.ctx || this.paused) return;
    const L = this.ensureLoops();
    if (!L) return;
    const t = this.ctx.currentTime;
    const K = race.player.sk;
    const v = K.air ? Math.hypot(K.ax, K.az) : Math.max(0, K.vF);
    const vn = Math.min(1.3, v / 30);
    const onSnow = !K.air && !K.crash && !K.hold;
    const tone = SURF_TONE[K.surf] || 3200;
    L.hiss.f.frequency.setTargetAtTime(tone * (0.7 + vn * 0.5), t, 0.06);
    L.hiss.g.gain.setTargetAtTime(onSnow ? (0.03 + vn * 0.12) * (K.surf === "powder" ? 1.4 : 1) * (1 + K.rough * 0.5) : 0, t, 0.05);
    const carve = onSnow ? Math.min(1, K.carving) * vn : 0;
    L.carve.f.frequency.setTargetAtTime(K.surf === "ice" ? 6200 : 4200, t, 0.05);
    L.carve.g.gain.setTargetAtTime(carve * (0.1 + K.sharp * 0.08) + (onSnow && Math.abs(K.vS) > 2 ? 0.05 : 0), t, 0.04);
    L.spray.g.gain.setTargetAtTime(K.braking && onSnow ? 0.08 + vn * 0.12 : 0, t, 0.04);
    const storm = race.def?.wind ? 0.05 + Math.abs(race.wind?.str || 0) * 0.02 : 0;
    L.wind.f.frequency.setTargetAtTime(350 + vn * 1000, t, 0.1);
    L.wind.g.gain.setTargetAtTime((K.crash ? 0.02 : 0.012 + vn * vn * 0.14 + (K.air ? 0.05 : 0)) + storm, t, 0.1);
    let best = Infinity;
    let rv = 0;
    for (const r of race.racers) {
      if (r.isPlayer) continue;
      const d = Math.hypot(r.sk.x - K.x, r.sk.z - K.z);
      if (d < best) {
        best = d;
        rv = Math.max(0, r.sk.vF) / 30;
      }
    }
    const near = Math.max(0, 1 - best / 25);
    L.rival.f.frequency.setTargetAtTime(2400 + rv * 1500, t, 0.08);
    L.rival.g.gain.setTargetAtTime(near * near * 0.07, t, 0.08);
  }

  // --- one-shots ---------------------------------------------------------------------------
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

  noiseHit({ type = "lowpass", freq = 800, q = 0.7, dur = 0.1, gain = 0.3, sweep = null, at = 0, bus = null }) {
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
    s.connect(f).connect(g).connect(bus || this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  bell(m, at = 0, gain = 0.06, bus = null) {
    this.tone({ freq: mtof(m), type: "sine", dur: 0.9, gain, at, bus });
    this.tone({ freq: mtof(m) * 2.76, type: "sine", dur: 0.35, gain: gain * 0.35, at, bus });
  }

  ui() {
    this.tone({ freq: 1320, type: "triangle", dur: 0.06, gain: 0.06, to: 1760 });
  }
  select() {
    this.bell(84, 0, 0.07);
    this.bell(91, 0.06, 0.05);
  }
  locked() {
    this.tone({ freq: 220, type: "square", dur: 0.14, gain: 0.05, to: 160 });
  }
  unlock() {
    [79, 83, 86, 91].forEach((m, i) => this.bell(m, i * 0.09, 0.07));
  }

  onEvents(events) {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.type) {
        case "count":
          this.tone({ freq: 660, type: "square", dur: 0.2, gain: 0.07 });
          break;
        case "go":
          this.tone({ freq: 1320, type: "square", dur: 0.5, gain: 0.08 });
          this.bell(88, 0, 0.08);
          this.noiseHit({ type: "highpass", freq: 2500, dur: 0.35, gain: 0.08 });
          break;
        case "jump":
          this.noiseHit({ type: "bandpass", freq: 2200, sweep: 4200, dur: 0.18, gain: 0.12, q: 1.2 });
          break;
        case "takeoff":
          this.noiseHit({ type: "bandpass", freq: 1500, sweep: e.big ? 4500 : 3500, dur: e.big ? 0.45 : 0.3, gain: e.big ? 0.16 : 0.11, q: 0.9 });
          break;
        case "land": {
          const k = Math.min(1, (e.hard || 0) + (e.airT > 0.6 ? 0.3 : 0));
          this.noiseHit({ type: "lowpass", freq: 900 + k * 500, dur: 0.22 + k * 0.15, gain: 0.22 + k * 0.25 });
          this.noiseHit({ type: "highpass", freq: 3000, dur: 0.25, gain: 0.08 + k * 0.08 });
          if (e.quality === "wobbly") this.tone({ freq: 330, type: "triangle", dur: 0.25, gain: 0.05, to: 240 });
          break;
        }
        case "gate":
          this.bell(e.color === "red" ? 86 : 88, 0, 0.07);
          break;
        case "gateMissed":
          this.tone({ freq: 180, type: "sawtooth", dur: 0.32, gain: 0.07, to: 120 });
          this.tone({ freq: 185, type: "square", dur: 0.32, gain: 0.04, to: 125 });
          break;
        case "wobble":
          this.tone({ freq: 520, type: "triangle", dur: 0.12, gain: 0.05 });
          this.tone({ freq: 520, type: "triangle", dur: 0.12, gain: 0.05, at: 0.15 });
          break;
        case "hit":
        case "net":
        case "bump":
          this.noiseHit({ type: "lowpass", freq: 600, dur: 0.18, gain: 0.18 + (e.hard || 0.5) * 0.25 });
          break;
        case "clearFence":
          this.bell(91, 0, 0.04);
          break;
        case "crash":
          this.noiseHit({ type: "lowpass", freq: 1400, sweep: 200, dur: 0.8, gain: 0.45 });
          this.noiseHit({ type: "highpass", freq: 2600, dur: 0.6, gain: 0.12, at: 0.05 });
          this.tone({ freq: 90, type: "sine", dur: 0.4, gain: 0.22, to: 40 });
          break;
        case "getUp":
        case "respawn":
          this.tone({ freq: 523, type: "triangle", dur: 0.14, gain: 0.06, to: 784 });
          break;
        case "overtake":
          this.bell(84, 0, 0.05);
          this.bell(88, 0.07, 0.05);
          break;
        case "finished": {
          const r = e.results || {};
          const good = r.medal === "gold" || (r.free && true);
          const seq = r.dsq ? [67, 63, 60] : good ? [76, 79, 84, 88, 91] : r.medal ? [76, 79, 84, 88] : [72, 71, 69, 67];
          this.noiseHit({ type: "highpass", freq: 3000, dur: 1.2, gain: 0.08 });
          seq.forEach((m, i) => this.bell(m, 0.2 + i * 0.12, 0.08));
          break;
        }
        default:
          break;
      }
    }
  }

  medal(kind) {
    if (!this.ctx) return;
    const seq = kind === "gold" ? [79, 84, 88, 91, 96] : kind === "silver" ? [79, 84, 88, 91] : [79, 84, 88];
    seq.forEach((m, i) => {
      this.bell(m, 0.1 + i * 0.1, 0.08);
      this.tone({ freq: mtof(m - 12), type: "triangle", dur: 0.3, gain: 0.04, at: 0.1 + i * 0.1 });
    });
  }

  // --- music ------------------------------------------------------------------------------
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
    if (s % 4 === 0) this.tone({ freq: 100, type: "sine", dur: 0.16, gain: calm ? 0.12 : 0.26, to: 45, at, bus });
    if (!calm && s % 8 === 4) this.noiseHit({ type: "bandpass", freq: 1800, dur: 0.12, gain: 0.12, at, bus });
    // sleigh-bell shaker
    if (s % 2 === 1 || (!calm && s % 4 === 2)) this.noiseHit({ type: "highpass", freq: 8000, dur: 0.05, gain: calm ? 0.025 : 0.05, at, bus });
    if (s % 4 === 0 || s % 4 === 3) {
      const n = root - 24 + chord[0] + (s % 4 === 3 ? 12 : 0);
      this.tone({ freq: mtof(n), type: calm ? "triangle" : "sawtooth", dur: sx * 1.5, gain: calm ? 0.1 : 0.06, at, bus });
    }
    if (calm && s % 16 === 0) for (const k of chord) this.tone({ freq: mtof(root + k), type: "triangle", dur: 2, gain: 0.03, attack: 0.15, at, bus });
    if (!calm && s % 16 === 0) for (const k of chord) this.tone({ freq: mtof(root + k), type: "triangle", dur: sx * 14, gain: 0.018, attack: 0.05, at, bus });
    // bell arpeggio
    if (s % 2 === 0 && (!calm || s % 4 === 0)) {
      const i = (s / 2) % 4;
      const n = root + 12 + chord[i % 3] + (i === 3 ? 12 : 0);
      this.bell(n, at, calm ? 0.025 : 0.03, bus);
    }
  }
}
