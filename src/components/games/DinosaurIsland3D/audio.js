/**
 * Dinosaur Island 3D — a tiny Web Audio synth (no sample files, nothing to
 * fail loading). Jungle ambience (wind, surf, stream, birdsong, night
 * insects), dinosaur calls, footsteps and interaction feedback are all
 * generated. Everything routes through one master gain, so the GamePlayer
 * Mute button silences it all. The AudioContext is created on the first
 * user gesture (`unlock`).
 */
let ctx = null;
let master = null;
let noise = null;
let muted = false;
let loops = null;
let birdT = 1.5;
let insectT = 0.5;
let frogT = 2;
const BASE = 0.55;

const now = () => ctx.currentTime;
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function osc(freq, dur, { type = "sine", vol = 0.2, to = null, at = 0, attack = 0.01, filter = null, vib = 0, vibF = 6, dest = null } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = now() + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) {
    if (Array.isArray(to)) {
      let tt = t;
      for (const [f, d] of to) {
        tt += d;
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f), tt);
      }
    } else o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  }
  if (vib) {
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    l.frequency.value = vibF;
    lg.gain.value = vib;
    l.connect(lg).connect(o.frequency);
    l.start(t);
    l.stop(t + dur + 0.05);
  }
  env(g, t, attack, vol, dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || "lowpass";
    f.frequency.value = filter.f;
    f.Q.value = filter.q || 1;
    node = o.connect(f);
  }
  node.connect(g).connect(dest || master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function hiss(dur, { freq = 900, to = null, q = 1, vol = 0.2, type = "bandpass", at = 0, attack = 0.005, rate = 1 } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = now() + at;
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
  src.start(t, Math.random() * 2);
  src.stop(t + dur + 0.05);
}
function loopNoise(type, f0, q = 0.7) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = f0;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(master);
  src.start(0, Math.random() * 2);
  return { src, f, g };
}
function loopTone(type, f0, filterF) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f0;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = filterF;
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(f).connect(g).connect(master);
  o.start();
  return { o, f, g };
}
const set = (param, v, k = 0.3) => param.setTargetAtTime(v, now(), k);
const att = (d, ref = 18) => Math.max(0, Math.min(1, ref / Math.max(ref, d)));

export const audio = {
  unlock() {
    if (typeof window === "undefined") return;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
      } catch {
        ctx = null;
        return;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : BASE;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loops = {
        wind: loopNoise("bandpass", 380, 0.5),
        surf: loopNoise("lowpass", 520, 0.6),
        stream: loopNoise("bandpass", 1600, 0.6),
        fire: loopNoise("bandpass", 2400, 1.2),
        cave: loopNoise("lowpass", 160, 1),
        rotor: loopNoise("lowpass", 120, 4),
        drone: loopTone("sawtooth", 55, 180),
      };
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = !!m;
    if (master) set(master.gain, muted ? 0 : BASE, 0.05);
  },
  /** Fade every loop out (menus). */
  silence() {
    if (!ctx || !loops) return;
    for (const l of Object.values(loops)) set(l.g.gain, 0, 0.4);
  },
  dispose() {
    if (!ctx) return;
    try {
      for (const l of Object.values(loops || {})) (l.src || l.o).stop();
      ctx.close();
    } catch {
      /* already closed */
    }
    ctx = null;
    master = null;
    loops = null;
  },
  /**
   * Called ~10×/s while playing. a = { day 0..1, sea, water, fire (proximity 0..1),
   * cave (bool), danger (0..1), heli (0..1), dt }
   */
  ambience(a) {
    if (!ctx || !loops) return;
    const t = now();
    const surge = 0.5 + 0.5 * Math.sin(t * 0.55);
    set(loops.wind.g.gain, 0.05 + 0.04 * Math.sin(t * 0.21) + (a.high ? 0.08 : 0), 0.8);
    set(loops.surf.g.gain, a.sea * (0.1 + surge * 0.12), 0.4);
    set(loops.surf.f.frequency, 380 + surge * 380, 0.4);
    set(loops.stream.g.gain, a.water * 0.06, 0.4);
    set(loops.fire.g.gain, a.fire * (0.04 + Math.random() * 0.05), 0.08);
    set(loops.cave.g.gain, a.cave ? 0.12 : 0, 0.6);
    set(loops.rotor.g.gain, a.heli * 0.5, 0.3);
    set(loops.rotor.f.frequency, 90 + a.heli * 80, 0.3);
    set(loops.drone.g.gain, a.danger * 0.05, 0.6);
    set(loops.drone.o.frequency, 52 + a.danger * 6, 0.6);
    if (muted || a.cave) return;
    // birdsong by day, insects & frogs by night
    birdT -= a.dt;
    if (birdT <= 0) {
      birdT = 1.5 + Math.random() * 4;
      if (a.day > 0.4) this.bird();
    }
    insectT -= a.dt;
    if (insectT <= 0) {
      insectT = 0.35 + Math.random() * 0.8;
      if (a.day < 0.5) this.cricket(1 - a.day);
    }
    frogT -= a.dt;
    if (frogT <= 0) {
      frogT = 2 + Math.random() * 5;
      if (a.water > 0.2 || a.day < 0.4) this.frog(Math.max(a.water, 0.4));
    }
  },
  bird() {
    const kind = Math.floor(Math.random() * 3);
    const v = 0.03 + Math.random() * 0.03;
    if (kind === 0) for (let i = 0; i < 3; i++) osc(2400 + Math.random() * 900, 0.09, { vol: v, to: 3400, at: i * 0.13 });
    else if (kind === 1) osc(1400, 0.4, { vol: v, to: [[2600, 0.1], [1200, 0.3]], vib: 120, vibF: 18 });
    else for (let i = 0; i < 2; i++) osc(900 - i * 180, 0.22, { type: "triangle", vol: v * 1.3, at: i * 0.3 });
  },
  cricket(k) {
    for (let i = 0; i < 3; i++) osc(4200 + Math.random() * 300, 0.035, { vol: 0.012 * k, at: i * 0.06, type: "square", filter: { type: "bandpass", f: 4400, q: 6 } });
  },
  frog(k) {
    osc(180 + Math.random() * 40, 0.16, { type: "square", vol: 0.025 * k, to: 120, filter: { f: 700 } });
  },
  /* ---- player */
  step(surface, hard) {
    if (surface === "water") hiss(0.16, { freq: 1100, to: 500, q: 0.8, vol: hard ? 0.09 : 0.06 });
    else if (surface === "sand") hiss(0.09, { freq: 1800, q: 0.6, vol: hard ? 0.05 : 0.035 });
    else if (surface === "stone") osc(160 + Math.random() * 40, 0.05, { type: "triangle", vol: 0.04, filter: { f: 900 } });
    else hiss(0.08, { freq: 700 + Math.random() * 300, q: 1.2, vol: hard ? 0.06 : 0.04 });
  },
  jump() {
    hiss(0.12, { freq: 500, to: 900, vol: 0.04 });
  },
  land(hard) {
    hiss(0.16, { freq: 300, q: 0.7, vol: hard ? 0.14 : 0.07 });
    osc(90, 0.12, { vol: hard ? 0.12 : 0.05, to: 50 });
  },
  swing(tool) {
    hiss(0.18, { freq: tool === "spear" ? 1600 : 900, to: 300, q: 1.4, vol: 0.06 });
  },
  chop(tool) {
    osc(tool === "axe" ? 260 : 180, 0.09, { type: "triangle", vol: 0.18, to: 120 });
    hiss(0.08, { freq: 1300, q: 1.5, vol: 0.1 });
  },
  mine(ok) {
    osc(ok ? 900 : 600, 0.07, { type: "square", vol: 0.06, to: 400, filter: { f: 2600 } });
    hiss(0.1, { freq: 3000, q: 2, vol: 0.06 });
  },
  treeFall() {
    hiss(0.9, { freq: 900, to: 200, q: 0.6, vol: 0.12, attack: 0.2 });
    osc(70, 0.6, { vol: 0.2, at: 0.9, to: 40 });
    hiss(0.5, { freq: 260, q: 0.5, vol: 0.18, at: 0.9 });
  },
  whiff() {
    hiss(0.12, { freq: 700, to: 300, vol: 0.03 });
  },
  pickup() {
    osc(660, 0.08, { type: "triangle", vol: 0.07 });
    osc(990, 0.1, { type: "triangle", vol: 0.06, at: 0.06 });
  },
  crate() {
    osc(220, 0.15, { type: "square", vol: 0.04, to: 160, filter: { f: 800 } });
    hiss(0.2, { freq: 600, q: 0.8, vol: 0.08 });
    this.pickup();
  },
  craft() {
    [523, 659, 784].forEach((f, i) => osc(f, 0.18, { type: "triangle", vol: 0.07, at: i * 0.07 }));
    hiss(0.12, { freq: 1500, q: 1, vol: 0.06 });
  },
  fireIgnite() {
    hiss(0.8, { freq: 1200, to: 3000, q: 0.7, vol: 0.1, attack: 0.15 });
    osc(120, 0.5, { vol: 0.06, to: 200 });
  },
  eat() {
    for (let i = 0; i < 3; i++) hiss(0.06, { freq: 2200, q: 1.5, vol: 0.06, at: i * 0.12 });
  },
  drink() {
    for (let i = 0; i < 3; i++) osc(380 + i * 40, 0.08, { vol: 0.06, to: 700, at: i * 0.16 });
  },
  heal() {
    osc(440, 0.3, { vol: 0.05, to: 660 });
    osc(660, 0.3, { vol: 0.04, at: 0.12, to: 880 });
  },
  equip() {
    osc(320, 0.05, { type: "square", vol: 0.04, filter: { f: 1200 } });
  },
  hurt(big) {
    osc(big ? 160 : 240, 0.22, { type: "sawtooth", vol: 0.1, to: 90, filter: { f: 900 } });
    hiss(0.15, { freq: 600, q: 0.8, vol: 0.12 });
  },
  deny() {
    osc(200, 0.12, { type: "square", vol: 0.04, filter: { f: 700 } });
  },
  ui() {
    osc(720, 0.05, { type: "triangle", vol: 0.04 });
  },
  objective() {
    osc(784, 0.12, { type: "triangle", vol: 0.07 });
    osc(1046, 0.18, { type: "triangle", vol: 0.07, at: 0.1 });
  },
  mission() {
    [392, 523, 659, 784].forEach((f, i) => osc(f, 0.35, { type: "triangle", vol: 0.08, at: i * 0.11 }));
  },
  victory() {
    [392, 523, 659, 784, 1046].forEach((f, i) => osc(f, 0.6, { type: "triangle", vol: 0.08, at: i * 0.15 }));
    [262, 330, 392].forEach((f) => osc(f, 1.8, { vol: 0.05, at: 0.75 }));
  },
  death() {
    osc(220, 1.4, { type: "sawtooth", vol: 0.08, to: 55, filter: { f: 600 } });
    osc(110, 1.6, { vol: 0.08, to: 40 });
  },
  rest() {
    [330, 392, 494].forEach((f, i) => osc(f, 0.8, { vol: 0.04, at: i * 0.25 }));
  },
  radio() {
    hiss(1.2, { freq: 2200, q: 0.4, vol: 0.06 });
    for (let i = 0; i < 6; i++) osc(i % 2 ? 1200 : 900, 0.08, { type: "square", vol: 0.03, at: 0.4 + i * 0.14, filter: { f: 2500 } });
  },
  /* ---- dinosaurs (d = distance to the listener) */
  screech(d) {
    const v = att(d, 14);
    osc(1100, 0.45, { type: "sawtooth", vol: 0.12 * v, to: [[1900, 0.08], [700, 0.35]], vib: 60, vibF: 25, filter: { type: "bandpass", f: 1600, q: 1.5 } });
    hiss(0.35, { freq: 2600, q: 2, vol: 0.06 * v });
  },
  yelp(d) {
    osc(1500, 0.2, { type: "sawtooth", vol: 0.08 * att(d, 12), to: 800, filter: { type: "bandpass", f: 1500, q: 2 } });
  },
  roar(d) {
    const v = att(d, 30);
    osc(95, 1.7, { type: "sawtooth", vol: 0.22 * v, to: [[140, 0.3], [70, 1.4]], vib: 9, vibF: 11, filter: { f: 520, q: 2 }, attack: 0.12 });
    osc(62, 1.8, { type: "square", vol: 0.12 * v, to: 45, filter: { f: 260 }, attack: 0.15 });
    hiss(1.6, { freq: 420, to: 220, q: 0.7, vol: 0.2 * v, attack: 0.15 });
  },
  honk(d) {
    const v = att(d, 16);
    osc(150, 0.5, { type: "triangle", vol: 0.12 * v, to: [[210, 0.12], [130, 0.38]], filter: { f: 900 } });
  },
  stomp(d) {
    const v = att(d, 18);
    if (v < 0.05) return;
    osc(48, 0.25, { vol: 0.25 * v, to: 30 });
  },
  bite(kind, d) {
    const v = att(d, 10);
    if (kind === "trex") {
      osc(80, 0.25, { type: "square", vol: 0.16 * v, to: 40, filter: { f: 400 } });
      hiss(0.2, { freq: 500, q: 0.8, vol: 0.18 * v });
    } else {
      hiss(0.1, { freq: 2200, q: 1.5, vol: 0.12 * v });
      osc(500, 0.08, { type: "square", vol: 0.06 * v, to: 200, filter: { f: 1500 } });
    }
  },
  dinoHit(kind) {
    osc(kind === "trex" ? 120 : 300, 0.15, { type: "sawtooth", vol: 0.09, to: kind === "trex" ? 70 : 140, filter: { f: 1000 } });
  },
  dinoDeath(kind, d) {
    const v = att(d, 18);
    if (kind === "trex") osc(120, 2.2, { type: "sawtooth", vol: 0.2 * v, to: 40, vib: 6, vibF: 7, filter: { f: 500 } });
    else if (kind === "raptor") osc(1200, 0.7, { type: "sawtooth", vol: 0.1 * v, to: 300, filter: { type: "bandpass", f: 1200, q: 1.5 } });
    else osc(180, 0.9, { type: "triangle", vol: 0.12 * v, to: 80 });
  },
};
