/**
 * Saloon sound, synthesised with Web Audio (no audio files, no licences):
 *  - ambience: room tone, a murmuring crowd, glass clinks, floor creaks
 *    and the wind outside (filtered noise beds with slow modulation)
 *  - music: an out-of-tune upright piano playing a ragtime-style loop
 *    (additive piano voices with hammer noise and detuned unisons)
 *  - cards: shuffle (riffle), deal (swish + tick), flip, knock (check)
 *  - chips: clinks (resonant bandpassed clicks), sweep into the pot, rake
 *  - stings: stage won, stage lost, champion fanfare (brass-like saw voices)
 * Respects autoplay: nothing starts before unlock() runs inside a user
 * gesture. Master volume + separate music/ambience levels; mute is the
 * Game Center's.
 */
let ctx = null;
let master = null, sfx = null, music = null, amb = null;
let noiseBuf = null;
let muted = false;
let vol = { master: 0.8, music: 0.6, ambience: 0.7 };
let ambNodes = [];
let ambTimer = 0;
let musicTimer = 0;
let musicOn = false;

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfx = ctx.createGain();
  music = ctx.createGain();
  amb = ctx.createGain();
  sfx.connect(master);
  music.connect(master);
  amb.connect(master);
  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  applyVolume();
  return ctx;
}
function applyVolume() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.05);
  music.gain.setTargetAtTime(vol.music * 0.5, t, 0.1);
  amb.gain.setTargetAtTime(vol.ambience * 0.6, t, 0.1);
  sfx.gain.setTargetAtTime(1, t, 0.05);
}

function noise(dur, { type = "bandpass", f = 2000, q = 1, peak = 0.3, a = 0.002, delay = 0, f1 = null, out = sfx } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(out);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}
function tone(type, f0, f1, dur, peak, { delay = 0, out = sfx, a = 0.004, detune = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A slightly out-of-tune upright piano note. */
function pianoNote(midi, t, dur = 0.9, vel = 0.12) {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(vel, t + 0.006);
  out.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.25);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2.2), t + dur);
  out.connect(lp).connect(music);
  for (const [mul, amp, det] of [[1, 1, -7], [1, 0.8, 9], [2, 0.42, 3], [3, 0.2, -4], [4, 0.1, 6]]) {
    const o = ctx.createOscillator();
    o.type = mul === 1 ? "triangle" : "sine";
    o.frequency.value = f * mul;
    o.detune.value = det + (Math.random() - 0.5) * 6;
    const g = ctx.createGain();
    g.gain.value = amp;
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  // hammer
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = f * 4;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(vel * 0.25, t);
  hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  s.connect(bp).connect(hg).connect(music);
  s.start(t, Math.random());
  s.stop(t + 0.05);
}

// A ragtime-flavoured progression (C – A7 – D7 – G7 – C – C7 – F – G7) with an oom-pah left hand.
const PROG = [
  [48, [64, 67, 72]], [45, [61, 64, 67]], [50, [62, 66, 69]], [43, [62, 65, 71]],
  [48, [64, 67, 72]], [48, [64, 70, 72]], [53, [65, 69, 72]], [43, [62, 65, 71]],
];
const MELODY = [
  [76, 74, 72, 74, 76, 79, 76, 72], [73, 74, 76, 79, 76, 73, 69, 73], [74, 78, 81, 78, 74, 72, 69, 66], [71, 74, 77, 79, 77, 74, 71, 67],
  [72, 76, 79, 84, 79, 76, 72, 76], [79, 82, 79, 76, 72, 70, 67, 70], [77, 81, 84, 81, 77, 72, 69, 72], [74, 77, 79, 83, 79, 77, 74, 71],
];
function scheduleBar(start, bar, beat) {
  const [bass, chord] = PROG[bar % PROG.length];
  const mel = MELODY[bar % MELODY.length];
  for (let b = 0; b < 4; b++) {
    const t = start + b * beat;
    if (b % 2 === 0) pianoNote(bass - (b === 2 ? 5 : 0) + (b === 2 && bass < 45 ? 12 : 0), t, beat * 1.6, 0.07);
    else for (const n of chord) pianoNote(n - 12, t, beat * 0.9, 0.035);
  }
  mel.forEach((n, i) => {
    const sw = i % 2 ? beat * 0.12 : 0; // a little swing
    if (Math.random() < 0.08) return; // the pianist drops a note now and then
    pianoNote(n, start + i * (beat / 2) + sw, beat * 0.8, 0.055 + (i % 2 ? 0 : 0.015));
  });
}

export const audio = {
  unlock() {
    ensure();
    if (ctx && ctx.state === "suspended") ctx.resume();
  },
  setMuted(m) {
    muted = !!m;
    applyVolume();
  },
  setVolume({ master: mv, music: mu, ambience: am } = {}) {
    if (Number.isFinite(mv)) vol.master = mv;
    if (Number.isFinite(mu)) vol.music = mu;
    if (Number.isFinite(am)) vol.ambience = am;
    applyVolume();
  },
  /* ---------------- beds */
  startAmbience({ wind = 0.5, crowd = 0.6, night = false } = {}) {
    if (!ensure() || ambNodes.length) return;
    const bed = (type, f, q, g, lfo) => {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = g;
      s.connect(fl).connect(gg).connect(amb);
      s.start(0, Math.random());
      ambNodes.push(s, fl, gg);
      if (lfo) {
        const o = ctx.createOscillator();
        o.frequency.value = lfo[0];
        const og = ctx.createGain();
        og.gain.value = lfo[1];
        o.connect(og).connect(lfo[2] === "f" ? fl.frequency : gg.gain);
        o.start();
        ambNodes.push(o, og);
      }
    };
    bed("lowpass", 180, 0.5, 0.05, null); // room tone
    bed("bandpass", 420, 0.9, 0.05 * crowd, [0.23, 0.025 * crowd, "g"]); // murmur
    bed("bandpass", 900, 1.4, 0.022 * crowd, [0.17, 300, "f"]);
    bed("bandpass", 600, 2.5, 0.035 * wind, [0.07, 380, "f"]); // wind outside
    const tick = () => {
      if (!ctx) return;
      const r = Math.random();
      if (r < 0.35) {
        // glass clink
        const f = 2600 + Math.random() * 1800;
        tone("sine", f, f * 0.995, 0.6, 0.012, { out: amb });
        tone("sine", f * 2.7, f * 2.7, 0.3, 0.005, { out: amb });
      } else if (r < 0.6) {
        // floor creak
        noise(0.35 + Math.random() * 0.3, { type: "bandpass", f: 260 + Math.random() * 200, f1: 180, q: 9, peak: 0.05, a: 0.06, out: amb });
      } else if (r < 0.75 && !night) {
        // spur jingle outside
        for (let i = 0; i < 3; i++) tone("triangle", 3800 + i * 300, 3500, 0.12, 0.006, { delay: i * 0.06, out: amb });
      } else {
        // laugh-like crowd swell
        noise(1.2, { type: "bandpass", f: 520, f1: 380, q: 1.2, peak: 0.03 * crowd, a: 0.25, out: amb });
      }
      ambTimer = setTimeout(tick, 1800 + Math.random() * 4200);
    };
    ambTimer = setTimeout(tick, 1200);
  },
  stopAmbience() {
    clearTimeout(ambTimer);
    for (const n of ambNodes) {
      try {
        n.stop?.();
        n.disconnect();
      } catch {
        /* already stopped */
      }
    }
    ambNodes = [];
  },
  startMusic(tempo = 1) {
    if (!ensure() || musicOn) return;
    musicOn = true;
    const beat = 0.42 / tempo;
    let bar = 0;
    let next = ctx.currentTime + 0.2;
    const loop = () => {
      if (!musicOn || !ctx) return;
      while (next < ctx.currentTime + 1.2) {
        scheduleBar(next, bar++, beat);
        next += beat * 4;
        // a breath between choruses
        if (bar % 16 === 0) next += beat * 8;
      }
      musicTimer = setTimeout(loop, 400);
    };
    loop();
  },
  stopMusic() {
    musicOn = false;
    clearTimeout(musicTimer);
  },
  /* ---------------- cards */
  shuffle() {
    if (!ensure()) return;
    for (let i = 0; i < 26; i++) noise(0.03, { type: "highpass", f: 2500 + Math.random() * 2000, q: 0.7, peak: 0.07, delay: i * 0.022 + Math.random() * 0.006 });
    noise(0.12, { type: "bandpass", f: 1400, q: 0.8, peak: 0.08, delay: 0.62 });
  },
  deal() {
    if (!ensure()) return;
    noise(0.12, { type: "bandpass", f: 3200, f1: 1500, q: 0.9, peak: 0.07 });
    noise(0.02, { type: "highpass", f: 4000, peak: 0.05, delay: 0.1 });
  },
  flip() {
    if (!ensure()) return;
    noise(0.06, { type: "bandpass", f: 2400, q: 1.2, peak: 0.08 });
    noise(0.03, { type: "highpass", f: 5000, peak: 0.04, delay: 0.05 });
  },
  burn() {
    this.deal();
  },
  fold() {
    if (!ensure()) return;
    noise(0.22, { type: "bandpass", f: 1800, f1: 900, q: 0.8, peak: 0.06 });
  },
  knock() {
    if (!ensure()) return;
    for (const d of [0, 0.13]) {
      tone("sine", 160, 90, 0.12, 0.22, { delay: d });
      noise(0.04, { type: "bandpass", f: 900, q: 2, peak: 0.12, delay: d });
    }
  },
  /* ---------------- chips */
  chips(n = 3) {
    if (!ensure()) return;
    for (let i = 0; i < n; i++) {
      const d = i * (0.045 + Math.random() * 0.03);
      const f = 3200 + Math.random() * 1400;
      noise(0.05, { type: "bandpass", f, q: 14, peak: 0.16, delay: d });
      tone("sine", f * 0.62, f * 0.6, 0.06, 0.03, { delay: d });
    }
  },
  sweep() {
    if (!ensure()) return;
    noise(0.5, { type: "bandpass", f: 2600, f1: 1800, q: 1.2, peak: 0.05, a: 0.1 });
    this.chips(5);
  },
  rake() {
    if (!ensure()) return;
    noise(0.7, { type: "bandpass", f: 2200, f1: 1500, q: 1.1, peak: 0.06, a: 0.15 });
    for (let i = 0; i < 4; i++) setTimeout(() => this.chips(3), 150 + i * 120);
  },
  /* ---------------- UI + stings */
  click() {
    if (!ensure()) return;
    noise(0.03, { type: "bandpass", f: 2400, q: 3, peak: 0.08 });
  },
  turn() {
    if (!ensure()) return;
    tone("triangle", 880, 880, 0.18, 0.04);
    tone("triangle", 1320, 1320, 0.22, 0.03, { delay: 0.09 });
  },
  door() {
    if (!ensure()) return;
    noise(0.5, { type: "bandpass", f: 340, f1: 220, q: 6, peak: 0.08, a: 0.04 });
    noise(0.4, { type: "bandpass", f: 300, f1: 260, q: 7, peak: 0.05, a: 0.04, delay: 0.35 });
  },
  levelUp() {
    if (!ensure()) return;
    // the saloon bell
    for (const [f, d] of [[1318, 0], [1046, 0.18]]) {
      tone("sine", f, f, 1.4, 0.06, { delay: d });
      tone("sine", f * 2.76, f * 2.76, 0.6, 0.02, { delay: d });
    }
  },
  allIn() {
    if (!ensure()) return;
    tone("sawtooth", 110, 98, 0.9, 0.05, { a: 0.02 });
    noise(0.9, { type: "lowpass", f: 400, q: 0.7, peak: 0.08, a: 0.05 });
  },
  winHand() {
    if (!ensure()) return;
    [72, 76, 79].forEach((m, i) => tone("triangle", 440 * Math.pow(2, (m - 69) / 12), null, 0.5, 0.06, { delay: i * 0.08 }));
  },
  loseHand() {
    if (!ensure()) return;
    [64, 60].forEach((m, i) => tone("triangle", 440 * Math.pow(2, (m - 69) / 12), null, 0.6, 0.05, { delay: i * 0.14 }));
  },
  fanfare(big = false) {
    if (!ensure()) return;
    const notes = big ? [[60, 0], [64, 0.16], [67, 0.32], [72, 0.48], [67, 0.8], [72, 0.96], [76, 1.12], [79, 1.4]] : [[60, 0], [64, 0.15], [67, 0.3], [72, 0.5]];
    for (const [m, d] of notes) {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      for (const det of [-8, 0, 8]) tone("sawtooth", f, f, big ? 1.0 : 0.7, 0.03, { delay: d, detune: det, a: 0.03 });
      tone("sine", f / 2, f / 2, 0.8, 0.04, { delay: d });
    }
  },
  sting() {
    if (!ensure()) return;
    [[57, 0], [56, 0.35], [55, 0.7], [50, 1.05]].forEach(([m, d]) => {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      tone("sawtooth", f, f * 0.98, 0.9, 0.035, { delay: d, a: 0.04 });
      tone("sine", f / 2, f / 2, 1.0, 0.04, { delay: d });
    });
  },
  stopAll() {
    this.stopMusic();
    this.stopAmbience();
  },
  dispose() {
    this.stopAll();
    try {
      ctx?.close();
    } catch {
      /* closed */
    }
    ctx = master = sfx = music = amb = noiseBuf = null;
  },
};
