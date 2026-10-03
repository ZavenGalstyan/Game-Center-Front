/**
 * Lumberjack Life — WebAudio synth (no audio files, no libraries).
 *
 * Buses: sfx / ambience / music → master. Volumes come from Settings
 * (master, music, sfx); the Game Center Mute sets the master gain to 0
 * immediately (no tail). `stopLoops()` silences every continuous sound
 * (chainsaw, mill saw, conveyor, engine) — called on pause, menu, hidden tab
 * and unmount — and `dispose()` also stops schedulers, so nothing keeps
 * playing or stacks across restarts / fullscreen toggles.
 *
 * The AXE SWING (air whoosh, at the start of the strike) and AXE HIT (wood
 * thunk, only from the engine's hit event at the impact frame) are separate
 * sounds, so a miss never sounds like wood.
 */
let ctx = null;
let master = null;
let sfx = null;
let amb = null;
let mus = null;
let noiseBuf = null;
let muted = false;
let vol = { master: 0.85, music: 0.5, sfx: 0.9 };
const loops = {};
let ambTimer = null;
let musicTimer = null;
let musicOn = false;
let ambOn = false;
let musicStep = 0;
let nextNote = 0;
const lastPlay = {};

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
    comp.ratio.value = 3.5;
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
  amb.gain.setValueAtTime(vol.sfx * 0.7, t);
  mus.gain.setValueAtTime(vol.music * 0.35, t);
}

function noise() {
  if (!noiseBuf) {
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b = 0.97 * b + 0.03 * w; // a touch of brown for warmth
      d[i] = w * 0.7 + b * 2.2;
    }
  }
  return noiseBuf;
}

const ready = () => ctx && !muted && ctx.state === "running";
const vary = (v, a = 0.08) => v * (1 + (Math.random() * 2 - 1) * a);
function gate(key, ms) {
  const now = performance.now();
  if (lastPlay[key] && now - lastPlay[key] < ms) return false;
  lastPlay[key] = now;
  return true;
}

function env(g, t0, a, peak, d, end = 0.0001) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(end, t0 + a + d);
}

function tone(freq, dur, { type = "sine", gain = 0.2, slide = null, delay = 0, attack = 0.004, bus = sfx, pan = 0 } = {}) {
  if (!ready()) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
  const g = ctx.createGain();
  env(g, t0, attack, gain, dur);
  let out = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    out = p;
  }
  o.connect(g);
  out.connect(bus);
  o.start(t0);
  o.stop(t0 + attack + dur + 0.05);
}

function burst(dur, { gain = 0.3, type = "bandpass", freq = 1000, q = 1, slide = null, delay = 0, attack = 0.003, bus = sfx, pan = 0 } = {}) {
  if (!ready()) return;
  const t0 = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noise();
  s.playbackRate.value = vary(1, 0.1);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, attack, gain, dur);
  s.connect(f).connect(g);
  let out = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    out = p;
  }
  out.connect(bus);
  s.start(t0, Math.random() * 1.5);
  s.stop(t0 + attack + dur + 0.05);
}

/* ------------------------------------------------------------ continuous loops */
/**
 * A loop = noise + oscillators through filters into a gain we ramp. Created
 * lazily, reused, faded to 0 (never left running audible).
 */
function loop(name, build) {
  if (!ac()) return null;
  if (!loops[name]) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(sfx);
    loops[name] = { g, ...build(g) };
  }
  return loops[name];
}

function setLoop(name, level, rate = 0.08) {
  const L = loops[name];
  if (!L || !ctx) return;
  const t = ctx.currentTime;
  L.g.gain.cancelScheduledValues(t);
  L.g.gain.setTargetAtTime(Math.max(0, level), t, rate);
}

function buildChainsaw(g) {
  const o1 = ctx.createOscillator();
  o1.type = "sawtooth";
  o1.frequency.value = 95;
  const o2 = ctx.createOscillator();
  o2.type = "square";
  o2.frequency.value = 190;
  const ns = ctx.createBufferSource();
  ns.buffer = noise();
  ns.loop = true;
  const nf = ctx.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.value = 2400;
  nf.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.value = 0.0;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 1600;
  f.Q.value = 3;
  const mix = ctx.createGain();
  mix.gain.value = 0.25;
  o1.connect(f);
  o2.connect(f);
  f.connect(mix);
  ns.connect(nf).connect(ng).connect(mix);
  mix.connect(g);
  o1.start();
  o2.start();
  ns.start();
  return { o1, o2, f, ng, nodes: [o1, o2, ns] };
}

function buildMillSaw(g) {
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = 420;
  const o2 = ctx.createOscillator();
  o2.type = "triangle";
  o2.frequency.value = 843;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1300;
  f.Q.value = 1.4;
  const ns = ctx.createBufferSource();
  ns.buffer = noise();
  ns.loop = true;
  const nf = ctx.createBiquadFilter();
  nf.type = "highpass";
  nf.frequency.value = 1800;
  const ng = ctx.createGain();
  ng.gain.value = 0.0;
  const m = ctx.createGain();
  m.gain.value = 0.16;
  o.connect(f);
  o2.connect(f);
  f.connect(m);
  ns.connect(nf).connect(ng).connect(m);
  m.connect(g);
  o.start();
  o2.start();
  ns.start();
  return { o, o2, ng, nodes: [o, o2, ns] };
}

function buildHum(g, freq, lp) {
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = freq;
  const ns = ctx.createBufferSource();
  ns.buffer = noise();
  ns.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const m = ctx.createGain();
  m.gain.value = 0.18;
  o.connect(f);
  ns.connect(f);
  f.connect(m).connect(g);
  o.start();
  ns.start();
  return { o, f, nodes: [o, ns] };
}

/* ------------------------------------------------------------ ambience + music */
function scheduleAmbience() {
  if (!ambOn || !ctx) return;
  // a bird: two or three chirps, sometimes a little trill
  if (ready()) {
    const base = 2200 + Math.random() * 1800;
    const pan = Math.random() * 1.6 - 0.8;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const d = i * (0.09 + Math.random() * 0.06);
      tone(base * vary(1, 0.06), 0.06, { type: "sine", gain: 0.035, slide: base * (Math.random() < 0.5 ? 1.35 : 0.75), delay: d, bus: amb, pan });
    }
  }
  ambTimer = setTimeout(scheduleAmbience, 1800 + Math.random() * 4200);
}

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // major pentatonic-ish
const PROG = [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]];
function scheduleMusic() {
  if (!musicOn || !ctx) return;
  const now = ctx.currentTime;
  if (nextNote < now) nextNote = now + 0.05;
  while (nextNote < now + 0.6) {
    const bar = Math.floor(musicStep / 8) % PROG.length;
    const chord = PROG[bar];
    const beat = musicStep % 8;
    const root = 196; // G3
    if (beat === 0 && !muted) {
      // soft pad chord
      for (const n of chord) pluck(root * Math.pow(2, n / 12), 2.6, 0.03, nextNote, "triangle");
    }
    if (Math.random() < 0.55 && !muted) {
      const n = SCALE[Math.floor(Math.random() * SCALE.length)] + chord[0];
      pluck(root * 2 * Math.pow(2, n / 12), 0.9, 0.045, nextNote, "sine");
    }
    musicStep++;
    nextNote += 0.42;
  }
  musicTimer = setTimeout(scheduleMusic, 200);
}
function pluck(freq, dur, gain, t0, type) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(mus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

let windSrc = null;
let windGain = null;
function startWind() {
  if (windSrc || !ctx) return;
  windSrc = ctx.createBufferSource();
  windSrc.buffer = noise();
  windSrc.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 500;
  f.Q.value = 0.5;
  windGain = ctx.createGain();
  windGain.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 260;
  lfo.connect(lfoG).connect(f.frequency);
  windSrc.connect(f).connect(windGain).connect(amb);
  windSrc.start();
  lfo.start();
  windSrc._lfo = lfo;
}

/* ------------------------------------------------------------ public */
export const sound = {
  unlock() {
    const a = ac();
    if (a && a.state === "suspended") a.resume().catch(() => {});
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    applyVolumes();
  },
  setMuted(m) {
    muted = !!m;
    applyVolumes();
  },
  /** forest ambience on/off (wind bed + birds) */
  ambience(on, windy = 1) {
    if (!ac()) return;
    if (on && !ambOn) {
      ambOn = true;
      startWind();
      scheduleAmbience();
    } else if (!on && ambOn) {
      ambOn = false;
      clearTimeout(ambTimer);
    }
    if (windGain) windGain.gain.setTargetAtTime(on ? 0.045 * windy : 0, ctx.currentTime, 0.4);
  },
  music(on) {
    if (!ac()) return;
    if (on && !musicOn) {
      musicOn = true;
      nextNote = 0;
      scheduleMusic();
    } else if (!on && musicOn) {
      musicOn = false;
      clearTimeout(musicTimer);
    }
  },

  /* one-shots */
  footstep(run, surface = "grass") {
    if (!gate("step", 120)) return;
    const snow = surface === "snow";
    burst(run ? 0.09 : 0.07, { gain: run ? 0.11 : 0.08, type: snow ? "highpass" : "lowpass", freq: snow ? 1800 : vary(700), q: 0.7 });
    if (!snow) burst(0.04, { gain: 0.05, type: "bandpass", freq: vary(2400), q: 2, delay: 0.01 });
  },
  axeSwing(heavy = 1) {
    // air: a band of noise sweeping up then down — never woody
    burst(0.22, { gain: 0.12 * heavy, type: "bandpass", freq: 500, slide: 1900, q: 2.5, attack: 0.04 });
  },
  axeHit(strength = 1, pan = 0) {
    if (!gate("hit", 40)) return;
    // the wood THUNK: low body + click transient + short woody resonance
    tone(vary(115), 0.16, { type: "sine", gain: 0.55 * strength, slide: 70, pan });
    tone(vary(240), 0.08, { type: "triangle", gain: 0.22 * strength, slide: 150, pan });
    burst(0.05, { gain: 0.5 * strength, type: "bandpass", freq: vary(1800), q: 1.2, pan });
    burst(0.12, { gain: 0.18 * strength, type: "bandpass", freq: vary(620), q: 6, delay: 0.005, pan });
  },
  chopSection() {
    tone(vary(95), 0.2, { type: "sine", gain: 0.45, slide: 60 });
    burst(0.07, { gain: 0.4, type: "bandpass", freq: 1400, q: 1 });
  },
  treeCreak() {
    if (!ready()) return;
    // a slow, groaning creak: modulated sawtooth through a resonant filter
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(70, t0);
    o.frequency.linearRampToValueAtTime(48, t0 + 1.2);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = 18;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 600;
    f.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
    o.connect(f).connect(g).connect(sfx);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + 1.4);
    lfo.stop(t0 + 1.4);
    burst(0.4, { gain: 0.08, type: "bandpass", freq: 900, q: 4, delay: 0.5 });
  },
  treeFallWhoosh() {
    burst(1.3, { gain: 0.12, type: "bandpass", freq: 300, slide: 900, q: 1.5, attack: 0.6 });
  },
  treeLand(power = 1, dist = 0) {
    const k = Math.max(0.25, 1 - dist / 45) * power;
    tone(55, 0.7, { type: "sine", gain: 0.7 * k, slide: 32 });
    tone(90, 0.35, { type: "triangle", gain: 0.3 * k, slide: 50 });
    burst(0.9, { gain: 0.45 * k, type: "lowpass", freq: 900, slide: 200, q: 0.7 });
    // branches snapping + leaves rustle
    for (let i = 0; i < 5; i++) burst(0.05, { gain: 0.18 * k, type: "bandpass", freq: vary(2600, 0.3), q: 3, delay: 0.05 + Math.random() * 0.4 });
    burst(1.2, { gain: 0.1 * k, type: "highpass", freq: 3000, delay: 0.1, attack: 0.05 });
  },
  logImpact(strength = 1) {
    if (!gate("logimp", 70)) return;
    tone(vary(140), 0.12, { type: "sine", gain: 0.3 * strength, slide: 90 });
    burst(0.06, { gain: 0.2 * strength, type: "bandpass", freq: 900, q: 2 });
  },
  pickup() {
    burst(0.12, { gain: 0.12, type: "bandpass", freq: 800, q: 1.5 });
    tone(180, 0.1, { type: "triangle", gain: 0.08, slide: 240, delay: 0.05 });
  },
  drop() {
    tone(vary(120), 0.14, { type: "sine", gain: 0.35, slide: 75, delay: 0.02 });
    burst(0.08, { gain: 0.2, type: "lowpass", freq: 700, delay: 0.02 });
  },
  deposit() {
    tone(vary(160), 0.1, { type: "sine", gain: 0.3, slide: 100 });
    burst(0.07, { gain: 0.18, type: "bandpass", freq: 1200, q: 2 });
    tone(vary(130), 0.1, { type: "sine", gain: 0.18, slide: 90, delay: 0.12 });
  },
  millStart() {
    tone(80, 0.6, { type: "sawtooth", gain: 0.06, slide: 160, attack: 0.2 });
  },
  planks() {
    for (let i = 0; i < 3; i++) tone(vary(210 + i * 30), 0.06, { type: "triangle", gain: 0.12, slide: 150, delay: i * 0.07 });
  },
  bump(p) {
    if (!gate("bump", 200)) return;
    tone(70, 0.2, { type: "sine", gain: Math.min(0.5, 0.1 * p), slide: 40 });
    burst(0.1, { gain: Math.min(0.4, 0.06 * p), type: "lowpass", freq: 600 });
  },
  uiHover() {
    if (!gate("hover", 50)) return;
    tone(1250, 0.03, { type: "sine", gain: 0.035 });
  },
  uiClick() {
    tone(720, 0.05, { type: "triangle", gain: 0.12, slide: 960 });
  },
  denied() {
    tone(220, 0.12, { type: "square", gain: 0.06, slide: 160 });
  },
  coin() {
    tone(1320, 0.08, { type: "triangle", gain: 0.12 });
    tone(1760, 0.18, { type: "triangle", gain: 0.12, delay: 0.07 });
  },
  orderComplete() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(f, 0.35, { type: "triangle", gain: 0.16, delay: i * 0.11 }));
    tone(130.8, 0.8, { type: "sine", gain: 0.2, delay: 0.0 });
    burst(0.6, { gain: 0.05, type: "highpass", freq: 5000, delay: 0.35 });
  },
  unlock() {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.4, { type: "sine", gain: 0.13, delay: i * 0.08 }));
  },
  chainsawPull() {
    burst(0.25, { gain: 0.15, type: "bandpass", freq: 400, slide: 1200, q: 1.5 });
    tone(60, 0.25, { type: "sawtooth", gain: 0.08, slide: 110 });
  },

  /* continuous — call every frame with the current state; they fade, never pile up */
  chainsaw(state, cutting) {
    const L = loop("chainsaw", buildChainsaw);
    if (!L) return;
    const t = ctx.currentTime;
    if (state === "OFF" || !ready()) {
      setLoop("chainsaw", 0, 0.05);
      return;
    }
    const rpm = state === "CUTTING" ? 1 : state === "STARTING" ? 0.35 : state === "STOPPING" ? 0.2 : 0.45;
    L.o1.frequency.setTargetAtTime(80 + rpm * 90, t, 0.08);
    L.o2.frequency.setTargetAtTime(160 + rpm * 180, t, 0.08);
    L.f.frequency.setTargetAtTime(900 + rpm * 1800, t, 0.1);
    L.ng.gain.setTargetAtTime(cutting ? 0.5 : 0.05, t, 0.06);
    setLoop("chainsaw", state === "STARTING" ? 0.25 : cutting ? 0.6 : 0.38, 0.06);
  },
  millSaw(spin, cutting, near) {
    const L = loop("millSaw", buildMillSaw);
    if (!L) return;
    const t = ctx.currentTime;
    L.o.frequency.setTargetAtTime(220 + spin * 200 + (cutting ? -40 : 0), t, 0.15);
    L.o2.frequency.setTargetAtTime(440 + spin * 400, t, 0.15);
    L.ng.gain.setTargetAtTime(cutting ? 0.6 : 0, t, 0.08);
    setLoop("millSaw", ready() ? spin * (cutting ? 0.55 : 0.18) * near : 0, 0.12);
  },
  conveyor(on, near) {
    const L = loop("conveyor", (g) => buildHum(g, 48, 260));
    if (!L) return;
    setLoop("conveyor", ready() && on ? 0.3 * near : 0, 0.2);
  },
  engine(on, speed, throttle) {
    const L = loop("engine", (g) => buildHum(g, 40, 500));
    if (!L) return;
    const t = ctx.currentTime;
    L.o.frequency.setTargetAtTime(38 + Math.abs(speed) * 6 + Math.abs(throttle) * 18, t, 0.12);
    L.f.frequency.setTargetAtTime(380 + Math.abs(throttle) * 600, t, 0.12);
    setLoop("engine", ready() && on ? 0.35 + Math.abs(throttle) * 0.25 : 0, 0.15);
  },
  stopLoops() {
    for (const name of Object.keys(loops)) setLoop(name, 0, 0.02);
  },
  dispose() {
    this.stopLoops();
    ambOn = false;
    musicOn = false;
    clearTimeout(ambTimer);
    clearTimeout(musicTimer);
    if (windSrc) {
      try {
        windSrc.stop();
        windSrc._lfo.stop();
      } catch {
        /* already stopped */
      }
      windSrc = null;
      windGain = null;
    }
    for (const [name, L] of Object.entries(loops)) {
      for (const n of L.nodes || []) {
        try {
          n.stop();
        } catch {
          /* ignore */
        }
      }
      try {
        L.g.disconnect();
      } catch {
        /* ignore */
      }
      delete loops[name];
    }
  },
};
