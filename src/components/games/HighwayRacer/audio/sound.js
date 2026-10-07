/**
 * Highway Racer — WebAudio synth (no audio files, no libraries).
 *
 * Buses: engine / sfx / music → master → compressor → speakers.
 *   - Settings volumes: sound (master), music, sfx (engine rides the sfx bus).
 *   - Game Center Mute: master gain → 0 immediately. Every sound (engine,
 *     boost, traffic, UI, music, anything created later) routes through
 *     master, so nothing slips past the mute and there's no second mute state.
 *   - stopAll(): ends the engine loop and music (pause, result, screen
 *     change, unmount) so nothing stacks across restarts or fullscreen.
 */
let ctx = null;
let master = null;
let sfxBus = null;
let musBus = null;
let noiseBuf = null;
let muted = false;
let vol = { sound: 0.8, music: 0.45, sfx: 0.9 };
const last = {};
let engine = null;
let musicTimer = null;
let musicMode = null;
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
    comp.threshold.value = -12;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    musBus = ctx.createGain();
    sfxBus.connect(master);
    musBus.connect(master);
    apply();
  }
  return ctx;
}
function apply() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(muted ? 0 : vol.sound, t);
  sfxBus.gain.setValueAtTime(vol.sfx, t);
  musBus.gain.setValueAtTime(vol.music * 0.5, t);
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
const ready = () => ctx && ctx.state === "running" && !muted;
function gate(name, ms) {
  const now = performance.now();
  if (last[name] && now - last[name] < ms) return false;
  last[name] = now;
  return true;
}
function nz({ dur = 0.1, f = 1200, q = 1, type = "bandpass", gain = 0.3, at = 0.004, sweep = null, when = 0, bus = sfxBus }) {
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource();
  s.buffer = noise();
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(30, sweep), t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(bus);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}
function tn({ f = 440, f2 = null, dur = 0.2, type = "sine", gain = 0.2, at = 0.005, when = 0, bus = sfxBus }) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/* ------------------------------------------------------------------ music */
// a soft synthwave loop: Am – F – C – G, bass on eighths, pad on bars
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
function scheduleMusic() {
  if (!ctx || !musicMode) return;
  const spb = musicMode === "game" ? 0.25 : 0.32; // seconds per eighth
  while (nextT < ctx.currentTime + 0.3) {
    const bar = Math.floor(step / 8) % 4;
    const chord = CHORDS[bar];
    const t = nextT;
    const when = Math.max(0, t - ctx.currentTime);
    // bass
    const bassNote = chord[0] - 24 + (step % 8 === 6 ? 7 : 0);
    tn({ f: midi(bassNote), dur: spb * 0.9, type: "triangle", gain: musicMode === "game" ? 0.16 : 0.12, when, bus: musBus, at: 0.01 });
    if (step % 8 === 0) {
      for (const n of chord) tn({ f: midi(n), dur: spb * 7.5, type: "sine", gain: 0.035, when, bus: musBus, at: 0.3 });
    }
    // light arpeggio in game mode
    if (musicMode === "game" && step % 2 === 1) tn({ f: midi(chord[(step >> 1) % 3] + 12), dur: spb * 0.6, type: "square", gain: 0.012, when, bus: musBus });
    // soft hats
    if (musicMode === "game" && step % 2 === 0) nz({ dur: 0.04, f: 8000, q: 0.8, type: "highpass", gain: 0.02, when, bus: musBus });
    step++;
    nextT += spb;
  }
}

export const sound = {
  unlock() {
    const a = ac();
    if (a && a.state === "suspended") a.resume().catch(() => {});
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    apply();
  },
  setMuted(m) {
    muted = !!m;
    apply();
  },
  get muted() {
    return muted;
  },
  /** live gain snapshot for tests */
  inspect() {
    return {
      state: ctx ? ctx.state : "none",
      master: master ? master.gain.value : null,
      muted,
      music: musicMode,
      engine: !!engine,
    };
  },

  /* ---------------- music */
  music(mode) {
    if (mode === musicMode) return;
    musicMode = mode;
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    if (!mode || !ac()) return;
    step = 0;
    nextT = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 90);
    scheduleMusic();
  },

  /* ---------------- engine loop */
  engineStart() {
    if (engine || !ac()) return;
    const t = ctx.currentTime;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "sawtooth";
    o2.type = "square";
    const n = ctx.createBufferSource();
    n.buffer = noise();
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 900;
    nf.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    lp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(sfxBus);
    n.connect(nf).connect(ng).connect(sfxBus);
    o1.frequency.value = 55;
    o2.frequency.value = 27.5;
    o1.start(t);
    o2.start(t);
    n.start(t);
    engine = { o1, o2, n, lp, g, ng, nf };
  },
  /** speed m/s, boosting, crashed */
  engineUpdate(v, boosting, idle) {
    if (!engine || !ctx) return;
    const t = ctx.currentTime;
    // a little "gear" sawtooth on top of a speed ramp so it doesn't drone
    const gear = (v % 14) / 14;
    const f = idle ? 48 : 58 + v * 1.55 + gear * 22 + (boosting ? 26 : 0);
    engine.o1.frequency.setTargetAtTime(f, t, 0.08);
    engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    engine.lp.frequency.setTargetAtTime(380 + v * 16 + (boosting ? 900 : 0), t, 0.1);
    engine.ng.gain.setTargetAtTime(Math.min(0.06, v * 0.0009) + (boosting ? 0.05 : 0), t, 0.15);
    engine.nf.frequency.setTargetAtTime(500 + v * 18, t, 0.2);
  },
  engineStop() {
    if (!engine || !ctx) return;
    const t = ctx.currentTime;
    const e = engine;
    engine = null;
    e.g.gain.cancelScheduledValues(t);
    e.g.gain.setTargetAtTime(0.0001, t, 0.08);
    e.ng.gain.setTargetAtTime(0.0001, t, 0.08);
    for (const s of [e.o1, e.o2, e.n]) {
      try {
        s.stop(t + 0.4);
      } catch {
        /* already stopped */
      }
    }
  },
  stopAll() {
    this.engineStop();
    this.music(null);
  },

  /* ---------------- driving */
  lane(dir) {
    if (!ready() || !gate("lane", 70)) return;
    nz({ dur: 0.2, f: 1900, sweep: 900, q: 1.2, gain: 0.05, at: 0.02 });
    void dir;
  },
  pass(close) {
    if (!ready() || !gate("pass", 90)) return;
    nz({ dur: 0.38, f: close ? 900 : 650, sweep: 260, q: 0.9, gain: close ? 0.12 : 0.07, at: 0.05 });
  },
  near(combo) {
    if (!ready()) return;
    nz({ dur: 0.32, f: 1400, sweep: 500, q: 0.9, gain: 0.12, at: 0.02 });
    const base = 880 * Math.pow(2, (Math.min(combo, 4) - 1) * (2 / 12));
    tn({ f: base, dur: 0.16, gain: 0.08, type: "triangle" });
    tn({ f: base * 1.5, dur: 0.24, gain: 0.07, type: "triangle", when: 0.07 });
  },
  coin() {
    if (!ready() || !gate("coin", 45)) return;
    tn({ f: 1568, dur: 0.08, gain: 0.07, type: "square" });
    tn({ f: 2093, dur: 0.16, gain: 0.06, type: "square", when: 0.06 });
  },
  boost() {
    if (!ready()) return;
    nz({ dur: 0.9, f: 400, sweep: 3200, q: 0.8, gain: 0.16, at: 0.08, type: "bandpass" });
    tn({ f: 160, f2: 640, dur: 0.6, type: "sawtooth", gain: 0.05, at: 0.05 });
  },
  boostReady() {
    if (!ready() || !gate("bready", 500)) return;
    tn({ f: 988, dur: 0.12, gain: 0.06, type: "triangle" });
    tn({ f: 1319, dur: 0.22, gain: 0.06, type: "triangle", when: 0.09 });
  },
  boostPickup() {
    if (!ready()) return;
    [784, 988, 1175, 1568].forEach((f, i) => tn({ f, dur: 0.12, gain: 0.06, type: "triangle", when: i * 0.05 }));
  },
  crash() {
    if (!ready() || !gate("crash", 800)) return;
    nz({ dur: 0.7, f: 2400, sweep: 160, q: 0.6, type: "lowpass", gain: 0.55, at: 0.003 });
    tn({ f: 95, f2: 38, dur: 0.5, gain: 0.45, type: "sine", at: 0.003 });
    nz({ dur: 0.25, f: 3200, q: 3, gain: 0.18, at: 0.002, when: 0.03 });
    for (let i = 0; i < 6; i++) tn({ f: 2600 + Math.random() * 2400, dur: 0.12, gain: 0.03, type: "sine", when: 0.08 + Math.random() * 0.35 });
    // tyre skid
    nz({ dur: 0.9, f: 1100, sweep: 700, q: 6, gain: 0.08, at: 0.05, when: 0.05 });
  },
  count(n) {
    if (!ready()) return;
    tn({ f: 660, dur: 0.18, gain: 0.12, type: "square" });
    void n;
  },
  go() {
    if (!ready()) return;
    tn({ f: 1320, dur: 0.4, gain: 0.12, type: "square" });
    tn({ f: 660, dur: 0.4, gain: 0.06, type: "square" });
  },
  record() {
    if (!ready()) return;
    [523, 659, 784, 1047].forEach((f, i) => tn({ f, dur: 0.22, gain: 0.08, type: "triangle", when: i * 0.09 }));
  },

  /* ---------------- UI */
  ui() {
    if (!ready() || !gate("ui", 40)) return;
    tn({ f: 900, f2: 1200, dur: 0.06, gain: 0.05, type: "triangle" });
  },
  uiBack() {
    if (!ready() || !gate("ui", 40)) return;
    tn({ f: 700, f2: 480, dur: 0.07, gain: 0.05, type: "triangle" });
  },
  deny() {
    if (!ready() || !gate("deny", 120)) return;
    tn({ f: 180, dur: 0.16, gain: 0.08, type: "square" });
  },
  unlock() {
    if (!ready()) return;
    [659, 784, 988, 1319].forEach((f, i) => tn({ f, dur: 0.2, gain: 0.07, type: "triangle", when: i * 0.07 }));
  },

  dispose() {
    this.stopAll();
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
      master = sfxBus = musBus = null;
      noiseBuf = null;
    }
  },
};
