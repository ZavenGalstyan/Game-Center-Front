/**
 * Color Clash sound effects — tiny synthesized blips (no audio files). The
 * AudioContext is created lazily on the first sound after a user gesture.
 */
export function createAudio() {
  let ctx = null, master = null, muted = false;

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
  const arp = (notes, step = 0.08, type = "triangle", vol = 0.1) => notes.forEach((f, k) => tone(f, f, step * 1.8, { type, vol, at: k * step }));

  const SOUNDS = {
    tap: () => tone(900, 900, 0.04, { vol: 0.05 }),
    play: () => (tone(520, 300, 0.09, { type: "square", vol: 0.04 }), tone(1400, 900, 0.05, { vol: 0.04, at: 0.02 })),
    draw: () => tone(380, 620, 0.08, { vol: 0.06 }),
    skip: () => arp([660, 330], 0.07, "square", 0.05),
    reverse: () => arp([440, 660, 440], 0.06, "triangle", 0.08),
    plus: () => arp([300, 240, 180], 0.07, "sawtooth", 0.05),
    wild: () => arp([523, 659, 784, 988], 0.05, "triangle", 0.07),
    last: () => arp([784, 988, 1175], 0.07, "square", 0.05),
    penalty: () => arp([220, 165], 0.12, "sawtooth", 0.06),
    bad: () => tone(170, 140, 0.14, { type: "sawtooth", vol: 0.05 }),
    turn: () => tone(1046, 1046, 0.08, { vol: 0.05 }),
    win: () => arp([523, 659, 784, 1047, 1319], 0.1, "triangle", 0.1),
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
