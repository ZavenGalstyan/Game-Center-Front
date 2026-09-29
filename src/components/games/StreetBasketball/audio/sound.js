/**
 * Street Basketball — WebAudio synth (no audio files, no libraries).
 *
 * Buses: sfx / crowd / music → master. `setEnabled(on)` (Sound && !Mute)
 * gates sfx + crowd; `setMusic(on)` gates the music loop. Both cut to silence
 * IMMEDIATELY (no fade tail after Mute). `dispose()` stops every scheduler
 * so nothing keeps playing after leaving the game or stacks across restarts.
 *
 * Every ball sound is triggered by a real engine collision event (floor /
 * rim / board / net), so the sound always matches what physically happened:
 * no rim clang on an airball, no swish off the glass.
 */
let ctx = null;
let master = null;
let sfxBus = null;
let crowdBus = null;
let musicBus = null;
let enabled = false;
let musicOn = false;
let noiseBuf = null;
let crowdSrc = null;
let crowdFilter = null;
let crowdBase = 0;
let musicTimer = null;
let musicStep = 0;
let nextNoteTime = 0;
let musicMode = "menu";
const last = {};

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = enabled ? 1 : 0;
      sfxBus.connect(master);
      crowdBus = ctx.createGain();
      crowdBus.gain.value = 0;
      crowdBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
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

const vary = (v, amt = 0.07) => v * (1 + (Math.random() * 2 - 1) * amt);

/** Rate-limit: don't stack the same sound within `ms`. */
function gate(key, ms) {
  const now = performance.now();
  if (last[key] && now - last[key] < ms) return false;
  last[key] = now;
  return true;
}

function tone(freq, dur, { type = "sine", gain = 0.2, slide = null, delay = 0, attack = 0.004, bus = null } = {}) {
  const a = ac();
  if (!a || !enabled) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(bus || sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function burst(dur, { gain = 0.2, lp = 2000, hp = 0, bp = null, q = 1, delay = 0, sweepTo = null, bus = null, attack = 0.003 } = {}) {
  const a = ac();
  if (!a || !enabled) return;
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noise();
  const off = Math.random() * 1.5;
  let node = src;
  const f = a.createBiquadFilter();
  if (bp) {
    f.type = "bandpass";
    f.frequency.setValueAtTime(bp, t0);
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  } else {
    f.type = "lowpass";
    f.frequency.setValueAtTime(lp, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  }
  node = node.connect(f);
  if (hp > 0) {
    const h = a.createBiquadFilter();
    h.type = "highpass";
    h.frequency.value = hp;
    node = node.connect(h);
  }
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g).connect(bus || sfxBus);
  src.start(t0, off, dur + 0.05);
}

export const sound = {
  unlock() {
    ac();
  },
  setEnabled(on) {
    enabled = on;
    const a = ctx;
    if (!a) return;
    const t = a.currentTime;
    sfxBus.gain.cancelScheduledValues(t);
    sfxBus.gain.setValueAtTime(on ? 1 : 0, t);
    crowdBus.gain.cancelScheduledValues(t);
    crowdBus.gain.setValueAtTime(on ? crowdBase : 0, t);
  },
  setMusic(on, mode = "menu") {
    musicOn = on;
    musicMode = mode;
    const a = on ? ac() : ctx;
    if (!a) return;
    const t = a.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(on ? (mode === "menu" ? 0.16 : 0.07) : 0, t);
    if (on && !musicTimer) {
      nextNoteTime = a.currentTime + 0.1;
      musicTimer = setInterval(scheduleMusic, 90);
    } else if (!on && musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  },

  /* ---- ball ---- */
  bounce(speed = 3, dribble = false) {
    if (!enabled || !gate("bounce", 45)) return;
    const v = Math.min(1, speed / 7);
    const g = (dribble ? 0.32 : 0.42) * (0.35 + v * 0.65);
    tone(vary(dribble ? 118 : 105, 0.05), 0.14, { type: "sine", gain: g, slide: 52 });
    burst(0.05, { gain: g * 0.55, lp: 1400 });
    tone(vary(330), 0.05, { type: "triangle", gain: g * 0.12 });
  },
  rim(side = "front", speed = 3) {
    if (!enabled || !gate("rim", 60)) return;
    const v = Math.min(1, speed / 6);
    const base = side === "back" ? 540 : side === "side" ? 610 : 580;
    const g = 0.12 + v * 0.22;
    for (const [mul, gg, dur] of [[1, 1, 0.5], [2.02, 0.55, 0.35], [2.97, 0.32, 0.25], [4.1, 0.18, 0.18]]) {
      tone(vary(base * mul, 0.02), dur * (0.6 + v * 0.6), { type: "sine", gain: g * gg, attack: 0.002 });
    }
    burst(0.06, { gain: g * 0.7, bp: 2600, q: 2 });
  },
  board(speed = 3) {
    if (!enabled || !gate("board", 60)) return;
    const v = Math.min(1, speed / 7);
    const g = 0.18 + v * 0.3;
    tone(vary(150), 0.16, { type: "triangle", gain: g, slide: 90 });
    burst(0.12, { gain: g * 0.8, bp: 700, q: 1.3 });
    // bracket rattle
    burst(0.2, { gain: g * 0.2, bp: 3400, q: 6, delay: 0.02 });
  },
  pole() {
    if (!enabled || !gate("pole", 80)) return;
    tone(260, 0.4, { type: "sine", gain: 0.12 });
    tone(640, 0.25, { type: "sine", gain: 0.06 });
  },
  swish() {
    if (!enabled || !gate("swish", 150)) return;
    burst(0.34, { gain: 0.26, bp: 4200, q: 0.8, sweepTo: 1300, attack: 0.02 });
    burst(0.22, { gain: 0.08, lp: 900, delay: 0.05 });
  },
  net() {
    if (!enabled || !gate("net", 150)) return;
    burst(0.22, { gain: 0.14, bp: 2600, q: 0.9, sweepTo: 1100, attack: 0.015 });
  },
  squeak(vol = 1) {
    if (!enabled || !gate("squeak", 120)) return;
    const f = vary(2500, 0.12);
    tone(f, 0.09, { type: "sine", gain: 0.05 * vol, slide: f * 1.35, attack: 0.006 });
    tone(f * 2, 0.07, { type: "sine", gain: 0.015 * vol, slide: f * 2.6 });
  },
  crossover() {
    if (!enabled) return;
    burst(0.12, { gain: 0.08, bp: 900, q: 0.7, sweepTo: 2400 });
  },
  steal() {
    if (!enabled) return;
    burst(0.07, { gain: 0.35, lp: 3000, hp: 300 });
    tone(220, 0.1, { type: "triangle", gain: 0.12, slide: 140 });
  },
  stealWhiff() {
    if (!enabled) return;
    burst(0.1, { gain: 0.06, bp: 1500, q: 0.8, sweepTo: 600 });
  },
  block() {
    if (!enabled) return;
    burst(0.06, { gain: 0.45, lp: 2400, hp: 200 });
    tone(120, 0.18, { type: "sine", gain: 0.3, slide: 60 });
  },
  dunk() {
    if (!enabled) return;
    this.rim("front", 7);
    tone(80, 0.3, { type: "sine", gain: 0.4, slide: 45, delay: 0.01 });
    burst(0.35, { gain: 0.16, bp: 3200, q: 5, delay: 0.03 });
  },
  land(hard = false) {
    if (!enabled || !gate("land", 90)) return;
    tone(hard ? 75 : 95, 0.12, { type: "sine", gain: hard ? 0.26 : 0.14, slide: 45 });
    burst(0.05, { gain: hard ? 0.14 : 0.06, lp: 800 });
  },
  step(speed) {
    if (!enabled || !gate("step", 110)) return;
    burst(0.035, { gain: 0.02 + Math.min(0.03, speed * 0.004), lp: 1100, hp: 150 });
  },
  score(points = 1) {
    if (!enabled) return;
    tone(880, 0.12, { type: "triangle", gain: 0.08 });
    tone(points === 2 ? 1318 : 1175, 0.2, { type: "triangle", gain: 0.08, delay: 0.08 });
  },
  perfect() {
    if (!enabled) return;
    tone(1568, 0.16, { type: "sine", gain: 0.09 });
    tone(2349, 0.22, { type: "sine", gain: 0.06, delay: 0.05 });
  },
  whistle() {
    if (!enabled) return;
    const a = ac();
    if (!a) return;
    for (const [d, dur] of [[0, 0.12], [0.16, 0.34]]) {
      const t0 = a.currentTime + d;
      const o = a.createOscillator();
      const lfo = a.createOscillator();
      const lg = a.createGain();
      const g = a.createGain();
      o.type = "square";
      o.frequency.value = 2900;
      lfo.frequency.value = 38;
      lg.gain.value = 120;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(sfxBus);
      o.start(t0);
      lfo.start(t0);
      o.stop(t0 + dur + 0.02);
      lfo.stop(t0 + dur + 0.02);
    }
  },
  win() {
    if (!enabled) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { type: "triangle", gain: 0.1, delay: i * 0.11 }));
    tone(1319, 0.6, { type: "triangle", gain: 0.08, delay: 0.46 });
  },
  loss() {
    if (!enabled) return;
    [392, 349, 294].forEach((f, i) => tone(f, 0.4, { type: "triangle", gain: 0.09, delay: i * 0.18 }));
  },
  ui() {
    if (!enabled || !gate("ui", 40)) return;
    tone(660, 0.05, { type: "triangle", gain: 0.05, slide: 820 });
  },
  unlock2() {
    if (!enabled) return;
    [784, 988, 1175].forEach((f, i) => tone(f, 0.25, { type: "sine", gain: 0.07, delay: i * 0.08 }));
  },

  /* ---- crowd ---- */
  crowd(level) {
    const a = level > 0 ? ac() : ctx;
    crowdBase = level;
    if (!a) return;
    if (level > 0 && !crowdSrc) {
      crowdSrc = a.createBufferSource();
      crowdSrc.buffer = noise();
      crowdSrc.loop = true;
      crowdFilter = a.createBiquadFilter();
      crowdFilter.type = "bandpass";
      crowdFilter.frequency.value = 700;
      crowdFilter.Q.value = 0.5;
      crowdSrc.connect(crowdFilter).connect(crowdBus);
      crowdSrc.start();
    }
    const t = a.currentTime;
    crowdBus.gain.cancelScheduledValues(t);
    crowdBus.gain.setTargetAtTime(enabled ? level : 0, t, 0.3);
  },
  /** A swell for big plays; returns to the bed. */
  cheer(intensity = 1) {
    const a = ctx;
    if (!a || !enabled || !crowdSrc) return;
    const t = a.currentTime;
    const peak = Math.min(0.5, crowdBase + 0.12 * intensity);
    crowdBus.gain.cancelScheduledValues(t);
    crowdBus.gain.setTargetAtTime(peak, t, 0.05);
    crowdBus.gain.setTargetAtTime(crowdBase, t + 0.5 + intensity * 0.4, 0.5);
    crowdFilter.frequency.setTargetAtTime(1100, t, 0.05);
    crowdFilter.frequency.setTargetAtTime(700, t + 0.6, 0.4);
  },
  ooh() {
    const a = ctx;
    if (!a || !enabled) return;
    tone(260, 0.5, { type: "sawtooth", gain: 0.02, slide: 200, bus: crowdBus, attack: 0.08 });
    this.cheer(0.6);
  },

  dispose() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    musicOn = false;
    if (crowdSrc) {
      try {
        crowdSrc.stop();
      } catch {
        /* already stopped */
      }
      crowdSrc.disconnect();
      crowdSrc = null;
    }
    if (ctx) {
      const t = ctx.currentTime;
      musicBus.gain.setValueAtTime(0, t);
      crowdBus.gain.setValueAtTime(0, t);
    }
    crowdBase = 0;
  },
};

/* ---------------------------------------------------------------- music */
// A laid-back original street beat: 90 BPM, kick/snare/hat + bass + keys.
const BPM = 90;
const BASS = [41, 41, 0, 41, 44, 0, 46, 0, 39, 39, 0, 39, 41, 0, 36, 0];
const CHORDS = [[65, 68, 72], [63, 67, 70], [61, 65, 68], [63, 66, 70]];
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

function scheduleMusic() {
  if (!ctx || !musicOn) return;
  const spb = 60 / BPM / 4; // 16th notes
  while (nextNoteTime < ctx.currentTime + 0.25) {
    const s = musicStep % 16;
    const bar = Math.floor(musicStep / 16) % 4;
    const t = nextNoteTime;
    const swing = s % 2 ? spb * 0.18 : 0;
    // kick
    if (s === 0 || s === 7 || s === 10) mTone(t, 58, 0.22, "sine", 0.55, 34);
    // snare
    if (s === 4 || s === 12) mNoise(t, 0.16, 0.3, 1800);
    // hats
    if (s % 2 === 0 || musicMode === "game") mNoise(t + swing, 0.03, s % 4 === 2 ? 0.1 : 0.05, 9000, 6000);
    // bass
    const b = BASS[s];
    if (b) mTone(t + swing, midi(b), spb * 1.8, "triangle", 0.22);
    // keys on bar starts
    if (s === 0 || s === 8) CHORDS[bar].forEach((n) => mTone(t, midi(n), spb * 6, "sine", 0.045));
    nextNoteTime += spb;
    musicStep++;
  }
}

function mTone(t, f, dur, type, gain, slideTo) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function mNoise(t, dur, gain, lp, hp = 0) {
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  let node = src.connect(f);
  if (hp) {
    const h = ctx.createBiquadFilter();
    h.type = "highpass";
    h.frequency.value = hp;
    node = node.connect(h);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  node.connect(g).connect(musicBus);
  src.start(t, Math.random(), dur + 0.02);
}
