/**
 * Neon Circuit sound effects — synthesized electric blips (no audio files).
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
      master.gain.value = 0.4;
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
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const arp = (notes, step = 0.08, vol = 0.07, type = "triangle") => notes.forEach((f, k) => tone(f, f * 1.002, step * 2.2, { type, vol, at: k * step }));

  const SOUNDS = {
    // pitch rises as the board empties (lightsLeft 0..1)
    toggle: (left = 0.5) => {
      const f = 520 + (1 - left) * 520;
      tone(f, f * 1.5, 0.09, { type: "square", vol: 0.035 });
      tone(f * 2, f * 2.5, 0.06, { vol: 0.04, at: 0.015 });
    },
    undo: () => tone(700, 380, 0.12, { type: "triangle", vol: 0.07 }),
    reset: () => (tone(900, 200, 0.25, { type: "sawtooth", vol: 0.03 }), tone(450, 120, 0.25, { vol: 0.06 })),
    hint: () => arp([988, 1319], 0.07, 0.05, "sine"),
    tap: () => tone(1200, 1300, 0.04, { vol: 0.035 }),
    tick: () => tone(1800, 1800, 0.03, { type: "square", vol: 0.02 }),
    clear: () => arp([659, 988, 1319], 0.06, 0.06),
    win: () => arp([523, 659, 784, 1047, 1319, 1568], 0.08, 0.07),
    star: () => tone(1320, 1980, 0.16, { type: "triangle", vol: 0.06 }),
    lose: () => arp([523, 415, 330, 247], 0.14, 0.07, "sawtooth"),
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
