/**
 * Prison Escape 3D — tiny Web Audio synth (no sample files).
 * `setMuted` follows the GamePlayer Mute button through one master gain, so
 * every sound — one-shots, ambience and the tension heartbeat — goes quiet.
 * The context is created on the first user gesture (`unlock`).
 */
let ctx = null;
let master = null;
let noise = null;
let amb = null;
let muted = false;
let ambT = null;
let ambLevel = 0;
let tension = { g: null, t: 0, level: 0 };
const VOLUME = 0.6;

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(freq, dur, { type = "sine", vol = 0.2, to = null, at = 0, attack = 0.01, filter = null } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, attack, vol, dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || "lowpass";
    f.frequency.value = filter.f;
    f.Q.value = filter.q || 1;
    node = o.connect(f);
  }
  node.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function hiss(dur, { freq = 900, to = null, q = 1, vol = 0.2, type = "bandpass", at = 0, attack = 0.005, rate = 1 } = {}) {
  if (!ctx || muted || vol <= 0.002) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rate * (0.85 + Math.random() * 0.3);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}
/** Metallic clank: a few inharmonic partials. */
function clank(vol = 0.15, base = 220, at = 0) {
  for (const k of [1, 2.76, 5.4, 8.9]) tone(base * k, 0.5 / Math.sqrt(k), { type: "triangle", vol: vol / k, at, attack: 0.002 });
  hiss(0.08, { freq: 3000, q: 0.6, vol: vol * 0.6, at });
}

export const audio = {
  unlock() {
    if (typeof window === "undefined") return;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (ambLevel > 0) this.ambience(ambLevel);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.03);
  },
  get muted() {
    return muted;
  },
  /** Ventilation hum + distant clanks/echoes. level 0 stops it. night: quieter, colder. */
  ambience(level, night = false) {
    ambLevel = level;
    if (!ctx) return;
    if (!amb && level > 0) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      const hum = ctx.createOscillator();
      hum.frequency.value = 58;
      const hg = ctx.createGain();
      hg.gain.value = 0;
      hum.connect(hg).connect(master);
      hum.start();
      amb = { src, g, hum, hg };
      // heartbeat bus for tension
      tension.g = ctx.createGain();
      tension.g.gain.value = 0;
      tension.g.connect(master);
    }
    if (amb) {
      amb.g.gain.setTargetAtTime(0.06 * level, ctx.currentTime, 0.6);
      amb.hg.gain.setTargetAtTime(0.012 * level, ctx.currentTime, 0.6);
    }
    clearInterval(ambT);
    ambT = null;
    if (level > 0) {
      ambT = setInterval(() => {
        if (muted || Math.random() < 0.5) return;
        const r = Math.random();
        if (r < 0.35) clank(0.03 * level, 140 + Math.random() * 120); // distant gate
        else if (r < 0.6) hiss(1.2, { freq: 400 + Math.random() * 300, q: 3, vol: 0.02 * level, attack: 0.3 }); // echoing voices-ish
        else if (r < 0.75 && !night) for (let i = 0; i < 3; i++) tone(300 + Math.random() * 80, 0.25, { type: "sawtooth", vol: 0.006 * level, at: i * 0.3, filter: { f: 700 } });
        else tone(1200 + Math.random() * 400, 0.6, { vol: 0.004 * level, to: 900 }); // pipe whine
      }, 2600);
    }
  },
  /** 0..1 suspicion → a low heartbeat that speeds up. */
  tension(level, dt) {
    if (!ctx || muted) return;
    tension.level = level;
    if (level < 0.15) return;
    tension.t -= dt;
    if (tension.t <= 0) {
      tension.t = 1.0 - level * 0.55;
      const v = 0.05 + level * 0.12;
      tone(62, 0.16, { vol: v, to: 42, attack: 0.005 });
      tone(58, 0.14, { vol: v * 0.7, to: 40, at: 0.18, attack: 0.005 });
    }
  },
  footstep(surface, sprint, crouch) {
    const v = crouch ? 0.03 : sprint ? 0.1 : 0.06;
    if (surface === "metal") {
      hiss(0.07, { freq: 2400, q: 2, vol: v * 0.8 });
      tone(380 + Math.random() * 60, 0.09, { type: "triangle", vol: v * 0.25 });
    } else if (surface === "gravel") {
      hiss(0.12, { freq: 1800, q: 0.5, vol: v * 1.1, type: "highpass" });
    } else {
      hiss(0.08, { freq: 700, q: 0.8, vol: v, type: "lowpass" });
      tone(90, 0.06, { vol: v * 0.5, to: 60 });
    }
  },
  door(kind, open) {
    if (kind === "door") {
      hiss(0.5, { freq: 900, to: 400, q: 6, vol: 0.06, attack: 0.05 }); // creak
      if (!open) tone(110, 0.15, { type: "square", vol: 0.06, at: 0.35, filter: { f: 500 } });
      else tone(160, 0.08, { type: "square", vol: 0.04, filter: { f: 600 } });
    } else if (kind === "cellgate" || kind === "gate") {
      clank(0.12, 180);
      hiss(1.0, { freq: 500, q: 1.5, vol: 0.07, attack: 0.1, at: 0.05 }); // slide rumble
      clank(0.14, 150, 0.95);
    } else if (kind === "slide") {
      tone(880, 0.12, { type: "square", vol: 0.03, filter: { f: 2000 } });
      hiss(0.9, { freq: 300, q: 1, vol: 0.09, attack: 0.1, at: 0.1 });
    } else if (kind === "shutter") {
      for (let i = 0; i < 10; i++) clank(0.04, 260 + (i % 2) * 40, i * 0.18);
      hiss(2.0, { freq: 250, q: 0.8, vol: 0.06, attack: 0.2 });
    } else if (kind === "vent" || kind === "fencepanel") {
      clank(0.1, 400);
      hiss(0.25, { freq: 2600, q: 0.8, vol: 0.06, at: 0.1 });
    }
  },
  locked() {
    clank(0.07, 120);
    tone(70, 0.12, { type: "square", vol: 0.03, filter: { f: 300 } });
  },
  work() {
    hiss(0.12, { freq: 3800, q: 2, vol: 0.05 });
    tone(1800 + Math.random() * 600, 0.05, { type: "triangle", vol: 0.02 });
  },
  pickup() {
    tone(660, 0.1, { type: "triangle", vol: 0.12 });
    tone(990, 0.16, { type: "triangle", vol: 0.1, at: 0.08 });
    tone(1320, 0.22, { vol: 0.05, at: 0.16 });
  },
  paper() {
    hiss(0.3, { freq: 4500, q: 0.5, vol: 0.06, attack: 0.02 });
    hiss(0.2, { freq: 3000, q: 0.5, vol: 0.04, at: 0.2 });
  },
  ui() {
    tone(900, 0.04, { type: "triangle", vol: 0.05 });
  },
  beep(ok = true) {
    tone(ok ? 1320 : 330, ok ? 0.08 : 0.22, { type: "square", vol: 0.04, filter: { f: 3000 } });
  },
  deny() {
    tone(200, 0.14, { type: "square", vol: 0.05, filter: { f: 800 } });
    tone(160, 0.18, { type: "square", vol: 0.05, at: 0.12, filter: { f: 800 } });
  },
  breaker(up) {
    tone(up ? 140 : 90, 0.08, { type: "square", vol: 0.08, filter: { f: 900 } });
    hiss(0.06, { freq: 1500, q: 1, vol: 0.06 });
  },
  spark() {
    hiss(0.6, { freq: 5000, to: 1500, q: 0.6, vol: 0.22, attack: 0.002 });
    tone(55, 0.5, { type: "sawtooth", vol: 0.12, filter: { f: 400 } });
    clank(0.12, 90, 0.05);
  },
  power() {
    tone(60, 1.6, { type: "sawtooth", vol: 0.06, to: 120, attack: 0.3, filter: { f: 500 } });
    tone(120, 1.6, { vol: 0.05, to: 240, attack: 0.3 });
  },
  suspicious() {
    tone(520, 0.18, { type: "triangle", vol: 0.06, to: 700 });
  },
  alert() {
    tone(880, 0.12, { type: "sawtooth", vol: 0.09, filter: { f: 2600 } });
    tone(1175, 0.25, { type: "sawtooth", vol: 0.09, at: 0.1, filter: { f: 2600 } });
    hiss(0.3, { freq: 1500, q: 1, vol: 0.05 });
  },
  alarm() {
    for (let i = 0; i < 4; i++) tone(i % 2 ? 620 : 820, 0.3, { type: "square", vol: 0.04, at: i * 0.3, filter: { f: 1800 } });
  },
  caught() {
    tone(220, 0.5, { type: "sawtooth", vol: 0.1, to: 110, filter: { f: 1200 } });
    clank(0.16, 130, 0.25);
  },
  mission() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, { type: "triangle", vol: 0.08, at: i * 0.09 }));
    tone(262, 0.9, { vol: 0.05, at: 0.3 });
  },
  pa() {
    tone(784, 0.3, { vol: 0.05 });
    tone(659, 0.3, { vol: 0.05, at: 0.3 });
    tone(523, 0.45, { vol: 0.05, at: 0.6 });
  },
  bell() {
    for (let i = 0; i < 6; i++) tone(1400, 0.12, { type: "square", vol: 0.025, at: i * 0.16, filter: { f: 2400 } });
  },
  victory() {
    const seq = [392, 523, 659, 784, 1046];
    seq.forEach((f, i) => tone(f, 0.5, { type: "triangle", vol: 0.1, at: i * 0.14 }));
    [523, 659, 784].forEach((f) => tone(f, 1.8, { vol: 0.06, at: 0.8, attack: 0.1 }));
    hiss(2.5, { freq: 600, q: 0.4, vol: 0.03, attack: 0.8 }); // wind of freedom
  },
  hide() {
    clank(0.05, 300);
  },
  dispose() {
    clearInterval(ambT);
    ambT = null;
    try {
      amb?.src.stop();
      amb?.hum.stop();
    } catch {
      /* already stopped */
    }
    amb = null;
    tension = { g: null, t: 0, level: 0 };
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    master = null;
  },
};
