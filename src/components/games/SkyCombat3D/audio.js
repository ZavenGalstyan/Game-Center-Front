/**
 * Sky Combat 3D — tiny Web Audio synth (no sample files). Everything routes
 * through one master gain, so `setMuted` (driven by the GamePlayer Mute
 * button) silences engine drone, guns, explosions, alarms and stingers alike.
 * The context is created on the first user gesture (`unlock`).
 */
let ctx = null;
let master = null;
let noise = null;
let muted = false;
let engine = null;
let gun = null;
let tone = { lock: null, warn: null };
const VOLUME = 0.55;

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function osc(freq, dur, { type = "sine", vol = 0.2, to = null, at = 0, attack = 0.005, filter = null } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, attack, vol, dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || "lowpass";
    f.frequency.value = filter.f;
    node = o.connect(f);
  }
  node.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function hiss(dur, { freq = 900, to = null, q = 1, vol = 0.2, type = "bandpass", at = 0, attack = 0.005, rate = 1 } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}
/** A looping noise+oscillator voice whose gain/pitch we steer every frame. */
function loopVoice(filterType, f0, oscType = null, of = 0) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = f0;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(master);
  src.start();
  let o = null;
  let og = null;
  if (oscType) {
    o = ctx.createOscillator();
    o.type = oscType;
    o.frequency.value = of;
    og = ctx.createGain();
    og.gain.value = 0;
    o.connect(og).connect(master);
    o.start();
  }
  return { src, f, g, o, og };
}
function beeper(freq, on, off, vol, type = "square") {
  // repeating beep driven by an oscillator + gated gain (scheduled in step())
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 2800;
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(f).connect(g).connect(master);
  o.start();
  return { o, g, on, off, vol, t: 0, active: false, steady: false };
}

export const audio = {
  unlock() {
    if (typeof window === "undefined") return;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      engine = loopVoice("lowpass", 400, "sawtooth", 60);
      gun = loopVoice("bandpass", 1200);
      gun.f.Q.value = 0.8;
      tone.lock = beeper(1000, 0.08, 0.1, 0.05);
      tone.warn = beeper(1650, 0.07, 0.06, 0.07);
      tone.rwr = beeper(620, 0.12, 0.38, 0.045, "triangle");
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.03);
  },
  get muted() {
    return muted;
  },
  /**
   * Per-frame continuous sounds.
   * s: {active, throttle 0..1, speed m/s, ab, firing, lock: 'none'|'locking'|'locked', rwr: 'none'|'lock'|'missile', dt}
   */
  step(s) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const on = s.active ? 1 : 0;
    // jet engine: rumble + whine following throttle
    const thr = s.throttle || 0;
    engine.g.gain.setTargetAtTime(on * (0.05 + thr * 0.09 + (s.ab ? 0.05 : 0)), t, 0.15);
    engine.f.frequency.setTargetAtTime(260 + thr * 900 + (s.ab ? 600 : 0), t, 0.2);
    engine.og.gain.setTargetAtTime(on * (0.008 + thr * 0.012), t, 0.15);
    engine.o.frequency.setTargetAtTime(55 + thr * 70 + (s.speed || 0) * 0.08, t, 0.3);
    // gun: a buzzing noise band while the trigger is held
    gun.g.gain.setTargetAtTime(on && s.firing ? 0.22 : 0, t, s.firing ? 0.01 : 0.03);
    gun.f.frequency.setTargetAtTime(s.firing ? 900 + Math.random() * 500 : 1200, t, 0.01);
    // tones
    const gate = (b, want, steady, dt) => {
      if (!want || !on) {
        b.g.gain.setTargetAtTime(0, t, 0.01);
        b.t = 0;
        return;
      }
      if (steady) {
        b.g.gain.setTargetAtTime(b.vol, t, 0.01);
        return;
      }
      b.t += dt;
      const ph = b.t % (b.on + b.off);
      b.g.gain.setTargetAtTime(ph < b.on ? b.vol : 0, t, 0.004);
    };
    gate(tone.lock, s.lock !== "none", s.lock === "locked", s.dt);
    tone.lock.o.frequency.setTargetAtTime(s.lock === "locked" ? 1500 : 1000, t, 0.01);
    gate(tone.warn, s.rwr === "missile", false, s.dt);
    gate(tone.rwr, s.rwr === "lock", false, s.dt);
  },
  silence() {
    if (!ctx) return;
    this.step({ active: false, dt: 0 });
  },
  missile() {
    hiss(1.1, { freq: 1800, to: 400, q: 0.7, vol: 0.22, attack: 0.01 });
    osc(180, 0.5, { type: "sawtooth", vol: 0.04, to: 70, filter: { f: 900 } });
  },
  bomb() {
    osc(320, 0.12, { type: "square", vol: 0.04, to: 140, filter: { f: 900 } });
    hiss(0.25, { freq: 600, q: 2, vol: 0.05 });
  },
  flare() {
    for (let i = 0; i < 4; i++) hiss(0.12, { freq: 2500, q: 1, vol: 0.08, at: i * 0.1 });
  },
  /** dist in metres → distance-attenuated boom. */
  explosion(size = 1, dist = 500) {
    const v = Math.min(1, (420 / Math.max(80, dist)) * size);
    if (v < 0.03) return;
    hiss(1.6 + size * 0.5, { freq: 700, to: 90, q: 0.6, vol: 0.5 * v, type: "lowpass", attack: 0.004 });
    osc(70, 1.0, { type: "sine", vol: 0.35 * v, to: 30, attack: 0.005 });
    if (dist < 900) hiss(0.25, { freq: 3000, q: 0.5, vol: 0.18 * v, type: "highpass" });
  },
  hit(kind) {
    if (kind === "missile") {
      this.explosion(1.4, 60);
      hiss(0.5, { freq: 5000, q: 0.4, vol: 0.12, type: "highpass", at: 0.05 });
    } else {
      osc(140 + Math.random() * 60, 0.06, { type: "square", vol: 0.07, to: 60, filter: { f: 1200 } });
      hiss(0.07, { freq: 2600, q: 1.5, vol: 0.08 });
    }
  },
  impact() {
    hiss(0.05, { freq: 3800, q: 2, vol: 0.04 });
  },
  locked() {
    osc(1500, 0.08, { type: "square", vol: 0.04, filter: { f: 3000 } });
  },
  target() {
    osc(900, 0.05, { type: "triangle", vol: 0.05 });
  },
  denied() {
    osc(220, 0.15, { type: "square", vol: 0.04, filter: { f: 800 } });
  },
  rearm() {
    for (let i = 0; i < 3; i++) osc(500 + i * 160, 0.12, { type: "triangle", vol: 0.06, at: i * 0.1 });
  },
  radio() {
    hiss(0.12, { freq: 2200, q: 2, vol: 0.05 });
    osc(1250, 0.05, { type: "square", vol: 0.015, at: 0.02, filter: { f: 2500 } });
  },
  objective() {
    for (const [i, f] of [660, 880, 1100].entries()) osc(f, 0.22, { type: "triangle", vol: 0.08, at: i * 0.09 });
  },
  gate() {
    osc(1320, 0.12, { type: "triangle", vol: 0.07 });
    osc(1760, 0.14, { type: "triangle", vol: 0.05, at: 0.06 });
  },
  complete() {
    const notes = [523, 659, 784, 1046, 784, 1046];
    notes.forEach((f, i) => osc(f, 0.32, { type: "triangle", vol: 0.1, at: i * 0.14 }));
    notes.forEach((f, i) => osc(f / 2, 0.36, { type: "sine", vol: 0.06, at: i * 0.14 }));
  },
  failed() {
    [392, 330, 262, 196].forEach((f, i) => osc(f, 0.5, { type: "sawtooth", vol: 0.05, at: i * 0.26, filter: { f: 1000 } }));
  },
  ui() {
    osc(900, 0.04, { type: "triangle", vol: 0.05 });
  },
  dispose() {
    if (ctx) {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }
    ctx = null;
    master = null;
    engine = null;
    gun = null;
    tone = { lock: null, warn: null };
  },
};
