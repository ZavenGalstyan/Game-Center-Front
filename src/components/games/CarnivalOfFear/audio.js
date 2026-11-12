/**
 * Synthesised WebAudio for Carnival of Fear (no audio files). Nothing is
 * created before the first user gesture (`unlock`), so autoplay rules are
 * respected. Positional sounds are panned and attenuated relative to the
 * listener set with `listen()`. The ambience is a detuned, slightly
 * out-of-tune calliope waltz plus wind and distant laughter.
 */
let ctx = null;
let master = null, sfxBus = null, ambBus = null, musicBus = null;
let noiseBuf = null;
let muted = false;
let vol = 0.8;
let musicVol = 0.6;
let ambOn = false;
let ambNodes = [];
let ambTimer = null;
let musicTimer = null;
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
  musicBus = ctx.createGain();
  musicBus.gain.value = musicVol * 0.5;
  musicBus.connect(master);
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
function tone(dest, t, dur, { f = 220, f2 = null, type = "sine", a = 0.005, peak = 0.5, detune = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.detune.value = detune;
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

/** "ha-ha-ha": pulses of a buzzy voice through a vowel formant */
function laugh(dest, t, { base = 220, n = 5, gap = 0.13, fall = 0.85, formant = 900, peak = 0.35, wobble = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const tt = t + i * gap;
    const f = base * Math.pow(fall, i) * (1 + (Math.random() - 0.5) * wobble);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f * 1.15, tt);
    o.frequency.exponentialRampToValueAtTime(f, tt + gap * 0.7);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = formant;
    bp.Q.value = 3;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = formant * 2.6;
    bp2.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.exponentialRampToValueAtTime(peak, tt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + gap * 0.85);
    o.connect(bp).connect(g);
    o.connect(bp2).connect(g);
    g.connect(dest);
    o.start(tt);
    o.stop(tt + gap);
    noise(dest, tt, 0.05, { type: "highpass", f: 3000, peak: peak * 0.25 }); // breathy "h"
  }
}

const ok = () => ctx && ctx.state === "running" && !muted;

// A-minor waltz (calliope), as [semitones from A3 | null, beats]
const MELODY = [
  [12, 1], [11, 1], [12, 1], [7, 2], [3, 1], [5, 1], [3, 1], [0, 3],
  [12, 1], [11, 1], [12, 1], [15, 2], [14, 1], [12, 1], [11, 1], [12, 3],
  [8, 1], [7, 1], [5, 1], [3, 2], [5, 1], [7, 1], [8, 1], [7, 3],
  [3, 1], [2, 1], [3, 1], [-1, 2], [2, 1], [0, 3], [null, 3],
];
const BASS = [-12, -5, -9, -5, -16, -9, -12, -5];

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
  setMusic(v) {
    musicVol = Math.max(0, Math.min(1, v));
    if (musicBus) musicBus.gain.setTargetAtTime(musicVol * 0.5, ctx.currentTime, 0.1);
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
    noise(o, t + 0.02, 0.5, { type: "bandpass", f: 900, f2: 300, q: 0.6, peak: 0.12, a: 0.02 });
  },
  shotgun() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 1);
    noise(o, t, 0.35, { type: "lowpass", f: 3000, f2: 200, peak: 1.2 });
    tone(o, t, 0.25, { f: 110, f2: 35, type: "sawtooth", peak: 0.7 });
    noise(o, t + 0.03, 0.9, { type: "bandpass", f: 600, f2: 200, q: 0.5, peak: 0.18, a: 0.03 });
    noise(o, t + 0.32, 0.06, { type: "highpass", f: 2000, peak: 0.25 });
    noise(o, t + 0.45, 0.07, { type: "highpass", f: 1500, peak: 0.3 });
  },
  blaster() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.5);
    const f = 900 + Math.random() * 300;
    tone(o, t, 0.12, { f, f2: f * 0.35, type: "square", peak: 0.25 });
    tone(o, t, 0.1, { f: f * 1.5, f2: f * 0.5, type: "sine", peak: 0.3 });
    noise(o, t, 0.05, { type: "bandpass", f: 4000, q: 2, peak: 0.3 });
  },
  dry() {
    if (!ok()) return;
    noise(out(), now(), 0.04, { type: "highpass", f: 3500, peak: 0.25 });
  },
  reload(w) {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.5);
    if (w === "blaster") {
      tone(o, t + 0.2, 1.1, { f: 200, f2: 1400, type: "sawtooth", peak: 0.07, a: 0.2 }); // charging whine
      noise(o, t + 0.15, 0.06, { type: "highpass", f: 2500, peak: 0.5 });
      tone(o, t + 1.35, 0.1, { f: 1760, type: "triangle", peak: 0.3 });
      return;
    }
    const n = w === "shotgun" ? 4 : 2;
    for (let i = 0; i < n; i++) noise(o, t + 0.25 + i * (w === "shotgun" ? 0.38 : 0.5), 0.06, { type: "highpass", f: 2200 + i * 300, peak: 0.6 });
  },
  switchWeapon() {
    if (!ok()) return;
    noise(out(undefined, undefined, 0.3), now(), 0.08, { type: "bandpass", f: 2500, q: 2, peak: 0.6 });
  },
  hurt(kind) {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.7);
    if (kind === "shock") {
      for (let i = 0; i < 4; i++) noise(o, t + i * 0.04, 0.05, { type: "bandpass", f: 3000 + Math.random() * 2000, q: 3, peak: 0.6 });
      tone(o, t, 0.2, { f: 60, type: "square", peak: 0.2 });
      return;
    }
    tone(o, t, 0.2, { f: 140, f2: 80, type: "square", peak: 0.15 });
    noise(o, t, 0.18, { type: "lowpass", f: 800, peak: 0.6 });
  },
  hitmark(head) {
    if (!ok()) return;
    tone(out(undefined, undefined, 0.25), now(), 0.06, { f: head ? 1800 : 1200, type: "square", peak: 0.2 });
  },
  armorPing() {
    if (!ok()) return;
    tone(out(undefined, undefined, 0.3), now(), 0.25, { f: 2400, f2: 2200, type: "triangle", peak: 0.2 });
  },
  /** enemy voices: giggles for clowns, cackles for jesters, grunts for the armored */
  voice(type, x, z, loud = 1) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.75 * loud);
    if (type === "jester") laugh(o, t, { base: 520, n: 6, gap: 0.08, fall: 0.97, formant: 1600, peak: 0.25, wobble: 0.2 });
    else if (type === "armored") {
      laugh(o, t, { base: 95, n: 3, gap: 0.2, fall: 0.9, formant: 500, peak: 0.4 });
      noise(o, t, 0.3, { type: "bandpass", f: 300, q: 1, peak: 0.2 });
    } else if (type === "king") laugh(o, t, { base: 120, n: 7, gap: 0.17, fall: 0.94, formant: 650, peak: 0.55, wobble: 0.05 });
    else laugh(o, t, { base: 260, n: 4 + Math.floor(Math.random() * 3), gap: 0.12, fall: 0.9, formant: 1000, peak: 0.3, wobble: 0.1 });
  },
  horn(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.5);
    tone(o, t, 0.25, { f: 420, f2: 380, type: "sawtooth", peak: 0.15 });
    tone(o, t + 0.25, 0.3, { f: 330, f2: 300, type: "sawtooth", peak: 0.15 });
  },
  enemyStrike(type, x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.8);
    noise(o, t, 0.18, { type: "bandpass", f: type === "armored" ? 300 : 1200, f2: 200, q: 0.8, peak: 0.6 });
    if (type === "armored") tone(o, t + 0.05, 0.4, { f: 70, f2: 30, type: "sine", peak: 1 });
  },
  enemyDie(type, x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.7);
    // deflating squeak + confetti pop
    tone(o, t, 0.5, { f: type === "jester" ? 900 : type === "armored" ? 200 : 520, f2: type === "armored" ? 50 : 120, type: "square", peak: 0.12 });
    noise(o, t, 0.08, { type: "highpass", f: 1800, peak: 0.6 });
    noise(o, t + 0.2, 0.3, { type: "lowpass", f: 500, peak: 0.5 });
    if (type === "king") {
      laugh(o, t, { base: 160, n: 8, gap: 0.2, fall: 0.86, formant: 600, peak: 0.6 });
      tone(o, t + 0.3, 2.5, { f: 80, f2: 30, type: "sawtooth", peak: 0.4, a: 0.1 });
    }
  },
  step(x, z, heavy) {
    if (!ok()) return;
    const t = now(), o = out(x, z, heavy ? 0.6 : 0.22);
    noise(o, t, heavy ? 0.16 : 0.08, { type: "lowpass", f: heavy ? 300 : 700, peak: 0.6 });
  },
  jump() {
    if (!ok()) return;
    noise(out(undefined, undefined, 0.2), now(), 0.1, { type: "bandpass", f: 600, peak: 0.5 });
  },
  land() {
    if (!ok()) return;
    noise(out(undefined, undefined, 0.35), now(), 0.12, { type: "lowpass", f: 400, peak: 0.8 });
  },
  door(x, z, gate) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.8);
    noise(o, t, gate ? 2.0 : 0.6, { type: "bandpass", f: gate ? 220 : 500, f2: gate ? 160 : 260, q: 3, peak: 0.6, a: 0.05 });
    tone(o, t, gate ? 2 : 0.5, { f: gate ? 60 : 110, f2: gate ? 50 : 80, type: "sawtooth", peak: 0.12, a: 0.05 });
    if (gate) for (let i = 0; i < 3; i++) tone(o, t + 0.2 + i * 0.5, 0.3, { f: 880 * (1 + i * 0.25), type: "triangle", peak: 0.06 }); // bell chimes
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
    const notes = kind === "h" ? [523, 784] : "GSB".includes(kind) ? [440, 554, 659, 880] : kind === "f" ? [660, 880, 1320] : [660, 990];
    notes.forEach((f, i) => tone(o, t + i * 0.07, 0.18, { f, type: "triangle", peak: 0.5 }));
  },
  lever() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.6);
    noise(o, t, 0.08, { type: "highpass", f: 1800, peak: 0.8 });
    tone(o, t + 0.1, 0.4, { f: 220, f2: 440, type: "square", peak: 0.12 });
    tone(o, t + 0.25, 0.5, { f: 1320, type: "triangle", peak: 0.15 }); // bell
  },
  fortune() {
    if (!ok()) return;
    const t = now(), o = out(undefined, undefined, 0.6);
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(o, t + i * 0.09, 0.25, { f, type: "triangle", peak: 0.3 }));
    laugh(o, t + 0.6, { base: 300, n: 4, gap: 0.11, fall: 0.92, formant: 1100, peak: 0.25 });
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
    const seq = [[523, 0.2], [659, 0.2], [784, 0.2], [1047, 0.5], [784, 0.2], [1047, 0.9]];
    let tt = t;
    for (const [f, d] of seq) {
      tone(o, tt, d + 0.1, { f, type: "square", peak: 0.12 });
      tone(o, tt, d + 0.1, { f: f / 2, type: "triangle", peak: 0.2 });
      tt += d;
    }
  },
  bossIntro(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 1.2);
    tone(o, t, 1.8, { f: 55, f2: 40, type: "sawtooth", peak: 0.5, a: 0.05 });
    [220, 233, 220, 207].forEach((f, i) => tone(o, t + i * 0.3, 0.32, { f, type: "square", peak: 0.15 }));
    laugh(o, t + 0.5, { base: 130, n: 9, gap: 0.18, fall: 0.95, formant: 620, peak: 0.6, wobble: 0.05 });
  },
  slam(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 1.3);
    noise(o, t, 0.8, { type: "lowpass", f: 700, f2: 80, peak: 1.4 });
    tone(o, t, 0.9, { f: 60, f2: 25, type: "sine", peak: 1 });
  },
  whoosh(x, z) {
    if (!ok()) return;
    noise(out(x, z, 0.6), now(), 0.5, { type: "bandpass", f: 400, f2: 1600, q: 1.5, peak: 0.4, a: 0.1 });
  },
  boom(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 1.1);
    noise(o, t, 0.6, { type: "lowpass", f: 1500, f2: 120, peak: 1.2 });
    tone(o, t, 0.4, { f: 90, f2: 35, type: "triangle", peak: 0.7 });
    noise(o, t + 0.05, 0.4, { type: "highpass", f: 3000, peak: 0.15 }); // confetti crackle
  },
  chargeWarn(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.8);
    tone(o, t, 0.8, { f: 70, f2: 140, type: "sawtooth", peak: 0.3, a: 0.1 });
    noise(o, t, 0.8, { type: "bandpass", f: 200, f2: 900, q: 1, peak: 0.25, a: 0.2 });
  },
  zap(x, z) {
    if (!ok()) return;
    const t = now(), o = out(x, z, 0.5);
    for (let i = 0; i < 3; i++) noise(o, t + i * 0.05, 0.05, { type: "bandpass", f: 2500 + Math.random() * 3000, q: 4, peak: 0.6 });
  },
  scare(kind, x, z) {
    if (!ok()) return;
    const t = now();
    if (kind === "laugh") this.voice("clown", x, z, 1.4);
    if (kind === "popup") {
      const o = out(x, z, 1.1);
      noise(o, t, 0.12, { type: "highpass", f: 1500, peak: 0.8 });
      tone(o, t, 0.4, { f: 300, f2: 900, type: "square", peak: 0.15 }); // boing
      laugh(o, t + 0.15, { base: 340, n: 5, gap: 0.09, fall: 0.96, formant: 1300, peak: 0.4 });
    }
    if (kind === "ambush") {
      const o = out(x, z, 1.1);
      noise(o, t, 0.6, { type: "lowpass", f: 900, f2: 120, peak: 1.1 });
      this.horn(x, z);
    }
    if (kind === "blackout") {
      const o = out(undefined, undefined, 0.8);
      tone(o, t, 0.4, { f: 120, f2: 30, type: "sawtooth", peak: 0.4 });
      noise(o, t, 0.1, { type: "highpass", f: 3000, peak: 0.5 });
    }
  },
  /** music + wind + random distant carnival noises */
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
    drone(55, 0.07);
    drone(55 * 1.498 + level * 0.3, 0.03);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = outdoor ? 500 : 260;
    const gg = ctx.createGain();
    gg.gain.value = 0;
    gg.gain.setTargetAtTime(outdoor ? 0.14 : 0.07, t, 2);
    s.connect(f).connect(gg).connect(ambBus);
    s.start();
    ambNodes.push(s, gg);
    // calliope waltz, slowed and detuned more on later levels
    const beat = 0.36 + level * 0.012;
    const wob = 6 + level * 2.5;
    let mi = 0;
    let barT = now() + 0.5;
    const playBar = () => {
      if (!ambOn) return;
      if (ctx && ctx.state === "running") {
        const o = out(undefined, undefined, 1, musicBus);
        let tt = Math.max(barT, now() + 0.05);
        let beats = 0;
        while (beats < 6) {
          const [n, b] = MELODY[mi % MELODY.length];
          mi++;
          if (n !== null) {
            const fq = 220 * Math.pow(2, n / 12);
            const d = b * beat;
            tone(o, tt, d * 0.95, { f: fq, type: "square", peak: 0.035, a: 0.02, detune: (Math.random() - 0.5) * wob });
            tone(o, tt, d * 0.95, { f: fq * 2, type: "triangle", peak: 0.025, a: 0.02, detune: (Math.random() - 0.5) * wob * 2 });
          }
          tt += b * beat;
          beats += b;
        }
        // oom-pah-pah
        const bn = BASS[Math.floor(mi / 6) % BASS.length];
        const bf = 220 * Math.pow(2, bn / 12);
        for (let k = 0; k < 6; k++) {
          const bt = barT + k * beat;
          if (k % 3 === 0) tone(o, bt, beat * 0.9, { f: bf / 2, type: "triangle", peak: 0.08 });
          else tone(o, bt, beat * 0.5, { f: bf, type: "square", peak: 0.02, detune: wob });
        }
        barT = tt;
      } else barT = now() + 0.5;
      musicTimer = setTimeout(playBar, Math.max(200, (barT - now() - 0.6) * 1000));
    };
    playBar();
    const tick = () => {
      if (!ambOn) return;
      if (ok()) {
        const r = Math.random();
        const tt = now();
        const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 10;
        const x = L.x + Math.cos(a) * d, z = L.z + Math.sin(a) * d;
        if (r < 0.35) this.voice(Math.random() < 0.3 ? "jester" : "clown", x, z, 0.35);
        else if (r < 0.5) {
          const o = out(x, z, 0.3); // creaking ride
          tone(o, tt, 1.4, { f: 180 + Math.random() * 100, f2: 120, type: "sawtooth", peak: 0.04, a: 0.3 });
        } else if (r < 0.62) this.horn(x, z);
        else if (r < 0.72) {
          const o = out(x, z, 0.3); // music box tinkle
          [1568, 1319, 1175, 1047].forEach((fq, i) => tone(o, tt + i * 0.25, 0.4, { f: fq, type: "sine", peak: 0.08 }));
        }
      }
      ambTimer = setTimeout(tick, 5000 + Math.random() * 8000);
    };
    ambTimer = setTimeout(tick, 3000);
  },
  stopAmbient() {
    ambOn = false;
    clearTimeout(ambTimer);
    clearTimeout(musicTimer);
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
      master = sfxBus = ambBus = musicBus = null;
      heart = null;
    }
  },
};
