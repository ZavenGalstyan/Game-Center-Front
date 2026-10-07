/**
 * Night Corridor — sound. Everything is synthesized with WebAudio at
 * runtime (no files): the building's room tone, the creature, doors,
 * lights, the chase score.
 *
 *   master ─ compressor ─ out
 *     ├─ ambience bus   electrical hum, ventilation, room tone, wind
 *     ├─ music bus      dread drone, chase pulse, heartbeat, strings
 *     ├─ sfx bus        footsteps, doors, creature, events (HRTF panned)
 *     └─ reverb         generated corridor impulse response
 *
 * World sounds are positioned with HRTF panners and muffled by distance
 * and by walls (a quick line-of-sight check), so "something is behind me"
 * is something you can actually hear. Mute (Game Center) and pause act on
 * the master gain / the AudioContext immediately.
 */
import { lineOfSight } from "./collision.js";

const SURFACE = {
  tile: { f: 2400, q: 1.2, dur: 0.07, thump: 0.5, ring: null },
  concrete: { f: 1100, q: 0.9, dur: 0.08, thump: 0.65, ring: null },
  carpet: { f: 520, q: 0.7, dur: 0.09, thump: 0.55, ring: null },
  metal: { f: 3000, q: 2, dur: 0.06, thump: 0.4, ring: [880, 1345, 2210] },
};

export class HorrorAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
    this.vol = { master: 0.9, music: 0.7, sfx: 0.9 };
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.level = null;
    this.heat = 0;
    this.dread = 0;
    this.nextBeat = 0;
    this.beatPhase = 0;
    this.radio = null;
    this.breath = 0;
    this.nextBreath = 0;
    this.powerOn = true;
    this.disposed = false;
  }

  // ------------------------------------------------------------ lifecycle
  start() {
    // Re-startable: React StrictMode (dev) unmounts/remounts once, which disposes us first.
    if (this.ctx) return;
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
    this.ambBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.duck = ctx.createGain();
    this.ambBus.connect(this.duck);
    this.musicBus.connect(this.duck);
    this.sfxBus.connect(this.duck);
    this.duck.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.2);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.55;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.duck);

    this.white = this.noiseBuffer("white", 2);
    this.brown = this.noiseBuffer("brown", 4);
    this.pink = this.noiseBuffer("pink", 4);
    this.distortion = this.makeCurve(30);

    this.startBeds();
    this.startScore();
    this.applyVolumes();
  }

  dispose() {
    this.disposed = true;
    const ctx = this.ctx;
    this.ctx = null;
    if (!ctx) return;
    try {
      this.master.gain.setValueAtTime(0, ctx.currentTime);
    } catch {
      /* ignore */
    }
    try {
      ctx.close();
    } catch {
      /* ignore */
    }
  }

  /** Hard stop for everything section-specific (restart, quit, chapter change). */
  reset() {
    this.heat = 0;
    this.nextBeat = 0;
    this.powerOn = true;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.radioOff();
    try {
      // Cut whatever one-shots are still ringing, then fade the bus back in.
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setValueAtTime(0, t);
      this.duck.gain.setTargetAtTime(1, t + 0.25, 0.3);
      this.droneGain.gain.cancelScheduledValues(t);
      this.droneGain.gain.setValueAtTime(0, t);
      this.strGain.gain.cancelScheduledValues(t);
      this.strGain.gain.setValueAtTime(0, t);
      this.hum.gain.setTargetAtTime(this.humBase, t, 0.5);
    } catch {
      /* ignore */
    }
    if (this.paused) this.setPaused(false);
  }

  setMuted(m) {
    this.muted = m;
    this.applyVolumes();
  }

  setVolumes(v) {
    this.vol = { ...this.vol, ...v };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.015);
    this.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.05);
  }

  setPaused(p) {
    this.paused = p;
    if (!this.ctx) return;
    try {
      if (p) this.ctx.suspend();
      else this.ctx.resume();
    } catch {
      /* ignore */
    }
  }

  setLevel(level, theme) {
    this.level = level;
    if (this.ctx && this.hum) {
      const k = theme === "industrial" ? 1.6 : theme === "office" ? 0.7 : 1;
      this.humBase = 0.022 * k;
      this.hum.gain.setTargetAtTime(this.powerOn ? this.humBase : 0, this.ctx.currentTime, 0.5);
    }
  }

  // -------------------------------------------------------------- helpers
  noiseBuffer(kind, seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else if (kind === "pink") {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
      } else d[i] = w;
    }
    return buf;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections then a long dark tail
        const early = i < ctx.sampleRate * 0.06 && Math.random() < 0.02 ? 0.8 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early * (Math.random() - 0.5)) * (1 - t * 0.3);
      }
    }
    return buf;
  }

  makeCurve(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  noise(buf = this.white, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    if (!loop) s.playbackRate.value = 0.9 + Math.random() * 0.2;
    return s;
  }

  /**
   * Destination chain for a one-shot. Spatial if x/z given: panner + distance
   * low-pass + wall occlusion. Returns the node to connect sources into.
   */
  chain(opts = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = opts.vol ?? 1;
    let head = g;
    let tail = g;
    if (opts.x != null) {
      const dx = opts.x - this.listener.x;
      const dz = opts.z - this.listener.z;
      const dist = Math.hypot(dx, dz);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      let cut = 16000 * Math.exp(-dist / 14);
      let occluded = false;
      if (this.level && dist > 1.5) occluded = !lineOfSight(this.level, this.listener.x, this.listener.z, opts.x, opts.z);
      if (occluded) cut *= 0.28;
      lp.frequency.setValueAtTime(Math.max(opts.minCut ?? 280, cut), t);
      const p = ctx.createPanner();
      p.panningModel = "HRTF";
      p.distanceModel = "inverse";
      p.refDistance = opts.ref ?? 2;
      p.rolloffFactor = opts.rolloff ?? 1.1;
      p.maxDistance = 80;
      if (p.positionX) {
        p.positionX.setValueAtTime(opts.x, t);
        p.positionY.setValueAtTime(opts.y ?? 1.4, t);
        p.positionZ.setValueAtTime(opts.z, t);
      } else p.setPosition(opts.x, opts.y ?? 1.4, opts.z);
      g.connect(lp);
      lp.connect(p);
      tail = p;
      if (occluded) g.gain.value *= 0.7;
    }
    tail.connect(opts.bus || this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = opts.wet ?? 0.3;
    tail.connect(send);
    send.connect(this.reverb);
    return head;
  }

  env(gainNode, t, a, peak, d, hold = 0) {
    const gg = gainNode.gain;
    gg.setValueAtTime(0.0001, t);
    gg.linearRampToValueAtTime(peak, t + a);
    if (hold) gg.setValueAtTime(peak, t + a + hold);
    gg.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
  }

  osc(type, freq, dest, t, dur, opts = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.glide ?? dur));
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    this.env(g, t, opts.a ?? 0.005, opts.peak ?? 0.5, opts.d ?? dur, opts.hold ?? 0);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + (opts.a ?? 0.005) + (opts.hold ?? 0) + (opts.d ?? dur) + 0.05);
    return o;
  }

  burst(dest, t, dur, opts = {}) {
    const ctx = this.ctx;
    const s = this.noise(opts.buf);
    const f = ctx.createBiquadFilter();
    f.type = opts.type || "bandpass";
    f.frequency.setValueAtTime(opts.f ?? 1000, t);
    if (opts.fTo) f.frequency.exponentialRampToValueAtTime(opts.fTo, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, opts.a ?? 0.003, opts.peak ?? 0.5, dur, opts.hold ?? 0);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + (opts.a ?? 0.003) + (opts.hold ?? 0) + dur + 0.05);
  }

  // ----------------------------------------------------------------- beds
  startBeds() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // electrical hum
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    const humLp = ctx.createBiquadFilter();
    humLp.type = "lowpass";
    humLp.frequency.value = 420;
    for (const [f, a] of [[60, 0.6], [120, 0.5], [180, 0.15]]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g);
      g.connect(humLp);
      o.start(t);
    }
    humLp.connect(this.hum);
    this.hum.connect(this.ambBus);
    this.humBase = 0.022;
    this.hum.gain.setTargetAtTime(this.humBase, t, 1.5);

    // ventilation
    const vent = this.noise(this.brown, true);
    const vf = ctx.createBiquadFilter();
    vf.type = "bandpass";
    vf.frequency.value = 320;
    vf.Q.value = 0.5;
    const vg = ctx.createGain();
    vg.gain.value = 0.11;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = ctx.createGain();
    lg.gain.value = 0.05;
    lfo.connect(lg);
    lg.connect(vg.gain);
    vent.connect(vf);
    vf.connect(vg);
    vg.connect(this.ambBus);
    vent.start(t);
    lfo.start(t);

    // room tone
    const room = this.noise(this.pink, true);
    const rf = ctx.createBiquadFilter();
    rf.type = "lowpass";
    rf.frequency.value = 160;
    const rg = ctx.createGain();
    rg.gain.value = 0.16;
    room.connect(rf);
    rf.connect(rg);
    rg.connect(this.ambBus);
    room.start(t);

    // distant wind through the building
    const wind = this.noise(this.pink, true);
    const wf = ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 600;
    wf.Q.value = 1.4;
    const wlfo = ctx.createOscillator();
    wlfo.frequency.value = 0.035;
    const wl = ctx.createGain();
    wl.gain.value = 260;
    wlfo.connect(wl);
    wl.connect(wf.frequency);
    const wg = ctx.createGain();
    wg.gain.value = 0.03;
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.ambBus);
    wind.start(t);
    wlfo.start(t);
  }

  startScore() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // dread drone — rises when it's near
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const dlp = ctx.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 380;
    this.droneLp = dlp;
    for (const [f, det] of [[41.2, 0], [41.2, 9], [61.7, -6], [87.3, 14]]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      o.connect(g);
      g.connect(dlp);
      o.start(t);
    }
    dlp.connect(this.droneGain);
    this.droneGain.connect(this.musicBus);

    // dissonant strings for the chase
    this.strGain = ctx.createGain();
    this.strGain.gain.value = 0;
    const sbp = ctx.createBiquadFilter();
    sbp.type = "bandpass";
    sbp.frequency.value = 1300;
    sbp.Q.value = 0.8;
    const trem = ctx.createOscillator();
    trem.frequency.value = 7.5;
    const tg = ctx.createGain();
    tg.gain.value = 0.4;
    const sAmp = ctx.createGain();
    sAmp.gain.value = 0.6;
    trem.connect(tg);
    tg.connect(sAmp.gain);
    for (const f of [622, 659, 698, 932]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 30;
      const g = ctx.createGain();
      g.gain.value = 0.07;
      o.connect(g);
      g.connect(sbp);
      o.start(t);
    }
    sbp.connect(sAmp);
    sAmp.connect(this.strGain);
    this.strGain.connect(this.musicBus);
    trem.start(t);

    // player's breathing bus
    this.breathBus = ctx.createGain();
    this.breathBus.gain.value = 0.9;
    this.breathBus.connect(this.sfxBus);
  }

  // ------------------------------------------------------------ listener
  setListener(x, z, yaw) {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (L.positionX) {
      L.positionX.setValueAtTime(x, t);
      L.positionY.setValueAtTime(1.6, t);
      L.positionZ.setValueAtTime(z, t);
      L.forwardX.setValueAtTime(fx, t);
      L.forwardY.setValueAtTime(0, t);
      L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(0, t);
      L.upY.setValueAtTime(1, t);
      L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(x, 1.6, z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // -------------------------------------------------------------- events
  handle(events) {
    if (!this.ctx || this.paused) return;
    for (const e of events) {
      try {
        this.play(e);
      } catch {
        /* a failed one-shot must never break the frame */
      }
    }
  }

  play(e) {
    switch (e.type) {
      case "step":
        if (e.who === "player") this.footstep(e.surface, e.run, e.crouch);
        else this.creatureStep(e.x, e.z, e.run, e.phantom);
        break;
      case "door":
        this.door(e.action, e.x, e.z, e.slow);
        break;
      case "lamp":
        if (e.action === "pop") this.lampPop(e.x, e.z);
        else this.lampBuzz(e.x, e.z);
        break;
      case "power":
        this.power(e.action === "up");
        break;
      case "sound":
        this.worldSound(e.kind, e.x, e.z, e.vol ?? 1);
        break;
      case "ambient":
        this.worldSound(e.kind, e.x, e.z, 0.55);
        break;
      case "voice":
        this.voice(e.kind, e.x, e.z);
        break;
      case "radio":
        if (e.action === "on") this.radioOn(e.x, e.z, e.dur);
        else this.radioOff();
        break;
      case "pickup":
        this.pickup(e.model);
        break;
      case "use":
        this.use(e.action === "ok", e.x, e.z);
        break;
      case "stinger":
        this.stinger(e.kind);
        break;
      case "caught":
        this.jumpscare();
        break;
      case "fall":
        this.fall(e.x, e.z);
        break;
      case "hide":
        this.locker(e.x, e.z, e.action === "in");
        break;
      case "flashlight":
        if (!e.flicker) this.click();
        break;
      case "objective":
        this.objectiveTone();
        break;
      case "respawn":
        this.heat = 0;
        this.radioOff();
        break;
      case "complete":
        this.radioOff();
        break;
      default:
        break;
    }
  }

  // ----------------------------------------------------------- footsteps
  footstep(surface = "tile", run, crouch) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = SURFACE[surface] || SURFACE.tile;
    const v = (crouch ? 0.14 : run ? 0.5 : 0.3) * (0.85 + Math.random() * 0.3);
    const dest = this.chain({ vol: v, wet: 0.18 });
    this.burst(dest, t, s.dur * (run ? 0.9 : 1.1), { f: s.f * (0.85 + Math.random() * 0.3), q: s.q, peak: 0.9 });
    this.burst(dest, t + 0.012, s.dur * 0.6, { type: "highpass", f: 4000, peak: 0.12 });
    this.osc("sine", 95 + Math.random() * 20, dest, t, 0.08, { to: 55, peak: s.thump, d: 0.09 });
    if (s.ring) for (const f of s.ring) this.osc("sine", f * (0.97 + Math.random() * 0.06), dest, t, 0.25, { peak: 0.05, d: 0.22 + Math.random() * 0.1 });
  }

  creatureStep(x, z, run, phantom) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.chain({ x, z, vol: (run ? 1.35 : 0.9) * (phantom ? 0.9 : 1), wet: 0.45, ref: 2.5, rolloff: 0.9 });
    this.osc("sine", run ? 70 : 58, dest, t, 0.2, { to: 32, peak: 1.0, d: run ? 0.22 : 0.32 });
    this.burst(dest, t, 0.12, { type: "lowpass", f: 380, peak: 0.85 });
    this.burst(dest, t + 0.02, 0.06, { f: 1500 + Math.random() * 500, q: 2, peak: run ? 0.22 : 0.12 });
    if (Math.random() < 0.3) this.burst(dest, t + 0.08, 0.15, { f: 600, q: 4, peak: 0.08 });
  }

  // --------------------------------------------------------------- voice
  voice(kind, x, z) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (kind === "breath") {
      const dest = this.chain({ x, z, vol: 0.55, wet: 0.4, ref: 1.5 });
      this.burst(dest, t, 0.9, { f: 520, q: 1.5, a: 0.55, peak: 0.5, fTo: 380 });
      this.burst(dest, t + 1.2, 1.1, { f: 420, q: 1.2, a: 0.35, peak: 0.42, fTo: 300 });
      this.osc("sawtooth", 52, dest, t + 1.2, 1.0, { a: 0.3, peak: 0.06, d: 0.9 });
    } else if (kind === "growl") {
      const dest = this.chain({ x, z, vol: 0.85, wet: 0.45, ref: 2.5 });
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.distortion;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 520;
      bp.Q.value = 1.4;
      shaper.connect(bp);
      bp.connect(dest);
      const f0 = 62 + Math.random() * 18;
      this.osc("sawtooth", f0, shaper, t, 0.9, { to: f0 * 0.7, a: 0.08, peak: 0.6, d: 0.8 });
      this.osc("sawtooth", f0 * 1.51, shaper, t, 0.9, { to: f0, a: 0.1, peak: 0.3, d: 0.7 });
      this.burst(dest, t, 0.8, { f: 900, q: 2, a: 0.1, peak: 0.25 });
    } else if (kind === "scream") {
      const dest = this.chain({ x, z, vol: 1.15, wet: 0.75, ref: 3, rolloff: 0.7, minCut: 600 });
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.distortion;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1400, t);
      bp.frequency.exponentialRampToValueAtTime(700, t + 1.8);
      bp.Q.value = 1.8;
      shaper.connect(bp);
      bp.connect(dest);
      for (const [f, d] of [[620, 0], [655, 12], [930, -8]]) this.osc("sawtooth", f, shaper, t, 1.8, { to: f * 0.42, glide: 1.8, a: 0.05, peak: 0.35, d: 1.6, hold: 0.2, detune: d });
      this.burst(dest, t, 1.6, { f: 2200, q: 1, a: 0.04, peak: 0.3, fTo: 800 });
    }
  }

  // --------------------------------------------------------------- doors
  door(action, x, z, slow) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (action === "open" || action === "close") {
      const dur = slow ? 1.6 + Math.random() * 0.6 : 0.6 + Math.random() * 0.3;
      const dest = this.chain({ x, z, vol: slow ? 0.55 : 0.4, wet: 0.35 });
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 9;
      bp.frequency.setValueAtTime(700 + Math.random() * 400, t);
      bp.frequency.linearRampToValueAtTime(1100 + Math.random() * 600, t + dur);
      bp.connect(dest);
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(140, t);
      // hinge stutter
      for (let k = 0; k < dur * 12; k++) o.frequency.setValueAtTime(110 + Math.random() * 80, t + k / 12);
      const g = ctx.createGain();
      this.env(g, t, 0.08, 0.6, dur * 0.8, dur * 0.2);
      o.connect(g);
      g.connect(bp);
      o.start(t);
      o.stop(t + dur + 0.2);
      if (action === "close") {
        this.osc("sine", 90, dest, t + dur * 0.8, 0.12, { to: 50, peak: 0.8, d: 0.15 });
        this.burst(dest, t + dur * 0.8, 0.05, { f: 2500, q: 2, peak: 0.4 });
      }
    } else if (action === "shut") {
      const dest = this.chain({ x, z, vol: 0.5, wet: 0.3 });
      this.osc("sine", 85, dest, t, 0.12, { to: 45, peak: 0.8, d: 0.14 });
      this.burst(dest, t, 0.04, { f: 2600, q: 2, peak: 0.45 });
    } else if (action === "slam" || action === "burst") {
      const dest = this.chain({ x, z, vol: action === "burst" ? 1.4 : 1.1, wet: 0.7, ref: 3, rolloff: 0.8 });
      this.osc("sine", 70, dest, t, 0.4, { to: 30, peak: 1, d: 0.45 });
      this.burst(dest, t, 0.35, { type: "lowpass", f: 900, peak: 0.9 });
      this.burst(dest, t + 0.01, 0.12, { f: 3000, q: 1, peak: 0.35 });
      if (action === "burst") for (let i = 0; i < 6; i++) this.burst(dest, t + 0.05 + Math.random() * 0.4, 0.05, { f: 2000 + Math.random() * 3000, q: 3, peak: 0.25 });
    } else if (action === "bang") {
      const dest = this.chain({ x, z, vol: 1.2, wet: 0.6, ref: 3 });
      this.osc("sine", 65, dest, t, 0.25, { to: 34, peak: 1, d: 0.28 });
      this.burst(dest, t, 0.18, { type: "lowpass", f: 600, peak: 0.9 });
      for (let i = 0; i < 3; i++) this.burst(dest, t + 0.03 + i * 0.03, 0.03, { f: 2400, q: 4, peak: 0.25 });
    } else if (action === "locked") {
      const dest = this.chain({ x, z, vol: 0.55, wet: 0.2 });
      for (let i = 0; i < 4; i++) {
        this.burst(dest, t + i * 0.085, 0.035, { f: 2600 + Math.random() * 800, q: 5, peak: 0.6 });
        this.osc("sine", 140, dest, t + i * 0.085, 0.05, { to: 90, peak: 0.25, d: 0.05 });
      }
    } else if (action === "unlock" || action === "lockclick") {
      const dest = this.chain({ x, z, vol: 0.6, wet: 0.2 });
      this.burst(dest, t, 0.03, { f: 3200, q: 5, peak: 0.7 });
      this.burst(dest, t + 0.14, 0.04, { f: 2200, q: 4, peak: 0.8 });
      this.osc("sine", 120, dest, t + 0.14, 0.08, { to: 70, peak: 0.5, d: 0.08 });
    }
  }

  // --------------------------------------------------------------- lamps
  lampBuzz(x, z) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.chain({ x, z, y: 2.9, vol: 0.32, wet: 0.2 });
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700;
    bp.Q.value = 2.5;
    bp.connect(dest);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 120;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    for (let k = 0; k < 14; k++) g.gain.setValueAtTime(Math.random() < 0.55 ? 0.5 : 0, t + k * 0.06);
    g.gain.setValueAtTime(0, t + 0.9);
    o.connect(g);
    g.connect(bp);
    o.start(t);
    o.stop(t + 0.95);
    for (let k = 0; k < 3; k++) this.burst(dest, t + Math.random() * 0.7, 0.01, { f: 4000, q: 2, peak: 0.4 });
  }

  lampPop(x, z) {
    const t = this.ctx.currentTime;
    const dest = this.chain({ x, z, y: 2.9, vol: 0.9, wet: 0.5 });
    this.burst(dest, t, 0.08, { type: "highpass", f: 1500, peak: 1 });
    this.osc("sine", 160, dest, t, 0.1, { to: 60, peak: 0.6, d: 0.1 });
    for (let i = 0; i < 8; i++) this.osc("sine", 3000 + Math.random() * 4000, dest, t + 0.05 + Math.random() * 0.5, 0.15, { peak: 0.06, d: 0.1 + Math.random() * 0.2 });
  }

  power(up) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.powerOn = up;
    const dest = this.chain({ vol: 0.6, wet: 0.55 });
    if (up) {
      this.osc("sine", 50, dest, t, 0.2, { peak: 0.8, d: 0.25 });
      this.osc("sawtooth", 40, dest, t + 0.1, 1.2, { to: 120, glide: 1.0, a: 0.3, peak: 0.12, d: 0.9 });
      this.hum.gain.setTargetAtTime(this.humBase, t + 0.3, 0.6);
    } else {
      this.osc("sawtooth", 120, dest, t, 1.4, { to: 28, glide: 1.3, peak: 0.18, d: 1.3 });
      this.osc("sine", 55, dest, t, 0.4, { to: 30, peak: 1, d: 0.5 });
      this.hum.gain.setTargetAtTime(0, t, 0.25);
    }
  }

  // --------------------------------------------------------- world sounds
  worldSound(kind, x, z, vol = 1) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const far = { x, z, vol, wet: 0.7, ref: 3, rolloff: 0.8, minCut: 200 };
    switch (kind) {
      case "metal": {
        const dest = this.chain({ ...far, vol: vol * 0.9 });
        for (const f of [196, 523, 887, 1311, 1873]) this.osc("sine", f * (0.98 + Math.random() * 0.04), dest, t, 2.5, { peak: 0.18, d: 1.5 + Math.random() * 1.5 });
        this.burst(dest, t, 0.08, { f: 2000, q: 1, peak: 0.4 });
        break;
      }
      case "creak": {
        const dest = this.chain({ ...far, vol: vol * 0.6 });
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = 12;
        bp.frequency.setValueAtTime(380, t);
        bp.frequency.linearRampToValueAtTime(260, t + 1.8);
        bp.connect(dest);
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        for (let k = 0; k < 24; k++) o.frequency.setValueAtTime(40 + Math.random() * 40, t + k * 0.08);
        const g = ctx.createGain();
        this.env(g, t, 0.3, 0.7, 1.4, 0.3);
        o.connect(g);
        g.connect(bp);
        o.start(t);
        o.stop(t + 2.2);
        break;
      }
      case "drip": {
        const dest = this.chain({ x, z, vol: vol * 0.5, wet: 0.6 });
        this.osc("sine", 1900 + Math.random() * 600, dest, t, 0.06, { to: 900, peak: 0.5, d: 0.07 });
        this.osc("sine", 1500 + Math.random() * 400, dest, t + 0.35 + Math.random() * 0.4, 0.05, { to: 800, peak: 0.25, d: 0.05 });
        break;
      }
      case "pipes": {
        const dest = this.chain({ ...far, vol: vol * 0.9 });
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const tt = t + i * (0.18 + Math.random() * 0.25);
          this.osc("sine", 110 + Math.random() * 30, dest, tt, 0.3, { to: 70, peak: 0.6, d: 0.3 });
          this.osc("sine", 640 + Math.random() * 80, dest, tt, 0.4, { peak: 0.08, d: 0.5 });
        }
        break;
      }
      case "distantDoor":
        this.door("slam", x, z);
        break;
      case "thud": {
        const dest = this.chain({ ...far, vol: vol });
        this.osc("sine", 60, dest, t, 0.4, { to: 30, peak: 1, d: 0.45 });
        this.burst(dest, t, 0.2, { type: "lowpass", f: 400, peak: 0.6 });
        break;
      }
      case "vent": {
        const dest = this.chain({ ...far, vol: vol * 0.8 });
        this.burst(dest, t, 2.4, { f: 300, fTo: 900, q: 0.8, a: 1.2, peak: 0.35, buf: this.pink });
        break;
      }
      case "settle": {
        const dest = this.chain({ ...far, vol: vol * 0.8 });
        this.osc("sawtooth", 38, dest, t, 2.2, { to: 31, a: 0.6, peak: 0.12, d: 1.8 });
        this.burst(dest, t + 0.4, 1.6, { type: "lowpass", f: 220, a: 0.4, peak: 0.3, buf: this.brown });
        break;
      }
      case "scream":
        this.voice("scream", x, z);
        break;
      case "run": {
        for (let i = 0; i < 8; i++) {
          const tt = t + i * 0.28;
          const dest = this.chain({ x: x + i * 0.6, z, vol: vol * 0.9, wet: 0.6 });
          this.osc("sine", 70, dest, tt, 0.15, { to: 35, peak: 0.8, d: 0.18 });
          this.burst(dest, tt, 0.08, { type: "lowpass", f: 500, peak: 0.5 });
        }
        break;
      }
      case "glass": {
        const dest = this.chain({ x, z, vol, wet: 0.5 });
        this.burst(dest, t, 0.1, { type: "highpass", f: 2500, peak: 0.9 });
        for (let i = 0; i < 10; i++) this.osc("sine", 2500 + Math.random() * 5000, dest, t + Math.random() * 0.6, 0.2, { peak: 0.07, d: 0.15 + Math.random() * 0.3 });
        break;
      }
      case "whisper": {
        const dest = this.chain({ x, z, vol: vol * 0.5, wet: 0.6 });
        for (let i = 0; i < 5; i++) this.burst(dest, t + i * 0.22, 0.18, { f: 2400 + Math.random() * 1600, q: 3, a: 0.05, peak: 0.25, buf: this.pink });
        break;
      }
      default:
        break;
    }
  }

  fall(x, z) {
    const t = this.ctx.currentTime;
    const dest = this.chain({ x, z, vol: 1, wet: 0.55 });
    const hits = [0, 0.32, 0.5, 0.62];
    hits.forEach((h, i) => {
      for (const f of [310, 788, 1190, 1630]) this.osc("sine", f * (0.97 + Math.random() * 0.06), dest, t + h, 1.2, { peak: 0.16 / (i + 1), d: 0.8 / (i * 0.5 + 1) });
      this.burst(dest, t + h, 0.05, { f: 2500, q: 1, peak: 0.5 / (i + 1) });
    });
  }

  // ---------------------------------------------------------------- radio
  radioOn(x, z, dur = 40) {
    this.radioOff();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.chain({ x, z, vol: 0.55, wet: 0.35 });
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + 0.4);
    out.gain.setValueAtTime(1, t + dur - 1);
    out.gain.linearRampToValueAtTime(0, t + dur);
    out.connect(dest);
    const s = this.noise(this.white, true);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 1.2;
    const am = ctx.createGain();
    am.gain.value = 0.3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.3;
    const lg = ctx.createGain();
    lg.gain.value = 0.15;
    lfo.connect(lg);
    lg.connect(am.gain);
    s.connect(bp);
    bp.connect(am);
    am.connect(out);
    s.start(t);
    lfo.start(t);
    // garbled "voice" fragments
    const voiceBp = ctx.createBiquadFilter();
    voiceBp.type = "bandpass";
    voiceBp.frequency.value = 1000;
    voiceBp.Q.value = 3;
    voiceBp.connect(out);
    for (let k = 0; k < dur * 1.5; k++) {
      const tt = t + 1 + k * (0.5 + Math.random() * 0.6);
      if (tt > t + dur - 1) break;
      if (Math.random() < 0.55) this.osc("sawtooth", 140 + Math.random() * 90, voiceBp, tt, 0.25, { to: 110 + Math.random() * 60, a: 0.03, peak: 0.25, d: 0.2 + Math.random() * 0.2 });
    }
    s.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
    this.radio = { out, until: t + dur };
  }

  radioOff() {
    if (!this.radio || !this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      this.radio.out.gain.cancelScheduledValues(t);
      this.radio.out.gain.setValueAtTime(this.radio.out.gain.value, t);
      this.radio.out.gain.linearRampToValueAtTime(0, t + 0.05);
    } catch {
      /* ignore */
    }
    this.radio = null;
    this.click();
  }

  // ------------------------------------------------------------------- ui
  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.chain({ vol: 0.35, wet: 0.05 });
    this.burst(dest, t, 0.015, { f: 3500, q: 3, peak: 0.8 });
    this.burst(dest, t + 0.05, 0.012, { f: 2800, q: 3, peak: 0.5 });
  }

  pickup(model) {
    const t = this.ctx.currentTime;
    const dest = this.chain({ vol: 0.45, wet: 0.25 });
    if (model === "key" || model === "keycard") for (let i = 0; i < 4; i++) this.osc("sine", 2600 + Math.random() * 1800, dest, t + i * 0.05, 0.2, { peak: 0.16, d: 0.25 });
    this.burst(dest, t, 0.05, { f: 1800, q: 2, peak: 0.4 });
  }

  use(ok, x, z) {
    const t = this.ctx.currentTime;
    const dest = this.chain({ x, z, vol: 0.8, wet: 0.35 });
    if (ok) {
      this.osc("sine", 70, dest, t, 0.15, { to: 40, peak: 1, d: 0.18 });
      this.burst(dest, t, 0.05, { f: 2000, q: 2, peak: 0.6 });
      this.burst(dest, t + 0.08, 0.25, { f: 5000, q: 1, peak: 0.2 });
    } else {
      this.osc("square", 110, dest, t, 0.3, { peak: 0.08, d: 0.3 });
    }
  }

  locker(x, z, inside) {
    const t = this.ctx.currentTime;
    const dest = this.chain({ x, z, vol: 0.7, wet: 0.25 });
    this.burst(dest, t, 0.25, { f: 1200, q: 6, peak: 0.25 });
    this.osc("sine", 140, dest, t + (inside ? 0.35 : 0.2), 0.1, { to: 80, peak: 0.6, d: 0.12 });
    this.burst(dest, t + (inside ? 0.35 : 0.2), 0.04, { f: 3000, q: 3, peak: 0.4 });
  }

  objectiveTone() {
    const t = this.ctx.currentTime;
    const dest = this.chain({ vol: 0.12, wet: 0.6, bus: this.musicBus });
    this.osc("sine", 220, dest, t, 1.2, { a: 0.1, peak: 0.4, d: 1.1 });
    this.osc("sine", 233, dest, t, 1.2, { a: 0.1, peak: 0.25, d: 1.1 });
  }

  stinger(kind) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (kind === "glimpse") {
      const dest = this.chain({ vol: 0.5, wet: 0.7, bus: this.musicBus });
      for (const f of [1244, 1318, 1975]) this.osc("sawtooth", f, dest, t, 1.4, { a: 0.02, peak: 0.08, d: 1.3, detune: (Math.random() - 0.5) * 40 });
      this.osc("sine", 45, dest, t, 1.5, { a: 0.05, peak: 0.7, d: 1.4 });
    } else {
      const dest = this.chain({ vol: 0.7, wet: 0.7, bus: this.musicBus });
      this.osc("sine", 38, dest, t, 2.5, { a: 0.02, peak: 1, d: 2.4 });
      this.burst(dest, t, 1.4, { type: "lowpass", f: 300, a: 0.8, peak: 0.5, buf: this.brown });
    }
  }

  jumpscare() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.radioOff();
    const dest = this.chain({ vol: 1.0, wet: 0.5, bus: this.sfxBus });
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distortion;
    shaper.connect(dest);
    for (const f of [233, 247, 349, 466, 698, 740]) this.osc("sawtooth", f, shaper, t, 0.9, { to: f * 0.6, glide: 0.9, a: 0.004, peak: 0.25, d: 0.85 });
    this.burst(dest, t, 0.7, { type: "highpass", f: 800, a: 0.003, peak: 0.8 });
    this.osc("sine", 50, dest, t, 0.6, { to: 25, peak: 1, d: 0.6 });
    // then the world goes quiet
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(1, t);
    this.duck.gain.setValueAtTime(1, t + 0.85);
    this.duck.gain.linearRampToValueAtTime(0.05, t + 1.2);
    this.duck.gain.setTargetAtTime(1, t + 2.6, 0.8);
    this.heat = 0;
  }

  // -------------------------------------------------------- per-frame mix
  update(dt, game) {
    if (!this.ctx || this.paused) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const target = game.chaseHeat || 0;
    // rise fast, fall slowly — intensity decays after you reach safety
    const rate = target > this.heat ? 2.5 : 0.22;
    this.heat += (target - this.heat) * Math.min(1, dt * rate);
    const h = this.heat;
    const chasing = Boolean(game.chase && game.chase.phase === "run");
    this.droneGain.gain.setTargetAtTime(0.02 + h * 0.2, t, 0.3);
    this.droneLp.frequency.setTargetAtTime(240 + h * 900, t, 0.3);
    this.strGain.gain.setTargetAtTime(chasing ? 0.07 + h * 0.1 : h > 0.45 ? h * 0.05 : 0, t, chasing ? 0.2 : 1.5);

    // pulse + heartbeat scheduler
    if (h > 0.18) {
      const bpm = 70 + h * 95;
      const interval = 60 / bpm;
      if (this.nextBeat < t) this.nextBeat = t + 0.05;
      while (this.nextBeat < t + 0.15) {
        const bt = this.nextBeat;
        const dest = this.chain({ vol: Math.min(1, h * 1.1), wet: 0.15, bus: this.musicBus });
        this.osc("sine", 58, dest, bt, 0.25, { to: 34, peak: 0.9, d: 0.28 });
        if (h > 0.5) this.osc("sine", 52, dest, bt + 0.17, 0.2, { to: 32, peak: 0.55, d: 0.22 });
        this.nextBeat += interval;
      }
    }

    // your own breathing when spent
    const p = game.player;
    const winded = (p.exhausted || p.stamina < 0.35) && (chasing || p.sprinting || p.stamina < 0.2);
    if ((winded || game.mode === "HIDING" && h > 0.2) && t > this.nextBreath) {
      const dest = this.chain({ vol: game.mode === "HIDING" ? 0.22 : 0.4, wet: 0.08 });
      this.burst(dest, t, 0.3, { f: 900, q: 1.3, a: 0.1, peak: 0.5, buf: this.pink });
      this.burst(dest, t + 0.38, 0.35, { f: 650, q: 1.1, a: 0.06, peak: 0.45, buf: this.pink });
      this.nextBreath = t + (game.mode === "HIDING" ? 1.4 : p.exhausted ? 0.75 : 1.0);
    }
  }

  /** Menu ambience: a quieter bed + an occasional distant clang. */
  menuTick(dt) {
    if (!this.ctx || this.paused) return;
    this.menuT = (this.menuT ?? 6) - dt;
    if (this.menuT <= 0) {
      this.menuT = 9 + Math.random() * 12;
      const ang = Math.random() * Math.PI * 2;
      const kinds = ["metal", "creak", "pipes", "drip", "settle"];
      this.worldSound(kinds[Math.floor(Math.random() * kinds.length)], this.listener.x + Math.cos(ang) * 16, this.listener.z + Math.sin(ang) * 16, 0.5);
    }
    this.droneGain?.gain.setTargetAtTime(0.035, this.ctx.currentTime, 1);
  }

  uiTick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.chain({ vol: 0.18, wet: 0.3 });
    this.burst(dest, t, 0.02, { f: 2200, q: 4, peak: 0.6 });
    this.osc("sine", 180, dest, t, 0.08, { to: 120, peak: 0.25, d: 0.08 });
  }
}
