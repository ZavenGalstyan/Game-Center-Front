/**
 * The Cursed House — procedural WebAudio (no sound files).
 *
 * Beds: house drone + wind against the windows, the tension score (rises
 * while she chases you), heartbeat (she is near), the hall clock ticking.
 * One-shots: footsteps on wood / tile / stone / stairs (yours and hers —
 * hers are panned and attenuated by distance and floors), door creaks and
 * thuds, keys, the lock, wardrobe/bed creaks, her humming, her shriek when
 * she spots you, the capture scare, random house creaks. Everything goes
 * through one master gain so mute is instant. The context is created on
 * the first user gesture.
 */
let ctx = null, master = null, noiseBuf = null;
let muted = false;
let beds = null;
let nextCreak = 8, heartT = 0, tickT = 0, humBusy = 0;

const now = () => ctx.currentTime;
function noise(seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = w * 0.35 + last * 3;
  }
  return b;
}
function src(loop = true) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = loop;
  return s;
}
function env(g, t, a, peak, d) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function out(pan = 0) {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  return p;
}
function burst({ f = 800, f2 = null, q = 1, type = "bandpass", a = 0.005, d = 0.15, gain = 0.3, rate = 1, pan = 0, at = 0 }) {
  const t = now() + at;
  const s = src(false);
  s.playbackRate.value = rate;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  fl.Q.value = q;
  const g = ctx.createGain();
  s.connect(fl).connect(g).connect(out(pan));
  env(g, t, a, gain, d);
  s.start(t, Math.random() * 2);
  s.stop(t + a + d + 0.05);
}
function tone({ f = 440, f2 = null, type = "sine", a = 0.01, d = 0.4, gain = 0.2, pan = 0, at = 0, detune = 0, vib = 0 }) {
  const t = now() + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  o.detune.value = detune;
  if (vib) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = 5.5;
    lg.gain.value = vib;
    l.connect(lg).connect(o.frequency);
    l.start(t);
    l.stop(t + a + d + 0.05);
  }
  const g = ctx.createGain();
  o.connect(g).connect(out(pan));
  env(g, t, a, gain, d);
  o.start(t);
  o.stop(t + a + d + 0.05);
}
/** a wooden creak: a resonant filter swept over a buzzy source */
function creak({ gain = 0.12, d = 0.6, f = 520, f2 = 380, pan = 0, at = 0 }) {
  const t = now() + at;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(38 + Math.random() * 20, t);
  o.frequency.linearRampToValueAtTime(26 + Math.random() * 18, t + d);
  const fl = ctx.createBiquadFilter();
  fl.type = "bandpass";
  fl.Q.value = 14;
  fl.frequency.setValueAtTime(f, t);
  fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  const g = ctx.createGain();
  o.connect(fl).connect(g).connect(out(pan));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + d * 0.25);
  g.gain.setValueAtTime(gain * 0.8, t + d * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.start(t);
  o.stop(t + d + 0.05);
}

function buildBeds() {
  // house drone: low noise + two detuned sines
  const hum = src();
  const hf = ctx.createBiquadFilter();
  hf.type = "lowpass";
  hf.frequency.value = 140;
  const hg = ctx.createGain();
  hg.gain.value = 0;
  hum.connect(hf).connect(hg).connect(master);
  hum.start();
  const dr = [55, 55.7].map((f) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(hg);
    o.start();
    return o;
  });
  // wind pressing on the windows
  const wind = src();
  const wf = ctx.createBiquadFilter();
  wf.type = "bandpass";
  wf.Q.value = 0.8;
  wf.frequency.value = 500;
  const wg = ctx.createGain();
  wg.gain.value = 0;
  wind.connect(wf).connect(wg).connect(master);
  wind.start();
  // tension score: low pulsing fifths + a sour high cluster
  const sg = ctx.createGain();
  sg.gain.value = 0;
  const sf = ctx.createBiquadFilter();
  sf.type = "lowpass";
  sf.frequency.value = 900;
  sg.connect(sf).connect(master);
  const pulse = ctx.createGain();
  pulse.gain.value = 0.6;
  pulse.connect(sg);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 2.2;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.4;
  lfo.connect(lfoG).connect(pulse.gain);
  lfo.start();
  const sOsc = [[73.4, "sawtooth", 0.16], [110, "sawtooth", 0.1], [77.8, "sawtooth", 0.08], [622, "sine", 0.025], [659, "sine", 0.02], [698, "triangle", 0.015]].map(([f, type, gain]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(f > 300 ? sg : pulse);
    o.start();
    return o;
  });
  return { hum, hg, dr, wind, wf, wg, sg, sf, lfo, sOsc };
}

/** distance / floor attenuation and pan for a sound at (x,y,z) heard by the player */
function spatial(g, x, y, z, range = 18) {
  const P = g.player;
  const dx = x - P.x, dz = z - P.z, dy = y - P.y;
  const d = Math.hypot(dx, dz, dy * 1.5);
  let v = Math.max(0, 1 - d / range);
  v *= v;
  if (Math.abs(dy) > 1.5) v *= 0.45; // muffled through the floor
  const fl = Math.hypot(dx, dz) || 1;
  const pan = (dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw)) / fl;
  return { v, pan: pan * 0.8, d };
}

const LULLABY = [392, 440, 392, 349, 330, 349, 294, 330, 262];

export const audio = {
  unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.9;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        master.connect(comp).connect(ctx.destination);
        noiseBuf = noise(3);
        beds = buildBeds();
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    } catch {
      ctx = null;
    }
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.05);
  },
  /** continuous layers, driven from the game state each frame */
  update(g, dt, active) {
    if (!ctx || !beds) return;
    const t = now();
    const playing = active && g && g.state === "play";
    const E = g && g.enemy;
    const near = E && !E.disabled ? Math.max(0, 1 - E.dist / 9) : 0;
    const chase = playing && E && (E.mode === "chase" || E.mode === "alert" || E.mode === "pull");
    beds.hg.gain.setTargetAtTime(active ? 0.05 : 0.03, t, 0.6);
    beds.wg.gain.setTargetAtTime(active ? 0.035 + 0.025 * Math.sin(t * 0.17) ** 2 : 0.02, t, 0.8);
    beds.wf.frequency.setTargetAtTime(380 + 300 * (0.5 + 0.5 * Math.sin(t * 0.11)), t, 0.6);
    beds.sg.gain.setTargetAtTime(chase ? 0.55 : playing ? near * 0.12 : 0, t, chase ? 0.15 : 1.2);
    beds.sf.frequency.setTargetAtTime(chase ? 1600 : 700, t, 0.3);
    beds.lfo.frequency.setTargetAtTime(chase ? 4.4 : 2.2, t, 0.3);
    if (!playing) return;
    // heartbeat while she is close
    const fear = chase ? 1 : near;
    if (fear > 0.15 || g.player.hidden) {
      heartT -= dt;
      if (heartT <= 0) {
        const f = Math.max(fear, g.player.hidden ? 0.35 : 0);
        heartT = 1.05 - f * 0.55;
        tone({ f: 60, f2: 42, a: 0.01, d: 0.13, gain: 0.3 * f });
        tone({ f: 54, f2: 38, a: 0.01, d: 0.15, gain: 0.22 * f, at: 0.19 });
      }
    }
    // the hall clock
    const P = g.player;
    const cd = Math.hypot(P.x - 11.6, P.z - 1.3, (P.y - 0) * 2);
    if (cd < 9) {
      tickT -= dt;
      if (tickT <= 0) {
        tickT = 1;
        const v = (1 - cd / 9) ** 2;
        burst({ f: 3200, q: 6, a: 0.001, d: 0.03, gain: 0.05 * v });
        burst({ f: 2400, q: 6, a: 0.001, d: 0.03, gain: 0.04 * v, at: 0.5 });
      }
    }
    // the house settling
    nextCreak -= dt;
    if (nextCreak <= 0) {
      nextCreak = 9 + Math.random() * 14;
      const r = Math.random(), pan = Math.random() * 1.6 - 0.8;
      if (r < 0.5) creak({ gain: 0.035, d: 0.5 + Math.random() * 0.8, f: 300 + Math.random() * 400, f2: 200 + Math.random() * 200, pan });
      else if (r < 0.75) burst({ f: 120, q: 0.7, type: "lowpass", a: 0.004, d: 0.25, gain: 0.12, pan }); // distant thud
      else burst({ f: 900, f2: 300, q: 2, a: 0.6, d: 1.4, gain: 0.03, pan }); // a draught
    }
    humBusy -= dt;
  },
  play(name, o = {}, g = null) {
    if (!ctx) return;
    switch (name) {
      case "step": {
        const s = o.surface;
        const gain = o.crouch ? 0.03 : o.sprint ? 0.12 : 0.07;
        if (s === "tile") burst({ f: 2400, q: 1.8, a: 0.002, d: 0.06, gain: gain * 0.9, rate: 1.4 });
        else if (s === "stone") burst({ f: 900, q: 0.9, a: 0.002, d: 0.08, gain: gain * 1.1 });
        else {
          burst({ f: s === "stair" ? 260 : 340, q: 1.2, a: 0.003, d: 0.1, gain: gain * 1.3 });
          if (Math.random() < (s === "stair" ? 0.5 : 0.18) && !o.crouch) creak({ gain: 0.03, d: 0.25 + Math.random() * 0.2, f: 600 + Math.random() * 300, f2: 420 });
        }
        if (o.breath) burst({ f: 1300, q: 0.6, a: 0.12, d: 0.35, gain: 0.03, at: 0.05 });
        break;
      }
      case "enemyStep": {
        if (!g) break;
        const { v, pan } = spatial(g, o.x, o.y, o.z, 16);
        if (v < 0.01) break;
        burst({ f: 220, q: 1.1, a: 0.004, d: 0.14, gain: (o.chase ? 0.4 : 0.26) * v, pan });
        if (Math.random() < 0.35) creak({ gain: 0.08 * v, d: 0.3, f: 480, f2: 330, pan });
        break;
      }
      case "door": {
        const sp = g ? spatial(g, o.x, o.y + 1, o.z, 20) : { v: 1, pan: 0 };
        const v = Math.max(0.15, sp.v);
        if (o.open) creak({ gain: 0.16 * v, d: 0.9, f: 700, f2: 340, pan: sp.pan });
        else {
          creak({ gain: 0.1 * v, d: 0.45, f: 420, f2: 600, pan: sp.pan });
          burst({ f: 140, q: 0.8, type: "lowpass", a: 0.002, d: 0.22, gain: 0.35 * v, pan: sp.pan, at: 0.4 });
        }
        break;
      }
      case "doorHandle": {
        const sp = g ? spatial(g, o.x ?? 0, o.y ?? 0, o.z ?? 0, 16) : { v: 0.5, pan: 0 };
        burst({ f: 2600, q: 5, a: 0.002, d: 0.06, gain: 0.12 * Math.max(0.2, sp.v), pan: sp.pan });
        break;
      }
      case "locked":
        for (let i = 0; i < 3; i++) burst({ f: 1800, q: 4, a: 0.002, d: 0.06, gain: 0.18, at: i * 0.09 });
        burst({ f: 160, q: 1, type: "lowpass", a: 0.003, d: 0.2, gain: 0.25, at: 0.05 });
        break;
      case "unlock":
        for (let i = 0; i < 3; i++) {
          burst({ f: 2100, q: 6, a: 0.002, d: 0.08, gain: 0.22, at: i * 0.35 });
          burst({ f: 500, q: 2, a: 0.002, d: 0.12, gain: 0.2, at: i * 0.35 + 0.06 });
        }
        creak({ gain: 0.2, d: 1.6, f: 500, f2: 260, at: 1.1 });
        tone({ f: 196, f2: 196, type: "triangle", a: 0.4, d: 2.2, gain: 0.07, at: 1.1 });
        break;
      case "key":
        tone({ f: 1568, a: 0.004, d: 0.4, gain: 0.08 });
        tone({ f: 2093, a: 0.004, d: 0.5, gain: 0.06, at: 0.08 });
        burst({ f: 4200, q: 6, a: 0.001, d: 0.05, gain: 0.1 });
        burst({ f: 3600, q: 6, a: 0.001, d: 0.05, gain: 0.08, at: 0.07 });
        break;
      case "container":
        if (o.id === "fridge") {
          burst({ f: 300, q: 0.7, a: 0.01, d: 0.15, gain: 0.15 });
          tone({ f: 120, a: 0.05, d: 0.6, gain: 0.04 });
        } else if (o.id === "dresser") burst({ f: 500, f2: 260, q: 1.5, a: 0.05, d: 0.35, gain: 0.16 });
        else {
          burst({ f: 1400, q: 3, a: 0.002, d: 0.1, gain: 0.15 });
          creak({ gain: 0.06, d: 0.4, f: 900, f2: 700 });
        }
        break;
      case "hide":
        if (o.kind === "wardrobe") creak({ gain: 0.09, d: 0.6, f: 520, f2: 380 });
        else burst({ f: 700, q: 0.8, a: 0.03, d: 0.3, gain: 0.08 }); // cloth rustle
        break;
      case "spotted": {
        // her shriek: a rising wavering scream + a stinger chord
        const t = now();
        const o1 = ctx.createOscillator();
        o1.type = "sawtooth";
        o1.frequency.setValueAtTime(420, t);
        o1.frequency.exponentialRampToValueAtTime(980, t + 0.35);
        o1.frequency.exponentialRampToValueAtTime(760, t + 0.9);
        const l = ctx.createOscillator(), lg = ctx.createGain();
        l.frequency.value = 9;
        lg.gain.value = 35;
        l.connect(lg).connect(o1.frequency);
        const fl = ctx.createBiquadFilter();
        fl.type = "bandpass";
        fl.frequency.value = 1400;
        fl.Q.value = 2;
        const gg = ctx.createGain();
        o1.connect(fl).connect(gg).connect(out(0));
        env(gg, t, 0.06, 0.16, 0.85);
        o1.start(t);
        l.start(t);
        o1.stop(t + 1);
        l.stop(t + 1);
        tone({ f: 155.6, type: "sawtooth", a: 0.01, d: 1.1, gain: 0.08 });
        tone({ f: 164.8, type: "sawtooth", a: 0.01, d: 1.1, gain: 0.07 });
        burst({ f: 200, q: 0.5, type: "lowpass", a: 0.005, d: 0.6, gain: 0.3 });
        break;
      }
      case "lost":
        tone({ f: 110, f2: 98, type: "triangle", a: 0.3, d: 1.6, gain: 0.05 });
        break;
      case "inspect": {
        if (!g) break;
        const { v, pan } = spatial(g, g.enemy.x, g.enemy.y, g.enemy.z, 14);
        creak({ gain: 0.1 * Math.max(0.3, v), d: 0.8, f: 520, f2: 330, pan });
        burst({ f: 900, q: 0.8, a: 0.4, d: 0.8, gain: 0.05 * Math.max(0.3, v), pan, at: 0.4 }); // a long sniff
        break;
      }
      case "hum": {
        if (!g || humBusy > 0) break;
        const { v, pan } = spatial(g, o.x, o.y, o.z, 15);
        if (v < 0.02) break;
        humBusy = 4;
        const start = Math.floor(Math.random() * 3);
        for (let i = 0; i < 5; i++) {
          const f = LULLABY[(start + i) % LULLABY.length] * 0.5;
          tone({ f, type: "triangle", a: 0.08, d: 0.5, gain: 0.07 * v, pan, at: i * 0.55, vib: 4 });
          tone({ f: f * 2.01, type: "sine", a: 0.08, d: 0.45, gain: 0.015 * v, pan, at: i * 0.55 });
        }
        break;
      }
      case "caught": {
        const t = now();
        // a short, loud (compressed) scream and a low hit — no long sustained noise
        burst({ f: 1600, f2: 700, q: 1.2, a: 0.01, d: 0.9, gain: 0.45 });
        const o1 = ctx.createOscillator();
        o1.type = "sawtooth";
        o1.frequency.setValueAtTime(880, t);
        o1.frequency.exponentialRampToValueAtTime(330, t + 0.9);
        const gg = ctx.createGain();
        o1.connect(gg).connect(out(0));
        env(gg, t, 0.01, 0.12, 0.9);
        o1.start(t);
        o1.stop(t + 1);
        tone({ f: 55, f2: 35, a: 0.005, d: 1.2, gain: 0.5 });
        break;
      }
      case "respawn":
        tone({ f: 98, f2: 92, type: "triangle", a: 0.5, d: 2.0, gain: 0.06 });
        break;
      case "win":
        [262, 330, 392, 523].forEach((f, i) => tone({ f, type: "triangle", a: 0.3, d: 2.8, gain: 0.06, at: i * 0.18 }));
        break;
      case "gameover":
        [110, 104, 98].forEach((f, i) => tone({ f, type: "sawtooth", a: 0.2, d: 1.4, gain: 0.05, at: i * 0.45 }));
        break;
      case "light":
        burst({ f: 3200, q: 3, a: 0.001, d: 0.03, gain: 0.12 });
        break;
      case "blocked":
        burst({ f: 180, q: 1, type: "lowpass", a: 0.002, d: 0.12, gain: 0.2 });
        break;
      case "empty":
        burst({ f: 400, q: 1, a: 0.01, d: 0.2, gain: 0.05 });
        break;
      default:
        break;
    }
  },
  dispose() {
    try {
      if (ctx) ctx.close();
    } catch {
      /* ignore */
    }
    ctx = null;
    master = null;
    beds = null;
  },
};
