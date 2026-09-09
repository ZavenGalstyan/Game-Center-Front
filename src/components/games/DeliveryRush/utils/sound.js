/**
 * Delivery Rush — synthesised audio.
 *
 * No audio files: a small WebAudio graph produces the engine (two detuned saws
 * through a low-pass whose cutoff and pitch track road speed), tyre scrub, and
 * short blips for impacts, pickups and UI. Rain and snow get a filtered noise
 * bed. Everything hangs off one master gain, so muting is a single ramp and
 * costs nothing while muted.
 *
 * Every entry point is wrapped so a browser without WebAudio, or a context the
 * autoplay policy has not released yet, simply stays silent.
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

function resume() {
  const ac = audioCtx();
  if (ac && ac.state === "suspended") ac.resume().catch(() => {});
  return ac;
}

/* --------------------------------------------------------------- one-shots */

function blip(freqs, { type = "sine", duration = 0.12, gain = 0.05, slide = 0, delay = 0 } = {}) {
  const ac = resume();
  if (!ac) return;
  try {
    const now = ac.currentTime + delay;
    freqs.forEach((f, i) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const t0 = now + i * duration * 0.5;
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t0 + duration);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.03);
    });
  } catch {
    /* audio is never load-bearing */
  }
}

function noiseBurst({ duration = 0.2, gain = 0.08, cutoff = 1400 } = {}) {
  const ac = resume();
  if (!ac) return;
  try {
    const len = Math.max(1, Math.floor(ac.sampleRate * duration));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  } catch {
    /* ignore */
  }
}

export const sfx = {
  ui: (on) => on && blip([420], { type: "sine", duration: 0.05, gain: 0.03 }),
  back: (on) => on && blip([300], { type: "sine", duration: 0.06, gain: 0.03 }),
  pickup: (on) => on && blip([523, 784], { type: "triangle", duration: 0.13, gain: 0.05 }),
  stop: (on) => on && blip([494, 659], { type: "triangle", duration: 0.11, gain: 0.045 }),
  deliver: (on) => on && blip([523, 659, 784, 1047], { type: "sine", duration: 0.16, gain: 0.06 }),
  star: (on, i = 0) =>
    on && blip([[784, 988, 1319][i % 3]], { type: "triangle", duration: 0.13, gain: 0.05, delay: i * 0.16 }),
  fail: (on) => on && blip([220, 165, 110], { type: "sawtooth", duration: 0.22, gain: 0.05 }),
  buy: (on) => on && blip([659, 880, 1175], { type: "sine", duration: 0.12, gain: 0.05 }),
  denied: (on) => on && blip([180, 140], { type: "square", duration: 0.1, gain: 0.035 }),
  crash: (on, impact = 4) => {
    if (!on) return;
    noiseBurst({ duration: 0.22, gain: Math.min(0.14, 0.03 + impact * 0.012), cutoff: 900 });
    blip([90 + impact * 6], { type: "square", duration: 0.09, gain: 0.045, slide: -40 });
  },
  scrape: (on) => on && noiseBurst({ duration: 0.12, gain: 0.035, cutoff: 2600 }),
  countdown: (on) => on && blip([880], { type: "sine", duration: 0.07, gain: 0.04 }),
};

/* ---------------------------------------------------------- engine + beds */

/**
 * The continuous audio for a run: engine note, tyre scrub, weather bed. Created
 * when gameplay starts and torn down when it ends, so nothing keeps an
 * oscillator alive after the player leaves the game.
 */
export class DriveAudio {
  constructor({ enabled = true, weather = "clear" } = {}) {
    this.enabled = enabled;
    this.ok = false;
    const ac = resume();
    if (!ac) return;
    try {
      this.ac = ac;
      this.master = ac.createGain();
      this.master.gain.value = enabled ? 1 : 0;
      this.master.connect(ac.destination);

      // engine: two detuned saws -> low-pass, both tracking road speed
      this.engineGain = ac.createGain();
      this.engineGain.gain.value = 0;
      this.filter = ac.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 600;
      this.filter.Q.value = 3;
      this.osc1 = ac.createOscillator();
      this.osc2 = ac.createOscillator();
      this.osc1.type = "sawtooth";
      this.osc2.type = "square";
      this.osc1.frequency.value = 60;
      this.osc2.frequency.value = 30;
      this.osc1.connect(this.filter);
      this.osc2.connect(this.filter);
      this.filter.connect(this.engineGain).connect(this.master);
      this.osc1.start();
      this.osc2.start();

      // tyre scrub: noise through a band-pass, opened by slip
      this.scrubGain = ac.createGain();
      this.scrubGain.gain.value = 0;
      const nb = ac.createBufferSource();
      const len = ac.sampleRate * 2;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      nb.buffer = buf;
      nb.loop = true;
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      bp.Q.value = 1.2;
      nb.connect(bp).connect(this.scrubGain).connect(this.master);
      nb.start();
      this.noise = nb;

      // weather bed
      this.weatherGain = ac.createGain();
      this.weatherGain.gain.value = 0;
      const wb = ac.createBufferSource();
      wb.buffer = buf;
      wb.loop = true;
      const wf = ac.createBiquadFilter();
      wf.type = weather === "snow" ? "lowpass" : "highpass";
      wf.frequency.value = weather === "snow" ? 700 : 2200;
      wb.connect(wf).connect(this.weatherGain).connect(this.master);
      wb.start();
      this.weatherSrc = wb;
      if (weather === "rain") this.weatherGain.gain.value = 0.02;
      else if (weather === "snow") this.weatherGain.gain.value = 0.008;

      this.ok = true;
    } catch {
      this.ok = false;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ok) return;
    try {
      this.master.gain.setTargetAtTime(on ? 1 : 0, this.ac.currentTime, 0.05);
    } catch {
      /* ignore */
    }
  }

  /** Called once per frame with the live car state. */
  update(speedFrac, throttle, slip, paused) {
    if (!this.ok || !this.enabled) return;
    try {
      const t = this.ac.currentTime;
      const target = paused ? 0 : 0.028 + speedFrac * 0.05 + Math.abs(throttle) * 0.016;
      this.engineGain.gain.setTargetAtTime(target, t, 0.08);
      const base = 48 + speedFrac * 165;
      this.osc1.frequency.setTargetAtTime(base, t, 0.06);
      this.osc2.frequency.setTargetAtTime(base * 0.5, t, 0.06);
      this.filter.frequency.setTargetAtTime(360 + speedFrac * 1500 + Math.abs(throttle) * 250, t, 0.08);
      this.scrubGain.gain.setTargetAtTime(paused ? 0 : Math.min(0.05, slip * 0.06), t, 0.05);
    } catch {
      /* ignore */
    }
  }

  dispose() {
    if (!this.ok) return;
    try {
      this.osc1.stop();
      this.osc2.stop();
      this.noise.stop();
      this.weatherSrc.stop();
      this.master.disconnect();
    } catch {
      /* ignore */
    }
    this.ok = false;
  }
}
