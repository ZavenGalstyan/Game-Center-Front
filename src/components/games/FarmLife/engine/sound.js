/**
 * Farm Life — minimal WebAudio synth, no audio files. Same shape as Parking
 * Master's utils/sound.js: every call checks an `enabled` flag so the shared
 * GamePlayer Mute button silences everything instantly.
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

function blip(freq, dur, type = "sine", gain = 0.1, slideTo = null) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}

function noise(dur, gain = 0.15, lp = 1400) {
  const a = ac();
  if (!a) return;
  const n = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export const sfx = {
  ui(on) { if (on) blip(520, 0.06, "triangle", 0.05, 660); },
  till(on) { if (on) noise(0.14, 0.14, 700); },
  plant(on) { if (on) blip(440, 0.09, "sine", 0.06, 560); },
  water(on) { if (on) noise(0.22, 0.09, 3200); },
  harvest(on) { if (on) { blip(660, 0.08, "triangle", 0.07, 880); setTimeout(() => blip(880, 0.1, "triangle", 0.05), 60); } },
  coin(on) { if (on) { blip(880, 0.07, "square", 0.05, 1200); setTimeout(() => blip(1200, 0.09, "square", 0.04), 40); } },
  buy(on) { if (on) blip(300, 0.1, "sawtooth", 0.06, 200); },
  cluck(on) { if (on) { blip(330, 0.05, "square", 0.05); setTimeout(() => blip(280, 0.06, "square", 0.05), 70); } },
  egg(on) { if (on) blip(700, 0.14, "sine", 0.07, 1000); },
  denied(on) { if (on) blip(160, 0.12, "sawtooth", 0.05); },
};
