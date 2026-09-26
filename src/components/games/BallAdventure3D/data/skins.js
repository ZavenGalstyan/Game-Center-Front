/**
 * Ball Adventure 3D — cosmetic ball skins.
 *
 * Every skin uses the SAME radius/mass/physics — only `colors` (material
 * tint/emissive) differ. `requiredStars` gates unlocking; skin "classic" is
 * always unlocked.
 */

export const BALL_SKINS = [
  { id: "classic", name: "Classic", requiredStars: 0, color: "#f2f2f2", emissive: "#000000", metalness: 0.15, roughness: 0.35 },
  { id: "forest", name: "Forest", requiredStars: 3, color: "#3f9142", emissive: "#0a1f0a", metalness: 0.1, roughness: 0.5 },
  { id: "ocean", name: "Ocean", requiredStars: 6, color: "#2a8fd6", emissive: "#031a2e", metalness: 0.3, roughness: 0.25 },
  { id: "sunset", name: "Sunset", requiredStars: 9, color: "#ff8a3d", emissive: "#3a1400", metalness: 0.2, roughness: 0.3 },
  { id: "frost", name: "Frost", requiredStars: 12, color: "#bfe9ff", emissive: "#0d2f3a", metalness: 0.4, roughness: 0.15 },
  { id: "volcanic", name: "Volcanic", requiredStars: 15, color: "#3a1210", emissive: "#ff4400", metalness: 0.3, roughness: 0.4 },
  { id: "neon", name: "Neon", requiredStars: 18, color: "#141420", emissive: "#ff2fd0", metalness: 0.5, roughness: 0.2 },
  { id: "galaxy", name: "Galaxy", requiredStars: 21, color: "#241a4d", emissive: "#8a6bff", metalness: 0.4, roughness: 0.25 },
  { id: "crystal", name: "Crystal", requiredStars: 24, color: "#dff7ff", emissive: "#3fd0ff", metalness: 0.6, roughness: 0.05 },
  { id: "golden", name: "Golden", requiredStars: 27, color: "#ffd54f", emissive: "#3a2900", metalness: 0.8, roughness: 0.2 },
];

export function getSkin(id) {
  return BALL_SKINS.find((s) => s.id === id) || BALL_SKINS[0];
}

export function skinUnlocked(skin, totalStars) {
  return totalStars >= skin.requiredStars;
}
