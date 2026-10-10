/**
 * Dimension Dash — WebAudio synth. No audio files: every effect and every
 * bar of music is generated here; the tunes are original (seeded motifs over
 * hand-picked progressions), not transcriptions of any existing game.
 *
 * Buses: sfx / music / loops → master → compressor → out.
 *   - Settings volumes: master, music, sfx (0‥1)
 *   - Game Center Mute: master gain → 0 immediately; everything routes
 *     through master, so nothing slips past it.
 *   - music(cfg) swaps the score; jingle(name) plays a one-shot fanfare and
 *     ducks the score while it plays.
 *   - grind(on) / run(speed) drive the two continuous loops.
 */
let ctx = null;
let master = null;
let sfx = null;
let mus = null;
let noiseBuf = null;
let muted = false;
let vol = { master: 0.85, music: 0.55, sfx: 0.9 };
let unlocked = false;
let timer = null;
let cfg = null;
let step16 = 0;
let nextT = 0;
let duckUntil = 0;
let paused = false;
const last = {};
let grindSrc = null;
let grindGain = null;
let windSrc = null;
let windGain = null;
let windFilter = null;

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
    comp.threshold.value = -12;
    comp.ratio.value = 3.2;
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
  mus.gain.setValueAtTime(paused ? vol.music * 0.08 : vol.music * 0.3, t);
}
function noise() {
  if (!noiseBuf) {
    const n = ctx.sampleRate * 2;
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

function tone({ f = 440, f2 = null, dur = 0.12, type = "square", gain = 0.15, attack = 0.004, when = 0, bus = sfx, vib = 0, curve = "exp" }) {
  if (!live()) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) {
    if (curve === "lin") o.frequency.linearRampToValueAtTime(f2, t + dur);
    else o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  }
  if (vib) {
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    l.frequency.value = 7;
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
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.02);
}
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/* ------------------------------------------------------------------ music */
const MOODS = {
  menu: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 3, 4], lead: "square", bass: "sawtooth", drums: 1, arp: 1 },
  green: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 4, 0, 5, 3, 1, 4], lead: "square", bass: "sawtooth", drums: 1, arp: 1 },
  desert: { scale: [0, 1, 4, 5, 7, 8, 10], prog: [0, 0, 6, 5, 0, 3, 6, 4], lead: "triangle", bass: "sawtooth", drums: 2, arp: 2 },
  ocean: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 1, 4, 0, 5, 3, 4], lead: "triangle", bass: "triangle", drums: 3, arp: 1 },
  neon: { scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 4, 0, 5, 3, 4], lead: "sawtooth", bass: "square", drums: 4, arp: 3 },
  final: { scale: [0, 1, 3, 5, 7, 8, 11], prog: [0, 6, 5, 4, 0, 6, 3, 4], lead: "sawtooth", bass: "sawtooth", drums: 4, arp: 3 },
  boss: { scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 0, 5, 4, 0, 0, 6, 4], lead: "sawtooth", bass: "square", drums: 5, arp: 2 },
  invincible: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 4], lead: "square", bass: "square", drums: 5, arp: 3 },
};

let melody = [];
function seededMelody(seed, len, scaleLen) {
  let s = seed * 9301 + 49297;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const motif = [];
  let deg = 4;
  for (let i = 0; i < 16; i++) {
    if (r() < 0.28) motif.push(null);
    else {
      deg += Math.round((r() - 0.42) * 4);
      deg = Math.max(0, Math.min(scaleLen + 6, deg));
      motif.push(deg);
    }
  }
  const answer = motif.map((v, i) => (v == null ? (r() < 0.5 ? null : 4) : v + (i > 8 ? 2 : -1)));
  const out = [];
  for (let b = 0; b < len; b++) {
    const src = b % 4 === 1 || b % 4 === 3 ? answer : motif;
    for (let i = 0; i < 16; i++) out.push(src[i]);
  }
  return out;
}

function scheduleMusic() {
  if (!live() || !cfg) return;
  const spb = 60 / cfg.bpm / 4;
  while (nextT < ctx.currentTime + 0.14) {
    playStep(step16, nextT, spb);
    step16++;
    nextT += spb;
  }
}

function playStep(i, t, spb) {
  const M = cfg.M;
  const key = 57 + (cfg.key || 0);
  const bar = Math.floor(i / 16);
  const s = i % 16;
  const chordDeg = M.prog[bar % M.prog.length];
  const sc = M.scale;
  const note = (deg, oct = 0) => key + sc[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + oct);
  const when = t - ctx.currentTime;
  const duck = ctx.currentTime < duckUntil ? 0.22 : 1;
  // driving eighth-note bass with an octave bounce
  if (s % 2 === 0) {
    const oct = s % 4 === 2 ? -1 : -2;
    tone({ f: hz(note(chordDeg, oct)), dur: spb * 1.7, type: M.bass, gain: 0.11 * duck, when, bus: mus });
  }
  // arpeggio
  if (M.arp) {
    const pat = M.arp === 3 ? [0, 2, 4, 7, 4, 2, 0, 2] : M.arp === 2 ? [0, 4, 2, 4] : [0, 2, 4, 2];
    if (s % 2 === 1 || M.arp === 3) {
      const a = pat[(s >> (M.arp === 3 ? 0 : 1)) % pat.length];
      tone({ f: hz(note(chordDeg + a, 0)), dur: spb * 0.9, type: "triangle", gain: 0.035 * duck, when, bus: mus });
    }
  }
  // pad on bar starts
  if (s === 0) {
    for (const k of [0, 2, 4]) tone({ f: hz(note(chordDeg + k, -1)), dur: spb * 15, type: "sine", gain: 0.025 * duck, attack: 0.08, when, bus: mus });
  }
  // lead
  let m = melody[i % melody.length];
  if (m != null) {
    if (s % 4 === 0) {
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
    tone({ f: hz(note(m, 1)), dur: spb * 1.6, type: M.lead, gain: (M.lead === "sawtooth" ? 0.03 : M.lead === "square" ? 0.034 : 0.06) * duck, when, bus: mus, vib: M.lead === "triangle" ? 4 : 0 });
  }
  // drums
  const d = M.drums;
  if (d) {
    const kick = d >= 4 ? s % 4 === 0 : s % 8 === 0 || s === 10;
    if (kick) tone({ f: 140, f2: 42, dur: 0.15, type: "sine", gain: 0.32 * duck, when, bus: mus });
    if (s % 8 === 4) burst({ dur: 0.13, freq: 1900, q: 0.7, gain: 0.13 * duck, when, bus: mus });
    if (s % 2 === 1 || d >= 4) burst({ dur: 0.03, freq: 9000, q: 1, type: "highpass", gain: 0.045 * duck, when, bus: mus });
    if (d === 2 && s % 4 === 3) tone({ f: 640, dur: 0.05, type: "triangle", gain: 0.05 * duck, when, bus: mus });
    if (d === 3 && (s === 6 || s === 14)) tone({ f: 980, dur: 0.05, type: "sine", gain: 0.05 * duck, when, bus: mus });
  }
}

/* ------------------------------------------------------------------ jingles */
const JINGLES = {
  complete: { bpm: 160, notes: [[0, 1], [4, 1], [7, 1], [12, 1], [null, 1], [11, 1], [12, 1], [14, 1], [16, 4]] },
  gameover: { bpm: 90, notes: [[7, 1], [5, 1], [3, 1], [2, 2], [null, 1], [0, 1], [-5, 4]] },
  oneUp: { bpm: 180, notes: [[0, 1], [4, 1], [7, 1], [12, 1], [7, 1], [12, 3]] },
  boss: { bpm: 150, notes: [[0, 1], [12, 1], [11, 1], [7, 1], [6, 2], [0, 4]] },
  start: { bpm: 170, notes: [[0, 1], [7, 1], [12, 2], [16, 3]] },
};
function playJingle(name) {
  const J = JINGLES[name];
  if (!J || !live()) return;
  const spb = 60 / J.bpm / 2;
  let t = 0.03;
  const root = 64;
  for (const [n, len] of J.notes) {
    if (n != null) {
      tone({ f: hz(root + n), dur: spb * len * 1.1, type: "square", gain: 0.075, when: t });
      tone({ f: hz(root + n - 12), dur: spb * len, type: "triangle", gain: 0.09, when: t });
    }
    t += spb * len;
  }
  duckUntil = ctx.currentTime + t + 0.3;
}

/* ------------------------------------------------------------------ loops */
function startLoop(kind) {
  if (!live()) return null;
  const s = ctx.createBufferSource();
  s.buffer = noise();
  s.loop = true;
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  g.gain.value = 0;
  if (kind === "grind") {
    f.type = "bandpass";
    f.frequency.value = 3200;
    f.Q.value = 4;
  } else {
    f.type = "lowpass";
    f.frequency.value = 600;
  }
  s.connect(f).connect(g).connect(sfx);
  s.start();
  return { s, g, f };
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
  setPaused(p) {
    paused = !!p;
    apply();
    if (p) {
      this.grind(false);
      this.wind(0);
    }
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
    melody = seededMelody((c.key + 5) * 37 + c.bpm + c.mood.length * 11, 8, 7);
    step16 = 0;
    if (ctx) nextT = ctx.currentTime + 0.1;
    if (unlocked) startTimer();
  },
  jingle(name) {
    playJingle(name);
  },
  /* continuous: grinding hiss, wind rush scaled by speed */
  grind(on) {
    if (on && !grindSrc && live()) {
      const l = startLoop("grind");
      if (!l) return;
      grindSrc = l.s;
      grindGain = l.g;
      grindGain.gain.setTargetAtTime(0.09, ctx.currentTime, 0.03);
    } else if (!on && grindSrc) {
      const s = grindSrc;
      grindGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
      setTimeout(() => {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }, 200);
      grindSrc = null;
      grindGain = null;
    }
  },
  wind(k) {
    if (k > 0.05 && !windSrc && live()) {
      const l = startLoop("wind");
      if (!l) return;
      windSrc = l.s;
      windGain = l.g;
      windFilter = l.f;
    }
    if (windSrc && ctx) {
      windGain.gain.setTargetAtTime(Math.min(0.12, k * 0.12), ctx.currentTime, 0.1);
      windFilter.frequency.setTargetAtTime(400 + k * 1600, ctx.currentTime, 0.1);
      if (k <= 0.05) {
        const s = windSrc;
        windGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
        setTimeout(() => {
          try {
            s.stop();
          } catch {
            /* stopped */
          }
        }, 300);
        windSrc = null;
      }
    }
  },
  /* -------- gameplay sfx */
  jump() {
    tone({ f: 260, f2: 820, dur: 0.15, type: "square", gain: 0.06 });
    tone({ f: 520, f2: 1240, dur: 0.12, type: "sine", gain: 0.05, when: 0.02 });
  },
  spin() {
    if (!throttle("spin", 120)) return;
    burst({ dur: 0.18, freq: 900, sweep: 2400, q: 2, gain: 0.08 });
  },
  rev(k) {
    tone({ f: 300 + k * 500, f2: 900 + k * 900, dur: 0.16, type: "sawtooth", gain: 0.05 });
    burst({ dur: 0.18, freq: 1400 + k * 1200, q: 3, gain: 0.07 });
  },
  dash() {
    tone({ f: 1400, f2: 180, dur: 0.35, type: "sawtooth", gain: 0.06 });
    burst({ dur: 0.35, freq: 3000, sweep: 400, q: 0.7, gain: 0.16 });
  },
  homing() {
    tone({ f: 600, f2: 1800, dur: 0.12, type: "square", gain: 0.05 });
    burst({ dur: 0.2, freq: 5000, sweep: 1500, q: 1, gain: 0.08 });
  },
  ring() {
    if (!throttle("ring", 30)) return;
    tone({ f: 1661, dur: 0.06, type: "square", gain: 0.045 });
    tone({ f: 2217, dur: 0.24, type: "square", gain: 0.045, when: 0.055 });
  },
  ringLoss() {
    for (let i = 0; i < 6; i++) tone({ f: 1800 - i * 120, dur: 0.08, type: "square", gain: 0.035, when: i * 0.035 });
  },
  enemy() {
    tone({ f: 180, f2: 60, dur: 0.22, type: "square", gain: 0.1 });
    burst({ dur: 0.28, freq: 700, sweep: 200, q: 0.6, gain: 0.22, type: "lowpass" });
  },
  spring() {
    tone({ f: 220, f2: 1500, dur: 0.28, type: "sine", gain: 0.14, vib: 50 });
  },
  boost() {
    if (!throttle("boost", 160)) return;
    burst({ dur: 0.45, freq: 600, sweep: 4200, q: 0.8, gain: 0.14 });
    tone({ f: 440, f2: 1320, dur: 0.3, type: "sawtooth", gain: 0.03 });
  },
  shift() {
    // dimension shift whoosh + shimmer
    burst({ dur: 0.9, freq: 300, sweep: 5000, q: 1.2, gain: 0.12 });
    [0, 7, 12, 19].forEach((n, i) => tone({ f: hz(72 + n), dur: 0.3, type: "sine", gain: 0.04, when: 0.1 + i * 0.07 }));
  },
  loop() {
    burst({ dur: 0.7, freq: 800, sweep: 2600, q: 1, gain: 0.06 });
  },
  checkpoint() {
    [0, 4, 7, 12].forEach((n, i) => tone({ f: hz(72 + n), dur: 0.12, type: "square", gain: 0.05, when: i * 0.07 }));
  },
  land(impact) {
    if (!throttle("land", 80)) return;
    const k = Math.min(1, impact / 24);
    burst({ dur: 0.06 + k * 0.06, freq: 500, q: 1, gain: 0.05 + k * 0.1, type: "lowpass" });
  },
  step(speed) {
    if (!throttle("step", Math.max(55, 200 - speed * 6))) return;
    burst({ dur: 0.035, freq: 700 + Math.random() * 300, q: 1.5, gain: 0.025 });
  },
  skid() {
    if (!throttle("skid", 250)) return;
    burst({ dur: 0.3, freq: 2600, q: 3, gain: 0.07 });
  },
  monitor() {
    burst({ dur: 0.2, freq: 2000, q: 0.8, gain: 0.14 });
    tone({ f: 520, dur: 0.07, type: "square", gain: 0.05, when: 0.05 });
  },
  power(kind) {
    const base = kind === "speed" ? 62 : kind === "jump" ? 66 : kind === "magnet" ? 60 : kind === "shield" ? 64 : 67;
    [0, 4, 7, 12, 16].forEach((n, i) => tone({ f: hz(base + n), dur: 0.09, type: "square", gain: 0.05, when: i * 0.05 }));
  },
  powerEnd() {
    tone({ f: 880, f2: 330, dur: 0.3, type: "triangle", gain: 0.05 });
  },
  shieldPop() {
    burst({ dur: 0.3, freq: 3000, sweep: 600, q: 2, gain: 0.12 });
  },
  oneUp() {
    playJingle("oneUp");
  },
  redStar() {
    [0, 4, 7, 11, 14, 19].forEach((n, i) => tone({ f: hz(76 + n), dur: 0.2, type: "triangle", gain: 0.08, when: i * 0.06 }));
    burst({ dur: 0.7, freq: 6000, q: 1, type: "highpass", gain: 0.04 });
  },
  hurt() {
    tone({ f: 700, f2: 160, dur: 0.32, type: "square", gain: 0.08, vib: 30 });
  },
  die() {
    tone({ f: 660, f2: 90, dur: 0.9, type: "square", gain: 0.08, vib: 20 });
  },
  goal() {
    tone({ f: 400, f2: 1600, dur: 0.5, type: "square", gain: 0.05 });
    [0, 4, 7, 12].forEach((n, i) => tone({ f: hz(79 + n), dur: 0.25, type: "triangle", gain: 0.07, when: 0.35 + i * 0.09 }));
  },
  complete() {
    playJingle("complete");
  },
  gameover() {
    playJingle("gameover");
  },
  bonk() {
    if (!throttle("bonk", 120)) return;
    tone({ f: 200, f2: 120, dur: 0.06, type: "square", gain: 0.06 });
  },
  block() {
    tone({ f: 1200, f2: 600, dur: 0.12, type: "square", gain: 0.06 });
    burst({ dur: 0.1, freq: 4000, q: 4, gain: 0.08 });
  },
  alert() {
    if (!throttle("alert", 300)) return;
    tone({ f: 900, f2: 1400, dur: 0.08, type: "triangle", gain: 0.05 });
    tone({ f: 900, f2: 1400, dur: 0.08, type: "triangle", gain: 0.05, when: 0.1 });
  },
  charge() {
    if (!throttle("tcharge", 400)) return;
    tone({ f: 300, f2: 1200, dur: 0.85, type: "sine", gain: 0.04, curve: "lin" });
  },
  shoot() {
    if (!throttle("shoot", 80)) return;
    tone({ f: 900, f2: 200, dur: 0.2, type: "sawtooth", gain: 0.04 });
  },
  laser() {
    if (!throttle("laser", 300)) return;
    tone({ f: 1200, f2: 1100, dur: 0.18, type: "sawtooth", gain: 0.02 });
  },
  switch() {
    tone({ f: 400, dur: 0.06, type: "square", gain: 0.06 });
    tone({ f: 800, dur: 0.1, type: "square", gain: 0.06, when: 0.06 });
    burst({ dur: 0.4, freq: 300, q: 0.5, gain: 0.12, type: "lowpass", when: 0.1 });
  },
  bossHit() {
    tone({ f: 220, f2: 70, dur: 0.38, type: "square", gain: 0.12 });
    burst({ dur: 0.3, freq: 600, q: 0.6, gain: 0.2, type: "lowpass" });
  },
  bossRoar() {
    tone({ f: 110, f2: 70, dur: 0.9, type: "sawtooth", gain: 0.08, vib: 15 });
  },
  bossDefeat() {
    for (let i = 0; i < 8; i++) burst({ dur: 0.35, freq: 500 + i * 80, q: 0.6, gain: 0.18, type: "lowpass", when: i * 0.18 });
  },
  slam() {
    tone({ f: 70, f2: 30, dur: 0.4, type: "sine", gain: 0.3 });
    burst({ dur: 0.35, freq: 260, q: 0.5, gain: 0.25, type: "lowpass" });
  },
  uiMove() {
    tone({ f: 1300, dur: 0.03, type: "square", gain: 0.022 });
  },
  uiClick() {
    tone({ f: 880, dur: 0.05, type: "square", gain: 0.035 });
    tone({ f: 1320, dur: 0.07, type: "square", gain: 0.03, when: 0.045 });
  },
  pause() {
    tone({ f: 660, dur: 0.06, type: "square", gain: 0.035 });
    tone({ f: 440, dur: 0.08, type: "square", gain: 0.035, when: 0.07 });
  },
  denied() {
    tone({ f: 180, dur: 0.14, type: "square", gain: 0.05 });
  },
  inspect() {
    return { muted, master: master ? master.gain.value : null, music: cfg ? cfg.id : null, ctx: ctx ? ctx.state : "none" };
  },
  dispose() {
    stopTimer();
    this.grind(false);
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
    grindSrc = grindGain = null;
    windSrc = windGain = windFilter = null;
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
