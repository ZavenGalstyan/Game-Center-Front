/**
 * Crowd Rush — tiny WebAudio synth. No files, no libraries.
 *
 * `sfx.*` are one-shots for gates, spawns, hits, battles, the finish and UI.
 * `Music` is a light looping arcade bed for menu + gameplay. Everything checks
 * an `enabled` flag so the GamePlayer Mute button silences it instantly without
 * touching the player's saved sound / music settings.
 */

let ctx = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
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
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
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
  gatePositive(on) {
    if (!on) return;
    tone(523, 0.1, { type: "triangle", gain: 0.09, to: 784 });
    tone(784, 0.14, { type: "sine", gain: 0.07, delay: 0.05 });
  },
  gateMultiply(on) {
    if (!on) return;
    [523, 659, 880, 1174].forEach((f, i) => tone(f, 0.12, { type: "triangle", gain: 0.08, delay: i * 0.04 }));
  },
  gateNegative(on) {
    if (!on) return;
    tone(300, 0.16, { type: "sawtooth", gain: 0.08, to: 150 });
    noise(0.1, { gain: 0.08, lp: 800 });
  },
  spawn(on) { if (on) tone(880 + Math.random() * 120, 0.05, { type: "sine", gain: 0.03, to: 1200 }); },
  hit(on) { if (on) { noise(0.12, { gain: 0.14, lp: 1000 }); tone(160, 0.1, { type: "square", gain: 0.05, to: 90 }); } },
  battle(on) { if (on) { noise(0.06, { gain: 0.05, lp: 1600 }); tone(220 + Math.random() * 60, 0.05, { type: "square", gain: 0.03 }); } },
  enemyDown(on) {
    if (!on) return;
    tone(440, 0.14, { type: "triangle", gain: 0.08, to: 660 });
    noise(0.12, { gain: 0.06, lp: 2000, delay: 0.02 });
  },
  bossHit(on) { if (on) { noise(0.22, { gain: 0.2, lp: 600 }); tone(80, 0.2, { type: "sawtooth", gain: 0.12, to: 46 }); } },
  finish(on) {
    if (!on) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, { type: "sine", gain: 0.09, delay: i * 0.08 }));
  },
  win(on) {
    if (!on) return;
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.26, { type: "triangle", gain: 0.1, delay: i * 0.1 }));
  },
  lose(on) {
    if (!on) return;
    [392, 311, 233, 175].forEach((f, i) => tone(f, 0.3, { type: "sawtooth", gain: 0.09, delay: i * 0.13 }));
  },
  star(on) { if (on) tone(1046, 0.18, { type: "triangle", gain: 0.09, to: 1568 }); },
  coin(on) { if (on) { tone(988, 0.05, { type: "square", gain: 0.05 }); tone(1319, 0.08, { type: "square", gain: 0.05, delay: 0.05 }); } },
};

/** light looping bed — a bouncy two-bar arpeggio + soft kick */
export class Music {
  constructor(enabled) {
    this.enabled = enabled;
    this.timer = null;
    this.step = 0;
    this.tempo = 0.26; // seconds per step
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
    const bass = [55, 55, 82, 55, 73, 73, 98, 73][Math.floor(this.step / 2)] || 55;
    const arp = [220, 277, 330, 415, 330, 277, 247, 220][this.step % 8];
    if (this.step % 2 === 0) tone(bass, 0.22, { type: "sine", gain: 0.05 });
    tone(arp, 0.16, { type: "triangle", gain: 0.022 });
    if (this.step % 4 === 0) noise(0.05, { gain: 0.03, lp: 220 });
  }
  setEnabled(v) { this.enabled = v; }
  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export function buzz(on, ms = 20) {
  if (on && typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* not supported */ }
  }
}
