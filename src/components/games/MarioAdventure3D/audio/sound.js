/**
 * Mario Adventure 3D — WebAudio synth. No audio files: every effect and
 * every bar of music is generated here, and the tunes are original
 * (seeded melodies over hand-picked chord progressions), not transcriptions.
 *
 * Buses: sfx / music → master → compressor → out.
 *   - Settings volumes: master, music, sfx (0‥1)
 *   - Game Center Mute: master gain → 0 at once; every sound routes through
 *     master, so nothing slips past it.
 *   - music(cfg) swaps the score (menu, each kingdom, boss, star power);
 *     jingle(name) plays a one-shot fanfare (level complete, game over …)
 *     and ducks the score while it plays.
 */
let ctx = null;
let master = null;
let sfx = null;
let mus = null;
let noiseBuf = null;
let muted = false;
let vol = { master: 0.85, music: 0.6, sfx: 0.9 };
let unlocked = false;
let timer = null;
let cfg = null;
let step16 = 0;
let nextT = 0;
let duckUntil = 0;
const last = {};

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
    comp.ratio.value = 3.5;
    master.connect(comp).connect(ctx.destination);
    sfx = ctx.createGain();
    mus = ctx.createGain();
    sfx.connect(master);
    mus.connect(master);
    apply();
  }
  return ctx;
}
function apply() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(muted ? 0 : vol.master, t);
  sfx.gain.setValueAtTime(vol.sfx * 0.9, t);
  mus.gain.setValueAtTime(vol.music * 0.32, t);
}
function noise() {
  if (!noiseBuf) {
    const n = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
const live = () => ctx && unlocked && ctx.state === "running";
function throttle(name, ms) {
  const now = performance.now();
  if (last[name] && now - last[name] < ms) return false;
  last[name] = now;
  return true;
}

/** one enveloped oscillator note (optionally sliding to f2) */
function tone({ f = 440, f2 = null, dur = 0.12, type = "square", gain = 0.15, attack = 0.004, when = 0, bus = sfx, vib = 0 }) {
  if (!live()) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  if (vib) {
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    l.frequency.value = 6;
    lg.gain.value = vib;
    l.connect(lg).connect(o.frequency);
    l.start(t);
    l.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.03);
}
function burst({ dur = 0.12, freq = 1200, q = 1, type = "bandpass", gain = 0.25, when = 0, sweep = null, bus = sfx }) {
  if (!live()) return;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource();
  s.buffer = noise();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/* ------------------------------------------------------------------ music */
// scales (semitones) and chord progressions (scale degrees) per mood
const MOODS = {
  menu: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 3, 4], lead: "square", bass: "triangle", swing: 0.08, drums: 1 },
  green: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 4, 0, 5, 3, 1, 4], lead: "square", bass: "triangle", swing: 0.1, drums: 1 },
  desert: { scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 0, 6, 5, 0, 3, 6, 0], lead: "triangle", bass: "triangle", swing: 0, drums: 2 },
  ocean: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 1, 4, 0, 5, 3, 4], lead: "triangle", bass: "sine", swing: 0.16, drums: 3 },
  snow: { scale: [0, 2, 4, 6, 7, 9, 11], prog: [0, 4, 5, 3, 0, 4, 1, 4], lead: "sine", bass: "triangle", swing: 0, drums: 0 },
  lava: { scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 4, 0, 5, 3, 4], lead: "sawtooth", bass: "square", swing: 0, drums: 4 },
  boss: { scale: [0, 1, 3, 5, 7, 8, 11], prog: [0, 0, 5, 4, 0, 0, 6, 4], lead: "sawtooth", bass: "square", swing: 0, drums: 4 },
  star: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 0, 4], lead: "square", bass: "square", swing: 0, drums: 5 },
};

let melody = [];
function seededMelody(seed, len, scaleLen) {
  let s = seed * 9301 + 49297;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  // motif-based: a 2-bar motif, repeated with variation → memorable, not random
  const motif = [];
  let deg = 2;
  for (let i = 0; i < 16; i++) {
    if (r() < 0.32) motif.push(null);
    else {
      deg += Math.round((r() - 0.45) * 3);
      deg = Math.max(-2, Math.min(scaleLen + 4, deg));
      motif.push(deg);
    }
  }
  const out = [];
  for (let b = 0; b < len; b++) {
    for (let i = 0; i < 16; i++) {
      const v = motif[i];
      if (v == null) out.push(null);
      else if (b % 4 === 3 && i > 10) out.push(r() < 0.5 ? null : v + 2);
      else out.push(v + (b % 2 && i > 7 ? 1 : 0));
    }
  }
  return out;
}

function scheduleMusic() {
  if (!live() || !cfg) return;
  const spb = 60 / cfg.bpm / 4; // seconds per 16th
  while (nextT < ctx.currentTime + 0.14) {
    playStep(step16, nextT, spb);
    step16++;
    nextT += spb * (step16 % 2 ? 1 + (cfg.M.swing || 0) : 1 - (cfg.M.swing || 0));
  }
}

function playStep(i, t, spb) {
  const M = cfg.M;
  const key = 60 + (cfg.key || 0);
  const bar = Math.floor(i / 16);
  const s = i % 16;
  const chordDeg = M.prog[bar % M.prog.length];
  const sc = M.scale;
  const note = (deg, oct = 0) => key + sc[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + oct);
  const when = t - ctx.currentTime;
  const duck = ctx.currentTime < duckUntil ? 0.25 : 1;
  // bass: root on beats, fifth on the off-beat
  if (s % 4 === 0) tone({ f: hz(note(chordDeg, -2)), dur: spb * 3.2, type: M.bass, gain: 0.16 * duck, when, bus: mus });
  if (s % 8 === 6) tone({ f: hz(note(chordDeg + 4, -2)), dur: spb * 1.5, type: M.bass, gain: 0.1 * duck, when, bus: mus });
  // arpeggio pad
  if (s % 2 === 0) {
    const arp = [0, 2, 4, 7][(s / 2) % 4];
    tone({ f: hz(note(chordDeg + arp, -1)), dur: spb * 1.6, type: "triangle", gain: 0.045 * duck, when, bus: mus });
  }
  // lead melody
  let m = melody[i % melody.length];
  if (m != null) {
    if (s % 4 === 0) {
      // strong beats land on a chord tone (root / third / fifth, any octave)
      let best = m;
      let bd = 99;
      for (let o = -14; o <= 14; o += 7) {
        for (const ct of [0, 2, 4]) {
          const d = Math.abs(chordDeg + ct + o - m);
          if (d < bd) {
            bd = d;
            best = chordDeg + ct + o;
          }
        }
      }
      m = best;
    }
    const n = note(m, 0);
    tone({ f: hz(n), dur: spb * (M.lead === "sine" ? 2.4 : 1.7), type: M.lead, gain: (M.lead === "sawtooth" ? 0.035 : M.lead === "square" ? 0.04 : 0.07) * duck, when, bus: mus, vib: M.lead === "sine" ? 3 : 0 });
  }
  // drums
  const d = M.drums;
  if (d) {
    if (s % 8 === 0) tone({ f: 120, f2: 45, dur: 0.16, type: "sine", gain: 0.3 * duck, when, bus: mus });
    if (d !== 3 && s % 8 === 4) burst({ dur: 0.12, freq: 1800, q: 0.8, gain: 0.12 * duck, when, bus: mus });
    if (s % 2 === 1 || d >= 4) burst({ dur: 0.035, freq: 8000, q: 1, type: "highpass", gain: 0.05 * duck, when, bus: mus });
    if (d === 2 && s % 4 === 3) tone({ f: 330, dur: 0.06, type: "triangle", gain: 0.06 * duck, when, bus: mus });
    if (d === 3 && (s === 3 || s === 11)) tone({ f: 900, dur: 0.05, type: "sine", gain: 0.06 * duck, when, bus: mus });
  }
}

/* ------------------------------------------------------------------ jingles */
const JINGLES = {
  complete: { bpm: 150, notes: [[0, 1], [4, 1], [7, 1], [12, 2], [null, 1], [9, 1], [12, 1], [16, 4]] },
  gameover: { bpm: 90, notes: [[7, 1], [6, 1], [5, 1], [3, 2], [null, 1], [0, 1], [-5, 4]] },
  star: { bpm: 160, notes: [[12, 1], [16, 1], [19, 1], [24, 1], [19, 1], [24, 3]] },
  boss: { bpm: 140, notes: [[0, 1], [12, 1], [7, 1], [12, 1], [15, 2], [19, 4]] },
  world: { bpm: 140, notes: [[0, 1], [7, 1], [12, 1], [16, 2], [14, 1], [16, 3]] },
};
function playJingle(name) {
  const J = JINGLES[name];
  if (!J || !live()) return;
  const spb = 60 / J.bpm / 2;
  let t = 0.03;
  const root = 64;
  for (const [n, len] of J.notes) {
    if (n != null) {
      tone({ f: hz(root + n), dur: spb * len * 1.1, type: "square", gain: 0.08, when: t, bus: sfx });
      tone({ f: hz(root + n - 12), dur: spb * len, type: "triangle", gain: 0.1, when: t, bus: sfx });
    }
    t += spb * len;
  }
  duckUntil = ctx.currentTime + t + 0.3;
}

/* ------------------------------------------------------------------ public api */
export const sound = {
  unlock() {
    const c = ac();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    unlocked = true;
    if (cfg && !timer) startTimer();
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    apply();
  },
  setMuted(m) {
    muted = !!m;
    apply();
  },
  music(c) {
    const key = c ? `${c.mood}:${c.bpm}:${c.key}` : null;
    if (cfg && key === cfg.id) return;
    if (!c) {
      cfg = null;
      stopTimer();
      return;
    }
    cfg = { ...c, id: key, M: MOODS[c.mood] || MOODS.green };
    melody = seededMelody((c.key + 3) * 31 + c.bpm + c.mood.length * 7, 8, 7);
    step16 = 0;
    if (ctx) nextT = ctx.currentTime + 0.1;
    if (unlocked) startTimer();
  },
  jingle(name) {
    playJingle(name);
  },
  /* -------- gameplay sfx */
  jump(double) {
    if (double) {
      tone({ f: 520, f2: 1300, dur: 0.16, type: "square", gain: 0.07 });
      tone({ f: 780, f2: 1700, dur: 0.12, type: "triangle", gain: 0.07, when: 0.03 });
    } else tone({ f: 330, f2: 900, dur: 0.16, type: "square", gain: 0.075 });
  },
  land(impact, surf) {
    if (!throttle("land", 70)) return;
    const k = Math.min(1, impact / 20);
    const f = surf === "metal" ? 700 : surf === "wood" ? 500 : surf === "ice" ? 1600 : surf === "sand" || surf === "snow" ? 380 : 260;
    burst({ dur: 0.06 + k * 0.06, freq: f, q: 1.2, gain: 0.08 + k * 0.12, type: "lowpass" });
    if (k > 0.5) tone({ f: 110, f2: 55, dur: 0.12, type: "sine", gain: 0.12 * k });
  },
  step(surf) {
    if (!throttle("step", 90)) return;
    const f = surf === "metal" ? 1400 : surf === "wood" ? 900 : surf === "ice" ? 2400 : surf === "sand" || surf === "snow" ? 600 : 520;
    burst({ dur: 0.04, freq: f * (0.9 + Math.random() * 0.2), q: 1.5, gain: 0.035 });
  },
  coin() {
    if (!throttle("coin", 35)) return;
    tone({ f: 988, dur: 0.07, type: "square", gain: 0.06 });
    tone({ f: 1319, dur: 0.28, type: "square", gain: 0.06, when: 0.06 });
  },
  stomp() {
    tone({ f: 220, f2: 90, dur: 0.12, type: "square", gain: 0.12 });
    burst({ dur: 0.09, freq: 700, q: 0.8, gain: 0.18, type: "lowpass" });
    tone({ f: 660, f2: 1320, dur: 0.1, type: "triangle", gain: 0.06, when: 0.05 });
  },
  shell() {
    tone({ f: 300, f2: 180, dur: 0.12, type: "square", gain: 0.1 });
    burst({ dur: 0.08, freq: 2400, q: 3, gain: 0.08 });
  },
  hurt() {
    tone({ f: 600, f2: 150, dur: 0.35, type: "square", gain: 0.1, vib: 30 });
    burst({ dur: 0.15, freq: 900, q: 1, gain: 0.12 });
  },
  die() {
    tone({ f: 494, dur: 0.12, type: "square", gain: 0.09 });
    tone({ f: 466, dur: 0.12, type: "square", gain: 0.09, when: 0.13 });
    tone({ f: 440, dur: 0.12, type: "square", gain: 0.09, when: 0.26 });
    tone({ f: 415, f2: 200, dur: 0.6, type: "square", gain: 0.09, when: 0.4 });
  },
  fall() {
    tone({ f: 900, f2: 120, dur: 0.6, type: "triangle", gain: 0.08 });
  },
  splash() {
    burst({ dur: 0.45, freq: 900, sweep: 300, q: 0.7, gain: 0.25, type: "lowpass" });
  },
  powerup(kind) {
    const base = kind === "speed" ? 60 : kind === "jump" ? 64 : kind === "magnet" ? 57 : 67;
    [0, 4, 7, 12, 16, 19].forEach((n, i) => tone({ f: hz(base + n), dur: 0.09, type: "square", gain: 0.06, when: i * 0.05 }));
  },
  powerEnd() {
    tone({ f: 880, f2: 330, dur: 0.3, type: "triangle", gain: 0.06 });
  },
  heart() {
    [0, 7, 12].forEach((n, i) => tone({ f: hz(72 + n), dur: 0.12, type: "triangle", gain: 0.09, when: i * 0.07 }));
  },
  block(empty) {
    if (empty) {
      tone({ f: 160, f2: 110, dur: 0.07, type: "square", gain: 0.08 });
      return;
    }
    tone({ f: 523, dur: 0.06, type: "square", gain: 0.06 });
    tone({ f: 784, dur: 0.12, type: "square", gain: 0.06, when: 0.05 });
  },
  sprout() {
    tone({ f: 300, f2: 900, dur: 0.4, type: "triangle", gain: 0.08, vib: 20 });
  },
  bonk() {
    if (!throttle("bonk", 120)) return;
    tone({ f: 180, f2: 120, dur: 0.06, type: "square", gain: 0.07 });
  },
  spring() {
    tone({ f: 200, f2: 1200, dur: 0.3, type: "sine", gain: 0.14, vib: 40 });
  },
  checkpoint() {
    [0, 4, 7, 12].forEach((n, i) => tone({ f: hz(67 + n), dur: 0.14, type: "square", gain: 0.06, when: i * 0.08 }));
  },
  hiddenStar() {
    [0, 7, 12, 16, 19, 24].forEach((n, i) => tone({ f: hz(72 + n), dur: 0.2, type: "triangle", gain: 0.09, when: i * 0.07 }));
    burst({ dur: 0.8, freq: 6000, q: 1, type: "highpass", gain: 0.04 });
  },
  secret() {
    [12, 11, 7, 2, 0, 8, 12, 16].forEach((n, i) => tone({ f: hz(64 + n), dur: 0.1, type: "triangle", gain: 0.07, when: i * 0.07 }));
  },
  pipe() {
    [0, 1, 2].forEach((i) => tone({ f: 330 - i * 70, dur: 0.1, type: "square", gain: 0.06, when: i * 0.1 }));
  },
  goal() {
    tone({ f: 400, f2: 1600, dur: 0.6, type: "square", gain: 0.06 });
  },
  complete() {
    playJingle("complete");
  },
  gameover() {
    playJingle("gameover");
  },
  enemyAlert() {
    if (!throttle("alert", 150)) return;
    tone({ f: 900, f2: 1300, dur: 0.08, type: "triangle", gain: 0.05 });
  },
  enemyHop() {
    if (!throttle("hop", 120)) return;
    tone({ f: 260, f2: 520, dur: 0.1, type: "sine", gain: 0.05 });
  },
  swoop() {
    tone({ f: 1200, f2: 300, dur: 0.35, type: "sawtooth", gain: 0.03 });
  },
  charge() {
    burst({ dur: 0.3, freq: 300, q: 0.7, gain: 0.12, type: "lowpass" });
  },
  defeat() {
    tone({ f: 700, f2: 1400, dur: 0.12, type: "square", gain: 0.05 });
  },
  cannon() {
    if (!throttle("cannon", 200)) return;
    tone({ f: 90, f2: 40, dur: 0.25, type: "sine", gain: 0.2 });
    burst({ dur: 0.18, freq: 500, q: 0.6, gain: 0.18, type: "lowpass" });
  },
  crush() {
    tone({ f: 70, f2: 35, dur: 0.3, type: "sine", gain: 0.25 });
    burst({ dur: 0.25, freq: 300, q: 0.5, gain: 0.2, type: "lowpass" });
  },
  warn() {
    if (!throttle("warn", 300)) return;
    burst({ dur: 0.25, freq: 200, q: 2, gain: 0.08 });
  },
  fire() {
    if (!throttle("fire", 160)) return;
    burst({ dur: 0.35, freq: 1200, sweep: 400, q: 0.5, gain: 0.12 });
  },
  crack() {
    burst({ dur: 0.15, freq: 3000, q: 2, gain: 0.08 });
  },
  shatter() {
    burst({ dur: 0.3, freq: 4000, q: 1, gain: 0.12, type: "highpass" });
  },
  bossHit() {
    tone({ f: 200, f2: 60, dur: 0.4, type: "square", gain: 0.13 });
    burst({ dur: 0.3, freq: 600, q: 0.6, gain: 0.2, type: "lowpass" });
  },
  bossRoar() {
    tone({ f: 120, f2: 70, dur: 0.9, type: "sawtooth", gain: 0.08, vib: 15 });
    burst({ dur: 0.8, freq: 400, q: 0.6, gain: 0.12, type: "lowpass" });
  },
  bossDefeat() {
    [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((n, i) => tone({ f: hz(60 + n), dur: 0.14, type: "square", gain: 0.06, when: i * 0.09 }));
  },
  slam() {
    tone({ f: 60, f2: 30, dur: 0.4, type: "sine", gain: 0.3 });
    burst({ dur: 0.35, freq: 250, q: 0.5, gain: 0.25, type: "lowpass" });
  },
  shoot() {
    if (!throttle("shoot", 80)) return;
    tone({ f: 500, f2: 200, dur: 0.18, type: "sawtooth", gain: 0.04 });
  },
  uiMove() {
    tone({ f: 1200, dur: 0.03, type: "square", gain: 0.025 });
  },
  uiClick() {
    tone({ f: 880, dur: 0.05, type: "square", gain: 0.04 });
    tone({ f: 1320, dur: 0.06, type: "square", gain: 0.035, when: 0.04 });
  },
  pause() {
    tone({ f: 660, dur: 0.06, type: "square", gain: 0.04 });
    tone({ f: 440, dur: 0.08, type: "square", gain: 0.04, when: 0.07 });
  },
  denied() {
    tone({ f: 200, dur: 0.12, type: "square", gain: 0.05 });
  },
  /** state snapshot for tests: is the master gain really silent? */
  inspect() {
    return { muted, master: master ? master.gain.value : null, music: cfg ? cfg.id : null, ctx: ctx ? ctx.state : "none" };
  },
  stopMusic() {
    cfg = null;
    stopTimer();
  },
  dispose() {
    stopTimer();
    cfg = null;
    if (ctx) {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }
    ctx = null;
    master = sfx = mus = null;
    noiseBuf = null;
    unlocked = false;
  },
};

function startTimer() {
  stopTimer();
  if (!ctx) return;
  nextT = Math.max(nextT, ctx.currentTime + 0.05);
  timer = setInterval(scheduleMusic, 30);
}
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}
