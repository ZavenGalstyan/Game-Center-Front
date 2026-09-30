/**
 * Penalty Kick — WebAudio synth (no audio files, nothing copyrighted).
 *
 * Buses: sfx (hits, whistle, crowd reactions) · ambience (a continuous crowd
 * bed, level by venue crowd density) · music (menu loop). One master gate:
 * `setEnabled(sound && !muted)` silences everything at once, so the Game
 * Center Mute always works.
 *
 * Every impact is a DIFFERENT sound: boot on ball (thump), post (bright ring),
 * crossbar (lower ring), net (soft swish), glove (slap), body (dull thud),
 * grass bounce (tap).
 */
let ctx = null;
let master = null;
let sfx = null;
let amb = null;
let musicBus = null;
let enabled = true;
let musicWanted = false;
let noiseBuf = null;
let musicTimer = null;
let musicNext = 0;
let musicStep = 0;
let ambSrc = null;
let ambFilter = null;
let ambLevel = 0;
let ambWanted = 0;
let last = {};

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.gain.value = enabled ? 1 : 0;
      sfx.connect(master);
      amb = ctx.createGain();
      amb.gain.value = 0;
      amb.connect(master);
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

function noiseBuffer() {
  const a = ac();
  if (!a) return null;
  if (!noiseBuf) {
    const n = Math.floor(a.sampleRate * 2);
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 1234;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
  }
  return noiseBuf;
}

function tone({ f = 440, f2, type = "sine", t = 0, dur = 0.15, gain = 0.2, attack = 0.004, dest }) {
  const a = ac();
  if (!a || !enabled) return;
  const now = a.currentTime + t;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g);
  g.connect(dest || sfx);
  o.start(now);
  o.stop(now + dur + 0.05);
}

function hiss({ t = 0, dur = 0.12, gain = 0.15, type = "bandpass", f = 2000, f2, q = 1, attack = 0.003, dest }) {
  const a = ac();
  if (!a || !enabled) return;
  const now = a.currentTime + t;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer();
  const fl = a.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, now);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + dur);
  fl.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(fl);
  fl.connect(g);
  g.connect(dest || sfx);
  src.start(now, Math.random() * 1.2);
  src.stop(now + dur + 0.05);
}

const k01 = (speed, lo, hi) => Math.max(0, Math.min(1, (speed - lo) / (hi - lo)));
const gate = (name, gap) => {
  if (!ctx) return false;
  if (ctx.currentTime - (last[name] || 0) < gap) return false;
  last[name] = ctx.currentTime;
  return true;
};

/* ---------------------------------------------------------------- crowd bed */
function ensureAmbience() {
  const a = ac();
  if (!a || ambSrc) return;
  ambSrc = a.createBufferSource();
  ambSrc.buffer = noiseBuffer();
  ambSrc.loop = true;
  ambFilter = a.createBiquadFilter();
  ambFilter.type = "bandpass";
  ambFilter.frequency.value = 700;
  ambFilter.Q.value = 0.5;
  ambSrc.connect(ambFilter);
  ambFilter.connect(amb);
  ambSrc.start();
}
function syncAmbience() {
  if (!ctx || !amb) return;
  const on = enabled && ambWanted > 0;
  if (on) ensureAmbience();
  amb.gain.cancelScheduledValues(ctx.currentTime);
  amb.gain.setTargetAtTime(on ? 0.05 + ambWanted * 0.09 : 0, ctx.currentTime, 0.4);
}

/* ---------------------------------------------------------------- music */
const PROG = [
  [196, 246.94, 293.66],
  [164.81, 196, 246.94],
  [174.61, 220, 261.63],
  [196, 246.94, 293.66],
];
function schedule() {
  const a = ctx;
  if (!a || !musicBus) return;
  const beat = 60 / 104 / 2;
  while (musicNext < a.currentTime + 0.6) {
    const t = musicNext - a.currentTime;
    const step = musicStep % 64;
    const ch = PROG[Math.floor(step / 16)];
    const s = step % 16;
    if (s % 4 === 0) tone({ f: 100, f2: 42, dur: 0.18, gain: 0.09, t, dest: musicBus });
    if (s % 4 === 2) hiss({ t, dur: 0.035, gain: 0.02, type: "highpass", f: 8000, dest: musicBus });
    if (s % 8 === 4) hiss({ t, dur: 0.1, gain: 0.035, type: "bandpass", f: 1800, q: 0.8, dest: musicBus });
    if (s % 2 === 0) tone({ f: ch[0] / 2, type: "triangle", dur: beat * 1.7, gain: 0.05, t, dest: musicBus });
    const arp = [0, 1, 2, 1, 2, 1, 0, 2];
    tone({ f: ch[arp[s % 8]] * 2, type: "triangle", dur: beat * 0.9, gain: 0.016, t, dest: musicBus });
    musicNext += beat;
    musicStep++;
  }
}
function syncMusic() {
  const on = musicWanted && enabled;
  if (!ctx) {
    if (on) ac();
    else return;
  }
  if (!ctx || !musicBus) return;
  const now = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setTargetAtTime(on ? 0.8 : 0, now, 0.2);
  if (on && !musicTimer) {
    musicNext = Math.max(musicNext, now + 0.08);
    schedule();
    musicTimer = setInterval(schedule, 200);
  } else if (!on && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

export const audio = {
  unlock() {
    ac();
    syncMusic();
    syncAmbience();
  },
  setEnabled(on) {
    enabled = on;
    if (ctx && sfx) {
      sfx.gain.cancelScheduledValues(ctx.currentTime);
      sfx.gain.setValueAtTime(on ? 1 : 0, ctx.currentTime);
    }
    syncMusic();
    syncAmbience();
  },
  setMusic(on) {
    musicWanted = on;
    syncMusic();
  },
  /** Crowd bed level 0…1 (0 = off, e.g. menus / crowd density setting). */
  setCrowd(level) {
    ambWanted = Math.max(0, Math.min(1, level));
    ambLevel = ambWanted;
    syncAmbience();
  },
  /** Crowd swell: tension during the run-up, roar on goals, groans on misses. */
  crowd(kind, strength = 1) {
    if (!enabled || !ctx || ambLevel <= 0) return;
    const g = (0.05 + ambLevel * 0.12) * strength;
    if (kind === "roar") {
      hiss({ dur: 2.4, gain: g * 1.6, type: "bandpass", f: 500, f2: 900, q: 0.5, attack: 0.18 });
      hiss({ t: 0.1, dur: 2.0, gain: g * 0.8, type: "bandpass", f: 1400, f2: 1100, q: 0.7, attack: 0.25 });
    } else if (kind === "groan") {
      hiss({ dur: 1.4, gain: g, type: "bandpass", f: 520, f2: 260, q: 0.9, attack: 0.15 });
    } else if (kind === "ooh") {
      hiss({ dur: 1.1, gain: g * 1.1, type: "bandpass", f: 380, f2: 820, q: 1.4, attack: 0.1 });
    } else if (kind === "tension") {
      hiss({ dur: 1.2, gain: g * 0.35, type: "bandpass", f: 600, f2: 1000, q: 0.6, attack: 0.8 });
    } else if (kind === "cheer") {
      hiss({ dur: 1.6, gain: g * 1.1, type: "bandpass", f: 900, f2: 1300, q: 0.6, attack: 0.1 });
    }
  },
  kick(power = 0.6) {
    if (!enabled || !gate("kick", 0.05)) return;
    tone({ f: 150 + power * 40, f2: 55, dur: 0.12, gain: 0.26 + power * 0.14 });
    hiss({ dur: 0.05, gain: 0.12 + power * 0.1, type: "bandpass", f: 1100, q: 0.9 });
  },
  post(speed = 20) {
    if (!enabled || !gate("wood", 0.08)) return;
    const k = 0.3 + 0.7 * k01(speed, 3, 28);
    // bright metallic ring: inharmonic partials with long decay
    [[1180, 1.2], [1734, 0.9], [2645, 0.7], [3920, 0.45]].forEach(([f, d]) => tone({ f, dur: d, gain: 0.05 * k, attack: 0.002 }));
    hiss({ dur: 0.05, gain: 0.18 * k, f: 3200, q: 1.5 });
    tone({ f: 190, f2: 120, dur: 0.15, gain: 0.12 * k });
  },
  bar(speed = 20) {
    if (!enabled || !gate("wood", 0.08)) return;
    const k = 0.3 + 0.7 * k01(speed, 3, 28);
    [[830, 1.4], [1290, 1.0], [1975, 0.7], [2890, 0.5]].forEach(([f, d]) => tone({ f, dur: d, gain: 0.05 * k, attack: 0.002 }));
    hiss({ dur: 0.06, gain: 0.16 * k, f: 2400, q: 1.3 });
    tone({ f: 150, f2: 90, dur: 0.2, gain: 0.13 * k });
  },
  net(speed = 20) {
    if (!enabled || !gate("net", 0.12)) return;
    const k = 0.25 + 0.75 * k01(speed, 2, 28);
    hiss({ dur: 0.35 + k * 0.25, gain: 0.1 * k + 0.02, type: "lowpass", f: 900 + k * 1800, f2: 300, q: 0.6, attack: 0.02 });
    hiss({ dur: 0.18, gain: 0.05 * k, type: "highpass", f: 4500, q: 0.4, attack: 0.01 });
  },
  glove(speed = 20) {
    if (!enabled || !gate("glove", 0.06)) return;
    const k = 0.35 + 0.65 * k01(speed, 4, 30);
    hiss({ dur: 0.07, gain: 0.3 * k, type: "bandpass", f: 1500, q: 1.1 });
    tone({ f: 260, f2: 130, dur: 0.08, gain: 0.14 * k });
  },
  catchBall() {
    if (!enabled) return;
    hiss({ dur: 0.1, gain: 0.22, type: "bandpass", f: 900, q: 1 });
    tone({ f: 180, f2: 95, dur: 0.14, gain: 0.2 });
  },
  body(speed = 15) {
    if (!enabled || !gate("body", 0.06)) return;
    const k = 0.35 + 0.65 * k01(speed, 4, 30);
    tone({ f: 120, f2: 60, dur: 0.14, gain: 0.26 * k });
    hiss({ dur: 0.05, gain: 0.08 * k, type: "lowpass", f: 700 });
  },
  bounce(speed = 5) {
    if (!enabled || !gate("bounce", 0.07)) return;
    const k = k01(speed, 1, 12);
    tone({ f: 210, f2: 120, dur: 0.07, gain: 0.05 + 0.1 * k });
    hiss({ dur: 0.04, gain: 0.03 + 0.05 * k, type: "lowpass", f: 1400 });
  },
  whistle(long = false) {
    if (!enabled) return;
    const a = ac();
    if (!a) return;
    const now = a.currentTime;
    const dur = long ? 0.9 : 0.32;
    const o = a.createOscillator();
    const lfo = a.createOscillator();
    const lg = a.createGain();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.value = 2750;
    lfo.frequency.value = 38;
    lg.gain.value = 110;
    lfo.connect(lg);
    lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
    g.gain.setValueAtTime(0.09, now + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g);
    g.connect(sfx);
    o.start(now);
    lfo.start(now);
    o.stop(now + dur + 0.05);
    lfo.stop(now + dur + 0.05);
  },
  dive() {
    if (!enabled || !gate("dive", 0.2)) return;
    hiss({ dur: 0.22, gain: 0.05, type: "bandpass", f: 500, f2: 1600, q: 0.7, attack: 0.03 });
  },
  land() {
    if (!enabled || !gate("land", 0.3)) return;
    tone({ f: 90, f2: 50, dur: 0.18, gain: 0.14 });
    hiss({ dur: 0.12, gain: 0.05, type: "lowpass", f: 600 });
  },
  win() {
    if (!enabled) return;
    [[523.25, 659.25, 783.99], [587.33, 739.99, 880], [659.25, 830.61, 987.77, 1318.51]].forEach((ch, i) => ch.forEach((f) => tone({ f, type: "triangle", dur: i === 2 ? 1 : 0.2, gain: 0.05, t: i * 0.17 })));
  },
  lose() {
    if (!enabled) return;
    [392, 349.23, 311.13, 261.63].forEach((f, i) => tone({ f, type: "triangle", dur: 0.35, gain: 0.05, t: i * 0.18 }));
  },
  unlockJingle() {
    if (!enabled) return;
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => tone({ f, dur: 0.3, gain: 0.06, t: i * 0.06 }));
  },
  ui() {
    if (!enabled) return;
    tone({ f: 760, f2: 620, dur: 0.05, gain: 0.06 });
  },
  tick() {
    if (!enabled || !gate("tick", 0.04)) return;
    tone({ f: 1200, dur: 0.02, gain: 0.02 });
  },
  dispose() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    musicWanted = false;
    try {
      if (ambSrc) ambSrc.stop();
    } catch {
      /* already stopped */
    }
    ambSrc = null;
    ambFilter = null;
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    master = sfx = amb = musicBus = null;
    noiseBuf = null;
    musicNext = 0;
    last = {};
  },
};
