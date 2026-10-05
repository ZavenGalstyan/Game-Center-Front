/**
 * Tower Defense Mini — WebAudio synth (no audio files, nothing copyrighted).
 *
 * Buses: sfx · music. `setEnabled(sound && !muted)` closes the sfx gate and
 * `setMusic(on && !muted)` stops the scheduler and fades the music bus, so the
 * Game Center Mute silences everything immediately. Busy sounds (arrow shots
 * at 2x with ten towers) are rate-limited per name and capped in voices.
 * Impact sounds are only ever triggered by real impact events.
 */
let ctx = null;
let master = null;
let sfx = null;
let musicBus = null;
let enabled = true;
let noiseBuf = null;
let voices = 0;
const last = {};
const music = { want: false, timer: null, next: 0, step: 0, mood: "menu", world: 1 };

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.75;
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
  return ctx;
}

function noise() {
  const a = ac();
  if (!a) return null;
  if (!noiseBuf) {
    const n = Math.floor(a.sampleRate * 1.5);
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 4321;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
  }
  return noiseBuf;
}

function voice(dur) {
  if (voices > 26) return false;
  voices++;
  setTimeout(() => (voices = Math.max(0, voices - 1)), (dur + 0.1) * 1000);
  return true;
}

function tone({ f = 440, f2, type = "sine", t = 0, dur = 0.15, gain = 0.2, attack = 0.004, dest, q }) {
  const a = ac();
  if (!a || (!enabled && !dest)) return;
  if (!dest && !voice(dur)) return;
  const now = a.currentTime + t;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  let node = o;
  if (q) {
    const fl = a.createBiquadFilter();
    fl.type = "lowpass";
    fl.frequency.value = q;
    o.connect(fl);
    node = fl;
  }
  node.connect(g);
  g.connect(dest || sfx);
  o.start(now);
  o.stop(now + dur + 0.05);
}

function hiss({ t = 0, dur = 0.12, gain = 0.15, type = "bandpass", f = 2000, f2, q = 1, attack = 0.003, dest }) {
  const a = ac();
  if (!a || (!enabled && !dest)) return;
  if (!dest && !voice(dur)) return;
  const now = a.currentTime + t;
  const src = a.createBufferSource();
  src.buffer = noise();
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
  src.start(now, Math.random() * 1);
  src.stop(now + dur + 0.05);
}

const gate = (name, gap) => {
  if (!ctx || !enabled) return false;
  if (ctx.currentTime - (last[name] || -1) < gap) return false;
  last[name] = ctx.currentTime;
  return true;
};

/* ---------------------------------------------------------------- music */
const SCALES = {
  1: [0, 2, 4, 7, 9], // major pentatonic — bright valley
  2: [0, 3, 5, 7, 10], // minor pentatonic — desert
  3: [0, 2, 3, 7, 9], // cool
  4: [0, 1, 5, 7, 8], // dark marsh
  5: [0, 3, 5, 6, 10], // volcanic
};
const ROOT = { 1: 196, 2: 174.6, 3: 220, 4: 164.8, 5: 155.6 };
const MELODY = [0, 2, 4, 2, 3, 1, 4, 0, 2, 4, 5, 4, 3, 2, 1, -1];
const freq = (world, deg, oct = 0) => {
  const sc = SCALES[world] || SCALES[1];
  const o = Math.floor(deg / sc.length);
  const k = ((deg % sc.length) + sc.length) % sc.length;
  return (ROOT[world] || 196) * Math.pow(2, (sc[k] + 12 * (o + oct)) / 12);
};

function scheduleMusic() {
  const a = ac();
  if (!a || !music.want) return;
  const beat = music.mood === "boss" ? 0.32 : music.mood === "battle" ? 0.38 : 0.46;
  while (music.next < a.currentTime + 0.35) {
    const t = music.next - a.currentTime;
    const s = music.step;
    const w = music.world;
    // pad: every 8 beats
    if (s % 8 === 0) {
      const chord = [(s / 8) % 4 === 3 ? 3 : (s / 8) % 2 ? 1 : 0];
      for (const d of [chord[0], chord[0] + 2, chord[0] + 4]) tone({ f: freq(w, d, -1), type: "triangle", t, dur: beat * 8, gain: 0.035, attack: 0.6, dest: musicBus, q: 900 });
    }
    // plucked melody, sparse
    const m = MELODY[s % 16];
    if (m >= 0 && (s % 2 === 0 || music.mood !== "menu")) tone({ f: freq(w, m, 1), type: "sine", t, dur: beat * 1.6, gain: 0.05, attack: 0.01, dest: musicBus });
    // soft drum in battle
    if (music.mood !== "menu" && s % 4 === 0) tone({ f: 110, f2: 45, type: "sine", t, dur: 0.25, gain: music.mood === "boss" ? 0.16 : 0.1, dest: musicBus });
    if (music.mood === "boss" && s % 4 === 2) hiss({ t, dur: 0.08, gain: 0.05, f: 3000, dest: musicBus });
    music.next += beat;
    music.step++;
  }
}

/* ---------------------------------------------------------------- api */
export const audio = {
  /** test/diagnostics: is anything allowed to sound right now? */
  state() {
    return { sfx: enabled, music: music.want, voices };
  },
  unlock() {
    const a = ac();
    if (a && a.state === "suspended") a.resume().catch(() => {});
  },
  setEnabled(on) {
    enabled = !!on;
    if (ctx && sfx) sfx.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.02);
  },
  /** on: music wanted · mood: menu | battle | boss · world: 1–5 */
  setMusic(on, mood = "menu", world = 1) {
    music.mood = mood;
    music.world = world;
    const want = !!on;
    if (want === music.want) return;
    music.want = want;
    const a = ctx; // don't create a context just to stay silent
    if (want) {
      const b = ac();
      if (!b) return;
      musicBus.gain.cancelScheduledValues(b.currentTime);
      musicBus.gain.setTargetAtTime(1, b.currentTime, 0.4);
      music.next = b.currentTime + 0.1;
      if (!music.timer) music.timer = setInterval(scheduleMusic, 120);
    } else {
      if (music.timer) clearInterval(music.timer);
      music.timer = null;
      if (a && musicBus) {
        musicBus.gain.cancelScheduledValues(a.currentTime);
        musicBus.gain.setTargetAtTime(0, a.currentTime, 0.05);
      }
    }
  },
  dispose() {
    if (music.timer) clearInterval(music.timer);
    music.timer = null;
    music.want = false;
    if (ctx) {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }
    ctx = null;
    master = sfx = musicBus = null;
    noiseBuf = null;
    voices = 0;
    for (const k of Object.keys(last)) delete last[k];
  },

  ui() {
    if (!gate("ui", 0.04)) return;
    tone({ f: 660, f2: 880, type: "triangle", dur: 0.07, gain: 0.08 });
  },
  hover() {
    if (!gate("hover", 0.06)) return;
    tone({ f: 1200, type: "sine", dur: 0.03, gain: 0.025 });
  },
  error() {
    if (!gate("error", 0.15)) return;
    tone({ f: 220, f2: 180, type: "square", dur: 0.12, gain: 0.05, q: 1200 });
  },
  place() {
    if (!gate("place", 0.05)) return;
    tone({ f: 140, f2: 70, type: "sine", dur: 0.2, gain: 0.3 });
    hiss({ dur: 0.18, gain: 0.12, f: 900, type: "lowpass" });
    tone({ f: 523, t: 0.08, type: "triangle", dur: 0.1, gain: 0.07 });
    tone({ f: 784, t: 0.14, type: "triangle", dur: 0.14, gain: 0.07 });
  },
  upgrade() {
    if (!gate("upgrade", 0.05)) return;
    [523, 659, 784, 1046].forEach((f, i) => tone({ f, t: i * 0.06, type: "triangle", dur: 0.18, gain: 0.08 }));
    hiss({ t: 0.05, dur: 0.3, gain: 0.04, f: 5000, type: "highpass" });
  },
  sell() {
    if (!gate("sell", 0.05)) return;
    hiss({ dur: 0.25, gain: 0.1, f: 600, type: "lowpass" });
    tone({ f: 988, type: "square", dur: 0.06, gain: 0.04, q: 3000 });
    tone({ f: 1318, t: 0.06, type: "square", dur: 0.1, gain: 0.04, q: 3000 });
  },
  shot(kind) {
    if (kind === "archer") {
      if (!gate("arrow", 0.045)) return;
      hiss({ dur: 0.09, gain: 0.06, f: 2600, f2: 1200, q: 2 });
      tone({ f: 330, f2: 260, type: "triangle", dur: 0.06, gain: 0.04 });
    } else if (kind === "cannon") {
      if (!gate("cannon", 0.08)) return;
      tone({ f: 90, f2: 40, type: "sine", dur: 0.3, gain: 0.32 });
      hiss({ dur: 0.25, gain: 0.16, f: 700, f2: 200, type: "lowpass" });
    } else if (kind === "frost") {
      if (!gate("frost", 0.06)) return;
      tone({ f: 1500, f2: 2400, type: "sine", dur: 0.12, gain: 0.04 });
      hiss({ dur: 0.14, gain: 0.04, f: 6000, type: "highpass" });
    } else if (kind === "mage") {
      if (!gate("mage", 0.06)) return;
      tone({ f: 420, f2: 840, type: "sawtooth", dur: 0.16, gain: 0.04, q: 1800 });
      tone({ f: 630, f2: 1260, type: "sine", dur: 0.16, gain: 0.04 });
    }
  },
  hit(kind) {
    if (kind === "arrow") {
      if (!gate("arrowhit", 0.05)) return;
      hiss({ dur: 0.05, gain: 0.07, f: 1500, q: 3 });
      tone({ f: 180, f2: 120, type: "triangle", dur: 0.05, gain: 0.05 });
    } else if (kind === "frost") {
      if (!gate("frosthit", 0.06)) return;
      [2093, 2637].forEach((f, i) => tone({ f, t: i * 0.03, type: "sine", dur: 0.12, gain: 0.03 }));
      hiss({ dur: 0.12, gain: 0.05, f: 7000, type: "highpass" });
    } else if (kind === "magic") {
      if (!gate("magichit", 0.06)) return;
      tone({ f: 900, f2: 300, type: "sine", dur: 0.18, gain: 0.06 });
      hiss({ dur: 0.1, gain: 0.04, f: 3000, q: 4 });
    } else if (kind === "armor") {
      if (!gate("clank", 0.07)) return;
      tone({ f: 1800, f2: 1500, type: "square", dur: 0.05, gain: 0.025, q: 4000 });
    }
  },
  boom() {
    if (!gate("boom", 0.07)) return;
    tone({ f: 70, f2: 30, type: "sine", dur: 0.45, gain: 0.35 });
    hiss({ dur: 0.45, gain: 0.2, f: 900, f2: 120, type: "lowpass" });
  },
  die(kind, boss) {
    if (boss) {
      tone({ f: 180, f2: 40, type: "sawtooth", dur: 0.9, gain: 0.12, q: 900 });
      hiss({ dur: 0.9, gain: 0.18, f: 600, f2: 100, type: "lowpass" });
      return;
    }
    if (!gate("die", 0.05)) return;
    if (kind === "swarmer") tone({ f: 900, f2: 300, type: "triangle", dur: 0.08, gain: 0.04 });
    else {
      hiss({ dur: 0.18, gain: 0.07, f: 700, type: "lowpass" });
      tone({ f: kind === "brute" ? 160 : 280, f2: kind === "brute" ? 70 : 140, type: "triangle", dur: 0.16, gain: 0.07 });
    }
  },
  coin(big) {
    if (!gate("coin", 0.07)) return;
    tone({ f: big ? 1046 : 1318, type: "square", dur: 0.05, gain: 0.025, q: 4000 });
    tone({ f: big ? 1568 : 1760, t: 0.05, type: "square", dur: 0.09, gain: 0.025, q: 4000 });
  },
  leak() {
    if (!gate("leak", 0.12)) return;
    tone({ f: 330, f2: 160, type: "sawtooth", dur: 0.3, gain: 0.08, q: 1400 });
    tone({ f: 120, f2: 60, type: "sine", dur: 0.3, gain: 0.2 });
  },
  waveStart() {
    [392, 523, 659].forEach((f, i) => tone({ f, t: i * 0.09, type: "sawtooth", dur: 0.22, gain: 0.06, q: 2200 }));
    tone({ f: 98, f2: 60, t: 0.27, type: "sine", dur: 0.4, gain: 0.25 });
  },
  waveClear() {
    [659, 784, 988].forEach((f, i) => tone({ f, t: i * 0.08, type: "triangle", dur: 0.2, gain: 0.07 }));
  },
  bossWarn() {
    for (let i = 0; i < 3; i++) {
      tone({ f: 110, f2: 80, t: i * 0.42, type: "sawtooth", dur: 0.38, gain: 0.12, q: 700 });
      tone({ f: 55, t: i * 0.42, type: "sine", dur: 0.38, gain: 0.25 });
    }
  },
  victory() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone({ f, t: i * 0.12, type: "triangle", dur: i === 5 ? 0.6 : 0.16, gain: 0.09 }));
  },
  defeat() {
    [392, 349, 311, 262].forEach((f, i) => tone({ f, t: i * 0.22, type: "triangle", dur: 0.3, gain: 0.08 }));
  },
};
