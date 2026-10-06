/**
 * Rooftop Dash — WebAudio synth (no audio files, no libraries).
 *
 * Buses: sfx / ambience / music → master → compressor → out.
 *   - Settings volumes: master, music, sfx (0..1)
 *   - Game Center Mute: master gain → 0 immediately (also covers every sound
 *     created later, since everything routes through master)
 *   - stopLoops(): silences continuous sounds (wind, slide scrape, fall wind)
 *     on pause / results / menu / hidden tab; dispose() also stops the music
 *     scheduler so nothing stacks across restarts or fullscreen toggles.
 *
 * Music: a small step sequencer. Menu = calm half-time groove; gameplay =
 * faster district variation (bpm / key / mood from data/worlds.js).
 */
let ctx = null;
let master = null;
let sfx = null;
let amb = null;
let mus = null;
let noiseBuf = null;
let muted = false;
let vol = { master: 0.85, music: 0.55, sfx: 0.9 };
const loops = {};
const lastPlay = {};
let musicTimer = null;
let musicCfg = null;
let step = 0;
let nextT = 0;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    sfx = ctx.createGain();
    amb = ctx.createGain();
    mus = ctx.createGain();
    sfx.connect(master);
    amb.connect(master);
    mus.connect(master);
    applyVolumes();
  }
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(muted ? 0 : vol.master, t);
  sfx.gain.setValueAtTime(vol.sfx, t);
  amb.gain.setValueAtTime(vol.sfx * 0.8, t);
  mus.gain.setValueAtTime(vol.music * 0.42, t);
}

function noise() {
  if (!noiseBuf) {
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b = 0.96 * b + 0.04 * w;
      d[i] = w * 0.65 + b * 2.4;
    }
  }
  return noiseBuf;
}

const ok = () => ctx && ctx.state === "running" && !muted;
function throttle(name, ms) {
  const now = performance.now();
  if (lastPlay[name] && now - lastPlay[name] < ms) return false;
  lastPlay[name] = now;
  return true;
}

/** noise burst through a filter with an envelope */
function burst({ dur = 0.1, freq = 1200, q = 1, type = "bandpass", gain = 0.3, attack = 0.004, sweep = null, bus = sfx, when = 0 }) {
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}
/** tonal blip */
function tone({ f = 440, f2 = null, dur = 0.15, type = "sine", gain = 0.2, attack = 0.005, bus = sfx, when = 0 }) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/* ------------------------------------------------------------------ loops */
function loop(name, build) {
  if (loops[name]) return loops[name];
  const l = build();
  loops[name] = l;
  return l;
}
function windLoop() {
  return loop("wind", () => {
    const src = ctx.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 500;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(amb);
    src.start();
    return { src, f, g };
  });
}
function scrapeLoop() {
  return loop("scrape", () => {
    const src = ctx.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(sfx);
    src.start();
    return { src, f, g };
  });
}

/* ------------------------------------------------------------------ music */
const SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function scheduleMusic() {
  if (!ctx || !musicCfg) return;
  const spb = 60 / musicCfg.bpm / 4; // 16th notes
  while (nextT < ctx.currentTime + 0.12) {
    playStep(step, nextT, spb);
    nextT += spb;
    step = (step + 1) % 64;
  }
}
function playStep(s, t, spb) {
  const cfg = musicCfg;
  const root = 45 + (cfg.key || 0); // A2-ish
  const bar = Math.floor(s / 16) % 4;
  const prog = cfg.menu ? [0, 5, 3, 4] : cfg.mood === "night" ? [0, 5, 6, 4] : cfg.mood === "epic" ? [0, 3, 5, 4] : [0, 5, 2, 6];
  const deg = prog[bar];
  const chordRoot = root + SCALE[deg % 7] + (deg >= 7 ? 12 : 0);
  const b16 = s % 16;
  const when = Math.max(0, t - ctx.currentTime);
  const half = cfg.menu;
  // drums
  if (!half ? b16 % 4 === 0 : b16 === 0 || b16 === 10) drum("kick", when);
  if (!half ? b16 === 4 || b16 === 12 : b16 === 8) drum("snare", when);
  if (!half ? b16 % 2 === 0 : b16 % 4 === 2) drum("hat", when, b16 % 4 === 2 ? 0.8 : 0.5);
  if (!half && cfg.mood !== "warm" && (b16 === 7 || b16 === 15)) drum("hat", when, 0.35);
  // bass
  const bassPat = half ? [0, 8] : cfg.mood === "drive" || cfg.mood === "night" ? [0, 3, 6, 8, 11, 14] : [0, 6, 8, 10, 14];
  if (bassPat.includes(b16)) note(midi(chordRoot - 12 + (b16 === 14 ? 7 : 0)), when, spb * (half ? 6 : 1.6), "sawtooth", half ? 0.05 : 0.07, 420);
  // chord stab / pad
  if (b16 === 0) {
    const third = SCALE[(deg + 2) % 7] - SCALE[deg % 7] + ((deg + 2) % 7 < deg % 7 ? 12 : 0);
    const fifth = SCALE[(deg + 4) % 7] - SCALE[deg % 7] + ((deg + 4) % 7 < deg % 7 ? 12 : 0);
    for (const iv of [0, third, fifth, 12]) note(midi(chordRoot + 12 + iv), when, spb * 15, "triangle", half ? 0.026 : 0.02, 1800, true);
  }
  // melody sparkle (gameplay only, sparse)
  if (!half && (b16 === 6 || b16 === 10 || b16 === 13) && ((s * 7) % 5 < 3)) {
    const d = SCALE[(deg + [2, 4, 6][(s >> 2) % 3]) % 7];
    note(midi(chordRoot + 24 + d), when, spb * 1.5, "square", 0.012, 2600);
  }
}
function note(freq, when, dur, type, gain, cutoff, pad = false) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + (pad ? 0.25 : 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(mus);
  o.start(t);
  o.stop(t + dur + 0.1);
}
function drum(kind, when, v = 1) {
  const t = ctx.currentTime + when;
  if (kind === "kick") {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(mus);
    o.start(t);
    o.stop(t + 0.25);
  } else if (kind === "snare") {
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(f).connect(g).connect(mus);
    src.start(t, Math.random());
    src.stop(t + 0.2);
  } else {
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(f).connect(g).connect(mus);
    src.start(t, Math.random());
    src.stop(t + 0.06);
  }
}

/* ------------------------------------------------------------------ public api */
const MAT = {
  concrete: { f: 900, q: 1.1, g: 0.14, dur: 0.07 },
  metal: { f: 2400, q: 4, g: 0.12, dur: 0.09, ring: 1800 },
  steel: { f: 2800, q: 5, g: 0.12, dur: 0.1, ring: 2200 },
  wood: { f: 520, q: 1.6, g: 0.16, dur: 0.08 },
  brick: { f: 1100, q: 1.3, g: 0.12, dur: 0.06 },
  glass: { f: 3200, q: 6, g: 0.08, dur: 0.06, ring: 3000 },
};

export const sound = {
  unlock() {
    const c = ac();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    applyVolumes();
  },
  setMuted(m) {
    muted = !!m;
    applyVolumes();
  },
  isMuted: () => muted,

  /* --- movement */
  step(mat = "concrete", sprint = false, wall = false) {
    if (!ok()) return;
    const m = MAT[mat] || MAT.concrete;
    burst({ dur: m.dur, freq: m.f * (0.9 + Math.random() * 0.2), q: m.q, gain: m.g * (sprint ? 1.25 : 1) * (wall ? 1.1 : 1) });
    if (m.ring) tone({ f: m.ring * (0.95 + Math.random() * 0.1), dur: 0.08, gain: 0.015, type: "triangle" });
    burst({ dur: 0.05, freq: 200, q: 0.8, type: "lowpass", gain: 0.12 });
  },
  jump(sprint) {
    if (!ok()) return;
    burst({ dur: 0.22, freq: 600, sweep: 1600, q: 0.8, gain: 0.09 + (sprint ? 0.03 : 0) });
    burst({ dur: 0.06, freq: 260, q: 0.8, type: "lowpass", gain: 0.16 });
  },
  land(hard, mat = "concrete") {
    if (!ok()) return;
    const m = MAT[mat] || MAT.concrete;
    burst({ dur: hard ? 0.24 : 0.11, freq: hard ? 160 : 240, q: 0.7, type: "lowpass", gain: hard ? 0.42 : 0.24 });
    burst({ dur: hard ? 0.18 : 0.08, freq: m.f, q: m.q, gain: m.g * (hard ? 1.6 : 1) });
    if (hard) tone({ f: 90, f2: 45, dur: 0.18, gain: 0.18 });
  },
  vault(low) {
    if (!ok()) return;
    burst({ dur: 0.05, freq: 1800, q: 2, gain: 0.12 }); // hand slap
    burst({ dur: low ? 0.25 : 0.32, freq: 500, sweep: 1400, q: 0.7, gain: 0.1, when: 0.04 });
  },
  slide(on) {
    const c = ac();
    if (!c) return;
    const l = scrapeLoop();
    const t = c.currentTime;
    l.g.gain.cancelScheduledValues(t);
    l.g.gain.setTargetAtTime(on && !muted ? 0.11 : 0, t, on ? 0.02 : 0.08);
    if (on && ok()) burst({ dur: 0.18, freq: 400, q: 0.8, type: "lowpass", gain: 0.18 });
  },
  wallrun() {
    if (!ok()) return;
    burst({ dur: 0.08, freq: 1300, q: 1.5, gain: 0.14 });
    tone({ f: 520, f2: 780, dur: 0.12, gain: 0.03, type: "triangle" });
  },
  walljump() {
    if (!ok()) return;
    burst({ dur: 0.07, freq: 900, q: 1.4, gain: 0.2 });
    burst({ dur: 0.28, freq: 500, sweep: 2000, q: 0.8, gain: 0.12, when: 0.02 });
  },
  dash() {
    if (!ok()) return;
    burst({ dur: 0.34, freq: 2400, sweep: 380, q: 0.9, gain: 0.22 });
    tone({ f: 260, f2: 120, dur: 0.22, gain: 0.08, type: "sawtooth" });
  },
  dashReady() {
    if (!ok() || !throttle("dashReady", 250)) return;
    tone({ f: 1320, dur: 0.07, gain: 0.03, type: "triangle" });
  },
  ledge() {
    if (!ok()) return;
    burst({ dur: 0.05, freq: 1500, q: 2, gain: 0.14 });
  },
  climb() {
    if (!ok()) return;
    burst({ dur: 0.25, freq: 380, sweep: 800, q: 0.9, gain: 0.1 });
  },
  stumble() {
    if (!ok()) return;
    burst({ dur: 0.2, freq: 300, q: 0.8, type: "lowpass", gain: 0.25 });
  },
  hazard(kind) {
    if (!ok()) return;
    if (kind === "zap") {
      for (let i = 0; i < 4; i++) burst({ dur: 0.04, freq: 3000 + Math.random() * 2000, q: 3, gain: 0.12, when: i * 0.03 });
    } else if (kind === "hook") tone({ f: 180, f2: 90, dur: 0.25, gain: 0.2, type: "square" });
    else burst({ dur: 0.45, freq: 2600, sweep: 1200, q: 0.6, type: "highpass", gain: 0.16 });
  },
  steamHiss(dist) {
    if (!ok() || !throttle("steam", 140)) return;
    burst({ dur: 0.18, freq: 4000, q: 0.5, type: "highpass", gain: Math.max(0, 0.08 - dist * 0.004) });
  },
  crumble() {
    if (!ok()) return;
    for (let i = 0; i < 3; i++) burst({ dur: 0.06, freq: 700 + i * 200, q: 2, gain: 0.12, when: i * 0.05 });
  },

  /* --- pickups / progress */
  star(n = 1) {
    if (!ok()) return;
    const base = 880 * Math.pow(1.122, n - 1);
    [0, 0.07, 0.14].forEach((w, i) => tone({ f: base * [1, 1.26, 1.5][i], dur: 0.35, gain: 0.08, type: "triangle", when: w }));
    tone({ f: base * 2, dur: 0.5, gain: 0.03, type: "sine", when: 0.2 });
  },
  checkpoint() {
    if (!ok()) return;
    tone({ f: 660, dur: 0.16, gain: 0.08, type: "triangle" });
    tone({ f: 990, dur: 0.3, gain: 0.08, type: "triangle", when: 0.1 });
  },
  finish() {
    if (!ok()) return;
    [523, 659, 784, 1046].forEach((f, i) => tone({ f, dur: 0.5, gain: 0.07, type: "triangle", when: i * 0.08 }));
    burst({ dur: 0.6, freq: 5000, q: 0.5, type: "highpass", gain: 0.06, when: 0.1 });
  },
  complete() {
    if (!ok()) return;
    [523, 659, 784, 988, 1046, 1318].forEach((f, i) => tone({ f, dur: 0.6, gain: 0.06, type: "triangle", when: 0.15 + i * 0.1 }));
  },
  flow(level) {
    if (!ok()) return;
    tone({ f: 600 + level * 120, f2: 900 + level * 160, dur: 0.18, gain: 0.04, type: "sine" });
  },
  fall() {
    const c = ac();
    if (!c || muted) return;
    burst({ dur: 0.8, freq: 400, sweep: 1500, q: 0.6, gain: 0.12, bus: amb });
  },
  respawn() {
    if (!ok()) return;
    burst({ dur: 0.35, freq: 1800, sweep: 500, q: 0.8, gain: 0.08 });
    tone({ f: 440, f2: 660, dur: 0.25, gain: 0.04, type: "sine" });
  },
  uiHover() {
    if (!ok() || !throttle("hover", 60)) return;
    tone({ f: 1600, dur: 0.035, gain: 0.025, type: "triangle" });
  },
  uiClick() {
    if (!ok()) return;
    tone({ f: 900, f2: 1300, dur: 0.07, gain: 0.05, type: "triangle" });
  },
  denied() {
    if (!ok()) return;
    tone({ f: 220, f2: 160, dur: 0.15, gain: 0.06, type: "square" });
  },

  /* --- continuous */
  wind(speed01, airborne) {
    const c = ac();
    if (!c) return;
    const l = windLoop();
    const t = c.currentTime;
    const v = muted ? 0 : Math.min(1, speed01) * (airborne ? 0.16 : 0.09);
    l.g.gain.setTargetAtTime(v, t, 0.15);
    l.f.frequency.setTargetAtTime(380 + speed01 * 900, t, 0.2);
  },
  stopLoops() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const l of Object.values(loops)) {
      l.g.gain.cancelScheduledValues(t);
      l.g.gain.setTargetAtTime(0, t, 0.03);
    }
  },
  music(cfg) {
    const c = ac();
    if (!c) return;
    if (!cfg) {
      musicCfg = null;
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
      return;
    }
    const same = musicCfg && musicCfg.bpm === cfg.bpm && musicCfg.key === cfg.key && musicCfg.menu === cfg.menu && musicCfg.mood === cfg.mood;
    musicCfg = cfg;
    if (same && musicTimer) return;
    step = 0;
    nextT = c.currentTime + 0.08;
    if (!musicTimer) musicTimer = setInterval(scheduleMusic, 30);
  },
  dispose() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    musicCfg = null;
    for (const k of Object.keys(loops)) {
      try {
        loops[k].src.stop();
      } catch {
        /* already stopped */
      }
      delete loops[k];
    }
    if (ctx) {
      const c = ctx;
      ctx = null;
      noiseBuf = null;
      c.close().catch(() => {});
    }
  },
};
