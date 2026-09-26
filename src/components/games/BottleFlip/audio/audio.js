/**
 * Bottle Flip — tiny WebAudio synth (no files, no libraries).
 *
 * One-shots are short oscillator / filtered-noise envelopes. The only loops
 * are the drag-tension tone (stopped on release / cancel / blur / unmount)
 * and the optional music (a soft plucked pattern scheduled ahead).
 *
 * `setEnabled(sound && !muted)` gates every sound instantly — the Game Center
 * Mute never has to touch saved settings. `setMusic(on)` follows the music
 * setting AND the same gate.
 */

let ctx = null;
let master = null;
let sfx = null;
let musicBus = null;
let enabled = true;
let musicWanted = false;
let noiseBuf = null;
let tension = null;
let musicTimer = null;
let musicStep = 0;
let musicNext = 0;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.gain.value = enabled ? 1 : 0;
      sfx.connect(master);
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
  const a = ac();
  if (!a) return null;
  if (!noiseBuf) {
    const n = Math.floor(a.sampleRate * 1.5);
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
  }
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

function tone({ f = 440, f2, type = "sine", t = 0, dur = 0.15, gain = 0.2, attack = 0.005, dest }) {
  const a = ac();
  if (!a || !enabled) return;
  const now = a.currentTime + t;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g);
  g.connect(dest || sfx);
  o.start(now);
  o.stop(now + dur + 0.05);
}

function hiss({ t = 0, dur = 0.2, gain = 0.2, type = "bandpass", f = 1200, f2, q = 1, attack = 0.005 }) {
  const a = ac();
  if (!a || !enabled) return;
  const now = a.currentTime + t;
  const src = noise();
  const fl = a.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, now);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + dur);
  fl.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(fl);
  fl.connect(g);
  g.connect(sfx);
  src.start(now, Math.random() * 0.5);
  src.stop(now + dur + 0.05);
}

const SURF = {
  wood: { f: 180, nf: 900, q: 1.2, ring: 0 },
  card: { f: 140, nf: 600, q: 0.8, ring: 0 },
  soft: { f: 90, nf: 300, q: 0.6, ring: 0 },
  metal: { f: 320, nf: 2600, q: 3, ring: 1 },
  floor: { f: 150, nf: 800, q: 1, ring: 0 },
};

export const audio = {
  unlock() {
    ac();
  },
  setEnabled(on) {
    enabled = on;
    const a = ctx;
    if (a && sfx) {
      sfx.gain.cancelScheduledValues(a.currentTime);
      sfx.gain.setTargetAtTime(on ? 1 : 0, a.currentTime, 0.02);
    }
    if (!on) this.stopTension();
    this.setMusic(musicWanted);
  },
  setMusic(on) {
    musicWanted = on;
    const play = on && enabled;
    if (play) {
      if (!ac()) return;
      musicBus.gain.setTargetAtTime(0.055, ctx.currentTime, 0.4);
      if (!musicTimer) {
        musicNext = ctx.currentTime + 0.1;
        musicTimer = setInterval(scheduleMusic, 120);
      }
    } else {
      if (ctx && musicBus) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    }
  },
  ui() {
    tone({ f: 660, f2: 880, type: "triangle", dur: 0.07, gain: 0.08 });
  },
  /** drag tension: a soft rising hum that follows the power. */
  tension(power) {
    const a = ac();
    if (!a || !enabled) return;
    if (!tension) {
      const o = a.createOscillator();
      const o2 = a.createOscillator();
      const g = a.createGain();
      const f = a.createBiquadFilter();
      o.type = "triangle";
      o2.type = "sine";
      f.type = "lowpass";
      f.frequency.value = 900;
      g.gain.value = 0.0001;
      o.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(sfx);
      o.start();
      o2.start();
      tension = { o, o2, g };
    }
    const now = a.currentTime;
    tension.o.frequency.setTargetAtTime(160 + power * 260, now, 0.03);
    tension.o2.frequency.setTargetAtTime(320 + power * 520, now, 0.03);
    tension.g.gain.setTargetAtTime(0.018 + power * 0.03, now, 0.04);
  },
  stopTension() {
    if (!tension || !ctx) return;
    const t = tension;
    tension = null;
    const now = ctx.currentTime;
    t.g.gain.cancelScheduledValues(now);
    t.g.gain.setTargetAtTime(0.0001, now, 0.02);
    t.o.stop(now + 0.12);
    t.o2.stop(now + 0.12);
  },
  release(power) {
    this.stopTension();
    hiss({ dur: 0.18 + power * 0.1, gain: 0.12 + power * 0.08, f: 700, f2: 2400, q: 0.7 });
    tone({ f: 220 + power * 120, f2: 520 + power * 200, type: "sine", dur: 0.12, gain: 0.06 });
  },
  swish(half) {
    hiss({ dur: 0.12, gain: 0.05 + Math.min(0.04, half * 0.008), f: 1600, f2: 700, q: 1.4 });
  },
  impact(surface, speed, base) {
    const m = SURF[surface] || SURF.wood;
    const k = Math.min(1, speed / 700);
    // plastic bottle knock
    tone({ f: m.f * (base ? 1 : 1.3), f2: m.f * 0.6, type: "sine", dur: 0.09, gain: 0.08 + k * 0.18 });
    hiss({ dur: 0.07, gain: 0.06 + k * 0.14, f: m.nf, q: m.q });
    if (m.ring) tone({ f: 1850, f2: 1700, type: "sine", t: 0.004, dur: 0.25, gain: 0.03 + k * 0.03 });
    // water slosh
    hiss({ t: 0.03, dur: 0.16, gain: 0.03 + k * 0.05, f: 500, f2: 260, q: 2.5, attack: 0.02 });
  },
  land() {
    tone({ f: 523, type: "triangle", dur: 0.14, gain: 0.07 });
    tone({ f: 784, type: "triangle", t: 0.06, dur: 0.18, gain: 0.07 });
  },
  perfect() {
    [784, 988, 1175, 1568].forEach((f, i) => tone({ f, type: "triangle", t: i * 0.055, dur: 0.22, gain: 0.07 }));
    hiss({ t: 0.05, dur: 0.35, gain: 0.03, type: "highpass", f: 5000, q: 0.5 });
  },
  streak(n) {
    tone({ f: 660 + Math.min(n, 8) * 60, type: "sine", t: 0.12, dur: 0.15, gain: 0.05 });
  },
  wobble() {
    for (let i = 0; i < 3; i++) tone({ f: 260 - i * 20, type: "sine", t: i * 0.09, dur: 0.07, gain: 0.04 });
  },
  fail() {
    tone({ f: 330, f2: 150, type: "triangle", dur: 0.28, gain: 0.08 });
    hiss({ dur: 0.12, gain: 0.08, f: 400, q: 0.8 });
  },
  respawn() {
    tone({ f: 440, f2: 660, type: "sine", dur: 0.1, gain: 0.05 });
  },
  collect() {
    tone({ f: 1046, type: "triangle", dur: 0.12, gain: 0.08 });
    tone({ f: 1568, type: "triangle", t: 0.07, dur: 0.2, gain: 0.07 });
  },
  complete() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ f, type: "triangle", t: i * 0.09, dur: 0.3, gain: 0.08 }));
    tone({ f: 1318, type: "sine", t: 0.4, dur: 0.5, gain: 0.05 });
  },
  stopAll() {
    this.stopTension();
  },
  dispose() {
    this.stopTension();
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    if (ctx && musicBus) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
  },
};

/* soft plucked loop: I–vi–IV–V in C, 8th notes, scheduled ~0.4s ahead */
const CHORDS = [
  [262, 330, 392],
  [220, 262, 330],
  [175, 220, 262],
  [196, 247, 294],
];
function pluck(f, when, gain, dur = 0.45) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g);
  g.connect(musicBus);
  o.start(when);
  o.stop(when + dur + 0.05);
}
function scheduleMusic() {
  if (!ctx) return;
  const step = 0.3;
  while (musicNext < ctx.currentTime + 0.45) {
    const bar = Math.floor(musicStep / 8) % 4;
    const ch = CHORDS[bar];
    const i = musicStep % 8;
    if (i === 0) pluck(ch[0] / 2, musicNext, 0.5, 1.1);
    const pattern = [0, 1, 2, 1, 2, 1, 0, 2];
    pluck(ch[pattern[i]] * 2, musicNext, i % 2 ? 0.18 : 0.28, 0.35);
    musicStep += 1;
    musicNext += step;
  }
}
