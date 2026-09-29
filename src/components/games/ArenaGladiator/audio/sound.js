/**
 * Arena Gladiator — WebAudio synth (no audio files, no libraries).
 *
 * Buses: sfx / crowd / music → master. `setEnabled(on)` (Sound && !Mute)
 * gates sfx + crowd, `setMusic(on)` gates music; both cut IMMEDIATELY (no
 * tail after Mute). `dispose()` stops every scheduler and source so nothing
 * keeps playing or stacks across restarts.
 *
 * Swing and hit are separate sounds: the whoosh plays when a swing's ACTIVE
 * phase starts; hit / block / parry / clash sounds are played only from the
 * engine's contact events, so a miss never sounds like a hit.
 */
let ctx = null;
let master = null;
let sfxBus = null;
let crowdBus = null;
let musicBus = null;
let enabled = false;
let musicOn = false;
let noiseBuf = null;
let crowdSrc = null;
let crowdFilter = null;
let crowdGain = null;
let crowdBase = 0;
let musicTimer = null;
let musicStep = 0;
let nextNoteTime = 0;
let musicMode = "menu";
const last = {};

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = enabled ? 1 : 0;
      sfxBus.connect(master);
      crowdBus = ctx.createGain();
      crowdBus.gain.value = enabled ? 1 : 0;
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
  if (!noiseBuf) {
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

const vary = (v, amt = 0.07) => v * (1 + (Math.random() * 2 - 1) * amt);
function gate(key, ms) {
  const now = performance.now();
  if (last[key] && now - last[key] < ms) return false;
  last[key] = now;
  return true;
}

function tone(freq, dur, { type = "sine", gain = 0.2, slide = null, delay = 0, attack = 0.004, bus = null } = {}) {
  const a = ac();
  if (!a || !enabled) return;
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

function burst(dur, { gain = 0.2, lp = 2000, hp = 0, bp = null, q = 1, delay = 0, sweepTo = null, bus = null, attack = 0.003 } = {}) {
  const a = ac();
  if (!a || !enabled) return;
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noise();
  const f = a.createBiquadFilter();
  if (bp) {
    f.type = "bandpass";
    f.frequency.setValueAtTime(bp, t0);
    f.Q.value = q;
  } else {
    f.type = "lowpass";
    f.frequency.setValueAtTime(lp, t0);
  }
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  let node = src.connect(f);
  if (hp > 0) {
    const h = a.createBiquadFilter();
    h.type = "highpass";
    h.frequency.value = hp;
    node = node.connect(h);
  }
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g).connect(bus || sfxBus);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.05);
}

/** Inharmonic metallic ring (blade/shield contact). */
function metal(base, dur, gain, { delay = 0 } = {}) {
  const ratios = [1, 2.76, 5.4, 8.93];
  ratios.forEach((r, i) => tone(vary(base * r, 0.02), dur * (1 - i * 0.18), { type: "sine", gain: gain / (1 + i * 0.9), delay, attack: 0.002 }));
}

export const sound = {
  setEnabled(on) {
    enabled = !!on;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const b of [sfxBus, crowdBus]) {
      b.gain.cancelScheduledValues(t);
      b.gain.setValueAtTime(on ? 1 : 0, t);
    }
  },
  unlock() {
    ac();
  },

  /* ------------------------------------------------ combat */
  swing(kind = "light", player = true) {
    if (!gate(`swing${player}`, 60)) return;
    const heavy = kind === "heavy";
    const g = player ? 0.16 : 0.11;
    burst(heavy ? 0.34 : 0.2, { bp: heavy ? 700 : 1200, sweepTo: heavy ? 260 : 420, q: 0.9, gain: heavy ? g * 1.4 : g, attack: 0.03 });
    burst(heavy ? 0.3 : 0.16, { bp: 3200, sweepTo: 1600, q: 2, gain: g * 0.35, attack: 0.02 });
  },
  kick() {
    burst(0.16, { bp: 500, sweepTo: 200, gain: 0.12, attack: 0.02 });
  },
  hitFlesh(heavy = false, player = false) {
    if (!gate("hit", 40)) return;
    burst(0.12, { lp: 900, gain: heavy ? 0.5 : 0.36, attack: 0.002 });
    tone(heavy ? 90 : 120, heavy ? 0.22 : 0.14, { type: "sine", gain: heavy ? 0.5 : 0.34, slide: 50 });
    burst(0.07, { bp: 2400, q: 1.5, gain: 0.12, delay: 0.005 });
    if (player) tone(70, 0.25, { type: "triangle", gain: 0.2, slide: 40 });
  },
  hitArmor(heavy = false) {
    if (!gate("hitA", 40)) return;
    burst(0.1, { lp: 1000, gain: heavy ? 0.4 : 0.3 });
    tone(heavy ? 100 : 130, 0.16, { gain: 0.3, slide: 60 });
    metal(vary(620), 0.28, heavy ? 0.1 : 0.07);
  },
  block(heavy = false, shield = true) {
    if (!gate("block", 40)) return;
    if (shield) {
      // wood + bronze boss: dull thunk with a short ring
      burst(0.14, { lp: 700, gain: heavy ? 0.55 : 0.42 });
      tone(heavy ? 85 : 110, 0.18, { type: "triangle", gain: 0.36, slide: 60 });
      metal(vary(420), 0.35, heavy ? 0.12 : 0.08, { delay: 0.004 });
    } else {
      metal(vary(900), 0.5, heavy ? 0.16 : 0.12);
      burst(0.08, { bp: 3000, q: 1.2, gain: 0.2 });
    }
  },
  clash() {
    if (!gate("clash", 60)) return;
    metal(vary(780), 0.7, 0.18);
    metal(vary(1130), 0.55, 0.1, { delay: 0.01 });
    burst(0.12, { bp: 4000, q: 1, gain: 0.28 });
  },
  parry() {
    if (!gate("parry", 60)) return;
    metal(vary(1250, 0.03), 0.9, 0.2);
    metal(vary(1880, 0.03), 0.6, 0.1, { delay: 0.015 });
    burst(0.25, { bp: 6000, sweepTo: 2500, q: 2, gain: 0.25 }); // the "shing"
    tone(140, 0.12, { type: "triangle", gain: 0.2, slide: 80 });
  },
  guardBreak() {
    burst(0.2, { lp: 500, gain: 0.55 });
    tone(70, 0.35, { type: "sawtooth", gain: 0.16, slide: 40 });
    metal(vary(300), 0.4, 0.12);
  },
  dodge() {
    if (!gate("dodge", 80)) return;
    burst(0.22, { bp: 900, sweepTo: 300, q: 0.7, gain: 0.14, attack: 0.02 });
    burst(0.18, { lp: 3500, hp: 1500, gain: 0.08, delay: 0.1 }); // sand scatter
  },
  step(surface = "sand", vol = 1, player = false) {
    if (!gate(player ? "stepP" : "stepO", 90)) return;
    const g = (player ? 0.07 : 0.045) * vol;
    if (surface === "stone") {
      burst(0.05, { bp: vary(1800), q: 2.5, gain: g * 1.1 });
      tone(vary(180), 0.04, { gain: g * 0.6, type: "triangle" });
    } else {
      burst(0.09, { lp: vary(1400), hp: 250, gain: g * 1.3, attack: 0.008 });
      burst(0.06, { lp: 5000, hp: 2500, gain: g * 0.35, delay: 0.015 });
    }
  },
  grunt(player = false, heavy = false) {
    if (!gate(player ? "gruntP" : "gruntO", 180)) return;
    const a = ac();
    if (!a || !enabled) return;
    const t0 = a.currentTime;
    const o = a.createOscillator();
    o.type = "sawtooth";
    const base = player ? 118 : 96;
    o.frequency.setValueAtTime(vary(base * (heavy ? 1.25 : 1.1)), t0);
    o.frequency.exponentialRampToValueAtTime(base * 0.75, t0 + 0.22);
    const f1 = a.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 650;
    f1.Q.value = 3;
    const f2 = a.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = 1100;
    f2.Q.value = 4;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(heavy ? 0.35 : 0.24, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    o.connect(f1).connect(g);
    o.connect(f2).connect(g);
    g.connect(sfxBus);
    o.start(t0);
    o.stop(t0 + 0.3);
    burst(0.18, { bp: 900, q: 1, gain: 0.05 });
  },
  exert(player = false) {
    if (!gate(player ? "exP" : "exO", 300)) return;
    burst(0.16, { bp: player ? 800 : 650, q: 3, gain: 0.05, attack: 0.02 });
  },
  gate() {
    tone(55, 1.4, { type: "sawtooth", gain: 0.08, slide: 42 });
    burst(1.2, { lp: 300, gain: 0.2, attack: 0.1 });
    for (let i = 0; i < 5; i++) burst(0.08, { bp: vary(500), q: 3, gain: 0.06, delay: 0.1 + i * 0.18 });
    tone(80, 0.3, { type: "triangle", gain: 0.3, delay: 1.25, slide: 45 });
  },
  horn() {
    tone(196, 1.1, { type: "sawtooth", gain: 0.06, attack: 0.08 });
    tone(294, 1.1, { type: "sawtooth", gain: 0.04, attack: 0.08 });
  },
  victory() {
    const notes = [262, 330, 392, 523];
    notes.forEach((n, i) => {
      tone(n, 0.5, { type: "sawtooth", gain: 0.07, delay: i * 0.16, attack: 0.03 });
      tone(n * 2, 0.4, { type: "triangle", gain: 0.05, delay: i * 0.16 });
    });
    tone(523, 1.4, { type: "sawtooth", gain: 0.08, delay: 0.64, attack: 0.05 });
    tone(659, 1.4, { type: "sawtooth", gain: 0.05, delay: 0.64, attack: 0.05 });
  },
  defeat() {
    tone(110, 1.2, { type: "sawtooth", gain: 0.08, slide: 70 });
    tone(165, 1.0, { type: "sawtooth", gain: 0.05, slide: 98 });
    burst(1.0, { lp: 200, gain: 0.2 });
  },
  ui() {
    tone(660, 0.05, { type: "triangle", gain: 0.07 });
  },
  uiBack() {
    tone(440, 0.06, { type: "triangle", gain: 0.06 });
  },
  denied() {
    if (!gate("denied", 250)) return;
    tone(180, 0.12, { type: "square", gain: 0.04 });
  },
  countdown(final = false) {
    tone(final ? 880 : 440, final ? 0.35 : 0.12, { type: "triangle", gain: 0.12 });
  },

  /* ------------------------------------------------ crowd */
  crowd(level) {
    const a = ac();
    if (!a) return;
    crowdBase = level;
    if (!crowdSrc && level > 0) {
      crowdSrc = a.createBufferSource();
      crowdSrc.buffer = noise();
      crowdSrc.loop = true;
      crowdFilter = a.createBiquadFilter();
      crowdFilter.type = "bandpass";
      crowdFilter.frequency.value = 700;
      crowdFilter.Q.value = 0.6;
      crowdGain = a.createGain();
      crowdGain.gain.value = 0;
      crowdSrc.connect(crowdFilter).connect(crowdGain).connect(crowdBus);
      crowdSrc.start();
    }
    if (crowdGain) {
      const t = a.currentTime;
      crowdGain.gain.cancelScheduledValues(t);
      crowdGain.gain.setTargetAtTime(level, t, 0.4);
    }
  },
  cheer(amount = 1) {
    const a = ac();
    if (!a || !crowdGain || !enabled) return;
    const t = a.currentTime;
    const peak = crowdBase + 0.1 * amount;
    crowdGain.gain.cancelScheduledValues(t);
    crowdGain.gain.setTargetAtTime(peak, t, 0.05);
    crowdGain.gain.setTargetAtTime(crowdBase, t + 0.5 + amount * 0.5, 0.6);
    crowdFilter.frequency.cancelScheduledValues(t);
    crowdFilter.frequency.setTargetAtTime(1100, t, 0.05);
    crowdFilter.frequency.setTargetAtTime(700, t + 0.6, 0.5);
    // a few voices on top
    for (let i = 0; i < 3 + amount * 3; i++) burst(0.3 + Math.random() * 0.4, { bp: vary(900, 0.4), q: 5, gain: 0.03 * amount, delay: Math.random() * 0.3, bus: crowdBus, attack: 0.05 });
  },
  gasp() {
    const a = ac();
    if (!a || !crowdGain || !enabled) return;
    burst(0.5, { bp: 1400, q: 2, gain: 0.06, bus: crowdBus, attack: 0.08, sweepTo: 800 });
  },

  /* ------------------------------------------------ music */
  setMusic(on, mode = "menu") {
    musicOn = !!on;
    musicMode = mode;
    const a = ac();
    if (!a) return;
    const t = a.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(on ? (mode === "fight" ? 0.35 : 0.5) : 0, t);
    if (on && !musicTimer) {
      nextNoteTime = a.currentTime + 0.05;
      musicTimer = setInterval(schedule, 60);
    } else if (!on && musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  },

  dispose() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    musicOn = false;
    try {
      if (crowdSrc) crowdSrc.stop();
    } catch {
      /* already stopped */
    }
    crowdSrc = null;
    crowdGain = null;
    crowdFilter = null;
    crowdBase = 0;
    if (ctx) {
      const t = ctx.currentTime;
      for (const b of [sfxBus, crowdBus, musicBus]) {
        b.gain.cancelScheduledValues(t);
        b.gain.setValueAtTime(0, t);
      }
    }
  },
};

/* ---- a slow war-drum + drone loop (menu), a faster percussion bed (fight) */
const SCALE = [110, 131, 147, 165, 196, 220];
function schedule() {
  if (!ctx || !musicOn) return;
  const bpm = musicMode === "fight" ? 104 : 72;
  const stepDur = 60 / bpm / 2;
  while (nextNoteTime < ctx.currentTime + 0.25) {
    const s = musicStep % 16;
    const t = nextNoteTime - ctx.currentTime;
    const drum = (f, g, d) => toneBus(f, d, g, t, "sine", f * 0.5);
    if (s % 8 === 0) drum(70, 0.5, 0.35);
    if (s % 8 === 3 && musicMode === "fight") drum(90, 0.25, 0.2);
    if (s % 8 === 6) drum(80, 0.3, 0.25);
    if (s % 4 === 2) burstBus(0.05, 3000, 0.05, t);
    if (s === 0) {
      const root = SCALE[Math.floor((musicStep / 16) % 2) * 1];
      toneBus(root, stepDur * 15, 0.06, t, "sawtooth", null, 0.4);
      toneBus(root * 1.5, stepDur * 15, 0.035, t, "sawtooth", null, 0.4);
    }
    if (musicMode === "menu" && s % 4 === 0 && Math.random() < 0.6) {
      const n = SCALE[Math.floor(Math.random() * SCALE.length)] * 2;
      toneBus(n, stepDur * 3, 0.03, t, "triangle", null, 0.05);
    }
    nextNoteTime += stepDur;
    musicStep++;
  }
}
function toneBus(freq, dur, gain, delay, type, slide, attack = 0.005) {
  const a = ctx;
  const t0 = a.currentTime + Math.max(0, delay);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(f).connect(g).connect(musicBus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function burstBus(dur, lp, gain, delay) {
  const a = ctx;
  const t0 = a.currentTime + Math.max(0, delay);
  const src = a.createBufferSource();
  src.buffer = noise();
  const f = a.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = lp;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(musicBus);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.02);
}
