/**
 * Pirate Cove — sound. Everything is synthesized with WebAudio at runtime:
 *
 *   master ─ compressor ─ out           (Game Center Mute → master gain 0, immediately)
 *     ├─ amb    ocean swell, shore surf, wind, hull wash, rain, cave room tone
 *     ├─ sfx    cannons, splashes, wood, sword, footsteps, treasure… (panned
 *     │         + distance-attenuated around the listener)
 *     ├─ music  a small adaptive sequencer: menu · explore · battle · fight ·
 *     │         final, plus treasure / victory stings
 *     └─ verb   generated impulse response, sent from sfx in caves
 *
 * Everything is re-startable (React StrictMode mounts twice in dev) and
 * nothing ignores the master gain.
 */

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class PirateAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
    this.vol = { master: 0.85, music: 0.6, sfx: 0.9 };
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.mood = "menu";
    this.nextMood = "menu";
    this.disposed = false;
    this.amb = {};
    this.state = { mode: "menu", speed: 0, shore: 999, storm: 0, rain: 0, cave: false, onFoot: false };
    this.creakT = 2;
    this.gullT = 3;
    this.dripT = 1;
    this.birdT = 2;
  }

  // ------------------------------------------------------------ lifecycle
  start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !this.paused) this.ctx.resume?.();
      return;
    }
    this.disposed = false;
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.out = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.out.connect(comp);
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(this.out);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);
    // reverb
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.6, 2.2);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0;
    this.verbSend.connect(this.verb);
    this.verb.connect(this.master);
    this.sfxBus.connect(this.verbSend);
    this.noise = this.makeNoise(false);
    this.brown = this.makeNoise(true);
    this.buildAmbience();
    this.applyVolumes();
    // music clock
    this.beat = 0;
    this.nextNote = ctx.currentTime + 0.2;
    this.timer = setInterval(() => this.schedule(), 60);
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        /* ignore */
      }
    }
    this.ctx = null;
    this.amb = {};
  }

  setMuted(m) {
    this.muted = !!m;
    this.applyVolumes();
  }

  setVolumes(v) {
    this.vol = { ...this.vol, ...v };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.muted ? 0 : this.vol.master;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m, t, this.muted ? 0.005 : 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.sfx * 0.8, t, 0.1);
  }

  setPaused(p) {
    this.paused = !!p;
    if (!this.ctx) return;
    try {
      if (p) this.ctx.suspend();
      else this.ctx.resume();
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------ helpers
  makeNoise(brown) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return b;
  }

  impulse(sec, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  loopNoise(brown, filterType, freq, q, bus) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.noise;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(bus || this.ambBus);
    src.start();
    return { src, f, g };
  }

  buildAmbience() {
    this.amb.ocean = this.loopNoise(true, "lowpass", 420, 0.5);
    this.amb.surf = this.loopNoise(false, "bandpass", 900, 0.4);
    this.amb.wind = this.loopNoise(false, "bandpass", 520, 0.7);
    this.amb.wash = this.loopNoise(false, "bandpass", 1500, 0.6);
    this.amb.rain = this.loopNoise(false, "highpass", 2400, 0.3);
    this.amb.cave = this.loopNoise(true, "lowpass", 180, 0.8);
    this.amb.leaves = this.loopNoise(false, "highpass", 3200, 0.4);
  }

  /** Simple spatialization: gain by distance, stereo pan by bearing. */
  spatial(x, z, ref = 30) {
    const ctx = this.ctx;
    const L = this.listener;
    const dx = x - L.x;
    const dz = z - L.z;
    const d = Math.hypot(dx, dz);
    const g = ctx.createGain();
    g.gain.value = Math.min(1, ref / Math.max(ref, d)) * (d > 600 ? 0 : 1);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      // listener right = (-cos yaw, sin yaw)
      const rx = -Math.cos(L.yaw);
      const rz = Math.sin(L.yaw);
      p.pan.value = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / d)) : 0;
      g.connect(p);
      p.connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    return { node: g, dist: d };
  }

  out2(node, x, z, ref) {
    if (x == null) {
      node.connect(this.sfxBus);
      return 0;
    }
    const s = this.spatial(x, z, ref);
    node.connect(s.node);
    return s.dist;
  }

  burst({ t = 0, dur = 0.3, type = "lowpass", freq = 800, q = 1, gain = 0.5, brown = false, freqEnd, x, z, ref = 30, attack = 0.004 }) {
    if (!this.ctx || this.disposed) return;
    const ctx = this.ctx;
    const at = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), at + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f);
    f.connect(g);
    this.out2(g, x, z, ref);
    src.start(at, Math.random() * 1.5, dur + 0.05);
  }

  tone({ t = 0, dur = 0.3, freq = 220, freqEnd, type = "sine", gain = 0.3, x, z, ref = 30, attack = 0.005, bus }) {
    if (!this.ctx || this.disposed) return;
    const ctx = this.ctx;
    const at = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    if (bus) g.connect(bus);
    else this.out2(g, x, z, ref);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  // ------------------------------------------------------------ world update
  /** Called every frame by the scene. s = { listener, mode, speed, shore, storm, rain, cave, onFoot, battle, fight, final, sailing } */
  update(dt, s) {
    if (!this.ctx || this.paused) return;
    Object.assign(this.state, s);
    if (s.listener) this.listener = s.listener;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const A = this.amb;
    const st = this.state;
    const inCave = st.cave;
    const menu = st.mode === "menu";
    const swell = 0.5 + 0.5 * Math.sin(t * 0.55) * Math.sin(t * 0.23 + 1);
    const sea = inCave ? 0.03 : 1;
    const set = (n, v, k = 0.25) => n && n.g.gain.setTargetAtTime(Math.max(0, v), t, k);
    set(A.ocean, (0.18 + swell * 0.16 + st.storm * 0.2) * sea);
    const shoreK = Math.max(0, 1 - st.shore / 70);
    set(A.surf, (shoreK * (0.08 + swell * 0.14) + (menu ? 0.06 : 0)) * sea);
    const sp = Math.min(1, (st.speed || 0) / 14);
    set(A.wind, (0.03 + sp * 0.07 + st.storm * 0.16) * (inCave ? 0.1 : 1));
    if (A.wind) A.wind.f.frequency.setTargetAtTime(420 + sp * 300 + st.storm * 200, t, 0.5);
    set(A.wash, (st.sailing ? sp * 0.12 : 0) * sea);
    set(A.rain, st.rain * 0.14 * (inCave ? 0.15 : 1));
    set(A.cave, inCave ? 0.22 : 0, 0.4);
    set(A.leaves, st.onFoot && !inCave ? 0.012 + st.storm * 0.02 : 0);
    this.verbSend.gain.setTargetAtTime(inCave ? 0.5 : 0, t, 0.3);

    // creaks while sailing
    if (st.sailing) {
      this.creakT -= dt;
      if (this.creakT <= 0) {
        this.creakT = 1.6 + Math.random() * 3.5 - sp;
        this.creak(0.12 + sp * 0.12);
      }
    }
    // gulls near islands in fair weather
    if (!inCave && st.storm < 0.5 && !st.night) {
      this.gullT -= dt;
      if (this.gullT <= 0) {
        this.gullT = 4 + Math.random() * 9;
        if (st.shore < 260 || menu) this.gull();
      }
    }
    if (st.onFoot && !inCave && st.storm < 0.5) {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = 1.5 + Math.random() * 4;
        this.bird();
      }
    }
    if (inCave) {
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = 0.6 + Math.random() * 2.2;
        this.tone({ freq: 1400 + Math.random() * 900, freqEnd: 600, dur: 0.12, gain: 0.05, type: "sine" });
      }
    }
    // music mood
    let mood = "explore";
    if (menu) mood = "menu";
    else if (st.battle) mood = "battle";
    else if (st.fight) mood = "fight";
    else if (inCave) mood = "cave";
    else if (st.final) mood = "final";
    this.nextMood = mood;
  }

  // ------------------------------------------------------------ sfx
  creak(g = 0.15) {
    const f = 120 + Math.random() * 200;
    this.burst({ dur: 0.5 + Math.random() * 0.4, type: "bandpass", freq: f * 3, freqEnd: f * 2.2, q: 14, gain: g * 0.6, attack: 0.08 });
    this.tone({ freq: f, freqEnd: f * 0.8, dur: 0.45, type: "sawtooth", gain: g * 0.08, attack: 0.1 });
  }

  gull() {
    const base = 1500 + Math.random() * 500;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      this.tone({ t: i * 0.22, freq: base, freqEnd: base * 0.62, dur: 0.18, type: "triangle", gain: 0.035, attack: 0.02 });
    }
  }

  bird() {
    const base = 2600 + Math.random() * 1600;
    for (let i = 0; i < 3; i++) this.tone({ t: i * 0.09, freq: base * (1 + i * 0.08), freqEnd: base * 1.3, dur: 0.06, type: "sine", gain: 0.02 });
  }

  cannon(x, z, big = false, own = false) {
    const g = own ? 0.85 : 0.75;
    this.burst({ dur: 0.9, type: "lowpass", freq: 1800, freqEnd: 120, q: 0.7, gain: g, brown: true, x, z, ref: 40 });
    this.tone({ freq: big ? 70 : 90, freqEnd: 32, dur: 0.6, type: "sine", gain: g * 0.9, x, z, ref: 40 });
    this.burst({ dur: 0.08, type: "highpass", freq: 2500, gain: g * 0.35, x, z, ref: 40 });
    this.burst({ t: 0.12, dur: 1.4, type: "lowpass", freq: 500, freqEnd: 150, q: 0.5, gain: g * 0.18, brown: true, x, z, ref: 60 });
  }

  reload(side) {
    void side;
    this.burst({ dur: 0.06, type: "bandpass", freq: 2200, q: 6, gain: 0.08 });
    this.burst({ t: 0.12, dur: 0.07, type: "bandpass", freq: 1600, q: 6, gain: 0.07 });
  }

  splash(x, z, big = false) {
    this.burst({ dur: big ? 0.9 : 0.6, type: "bandpass", freq: 1200, freqEnd: 400, q: 0.6, gain: big ? 0.5 : 0.32, x, z, ref: 30 });
    this.tone({ freq: 160, freqEnd: 60, dur: 0.25, gain: 0.15, x, z, ref: 30 });
  }

  woodHit(x, z, heavy = false) {
    this.burst({ dur: 0.35, type: "bandpass", freq: 700, freqEnd: 250, q: 3, gain: heavy ? 0.7 : 0.55, x, z, ref: 40 });
    this.tone({ freq: 110, freqEnd: 50, dur: 0.3, type: "triangle", gain: 0.4, x, z, ref: 40 });
    this.burst({ t: 0.03, dur: 0.25, type: "highpass", freq: 3000, gain: 0.2, x, z, ref: 40 });
  }

  thud(x, z) {
    this.burst({ dur: 0.4, type: "lowpass", freq: 400, freqEnd: 120, gain: 0.35, brown: true, x, z, ref: 30 });
  }

  scrape(x, z, k = 1) {
    this.burst({ dur: 0.9, type: "bandpass", freq: 300, freqEnd: 180, q: 2, gain: 0.35 * k, brown: true, x, z, ref: 30, attack: 0.05 });
    this.creak(0.3);
  }

  sink(x, z) {
    this.burst({ dur: 3.5, type: "lowpass", freq: 600, freqEnd: 120, gain: 0.4, brown: true, x, z, ref: 60, attack: 0.3 });
    for (let i = 0; i < 4; i++) this.creak(0.35);
    this.tone({ t: 0.5, freq: 80, freqEnd: 40, dur: 2.5, type: "sawtooth", gain: 0.06, x, z, ref: 60, attack: 0.5 });
  }

  horn() {
    // enemy spotted: ship's bell
    for (let i = 0; i < 3; i++) {
      this.tone({ t: i * 0.38, freq: 880, dur: 1.2, type: "sine", gain: 0.09 });
      this.tone({ t: i * 0.38, freq: 2210, dur: 0.7, type: "sine", gain: 0.03 });
    }
  }

  swing(combo = 0) {
    this.burst({ dur: 0.18, type: "bandpass", freq: 900 + combo * 300, freqEnd: 2600, q: 1.2, gain: 0.16 });
  }

  slash(x, z, heavy) {
    this.burst({ dur: 0.14, type: "bandpass", freq: 1800, q: 1, gain: heavy ? 0.4 : 0.3, x, z, ref: 12 });
    this.tone({ freq: 140, freqEnd: 70, dur: 0.15, type: "triangle", gain: 0.25, x, z, ref: 12 });
  }

  clang(x, z) {
    for (const f of [1320, 2230, 3420]) this.tone({ freq: f, dur: 0.45, type: "sine", gain: 0.08, x, z, ref: 12 });
    this.burst({ dur: 0.05, type: "highpass", freq: 4000, gain: 0.2, x, z, ref: 12 });
  }

  hurt() {
    this.tone({ freq: 220, freqEnd: 140, dur: 0.22, type: "sawtooth", gain: 0.08 });
    this.burst({ dur: 0.15, type: "lowpass", freq: 600, gain: 0.25 });
  }

  bones(x, z) {
    for (let i = 0; i < 7; i++) this.burst({ t: i * 0.05 + Math.random() * 0.03, dur: 0.05, type: "bandpass", freq: 2500 + Math.random() * 1500, q: 8, gain: 0.12, x, z, ref: 15 });
  }

  grunt(x, z) {
    this.tone({ freq: 160 + Math.random() * 60, freqEnd: 110, dur: 0.25, type: "sawtooth", gain: 0.05, x, z, ref: 12 });
  }

  step(surface = "sand", k = 1) {
    const f = surface === "wood" ? 900 : surface === "stone" ? 1700 : surface === "cave" ? 1300 : 2200;
    this.burst({ dur: surface === "sand" ? 0.12 : 0.07, type: "bandpass", freq: f, q: surface === "wood" ? 3 : 1, gain: 0.06 * k });
    if (surface === "wood") this.tone({ freq: 140, freqEnd: 90, dur: 0.07, type: "triangle", gain: 0.04 * k });
  }

  pickup() {
    [76, 81, 88].forEach((n, i) => this.tone({ t: i * 0.07, freq: NOTE(n), dur: 0.35, type: "triangle", gain: 0.1 }));
  }

  coins() {
    for (let i = 0; i < 8; i++) this.tone({ t: i * 0.04 + Math.random() * 0.03, freq: 2400 + Math.random() * 1800, dur: 0.12, type: "sine", gain: 0.05 });
  }

  chest() {
    this.creak(0.4);
    this.coins();
    [74, 78, 81, 86, 90].forEach((n, i) => this.tone({ t: 0.25 + i * 0.09, freq: NOTE(n), dur: 0.9, type: "triangle", gain: 0.1, bus: this.musicBus }));
    this.tone({ t: 0.25, freq: NOTE(50), dur: 1.6, type: "sine", gain: 0.12, bus: this.musicBus });
  }

  victory() {
    const seq = [62, 66, 69, 74, 69, 74, 78];
    seq.forEach((n, i) => this.tone({ t: i * 0.14, freq: NOTE(n), dur: i === seq.length - 1 ? 1.6 : 0.3, type: "square", gain: 0.05, bus: this.musicBus }));
    this.tone({ t: 0, freq: NOTE(38), dur: 2, type: "triangle", gain: 0.15, bus: this.musicBus });
  }

  dig() {
    this.burst({ dur: 0.25, type: "bandpass", freq: 1800, freqEnd: 900, q: 1, gain: 0.18 });
  }

  lever() {
    this.burst({ dur: 0.3, type: "bandpass", freq: 600, q: 5, gain: 0.3 });
    this.tone({ freq: 90, freqEnd: 60, dur: 0.3, type: "triangle", gain: 0.25 });
  }

  rumble() {
    this.burst({ dur: 2.2, type: "lowpass", freq: 220, freqEnd: 80, gain: 0.45, brown: true, attack: 0.3 });
  }

  dock() {
    this.creak(0.35);
    this.burst({ t: 0.4, dur: 0.4, type: "lowpass", freq: 400, gain: 0.25, brown: true });
  }

  objective() {
    [69, 76].forEach((n, i) => this.tone({ t: i * 0.12, freq: NOTE(n), dur: 0.5, type: "triangle", gain: 0.08 }));
  }

  locked() {
    this.burst({ dur: 0.12, type: "bandpass", freq: 900, q: 5, gain: 0.2 });
    this.burst({ t: 0.1, dur: 0.12, type: "bandpass", freq: 700, q: 5, gain: 0.18 });
  }

  thunder(delay = 1) {
    this.burst({ t: delay, dur: 3, type: "lowpass", freq: 260, freqEnd: 60, gain: 0.6, brown: true, attack: 0.05 });
    this.burst({ t: delay, dur: 0.4, type: "lowpass", freq: 1200, freqEnd: 200, gain: 0.3, brown: true });
  }

  ui() {
    this.tone({ freq: 660, freqEnd: 880, dur: 0.06, type: "triangle", gain: 0.05 });
  }

  // ------------------------------------------------------------ music
  /** Lookahead scheduler: 6/8 feel, eighth notes. */
  schedule() {
    if (!this.ctx || this.paused || this.disposed) return;
    const ctx = this.ctx;
    while (this.nextNote < ctx.currentTime + 0.18) {
      if (this.beat % 12 === 0) this.mood = this.nextMood;
      this.playStep(this.beat, this.nextNote);
      const bpm = { menu: 84, explore: 96, battle: 132, fight: 120, cave: 72, final: 80 }[this.mood] || 96;
      this.nextNote += 60 / bpm / 2;
      this.beat++;
    }
  }

  note(at, n, dur, type, gain, cutoff = 2400, attack = 0.01) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = NOTE(n);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  drum(at, kind, gain) {
    const ctx = this.ctx;
    if (kind === "kick") {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(110, at);
      o.frequency.exponentialRampToValueAtTime(40, at + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      o.connect(g);
      g.connect(this.musicBus);
      o.start(at);
      o.stop(at + 0.35);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = kind === "snare" ? "bandpass" : "highpass";
      f.frequency.value = kind === "snare" ? 1800 : 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + (kind === "snare" ? 0.16 : 0.05));
      src.connect(f);
      f.connect(g);
      g.connect(this.musicBus);
      src.start(at, Math.random(), 0.2);
    }
  }

  playStep(b, at) {
    const mood = this.mood;
    const bar = Math.floor(b / 12) % 4;
    const s = b % 12;
    // D dorian progression: Dm  C  Bb  A   (final/cave: Dm Bb Gm A)
    const dark = mood === "final" || mood === "cave";
    const roots = dark ? [50, 46, 43, 45] : [50, 48, 46, 45];
    const root = roots[bar];
    const third = bar === 3 ? 4 : bar === 1 || (!dark && bar === 2) ? 4 : 3;
    // bass on the dotted beats
    if (s === 0 || s === 6) this.note(at, root - 12, 0.5, "triangle", mood === "battle" ? 0.22 : 0.16, 600);
    if (mood === "battle" && (s === 3 || s === 9)) this.note(at, root - 12, 0.18, "triangle", 0.12, 500);
    // pad (accordion-ish) at bar start
    if (s === 0 && mood !== "battle") {
      for (const iv of [0, third, 7]) this.note(at, root + iv, 2.6, "sawtooth", mood === "menu" ? 0.025 : 0.02, 1100, 0.25);
    }
    if (s === 0 && mood === "battle") for (const iv of [0, third, 7]) this.note(at, root + 12 + iv, 0.25, "square", 0.03, 1800);
    // plucked melody / arpeggio
    const MEL = {
      explore: [62, -1, 65, 69, -1, 67, 65, -1, 64, 62, -1, 60],
      menu: [62, 65, 69, 72, 69, 65, 62, 65, 69, 74, 69, 65],
      battle: [74, 74, 72, 74, 77, 74, 72, 69, 70, 69, 67, 65],
      fight: [62, -1, 62, 65, -1, 67, 69, -1, 67, 65, -1, 64],
      cave: [62, -1, -1, 65, -1, -1, 63, -1, -1, 62, -1, -1],
      final: [62, -1, 63, 65, -1, 63, 62, -1, 58, 57, -1, -1],
    }[mood] || [];
    let n = MEL[s];
    if (n != null && n > 0) {
      const shift = root - 50;
      n += mood === "menu" || mood === "battle" ? shift : bar === 2 ? -2 : bar === 3 ? -1 : 0;
      const pluck = mood === "battle" ? 0.045 : 0.05;
      this.note(at, n, mood === "cave" ? 0.9 : 0.35, "triangle", pluck, 3000);
      if (mood !== "cave") this.note(at, n + 12, 0.18, "sine", 0.012, 4000);
    }
    // drums
    if (mood === "battle") {
      if (s === 0 || s === 6) this.drum(at, "kick", 0.4);
      if (s === 3 || s === 9) this.drum(at, "snare", 0.18);
      if (s % 2 === 1) this.drum(at, "hat", 0.05);
    } else if (mood === "fight") {
      if (s === 0 || s === 6) this.drum(at, "kick", 0.3);
      if (s === 9) this.drum(at, "snare", 0.12);
      this.drum(at, "hat", s % 3 === 0 ? 0.04 : 0.02);
    } else if (mood === "explore") {
      if (s === 0) this.drum(at, "kick", 0.12);
      if (s === 3 || s === 9) this.drum(at, "hat", 0.025);
    }
  }
}
