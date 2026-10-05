/**
 * Castle Rush — WebAudio synth (no audio files, nothing copyrighted).
 *
 * Buses: sfx · music. `setEnabled(sound && !muted)` closes the sfx gate and
 * `setMusic(on && !muted)` stops the scheduler and fades the music bus, so the
 * Game Center Mute silences everything immediately. Busy sounds (many swords
 * at 2x) are rate-limited per name and capped in voices. Impact sounds are
 * only ever triggered by real impact events from the engine — a cancelled
 * swing plays nothing, an arrow that misses plays a soft thud, not a hit.
 */
let ctx = null;
let master = null;
let sfx = null;
let musicBus = null;
let enabled = true;
let noiseBuf = null;
let voices = 0;
const last = {};
const music = { want: false, timer: null, next: 0, step: 0, mood: "menu", kingdom: 1 };

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
    let s = 1234;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
  }
  return noiseBuf;
}

function voice(dur) {
  if (voices > 24) return false;
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
  if (ctx.currentTime - (last[name] ?? -1) < gap) return false;
  last[name] = ctx.currentTime;
  return true;
};

/* ---------------------------------------------------------------- music */
// D dorian-ish modal colour per kingdom (procedural, original)
const SCALES = {
  1: [0, 2, 3, 5, 7, 9, 10],
  2: [0, 1, 4, 5, 7, 8, 10],
  3: [0, 2, 3, 5, 7, 8, 10],
  4: [0, 1, 3, 5, 6, 8, 10],
  5: [0, 2, 4, 5, 7, 9, 11],
};
const ROOT = { 1: 146.8, 2: 138.6, 3: 155.6, 4: 130.8, 5: 164.8 };
const TUNE = [0, 2, 4, 3, 2, 0, 1, -1, 0, 4, 5, 4, 3, 2, 1, -1, 2, 4, 6, 5, 4, 2, 3, -1, 4, 3, 2, 1, 0, 1, 0, -1];
const freq = (k, deg, oct = 0) => {
  const sc = SCALES[k] || SCALES[1];
  const o = Math.floor(deg / sc.length);
  const i = ((deg % sc.length) + sc.length) % sc.length;
  return (ROOT[k] || 146.8) * Math.pow(2, (sc[i] + 12 * (o + oct)) / 12);
};

function scheduleMusic() {
  const a = ac();
  if (!a || !music.want) return;
  const battle = music.mood === "battle";
  const beat = battle ? 0.3 : 0.42;
  while (music.next < a.currentTime + 0.35) {
    const t = music.next - a.currentTime;
    const s = music.step;
    const k = music.kingdom;
    // drone (open fifth), every 8 beats
    if (s % 8 === 0) {
      const root = (s / 8) % 4 === 2 ? 3 : (s / 8) % 4 === 3 ? 4 : 0;
      for (const d of [root, root + 4]) tone({ f: freq(k, d, -1), type: "triangle", t, dur: beat * 8.2, gain: 0.03, attack: 0.5, dest: musicBus, q: 700 });
    }
    // plucked lute-like melody
    const m = TUNE[s % 32];
    if (m >= 0 && (battle || s % 2 === 0)) {
      tone({ f: freq(k, m, 1), type: "triangle", t, dur: beat * 1.4, gain: 0.045, attack: 0.006, dest: musicBus, q: 2600 });
      tone({ f: freq(k, m, 2), type: "sine", t, dur: beat * 0.6, gain: 0.012, attack: 0.004, dest: musicBus });
    }
    // war drums in battle
    if (battle) {
      if (s % 4 === 0) tone({ f: 95, f2: 48, type: "sine", t, dur: 0.28, gain: 0.12, dest: musicBus });
      if (s % 8 === 6) tone({ f: 120, f2: 60, type: "sine", t, dur: 0.2, gain: 0.07, dest: musicBus });
      if (s % 2 === 1) hiss({ t, dur: 0.05, gain: 0.018, f: 4500, type: "highpass", dest: musicBus });
    }
    music.next += beat;
    music.step++;
  }
}

/* ---------------------------------------------------------------- api */
export const audio = {
  state() {
    return { sfx: enabled, music: music.want, voices, ctx: ctx ? ctx.state : "none" };
  },
  unlock() {
    const a = ac();
    if (a && a.state === "suspended") a.resume().catch(() => {});
  },
  setEnabled(on) {
    enabled = !!on;
    if (ctx && sfx) sfx.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.02);
  },
  /** on: music wanted · mood: menu | battle · kingdom: 1–5 */
  setMusic(on, mood = "menu", kingdom = 1) {
    music.mood = mood;
    music.kingdom = kingdom;
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

  /* UI */
  ui() {
    if (!gate("ui", 0.04)) return;
    tone({ f: 620, f2: 820, type: "triangle", dur: 0.06, gain: 0.07 });
  },
  hover() {
    if (!gate("hover", 0.06)) return;
    tone({ f: 1100, type: "sine", dur: 0.03, gain: 0.02 });
  },
  error() {
    if (!gate("error", 0.15)) return;
    tone({ f: 220, f2: 180, type: "square", dur: 0.12, gain: 0.045, q: 1200 });
  },
  /** soft tick when a unit becomes affordable */
  goldTick() {
    if (!gate("goldTick", 0.25)) return;
    tone({ f: 1568, type: "sine", dur: 0.05, gain: 0.025 });
  },
  coin() {
    if (!gate("coin", 0.07)) return;
    tone({ f: 1318, type: "square", dur: 0.05, gain: 0.022, q: 4000 });
    tone({ f: 1760, t: 0.05, type: "square", dur: 0.09, gain: 0.022, q: 4000 });
  },
  deploy(type) {
    if (!gate("deploy", 0.06)) return;
    // short horn + drum
    const f = type === "knight" ? 196 : type === "shield" ? 220 : type === "archer" ? 294 : 262;
    tone({ f, type: "sawtooth", dur: 0.22, gain: 0.05, q: 1300, attack: 0.02 });
    tone({ f: f * 1.5, t: 0.08, type: "sawtooth", dur: 0.2, gain: 0.035, q: 1400, attack: 0.02 });
    tone({ f: 110, f2: 55, type: "sine", dur: 0.22, gain: 0.18 });
  },
  enemyDeploy() {
    if (!gate("edeploy", 0.3)) return;
    tone({ f: 147, type: "sawtooth", dur: 0.25, gain: 0.025, q: 900, attack: 0.03 });
  },
  treasury() {
    [784, 988, 1175, 1568].forEach((f, i) => tone({ f, t: i * 0.06, type: "triangle", dur: 0.16, gain: 0.06 }));
    hiss({ t: 0.05, dur: 0.25, gain: 0.03, f: 6000, type: "highpass" });
  },

  /* combat */
  swing(type) {
    if (!gate(`swing${type}`, 0.06)) return;
    const heavy = type === "knight";
    hiss({ dur: heavy ? 0.22 : 0.14, gain: heavy ? 0.06 : 0.04, f: heavy ? 900 : 1600, f2: heavy ? 400 : 700, q: 1.2 });
  },
  swordHit(heavy) {
    if (!gate(heavy ? "heavyHit" : "swordHit", 0.05)) return;
    if (heavy) {
      tone({ f: 140, f2: 70, type: "sine", dur: 0.22, gain: 0.22 });
      tone({ f: 620, f2: 420, type: "square", dur: 0.08, gain: 0.04, q: 2400 });
      hiss({ dur: 0.14, gain: 0.08, f: 1200, q: 1 });
    } else {
      tone({ f: 1250 + Math.random() * 200, f2: 900, type: "square", dur: 0.07, gain: 0.035, q: 4200 });
      tone({ f: 2400 + Math.random() * 300, type: "sine", dur: 0.12, gain: 0.02 });
      hiss({ dur: 0.06, gain: 0.05, f: 2800, q: 2 });
    }
  },
  shieldHit() {
    if (!gate("shieldHit", 0.06)) return;
    tone({ f: 180, f2: 110, type: "triangle", dur: 0.14, gain: 0.14 });
    tone({ f: 900, f2: 700, type: "square", dur: 0.05, gain: 0.02, q: 2000 });
    hiss({ dur: 0.08, gain: 0.06, f: 900, q: 1 });
  },
  armorHit() {
    if (!gate("armorHit", 0.06)) return;
    tone({ f: 1800, f2: 1500, type: "square", dur: 0.05, gain: 0.022, q: 4000 });
    tone({ f: 220, f2: 140, type: "sine", dur: 0.12, gain: 0.1 });
  },
  arrowShot() {
    if (!gate("arrowShot", 0.05)) return;
    tone({ f: 330, f2: 180, type: "triangle", dur: 0.08, gain: 0.05 });
    hiss({ dur: 0.1, gain: 0.04, f: 3000, f2: 1400, q: 2 });
  },
  arrowHit(blocked) {
    if (!gate("arrowHit", 0.05)) return;
    if (blocked) tone({ f: 1500, f2: 1100, type: "square", dur: 0.04, gain: 0.02, q: 3500 });
    hiss({ dur: 0.05, gain: 0.05, f: 1300, q: 3 });
    tone({ f: 200, f2: 120, type: "triangle", dur: 0.05, gain: 0.05 });
  },
  arrowMiss() {
    if (!gate("arrowMiss", 0.08)) return;
    hiss({ dur: 0.05, gain: 0.025, f: 700, type: "lowpass" });
  },
  castleHit(kind) {
    if (!gate(kind === "arrow" ? "castleArrow" : "castleHit", kind === "arrow" ? 0.1 : 0.07)) return;
    if (kind === "arrow") {
      hiss({ dur: 0.05, gain: 0.03, f: 900, q: 2 });
      return;
    }
    tone({ f: 90, f2: 45, type: "sine", dur: 0.28, gain: 0.2 });
    hiss({ dur: 0.2, gain: 0.08, f: 500, f2: 200, type: "lowpass" });
  },
  defeat_unit(type) {
    if (!gate("die", 0.06)) return;
    hiss({ dur: 0.2, gain: 0.05, f: 600, type: "lowpass" });
    tone({ f: type === "knight" || type === "shield" ? 150 : 240, f2: 90, type: "triangle", dur: 0.2, gain: 0.06 });
  },
  castleDestroyed() {
    tone({ f: 70, f2: 28, type: "sine", dur: 1.6, gain: 0.32 });
    hiss({ dur: 1.6, gain: 0.2, f: 900, f2: 90, type: "lowpass" });
    hiss({ t: 0.3, dur: 1.1, gain: 0.1, f: 2000, f2: 300, type: "bandpass", q: 0.6 });
    for (let i = 0; i < 6; i++) tone({ f: 120 + Math.random() * 60, f2: 50, type: "triangle", t: 0.15 + i * 0.18, dur: 0.18, gain: 0.08 });
  },
  victory() {
    [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone({ f, t: i * 0.13, type: "sawtooth", dur: i === 6 ? 0.8 : 0.18, gain: 0.05, q: 2400, attack: 0.01 }));
    [196, 262].forEach((f) => tone({ f, t: 0.78, type: "triangle", dur: 1.0, gain: 0.08 }));
  },
  defeat() {
    [392, 349, 311, 294, 262].forEach((f, i) => tone({ f, t: i * 0.24, type: "triangle", dur: 0.32, gain: 0.07 }));
    tone({ f: 98, t: 1.0, type: "sine", dur: 1.0, gain: 0.12 });
  },
};
