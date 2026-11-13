/**
 * Horror audio, synthesised with the Web Audio API (no audio files to
 * download): per-location ambience (wind, drones, drips, distant bells,
 * howls, fire crackle) through a generated reverb, a slow dark pad as music,
 * creature breathing and growls per monster, armour clanks, heavy footsteps,
 * spell and impact sounds, card draw/play foley, boss stings.
 * Nothing starts before a user gesture (unlock()); master volume + mute
 * follow the game settings and the Game Center mute button.
 */
let ctx = null;
let master, sfx, music, amb, verb, verbSend;
let muted = false;
let volume = 0.8;
let musicVol = 0.6;
let ambNodes = [];
let ambTimers = [];
let breathTimer = null;
let noiseBuf = null;

function now() {
  return ctx ? ctx.currentTime : 0;
}

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  comp.connect(master);
  sfx = ctx.createGain();
  sfx.gain.value = 0.9;
  sfx.connect(comp);
  music = ctx.createGain();
  music.gain.value = musicVol * 0.5;
  music.connect(comp);
  amb = ctx.createGain();
  amb.gain.value = 0.55;
  amb.connect(comp);
  // generated cathedral-ish reverb
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 3.2;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  verb.buffer = ir;
  verbSend = ctx.createGain();
  verbSend.gain.value = 0.35;
  verbSend.connect(verb);
  verb.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return ctx;
}

function noise(dur, { type = "lowpass", freq = 1000, q = 1, gain = 0.5, attack = 0.005, release = null, to = sfx, sweep = null, rev = 0.2, at = 0 } = {}) {
  if (!ctx) return;
  const t = now() + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
  src.connect(f).connect(g).connect(to);
  if (rev) {
    const s = ctx.createGain();
    s.gain.value = rev;
    g.connect(s).connect(verbSend);
  }
  src.start(t, Math.random() * 1.5);
  src.stop(t + (release ?? dur) + 0.05);
}

function tone(freq, dur, { type = "sine", gain = 0.3, attack = 0.01, to = sfx, glide = null, rev = 0.2, at = 0, detune = 0, filter = null } = {}) {
  if (!ctx) return;
  const t = now() + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(10, glide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filter;
    o.connect(f);
    node = f;
  }
  node.connect(g).connect(to);
  if (rev) {
    const s = ctx.createGain();
    s.gain.value = rev;
    g.connect(s).connect(verbSend);
  }
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Growl: bandpassed noise through a jittery low saw — formants per creature. */
function growl(base = 70, dur = 1.2, formants = [400, 900], gain = 0.35, at = 0) {
  if (!ctx) return;
  const t = now() + at;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(base * 1.2, t);
  o.frequency.linearRampToValueAtTime(base, t + dur * 0.3);
  o.frequency.linearRampToValueAtTime(base * 0.8, t + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 23;
  const lg = ctx.createGain();
  lg.gain.value = base * 0.18;
  lfo.connect(lg).connect(o.frequency);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const mix = ctx.createGain();
  mix.gain.value = 1;
  const ng = ctx.createGain();
  ng.gain.value = 0.5;
  o.connect(mix);
  src.connect(ng).connect(mix);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + 0.12);
  out.gain.setValueAtTime(gain, t + dur * 0.6);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const f of formants) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = 4;
    mix.connect(bp).connect(out);
  }
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 260;
  mix.connect(lp).connect(out);
  out.connect(sfx);
  const s = ctx.createGain();
  s.gain.value = 0.3;
  out.connect(s).connect(verbSend);
  o.start(t);
  lfo.start(t);
  src.start(t);
  o.stop(t + dur + 0.1);
  lfo.stop(t + dur + 0.1);
  src.stop(t + dur + 0.1);
}

const VOICES = {
  skeleton: { base: 0, formants: [1200, 2600], kind: "rattle" },
  ghoul: { base: 85, formants: [500, 1400], kind: "growl" },
  wolf: { base: 95, formants: [600, 1600], kind: "growl" },
  knight: { base: 55, formants: [300, 700], kind: "metal" },
  witch: { base: 190, formants: [900, 2400], kind: "hiss" },
  guardian: { base: 38, formants: [180, 420], kind: "stone" },
  reaper: { base: 45, formants: [250, 650], kind: "whisper" },
  demon: { base: 42, formants: [220, 520], kind: "growl" },
  lord: { base: 50, formants: [260, 640], kind: "metal" },
};

function rattle(gain = 0.25, at = 0) {
  for (let i = 0; i < 9; i++) noise(0.04, { type: "bandpass", freq: 1800 + Math.random() * 2400, q: 6, gain: gain * (0.5 + Math.random() * 0.5), at: at + i * (0.03 + Math.random() * 0.04), rev: 0.25 });
}

function clank(gain = 0.25, at = 0) {
  for (const f of [520, 780, 1310, 2150]) tone(f * (0.97 + Math.random() * 0.06), 0.5, { type: "triangle", gain: gain * 0.25, attack: 0.002, at, rev: 0.3 });
  noise(0.06, { type: "highpass", freq: 3000, gain: gain * 0.5, at });
}

function step(heavy = 1, at = 0) {
  tone(55 * (0.9 + Math.random() * 0.2), 0.25 + heavy * 0.15, { type: "sine", gain: 0.35 * heavy, attack: 0.004, glide: 30, at, rev: 0.2 });
  noise(0.12, { type: "lowpass", freq: 400, gain: 0.25 * heavy, at, rev: 0.15 });
}

export const audio = {
  unlock() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, now(), 0.05);
  },
  setVolume(v) {
    volume = v;
    if (master && !muted) master.gain.setTargetAtTime(v, now(), 0.05);
  },
  setMusic(v) {
    musicVol = v;
    if (music) music.gain.setTargetAtTime(v * 0.5, now(), 0.1);
  },
  ready: () => !!ctx && ctx.state === "running",

  /* ----- ambience + music */
  startAmbience(kind, { boss = false } = {}) {
    if (!ensure()) return;
    this.stopAmbience();
    const t = now();
    const hold = (node) => (ambNodes.push(node), node);
    // wind / room tone
    const src = hold(ctx.createBufferSource());
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    const indoor = ["crypt", "dungeon", "cathedral", "throne"].includes(kind);
    f.frequency.value = indoor ? 220 : 520;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = indoor ? 0.12 : 0.22;
    const lfo = hold(ctx.createOscillator());
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = indoor ? 80 : 300;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(g).connect(amb);
    src.start(t);
    lfo.start(t);
    // drone + pad (music bus)
    const root = { graveyard: 55, forest: 51.9, crypt: 49, castle: 46.2, dungeon: 43.7, cathedral: 41.2, arena: 38.9, throne: 36.7 }[kind] || 49;
    const chord = boss ? [1, 1.189, 1.498, 2, 2.122] : [1, 1.189, 1.498, 2];
    for (const [i, k] of chord.entries()) {
      for (const det of [-6, 7]) {
        const o = hold(ctx.createOscillator());
        o.type = "sawtooth";
        o.frequency.value = root * k * (i > 2 ? 2 : 1);
        o.detune.value = det;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 300 + i * 80;
        const og = ctx.createGain();
        og.gain.value = 0;
        og.gain.linearRampToValueAtTime(0.03 / (1 + i * 0.4), t + 6);
        const sw = hold(ctx.createOscillator());
        sw.frequency.value = 0.05 + i * 0.013;
        const swg = ctx.createGain();
        swg.gain.value = 120;
        sw.connect(swg).connect(lp.frequency);
        o.connect(lp).connect(og).connect(music);
        const vs = ctx.createGain();
        vs.gain.value = 0.4;
        og.connect(vs).connect(verbSend);
        o.start(t);
        sw.start(t);
      }
    }
    // occasional location sounds
    const every = (min, max, fn) => {
      const go = () => {
        fn();
        ambTimers.push(setTimeout(go, (min + Math.random() * (max - min)) * 1000));
      };
      ambTimers.push(setTimeout(go, (min * 0.5 + Math.random() * min) * 1000));
    };
    if (indoor) every(2.5, 6, () => tone(1400 + Math.random() * 900, 0.18, { type: "sine", gain: 0.05, glide: 700, to: amb, rev: 0.8 })); // drips
    if (kind === "cathedral" || kind === "throne") every(14, 26, () => [1, 2.76, 5.4].forEach((h) => tone(110 * h, 5, { type: "sine", gain: 0.05 / h, attack: 0.01, to: amb, rev: 0.9 })));
    if (kind === "forest" || kind === "graveyard") every(12, 24, () => tone(420, 2.4, { type: "sine", gain: 0.035, attack: 0.6, glide: 300, to: amb, rev: 0.9 })); // distant howl
    if (kind === "castle" || kind === "arena") every(0.15, 0.6, () => noise(0.03, { type: "highpass", freq: 2500, gain: 0.02 + Math.random() * 0.03, to: amb, rev: 0.05 })); // fire crackle
    if (kind === "dungeon") every(9, 18, () => clank(0.08)); // chains
    if (boss) every(2.2, 2.2, () => tone(48, 0.6, { type: "sine", gain: 0.12, glide: 34, to: music, rev: 0.4 })); // war drum
    every(18, 34, () => noise(3, { type: "bandpass", freq: 300, q: 3, gain: 0.04, attack: 1.2, release: 3, to: amb, rev: 0.9, sweep: 120 })); // distant echo
  },
  stopAmbience() {
    for (const n of ambNodes) {
      try {
        n.stop?.();
      } catch {
        /* already stopped */
      }
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    ambNodes = [];
    for (const t of ambTimers) clearTimeout(t);
    ambTimers = [];
    this.stopBreathing();
  },
  /** Creature breathing loop while the monster lives. */
  startBreathing(key) {
    if (!ctx) return;
    this.stopBreathing();
    const v = VOICES[key] || VOICES.ghoul;
    const go = () => {
      if (v.kind === "rattle") rattle(0.05);
      else if (v.kind === "metal") {
        noise(1.4, { type: "bandpass", freq: 260, q: 2, gain: 0.05, attack: 0.6, release: 1.4, rev: 0.4 });
        if (Math.random() < 0.4) clank(0.04, 0.3);
      } else if (v.kind === "stone") noise(2, { type: "lowpass", freq: 140, gain: 0.08, attack: 0.8, release: 2, rev: 0.4 });
      else {
        noise(1.1, { type: "bandpass", freq: v.formants[0], q: 1.5, gain: 0.06, attack: 0.5, release: 1.1, rev: 0.3 });
        noise(0.9, { type: "bandpass", freq: v.formants[0] * 0.8, q: 1.5, gain: 0.045, attack: 0.3, release: 0.9, at: 1.3, rev: 0.3 });
      }
      breathTimer = setTimeout(go, 2600 + Math.random() * 1800);
    };
    breathTimer = setTimeout(go, 800);
  },
  stopBreathing() {
    clearTimeout(breathTimer);
    breathTimer = null;
  },

  /* ----- creatures */
  voice(key, kind = "attack") {
    if (!ctx) return;
    const v = VOICES[key] || VOICES.ghoul;
    const big = kind === "roar" ? 1.6 : kind === "hurt" ? 0.6 : 1;
    if (v.kind === "rattle") rattle(0.2 * big);
    else if (v.kind === "metal") {
      clank(0.22 * big);
      growl(v.base, 0.8 * big, v.formants, 0.18 * big, 0.05);
    } else if (v.kind === "hiss") noise(0.7 * big, { type: "highpass", freq: 2600, gain: 0.12 * big, attack: 0.05, rev: 0.4, sweep: 5000 });
    else if (v.kind === "whisper") noise(1.0 * big, { type: "bandpass", freq: 1200, q: 2, gain: 0.1 * big, attack: 0.2, rev: 0.7, sweep: 400 });
    else growl(v.base, (kind === "hurt" ? 0.45 : 1.0) * big, v.formants, 0.3 * Math.min(1.3, big));
    if (key === "guardian" || key === "demon") step(1.3, 0.1);
  },
  footstep: (heavy = 1) => ctx && step(heavy),
  armor: () => ctx && clank(0.2),

  /* ----- combat */
  hit(kind, power = 1) {
    if (!ctx) return;
    const p = Math.min(1.6, power);
    switch (kind) {
      case "crush":
      case "execute":
      case "quake":
        tone(70, 0.5, { type: "sine", gain: 0.5 * p, glide: 32, attack: 0.003 });
        noise(0.25, { type: "lowpass", freq: 900, gain: 0.4 * p, sweep: 200 });
        noise(0.12, { type: "bandpass", freq: 2400, q: 2, gain: 0.15 * p, at: 0.02 }); // bone crack
        break;
      case "blood":
      case "claw":
        noise(0.18, { type: "highpass", freq: 1800, gain: 0.25 * p, sweep: 6000 });
        noise(0.22, { type: "lowpass", freq: 600, gain: 0.25 * p, sweep: 150, at: 0.03 }); // wet
        break;
      case "slash":
      case "scythe":
      case "stake":
        noise(0.15, { type: "highpass", freq: 2500, gain: 0.22 * p, sweep: 7000 });
        tone(1700, 0.5, { type: "triangle", gain: 0.05 * p, attack: 0.002, rev: 0.3 });
        break;
      case "fire":
        noise(0.6, { type: "bandpass", freq: 900, q: 0.8, gain: 0.35 * p, sweep: 300 });
        for (let i = 0; i < 6; i++) noise(0.03, { type: "highpass", freq: 3000, gain: 0.08, at: 0.05 + i * 0.06 });
        break;
      case "doom":
        tone(36, 1.8, { type: "sawtooth", gain: 0.25, glide: 24, filter: 300, rev: 0.6 });
        noise(1.2, { type: "lowpass", freq: 1200, gain: 0.4, sweep: 80, rev: 0.6 });
        break;
      default:
        // shadow / bolt / drain / blades
        tone(180, 0.45, { type: "sawtooth", gain: 0.12 * p, glide: 60, filter: 900, rev: 0.4 });
        noise(0.3, { type: "bandpass", freq: 700, q: 1.5, gain: 0.25 * p, sweep: 200 });
    }
  },
  playerHurt(dmg) {
    if (!ctx) return;
    tone(90, 0.3, { type: "sine", gain: 0.3 + Math.min(0.3, dmg * 0.02), glide: 50 });
    noise(0.2, { type: "lowpass", freq: 700, gain: 0.25, sweep: 200 });
  },
  block() {
    if (!ctx) return;
    clank(0.18);
  },
  shield() {
    if (!ctx) return;
    [523, 659, 784].forEach((f, i) => tone(f, 0.9, { type: "sine", gain: 0.06, at: i * 0.04, rev: 0.6 }));
    noise(0.5, { type: "bandpass", freq: 2200, q: 3, gain: 0.05, attack: 0.1, rev: 0.5 });
  },
  heal() {
    if (!ctx) return;
    [659, 784, 988, 1319].forEach((f, i) => tone(f, 1.2, { type: "sine", gain: 0.06, at: i * 0.09, rev: 0.7 }));
  },
  hex() {
    if (!ctx) return;
    tone(220, 0.9, { type: "sawtooth", gain: 0.06, glide: 150, filter: 1200, rev: 0.6 });
    tone(233, 0.9, { type: "sawtooth", gain: 0.06, glide: 155, filter: 1200, rev: 0.6 });
  },
  buff() {
    if (!ctx) return;
    tone(110, 0.7, { type: "sawtooth", gain: 0.12, glide: 220, filter: 1500, rev: 0.4 });
  },
  whoosh() {
    if (!ctx) return;
    noise(0.35, { type: "bandpass", freq: 500, q: 1.2, gain: 0.18, attack: 0.12, sweep: 2200, rev: 0.2 });
  },
  cardDraw() {
    if (!ctx) return;
    noise(0.09, { type: "highpass", freq: 3000, gain: 0.07, attack: 0.01, sweep: 6000, rev: 0 });
  },
  cardPlay() {
    if (!ctx) return;
    noise(0.12, { type: "highpass", freq: 2000, gain: 0.1, rev: 0 });
    tone(140, 0.25, { type: "sine", gain: 0.15, glide: 70, at: 0.03 });
  },
  denied() {
    if (!ctx) return;
    tone(180, 0.15, { type: "square", gain: 0.05, filter: 700 });
    tone(140, 0.2, { type: "square", gain: 0.05, filter: 700, at: 0.08 });
  },
  click() {
    if (!ctx) return;
    tone(900, 0.05, { type: "triangle", gain: 0.05, rev: 0 });
  },
  turn() {
    if (!ctx) return;
    tone(196, 0.8, { type: "triangle", gain: 0.06, rev: 0.6 });
  },
  bossIntro(key) {
    if (!ctx) return;
    tone(30, 3.2, { type: "sine", gain: 0.5, attack: 0.05, glide: 22, rev: 0.4 });
    [1, 1.5, 2.38].forEach((k, i) => tone(55 * k, 3.4, { type: "sawtooth", gain: 0.07, attack: 1.2, filter: 700, rev: 0.8, at: i * 0.05 }));
    setTimeout(() => this.voice(key, "roar"), 900);
  },
  phase(key) {
    if (!ctx) return;
    tone(41, 2.2, { type: "sawtooth", gain: 0.2, attack: 0.3, filter: 400, rev: 0.7 });
    this.voice(key, "roar");
  },
  victory() {
    if (!ctx) return;
    [261.6, 329.6, 392, 523.3].forEach((f, i) => tone(f, 2.4, { type: "triangle", gain: 0.08, at: i * 0.18, rev: 0.7 }));
  },
  defeat() {
    if (!ctx) return;
    [130.8, 123.5, 98].forEach((f, i) => tone(f, 2.6, { type: "sawtooth", gain: 0.07, filter: 600, at: i * 0.4, rev: 0.8 }));
  },
  levelUp() {
    if (!ctx) return;
    [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => tone(f, 1.0, { type: "sine", gain: 0.07, at: i * 0.07, rev: 0.6 }));
  },
  stopAll() {
    this.stopAmbience();
  },
  dispose() {
    this.stopAmbience();
    if (ctx) ctx.close().catch(() => {});
    // drop every node of the closed context: the module outlives the game, and
    // a stale `master` would make setMuted()/setVolume() touch a dead context
    // the next time the game mounts
    ctx = null;
    master = sfx = music = amb = verb = verbSend = null;
    noiseBuf = null;
  },
};
