/**
 * Last Hope — procedural audio (WebAudio, no sample files).
 *
 * master → music | sfx | ambience buses (+ compressor). SFX are synthesized
 * per sim event from noise and oscillators (swings, impacts, chopping,
 * mining, groans, gunshots, explosions, crafting, UI). Ambience layers wind,
 * daytime birds, night crickets, rain, the yard's machine hum and the
 * bunker's drone, plus a campfire crackle by distance. Music is a slow
 * minor-key pad on a lookahead scheduler with a tense pulse while hunted.
 */
let ctx = null;
let master;
let musicBus;
let sfxBus;
let ambBus;
let noiseBuf;
let vol = { master: 0.8, music: 0.4, sfx: 0.85, amb: 0.6 };
let muted = false;
let amb = null;
let mus = null;
let lastStep = 0;

function init() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  ambBus = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3.5;
  sfxBus.connect(comp);
  ambBus.connect(comp);
  musicBus.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);
  const n = ctx.sampleRate * 3;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b = 0.96 * b + 0.04 * w;
    d[i] = w * 0.5 + b * 2.4;
  }
  applyVol();
  return ctx;
}
function applyVol() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.03);
  musicBus.gain.setTargetAtTime(vol.music * 0.5, t, 0.2);
  sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.03);
  ambBus.gain.setTargetAtTime(vol.amb * 0.8, t, 0.2);
}
const now = () => ctx.currentTime;
function noise(dur, out, { f = 1200, q = 0.8, type = "lowpass", g = 0.4, a = 0.004, d = dur, f2 = null, t0 = 0 } = {}) {
  // exponential ramps can't reach 0: skip inaudible sounds, clamp the rest
  if (!(g > 0.002)) return null;
  const t = now() + Math.max(0, t0);
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  fl.Q.value = q;
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(g, t + a);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl);
  fl.connect(gn);
  gn.connect(out);
  s.start(t, Math.random() * 2, dur + 0.05);
  return gn;
}
function tone(freq, dur, out, { type = "sine", g = 0.3, a = 0.005, f2 = null, t0 = 0, d = dur } = {}) {
  if (!(g > 0.002)) return null;
  const t = now() + Math.max(0, t0);
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(g, t + a);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(gn);
  gn.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}
/** Distance attenuation from the listener (player). */
let lx = 0;
let lz = 0;
function at(x, z, r = 26) {
  if (x == null) return 1;
  const d = Math.hypot(x - lx, z - lz);
  return Math.max(0, 1 - d / r) ** 1.3;
}

/* ---------------------------------------------------------------- sfx library */
const SFX = {
  click: () => tone(880, 0.05, sfxBus, { type: "triangle", g: 0.12 }),
  open: () => (noise(0.18, sfxBus, { f: 900, g: 0.18, type: "bandpass", q: 2 }), tone(320, 0.12, sfxBus, { type: "triangle", g: 0.08, f2: 420 })),
  close: () => (noise(0.14, sfxBus, { f: 700, g: 0.14, type: "bandpass", q: 2 }), tone(380, 0.1, sfxBus, { type: "triangle", g: 0.06, f2: 280 })),
  fail: () => (tone(220, 0.16, sfxBus, { type: "square", g: 0.06 }), tone(170, 0.2, sfxBus, { type: "square", g: 0.05, t0: 0.08 })),
  swing: (k = 1) => noise(0.22, sfxBus, { f: 600, f2: 2400, type: "bandpass", q: 1.4, g: 0.2 * k, a: 0.04, d: 0.22 }),
  whiff: () => noise(0.18, sfxBus, { f: 500, f2: 1600, type: "bandpass", q: 1.2, g: 0.1, a: 0.03 }),
  hit: (k = 1) => (noise(0.12, sfxBus, { f: 380, g: 0.5 * k, d: 0.12 }), tone(110, 0.12, sfxBus, { type: "sine", g: 0.4 * k, f2: 60 })),
  hitMetal: () => (tone(820, 0.25, sfxBus, { type: "triangle", g: 0.14, f2: 760 }), noise(0.08, sfxBus, { f: 3000, type: "highpass", g: 0.2 })),
  crit: () => (tone(1400, 0.08, sfxBus, { type: "square", g: 0.05 }), noise(0.16, sfxBus, { f: 300, g: 0.6 })),
  chop: () => (noise(0.09, sfxBus, { f: 1400, type: "bandpass", q: 3, g: 0.5 }), tone(190, 0.1, sfxBus, { type: "triangle", g: 0.25, f2: 120 })),
  mine: () => (tone(1700 + Math.random() * 400, 0.12, sfxBus, { type: "triangle", g: 0.16 }), noise(0.06, sfxBus, { f: 4000, type: "highpass", g: 0.25 })),
  scrap: () => (tone(520 + Math.random() * 200, 0.3, sfxBus, { type: "triangle", g: 0.12, f2: 480 }), noise(0.1, sfxBus, { f: 2500, type: "bandpass", q: 2, g: 0.3 })),
  rustle: () => noise(0.3, sfxBus, { f: 2200, type: "bandpass", q: 0.8, g: 0.2, a: 0.03 }),
  treeFall: () => (noise(1.2, sfxBus, { f: 400, f2: 120, g: 0.4, a: 0.3, d: 1.2 }), noise(0.4, sfxBus, { f: 200, g: 0.6, t0: 1.05, d: 0.4 }), tone(55, 0.5, sfxBus, { g: 0.5, t0: 1.05, f2: 35 })),
  rockBreak: () => (noise(0.4, sfxBus, { f: 900, f2: 200, g: 0.5 }), tone(70, 0.3, sfxBus, { g: 0.3, f2: 40 })),
  pickup: () => (tone(660, 0.06, sfxBus, { type: "triangle", g: 0.1 }), tone(990, 0.08, sfxBus, { type: "triangle", g: 0.08, t0: 0.05 })),
  craft: () => {
    for (let i = 0; i < 3; i++) noise(0.06, sfxBus, { f: 2000, type: "bandpass", q: 4, g: 0.3, t0: i * 0.12 });
    tone(880, 0.3, sfxBus, { type: "triangle", g: 0.08, t0: 0.38 });
    tone(1320, 0.4, sfxBus, { type: "triangle", g: 0.06, t0: 0.44 });
  },
  build: () => {
    for (let i = 0; i < 3; i++) (noise(0.08, sfxBus, { f: 700, g: 0.5, t0: i * 0.16 }), tone(140, 0.08, sfxBus, { g: 0.3, t0: i * 0.16, f2: 90 }));
  },
  demolish: () => (noise(0.5, sfxBus, { f: 600, f2: 150, g: 0.5 }), tone(80, 0.3, sfxBus, { g: 0.3 })),
  door: (open) => (tone(open ? 300 : 420, 0.35, sfxBus, { type: "sawtooth", g: 0.03, f2: open ? 420 : 260 }), noise(0.1, sfxBus, { f: 500, g: 0.3, t0: 0.3 })),
  eat: () => {
    for (let i = 0; i < 3; i++) noise(0.07, sfxBus, { f: 1800, type: "bandpass", q: 2, g: 0.18, t0: i * 0.14 });
  },
  drink: () => {
    for (let i = 0; i < 4; i++) tone(320 + i * 40, 0.08, sfxBus, { type: "sine", g: 0.12, t0: i * 0.11, f2: 220 });
  },
  heal: () => (noise(0.3, sfxBus, { f: 3000, type: "highpass", g: 0.08, a: 0.1 }), tone(660, 0.4, sfxBus, { g: 0.06, f2: 880 })),
  fill: () => {
    for (let i = 0; i < 6; i++) tone(500 + Math.random() * 500, 0.06, sfxBus, { g: 0.08, t0: i * 0.07, f2: 900 });
  },
  pistol: () => (noise(0.25, sfxBus, { f: 3000, f2: 400, g: 0.9, a: 0.002 }), tone(160, 0.18, sfxBus, { type: "square", g: 0.25, f2: 50 })),
  rifle: () => (noise(0.35, sfxBus, { f: 2500, f2: 250, g: 1.0, a: 0.002 }), tone(110, 0.25, sfxBus, { type: "square", g: 0.3, f2: 40 })),
  bow: () => (tone(160, 0.22, sfxBus, { type: "triangle", g: 0.2, f2: 120 }), noise(0.15, sfxBus, { f: 1500, type: "bandpass", q: 1, g: 0.15, t0: 0.02 })),
  dry: () => tone(1500, 0.04, sfxBus, { type: "square", g: 0.06 }),
  explosion: (k = 1) => (noise(1.4, sfxBus, { f: 1600, f2: 60, g: 1.1 * k, a: 0.005, d: 1.4 }), tone(48, 0.8, sfxBus, { g: 0.8 * k, f2: 28 })),
  slam: (k = 1) => (noise(0.6, sfxBus, { f: 300, f2: 50, g: 0.9 * k }), tone(42, 0.6, sfxBus, { g: 0.9 * k, f2: 25 })),
  hurt: () => (noise(0.16, sfxBus, { f: 500, g: 0.5 }), tone(170, 0.2, sfxBus, { type: "sawtooth", g: 0.09, f2: 110 })),
  death: () => (tone(110, 1.6, sfxBus, { type: "sawtooth", g: 0.12, f2: 40, a: 0.05 }), noise(1.2, sfxBus, { f: 300, f2: 80, g: 0.5, a: 0.05 })),
  level: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, sfxBus, { type: "triangle", g: 0.12, t0: i * 0.09 })),
  mission: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.5, sfxBus, { type: "sine", g: 0.13, t0: i * 0.12 })),
  unlock: () => (tone(880, 0.1, sfxBus, { type: "square", g: 0.06 }), tone(1320, 0.18, sfxBus, { type: "square", g: 0.06, t0: 0.1 }), noise(0.8, sfxBus, { f: 200, g: 0.3, t0: 0.2, a: 0.2 })),
  power: () => (tone(60, 2.2, sfxBus, { type: "sawtooth", g: 0.12, f2: 240, a: 0.4 }), noise(0.5, sfxBus, { f: 3000, type: "highpass", g: 0.15, t0: 1.6 })),
  raid: () => [220, 207, 196].forEach((f, i) => tone(f, 0.7, sfxBus, { type: "sawtooth", g: 0.08, t0: i * 0.55, a: 0.1 })),
  spit: () => noise(0.2, sfxBus, { f: 900, f2: 300, type: "bandpass", q: 3, g: 0.35 }),
  splat: () => noise(0.25, sfxBus, { f: 600, type: "bandpass", q: 2, g: 0.4 }),
  step: (hard) => noise(0.05, sfxBus, { f: hard ? 2200 : 900, type: "bandpass", q: 1.5, g: hard ? 0.05 : 0.07 }),
  struct: () => (noise(0.12, sfxBus, { f: 500, g: 0.6 }), tone(90, 0.12, sfxBus, { g: 0.4, f2: 60 })),
};

function groan(type, k, chase, boss) {
  const base = boss ? 55 : type === "runner" ? 160 : type === "toxic" ? 110 : type === "armored" ? 90 : 120;
  const f = base * (0.85 + Math.random() * 0.3);
  const dur = boss ? 1.6 : 0.7 + Math.random() * 0.6;
  const t = now();
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * (chase ? 1.35 : 0.85), t + dur * 0.6);
  o.frequency.linearRampToValueAtTime(f * 0.7, t + dur);
  // formant filter for a throaty vowel
  const f1 = ctx.createBiquadFilter();
  f1.type = "bandpass";
  f1.frequency.value = boss ? 400 : 650 + Math.random() * 250;
  f1.Q.value = 5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, (chase ? 0.4 : 0.22) * k), t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 7 + Math.random() * 6;
  const lg = ctx.createGain();
  lg.gain.value = f * 0.06;
  lfo.connect(lg);
  lg.connect(o.frequency);
  o.connect(f1);
  f1.connect(g);
  g.connect(sfxBus);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.1);
  lfo.stop(t + dur + 0.1);
  noise(dur * 0.8, sfxBus, { f: 500, type: "bandpass", q: 1, g: 0.06 * k, a: 0.1 });
}

/* ---------------------------------------------------------------- ambience */
function startAmb() {
  if (amb) return;
  const mk = (f, q, type = "bandpass") => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(fl);
    fl.connect(g);
    g.connect(ambBus);
    s.start(now(), Math.random() * 2);
    return { s, fl, g };
  };
  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 50;
  const humF = ctx.createBiquadFilter();
  humF.type = "lowpass";
  humF.frequency.value = 180;
  const humG = ctx.createGain();
  humG.gain.value = 0;
  hum.connect(humF);
  humF.connect(humG);
  humG.connect(ambBus);
  hum.start();
  amb = { wind: mk(420, 0.6, "lowpass"), rain: mk(2600, 0.4, "highpass"), fire: mk(1800, 1.2), humG, birdT: 2, crickT: 0 };
}
function bird() {
  const t0 = Math.random() * 0.2;
  const f = 2400 + Math.random() * 1800;
  const n = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) tone(f * (1 + (Math.random() - 0.5) * 0.2), 0.08, ambBus, { type: "sine", g: 0.03, t0: t0 + i * 0.11, f2: f * 1.25 });
}
function cricket() {
  for (let i = 0; i < 6; i++) tone(4200, 0.025, ambBus, { type: "triangle", g: 0.012, t0: i * 0.045 });
}

/* ---------------------------------------------------------------- music */
const SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor
function startMusic() {
  if (mus) return;
  mus = { next: now() + 0.5, step: 0, mode: "calm", tension: 0, chord: 0 };
}
function scheduleMusic() {
  if (!mus || !ctx) return;
  const ahead = now() + 0.6;
  while (mus.next < ahead) {
    const t = mus.next;
    const root = 45; // A2
    const prog = [0, 5, 3, 4];
    const deg = prog[mus.chord % 4];
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    if (mus.step % 8 === 0) {
      // pad chord: root, third, fifth
      for (const iv of [0, 2, 4]) {
        const n = root + 12 + SCALE[(deg + iv) % 7] + (deg + iv >= 7 ? 12 : 0);
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = midi(n);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4.6);
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 900;
        o.connect(f);
        f.connect(g);
        g.connect(musicBus);
        o.start(t);
        o.stop(t + 4.8);
      }
      mus.chord++;
    }
    if (mus.mode === "menu" && mus.step % 2 === 0 && Math.random() < 0.55) {
      const n = root + 24 + SCALE[Math.floor(Math.random() * 7)];
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = midi(n);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g);
      g.connect(musicBus);
      o.start(t);
      o.stop(t + 1.5);
    }
    if (mus.tension > 0.3) {
      // heartbeat-like pulse while hunted
      if (mus.step % 2 === 0) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(65, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.22 * mus.tension), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g);
        g.connect(musicBus);
        o.start(t);
        o.stop(t + 0.3);
      }
      if (mus.step % 4 === 2) noise(0.12, musicBus, { f: 5000, type: "highpass", g: 0.05 * mus.tension, t0: t - now() });
    }
    mus.step++;
    mus.next += mus.tension > 0.3 ? 0.36 : 0.6;
  }
}

/* ---------------------------------------------------------------- public */
/** Audio must never take the game loop down with it. */
function safe(fn) {
  return (...a) => {
    try {
      return fn(...a);
    } catch (err) {
      if (!safe.warned) {
        safe.warned = true;
        console.warn("[LastHope] audio", err);
      }
      return undefined;
    }
  };
}
export const sound = {
  unlock() {
    const c = init();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    if (c) {
      startAmb();
      startMusic();
    }
  },
  suspend() {
    ctx?.suspend?.().catch(() => {});
  },
  resume() {
    ctx?.resume?.().catch(() => {});
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    applyVol();
  },
  setMuted(m) {
    muted = m;
    applyVol();
  },
  play: safe((name, ...args) => {
    if (!ctx || ctx.state !== "running") return;
    SFX[name]?.(...args);
  }),
  music(mode) {
    if (mus) mus.mode = mode;
  },
  /** React to a frame's sim events. */
  events: safe((G) => {
    if (!ctx || ctx.state !== "running") return;
    const P = G.P;
    lx = P.x;
    lz = P.z;
    for (const e of G.events) {
      switch (e.t) {
        case "swing":
          SFX.swing(e.anim === "heavy" || e.anim === "chop" ? 1.3 : 1);
          break;
        case "shot":
          if (e.kind === "bow") SFX.bow();
          else if (e.id === "rifle") SFX.rifle();
          else SFX.pistol();
          break;
        case "dry":
          SFX.dry();
          break;
        case "whiff":
          SFX.whiff();
          break;
        case "zhit":
          if (e.armored) SFX.hitMetal();
          if (e.crit) SFX.crit();
          else SFX.hit(at(e.x, e.z));
          break;
        case "ahit":
          SFX.hit(0.7);
          break;
        case "phit":
          SFX.hurt();
          break;
        case "gather":
          if (e.kind === "tree") SFX.chop();
          else if (e.kind === "rock") SFX.mine();
          else if (e.kind === "scrap") SFX.scrap();
          else SFX.rustle();
          break;
        case "gatherFail":
          SFX.hitMetal();
          break;
        case "deplete":
          if (e.kind === "tree") SFX.treeFall();
          else if (e.kind === "rock") SFX.rockBreak();
          else if (e.kind === "pick") SFX.rustle();
          break;
        case "pickup":
          if (e.n > 0) SFX.pickup();
          break;
        case "craft":
          SFX.craft();
          break;
        case "build":
        case "upgrade":
          SFX.build();
          break;
        case "demolish":
        case "sbreak":
          SFX.demolish();
          break;
        case "shit":
          SFX.struct();
          break;
        case "door":
          if (at(e.x, e.z, 20) > 0) SFX.door(e.open);
          break;
        case "used":
          if (e.cat === "medical") SFX.heal();
          else if (e.id === "water_bottle" || e.id === "dirty_water" || e.id === "soda") SFX.drink();
          else SFX.eat();
          break;
        case "fill":
          SFX.fill();
          break;
        case "groan": {
          const k = at(e.x, e.z, e.boss ? 40 : 22);
          if (k > 0.03) groan(e.type, k, e.chase, e.boss);
          break;
        }
        case "ztele":
          if (e.kind === "slamWind" || e.kind === "chargeWind") groan("brute", 1, true, true);
          break;
        case "explode":
          SFX.explosion(Math.max(0.3, at(e.x, e.z, 50)));
          break;
        case "slam":
          SFX.slam(Math.max(0.4, at(e.x, e.z, 40)));
          break;
        case "spit":
          SFX.spit();
          break;
        case "splat":
          SFX.splat();
          break;
        case "death":
          SFX.death();
          break;
        case "level":
          SFX.level();
          break;
        case "mission":
          SFX.mission();
          break;
        case "unlockDoor":
          SFX.unlock();
          break;
        case "power":
          SFX.power();
          break;
        case "raid":
          SFX.raid();
          break;
        case "toast":
          if (e.kind === "bad") SFX.fail();
          break;
      }
    }
  }),
  /** Per-frame ambience / music mix. */
  update: safe((G, dt, o = {}) => {
    if (!ctx || !amb || ctx.state !== "running") return;
    const t = now();
    const P = G.P;
    const bunker = G.loc === "bunker";
    const night = G.clock >= 20 || G.clock < 5.5;
    const rain = G.weather.kind === "rain" ? G.weather.k : 0;
    const outdoors = !bunker;
    amb.wind.g.gain.setTargetAtTime(outdoors ? 0.18 + rain * 0.1 : 0.05, t, 0.8);
    amb.wind.fl.frequency.setTargetAtTime(300 + Math.sin(t * 0.13) * 140, t, 1);
    amb.rain.g.gain.setTargetAtTime(outdoors ? rain * 0.22 : 0, t, 0.8);
    // campfire crackle
    let fire = 0;
    if (G.loc === "camp") for (const s of G.structures) if (s.kind === "campfire") fire = Math.max(fire, 1 - Math.hypot(s.x - P.x, s.z - P.z) / 12);
    amb.fire.g.gain.setTargetAtTime(Math.max(0, fire) * 0.12 * (0.6 + Math.random() * 0.8), t, 0.05);
    amb.humG.gain.setTargetAtTime(bunker ? (G.flags.power ? 0.06 : 0.035) : G.loc === "industrial" ? 0.025 : 0, t, 1);
    if (outdoors && !o.menu) {
      amb.birdT -= dt;
      if (amb.birdT <= 0) {
        amb.birdT = 2 + Math.random() * 6;
        if (!night && rain < 0.4 && G.loc !== "industrial") bird();
      }
      if (night) {
        amb.crickT -= dt;
        if (amb.crickT <= 0) {
          amb.crickT = 0.4 + Math.random() * 1.2;
          cricket();
        }
      }
    }
    // footsteps
    if (!o.menu && !P.dead && P.speed > 0.5) {
      const interval = P.sprinting ? 0.3 : 0.48;
      if (t - lastStep > interval) {
        lastStep = t;
        SFX.step(bunker || G.loc === "industrial" || P.inside != null);
      }
    }
    if (mus) {
      const tension = o.menu ? 0 : o.chased ? 1 : 0;
      mus.tension += (tension - mus.tension) * Math.min(1, dt * 0.8);
      scheduleMusic();
    }
  }),
  dispose() {
    try {
      ctx?.close();
    } catch {
      /* already closed */
    }
    ctx = null;
    amb = null;
    mus = null;
  },
};
