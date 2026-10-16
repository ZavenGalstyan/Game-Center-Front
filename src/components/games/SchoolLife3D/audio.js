/**
 * School Life Simulator 3D — Web Audio synth (no sample files).
 * School bell, footsteps per surface, doors, ambience (hallway murmur,
 * classroom room tone, cafeteria clatter, birds outdoors), basketball,
 * football, whistle, crowd cheer, UI and reward jingles. Everything routes
 * through one master gain, so the GamePlayer Mute button silences it all.
 * The AudioContext is created on the first user gesture (`unlock`).
 */
let ctx = null;
let master = null;
let noise = null;
let muted = false;
let volume = 0.8;
let loops = null;
let birdT = 2;
let chatT = 1;
let clinkT = 1;
let scribT = 3;
const BASE = 0.6;

const now = () => ctx.currentTime;
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function osc(freq, dur, { type = "sine", vol = 0.2, to = null, at = 0, attack = 0.01, filter = null, vib = 0, vibF = 6, am = 0, amF = 20, pan = 0 } = {}) {
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
  let out = node.connect(g);
  if (am) {
    // amplitude modulation (the bell's hammer)
    const ag = ctx.createGain();
    ag.gain.value = 1 - am;
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    l.type = "square";
    l.frequency.value = amF;
    lg.gain.value = am;
    l.connect(lg).connect(ag.gain);
    l.start(t);
    l.stop(t + dur + 0.05);
    out = out.connect(ag);
  }
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    out = out.connect(p);
  }
  out.connect(master);
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
const set = (param, v, k = 0.25) => param.setTargetAtTime(v, now(), k);

export const audio = {
  unlock() {
    if (typeof window === "undefined") return;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : BASE * volume;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loops = {
        murmur: loopNoise("bandpass", 520, 1.2),
        room: loopNoise("lowpass", 260, 0.5),
        wind: loopNoise("bandpass", 380, 0.5),
        cafe: loopNoise("bandpass", 900, 0.9),
      };
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  get ready() {
    return !!ctx;
  },
  setMuted(m) {
    muted = !!m;
    if (master) set(master.gain, muted ? 0 : BASE * volume, 0.05);
  },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master && !muted) set(master.gain, BASE * volume, 0.05);
  },
  silence() {
    if (!ctx || !loops) return;
    for (const k in loops) set(loops[k].g.gain, 0, 0.3);
  },
  dispose() {
    if (!ctx) return;
    try {
      for (const k in loops || {}) loops[k].src.stop();
      ctx.close();
    } catch {
      /* ignore */
    }
    ctx = null;
    master = null;
    loops = null;
  },
  /** Live gains for tests. */
  inspect() {
    if (!loops) return null;
    const o = { master: master.gain.value };
    for (const k in loops) o[k] = +loops[k].g.gain.value.toFixed(4);
    return o;
  },
  /**
   * Ambience every frame. s: { dt, active, zone: 'hall'|'class'|'cafeteria'|'library'|'gym'|'outdoor'|'room',
   *   crowd (people nearby 0..1), lesson (class in session) }
   */
  step(s) {
    if (!ctx || !loops || muted) return;
    const L = loops;
    const act = s.active ? 1 : 0;
    const z = s.zone;
    const crowd = s.crowd || 0;
    const murmur = act * (z === "hall" ? 0.02 + crowd * 0.05 : z === "gym" ? 0.02 + crowd * 0.04 : z === "class" && !s.lesson ? 0.015 + crowd * 0.03 : z === "outdoor" ? crowd * 0.025 : 0.004);
    set(L.murmur.g.gain, murmur, 0.5);
    set(L.murmur.f.frequency, z === "gym" ? 700 : 520, 0.5);
    set(L.room.g.gain, act * (z === "outdoor" ? 0 : z === "library" ? 0.012 : 0.02), 0.6);
    set(L.wind.g.gain, act * (z === "outdoor" ? 0.035 : 0), 0.6);
    set(L.cafe.g.gain, act * (z === "cafeteria" ? 0.03 + crowd * 0.05 : 0), 0.6);
    if (!act) return;
    // birds outside
    birdT -= s.dt;
    if (birdT <= 0) {
      birdT = 1.5 + Math.random() * 4;
      if (z === "outdoor") this.songbird(0.3 + Math.random() * 0.4);
    }
    // voices: little formant blips that read as chatter
    chatT -= s.dt;
    if (chatT <= 0) {
      chatT = 0.12 + Math.random() * (z === "cafeteria" ? 0.25 : 0.6);
      const k = z === "cafeteria" ? 1 : z === "hall" ? 0.7 * (0.3 + crowd) : z === "outdoor" ? 0.4 * crowd : z === "gym" ? 0.6 * crowd : z === "class" && !s.lesson ? 0.35 : 0;
      if (k > 0.05) this.voice(k);
    }
    // cutlery clinks in the cafeteria
    clinkT -= s.dt;
    if (clinkT <= 0) {
      clinkT = 0.4 + Math.random() * 1.4;
      if (z === "cafeteria") osc(2600 + Math.random() * 1800, 0.12, { type: "sine", vol: 0.025, at: 0, pan: Math.random() - 0.5 });
    }
    // pencils & page turns during lessons / in the library
    scribT -= s.dt;
    if (scribT <= 0) {
      scribT = 1.5 + Math.random() * 3;
      if ((z === "class" && s.lesson) || z === "library") hiss(0.25 + Math.random() * 0.3, { freq: 3800, q: 2.5, vol: 0.012, attack: 0.05 });
    }
  },
  /* ---------------------------------------------------------------- one-shots */
  voice(k = 1) {
    const f = 140 + Math.random() * 220;
    const n = 1 + Math.floor(Math.random() * 3);
    const pan = Math.random() * 1.4 - 0.7;
    for (let i = 0; i < n; i++) {
      osc(f * (0.9 + Math.random() * 0.3), 0.08 + Math.random() * 0.08, { type: "sawtooth", vol: 0.012 * k, at: i * 0.11, filter: { f: 700 + Math.random() * 900, q: 3, type: "bandpass" }, to: f * (0.8 + Math.random() * 0.4), pan });
    }
  },
  ui() {
    osc(660, 0.07, { type: "triangle", vol: 0.07 });
  },
  click() {
    osc(1200, 0.03, { type: "square", vol: 0.03, filter: { f: 2500 } });
  },
  /** The school bell: a hammered electric bell, ~2.4 s. */
  bell(v = 1) {
    for (const [f, k] of [[1320, 1], [2640, 0.45], [3960, 0.25], [1985, 0.35]]) osc(f, 2.4, { type: "sine", vol: 0.075 * v * k, am: 0.9, amF: 24, attack: 0.01 });
    hiss(2.4, { freq: 2600, q: 6, vol: 0.02 * v });
  },
  footstep(surface = "tile", v = 1, run = false) {
    const f = surface === "grass" ? 600 : surface === "wood" ? 900 : surface === "court" ? 1500 : 2200;
    const q = surface === "grass" ? 0.8 : 2.2;
    hiss(run ? 0.06 : 0.05, { freq: f, q, vol: (surface === "grass" ? 0.05 : 0.045) * v * (run ? 1.3 : 1), attack: 0.002 });
    if (surface !== "grass") osc(surface === "wood" ? 160 : 220, 0.05, { type: "sine", vol: 0.03 * v, to: 90 });
  },
  door(open = true) {
    if (open) {
      osc(180, 0.35, { type: "sawtooth", vol: 0.03, to: 260, filter: { f: 900, type: "bandpass", q: 4 } });
      hiss(0.08, { freq: 900, vol: 0.05 });
    } else {
      osc(90, 0.15, { type: "sine", vol: 0.12, to: 55 });
      hiss(0.06, { freq: 600, vol: 0.06 });
    }
  },
  bounce(v = 1) {
    osc(160, 0.12, { type: "sine", vol: 0.16 * v, to: 85 });
    hiss(0.05, { freq: 900, vol: 0.05 * v });
  },
  rim() {
    for (const f of [820, 1240, 1990]) osc(f, 0.5, { type: "sine", vol: 0.05 });
  },
  board() {
    osc(220, 0.1, { type: "square", vol: 0.04, filter: { f: 700 } });
    hiss(0.08, { freq: 700, vol: 0.08 });
  },
  swish() {
    hiss(0.35, { freq: 3200, to: 1800, q: 1.2, vol: 0.12, attack: 0.02 });
  },
  kick() {
    osc(120, 0.12, { type: "sine", vol: 0.3, to: 50 });
    hiss(0.09, { freq: 500, vol: 0.14 });
  },
  whistle() {
    osc(2800, 0.5, { type: "sine", vol: 0.09, vib: 70, vibF: 32 });
  },
  cheer(v = 1) {
    hiss(1.6, { freq: 1100, q: 0.6, vol: 0.12 * v, attack: 0.15 });
    for (let i = 0; i < 8; i++) this.voice(1.4 * v);
  },
  aww() {
    osc(320, 0.8, { type: "sawtooth", vol: 0.03, to: 200, filter: { f: 900 } });
    hiss(0.7, { freq: 700, to: 400, q: 0.8, vol: 0.06, attack: 0.1 });
  },
  shoot() {
    hiss(0.12, { freq: 1200, to: 600, vol: 0.05 });
  },
  success() {
    [523, 659, 784].forEach((f, i) => osc(f, 0.25, { type: "triangle", vol: 0.1, at: i * 0.08 }));
  },
  fail() {
    [392, 330, 262].forEach((f, i) => osc(f, 0.25, { type: "triangle", vol: 0.08, at: i * 0.1 }));
  },
  correct() {
    osc(880, 0.12, { type: "triangle", vol: 0.09 });
    osc(1320, 0.18, { type: "triangle", vol: 0.08, at: 0.07 });
  },
  wrong() {
    osc(220, 0.22, { type: "square", vol: 0.05, filter: { f: 900 } });
  },
  levelUp() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => osc(f, 0.38, { type: "triangle", vol: 0.11, at: i * 0.09 }));
  },
  mission() {
    [587, 740, 880, 1175].forEach((f, i) => osc(f, 0.32, { type: "triangle", vol: 0.1, at: i * 0.085 }));
  },
  xp() {
    osc(1046, 0.1, { type: "sine", vol: 0.04 });
  },
  pickup() {
    osc(700, 0.12, { type: "sine", vol: 0.08, to: 1100 });
  },
  eat() {
    for (let i = 0; i < 3; i++) hiss(0.06, { freq: 1700 + Math.random() * 600, q: 3, vol: 0.05, at: i * 0.14 });
  },
  warning() {
    osc(330, 0.18, { type: "square", vol: 0.05, filter: { f: 1200 } });
    osc(262, 0.25, { type: "square", vol: 0.05, at: 0.16, filter: { f: 1200 } });
  },
  checkpoint() {
    osc(1175, 0.15, { type: "sine", vol: 0.09 });
    osc(1568, 0.2, { type: "sine", vol: 0.07, at: 0.06 });
  },
  beep(hi = false) {
    osc(hi ? 1320 : 880, 0.15, { type: "square", vol: 0.05, filter: { f: 3000 } });
  },
  piano() {
    const notes = [523, 587, 659, 784, 659, 587, 523, 392];
    notes.forEach((f, i) => {
      osc(f, 0.6, { type: "triangle", vol: 0.08, at: i * 0.22, attack: 0.005 });
      osc(f * 2, 0.4, { type: "sine", vol: 0.02, at: i * 0.22 });
    });
  },
  songbird(v = 0.5) {
    const f = 2400 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) osc(f * (0.9 + Math.random() * 0.25), 0.07, { type: "sine", vol: 0.03 * v, to: f * (1.2 + Math.random() * 0.3), at: i * 0.09 });
  },
  jump() {
    hiss(0.06, { freq: 900, vol: 0.03 });
  },
  land(k = 1) {
    osc(90, 0.1, { type: "sine", vol: 0.08 * k, to: 50 });
  },
  coin() {
    osc(1568, 0.08, { type: "square", vol: 0.03, filter: { f: 4000 } });
    osc(2093, 0.15, { type: "square", vol: 0.03, at: 0.07, filter: { f: 4000 } });
  },
};
