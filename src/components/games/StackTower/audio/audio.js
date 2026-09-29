/**
 * Stack Tower — WebAudio synth (no files, no libraries).
 *
 * Every one-shot is a short oscillator / filtered-noise envelope into the
 * `sfx` bus; music is a soft ambient pad + sparse pentatonic plucks on the
 * `music` bus, scheduled a little ahead by one timer.
 *
 * `setEnabled(sound && !muted)` gates sfx instantly and `setMusic(on)` gates
 * music AND follows the same master gate — the Game Center Mute button never
 * has to touch saved settings.
 */

let ctx = null;
let master = null;
let sfx = null;
let musicBus = null;
let enabled = true;
let musicWanted = false;
let noiseBuf = null;
let musicTimer = null;
let musicNext = 0;
let musicStep = 0;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.85;
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
    const n = Math.floor(a.sampleRate * 1.2);
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 424242;
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
  if (!a) return;
  if (!dest && !enabled) return;
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

function hiss({ t = 0, dur = 0.12, gain = 0.15, type = "bandpass", f = 2000, f2, q = 1, attack = 0.003 }) {
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
  src.start(now, Math.random() * 0.8);
  src.stop(now + dur + 0.05);
}

// C major pentatonic, two octaves — streak pitches climb this, capped
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

// music: Am – F – C – G pads, root + fifth + tenth
const CHORDS = [
  [110, 164.81, 261.63],
  [87.31, 130.81, 220],
  [130.81, 196, 329.63],
  [98, 146.83, 246.94],
];
const PLUCK = [440, 523.25, 587.33, 659.25, 783.99, 880];

function scheduleMusic() {
  const a = ctx;
  if (!a || !musicBus) return;
  const bar = 4.8;
  while (musicNext < a.currentTime + 1.2) {
    const chord = CHORDS[Math.floor(musicStep / 4) % CHORDS.length];
    const beat = musicStep % 4;
    const t = musicNext;
    if (beat === 0) {
      for (const f of chord) {
        const o = a.createOscillator();
        const g = a.createGain();
        const fl = a.createBiquadFilter();
        o.type = "triangle";
        o.frequency.value = f;
        fl.type = "lowpass";
        fl.frequency.value = 900;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + bar + 0.8);
        o.connect(fl);
        fl.connect(g);
        g.connect(musicBus);
        o.start(t);
        o.stop(t + bar + 1);
      }
    }
    // sparse, deterministic plucks
    const h = (musicStep * 7919) % 13;
    if (h < 5) {
      const f = PLUCK[(musicStep * 5 + h) % PLUCK.length];
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const tt = t + (h % 2) * 0.6;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.035, tt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.4);
      o.connect(g);
      g.connect(musicBus);
      o.start(tt);
      o.stop(tt + 1.5);
    }
    musicNext += bar / 4;
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
  musicBus.gain.setTargetAtTime(on ? 0.9 : 0, now, 0.25);
  if (on && !musicTimer) {
    musicNext = Math.max(musicNext, now + 0.1);
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 400);
  } else if (!on && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

export const audio = {
  unlock() {
    ac();
    syncMusic();
  },
  setEnabled(on) {
    enabled = on;
    if (ctx && sfx) {
      sfx.gain.cancelScheduledValues(ctx.currentTime);
      sfx.gain.setValueAtTime(on ? 1 : 0, ctx.currentTime);
    }
    syncMusic();
  },
  setMusic(on) {
    musicWanted = on;
    syncMusic();
  },

  /** Normal placement: short wooden THOCK. `size` 0..1 scales the body. */
  place(size = 1) {
    if (!enabled) return;
    const f = 150 + (1 - size) * 60;
    tone({ f, f2: f * 0.55, type: "sine", dur: 0.16, gain: 0.34 });
    tone({ f: f * 2.4, f2: f * 1.6, type: "triangle", dur: 0.06, gain: 0.08 });
    hiss({ dur: 0.035, gain: 0.12, f: 3200, q: 0.8 });
  },
  /** Slice: a crisp scrape; bigger cuts are longer and lower. */
  cut(frac) {
    if (!enabled) return;
    const big = frac > 0.25;
    hiss({ dur: big ? 0.16 : 0.08, gain: big ? 0.16 : 0.1, f: big ? 4200 : 5600, f2: big ? 1400 : 2600, q: 2.2 });
    tone({ f: big ? 900 : 1300, f2: big ? 500 : 900, type: "triangle", dur: 0.05, gain: 0.04 });
  },
  /** Cut piece leaves the scene — a small distant thud. */
  fall(size = 1) {
    if (!enabled) return;
    tone({ f: 90 + (1 - size) * 40, f2: 50, type: "sine", dur: 0.22, gain: 0.08 * (0.4 + size) });
    hiss({ dur: 0.1, gain: 0.03, type: "lowpass", f: 600 });
  },
  /** Perfect: musical ping climbing the pentatonic with the streak. */
  perfect(streak) {
    if (!enabled) return;
    const i = Math.min(PENTA.length - 1, Math.max(0, streak - 1));
    const f = PENTA[i];
    tone({ f, type: "sine", dur: 0.5, gain: 0.16 });
    tone({ f: f * 2, type: "sine", dur: 0.25, gain: 0.05, t: 0.005 });
    tone({ f: 170, f2: 100, type: "sine", dur: 0.12, gain: 0.2 });
    if (streak >= 5) tone({ f: f * 1.5, type: "triangle", dur: 0.45, gain: 0.06, t: 0.06 });
    if (streak >= 10 && streak % 5 === 0) {
      [1, 1.25, 1.5, 2].forEach((m, k) => tone({ f: 523.25 * m, type: "sine", dur: 0.6, gain: 0.07, t: 0.08 + k * 0.06 }));
    }
  },
  recover() {
    if (!enabled) return;
    tone({ f: 660, f2: 990, type: "sine", dur: 0.25, gain: 0.06, t: 0.1 });
  },
  miss() {
    if (!enabled) return;
    hiss({ dur: 0.45, gain: 0.12, type: "bandpass", f: 1800, f2: 300, q: 0.9, attack: 0.02 });
    tone({ f: 260, f2: 110, type: "triangle", dur: 0.5, gain: 0.1 });
  },
  gameOver() {
    if (!enabled) return;
    [220, 261.63, 329.63].forEach((f, i) => tone({ f, f2: f * 0.985, type: "triangle", dur: 1.1, gain: 0.06, t: i * 0.05, attack: 0.03 }));
  },
  newBest() {
    if (!enabled) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ f, type: "sine", dur: 0.45, gain: 0.1, t: 0.15 + i * 0.09 }));
  },
  ui() {
    if (!enabled) return;
    tone({ f: 880, f2: 700, type: "sine", dur: 0.06, gain: 0.07 });
  },
  dispose() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    musicWanted = false;
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    master = sfx = musicBus = null;
    noiseBuf = null;
    musicNext = 0;
  },
};
