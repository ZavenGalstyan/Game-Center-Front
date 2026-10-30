/**
 * Tiny WebAudio synth: every sound effect and the cheerful per-world music
 * loops are generated in code (no audio files). Created lazily on the first
 * user gesture; `setMuted` silences everything at once.
 */
const THEME_MUSIC = {
  // [bpm, root midi, scale steps, melody (scale degrees, -1 = rest), bass degrees]
  menu: [104, 60, [0, 2, 4, 5, 7, 9, 11], [0, 2, 4, 2, 5, 4, 2, -1, 4, 5, 7, 5, 4, 2, 0, -1], [0, 0, 3, 3, 4, 4, 0, 0]],
  valley: [112, 62, [0, 2, 4, 5, 7, 9, 11], [0, 4, 7, 4, 5, 4, 2, -1, 0, 2, 4, 5, 4, 2, 0, -1], [0, 0, 5, 5, 3, 3, 4, 4]],
  desert: [100, 57, [0, 1, 4, 5, 7, 8, 10], [0, 1, 4, 1, 5, 4, 1, -1, 4, 5, 7, 5, 4, 1, 0, -1], [0, 0, 0, 0, 5, 5, 4, 4]],
  snow: [92, 64, [0, 2, 4, 7, 9], [0, 2, 4, 3, 2, 4, 1, -1, 0, 1, 2, 4, 3, 2, 0, -1], [0, 0, 3, 3, 1, 1, 4, 4]],
  cave: [84, 57, [0, 2, 3, 5, 7, 8, 10], [0, -1, 2, 4, -1, 3, 2, -1, 0, -1, 4, 5, -1, 4, 2, -1], [0, 0, 5, 5, 3, 3, 4, 4]],
  castle: [120, 55, [0, 2, 3, 5, 7, 8, 11], [0, 2, 3, 4, 3, 2, 6, -1, 0, 2, 3, 5, 4, 3, 2, -1], [0, 0, 5, 5, 3, 3, 4, 4]],
  boss: [138, 52, [0, 1, 3, 5, 7, 8, 10], [0, 0, 3, 0, 4, 3, 1, 0, 0, 0, 5, 4, 3, 1, 0, -1], [0, 0, 0, 0, 5, 5, 4, 4]],
};

class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.sfxOn = true;
    this.musicOn = true;
    this.track = null;
    this.timer = 0;
  }
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.16;
      this.musicBus.connect(this.master);
      this.applyGains();
      if (this.wantTrack) this.music(this.wantTrack);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }
  applyGains() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.sfxOn ? 1 : 0, now, 0.02);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.16 : 0, now, 0.05);
  }
  setMuted(m) {
    this.muted = m;
    this.applyGains();
  }
  setOptions({ sound, music }) {
    this.sfxOn = sound;
    this.musicOn = music;
    this.applyGains();
  }

  /* ---------------------------------------------------------------- primitives */
  tone(freq, dur, { type = "square", vol = 0.2, slide = 0, attack = 0.005, at = 0, bus } = {}) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  noise(dur, { vol = 0.2, freq = 1200, q = 1, at = 0, type = "bandpass" } = {}) {
    const c = this.ctx;
    if (!c || this.muted) return;
    if (!this.noiseBuf) {
      const n = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  /* ---------------------------------------------------------------- effects */
  jump() {
    this.tone(330, 0.16, { type: "square", vol: 0.08, slide: 2 });
  }
  land() {
    this.noise(0.08, { vol: 0.12, freq: 400 });
  }
  coin() {
    this.tone(988, 0.08, { type: "square", vol: 0.07 });
    this.tone(1319, 0.2, { type: "square", vol: 0.07, at: 0.06 });
  }
  attack() {
    this.noise(0.14, { vol: 0.16, freq: 2200, q: 0.8 });
  }
  enemyHit() {
    this.tone(220, 0.1, { type: "sawtooth", vol: 0.1, slide: 0.6 });
  }
  enemyDie() {
    this.tone(520, 0.25, { type: "triangle", vol: 0.16, slide: 0.3 });
    this.noise(0.2, { vol: 0.12, freq: 900 });
  }
  hurt() {
    this.tone(300, 0.3, { type: "sawtooth", vol: 0.14, slide: 0.4 });
  }
  fall() {
    this.tone(600, 0.6, { type: "triangle", vol: 0.14, slide: 0.25 });
  }
  checkpoint() {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, { type: "triangle", vol: 0.14, at: i * 0.08 }));
  }
  chest() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, { type: "square", vol: 0.07, at: i * 0.06 }));
  }
  honey() {
    [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.15, { type: "sine", vol: 0.16, at: i * 0.06 }));
  }
  spring() {
    this.tone(200, 0.35, { type: "sine", vol: 0.2, slide: 4 });
  }
  cage() {
    this.tone(1400, 0.08, { type: "square", vol: 0.06 });
    this.noise(0.08, { vol: 0.1, freq: 3000 });
  }
  friend() {
    [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.22, { type: "triangle", vol: 0.15, at: i * 0.1 }));
  }
  crumble() {
    this.noise(0.4, { vol: 0.14, freq: 300, q: 0.6 });
  }
  enemyAlert() {
    this.tone(880, 0.08, { type: "square", vol: 0.05 });
  }
  roar() {
    this.tone(90, 0.9, { type: "sawtooth", vol: 0.22, slide: 0.6, attack: 0.08 });
    this.noise(0.8, { vol: 0.12, freq: 250, q: 0.5 });
  }
  warn() {
    this.tone(660, 0.12, { type: "square", vol: 0.06 });
    this.tone(660, 0.12, { type: "square", vol: 0.06, at: 0.16 });
  }
  slam() {
    this.tone(70, 0.5, { type: "sine", vol: 0.35, slide: 0.5 });
    this.noise(0.4, { vol: 0.2, freq: 200, q: 0.5 });
  }
  thorn() {
    this.noise(0.15, { vol: 0.1, freq: 1800 });
  }
  bossHit() {
    this.tone(180, 0.2, { type: "square", vol: 0.16, slide: 0.5 });
    this.noise(0.15, { vol: 0.12, freq: 1500 });
  }
  win() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.22, { type: "triangle", vol: 0.16, at: i * 0.11 }));
  }
  gameover() {
    [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.3, { type: "triangle", vol: 0.15, at: i * 0.2 }));
  }
  click() {
    this.tone(700, 0.05, { type: "square", vol: 0.05 });
  }

  /* ---------------------------------------------------------------- music */
  music(name) {
    this.wantTrack = name;
    if (!this.ctx || this.track === name) return;
    this.track = name;
    clearInterval(this.timer);
    const def = THEME_MUSIC[name] || THEME_MUSIC.menu;
    const [bpm, root, scale, mel, bass] = def;
    const step = 60 / bpm / 2; // eighth notes
    const midi = (deg, oct = 0) => {
      const n = scale.length;
      const o = Math.floor(deg / n);
      return root + scale[((deg % n) + n) % n] + 12 * (o + oct);
    };
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    let i = 0;
    let next = this.ctx.currentTime + 0.1;
    const schedule = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 0.35) {
        const at = next - this.ctx.currentTime;
        const d = mel[i % mel.length];
        if (d >= 0) this.tone(hz(midi(d, 1)), step * 0.9, { type: "triangle", vol: 0.5, at, bus: this.musicBus });
        if (i % 4 === 0) this.tone(hz(midi(bass[(i / 4) % bass.length], -1)), step * 3.5, { type: "sine", vol: 0.7, at, bus: this.musicBus });
        if (i % 2 === 1 && name !== "cave") this.tone(hz(midi(bass[Math.floor(i / 4) % bass.length] + 4, 0)), step * 0.5, { type: "square", vol: 0.12, at, bus: this.musicBus });
        i++;
        next += step;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 120);
  }
  stopMusic() {
    clearInterval(this.timer);
    this.track = null;
    this.wantTrack = null;
  }
  dispose() {
    this.stopMusic();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.noiseBuf = null;
    }
  }
}

export const audio = new Audio();
