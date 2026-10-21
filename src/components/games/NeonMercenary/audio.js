/**
 * Procedural WebAudio sound for Neon Mercenary — no audio files.
 *
 *  music     synthwave pads + bass + arpeggio; an intensity value (0 ambient,
 *            1 combat, 2 boss) fades extra layers in and changes the pattern
 *  ambience  rain (filtered noise) + low city hum
 *  sfx       weapons (per type), reloads, impacts, footsteps, enemies, robots,
 *            cyberware, pickups, UI, mission jingles, dialogue blips
 *
 * The AudioContext is created on the first user gesture (unlock()); `muted`
 * from the Game Center silences the master bus.
 */
let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let ambBus = null;
let noiseBuf = null;
let muted = false;
let vol = { master: 0.8, music: 0.55, sfx: 0.8 };
let musicNodes = null;
let ambNodes = null;
let intensity = 0;
let targetIntensity = 0;
let district = "market";
let scheduler = null;
let nextT = 0;
let step = 0;
const lastPlay = {};

const now = () => ctx.currentTime;
function noise() {
  if (noiseBuf) return noiseBuf;
  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function env(g, t, a, peak, d, end = 0.0001) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(end, t + a + d);
}
function osc(type, f, t, dur, peak, dest, { a = 0.005, slide = 0, detune = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
  o.detune.value = detune;
  env(g, t, a, peak, dur);
  o.connect(g).connect(dest || sfxBus);
  o.start(t);
  o.stop(t + a + dur + 0.05);
  return o;
}
function burst(t, dur, peak, { type = "bandpass", f = 1200, q = 1, dest, slide = 0 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noise();
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (slide) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.003, peak, dur);
  s.connect(fl).connect(g).connect(dest || sfxBus);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}
const throttle = (k, ms) => {
  const t = performance.now();
  if (lastPlay[k] && t - lastPlay[k] < ms) return false;
  lastPlay[k] = t;
  return true;
};

/* ------------------------------------------------------------ music */
const SCALES = {
  market: [0, 3, 5, 7, 10],
  industrial: [0, 1, 5, 7, 8],
  corporate: [0, 2, 3, 7, 9],
};
const ROOTS = { market: 45, industrial: 40, corporate: 47 };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function startMusic() {
  if (musicNodes) return;
  const pad = ctx.createGain();
  pad.gain.value = 0.0001;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  lp.Q.value = 0.7;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.375;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  delay.connect(fb).connect(delay);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  pad.connect(lp).connect(musicBus);
  lp.connect(delay);
  delay.connect(wet).connect(musicBus);
  const layers = { pad, lp, delay, combat: ctx.createGain(), boss: ctx.createGain() };
  layers.combat.gain.value = 0.0001;
  layers.boss.gain.value = 0.0001;
  layers.combat.connect(musicBus);
  layers.boss.connect(musicBus);
  // sustained pad voices
  const voices = [];
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const o2 = ctx.createOscillator();
    o2.type = "sawtooth";
    o2.detune.value = 9;
    const g = ctx.createGain();
    g.gain.value = 0.06;
    o.connect(g);
    o2.connect(g);
    g.connect(pad);
    o.start();
    o2.start();
    voices.push({ o, o2 });
  }
  layers.voices = voices;
  musicNodes = layers;
  pad.gain.setTargetAtTime(0.5, now(), 2);
  nextT = now() + 0.1;
  step = 0;
  scheduler = setInterval(tick, 60);
}
function chordFor(bar) {
  const sc = SCALES[district] || SCALES.market;
  const root = ROOTS[district] || 45;
  const prog = [0, 3, 1, 4];
  const deg = prog[bar % 4];
  return [0, 2, 4].map((k) => root + sc[(deg + k) % sc.length] + 12 * Math.floor((deg + k) / sc.length));
}
function tick() {
  if (!ctx || !musicNodes) return;
  intensity += (targetIntensity - intensity) * 0.08;
  const L = musicNodes;
  L.combat.gain.setTargetAtTime(Math.min(1, intensity) * 0.5 + 0.0001, now(), 0.4);
  L.boss.gain.setTargetAtTime(Math.max(0, intensity - 1) * 0.55 + 0.0001, now(), 0.4);
  L.lp.frequency.setTargetAtTime(700 + intensity * 900, now(), 0.5);
  const bpm = 84 + intensity * 22;
  const s16 = 60 / bpm / 4;
  while (nextT < now() + 0.25) {
    const bar = Math.floor(step / 16);
    const st = step % 16;
    const ch = chordFor(bar);
    if (st === 0) ch.forEach((m, i) => {
      L.voices[i].o.frequency.setTargetAtTime(mtof(m), nextT, 0.3);
      L.voices[i].o2.frequency.setTargetAtTime(mtof(m), nextT, 0.3);
    });
    // arpeggio (always, quiet)
    if (st % 2 === 0) {
      const m = ch[(st / 2) % 3] + 12 + (st % 8 === 6 ? 12 : 0);
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = mtof(m);
      const g = ctx.createGain();
      env(g, nextT, 0.004, 0.035, s16 * 1.6);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 2200;
      o.connect(f).connect(g).connect(L.lp);
      o.start(nextT);
      o.stop(nextT + s16 * 2);
    }
    // combat layer: bass + drums
    if (intensity > 0.05) {
      if (st % 4 === 0 || (st === 14 && intensity > 0.6)) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = mtof(ch[0] - 12);
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.setValueAtTime(900, nextT);
        f.frequency.exponentialRampToValueAtTime(120, nextT + s16 * 3);
        const g = ctx.createGain();
        env(g, nextT, 0.005, 0.22, s16 * 3);
        o.connect(f).connect(g).connect(L.combat);
        o.start(nextT);
        o.stop(nextT + s16 * 3.2);
      }
      if (st === 0 || st === 8 || (intensity > 1 && (st === 6 || st === 10))) {
        osc("sine", 120, nextT, 0.22, 0.5, L.combat, { slide: 0.35 });
      }
      if (st === 4 || st === 12) burst(nextT, 0.16, 0.22, { type: "bandpass", f: 1800, q: 0.8, dest: L.combat });
      if (st % 2 === 1) burst(nextT, 0.04, 0.06, { type: "highpass", f: 7000, dest: L.combat });
    }
    // boss layer: driving 16ths
    if (intensity > 1.05) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = mtof(ch[st % 3] - (st % 4 === 0 ? 12 : 0));
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1400;
      f.Q.value = 6;
      const g = ctx.createGain();
      env(g, nextT, 0.003, 0.08, s16 * 0.8);
      o.connect(f).connect(g).connect(L.boss);
      o.start(nextT);
      o.stop(nextT + s16);
    }
    step++;
    nextT += s16;
  }
}

/* ------------------------------------------------------------ ambience */
function startAmbience() {
  if (ambNodes) return;
  const s = ctx.createBufferSource();
  s.buffer = noise();
  s.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000;
  const rainG = ctx.createGain();
  rainG.gain.value = 0.0001;
  s.connect(hp).connect(lp).connect(rainG).connect(ambBus);
  s.start();
  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 55;
  const hf = ctx.createBiquadFilter();
  hf.type = "lowpass";
  hf.frequency.value = 160;
  const humG = ctx.createGain();
  humG.gain.value = 0.0001;
  hum.connect(hf).connect(humG).connect(ambBus);
  hum.start();
  ambNodes = { rainG, humG, lp };
}

/* ------------------------------------------------------------ public */
export const audio = {
  unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();
      ambBus = ctx.createGain();
      musicBus.connect(master);
      sfxBus.connect(master);
      ambBus.connect(master);
      this.applyVolumes();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  get ready() {
    return !!ctx;
  },
  applyVolumes() {
    if (!ctx) return;
    master.gain.setTargetAtTime(muted ? 0 : vol.master, now(), 0.05);
    musicBus.gain.setTargetAtTime(vol.music, now(), 0.1);
    sfxBus.gain.setTargetAtTime(vol.sfx, now(), 0.05);
    ambBus.gain.setTargetAtTime(vol.sfx * 0.8, now(), 0.1);
  },
  setMuted(m) {
    muted = !!m;
    this.applyVolumes();
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    this.applyVolumes();
  },
  /** Start / adapt background layers. mode: menu | play */
  scene(mode, dist, outdoors = true) {
    if (!ctx) return;
    district = dist || district;
    startMusic();
    startAmbience();
    ambNodes.rainG.gain.setTargetAtTime(outdoors ? 0.18 : 0.03, now(), 0.6);
    ambNodes.lp.frequency.setTargetAtTime(outdoors ? 7000 : 1400, now(), 0.6);
    ambNodes.humG.gain.setTargetAtTime(mode === "menu" ? 0.02 : 0.05, now(), 1);
  },
  setIntensity(v) {
    targetIntensity = v;
  },
  silence() {
    if (!ctx) return;
    targetIntensity = 0;
  },

  /* ---------------------------------------------------------- sfx */
  shot(kind) {
    if (!ctx) return;
    const t = now();
    switch (kind) {
      case "pistol":
        burst(t, 0.12, 0.7, { type: "bandpass", f: 1600, q: 0.9 });
        osc("square", 180, t, 0.08, 0.25, null, { slide: 0.4 });
        break;
      case "heavy":
      case "heavyPistol":
        burst(t, 0.28, 0.9, { type: "lowpass", f: 2200, slide: 0.3 });
        osc("sine", 90, t, 0.22, 0.7, null, { slide: 0.4 });
        break;
      case "smg":
        burst(t, 0.07, 0.5, { type: "bandpass", f: 2200, q: 1.2 });
        osc("square", 240, t, 0.05, 0.15, null, { slide: 0.5 });
        break;
      case "shotgun":
        burst(t, 0.42, 1, { type: "lowpass", f: 3000, slide: 0.15 });
        osc("sine", 70, t, 0.3, 0.9, null, { slide: 0.5 });
        break;
      case "ar":
        burst(t, 0.11, 0.65, { type: "bandpass", f: 1300, q: 1 });
        osc("sawtooth", 130, t, 0.08, 0.25, null, { slide: 0.5 });
        break;
      case "energy":
        osc("sawtooth", 1400, t, 0.22, 0.25, null, { slide: 0.15 });
        osc("sine", 700, t, 0.3, 0.3, null, { slide: 0.3 });
        burst(t, 0.1, 0.2, { type: "highpass", f: 4000 });
        break;
      case "blade":
        burst(t, 0.18, 0.35, { type: "bandpass", f: 3500, q: 3, slide: 0.4 });
        osc("sine", 900, t, 0.15, 0.12, null, { slide: 1.8 });
        break;
      case "punch":
        burst(t, 0.12, 0.3, { type: "bandpass", f: 600, q: 1.4, slide: 0.5 });
        break;
    }
  },
  enemyShot(robot, energy) {
    if (!ctx || !throttle("es", 45)) return;
    const t = now();
    if (energy) osc("sawtooth", 900, t, 0.18, 0.12, null, { slide: 0.25 });
    else if (robot) {
      burst(t, 0.07, 0.25, { type: "bandpass", f: 2600, q: 2 });
      osc("square", 320, t, 0.05, 0.08, null, { slide: 0.6 });
    } else burst(t, 0.1, 0.32, { type: "bandpass", f: 1100, q: 1 });
  },
  reload(phase = 0) {
    if (!ctx) return;
    const t = now();
    burst(t, 0.05, 0.25, { type: "bandpass", f: 3200, q: 4 });
    burst(t + 0.35, 0.06, 0.3, { type: "bandpass", f: 2400, q: 4 });
    if (phase) burst(t + 0.7, 0.07, 0.35, { type: "bandpass", f: 1800, q: 5 });
  },
  dry() {
    if (!ctx || !throttle("dry", 150)) return;
    burst(now(), 0.03, 0.2, { type: "bandpass", f: 4000, q: 6 });
  },
  impact(kind) {
    if (!ctx || !throttle("imp", 30)) return;
    const t = now();
    if (kind === "flesh") burst(t, 0.1, 0.35, { type: "lowpass", f: 900 });
    else if (kind === "metal") {
      osc("triangle", 1800 + Math.random() * 900, t, 0.12, 0.08);
      burst(t, 0.05, 0.15, { type: "highpass", f: 3000 });
    } else burst(t, 0.06, 0.12, { type: "bandpass", f: 2600, q: 2 });
  },
  hitMarker(crit) {
    if (!ctx || !throttle("hm", 40)) return;
    osc("sine", crit ? 1800 : 1200, now(), 0.05, crit ? 0.18 : 0.1);
  },
  hurt() {
    if (!ctx || !throttle("hurt", 120)) return;
    const t = now();
    burst(t, 0.18, 0.4, { type: "lowpass", f: 500 });
    osc("sine", 160, t, 0.15, 0.2, null, { slide: 0.6 });
  },
  whizz() {
    if (!ctx || !throttle("wz", 90)) return;
    burst(now(), 0.12, 0.12, { type: "bandpass", f: 5000, q: 6, slide: 0.4 });
  },
  step(run) {
    if (!ctx) return;
    burst(now(), 0.05, run ? 0.12 : 0.07, { type: "bandpass", f: 600 + Math.random() * 300, q: 1.2 });
    burst(now() + 0.01, 0.06, 0.04, { type: "highpass", f: 5000 });
  },
  jump() {
    if (!ctx) return;
    burst(now(), 0.08, 0.12, { type: "lowpass", f: 700 });
  },
  land(hard) {
    if (!ctx) return;
    burst(now(), 0.12, hard ? 0.35 : 0.18, { type: "lowpass", f: 500 });
  },
  dodge() {
    if (!ctx) return;
    burst(now(), 0.25, 0.2, { type: "bandpass", f: 900, q: 0.8, slide: 0.4 });
  },
  alert(robot) {
    if (!ctx || !throttle("al", 250)) return;
    const t = now();
    if (robot) {
      osc("square", 880, t, 0.08, 0.12);
      osc("square", 1320, t + 0.1, 0.1, 0.12);
    } else osc("sawtooth", 220, t, 0.18, 0.1, null, { slide: 1.4 });
  },
  suspicious() {
    if (!ctx || !throttle("sus", 400)) return;
    osc("sine", 660, now(), 0.15, 0.06, null, { slide: 1.2 });
  },
  death(robot) {
    if (!ctx) return;
    const t = now();
    if (robot) {
      burst(t, 0.5, 0.6, { type: "lowpass", f: 2400, slide: 0.1 });
      osc("sawtooth", 420, t, 0.4, 0.18, null, { slide: 0.2 });
    } else burst(t, 0.3, 0.3, { type: "lowpass", f: 700, slide: 0.5 });
  },
  ability(effect) {
    if (!ctx) return;
    const t = now();
    if (effect === "emp") {
      osc("sine", 60, t, 0.8, 0.8, null, { slide: 0.5 });
      burst(t, 0.6, 0.5, { type: "lowpass", f: 4000, slide: 0.1 });
    } else {
      osc("sawtooth", 200, t, 0.35, 0.18, null, { slide: 6 });
      osc("sine", 400, t + 0.05, 0.4, 0.15, null, { slide: 3 });
    }
  },
  pickup(kind) {
    if (!ctx || !throttle(`pk${kind}`, 60)) return;
    const t = now();
    if (kind === "credits") {
      osc("triangle", 1500, t, 0.06, 0.1);
      osc("triangle", 2000, t + 0.05, 0.08, 0.1);
    } else if (kind === "quest") {
      [660, 880, 1320].forEach((f, i) => osc("triangle", f, t + i * 0.07, 0.15, 0.14));
    } else osc("triangle", 900, t, 0.08, 0.12);
  },
  ui(kind = "click") {
    if (!ctx) return;
    const t = now();
    if (kind === "click") osc("triangle", 1100, t, 0.04, 0.08);
    else if (kind === "hover") osc("sine", 1600, t, 0.02, 0.025);
    else if (kind === "buy") [880, 1320].forEach((f, i) => osc("triangle", f, t + i * 0.06, 0.08, 0.12));
    else if (kind === "deny") osc("square", 160, t, 0.15, 0.1);
    else if (kind === "open") osc("sine", 500, t, 0.12, 0.08, null, { slide: 2 });
  },
  blip() {
    if (!ctx || !throttle("blip", 50)) return;
    osc("square", 700 + Math.random() * 200, now(), 0.025, 0.035);
  },
  jingle(kind) {
    if (!ctx) return;
    const t = now();
    const seqs = {
      complete: [523, 659, 784, 1046],
      level: [392, 523, 659, 784, 1046],
      fail: [330, 262, 196],
      boss: [196, 233, 196, 147],
      victory: [523, 659, 784, 659, 784, 1046, 1318],
    };
    (seqs[kind] || seqs.complete).forEach((f, i) => {
      osc("square", f, t + i * 0.11, 0.18, 0.09);
      osc("sine", f / 2, t + i * 0.11, 0.25, 0.08);
    });
  },
  hack(ok) {
    if (!ctx) return;
    const t = now();
    if (ok === true) [700, 1050, 1400].forEach((f, i) => osc("square", f, t + i * 0.05, 0.06, 0.06));
    else if (ok === false) osc("sawtooth", 200, t, 0.3, 0.12, null, { slide: 0.5 });
    else osc("square", 1200 + Math.random() * 400, t, 0.03, 0.04);
  },
  telegraph() {
    if (!ctx || !throttle("tg", 200)) return;
    osc("sawtooth", 300, now(), 0.35, 0.12, null, { slide: 2.2 });
  },
  dispose() {
    clearInterval(scheduler);
    scheduler = null;
    try {
      ctx?.close();
    } catch {
      /* ignore */
    }
    ctx = null;
    musicNodes = null;
    ambNodes = null;
    noiseBuf = null;
  },
};
