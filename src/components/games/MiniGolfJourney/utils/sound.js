/**
 * Mini Golf Journey — tiny synthesised sound effects.
 *
 * No audio files: short WebAudio blips created lazily and wrapped in try/catch,
 * so a browser without WebAudio (or an autoplay-blocked context) just stays
 * silent. Every call takes the current `sound` setting as its first argument.
 */

let ctx = null;

function audioCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

function blip(freqs, { type = "sine", duration = 0.12, gain = 0.05, slide = 0 } = {}) {
  const ac = audioCtx();
  if (!ac) return;
  try {
    if (ac.state === "suspended") ac.resume();
    const now = ac.currentTime;
    freqs.forEach((f, i) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const t0 = now + i * duration * 0.55;
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t0 + duration);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    });
  } catch {
    /* sound is non-essential */
  }
}

export const sfx = {
  putt: (on, power = 0.5) =>
    on && blip([180 + power * 120], { type: "triangle", duration: 0.09, gain: 0.05, slide: -60 }),
  wall: (on, impact = 40) =>
    on && blip([120 + Math.min(90, impact)], { type: "square", duration: 0.06, gain: 0.035 }),
  sand: (on) => on && blip([90], { type: "sawtooth", duration: 0.14, gain: 0.03 }),
  water: (on) => on && blip([320, 180, 110], { type: "sine", duration: 0.13, gain: 0.045, slide: -40 }),
  cup: (on) => on && blip([523, 659, 880], { type: "sine", duration: 0.14, gain: 0.055 }),
  portal: (on) => on && blip([440, 740], { type: "triangle", duration: 0.1, gain: 0.04 }),
  complete: (on) => on && blip([523, 659, 784, 1047], { type: "sine", duration: 0.16, gain: 0.06 }),
  star: (on) => on && blip([784, 988, 1319], { type: "triangle", duration: 0.12, gain: 0.05 }),
  ui: (on) => on && blip([440], { type: "sine", duration: 0.05, gain: 0.03 }),
};
