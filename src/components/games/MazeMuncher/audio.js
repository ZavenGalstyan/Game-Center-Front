/**
 * Synthesized WebAudio effects for Maze Muncher — no samples. The context is
 * created lazily on the first user gesture; `setMuted` drives a master gain.
 */
export function createAudio() {
  let ctx = null, master = null, muted = false, lastChomp = 0, chompHigh = false;

  const ensure = () => {
    if (ctx) return ctx.state === "suspended" ? (ctx.resume().catch(() => {}), ctx) : ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  };

  // one oscillator note with an optional frequency glide
  const tone = (f0, f1, dur, { type = "square", vol = 0.12, at = 0 } = {}) => {
    if (!ctx || muted) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const arp = (notes, step, opts) => notes.forEach((f, k) => tone(f, f, step * 1.6, { ...opts, at: k * step }));

  const sounds = {
    chomp() {
      const now = ctx.currentTime;
      if (now - lastChomp < 0.08) return;
      lastChomp = now;
      chompHigh = !chompHigh;
      tone(chompHigh ? 520 : 390, chompHigh ? 300 : 230, 0.07, { type: "triangle", vol: 0.16 });
    },
    orb: () => (tone(200, 900, 0.25, { type: "sawtooth", vol: 0.07 }), tone(900, 300, 0.3, { type: "triangle", vol: 0.08, at: 0.2 })),
    eat: () => tone(300, 1600, 0.28, { type: "square", vol: 0.08 }),
    death: () => (tone(700, 80, 1.1, { type: "sawtooth", vol: 0.09 }), tone(500, 60, 1.1, { type: "triangle", vol: 0.1, at: 0.08 })),
    bonus: () => arp([660, 880, 1320], 0.06, { type: "triangle", vol: 0.12 }),
    bonusSpawn: () => arp([990, 1320], 0.07, { type: "sine", vol: 0.1 }),
    combo: () => arp([784, 1046], 0.05, { type: "triangle", vol: 0.1 }),
    life: () => arp([523, 659, 784, 1046, 1318], 0.07, { type: "square", vol: 0.07 }),
    clear: () => arp([523, 659, 784, 1046, 784, 1046, 1318], 0.09, { type: "triangle", vol: 0.13 }),
    start: () => arp([392, 523, 659, 784, 659, 784, 1046], 0.1, { type: "square", vol: 0.06 }),
    over: () => arp([523, 415, 330, 262, 196], 0.16, { type: "triangle", vol: 0.13 }),
    victory: () => arp([523, 659, 784, 1046, 1318, 1568, 2093], 0.11, { type: "square", vol: 0.07 }),
  };

  return {
    unlock: ensure,
    play(name) {
      if (muted || !ensure()) return;
      sounds[name]?.();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    close() {
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
