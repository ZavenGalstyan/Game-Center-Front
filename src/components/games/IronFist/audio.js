/**
 * Procedural audio (WebAudio, no sample files): strike whooshes, layered
 * impacts (light / heavy / special), guard clacks, footsteps & landings,
 * special-move signatures, thunder, KO boom, round bell, a crowd bed that
 * swells on big hits, and an announcer voice via the browser's
 * SpeechSynthesis when available (falls back to a horn).
 *
 * Nothing plays until `unlock()` is called from a user gesture (autoplay
 * policy). `setMuted()` mirrors the Game Center mute button.
 */
let ctx = null;
let master = null;
let crowdGain = null;
let crowdFilter = null;
let noiseBuf = null;
let muted = false;
let crowdLevel = 0;
let voiceOk = typeof window !== "undefined" && "speechSynthesis" in window;

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.85;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function noise(dur, { type = "lowpass", freq = 800, q = 0.7, gain = 0.5, attack = 0.002, at = 0, sweep = 0, dest = master } = {}) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

function tone(freq, dur, { type = "sine", gain = 0.3, at = 0, slide = 0, attack = 0.004, dest = master } = {}) {
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

const live = () => ctx && !muted && ctx.state === "running";

function startCrowd() {
  if (crowdGain || !ctx) return;
  crowdGain = ctx.createGain();
  crowdGain.gain.value = 0;
  crowdFilter = ctx.createBiquadFilter();
  crowdFilter.type = "bandpass";
  crowdFilter.frequency.value = 700;
  crowdFilter.Q.value = 0.5;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  lfo.frequency.value = 0.31;
  lg.gain.value = 180;
  lfo.connect(lg).connect(crowdFilter.frequency);
  src.connect(crowdFilter).connect(crowdGain).connect(master);
  src.start();
  lfo.start();
}

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    startCrowd();
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.85;
    if (muted && voiceOk) window.speechSynthesis.cancel();
  },
  /** Crowd bed level 0…1 (arena-dependent), with swells on top. */
  crowd(level) {
    crowdLevel = level;
    if (crowdGain && ctx) crowdGain.gain.setTargetAtTime(level * 0.11, ctx.currentTime, 0.4);
  },
  swell(amount = 1) {
    if (!crowdGain || !ctx) return;
    const t = ctx.currentTime;
    crowdGain.gain.cancelScheduledValues(t);
    crowdGain.gain.setValueAtTime(crowdGain.gain.value, t);
    crowdGain.gain.linearRampToValueAtTime((crowdLevel * 0.11 + 0.08 * amount) * (crowdLevel > 0 ? 1 : 0.4), t + 0.15);
    crowdGain.gain.setTargetAtTime(crowdLevel * 0.11, t + 0.5, 0.8);
  },
  whoosh(kind = "punch") {
    if (!live()) return;
    const kick = kind === "kick";
    noise(kick ? 0.22 : 0.13, { type: "bandpass", freq: kick ? 900 : 1600, q: 1.4, gain: kick ? 0.16 : 0.1, sweep: 0.45, attack: 0.03 });
  },
  hit(heavy = false, special = false) {
    if (!live()) return;
    // body thud + slap transient (+ sub boom for heavies)
    tone(heavy ? 95 : 140, heavy ? 0.22 : 0.12, { type: "sine", gain: heavy ? 0.7 : 0.45, slide: 0.45 });
    noise(0.07, { type: "highpass", freq: 1800, gain: heavy ? 0.45 : 0.32 });
    noise(heavy ? 0.2 : 0.11, { type: "lowpass", freq: 600, gain: heavy ? 0.5 : 0.3 });
    if (heavy) tone(52, 0.35, { type: "sine", gain: 0.5, slide: 0.6 });
    if (special) {
      tone(380, 0.35, { type: "sawtooth", gain: 0.08, slide: 0.3 });
      noise(0.45, { type: "bandpass", freq: 2400, q: 0.8, gain: 0.18, sweep: 0.2 });
    }
  },
  block() {
    if (!live()) return;
    tone(420, 0.06, { type: "square", gain: 0.12, slide: 0.7 });
    noise(0.05, { type: "bandpass", freq: 2800, q: 2, gain: 0.22 });
    tone(160, 0.08, { type: "sine", gain: 0.25, slide: 0.6 });
  },
  step() {
    if (!live()) return;
    noise(0.05, { type: "lowpass", freq: 380, gain: 0.08 });
  },
  land(hard = false) {
    if (!live()) return;
    noise(hard ? 0.3 : 0.1, { type: "lowpass", freq: hard ? 260 : 420, gain: hard ? 0.6 : 0.18 });
    if (hard) tone(60, 0.3, { gain: 0.5, slide: 0.5 });
  },
  jump() {
    if (!live()) return;
    noise(0.08, { type: "bandpass", freq: 700, gain: 0.08 });
  },
  dodge() {
    if (!live()) return;
    noise(0.18, { type: "bandpass", freq: 1200, q: 1, gain: 0.12, sweep: 2.2, attack: 0.04 });
  },
  special(id) {
    if (!live()) return;
    switch (id) {
      case "dragonWave":
        tone(220, 0.4, { type: "sawtooth", gain: 0.06, slide: 2.2 });
        noise(0.5, { type: "bandpass", freq: 500, q: 2, gain: 0.2, sweep: 4, attack: 0.25 });
        tone(110, 0.6, { type: "sine", gain: 0.25, at: 0.3, slide: 0.8 });
        break;
      case "infernoKick":
        noise(0.6, { type: "lowpass", freq: 900, gain: 0.35, sweep: 2.5, attack: 0.08 });
        tone(90, 0.5, { type: "sawtooth", gain: 0.08, slide: 1.8 });
        break;
      case "quakeSlam":
        tone(70, 0.5, { type: "sine", gain: 0.3, slide: 1.6, attack: 0.3 });
        tone(45, 0.9, { type: "sine", gain: 0.7, at: 0.42, slide: 0.5 });
        noise(0.9, { type: "lowpass", freq: 300, gain: 0.7, at: 0.42 });
        break;
      case "lightningRush":
        noise(0.35, { type: "highpass", freq: 3000, gain: 0.2, sweep: 0.5 });
        tone(900, 0.3, { type: "square", gain: 0.05, slide: 0.3 });
        break;
      case "shadowStep":
        noise(0.4, { type: "bandpass", freq: 600, q: 3, gain: 0.25, sweep: 0.3, attack: 0.05 });
        tone(300, 0.3, { type: "triangle", gain: 0.1, slide: 0.4 });
        break;
      case "thunderStrike":
        noise(0.4, { type: "highpass", freq: 2500, gain: 0.12, attack: 0.2 });
        tone(1200, 0.3, { type: "square", gain: 0.03, slide: 0.5 });
        break;
      default:
        break;
    }
  },
  thunder() {
    if (!live()) return;
    noise(0.12, { type: "highpass", freq: 1500, gain: 0.9 });
    noise(1.6, { type: "lowpass", freq: 700, gain: 0.8, sweep: 0.2, at: 0.03 });
    tone(40, 1.2, { gain: 0.6, slide: 0.6, at: 0.02 });
  },
  teleport() {
    if (!live()) return;
    noise(0.25, { type: "bandpass", freq: 1500, q: 4, gain: 0.2, sweep: 0.2 });
  },
  clash() {
    if (!live()) return;
    tone(700, 0.4, { type: "sawtooth", gain: 0.1, slide: 0.3 });
    noise(0.5, { type: "lowpass", freq: 1500, gain: 0.5, sweep: 0.2 });
  },
  ko() {
    if (!live()) return;
    tone(55, 1.4, { gain: 0.8, slide: 0.4 });
    noise(1.2, { type: "lowpass", freq: 900, gain: 0.6, sweep: 0.15 });
    tone(220, 1.2, { type: "triangle", gain: 0.12, at: 0.1, slide: 0.5 });
  },
  bell(times = 1) {
    if (!live()) return;
    for (let i = 0; i < times; i++) {
      tone(1320, 1.1, { type: "sine", gain: 0.18, at: i * 0.32 });
      tone(2650, 0.7, { type: "sine", gain: 0.06, at: i * 0.32 });
      tone(880, 1.3, { type: "triangle", gain: 0.08, at: i * 0.32 });
    }
  },
  ui(kind = "move") {
    if (!ctx || muted) return;
    if (ctx.state === "suspended") ctx.resume();
    if (kind === "move") tone(640, 0.05, { type: "triangle", gain: 0.06, slide: 1.1 });
    else if (kind === "ok") {
      tone(520, 0.08, { type: "square", gain: 0.06 });
      tone(780, 0.12, { type: "square", gain: 0.06, at: 0.07 });
    } else if (kind === "back") tone(420, 0.09, { type: "triangle", gain: 0.07, slide: 0.7 });
    else if (kind === "locked") tone(160, 0.15, { type: "square", gain: 0.06 });
  },
  fanfare() {
    if (!live()) return;
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, { type: "sawtooth", gain: 0.06, at: i * 0.14 }));
    tone(1046, 1.2, { type: "triangle", gain: 0.12, at: 0.56 });
  },
  /** Announcer line ("Round one", "Fight!", "K.O."…). */
  say(text, { rate = 0.92, pitch = 0.55 } = {}) {
    if (!ctx || muted) return;
    if (voiceOk) {
      try {
        const s = window.speechSynthesis;
        s.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = rate;
        u.pitch = pitch;
        u.volume = 1;
        const v = s.getVoices().find((x) => /en[-_](US|GB)/i.test(x.lang) && /male|david|daniel|george|guy|fred/i.test(x.name)) || s.getVoices().find((x) => /^en/i.test(x.lang));
        if (v) u.voice = v;
        s.speak(u);
        return;
      } catch {
        voiceOk = false;
      }
    }
    if (live()) {
      tone(220, 0.5, { type: "sawtooth", gain: 0.08 });
      tone(330, 0.5, { type: "sawtooth", gain: 0.06 });
    }
  },
  dispose() {
    try {
      if (voiceOk) window.speechSynthesis.cancel();
      ctx?.close();
    } catch {
      /* already closed */
    }
    ctx = master = crowdGain = crowdFilter = noiseBuf = null;
  },
};
