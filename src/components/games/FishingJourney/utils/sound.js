/**
 * Fishing Journey — tiny synthesised sound effects.
 *
 * No audio files: a couple of short WebAudio blips, created lazily on first use
 * and fully wrapped in try/catch so a browser without WebAudio (or an
 * autoplay-blocked context) simply stays silent. Gated by the Sound setting via
 * the `enabled` argument the caller passes from settings.
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

function blip(freqs, { type = "sine", duration = 0.14, gain = 0.05 } = {}) {
  const ac = audioCtx();
  if (!ac) return;
  try {
    if (ac.state === "suspended") ac.resume();
    const now = ac.currentTime;
    freqs.forEach((f, i) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const t0 = now + i * duration * 0.6;
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    });
  } catch {
    /* ignore — sound is non-essential */
  }
}

export const sfx = {
  cast: (on) => on && blip([320, 180], { type: "triangle", duration: 0.12 }),
  bite: (on) => on && blip([660, 880], { type: "square", duration: 0.1, gain: 0.06 }),
  reel: (on) => on && blip([240], { type: "sawtooth", duration: 0.06, gain: 0.03 }),
  catch: (on) => on && blip([523, 659, 784], { type: "sine", duration: 0.16, gain: 0.06 }),
  escape: (on) => on && blip([300, 200], { type: "sine", duration: 0.18, gain: 0.05 }),
  coin: (on) => on && blip([880, 1175], { type: "triangle", duration: 0.09, gain: 0.05 }),
  buy: (on) => on && blip([440, 587, 880], { type: "triangle", duration: 0.1, gain: 0.05 }),
  error: (on) => on && blip([180, 140], { type: "square", duration: 0.14, gain: 0.05 }),
};
