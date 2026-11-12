/**
 * Synthesised WebAudio for Deep Mine (no audio files). Nothing is created
 * before the first user gesture (`unlock`), so autoplay rules are respected.
 * Positional sounds are panned and attenuated relative to `listen()`.
 * The ambience is a deep rumble, dripping water, creaking timber, distant
 * machinery and things moving in the dark.
 */
let ctx = null;
let master = null, sfxBus = null, ambBus = null;
let noiseBuf = null;
let muted = false;
let vol = 0.8;
let ambVol = 0.7;
let ambOn = false;
let ambNodes = [];
let ambTimer = null;
let heart = null;
const L = { x: 0, z: 0, yaw: 0 };

function init() {
  if (ctx) return true;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return false;
  try {
    ctx = new AC();
  } catch {
    return false;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : vol;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  ambBus = ctx.createGain();
  ambBus.gain.value = ambVol * 0.8;
  ambBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}
const now = () => ctx.currentTime;

function out(x, z, gain = 1, bus = sfxBus) {
  const g = ctx.createGain();
  let pan = 0, att = 1;
  if (x !== undefined && z !== undefined) {
    const dx = x - L.x, dz = z - L.z;
    const d = Math.hypot(dx, dz);
    att = 1 / (1 + Math.max(0, d - 2) * 0.16);
    const ang = Math.atan2(-dx, -dz) - L.yaw;
    pan = -Math.sin(ang) * Math.min(1, d / 3);
  }
  g.gain.value = gain * att;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(bus);
  } else g.connect(bus);
  return g;
}
function noise(dest, t, dur, { type = "lowpass", f = 1200, f2 = null, q = 0.8, a = 0.005, peak = 1 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(dest);
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
}
function tone(dest, t, dur, { f = 220, f2 = null, type = "sine", a = 0.005, peak = 0.5 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}
/** growl: a modulated sawtooth through a formant */
function growl(dest, t, base, dur, lfoF, formant, peak) {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), t);
  osc.frequency.linearRampToValueAtTime(base * 0.75, t + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = lfoF;
  const lg = ctx.createGain();
  lg.gain.value = base * 0.3;
  lfo.connect(lg).connect(osc.frequency);
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = formant;
  f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(f).connect(g).connect(dest);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + dur + 0.05);
  lfo.stop(t + dur + 0.05);
}
const ok = () => ctx && ctx.state === "running" && !muted;

export const audio = {
  unlock() {
    if (!init()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : vol, ctx.currentTime, 0.05);
  },
  setVolume(v) {
    vol = Math.max(0, Math.min(1, v));
    if (master && !muted) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
  },
  setAmbience(v) {
    ambVol = Math.max(0, Math.min(1, v));
    if (ambBus) ambBus.gain.setTargetAtTime(ambVol * 0.8, ctx.currentTime, 0.1);
  },
  listen(x, z, yaw) {
    L.x = x;
    L.z = z;
    L.yaw = yaw;
  },
  pistol() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.9);
    noise(o, t, 0.16, { type: "lowpass", f: 4000, f2: 400, peak: 1 });
    tone(o, t, 0.12, { f: 160, f2: 50, type: "triangle", peak: 0.8 });
    noise(o, t + 0.02, 0.9, { type: "bandpass", f: 700, f2: 200, q: 0.6, peak: 0.16, a: 0.02 }); // tunnel echo
  },
  shotgun() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 1);
    noise(o, t, 0.35, { type: "lowpass", f: 3000, f2: 200, peak: 1.2 });
    tone(o, t, 0.25, { f: 110, f2: 35, type: "sawtooth", peak: 0.7 });
    noise(o, t + 0.03, 1.2, { type: "bandpass", f: 500, f2: 150, q: 0.5, peak: 0.22, a: 0.03 });
    noise(o, t + 0.32, 0.06, { type: "highpass", f: 2000, peak: 0.25 });
    noise(o, t + 0.45, 0.07, { type: "highpass", f: 1500, peak: 0.3 });
  },
  flare() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.9);
    noise(o, t, 0.25, { type: "lowpass", f: 1800, f2: 300, peak: 1 });
    tone(o, t, 0.3, { f: 90, f2: 45, type: "triangle", peak: 0.7 });
    noise(o, t + 0.05, 1.4, { type: "bandpass", f: 2500, f2: 1200, q: 0.8, peak: 0.12, a: 0.1 }); // fizz
  },
  dry() {
    if (!ok()) return;
    noise(out(), now(), 0.04, { type: "highpass", f: 3500, peak: 0.25 });
  },
  reload(w) {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.5);
    const n = w === "shotgun" ? 4 : w === "flare" ? 3 : 2;
    for (let i = 0; i < n; i++) noise(o, t + 0.25 + i * (w === "shotgun" ? 0.38 : 0.55), 0.06, { type: "highpass", f: 2200 + i * 300, peak: 0.6 });
  },
  switchWeapon() {
    if (!ok()) return;
    noise(out(undefined, undefined, 0.3), now(), 0.08, { type: "bandpass", f: 2500, q: 2, peak: 0.6 });
  },
  flashClick(on) {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.35);
    noise(o, t, 0.03, { type: "highpass", f: on ? 4000 : 3000, peak: 0.8 });
    tone(o, t, 0.04, { f: on ? 1800 : 1200, type: "square", peak: 0.08 });
  },
  hurt() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.7);
    tone(o, t, 0.2, { f: 140, f2: 80, type: "square", peak: 0.15 });
    noise(o, t, 0.18, { type: "lowpass", f: 800, peak: 0.6 });
  },
  hitmark(head) {
    if (!ok()) return;
    tone(out(undefined, undefined, 0.25), now(), 0.06, { f: head ? 1800 : 1200, type: "square", peak: 0.2 });
  },
  voice(type, x, z, loud = 1) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.7 * loud);
    if (type === "crawler") {
      growl(o, t, 260, 0.5, 30, 1800, 0.35);
      noise(o, t, 0.4, { type: "bandpass", f: 3200, q: 3, peak: 0.12, a: 0.05 }); // chittering
    } else if (type === "brute") growl(o, t, 48, 1.6, 9, 320, 0.7);
    else {
      growl(o, t, 95, 1.1, 11, 480, 0.45); // a moan that was once a voice
    }
  },
  roar(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 1.4);
    growl(o, t, 42, 2.0, 8, 280, 0.9);
    tone(o, t, 1.6, { f: 45, f2: 28, type: "sawtooth", peak: 0.4, a: 0.1 });
  },
  enemyStrike(type, x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.8);
    noise(o, t, 0.18, { type: "bandpass", f: type === "crawler" ? 1800 : 900, f2: 300, q: 0.8, peak: 0.6 });
  },
  enemyDie(type, x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.7);
    growl(o, t, type === "crawler" ? 300 : type === "brute" ? 50 : 120, type === "brute" ? 2.2 : 0.8, 6, 500, 0.4);
    noise(o, t + 0.25, 0.35, { type: "lowpass", f: 400, peak: 0.7 }); // body hits the ground
  },
  step(x, z, heavy) {
    if (!ok()) return;
    const t = now(), o = out(x, z, heavy ? 0.6 : 0.24);
    noise(o, t, heavy ? 0.18 : 0.08, { type: "lowpass", f: heavy ? 280 : 900, peak: 0.6 }); // gravel crunch
  },
  jump() {
    if (!ok()) return;
    noise(out(undefined, undefined, 0.2), now(), 0.1, { type: "bandpass", f: 600, peak: 0.5 });
  },
  land() {
    if (!ok()) return;
    noise(out(undefined, undefined, 0.35), now(), 0.14, { type: "lowpass", f: 500, peak: 0.8 });
  },
  door(x, z, heavy) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.85);
    noise(o, t, heavy ? 2.2 : 0.6, { type: "bandpass", f: heavy ? 200 : 500, f2: heavy ? 140 : 260, q: 3, peak: 0.6, a: 0.05 });
    tone(o, t, heavy ? 2.2 : 0.5, { f: heavy ? 55 : 110, f2: heavy ? 45 : 80, type: "sawtooth", peak: 0.14, a: 0.05 });
    noise(o, t + (heavy ? 2.1 : 0.5), 0.25, { type: "lowpass", f: 380, peak: 0.9 });
  },
  doorBang(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 1);
    noise(o, t, 0.25, { type: "lowpass", f: 600, peak: 1 });
    tone(o, t, 0.3, { f: 90, f2: 60, type: "triangle", peak: 0.6 });
  },
  denied() {
    if (!ok()) return;
    const t = now();
    tone(out(undefined, undefined, 0.3), t, 0.15, { f: 180, type: "square", peak: 0.2 });
    tone(out(undefined, undefined, 0.3), t + 0.12, 0.15, { f: 140, type: "square", peak: 0.2 });
  },
  pickup(kind) {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.45);
    const notes = kind === "h" ? [523, 784] : "GSY".includes(kind) ? [440, 554, 659, 880] : "kux".includes(kind) ? [660, 880, 1320] : [660, 990];
    notes.forEach((f, i) => tone(o, t + i * 0.07, 0.18, { f, type: "triangle", peak: 0.5 }));
  },
  lever(fail) {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.6);
    noise(o, t, 0.08, { type: "highpass", f: 1800, peak: 0.8 });
    if (fail) {
      tone(o, t + 0.1, 0.5, { f: 160, f2: 90, type: "square", peak: 0.18 });
      noise(o, t + 0.15, 0.3, { type: "lowpass", f: 700, peak: 0.6 });
    } else tone(o, t + 0.1, 0.35, { f: 220, f2: 440, type: "square", peak: 0.12 });
  },
  keypadBeep() {
    if (!ok()) return;
    tone(out(undefined, undefined, 0.25), now(), 0.06, { f: 1400, type: "square", peak: 0.15 });
  },
  code(okCode) {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.4);
    if (okCode) [880, 1175, 1568].forEach((f, i) => tone(o, t + i * 0.1, 0.18, { f, type: "square", peak: 0.15 }));
    else [300, 200].forEach((f, i) => tone(o, t + i * 0.18, 0.2, { f, type: "square", peak: 0.2 }));
  },
  paper() {
    if (!ok()) return;
    noise(out(undefined, undefined, 0.35), now(), 0.3, { type: "highpass", f: 3000, peak: 0.4, a: 0.05 });
  },
  generator(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 1);
    // crank, cough, then the engine catches
    for (let i = 0; i < 3; i++) noise(o, t + i * 0.35, 0.2, { type: "lowpass", f: 300, peak: 0.8 });
    for (let i = 0; i < 16; i++) tone(o, t + 1.1 + i * 0.07, 0.07, { f: 55 + i * 2, type: "sawtooth", peak: 0.3 });
    tone(o, t + 2.2, 1.6, { f: 70, type: "sawtooth", peak: 0.15, a: 0.1 });
  },
  elevator(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 1);
    noise(o, t, 0.3, { type: "highpass", f: 1500, peak: 0.6 }); // relay clack
    tone(o, t + 0.3, 3.5, { f: 50, f2: 62, type: "sawtooth", peak: 0.25, a: 0.4 }); // motor
    noise(o, t + 0.3, 3.5, { type: "bandpass", f: 900, f2: 500, q: 4, peak: 0.12, a: 0.5 }); // cable squeal
  },
  cart(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.9);
    noise(o, t, 1.6, { type: "bandpass", f: 260, q: 1, peak: 0.6, a: 0.1 });
    tone(o, t, 1.6, { f: 1200, f2: 1000, type: "triangle", peak: 0.05, a: 0.2 }); // squeaking wheels
    noise(o, t + 1.5, 0.3, { type: "lowpass", f: 300, peak: 1 });
  },
  rockBreak(x, z, big) {
    if (!ok()) return;
    const t = now(), o = out(x, z, big ? 1.3 : 0.5);
    noise(o, t, big ? 1.4 : 0.15, { type: "lowpass", f: big ? 900 : 1800, f2: 150, peak: 1.2 });
    if (big) tone(o, t, 1.2, { f: 60, f2: 30, type: "triangle", peak: 0.8 });
  },
  objective() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.5);
    [392, 523].forEach((f, i) => tone(o, t + i * 0.12, 0.35, { f, type: "triangle", peak: 0.4 }));
  },
  complete() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.6);
    [262, 330, 392, 523].forEach((f, i) => tone(o, t + i * 0.14, 0.6, { f, type: "triangle", peak: 0.4 }));
  },
  victory() {
    if (!init()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (muted) return;
    const t = now() + 0.05, o = out(undefined, undefined, 0.7);
    const seq = [[392, 0.3], [523, 0.3], [659, 0.3], [784, 0.6], [659, 0.3], [1047, 1.2]];
    let tt = t;
    for (const [f, d] of seq) {
      tone(o, tt, d + 0.15, { f, type: "triangle", peak: 0.3 });
      tone(o, tt, d + 0.15, { f: f / 2, type: "sine", peak: 0.25 });
      tt += d;
    }
    noise(o, t, 4, { type: "bandpass", f: 600, q: 0.4, peak: 0.08, a: 1 }); // wind on the surface
  },
  bossIntro(x, z) {
    if (!ok()) return;
    this.roar(x, z);
    const t = now(), o = out(undefined, undefined, 0.7);
    noise(o, t, 2, { type: "lowpass", f: 200, peak: 0.9, a: 0.3 }); // the cave shakes
  },
  slam(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 1.3);
    noise(o, t, 0.9, { type: "lowpass", f: 700, f2: 80, peak: 1.4 });
    tone(o, t, 0.9, { f: 60, f2: 25, type: "sine", peak: 1 });
  },
  whoosh(x, z) {
    if (!ok()) return;
    noise(out(x, z, 0.6), now(), 0.5, { type: "bandpass", f: 400, f2: 1600, q: 1.5, peak: 0.4, a: 0.1 });
  },
  boom(x, z) {
    if (!ok()) return;
    this.rockBreak(x, z, true);
  },
  chargeWarn(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.8);
    growl(o, t, 60, 0.9, 14, 300, 0.6);
    noise(o, t, 0.8, { type: "bandpass", f: 200, f2: 900, q: 1, peak: 0.25, a: 0.2 });
  },
  scare(kind, x, z) {
    if (!ok()) return;
    const t = now();
    if (kind === "growl") this.voice(Math.random() < 0.5 ? "miner" : "crawler", x, z, 1.4);
    if (kind === "bang" || kind === "ambush") {
      const o = out(x, z, 1.2);
      noise(o, t, 0.6, { type: "lowpass", f: 900, f2: 120, peak: 1.2 });
      tone(o, t, 1.4, { f: 620, f2: 600, type: "sine", peak: 0.08, a: 0.01 }); // metal ring
    }
    if (kind === "dust" || kind === "rocks") this.rockBreak(x, z, true);
    if (kind === "blackout") {
      const o = out(undefined, undefined, 0.8);
      tone(o, t, 0.4, { f: 120, f2: 30, type: "sawtooth", peak: 0.4 });
      noise(o, t, 0.1, { type: "highpass", f: 3000, peak: 0.5 });
    }
  },
  /** deep rumble + air + random distant noises; `machinery` adds a hum */
  startAmbient(level = 1, machinery = false) {
    if (!ctx || ambOn) return;
    ambOn = true;
    const t = now();
    const drone = (f, g) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = 0;
      gg.gain.setTargetAtTime(g, t, 2);
      o.connect(gg).connect(ambBus);
      o.start();
      ambNodes.push(o, gg);
    };
    drone(36 + level * 0.5, 0.14);
    drone(54.3 + level, 0.04);
    if (machinery) {
      drone(100, 0.03);
      drone(150.5, 0.015);
    }
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 220;
    const gg = ctx.createGain();
    gg.gain.value = 0;
    gg.gain.setTargetAtTime(0.1, t, 2);
    s.connect(f).connect(gg).connect(ambBus);
    s.start();
    ambNodes.push(s, gg);
    const tick = () => {
      if (!ambOn) return;
      if (ok()) {
        const r = Math.random();
        const tt = now();
        const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 12;
        const x = L.x + Math.cos(a) * d, z = L.z + Math.sin(a) * d;
        if (r < 0.32) {
          const o = out(x, z, 0.3, ambBus); // dripping water
          const n = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) tone(o, tt + i * (0.5 + Math.random() * 0.4), 0.09, { f: 1500 + Math.random() * 700, f2: 800, type: "sine", peak: 0.25 });
        } else if (r < 0.52) {
          const o = out(x, z, 0.3, ambBus); // timber creak
          tone(o, tt, 1.3, { f: 140 + Math.random() * 80, f2: 110, type: "sawtooth", peak: 0.05, a: 0.4 });
          noise(o, tt, 1.2, { type: "bandpass", f: 500, q: 6, peak: 0.08, a: 0.4 });
        } else if (r < 0.7) this.voice(Math.random() < 0.4 ? "crawler" : "miner", x, z, 0.3);
        else if (r < 0.8) {
          const o = out(x, z, 0.3, ambBus); // pebbles falling
          for (let i = 0; i < 5; i++) noise(o, tt + i * 0.08 + Math.random() * 0.05, 0.05, { type: "bandpass", f: 2000 + Math.random() * 1500, q: 3, peak: 0.4 });
        } else if (r < 0.88) {
          const o = out(x, z, 0.35, ambBus); // distant metal clank
          tone(o, tt, 1.4, { f: 300 + Math.random() * 300, type: "sine", peak: 0.08 });
          noise(o, tt, 0.2, { type: "lowpass", f: 800, peak: 0.4 });
        }
      }
      ambTimer = setTimeout(tick, 3500 + Math.random() * 6000);
    };
    ambTimer = setTimeout(tick, 2500);
  },
  stopAmbient() {
    ambOn = false;
    clearTimeout(ambTimer);
    for (const n of ambNodes) {
      try {
        if (n.stop) n.stop();
        n.disconnect();
      } catch {
        /* already stopped */
      }
    }
    ambNodes = [];
  },
  heartbeat(k) {
    if (!ok() || k <= 0) return;
    const t = now();
    if (heart && t - heart < 0.85 - k * 0.25) return;
    heart = t;
    const o = out(undefined, undefined, 0.5 * k);
    tone(o, t, 0.12, { f: 60, f2: 40, type: "sine", peak: 1 });
    tone(o, t + 0.18, 0.12, { f: 55, f2: 38, type: "sine", peak: 0.7 });
  },
  stopAll() {
    this.stopAmbient();
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
      master = sfxBus = ambBus = null;
      heart = null;
    }
  },
};
