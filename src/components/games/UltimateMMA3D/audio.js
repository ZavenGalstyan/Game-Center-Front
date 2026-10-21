/**
 * Procedural audio (WebAudio, no sample files): punch / kick / guard impacts,
 * footsteps, round bell, crowd bed with swells and "ooh"s, knockdown roar,
 * referee whistle-calls, championship fanfare and menu clicks.
 *
 * Nothing plays until `unlock()` is called from a user gesture (browser
 * autoplay policy), and `setMuted()` mirrors the Game Center mute button.
 */
let ctx = null;
let master = null;
let crowdGain = null;
let crowdFilter = null;
let noiseBuf = null;
let muted = false;
let volume = { master: 0.9, sfx: 1, crowd: 0.8 };

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume.master;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function noise(dur, { type = "lowpass", freq = 800, q = 0.7, gain = 0.5, attack = 0.002, decay = dur, at = 0, dest = master } = {}) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

function tone(freq, dur, { type = "sine", gain = 0.3, at = 0, slide = 0, attack = 0.005, dest = master } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const sfx = (k) => volume.sfx * k;

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (!crowdGain) {
      // crowd bed: filtered looping noise with slow swell
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      crowdFilter = ctx.createBiquadFilter();
      crowdFilter.type = "bandpass";
      crowdFilter.frequency.value = 520;
      crowdFilter.Q.value = 0.45;
      crowdGain = ctx.createGain();
      crowdGain.gain.value = 0;
      src.connect(crowdFilter).connect(crowdGain).connect(master);
      src.start();
    }
  },
  get ready() {
    return !!ctx && ctx.state === "running";
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : volume.master, ctx.currentTime, 0.05);
  },
  setVolumes(v) {
    volume = { ...volume, ...v };
    if (master && !muted) master.gain.setTargetAtTime(volume.master, ctx.currentTime, 0.05);
  },
  /** Crowd loudness 0..1 (continuous). */
  crowd(level) {
    if (!crowdGain) return;
    const g = (0.025 + level * 0.11) * volume.crowd;
    crowdGain.gain.setTargetAtTime(g, ctx.currentTime, 0.4);
    crowdFilter.frequency.setTargetAtTime(420 + level * 380, ctx.currentTime, 0.5);
  },
  punch(power = 0.5, blocked = false) {
    if (!ctx) return;
    if (blocked) {
      noise(0.09, { freq: 1400, gain: sfx(0.22), decay: 0.08 });
      tone(140, 0.08, { gain: sfx(0.12), slide: 0.7 });
      return;
    }
    noise(0.14, { freq: 900 + power * 400, gain: sfx(0.35 + power * 0.3), decay: 0.12 });
    tone(95 + Math.random() * 20, 0.16, { gain: sfx(0.35 + power * 0.35), slide: 0.45 });
    noise(0.05, { type: "highpass", freq: 3000, gain: sfx(0.12), decay: 0.04 });
  },
  kick(power = 0.7, blocked = false) {
    if (!ctx) return;
    noise(0.2, { freq: blocked ? 1100 : 650, gain: sfx(blocked ? 0.3 : 0.5 + power * 0.25), decay: 0.18 });
    tone(70, 0.22, { gain: sfx(blocked ? 0.2 : 0.5), slide: 0.4 });
    if (!blocked) noise(0.06, { type: "highpass", freq: 2500, gain: sfx(0.2), decay: 0.05 }); // slap
  },
  whoosh(k = 0.5) {
    if (!ctx) return;
    noise(0.16, { type: "bandpass", freq: 900 + k * 900, q: 1.2, gain: sfx(0.06 + k * 0.05), attack: 0.05, decay: 0.15 });
  },
  step() {
    if (!ctx) return;
    noise(0.05, { type: "bandpass", freq: 2200 + Math.random() * 800, q: 3, gain: sfx(0.035), decay: 0.04 });
  },
  thud() {
    if (!ctx) return;
    tone(55, 0.4, { gain: sfx(0.6), slide: 0.5 });
    noise(0.3, { freq: 300, gain: sfx(0.4), decay: 0.28 });
  },
  bell(times = 1) {
    if (!ctx) return;
    for (let i = 0; i < times; i++) {
      const at = i * 0.32;
      for (const [f, g] of [
        [880, 0.22],
        [1356, 0.12],
        [2210, 0.08],
        [2980, 0.05],
      ])
        tone(f, 1.6, { gain: sfx(g), at, attack: 0.002, type: "sine" });
    }
  },
  ooh(k = 1) {
    if (!crowdGain) return;
    noise(1.2, { type: "bandpass", freq: 380, q: 1.1, gain: 0.06 * k * volume.crowd, attack: 0.15, decay: 1.1 });
  },
  roar(k = 1) {
    if (!crowdGain) return;
    noise(2.6, { type: "bandpass", freq: 650, q: 0.5, gain: 0.14 * k * volume.crowd, attack: 0.08, decay: 2.5 });
    noise(2.2, { type: "highpass", freq: 2400, gain: 0.04 * k * volume.crowd, attack: 0.1, decay: 2.0 });
  },
  /** Referee call — a short two-tone "whistle-voice" cue (no speech synthesis). */
  ref(kind = "stop") {
    if (!ctx) return;
    const f = kind === "fight" ? [520, 700] : kind === "break" ? [600, 450] : [700, 430];
    tone(f[0], 0.14, { type: "triangle", gain: sfx(0.12) });
    tone(f[1], 0.22, { type: "triangle", gain: sfx(0.12), at: 0.13 });
  },
  fanfare() {
    if (!ctx) return;
    const notes = [523, 659, 784, 1046, 784, 1046];
    notes.forEach((n, i) => {
      tone(n, 0.45, { type: "sawtooth", gain: sfx(0.05), at: i * 0.16 });
      tone(n / 2, 0.45, { type: "triangle", gain: sfx(0.06), at: i * 0.16 });
    });
    this.roar(1.2);
  },
  click() {
    if (!ctx) return;
    tone(1200, 0.05, { type: "square", gain: sfx(0.03) });
  },
  tap(good) {
    if (!ctx) return;
    tone(good ? 880 : 330, 0.06, { type: "triangle", gain: sfx(good ? 0.07 : 0.04) });
  },
  dispose() {
    try {
      ctx?.close();
    } catch {
      /* already closed */
    }
    ctx = master = crowdGain = crowdFilter = noiseBuf = null;
  },
};
