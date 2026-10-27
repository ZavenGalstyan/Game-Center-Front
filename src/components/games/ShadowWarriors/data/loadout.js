/** Shadow Warriors — turn saves and battles into fighter configs. */
import { weaponById, armorById } from "./gear.js";

export const PLAYER_LOOK = { hat: "headband", eye: "#e4f6ff" };

export function playerCfg(save) {
  const eq = save.eq;
  return {
    name: "Shadow",
    weapon: weaponById(eq.weapon),
    weaponLvl: save.lv.weapon[eq.weapon] || 0,
    armor: armorById(eq.armor),
    armorLvl: save.lv.armor[eq.armor] || 0,
    ability: eq.ability,
    abilityLvl: save.lv.ability[eq.ability] || 0,
    look: PLAYER_LOOK,
  };
}

/** Footwork by fighting style (a body stat like armor speed — same physics rules). */
const STYLE_SPEED = { brawler: 1, defender: 0.94, zoner: 0.98, trickster: 1.1, berserker: 1.06, duelist: 1.02 };

export function enemyCfg(b) {
  return {
    speedMul: STYLE_SPEED[b.style] || 1,
    name: b.name,
    weapon: weaponById(b.weapon),
    weaponLvl: b.wLvl,
    armor: armorById(b.armor),
    armorLvl: b.aLvl,
    ability: b.ability,
    abilityLvl: b.abilityLvl,
    hpMul: b.hpMul,
    dmgMul: b.dmgMul,
    look: b.look,
  };
}

export const aiProfile = (b) => ({ style: b.style, level: b.level });

export function fightConfig(save, b, seed) {
  return { player: playerCfg(save), enemy: enemyCfg(b), ai: aiProfile(b), boss: b.boss, seed: seed ?? (Date.now() & 0xffff) };
}
