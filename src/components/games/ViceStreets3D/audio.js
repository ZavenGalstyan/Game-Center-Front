/**
 * Vice Streets 3D — synthesized audio (Web Audio API, no sound files; all original).
 *
 * Continuous: player engine (two detuned oscillators through a throttle-
 * driven low-pass, pitch from RPM), tyre squeal (band-passed noise), police
 * sirens (nearest active cruiser, distance attenuated), city ambience
 * (brown-noise traffic hum, surf near the beach) and an in-car radio loop.
 * One-shots: horn, crashes, door, footsteps, jump/land, honks, screams,
 * checkpoint, mission pass/fail, wanted sting, purchase, level up, UI clicks.
 *
 * GamePlayer's Mute sets the master gain to 0 for everything.
 */
const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;

class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.8;
    this.radioOn = true;
    this.ready = false;
  }
  unlock() {
    if (!AC) return;
    if (!this.ctx) {
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }
  build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.amb = c.createGain();
    this.amb.gain.value = 0.5;
    this.amb.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    // noise buffer
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const b = this.brown.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
    // engine
    this.eng = { gain: c.createGain(), filt: c.createBiquadFilter(), o1: c.createOscillator(), o2: c.createOscillator() };
    const E = this.eng;
    E.o1.type = "sawtooth";
    E.o2.type = "square";
    E.filt.type = "lowpass";
    E.filt.frequency.value = 400;
    E.gain.gain.value = 0;
    E.o1.connect(E.filt);
    const g2 = c.createGain();
    g2.gain.value = 0.5;
    E.o2.connect(g2);
    g2.connect(E.filt);
    E.filt.connect(E.gain);
    E.gain.connect(this.sfx);
    E.o1.start();
    E.o2.start();
    // tyres
    this.tyre = this.loopNoise(this.sfx, "bandpass", 1800, 4);
    // siren
    this.siren = { gain: c.createGain(), osc: c.createOscillator(), lfo: c.createOscillator(), lfoG: c.createGain() };
    const S = this.siren;
    S.osc.type = "square";
    S.osc.frequency.value = 800;
    S.lfo.frequency.value = 0.55;
    S.lfoG.gain.value = 260;
    S.lfo.connect(S.lfoG);
    S.lfoG.connect(S.osc.frequency);
    const sf = c.createBiquadFilter();
    sf.type = "lowpass";
    sf.frequency.value = 1600;
    S.osc.connect(sf);
    sf.connect(S.gain);
    S.gain.gain.value = 0;
    S.gain.connect(this.sfx);
    S.osc.start();
    S.lfo.start();
    // ambience
    this.hum = this.loopNoise(this.amb, "lowpass", 380, 0.7, this.brown);
    this.surf = this.loopNoise(this.amb, "lowpass", 900, 0.6);
    this.surfLfo = 0;
    this.ready = true;
    this.apply();
  }
  loopNoise(dest, type, freq, q, buf) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf || this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start();
    return { src, f, g };
  }
  apply() {
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }
  setMuted(m) {
    this.muted = !!m;
    this.apply();
  }
  setVolume(v) {
    this.volume = v;
    this.apply();
  }
  setRadio(on) {
    this.radioOn = !!on;
  }
  silence() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const g of [this.eng.gain, this.tyre.g, this.siren.gain, this.hum.g, this.surf.g, this.music]) g.gain.setTargetAtTime(0, t, 0.08);
  }

  /** continuous sounds from the live sim (call every frame) */
  update(sim, dt, opts = {}) {
    if (!this.ready || this.ctx.state !== "running") return;
    const c = this.ctx;
    const t = c.currentTime;
    const pl = sim.player;
    const car = pl.mode === "car" ? pl.car : null;
    const E = this.eng;
    if (car && !car.wrecked && !opts.paused) {
      const pitch = { compact: 1.25, sedan: 1, taxi: 1, suv: 0.85, van: 0.75, muscle: 0.7, sports: 1.35, police: 0.95 }[car.type] || 1;
      const f = (38 + car.rpm * 150) * pitch;
      E.o1.frequency.setTargetAtTime(f, t, 0.05);
      E.o2.frequency.setTargetAtTime(f * 0.501, t, 0.05);
      E.filt.frequency.setTargetAtTime(300 + Math.abs(car.throttle) * 1500 + car.rpm * 600, t, 0.05);
      E.gain.gain.setTargetAtTime(0.06 + Math.abs(car.throttle) * 0.07, t, 0.08);
      this.tyre.g.gain.setTargetAtTime(car.skid > 0.25 && Math.abs(car.vf) > 4 ? car.skid * 0.12 : 0, t, 0.05);
    } else {
      E.gain.gain.setTargetAtTime(0, t, 0.1);
      this.tyre.g.gain.setTargetAtTime(0, t, 0.08);
    }
    // nearest siren
    const F = sim.focus();
    let best = 1e9;
    for (const u of sim.police.units) if (u.siren) best = Math.min(best, Math.hypot(u.x - F.x, u.z - F.z));
    this.siren.gain.gain.setTargetAtTime(best < 200 && !opts.paused ? 0.07 * Math.max(0, 1 - best / 200) ** 1.5 : 0, t, 0.1);
    // ambience: traffic hum everywhere, surf by the beach
    const beach = Math.max(0, 1 - Math.abs(F.x - 320) / 90);
    this.surfLfo += dt * 0.35;
    this.hum.g.gain.setTargetAtTime(opts.paused ? 0 : 0.05, t, 0.3);
    this.surf.g.gain.setTargetAtTime(opts.paused ? 0 : beach * (0.05 + 0.04 * Math.sin(this.surfLfo)), t, 0.3);
    // radio in the car
    const radio = car && this.radioOn && !opts.paused;
    this.music.gain.setTargetAtTime(radio ? 0.11 : 0, t, 0.4);
    if (radio) this.radioTick();
  }
  /* ---------------------------------------------------------------- radio: an original tropical synth loop */
  radioTick() {
    const c = this.ctx;
    const BPM = 104;
    const beat = 60 / BPM;
    if (!this.rNext || this.rNext < c.currentTime) this.rNext = c.currentTime + 0.05;
    this.rStep = this.rStep || 0;
    // chords: Am – F – C – G, with a bass line, plucks and a hat
    const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    while (this.rNext < c.currentTime + 0.2) {
      const s = this.rStep;
      const bar = Math.floor(s / 8) % 4;
      const at = this.rNext;
      const ch = CH[bar];
      if (s % 8 === 0 || s % 8 === 3 || s % 8 === 6) this.note(ch[0] - 24, at, beat * 0.9, "triangle", 0.5, this.music);
      if (s % 2 === 1) this.note(ch[(s >> 1) % 3] + 12, at, beat * 0.4, "square", 0.12, this.music, 2400);
      if (s % 4 === 2) for (const n of ch) this.note(n, at, beat * 0.6, "sawtooth", 0.06, this.music, 1400);
      this.hat(at, s % 2 ? 0.05 : 0.09, this.music);
      this.rNext += beat / 2;
      this.rStep++;
    }
  }
  note(midi, at, dur, type, vol, dest = this.sfx, cut = 0) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    let n = o;
    if (cut) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = cut;
      o.connect(f);
      n = f;
    }
    n.connect(g);
    g.connect(dest);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
  hat(at, vol, dest) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(at, Math.random());
    s.stop(at + 0.06);
  }
  burst(dur, freq, vol, type = "lowpass", q = 1) {
    if (!this.ready) return;
    const c = this.ctx;
    const at = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(at, Math.random());
    s.stop(at + dur + 0.02);
  }
  tone(freq, dur, type = "sine", vol = 0.2, delay = 0, slide = 0) {
    if (!this.ready) return;
    const c = this.ctx;
    const at = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g);
    g.connect(this.sfx);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
  /* ---------------------------------------------------------------- one-shots */
  horn() {
    this.tone(392, 0.32, "square", 0.08);
    this.tone(494, 0.32, "square", 0.07);
  }
  honk(d) {
    const k = Math.max(0, 1 - d / 60);
    if (k <= 0) return;
    this.tone(360, 0.25, "square", 0.05 * k);
    this.tone(450, 0.25, "square", 0.04 * k);
  }
  crash(impact, d = 0) {
    const k = Math.max(0, 1 - d / 80) * Math.min(1, impact / 14);
    if (k <= 0.02) return;
    this.burst(0.35 + k * 0.3, 900, 0.5 * k);
    this.tone(70, 0.25, "sine", 0.4 * k, 0, -30);
    if (impact > 8) this.burst(0.25, 4200, 0.15 * k, "bandpass", 3);
  }
  door() {
    this.tone(180, 0.06, "square", 0.12);
    this.burst(0.08, 1200, 0.18);
  }
  step(run) {
    this.burst(0.05, run ? 1500 : 1100, run ? 0.07 : 0.045, "bandpass", 2);
  }
  jump() {
    this.burst(0.08, 900, 0.06);
  }
  land(v) {
    this.burst(0.12, 500, Math.min(0.2, v * 0.02));
  }
  scream(d) {
    const k = Math.max(0, 1 - d / 50);
    if (k > 0) this.tone(900 + Math.random() * 300, 0.45, "sawtooth", 0.035 * k, 0, 400);
  }
  pedHit(speed = 8) {
    const k = Math.min(1, 0.45 + speed / 16);
    this.tone(120, 0.15, "sine", 0.3 * k, 0, -40);
    this.burst(0.15, 700, 0.25 * k);
  }
  /* fists: a swish, a meaty thump (heavier and lower for the haymaker), a body fall */
  swing(heavy, d = 0) {
    const k = Math.max(0, 1 - d / 30);
    if (k > 0) this.burst(heavy ? 0.2 : 0.11, heavy ? 1300 : 2000, (heavy ? 0.09 : 0.06) * k, "bandpass", 1.4);
  }
  punch(heavy, d = 0) {
    const k = Math.max(0, 1 - d / 40);
    if (k <= 0) return;
    this.tone(heavy ? 85 : 140, heavy ? 0.16 : 0.09, "sine", (heavy ? 0.45 : 0.3) * k, 0, heavy ? -40 : -60);
    this.burst(heavy ? 0.1 : 0.06, heavy ? 1100 : 1700, (heavy ? 0.3 : 0.2) * k);
  }
  block(d = 0) {
    const k = Math.max(0, 1 - d / 40);
    if (k > 0) this.burst(0.07, 600, 0.22 * k, "lowpass", 1);
  }
  coin() {
    this.tone(1320, 0.08, "square", 0.06);
    this.tone(1760, 0.14, "square", 0.05, 0.07);
  }
  bodyFall(d = 0) {
    const k = Math.max(0, 1 - d / 40);
    if (k <= 0) return;
    this.tone(70, 0.22, "sine", 0.28 * k, 0.12, -25);
    this.burst(0.2, 450, 0.2 * k, "lowpass", 1);
  }
  /* street furniture: clang (metal poles), crack (wood), clatter (bins) */
  propBreak(type, d = 0) {
    const k = Math.max(0, 1 - d / 70);
    if (k <= 0) return;
    if (type === "lamp" || type === "signal" || type === "sign") {
      const f = type === "sign" ? 900 : 520;
      this.tone(f, 0.5, "triangle", 0.09 * k, 0, -f * 0.3);
      this.tone(f * 1.48, 0.35, "triangle", 0.06 * k, 0.01, -f * 0.4);
      this.burst(0.12, 3200, 0.14 * k, "bandpass", 3);
      if (type !== "sign") this.tone(160, 0.3, "sine", 0.2 * k, 0.75, -60); // hits the ground
    } else if (type === "picket" || type === "barrier") {
      this.burst(0.07, 2400, 0.22 * k, "bandpass", 2);
      this.burst(0.18, 900, 0.16 * k, "bandpass", 1.5);
      this.tone(220, 0.08, "square", 0.04 * k);
    } else {
      this.burst(0.25, 1800, 0.18 * k, "bandpass", 1.2);
      this.tone(330, 0.2, "triangle", 0.06 * k, 0.05, -120);
    }
  }
  bump(d = 0) {
    const k = Math.max(0, 1 - d / 40);
    if (k > 0) this.tone(400, 0.18, "triangle", 0.05 * k, 0, -150);
  }
  checkpoint() {
    this.tone(880, 0.12, "triangle", 0.2);
    this.tone(1320, 0.18, "triangle", 0.18, 0.08);
  }
  objective() {
    this.tone(660, 0.12, "triangle", 0.15);
    this.tone(990, 0.2, "triangle", 0.15, 0.1);
  }
  countdown(n) {
    this.tone(n ? 600 : 1200, n ? 0.18 : 0.45, "square", 0.1);
  }
  success() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, "triangle", 0.18, i * 0.12));
    this.tone(1318, 0.6, "triangle", 0.16, 0.5);
  }
  fail() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, "sawtooth", 0.08, i * 0.16));
  }
  wanted(up) {
    if (up) {
      this.tone(520, 0.12, "square", 0.08);
      this.tone(780, 0.2, "square", 0.08, 0.12);
    } else [784, 988, 1175].forEach((f, i) => this.tone(f, 0.2, "triangle", 0.14, i * 0.1));
  }
  busted() {
    this.tone(220, 0.8, "sawtooth", 0.1, 0, -80);
  }
  purchase() {
    this.tone(1568, 0.08, "square", 0.08);
    this.tone(2093, 0.25, "triangle", 0.15, 0.07);
  }
  levelUp() {
    [523, 784, 1046, 1568].forEach((f, i) => this.tone(f, 0.25, "triangle", 0.16, i * 0.09));
  }
  ui() {
    this.tone(700, 0.05, "triangle", 0.08);
  }
  deny() {
    this.tone(200, 0.15, "square", 0.08);
  }
  dispose() {
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.ready = false;
  }
}
export const audio = new Audio();
