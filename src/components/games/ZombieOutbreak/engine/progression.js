/**
 * Zombie Outbreak — progression rules (pure functions over the save state).
 *
 *   stages    clearing stage N unlocks N + 1
 *   weapons   earned by stage clears, boss victories or total stars — see
 *             each weapon's `unlock` in data/weapons.js; nothing is bought
 *   loadout   up to three weapons; a newly earned weapon drops into a free slot
 */
import { WEAPONS, WEAPON_ORDER } from "../data/weapons.js";
import { TOTAL_STAGES } from "../data/stages.js";

export function totalStars(state) {
  return Object.values(state.stars).reduce((a, b) => a + b, 0);
}

export function weaponUnlocked(state, id) {
  const u = WEAPONS[id].unlock;
  switch (u.type) {
    case "start":
      return true;
    case "stage":
    case "boss":
      return !!state.completed[u.stage];
    case "stars":
      return totalStars(state) >= u.stars;
    default:
      return false;
  }
}

/** Progress toward a locked weapon, 0..1 (for the Weapon Select bar). */
export function unlockProgress(state, id) {
  const u = WEAPONS[id].unlock;
  if (weaponUnlocked(state, id)) return 1;
  if (u.type === "stars") return Math.min(1, totalStars(state) / u.stars);
  if (u.type === "stage" || u.type === "boss") return Math.min(0.99, (state.unlocked - 1) / u.stage);
  return 0;
}

export function computeWeapons(state) {
  return WEAPON_ORDER.filter((id) => weaponUnlocked(state, id));
}

/**
 * Folds a finished attempt into the save. Returns the new state plus what it
 * unlocked (for the results screen).
 */
export function applyResult(state, result) {
  const id = result.stageId;
  const s = { ...state, completed: { ...state.completed }, stars: { ...state.stars }, best: { ...state.best }, stats: { ...state.stats } };
  const st = s.stats;
  st.attempts += 1;
  st.waves += result.waves;
  st.kills += result.kills;
  st.headshots += result.headshots;
  st.shots += result.shots;
  st.hits += result.hits;
  st.bosses += result.bossKills;
  st.time += result.time;
  st.bestScore = Math.max(st.bestScore, result.score);
  if (!result.cleared) {
    st.deaths += result.died ? 1 : 0;
    return { state: s, newWeapons: [], newStage: null, firstClear: false };
  }
  const firstClear = !s.completed[id];
  if (firstClear) st.stagesCompleted += 1;
  s.completed[id] = true;
  s.stars[id] = Math.max(s.stars[id] || 0, result.stars);
  s.best[id] = Math.max(s.best[id] || 0, result.score);
  let newStage = null;
  if (id < TOTAL_STAGES && s.unlocked < id + 1) {
    s.unlocked = id + 1;
    newStage = id + 1;
  }
  const before = new Set(state.weapons);
  const weapons = computeWeapons(s);
  const newWeapons = weapons.filter((w) => !before.has(w));
  s.weapons = weapons;
  const loadout = [...s.loadout];
  for (const w of newWeapons) if (loadout.length < 3 && !loadout.includes(w)) loadout.push(w);
  s.loadout = loadout;
  return { state: s, newWeapons, newStage, firstClear };
}

export function setLoadout(state, loadout) {
  const clean = [...new Set(loadout.filter((w) => state.weapons.includes(w)))].slice(0, 3);
  return { ...state, loadout: clean.length ? clean : ["pistol"] };
}

export function markSeen(state) {
  return { ...state, seen: [...state.weapons] };
}
