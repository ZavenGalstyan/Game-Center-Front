/**
 * Motel 6: Last Guest — WebAudio synth, nothing downloaded. Beds: rain (louder
 * outside / in the menu), fluorescent hum (off in a blackout) and a dread drone
 * that swells with suspicion. Cues: desk bell, phone ring, knocks, stamps,
 * paper, terminal beeps, CCTV static, power down/up, footsteps, whispers and
 * a (rationed) jumpscare sting.
 */
let ctx = null, master = null, sfx = null, noise = null;
let muted = false, volume = 0.8;
let beds = null;
let ringTimer = null;

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ctx.destination);
  sfx = ctx.createGain();
  sfx.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
const live = () => ctx && ctx.state === "running";
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(t, freq, dur, vol, type = "sine", glide = 0, dest = sfx) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  const g = ctx.createGain();
  env(g, t, Math.min(0.02, dur / 4), vol, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function burst(t, dur, freq, q, vol, type = "bandpass", toFreq = 0, att = 0) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, att || Math.min(0.04, dur / 3), vol, dur);
  src.connect(f).connect(g).connect(sfx);
  src.start(t, Math.random(), dur + 0.05);
}
function loopNoise(type, freq, q, dest) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  s.connect(f).connect(g).connect(dest);
  s.start();
  return { s, f, g };
}
function startBeds() {
  if (beds || !ctx) return;
  const bus = ctx.createGain();
  bus.connect(master);
  const rain = loopNoise("lowpass", 2400, 0.4, bus);
  const rainHi = loopNoise("highpass", 5200, 0.3, bus);
  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 120;
  const humF = ctx.createBiquadFilter();
  humF.type = "lowpass";
  humF.frequency.value = 400;
  const humG = ctx.createGain();
  humG.gain.value = 0;
  hum.connect(humF).connect(humG).connect(bus);
  hum.start();
  const drone = [55, 58.3, 82.4].map((f) => {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    return o;
  });
  const droneG = ctx.createGain();
  droneG.gain.value = 0;
  const droneF = ctx.createBiquadFilter();
  droneF.type = "lowpass";
  droneF.frequency.value = 300;
  for (const o of drone) { o.connect(droneF); o.start(); }
  droneF.connect(droneG).connect(bus);
  beds = { rain, rainHi, humG, droneG, droneF };
}

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    startBeds();
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
  },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  },
  /** outside: 0..1 (menu = 1), power: bool, dread: 0..1 */
  ambience({ outside = 0, power = true, dread = 0 } = {}) {
    if (!beds || !live()) return;
    const t = ctx.currentTime;
    beds.rain.g.gain.setTargetAtTime(0.05 + 0.13 * outside, t, 0.6);
    beds.rain.f.frequency.setTargetAtTime(outside > 0.5 ? 3200 : 1300, t, 0.6);
    beds.rainHi.g.gain.setTargetAtTime(0.008 + 0.03 * outside, t, 0.6);
    beds.humG.gain.setTargetAtTime(power ? 0.012 * (1 - outside * 0.8) : 0, t, 0.15);
    beds.droneG.gain.setTargetAtTime(0.012 + 0.06 * dread, t, 1.5);
    beds.droneF.frequency.setTargetAtTime(220 + 500 * dread, t, 1.5);
  },
  bell() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone(t, 1760, 1.3, 0.12);
    tone(t, 2637, 0.9, 0.05);
    tone(t, 4186, 0.4, 0.02);
  },
  ring(on) {
    clearInterval(ringTimer);
    ringTimer = null;
    if (!on) return;
    const one = () => {
      if (!live()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        tone(t + i * 0.42, 440, 0.38, 0.05, "square");
        tone(t + i * 0.42, 480, 0.38, 0.05, "square");
      }
    };
    one();
    ringTimer = setInterval(one, 2600);
  },
  pickup() {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(t, 0.12, 900, 2, 0.1);
    tone(t + 0.05, 180, 0.12, 0.06, "square");
  },
  voice(eerie) {
    if (!live()) return;
    const t = ctx.currentTime;
    if (eerie) {
      burst(t, 1.6, 600, 6, 0.04, "bandpass", 1800, 0.3);
      tone(t, 92, 1.6, 0.03, "sine", 70);
    } else burst(t, 0.25, 1400, 4, 0.03);
  },
  knock(n = 3, far = false) {
    if (!live()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const at = t + i * (0.34 + (i % 2) * 0.05);
      burst(at, 0.12, far ? 260 : 380, 1.2, far ? 0.25 : 0.4, "lowpass");
      tone(at, far ? 70 : 95, 0.14, far ? 0.12 : 0.2, "sine", 50);
    }
  },
  stamp(good) {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(t, 0.14, 300, 1, 0.5, "lowpass");
    tone(t, good ? 140 : 110, 0.16, 0.22, "sine", 60);
    burst(t + 0.05, 0.1, 3000, 1, 0.05, "highpass");
  },
  paper() {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(t, 0.22, 2600, 0.8, 0.07, "bandpass", 4200);
  },
  beep() {
    if (!live()) return;
    tone(ctx.currentTime, 1046, 0.07, 0.03, "square");
  },
  buzz() {
    if (!live()) return;
    tone(ctx.currentTime, 110, 0.3, 0.07, "sawtooth");
  },
  static(dur = 0.35) {
    if (!live()) return;
    burst(ctx.currentTime, dur, 4000, 0.5, 0.06, "highpass");
  },
  flicker() {
    if (!live()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 5; i++) burst(t + i * 0.07 + Math.random() * 0.05, 0.05, 2400, 3, 0.05);
    tone(t, 120, 0.4, 0.03, "sawtooth");
  },
  powerDown() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone(t, 240, 1.2, 0.12, "sawtooth", 30);
    burst(t, 0.2, 200, 1, 0.3, "lowpass");
  },
  powerUp() {
    if (!live()) return;
    const t = ctx.currentTime;
    burst(t, 0.15, 260, 1, 0.35, "lowpass");
    tone(t + 0.1, 60, 0.8, 0.08, "sawtooth", 120);
  },
  step(soft) {
    if (!live()) return;
    burst(ctx.currentTime, 0.08, soft ? 260 : 420, 1, soft ? 0.05 : 0.08, "lowpass");
  },
  door() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone(t, 320, 0.7, 0.03, "sawtooth", 520);
    burst(t + 0.6, 0.12, 200, 1, 0.25, "lowpass");
  },
  whisper() {
    if (!live()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) burst(t + i * 0.45 + Math.random() * 0.2, 0.4, 1800 + Math.random() * 1500, 9, 0.05, "bandpass");
  },
  alarm() {
    if (!live()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) tone(t + i * 0.3, i % 2 ? 660 : 880, 0.26, 0.05, "square");
  },
  sting() {
    if (!live()) return;
    const t = ctx.currentTime;
    for (const f of [311, 330, 466, 622]) tone(t, f, 1.4, 0.07, "sawtooth", f * 0.7);
    burst(t, 1.2, 800, 0.7, 0.22, "bandpass", 3000, 0.01);
  },
  heartbeat() {
    if (!live()) return;
    const t = ctx.currentTime;
    tone(t, 55, 0.18, 0.25, "sine", 40);
    tone(t + 0.24, 50, 0.2, 0.2, "sine", 38);
  },
  stopAll() {
    clearInterval(ringTimer);
    ringTimer = null;
    if (beds && live()) {
      const t = ctx.currentTime;
      beds.rain.g.gain.setTargetAtTime(0, t, 0.1);
      beds.rainHi.g.gain.setTargetAtTime(0, t, 0.1);
      beds.humG.gain.setTargetAtTime(0, t, 0.1);
      beds.droneG.gain.setTargetAtTime(0, t, 0.1);
    }
  },
};
