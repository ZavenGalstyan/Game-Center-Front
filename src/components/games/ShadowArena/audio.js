/** Tiny WebAudio synth for fight sounds. Nothing loads; muted = silent. */
let actx = null;
let master = null;
let noiseBuf = null;

export const audio = {
  muted: false,
  unlock() {
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain();
        master.gain.value = 0.45;
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
  ready() {
    return !this.muted && actx && actx.state === "running";
  },
  tone(freq, dur, vol, slide = 1, type = "triangle", delay = 0) {
    if (!this.ready()) return;
    try {
      const t = actx.currentTime + delay;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      /* ignore */
    }
  },
  noise(dur, vol, freq = 1200, q = 1, delay = 0, type = "bandpass") {
    if (!this.ready()) return;
    try {
      const t = actx.currentTime + delay;
      const s = actx.createBufferSource();
      s.buffer = noiseBuf;
      const f = actx.createBiquadFilter();
      f.type = type;
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
  /** play a sim event */
  event(e) {
    switch (e.type) {
      case "swing": return this.noise(0.09, 0.08, e.name === "kick" ? 700 : 1100, 1.2);
      case "special":
        switch (e.kind) {
          case "fire": this.noise(0.35, 0.12, 500, 0.8); return this.tone(180, 0.3, 0.06, 2, "sawtooth");
          case "ice": this.tone(1400, 0.25, 0.05, 1.6, "sine"); return this.tone(2100, 0.2, 0.03, 1.3, "sine", 0.05);
          case "bolt": this.tone(90, 0.4, 0.06, 0.5, "sawtooth", 0.2); return this.noise(0.5, 0.18, 3000, 0.4, 0.25, "highpass");
          case "shadow": return this.noise(0.3, 0.12, 400, 0.6, 0, "lowpass");
          case "rock": return this.tone(70, 0.4, 0.09, 0.6, "square", 0.25);
          case "wind": return this.noise(0.4, 0.12, 900, 0.5);
          default: return this.tone(300, 0.2, 0.05);
        }
      case "hit":
        this.noise(0.12, e.heavy ? 0.3 : 0.2, e.heavy ? 500 : 800, 0.9);
        return this.tone(e.heavy ? 90 : 140, 0.14, 0.12, 0.5, "sine");
      case "block": return this.tone(900, 0.08, 0.05, 0.7, "square");
      case "clash": return this.noise(0.3, 0.18, 2000, 0.6);
      case "jump": return this.tone(260, 0.08, 0.025, 1.5, "sine");
      case "land": return this.tone(110, 0.06, 0.04, 0.7, "sine");
      case "thud": return this.noise(0.25, 0.2, 200, 0.7, 0, "lowpass");
      case "round": return this.tone(660, 0.6, 0.05, 1, "triangle");
      case "fight": this.tone(440, 0.15, 0.06, 1, "square"); return this.tone(880, 0.35, 0.06, 1, "square", 0.12);
      case "ko":
        this.tone(220, 0.9, 0.08, 0.4, "sawtooth");
        return this.noise(0.6, 0.15, 300, 0.5, 0, "lowpass");
      case "timeup": return this.tone(520, 0.5, 0.06, 0.7, "triangle");
      case "over":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 0.06, 1, "triangle", i * 0.12));
        return;
      default:
    }
  },
  click() {
    this.tone(520, 0.06, 0.03, 1.3, "square");
  },
};
