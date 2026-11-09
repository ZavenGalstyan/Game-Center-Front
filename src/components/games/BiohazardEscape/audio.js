/**
 * Biohazard Escape — procedural WebAudio (no sound files): gunshots built from
 * filtered noise bursts and pitch drops, mutant growls, servo whines, klaxons
 * and a low ventilation hum. The context starts on the first user gesture; one
 * master gain makes mute/volume instant. A small voice budget keeps automatic
 * fire from stacking hundreds of nodes.
 */
let ctx = null,
  master = null,
  noiseBuf = null,
  hum = null,
  alarm = null;
let muted = false,
  volume = 0.8;
let voices = 0;

function ensure() {
  if (ctx) return true;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return false;
  try {
    ctx = new AC();
  } catch {
    return false;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
}
function track(node, end) {
  voices++;
  node.onended = () => voices--;
  node.stop(end);
}
function tone(type, f0, f1, dur, peak, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, Math.min(0.015, dur / 4), peak, dur);
  o.connect(g).connect(master);
  o.start(t);
  track(o, t + dur + 0.1);
}
function noise(dur, peak, f, type = "bandpass", q = 1, delay = 0, fEnd = null, attack = 0.004) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, peak, dur);
  s.connect(fl).connect(g).connect(master);
  s.start(t, Math.random());
  track(s, t + dur + attack + 0.1);
}
const blip = (f, delay = 0, peak = 0.07, dur = 0.09) => tone("square", f, f, dur, peak, delay);
const chime = (f, delay = 0, peak = 0.08) => {
  tone("sine", f, f, 0.5, peak, delay);
  tone("sine", f * 2, f * 2, 0.25, peak * 0.3, delay);
};

const SOUNDS = {
  pistol: () => {
    noise(0.16, 0.5, 1800, "bandpass", 0.8, 0, 500);
    tone("square", 180, 60, 0.08, 0.18);
    noise(0.35, 0.08, 600, "lowpass", 0.7, 0.02);
  },
  rifle: () => {
    noise(0.1, 0.42, 2200, "bandpass", 0.9, 0, 700);
    tone("sawtooth", 140, 55, 0.07, 0.14);
  },
  shotgun: () => {
    noise(0.32, 0.7, 900, "lowpass", 0.6, 0, 200);
    tone("square", 110, 40, 0.16, 0.25);
    noise(0.5, 0.1, 400, "lowpass", 0.5, 0.05);
  },
  ion: () => {
    tone("sawtooth", 1800, 140, 0.35, 0.16);
    tone("sine", 2600, 400, 0.25, 0.1);
    noise(0.3, 0.12, 5000, "highpass", 0.5, 0, 1500);
  },
  dry: () => tone("square", 2400, 2200, 0.025, 0.05),
  reload: () => {
    noise(0.06, 0.12, 2500, "bandpass", 3);
    noise(0.08, 0.12, 1600, "bandpass", 3, 0.25);
  },
  reloaded: () => {
    noise(0.05, 0.16, 3000, "bandpass", 4);
    tone("square", 900, 700, 0.03, 0.05);
  },
  switch: () => noise(0.12, 0.12, 2000, "bandpass", 2),
  step: () => noise(0.07, 0.045, 300 + Math.random() * 120, "lowpass", 0.8),
  jump: () => noise(0.1, 0.05, 500, "lowpass", 0.7),
  land: () => {
    noise(0.12, 0.12, 220, "lowpass", 0.8);
    tone("sine", 80, 50, 0.1, 0.1);
  },
  hurt: () => {
    tone("sawtooth", 200, 90, 0.18, 0.12);
    noise(0.15, 0.15, 700, "lowpass", 0.6);
  },
  death: () => {
    tone("sawtooth", 220, 40, 1.4, 0.18);
    noise(1.2, 0.18, 300, "lowpass", 0.5, 0, 80);
  },
  pickup: () => [880, 1320].forEach((f, i) => blip(f, i * 0.06, 0.05)),
  ammo: () => {
    noise(0.08, 0.15, 2600, "bandpass", 3);
    noise(0.08, 0.12, 1800, "bandpass", 3, 0.07);
  },
  card: () => [660, 990, 1320].forEach((f, i) => chime(f, i * 0.07, 0.07)),
  weapon: () => {
    noise(0.1, 0.2, 2000, "bandpass", 2);
    [440, 660, 880].forEach((f, i) => blip(f, 0.1 + i * 0.06, 0.05));
  },
  heal: () => [523, 784, 1047].forEach((f, i) => chime(f, i * 0.08, 0.07)),
  door: () => {
    noise(1.0, 0.16, 400, "bandpass", 0.8, 0, 160, 0.05);
    tone("sawtooth", 70, 55, 1.0, 0.04);
    noise(0.25, 0.1, 3000, "highpass", 0.7, 0);
  },
  doorClose: () => {
    noise(0.8, 0.16, 300, "bandpass", 0.8, 0, 120, 0.05);
    tone("sine", 60, 40, 0.3, 0.2, 0.75);
  },
  deny: () => {
    blip(220, 0, 0.08, 0.12);
    blip(160, 0.14, 0.08, 0.18);
  },
  beep: () => blip(1200, 0, 0.05, 0.05),
  codeOk: () => [880, 1175, 1760].forEach((f, i) => blip(f, i * 0.08, 0.06)),
  codeBad: () => {
    tone("square", 300, 300, 0.14, 0.08);
    tone("square", 200, 200, 0.25, 0.08, 0.16);
  },
  solve: () => [523, 659, 784, 1047].forEach((f, i) => chime(f, i * 0.1, 0.09)),
  panel: () => {
    blip(1500, 0, 0.04, 0.04);
    noise(0.05, 0.06, 4000, "bandpass", 3);
  },
  click: () => {
    noise(0.05, 0.2, 1500, "bandpass", 2);
    tone("square", 200, 120, 0.05, 0.06);
  },
  gen: () => {
    tone("sawtooth", 40, 110, 1.4, 0.1);
    noise(1.4, 0.08, 200, "lowpass", 0.7, 0, 600, 0.2);
  },
  overload: () => {
    noise(0.5, 0.3, 4000, "highpass", 0.5, 0, 800);
    tone("sawtooth", 600, 60, 0.5, 0.12);
  },
  beam: () => {
    tone("sine", 300, 900, 0.6, 0.08);
    noise(0.6, 0.05, 6000, "highpass", 0.5);
  },
  rotate: () => noise(0.25, 0.1, 900, "bandpass", 2, 0, 500),
  alert: () => {
    noise(0.5, 0.16, 300, "bandpass", 1.5, 0, 180, 0.05);
    tone("sawtooth", 120, 70, 0.5, 0.06);
  },
  growlBig: () => {
    noise(1.1, 0.3, 160, "bandpass", 1.2, 0, 70, 0.1);
    tone("sawtooth", 70, 40, 1.1, 0.12);
  },
  attack: () => noise(0.25, 0.12, 500, "bandpass", 1, 0, 250),
  whiff: () => noise(0.18, 0.08, 1400, "bandpass", 1, 0, 400),
  flesh: () => noise(0.08, 0.14, 700, "lowpass", 0.8),
  armorHit: () => {
    tone("square", 1800, 1400, 0.04, 0.05);
    noise(0.05, 0.08, 4000, "bandpass", 5);
  },
  hitmark: () => blip(2400, 0, 0.025, 0.03),
  kill: () => {
    noise(0.35, 0.18, 400, "lowpass", 0.6, 0, 120);
    tone("sine", 140, 50, 0.3, 0.1);
  },
  crash: () => {
    noise(0.6, 0.35, 200, "lowpass", 0.7, 0, 60);
    tone("sine", 60, 30, 0.5, 0.25);
  },
  spit: () => noise(0.25, 0.14, 900, "bandpass", 1.5, 0, 300),
  splash: () => noise(0.18, 0.08, 1200, "lowpass", 0.8),
  explode: () => {
    noise(1.2, 0.6, 600, "lowpass", 0.5, 0, 60);
    tone("sine", 90, 30, 0.9, 0.35);
  },
  laser: () => {
    tone("sawtooth", 900, 300, 0.12, 0.08);
    noise(0.12, 0.08, 5000, "highpass", 0.7);
  },
  checkpoint: () => [659, 988].forEach((f, i) => chime(f, i * 0.09, 0.06)),
  levelUp: () => [523, 659, 784, 1047, 1319].forEach((f, i) => chime(f, i * 0.07, 0.09)),
  complete: () => [392, 523, 659, 784, 1047].forEach((f, i) => chime(f, i * 0.12, 0.1)),
  victory: () => {
    [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => chime(f, i * 0.14, 0.1));
    tone("triangle", 131, 131, 2.2, 0.06, 0.2);
  },
  tick: () => blip(1000, 0, 0.05, 0.04),
  siren: () => {
    tone("sawtooth", 500, 900, 0.5, 0.06);
    tone("sawtooth", 900, 500, 0.5, 0.06, 0.5);
  },
  xp: () => blip(1760, 0, 0.02, 0.04),
};

export const audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (!hum) {
      const o1 = ctx.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.value = 50;
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = 100.6;
      const w = ctx.createBufferSource();
      w.buffer = noiseBuf;
      w.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 180;
      const g = ctx.createGain();
      g.gain.value = 0.02;
      const wg = ctx.createGain();
      wg.gain.value = 0.05;
      o1.connect(lp);
      o2.connect(lp);
      w.connect(wg).connect(lp);
      lp.connect(g).connect(master);
      o1.start();
      o2.start();
      w.start();
      hum = { g, nodes: [o1, o2, w] };
    }
  },
  /** Looping klaxon for the evacuation countdown. */
  setAlarm(on) {
    if (!ctx) return;
    if (on && !alarm) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lg = ctx.createGain();
      lg.gain.value = 220;
      lfo.connect(lg).connect(o.frequency);
      o.frequency.value = 640;
      const g = ctx.createGain();
      g.gain.value = 0.025;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      o.connect(bp).connect(g).connect(master);
      o.start();
      lfo.start();
      alarm = { nodes: [o, lfo] };
    } else if (!on && alarm) {
      alarm.nodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          /* ignore */
        }
      });
      alarm = null;
    }
  },
  play(name) {
    if (!ctx || muted || ctx.state !== "running" || voices > 90) return;
    try {
      SOUNDS[name]?.();
    } catch {
      /* ignore */
    }
  },
  setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
  },
  setVolume(v) {
    volume = v;
    if (master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
  },
  dispose() {
    if (!ctx) return;
    try {
      hum?.nodes.forEach((n) => n.stop());
      alarm?.nodes.forEach((n) => n.stop());
      ctx.close();
    } catch {
      /* ignore */
    }
    ctx = master = noiseBuf = hum = alarm = null;
    voices = 0;
  },
};
