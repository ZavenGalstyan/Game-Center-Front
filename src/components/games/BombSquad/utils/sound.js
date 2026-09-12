/**
 * Bomb Squad — tiny WebAudio synth. No files, no libraries, same convention
 * as Blade Rush / Crowd Rush / Liquid Sort. `sfx.*` are one-shots; `Music`
 * is a light tense looping bed. Every call checks an `enabled` flag so the
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

export const sfx = {
  ui(on) { if (on) tone(560, 0.06, { type: "triangle", gain: 0.05, to: 720 }); },
  back(on) { if (on) tone(360, 0.08, { type: "triangle", gain: 0.05, to: 260 }); },
  click(on) { if (on) tone(700, 0.04, { type: "square", gain: 0.04, to: 900 }); },
  toggle(on) { if (on) { tone(420, 0.05, { type: "square", gain: 0.05 }); noise(0.02, { gain: 0.05, lp: 2500 }); } },
  dialTick(on) { if (on) tone(900, 0.02, { type: "square", gain: 0.03 }); },
  beep(on) { if (on) tone(1100, 0.05, { type: "sine", gain: 0.05 }); },
  wireCut(on) { if (on) { noise(0.05, { gain: 0.12, lp: 2200 }); tone(240, 0.05, { type: "triangle", gain: 0.05, to: 120 }); } },
  moduleSolved(on) {
    if (!on) return;
    [660, 880, 1180].forEach((f, i) => tone(f, 0.12, { type: "triangle", gain: 0.06, delay: i * 0.05 }));
  },
  strike(on) {
    if (!on) return;
    tone(220, 0.16, { type: "sawtooth", gain: 0.09, to: 90 });
    noise(0.1, { gain: 0.1, lp: 900, delay: 0.02 });
  },
  timerWarning(on) { if (on) tone(880, 0.09, { type: "square", gain: 0.05 }); },
  timerCritical(on) { if (on) tone(1180, 0.08, { type: "square", gain: 0.07 }); },
  missionComplete(on) {
    if (!on) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, { type: "sine", gain: 0.08, delay: i * 0.08 }));
  },
  missionFailed(on) {
    if (!on) return;
    tone(300, 0.2, { type: "sawtooth", gain: 0.1, to: 60 });
    noise(0.3, { gain: 0.16, lp: 700, delay: 0.05 });
  },
};

/** light tense looping bed — dark technician ambience */
export class Music {
  constructor(enabled) {
    this.enabled = enabled;
    this.timer = null;
    this.step = 0;
    this.tempo = 0.34;
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
    const bass = [55, 55, 58.3, 55, 49, 49, 55, 51.9][Math.floor(this.step / 2)] || 55;
    if (this.step % 2 === 0) tone(bass, 0.3, { type: "sine", gain: 0.04 });
    if (this.step % 8 === 0) noise(0.04, { gain: 0.025, lp: 220 });
  }
  setEnabled(v) { this.enabled = v; }
  stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
