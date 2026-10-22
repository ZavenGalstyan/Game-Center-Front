/**
 * Crazy Cards sound effects — soft synthesized blips (no audio files). The
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
      master.gain.value = 0.4;
      master.connect(ctx.destination);
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
  // a short filtered-noise "card snap"
  const snap = (vol = 0.12, at = 0) => {
    const t = ctx.currentTime + at, len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = "bandpass";
    f.frequency.value = 2400;
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start(t);
  };
  const arp = (notes, step = 0.08, type = "triangle", vol = 0.08) => notes.forEach((f, k) => tone(f, f, step * 1.8, { type, vol, at: k * step }));

  const SOUNDS = {
    tap: () => tone(900, 900, 0.04, { vol: 0.04 }),
    play: () => (snap(0.16), tone(520, 380, 0.07, { vol: 0.03 })),
    draw: () => (snap(0.09), tone(360, 560, 0.08, { vol: 0.04 })),
    deal: () => [0, 0.07, 0.14, 0.21].forEach((at) => snap(0.07, at)),
    wild: () => (snap(0.16), arp([523, 659, 784, 1047], 0.06, "triangle", 0.06)),
    pass: () => tone(300, 240, 0.12, { vol: 0.04 }),
    last: () => arp([784, 988], 0.08, "sine", 0.06),
    shuffle: () => Array.from({ length: 8 }, (_, k) => snap(0.05, k * 0.035)),
    bad: () => tone(170, 140, 0.14, { type: "sawtooth", vol: 0.04 }),
    turn: () => tone(1046, 1046, 0.08, { type: "sine", vol: 0.05 }),
    win: () => arp([523, 659, 784, 1047, 1319], 0.1, "triangle", 0.09),
    lose: () => arp([440, 370, 311, 262], 0.13, "triangle", 0.07),
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
