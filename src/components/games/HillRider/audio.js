/**
 * Hill Rider sound: a synthesized engine (two detuned oscillators through a
 * low-pass filter, pitch following wheel speed + throttle) and one-shot
 * effects. The AudioContext is created on the first user gesture.
 */
export function createAudio() {
  let ctx = null, master = null, engine = null, muted = false, noise = null;

  const ensure = () => {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  };

  const tone = (f0, f1, dur, { type = "triangle", vol = 0.12, at = 0 } = {}) => {
    if (!ctx || muted) return;
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
  const thud = (vol, freq = 400, dur = 0.25) => {
    if (!ctx || muted) return;
    const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise;
    f.type = "lowpass";
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  };

  const fx = {
    coin: () => (tone(1320, 1320, 0.06, { type: "square", vol: 0.05 }), tone(1760, 1760, 0.12, { type: "square", vol: 0.05, at: 0.05 })),
    bigcoin: () => [1047, 1319, 1568, 2093].forEach((f, k) => tone(f, f, 0.12, { type: "square", vol: 0.05, at: k * 0.05 })),
    fuel: () => (tone(300, 900, 0.3, { type: "sawtooth", vol: 0.06 }), tone(600, 1200, 0.25, { type: "triangle", vol: 0.08, at: 0.12 })),
    flip: () => [784, 988, 1175, 1568].forEach((f, k) => tone(f, f, 0.14, { type: "triangle", vol: 0.1, at: k * 0.07 })),
    air: () => tone(600, 1100, 0.2, { type: "triangle", vol: 0.08 }),
    land: (force = 5) => thud(Math.min(0.5, force * 0.04), 300),
    crash: () => (thud(0.6, 900, 0.6), tone(220, 60, 0.6, { type: "sawtooth", vol: 0.1 })),
    fuelOut: () => [523, 392, 262].forEach((f, k) => tone(f, f, 0.2, { type: "triangle", vol: 0.1, at: k * 0.15 })),
    buy: () => [659, 880, 1319].forEach((f, k) => tone(f, f, 0.15, { type: "triangle", vol: 0.1, at: k * 0.07 })),
    click: () => tone(900, 700, 0.05, { type: "triangle", vol: 0.06 }),
    deny: () => tone(200, 150, 0.15, { type: "square", vol: 0.05 }),
  };

  return {
    unlock: ensure,
    play(name, arg) {
      if (!muted && ensure()) fx[name]?.(arg);
    },
    /** Engine hum: rpm 0..1, throttle -1..1. Pass null to stop. */
    engine(rpm, throttle) {
      if (!ctx) return;
      if (rpm == null || muted) {
        if (engine) {
          const e = engine;
          engine = null;
          e.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
          setTimeout(() => (e.a.stop(), e.b.stop()), 300);
        }
        return;
      }
      if (!engine) {
        const a = ctx.createOscillator(), b = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        a.type = "sawtooth";
        b.type = "square";
        b.detune.value = -1200;
        f.type = "lowpass";
        f.frequency.value = 500;
        g.gain.value = 0;
        a.connect(f);
        b.connect(f);
        f.connect(g).connect(master);
        a.start();
        b.start();
        engine = { a, b, f, g };
      }
      const t = ctx.currentTime, hz = 42 + rpm * 110 + Math.abs(throttle) * 18;
      engine.a.frequency.setTargetAtTime(hz, t, 0.06);
      engine.b.frequency.setTargetAtTime(hz, t, 0.06);
      engine.f.frequency.setTargetAtTime(380 + rpm * 900 + Math.abs(throttle) * 400, t, 0.08);
      engine.g.gain.setTargetAtTime(0.035 + Math.abs(throttle) * 0.045, t, 0.08);
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    close() {
      engine = null;
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
