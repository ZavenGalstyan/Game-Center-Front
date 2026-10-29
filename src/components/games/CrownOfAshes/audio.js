/**
 * Procedural WebAudio for Crown of Ashes — no audio files.
 *
 *  music     modal medieval themes per region (plucked lute arpeggios over a
 *            drone and slow bass, a fiddle-ish lead in towns), with combat
 *            (war drums) and boss (low choir pad + timpani) layers faded in by
 *            an intensity value. Each region picks its own mode and tempo.
 *  ambience  wind (always), birdsong by day in the wilds, crickets at
 *            night, a crackle near fires, dungeon drips indoors.
 *  sfx       blades, impacts by material, blocks/parries, bows, spells,
 *            footsteps (grass / snow / stone / wading), creatures, the
 *            dragon, UI, jingles.
 *
 * The context is created on the first user gesture (unlock()); `muted`
 * from the Game Center silences the master bus.
 */
let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let ambBus = null;
let verb = null;
let noiseBuf = null;
let muted = false;
let vol = { master: 0.8, music: 0.55, sfx: 0.9 };
let theme = "village";
let intensity = 0;
let targetIntensity = 0;
let scheduler = null;
let nextT = 0;
let step = 0;
let amb = null;
let ambState = { day: 1, indoor: false, fire: 0, wind: 0.3, rain: 0 };
const last = {};

const T = () => ctx.currentTime;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function noise() {
  if (noiseBuf) return noiseBuf;
  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function env(g, t, a, peak, d) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function osc(type, f, t, dur, peak, dest, o = {}) {
  const v = ctx.createOscillator();
  const g = ctx.createGain();
  v.type = type;
  v.frequency.setValueAtTime(f, t);
  if (o.slide) v.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.slide), t + dur);
  if (o.detune) v.detune.value = o.detune;
  env(g, t, o.a ?? 0.005, peak, dur);
  let out = g;
  if (o.lp) {
    const f2 = ctx.createBiquadFilter();
    f2.type = "lowpass";
    f2.frequency.value = o.lp;
    g.connect(f2);
    out = f2;
  }
  v.connect(g);
  out.connect(dest || sfxBus);
  if (o.verb && verb) out.connect(verb);
  v.start(t);
  v.stop(t + (o.a ?? 0.005) + dur + 0.05);
  return v;
}
function burst(t, dur, peak, o = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noise();
  s.playbackRate.value = o.rate ?? 0.8 + Math.random() * 0.4;
  const fl = ctx.createBiquadFilter();
  fl.type = o.type || "bandpass";
  fl.frequency.setValueAtTime(o.f || 1200, t);
  if (o.slide) fl.frequency.exponentialRampToValueAtTime(Math.max(40, (o.f || 1200) * o.slide), t + dur);
  fl.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  env(g, t, o.a ?? 0.003, peak, dur);
  s.connect(fl).connect(g).connect(o.dest || sfxBus);
  if (o.verb && verb) g.connect(verb);
  s.start(t, Math.random() * 1.5);
  s.stop(t + (o.a ?? 0.003) + dur + 0.05);
}
/** Karplus–Strong-ish pluck (lute / harp). */
function pluck(f, t, peak, dest, dur = 1.4, bright = 3000) {
  const v = ctx.createOscillator();
  const v2 = ctx.createOscillator();
  const g = ctx.createGain();
  const fl = ctx.createBiquadFilter();
  v.type = "triangle";
  v2.type = "sawtooth";
  v.frequency.value = f;
  v2.frequency.value = f * 2.002;
  fl.type = "lowpass";
  fl.frequency.setValueAtTime(bright, t);
  fl.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + dur * 0.6);
  const g2 = ctx.createGain();
  g2.gain.value = 0.18;
  v2.connect(g2).connect(fl);
  v.connect(fl).connect(g);
  env(g, t, 0.004, peak, dur);
  g.connect(dest);
  if (verb) g.connect(verb);
  v.start(t);
  v2.start(t);
  v.stop(t + dur + 0.1);
  v2.stop(t + dur + 0.1);
}
const throttle = (k, ms) => {
  const t = performance.now();
  if (last[k] && t - last[k] < ms) return false;
  last[k] = t;
  return true;
};

function makeVerb() {
  const len = ctx.sampleRate * 2.2;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.22;
  conv.connect(g).connect(master);
  return conv;
}

/* ------------------------------------------------------------ music */
const THEMES = {
  village: { root: 50, mode: [0, 2, 4, 5, 7, 9, 10], bpm: 92, lead: true, prog: [0, 3, 4, 0, 5, 3, 4, 4] }, // mixolydian, warm
  forest: { root: 45, mode: [0, 2, 3, 5, 7, 9, 10], bpm: 78, lead: false, prog: [0, 6, 3, 4, 0, 6, 4, 4] }, // dorian
  castle: { root: 43, mode: [0, 2, 3, 5, 7, 8, 10], bpm: 70, lead: true, prog: [0, 5, 3, 6, 0, 5, 4, 4] }, // aeolian, stately
  wild: { root: 47, mode: [0, 2, 3, 5, 7, 9, 10], bpm: 74, lead: false, prog: [0, 3, 6, 4, 0, 3, 4, 0] },
  ruins: { root: 40, mode: [0, 1, 3, 5, 7, 8, 10], bpm: 64, lead: false, prog: [0, 1, 0, 5, 0, 1, 6, 4] }, // phrygian, dread
  mountain: { root: 38, mode: [0, 1, 3, 5, 7, 8, 10], bpm: 60, lead: false, prog: [0, 5, 1, 0, 6, 5, 1, 0] },
  dungeon: { root: 36, mode: [0, 1, 3, 5, 6, 8, 10], bpm: 56, lead: false, prog: [0, 1, 0, 6, 0, 1, 4, 0] }, // locrian-ish
  menu: { root: 45, mode: [0, 2, 3, 5, 7, 8, 10], bpm: 66, lead: true, prog: [0, 5, 3, 6, 0, 5, 4, 4] },
  ending: { root: 48, mode: [0, 2, 4, 5, 7, 9, 11], bpm: 68, lead: true, prog: [0, 4, 5, 3, 0, 4, 3, 4] },
};
let drone = null;
function setDrone(th) {
  const t = T();
  if (drone) {
    drone.g.gain.cancelScheduledValues(t);
    drone.g.gain.setTargetAtTime(0.0001, t, 0.8);
    const d = drone;
    setTimeout(() => d.oscs.forEach((o) => o.stop()), 4000);
  }
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.setTargetAtTime(0.05, t, 1.5);
  const fl = ctx.createBiquadFilter();
  fl.type = "lowpass";
  fl.frequency.value = 420;
  const oscs = [0, 7, 12].map((iv, i) => {
    const o = ctx.createOscillator();
    o.type = i === 2 ? "triangle" : "sawtooth";
    o.frequency.value = mtof(th.root - 12 + iv);
    o.detune.value = (i - 1) * 6;
    o.connect(fl);
    o.start();
    return o;
  });
  fl.connect(g).connect(musicBus);
  drone = { g, oscs };
}
function scheduleMusic() {
  const th = THEMES[theme] || THEMES.village;
  const beat = 60 / th.bpm;
  const sub = beat / 2;
  while (nextT < T() + 0.25) {
    const t = nextT;
    const bar = Math.floor(step / 8);
    const deg = th.prog[bar % th.prog.length];
    const scale = th.mode;
    const note = (d, oct = 0) => th.root + scale[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
    const s = step % 8;
    intensity += (targetIntensity - intensity) * 0.08;
    // bass on bar start and middle
    if (s === 0 || s === 4) osc("triangle", mtof(note(deg, -1)), t, beat * 1.8, 0.09, musicBus, { a: 0.02, lp: 600 });
    // lute arpeggio: chord tones 1-3-5-8 rolling
    const arp = [0, 2, 4, 7, 4, 2, 4, 2];
    if (theme !== "dungeon" || s % 2 === 0) pluck(mtof(note(deg + arp[s], 1)), t, 0.055 * (1 - intensity * 0.3), musicBus, 1.6, 2400);
    // lead phrase in towns / castle every other bar
    if (th.lead && bar % 2 === 1 && (s === 0 || s === 3 || s === 5)) {
      const ld = [4, 5, 2][Math.floor(s / 2) % 3];
      osc("sine", mtof(note(deg + ld, 2)), t, beat * 1.2, 0.03, musicBus, { a: 0.06, detune: Math.sin(step) * 8, verb: true });
    }
    // combat drums
    if (intensity > 0.15) {
      const k = Math.min(1, intensity);
      if (s === 0 || s === 3 || s === 4 || (intensity > 1.2 && s === 6)) {
        osc("sine", 110, t, 0.25, 0.22 * k, musicBus, { slide: 0.45 });
        burst(t, 0.12, 0.06 * k, { f: 300, type: "lowpass", dest: musicBus });
      }
      if (s === 2 || s === 6) burst(t, 0.08, 0.04 * k, { f: 2400, q: 2, dest: musicBus });
    }
    // boss: choir pad + timpani
    if (intensity > 1.2 && s === 0) {
      for (const iv of [0, 3, 7]) osc("sawtooth", mtof(note(deg, 0) + iv), t, beat * 3.6, 0.018, musicBus, { a: 0.5, lp: 900, verb: true });
      osc("sine", mtof(th.root - 12), t, 0.6, 0.25, musicBus, { slide: 0.7 });
    }
    nextT += sub;
    step++;
  }
}

/* ------------------------------------------------------------ ambience */
function startAmbience() {
  if (amb) return;
  const mk = (f, q, type = "bandpass") => {
    const s = ctx.createBufferSource();
    s.buffer = noise();
    s.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(fl).connect(g).connect(ambBus);
    s.start();
    return { s, fl, g };
  };
  amb = { wind: mk(500, 0.6, "lowpass"), rain: mk(2800, 0.4, "highpass"), fire: mk(1800, 0.8) };
  amb.timer = setInterval(() => {
    if (!ctx || muted) return;
    const t = T();
    const A = ambState;
    amb.wind.g.gain.setTargetAtTime((A.indoor ? 0.02 : 0.05 + A.wind * 0.12) * (0.7 + Math.sin(t * 0.3) * 0.3), t, 0.8);
    amb.wind.fl.frequency.setTargetAtTime(300 + Math.sin(t * 0.17) * 180 + A.wind * 400, t, 1);
    amb.rain.g.gain.setTargetAtTime(A.indoor ? 0 : A.rain * 0.07, t, 1);
    amb.fire.g.gain.setTargetAtTime(A.fire * 0.04 * (0.6 + Math.random() * 0.8), t, 0.05);
    // birds by day outdoors, crickets at night, drips underground
    if (A.indoor) {
      if (Math.random() < 0.08) osc("sine", 1400 + Math.random() * 900, t + Math.random() * 0.2, 0.08, 0.02, ambBus, { slide: 0.5, verb: true });
    } else if (A.day > 0.5 && A.birds && Math.random() < 0.12) {
      const f = 2600 + Math.random() * 1600;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) osc("sine", f * (1 + (k % 2) * 0.12), t + k * 0.09, 0.07, 0.012, ambBus, { slide: 1.15 });
    } else if (A.day < 0.4 && Math.random() < 0.3) {
      for (let k = 0; k < 3; k++) osc("square", 4200, t + k * 0.05, 0.02, 0.004, ambBus);
    }
  }, 200);
}

/* ------------------------------------------------------------ public api */
export const audio = {
  unlock() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return;
    }
    const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : vol.master;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = vol.music;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = vol.sfx;
    sfxBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = vol.sfx * 0.9;
    ambBus.connect(master);
    verb = makeVerb();
    nextT = T() + 0.1;
    setDrone(THEMES[theme]);
    scheduler = setInterval(() => ctx && scheduleMusic(), 90);
    startAmbience();
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : vol.master, T(), 0.05);
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    if (!ctx) return;
    master.gain.setTargetAtTime(muted ? 0 : vol.master, T(), 0.05);
    musicBus.gain.setTargetAtTime(vol.music, T(), 0.05);
    sfxBus.gain.setTargetAtTime(vol.sfx, T(), 0.05);
    ambBus.gain.setTargetAtTime(vol.sfx * 0.9, T(), 0.05);
  },
  theme(name) {
    if (!THEMES[name] || name === theme) return;
    theme = name;
    if (ctx) setDrone(THEMES[name]);
  },
  intensity(v) {
    targetIntensity = v;
  },
  ambience(s) {
    ambState = { ...ambState, ...s };
  },
  silence() {
    targetIntensity = 0;
  },
  /* -------------------------------------------------- combat */
  swing(heavy, cls) {
    if (!ctx) return;
    const t = T();
    if (cls === "rogue") burst(t, 0.12, 0.12, { f: 2600, q: 1.4, slide: 0.5 });
    else burst(t, heavy ? 0.32 : 0.2, heavy ? 0.2 : 0.14, { f: heavy ? 900 : 1500, q: 0.9, slide: 0.35 });
  },
  hit(mat = "flesh", crit = false, big = false) {
    if (!ctx || !throttle(`hit${mat}`, 35)) return;
    const t = T();
    if (mat === "metal") {
      osc("square", 1700 + Math.random() * 400, t, 0.18, 0.05, sfxBus, { slide: 0.8 });
      osc("triangle", 2600 + Math.random() * 300, t, 0.3, 0.05, sfxBus, { verb: true });
      burst(t, 0.06, 0.18, { f: 3000, q: 2 });
    } else if (mat === "bone") {
      burst(t, 0.07, 0.2, { f: 1800, q: 3 });
      osc("square", 700, t, 0.05, 0.05);
    } else if (mat === "stone" || mat === "scale") {
      burst(t, 0.12, 0.22, { f: 500, q: 1 });
      osc("sine", 120, t, 0.15, 0.2, sfxBus, { slide: 0.6 });
    } else {
      burst(t, 0.09, 0.22, { f: 700, q: 1.2 });
      osc("sine", 140, t, 0.12, 0.22, sfxBus, { slide: 0.5 });
    }
    if (crit) osc("triangle", 2200, t + 0.02, 0.18, 0.06, sfxBus, { verb: true });
    if (big) osc("sine", 70, t, 0.35, 0.3, sfxBus, { slide: 0.6 });
  },
  hurt() {
    if (!ctx || !throttle("hurt", 120)) return;
    const t = T();
    burst(t, 0.12, 0.24, { f: 500, q: 1 });
    osc("sawtooth", 160, t, 0.18, 0.06, sfxBus, { slide: 0.6, lp: 900 });
  },
  block(shield) {
    if (!ctx) return;
    const t = T();
    if (shield) {
      osc("square", 380, t, 0.12, 0.08, sfxBus, { slide: 0.6, lp: 2000 });
      burst(t, 0.15, 0.22, { f: 900, q: 1.5 });
    } else {
      osc("triangle", 2400, t, 0.25, 0.08, sfxBus, { verb: true });
      burst(t, 0.06, 0.18, { f: 3400, q: 2 });
    }
  },
  parry() {
    if (!ctx) return;
    const t = T();
    osc("triangle", 1800, t, 0.6, 0.12, sfxBus, { verb: true });
    osc("triangle", 2700, t + 0.02, 0.5, 0.08, sfxBus, { verb: true });
  },
  ward() {
    if (!ctx || !throttle("ward", 80)) return;
    osc("sine", 620, T(), 0.22, 0.08, sfxBus, { slide: 1.6, verb: true });
  },
  dodge() {
    if (!ctx) return;
    burst(T(), 0.22, 0.1, { f: 600, q: 0.7, slide: 0.5 });
  },
  jump() {
    if (!ctx) return;
    burst(T(), 0.08, 0.06, { f: 500 });
  },
  land(hard) {
    if (!ctx) return;
    burst(T(), hard ? 0.2 : 0.1, hard ? 0.25 : 0.1, { f: 280, type: "lowpass" });
  },
  step(surface = "grass", run = false) {
    if (!ctx) return;
    const t = T();
    const v = run ? 0.09 : 0.06;
    if (surface === "snow") burst(t, 0.1, v * 1.2, { f: 1800, q: 0.6 });
    else if (surface === "stone") burst(t, 0.05, v, { f: 2200, q: 2 });
    else if (surface === "water") burst(t, 0.18, v * 1.4, { f: 900, q: 0.5 });
    else if (surface === "wood") burst(t, 0.06, v, { f: 1100, q: 3 });
    else burst(t, 0.07, v * 0.9, { f: 1200, q: 0.8 });
  },
  draw() {
    if (!ctx) return;
    osc("sawtooth", 90, T(), 0.5, 0.025, sfxBus, { slide: 1.5, lp: 600 });
  },
  bow(power = 1) {
    if (!ctx) return;
    const t = T();
    osc("triangle", 180 + power * 80, t, 0.22, 0.12, sfxBus, { slide: 0.5 });
    burst(t, 0.15, 0.08, { f: 2200, q: 1 });
  },
  arrowHit(stuck) {
    if (!ctx || !throttle("arrowHit", 40)) return;
    const t = T();
    burst(t, 0.06, 0.15, { f: stuck ? 1200 : 700, q: 2 });
    if (stuck) osc("triangle", 300, t, 0.15, 0.05, sfxBus, { slide: 0.8 });
  },
  cast(big) {
    if (!ctx) return;
    const t = T();
    burst(t, big ? 0.5 : 0.25, big ? 0.22 : 0.13, { f: 900, q: 0.8, slide: 2.4 });
    osc("sine", big ? 220 : 440, t, 0.3, 0.06, sfxBus, { slide: 1.8, verb: true });
  },
  explode(big) {
    if (!ctx || !throttle("explode", 60)) return;
    const t = T();
    burst(t, big ? 0.9 : 0.5, big ? 0.5 : 0.3, { f: 350, type: "lowpass", rate: 0.6 });
    osc("sine", 70, t, big ? 0.8 : 0.4, big ? 0.45 : 0.25, sfxBus, { slide: 0.5 });
  },
  ability(id) {
    if (!ctx) return;
    const t = T();
    switch (id) {
      case "warCry":
        osc("sawtooth", 130, t, 0.7, 0.12, sfxBus, { slide: 0.8, lp: 1200, verb: true });
        osc("sawtooth", 196, t, 0.7, 0.08, sfxBus, { slide: 0.8, lp: 1200, verb: true });
        break;
      case "shieldBash":
        burst(t, 0.2, 0.3, { f: 700 });
        osc("square", 260, t + 0.15, 0.2, 0.1, sfxBus, { slide: 0.5, lp: 1500 });
        break;
      case "vanish":
      case "shadowstep":
      case "blink":
        burst(t, 0.4, 0.15, { f: 1800, q: 0.8, slide: 0.2 });
        osc("sine", 900, t, 0.35, 0.06, sfxBus, { slide: 0.3, verb: true });
        break;
      case "nova":
      case "meteor":
        burst(t, 0.5, 0.2, { f: 800, slide: 2 });
        break;
      default:
        burst(t, 0.25, 0.12, { f: 1400 });
    }
  },
  /* -------------------------------------------------- creatures & bosses */
  growl(kind) {
    if (!ctx || !throttle(`growl${kind}`, 600)) return;
    const t = T();
    if (kind === "wolf") osc("sawtooth", 95, t, 0.5, 0.06, sfxBus, { slide: 0.8, lp: 600 });
    else osc("sawtooth", 120, t, 0.35, 0.05, sfxBus, { slide: 1.2, lp: 800 });
  },
  howl() {
    if (!ctx) return;
    const t = T();
    const o = osc("sine", 420, t, 2.2, 0.08, sfxBus, { a: 0.3, verb: true });
    o.frequency.setValueAtTime(420, t);
    o.frequency.linearRampToValueAtTime(640, t + 0.6);
    o.frequency.linearRampToValueAtTime(520, t + 2);
  },
  death(kind) {
    if (!ctx || !throttle("death", 80)) return;
    const t = T();
    if (kind === "wolf") osc("sine", 520, t, 0.4, 0.06, sfxBus, { slide: 0.4 });
    else {
      burst(t, 0.3, 0.12, { f: 400, type: "lowpass" });
      osc("sawtooth", 140, t, 0.4, 0.04, sfxBus, { slide: 0.5, lp: 700 });
    }
  },
  roar(big = true) {
    if (!ctx) return;
    const t = T();
    for (const [f, g] of [
      [55, 0.3],
      [82, 0.2],
      [110, 0.12],
    ])
      osc("sawtooth", f, t, big ? 2.4 : 1.2, g, sfxBus, { a: 0.15, slide: 0.7, lp: 700, verb: true });
    burst(t, big ? 2.2 : 1, 0.25, { f: 400, type: "lowpass", a: 0.2 });
  },
  breath(on) {
    if (!ctx) return;
    if (on) burst(T(), 2.4, 0.3, { f: 700, q: 0.5, a: 0.2, slide: 0.6 });
  },
  wingFlap() {
    if (!ctx || !throttle("flap", 500)) return;
    burst(T(), 0.35, 0.18, { f: 220, type: "lowpass", rate: 0.5 });
  },
  quake() {
    if (!ctx || !throttle("quake", 150)) return;
    const t = T();
    osc("sine", 45, t, 0.8, 0.4, sfxBus, { slide: 0.6 });
    burst(t, 0.6, 0.3, { f: 200, type: "lowpass" });
  },
  telegraph() {
    if (!ctx || !throttle("tele", 250)) return;
    osc("sine", 300, T(), 0.25, 0.04, sfxBus, { slide: 1.5 });
  },
  /* -------------------------------------------------- world & ui */
  pickup(kind) {
    if (!ctx || !throttle("pickup", 60)) return;
    const t = T();
    if (kind === "gold") {
      for (let k = 0; k < 3; k++) osc("triangle", 2400 + k * 300, t + k * 0.04, 0.12, 0.05);
    } else if (kind === "rare") {
      [0, 4, 7, 12].forEach((iv, k) => osc("triangle", mtof(72 + iv), t + k * 0.06, 0.4, 0.06, sfxBus, { verb: true }));
    } else osc("triangle", 900, t, 0.12, 0.06, sfxBus, { slide: 1.4 });
  },
  chest() {
    if (!ctx) return;
    const t = T();
    osc("sawtooth", 140, t, 0.4, 0.04, sfxBus, { slide: 1.6, lp: 700 });
    burst(t + 0.2, 0.2, 0.08, { f: 1500 });
  },
  potion() {
    if (!ctx) return;
    const t = T();
    for (let k = 0; k < 4; k++) osc("sine", 300 + Math.random() * 200, t + k * 0.12, 0.08, 0.06, sfxBus, { slide: 1.6 });
  },
  jingle(kind) {
    if (!ctx) return;
    const t = T();
    const seqs = {
      level: [60, 64, 67, 72, 76],
      quest: [62, 66, 69, 74],
      questDone: [60, 64, 67, 72, 67, 72],
      discover: [67, 71, 74],
      fail: [57, 53, 50],
      victory: [60, 64, 67, 72, 76, 79, 84],
      shrine: [64, 71, 76],
    };
    (seqs[kind] || seqs.quest).forEach((m, i) => pluck(mtof(m), t + i * 0.11, 0.09, sfxBus, 1.6, 4000));
  },
  ui(kind = "click") {
    if (!ctx || !throttle(`ui${kind}`, 40)) return;
    const t = T();
    if (kind === "deny") osc("square", 160, t, 0.12, 0.04, sfxBus, { lp: 900 });
    else if (kind === "open") osc("triangle", 660, t, 0.1, 0.04, sfxBus, { slide: 1.3 });
    else if (kind === "equip") burst(t, 0.1, 0.08, { f: 2600, q: 3 });
    else if (kind === "buy") [0, 7].forEach((iv, k) => osc("triangle", mtof(79 + iv), t + k * 0.05, 0.12, 0.05));
    else osc("triangle", 1200, t, 0.05, 0.03);
  },
  blip() {
    if (!ctx || !throttle("blip", 40)) return;
    osc("triangle", 700 + Math.random() * 120, T(), 0.04, 0.02);
  },
  dispose() {
    try {
      clearInterval(scheduler);
      if (amb) clearInterval(amb.timer);
      ctx?.close();
    } catch {
      /* ignore */
    }
    ctx = null;
    master = musicBus = sfxBus = ambBus = verb = null;
    drone = null;
    amb = null;
    noiseBuf = null;
    scheduler = null;
  },
};
