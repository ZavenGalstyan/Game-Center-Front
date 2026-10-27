/**
 * Iron Arena — procedural audio (WebAudio, no sample files).
 *
 * master → (music | sfx | ambience) buses → compressor → destination.
 * Weapons, explosions, impacts and abilities are synthesized from noise and
 * oscillators per event; the player's engine + track clatter and turret
 * servo are continuous voices driven every frame; distant sounds get a
 * distance-based gain, low-pass and stereo pan. Menu and battle music are
 * generated on a lookahead scheduler.
 */
let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let ambBus = null;
let comp = null;
let noiseBuf = null;
let vol = { master: 0.8, music: 0.5, sfx: 0.9 };
let muted = false;
let unlocked = false;
let engine = null;
let flame = null;
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
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  master = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  ambBus = ctx.createGain();
  musicBus.connect(master);
  sfxBus.connect(comp);
  ambBus.connect(master);
  comp.connect(master);
  master.connect(ctx.destination);
  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  applyVol();
  return ctx;
}
function applyVol() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.02);
  musicBus.gain.setTargetAtTime(vol.music * 0.55, t, 0.05);
  sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.02);
  ambBus.gain.setTargetAtTime(vol.sfx * 0.6, t, 0.1);
}
const now = () => ctx.currentTime;
function noise(dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = dur > 1.9;
  const off = Math.random() * 1.5;
  s.start(now(), off, s.loop ? undefined : dur + 0.05);
  return s;
}
function env(g, t0, a, peak, d, end = 0.0001) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(end, t0 + a + d);
}
/** distance/pan routing → returns the node to connect sources to */
function spatial(o = {}) {
  const g = ctx.createGain();
  const dist = o.dist ?? 0;
  const att = 1 / (1 + (dist / 28) ** 2);
  g.gain.value = (o.gain ?? 1) * Math.max(0.02, att);
  let last = g;
  if (dist > 25) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(500, 9000 - dist * 45);
    last.connect(lp);
    last = lp;
  }
  if (ctx.createStereoPanner && o.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    last.connect(p);
    last = p;
  }
  last.connect(o.bus || sfxBus);
  return g;
}
const stopAt = (node, t) => {
  try {
    node.stop(t);
  } catch {
    /* already stopped */
  }
};

/* ------------------------------------------------------------------ voices */
function boom(o, { low = 60, dur = 0.9, crack = 1, body = 1, cut = 1800 } = {}) {
  const t = now();
  const out = spatial(o);
  // crack: bright noise burst
  const n1 = noise(0.25);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;
  const g1 = ctx.createGain();
  env(g1, t, 0.002, 0.9 * crack, 0.12);
  n1.connect(hp).connect(g1).connect(out);
  // body: low-passed noise with long decay
  const n2 = noise(dur + 0.2);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(cut, t);
  lp.frequency.exponentialRampToValueAtTime(140, t + dur);
  const g2 = ctx.createGain();
  env(g2, t, 0.005, 1.1 * body, dur);
  n2.connect(lp).connect(g2).connect(out);
  // thump: pitch-dropping sine
  const o1 = ctx.createOscillator();
  o1.type = "sine";
  o1.frequency.setValueAtTime(low * 2.2, t);
  o1.frequency.exponentialRampToValueAtTime(low * 0.5, t + 0.35);
  const g3 = ctx.createGain();
  env(g3, t, 0.004, 1.0 * body, 0.45);
  o1.connect(g3).connect(out);
  o1.start(t);
  stopAt(o1, t + 0.6);
  stopAt(n2, t + dur + 0.3);
}

export const sound = {
  unlock() {
    if (!init()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    unlocked = true;
  },
  suspend() {
    ctx?.suspend?.().catch(() => {});
  },
  resume() {
    if (ctx && unlocked) ctx.resume().catch(() => {});
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    applyVol();
  },
  setMuted(m) {
    muted = !!m;
    applyVol();
  },
  get ready() {
    return !!ctx && unlocked;
  },

  /* ---------------- weapons */
  fire(kind, o = {}) {
    if (!ctx || !unlocked) return;
    const t = now();
    switch (kind) {
      case "shell":
        boom(o, { low: 55, dur: 1.1, crack: 1.1, body: 1.0, cut: 2400 });
        break;
      case "he":
        boom(o, { low: 42, dur: 1.5, crack: 1.2, body: 1.25, cut: 1800 });
        break;
      case "burst":
      case "clip": {
        const out = spatial({ ...o, gain: (o.gain ?? 1) * 0.55 });
        const n = noise(0.12);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = kind === "clip" ? 900 : 1400;
        bp.Q.value = 0.7;
        const g = ctx.createGain();
        env(g, t, 0.001, 1, 0.1);
        n.connect(bp).connect(g).connect(out);
        const os = ctx.createOscillator();
        os.type = "square";
        os.frequency.setValueAtTime(kind === "clip" ? 160 : 220, t);
        os.frequency.exponentialRampToValueAtTime(60, t + 0.08);
        const g2 = ctx.createGain();
        env(g2, t, 0.001, 0.35, 0.08);
        os.connect(g2).connect(out);
        os.start(t);
        stopAt(os, t + 0.12);
        break;
      }
      case "rail": {
        const out = spatial({ ...o, gain: (o.gain ?? 1) * 0.9 });
        const os = ctx.createOscillator();
        os.type = "sawtooth";
        os.frequency.setValueAtTime(2400, t);
        os.frequency.exponentialRampToValueAtTime(90, t + 0.35);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3200;
        const g = ctx.createGain();
        env(g, t, 0.002, 0.6, 0.4);
        os.connect(lp).connect(g).connect(out);
        os.start(t);
        stopAt(os, t + 0.5);
        boom(o, { low: 70, dur: 0.6, crack: 0.8, body: 0.6, cut: 3000 });
        break;
      }
      case "plasma": {
        const out = spatial({ ...o, gain: (o.gain ?? 1) * 0.7 });
        for (const [f0, f1, ty] of [[1300, 160, "sawtooth"], [900, 120, "square"]]) {
          const os = ctx.createOscillator();
          os.type = ty;
          os.frequency.setValueAtTime(f0, t);
          os.frequency.exponentialRampToValueAtTime(f1, t + 0.25);
          const g = ctx.createGain();
          env(g, t, 0.003, 0.25, 0.28);
          const lp = ctx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = 2600;
          os.connect(lp).connect(g).connect(out);
          os.start(t);
          stopAt(os, t + 0.32);
        }
        break;
      }
      default:
    }
  },
  charge(time, o = {}) {
    if (!ctx || !unlocked) return;
    const t = now();
    const out = spatial({ ...o, gain: (o.gain ?? 1) * 0.35 });
    const os = ctx.createOscillator();
    os.type = "sine";
    os.frequency.setValueAtTime(220, t);
    os.frequency.exponentialRampToValueAtTime(1800, t + time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + time);
    g.gain.exponentialRampToValueAtTime(0.0001, t + time + 0.05);
    os.connect(g).connect(out);
    os.start(t);
    stopAt(os, t + time + 0.08);
  },
  /** continuous flamethrower voice for the player (on/off each frame) */
  flame(on) {
    if (!ctx || !unlocked) return;
    if (on && !flame) {
      const n = noise(3);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 650;
      bp.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.55, now(), 0.04);
      n.connect(bp).connect(g).connect(sfxBus);
      flame = { n, g };
    } else if (!on && flame) {
      const f = flame;
      flame = null;
      f.g.gain.setTargetAtTime(0.0001, now(), 0.06);
      stopAt(f.n, now() + 0.3);
    }
  },
  reload(time, o = {}) {
    if (!ctx || !unlocked) return;
    const t = now();
    const out = spatial({ ...o, gain: (o.gain ?? 1) * 0.35 });
    for (const [dt, f] of [[0.05, 1800], [Math.max(0.2, time - 0.25), 1200], [Math.max(0.3, time - 0.05), 2400]]) {
      const n = noise(0.06);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = 6;
      const g = ctx.createGain();
      env(g, t + dt, 0.001, 0.8, 0.06);
      n.connect(bp).connect(g).connect(out);
    }
  },
  explosion(size = 1, o = {}) {
    if (!ctx || !unlocked) return;
    boom({ ...o, gain: (o.gain ?? 1) * (0.7 + size * 0.4) }, { low: 38, dur: 0.9 + size * 0.9, crack: 0.6 + size * 0.4, body: 1 + size * 0.3, cut: 1400 + size * 400 });
  },
  impact(kind, o = {}) {
    if (!ctx || !unlocked) return;
    if (kind === "he" || kind === "strike") return sound.explosion(1.1, o);
    if (kind === "shell") return sound.explosion(0.55, o);
    const t = now();
    const out = spatial({ ...o, gain: (o.gain ?? 1) * 0.4 });
    const n = noise(0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = kind === "plasma" ? 700 : kind === "rail" ? 2600 : 1600;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    env(g, t, 0.002, 0.8, 0.18);
    n.connect(bp).connect(g).connect(out);
  },
  /** metallic clank when our shot hits a tank */
  hitConfirm(kill = false) {
    if (!ctx || !unlocked) return;
    const t = now();
    const out = spatial({ gain: 0.5 });
    for (const f of kill ? [880, 1320, 1760] : [1250, 1870]) {
      const os = ctx.createOscillator();
      os.type = "triangle";
      os.frequency.value = f;
      const g = ctx.createGain();
      env(g, t, 0.002, kill ? 0.35 : 0.22, kill ? 0.45 : 0.18);
      os.connect(g).connect(out);
      os.start(t);
      stopAt(os, t + 0.6);
    }
  },
  hurt(amount) {
    if (!ctx || !unlocked) return;
    const t = now();
    const out = spatial({ gain: Math.min(1, 0.3 + amount / 200) });
    const os = ctx.createOscillator();
    os.type = "sine";
    os.frequency.setValueAtTime(110, t);
    os.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    const g = ctx.createGain();
    env(g, t, 0.003, 0.9, 0.3);
    os.connect(g).connect(out);
    os.start(t);
    stopAt(os, t + 0.4);
    const n = noise(0.3);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200;
    bp.Q.value = 8;
    const g2 = ctx.createGain();
    env(g2, t, 0.001, 0.5, 0.25);
    n.connect(bp).connect(g2).connect(out);
  },
  ricochet(o = {}) {
    if (!ctx || !unlocked) return;
    const t = now();
    const out = spatial({ ...o, gain: (o.gain ?? 1) * 0.3 });
    const os = ctx.createOscillator();
    os.type = "sine";
    os.frequency.setValueAtTime(3200, t);
    os.frequency.exponentialRampToValueAtTime(900, t + 0.3);
    const g = ctx.createGain();
    env(g, t, 0.002, 0.5, 0.3);
    os.connect(g).connect(out);
    os.start(t);
    stopAt(os, t + 0.35);
  },
  whistle(o = {}) {
    if (!ctx || !unlocked) return;
    const t = now();
    const out = spatial({ ...o, gain: 0.25 });
    const os = ctx.createOscillator();
    os.type = "sine";
    os.frequency.setValueAtTime(1900, t);
    os.frequency.exponentialRampToValueAtTime(500, t + 0.7);
    const g = ctx.createGain();
    env(g, t, 0.1, 0.5, 0.6);
    os.connect(g).connect(out);
    os.start(t);
    stopAt(os, t + 0.8);
  },

  /* ---------------- player engine + servo (continuous) */
  engine(state) {
    if (!ctx || !unlocked) return;
    if (!state) {
      if (engine) {
        const e = engine;
        engine = null;
        const t = now();
        e.g.gain.setTargetAtTime(0.0001, t, 0.1);
        e.gt.gain.setTargetAtTime(0.0001, t, 0.1);
        e.gs.gain.setTargetAtTime(0.0001, t, 0.05);
        for (const s of e.src) stopAt(s, t + 0.6);
      }
      return;
    }
    if (!engine) {
      const t = now();
      const o1 = ctx.createOscillator();
      o1.type = "sawtooth";
      const o2 = ctx.createOscillator();
      o2.type = "square";
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(g).connect(sfxBus);
      // track clatter: noise amplitude-modulated by an LFO tied to speed
      const n = noise(3);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1100;
      bp.Q.value = 1.4;
      const am = ctx.createGain();
      am.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = 6;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.5;
      lfo.connect(lfoG).connect(am.gain);
      const gt = ctx.createGain();
      gt.gain.value = 0.0001;
      n.connect(bp).connect(am).connect(gt).connect(sfxBus);
      // turret servo whine
      const sv = ctx.createOscillator();
      sv.type = "triangle";
      sv.frequency.value = 420;
      const gs = ctx.createGain();
      gs.gain.value = 0.0001;
      sv.connect(gs).connect(sfxBus);
      for (const s of [o1, o2, lfo, sv]) s.start(t);
      engine = { o1, o2, lp, g, lfo, gt, sv, gs, src: [o1, o2, lfo, sv, n] };
    }
    const t = now();
    const sp = Math.min(1, Math.abs(state.speed) / 16);
    const thr = Math.min(1, Math.abs(state.throttle));
    const base = state.heavy ? 34 : state.light ? 52 : 42;
    engine.o1.frequency.setTargetAtTime(base + sp * 38 + thr * 10, t, 0.08);
    engine.o2.frequency.setTargetAtTime((base + sp * 38 + thr * 10) * 0.502, t, 0.08);
    engine.lp.frequency.setTargetAtTime(220 + thr * 380 + sp * 300, t, 0.1);
    engine.g.gain.setTargetAtTime(state.alive ? 0.16 + thr * 0.12 + sp * 0.06 : 0.0001, t, 0.1);
    engine.lfo.frequency.setTargetAtTime(2 + sp * 16, t, 0.1);
    engine.gt.gain.setTargetAtTime(state.alive ? sp * 0.35 : 0.0001, t, 0.1);
    const tr = Math.min(1, state.turretRate / 1.5);
    engine.sv.frequency.setTargetAtTime(380 + tr * 260, t, 0.05);
    engine.gs.gain.setTargetAtTime(state.alive && tr > 0.05 ? 0.035 * tr : 0.0001, t, 0.04);
  },

  /* ---------------- abilities */
  ability(key) {
    if (!ctx || !unlocked) return;
    const t = now();
    const out = spatial({ gain: 0.5 });
    const sweep = (f0, f1, dur, type = "sine", peak = 0.4) => {
      const os = ctx.createOscillator();
      os.type = type;
      os.frequency.setValueAtTime(f0, t);
      os.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain();
      env(g, t, 0.01, peak, dur);
      os.connect(g).connect(out);
      os.start(t);
      stopAt(os, t + dur + 0.05);
    };
    const whoosh = (dur, f = 900, peak = 0.6) => {
      const n = noise(dur);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(f * 0.4, t);
      bp.frequency.exponentialRampToValueAtTime(f * 2, t + dur);
      const g = ctx.createGain();
      env(g, t, dur * 0.3, peak, dur * 0.7);
      n.connect(bp).connect(g).connect(out);
    };
    switch (key) {
      case "nitro":
        whoosh(0.8, 700, 0.7);
        sweep(80, 240, 0.8, "sawtooth", 0.2);
        break;
      case "repair":
        for (let i = 0; i < 4; i++) {
          const os = ctx.createOscillator();
          os.type = "triangle";
          os.frequency.value = [523, 659, 784, 1046][i];
          const g = ctx.createGain();
          env(g, t + i * 0.08, 0.01, 0.25, 0.3);
          os.connect(g).connect(out);
          os.start(t + i * 0.08);
          stopAt(os, t + i * 0.08 + 0.4);
        }
        break;
      case "shield":
        sweep(180, 720, 0.5, "sine", 0.4);
        sweep(360, 1440, 0.5, "triangle", 0.15);
        break;
      case "focus":
        sweep(600, 1800, 0.25, "square", 0.12);
        break;
      case "inferno":
        whoosh(0.6, 500, 0.9);
        boom({}, { low: 50, dur: 0.8, crack: 0.5, body: 0.9, cut: 1200 });
        break;
      case "overclock":
        sweep(120, 900, 0.7, "sawtooth", 0.18);
        break;
      case "cloak":
        sweep(1400, 200, 0.6, "sine", 0.3);
        whoosh(0.5, 2000, 0.3);
        break;
      case "barrage":
        for (let i = 0; i < 3; i++) {
          const os = ctx.createOscillator();
          os.type = "square";
          os.frequency.value = 880;
          const g = ctx.createGain();
          env(g, t + i * 0.12, 0.005, 0.12, 0.06);
          os.connect(g).connect(out);
          os.start(t + i * 0.12);
          stopAt(os, t + i * 0.12 + 0.1);
        }
        break;
      default:
    }
  },

  /* ---------------- UI / match flow */
  ui(type = "click") {
    if (!ctx || !unlocked) return;
    const t = now();
    const out = spatial({ gain: 0.35, bus: sfxBus });
    const blip = (f, dt, dur = 0.07, ty = "triangle", pk = 0.5) => {
      const os = ctx.createOscillator();
      os.type = ty;
      os.frequency.value = f;
      const g = ctx.createGain();
      env(g, t + dt, 0.003, pk, dur);
      os.connect(g).connect(out);
      os.start(t + dt);
      stopAt(os, t + dt + dur + 0.05);
    };
    if (type === "click") blip(880, 0, 0.05);
    else if (type === "hover") blip(1320, 0, 0.03, "sine", 0.18);
    else if (type === "back") blip(520, 0, 0.06);
    else if (type === "error") {
      blip(180, 0, 0.12, "square", 0.3);
      blip(150, 0.13, 0.15, "square", 0.3);
    } else if (type === "buy") [784, 988, 1175, 1568].forEach((f, i) => blip(f, i * 0.07, 0.18, "triangle", 0.4));
    else if (type === "upgrade") [523, 659, 784, 1046, 1318].forEach((f, i) => blip(f, i * 0.05, 0.12, "square", 0.18));
    else if (type === "unlock") {
      [392, 523, 659, 784, 1046].forEach((f, i) => blip(f, i * 0.09, 0.35, "sawtooth", 0.22));
      boom({ gain: 0.4 }, { low: 50, dur: 0.6, crack: 0.2, body: 0.6, cut: 800 });
    }
  },
  countdown(go) {
    if (!ctx || !unlocked) return;
    const t = now();
    const os = ctx.createOscillator();
    os.type = "square";
    os.frequency.value = go ? 1046 : 523;
    const g = ctx.createGain();
    env(g, t, 0.005, 0.25, go ? 0.5 : 0.15);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    os.connect(lp).connect(g).connect(sfxBus);
    os.start(t);
    stopAt(os, t + 0.7);
  },
  flag(action, good) {
    if (!ctx || !unlocked) return;
    const t = now();
    const notes = action === "capture" ? (good ? [523, 659, 784, 1046] : [392, 311, 262]) : action === "take" ? (good ? [659, 880] : [880, 622]) : action === "return" ? [784, 1046] : [440, 349];
    notes.forEach((f, i) => {
      const os = ctx.createOscillator();
      os.type = "sawtooth";
      os.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      const g = ctx.createGain();
      env(g, t + i * 0.12, 0.01, 0.2, 0.3);
      os.connect(lp).connect(g).connect(sfxBus);
      os.start(t + i * 0.12);
      stopAt(os, t + i * 0.12 + 0.45);
    });
  },
  streak() {
    sound.ui("upgrade");
  },
  result(win) {
    if (!ctx || !unlocked) return;
    const t = now();
    const notes = win === "win" ? [392, 523, 659, 784, 1046, 1318] : win === "draw" ? [440, 523, 440, 523] : [392, 349, 311, 262, 196];
    notes.forEach((f, i) => {
      for (const det of [1, 1.005]) {
        const os = ctx.createOscillator();
        os.type = "sawtooth";
        os.frequency.value = f * det;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1800;
        const g = ctx.createGain();
        env(g, t + i * 0.16, 0.02, 0.12, i === notes.length - 1 ? 1.4 : 0.35);
        os.connect(lp).connect(g).connect(musicBus);
        os.start(t + i * 0.16);
        stopAt(os, t + i * 0.16 + 1.6);
      }
    });
  },

  /* ---------------- ambience */
  ambience(kind) {
    if (!ctx) init();
    if (!ctx) return;
    sound.stopAmbience();
    const t = now();
    const n = noise(3);
    const lp = ctx.createBiquadFilter();
    lp.type = kind === "city" ? "lowpass" : "bandpass";
    lp.frequency.value = kind === "city" ? 240 : kind === "harbor" ? 420 : 520;
    lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(kind === "city" ? 0.22 : 0.16, t, 1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain();
    lfoG.gain.value = kind === "city" ? 60 : 220;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start(t);
    n.connect(lp).connect(g).connect(ambBus);
    let timer = null;
    const extras = () => {
      if (!ctx || !amb) return;
      const tt = now();
      if (kind === "forest") {
        // birdsong chirps
        for (let i = 0; i < 3; i++) {
          const os = ctx.createOscillator();
          os.type = "sine";
          const f = 2400 + Math.random() * 1800;
          os.frequency.setValueAtTime(f, tt + i * 0.11);
          os.frequency.exponentialRampToValueAtTime(f * 1.3, tt + i * 0.11 + 0.08);
          const gg = ctx.createGain();
          env(gg, tt + i * 0.11, 0.01, 0.05, 0.08);
          os.connect(gg).connect(ambBus);
          os.start(tt + i * 0.11);
          stopAt(os, tt + i * 0.11 + 0.12);
        }
      } else if (kind === "harbor") {
        // gull cry
        const os = ctx.createOscillator();
        os.type = "sawtooth";
        os.frequency.setValueAtTime(1300, tt);
        os.frequency.exponentialRampToValueAtTime(700, tt + 0.4);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1200;
        const gg = ctx.createGain();
        env(gg, tt, 0.05, 0.035, 0.35);
        os.connect(bp).connect(gg).connect(ambBus);
        os.start(tt);
        stopAt(os, tt + 0.5);
      } else if (kind === "city") {
        // distant siren sweep
        const os = ctx.createOscillator();
        os.type = "sine";
        os.frequency.setValueAtTime(700, tt);
        os.frequency.linearRampToValueAtTime(1000, tt + 0.8);
        os.frequency.linearRampToValueAtTime(700, tt + 1.6);
        const gg = ctx.createGain();
        env(gg, tt, 0.4, 0.018, 1.2);
        os.connect(gg).connect(ambBus);
        os.start(tt);
        stopAt(os, tt + 1.8);
      }
      timer = setTimeout(extras, 3000 + Math.random() * 6000);
    };
    amb = { n, g, lfo, stop: () => clearTimeout(timer) };
    timer = setTimeout(extras, 2000);
  },
  stopAmbience() {
    if (!amb || !ctx) return;
    const a = amb;
    amb = null;
    a.stop();
    a.g.gain.setTargetAtTime(0.0001, now(), 0.4);
    stopAt(a.n, now() + 2);
    stopAt(a.lfo, now() + 2);
  },

  /* ---------------- music (procedural, scheduled) */
  music(kind = "menu") {
    if (!ctx || !unlocked) return;
    if (music && music.kind === kind) return;
    sound.stopMusic();
    const bpm = kind === "menu" ? 92 : 118;
    const beat = 60 / bpm;
    // Am – F – C – G (menu) / Dm – Bb – C – Am (battle)
    const prog = kind === "menu" ? [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 196, 261.6], [196, 246.9, 293.7]] : [[146.8, 174.6, 220], [116.5, 146.8, 174.6], [130.8, 164.8, 196], [110, 130.8, 164.8]];
    let next = now() + 0.1;
    let step = 0;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.gain.setTargetAtTime(kind === "menu" ? 0.9 : 0.45, now(), 1.2);
    out.connect(musicBus);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = kind === "menu" ? 1400 : 900;
    lp.connect(out);
    const sched = () => {
      if (!music || music.out !== out) return;
      while (next < now() + 0.25) {
        const bar = Math.floor(step / 8) % 4;
        const s8 = step % 8;
        const chord = prog[bar];
        if (s8 === 0)
          for (const f of chord)
            for (const det of [0.997, 1.003]) {
              const os = ctx.createOscillator();
              os.type = "sawtooth";
              os.frequency.value = f * det;
              const g = ctx.createGain();
              g.gain.setValueAtTime(0.0001, next);
              g.gain.linearRampToValueAtTime(0.045, next + beat * 0.8);
              g.gain.linearRampToValueAtTime(0.0001, next + beat * 4);
              os.connect(g).connect(lp);
              os.start(next);
              stopAt(os, next + beat * 4.1);
            }
        // bass
        if (s8 % 2 === 0) {
          const os = ctx.createOscillator();
          os.type = "triangle";
          os.frequency.value = chord[0] / 2;
          const g = ctx.createGain();
          env(g, next, 0.01, 0.16, beat * 0.9);
          os.connect(g).connect(out);
          os.start(next);
          stopAt(os, next + beat);
        }
        // arpeggio
        if (kind === "menu" || s8 % 2 === 1) {
          const os = ctx.createOscillator();
          os.type = "square";
          os.frequency.value = chord[s8 % 3] * 2;
          const g = ctx.createGain();
          env(g, next, 0.005, 0.03, beat * 0.4);
          os.connect(g).connect(lp);
          os.start(next);
          stopAt(os, next + beat * 0.5);
        }
        // drums
        if (s8 % 4 === 0) {
          const os = ctx.createOscillator();
          os.frequency.setValueAtTime(140, next);
          os.frequency.exponentialRampToValueAtTime(40, next + 0.15);
          const g = ctx.createGain();
          env(g, next, 0.002, 0.45, 0.2);
          os.connect(g).connect(out);
          os.start(next);
          stopAt(os, next + 0.25);
        }
        if (s8 % 4 === 2 && kind !== "menu") {
          const n = ctx.createBufferSource();
          n.buffer = noiseBuf;
          const bp = ctx.createBiquadFilter();
          bp.type = "highpass";
          bp.frequency.value = 1500;
          const g = ctx.createGain();
          env(g, next, 0.002, 0.18, 0.12);
          n.connect(bp).connect(g).connect(out);
          n.start(next, Math.random(), 0.2);
        }
        next += beat / 2;
        step++;
      }
      music.timer = setTimeout(sched, 90);
    };
    music = { kind, out, timer: null };
    sched();
  },
  stopMusic() {
    if (!music || !ctx) return;
    const m = music;
    music = null;
    clearTimeout(m.timer);
    m.out.gain.setTargetAtTime(0.0001, now(), 0.5);
    setTimeout(() => m.out.disconnect(), 2500);
  },
  dispose() {
    sound.engine(null);
    sound.flame(false);
    sound.stopAmbience();
    sound.stopMusic();
  },
};
