/** Tiny WebAudio synth for the game's sounds. Nothing loads; muted = silent. */
let actx = null;
let master = null;
let noiseBuf = null;
let lastHit = 0;

export const audio = {
  muted: false,
  unlock() {
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain();
        master.gain.value = 0.5;
        master.connect(actx.destination);
        noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (actx.state === "suspended") actx.resume();
    } catch {
      actx = null;
    }
  },
  ok() {
    return !this.muted && actx && actx.state === "running";
  },
  tone(freq, dur, vol, slide = 1, type = "triangle", delay = 0) {
    if (!this.ok()) return;
    try {
      const t = actx.currentTime + delay;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      /* ignore */
    }
  },
  noise(dur, vol, freq = 1200, q = 1, delay = 0) {
    if (!this.ok() || !noiseBuf) return;
    try {
      const t = actx.currentTime + delay;
      const s = actx.createBufferSource();
      s.buffer = noiseBuf;
      const f = actx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq;
      f.Q.value = q;
      const g = actx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(master);
      s.start(t);
      s.stop(t + dur + 0.02);
    } catch {
      /* ignore */
    }
  },
  stretch(k) {
    // rubber creak while pulling, throttled by the caller
    this.tone(180 + k * 220, 0.06, 0.025, 1.1, "sawtooth");
  },
  play(e) {
    switch (e.type) {
      case "launch":
        this.noise(0.18, 0.18, 900, 0.8);
        return this.tone(500, 0.25, 0.06, 2.2, "sine");
      case "ability":
        if (e.bird === "yellow") return this.tone(700, 0.25, 0.07, 2.5, "sawtooth");
        if (e.bird === "blue") return [900, 1200, 1500].forEach((f, i) => this.tone(f, 0.12, 0.05, 1.2, "sine", i * 0.04));
        return undefined;
      case "blast":
        this.noise(0.7, 0.5, 220, 0.6);
        return this.tone(90, 0.6, 0.12, 0.4, "sine");
      case "break":
        if (e.silent) return undefined;
        if (e.mat === "glass" || e.mat === "ice") return this.noise(0.25, 0.22, 4200, 2);
        if (e.mat === "stone") return this.noise(0.3, 0.25, 400, 1.2);
        return this.noise(0.22, 0.25, 900, 1.5);
      case "hit": {
        const now = actx ? actx.currentTime : 0;
        if (now - lastHit < 0.05 || e.power < 5) return undefined;
        lastHit = now;
        const v = Math.min(0.2, e.power / 200);
        if (e.mat === "glass" || e.mat === "ice") return this.tone(1800, 0.06, v * 0.5, 0.9, "sine");
        return this.noise(0.08, v, e.mat === "stone" ? 300 : 600, 1);
      }
      case "enemy":
        this.tone(520, 0.12, 0.08, 1.6, "square");
        return this.tone(260, 0.3, 0.06, 0.5, "triangle", 0.08);
      case "reload":
        return this.tone(660, 0.08, 0.04, 1.3, "sine");
      case "bonus":
        return this.tone(880 + e.i * 120, 0.15, 0.05, 1.2, "sine", e.i * 0.25);
      case "win":
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.28, 0.06, 1, "triangle", 0.2 + i * 0.12));
        return undefined;
      case "lose":
        [392, 330, 262].forEach((f, i) => this.tone(f, 0.35, 0.06, 0.9, "triangle", i * 0.2));
        return undefined;
      default:
        return undefined;
    }
  },
};
