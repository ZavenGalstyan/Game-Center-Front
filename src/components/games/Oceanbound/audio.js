/**
 * Oceanbound — procedural audio (WebAudio, no sample files).
 *
 * master → music | sfx | ambience buses. Ambience: layered ocean wash with
 * slow swells, wind gusts, gull cries by day, crickets near land at night;
 * everything goes through a low-pass that closes when the head is
 * underwater. SFX are synthesized per event from noise + oscillators.
 * Music: a soft pentatonic marimba/pad on a lookahead scheduler, plus a
 * low tension pulse while the shark is attacking.
 */
let ctx = null;
let master;
let musicBus;
let sfxBus;
let ambBus;
let underLP;
let noiseBuf;
let vol = { master: 0.8, music: 0.45, sfx: 0.85, amb: 0.7 };
let muted = false;
let unlocked = false;
let amb = null;
let music = null;

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
  underLP = ctx.createBiquadFilter();
  underLP.type = "lowpass";
  underLP.frequency.value = 18000;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 3;
  ambBus.connect(underLP);
  sfxBus.connect(underLP);
  underLP.connect(comp);
  musicBus.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);
  const n = ctx.sampleRate * 3;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < n; i++) {
    // slightly pink
    const w = Math.random() * 2 - 1;
    b = 0.97 * b + 0.03 * w;
    d[i] = w * 0.6 + b * 2.2;
  }
  applyVol();
  return ctx;
}
function applyVol() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.03);
  musicBus.gain.setTargetAtTime(vol.music * 0.5, t, 0.1);
  sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.03);
  ambBus.gain.setTargetAtTime(vol.amb, t, 0.2);
}
const now = () => ctx.currentTime;
function noiseSrc(loop = false, dur = 1) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = loop;
  if (!loop) s.start(now(), Math.random() * 2, dur + 0.05);
  else s.start(now(), Math.random() * 2);
  return s;
}
function env(g, t0, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
function noise({ dur = 0.2, f = 1000, q = 1, type = "bandpass", peak = 0.3, a = 0.005, f2 = null, out = sfxBus, at = 0 }) {
  const t0 = now() + at;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.start(t0, Math.random() * 2, dur + a + 0.1);
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t0);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, a, peak, dur);
  s.connect(fl).connect(g).connect(out);
}
function tone({ f = 440, f2 = null, dur = 0.2, type = "sine", peak = 0.2, a = 0.005, out = sfxBus, at = 0 }) {
  const t0 = now() + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, a, peak, dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + a + dur + 0.05);
}

/* ------------------------------------------------------------------ ambience */
function startAmbience() {
  if (amb || !ctx) return;
  const mk = (f, q, type, g0) => {
    const s = noiseSrc(true);
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = g0;
    s.connect(fl).connect(g).connect(ambBus);
    return { s, fl, g };
  };
  amb = {
    wash: mk(700, 0.6, "lowpass", 0.18),
    rumble: mk(160, 0.7, "lowpass", 0.25),
    hiss: mk(4200, 0.5, "bandpass", 0.03),
    wind: mk(900, 1.6, "bandpass", 0.04),
    under: mk(260, 0.8, "lowpass", 0),
    t: 0,
    nextGull: 4,
    nextBird: 3,
    nextCricket: 1,
  };
}
function stopAmbience() {
  if (!amb) return;
  for (const k of ["wash", "rumble", "hiss", "wind", "under"]) {
    try {
      amb[k].s.stop();
    } catch {
      /* already stopped */
    }
  }
  amb = null;
}
function gull(gain = 0.08) {
  const t0 = now();
  for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
    const at = k * (0.18 + Math.random() * 0.08);
    const f = 1500 + Math.random() * 500;
    tone({ f, f2: f * 0.62, dur: 0.16, type: "sawtooth", peak: gain * 0.4, at, out: ambBus });
    tone({ f: f * 1.5, f2: f, dur: 0.12, type: "triangle", peak: gain * 0.25, at: at + 0.01, out: ambBus });
  }
  void t0;
}
function chirp(gain = 0.05) {
  const base = 2600 + Math.random() * 1600;
  for (let k = 0; k < 3 + Math.floor(Math.random() * 4); k++) tone({ f: base * (1 + Math.random() * 0.2), f2: base * 1.4, dur: 0.05, type: "sine", peak: gain, at: k * 0.09, out: ambBus });
}
function cricket(gain = 0.03) {
  for (let k = 0; k < 6; k++) tone({ f: 4400, dur: 0.025, type: "square", peak: gain * 0.4, at: k * 0.05, out: ambBus });
}

/* ------------------------------------------------------------------ music */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
function startMusic(kind) {
  if (!ctx) return;
  if (music && music.kind === kind) return;
  stopMusic();
  music = { kind, next: now() + 0.3, step: 0, root: 196 * (kind === "menu" ? 1 : 0.89), tension: 0, timer: null };
  const tick = () => {
    try {
      tickInner();
    } catch {
      /* never let music break the game */
    }
  };
  const tickInner = () => {
    if (!music) return;
    const ahead = now() + 0.4;
    while (music.next < ahead) {
      const s = music.step++;
      const t = music.next - now();
      const bar = Math.floor(s / 8);
      const chordRoot = [0, 5, 3, 4][bar % 4];
      if (s % 8 === 0) {
        // soft pad chord
        for (const iv of [0, 2, 4]) tone({ f: music.root * Math.pow(2, (SCALE[(chordRoot + iv) % SCALE.length] - 12) / 12), dur: 3.6, type: "sine", peak: 0.05, a: 0.8, out: musicBus, at: t });
      }
      if (Math.random() < (music.kind === "menu" ? 0.62 : 0.4)) {
        const deg = SCALE[(chordRoot + Math.floor(Math.random() * 6)) % SCALE.length];
        const f = music.root * Math.pow(2, deg / 12) * (Math.random() < 0.3 ? 2 : 1);
        tone({ f, dur: 0.7, type: "triangle", peak: 0.07, a: 0.004, out: musicBus, at: t });
        tone({ f: f * 2.01, dur: 0.25, type: "sine", peak: 0.025, a: 0.002, out: musicBus, at: t });
      }
      if (music.tension > 0.05 && s % 2 === 0) {
        tone({ f: 55, f2: 50, dur: 0.35, type: "sawtooth", peak: 0.09 * music.tension, a: 0.01, out: musicBus, at: t });
        if (s % 4 === 0) tone({ f: 82.4, dur: 0.3, type: "sine", peak: 0.12 * music.tension, a: 0.01, out: musicBus, at: t });
      }
      music.next += music.tension > 0.05 ? 0.32 : 0.42;
    }
  };
  music.timer = setInterval(tick, 120);
  tick();
}
function stopMusic() {
  if (music?.timer) clearInterval(music.timer);
  music = null;
}

/* ------------------------------------------------------------------ public API */
const SFX = {
  click: () => tone({ f: 880, f2: 660, dur: 0.06, type: "triangle", peak: 0.12 }),
  open: () => {
    noise({ dur: 0.12, f: 1800, q: 0.8, peak: 0.08 });
    tone({ f: 520, f2: 780, dur: 0.1, type: "sine", peak: 0.08 });
  },
  close: () => tone({ f: 640, f2: 420, dur: 0.1, type: "sine", peak: 0.08 }),
  fail: () => {
    tone({ f: 190, dur: 0.12, type: "square", peak: 0.05 });
    tone({ f: 150, dur: 0.14, type: "square", peak: 0.05, at: 0.08 });
  },
  step_wood: () => {
    noise({ dur: 0.05, f: 900, q: 1.5, peak: 0.16 });
    tone({ f: 130 + Math.random() * 30, f2: 90, dur: 0.07, peak: 0.12 });
  },
  step_sand: () => noise({ dur: 0.09, f: 2400, q: 0.6, type: "lowpass", peak: 0.08, f2: 900 }),
  step_wade: () => noise({ dur: 0.18, f: 1600, q: 0.8, peak: 0.12, f2: 500 }),
  stroke: () => noise({ dur: 0.35, f: 900, q: 0.7, peak: 0.07, f2: 400, a: 0.08 }),
  jump: () => noise({ dur: 0.08, f: 600, q: 1, peak: 0.06 }),
  land: () => tone({ f: 90, f2: 50, dur: 0.12, peak: 0.2 }),
  splash: (s = 1) => {
    noise({ dur: 0.45 + s * 0.3, f: 2800, q: 0.5, type: "lowpass", f2: 400, peak: 0.12 + s * 0.12, a: 0.01 });
    noise({ dur: 0.2, f: 5000, q: 1, peak: 0.05 * s });
  },
  hookThrow: () => noise({ dur: 0.35, f: 600, f2: 2400, q: 2.5, peak: 0.12, a: 0.03 }),
  hookLand: () => {
    tone({ f: 420, f2: 160, dur: 0.12, peak: 0.12 });
    noise({ dur: 0.2, f: 2200, q: 0.8, type: "lowpass", f2: 600, peak: 0.08 });
  },
  reel: () => noise({ dur: 0.02, f: 3600, q: 4, peak: 0.07 }),
  collect: () => {
    tone({ f: 660, dur: 0.08, type: "triangle", peak: 0.1 });
    tone({ f: 990, dur: 0.12, type: "triangle", peak: 0.08, at: 0.06 });
  },
  chop: () => {
    tone({ f: 180, f2: 70, dur: 0.12, type: "triangle", peak: 0.3 });
    noise({ dur: 0.08, f: 1400, q: 1.2, peak: 0.18 });
  },
  mine: () => {
    tone({ f: 1400, f2: 900, dur: 0.12, type: "square", peak: 0.06 });
    noise({ dur: 0.12, f: 3000, q: 1.5, peak: 0.16 });
    tone({ f: 120, f2: 60, dur: 0.1, peak: 0.2 });
  },
  treeFall: () => {
    tone({ f: 220, f2: 110, dur: 0.9, type: "sawtooth", peak: 0.04, a: 0.2 });
    noise({ dur: 0.6, f: 800, q: 0.6, type: "lowpass", peak: 0.25, at: 1.1, f2: 200 });
    tone({ f: 70, f2: 40, dur: 0.4, peak: 0.3, at: 1.1 });
  },
  rockBreak: () => {
    noise({ dur: 0.5, f: 1600, q: 0.6, type: "lowpass", f2: 300, peak: 0.3 });
    tone({ f: 80, f2: 40, dur: 0.3, peak: 0.25 });
  },
  swing: () => noise({ dur: 0.18, f: 700, f2: 1800, q: 2, peak: 0.06, a: 0.03 }),
  hit: () => {
    tone({ f: 150, f2: 70, dur: 0.1, peak: 0.3 });
    noise({ dur: 0.1, f: 1200, q: 1, peak: 0.15 });
  },
  hammer: () => {
    tone({ f: 340, f2: 220, dur: 0.06, type: "triangle", peak: 0.22 });
    noise({ dur: 0.05, f: 2600, q: 2, peak: 0.12 });
  },
  place: () => {
    tone({ f: 160, f2: 90, dur: 0.14, type: "triangle", peak: 0.28 });
    noise({ dur: 0.1, f: 900, q: 1, peak: 0.14 });
    tone({ f: 340, dur: 0.05, type: "triangle", peak: 0.12, at: 0.12 });
  },
  remove: () => {
    tone({ f: 300, f2: 180, dur: 0.25, type: "sawtooth", peak: 0.04 });
    noise({ dur: 0.15, f: 700, q: 1, peak: 0.12, at: 0.05 });
  },
  rotate: () => tone({ f: 500, f2: 600, dur: 0.05, type: "triangle", peak: 0.06 }),
  craft: () => {
    noise({ dur: 0.25, f: 1800, q: 0.6, peak: 0.08 });
    [523, 659, 784].forEach((f, k) => tone({ f, dur: 0.18, type: "triangle", peak: 0.08, at: 0.12 + k * 0.06 }));
  },
  eat: () => {
    for (let k = 0; k < 3; k++) noise({ dur: 0.06, f: 1800 + k * 200, q: 1.5, peak: 0.12, at: k * 0.13 });
  },
  drink: () => {
    for (let k = 0; k < 3; k++) tone({ f: 260, f2: 420, dur: 0.1, peak: 0.12, at: k * 0.2 });
  },
  bandage: () => noise({ dur: 0.4, f: 2500, q: 0.6, peak: 0.08, a: 0.05 }),
  fill: () => {
    noise({ dur: 0.4, f: 1400, q: 0.8, type: "lowpass", f2: 500, peak: 0.12 });
    for (let k = 0; k < 4; k++) tone({ f: 300 + k * 60, f2: 500 + k * 60, dur: 0.06, peak: 0.05, at: 0.05 + k * 0.08 });
  },
  pour: () => noise({ dur: 0.7, f: 1600, q: 0.7, peak: 0.1, a: 0.05, f2: 900 }),
  sizzle: () => noise({ dur: 0.9, f: 5200, q: 0.8, peak: 0.07, a: 0.02 }),
  furnace: () => {
    noise({ dur: 0.6, f: 300, q: 0.7, type: "lowpass", peak: 0.2, a: 0.05 });
  },
  door: (open) => tone({ f: open ? 220 : 260, f2: open ? 330 : 180, dur: 0.3, type: "sawtooth", peak: 0.03 }),
  sail: () => noise({ dur: 0.5, f: 700, q: 0.6, peak: 0.14, a: 0.03, f2: 300 }),
  anchor: () => {
    for (let k = 0; k < 8; k++) tone({ f: 1900 + Math.random() * 400, dur: 0.03, type: "square", peak: 0.04, at: k * 0.06 });
    noise({ dur: 0.4, f: 1800, q: 0.6, type: "lowpass", peak: 0.1, at: 0.5 });
  },
  page: () => noise({ dur: 0.3, f: 3200, q: 0.7, peak: 0.08, a: 0.05 }),
  bite: () => tone({ f: 300, f2: 140, dur: 0.12, peak: 0.16 }),
  catch: () => {
    SFX.splash(0.5);
    [660, 880, 1100].forEach((f, k) => tone({ f, dur: 0.16, type: "triangle", peak: 0.08, at: 0.1 + k * 0.07 }));
  },
  sharkWarn: () => {
    tone({ f: 55, f2: 58, dur: 2.5, type: "sawtooth", peak: 0.08, a: 0.8 });
    tone({ f: 82, dur: 2.2, type: "sine", peak: 0.1, a: 0.6 });
  },
  sharkChomp: () => {
    noise({ dur: 0.18, f: 900, q: 0.8, peak: 0.25 });
    tone({ f: 110, f2: 60, dur: 0.15, peak: 0.2 });
    noise({ dur: 0.35, f: 2000, q: 0.5, type: "lowpass", peak: 0.1, at: 0.05 });
  },
  sharkHurt: () => {
    tone({ f: 120, f2: 70, dur: 0.18, peak: 0.3 });
    SFX.splash(0.8);
  },
  sharkDie: () => {
    SFX.splash(1.4);
    tone({ f: 90, f2: 30, dur: 1.2, peak: 0.2, a: 0.05 });
  },
  sharkLunge: () => noise({ dur: 0.5, f: 1200, q: 0.6, type: "lowpass", peak: 0.2, f2: 400 }),
  hurt: () => {
    tone({ f: 140, f2: 80, dur: 0.18, type: "triangle", peak: 0.25 });
  },
  death: () => {
    tone({ f: 220, f2: 55, dur: 2.4, type: "sine", peak: 0.2, a: 0.1 });
    tone({ f: 330, f2: 82, dur: 2.4, type: "triangle", peak: 0.08, a: 0.2 });
  },
  respawn: () => [392, 494, 587].forEach((f, k) => tone({ f, dur: 0.5, type: "sine", peak: 0.1, at: k * 0.12, a: 0.05 })),
  objective: () => [523, 659, 784, 1047].forEach((f, k) => tone({ f, dur: 0.35, type: "triangle", peak: 0.1, at: k * 0.09 })),
  discover: () => {
    [392, 523, 659].forEach((f) => tone({ f, dur: 1.4, type: "sawtooth", peak: 0.035, a: 0.25 }));
    [784, 988].forEach((f, k) => tone({ f, dur: 0.8, type: "triangle", peak: 0.06, at: 0.4 + k * 0.2 }));
  },
  toolBreak: () => {
    noise({ dur: 0.2, f: 2400, q: 1, peak: 0.2 });
    tone({ f: 400, f2: 120, dur: 0.25, type: "square", peak: 0.06 });
  },
  climb: () => noise({ dur: 0.4, f: 1200, q: 0.7, type: "lowpass", f2: 400, peak: 0.12 }),
  equip: () => noise({ dur: 0.07, f: 2000, q: 1.2, peak: 0.05 }),
  purified: () => tone({ f: 1200, f2: 1600, dur: 0.12, type: "sine", peak: 0.05 }),
  cooked: () => tone({ f: 900, f2: 1200, dur: 0.15, type: "triangle", peak: 0.05 }),
  crate: () => {
    noise({ dur: 0.2, f: 900, q: 1, peak: 0.14 });
    tone({ f: 660, dur: 0.1, type: "triangle", peak: 0.08, at: 0.15 });
    tone({ f: 990, dur: 0.15, type: "triangle", peak: 0.08, at: 0.23 });
  },
};

export const sound = {
  unlock() {
    if (!init()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    unlocked = true;
    startAmbience();
  },
  suspend() {
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  },
  resume() {
    if (ctx && unlocked && ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = !!m;
    applyVol();
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    applyVol();
  },
  play(name, ...args) {
    if (!ctx || !unlocked || ctx.state !== "running") return;
    try {
      SFX[name]?.(...args);
    } catch {
      /* ignore audio glitches */
    }
  },
  music(kind) {
    if (!ctx || !unlocked) return;
    try {
      startMusic(kind);
    } catch {
      /* ignore */
    }
  },
  stopMusic,
  /** per frame: G (sim) + world state */
  update(G, dt, opts = {}) {
    try {
      updateInner(G, dt, opts);
    } catch {
      /* ignore audio glitches */
    }
  },
  /** map sim events → sounds */
  events(G) {
    try {
      eventsInner(G);
    } catch {
      /* ignore */
    }
  },
  dispose() {
    stopMusic();
    stopAmbience();
  },
};
function updateInner(G, dt, { underwater = false, menu = false } = {}) {
    if (!ctx || !amb || ctx.state !== "running") return;
    const t = now();
    amb.t += dt;
    const swell = 0.65 + 0.35 * Math.sin(amb.t * 0.31) * Math.sin(amb.t * 0.17 + 1);
    const P = G?.player;
    const onLand = P && P.ground === "land" && P.mode === "walk";
    const height = P ? Math.max(0, P.y) : 0;
    amb.wash.g.gain.setTargetAtTime(underwater ? 0.02 : (onLand ? 0.1 : 0.2) * swell, t, 0.3);
    amb.rumble.g.gain.setTargetAtTime(underwater ? 0.05 : 0.22 * (0.7 + swell * 0.3), t, 0.3);
    amb.hiss.g.gain.setTargetAtTime(underwater ? 0 : 0.03 * swell, t, 0.3);
    const gust = 0.5 + 0.5 * Math.sin(amb.t * 0.13) * Math.sin(amb.t * 0.071 + 2);
    amb.wind.g.gain.setTargetAtTime(underwater ? 0 : (0.025 + gust * 0.05) * (1 + height * 0.08), t, 0.5);
    amb.wind.fl.frequency.setTargetAtTime(600 + gust * 700, t, 0.5);
    amb.under.g.gain.setTargetAtTime(underwater ? 0.3 : 0, t, 0.15);
    underLP.frequency.setTargetAtTime(underwater ? 480 : 18000, t, 0.08);
    if (!G || menu) return;
    const day = G.clock > 5.8 && G.clock < 19.5;
    if ((amb.nextGull -= dt) <= 0) {
      amb.nextGull = 7 + Math.random() * 14;
      if (day && !underwater) gull(0.06 + Math.random() * 0.05);
    }
    const isl = G.currentIsland ? G.world.islands.get(G.currentIsland) : null;
    if ((amb.nextBird -= dt) <= 0) {
      amb.nextBird = 1.5 + Math.random() * 4;
      if (isl && isl.type === "jungle" && day) chirp(0.035);
    }
    if ((amb.nextCricket -= dt) <= 0) {
      amb.nextCricket = 0.6 + Math.random() * 1.5;
      if (isl && !day) cricket(0.03);
    }
    if (music) {
      const S = G.shark;
      const want = S.state === "approach" || S.state === "bite" || S.state === "hunt" || S.state === "lunge" ? 1 : 0;
      music.tension += (want - music.tension) * Math.min(1, dt * 0.8);
    }
}
function eventsInner(G) {
    if (!ctx || !unlocked || ctx.state !== "running") return;
    for (const e of G.events) {
      switch (e.t) {
        case "step":
          SFX[`step_${e.kind}`]?.();
          break;
        case "splash":
          SFX.splash(e.s || 1);
          break;
        case "enterWater":
          SFX.splash(0.9);
          break;
        case "door":
          SFX.door(e.open);
          break;
        case "collect":
          SFX.collect();
          break;
        case "hooked":
          SFX.reel();
          break;
        case "netCatch":
          break;
        case "cast":
          SFX.hookThrow();
          break;
        case "whiff":
          break;
        case "sharkHitPlayer":
          SFX.sharkChomp();
          SFX.hurt();
          break;
        case "sharkRepelled":
          SFX.hit();
          break;
        case "pickup":
          SFX.collect();
          break;
        case "chestOpen":
          SFX.open();
          break;
        case "hurt":
          if (e.cause !== "hunger" && e.cause !== "thirst" && e.cause !== "drown" && e.dmg > 2) SFX.hurt();
          break;
        default:
          if (SFX[e.t]) SFX[e.t](e.s);
      }
    }
}
