/**
 * Cozy Cleanup — tiny WebAudio synth. No files, no libraries, same
 * convention as Bomb Squad / Blade Rush / Crowd Rush. `sfx.*` are soft
 * one-shots; `Loop` drives a looping tool sound (vacuum/mop/scrub) that
 * stops the instant the pointer releases, the tool changes, or Mute is on.
 * Every call checks an `enabled` flag so the GamePlayer Mute button
 * silences everything instantly without touching the player's saved
 * sound/music settings.
 */
let ctx = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, { type = "sine", gain = 0.1, to = null, delay = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(dur, { gain = 0.15, lp = 1800, hp = 0, delay = 0 } = {}) {
  const a = ac();
  if (!a) return null;
  const t0 = a.currentTime + delay;
  const n = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const g = a.createGain();
  g.gain.value = gain;
  let node = src;
  if (hp) {
    const hf = a.createBiquadFilter();
    hf.type = "highpass";
    hf.frequency.value = hp;
    node.connect(hf);
    node = hf;
  }
  node.connect(f).connect(g).connect(a.destination);
  src.start(t0);
  return src;
}

export const sfx = {
  ui(on) { if (on) tone(520, 0.06, { type: "triangle", gain: 0.045, to: 680 }); },
  back(on) { if (on) tone(340, 0.07, { type: "triangle", gain: 0.045, to: 240 }); },
  toolSelect(on) { if (on) tone(600, 0.05, { type: "sine", gain: 0.05, to: 780 }); },
  pickUp(on) { if (on) tone(480, 0.05, { type: "triangle", gain: 0.05, to: 620 }); },
  trashDrop(on) {
    if (!on) return;
    noise(0.06, { gain: 0.08, lp: 1200 });
    tone(220, 0.09, { type: "sine", gain: 0.05, to: 140 });
  },
  dustPuff(on) { if (on) noise(0.05, { gain: 0.035, lp: 3200 }); },
  spray(on) { if (on) noise(0.07, { gain: 0.06, lp: 4200, hp: 900 }); },
  clothWipe(on) { if (on) noise(0.05, { gain: 0.03, lp: 2200 }); },
  scrub(on) { if (on) noise(0.04, { gain: 0.045, lp: 1600 }); },
  drawer(on) { if (on) { noise(0.12, { gain: 0.04, lp: 900 }); tone(180, 0.14, { type: "sine", gain: 0.03 }); } },
  snap(on) {
    if (!on) return;
    tone(660, 0.09, { type: "triangle", gain: 0.06, to: 880 });
  },
  invalidDrop(on) { if (on) tone(260, 0.08, { type: "sine", gain: 0.04, to: 200 }); },
  fold(on) { if (on) noise(0.09, { gain: 0.035, lp: 2000 }); },
  bedSettle(on) { if (on) { noise(0.14, { gain: 0.03, lp: 1000 }); tone(300, 0.16, { type: "sine", gain: 0.03, to: 220 }); } },
  dishClink(on) { if (on) tone(1400, 0.07, { type: "sine", gain: 0.04, to: 1000 }); },
  taskDone(on) {
    if (!on) return;
    [660, 880].forEach((f, i) => tone(f, 0.1, { type: "triangle", gain: 0.05, delay: i * 0.05 }));
  },
  sparkle(on) { if (on) tone(1500 + Math.random() * 600, 0.12, { type: "sine", gain: 0.035, to: 2200 }); },
  hint(on) { if (on) tone(720, 0.1, { type: "sine", gain: 0.04, to: 900 }); },
  roomComplete(on) {
    if (!on) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, { type: "sine", gain: 0.07, delay: i * 0.09 }));
  },
  star(on) { if (on) tone(1100, 0.14, { type: "triangle", gain: 0.05, to: 1500 }); },
};

/** Looping tool sound (vacuum / mop / scrub). Start/stop are idempotent. */
export class Loop {
  constructor(kind) {
    this.kind = kind;
    this.nodes = null;
    this.running = false;
  }
  start(enabled) {
    if (this.running || !enabled) return;
    const a = ac();
    if (!a) return;
    this.running = true;
    const g = a.createGain();
    g.gain.value = 0.0001;
    g.connect(a.destination);
    let src;
    if (this.kind === "vacuum") {
      src = this._noiseLoop(a, 1400, 0.05);
      g.gain.exponentialRampToValueAtTime(0.05, a.currentTime + 0.12);
    } else if (this.kind === "mop") {
      src = this._noiseLoop(a, 900, 0.03);
      g.gain.exponentialRampToValueAtTime(0.035, a.currentTime + 0.1);
    } else {
      src = this._noiseLoop(a, 1600, 0.03);
      g.gain.exponentialRampToValueAtTime(0.035, a.currentTime + 0.08);
    }
    src.connect(g);
    this.nodes = { src, g, ctx: a };
  }
  _noiseLoop(a, lp, gain) {
    const n = a.sampleRate * 2;
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    src.connect(f);
    src.start();
    src._filter = f;
    f._gainTarget = gain;
    return f;
  }
  stop() {
    if (!this.running || !this.nodes) { this.running = false; return; }
    const { g, ctx: a } = this.nodes;
    try {
      g.gain.cancelScheduledValues(a.currentTime);
      g.gain.setValueAtTime(g.gain.value, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.1);
    } catch { /* ignore */ }
    const nodes = this.nodes;
    setTimeout(() => {
      try { nodes.src.disconnect(); nodes.g.disconnect(); } catch { /* ignore */ }
    }, 150);
    this.nodes = null;
    this.running = false;
  }
}
