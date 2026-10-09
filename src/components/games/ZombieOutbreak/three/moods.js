/**
 * Zombie Outbreak — lighting moods. A stage picks a mood; it's applied on
 * top of its arena's base theme so the same street can be played at dusk,
 * in fog, in a blackout or in a storm. Fog never closes in tighter than
 * ~34 m, so a zombie is always visible well before it can reach you.
 */

export const MOODS = {
  dusk: { sky: ["#1c1830", "#4a3442", "#9a5a3a"], fog: "#3a2e36", fogNear: 16, fogFar: 70, hemi: 0.75, moonInt: 0.9, moon: "#ffb98a", lampScale: 0.8 },
  night: { sky: ["#05070d", "#141a28", "#24283a"], fog: "#121725", fogNear: 12, fogFar: 58, hemi: 0.5, moonInt: 0.7, moon: "#9fb4e0", lampScale: 1 },
  fog: { sky: ["#2a2e33", "#4a4f55", "#5c6066"], fog: "#454a50", fogNear: 5, fogFar: 40, hemi: 0.65, moonInt: 0.45, moon: "#c8d0d8", lampScale: 1.1 },
  storm: { sky: ["#07090c", "#191d24", "#222831"], fog: "#161a20", fogNear: 10, fogFar: 52, hemi: 0.5, moonInt: 0.5, moon: "#a8b8d0", lampScale: 1.05, rain: true, lightning: true },
  blackout: { sky: ["#030406", "#0b0d12", "#151018"], fog: "#0b0d12", fogNear: 10, fogFar: 48, hemi: 0.42, moonInt: 0.5, moon: "#8fa4d0", lampScale: 0.15, emergency: 1.6 },
  emergency: { sky: ["#0a0507", "#1d1013", "#301418"], fog: "#1a0f12", fogNear: 10, fogFar: 50, hemi: 0.5, moonInt: 0.55, moon: "#d8a0a0", lampScale: 0.7, emergency: 1.5 },
  toxic: { sky: ["#050a06", "#122016", "#1e3020"], fog: "#14211a", fogNear: 9, fogFar: 48, hemi: 0.55, moonInt: 0.55, moon: "#a8e0b0", lampScale: 0.9 },
};

export function applyMood(theme, moodId, indoor) {
  const m = MOODS[moodId] || MOODS.night;
  const t = { ...theme };
  if (!indoor) {
    t.skyCols = m.sky;
    t.fog = m.fog;
    t.sky = m.sky[1];
    t.moon = m.moon;
    t.moonInt = (theme.moonInt ?? 0.7) * (m.moonInt / 0.7);
  } else {
    // Indoors the arena's own palette dominates; the mood mostly changes lamps and fog depth.
    t.skyCols = null;
    t.moonInt = (theme.moonInt ?? 0.4) * (m.moonInt / 0.7);
  }
  t.fogNear = Math.max(5, Math.min(theme.fogNear ?? 12, m.fogNear + (indoor ? 2 : 0)));
  t.fogFar = Math.max(34, m.fogFar + (indoor ? -6 : 0));
  t.hemi = (theme.hemi ?? 0.5) * (m.hemi / 0.5) * 0.85;
  t.lampScale = m.lampScale;
  t.emergency = m.emergency || 1;
  t.rain = !!m.rain && !indoor;
  t.lightning = !!m.lightning;
  t.mood = moodId;
  return t;
}
