/**
 * Zombie Outbreak — sound, synthesized at runtime with WebAudio (no files).
 *
 *   master ─ compressor ─ out
 *     ├─ sfx bus    guns, impacts, zombies, player, pickups (stereo-panned
 *     │             from the player's point of view, distance-attenuated)
 *     ├─ amb bus    per-arena bed: wind + sirens, machinery, electrical hum,
 *     │             lab alarms + vents, storm + thunder
 *     ├─ music bus  low drone that tightens during waves, boss pulse
 *     └─ reverb     short generated impulse, wetter indoors
 *
 * Mute (Game Center) zeroes the master immediately; pause suspends the
 * context. Everything stops in dispose().
 */

const WEAPON_SND = {
  pistol: { crack: 2600, q: 0.8, body: 140, dur: 0.16, gain: 0.75, tail: 0.25 },
  smg: { crack: 3200, q: 0.9, body: 160, dur: 0.09, gain: 0.55, tail: 0.15 },
  shotgun: { crack: 1300, q: 0.6, body: 80, dur: 0.38, gain: 1.0, tail: 0.5 },
  rifle: { crack: 2300, q: 0.8, body: 110, dur: 0.17, gain: 0.7, tail: 0.3 },
  marksman: { crack: 1900, q: 0.7, body: 70, dur: 0.32, gain: 1.0, tail: 0.6 },
  blaster: { zap: true, crack: 1600, q: 1, body: 60, dur: 0.3, gain: 0.85, tail: 0.35 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
    this.vol = { master: 0.85, music: 0.6, sfx: 0.9 };
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.amb = null;
    this.ambId = null;
    this.indoor = false;
    this.nextAmbEvent = 0;
    this.music = null;
    this.tension = 0;
    this.boss = false;
    this.stepT = 0;
    this.zStepT = 0;
    this.lowHp = 0;
    this.heartT = 0;
  }

  // ------------------------------------------------------------ lifecycle
  start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !this.paused) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfx.connect(this.master);
    this.ambBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(1.6, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.22;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);
    // 2 s of white noise, reused by every noisy sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Soft-clip curve for monster voices.
    this.dist = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    this.curve = curve;
    this.applyVolumes();
    if (this.ambId) this.setAmbience(this.ambId, this.indoor, true);
  }

  impulse(sec, decay) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.02);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.02);
    this.ambBus.gain.setTargetAtTime(this.vol.music * 0.9 + 0.1 * this.vol.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.05);
  }

  setMuted(m) {
    this.muted = !!m;
    this.applyVolumes();
  }

  setVolumes(v) {
    this.vol = { ...this.vol, ...v };
    this.applyVolumes();
  }

  setPaused(p) {
    this.paused = !!p;
    if (!this.ctx) return;
    if (p && this.ctx.state === "running") this.ctx.suspend().catch(() => {});
    else if (!p && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  /** Stops loops (ambience / music) without tearing the graph down. */
  reset() {
    this.stopAmbience();
    this.stopMusic();
    this.tension = 0;
    this.boss = false;
    this.lowHp = 0;
  }

  dispose() {
    this.reset();
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        /* ignore */
      }
    }
    this.ctx = null;
  }

  // ------------------------------------------------------------ primitives
  now() {
    return this.ctx.currentTime;
  }

  /** Stereo position relative to the listener: returns a panner node chain input. */
  spatial(x, z, base = 1, range = 40) {
    const ctx = this.ctx;
    const L = this.listener;
    const dx = x - L.x;
    const dz = z - L.z;
    const d = Math.hypot(dx, dz);
    // Listener faces (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw).
    const right = (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / (d || 1);
    const fwd = (-dx * Math.sin(L.yaw) - dz * Math.cos(L.yaw)) / (d || 1);
    const g = ctx.createGain();
    g.gain.value = base / (1 + d * 0.11) * (d > range ? 0 : 1);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.92, Math.min(0.92, right * 0.9));
    // Muffle sounds behind the player a touch.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = fwd < -0.3 ? 2600 : 9000;
    g.connect(lp);
    lp.connect(pan);
    pan.connect(this.sfx);
    return { input: g, d };
  }

  noiseSrc(dur, offset = Math.random()) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(this.now(), offset * 1.5, dur + 0.05);
    return s;
  }

  env(param, t, a, peak, d, end = 0.0001) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(Math.max(end, 0.0001), t + a + d);
  }

  tone(type, f0, f1, dur, gain, dest, delay = 0) {
    const ctx = this.ctx;
    const t = this.now() + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.005, gain, dur);
    o.connect(g);
    g.connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
    return g;
  }

  noiseBurst(type, freq, q, dur, gain, dest, attack = 0.002, delay = 0) {
    const ctx = this.ctx;
    const t = this.now() + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g.gain, t, attack, gain, dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest || this.sfx);
    s.start(t, Math.random() * 1.5);
    s.stop(t + attack + dur + 0.05);
    return g;
  }

  // ------------------------------------------------------------ sounds
  gunshot(id, ads) {
    const P = WEAPON_SND[id] || WEAPON_SND.pistol;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = P.gain;
    out.connect(this.sfx);
    out.connect(this.reverb);
    const j = 0.92 + Math.random() * 0.16;
    if (P.zap) {
      this.tone("sawtooth", 1400 * j, 140, 0.22, 0.35, out);
      this.tone("square", 700 * j, 90, 0.18, 0.18, out);
      this.noiseBurst("bandpass", 3200, 0.8, 0.12, 0.5, out);
      this.tone("sine", 90, 35, 0.3, 0.9, out);
      return;
    }
    this.noiseBurst("bandpass", P.crack * j, P.q, P.dur * 0.55, 1.0, out);
    this.noiseBurst("lowpass", 900, 0.7, P.dur, 0.9, out);
    this.tone("sine", P.body * 1.8 * j, P.body * 0.4, P.dur * 1.2, 1.1, out);
    this.noiseBurst("highpass", 6000, 0.5, 0.025, 0.5, out);
    // Mechanical clack.
    this.noiseBurst("bandpass", 4200, 4, 0.02, 0.18, out, 0.001, 0.03);
    // Distant slap-back echo outdoors.
    if (!this.indoor) this.noiseBurst("lowpass", 700, 0.6, P.tail, 0.18, this.sfx, 0.01, 0.12 + Math.random() * 0.05);
    void ads;
  }

  click(freq = 3000, gain = 0.25, delay = 0, dest) {
    this.noiseBurst("bandpass", freq, 6, 0.03, gain, dest, 0.001, delay);
    this.tone("square", freq * 0.3, freq * 0.25, 0.02, gain * 0.25, dest, delay);
  }

  reload(id, phase, dur) {
    if (phase === "start") {
      this.noiseBurst("bandpass", 900, 1.2, 0.12, 0.15);
      if (id !== "shotgun") {
        this.click(1800, 0.3, 0.12);
        this.noiseBurst("lowpass", 500, 1, 0.1, 0.18, undefined, 0.002, 0.18);
        this.click(2400, 0.32, Math.max(0.3, dur * 0.6));
      } else this.click(1500, 0.2, 0.1);
    } else if (phase === "shell") {
      this.click(2100, 0.28);
      this.noiseBurst("bandpass", 1200, 2, 0.05, 0.15, undefined, 0.002, 0.03);
    } else if (phase === "end") {
      if (id === "shotgun") {
        this.noiseBurst("bandpass", 1400, 2, 0.08, 0.35);
        this.noiseBurst("bandpass", 1100, 2, 0.08, 0.35, undefined, 0.002, 0.14);
      } else if (id === "blaster") {
        this.tone("sine", 300, 1400, 0.3, 0.22);
      } else {
        this.click(2800, 0.35);
        this.click(2000, 0.25, 0.06);
      }
    }
  }

  pump() {
    this.noiseBurst("bandpass", 1300, 2, 0.07, 0.3, undefined, 0.002, 0.12);
    this.noiseBurst("bandpass", 1000, 2, 0.07, 0.3, undefined, 0.002, 0.3);
  }

  growl(x, z, type, loud) {
    const ctx = this.ctx;
    const sp = this.spatial(x, z, loud ? 1.4 : 0.55, loud ? 80 : 32);
    if (sp.d > (loud ? 80 : 32)) return;
    const t = this.now();
    const dur = loud ? 1.8 : 0.7 + Math.random() * 0.7;
    const base = { walker: 85, runner: 160, brute: 55, spitter: 120, bomber: 75 }[type] || (loud ? 42 : 80);
    const f0 = base * (0.85 + Math.random() * 0.3);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.5), t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7 + Math.random() * 9;
    const lg = ctx.createGain();
    lg.gain.value = f0 * 0.12;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const ws = ctx.createWaveShaper();
    ws.curve = this.curve;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(type === "runner" ? 1300 : 600, t);
    bp.frequency.linearRampToValueAtTime(type === "runner" ? 900 : 380, t + dur);
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    this.env(g.gain, t, 0.08, 0.5, dur);
    o.connect(ws);
    ws.connect(bp);
    bp.connect(g);
    // Breath noise.
    const n = this.noiseSrc(dur);
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 900;
    nf.Q.value = 1;
    const ng = ctx.createGain();
    this.env(ng.gain, t, 0.05, 0.25, dur);
    n.connect(nf);
    nf.connect(ng);
    ng.connect(sp.input);
    g.connect(sp.input);
    g.connect(this.reverb);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
  }

  roar(x, z, small) {
    const sp = this.spatial(x, z, small ? 1.0 : 1.8, 120);
    const ctx = this.ctx;
    const t = this.now();
    const dur = small ? 0.9 : 2.2;
    for (const [f, gg] of [
      [48, 0.6],
      [73, 0.4],
      [110, 0.25],
    ]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 1.3, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, t + dur);
      const ws = ctx.createWaveShaper();
      ws.curve = this.curve;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      const g = ctx.createGain();
      this.env(g.gain, t, 0.15, gg, dur);
      o.connect(ws);
      ws.connect(lp);
      lp.connect(g);
      g.connect(sp.input);
      g.connect(this.reverb);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    this.noiseBurst("lowpass", 500, 0.8, dur * 0.8, 0.5, sp.input, 0.1);
  }

  boom(x, z, size = 1) {
    const sp = this.spatial(x, z, 1.6 * size, 120);
    this.tone("sine", 90, 28, 0.9 * size, 1.4, sp.input);
    this.noiseBurst("lowpass", 1200, 0.6, 0.7 * size, 1.2, sp.input);
    this.noiseBurst("lowpass", 300, 0.6, 1.4 * size, 0.6, this.reverb, 0.01);
  }

  impact(x, z, surface) {
    const sp = this.spatial(x, z, 0.35, 45);
    if (surface === "metal") {
      this.tone("triangle", 1800 + Math.random() * 1600, 900, 0.18, 0.25, sp.input);
      this.noiseBurst("highpass", 4000, 1, 0.05, 0.3, sp.input);
    } else if (surface === "glass") {
      this.noiseBurst("highpass", 5500, 1, 0.12, 0.35, sp.input);
      this.tone("sine", 3800, 3000, 0.15, 0.12, sp.input);
    } else if (surface === "wood") this.noiseBurst("bandpass", 700, 2, 0.06, 0.4, sp.input);
    else this.noiseBurst("bandpass", 1500, 1.2, 0.05, 0.35, sp.input);
  }

  flesh(x, z, head) {
    const sp = this.spatial(x, z, 0.6, 60);
    this.noiseBurst("lowpass", 450, 1.5, 0.08, 0.9, sp.input);
    this.tone("sine", 160, 60, 0.08, 0.5, sp.input);
    if (head) {
      // Distinct "tink" + crunch for headshots, routed straight (not spatial) so it reads.
      this.tone("sine", 2600, 2400, 0.09, 0.22);
      this.noiseBurst("bandpass", 2400, 3, 0.05, 0.25);
    }
  }

  killConfirm(boss) {
    this.tone("sine", boss ? 440 : 880, boss ? 330 : 660, 0.08, 0.12);
    this.noiseBurst("lowpass", 300, 1, 0.25, 0.5);
  }

  hurt(amount) {
    const k = Math.min(1, amount / 30);
    this.tone("sine", 120, 50, 0.22, 0.7 * (0.5 + k));
    this.noiseBurst("lowpass", 700, 1, 0.12, 0.6 * (0.5 + k));
    // Grunt.
    this.tone("sawtooth", 180 + Math.random() * 40, 120, 0.16, 0.12 + k * 0.1);
  }

  whoosh(x, z) {
    const sp = this.spatial(x, z, 0.7, 20);
    const ctx = this.ctx;
    const t = this.now();
    const s = this.noiseSrc(0.25);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.2);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.05, 0.5, 0.2);
    s.connect(f);
    f.connect(g);
    g.connect(sp.input);
  }

  pickup(kind) {
    const notes = { health: [660, 880, 1100], ammo: [520, 700], armor: [440, 660, 880], boost: [700, 1050, 1400] }[kind] || [600, 900];
    notes.forEach((f, i) => this.tone("triangle", f, f, 0.14, 0.18, undefined, i * 0.06));
    if (kind === "ammo") this.click(2200, 0.3, 0.05);
  }

  deny() {
    this.tone("square", 220, 180, 0.12, 0.1);
  }

  horn(final) {
    const t0 = 0;
    for (const [f, d] of [
      [final ? 110 : 147, 0.9],
      [final ? 82 : 110, 1.2],
    ]) {
      this.tone("sawtooth", f, f * 0.98, d, 0.16, this.musicBus, t0);
      this.tone("sawtooth", f * 1.5, f * 1.48, d, 0.08, this.musicBus, t0);
    }
    this.tone("sine", 55, 40, 1.4, 0.5, this.musicBus);
  }

  stinger(win) {
    const seq = win ? [523, 659, 784, 1046] : [392, 330, 262];
    seq.forEach((f, i) => {
      this.tone("triangle", f, f, 0.45, 0.16, this.musicBus, i * 0.13);
      this.tone("sine", f / 2, f / 2, 0.6, 0.12, this.musicBus, i * 0.13);
    });
  }

  gameOver() {
    this.tone("sawtooth", 110, 40, 2.6, 0.25, this.musicBus);
    this.tone("sine", 55, 30, 3, 0.5, this.musicBus);
    this.noiseBurst("lowpass", 200, 1, 2.5, 0.3, this.musicBus, 0.2);
  }

  footstep(sprint) {
    this.noiseBurst("lowpass", sprint ? 520 : 380, 1, 0.07, sprint ? 0.22 : 0.15);
    this.noiseBurst("bandpass", 2400, 1, 0.025, 0.04);
  }

  zstep(x, z, heavy) {
    const sp = this.spatial(x, z, heavy ? 0.7 : 0.28, 28);
    this.noiseBurst("lowpass", heavy ? 160 : 300, 1, heavy ? 0.16 : 0.08, 0.6, sp.input);
    if (heavy) this.tone("sine", 60, 35, 0.2, 0.6, sp.input);
  }

  spit(x, z) {
    const sp = this.spatial(x, z, 0.8, 40);
    const ctx = this.ctx;
    const t = this.now();
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.01, 0.4, 0.2);
    o.connect(g);
    g.connect(sp.input);
    o.start(t);
    o.stop(t + 0.3);
    this.noiseBurst("bandpass", 1200, 2, 0.15, 0.3, sp.input);
  }

  splat(x, z) {
    const sp = this.spatial(x, z, 0.6, 40);
    this.noiseBurst("lowpass", 600, 2, 0.18, 0.7, sp.input);
    this.tone("sine", 200, 80, 0.15, 0.3, sp.input);
  }

  beep(x, z, rate = 1) {
    const sp = this.spatial(x, z, 0.6, 40);
    this.tone("square", 1800 * rate, 1800 * rate, 0.05, 0.25, sp.input);
  }

  // ------------------------------------------------------------ ambience / music
  setAmbience(id, indoor, force = false) {
    if (!force && id === this.ambId) return;
    this.ambId = id;
    this.indoor = !!indoor;
    if (!this.ctx) return;
    this.stopAmbience();
    this.wet.gain.value = indoor ? 0.36 : 0.18;
    const ctx = this.ctx;
    const nodes = [];
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(1, this.now(), 1.5);
    g.connect(this.ambBus);
    nodes.push(g);
    const noiseBed = (type, freq, q, gain) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = gain;
      s.connect(f);
      f.connect(gg);
      gg.connect(g);
      s.start();
      nodes.push(s, f, gg);
      return { s, f, gg };
    };
    const hum = (freq, gain, type = "sawtooth") => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 400;
      const gg = ctx.createGain();
      gg.gain.value = gain;
      o.connect(f);
      f.connect(gg);
      gg.connect(g);
      o.start();
      nodes.push(o, f, gg);
      return { o, gg };
    };
    // Wind (outdoors) / room tone (indoors).
    const wind = noiseBed("bandpass", indoor ? 260 : 420, 0.6, indoor ? 0.05 : 0.12);
    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.08;
    const wl = ctx.createGain();
    wl.gain.value = indoor ? 60 : 180;
    windLfo.connect(wl);
    wl.connect(wind.f.frequency);
    windLfo.start();
    nodes.push(windLfo, wl);
    if (id === "warehouse") hum(55, 0.025);
    if (id === "hospital") {
      hum(60, 0.02);
      hum(120, 0.008, "square");
    }
    if (id === "lab") {
      hum(50, 0.03);
      noiseBed("highpass", 2000, 0.4, 0.015); // ventilation hiss
    }
    if (id === "military") noiseBed("lowpass", 180, 0.5, 0.08); // storm rumble
    this.amb = { nodes, g };
    this.nextAmbEvent = this.now() + 3;
  }

  stopAmbience() {
    if (!this.amb || !this.ctx) {
      this.amb = null;
      return;
    }
    const { nodes, g } = this.amb;
    const t = this.now();
    try {
      g.gain.setTargetAtTime(0, t, 0.2);
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      for (const n of nodes) {
        try {
          if (n.stop) n.stop();
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    }, 900);
    this.amb = null;
  }

  ambientEvent() {
    const id = this.ambId;
    const ang = Math.random() * Math.PI * 2;
    const x = this.listener.x + Math.cos(ang) * 40;
    const z = this.listener.z + Math.sin(ang) * 40;
    if (id === "city") {
      if (Math.random() < 0.5) {
        // Distant siren sweep.
        const sp = this.spatial(x, z, 0.5, 200);
        const ctx = this.ctx;
        const t = this.now();
        const o = ctx.createOscillator();
        o.type = "sine";
        const g = ctx.createGain();
        this.env(g.gain, t, 1.2, 0.18, 5);
        for (let i = 0; i < 6; i++) {
          o.frequency.setValueAtTime(620, t + i * 1.0);
          o.frequency.linearRampToValueAtTime(900, t + i * 1.0 + 0.5);
          o.frequency.linearRampToValueAtTime(620, t + i * 1.0 + 1.0);
        }
        o.connect(g);
        g.connect(sp.input);
        o.start(t);
        o.stop(t + 6.5);
      } else this.boomDistant();
    } else if (id === "warehouse") {
      // Metal creak.
      const sp = this.spatial(x, z, 0.4, 200);
      this.tone("sawtooth", 140 + Math.random() * 80, 90, 1.2, 0.12, sp.input);
      this.noiseBurst("bandpass", 2600, 8, 0.6, 0.06, sp.input, 0.2);
    } else if (id === "hospital") {
      // Electrical crackle.
      for (let i = 0; i < 6; i++) this.noiseBurst("highpass", 3000, 1, 0.03, 0.08 + Math.random() * 0.08, undefined, 0.001, i * 0.07 + Math.random() * 0.05);
    } else if (id === "lab") {
      // Alarm pattern.
      for (let i = 0; i < 3; i++) this.tone("square", 880, 880, 0.25, 0.04, undefined, i * 0.5);
    } else if (id === "military") {
      // Thunder.
      this.noiseBurst("lowpass", 200, 0.6, 3, 0.5, undefined, 0.3);
      this.tone("sine", 50, 30, 2.5, 0.4);
    }
  }

  boomDistant() {
    this.noiseBurst("lowpass", 150, 0.7, 2.2, 0.35, undefined, 0.05);
  }

  startMusic() {
    if (!this.ctx || this.music) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.musicBus);
    const nodes = [];
    for (const [f, type, gain] of [
      [55, "sawtooth", 0.05],
      [82.4, "triangle", 0.04],
      [110.5, "sine", 0.02],
    ]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 300;
      const gg = ctx.createGain();
      gg.gain.value = gain;
      o.connect(lp);
      lp.connect(gg);
      gg.connect(g);
      o.start();
      nodes.push(o, lp, gg);
    }
    this.music = { g, nodes, beat: 0 };
  }

  stopMusic() {
    if (!this.music || !this.ctx) {
      this.music = null;
      return;
    }
    const { g, nodes } = this.music;
    g.gain.setTargetAtTime(0, this.now(), 0.3);
    setTimeout(() => {
      for (const n of nodes) {
        try {
          if (n.stop) n.stop();
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    }, 1500);
    this.music = null;
  }

  // ------------------------------------------------------------ routing
  handle(events, game) {
    if (!this.ctx || this.ctx.state !== "running") return;
    for (const e of events) {
      switch (e.type) {
        case "shot":
          this.gunshot(e.w, e.ads);
          if (e.w === "shotgun") this.pump();
          break;
        case "dry":
          this.click(3200, 0.3);
          break;
        case "reload":
          this.reload(e.w, e.phase, e.dur || 1);
          break;
        case "switch":
          if (e.phase === "raise") {
            this.noiseBurst("bandpass", 700, 1, 0.12, 0.15);
            this.click(2000, 0.2, 0.08);
          }
          break;
        case "impact":
          this.impact(e.x, e.z, e.surface);
          break;
        case "zhit":
          if (!e.splash) this.flesh(e.x, e.z, e.zone === 0);
          break;
        case "kill":
          if (e.points > 0) this.killConfirm(e.boss);
          break;
        case "zgrowl":
          this.growl(e.x, e.z, e.ztype, e.loud);
          break;
        case "zstrike":
          this.whoosh(e.x, e.z);
          break;
        case "zwhiff":
          this.whoosh(e.x, e.z);
          break;
        case "phurt":
          this.hurt(e.amount);
          break;
        case "pdead":
          this.gameOver();
          this.stopMusic();
          break;
        case "pickup":
          this.pickup(e.kind);
          break;
        case "pickup_full":
          this.deny();
          break;
        case "supply":
          this.tone("square", 1200, 1200, 0.08, 0.06);
          this.tone("square", 1500, 1500, 0.08, 0.06, undefined, 0.12);
          break;
        case "wave_start":
          this.horn(e.final);
          this.startMusic();
          this.tension = 1;
          break;
        case "wave_clear":
          this.tension = 0.3;
          if (!e.final) this.stinger(true);
          break;
        case "stage_clear":
          this.stinger(true);
          this.stopMusic();
          break;
        case "boss_spawn":
          this.boss = true;
          this.roar(e.x, e.z, false);
          this.boom(e.x, e.z, 1.2);
          break;
        case "boss_dead":
          this.boss = false;
          this.roar(game.player.x, game.player.z - 6, true);
          break;
        case "roar":
          if (e.small) this.roar(e.x, e.z, true);
          break;
        case "screech":
          this.growl(e.x, e.z, "runner", true);
          break;
        case "slam":
        case "thud":
          this.boom(e.x, e.z, 0.6);
          break;
        case "explode":
          this.boom(e.x, e.z, 1);
          break;
        case "blast":
          this.boom(e.x, e.z, 0.45);
          break;
        case "spit":
          this.spit(e.x, e.z);
          break;
        case "splat":
          this.splat(e.x, e.z);
          break;
        case "burst":
          this.splat(e.x, e.z);
          this.boom(e.x, e.z, 0.4);
          break;
        case "charge":
          this.roar(e.x, e.z, true);
          break;
        case "step":
          this.footstep(e.sprint);
          break;
        case "jump":
          this.noiseBurst("lowpass", 400, 1, 0.08, 0.12);
          break;
        case "land":
          this.noiseBurst("lowpass", 300, 1, 0.12, Math.min(0.5, 0.1 + e.impact * 0.05));
          break;
        default:
          break;
      }
    }
  }

  /** Per-frame: listener, zombie footsteps, bomber beeps, heartbeat, ambience events. */
  update(dt, game) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const p = game.player;
    this.listener.x = p.x;
    this.listener.z = p.z;
    this.listener.yaw = p.yaw;
    const t = this.now();
    if (this.amb && t > this.nextAmbEvent) {
      this.nextAmbEvent = t + 7 + Math.random() * 10;
      this.ambientEvent();
    }
    // Zombie footsteps: the closest few walkers, alternating.
    this.zStepT -= dt;
    if (this.zStepT <= 0) {
      this.zStepT = 0.22;
      let n = 0;
      for (const z of game.zombies) {
        if (!z.active || z.state === "DYING" || z.state === "DEAD" || z.spd < 0.3) continue;
        const d = Math.hypot(z.x - p.x, z.z - p.z);
        if (d > 18) continue;
        if (Math.sin(z.anim.phase) * Math.sin(z.anim.phase - z.spd * 0.22) < 0 || Math.random() < 0.15) {
          this.zstep(z.x, z.z, z.boss || z.type === "brute");
          if (++n >= 3) break;
        }
      }
      // Bombers fizzing: accelerating beeps.
      for (const z of game.zombies) {
        if (!z.active || z.type !== "bomber" || z.state === "DYING" || z.state === "DEAD") continue;
        z._beep = (z._beep || 0) - 0.22;
        const arming = z.anim.arm > 0;
        if (z._beep <= 0) {
          z._beep = arming ? 0.22 : 1.2;
          this.beep(z.x, z.z, arming ? 1.3 : 1);
        }
      }
    }
    // Low-health heartbeat.
    if (p.alive && p.hp < 30) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.55 + p.hp / 60;
        this.tone("sine", 60, 40, 0.12, 0.5, this.musicBus);
        this.tone("sine", 55, 38, 0.12, 0.35, this.musicBus, 0.18);
      }
    }
    // Music tension follows the fight.
    if (this.music) {
      const want = (game.state === "PLAYING" ? 0.55 : 0.2) + (this.boss ? 0.35 : 0);
      this.music.g.gain.setTargetAtTime(want, t, 0.8);
      if (this.boss || game.state === "PLAYING") {
        this.music.beat -= dt;
        if (this.music.beat <= 0) {
          this.music.beat = this.boss ? 0.42 : 0.75;
          this.tone("sine", 70, 45, 0.18, this.boss ? 0.35 : 0.18, this.musicBus);
        }
      }
    }
  }
}
