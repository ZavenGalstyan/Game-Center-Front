/**
 * Block Escape sound effects — soft synthesized wood knocks (no audio files).
 * The AudioContext is created lazily on the first sound after a user gesture.
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

  const tone = (f0, f1, dur, { type = "sine", vol = 0.1, at = 0 } = {}) => {
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
  // wooden "tock": a short band-passed noise burst over a low body tone
  const knock = (freq = 900, vol = 0.18, at = 0) => {
    const t = ctx.currentTime + at, len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 3;
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start(t);
    tone(freq / 4, freq / 5, 0.08, { vol: vol * 0.5, at });
  };
  const arp = (notes, step = 0.09, vol = 0.08) => notes.forEach((f, k) => tone(f, f, step * 2, { type: "triangle", vol, at: k * step }));

  const SOUNDS = {
    pick: () => knock(1500, 0.08),
    slide: () => knock(800, 0.2),
    bump: () => knock(420, 0.1),
    undo: () => (knock(1000, 0.1), knock(700, 0.08, 0.06)),
    hint: () => arp([880, 1175], 0.07, 0.05),
    tap: () => tone(900, 900, 0.04, { vol: 0.04 }),
    win: () => arp([523, 659, 784, 1047, 1319], 0.09, 0.08),
    star: () => tone(1320, 1760, 0.15, { type: "triangle", vol: 0.06 }),
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
