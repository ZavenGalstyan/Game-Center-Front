/**
 * Metro Rush — WebAudio synth: every sound and both music loops are
 * generated, no audio files.
 *
 * Buses: sfx / music → master → compressor → speakers. The Game Center Mute
 * drives master gain only (setMuted), so nothing slips past it; settings
 * volumes drive the buses. stopMusic() runs on pause, results and unmount.
 */
let ctx = null;
let master = null;
let sfxBus = null;
let musBus = null;
let noiseBuf = null;
let muted = false;
let vol = { music: 0.55, sfx: 0.9 };
let musicTimer = null;
let musicMode = null;
let musicKey = { root: 57, scale: "major" };
let step = 0;
let nextT = 0;
const last = {};

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3.5;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    musBus = ctx.createGain();
    sfxBus.connect(master);
    musBus.connect(master);
    apply();
  }
  return ctx;
}
function apply() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(muted ? 0 : 0.9, t);
  sfxBus.gain.setValueAtTime(vol.sfx, t);
  musBus.gain.setValueAtTime(vol.music * 0.42, t);
}
function noise() {
  if (!noiseBuf) {
    const n = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
const live = () => ctx && ctx.state === "running" && !muted;
/** rate-limit identical sounds */
const gate = (k, ms) => {
  const now = performance.now();
  if (last[k] && now - last[k] < ms) return false;
  last[k] = now;
  return true;
};

function tone({ f = 440, f2 = null, type = "sine", t = 0, dur = 0.15, g = 0.25, bus = sfxBus, attack = 0.005, q = null, filter = null }) {
  const c = ctx;
  const t0 = c.currentTime + t;
  const o = c.createOscillator();
  const gn = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.linearRampToValueAtTime(g, t0 + attack);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (filter) {
    const fl = c.createBiquadFilter();
    fl.type = filter;
    fl.frequency.value = q || 1200;
    node.connect(fl);
    node = fl;
  }
  node.connect(gn).connect(bus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function hiss({ t = 0, dur = 0.2, g = 0.2, f = 1800, f2 = null, type = "bandpass", q = 1, bus = sfxBus }) {
  const c = ctx;
  const t0 = c.currentTime + t;
  const s = c.createBufferSource();
  s.buffer = noise();
  s.loop = true;
  const fl = c.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t0);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  fl.Q.value = q;
  const gn = c.createGain();
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.linearRampToValueAtTime(g, t0 + 0.01);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl).connect(gn).connect(bus);
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + dur + 0.05);
}

let coinPitch = 0;
let coinT = 0;

export const sound = {
  unlock() {
    const c = ac();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  },
  setMuted(m) {
    muted = !!m;
    apply();
  },
  setVolumes(v) {
    vol = { ...vol, ...v };
    apply();
  },
  ui() {
    if (!live() || !gate("ui", 40)) return;
    tone({ f: 660, f2: 880, type: "triangle", dur: 0.08, g: 0.12 });
  },
  back() {
    if (!live() || !gate("ui", 40)) return;
    tone({ f: 520, f2: 360, type: "triangle", dur: 0.09, g: 0.11 });
  },
  deny() {
    if (!live() || !gate("deny", 120)) return;
    tone({ f: 180, type: "square", dur: 0.16, g: 0.08, filter: "lowpass", q: 900 });
    tone({ f: 150, type: "square", t: 0.09, dur: 0.18, g: 0.08, filter: "lowpass", q: 900 });
  },
  buy() {
    if (!live()) return;
    [0, 4, 7, 12].forEach((s, i) => tone({ f: hz(72 + s), type: "triangle", t: i * 0.06, dur: 0.22, g: 0.13 }));
    hiss({ t: 0.18, dur: 0.3, g: 0.05, f: 6000, type: "highpass" });
  },
  coin() {
    if (!live() || !gate("coin", 28)) return;
    const now = performance.now();
    coinPitch = now - coinT < 260 ? Math.min(coinPitch + 1, 9) : 0;
    coinT = now;
    const m = 84 + [0, 2, 4, 5, 7, 9, 11, 12, 14, 16][coinPitch];
    tone({ f: hz(m), type: "square", dur: 0.07, g: 0.05, filter: "lowpass", q: 5000 });
    tone({ f: hz(m + 7), type: "sine", t: 0.045, dur: 0.16, g: 0.09 });
  },
  jump() {
    if (!live() || !gate("jump", 60)) return;
    tone({ f: 260, f2: 620, type: "triangle", dur: 0.16, g: 0.12 });
    hiss({ dur: 0.18, g: 0.06, f: 900, f2: 2600 });
  },
  land(hard) {
    if (!live() || !gate("land", 90)) return;
    tone({ f: hard ? 120 : 150, f2: 60, type: "sine", dur: 0.12, g: hard ? 0.22 : 0.12 });
    hiss({ dur: 0.08, g: 0.05, f: 500, type: "lowpass" });
  },
  slide() {
    if (!live() || !gate("slide", 80)) return;
    hiss({ dur: 0.38, g: 0.12, f: 2400, f2: 700, q: 0.8 });
  },
  lane() {
    if (!live() || !gate("lane", 50)) return;
    hiss({ dur: 0.12, g: 0.06, f: 1400, f2: 3200, q: 1.4 });
  },
  bump() {
    if (!live() || !gate("bump", 150)) return;
    tone({ f: 110, f2: 70, type: "square", dur: 0.14, g: 0.12, filter: "lowpass", q: 600 });
    hiss({ dur: 0.1, g: 0.1, f: 800, type: "lowpass" });
  },
  crash() {
    if (!live()) return;
    tone({ f: 90, f2: 35, type: "sawtooth", dur: 0.6, g: 0.22, filter: "lowpass", q: 400 });
    hiss({ dur: 0.7, g: 0.3, f: 1200, f2: 200, type: "lowpass" });
    hiss({ t: 0.05, dur: 0.35, g: 0.12, f: 5000, type: "highpass" });
  },
  smash() {
    if (!live() || !gate("smash", 60)) return;
    hiss({ dur: 0.28, g: 0.2, f: 1600, f2: 400, type: "lowpass" });
    tone({ f: 200, f2: 80, type: "triangle", dur: 0.18, g: 0.12 });
  },
  power(kind) {
    if (!live()) return;
    const seq = kind === "boost" ? [0, 7, 12, 19] : kind === "shield" ? [0, 5, 9, 12] : kind === "board" ? [0, 4, 9, 14] : [0, 4, 7, 12];
    seq.forEach((s, i) => tone({ f: hz(67 + s), type: "triangle", t: i * 0.05, dur: 0.2, g: 0.12 }));
    tone({ f: hz(55), f2: hz(79), type: "sawtooth", dur: 0.35, g: 0.05, filter: "lowpass", q: 2200 });
  },
  powerEnd() {
    if (!live() || !gate("pend", 300)) return;
    tone({ f: hz(76), f2: hz(64), type: "triangle", dur: 0.25, g: 0.08 });
  },
  boardBreak() {
    if (!live()) return;
    hiss({ dur: 0.45, g: 0.22, f: 3000, f2: 300 });
    tone({ f: 700, f2: 160, type: "square", dur: 0.3, g: 0.07, filter: "lowpass", q: 1800 });
  },
  boost() {
    if (!live()) return;
    hiss({ dur: 1.2, g: 0.16, f: 400, f2: 3000, q: 0.6 });
    tone({ f: 80, f2: 320, type: "sawtooth", dur: 0.9, g: 0.08, filter: "lowpass", q: 1500 });
  },
  horn() {
    if (!live() || !gate("horn", 900)) return;
    for (const f of [hz(58), hz(62)]) tone({ f, type: "sawtooth", dur: 0.7, g: 0.045, attack: 0.04, filter: "lowpass", q: 1400 });
  },
  whoosh() {
    if (!live() || !gate("whoosh", 200)) return;
    hiss({ dur: 0.5, g: 0.1, f: 500, f2: 1800, q: 0.7 });
  },
  mission() {
    if (!live()) return;
    [0, 4, 7, 12, 16].forEach((s, i) => tone({ f: hz(72 + s), type: "square", t: i * 0.07, dur: 0.18, g: 0.05, filter: "lowpass", q: 3500 }));
  },
  record() {
    if (!live()) return;
    [0, 7, 12, 16, 19, 24].forEach((s, i) => tone({ f: hz(67 + s), type: "triangle", t: i * 0.08, dur: 0.3, g: 0.12 }));
  },
  countdown(go) {
    if (!live()) return;
    tone({ f: go ? 880 : 520, type: "square", dur: go ? 0.3 : 0.12, g: 0.07, filter: "lowpass", q: 3000 });
  },

  /* -------------------------------------------------------------- music */
  setKey(k) {
    if (k) musicKey = k;
  },
  music(mode) {
    if (mode === musicMode) return;
    this.stopMusic();
    if (!mode) return;
    const c = ac();
    if (!c) return;
    musicMode = mode;
    step = 0;
    nextT = c.currentTime + 0.08;
    musicTimer = setInterval(schedule, 40);
  },
  stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    musicMode = null;
  },
  dispose() {
    this.stopMusic();
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    master = sfxBus = musBus = noiseBuf = null;
  },
  inspect: () => ({ state: ctx?.state, muted, vol, musicMode, master: master?.gain.value }),
};

/* progression I–V–vi–IV (major) or i–VI–III–VII (minor), 16 steps a bar */
function schedule() {
  if (!ctx || !musicMode) return;
  if (ctx.state !== "running") return;
  const bpm = musicMode === "game" ? 128 : 96;
  const sp = 60 / bpm / 4;
  const sc = SCALES[musicKey.scale] || SCALES.major;
  const prog = musicKey.scale === "major" ? [0, 4, 5, 3] : [0, 5, 2, 6];
  while (nextT < ctx.currentTime + 0.14) {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const deg = prog[bar];
    const note = (d, oct = 0) => musicKey.root + sc[((d % 7) + 7) % 7] + 12 * (oct + Math.floor(d / 7));
    const t = nextT - ctx.currentTime;
    const game = musicMode === "game";
    // bass
    if (game ? s % 2 === 0 : s % 4 === 0) tone({ f: hz(note(deg, -2) + (game && s % 8 === 6 ? 12 : 0)), type: "triangle", t, dur: sp * 1.8, g: 0.16, bus: musBus });
    // drums
    if (game) {
      if (s % 4 === 0) tone({ f: 140, f2: 45, type: "sine", t, dur: 0.16, g: 0.3, bus: musBus });
      if (s % 8 === 4) hiss({ t, dur: 0.14, g: 0.11, f: 1800, type: "bandpass", q: 0.7, bus: musBus });
      if (s % 2 === 1) hiss({ t, dur: 0.04, g: 0.04, f: 8000, type: "highpass", bus: musBus });
    } else if (s % 8 === 4) hiss({ t, dur: 0.06, g: 0.025, f: 7000, type: "highpass", bus: musBus });
    // chord stabs / pads
    if (game ? s === 0 || s === 6 || s === 10 : s === 0) {
      for (const d of [0, 2, 4]) tone({ f: hz(note(deg + d, 0)), type: game ? "square" : "triangle", t, dur: game ? sp * 2.2 : sp * 14, g: game ? 0.025 : 0.035, bus: musBus, filter: "lowpass", q: game ? 2400 : 1400, attack: game ? 0.005 : 0.25 });
    }
    // lead arpeggio
    const arp = [0, 2, 4, 7, 4, 2, 4, 9];
    if (game ? s % 2 === 0 && bar !== 3 : s % 4 === 2) tone({ f: hz(note(deg + arp[(s / 2) % 8 | 0], 1)), type: "triangle", t, dur: sp * 1.4, g: game ? 0.05 : 0.04, bus: musBus });
    nextT += sp;
    step++;
  }
}
