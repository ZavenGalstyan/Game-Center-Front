/**
 * Train Commander — WebAudio synth (no audio files, nothing copyrighted).
 *
 * Buses: sfx · train · music, all into one master. `setEnabled(sound &&
 * !muted)` closes the sfx AND train buses; `setMusic(on && !muted)` stops the
 * music scheduler and fades its bus — the Game Center Mute silences
 * everything immediately and nothing keeps playing in the background.
 *
 * The train loop is ONE scheduler (setInterval look-ahead, started once):
 * chuffs, rail clacks and an engine rumble whose rate/volume follow
 * `setTrain(speed01, active)`. Calling setTrain every frame only updates
 * numbers — the loop is never restarted, so it can't stack or stutter.
 * Busy sounds (gunfire at 2x) are rate-limited per name and capped in voices.
 * Impact sounds only ever come from real engine impact events.
 */
let ctx = null;
let master = null;
let sfx = null;
let trainBus = null;
let musicBus = null;
let enabled = true;
let noiseBuf = null;
let voices = 0;
const last = {};
const music = { want: false, timer: null, next: 0, step: 0, mood: "menu", region: 1 };
const train = { want: false, speed: 0, timer: null, next: 0, clack: 0, rumble: null, rumbleGain: null, tunnel: 0 };

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.72;
      master.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.gain.value = enabled ? 1 : 0;
      sfx.connect(master);
      trainBus = ctx.createGain();
      trainBus.gain.value = enabled ? 1 : 0;
      trainBus.connect(master);
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
  if (voices > 26) return false;
  voices++;
  setTimeout(() => (voices = Math.max(0, voices - 1)), (dur + 0.1) * 1000);
  return true;
}

function tone({ f = 440, f2, type = "sine", t = 0, dur = 0.15, gain = 0.2, attack = 0.004, dest, q, at }) {
  const a = ac();
  if (!a || (!enabled && dest !== musicBus)) return;
  if (!dest && !voice(dur)) return;
  const now = at ?? a.currentTime + t;
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

function hiss({ t = 0, dur = 0.12, gain = 0.15, type = "bandpass", f = 2000, f2, q = 1, attack = 0.003, dest, at }) {
  const a = ac();
  if (!a || (!enabled && dest !== musicBus)) return;
  if (!dest && !voice(dur)) return;
  const now = at ?? a.currentTime + t;
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

/* ---------------------------------------------------------------- train loop */
function scheduleTrain() {
  const a = ac();
  if (!a || !train.want) return;
  const sp = train.speed;
  // rumble follows speed smoothly
  if (train.rumbleGain) train.rumbleGain.gain.setTargetAtTime(0.012 + sp * 0.04, a.currentTime, 0.2);
  if (train.rumble) train.rumble.frequency.setTargetAtTime(38 + sp * 22, a.currentTime, 0.3);
  if (sp < 0.04) {
    // idling at a station: slow soft steam breaths
    while (train.next < a.currentTime + 0.3) {
      hiss({ at: train.next, dur: 0.9, gain: 0.03, type: "bandpass", f: 900, q: 0.6, attack: 0.25, dest: trainBus });
      train.next += 2.2;
    }
    return;
  }
  const chuff = 1 / (1.2 + sp * 4.4); // seconds between chuffs
  while (train.next < a.currentTime + 0.3) {
    const at = Math.max(train.next, a.currentTime + 0.01);
    const strong = train.clack % 2 === 0;
    hiss({ at, dur: 0.16, gain: (strong ? 0.07 : 0.045) * (0.6 + sp * 0.5), type: "bandpass", f: strong ? 700 : 1100, f2: 300, q: 0.7, attack: 0.008, dest: trainBus });
    // rail joint clack-clack every 4 chuffs
    if (train.clack % 4 === 0) {
      tone({ at: at + 0.02, f: 180, f2: 110, type: "square", dur: 0.04, gain: 0.025, dest: trainBus, q: 900 });
      tone({ at: at + 0.11, f: 170, f2: 100, type: "square", dur: 0.04, gain: 0.02, dest: trainBus, q: 900 });
    }
    train.clack++;
    train.next = at + chuff;
  }
}

/* ---------------------------------------------------------------- music */
const SCALES = {
  1: [0, 2, 4, 5, 7, 9, 11],
  2: [0, 1, 4, 5, 7, 8, 10],
  3: [0, 2, 3, 5, 7, 8, 10],
  4: [0, 1, 3, 5, 6, 8, 10],
  5: [0, 2, 3, 5, 7, 9, 10],
};
const ROOT = { 1: 146.8, 2: 138.6, 3: 155.6, 4: 130.8, 5: 164.8 };
const TUNE = [0, 2, 4, 2, 5, 4, 2, -1, 0, 2, 4, 6, 5, 4, 2, -1, 4, 5, 6, 4, 2, 1, 0, -1, 2, 1, 0, 1, 2, 4, 0, -1];
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
  const beat = battle ? 0.28 : 0.4;
  while (music.next < a.currentTime + 0.35) {
    const at = music.next;
    const s = music.step;
    const k = music.region;
    if (s % 8 === 0) {
      const root = (s / 8) % 4 === 2 ? 3 : (s / 8) % 4 === 3 ? 4 : 0;
      for (const d of [root, root + 4]) tone({ at, f: freq(k, d, -1), type: "triangle", dur: beat * 8.2, gain: 0.028, attack: 0.5, dest: musicBus, q: 700 });
    }
    const m = TUNE[s % 32];
    if (m >= 0 && (battle || s % 2 === 0)) {
      tone({ at, f: freq(k, m, 1), type: "triangle", dur: beat * 1.3, gain: 0.04, attack: 0.006, dest: musicBus, q: 2600 });
      tone({ at, f: freq(k, m, 2), type: "sine", dur: beat * 0.5, gain: 0.01, attack: 0.004, dest: musicBus });
    }
    if (battle) {
      if (s % 4 === 0) tone({ at, f: 90, f2: 46, type: "sine", dur: 0.26, gain: 0.11, dest: musicBus });
      if (s % 8 === 6) tone({ at, f: 120, f2: 60, type: "sine", dur: 0.2, gain: 0.06, dest: musicBus });
      if (s % 2 === 1) hiss({ at, dur: 0.04, gain: 0.016, f: 5000, type: "highpass", dest: musicBus });
    }
    music.next += beat;
    music.step++;
  }
}

/* ---------------------------------------------------------------- api */
export const audio = {
  state() {
    return { sfx: enabled, music: music.want, train: train.want && !!train.timer, trainTimers: train.timer ? 1 : 0, musicTimers: music.timer ? 1 : 0, voices, ctx: ctx ? ctx.state : "none" };
  },
  unlock() {
    const a = ac();
    if (a && a.state === "suspended") a.resume().catch(() => {});
  },
  setEnabled(on) {
    enabled = !!on;
    if (ctx && sfx) {
      sfx.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.02);
      trainBus.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.02);
    }
    this._syncTrain();
  },
  /** speed01: 0..1 (train speed / cruise) · active: the train is on screen and running */
  setTrain(speed01, active) {
    train.speed = Math.max(0, Math.min(1.4, speed01 || 0));
    const want = !!active && enabled;
    if (want !== train.want) {
      train.want = want;
      this._syncTrain();
    }
  },
  _syncTrain() {
    const want = train.want && enabled;
    if (want && !train.timer) {
      const a = ac();
      if (!a) return;
      train.next = a.currentTime + 0.05;
      if (!train.rumble) {
        train.rumble = a.createOscillator();
        train.rumble.type = "sawtooth";
        train.rumble.frequency.value = 40;
        const fl = a.createBiquadFilter();
        fl.type = "lowpass";
        fl.frequency.value = 140;
        train.rumbleGain = a.createGain();
        train.rumbleGain.gain.value = 0.0001;
        train.rumble.connect(fl);
        fl.connect(train.rumbleGain);
        train.rumbleGain.connect(trainBus);
        train.rumble.start();
      }
      train.timer = setInterval(scheduleTrain, 100);
    } else if (!want && train.timer) {
      clearInterval(train.timer);
      train.timer = null;
      if (train.rumbleGain && ctx) train.rumbleGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
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
    if (train.timer) clearInterval(train.timer);
    music.timer = null;
    music.want = false;
    train.timer = null;
    train.want = false;
    if (train.rumble) {
      try {
        train.rumble.stop();
      } catch {
        /* already stopped */
      }
    }
    train.rumble = null;
    train.rumbleGain = null;
    if (ctx) {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }
    ctx = null;
    master = sfx = trainBus = musicBus = null;
    noiseBuf = null;
    voices = 0;
    for (const k of Object.keys(last)) delete last[k];
  },

  /* ---------------- UI */
  ui() {
    if (!gate("ui", 0.04)) return;
    tone({ f: 620, f2: 820, type: "triangle", dur: 0.06, gain: 0.07 });
  },
  error() {
    if (!gate("err", 0.15)) return;
    tone({ f: 220, f2: 160, type: "square", dur: 0.12, gain: 0.05, q: 1200 });
  },
  /* ---------------- weapons */
  gunner(level) {
    if (!gate("gun", 0.055)) return;
    hiss({ dur: 0.07, gain: 0.07, type: "highpass", f: 1800 + level * 300, q: 0.7 });
    tone({ f: 160, f2: 70, type: "square", dur: 0.05, gain: 0.04, q: 900 });
  },
  cannon() {
    if (!gate("can", 0.08)) return;
    tone({ f: 120, f2: 38, type: "sine", dur: 0.45, gain: 0.24 });
    hiss({ dur: 0.35, gain: 0.14, type: "lowpass", f: 900, f2: 200, q: 0.5 });
  },
  cannonImpact(hits) {
    if (!gate("boom", 0.06)) return;
    tone({ f: 90, f2: 32, type: "sine", dur: 0.55, gain: 0.22 });
    hiss({ dur: 0.5, gain: 0.13 + Math.min(0.06, hits * 0.015), type: "lowpass", f: 1200, f2: 180, q: 0.4 });
  },
  lancer() {
    if (!gate("lan", 0.1)) return;
    tone({ f: 340, f2: 120, type: "triangle", dur: 0.18, gain: 0.09 });
    hiss({ dur: 0.18, gain: 0.05, type: "bandpass", f: 2400, f2: 900, q: 1.2 });
  },
  hit(armored) {
    if (!gate("hit", 0.04)) return;
    if (armored) tone({ f: 1400, f2: 900, type: "triangle", dur: 0.08, gain: 0.05 });
    else hiss({ dur: 0.05, gain: 0.05, type: "bandpass", f: 900, q: 1 });
  },
  enemyAttack(kind) {
    if (!gate(`ea${kind}`, 0.08)) return;
    if (kind === "ram") tone({ f: 70, f2: 40, type: "sawtooth", dur: 0.35, gain: 0.06, q: 400 });
    else hiss({ dur: 0.12, gain: 0.04, type: "bandpass", f: 1400, f2: 600, q: 1 });
  },
  enemyShoot() {
    if (!gate("esh", 0.08)) return;
    tone({ f: 260, f2: 140, type: "triangle", dur: 0.12, gain: 0.05 });
  },
  armorHit(heavy) {
    if (!gate("armor", 0.06)) return;
    tone({ f: heavy ? 260 : 520, f2: heavy ? 180 : 380, type: "square", dur: heavy ? 0.22 : 0.12, gain: heavy ? 0.08 : 0.05, q: 2200 });
    tone({ f: heavy ? 780 : 1240, type: "triangle", dur: 0.18, gain: 0.03 });
    if (heavy) hiss({ dur: 0.2, gain: 0.08, type: "lowpass", f: 700, q: 0.5 });
  },
  enemyDefeat() {
    if (!gate("edef", 0.05)) return;
    hiss({ dur: 0.22, gain: 0.06, type: "lowpass", f: 900, f2: 300, q: 0.6 });
    tone({ f: 300, f2: 120, type: "triangle", dur: 0.18, gain: 0.04 });
  },
  vehicleDestroyed(big) {
    if (!gate("vdes", 0.1)) return;
    tone({ f: big ? 70 : 95, f2: 28, type: "sine", dur: big ? 1.1 : 0.7, gain: 0.26 });
    hiss({ dur: big ? 1.0 : 0.7, gain: 0.16, type: "lowpass", f: 1400, f2: 160, q: 0.4 });
    hiss({ t: 0.08, dur: 0.4, gain: 0.05, type: "highpass", f: 3000, q: 0.5 });
  },
  scrap() {
    if (!gate("scrap", 0.06)) return;
    tone({ f: 1320, type: "triangle", dur: 0.08, gain: 0.04 });
    tone({ t: 0.05, f: 1760, type: "triangle", dur: 0.1, gain: 0.035 });
  },
  build() {
    if (!gate("build", 0.1)) return;
    for (let i = 0; i < 4; i++) tone({ t: i * 0.05, f: 420 + i * 40, type: "square", dur: 0.03, gain: 0.03, q: 1600 });
    tone({ t: 0.22, f: 120, f2: 70, type: "sine", dur: 0.2, gain: 0.12 });
  },
  upgrade() {
    if (!gate("upg", 0.1)) return;
    [523, 659, 784, 1046].forEach((f, i) => tone({ t: i * 0.06, f, type: "triangle", dur: 0.16, gain: 0.06 }));
  },
  repair() {
    if (!gate("rep", 0.12)) return;
    hiss({ dur: 0.1, gain: 0.025, type: "highpass", f: 4500, q: 0.8 });
  },
  emergency() {
    if (!gate("emer", 0.2)) return;
    tone({ f: 392, f2: 784, type: "triangle", dur: 0.3, gain: 0.07 });
    hiss({ dur: 0.35, gain: 0.05, type: "highpass", f: 3500, q: 0.6 });
  },
  critical() {
    if (!gate("crit", 1.6)) return;
    tone({ f: 880, type: "square", dur: 0.09, gain: 0.04, q: 2000 });
    tone({ t: 0.16, f: 880, type: "square", dur: 0.09, gain: 0.04, q: 2000 });
  },
  wagonDown() {
    if (!gate("wdown", 0.3)) return;
    tone({ f: 200, f2: 60, type: "sawtooth", dur: 0.5, gain: 0.07, q: 800 });
    hiss({ dur: 0.6, gain: 0.08, type: "lowpass", f: 900, f2: 200, q: 0.5 });
  },
  warn() {
    if (!gate("warn", 0.5)) return;
    tone({ f: 660, f2: 520, type: "triangle", dur: 0.14, gain: 0.045 });
  },
  whistle() {
    if (!gate("whistle", 1)) return;
    for (const [f, g] of [[587, 0.05], [740, 0.04], [880, 0.03]]) tone({ f, f2: f * 0.98, type: "sine", dur: 0.9, gain: g, attack: 0.05 });
  },
  checkpoint() {
    if (!gate("cp", 0.5)) return;
    [784, 988, 1175].forEach((f, i) => tone({ t: i * 0.12, f, type: "sine", dur: 0.6, gain: 0.06 }));
  },
  bossWarn() {
    if (!gate("boss", 1)) return;
    for (let i = 0; i < 3; i++) tone({ t: i * 0.42, f: 110, f2: 98, type: "sawtooth", dur: 0.36, gain: 0.08, q: 600 });
    tone({ t: 1.3, f: 82, type: "sine", dur: 0.9, gain: 0.12 });
  },
  bossFire() {
    if (!gate("bfire", 0.2)) return;
    tone({ f: 80, f2: 40, type: "sine", dur: 0.5, gain: 0.18 });
    hiss({ dur: 0.4, gain: 0.08, type: "lowpass", f: 600, q: 0.5 });
  },
  thunder() {
    if (!gate("thunder", 2)) return;
    hiss({ t: 0.3, dur: 2.2, gain: 0.08, type: "lowpass", f: 300, f2: 80, q: 0.4, attack: 0.15 });
  },
  victory() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone({ t: i * 0.13, f, type: "triangle", dur: 0.35, gain: 0.07 }));
  },
  defeat() {
    [392, 330, 262, 196].forEach((f, i) => tone({ t: i * 0.2, f, type: "triangle", dur: 0.45, gain: 0.07 }));
  },
};
