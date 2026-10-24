/**
 * Gravity Sketch sound effects — synthesized with WebAudio (no audio files).
 * The AudioContext is created lazily on the first sound after a user gesture.
 */
export function createAudio() {
  let ctx = null, master = null, muted = false, noise = null, lastBump = 0, lastScratch = 0;

  const ensure = () => {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  };

  const tone = (f0, f1, dur, { type = "sine", vol = 0.1, at = 0 } = {}) => {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const hiss = (dur, { freq = 2000, q = 1, vol = 0.08, at = 0, type = "bandpass" } = {}) => {
    const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.3);
    s.stop(t + dur + 0.02);
  };
  const arp = (notes, step = 0.08, vol = 0.07, type = "triangle") => notes.forEach((f, k) => tone(f, f * 1.002, step * 2.4, { type, vol, at: k * step }));

  const SOUNDS = {
    // pencil scratch while drawing (throttled by the caller's distance)
    scratch: () => {
      const n = ctx.currentTime;
      if (n - lastScratch < 0.045) return;
      lastScratch = n;
      hiss(0.06, { freq: 2600 + Math.random() * 1800, q: 2.5, vol: 0.05 });
    },
    pop: () => (tone(380, 760, 0.12, { type: "triangle", vol: 0.1 }), hiss(0.05, { freq: 4000, vol: 0.03 })),
    nope: () => (tone(220, 150, 0.16, { type: "square", vol: 0.04 }), tone(180, 120, 0.16, { vol: 0.06, at: 0.05 })),
    bump: (v = 5) => {
      const n = ctx.currentTime;
      if (n - lastBump < 0.06) return;
      lastBump = n;
      const k = Math.min(1, v / 18);
      tone(120 + k * 60, 60, 0.12, { vol: 0.03 + k * 0.1 });
      hiss(0.05, { freq: 900 + k * 800, q: 0.8, vol: 0.02 + k * 0.05 });
    },
    hit: () => arp([1047, 1568, 2093], 0.05, 0.06, "sine"),
    press: () => (tone(900, 500, 0.08, { type: "square", vol: 0.04 }), tone(300, 300, 0.1, { vol: 0.08, at: 0.03 })),
    open: () => (hiss(0.4, { freq: 700, q: 0.6, vol: 0.08, type: "lowpass" }), tone(300, 600, 0.3, { type: "triangle", vol: 0.05 })),
    release: () => tone(500, 260, 0.2, { type: "triangle", vol: 0.07 }),
    undo: () => tone(700, 380, 0.12, { type: "triangle", vol: 0.07 }),
    reset: () => (tone(900, 220, 0.25, { type: "sawtooth", vol: 0.025 }), tone(450, 140, 0.25, { vol: 0.06 })),
    hint: () => arp([784, 988, 1319], 0.07, 0.05, "sine"),
    tap: () => tone(1100, 1250, 0.04, { vol: 0.04 }),
    start: () => tone(520, 780, 0.15, { type: "sine", vol: 0.05 }),
    win: () => arp([523, 659, 784, 1047, 1319, 1568], 0.08, 0.07),
    star: (i = 0) => tone(1047 * Math.pow(1.26, i), 1568 * Math.pow(1.26, i), 0.18, { type: "triangle", vol: 0.07 }),
    fail: () => arp([440, 349, 277, 220], 0.12, 0.06, "sawtooth"),
  };

  return {
    play(name, arg) {
      if (muted || !SOUNDS[name] || !ensure()) return;
      try {
        SOUNDS[name](arg);
      } catch {
        /* audio unavailable */
      }
    },
    setMuted(m) {
      muted = m;
    },
    dispose() {
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
