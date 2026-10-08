/**
 * Mountain Journey — all sound is synthesized with Web Audio (no assets).
 *
 *   master ─┬─ music  generative pads + sparse plucked melody; key, mode and
 *           │         tempo per region, crossfaded when the region changes
 *           ├─ sfx    footsteps per surface (dirt, grass, wood, stone, snow,
 *           │         ice, water, ladder), jump / land, chimes, mechanisms
 *           └─ amb    wind, stream, waterfall, leaves, cave drone + drips,
 *                     birdsong — levels driven every frame by the explorer's
 *                     surroundings (distance to water / falls, wind zones,
 *                     caves, altitude)
 *
 * The context starts on the first user gesture (start()). Mute zeroes the
 * master at once without touching saved volumes; pause suspends the context.
 */

const SCALES = {
  major: [0, 2, 4, 7, 9],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minorPent: [0, 3, 5, 7, 10],
};
const PROG = {
  major: [
    [0, 4, 7],
    [5, 9, 12],
    [-3, 0, 4],
    [7, 11, 14],
  ],
  lydian: [
    [0, 4, 7, 11],
    [2, 6, 9],
    [0, 4, 7, 14],
    [-1, 2, 7],
  ],
  dorian: [
    [0, 3, 7],
    [5, 9, 12],
    [-2, 2, 5],
    [3, 7, 10],
  ],
  minorPent: [
    [0, 3, 7],
    [-4, 0, 3],
    [-2, 2, 5],
    [5, 8, 12],
  ],
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class MountainAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.vol = { master: 0.85, music: 0.55, sfx: 0.9 };
    this.mood = { root: 62, mode: "major", tempo: 66 };
    this.region = null;
    this.amb = {};
    this.timers = [];
    this.nextBird = 0;
    this.nextDrip = 0;
    this.musicStep = 0;
    this.nextNote = 0;
    this.paused = false;
  }

  start() {
    // (a dispose — e.g. a StrictMode remount — just means build afresh)
    if (!this.ctx) {
      const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.amb = {};
      this.build();
    }
    if (this.ctx.state === "suspended" && !this.paused) this.ctx.resume().catch(() => {});
  }

  build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol.master;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(c.destination);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.vol.music * 0.55;
    this.musicBus.connect(this.master);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.vol.sfx;
    this.sfxBus.connect(this.master);
    this.ambBus = c.createGain();
    this.ambBus.gain.value = this.vol.sfx * 0.8;
    this.ambBus.connect(this.master);
    // shared noise
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const brown = c.createBuffer(1, len, c.sampleRate);
    const bd = brown.getChannelData(0);
    for (let i = 0; i < len; i++) {
      b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = b * 3.5;
    }
    this.brown = brown;
    // music reverb-ish: a soft feedback delay
    this.delay = c.createDelay(1.5);
    this.delay.delayTime.value = 0.42;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    const dl = c.createBiquadFilter();
    dl.type = "lowpass";
    dl.frequency.value = 1800;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    this.delay.connect(this.musicBus);
    this.musicIn = c.createGain();
    this.musicIn.connect(this.musicBus);
    this.musicIn.connect(this.delay);
    // ambience layers
    this.amb.wind = this.loop(this.noise, "bandpass", 420, 0.7);
    this.amb.wind2 = this.loop(this.noise, "lowpass", 220, 0.5);
    this.amb.stream = this.loop(this.noise, "bandpass", 1900, 0.8);
    this.amb.fall = this.loop(this.brown, "lowpass", 1100, 0.4);
    this.amb.leaves = this.loop(this.noise, "highpass", 3800, 0.4);
    this.amb.cave = this.loop(this.brown, "lowpass", 260, 0.6);
    this.nextNote = c.currentTime + 0.5;
    const tick = () => this.schedule();
    this.timers.push(setInterval(tick, 120));
  }

  loop(buf, type, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.ambBus);
    src.start(c.currentTime + Math.random() * 0.5);
    return { src, f, g };
  }

  setMuted(m) {
    this.muted = !!m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.015);
  }

  setVolumes(v) {
    this.vol = { ...this.vol, ...v };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.muted) this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.sfx * 0.8, t, 0.1);
  }

  setPaused(p) {
    this.paused = !!p;
    if (!this.ctx) return;
    if (p && this.ctx.state === "running") this.ctx.suspend().catch(() => {});
    else if (!p && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  /** Region mood for music & default ambience (null → menu). */
  setRegion(region) {
    this.region = region;
    if (region) this.mood = { ...region.music };
    else this.mood = { root: 62, mode: "major", tempo: 62 };
  }

  dispose() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        /* ignore */
      }
    }
    this.ctx = null;
  }

  // --- ambience ----------------------------------------------------------------
  setAmb(name, level, freq) {
    const a = this.amb[name];
    if (!a || !this.ctx) return;
    const t = this.ctx.currentTime;
    a.g.gain.setTargetAtTime(Math.max(0, level), t, 0.35);
    if (freq) a.f.frequency.setTargetAtTime(freq, t, 0.4);
  }

  /** Per-frame: ambience from the explorer's surroundings (or the menu). */
  update(dt, game) {
    if (!this.ctx || this.paused) return;
    const t = this.ctx.currentTime;
    if (!game) {
      // menu: a soft valley breeze, distant river, birds
      this.setAmb("wind", 0.05 + Math.sin(t * 0.2) * 0.02, 380);
      this.setAmb("wind2", 0.06);
      this.setAmb("stream", 0.018);
      this.setAmb("fall", 0);
      this.setAmb("leaves", 0.012);
      this.setAmb("cave", 0);
      this.birdsLevel = 0.6;
      return;
    }
    const R = game.region;
    const P = game.player;
    const A = R.ambience;
    const cave = P.inCave;
    const near = game.L.terrain.waterNear(P.x, P.z);
    const ws = game.windStrength();
    const gust = 0.5 + 0.5 * Math.sin(t * 0.35) * Math.sin(t * 0.13 + 1);
    const wind = (A.wind * (0.05 + gust * 0.05) + ws * 0.05) * (1 - cave * 0.8);
    this.setAmb("wind", wind, 300 + A.wind * 250 + ws * 120);
    this.setAmb("wind2", wind * 1.2);
    this.setAmb("stream", Math.max(0, 1 - near.water / 22) * 0.07 * (1 - cave * 0.5));
    this.setAmb("fall", Math.max(0, 1 - near.fall / 45) * 0.16);
    this.setAmb("leaves", A.leaves * 0.02 * gust * (1 - cave));
    this.setAmb("cave", cave * 0.05);
    this.birdsLevel = A.birds * (1 - cave);
    this.cave = cave;
  }

  schedule() {
    if (!this.ctx || this.paused || this.ctx.state !== "running") return;
    const c = this.ctx;
    const now = c.currentTime;
    // birds
    if (this.birdsLevel > 0.05 && now > this.nextBird) {
      this.bird(this.birdsLevel);
      this.nextBird = now + 1.2 + Math.random() * (6 / this.birdsLevel);
    }
    // cave drips
    if (this.cave > 0.5 && now > this.nextDrip) {
      this.drip();
      this.nextDrip = now + 0.8 + Math.random() * 2.5;
    }
    // music: one step = one beat
    const beat = 60 / this.mood.tempo;
    while (this.nextNote < now + 0.4) {
      this.musicBeat(this.nextNote, beat);
      this.nextNote += beat;
      this.musicStep++;
    }
  }

  musicBeat(t, beat) {
    const m = this.mood;
    const prog = PROG[m.mode] || PROG.major;
    const bar = Math.floor(this.musicStep / 8) % prog.length;
    const pos = this.musicStep % 8;
    if (pos === 0) {
      for (const iv of prog[bar]) this.pad(mtof(m.root - 12 + iv), t, beat * 8.5);
      this.pad(mtof(m.root - 24 + prog[bar][0]), t, beat * 8.5, 0.5);
    }
    const scale = SCALES[m.mode] || SCALES.major;
    if (Math.random() < 0.34 && pos % 2 === 0) {
      const deg = scale[Math.floor(Math.random() * scale.length)];
      const oct = Math.random() < 0.3 ? 12 : 0;
      this.pluck(mtof(m.root + deg + oct), t + (Math.random() < 0.3 ? beat / 2 : 0));
    }
  }

  pad(freq, t, dur, amp = 1) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045 * amp, t + dur * 0.3);
    g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.12);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    for (const det of [-6, 5]) {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 1.5);
    }
    f.connect(g).connect(this.musicIn);
  }

  pluck(freq, t) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const o2 = c.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = freq * 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.6);
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.musicIn);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.7);
    o2.stop(t + 1.7);
  }

  bird(level) {
    const c = this.ctx;
    const t0 = c.currentTime + 0.02;
    const base = 2200 + Math.random() * 2200;
    const n = 2 + Math.floor(Math.random() * 4);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    const g = c.createGain();
    g.gain.value = 0.035 * level;
    if (pan) {
      pan.pan.value = Math.random() * 1.6 - 0.8;
      g.connect(pan).connect(this.ambBus);
    } else g.connect(this.ambBus);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.06);
      const o = c.createOscillator();
      o.type = "sine";
      const e = c.createGain();
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), t);
      o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.7), t + 0.07);
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(1, t + 0.01);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(e).connect(g);
      o.start(t);
      o.stop(t + 0.1);
    }
  }

  drip() {
    const c = this.ctx;
    const t = c.currentTime + 0.01;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(1400 + Math.random() * 900, t);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(this.ambBus);
    this.delayed(g);
    o.start(t);
    o.stop(t + 0.2);
  }

  delayed(node) {
    // drips echo through the music delay for a cavern tail
    node.connect(this.delay);
  }

  // --- one-shots -----------------------------------------------------------------
  noiseHit({ type = "lowpass", freq = 800, q = 0.7, dur = 0.08, gain = 0.3, attack = 0.004, rate = 1, brown = false, sweep = null }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + 0.005;
    const src = c.createBufferSource();
    src.buffer = brown ? this.brown : this.noise;
    src.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, type = "sine", dur = 0.3, gain = 0.15, attack = 0.005, to = null, at = 0, bus = null }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + 0.005 + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  step(surf, run = false) {
    if (!this.ctx) return;
    const v = run ? 1.25 : 1;
    switch (surf) {
      case "wood":
      case "ladder":
        this.noiseHit({ type: "bandpass", freq: 520, q: 3, dur: 0.07, gain: 0.22 * v });
        this.tone({ freq: 170 + Math.random() * 30, dur: 0.07, gain: 0.08 * v, type: "triangle" });
        break;
      case "stone":
      case "rock":
        this.noiseHit({ type: "highpass", freq: 1600, q: 0.8, dur: 0.045, gain: 0.16 * v });
        this.noiseHit({ type: "bandpass", freq: 2600, q: 2, dur: 0.03, gain: 0.08 * v });
        break;
      case "snow":
        this.noiseHit({ type: "bandpass", freq: 1300, q: 0.9, dur: 0.12, gain: 0.2 * v, attack: 0.02, rate: 0.6 });
        break;
      case "ice":
        this.noiseHit({ type: "highpass", freq: 3200, q: 1, dur: 0.04, gain: 0.12 * v });
        this.tone({ freq: 2400, dur: 0.05, gain: 0.02 });
        break;
      case "water":
        this.noiseHit({ type: "bandpass", freq: 900, q: 0.8, dur: 0.18, gain: 0.22 * v, attack: 0.02, sweep: 1600 });
        break;
      case "grass":
      case "alpine":
        this.noiseHit({ type: "bandpass", freq: 2200, q: 0.6, dur: 0.07, gain: 0.08 * v });
        this.noiseHit({ type: "lowpass", freq: 500, q: 0.7, dur: 0.06, gain: 0.12 * v });
        break;
      default:
        this.noiseHit({ type: "lowpass", freq: 650 + Math.random() * 150, q: 0.8, dur: 0.08, gain: 0.2 * v });
    }
  }

  ui() {
    this.tone({ freq: 880, dur: 0.07, gain: 0.05, type: "triangle" });
  }

  chime(notes, gap = 0.09, gain = 0.09, dur = 1.2) {
    notes.forEach((n, i) => {
      this.tone({ freq: mtof(n), dur, gain, at: i * gap });
      this.tone({ freq: mtof(n) * 2.01, dur: dur * 0.6, gain: gain * 0.25, at: i * gap });
    });
  }

  onEvents(events) {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.type) {
        case "step":
          this.step(e.surf, e.run);
          break;
        case "jump":
          this.noiseHit({ type: "bandpass", freq: 600, q: 0.7, dur: 0.16, gain: 0.08, sweep: 1400, attack: 0.03 });
          break;
        case "land":
          this.step(e.surf);
          this.noiseHit({ type: "lowpass", freq: 300, q: 0.6, dur: 0.14, gain: 0.18 + e.hard * 0.3, brown: true });
          break;
        case "checkpoint":
          this.chime([79, 84, 88], 0.11, 0.07, 1.6);
          break;
        case "badge":
          this.chime([84, 88, 91, 96], 0.07, 0.08, 1.1);
          break;
        case "viewpoint":
          this.chime(e.first ? [72, 76, 79, 84, 88] : [76, 79, 84], 0.18, 0.05, 2.6);
          break;
        case "lever":
          this.noiseHit({ type: "lowpass", freq: 500, dur: 0.25, gain: 0.25, brown: true });
          this.tone({ freq: 140, to: 90, dur: 0.2, gain: 0.1, type: "square" });
          break;
        case "switch":
          if (e.crystal) this.chime([88, 95, 100], 0.05, 0.06, 1.8);
          else this.noiseHit({ type: "bandpass", freq: 900, q: 2, dur: 0.12, gain: 0.2 });
          break;
        case "gateOpen":
          this.noiseHit({ type: "lowpass", freq: 260, q: 0.5, dur: 1.3, gain: 0.3, brown: true, attack: 0.15 });
          break;
        case "bridgeDone":
          this.noiseHit({ type: "lowpass", freq: 400, dur: 0.3, gain: 0.25, brown: true });
          break;
        case "plate":
          this.noiseHit({ type: "lowpass", freq: 220, dur: 0.35, gain: 0.35, brown: true });
          this.chime([67, 74], 0.1, 0.05, 1);
          break;
        case "key":
          this.chime([88, 93, 98], 0.05, 0.06, 0.8);
          break;
        case "locked":
          this.tone({ freq: 220, dur: 0.12, gain: 0.08, type: "square" });
          break;
        case "climbStart":
        case "ladderStart":
          this.noiseHit({ type: "bandpass", freq: 1200, q: 0.6, dur: 0.2, gain: 0.07, attack: 0.04 });
          break;
        case "climbEnd":
          this.step("stone");
          break;
        case "fall":
          if (e.cause !== "water") this.noiseHit({ type: "bandpass", freq: 900, q: 0.8, dur: 0.6, gain: 0.12, sweep: 300, attack: 0.1 });
          break;
        case "splash":
          this.noiseHit({ type: "lowpass", freq: 1400, q: 0.6, dur: 0.6, gain: 0.35, attack: 0.01, sweep: 500 });
          break;
        case "respawn":
          this.chime([72, 79], 0.12, 0.04, 1.2);
          break;
        case "complete":
          this.chime([72, 76, 79, 84, 88, 91], 0.12, 0.08, 2.4);
          break;
        default:
          break;
      }
    }
  }
}
