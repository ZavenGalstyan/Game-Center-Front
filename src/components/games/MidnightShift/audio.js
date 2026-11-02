/**
 * Midnight Shift — procedural WebAudio (no sound files, all original).
 * Beds: factory hum, desk fan, a tension drone that swells when a robot is
 * close. One-shots: footsteps (per robot, panned by side), door slams, light
 * buzz, monitor whir, camera static, the 6 AM chime, the power-out wind-down,
 * the Watcher's music-box tune and the jumpscare screech. Everything goes
 * through one master gain so mute is instant. The context is created on the
 * first user gesture (unlock()).
 */
let ctx = null, master = null, noiseBuf = null, verb = null;
let muted = false;
let beds = null;
let lightBuzz = { L: null, R: null };
let tuneTimer = null;
let tunePlay = null; // the tune's step function while it is playing (kept across pause)

const now = () => ctx.currentTime;

function makeNoise(seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function impulse(seconds = 2.2, decay = 3) {
  const n = ctx.sampleRate * seconds;
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}
function out(pan = 0, wet = 0.25) {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  if (wet > 0) {
    const s = ctx.createGain();
    s.gain.value = wet;
    p.connect(s).connect(verb);
  }
  return p;
}
function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function burst({ f = 800, f2 = null, q = 1, type = "bandpass", a = 0.004, d = 0.12, gain = 0.3, pan = 0, wet = 0.25, at = 0 }) {
  const t = now() + at;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  fl.Q.value = q;
  const g = ctx.createGain();
  s.connect(fl).connect(g).connect(out(pan, wet));
  env(g, t, a, gain, d);
  s.start(t, Math.random() * 1.2);
  s.stop(t + a + d + 0.05);
}
function tone({ f = 440, f2 = null, type = "sine", a = 0.01, d = 0.3, gain = 0.2, pan = 0, wet = 0.25, at = 0, detune = 0 }) {
  const t = now() + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  o.detune.value = detune;
  const g = ctx.createGain();
  o.connect(g).connect(out(pan, wet));
  env(g, t, a, gain, d);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

function startBeds() {
  if (beds || !ctx) return;
  const t = now();
  const humG = ctx.createGain();
  humG.gain.value = 0.0001;
  humG.gain.exponentialRampToValueAtTime(0.05, t + 2);
  humG.connect(out(0, 0.1));
  const oscs = [50, 100, 150.7].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i ? "sine" : "triangle";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = [0.6, 0.3, 0.12][i];
    o.connect(g).connect(humG);
    o.start();
    return o;
  });
  // machinery rumble
  const rum = ctx.createBufferSource();
  rum.buffer = noiseBuf;
  rum.loop = true;
  const rf = ctx.createBiquadFilter();
  rf.type = "lowpass";
  rf.frequency.value = 140;
  const rg = ctx.createGain();
  rg.gain.value = 0.09;
  rum.connect(rf).connect(rg).connect(humG);
  rum.start();
  // desk fan
  const fan = ctx.createBufferSource();
  fan.buffer = noiseBuf;
  fan.loop = true;
  const ff = ctx.createBiquadFilter();
  ff.type = "bandpass";
  ff.frequency.value = 520;
  ff.Q.value = 0.8;
  const fg = ctx.createGain();
  fg.gain.value = 0.018;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 9;
  const lg = ctx.createGain();
  lg.gain.value = 0.006;
  lfo.connect(lg).connect(fg.gain);
  fan.connect(ff).connect(fg).connect(out(0.1, 0));
  fan.start();
  lfo.start();
  // tension drone
  const tg = ctx.createGain();
  tg.gain.value = 0.0001;
  tg.connect(out(0, 0.5));
  const drones = [55, 58.3, 82.4].map((f) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 260;
    o.connect(lp).connect(tg);
    o.start();
    return o;
  });
  beds = { humG, oscs, rum, fan, fg, lfo, tg, drones, ambT: 6 };
}
function stopBeds() {
  if (!beds) return;
  const b = beds;
  beds = null;
  const t = now();
  try {
    b.humG.gain.cancelScheduledValues(t);
    b.humG.gain.setTargetAtTime(0.0001, t, 0.3);
    b.tg.gain.cancelScheduledValues(t);
    b.tg.gain.setTargetAtTime(0.0001, t, 0.2);
    b.fg.gain.setTargetAtTime(0.0001, t, 0.2);
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    for (const n of [...b.oscs, b.rum, b.fan, b.lfo, ...b.drones]) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
  }, 1500);
}
function stopLights() {
  for (const s of ["L", "R"]) {
    const n = lightBuzz[s];
    if (n) {
      try {
        n.g.gain.setTargetAtTime(0.0001, now(), 0.02);
        n.o.stop(now() + 0.1);
      } catch {
        /* ignore */
      }
    }
    lightBuzz[s] = null;
  }
}
function stopTune() {
  if (tuneTimer) clearInterval(tuneTimer);
  tuneTimer = null;
  tunePlay = null;
}

/* Footstep voices — each robot sounds different */
function step(id, pan, near) {
  const v = near ? 1 : 0.4;
  if (id === "rustjaw") {
    burst({ f: 90, type: "lowpass", d: 0.3, gain: 0.5 * v, pan, wet: 0.4 });
    tone({ f: 70, f2: 40, type: "triangle", d: 0.25, gain: 0.3 * v, pan });
    burst({ f: 2400, q: 6, d: 0.12, gain: 0.08 * v, pan, at: 0.03 });
    burst({ f: 90, type: "lowpass", d: 0.3, gain: 0.45 * v, pan, wet: 0.4, at: 0.5 });
    tone({ f: 66, f2: 38, type: "triangle", d: 0.25, gain: 0.28 * v, pan, at: 0.5 });
  } else if (id === "velvet") {
    for (let i = 0; i < 3; i++) {
      burst({ f: 3200, q: 8, d: 0.04, gain: 0.08 * v, pan, wet: 0.35, at: i * 0.26 });
      tone({ f: 1800 + i * 40, type: "sine", d: 0.05, gain: 0.025 * v, pan, at: i * 0.26 + 0.12 });
    }
  } else {
    for (let i = 0; i < 6; i++) burst({ f: 1500 + Math.random() * 3000, q: 2, d: 0.03, gain: 0.07 * v, pan, wet: 0.2, at: Math.random() * 0.5 });
  }
}

const TUNE = [659, 587, 523, 494, 523, 440, 392, 440, 494, 392, 330, 349];

export const audio = {
  unlock() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return;
    }
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try {
      ctx = new AC();
    } catch {
      ctx = null;
      return;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    noiseBuf = makeNoise(2);
    verb = ctx.createConvolver();
    verb.buffer = impulse();
    verb.connect(master);
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.02);
  },
  ready: () => !!ctx,
  startNight() {
    if (!ctx) return;
    stopTune();
    stopLights();
    startBeds();
  },
  stopAll() {
    if (!ctx) return;
    stopTune();
    stopLights();
    stopBeds();
  },
  pause() {
    if (tuneTimer) clearInterval(tuneTimer);
    tuneTimer = null;
    if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
  },
  resume() {
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    if (tunePlay && !tuneTimer) tuneTimer = setInterval(tunePlay, 420);
  },
  /** called every frame with how threatening things are (0..1) */
  tension(x) {
    if (!beds) return;
    beds.tg.gain.setTargetAtTime(0.0001 + 0.05 * Math.max(0, Math.min(1, x)), now(), 0.6);
  },
  /** ambient factory noises — call once per frame with dt */
  ambience(dt) {
    if (!beds) return;
    beds.ambT -= dt;
    if (beds.ambT > 0) return;
    beds.ambT = 7 + Math.random() * 12;
    const pan = Math.random() * 2 - 1;
    const r = Math.random();
    if (r < 0.35) {
      // distant metal clank
      tone({ f: 180 + Math.random() * 120, type: "triangle", d: 1.2, gain: 0.05, pan, wet: 0.9 });
      burst({ f: 900, q: 10, d: 0.6, gain: 0.04, pan, wet: 0.9 });
    } else if (r < 0.6) {
      // steam hiss
      burst({ f: 5000, f2: 3000, type: "highpass", a: 0.2, d: 1.4, gain: 0.025, pan, wet: 0.5 });
    } else if (r < 0.8) {
      // chain rattle
      for (let i = 0; i < 5; i++) burst({ f: 2800, q: 9, d: 0.05, gain: 0.03, pan, wet: 0.7, at: i * 0.09 });
    } else {
      // a toy's tinny squeak far away
      tone({ f: 1200, f2: 900, type: "square", a: 0.01, d: 0.25, gain: 0.012, pan, wet: 0.9 });
    }
  },
  event(e) {
    if (!ctx) return;
    switch (e.type) {
      case "start":
        startBeds();
        break;
      case "doorClose":
        burst({ f: 200, f2: 60, type: "lowpass", d: 0.35, gain: 0.55, pan: e.side === "L" ? -0.8 : 0.8, wet: 0.3 });
        burst({ f: 1600, f2: 400, q: 3, a: 0.02, d: 0.25, gain: 0.08, pan: e.side === "L" ? -0.8 : 0.8 });
        tone({ f: 60, f2: 35, type: "sine", d: 0.3, gain: 0.35, pan: e.side === "L" ? -0.8 : 0.8, at: 0.12 });
        break;
      case "doorOpen":
        burst({ f: 900, f2: 1800, q: 3, a: 0.05, d: 0.35, gain: 0.07, pan: e.side === "L" ? -0.8 : 0.8 });
        burst({ f: 120, type: "lowpass", d: 0.2, gain: 0.25, pan: e.side === "L" ? -0.8 : 0.8, at: 0.3 });
        break;
      case "lightOn": {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = 120;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1200;
        f.Q.value = 2;
        const g = ctx.createGain();
        g.gain.value = 0.02;
        o.connect(f).connect(g).connect(out(e.side === "L" ? -0.8 : 0.8, 0));
        o.start();
        if (lightBuzz[e.side]) lightBuzz[e.side].o.stop();
        lightBuzz[e.side] = { o, g };
        tone({ f: 900, type: "square", d: 0.03, gain: 0.03, pan: e.side === "L" ? -0.8 : 0.8 });
        // a short sting when something is standing there
        if (e.seen && e.seen.length) {
          tone({ f: 233, type: "sawtooth", a: 0.01, d: 0.9, gain: 0.07, wet: 0.6 });
          tone({ f: 247, type: "sawtooth", a: 0.01, d: 0.9, gain: 0.07, wet: 0.6 });
        }
        break;
      }
      case "lightOff": {
        const n = lightBuzz[e.side];
        if (n) {
          n.g.gain.setTargetAtTime(0.0001, now(), 0.02);
          n.o.stop(now() + 0.1);
          lightBuzz[e.side] = null;
        }
        break;
      }
      case "monitorUp":
        tone({ f: 300, f2: 900, type: "triangle", a: 0.02, d: 0.2, gain: 0.04, wet: 0 });
        burst({ f: 3000, q: 1, d: 0.2, gain: 0.05, wet: 0 });
        break;
      case "monitorDown":
        tone({ f: 800, f2: 250, type: "triangle", a: 0.02, d: 0.18, gain: 0.04, wet: 0 });
        break;
      case "camSwitch":
        burst({ f: 4000, q: 0.6, a: 0.002, d: 0.16, gain: 0.08, wet: 0 });
        tone({ f: 1400, type: "square", d: 0.02, gain: 0.015, wet: 0 });
        break;
      case "camGlitch":
        burst({ f: 2500, q: 0.4, a: 0.01, d: 0.7, gain: 0.12, wet: 0 });
        break;
      case "move":
        // footsteps you can hear: from the halls and doorways (near) and the rooms beside them (faint)
        if (e.dist <= 2) step(e.id, e.pan, e.dist <= 1);
        break;
      case "arrive":
        if (e.id === "velvet") tone({ f: 1046, type: "sine", a: 0.005, d: 0.8, gain: 0.03, pan: e.side === "L" ? -0.9 : 0.9, wet: 0.7, at: 0.8 });
        if (e.id === "hollow") burst({ f: 6000, f2: 2000, q: 1, a: 0.2, d: 1.0, gain: 0.04, pan: e.side === "L" ? -0.9 : 0.9, wet: 0.5 });
        break;
      case "blocked": {
        const pan = e.side === "L" ? -0.9 : 0.9;
        for (let i = 0; i < (e.id === "rustjaw" ? 3 : 2); i++) {
          burst({ f: 150, type: "lowpass", d: 0.25, gain: 0.5, pan, wet: 0.4, at: i * 0.32 });
          tone({ f: 90, f2: 45, type: "triangle", d: 0.2, gain: 0.25, pan, at: i * 0.32 });
        }
        step(e.id, pan, true);
        break;
      }
      case "hour":
        if (e.hour > 0 && e.hour < 6) tone({ f: 392, type: "sine", a: 0.01, d: 1.2, gain: 0.05, wet: 0.7 });
        break;
      case "tip":
        tone({ f: 660, type: "sine", d: 0.12, gain: 0.03, wet: 0.3 });
        break;
      case "powerOut":
        stopLights();
        stopBeds();
        tone({ f: 220, f2: 30, type: "sawtooth", a: 0.01, d: 2.2, gain: 0.12, wet: 0.5 });
        burst({ f: 400, f2: 60, type: "lowpass", a: 0.01, d: 1.2, gain: 0.3, wet: 0.6 });
        break;
      case "tune": {
        let i = 0;
        stopTune();
        const play = () => {
          const f = TUNE[i % TUNE.length];
          tone({ f, type: "sine", a: 0.003, d: 0.9, gain: 0.06, pan: -0.85, wet: 0.7 });
          tone({ f: f * 2, type: "sine", a: 0.003, d: 0.4, gain: 0.015, pan: -0.85, wet: 0.7 });
          i++;
        };
        play();
        tunePlay = play;
        tuneTimer = setInterval(play, 420);
        break;
      }
      case "tuneEnd":
        stopTune();
        break;
      case "jumpscare": {
        stopTune();
        stopLights();
        const base = { rustjaw: 180, velvet: 520, hollow: 340 }[e.id] || 300;
        for (const [k, type] of [[1, "sawtooth"], [1.06, "square"], [1.5, "sawtooth"], [0.5, "square"]])
          tone({ f: base * k, f2: base * k * 0.6, type, a: 0.01, d: 1.4, gain: 0.11, wet: 0.3 });
        burst({ f: 3000, q: 0.5, a: 0.005, d: 1.4, gain: 0.35, wet: 0.3 });
        burst({ f: 100, type: "lowpass", a: 0.005, d: 0.6, gain: 0.6, wet: 0.2 });
        stopBeds();
        break;
      }
      case "won": {
        stopTune();
        stopLights();
        stopBeds();
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => {
          tone({ f, type: "sine", a: 0.005, d: 1.6, gain: 0.07, wet: 0.6, at: i * 0.32 });
          tone({ f: f * 2.01, type: "sine", a: 0.005, d: 0.8, gain: 0.02, wet: 0.6, at: i * 0.32 });
        });
        break;
      }
      default:
        break;
    }
  },
  click() {
    if (ctx) tone({ f: 700, type: "square", d: 0.025, gain: 0.02, wet: 0 });
  },
  dispose() {
    stopTune();
    stopLights();
    stopBeds();
    const c = ctx;
    ctx = null;
    master = null;
    beds = null;
    if (c) setTimeout(() => c.close().catch(() => {}), 1600);
  },
};
