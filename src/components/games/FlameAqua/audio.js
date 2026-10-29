/** Tiny WebAudio synth for game blips. Nothing loads; muted = silent. */
let actx = null;
let master = null;
export const audio = {
  muted: false,
  unlock() {
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain();
        master.gain.value = 0.5;
        master.connect(actx.destination);
      }
      if (actx.state === "suspended") actx.resume();
    } catch {
      actx = null;
    }
  },
  tone(freq, dur, vol, slide = 1, type = "triangle", delay = 0) {
    if (this.muted || !actx || actx.state !== "running") return;
    try {
      const t = actx.currentTime + delay;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
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
  play(type, who) {
    const hi = who === "aqua" ? 1.19 : 1;
    switch (type) {
      case "jump": return this.tone(330 * hi, 0.12, 0.05, 1.6);
      case "land": return this.tone(140, 0.07, 0.04, 0.7, "sine");
      case "gem": this.tone(880 * hi, 0.1, 0.06, 1.3, "sine"); return this.tone(1320 * hi, 0.14, 0.05, 1.2, "sine", 0.06);
      case "plate": return this.tone(220, 0.08, 0.05, 0.8, "square");
      case "lever": return this.tone(300, 0.07, 0.05, 1.4, "square");
      case "door": return this.tone(110, 0.3, 0.05, 1.6, "sawtooth");
      case "sensor": return this.tone(660, 0.2, 0.05, 1.5, "sine");
      case "thud": return this.tone(90, 0.12, 0.06, 0.6, "sine");
      case "exit": return this.tone(520 * hi, 0.18, 0.05, 1.5, "sine");
      case "die": this.tone(400, 0.5, 0.08, 0.3, "sawtooth"); return this.tone(120, 0.4, 0.05, 0.5, "triangle", 0.1);
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 0.06, 1, "triangle", i * 0.11));
        return;
      default:
    }
  },
};
