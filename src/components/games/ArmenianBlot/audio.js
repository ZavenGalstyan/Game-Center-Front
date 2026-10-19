/**
 * Armenian Blot Heritage — original Web Audio synthesis (no sample files,
 * nothing to license). Card sounds are filtered noise bursts; jingles are
 * soft plucked tones in an Armenian-flavoured mode (D with a raised fourth
 * and lowered second, as in many duduk melodies); the ambience is a quiet
 * low drone with slow breathing. Honours the GamePlayer Mute and the
 * in-game volume.
 */
let ctx = null, master = null, sfx = null, amb = null, noise = null, ambNodes = null;
let muted = false, volume = 0.7, ambienceOn = true;
const AMB_VOL = 0.05;

function makeNoise(seconds) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function burst(freq, dur, vol, at = 0, q = 1, type = "bandpass") {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfx);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.05);
}

/** Plucked tone: sine + soft overtone with a fast attack and long decay (kanun-like). */
function pluck(freq, dur, vol, at = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  for (const [mul, v] of [[1, 1], [2, 0.32], [3, 0.12]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = mul === 1 ? "triangle" : "sine";
    o.frequency.value = freq * mul;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur / mul);
    o.connect(g).connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

// D "Armenian" mode: D Eb F# G A Bb C# D
const NOTE = { D4: 293.66, Eb4: 311.13, Fs4: 369.99, G4: 392.0, A4: 440.0, Bb4: 466.16, Cs5: 554.37, D5: 587.33, A3: 220.0, D3: 146.83, Fs5: 739.99, A5: 880 };

function startAmbience() {
  if (!ctx || ambNodes || !ambienceOn) return;
  const nodes = [];
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 0.35;
  const breath = ctx.createGain();
  breath.gain.value = 0.65;
  lfo.connect(lfoGain).connect(breath.gain);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 600;
  for (const [f, v] of [[NOTE.D3, 0.5], [NOTE.A3, 0.28], [NOTE.D3 * 2, 0.12]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 6;
    g.gain.value = v;
    o.connect(g).connect(lp);
    o.start();
    nodes.push(o);
  }
  // a little room tone
  const n = ctx.createBufferSource();
  n.buffer = makeNoise(3);
  n.loop = true;
  const nf = ctx.createBiquadFilter();
  nf.type = "lowpass";
  nf.frequency.value = 380;
  const ng = ctx.createGain();
  ng.gain.value = 0.25;
  n.connect(nf).connect(ng).connect(lp);
  n.start();
  nodes.push(n);
  lp.connect(breath).connect(amb);
  lfo.start();
  nodes.push(lfo);
  ambNodes = { nodes, out: breath };
}
function stopAmbience() {
  if (!ambNodes) return;
  for (const n of ambNodes.nodes) { try { n.stop(); } catch { /* already stopped */ } n.disconnect(); }
  ambNodes.out.disconnect();
  ambNodes = null;
}

const level = () => (muted ? 0 : volume * 0.8);

export const audio = {
  unlock() {
    if (!ctx) {
      const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = level();
      master.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.connect(master);
      amb = ctx.createGain();
      amb.gain.value = AMB_VOL;
      amb.connect(master);
      noise = makeNoise(1);
      startAmbience();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03);
  },
  setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03);
  },
  setAmbience(on) {
    ambienceOn = on;
    if (!ctx) return;
    if (on) startAmbience(); else stopAmbience();
  },
  shuffle() {
    for (let i = 0; i < 16; i++) burst(2800 + Math.random() * 1600, 0.03, 0.11, i * 0.032 + Math.random() * 0.01, 0.9);
    burst(800, 0.12, 0.14, 0.55, 0.8);
  },
  deal(at = 0) { burst(2300, 0.06, 0.13, at, 0.7); burst(650, 0.04, 0.06, at + 0.03, 1); },
  select() { burst(3600, 0.025, 0.07, 0, 1.4); },
  place() { burst(1500, 0.06, 0.16, 0, 0.7); burst(240, 0.07, 0.22, 0.01, 1.2, "lowpass"); },
  collect() { for (let i = 0; i < 4; i++) burst(1900 + i * 200, 0.07, 0.07, i * 0.035, 0.6); },
  bid() { pluck(NOTE.A4, 0.35, 0.05); },
  pass() { pluck(NOTE.D4, 0.3, 0.04); },
  contra() { pluck(NOTE.D4, 0.4, 0.07); pluck(NOTE.Eb4, 0.4, 0.07, 0.09); pluck(NOTE.A4, 0.55, 0.07, 0.18); },
  contract() { [NOTE.D4, NOTE.Fs4, NOTE.A4].forEach((f, i) => pluck(f, 0.6, 0.06, i * 0.08)); },
  declare() { [NOTE.A4, NOTE.Cs5, NOTE.D5].forEach((f, i) => pluck(f, 0.7, 0.07, i * 0.09)); },
  belote() { [NOTE.D5, NOTE.A4, NOTE.D5, NOTE.Fs5].forEach((f, i) => pluck(f, 0.6, 0.06, i * 0.075)); },
  win() { [NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.D5].forEach((f, i) => pluck(f, 0.8, 0.07, i * 0.1)); },
  lose() { [NOTE.A4, NOTE.G4, NOTE.Eb4, NOTE.D4].forEach((f, i) => pluck(f, 0.8, 0.06, i * 0.14)); },
  victory() {
    const seq = [NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.D5, NOTE.Cs5, NOTE.D5, NOTE.Fs5, NOTE.A5];
    seq.forEach((f, i) => pluck(f, i === seq.length - 1 ? 1.6 : 0.5, 0.075, i * 0.13));
    [NOTE.D3 * 2, NOTE.A3 * 2].forEach((f) => pluck(f, 2, 0.05, 0.9));
  },
  dispose() {
    stopAmbience();
    if (ctx) ctx.close().catch(() => {});
    ctx = master = sfx = amb = noise = null;
  },
};
