/**
 * Color Platforms — WebAudio synth (no files, nothing copyrighted).
 *
 * Buses: sfx + music → master. The Game Center Mute button, the Master
 * volume and the SFX / Music settings all resolve to two gains:
 *   sfx gain   = master × (sfxOn && !muted)
 *   music gain = master × (musicOn && !muted) × 0.5
 * so muting silences everything instantly without touching saved settings.
 *
 * Color switches are throttled to one voice (a new switch chokes the previous
 * one) so mashing 1-2-3 never piles up sound.
 */

let ctx = null;
let master = null;
let sfx = null;
let musicBus = null;
let noiseBuf = null;
let state = { master: 0.8, sfx: true, music: true, muted: false };
let musicTimer = null;
let musicNext = 0;
let musicStep = 0;
let variant = 0;
let musicWanted = false;
let lastSwitch = 0;
let switchVoice = null;
const lastAt = {};

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      applyGains(true);
    } catch {
      ctx = null;
      return null;
    }
  }
  return ctx;
}

function applyGains(instant = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const sg = state.muted || !state.sfx ? 0 : state.master;
  const mg = state.muted || !state.music || !musicWanted ? 0 : state.master * 0.5;
  // SFX: set directly (an idle bus is not rendered, so automation would not
  // even show up in .value); every sfx call is also gated by sfxOn().
  sfx.gain.cancelScheduledValues(t);
  sfx.gain.value = sg;
  musicBus.gain.cancelScheduledValues(t);
  if (instant) musicBus.gain.setValueAtTime(mg, t);
  else musicBus.gain.setTargetAtTime(mg, t, 0.04);
}

const sfxOn = () => !state.muted && state.sfx && state.master > 0;

function noise() {
  const a = ac();
  if (!a) return null;
  if (!noiseBuf) {
    const n = Math.floor(a.sampleRate * 1);
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
  }
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

function tone({ f = 440, f2, type = "sine", t = 0, dur = 0.15, gain = 0.2, attack = 0.004, dest }) {
  const a = ac();
  if (!a) return null;
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
  return { o, g, end: now + dur };
}

function hiss({ t = 0, dur = 0.1, gain = 0.12, type = "bandpass", f = 2000, f2, q = 1, dest }) {
  const a = ac();
  if (!a) return;
  const now = a.currentTime + t;
  const src = noise();
  const fl = a.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, now);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + dur);
  fl.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(fl);
  fl.connect(g);
  g.connect(dest || sfx);
  src.start(now, (musicStep * 0.113) % 0.7);
  src.stop(now + dur + 0.05);
}

/** Drop repeats of the same sound inside `gap` seconds. */
function gate(name, gap) {
  const a = ac();
  if (!a) return false;
  const now = a.currentTime;
  if (lastAt[name] && now - lastAt[name] < gap) return false;
  lastAt[name] = now;
  return true;
}

const SWITCH_F = { BLUE: 523.25, RED: 659.25, YELLOW: 783.99 };

export const audio = {
  unlock() {
    const a = ac();
    if (a && a.state === "suspended") a.resume().catch(() => {});
    if (musicWanted) startMusic();
  },

  configure(next) {
    state = { ...state, ...next };
    if (!ctx) return;
    applyGains();
    if (musicWanted && state.music && !state.muted) startMusic();
  },

  jump() {
    if (!sfxOn() || !gate("jump", 0.05)) return;
    tone({ f: 330, f2: 620, type: "triangle", dur: 0.12, gain: 0.12 });
    hiss({ dur: 0.06, gain: 0.04, f: 3000 });
  },
  land({ impact = 0.5 } = {}) {
    if (!sfxOn() || !gate("land", 0.06)) return;
    tone({ f: 150 + impact * 40, f2: 70, type: "sine", dur: 0.09, gain: 0.08 + impact * 0.1 });
    hiss({ dur: 0.05, gain: 0.03 + impact * 0.05, type: "lowpass", f: 900 });
  },
  switch({ color }) {
    if (!sfxOn()) return;
    const a = ac();
    if (!a) return;
    const now = a.currentTime;
    if (now - lastSwitch < 0.035) return; // mashing: drop, never stack
    lastSwitch = now;
    if (switchVoice && switchVoice.end > now) {
      try {
        switchVoice.g.gain.cancelScheduledValues(now);
        switchVoice.g.gain.setTargetAtTime(0.0001, now, 0.01);
      } catch {
        /* already stopped */
      }
    }
    const f = SWITCH_F[color] || 600;
    switchVoice = tone({ f, f2: f * 1.5, type: "sine", dur: 0.11, gain: 0.12 });
    tone({ f: f * 2, type: "triangle", dur: 0.06, gain: 0.035 });
  },
  wrong() {
    if (!sfxOn() || !gate("wrong", 0.14)) return;
    tone({ f: 220, f2: 150, type: "square", dur: 0.12, gain: 0.04 });
    tone({ f: 233, f2: 160, type: "sine", dur: 0.14, gain: 0.07 });
  },
  star({ n = 1 } = {}) {
    if (!sfxOn()) return;
    const base = [880, 988, 1175][Math.max(0, Math.min(2, n - 1))];
    tone({ f: base, type: "triangle", dur: 0.12, gain: 0.12 });
    tone({ f: base * 1.5, type: "sine", t: 0.07, dur: 0.18, gain: 0.1 });
    tone({ f: base * 2, type: "sine", t: 0.13, dur: 0.22, gain: 0.05 });
  },
  checkpoint() {
    if (!sfxOn()) return;
    [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: "triangle", t: i * 0.06, dur: 0.18, gain: 0.08 }));
  },
  bounce() {
    if (!sfxOn() || !gate("bounce", 0.08)) return;
    tone({ f: 200, f2: 820, type: "sine", dur: 0.22, gain: 0.16 });
    tone({ f: 400, f2: 1300, type: "triangle", dur: 0.16, gain: 0.05 });
  },
  fadeWarn() {
    if (!sfxOn() || !gate("fadeWarn", 0.1)) return;
    tone({ f: 1320, type: "sine", dur: 0.05, gain: 0.05 });
    tone({ f: 1320, type: "sine", t: 0.12, dur: 0.05, gain: 0.04 });
  },
  fadeGone() {
    if (!sfxOn() || !gate("fadeGone", 0.08)) return;
    hiss({ dur: 0.22, gain: 0.08, f: 2500, f2: 600, q: 2 });
    tone({ f: 700, f2: 300, type: "triangle", dur: 0.18, gain: 0.05 });
  },
  fall() {
    if (!sfxOn()) return;
    tone({ f: 600, f2: 160, type: "sine", dur: 0.36, gain: 0.1 });
  },
  hurt() {
    if (!sfxOn()) return;
    tone({ f: 300, f2: 90, type: "square", dur: 0.2, gain: 0.05 });
    hiss({ dur: 0.18, gain: 0.08, type: "lowpass", f: 1200 });
  },
  respawn() {
    if (!sfxOn()) return;
    tone({ f: 392, f2: 784, type: "sine", dur: 0.18, gain: 0.08 });
  },
  finish() {
    if (!sfxOn()) return;
    tone({ f: 300, f2: 1200, type: "sine", dur: 0.4, gain: 0.08 });
    hiss({ dur: 0.45, gain: 0.05, f: 4000, f2: 9000, q: 0.7 });
  },
  victory() {
    if (!sfxOn()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone({ f, type: "triangle", t: i * 0.09, dur: 0.24, gain: 0.1 });
      tone({ f: f / 2, type: "sine", t: i * 0.09, dur: 0.2, gain: 0.05 });
    });
    tone({ f: 1318.5, type: "sine", t: 0.4, dur: 0.5, gain: 0.07 });
  },
  unlockReward() {
    if (!sfxOn()) return;
    [784, 988, 1175, 1568].forEach((f, i) => tone({ f, type: "sine", t: i * 0.07, dur: 0.22, gain: 0.07 }));
  },
  uiHover() {
    if (!sfxOn() || !gate("hover", 0.05)) return;
    tone({ f: 1400, type: "sine", dur: 0.03, gain: 0.025 });
  },
  uiClick() {
    if (!sfxOn() || !gate("click", 0.04)) return;
    tone({ f: 880, f2: 1100, type: "triangle", dur: 0.06, gain: 0.07 });
  },

  /** Music on/off request from the game (menu / level); settings gate it. */
  setMusicWanted(on, v = variant) {
    variant = v;
    musicWanted = on;
    if (!ctx) return;
    applyGains();
    if (on) startMusic();
  },

  /** DEV/test: current gate state and live bus gains. */
  inspect() {
    return { ...state, musicWanted, ctx: ctx ? ctx.state : null, sfxGain: sfx ? sfx.gain.value : null, musicGain: musicBus ? musicBus.gain.value : null, musicRunning: !!musicTimer };
  },

  dispose() {
    stopMusic();
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
    switchVoice = null;
    for (const k of Object.keys(lastAt)) delete lastAt[k];
  },
};

/* ------------------------------------------------------------ music */

// light, upbeat loops: [root midi, scale steps, bpm]
const VARIANTS = [
  { root: 60, prog: [0, 5, 9, 7], bpm: 112, lead: "triangle" },
  { root: 62, prog: [0, 9, 5, 7], bpm: 104, lead: "triangle" },
  { root: 57, prog: [0, 8, 3, 10], bpm: 96, lead: "sine" },
  { root: 64, prog: [0, 5, 7, 9], bpm: 118, lead: "triangle" },
  { root: 59, prog: [0, 8, 5, 10], bpm: 122, lead: "square" },
];
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

function startMusic() {
  const a = ac();
  if (!a || musicTimer) return;
  musicNext = a.currentTime + 0.1;
  musicStep = 0;
  musicTimer = setInterval(scheduleMusic, 90);
  scheduleMusic();
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

function scheduleMusic() {
  const a = ac();
  if (!a) return;
  if (!musicWanted) {
    stopMusic();
    return;
  }
  const V = VARIANTS[variant % VARIANTS.length];
  const step = 60 / V.bpm / 2; // eighth notes
  while (musicNext < a.currentTime + 0.3) {
    const t = musicNext - a.currentTime;
    const bar = Math.floor(musicStep / 8) % 4;
    const i = musicStep % 8;
    const root = V.root + V.prog[bar] - 12;
    const third = V.prog[bar] === 9 || V.prog[bar] === 8 ? 3 : 4;
    const chord = [0, third, 7, 12];
    if (i % 4 === 0) tone({ f: midi(root - 12), type: "sine", t, dur: step * 3.4, gain: 0.16, dest: musicBus });
    const arp = chord[[0, 1, 2, 3, 2, 1, 2, 3][i]];
    tone({ f: midi(root + 12 + arp), type: V.lead, t, dur: step * 0.9, gain: V.lead === "square" ? 0.025 : 0.06, dest: musicBus });
    if (i % 2 === 1) hiss({ t, dur: 0.03, gain: 0.025, f: 8000, type: "highpass", dest: musicBus });
    if (i === 0 || i === 4) hiss({ t, dur: 0.08, gain: 0.05, type: "lowpass", f: 180, dest: musicBus });
    musicNext += step;
    musicStep++;
  }
}
