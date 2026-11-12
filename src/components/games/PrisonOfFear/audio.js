/**
 * Synthesised WebAudio for Prison of Fear (no audio files). Nothing is
 * created before the first user gesture (`unlock`). Positional sounds are
 * panned and attenuated relative to the listener set with `listen()`.
 */
let ctx = null;
let master = null, sfxBus = null, ambBus = null;
let noiseBuf = null;
let muted = false;
let vol = 0.8;
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
  ambBus.gain.value = 0.55;
  ambBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

const now = () => ctx.currentTime;

function out(x, z, gain = 1) {
  // returns a node chain end (gain → panner → bus)
  const g = ctx.createGain();
  let pan = 0, att = 1;
  if (x !== undefined && z !== undefined) {
    const dx = x - L.x, dz = z - L.z;
    const d = Math.hypot(dx, dz);
    att = 1 / (1 + Math.max(0, d - 2) * 0.18);
    const ang = Math.atan2(-dx, -dz) - L.yaw;
    pan = -Math.sin(ang) * Math.min(1, d / 3);
  }
  g.gain.value = gain * att;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(sfxBus);
  } else g.connect(sfxBus);
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
    noise(o, t + 0.02, 0.5, { type: "bandpass", f: 900, f2: 300, q: 0.6, peak: 0.12, a: 0.02 }); // room tail
  },
  shotgun() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 1);
    noise(o, t, 0.35, { type: "lowpass", f: 3000, f2: 200, peak: 1.2 });
    tone(o, t, 0.25, { f: 110, f2: 35, type: "sawtooth", peak: 0.7 });
    noise(o, t + 0.03, 0.9, { type: "bandpass", f: 600, f2: 200, q: 0.5, peak: 0.18, a: 0.03 });
    // pump
    noise(o, t + 0.32, 0.06, { type: "highpass", f: 2000, peak: 0.25 });
    noise(o, t + 0.45, 0.07, { type: "highpass", f: 1500, peak: 0.3 });
  },
  dry() {
    if (!ok()) return;
    const t = now();
    noise(out(), t, 0.04, { type: "highpass", f: 3500, peak: 0.25 });
  },
  reload(w) {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.5);
    const n = w === "shotgun" ? 4 : 2;
    for (let i = 0; i < n; i++) noise(o, t + 0.25 + i * (w === "shotgun" ? 0.38 : 0.55), 0.06, { type: "highpass", f: 2200 + i * 300, peak: 0.6 });
  },
  switchWeapon() {
    if (!ok()) return;
    noise(out(undefined, undefined, 0.3), now(), 0.08, { type: "bandpass", f: 2500, q: 2, peak: 0.6 });
  },
  punch(hit, heavy) {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.8);
    noise(o, t, 0.12, { type: "bandpass", f: 900, f2: 300, q: 0.8, peak: 0.35 }); // whoosh
    if (hit) {
      tone(o, t + 0.05, 0.14, { f: heavy ? 120 : 170, f2: 50, type: "sine", peak: 1 });
      noise(o, t + 0.05, 0.1, { type: "lowpass", f: 1400, peak: 0.8 });
    }
  },
  block(perfect) {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.7);
    tone(o, t, 0.25, { f: perfect ? 900 : 300, f2: perfect ? 600 : 150, type: "triangle", peak: 0.5 });
    noise(o, t, 0.12, { type: "bandpass", f: 1500, peak: 0.5 });
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
  growl(type, x, z, loud = 1) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.7 * loud);
    const base = type === "brute" ? 55 : type === "creature" ? 180 : 95;
    const dur = type === "creature" ? 0.6 : 1.1;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), t);
    osc.frequency.linearRampToValueAtTime(base * (type === "creature" ? 1.8 : 0.75), t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = type === "creature" ? 28 : 11;
    const lg = ctx.createGain();
    lg.gain.value = base * 0.25;
    lfo.connect(lg).connect(osc.frequency);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = type === "creature" ? 900 : 420;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f).connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    noise(o, t, dur * 0.8, { type: "bandpass", f: type === "creature" ? 2400 : 700, q: 2, peak: 0.15, a: 0.1 });
  },
  roar(x, z) {
    if (!ok()) return;
    this.growl("brute", x, z, 1.8);
    const t = now();
    tone(out(x, z, 1), t, 1.6, { f: 45, f2: 30, type: "sawtooth", peak: 0.5, a: 0.1 });
  },
  enemyStrike(type, x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.8);
    noise(o, t, 0.18, { type: "bandpass", f: type === "brute" ? 300 : 1200, f2: 200, q: 0.8, peak: 0.6 });
    if (type === "brute") tone(o, t + 0.05, 0.4, { f: 70, f2: 30, type: "sine", peak: 1 });
  },
  enemyDie(type, x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.7);
    tone(o, t, 0.6, { f: type === "creature" ? 400 : type === "brute" ? 80 : 160, f2: 40, type: "sawtooth", peak: 0.3 });
    noise(o, t + 0.25, 0.25, { type: "lowpass", f: 500, peak: 0.6 });
  },
  step(x, z, heavy) {
    if (!ok()) return;
    const t = now(), o = out(x, z, heavy ? 0.6 : 0.25);
    noise(o, t, heavy ? 0.16 : 0.08, { type: "lowpass", f: heavy ? 300 : 700, peak: 0.6 });
  },
  door(x, z, gate) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.8);
    noise(o, t, gate ? 2.0 : 0.6, { type: "bandpass", f: gate ? 220 : 500, f2: gate ? 160 : 260, q: 3, peak: 0.6, a: 0.05 });
    tone(o, t, gate ? 2 : 0.5, { f: gate ? 60 : 110, f2: gate ? 50 : 80, type: "sawtooth", peak: 0.12, a: 0.05 });
    noise(o, t + (gate ? 1.9 : 0.5), 0.2, { type: "lowpass", f: 400, peak: 0.8 });
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
    const notes = kind === "h" || kind === "m" ? [520, 780] : kind === "S" || kind === "k" ? [440, 660, 880] : [660, 990];
    notes.forEach((f, i) => tone(o, t + i * 0.07, 0.18, { f, type: "triangle", peak: 0.5 }));
  },
  switchOn() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.6);
    noise(o, t, 0.08, { type: "highpass", f: 1800, peak: 0.8 });
    tone(o, t + 0.1, 0.4, { f: 220, f2: 440, type: "square", peak: 0.15 });
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
  scare(kind, x, z) {
    if (!ok()) return;
    const t = now();
    if (kind === "bang" || kind === "ambush") {
      const o = out(x, z, 1.2);
      noise(o, t, 0.6, { type: "lowpass", f: 900, f2: 120, peak: 1.2 });
      tone(o, t, 0.8, { f: 70, f2: 40, type: "triangle", peak: 0.8 });
      // metal ring
      tone(o, t, 1.4, { f: 620, f2: 600, type: "sine", peak: 0.08, a: 0.01 });
    }
    if (kind === "scream") {
      const o = out(x, z, 0.5);
      tone(o, t, 1.4, { f: 700, f2: 380, type: "sawtooth", peak: 0.12, a: 0.2 });
      noise(o, t, 1.4, { type: "bandpass", f: 1600, f2: 900, q: 3, peak: 0.15, a: 0.2 });
    }
    if (kind === "blackout") {
      const o = out(undefined, undefined, 0.8);
      tone(o, t, 0.4, { f: 120, f2: 30, type: "sawtooth", peak: 0.4 }); // power-down
      noise(o, t, 0.1, { type: "highpass", f: 3000, peak: 0.5 });
    }
  },
  /** low drone + random distant prison noises; `level` picks the mood */
  startAmbient(level = 1, outdoor = false) {
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
    drone(41 + level, 0.12);
    drone(61.5 + level * 1.3, 0.05);
    // air / wind
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = outdoor ? 500 : 260;
    const gg = ctx.createGain();
    gg.gain.value = 0;
    gg.gain.setTargetAtTime(outdoor ? 0.16 : 0.09, t, 2);
    s.connect(f).connect(gg).connect(ambBus);
    s.start();
    ambNodes.push(s, gg);
    const tick = () => {
      if (!ambOn) return;
      if (ok()) {
        const r = Math.random();
        const tt = now();
        const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 10;
        const x = L.x + Math.cos(a) * d, z = L.z + Math.sin(a) * d;
        if (r < 0.3) {
          const o = out(x, z, 0.35); // distant clank
          tone(o, tt, 1.2, { f: 300 + Math.random() * 400, type: "sine", peak: 0.08 });
          noise(o, tt, 0.2, { type: "lowpass", f: 800, peak: 0.4 });
        } else if (r < 0.55) this.growl(Math.random() < 0.3 ? "creature" : "infected", x, z, 0.35);
        else if (r < 0.7) {
          const o = out(x, z, 0.25); // dripping
          for (let i = 0; i < 3; i++) tone(o, tt + i * 0.6, 0.08, { f: 1400 + Math.random() * 600, f2: 900, type: "sine", peak: 0.2 });
        } else if (r < 0.8) this.scare("scream", x, z);
      }
      ambTimer = setTimeout(tick, 5000 + Math.random() * 9000);
    };
    ambTimer = setTimeout(tick, 3000);
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
  /** heartbeat when health is low (0..1 strength) */
  heartbeat(k) {
    if (!ok()) return;
    if (k <= 0) return;
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
    }
  },
};
