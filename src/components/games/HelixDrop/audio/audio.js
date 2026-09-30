/**
 * Helix Drop — WebAudio synth (no files, nothing copyrighted).
 * sfx and music buses behind one master; `setEnabled(sound && !muted)` and
 * `setMusic(on)` gate everything, so the Game Center Mute silences bounce,
 * drop streak, Smash, debris, music — all of it — instantly.
 * The bounce repeats constantly: short, soft, one voice at a time.
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
let lastBounce = 0;
let bounceN = 0;

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
    const n = Math.floor(a.sampleRate);
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 1234;
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
  if (!a || (!dest && !enabled)) return;
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

function hiss({ t = 0, dur = 0.12, gain = 0.15, type = "bandpass", f = 2000, f2, q = 1, attack = 0.003, dest }) {
  const a = ac();
  if (!a || (!dest && !enabled)) return;
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
  src.start(now, (musicStep * 0.113) % 0.7);
  src.stop(now + dur + 0.05);
}

/* ---------------------------------------------------------------- music */
const VARIANTS = [
  { bpm: 122, root: [220, 196, 174.61, 196], lead: [659.25, 783.99, 880, 987.77, 1174.66] },
  { bpm: 112, root: [196, 174.61, 146.83, 164.81], lead: [587.33, 659.25, 783.99, 880, 987.77] },
  { bpm: 108, root: [164.81, 146.83, 130.81, 146.83], lead: [659.25, 739.99, 880, 987.77, 1108.73] },
  { bpm: 100, root: [146.83, 130.81, 116.54, 130.81], lead: [587.33, 622.25, 783.99, 880, 932.33] },
  { bpm: 126, root: [130.81, 116.54, 103.83, 116.54], lead: [523.25, 622.25, 698.46, 783.99, 932.33] },
];

function schedule() {
  const a = ctx;
  if (!a || !musicBus) return;
  const v = VARIANTS[variant] || VARIANTS[0];
  const beat = 60 / v.bpm / 2;
  while (musicNext < a.currentTime + 0.6) {
    const t = musicNext - a.currentTime;
    const step = musicStep % 64;
    const bar = Math.floor(step / 16);
    const root = v.root[bar];
    const s = step % 16;
    if (s % 4 === 0) tone({ f: 110, f2: 45, dur: 0.16, gain: 0.1, t, dest: musicBus });
    if (s % 4 === 2) hiss({ t, dur: 0.03, gain: 0.025, type: "highpass", f: 7500, dest: musicBus });
    if (s % 2 === 0) tone({ f: root, type: "triangle", dur: beat * 1.6, gain: 0.05, t, dest: musicBus });
    const arp = [1, 1.5, 2, 1.5, 1.25, 1.5, 2, 3];
    tone({ f: root * 2 * arp[s % 8], type: "triangle", dur: beat * 0.8, gain: 0.018, t, dest: musicBus });
    const h = (musicStep * 7919 + bar * 13) % 11;
    if (s % 4 === 0 && h < 4) tone({ f: v.lead[(musicStep + h) % v.lead.length], dur: beat * 2.5, gain: 0.03, t, dest: musicBus });
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
  musicBus.gain.setTargetAtTime(on ? 0.8 : 0, now, 0.15);
  if (on && !musicTimer) {
    musicNext = Math.max(musicNext, now + 0.08);
    schedule();
    musicTimer = setInterval(schedule, 200);
  } else if (!on && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

const SCALE = [392, 440, 493.88, 587.33, 659.25, 783.99, 880, 987.77, 1174.66];

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
  bounce() {
    if (!enabled || !ctx) return;
    if (ctx.currentTime - lastBounce < 0.04) return;
    lastBounce = ctx.currentTime;
    const k = [1, 1.02, 0.985, 1.035][bounceN++ % 4];
    tone({ f: 300 * k, f2: 170 * k, dur: 0.08, gain: 0.11 });
    hiss({ dur: 0.03, gain: 0.03, f: 2400, q: 0.7 });
  },
  pass(streak = 1) {
    if (!enabled) return;
    const f = SCALE[Math.min(SCALE.length - 1, streak - 1)];
    tone({ f, f2: f * 1.06, type: "sine", dur: 0.12, gain: 0.05 + Math.min(0.05, streak * 0.012) });
    hiss({ dur: 0.18, gain: 0.02 + streak * 0.008, type: "bandpass", f: 900 + streak * 500, f2: 3000, q: 0.6, attack: 0.02 });
  },
  smashOn() {
    if (!enabled) return;
    tone({ f: 220, f2: 880, type: "sawtooth", dur: 0.35, gain: 0.05 });
    hiss({ dur: 0.4, gain: 0.07, type: "bandpass", f: 600, f2: 4000, q: 0.8, attack: 0.05 });
  },
  smash() {
    if (!enabled) return;
    tone({ f: 95, f2: 38, dur: 0.35, gain: 0.3 }); // low body
    hiss({ dur: 0.09, gain: 0.25, f: 1800, q: 1.2 }); // crack
    hiss({ t: 0.05, dur: 0.45, gain: 0.08, type: "lowpass", f: 1400, f2: 300, attack: 0.02 }); // debris
    tone({ f: 520, f2: 240, type: "triangle", dur: 0.12, gain: 0.05 });
  },
  death() {
    if (!enabled) return;
    tone({ f: 330, f2: 110, type: "square", dur: 0.28, gain: 0.05 });
    tone({ f: 180, f2: 70, dur: 0.4, gain: 0.14 });
    hiss({ dur: 0.2, gain: 0.08, f: 1200, q: 1 });
  },
  finish() {
    if (!enabled) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ f, type: "triangle", dur: 0.3, gain: 0.08, t: i * 0.07 }));
  },
  complete() {
    if (!enabled) return;
    [[523.25, 659.25, 783.99], [587.33, 739.99, 880], [659.25, 830.61, 987.77, 1318.51]].forEach((ch, i) =>
      ch.forEach((f) => tone({ f, type: "triangle", dur: i === 2 ? 0.9 : 0.2, gain: 0.05, t: i * 0.16 }))
    );
  },
  newUnlock() {
    if (!enabled) return;
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => tone({ f, dur: 0.3, gain: 0.06, t: i * 0.06 }));
  },
  ui() {
    if (!enabled) return;
    tone({ f: 760, f2: 620, dur: 0.05, gain: 0.06 });
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
