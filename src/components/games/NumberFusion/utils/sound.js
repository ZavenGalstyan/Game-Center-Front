/**
 * Number Fusion — tiny WebAudio synth. No files, no libraries. Every call
 * takes an `on` flag; NumberFusion.jsx passes `settings.sound && !muted` so
 * the shared GamePlayer Mute button silences everything instantly without
 * touching the saved preference.
 */
let ctx = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, type = "sine", gain = 0.09, slideTo = null, delay = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  slide(on) { if (on) tone(320, 0.05, "sine", 0.02, 360); },
  /** Pitch rises a little with each merge tier so a big combo feels bigger. */
  merge(on, comboIndex = 0) {
    if (!on) return;
    const base = 480 + Math.min(comboIndex, 6) * 60;
    tone(base, 0.1, "triangle", 0.06, base * 1.5);
  },
  spawn(on) { if (on) tone(220, 0.04, "sine", 0.02, 260); },
  newGame(on) { if (on) [392, 523].forEach((f, i) => setTimeout(() => tone(f, 0.12, "sine", 0.04), i * 60)); },
  undo(on) { if (on) tone(340, 0.08, "triangle", 0.035, 240); },
  win(on) {
    if (!on) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.22, "sine", 0.07), i * 85));
  },
  gameOver(on) {
    if (!on) return;
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.24, "sine", 0.05), i * 110));
  },
  ui(on) { if (on) tone(540, 0.05, "triangle", 0.03, 680); },
};
