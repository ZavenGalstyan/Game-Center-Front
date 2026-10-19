/**
 * Doll Repair Workshop — Web Audio synth (original, generated in code; no
 * sample files). Tool sounds (brush swish, sponge squish, spray, cloth rub,
 * needle ticks, paint strokes, comb, dryer hum), UI clicks, repair chimes,
 * customer voices, purchase "cha-ching", a soft workshop ambience (room
 * tone, clock tick, birds) and a gentle music-box background tune.
 * Everything routes through one master gain so the GamePlayer Mute button
 * silences it all; music and effects have their own volume.
 */
let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noise = null;
let muted = false;
let sfxVol = 0.8;
let musicVol = 0.5;
let loops = null;
let musicOn = false;
let musicT = 0;
let step = 0;
let tickT = 0;
let birdT = 4;
const lastAt = {};

const now = () => ctx.currentTime;
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(freq, dur, { type = "sine", vol = 0.2, to = null, at = 0, attack = 0.008, bus = null, filter = null, detune = 0 } = {}) {
  if (!ctx || muted) return;
  const t = now() + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  env(g, t, attack, vol, dur);
  let n = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || "lowpass";
    f.frequency.value = filter.f;
    f.Q.value = filter.q || 0.7;
    n = o.connect(f);
  }
  n.connect(g).connect(bus || sfxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function hiss(dur, { freq = 1200, to = null, q = 1, vol = 0.15, type = "bandpass", at = 0, attack = 0.01, bus = null } = {}) {
  if (!ctx || muted) return;
  const t = now() + at;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  s.connect(f).connect(g).connect(bus || sfxBus);
  s.start(t, Math.random() * 2);
  s.stop(t + dur + 0.05);
}
function loopNoise(type, f0, q = 0.7) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = f0;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  s.connect(f).connect(g).connect(sfxBus);
  s.start(0, Math.random() * 2);
  return { s, f, g };
}
const throttle = (key, ms) => {
  const t = performance.now();
  if (lastAt[key] && t - lastAt[key] < ms) return false;
  lastAt[key] = t;
  return true;
};
const applyGains = () => {
  if (!master) return;
  master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.05);
  sfxBus.gain.setTargetAtTime(sfxVol, now(), 0.05);
  musicBus.gain.setTargetAtTime(musicVol * 0.55, now(), 0.2);
};

// C major pentatonic music box over four soft chords
const CHORDS = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
const SCALE = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5, 1174.7, 1318.5];

export const audio = {
  unlock() {
    if (typeof window === "undefined") return;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      sfxBus = ctx.createGain();
      musicBus = ctx.createGain();
      sfxBus.connect(master);
      musicBus.connect(master);
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loops = { room: loopNoise("lowpass", 240, 0.4), rub: loopNoise("bandpass", 2400, 0.9), hum: loopNoise("bandpass", 420, 2.5) };
      applyGains();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  get ready() {
    return !!ctx && ctx.state === "running";
  },
  setMuted(m) {
    muted = !!m;
    applyGains();
  },
  setVolumes(sfx, music) {
    sfxVol = sfx;
    musicVol = music;
    applyGains();
  },
  setMusic(on) {
    musicOn = !!on;
  },
  /** Called every frame: ambience, music sequencer, continuous tool loops. */
  tick(dt, { rubbing = 0, rubTool = null, dryer = false, inShop = true } = {}) {
    if (!ctx || muted) return;
    const t = now();
    loops.room.g.gain.setTargetAtTime(inShop ? 0.05 : 0, t, 0.5);
    // continuous rubbing texture follows tool speed
    const rubF = { brush: 3800, cloth: 1600, sponge: 900, polish: 2200, comb: 5200, paint: 1200, glue: 700, reroot: 4200, shampoo: 800 }[rubTool] || 2000;
    loops.rub.f.frequency.setTargetAtTime(rubF, t, 0.05);
    loops.rub.g.gain.setTargetAtTime(Math.min(0.12, rubbing * 0.9), t, 0.04);
    loops.hum.g.gain.setTargetAtTime(dryer ? 0.12 : 0, t, 0.1);
    loops.hum.f.frequency.setTargetAtTime(dryer ? 380 + Math.random() * 40 : 420, t, 0.05);
    // clock tick + birds
    tickT -= dt;
    if (tickT <= 0 && inShop) {
      tickT = 1;
      hiss(0.03, { freq: 3200, q: 4, vol: 0.012, bus: sfxBus });
    }
    birdT -= dt;
    if (birdT <= 0 && inShop) {
      birdT = 7 + Math.random() * 10;
      const f = 2200 + Math.random() * 1200;
      for (let k = 0; k < 3; k++) tone(f * (1 + k * 0.08), 0.08, { type: "sine", vol: 0.012, to: f * 1.3, at: k * 0.12 });
    }
    // music box
    if (musicOn) {
      musicT -= dt;
      if (musicT <= 0) {
        musicT = 0.42;
        const bar = Math.floor(step / 8) % 4;
        const beat = step % 8;
        const ch = CHORDS[bar];
        if (beat === 0) for (const f of ch) tone(f / 2, 3.2, { type: "triangle", vol: 0.035, attack: 0.6, bus: musicBus, filter: { f: 900 } });
        const pattern = [0, 2, 4, 2, 5, 4, 2, 1];
        const r = (step * 7919) % 11;
        if (r < 8) {
          const idx = (pattern[beat] + bar) % SCALE.length;
          tone(SCALE[idx], 1.1, { type: "sine", vol: 0.05, attack: 0.004, bus: musicBus });
          tone(SCALE[idx] * 2.005, 0.5, { type: "sine", vol: 0.012, attack: 0.004, bus: musicBus });
        }
        step++;
      }
    }
  },
  play(name, opts = {}) {
    if (!ctx || muted) return;
    switch (name) {
      case "click":
        tone(880, 0.06, { type: "triangle", vol: 0.08 });
        break;
      case "pick":
        tone(520, 0.08, { type: "triangle", vol: 0.1, to: 780 });
        hiss(0.04, { freq: 3000, vol: 0.04 });
        break;
      case "open":
        tone(440, 0.12, { type: "sine", vol: 0.07, to: 660 });
        break;
      case "close":
        tone(660, 0.1, { type: "sine", vol: 0.06, to: 440 });
        break;
      case "found":
        tone(784, 0.12, { type: "triangle", vol: 0.1 });
        tone(1046, 0.18, { type: "triangle", vol: 0.09, at: 0.08 });
        break;
      case "nothing":
        tone(220, 0.15, { type: "triangle", vol: 0.07, to: 180 });
        break;
      case "spray":
        if (throttle("spray", 90)) hiss(0.16, { freq: 5200, q: 0.8, vol: 0.09, type: "highpass", attack: 0.004 });
        break;
      case "squish":
        if (throttle("squish", 160)) {
          hiss(0.14, { freq: 500, to: 250, q: 2, vol: 0.06 });
          tone(140, 0.1, { type: "sine", vol: 0.04, to: 90 });
        }
        break;
      case "brush":
        if (throttle("brush", 120)) hiss(0.12, { freq: 4200, q: 1.2, vol: 0.05 });
        break;
      case "stitch":
        tone(1800, 0.03, { type: "square", vol: 0.03, filter: { f: 3000 } });
        hiss(0.05, { freq: 2600, q: 3, vol: 0.05, at: 0.03 });
        break;
      case "machine":
        for (let k = 0; k < 4; k++) hiss(0.03, { freq: 1500, q: 2, vol: 0.05, at: k * 0.06 });
        break;
      case "snag":
        tone(300, 0.12, { type: "sawtooth", vol: 0.05, to: 200, filter: { f: 900 } });
        hiss(0.08, { freq: 2000, q: 1, vol: 0.06 });
        break;
      case "pop":
        tone(600, 0.08, { type: "sine", vol: 0.1, to: 1200 });
        break;
      case "cure":
        tone(330, 0.6, { type: "sine", vol: 0.05, to: 660 });
        break;
      case "cured":
        tone(988, 0.2, { type: "triangle", vol: 0.08 });
        tone(1318, 0.3, { type: "triangle", vol: 0.07, at: 0.1 });
        break;
      case "detach":
        tone(240, 0.08, { type: "square", vol: 0.05, filter: { f: 1200 } });
        hiss(0.06, { freq: 1800, vol: 0.06 });
        break;
      case "snap":
        tone(700, 0.05, { type: "triangle", vol: 0.12 });
        tone(1400, 0.08, { type: "triangle", vol: 0.08, at: 0.05 });
        break;
      case "wrong":
        tone(196, 0.18, { type: "square", vol: 0.05, filter: { f: 800 } });
        tone(185, 0.22, { type: "square", vol: 0.05, at: 0.12, filter: { f: 800 } });
        break;
      case "task":
        [659, 784, 988].forEach((f, k) => tone(f, 0.25, { type: "triangle", vol: 0.08, at: k * 0.08 }));
        break;
      case "phase":
        [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.35, { type: "triangle", vol: 0.08, at: k * 0.1 }));
        break;
      case "buy":
        tone(1318, 0.08, { type: "square", vol: 0.04, filter: { f: 4000 } });
        tone(1760, 0.25, { type: "triangle", vol: 0.08, at: 0.07 });
        hiss(0.1, { freq: 6000, q: 1, vol: 0.04, at: 0.07 });
        break;
      case "deny":
        tone(160, 0.2, { type: "triangle", vol: 0.08 });
        break;
      case "levelup":
        [523, 659, 784, 1046, 1318].forEach((f, k) => tone(f, 0.4, { type: "triangle", vol: 0.09, at: k * 0.09 }));
        break;
      case "bell":
        tone(1568, 1.2, { type: "sine", vol: 0.1 });
        tone(3136, 0.8, { type: "sine", vol: 0.03 });
        break;
      case "voice": {
        // a customer "speaks": soft blips with a pitch contour by mood
        const base = opts.child ? 520 : opts.senior ? 300 : 400;
        const n = 5;
        for (let k = 0; k < n; k++) tone(base * (1 + Math.sin(k * 1.7) * 0.12), 0.09, { type: "triangle", vol: 0.05, at: k * 0.1, filter: { f: 1600 } });
        break;
      }
      case "happy":
        [523, 659, 784, 1046].forEach((f, k) => tone(f * (opts.child ? 1.3 : 1), 0.16, { type: "triangle", vol: 0.07, at: k * 0.07 }));
        break;
      case "okay":
        tone(440, 0.2, { type: "triangle", vol: 0.06 });
        tone(494, 0.25, { type: "triangle", vol: 0.06, at: 0.15 });
        break;
      case "sad":
        tone(392, 0.25, { type: "triangle", vol: 0.06, to: 300 });
        tone(330, 0.4, { type: "triangle", vol: 0.06, at: 0.2, to: 250 });
        break;
      case "reveal":
        hiss(1.2, { freq: 600, to: 5000, q: 0.8, vol: 0.05, attack: 0.3 });
        [784, 988, 1175, 1568].forEach((f, k) => tone(f, 0.5, { type: "sine", vol: 0.06, at: 0.4 + k * 0.12 }));
        break;
      case "star":
        tone(1046 * (1 + (opts.i || 0) * 0.12), 0.3, { type: "triangle", vol: 0.08 });
        break;
      default:
        break;
    }
  },
  dispose() {
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    master = sfxBus = musicBus = null;
    loops = null;
  },
};
