/**
 * Escape 100 — all sound is synthesized with WebAudio (no files): effects for
 * every interaction plus a looping ambience per chapter. Master / effects /
 * ambience volumes and mute. The AudioContext starts on the first gesture.
 */
export function createAudio() {
  let ctx = null, master, sfx, amb, noiseBuf = null;
  let vol = { master: 0.8, sfx: 0.9, amb: 0.5 }, muted = false;
  let ambKind = null, ambNodes = [], ambTimer = 0;

  const ensure = () => {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      sfx = ctx.createGain();
      amb = ctx.createGain();
      sfx.connect(master);
      amb.connect(master);
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      applyVol();
      if (ambKind) startAmb(ambKind);
      return true;
    } catch {
      ctx = null;
      return false;
    }
  };
  const applyVol = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.05);
    sfx.gain.setTargetAtTime(vol.sfx * 0.6, t, 0.05);
    amb.gain.setTargetAtTime(vol.amb * 0.35, t, 0.3);
  };

  const tone = (f0, f1, dur, { type = "sine", v = 0.2, at = 0, out = sfx, attack = 0.006 } = {}) => {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const noise = (dur, { f = 1200, q = 1, v = 0.2, at = 0, type = "bandpass", out = sfx, f1 } = {}) => {
    const t = ctx.currentTime + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(out);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  };
  const clack = (at = 0, f = 2400, v = 0.25) => (noise(0.04, { f, q: 3, v, at }), tone(f / 6, f / 10, 0.05, { type: "square", v: v * 0.25, at }));

  const SFX = {
    tap: () => clack(0, 3000, 0.12),
    click: () => clack(0, 2600, 0.18),
    open: () => (noise(0.5, { f: 600, q: 8, v: 0.08, f1: 1400 }), tone(180, 260, 0.45, { type: "sawtooth", v: 0.02 }), clack(0.02, 1800, 0.15)),
    close: () => (clack(0, 1400, 0.3), tone(110, 70, 0.15, { v: 0.2 })),
    drawer: () => noise(0.35, { f: 500, q: 0.8, v: 0.15, type: "lowpass" }),
    locked: () => {
      for (let i = 0; i < 3; i++) clack(i * 0.07, 1600 + i * 200, 0.2);
    },
    deny: () => tone(220, 160, 0.18, { type: "triangle", v: 0.12 }),
    buzz: () => (tone(110, 105, 0.35, { type: "sawtooth", v: 0.12 }), tone(117, 112, 0.35, { type: "square", v: 0.05 })),
    unlock: () => (clack(0, 2000, 0.25), clack(0.12, 2800, 0.3), tone(880, 1320, 0.2, { v: 0.08, at: 0.12 })),
    pickup: () => [988, 1319, 1760].forEach((f, i) => tone(f, f, 0.18, { type: "triangle", v: 0.1, at: i * 0.05 })),
    place: () => (clack(0, 1200, 0.3), tone(160, 90, 0.2, { v: 0.25 })),
    lever: () => (noise(0.12, { f: 900, q: 2, v: 0.2 }), clack(0.1, 1500, 0.35), tone(90, 60, 0.2, { v: 0.2, at: 0.1 })),
    dial: () => (clack(0, 3200, 0.14), clack(0.04, 2600, 0.08)),
    press: () => (clack(0, 2200, 0.2), tone(660, 660, 0.06, { type: "square", v: 0.04 })),
    bell: (f = 660) => [1, 2.76, 5.4].forEach((m, i) => tone(f * m, f * m, 1.4 - i * 0.35, { v: 0.12 / (i + 1) })),
    key: (d = 0) => tone(700 + d * 70, 700 + d * 70, 0.08, { type: "square", v: 0.05 }),
    power: () => (tone(60, 240, 0.8, { type: "sawtooth", v: 0.06 }), noise(0.8, { f: 300, f1: 3000, q: 2, v: 0.06 })),
    solve: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.35, { type: "triangle", v: 0.09, at: i * 0.08 })),
    move: () => (noise(0.6, { f: 300, q: 0.6, v: 0.18, type: "lowpass" }), tone(70, 50, 0.6, { v: 0.12 })),
    door: () => (noise(1.6, { f: 200, q: 0.7, v: 0.25, type: "lowpass", f1: 600 }), tone(90, 140, 1.4, { type: "sawtooth", v: 0.04 }), clack(0, 1200, 0.4)),
    win: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.5, { type: "triangle", v: 0.1, at: 0.3 + i * 0.1 })),
    hint: () => [880, 1175].forEach((f, i) => tone(f, f, 0.3, { v: 0.07, at: i * 0.09 })),
    combine: () => (clack(0, 1800, 0.25), [660, 990, 1320].forEach((f, i) => tone(f, f, 0.2, { type: "triangle", v: 0.08, at: 0.08 + i * 0.06 }))),
    timer: () => tone(1200, 1200, 0.05, { type: "square", v: 0.04 }),
    page: () => noise(0.25, { f: 3500, q: 0.8, v: 0.08 }),
    final: () => [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => (tone(f, f, 1.2, { type: "triangle", v: 0.08, at: i * 0.15 }), tone(f / 2, f / 2, 1.4, { v: 0.05, at: i * 0.15 }))),
  };

  /* ---------- ambience ---------- */
  function stopAmb() {
    clearInterval(ambTimer);
    for (const n of ambNodes) {
      try {
        n.stop?.();
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
    ambNodes = [];
  }
  function loopNoise(f, q, v, type = "lowpass", lfo = 0) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    s.loop = true;
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    g.gain.value = v;
    s.connect(fl).connect(g).connect(amb);
    s.start();
    ambNodes.push(s, fl, g);
    if (lfo) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.value = lfo;
      og.gain.value = f * 0.5;
      o.connect(og).connect(fl.frequency);
      o.start();
      ambNodes.push(o, og);
    }
  }
  function drone(freqs, v, type = "sine") {
    for (const f of freqs) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 12;
      g.gain.value = v;
      o.connect(g).connect(amb);
      o.start();
      ambNodes.push(o, g);
    }
  }
  function every(ms, fn) {
    ambTimer = setInterval(() => ctx && ctx.state === "running" && fn(), ms);
  }
  function startAmb(kind) {
    stopAmb();
    switch (kind) {
      case "drip":
        loopNoise(400, 0.5, 0.25);
        every(1400, () => Math.random() < 0.6 && tone(1400 + Math.random() * 900, 500, 0.12, { v: 0.15, out: amb }));
        break;
      case "clock":
        loopNoise(300, 0.5, 0.15);
        drone([55, 82.5], 0.05);
        every(1000, () => (clack(0, 3600, 0.05), tone(1800, 1800, 0.02, { type: "square", v: 0.02, out: amb })));
        break;
      case "hum":
        drone([60, 120, 180], 0.06, "sine");
        loopNoise(2000, 0.4, 0.06, "highpass");
        every(3000, () => Math.random() < 0.4 && tone(1600, 1600, 0.08, { type: "square", v: 0.04, out: amb }));
        break;
      case "wind":
        loopNoise(500, 2, 0.35, "bandpass", 0.08);
        every(5000, () => Math.random() < 0.3 && noise(0.6, { f: 2500, q: 4, v: 0.04, out: amb }));
        break;
      case "vent":
        loopNoise(250, 0.6, 0.35);
        drone([48], 0.05, "sawtooth");
        every(4200, () => Math.random() < 0.3 && tone(880, 880, 0.15, { type: "square", v: 0.03, out: amb }));
        break;
      case "eerie":
        drone([110, 164.8, 207.6], 0.035, "sine");
        loopNoise(900, 1, 0.08, "bandpass", 0.05);
        every(6000, () => Math.random() < 0.4 && tone(990, 940, 1.6, { v: 0.03, out: amb }));
        break;
      case "machine":
        drone([41, 82], 0.06, "sawtooth");
        loopNoise(600, 0.8, 0.1);
        every(800, () => clack(0, 900 + Math.random() * 300, 0.07));
        break;
      case "space":
        drone([36, 54], 0.06, "sine");
        loopNoise(150, 0.5, 0.15);
        every(4000, () => Math.random() < 0.5 && [1320, 1760].forEach((f, i) => tone(f, f, 0.08, { v: 0.025, at: i * 0.1, out: amb })));
        break;
      case "drone":
        drone([65.4, 98, 130.8, 196.2], 0.03, "triangle");
        loopNoise(1400, 3, 0.05, "bandpass", 0.03);
        break;
      default:
        drone([65.4, 98, 130.8], 0.035, "sine");
        loopNoise(500, 1, 0.08, "bandpass", 0.04);
    }
  }

  return {
    play(name, arg) {
      if (muted || !SFX[name] || !ensure()) return;
      try {
        SFX[name](arg);
      } catch {
        /* audio unavailable */
      }
    },
    ambience(kind) {
      ambKind = kind;
      if (!ctx) return;
      try {
        if (kind) startAmb(kind);
        else stopAmb();
      } catch {
        /* ignore */
      }
    },
    unlock: () => ensure(),
    set(v) {
      vol = { ...vol, ...v };
      applyVol();
    },
    setMuted(m) {
      muted = m;
      applyVol();
    },
    dispose() {
      stopAmb();
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
