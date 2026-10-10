/**
 * Web Hero — WebAudio synth. No audio files: every effect and every bar of
 * music is generated here; the score is original (seeded motifs over
 * hand-picked progressions).
 *
 * Buses: sfx / music / ambience → master → compressor → out.
 *   - Settings volumes: master, music, sfx (0‥1)
 *   - Game Center Mute: master gain → 0 immediately; everything routes
 *     through master, so nothing slips past it.
 *   - music(cfg) swaps the score; jingle(name) plays a one-shot sting and
 *     ducks the score while it plays.
 *   - wind(k) drives the swing / fall rush loop; ambience(kind) the city bed.
 */
let ctx = null;
let master = null;
let sfx = null;
let mus = null;
let amb = null;
let noiseBuf = null;
let muted = false;
let vol = { master: 0.85, music: 0.5, sfx: 0.9 };
let unlocked = false;
let timer = null;
let cfg = null;
let step16 = 0;
let nextT = 0;
let duckUntil = 0;
let paused = false;
const last = {};
let windSrc = null;
let windGain = null;
let windFilter = null;
let ambNodes = null;
let ambKind = null;
let hornT = 0;

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
    comp.ratio.value = 3.4;
    master.connect(comp).connect(ctx.destination);
    sfx = ctx.createGain();
    mus = ctx.createGain();
    amb = ctx.createGain();
    sfx.connect(master);
    mus.connect(master);
    amb.connect(master);
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
  mus.gain.setValueAtTime(paused ? vol.music * 0.08 : vol.music * 0.32, t);
  amb.gain.setValueAtTime(paused ? 0 : vol.sfx * 0.5, t);
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
function burst({ dur = 0.12, freq = 1200, q = 1, type = "bandpass", gain = 0.25, when = 0, sweep = null, bus = sfx, attack = 0.005 }) {
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
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.02);
}
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/* ------------------------------------------------------------------ music */
const MOODS = {
  menu: { scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 6], lead: "triangle", bass: "sawtooth", drums: 1, arp: 1 },
  downtown: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3, 0, 4, 1, 4], lead: "square", bass: "sawtooth", drums: 2, arp: 1 },
  industrial: { scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 0, 5, 6, 0, 3, 6, 4], lead: "sawtooth", bass: "square", drums: 3, arp: 2 },
  coastal: { scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 5, 1, 4, 0, 5, 3, 4], lead: "triangle", bass: "triangle", drums: 2, arp: 1 },
  neon: { scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 4, 0, 5, 3, 4], lead: "sawtooth", bass: "square", drums: 4, arp: 3 },
  fortress: { scale: [0, 1, 3, 5, 7, 8, 11], prog: [0, 6, 5, 4, 0, 6, 3, 4], lead: "sawtooth", bass: "sawtooth", drums: 4, arp: 2 },
  boss: { scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 0, 5, 4, 0, 0, 6, 4], lead: "sawtooth", bass: "square", drums: 5, arp: 3 },
  final: { scale: [0, 1, 3, 5, 7, 8, 11], prog: [0, 6, 5, 4, 0, 6, 3, 1], lead: "sawtooth", bass: "sawtooth", drums: 5, arp: 3 },
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
    if (r() < 0.32) motif.push(null);
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
  const key = 52 + (cfg.key || 0);
  const bar = Math.floor(i / 16);
  const s = i % 16;
  const chordDeg = M.prog[bar % M.prog.length];
  const sc = M.scale;
  const note = (deg, oct = 0) => key + sc[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + oct);
  const when = t - ctx.currentTime;
  const duck = ctx.currentTime < duckUntil ? 0.22 : 1;
  // driving bass: eighths with a syncopated push
  if (s % 2 === 0 || s === 7 || s === 15) {
    const oct = s % 4 === 2 ? -1 : -2;
    tone({ f: hz(note(chordDeg, oct)), dur: spb * 1.6, type: M.bass, gain: 0.1 * duck, when, bus: mus });
  }
  if (M.arp) {
    const pat = M.arp === 3 ? [0, 2, 4, 7, 4, 2, 0, 4] : M.arp === 2 ? [0, 4, 2, 4] : [0, 2, 4, 2];
    if (s % 2 === 1 || M.arp === 3) {
      const a = pat[(s >> (M.arp === 3 ? 0 : 1)) % pat.length];
      tone({ f: hz(note(chordDeg + a, 0)), dur: spb * 0.9, type: "triangle", gain: 0.032 * duck, when, bus: mus });
    }
  }
  if (s === 0) {
    for (const k of [0, 2, 4]) tone({ f: hz(note(chordDeg + k, -1)), dur: spb * 15, type: "sine", gain: 0.026 * duck, attack: 0.1, when, bus: mus });
  }
  let m = melody[i % melody.length];
  if (m != null && bar % 8 >= 2) {
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
    tone({ f: hz(note(m, 1)), dur: spb * 1.6, type: M.lead, gain: (M.lead === "sawtooth" ? 0.026 : M.lead === "square" ? 0.03 : 0.055) * duck, when, bus: mus, vib: M.lead === "triangle" ? 4 : 0 });
  }
  const d = M.drums;
  if (d) {
    const kick = d >= 4 ? s % 4 === 0 : s % 8 === 0 || s === 10;
    if (kick) tone({ f: 130, f2: 40, dur: 0.16, type: "sine", gain: 0.34 * duck, when, bus: mus });
    if (s % 8 === 4) burst({ dur: 0.14, freq: 1800, q: 0.7, gain: 0.14 * duck, when, bus: mus });
    if (s % 2 === 1 || d >= 4) burst({ dur: 0.03, freq: 9000, q: 1, type: "highpass", gain: 0.04 * duck, when, bus: mus });
    if (d === 3 && s % 4 === 3) tone({ f: 220, f2: 180, dur: 0.06, type: "square", gain: 0.03 * duck, when, bus: mus });
    if (d === 5 && (s === 6 || s === 14)) burst({ dur: 0.08, freq: 600, q: 2, gain: 0.08 * duck, when, bus: mus });
  }
}

const JINGLES = {
  complete: { bpm: 150, notes: [[0, 1], [4, 1], [7, 1], [12, 2], [null, 1], [11, 1], [12, 1], [14, 1], [16, 4]] },
  fail: { bpm: 90, notes: [[7, 1], [5, 1], [3, 1], [2, 2], [null, 1], [0, 1], [-5, 4]] },
  boss: { bpm: 140, notes: [[0, 1], [12, 1], [11, 1], [7, 1], [6, 2], [0, 4]] },
  start: { bpm: 160, notes: [[0, 1], [7, 1], [12, 2], [16, 3]] },
  unlock: { bpm: 180, notes: [[0, 1], [4, 1], [7, 1], [12, 1], [7, 1], [12, 3]] },
};
function playJingle(name) {
  const J = JINGLES[name];
  if (!J || !live()) return;
  const spb = 60 / J.bpm / 2;
  let t = 0.03;
  const root = 62;
  for (const [n, len] of J.notes) {
    if (n != null) {
      tone({ f: hz(root + n), dur: spb * len * 1.1, type: "square", gain: 0.07, when: t });
      tone({ f: hz(root + n - 12), dur: spb * len, type: "triangle", gain: 0.09, when: t });
    }
    t += spb * len;
  }
  duckUntil = ctx.currentTime + t + 0.3;
}

function startTimer() {
  if (timer || !ctx) return;
  nextT = Math.max(nextT, ctx.currentTime + 0.05);
  timer = setInterval(() => {
    scheduleMusic();
    ambienceTick();
  }, 40);
}
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
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
  f.type = kind === "wind" ? "lowpass" : "bandpass";
  f.frequency.value = kind === "wind" ? 600 : 420;
  if (kind !== "wind") f.Q.value = 0.4;
  s.connect(f).connect(g).connect(kind === "wind" ? sfx : amb);
  s.start();
  return { s, g, f };
}
function stopSrc(s, ms = 300) {
  setTimeout(() => {
    try {
      s.stop();
    } catch {
      /* stopped */
    }
  }, ms);
}

/** city bed: filtered traffic rumble (+ rain for neon / storm), occasional distant horn */
function ambienceTick() {
  if (!live() || !ambKind || paused) return;
  if (!ambNodes) {
    const l = startLoop("amb");
    if (!l) return;
    ambNodes = l;
    const wet = ambKind === "neon" || ambKind === "fortress";
    l.f.frequency.value = wet ? 2400 : 380;
    l.f.Q.value = wet ? 0.3 : 0.5;
    l.g.gain.setTargetAtTime(wet ? 0.05 : 0.07, ctx.currentTime, 0.6);
  }
  hornT -= 0.04;
  if (hornT <= 0) {
    hornT = 5 + Math.random() * 9;
    if (ambKind === "coastal") tone({ f: 330, f2: 320, dur: 0.9, type: "sine", gain: 0.02, bus: amb, attack: 0.2 }); // gull-ish / buoy bell
    else if (ambKind === "industrial") burst({ dur: 0.5, freq: 300, q: 4, gain: 0.04, bus: amb });
    else {
      const f = 380 + Math.random() * 90;
      tone({ f, dur: 0.35, type: "sawtooth", gain: 0.012, bus: amb, attack: 0.02 });
      tone({ f: f * 1.26, dur: 0.35, type: "sawtooth", gain: 0.01, bus: amb, attack: 0.02 });
    }
  }
}

/* ------------------------------------------------------------------ public api */
export const sound = {
  unlock() {
    const c = ac();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    unlocked = true;
    if ((cfg || ambKind) && !timer) startTimer();
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
    if (p) this.wind(0);
  },
  music(c) {
    const key = c ? `${c.mood}:${c.bpm}:${c.key}` : null;
    if (cfg && key === cfg.id) return;
    if (!c) {
      cfg = null;
      if (!ambKind) stopTimer();
      return;
    }
    cfg = { ...c, id: key, M: MOODS[c.mood] || MOODS.downtown };
    melody = seededMelody((c.key + 5) * 37 + c.bpm + c.mood.length * 11, 8, 7);
    step16 = 0;
    if (ctx) nextT = ctx.currentTime + 0.1;
    if (unlocked) startTimer();
  },
  ambience(kind) {
    if (kind === ambKind) return;
    ambKind = kind || null;
    if (ambNodes) {
      ambNodes.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
      stopSrc(ambNodes.s, 600);
      ambNodes = null;
    }
    if (ambKind && unlocked) startTimer();
  },
  jingle(name) {
    playJingle(name);
  },
  /** wind rush (0‥1) while swinging / falling fast */
  wind(k) {
    if (k > 0.05 && !windSrc && live()) {
      const l = startLoop("wind");
      if (!l) return;
      windSrc = l.s;
      windGain = l.g;
      windFilter = l.f;
    }
    if (windSrc && ctx) {
      windGain.gain.setTargetAtTime(Math.min(0.14, k * 0.14), ctx.currentTime, 0.1);
      windFilter.frequency.setTargetAtTime(350 + k * 1900, ctx.currentTime, 0.1);
      if (k <= 0.05) {
        windGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
        stopSrc(windSrc);
        windSrc = null;
      }
    }
  },

  /* -------- movement */
  step(speed) {
    if (!throttle("step", 90)) return;
    burst({ dur: 0.05, freq: 500 + speed * 25, q: 1.2, gain: 0.05 + Math.min(0.05, speed * 0.003) });
    tone({ f: 90, f2: 60, dur: 0.05, type: "sine", gain: 0.05 });
  },
  jump() {
    burst({ dur: 0.12, freq: 900, sweep: 2400, q: 0.8, gain: 0.07 });
    tone({ f: 180, f2: 320, dur: 0.1, type: "triangle", gain: 0.05 });
  },
  doubleJump() {
    burst({ dur: 0.22, freq: 600, sweep: 3200, q: 1, gain: 0.08 });
    tone({ f: 260, f2: 520, dur: 0.16, type: "triangle", gain: 0.05 });
  },
  land(impact) {
    if (!throttle("land", 120)) return;
    const k = Math.min(1, impact / 30);
    tone({ f: 120, f2: 45, dur: 0.12 + k * 0.1, type: "sine", gain: 0.12 + k * 0.18 });
    burst({ dur: 0.08 + k * 0.12, freq: 700, q: 0.8, gain: 0.05 + k * 0.1 });
  },
  vault() {
    burst({ dur: 0.1, freq: 1400, q: 1.5, gain: 0.05 });
  },
  wallRun() {
    burst({ dur: 0.25, freq: 1200, sweep: 600, q: 1.5, gain: 0.05 });
  },

  /* -------- web */
  thwip() {
    if (!throttle("thwip", 60)) return;
    burst({ dur: 0.09, freq: 5200, sweep: 1600, q: 3, gain: 0.16, attack: 0.002 });
    burst({ dur: 0.05, freq: 900, q: 2, gain: 0.06, when: 0.01 });
  },
  webAttach() {
    burst({ dur: 0.07, freq: 6200, sweep: 2000, q: 3, gain: 0.15, attack: 0.002 });
    tone({ f: 140, f2: 210, dur: 0.18, type: "triangle", gain: 0.06, when: 0.05 });
  },
  webRelease(speed) {
    burst({ dur: 0.25, freq: 800 + speed * 30, sweep: 300, q: 0.8, gain: 0.05 + Math.min(0.06, speed * 0.002) });
  },
  webSplat() {
    if (!throttle("splat", 80)) return;
    burst({ dur: 0.08, freq: 2400, q: 1.6, gain: 0.07 });
  },
  webbed() {
    burst({ dur: 0.25, freq: 3000, sweep: 900, q: 2, gain: 0.1 });
  },
  zip() {
    burst({ dur: 0.3, freq: 3500, sweep: 700, q: 1.2, gain: 0.12 });
  },
  shield() {
    tone({ f: 330, f2: 660, dur: 0.3, type: "triangle", gain: 0.08 });
    burst({ dur: 0.3, freq: 4000, q: 2, gain: 0.05 });
  },
  shieldBlock() {
    tone({ f: 900, f2: 600, dur: 0.12, type: "triangle", gain: 0.1 });
  },
  burstAbility() {
    burst({ dur: 0.45, freq: 2600, sweep: 500, q: 0.9, gain: 0.16 });
    tone({ f: 110, f2: 55, dur: 0.3, type: "sine", gain: 0.2 });
  },
  storm() {
    tone({ f: 110, f2: 440, dur: 0.55, type: "sawtooth", gain: 0.06 });
    burst({ dur: 0.6, freq: 800, sweep: 5000, q: 0.8, gain: 0.12 });
  },
  stormHit() {
    tone({ f: 80, f2: 35, dur: 0.5, type: "sine", gain: 0.34 });
    burst({ dur: 0.6, freq: 3000, sweep: 400, q: 0.6, gain: 0.22 });
  },

  /* -------- combat */
  whoosh() {
    if (!throttle("whoosh", 70)) return;
    burst({ dur: 0.12, freq: 1600, sweep: 500, q: 1.1, gain: 0.06 });
  },
  punch(heavy) {
    tone({ f: heavy ? 110 : 150, f2: heavy ? 40 : 60, dur: heavy ? 0.18 : 0.1, type: "sine", gain: heavy ? 0.32 : 0.24 });
    burst({ dur: heavy ? 0.12 : 0.07, freq: heavy ? 900 : 1500, q: 1, gain: heavy ? 0.2 : 0.14 });
  },
  kick() {
    tone({ f: 120, f2: 45, dur: 0.15, type: "sine", gain: 0.3 });
    burst({ dur: 0.1, freq: 1100, q: 1, gain: 0.17 });
  },
  finisher() {
    tone({ f: 90, f2: 30, dur: 0.4, type: "sine", gain: 0.4 });
    burst({ dur: 0.3, freq: 600, q: 0.7, gain: 0.25 });
  },
  blocked() {
    tone({ f: 1400, f2: 1100, dur: 0.08, type: "square", gain: 0.06 });
    burst({ dur: 0.06, freq: 5000, q: 3, gain: 0.08 });
  },
  dodge() {
    burst({ dur: 0.16, freq: 2200, sweep: 700, q: 1, gain: 0.07 });
  },
  perfectDodge() {
    tone({ f: 880, f2: 1320, dur: 0.18, type: "triangle", gain: 0.09 });
    burst({ dur: 0.2, freq: 3000, sweep: 900, q: 1, gain: 0.07 });
  },
  hurt() {
    tone({ f: 220, f2: 110, dur: 0.18, type: "sawtooth", gain: 0.07 });
    tone({ f: 100, f2: 50, dur: 0.15, type: "sine", gain: 0.25 });
  },
  heroDown() {
    tone({ f: 330, f2: 80, dur: 0.9, type: "sawtooth", gain: 0.08 });
  },
  /** enemy grunt — pitch varies by archetype */
  grunt(kind) {
    if (!throttle("grunt", 90)) return;
    const base = kind === "bruiser" ? 95 : kind === "assassin" ? 190 : kind === "drone" ? 520 : 140;
    if (kind === "drone") {
      tone({ f: base, f2: base * 0.6, dur: 0.12, type: "square", gain: 0.04 });
      return;
    }
    tone({ f: base * (0.9 + Math.random() * 0.25), f2: base * 0.7, dur: 0.16, type: "sawtooth", gain: 0.05, vib: 6 });
  },
  enemyDown(kind) {
    if (kind === "drone") {
      burst({ dur: 0.4, freq: 1400, sweep: 200, q: 1, gain: 0.14 });
      return;
    }
    tone({ f: 160, f2: 70, dur: 0.35, type: "sawtooth", gain: 0.05, vib: 4 });
    tone({ f: 70, f2: 40, dur: 0.2, type: "sine", gain: 0.18, when: 0.18 });
  },
  alert() {
    if (!throttle("alert", 250)) return;
    tone({ f: 660, dur: 0.07, type: "square", gain: 0.04 });
    tone({ f: 880, dur: 0.09, type: "square", gain: 0.04, when: 0.08 });
  },
  telegraph() {
    if (!throttle("tele", 120)) return;
    tone({ f: 1200, f2: 900, dur: 0.07, type: "triangle", gain: 0.035 });
  },
  shoot(kind) {
    if (!throttle("shoot", 60)) return;
    if (kind === "drone") tone({ f: 1400, f2: 500, dur: 0.12, type: "square", gain: 0.04 });
    else burst({ dur: 0.08, freq: 2400, q: 0.8, gain: 0.12 });
  },
  slam() {
    tone({ f: 70, f2: 30, dur: 0.45, type: "sine", gain: 0.4 });
    burst({ dur: 0.4, freq: 400, q: 0.6, gain: 0.2 });
  },
  explosion() {
    tone({ f: 90, f2: 28, dur: 0.6, type: "sine", gain: 0.36 });
    burst({ dur: 0.5, freq: 900, sweep: 200, q: 0.5, gain: 0.24 });
  },
  zap() {
    burst({ dur: 0.18, freq: 4200, sweep: 1200, q: 4, gain: 0.08 });
    tone({ f: 60, dur: 0.18, type: "sawtooth", gain: 0.05 });
  },
  laser() {
    tone({ f: 220, f2: 180, dur: 0.6, type: "sawtooth", gain: 0.05, vib: 20 });
  },

  /* -------- mission / ui */
  heal() {
    tone({ f: 523, dur: 0.1, type: "triangle", gain: 0.08 });
    tone({ f: 784, dur: 0.16, type: "triangle", gain: 0.08, when: 0.08 });
  },
  token() {
    tone({ f: 988, dur: 0.08, type: "square", gain: 0.05 });
    tone({ f: 1319, dur: 0.18, type: "square", gain: 0.05, when: 0.07 });
    tone({ f: 1976, dur: 0.22, type: "triangle", gain: 0.04, when: 0.14 });
  },
  objective() {
    tone({ f: 587, dur: 0.1, type: "triangle", gain: 0.07 });
    tone({ f: 880, dur: 0.18, type: "triangle", gain: 0.07, when: 0.1 });
  },
  rescued() {
    for (const [i, f] of [523, 659, 784, 1047].entries()) tone({ f, dur: 0.14, type: "triangle", gain: 0.07, when: i * 0.07 });
  },
  disabled() {
    tone({ f: 880, f2: 220, dur: 0.35, type: "square", gain: 0.05 });
  },
  bossHit() {
    if (!throttle("bossHit", 70)) return;
    tone({ f: 200, f2: 90, dur: 0.14, type: "square", gain: 0.06 });
  },
  bossRoar() {
    tone({ f: 90, f2: 60, dur: 0.9, type: "sawtooth", gain: 0.08, vib: 8 });
    burst({ dur: 0.8, freq: 500, q: 0.7, gain: 0.08 });
  },
  uiMove() {
    if (!throttle("ui", 40)) return;
    tone({ f: 1200, dur: 0.03, type: "triangle", gain: 0.03 });
  },
  uiClick() {
    tone({ f: 900, dur: 0.05, type: "triangle", gain: 0.06 });
    tone({ f: 1350, dur: 0.06, type: "triangle", gain: 0.05, when: 0.04 });
  },
  denied() {
    tone({ f: 220, f2: 160, dur: 0.16, type: "square", gain: 0.05 });
  },
  pause() {
    tone({ f: 660, f2: 440, dur: 0.1, type: "triangle", gain: 0.05 });
  },
  dispose() {
    stopTimer();
    this.wind(0);
    this.ambience(null);
    cfg = null;
  },
};
