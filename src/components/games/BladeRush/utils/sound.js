/**
 * Blade Rush — tiny WebAudio synth. No files, no libraries, same convention
 * as Crowd Rush / Liquid Sort. `sfx.*` are one-shots; `Music` is a light
 * looping arcade-workshop bed. Every call checks an `enabled` flag so the
 * GamePlayer Mute button silences it instantly without touching the
 * player's own saved sound/music settings.
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

function tone(freq, dur, { type = "sine", gain = 0.12, to = null, delay = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(dur, { gain = 0.2, lp = 1400, delay = 0 } = {}) {
  const a = ac();
  if (!a) return;
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
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

const MATERIAL_IMPACT = {
  wood(on) { if (on) { noise(0.08, { gain: 0.14, lp: 1200 }); tone(180, 0.08, { type: "triangle", gain: 0.06, to: 110 }); } },
  metal(on) { if (on) { tone(1400, 0.05, { type: "square", gain: 0.05 }); noise(0.05, { gain: 0.1, lp: 3000 }); } },
  ice(on) { if (on) { tone(1800, 0.04, { type: "sine", gain: 0.06 }); noise(0.06, { gain: 0.08, lp: 4000 }); } },
  stone(on) { if (on) { noise(0.1, { gain: 0.16, lp: 700 }); tone(140, 0.07, { type: "square", gain: 0.05 }); } },
  crystal(on) { if (on) { tone(1600, 0.1, { type: "sine", gain: 0.06, to: 2400 }); noise(0.04, { gain: 0.05, lp: 5000 }); } },
};

export const sfx = {
  ui(on) { if (on) tone(560, 0.06, { type: "triangle", gain: 0.05, to: 720 }); },
  back(on) { if (on) tone(360, 0.08, { type: "triangle", gain: 0.05, to: 260 }); },
  throwBlade(on) { if (on) { tone(700, 0.06, { type: "sawtooth", gain: 0.05, to: 1100 }); noise(0.03, { gain: 0.04, lp: 3500 }); } },
  hit(on, material = "wood") { if (on) (MATERIAL_IMPACT[material] || MATERIAL_IMPACT.wood)(true); },
  fail(on) {
    if (!on) return;
    tone(900, 0.05, { type: "square", gain: 0.07 });
    noise(0.14, { gain: 0.16, lp: 900, delay: 0.02 });
    tone(180, 0.12, { type: "sawtooth", gain: 0.07, to: 90, delay: 0.05 });
  },
  shard(on) { if (on) { tone(1046, 0.1, { type: "triangle", gain: 0.08, to: 1568 }); tone(1568, 0.12, { type: "sine", gain: 0.06, delay: 0.05 }); } },
  break(on) {
    if (!on) return;
    noise(0.28, { gain: 0.22, lp: 1000 });
    tone(90, 0.3, { type: "sawtooth", gain: 0.14, to: 40 });
    [523, 659, 784].forEach((f, i) => tone(f, 0.2, { type: "triangle", gain: 0.07, delay: 0.06 + i * 0.06 }));
  },
  bossBreak(on) {
    if (!on) return;
    noise(0.4, { gain: 0.26, lp: 900 });
    tone(70, 0.4, { type: "sawtooth", gain: 0.18, to: 30 });
    [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.24, { type: "triangle", gain: 0.08, delay: 0.08 + i * 0.07 }));
  },
  phase(on) { if (on) [660, 880].forEach((f, i) => tone(f, 0.12, { type: "triangle", gain: 0.07, delay: i * 0.08 })); },
  stageComplete(on) {
    if (!on) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, { type: "sine", gain: 0.08, delay: i * 0.07 }));
  },
  streak(on) { if (on) tone(1200, 0.1, { type: "triangle", gain: 0.06, to: 1600 }); },
};

/** light looping bed — dark arcade workshop ambience */
export class Music {
  constructor(enabled) {
    this.enabled = enabled;
    this.timer = null;
    this.step = 0;
    this.tempo = 0.3;
  }
  start() {
    if (this.timer) return;
    const loop = () => {
      if (this.enabled) this._tick();
      this.step = (this.step + 1) % 16;
      this.timer = setTimeout(loop, this.tempo * 1000);
    };
    loop();
  }
  _tick() {
    const a = ac();
    if (!a) return;
    const bass = [55, 55, 61.7, 55, 49, 49, 55, 49][Math.floor(this.step / 2)] || 55;
    if (this.step % 2 === 0) tone(bass, 0.26, { type: "sine", gain: 0.045 });
    if (this.step % 4 === 2) tone(bass * 3, 0.14, { type: "triangle", gain: 0.02 });
    if (this.step % 8 === 0) noise(0.05, { gain: 0.03, lp: 250 });
  }
  setEnabled(v) { this.enabled = v; }
  stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
