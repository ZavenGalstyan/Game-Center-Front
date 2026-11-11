/**
 * Outlaw Legends — procedural WebAudio (no sound files): per-weapon gunshots
 * built from filtered noise + a low thump, distant enemy shots, ricochets,
 * reload clicks, punches and kicks, a duel bell, explosions, coin jingles,
 * desert wind and a small plucked "frontier" theme for the menus.
 * The context starts on the first user gesture; one master gain makes
 * mute/volume instant; a voice budget stops rapid fire from piling up nodes.
 */
let ctx = null,
  master = null,
  sfx = null,
  musicBus = null,
  noiseBuf = null,
  wind = null,
  musicTimer = 0;
let muted = false,
  volume = 0.8,
  musicVol = 0.5,
  voices = 0;

function ensure() {
  if (ctx) return true;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return false;
  try {
    ctx = new AC();
  } catch {
    return false;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 5;
  master.connect(comp).connect(ctx.destination);
  sfx = ctx.createGain();
  sfx.gain.value = volume;
  sfx.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = musicVol * 0.5;
  musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

const live = () => ctx && ctx.state === "running" && !muted;

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
}
function track(node, end) {
  voices++;
  node.onended = () => voices--;
  node.stop(end);
}
function noise(dur, { type = "lowpass", f = 1200, q = 0.7, peak = 0.5, a = 0.002, delay = 0, f1 = null, out = sfx } = {}) {
  if (!live() || voices > 48) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const bq = ctx.createBiquadFilter();
  bq.type = type;
  bq.frequency.setValueAtTime(f, t);
  if (f1) bq.frequency.exponentialRampToValueAtTime(f1, t + dur);
  bq.Q.value = q;
  const g = ctx.createGain();
  env(g, t, a, peak, dur);
  src.connect(bq).connect(g).connect(out);
  src.start(t, Math.random());
  track(src, t + a + dur + 0.05);
}
function tone(type, f0, f1, dur, peak, delay = 0, out = sfx, a = 0.004) {
  if (!live() || voices > 48) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, a, peak, dur);
  o.connect(g).connect(out);
  o.start(t);
  track(o, t + a + dur + 0.05);
}

/* ------------------------------------------------------------ music: a plucked frontier theme */
const SCALE = [0, 3, 5, 7, 10, 12, 15]; // minor pentatonic-ish
const THEME = [0, 2, 3, 4, 3, 2, 0, -1, 0, 2, 4, 5, 4, 3, 2, 0];
function pluck(freq, t, peak = 0.16) {
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.value = freq;
  const o2 = ctx.createOscillator();
  o2.type = "sawtooth";
  o2.frequency.value = freq * 1.003;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2600, t);
  lp.frequency.exponentialRampToValueAtTime(500, t + 0.6);
  const g = ctx.createGain();
  env(g, t, 0.004, peak, 0.9);
  const g2 = ctx.createGain();
  g2.gain.value = 0.25;
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(lp).connect(musicBus);
  o.start(t);
  o2.start(t);
  o.stop(t + 1);
  o2.stop(t + 1);
}

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
  },
  setVolume(v, m) {
    volume = v;
    musicVol = m;
    if (sfx) sfx.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    if (musicBus) musicBus.gain.setTargetAtTime(musicVol * 0.5, ctx.currentTime, 0.05);
  },
  /* ---------------- weapons */
  shot(w) {
    if (w === "shotgun") {
      noise(0.5, { f: 3000, f1: 300, peak: 0.9 });
      noise(0.25, { type: "bandpass", f: 900, q: 0.8, peak: 0.6 });
      tone("sine", 110, 40, 0.3, 0.7);
      noise(1.2, { f: 600, f1: 120, peak: 0.18, delay: 0.05 });
    } else if (w === "rifle") {
      noise(0.35, { f: 5000, f1: 700, peak: 0.8 });
      tone("sine", 150, 50, 0.22, 0.55);
      noise(1.4, { f: 900, f1: 150, peak: 0.16, delay: 0.06 });
      noise(0.05, { type: "highpass", f: 2500, peak: 0.25, delay: 0.32 }); // lever
      noise(0.05, { type: "highpass", f: 3200, peak: 0.25, delay: 0.42 });
    } else {
      noise(0.28, { f: 4200, f1: 600, peak: w === "dual" ? 0.55 : 0.7 });
      tone("sine", 170, 55, 0.16, 0.5);
      noise(0.9, { f: 800, f1: 150, peak: 0.12, delay: 0.04 });
    }
  },
  enemyShot(dist = 10, kind = "bandit") {
    const k = Math.max(0.12, 1 - dist / 60);
    const f = 2600 * k + 500;
    noise(0.3, { f, f1: 250, peak: 0.45 * k * (kind === "shotgunner" ? 1.3 : 1) });
    tone("sine", 120, 45, 0.18, 0.3 * k);
    noise(1.0, { f: 500, f1: 120, peak: 0.08 * k, delay: 0.08 + dist / 340 });
  },
  whiz() {
    tone("sine", 2400, 900, 0.12, 0.08);
    noise(0.12, { type: "bandpass", f: 3500, q: 3, peak: 0.12 });
  },
  ricochet() {
    tone("sine", 2800 + Math.random() * 1200, 900, 0.35, 0.07);
  },
  impact() {
    noise(0.07, { type: "bandpass", f: 1400, q: 1.2, peak: 0.25 });
  },
  dry() {
    noise(0.03, { type: "highpass", f: 3000, peak: 0.3 });
  },
  reload(w) {
    noise(0.04, { type: "highpass", f: 2800, peak: 0.25 });
    noise(0.04, { type: "highpass", f: 2200, peak: 0.22, delay: 0.25 });
    if (w !== "rifle") for (let i = 0; i < 3; i++) noise(0.03, { type: "bandpass", f: 4000, q: 2, peak: 0.12, delay: 0.45 + i * 0.12 });
  },
  shell() {
    noise(0.04, { type: "bandpass", f: 3200, q: 2, peak: 0.2 });
  },
  reloaded() {
    noise(0.05, { type: "highpass", f: 2600, peak: 0.28 });
  },
  switchW() {
    noise(0.06, { type: "bandpass", f: 1800, q: 1, peak: 0.2 });
  },
  /* ---------------- fighting */
  swing() {
    noise(0.16, { type: "bandpass", f: 900, f1: 2200, q: 1, peak: 0.12 });
  },
  punch(heavy = false) {
    noise(0.12, { f: 700, f1: 120, peak: heavy ? 0.9 : 0.6 });
    tone("sine", heavy ? 90 : 120, 40, 0.12, heavy ? 0.7 : 0.5);
  },
  block() {
    noise(0.08, { type: "bandpass", f: 500, q: 1, peak: 0.4 });
    tone("square", 180, 120, 0.06, 0.08);
  },
  hurt() {
    noise(0.2, { type: "bandpass", f: 500, f1: 300, q: 2, peak: 0.35 });
    tone("sawtooth", 160, 110, 0.18, 0.06);
  },
  enemyHit(head) {
    noise(0.08, { f: 1600, f1: 300, peak: 0.35 });
    if (head) tone("sine", 900, 600, 0.07, 0.12);
  },
  kill() {
    tone("sine", 220, 110, 0.25, 0.08);
  },
  roll() {
    noise(0.3, { type: "lowpass", f: 600, peak: 0.25 });
  },
  jump() {
    noise(0.08, { f: 500, peak: 0.12 });
  },
  land() {
    noise(0.1, { f: 400, peak: 0.25 });
  },
  /* ---------------- world */
  explosion() {
    noise(1.6, { f: 1800, f1: 60, peak: 1.0 });
    tone("sine", 70, 25, 0.9, 0.9);
    noise(0.4, { type: "bandpass", f: 400, q: 0.6, peak: 0.6 });
  },
  fuse() {
    noise(1.0, { type: "highpass", f: 4000, peak: 0.08 });
  },
  coins() {
    for (let i = 0; i < 4; i++) tone("sine", 2200 + i * 260, 2100 + i * 240, 0.12, 0.08, i * 0.05);
  },
  pickup() {
    tone("triangle", 660, 990, 0.12, 0.12);
  },
  heal() {
    tone("sine", 520, 780, 0.25, 0.12);
    tone("sine", 780, 1040, 0.25, 0.1, 0.1);
  },
  alert() {
    tone("square", 700, 900, 0.07, 0.04);
  },
  step() {
    tone("triangle", 523, 523, 0.12, 0.12);
    tone("triangle", 784, 784, 0.18, 0.12, 0.1);
  },
  click() {
    noise(0.03, { type: "bandpass", f: 2000, q: 2, peak: 0.15 });
  },
  buy() {
    this.coins();
    tone("triangle", 880, 1320, 0.15, 0.1, 0.15);
  },
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, 0.3, 0.16, i * 0.1));
  },
  bell() {
    for (const [f, a] of [[880, 0.3], [1320, 0.12], [2210, 0.06]]) tone("sine", f, f * 0.995, 2.2, a, 0, sfx, 0.002);
  },
  tension() {
    tone("sine", 110, 108, 2.4, 0.12, 0, sfx, 0.4);
    tone("sine", 116.5, 115, 2.4, 0.08, 0, sfx, 0.4);
  },
  victory() {
    if (!live()) return;
    const t = ctx.currentTime;
    [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => pluck(261.6 * Math.pow(2, n / 12), t + i * 0.16, 0.22));
  },
  defeat() {
    tone("sawtooth", 220, 110, 0.9, 0.1);
    tone("sine", 110, 55, 1.2, 0.2);
  },
  train() {
    if (!live()) return;
    for (let i = 0; i < 3; i++) tone("square", 330, 330, 0.5, 0.05, i * 0.6);
    for (let i = 0; i < 14; i++) noise(0.12, { f: 400, peak: 0.2, delay: i * 0.33 });
  },
  /* ---------------- loops */
  startWind(strength = 1) {
    if (!live() || wind) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bq = ctx.createBiquadFilter();
    bq.type = "bandpass";
    bq.frequency.value = 500;
    bq.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg).connect(bq.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.05 * strength;
    src.connect(bq).connect(g).connect(sfx);
    src.start();
    lfo.start();
    wind = { src, lfo, g };
  },
  stopWind() {
    if (!wind) return;
    try {
      wind.src.stop();
      wind.lfo.stop();
    } catch {
      /* ignore */
    }
    wind = null;
  },
  startMusic() {
    if (!ensure() || musicTimer) return;
    let i = 0;
    const play = () => {
      if (!live()) return;
      const t = ctx.currentTime + 0.05;
      const root = 146.8; // D
      const step = THEME[i % THEME.length];
      const n = step < 0 ? -2 : SCALE[step];
      pluck(root * Math.pow(2, n / 12), t);
      if (i % 4 === 0) pluck(root / 2, t, 0.12);
      if (i % 8 === 4) pluck((root / 2) * Math.pow(2, 7 / 12), t, 0.1);
      i++;
    };
    musicTimer = setInterval(play, 420);
  },
  stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = 0;
  },
  stopAll() {
    this.stopWind();
    this.stopMusic();
  },
};
