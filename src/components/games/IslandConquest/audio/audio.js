/**
 * Island Conquest — WebAudio synth. No audio files, nothing copyrighted: the
 * music, the ocean and every effect are generated here.
 *
 * Buses: sfx · ocean ambience · music. `setEnabled(sound && !muted)` closes the
 * sfx gate AND fades the ocean bed; `setMusic(on && !muted)` stops the music
 * scheduler and fades its bus — so the Game Center Mute silences everything
 * immediately. `dispose()` closes the context on unmount (no hidden loops).
 * Busy sounds are rate limited per name and capped in voices; troop
 * production never makes a sound.
 */
let ctx = null;
let master = null;
let sfx = null;
let musicBus = null;
let ambBus = null;
let ambSrc = null;
let enabled = true;
let noiseBuf = null;
let voices = 0;
const last = {};
const music = { want: false, timer: null, next: 0, step: 0, mood: "menu", region: 1 };

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.gain.value = enabled ? 1 : 0;
      sfx.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      ambBus = ctx.createGain();
      ambBus.gain.value = 0;
      ambBus.connect(master);
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
    const n = Math.floor(a.sampleRate * 2);
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 987;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
  }
  return noiseBuf;
}

function voice(dur) {
  if (voices > 22) return false;
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
  src.start(now, Math.random() * 1.5);
  src.stop(now + dur + 0.05);
}

const gate = (name, gap) => {
  if (!ctx || !enabled) return false;
  if (ctx.currentTime - (last[name] ?? -1) < gap) return false;
  last[name] = ctx.currentTime;
  return true;
};

/* ---------------------------------------------------------------- ocean bed */
function startOcean() {
  const a = ac();
  if (!a || ambSrc) return;
  const src = a.createBufferSource();
  src.buffer = noise();
  src.loop = true;
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520;
  const g = a.createGain();
  g.gain.value = 0.05;
  // slow swell: an LFO on the gain
  const lfo = a.createOscillator();
  lfo.frequency.value = 0.11;
  const lg = a.createGain();
  lg.gain.value = 0.03;
  lfo.connect(lg);
  lg.connect(g.gain);
  src.connect(lp);
  lp.connect(g);
  g.connect(ambBus);
  src.start();
  lfo.start();
  ambSrc = { src, lfo };
}

/* ---------------------------------------------------------------- music */
const PENTA = [0, 2, 4, 7, 9];
const ROOT = { 1: 220, 2: 207.7, 3: 196, 4: 185, 5: 233.1 };
const TUNE = [0, 2, 4, 2, 3, -1, 4, 5, 4, 2, 1, -1, 2, 3, 4, 6, 5, 4, 2, -1, 1, 2, 0, -1, 4, 3, 2, 1, 2, 0, -1, -1];
const freq = (r, deg, oct = 0) => {
  const o = Math.floor(deg / PENTA.length);
  const i = ((deg % PENTA.length) + PENTA.length) % PENTA.length;
  const minor = r === 3 || r === 4;
  const semis = minor ? [0, 3, 5, 7, 10][i] : PENTA[i];
  return (ROOT[r] || 220) * Math.pow(2, (semis + 12 * (o + oct)) / 12);
};

function scheduleMusic() {
  const a = ac();
  if (!a || !music.want) return;
  const battle = music.mood === "battle";
  const beat = battle ? 0.34 : 0.46;
  while (music.next < a.currentTime + 0.4) {
    const t = music.next - a.currentTime;
    const s = music.step;
    const r = music.region;
    if (s % 8 === 0) {
      const root = [0, 3, 1, 4][(s / 8) % 4];
      for (const d of [root, root + 2]) tone({ f: freq(r, d, -1), type: "triangle", t, dur: beat * 8.2, gain: 0.026, attack: 0.6, dest: musicBus, q: 650 });
    }
    const m = TUNE[s % 32];
    if (m >= 0 && (battle || s % 2 === 0)) {
      tone({ f: freq(r, m, 1), type: "triangle", t, dur: beat * 1.5, gain: 0.04, attack: 0.008, dest: musicBus, q: 2400 });
      tone({ f: freq(r, m, 2), type: "sine", t, dur: beat * 0.5, gain: 0.01, attack: 0.004, dest: musicBus });
    }
    if (battle) {
      if (s % 4 === 0) tone({ f: 88, f2: 46, type: "sine", t, dur: 0.3, gain: 0.08, dest: musicBus });
      if (s % 8 === 6) tone({ f: 110, f2: 60, type: "sine", t, dur: 0.2, gain: 0.05, dest: musicBus });
    } else if (s % 16 === 12) hiss({ t, dur: 1.2, gain: 0.012, f: 900, type: "lowpass", dest: musicBus });
    music.next += beat;
    music.step++;
  }
}

/* ---------------------------------------------------------------- api */
export const audio = {
  state() {
    return { sfx: enabled, music: music.want, ocean: !!ambSrc, voices, ctx: ctx ? ctx.state : "none", musicGain: musicBus ? musicBus.gain.value : 0, ambGain: ambBus ? ambBus.gain.value : 0 };
  },
  unlock() {
    const a = ac();
    if (a && a.state === "suspended") a.resume().catch(() => {});
    if (a) startOcean();
  },
  setEnabled(on) {
    enabled = !!on;
    if (ctx && sfx) {
      sfx.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.02);
      ambBus.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, enabled ? 0.6 : 0.03);
    }
  },
  /** on: music wanted · mood: menu | battle · region: 1–5 */
  setMusic(on, mood = "menu", region = 1) {
    music.mood = mood;
    music.region = region;
    const want = !!on;
    if (want === music.want) return;
    music.want = want;
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
      if (ctx && musicBus) {
        musicBus.gain.cancelScheduledValues(ctx.currentTime);
        musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      }
    }
  },
  dispose() {
    if (music.timer) clearInterval(music.timer);
    music.timer = null;
    music.want = false;
    if (ambSrc) {
      try {
        ambSrc.src.stop();
        ambSrc.lfo.stop();
      } catch {
        /* already stopped */
      }
    }
    ambSrc = null;
    if (ctx) {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }
    ctx = null;
    master = sfx = musicBus = ambBus = null;
    noiseBuf = null;
    voices = 0;
    for (const k of Object.keys(last)) delete last[k];
  },

  /* UI */
  ui() {
    if (!gate("ui", 0.04)) return;
    tone({ f: 640, f2: 860, type: "triangle", dur: 0.06, gain: 0.06 });
  },
  error() {
    if (!gate("error", 0.15)) return;
    tone({ f: 230, f2: 180, type: "square", dur: 0.11, gain: 0.04, q: 1200 });
  },
  select() {
    if (!gate("select", 0.05)) return;
    tone({ f: 523, type: "triangle", dur: 0.08, gain: 0.07 });
    tone({ f: 784, t: 0.05, type: "triangle", dur: 0.1, gain: 0.05 });
  },
  deselect() {
    if (!gate("deselect", 0.05)) return;
    tone({ f: 600, f2: 420, type: "triangle", dur: 0.08, gain: 0.04 });
  },

  /* fleets */
  launch(big) {
    if (!gate("launch", 0.07)) return;
    tone({ f: 196, type: "sawtooth", dur: 0.2, gain: 0.04, q: 1100, attack: 0.02 });
    tone({ f: 294, t: 0.07, type: "sawtooth", dur: 0.22, gain: 0.03, q: 1200, attack: 0.02 });
    hiss({ dur: 0.35, gain: big ? 0.07 : 0.045, f: 800, f2: 300, type: "lowpass" });
  },
  enemyLaunch() {
    if (!gate("elaunch", 0.25)) return;
    hiss({ dur: 0.3, gain: 0.025, f: 600, f2: 250, type: "lowpass" });
  },
  arrive() {
    if (!gate("arrive", 0.08)) return;
    hiss({ dur: 0.25, gain: 0.05, f: 1200, f2: 400, q: 0.8 });
  },
  reinforce() {
    if (!gate("reinforce", 0.1)) return;
    tone({ f: 660, type: "triangle", dur: 0.08, gain: 0.04 });
    tone({ f: 880, t: 0.06, type: "triangle", dur: 0.1, gain: 0.035 });
  },
  battle(big) {
    if (!gate("battle", 0.08)) return;
    tone({ f: 120, f2: 60, type: "sine", dur: 0.26, gain: big ? 0.22 : 0.14 });
    tone({ f: 1350 + Math.random() * 300, f2: 900, type: "square", dur: 0.06, gain: 0.025, q: 4000 });
    tone({ f: 1800 + Math.random() * 300, t: 0.07, f2: 1200, type: "square", dur: 0.05, gain: 0.02, q: 4000 });
    hiss({ dur: 0.18, gain: 0.07, f: 1600, q: 1 });
  },
  capture() {
    if (!gate("capture", 0.12)) return;
    [523, 659, 784, 1046].forEach((f, i) => tone({ f, t: i * 0.07, type: "triangle", dur: i === 3 ? 0.4 : 0.14, gain: 0.07 }));
    hiss({ t: 0.2, dur: 0.4, gain: 0.03, f: 6000, type: "highpass" });
  },
  enemyCapture() {
    if (!gate("ecapture", 0.2)) return;
    tone({ f: 330, f2: 300, type: "triangle", dur: 0.18, gain: 0.04 });
  },
  lost() {
    if (!gate("lost", 0.2)) return;
    [392, 330, 262].forEach((f, i) => tone({ f, t: i * 0.11, type: "sawtooth", dur: 0.2, gain: 0.04, q: 1200 }));
    tone({ f: 98, t: 0.2, type: "sine", dur: 0.5, gain: 0.12 });
  },
  warning() {
    if (!gate("warning", 2.2)) return;
    tone({ f: 880, type: "square", dur: 0.09, gain: 0.03, q: 2500 });
    tone({ f: 660, t: 0.12, type: "square", dur: 0.12, gain: 0.03, q: 2500 });
  },
  victory() {
    [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone({ f, t: i * 0.13, type: "triangle", dur: i === 6 ? 0.9 : 0.18, gain: 0.07 }));
    [196, 262, 330].forEach((f) => tone({ f, t: 0.78, type: "sine", dur: 1.2, gain: 0.06 }));
    hiss({ t: 0.8, dur: 0.8, gain: 0.03, f: 7000, type: "highpass" });
  },
  defeat() {
    [392, 349, 311, 294, 262].forEach((f, i) => tone({ f, t: i * 0.24, type: "triangle", dur: 0.32, gain: 0.07 }));
    tone({ f: 98, t: 1.0, type: "sine", dur: 1.0, gain: 0.12 });
  },
};
