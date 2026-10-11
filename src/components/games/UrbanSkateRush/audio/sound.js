/**
 * Urban Skate Rush — Audio system
 *
 * Procedural audio generation for skateboarding sounds.
 * No external audio files required.
 */

let ctx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let muted = false;
let unlocked = false;
let currentMusic = null;

const volumes = { master: 0.8, music: 0.6, sfx: 0.8 };

function getContext() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGain.gain.value = volumes.master;

    musicGain = ctx.createGain();
    musicGain.connect(masterGain);
    musicGain.gain.value = volumes.music;

    sfxGain = ctx.createGain();
    sfxGain.connect(masterGain);
    sfxGain.gain.value = volumes.sfx;
  } catch {
    ctx = null;
  }
  return ctx;
}

function unlock() {
  if (unlocked) return;
  const c = getContext();
  if (c && c.state === "suspended") {
    c.resume().catch(() => {});
  }
  unlocked = true;
}

function setMuted(m) {
  muted = m;
  if (masterGain) {
    masterGain.gain.value = m ? 0 : volumes.master;
  }
}

function setVolumes(v) {
  if (typeof v.master === "number") volumes.master = v.master;
  if (typeof v.music === "number") volumes.music = v.music;
  if (typeof v.sfx === "number") volumes.sfx = v.sfx;

  if (!muted && masterGain) masterGain.gain.value = volumes.master;
  if (musicGain) musicGain.gain.value = volumes.music;
  if (sfxGain) sfxGain.gain.value = volumes.sfx;
}

function stopLoops() {
  if (currentMusic) {
    try {
      currentMusic.stop();
    } catch {
      // Already stopped
    }
    currentMusic = null;
  }
}

function dispose() {
  stopLoops();
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
    masterGain = null;
    musicGain = null;
    sfxGain = null;
  }
  unlocked = false;
}

// ============================================================
// Sound Effects (procedural)
// ============================================================

function playNoise(duration, frequency, type = "lowpass", gain = 0.3) {
  const c = getContext();
  if (!c || muted) return;

  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = c.createBufferSource();
  source.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;

  const envelope = c.createGain();
  envelope.gain.setValueAtTime(gain, c.currentTime);
  envelope.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(sfxGain);

  source.start();
  source.stop(c.currentTime + duration);
}

function playTone(frequency, duration, type = "sine", gain = 0.2) {
  const c = getContext();
  if (!c || muted) return;

  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;

  const envelope = c.createGain();
  envelope.gain.setValueAtTime(gain, c.currentTime);
  envelope.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

  osc.connect(envelope);
  envelope.connect(sfxGain);

  osc.start();
  osc.stop(c.currentTime + duration);
}

// Skateboard rolling sound (continuous noise)
let rollingOsc = null;
let rollingGain = null;
let rollingFilter = null;

function startRolling() {
  const c = getContext();
  if (!c || rollingOsc) return;

  // Create noise for rolling
  const bufferSize = c.sampleRate * 2;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  rollingOsc = c.createBufferSource();
  rollingOsc.buffer = buffer;
  rollingOsc.loop = true;

  rollingFilter = c.createBiquadFilter();
  rollingFilter.type = "lowpass";
  rollingFilter.frequency.value = 500;

  rollingGain = c.createGain();
  rollingGain.gain.value = 0;

  rollingOsc.connect(rollingFilter);
  rollingFilter.connect(rollingGain);
  rollingGain.connect(sfxGain);

  rollingOsc.start();
}

function updateRolling(speed) {
  if (!rollingGain || !rollingFilter) {
    startRolling();
  }
  if (rollingGain && rollingFilter) {
    const normalizedSpeed = Math.min(speed / 15, 1);
    rollingGain.gain.value = muted ? 0 : normalizedSpeed * 0.15;
    rollingFilter.frequency.value = 300 + normalizedSpeed * 800;
  }
}

function stopRolling() {
  if (rollingOsc) {
    try {
      rollingOsc.stop();
    } catch {
      // Already stopped
    }
    rollingOsc = null;
    rollingGain = null;
    rollingFilter = null;
  }
}

// Sound effect functions
const sfx = {
  push() {
    playNoise(0.15, 200, "lowpass", 0.2);
  },

  jump() {
    const c = getContext();
    if (!c || muted) return;
    playTone(300, 0.1, "sine", 0.15);
    playNoise(0.08, 1000, "highpass", 0.1);
  },

  land() {
    playNoise(0.12, 400, "lowpass", 0.25);
    playTone(150, 0.08, "sine", 0.1);
  },

  landHard() {
    playNoise(0.2, 300, "lowpass", 0.35);
    playTone(100, 0.15, "sine", 0.15);
  },

  trick() {
    playTone(600, 0.08, "sine", 0.15);
    playTone(800, 0.06, "sine", 0.1);
  },

  comboEnd() {
    playTone(400, 0.1, "sine", 0.2);
    playTone(500, 0.1, "sine", 0.15);
    playTone(600, 0.15, "sine", 0.1);
  },

  grindStart() {
    playNoise(0.1, 2000, "highpass", 0.2);
  },

  grindLoop(active) {
    // Handled separately with continuous noise
  },

  crash() {
    playNoise(0.3, 500, "lowpass", 0.4);
    playTone(80, 0.2, "sine", 0.2);
  },

  collect() {
    playTone(800, 0.08, "sine", 0.2);
    playTone(1000, 0.1, "sine", 0.15);
  },

  checkpoint() {
    playTone(600, 0.1, "sine", 0.2);
    playTone(800, 0.1, "sine", 0.15);
    playTone(1000, 0.15, "sine", 0.1);
  },

  missionComplete() {
    const c = getContext();
    if (!c || muted) return;

    const notes = [400, 500, 600, 800];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.2, "sine", 0.2), i * 100);
    });
  },

  menuClick() {
    playTone(500, 0.05, "sine", 0.1);
  },

  menuHover() {
    playTone(400, 0.03, "sine", 0.05);
  },
};

// ============================================================
// Music (procedural ambient)
// ============================================================

let musicOscillators = [];

function music({ bpm = 90, key = 0, mood = "urban", menu = false }) {
  stopLoops();

  const c = getContext();
  if (!c || muted) return;

  // Simple procedural ambient music
  const baseFreq = 65.41 * Math.pow(2, key / 12); // Base frequency based on key

  // Create a simple ambient pad
  const padOsc = c.createOscillator();
  padOsc.type = "sine";
  padOsc.frequency.value = baseFreq;

  const padOsc2 = c.createOscillator();
  padOsc2.type = "sine";
  padOsc2.frequency.value = baseFreq * 1.5; // Perfect fifth

  const padGain = c.createGain();
  padGain.gain.value = 0.08;

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 800;

  padOsc.connect(padGain);
  padOsc2.connect(padGain);
  padGain.connect(filter);
  filter.connect(musicGain);

  padOsc.start();
  padOsc2.start();

  musicOscillators = [padOsc, padOsc2];

  // LFO for movement
  const lfo = c.createOscillator();
  lfo.frequency.value = bpm / 60 / 4;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 100;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  musicOscillators.push(lfo);

  currentMusic = {
    stop() {
      musicOscillators.forEach((osc) => {
        try {
          osc.stop();
        } catch {
          // Already stopped
        }
      });
      musicOscillators = [];
    },
  };
}

export const sound = {
  unlock,
  setMuted,
  setVolumes,
  stopLoops,
  dispose,
  music,
  sfx,
  startRolling,
  updateRolling,
  stopRolling,
};
