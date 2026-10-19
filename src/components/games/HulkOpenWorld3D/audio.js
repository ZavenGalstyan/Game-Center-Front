/**
 * Hulk: Open World 3D — Web Audio synth (no sample files).
 *
 * Every sound routes through one master gain: `setMuted` (GamePlayer's Mute
 * button) silences footsteps, punches, explosions, weapons, the rage roar and
 * the music at once. The AudioContext is created on the first user gesture
 * (`unlock`) and closed by `dispose` on unmount. One-shots take a distance so
 * far-away fights sound quieter and muffled. Music: a procedural combat /
 * boss loop scheduled ahead on the audio clock.
 */
let ctx = null;
let master = null;
let sfx = null;
let musicBus = null;
let noise = null;
let muted = false;
let volume = 0.8;
let musicOn = true;
let chargeVoice = null;
let music = null;

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function osc(freq, dur, { type = "sine", vol = 0.2, to = null, at = 0, attack = 0.005, lp = null, out = null } = {}) {
  if (!ctx || vol <= 0.002) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, attack, vol, dur);
  let n = o;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    n = o.connect(f);
  }
  n.connect(g).connect(out || sfx);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function hiss(dur, { freq = 900, to = null, q = 1, vol = 0.2, type = "bandpass", at = 0, attack = 0.004, rate = 1, out = null } = {}) {
  if (!ctx || vol <= 0.002) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  src.connect(f).connect(g).connect(out || sfx);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}
const att = (d) => Math.max(0, Math.min(1, 1 / (1 + (d || 0) / 40)));
const muffle = (d) => Math.max(400, 9000 - (d || 0) * 40);
const R = Math.random;

/* ---------------------------------------------------------------- music */
function startMusic(kind) {
  if (!ctx) return;
  if (music && music.kind === kind) return;
  stopMusic();
  if (!musicOn || kind === "none") return;
  music = { kind, next: ctx.currentTime + 0.1, step: 0, timer: null };
  const bpm = kind === "boss" ? 138 : 118;
  const st = 60 / bpm / 2; // eighth notes
  const ROOT = kind === "boss" ? 41.2 : 49; // E1 / G1
  const scale = kind === "boss" ? [0, 0, 3, 0, 5, 0, 6, 3] : [0, 0, 7, 0, 5, 0, 3, 5];
  const tick = () => {
    if (!ctx || !music) return;
    while (music.next < ctx.currentTime + 0.25) {
      const t0 = music.next - ctx.currentTime;
      const s = music.step;
      const n = scale[s % 8];
      const f = ROOT * Math.pow(2, n / 12);
      // driving bass
      osc(f, st * 0.9, { type: "sawtooth", vol: 0.09, at: t0, lp: 420, out: musicBus });
      osc(f * 2, st * 0.6, { type: "square", vol: 0.025, at: t0, lp: 900, out: musicBus });
      // drums: kick on quarters, snare on 2 & 4, hats on eighths
      if (s % 2 === 0) osc(120, 0.18, { vol: 0.22, to: 42, at: t0, out: musicBus });
      if (s % 4 === 2) hiss(0.16, { freq: 1800, q: 0.7, vol: 0.12, at: t0, out: musicBus });
      hiss(0.04, { freq: 7000, q: 1, vol: 0.035, type: "highpass", at: t0, out: musicBus });
      // boss: ominous brass stabs every bar
      if (kind === "boss" && s % 16 === 0) {
        for (const k of [0, 3, 7]) osc(ROOT * 4 * Math.pow(2, k / 12), st * 6, { type: "sawtooth", vol: 0.03, at: t0, attack: 0.05, lp: 1400, out: musicBus });
      }
      music.step++;
      music.next += st;
    }
  };
  tick();
  music.timer = setInterval(tick, 90);
}
function stopMusic() {
  if (music && music.timer) clearInterval(music.timer);
  music = null;
}

export const audio = {
  unlock() {
    if (!ctx) {
      const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      try {
        ctx = new AC();
      } catch {
        ctx = null;
        return;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.gain.value = 0.9;
      sfx.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(master);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = !!m;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03);
  },
  setVolume(v) {
    volume = v;
    if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  },
  setMusic(on) {
    musicOn = !!on;
    if (!musicOn) stopMusic();
  },
  music(kind) {
    startMusic(kind);
  },
  silence() {
    stopMusic();
    this.chargeStop();
  },
  /* ------------------------------------------------ hero */
  step(heavy = 1) {
    osc(70 + R() * 15, 0.18, { vol: 0.16 * heavy, to: 40 });
    hiss(0.12, { freq: 300, q: 0.8, vol: 0.06 * heavy, type: "lowpass" });
  },
  chargeStart() {
    if (!ctx || chargeVoice) return;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = "sawtooth";
    o2.type = "sine";
    o.frequency.value = 55;
    o2.frequency.value = 110;
    f.type = "lowpass";
    f.frequency.value = 300;
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.09, ctx.currentTime, 0.1);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(sfx);
    o.start();
    o2.start();
    chargeVoice = { o, o2, g, f };
  },
  charge(k) {
    if (!chargeVoice || !ctx) return;
    const t = ctx.currentTime;
    chargeVoice.o.frequency.setTargetAtTime(55 + k * 90, t, 0.05);
    chargeVoice.o2.frequency.setTargetAtTime(110 + k * 220, t, 0.05);
    chargeVoice.f.frequency.setTargetAtTime(300 + k * 1600, t, 0.05);
    chargeVoice.g.gain.setTargetAtTime(0.06 + k * 0.08, t, 0.05);
  },
  chargeStop() {
    if (!chargeVoice || !ctx) return;
    const v = chargeVoice;
    chargeVoice = null;
    v.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
    v.o.stop(ctx.currentTime + 0.2);
    v.o2.stop(ctx.currentTime + 0.2);
  },
  jump() {
    hiss(0.25, { freq: 400, to: 1400, q: 0.8, vol: 0.12 });
    osc(90, 0.2, { vol: 0.15, to: 50 });
  },
  leap(k) {
    hiss(0.7, { freq: 300, to: 2400, q: 0.6, vol: 0.2 + k * 0.15 });
    osc(60, 0.5, { vol: 0.35, to: 28 });
    osc(140, 0.3, { type: "triangle", vol: 0.12, to: 60 });
  },
  land(impact) {
    const k = Math.min(1, impact / 30);
    osc(60, 0.3 + k * 0.4, { vol: 0.2 + k * 0.3, to: 30 });
    hiss(0.3 + k * 0.4, { freq: 500, to: 120, q: 0.6, vol: 0.08 + k * 0.2, type: "lowpass" });
  },
  landShock() {
    osc(48, 1.2, { vol: 0.6, to: 22 });
    hiss(1.1, { freq: 900, to: 90, q: 0.5, vol: 0.35, type: "lowpass" });
    hiss(0.5, { freq: 2600, to: 400, q: 0.6, vol: 0.12 });
  },
  whoosh(big = false) {
    hiss(big ? 0.3 : 0.16, { freq: 600, to: big ? 2200 : 1600, q: 1.2, vol: big ? 0.16 : 0.09 });
  },
  punch(kind) {
    const big = kind !== "jab1" && kind !== "jab2";
    osc(big ? 85 : 120, big ? 0.3 : 0.16, { vol: big ? 0.45 : 0.3, to: 40 });
    hiss(big ? 0.22 : 0.1, { freq: 1600, to: 400, q: 0.9, vol: big ? 0.3 : 0.2 });
    if (kind === "ragePunch") {
      osc(40, 0.9, { vol: 0.5, to: 20 });
      hiss(0.7, { freq: 800, to: 80, q: 0.5, vol: 0.3, type: "lowpass" });
    }
  },
  smash() {
    osc(45, 1.4, { vol: 0.65, to: 18 });
    hiss(1.2, { freq: 1200, to: 70, q: 0.5, vol: 0.4, type: "lowpass" });
    for (let i = 0; i < 6; i++) hiss(0.08, { freq: 1500 + R() * 2000, q: 2, vol: 0.06, at: 0.1 + R() * 0.6 });
  },
  clap() {
    hiss(0.08, { freq: 3500, q: 0.6, vol: 0.5, type: "highpass" });
    osc(70, 0.9, { vol: 0.5, to: 25 });
    hiss(0.9, { freq: 900, to: 150, q: 0.4, vol: 0.3, at: 0.03 });
  },
  rage() {
    // a roar: detuned saws through a moving formant + rumble
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [f0, det] of [[82, 0], [84, 7], [123, -5]]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0 * 1.25, t + 0.4);
      o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 1.5);
      o.detune.value = det;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 3;
      f.frequency.setValueAtTime(500, t);
      f.frequency.linearRampToValueAtTime(900, t + 0.5);
      f.frequency.linearRampToValueAtTime(400, t + 1.6);
      const g = ctx.createGain();
      env(g, t, 0.12, 0.22, 1.7);
      o.connect(f).connect(g).connect(sfx);
      o.start(t);
      o.stop(t + 1.8);
    }
    hiss(1.6, { freq: 700, to: 300, q: 1.5, vol: 0.25, attack: 0.1 });
    osc(40, 1.5, { vol: 0.4, to: 25 });
  },
  hurt(dmg) {
    const k = Math.min(1, dmg / 40);
    osc(140 - k * 40, 0.18, { type: "sawtooth", vol: 0.06 + k * 0.08, to: 90, lp: 600 });
  },
  grunt() {
    osc(110, 0.25, { type: "sawtooth", vol: 0.08, to: 80, lp: 500 });
  },
  lift() {
    hiss(0.3, { freq: 300, to: 800, q: 1, vol: 0.08 });
    osc(95, 0.3, { type: "sawtooth", vol: 0.05, to: 120, lp: 500 });
  },
  throw() {
    hiss(0.35, { freq: 500, to: 2600, q: 0.9, vol: 0.2 });
    osc(80, 0.3, { vol: 0.25, to: 45 });
  },
  /* ------------------------------------------------ world */
  crash(d, heavy = 1) {
    const a = att(d) * heavy;
    hiss(0.45, { freq: 2200, to: 500, q: 0.7, vol: 0.35 * a, type: "lowpass" });
    osc(70, 0.3, { vol: 0.3 * a, to: 35 });
    for (let i = 0; i < 4; i++) osc(800 + R() * 1500, 0.12, { type: "square", vol: 0.025 * a, at: R() * 0.2, lp: muffle(d) });
  },
  crumble(d, kind) {
    const a = att(d);
    hiss(0.6, { freq: kind === "wood" ? 900 : 600, to: 150, q: 0.6, vol: 0.22 * a, type: "lowpass" });
    for (let i = 0; i < 5; i++) hiss(0.06, { freq: 1200 + R() * 2500, q: 3, vol: 0.05 * a, at: R() * 0.4 });
  },
  glass(d) {
    const a = att(d);
    for (let i = 0; i < 6; i++) osc(2500 + R() * 3000, 0.15, { type: "triangle", vol: 0.03 * a, at: R() * 0.15 });
  },
  explosion(d, big = false) {
    const a = att(d);
    const lp = muffle(d);
    osc(big ? 38 : 50, big ? 1.6 : 1.0, { vol: (big ? 0.7 : 0.5) * a, to: 20 });
    hiss(big ? 1.6 : 1.0, { freq: Math.min(lp, 2400), to: 80, q: 0.4, vol: (big ? 0.55 : 0.4) * a, type: "lowpass" });
  },
  gun(d, kind) {
    const a = att(d);
    if (kind === "bullet") {
      hiss(0.06, { freq: 2500, q: 0.6, vol: 0.12 * a });
      osc(160, 0.05, { type: "square", vol: 0.04 * a, to: 80, lp: muffle(d) });
    } else if (kind === "rocket" || kind === "missiles") {
      hiss(0.6, { freq: 600, to: 2000, q: 0.8, vol: 0.18 * a });
      osc(90, 0.2, { vol: 0.15 * a, to: 50 });
    } else if (kind === "blast" || kind === "blast3" || kind === "orb") {
      osc(900, 0.25, { type: "sawtooth", vol: 0.07 * a, to: 180, lp: 3000 });
      osc(1800, 0.15, { type: "sine", vol: 0.05 * a, to: 400 });
    } else if (kind === "shell") {
      osc(70, 0.5, { vol: 0.4 * a, to: 30 });
      hiss(0.35, { freq: 1800, to: 300, q: 0.6, vol: 0.3 * a });
    } else if (kind === "hurl" || kind === "strike") {
      osc(60, 0.6, { vol: 0.3 * a, to: 30 });
    }
  },
  telegraph(kind) {
    if (kind === "melee") osc(200, 0.25, { type: "sawtooth", vol: 0.05, to: 120, lp: 800 });
    else if (kind === "rocket") osc(1500, 0.5, { type: "square", vol: 0.03, at: 0, lp: 3000 });
    else osc(1200, 0.2, { type: "sine", vol: 0.04, to: 1600 });
  },
  bossTele() {
    osc(220, 0.6, { type: "sawtooth", vol: 0.08, to: 440, lp: 1500 });
    osc(110, 0.6, { type: "square", vol: 0.04, to: 220, lp: 800 });
  },
  bossRoar() {
    osc(50, 2.0, { type: "sawtooth", vol: 0.25, to: 35, lp: 400 });
    hiss(2.0, { freq: 300, to: 120, q: 2, vol: 0.2, attack: 0.3 });
  },
  alarm() {
    for (let i = 0; i < 3; i++) osc(880, 0.12, { type: "square", vol: 0.04, at: i * 0.18, lp: 2500 });
  },
  honk(d) {
    const a = att(d);
    osc(380, 0.35, { type: "square", vol: 0.05 * a, lp: 1200 });
    osc(480, 0.35, { type: "square", vol: 0.04 * a, lp: 1200 });
  },
  scream(d) {
    const a = att(d);
    osc(700 + R() * 300, 0.5, { type: "triangle", vol: 0.04 * a, to: 500 });
  },
  /* ------------------------------------------------ UI */
  ui() {
    osc(660, 0.06, { type: "triangle", vol: 0.06 });
  },
  xp() {
    osc(1320, 0.08, { type: "triangle", vol: 0.03 });
  },
  objective() {
    osc(660, 0.12, { type: "triangle", vol: 0.1 });
    osc(990, 0.18, { type: "triangle", vol: 0.1, at: 0.1 });
  },
  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) => osc(f, 0.25, { type: "triangle", vol: 0.1, at: i * 0.09 }));
  },
  victory() {
    stopMusic();
    [392, 523, 659, 784, 1046].forEach((f, i) => osc(f, 0.4, { type: "sawtooth", vol: 0.06, at: i * 0.12, lp: 2500 }));
    osc(130.8, 1.4, { type: "sawtooth", vol: 0.08, at: 0.5, lp: 600 });
  },
  defeat() {
    stopMusic();
    [392, 349, 311, 262].forEach((f, i) => osc(f, 0.5, { type: "sawtooth", vol: 0.06, at: i * 0.22, lp: 1200 }));
  },
  /** test / debug: current routing state */
  state() {
    return { muted, volume, ctx: !!ctx, gain: master ? master.gain.value : null };
  },
  dispose() {
    stopMusic();
    if (chargeVoice) {
      try {
        chargeVoice.o.stop();
        chargeVoice.o2.stop();
      } catch {
        /* already stopped */
      }
      chargeVoice = null;
    }
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    master = null;
    sfx = null;
    musicBus = null;
  },
};
