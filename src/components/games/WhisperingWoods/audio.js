/**
 * Whispering Woods — procedural WebAudio (no sound files).
 *
 * Beds: wind, crickets (fall silent when the creature is near), creature
 * drone (panned to its side), heartbeat (fear), breathing (low stamina).
 * One-shots: footsteps, note pickup, stings, branch snaps, owls, whispers,
 * gate creak, the catch scream. All levels go through one master gain so
 * mute is instant. The context is created on the first user gesture.
 */
let ctx = null, master = null, noiseBuf = null;
let muted = false;
let beds = null;
let nextAmbient = 6, nextCricket = 0, heartT = 0;

function noise(seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02; // brownish
    d[i] = w * 0.35 + last * 3;
  }
  return b;
}
const now = () => ctx.currentTime;

function src(loop = true) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = loop;
  return s;
}

function env(gainNode, t, a, peak, d) {
  gainNode.gain.cancelScheduledValues(t);
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(peak, t + a);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function burst({ f = 800, q = 1, type = "bandpass", a = 0.005, d = 0.15, gain = 0.3, rate = 1, pan = 0, at = 0 }) {
  const t = now() + at;
  const s = src(false);
  s.playbackRate.value = rate;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = ctx.createGain();
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  s.connect(fl).connect(g).connect(p).connect(master);
  env(g, t, a, gain, d);
  s.start(t, Math.random() * 1.5);
  s.stop(t + a + d + 0.05);
}

function tone({ f = 440, f2 = null, type = "sine", a = 0.01, d = 0.4, gain = 0.2, pan = 0, at = 0, detune = 0 }) {
  const t = now() + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  o.detune.value = detune;
  const g = ctx.createGain();
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(g).connect(p).connect(master);
  env(g, t, a, gain, d);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

function buildBeds() {
  // wind: looping noise through a slowly wandering lowpass
  const wind = src();
  const wf = ctx.createBiquadFilter();
  wf.type = "lowpass";
  wf.frequency.value = 420;
  const wg = ctx.createGain();
  wg.gain.value = 0.12;
  wind.connect(wf).connect(wg).connect(master);
  wind.start();
  // creature drone: detuned low saws + noise band
  const dg = ctx.createGain();
  dg.gain.value = 0;
  const dp = ctx.createStereoPanner();
  const df = ctx.createBiquadFilter();
  df.type = "lowpass";
  df.frequency.value = 300;
  dg.connect(df).connect(dp).connect(master);
  const oscs = [41, 43.6, 61.7].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 2 ? "triangle" : "sawtooth";
    o.frequency.value = f;
    o.connect(dg);
    o.start();
    return o;
  });
  const dn = src();
  const dnf = ctx.createBiquadFilter();
  dnf.type = "bandpass";
  dnf.frequency.value = 180;
  dnf.Q.value = 3;
  const dng = ctx.createGain();
  dng.gain.value = 0.6;
  dn.connect(dnf).connect(dng).connect(dg);
  dn.start();
  // static hiss when it is close
  const st = src();
  const stf = ctx.createBiquadFilter();
  stf.type = "highpass";
  stf.frequency.value = 2500;
  const stg = ctx.createGain();
  stg.gain.value = 0;
  st.connect(stf).connect(stg).connect(master);
  st.start();
  return { wind, wf, wg, dg, dp, oscs, dn, st, stg };
}

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
    const M = g ? g.monster : null;
    const near = M && M.mode !== "hidden" && M.mode !== "lunge" ? Math.max(0, 1 - M.dist / 26) : 0;
    const playing = active && g && g.state === "play";
    // wind swells
    beds.wf.frequency.setTargetAtTime(300 + 260 * (0.5 + 0.5 * Math.sin(t * 0.13)) + near * 200, t, 0.5);
    beds.wg.gain.setTargetAtTime(active ? 0.1 + 0.05 * Math.sin(t * 0.21) : 0.07, t, 0.4);
    // drone + static
    beds.dg.gain.setTargetAtTime(playing ? near * near * 0.22 : 0, t, 0.25);
    beds.stg.gain.setTargetAtTime(playing ? Math.max(0, near - 0.45) * 0.09 + (g.fear / 100) * 0.012 : 0, t, 0.15);
    if (M && playing) {
      const P = g.player;
      // project onto the player's right vector (cos yaw, -sin yaw)
      const dx = M.x - P.x, dz = M.z - P.z, d = Math.hypot(dx, dz) || 1;
      const rel = (dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw)) / d;
      beds.dp.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, rel)), t, 0.1);
    }
    if (!active || !g) return;
    // crickets: chirp trains, silenced when it is near
    nextCricket -= dt;
    if (nextCricket <= 0) {
      nextCricket = 0.8 + Math.random() * 2.5;
      if (near < 0.15 && playing) {
        const pan = Math.random() * 1.6 - 0.8;
        for (let i = 0; i < 3; i++) tone({ f: 4300 + Math.random() * 300, type: "sine", a: 0.004, d: 0.035, gain: 0.012, pan, at: i * 0.07 });
      }
    }
    // heartbeat with fear
    if (playing && g.fear > 25) {
      heartT -= dt;
      if (heartT <= 0) {
        const f = g.fear / 100;
        heartT = 1.1 - f * 0.6;
        tone({ f: 58, f2: 40, type: "sine", a: 0.01, d: 0.14, gain: 0.25 * f });
        tone({ f: 52, f2: 36, type: "sine", a: 0.01, d: 0.16, gain: 0.18 * f, at: 0.2 });
      }
    }
    // ambient events
    nextAmbient -= dt;
    if (nextAmbient <= 0 && playing) {
      nextAmbient = 9 + Math.random() * 16;
      const r = Math.random(), pan = Math.random() * 1.8 - 0.9;
      if (r < 0.35) this.snap(pan);
      else if (r < 0.6) {
        // owl: two soft hoots
        tone({ f: 380, f2: 330, a: 0.05, d: 0.35, gain: 0.035, pan });
        tone({ f: 370, f2: 310, a: 0.05, d: 0.5, gain: 0.03, pan, at: 0.55 });
      } else if (r < 0.82) this.whisper(pan, 0.05);
      else burst({ f: 260, q: 0.6, type: "lowpass", a: 1.5, d: 2.5, gain: 0.08, pan }); // distant rumble
    }
  },
  play(name, o = {}) {
    if (!ctx) return;
    switch (name) {
      case "step": {
        const s = o.sprint;
        burst({ f: 900 + Math.random() * 500, q: 0.8, a: 0.004, d: s ? 0.12 : 0.09, gain: s ? 0.09 : 0.055, rate: 0.8 + Math.random() * 0.4 });
        burst({ f: 3200, q: 1.5, a: 0.002, d: 0.05, gain: 0.02 });
        if (o.breath) burst({ f: 600, q: 0.7, a: 0.12, d: 0.35, gain: 0.03 });
        break;
      }
      case "note":
        burst({ f: 2400, q: 0.8, a: 0.01, d: 0.25, gain: 0.08 });
        burst({ f: 1500, q: 0.8, a: 0.02, d: 0.2, gain: 0.06, at: 0.12 });
        tone({ f: 110, f2: 104, type: "triangle", a: 0.2, d: 2.4, gain: 0.12 });
        tone({ f: 155.6, f2: 150, type: "sine", a: 0.4, d: 2.2, gain: 0.07 });
        break;
      case "sting":
        // dissonant cluster swell + noise slash — not too loud
        [233, 247, 349, 370].forEach((f, i) => tone({ f, f2: f * 0.97, type: "sawtooth", a: 0.03, d: 1.3, gain: 0.05, detune: i * 7 }));
        burst({ f: 1800, q: 0.5, a: 0.02, d: 0.9, gain: 0.16 });
        tone({ f: 55, f2: 38, type: "sine", a: 0.02, d: 1.2, gain: 0.3 });
        break;
      case "chase":
        tone({ f: 70, f2: 45, type: "sawtooth", a: 0.05, d: 0.9, gain: 0.12 });
        burst({ f: 500, q: 2, a: 0.2, d: 0.8, gain: 0.08 });
        break;
      case "panic":
        burst({ f: 3000, q: 0.4, type: "highpass", a: 0.01, d: 1.2, gain: 0.14 });
        tone({ f: 880, f2: 600, type: "square", a: 0.01, d: 0.08, gain: 0.02 });
        break;
      case "caught":
        // the scream: harsh noise + falling saws + sub hit
        burst({ f: 1400, q: 0.4, a: 0.01, d: 1.6, gain: 0.45 });
        [180, 191, 265, 283, 410].forEach((f, i) => tone({ f, f2: f * 0.45, type: "sawtooth", a: 0.01, d: 1.5, gain: 0.08, detune: i * 11 }));
        tone({ f: 48, f2: 30, type: "sine", a: 0.005, d: 1.4, gain: 0.5 });
        break;
      case "gateOpen":
        for (let i = 0; i < 5; i++) tone({ f: 190 + Math.random() * 60, f2: 140 + Math.random() * 40, type: "sawtooth", a: 0.05, d: 0.35, gain: 0.03, at: i * 0.32 });
        tone({ f: 98, type: "triangle", a: 1.5, d: 3, gain: 0.1, at: 0.4 });
        tone({ f: 146.8, type: "triangle", a: 1.5, d: 3, gain: 0.07, at: 0.6 });
        break;
      case "gateLocked":
        burst({ f: 2200, q: 6, a: 0.002, d: 0.08, gain: 0.08 });
        burst({ f: 1800, q: 6, a: 0.002, d: 0.08, gain: 0.06, at: 0.1 });
        break;
      case "light":
        burst({ f: 3500, q: 3, a: 0.001, d: 0.03, gain: 0.08 });
        break;
      case "vanish":
        this.whisper(0, 0.1);
        break;
      case "win":
        tone({ f: 196, type: "triangle", a: 1, d: 4, gain: 0.1 });
        tone({ f: 293.7, type: "triangle", a: 1.4, d: 4, gain: 0.07 });
        tone({ f: 392, type: "sine", a: 2, d: 4, gain: 0.05 });
        break;
      default:
        break;
    }
  },
  snap(pan = 0) {
    if (!ctx) return;
    burst({ f: 1600, q: 1.2, a: 0.001, d: 0.04, gain: 0.14, pan });
    burst({ f: 900, q: 1, a: 0.001, d: 0.06, gain: 0.08, pan, at: 0.05 });
  },
  whisper(pan = 0, gain = 0.05) {
    if (!ctx) return;
    // formant-ish noise bands sweeping like a breathy voice
    for (let i = 0; i < 4; i++) {
      const f = [900, 1400, 2300, 1100][i];
      burst({ f: f + Math.random() * 300, q: 8, a: 0.15, d: 0.4 + Math.random() * 0.3, gain, pan, at: i * 0.28 });
    }
  },
  dispose() {
    try {
      ctx?.close();
    } catch {
      /* ignore */
    }
    ctx = null;
    master = null;
    beds = null;
  },
};
