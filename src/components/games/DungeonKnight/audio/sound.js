/**
 * Dungeon Knight — WebAudio synth (no audio files, no libraries).
 *
 * Buses: sfx / music → master → compressor → speakers.
 *   - Settings volumes: master, music, sfx (0..1)
 *   - Game Center Mute: master gain → 0 immediately. Every sound (combat,
 *     UI, footsteps, ambience, music, anything created later) routes through
 *     master, so nothing slips past the mute, and there is no second "game
 *     mute" fighting it.
 *   - stopAll(): ends held sounds and the music scheduler (pause, screen
 *     change, unmount) so nothing stacks across restarts / fullscreen.
 *
 * The SWING and the HIT are separate sounds: a miss only whooshes.
 */
let ctx = null;
let master = null;
let sfxBus = null;
let musBus = null;
let noiseBuf = null;
let muted = false;
let vol = { master: 0.8, music: 0.5, sfx: 0.9 };
const last = {};
let musicTimer = null;
let musicMode = null;
let beat = 0;
let nextT = 0;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3.5;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    musBus = ctx.createGain();
    sfxBus.connect(master);
    musBus.connect(master);
    apply();
  }
  return ctx;
}
function apply() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(muted ? 0 : vol.master, t);
  sfxBus.gain.setValueAtTime(vol.sfx, t);
  musBus.gain.setValueAtTime(vol.music * 0.45, t);
}
function noise() {
  if (!noiseBuf) {
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
const ready = () => ctx && ctx.state === "running" && !muted;
function gate(name, ms) {
  const now = performance.now();
  if (last[name] && now - last[name] < ms) return false;
  last[name] = now;
  return true;
}
function nz({ dur = 0.1, f = 1200, q = 1, type = "bandpass", gain = 0.3, at = 0.004, sweep = null, when = 0, bus = sfxBus, rate = 1 }) {
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource();
  s.buffer = noise();
  s.playbackRate.value = rate;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(30, sweep), t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(bus);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}
function tn({ f = 440, f2 = null, dur = 0.2, type = "sine", gain = 0.2, at = 0.005, when = 0, bus = sfxBus, detune = 0 }) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}
/** metallic ring: inharmonic partials */
function clang(base, gain, dur = 0.6, when = 0) {
  for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.3], [8.9, 0.15]]) tn({ f: base * m * (0.98 + Math.random() * 0.04), dur: dur / Math.sqrt(m), gain: gain * a, type: "sine", when, at: 0.002 });
}

export const sound = {
  unlock() {
    const a = ac();
    if (a && a.state === "suspended") a.resume().catch(() => {});
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    apply();
  },
  setMuted(m) {
    muted = !!m;
    apply();
  },
  get muted() {
    return muted;
  },
  /** live gain snapshot for tests */
  inspect() {
    return { state: ctx ? ctx.state : "none", master: master ? master.gain.value : null, muted, music: musicMode };
  },

  /* ---------------- movement */
  step(run, surface = "stone") {
    if (!ready() || !gate("step", 120)) return;
    const f = surface === "ice" ? 2600 : surface === "moss" ? 700 : 1500;
    nz({ dur: 0.07, f: f * (0.85 + Math.random() * 0.3), q: 1.4, gain: run ? 0.09 : 0.06, type: "bandpass" });
    tn({ f: 90 + Math.random() * 20, f2: 60, dur: 0.06, gain: run ? 0.07 : 0.045 });
    // armour jingle on the stride
    if (Math.random() < 0.5) nz({ dur: 0.05, f: 5200, q: 6, gain: 0.025, when: 0.02 });
  },
  dodge() {
    if (!ready()) return;
    nz({ dur: 0.32, f: 600, sweep: 2400, q: 0.8, gain: 0.16, at: 0.02 });
    nz({ dur: 0.18, f: 300, q: 1, gain: 0.12, when: 0.26, type: "lowpass" });
  },

  /* ---------------- sword */
  swing(heavy) {
    if (!ready()) return;
    // the whoosh only — hit sounds are separate
    nz({ dur: heavy ? 0.42 : 0.24, f: heavy ? 500 : 900, sweep: heavy ? 2200 : 3400, q: 1.6, gain: heavy ? 0.22 : 0.16, at: heavy ? 0.12 : 0.05, when: heavy ? 0.25 : 0.08 });
    if (heavy) tn({ f: 120, f2: 70, dur: 0.3, gain: 0.08, when: 0.3 });
  },
  hit(kind, heavy, killed) {
    if (!ready()) return;
    const k = heavy ? 1.4 : 1;
    if (kind === "soft" || kind === "slime") {
      // squelch
      nz({ dur: 0.18, f: 900, sweep: 220, q: 2, gain: 0.28 * k, type: "lowpass" });
      tn({ f: 260, f2: 90, dur: 0.16, gain: 0.18 * k, type: "sine" });
      tn({ f: 520, f2: 180, dur: 0.1, gain: 0.06, type: "triangle", when: 0.02 });
    } else if (kind === "bone") {
      nz({ dur: 0.06, f: 2600, q: 4, gain: 0.3 * k });
      nz({ dur: 0.1, f: 1300, q: 3, gain: 0.18 * k, when: 0.025 });
      tn({ f: 180, f2: 110, dur: 0.12, gain: 0.12 * k });
    } else if (kind === "stone") {
      nz({ dur: 0.18, f: 700, q: 1, gain: 0.32 * k, type: "lowpass" });
      clang(420, 0.05, 0.25);
      tn({ f: 70, f2: 45, dur: 0.22, gain: 0.2 * k });
    } else {
      // armour
      nz({ dur: 0.05, f: 3800, q: 2, gain: 0.25 * k });
      clang(340 + Math.random() * 60, 0.09 * k, 0.55);
      tn({ f: 110, f2: 70, dur: 0.15, gain: 0.14 * k });
    }
    if (killed) {
      tn({ f: 160, f2: 50, dur: 0.4, gain: 0.18, when: 0.05 });
      nz({ dur: 0.4, f: 400, sweep: 120, q: 0.7, gain: 0.12, type: "lowpass", when: 0.05 });
    }
  },
  enemyShield() {
    if (!ready()) return;
    nz({ dur: 0.08, f: 1200, q: 1, gain: 0.3, type: "lowpass" });
    tn({ f: 140, f2: 90, dur: 0.12, gain: 0.2 });
    clang(520, 0.04, 0.3);
  },
  clank() {
    if (!ready() || !gate("clank", 80)) return;
    clang(880, 0.06, 0.4);
    nz({ dur: 0.06, f: 4000, q: 3, gain: 0.18 });
  },

  /* ---------------- knight hurt / block */
  block(hpLost) {
    if (!ready()) return;
    nz({ dur: 0.12, f: 900, q: 0.8, gain: 0.32, type: "lowpass" });
    tn({ f: 150, f2: 80, dur: 0.18, gain: 0.25 });
    clang(300, hpLost ? 0.05 : 0.07, 0.4);
  },
  guardBreak() {
    if (!ready()) return;
    nz({ dur: 0.35, f: 2400, sweep: 300, q: 0.8, gain: 0.35 });
    tn({ f: 220, f2: 55, dur: 0.5, gain: 0.3, type: "sawtooth" });
    clang(240, 0.08, 0.7);
  },
  hurt() {
    if (!ready()) return;
    nz({ dur: 0.16, f: 600, q: 1.2, gain: 0.3, type: "lowpass" });
    tn({ f: 190, f2: 120, dur: 0.22, gain: 0.16, type: "triangle" });
    tn({ f: 95, f2: 60, dur: 0.2, gain: 0.2 });
  },
  evade() {
    if (!ready()) return;
    tn({ f: 1400, f2: 2200, dur: 0.12, gain: 0.05, type: "triangle" });
  },
  death() {
    if (!ready()) return;
    tn({ f: 220, f2: 55, dur: 1.2, gain: 0.22, type: "sawtooth" });
    tn({ f: 110, f2: 40, dur: 1.4, gain: 0.25 });
    nz({ dur: 0.6, f: 500, sweep: 80, q: 0.6, gain: 0.2, type: "lowpass", when: 0.2 });
  },
  noStamina() {
    if (!ready() || !gate("nost", 400)) return;
    tn({ f: 160, f2: 120, dur: 0.14, gain: 0.08, type: "square" });
  },

  /* ---------------- enemies */
  telegraph(enemy, boss) {
    if (!ready() || !gate(`tele${enemy}`, 150)) return;
    if (enemy === "slime" || enemy === "spider") {
      tn({ f: 180, f2: 320, dur: 0.4, gain: 0.08, type: "triangle" });
      nz({ dur: 0.35, f: 500, sweep: 900, q: 3, gain: 0.05 });
    } else if (enemy === "bat") {
      tn({ f: 2400, f2: 3200, dur: 0.12, gain: 0.05, type: "square" });
    } else if (enemy === "mage") {
      tn({ f: 440, f2: 880, dur: 0.7, gain: 0.07, type: "sine" });
      tn({ f: 660, f2: 1320, dur: 0.7, gain: 0.04, type: "sine" });
    } else {
      // a growl / armour creak before the swing
      nz({ dur: 0.45, f: 250, sweep: 500, q: 2, gain: boss ? 0.18 : 0.1, type: "lowpass" });
      tn({ f: boss ? 70 : 110, f2: boss ? 95 : 140, dur: 0.45, gain: boss ? 0.16 : 0.07, type: "sawtooth" });
    }
  },
  enemySwing(kind, boss) {
    if (!ready()) return;
    if (kind === "orb") {
      tn({ f: 900, f2: 300, dur: 0.3, gain: 0.08, type: "triangle" });
      return;
    }
    if (kind === "ring") {
      nz({ dur: 0.8, f: 300, sweep: 1500, q: 0.7, gain: 0.2 });
      return;
    }
    nz({ dur: 0.22, f: boss ? 500 : 800, sweep: boss ? 1800 : 2600, q: 1.4, gain: boss ? 0.2 : 0.12, at: 0.04 });
  },
  slam() {
    if (!ready()) return;
    tn({ f: 80, f2: 35, dur: 0.5, gain: 0.4 });
    nz({ dur: 0.45, f: 500, sweep: 90, q: 0.6, gain: 0.32, type: "lowpass" });
  },
  orbBurst() {
    if (!ready() || !gate("orb", 60)) return;
    nz({ dur: 0.2, f: 1800, sweep: 400, q: 1, gain: 0.12 });
  },
  enemyDeath(kind) {
    if (!ready()) return;
    if (kind === "slime") {
      for (let i = 0; i < 4; i++) tn({ f: 300 - i * 50, f2: 120, dur: 0.12, gain: 0.08, when: i * 0.06, type: "sine" });
    } else if (kind === "skeleton" || kind === "shieldSkel") {
      for (let i = 0; i < 6; i++) nz({ dur: 0.05, f: 1800 + Math.random() * 1200, q: 5, gain: 0.12, when: 0.05 + i * 0.07 + Math.random() * 0.03 });
    } else if (kind === "golem") {
      for (let i = 0; i < 5; i++) nz({ dur: 0.3, f: 300, q: 0.8, gain: 0.2, type: "lowpass", when: i * 0.12 });
    } else {
      nz({ dur: 0.5, f: 700, sweep: 150, q: 0.8, gain: 0.15, type: "lowpass" });
    }
  },
  notice() {
    if (!ready() || !gate("notice", 300)) return;
    tn({ f: 300, f2: 420, dur: 0.18, gain: 0.05, type: "triangle" });
  },

  /* ---------------- world */
  door(open) {
    if (!ready()) return;
    nz({ dur: 0.9, f: open ? 380 : 280, sweep: open ? 520 : 200, q: 7, gain: 0.07 });
    tn({ f: 60, f2: 40, dur: open ? 0.6 : 0.45, gain: 0.3, when: open ? 0.5 : 0.05 });
    nz({ dur: 0.35, f: 300, q: 0.6, gain: 0.25, type: "lowpass", when: open ? 0.5 : 0.05 });
  },
  chest() {
    if (!ready()) return;
    nz({ dur: 0.5, f: 520, sweep: 760, q: 9, gain: 0.08 });
    tn({ f: 90, f2: 60, dur: 0.2, gain: 0.15, when: 0.4 });
    [784, 988, 1175, 1568].forEach((f, i) => tn({ f, dur: 0.5, gain: 0.06, when: 0.5 + i * 0.07, type: "triangle" }));
  },
  loot(rarity = 0) {
    if (!ready()) return;
    const base = [523, 587, 659, 784][rarity] || 523;
    [1, 1.25, 1.5, 2].forEach((m, i) => tn({ f: base * m, dur: 0.45, gain: 0.07, when: i * 0.08, type: "triangle" }));
    if (rarity >= 2) tn({ f: base * 3, dur: 0.9, gain: 0.05, when: 0.35 });
  },
  gold() {
    if (!ready() || !gate("gold", 90)) return;
    for (let i = 0; i < 3; i++) tn({ f: 2200 + Math.random() * 1600, dur: 0.12, gain: 0.05, when: i * 0.05, type: "square" });
  },
  potion() {
    if (!ready()) return;
    for (let i = 0; i < 4; i++) tn({ f: 300 + i * 40, f2: 180, dur: 0.1, gain: 0.08, when: i * 0.09 });
    [660, 880, 1100].forEach((f, i) => tn({ f, dur: 0.4, gain: 0.05, when: 0.4 + i * 0.06 }));
  },
  shrine() {
    if (!ready()) return;
    [392, 523, 659, 784].forEach((f, i) => tn({ f, dur: 1.2, gain: 0.06, when: i * 0.12 }));
    nz({ dur: 1.2, f: 3000, q: 0.5, gain: 0.03 });
  },
  roomClear() {
    if (!ready()) return;
    [392, 523, 659].forEach((f, i) => tn({ f, dur: 0.6, gain: 0.08, when: i * 0.1, type: "triangle" }));
    tn({ f: 784, dur: 1.0, gain: 0.07, when: 0.3, type: "triangle" });
  },
  bossIntro() {
    if (!ready()) return;
    tn({ f: 55, dur: 2.2, gain: 0.3, type: "sawtooth", at: 0.4 });
    tn({ f: 82, dur: 2.0, gain: 0.15, type: "sawtooth", at: 0.4, detune: 8 });
    nz({ dur: 1.6, f: 200, sweep: 600, q: 1, gain: 0.15, type: "lowpass", at: 0.5 });
  },
  bossDefeat() {
    if (!ready()) return;
    tn({ f: 60, f2: 30, dur: 1.6, gain: 0.35 });
    [262, 330, 392, 523, 659].forEach((f, i) => tn({ f, dur: 2, gain: 0.07, when: 0.6 + i * 0.12, type: "triangle" }));
  },
  levelUp() {
    if (!ready()) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => tn({ f, dur: 0.5, gain: 0.08, when: i * 0.07, type: "triangle" }));
    nz({ dur: 0.8, f: 6000, q: 0.5, gain: 0.03, when: 0.2 });
  },
  ui() {
    if (!ready() || !gate("ui", 40)) return;
    tn({ f: 720, f2: 900, dur: 0.06, gain: 0.05, type: "triangle" });
  },
  uiBack() {
    if (!ready() || !gate("ui", 40)) return;
    tn({ f: 600, f2: 460, dur: 0.07, gain: 0.05, type: "triangle" });
  },
  deny() {
    if (!ready() || !gate("deny", 150)) return;
    tn({ f: 200, f2: 150, dur: 0.15, gain: 0.07, type: "square" });
  },

  /* ---------------- music: a slow dungeon drone + bells; boss adds drums */
  music(mode) {
    // mode: null | "menu" | "dungeon" | "boss"
    if (mode === musicMode) return;
    musicMode = mode;
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    if (!mode) return;
    const a = ac();
    if (!a) return;
    nextT = a.currentTime + 0.1;
    beat = 0;
    musicTimer = setInterval(scheduleMusic, 120);
  },
  stopAll() {
    sound.music(null);
  },
  dispose() {
    sound.music(null);
  },
};

const SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor
function scheduleMusic() {
  if (!ctx || !musicMode) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    nextT = ctx.currentTime + 0.1;
    return;
  }
  const boss = musicMode === "boss";
  const spb = boss ? 0.32 : 0.62; // seconds per beat
  while (nextT < ctx.currentTime + 0.5) {
    const t = nextT - ctx.currentTime;
    const bar = Math.floor(beat / 8);
    const root = boss ? 41 : musicMode === "menu" ? 45 : 43; // MIDI
    const prog = [0, -4, -2, -5][bar % 4];
    const hz = (m) => 440 * 2 ** ((m - 69) / 12);
    if (!muted) {
      if (beat % 8 === 0) {
        // drone chord
        for (const iv of [0, 7, 12]) tn({ f: hz(root + prog + iv), dur: spb * 8.2, gain: iv ? 0.022 : 0.04, type: iv === 12 ? "triangle" : "sine", at: 0.8, when: t, bus: musBus, detune: iv ? 4 : 0 });
      }
      // sparse bell melody
      if (!boss && (beat % 4 === 2 || (beat % 8 === 7 && Math.random() < 0.5)) && Math.random() < 0.7) {
        const deg = SCALE[Math.floor(Math.random() * SCALE.length)];
        tn({ f: hz(root + 24 + prog + deg), dur: 1.6, gain: 0.025, type: "sine", when: t, bus: musBus });
        tn({ f: hz(root + 36 + prog + deg), dur: 0.8, gain: 0.008, type: "sine", when: t, bus: musBus });
      }
      if (boss) {
        // war drums + ostinato
        if (beat % 2 === 0) {
          tn({ f: 70, f2: 40, dur: 0.3, gain: beat % 4 === 0 ? 0.16 : 0.1, when: t, bus: musBus });
          nz({ dur: 0.12, f: 400, q: 0.7, gain: 0.06, type: "lowpass", when: t, bus: musBus });
        }
        const deg = [0, 3, 7, 3, 0, 5, 8, 7][beat % 8];
        tn({ f: hz(root + 12 + prog + deg), dur: spb * 0.9, gain: 0.03, type: "sawtooth", when: t, bus: musBus, at: 0.01 });
      }
    }
    nextT += spb;
    beat++;
  }
}
