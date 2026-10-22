/**
 * My Little Buddy sound effects — tiny synthesized blips (no audio files).
 * The AudioContext is created lazily on the first sound after a user gesture.
 */
export function createAudio() {
  let ctx = null, master = null, noise = null, muted = false;

  const ensure = () => {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  };

  const tone = (f0, f1, dur, { type = "triangle", vol = 0.12, at = 0 } = {}) => {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const hiss = (dur, freq, vol, at = 0) => {
    const t = ctx.currentTime + at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise;
    f.type = "bandpass";
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  };
  const arp = (notes, step = 0.07, type = "triangle", vol = 0.1) => notes.forEach((f, k) => tone(f, f, step * 1.8, { type, vol, at: k * step }));

  const FX = {
    tap: () => tone(700, 900, 0.06, { vol: 0.06 }),
    giggle: () => [0, 0.09, 0.18].forEach((at, k) => tone(820 + k * 120, 1100 + k * 120, 0.07, { vol: 0.07, at })),
    chomp: () => (hiss(0.08, 900, 0.25), hiss(0.08, 700, 0.2, 0.15), tone(260, 200, 0.08, { type: "square", vol: 0.04, at: 0.2 })),
    yum: () => arp([660, 880, 990], 0.08),
    refuse: () => (tone(420, 300, 0.14, { vol: 0.08 }), tone(420, 300, 0.14, { vol: 0.08, at: 0.18 })),
    scrub: () => hiss(0.09, 2400, 0.08),
    splash: () => hiss(0.25, 1400, 0.16),
    lamp: () => tone(1800, 1800, 0.03, { type: "square", vol: 0.05 }),
    coin: () => (tone(1320, 1320, 0.06, { type: "square", vol: 0.04 }), tone(1760, 1760, 0.12, { type: "square", vol: 0.04, at: 0.05 })),
    buy: () => arp([523, 784, 1047], 0.06, "square", 0.04),
    error: () => tone(220, 160, 0.2, { type: "sawtooth", vol: 0.05 }),
    level: () => arp([523, 659, 784, 1047, 1319], 0.08, "triangle", 0.11),
    ach: () => arp([784, 988, 1175, 1568], 0.07, "square", 0.04),
    star: () => tone(1200, 1600, 0.08, { vol: 0.07 }),
    pop: () => tone(500 + Math.random() * 300, 1400, 0.06, { type: "sine", vol: 0.12 }),
    miss: () => tone(300, 140, 0.2, { type: "square", vol: 0.05 }),
    flip: () => tone(600, 750, 0.05, { vol: 0.06 }),
    match: () => arp([880, 1175], 0.07),
    win: () => arp([523, 659, 784, 1047], 0.09),
    whoosh: () => hiss(0.22, 600, 0.07),
  };

  return {
    play(name) {
      if (muted || !FX[name] || !ensure()) return;
      try {
        FX[name]();
      } catch {
        /* ignore */
      }
    },
    setMuted(m) {
      muted = m;
    },
    dispose() {
      if (ctx) ctx.close().catch(() => {});
      ctx = null;
    },
  };
}
