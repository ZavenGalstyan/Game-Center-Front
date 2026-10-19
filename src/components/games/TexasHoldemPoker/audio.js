/**
 * Texas Hold'em Poker — original Web Audio synth (no sample files).
 * Every sound is generated: filtered noise for cards/felt, short metallic
 * partials for chips, soft triangle tones for jingles, and a quiet filtered
 * brown-noise bed for the poker-room ambience. Follows the GamePlayer Mute.
 */
let ctx = null, master = null, sfx = null, amb = null, noise = null, ambSrc = null;
let muted = false, ambientOn = true;
const VOLUME = 0.55;
const AMB_VOL = 0.07;

function makeNoise(seconds, brown) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}

function burst(freq, dur, vol, at = 0, q = 1.2, type = "bandpass") {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfx);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(freq, dur, vol, at = 0, type = "triangle") {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfx);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** One clay chip landing: a short click plus two inharmonic partials. */
function clink(at = 0, vol = 0.18) {
  const f = 2600 + Math.random() * 1400;
  burst(5200, 0.03, vol * 1.4, at, 2);
  tone(f, 0.09, vol * 0.5, at, "sine");
  tone(f * 1.53, 0.06, vol * 0.3, at, "sine");
}

function startAmbient() {
  if (!ctx || ambSrc || !ambientOn) return;
  ambSrc = ctx.createBufferSource();
  ambSrc.buffer = makeNoise(4, true);
  ambSrc.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520;
  ambSrc.connect(lp).connect(amb);
  ambSrc.start();
}
function stopAmbient() {
  if (ambSrc) { try { ambSrc.stop(); } catch { /* already stopped */ } ambSrc.disconnect(); ambSrc = null; }
}

export const audio = {
  unlock() {
    if (!ctx) {
      const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ctx.destination);
      sfx = ctx.createGain();
      sfx.connect(master);
      amb = ctx.createGain();
      amb.gain.value = AMB_VOL;
      amb.connect(master);
      noise = makeNoise(1, false);
      startAmbient();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.03);
  },
  setAmbient(on) {
    ambientOn = on;
    if (!ctx) return;
    if (on) startAmbient(); else stopAmbient();
  },
  shuffle() { for (let i = 0; i < 14; i++) burst(3000 + Math.random() * 1500, 0.035, 0.12, i * 0.035 + Math.random() * 0.01, 0.9); burst(900, 0.12, 0.15, 0.52, 0.8); },
  deal(at = 0) { burst(2400, 0.07, 0.16, at, 0.7); burst(700, 0.05, 0.08, at + 0.04, 1); },
  flip(at = 0) { burst(1800, 0.05, 0.14, at, 0.8); burst(3600, 0.03, 0.08, at + 0.02, 1.5); },
  chips(n = 2, at = 0) { for (let i = 0; i < n; i++) clink(at + i * 0.045 + Math.random() * 0.02, 0.16 - i * 0.01); },
  check() { burst(180, 0.09, 0.5, 0, 1.5, "lowpass"); burst(180, 0.09, 0.45, 0.13, 1.5, "lowpass"); },
  fold() { burst(1400, 0.18, 0.1, 0, 0.5); burst(600, 0.12, 0.06, 0.05, 0.6); },
  raise() { this.chips(4); tone(330, 0.12, 0.05, 0.02); },
  allIn() { for (let i = 0; i < 9; i++) clink(i * 0.04 + Math.random() * 0.02, 0.15); tone(110, 0.5, 0.12, 0.05, "sine"); tone(165, 0.45, 0.07, 0.08, "sine"); },
  collect() { for (let i = 0; i < 6; i++) clink(i * 0.03, 0.1); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 0.12, i * 0.1)); this.chips(6, 0.35); },
  loss() { [392, 330, 262].forEach((f, i) => tone(f, 0.4, 0.09, i * 0.14)); },
  victory() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i === 6 ? 0.9 : 0.28, 0.13, i * 0.13));
    [262, 392, 523].forEach((f) => tone(f, 1.2, 0.06, 0.78, "sine"));
  },
  tick() { tone(1500, 0.04, 0.05, 0, "square"); },
  notify() { tone(880, 0.12, 0.07); tone(1175, 0.18, 0.06, 0.08); },
  dispose() {
    stopAmbient();
    if (ctx) ctx.close().catch(() => {});
    ctx = master = sfx = amb = noise = null;
  },
};
