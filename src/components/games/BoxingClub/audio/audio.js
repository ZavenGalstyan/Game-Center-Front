/**
 * Boxing Club — WebAudio synth (no files, no libraries).
 *
 * Buses: sfx → master, crowd → master, music → master. `setEnabled` (Sound
 * setting && !Mute) gates effects + crowd, `setMusic` gates the music loop;
 * both cut to silence immediately (no fade-out tail after Mute), and
 * `dispose()` stops every scheduler when the game unmounts, so nothing keeps
 * playing after leaving the page or stacks up across restarts.
 *
 * Punch sounds are deliberately different families: a whoosh for a miss, a
 * leather slap for a block, a deep thump for the body, a sharp smack for the
 * head, and a heavy thud + crack for a counter — each with small pitch /
 * volume variation so a flurry never sounds like one repeated sample.
 */
let ctx = null;
let master = null;
let sfxBus = null;
let crowdBus = null;
let musicBus = null;
let enabled = false;
let musicOn = false;
let noiseBuf = null;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      crowdBus = ctx.createGain();
      crowdBus.gain.value = 0;
      crowdBus.connect(master);
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
  const a = ctx;
  if (!noiseBuf) {
    const n = a.sampleRate * 2;
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

const vary = (v, amt = 0.08) => v * (1 + (Math.random() * 2 - 1) * amt);

function tone(freq, dur, { type = "sine", gain = 0.1, slide = null, delay = 0, attack = 0.004, bus = null } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(bus || sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function burst(dur, { gain = 0.1, freq = 1200, q = 1, type = "bandpass", sweep = null, delay = 0, attack = 0.002, bus = null } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noise();
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(bus || sfxBus);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.05);
}

/* ----------------------------------------------------------- crowd bed */
let crowdSrc = null;
let crowdGain = null;
let crowdBase = 0.3;
function ensureCrowd() {
  const a = ac();
  if (!a || crowdSrc) return;
  crowdSrc = a.createBufferSource();
  crowdSrc.buffer = noise();
  crowdSrc.loop = true;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 520;
  f.Q.value = 0.5;
  const f2 = a.createBiquadFilter();
  f2.type = "lowpass";
  f2.frequency.value = 1400;
  crowdGain = a.createGain();
  crowdGain.gain.value = 0.02;
  crowdSrc.connect(f).connect(f2).connect(crowdGain).connect(crowdBus);
  crowdSrc.start();
}

/* ------------------------------------------------------------ music */
let musicTimer = null;
let musicStep = 0;
let musicMode = "menu";
function scheduleMusic() {
  const a = ctx;
  if (!a || !musicOn) return;
  const bpm = musicMode === "fight" ? 112 : 96;
  const beat = 60 / bpm / 2; // 8th notes
  const t0 = a.currentTime + 0.05;
  for (let i = 0; i < 8; i++) {
    const s = musicStep + i;
    const t = t0 + i * beat;
    const d = t - a.currentTime;
    // kick on 1 & 3 (and a pickup), snare on 2 & 4, hats on eighths
    if (s % 8 === 0 || s % 8 === 4 || (musicMode === "fight" && s % 16 === 11)) tone(110, 0.22, { slide: 42, gain: 0.22, delay: d, bus: musicBus });
    if (s % 8 === 2 || s % 8 === 6) burst(0.14, { gain: 0.07, freq: 1800, q: 0.7, delay: d, bus: musicBus });
    burst(0.04, { gain: 0.025, freq: 8000, q: 1.5, type: "highpass", delay: d, bus: musicBus });
    // bass line
    const roots = musicMode === "fight" ? [55, 55, 65.4, 49] : [65.4, 73.4, 58.3, 55];
    const root = roots[Math.floor(s / 16) % 4];
    if (s % 4 === 0) tone(root, beat * 1.8, { type: "sawtooth", gain: 0.045, delay: d, bus: musicBus });
    if (musicMode === "menu" && s % 16 === 0) {
      [1, 1.25, 1.5].forEach((m) => tone(root * 4 * m, beat * 14, { type: "triangle", gain: 0.012, attack: 0.3, delay: d, bus: musicBus }));
    }
  }
  musicStep += 8;
  musicTimer = setTimeout(scheduleMusic, beat * 8 * 1000 - 20);
}

/* ------------------------------------------------------------ API */
export const audio = {
  setEnabled(v) {
    enabled = Boolean(v);
    const a = enabled ? ac() : ctx;
    if (!a) return;
    const now = a.currentTime;
    sfxBus.gain.cancelScheduledValues(now);
    sfxBus.gain.setValueAtTime(enabled ? 1 : 0, now);
    crowdBus.gain.cancelScheduledValues(now);
    crowdBus.gain.setValueAtTime(enabled ? 1 : 0, now);
  },
  setMusic(v, mode) {
    if (mode) musicMode = mode;
    const want = Boolean(v);
    const a = want ? ac() : ctx;
    if (!a) return;
    musicBus.gain.cancelScheduledValues(a.currentTime);
    musicBus.gain.setValueAtTime(want ? (musicMode === "fight" ? 0.55 : 0.8) : 0, a.currentTime);
    if (want && !musicOn) {
      musicOn = true;
      scheduleMusic();
    } else if (!want && musicOn) {
      musicOn = false;
      clearTimeout(musicTimer);
      musicTimer = null;
    }
  },
  setMusicMode(mode) {
    if (mode === musicMode) return;
    musicMode = mode;
    if (musicBus && ctx && musicOn) musicBus.gain.setValueAtTime(mode === "fight" ? 0.55 : 0.8, ctx.currentTime);
  },
  /** Crowd bed level for the venue (0..1); 0 turns it off. */
  crowd(level) {
    if (!enabled) {
      crowdBase = level;
      return;
    }
    ensureCrowd();
    crowdBase = level;
    if (crowdGain) crowdGain.gain.setTargetAtTime(0.012 + level * 0.03, ctx.currentTime, 0.4);
  },
  /** Crowd swell for a big moment (strength 0..1). */
  roar(strength = 0.5) {
    if (!enabled || !crowdGain) return;
    const a = ctx;
    const peak = 0.03 + crowdBase * 0.03 + strength * 0.09;
    crowdGain.gain.cancelScheduledValues(a.currentTime);
    crowdGain.gain.setTargetAtTime(peak, a.currentTime, 0.05);
    crowdGain.gain.setTargetAtTime(0.012 + crowdBase * 0.03, a.currentTime + 0.35 + strength * 0.6, 0.6);
    if (strength > 0.6) burst(1.2 + strength, { gain: 0.05 * strength, freq: 900, q: 0.4, attack: 0.08, bus: crowdBus });
  },
  whiff(kind) {
    if (!enabled) return;
    const heavy = kind === "hook" ? 1 : kind === "cross" ? 0.7 : 0.4;
    burst(vary(0.09 + heavy * 0.1), { gain: vary(0.035 + heavy * 0.03), freq: vary(2200 - heavy * 900), sweep: 600, q: 0.8, attack: 0.02 });
  },
  hit(kind, counter = false) {
    if (!enabled) return;
    const heavy = kind === "hook" ? 1 : kind === "cross" ? 0.65 : 0.35;
    burst(vary(0.07 + heavy * 0.05), { gain: vary(0.16 + heavy * 0.12), freq: vary(1400 - heavy * 500), q: 0.9 });
    tone(vary(140 - heavy * 40), 0.12 + heavy * 0.08, { slide: 50, gain: vary(0.18 + heavy * 0.15) });
    if (counter) {
      tone(90, 0.3, { slide: 38, gain: 0.3 });
      burst(0.05, { gain: 0.2, freq: 3200, q: 2, delay: 0.01 });
    }
  },
  body(kind) {
    if (!enabled) return;
    const heavy = kind === "hook" ? 1 : kind === "cross" ? 0.65 : 0.35;
    tone(vary(85 - heavy * 20), 0.18 + heavy * 0.08, { slide: 38, gain: vary(0.28 + heavy * 0.1) });
    burst(vary(0.1), { gain: vary(0.1 + heavy * 0.05), freq: 380, type: "lowpass", q: 0.7 });
  },
  block(kind) {
    if (!enabled) return;
    const heavy = kind === "hook" ? 1 : kind === "cross" ? 0.6 : 0.3;
    burst(vary(0.05), { gain: vary(0.1 + heavy * 0.06), freq: vary(2600), q: 1.4 });
    tone(vary(260), 0.06, { type: "triangle", gain: 0.05 + heavy * 0.03 });
  },
  perfect() {
    if (!enabled) return;
    burst(0.35, { gain: 0.06, freq: 3000, sweep: 700, q: 1, attack: 0.03 });
    tone(1320, 0.25, { gain: 0.04, delay: 0.04 });
    tone(1760, 0.3, { gain: 0.03, delay: 0.1 });
  },
  step() {
    if (!enabled) return;
    if (Math.random() < 0.5) tone(vary(2400, 0.15), 0.03, { slide: 2900, gain: 0.012, type: "triangle" });
    else burst(0.04, { gain: 0.012, freq: 900, q: 1.2 });
  },
  rope() {
    if (!enabled) return;
    tone(vary(95), 0.35, { type: "sawtooth", slide: 70, gain: 0.03 });
    burst(0.2, { gain: 0.03, freq: 300, q: 2 });
  },
  knockdown() {
    if (!enabled) return;
    tone(70, 0.5, { slide: 32, gain: 0.35 });
    burst(0.4, { gain: 0.15, freq: 250, type: "lowpass" });
    audio.roar(1);
  },
  bell(times = 1) {
    if (!enabled) return;
    for (let i = 0; i < times; i++) {
      const d = i * 0.28;
      [900, 1415, 2080, 2750].forEach((f, k) => tone(f, 1.8 - k * 0.3, { gain: 0.09 / (k + 1), delay: d, attack: 0.002 }));
    }
  },
  count() {
    if (!enabled) return;
    tone(600, 0.08, { type: "square", gain: 0.02 });
  },
  ko() {
    if (!enabled) return;
    audio.bell(3);
    audio.roar(1);
  },
  ui() {
    if (!enabled) return;
    tone(660, 0.05, { type: "triangle", gain: 0.035, slide: 880 });
  },
  back() {
    if (!enabled) return;
    tone(520, 0.06, { type: "triangle", gain: 0.03, slide: 390 });
  },
  bag(strength) {
    if (!enabled) return;
    tone(vary(95 - strength * 25), 0.2, { slide: 45, gain: 0.2 + strength * 0.15 });
    burst(0.08, { gain: 0.1 + strength * 0.08, freq: 700, q: 0.8 });
  },
  speedBag() {
    if (!enabled) return;
    burst(0.03, { gain: 0.1, freq: 1800, q: 2 });
    tone(vary(420), 0.04, { gain: 0.05, type: "triangle", delay: 0.06 });
  },
  signal() {
    if (!enabled) return;
    tone(980, 0.08, { type: "square", gain: 0.03 });
  },
  success() {
    if (!enabled) return;
    [523, 659, 784].forEach((f, i) => tone(f, 0.3, { gain: 0.05, delay: i * 0.08 }));
  },
  dispose() {
    clearTimeout(musicTimer);
    musicTimer = null;
    musicOn = false;
    try {
      crowdSrc?.stop();
    } catch {
      /* already stopped */
    }
    crowdSrc = null;
    crowdGain = null;
    if (ctx) {
      const now = ctx.currentTime;
      sfxBus.gain.setValueAtTime(0, now);
      crowdBus.gain.setValueAtTime(0, now);
      musicBus.gain.setValueAtTime(0, now);
    }
    enabled = false;
  },
};
