/**
 * Trump Masters sound effects — tiny synthesized card sounds (no audio files).
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
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  };

  const tone = (f0, f1, dur, { type = "triangle", vol = 0.1, at = 0 } = {}) => {
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
  // a soft "card on felt" swish: filtered noise burst
  const swish = (freq = 1800, vol = 0.35, at = 0, dur = 0.12) => {
    const t = ctx.currentTime + at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise;
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  };
  const arp = (notes, step = 0.08, type = "triangle", vol = 0.08) => notes.forEach((f, k) => tone(f, f, step * 1.8, { type, vol, at: k * step }));

  const SOUNDS = {
    tap: () => tone(1000, 1000, 0.03, { vol: 0.04 }),
    deal: () => { for (let k = 0; k < 6; k++) swish(2200, 0.22, k * 0.07, 0.08); },
    play: () => (swish(1600, 0.4), tone(240, 180, 0.06, { vol: 0.05 })),
    beat: () => (swish(2000, 0.4), tone(660, 880, 0.08, { vol: 0.05, at: 0.03 })),
    trump: () => (swish(2000, 0.4), arp([660, 990], 0.06, "triangle", 0.06)),
    transfer: () => (swish(1400, 0.35), arp([440, 660, 880], 0.05, "square", 0.04)),
    take: () => { for (let k = 0; k < 3; k++) swish(900, 0.3, k * 0.06, 0.1); tone(300, 200, 0.2, { vol: 0.05 }); },
    discard: () => swish(1200, 0.3, 0, 0.2),
    draw: () => swish(2600, 0.2, 0, 0.07),
    turn: () => tone(1046, 1046, 0.08, { vol: 0.05 }),
    bad: () => tone(170, 140, 0.14, { type: "sawtooth", vol: 0.04 }),
    out: () => arp([784, 988], 0.07, "triangle", 0.06),
    win: () => arp([523, 659, 784, 1047, 1319], 0.1, "triangle", 0.09),
    lose: () => arp([440, 370, 311, 262], 0.13, "triangle", 0.08),
  };

  return {
    play(name) {
      if (muted || !SOUNDS[name] || !ensure()) return;
      try {
        SOUNDS[name]();
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
