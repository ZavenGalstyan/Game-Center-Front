/**
 * Jump Ball — WebAudio synth (no files, no libraries, nothing copyrighted).
 *
 * Buses: sfx and music, both behind one master. `setEnabled(sound && !muted)`
 * gates sfx instantly; `setMusic(on)` gates music AND follows the master
 * gate, so the Game Center Mute button silences everything at once without
 * touching saved settings.
 *
 * The bounce plays constantly, so it is short, soft and varies pitch on a
 * small fixed cycle (never random, never piling up: one voice per step).
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
let variant = 0;
let bounceN = 0;
let lastBounceAt = 0;

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
    let s = 90210;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x7fffffff) * 2 - 1;
    }
  }
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

function tone({ f = 440, f2, type = "sine", t = 0, dur = 0.15, gain = 0.2, attack = 0.004, dest, vib = 0 }) {
  const a = ac();
  if (!a) return;
  if (!dest && !enabled) return;
  const now = a.currentTime + t;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
  if (vib) {
    const l = a.createOscillator();
    const lg = a.createGain();
    l.frequency.value = 22;
    lg.gain.value = vib;
    l.connect(lg);
    lg.connect(o.frequency);
    l.start(now);
    l.stop(now + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g);
  g.connect(dest || sfx);
  o.start(now);
  o.stop(now + dur + 0.05);
}

function hiss({ t = 0, dur = 0.12, gain = 0.15, type = "bandpass", f = 2000, f2, q = 1, attack = 0.003, dest }) {
  const a = ac();
  if (!a) return;
  if (!dest && !enabled) return;
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
  g.connect(dest || sfx);
  src.start(now, (musicStep * 0.137) % 0.8);
  src.stop(now + dur + 0.05);
}

/* ------------------------------------------------------------ music */

// five light, upbeat variants (one per world): chord roots + scale
const VARIANTS = [
  { bpm: 116, chords: [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]], lead: [523.25, 587.33, 659.25, 783.99, 880], wave: "triangle" },
  { bpm: 108, chords: [[220, 277.18, 329.63], [185, 220, 277.18], [146.83, 185, 220], [164.81, 207.65, 246.94]], lead: [440, 493.88, 554.37, 659.25, 739.99], wave: "triangle" },
  { bpm: 104, chords: [[196, 246.94, 293.66], [164.81, 196, 246.94], [130.81, 164.81, 196], [146.83, 185, 220]], lead: [587.33, 659.25, 783.99, 880, 987.77], wave: "sine" },
  { bpm: 100, chords: [[174.61, 220, 261.63], [196, 246.94, 293.66], [220, 261.63, 329.63], [164.81, 207.65, 246.94]], lead: [523.25, 587.33, 698.46, 783.99, 880], wave: "sine" },
  { bpm: 120, chords: [[146.83, 174.61, 220], [116.54, 146.83, 174.61], [130.81, 164.81, 196], [110, 138.59, 164.81]], lead: [587.33, 698.46, 783.99, 880, 1046.5], wave: "square" },
];

function scheduleMusic() {
  const a = ctx;
  if (!a || !musicBus) return;
  const v = VARIANTS[variant] || VARIANTS[0];
  const beat = 60 / v.bpm / 2; // eighth notes
  while (musicNext < a.currentTime + 0.6) {
    const t = musicNext;
    const step = musicStep % 64;
    const bar = Math.floor(step / 16);
    const chord = v.chords[bar % v.chords.length];
    const s16 = step % 16;
    // pad on the bar
    if (s16 === 0) {
      for (const f of chord) {
        const o = a.createOscillator();
        const g = a.createGain();
        const fl = a.createBiquadFilter();
        o.type = "triangle";
        o.frequency.value = f / 2;
        fl.type = "lowpass";
        fl.frequency.value = 800;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.035, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 16);
        o.connect(fl);
        fl.connect(g);
        g.connect(musicBus);
        o.start(t);
        o.stop(t + beat * 16 + 0.05);
      }
    }
    // soft kick on quarters, hat on off-beats
    if (s16 % 4 === 0) tone({ f: 120, f2: 48, type: "sine", t: t - a.currentTime, dur: 0.16, gain: 0.09, dest: musicBus });
    if (s16 % 4 === 2) hiss({ t: t - a.currentTime, dur: 0.035, gain: 0.025, type: "highpass", f: 7000, q: 0.7, dest: musicBus });
    // bouncy arpeggio
    const arp = [0, 1, 2, 1, 0, 2, 1, 2];
    const f = chord[arp[s16 % 8]] * 2;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = v.wave === "square" ? "square" : "triangle";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v.wave === "square" ? 0.012 : 0.022, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.9);
    o.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + beat);
    // sparse lead phrase, deterministic
    const h = (musicStep * 7919 + bar * 31) % 11;
    if (s16 % 2 === 0 && h < 3) {
      const lf = v.lead[(musicStep * 3 + h) % v.lead.length];
      tone({ f: lf, type: "sine", t: t - a.currentTime, dur: beat * 1.8, gain: 0.03, dest: musicBus });
    }
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
  musicBus.gain.setTargetAtTime(on ? 0.85 : 0, now, 0.15);
  if (on && !musicTimer) {
    musicNext = Math.max(musicNext, now + 0.08);
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 200);
  } else if (!on && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

const PENTA = [659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

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
  setVariant(i) {
    variant = Math.max(0, Math.min(VARIANTS.length - 1, i | 0));
  },

  /** Normal landing: soft rubbery "boop" with a tiny controlled pitch cycle. */
  bounce(impact = 1100) {
    if (!enabled || !ctx) return;
    const now = ctx.currentTime;
    if (now - lastBounceAt < 0.03) return; // never stack voices
    lastBounceAt = now;
    const cyc = [1, 1.03, 0.98, 1.05, 1.01, 0.97];
    const k = cyc[bounceN++ % cyc.length];
    const loud = Math.min(1, impact / 1200);
    tone({ f: 250 * k, f2: 150 * k, type: "sine", dur: 0.09, gain: 0.1 + 0.05 * loud });
    tone({ f: 520 * k, f2: 330 * k, type: "triangle", dur: 0.04, gain: 0.025 });
  },
  perfect(streak = 1) {
    if (!enabled) return;
    const f = PENTA[Math.min(PENTA.length - 1, Math.max(0, streak - 1))];
    tone({ f, type: "sine", dur: 0.32, gain: 0.08, t: 0.01 });
    tone({ f: f * 2, type: "sine", dur: 0.16, gain: 0.025, t: 0.015 });
  },
  spring() {
    if (!enabled) return;
    tone({ f: 170, f2: 620, type: "triangle", dur: 0.28, gain: 0.13, vib: 40 });
    tone({ f: 95, f2: 55, type: "sine", dur: 0.14, gain: 0.16 });
    hiss({ dur: 0.08, gain: 0.05, f: 3000, q: 0.8 });
  },
  star(count = 1) {
    if (!enabled) return;
    const base = [1318.51, 1567.98, 1760][Math.min(2, Math.max(0, count - 1))];
    tone({ f: base, type: "sine", dur: 0.18, gain: 0.08 });
    tone({ f: base * 1.335, type: "sine", dur: 0.3, gain: 0.07, t: 0.07 });
    tone({ f: base * 2, type: "sine", dur: 0.2, gain: 0.02, t: 0.07 });
  },
  crack() {
    if (!enabled) return;
    hiss({ dur: 0.07, gain: 0.16, f: 1800, q: 1.4 });
    tone({ f: 900, f2: 300, type: "square", dur: 0.03, gain: 0.02 });
    hiss({ t: 0.05, dur: 0.05, gain: 0.08, f: 2600, q: 2 });
  },
  breakFall() {
    if (!enabled) return;
    hiss({ dur: 0.35, gain: 0.05, type: "lowpass", f: 1200, f2: 300, attack: 0.03 });
    tone({ f: 110, f2: 60, type: "sine", dur: 0.25, gain: 0.05, t: 0.25 });
  },
  ice() {
    if (!enabled) return;
    hiss({ dur: 0.28, gain: 0.05, type: "bandpass", f: 5200, f2: 2600, q: 3, attack: 0.02 });
    tone({ f: 2093, type: "sine", dur: 0.18, gain: 0.025 });
  },
  wall() {
    if (!enabled) return;
    tone({ f: 140, f2: 90, type: "sine", dur: 0.06, gain: 0.05 });
  },
  finish() {
    if (!enabled) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ f, type: "triangle", dur: 0.3, gain: 0.09, t: i * 0.07 }));
    hiss({ t: 0.28, dur: 0.4, gain: 0.04, type: "highpass", f: 6000, q: 0.5, attack: 0.05 });
  },
  complete() {
    if (!enabled) return;
    [[523.25, 659.25, 783.99], [587.33, 739.99, 880], [659.25, 830.61, 987.77, 1318.51]].forEach((ch, i) =>
      ch.forEach((f) => tone({ f, type: "triangle", dur: i === 2 ? 0.9 : 0.2, gain: 0.05, t: i * 0.16 }))
    );
  },
  fail() {
    if (!enabled) return;
    tone({ f: 420, f2: 140, type: "triangle", dur: 0.5, gain: 0.09 });
    tone({ f: 210, f2: 90, type: "sine", dur: 0.55, gain: 0.07, t: 0.05 });
  },
  newUnlock() {
    if (!enabled) return;
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => tone({ f, type: "sine", dur: 0.35, gain: 0.07, t: i * 0.06 }));
  },
  ui() {
    if (!enabled) return;
    tone({ f: 760, f2: 620, type: "sine", dur: 0.05, gain: 0.06 });
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
