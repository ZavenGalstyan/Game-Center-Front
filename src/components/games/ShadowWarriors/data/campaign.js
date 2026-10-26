/**
 * Shadow Warriors — campaign: 5 chapters × 10 battles, each chapter ending
 * in a boss (battles 10, 20, 30, 40, 50). Every battle is a real fight with
 * its own opponent, weapon, armor, AI style and difficulty.
 */
import { BOSSES } from "../engine/bosses.js";

export const CHAPTERS = [
  { id: 0, name: "The Silent Temple", arena: "temple", blurb: "Mountain monastery of lanterns and falling blossoms, where every warrior begins.", color: "#ff9a5a" },
  { id: 1, name: "Whispering Forest", arena: "forest", blurb: "Ancient cedars hide bandits, hunters and a witch who speaks with thorns.", color: "#7ddc7a" },
  { id: 2, name: "Lantern City Rooftops", arena: "rooftops", blurb: "Above the neon-lit streets, assassins duel on tile and timber.", color: "#ff5fa8" },
  { id: 3, name: "Burning Sands", arena: "desert", blurb: "Dunes and ruined palaces under a merciless sun, ruled by the Sultan.", color: "#ffc04d" },
  { id: 4, name: "Frozen Peaks", arena: "snow", blurb: "The Shadow Emperor waits at the top of the world.", color: "#8fd8ff" },
];

// [name, title, weapon, armor, style, look]
const ROSTER = [
  // chapter 1 — temple
  ["Ren", "Temple Novice", "fists", "gi", "brawler", { hat: "topknot", eye: "#ffb070" }],
  ["Mai", "Acolyte", "fists", "gi", "defender", { hat: "bun", eye: "#ffd27a" }],
  ["Toru", "Gatekeeper", "staff", "gi", "defender", { hat: "bald", eye: "#ff9a5a" }],
  ["Kenji", "Hot-Headed Initiate", "fists", "leather", "berserker", { hat: "spiky", eye: "#ff6a4a" }],
  ["Hana", "Sister of the Staff", "staff", "leather", "duelist", { hat: "bun", eye: "#ffc0a0" }],
  ["Daisuke", "Twin Fang Brother", "daggers", "leather", "trickster", { hat: "topknot", eye: "#ffd27a" }],
  ["Isao", "Bell Warden", "staff", "lamellar", "zoner", { hat: "straw", eye: "#ffb070" }],
  ["Yuki", "Scroll Keeper", "daggers", "leather", "duelist", { hat: "hood", eye: "#bfe3ff" }],
  ["Goro", "Temple Guard", "staff", "lamellar", "brawler", { hat: "helmet", eye: "#ff9a5a" }],
  ["Kuro", "the Iron Monk", "staff", "lamellar", "defender", { hat: "bald", beads: true, eye: "#ffcf4a", boss: true }],
  // chapter 2 — forest
  ["Rook", "Road Bandit", "daggers", "leather", "berserker", { hat: "bandana", eye: "#a8ff7a" }],
  ["Lisel", "Snare Trapper", "staff", "leather", "zoner", { hat: "hood", eye: "#c8ff9a" }],
  ["Gant", "Poacher", "katana", "leather", "brawler", { hat: "spiky", eye: "#9aff6a" }],
  ["Ilsa", "Cedar Ranger", "spear", "lamellar", "zoner", { hat: "hood", eye: "#c8ff9a" }],
  ["Fenn", "Outlaw Fox", "daggers", "silk", "trickster", { hat: "ears", eye: "#ffe07a" }],
  ["Oren", "Moss Hermit", "staff", "lamellar", "defender", { hat: "straw", eye: "#9aff6a" }],
  ["Kasha", "Wolf Rider", "twin", "leather", "trickster", { hat: "ears", eye: "#ffe07a" }],
  ["Aldo", "Briar Knight", "katana", "iron", "defender", { hat: "helmet", eye: "#a8ff7a" }],
  ["Thessa", "Grove Warden", "spear", "lamellar", "duelist", { hat: "antlers", eye: "#c8ff9a" }],
  ["Sylvara", "the Thorn Witch", "chain", "silk", "trickster", { hat: "witch", eye: "#7aff9a", boss: true }],
  // chapter 3 — rooftops
  ["Jin", "Lantern Thief", "daggers", "silk", "trickster", { hat: "mask", eye: "#ff7ac8" }],
  ["Mei", "Roof Runner", "twin", "silk", "trickster", { hat: "bun", eye: "#7ae8ff" }],
  ["Bao", "Night Watch", "spear", "lamellar", "defender", { hat: "straw", eye: "#ffd27a" }],
  ["Kwan", "Dock Smuggler", "katana", "leather", "berserker", { hat: "bandana", eye: "#ff7a7a" }],
  ["Suri", "Midnight Courier", "twin", "silk", "duelist", { hat: "hood", eye: "#7ae8ff" }],
  ["Tetsu", "Gang Boss", "hammer", "iron", "brawler", { hat: "spiky", eye: "#ff5a5a" }],
  ["Ayame", "Crimson Blade", "katana", "silk", "duelist", { hat: "bun", eye: "#ff4a8a" }],
  ["Rui", "Chain Dancer", "chain", "silk", "zoner", { hat: "mask", eye: "#c07aff" }],
  ["Hayato", "Shadow Guard", "twin", "iron", "defender", { hat: "helmet", eye: "#ff7ac8" }],
  ["Viper", "the Twin-Blade Assassin", "twin", "silk", "trickster", { hat: "mask", scarf: true, eye: "#c46aff", boss: true }],
  // chapter 4 — desert
  ["Tarik", "Dune Raider", "katana", "leather", "berserker", { hat: "turban", eye: "#ffb04a" }],
  ["Nadia", "Scorpion", "daggers", "silk", "trickster", { hat: "veil", eye: "#ffe07a" }],
  ["Omar", "Caravan Guard", "spear", "iron", "defender", { hat: "turban", eye: "#ffb04a" }],
  ["Zahra", "Sand Dervish", "twin", "silk", "trickster", { hat: "veil", eye: "#ff8a4a" }],
  ["Malik", "Oasis Champion", "hammer", "iron", "brawler", { hat: "bald", eye: "#ffcf4a" }],
  ["Layla", "Mirage Dancer", "chain", "silk", "zoner", { hat: "veil", eye: "#ff9ad8" }],
  ["Idris", "Sun Priest", "staff", "lamellar", "duelist", { hat: "turban", eye: "#ffe07a" }],
  ["Rashid", "Iron Jackal", "hammer", "iron", "defender", { hat: "ears", eye: "#ff7a4a" }],
  ["Samira", "Sultan's Blade", "katana", "dragon", "duelist", { hat: "veil", eye: "#ffcf4a" }],
  ["Kharim", "Sultan of Sands", "hammer", "dragon", "brawler", { hat: "crown", eye: "#ffb020", boss: true }],
  // chapter 5 — snow
  ["Arvid", "Frost Sentinel", "spear", "iron", "defender", { hat: "helmet", eye: "#8fd8ff" }],
  ["Sigrun", "Ice Wolf", "twin", "silk", "berserker", { hat: "ears", eye: "#bfeaff" }],
  ["Torvald", "Glacier Monk", "staff", "iron", "duelist", { hat: "bald", eye: "#8fd8ff" }],
  ["Eira", "Snow Wraith", "chain", "silk", "trickster", { hat: "hood", eye: "#e0f4ff" }],
  ["Hrolf", "Avalanche Brute", "hammer", "dragon", "brawler", { hat: "horns", eye: "#8fd8ff" }],
  ["Kaito", "Pale Ronin", "katana", "iron", "duelist", { hat: "straw", eye: "#e0f4ff" }],
  ["Freya", "Winter Twin", "twin", "dragon", "trickster", { hat: "bun", eye: "#bfeaff" }],
  ["Varn", "Legion Commander", "spear", "dragon", "zoner", { hat: "helmet", eye: "#8fd8ff" }],
  ["Isolde", "Emperor's Hand", "chain", "dragon", "duelist", { hat: "hood", eye: "#c0b0ff" }],
  ["Shadow Emperor", "", "katana", "dragon", "duelist", { hat: "crown", cape: true, eye: "#ff2a4a", boss: true }],
];

const BOSS_IDS = ["monk", "witch", "viper", "sultan", "emperor"];
const ABILITY_BY_CHAPTER = [null, null, "wave", "iron", "vampire"];

export const BATTLES = ROSTER.map(([name, title, weapon, armor, style, look], i) => {
  const id = i + 1;
  const ch = Math.floor(i / 10);
  const k = i % 10; // 0..9 inside the chapter
  const boss = k === 9 ? BOSS_IDS[ch] : null;
  const g = i / 49; // 0..1 across the campaign
  const level = boss === "emperor" ? 0.74 : Math.min(0.85, 0.1 + g * 0.64 + (k / 9) * 0.05 + (boss ? 0.03 : 0));
  // the Emperor's three-phase kit is his edge, so he gets no extra health
  const hpMul = (0.85 + g * 0.15 + k * 0.006) * (boss === "emperor" ? 1 : boss ? 1.12 : 1);
  const dmgMul = (0.8 + g * 0.3) * (boss ? 0.95 : 1);
  const wLvl = Math.min(4, Math.floor(g * 4.2));
  const aLvl = Math.min(4, Math.floor(g * 4));
  const ability = boss ? null : k >= 4 ? ABILITY_BY_CHAPTER[ch] : ch >= 3 && k >= 2 ? "wave" : null;
  return {
    id,
    chapter: ch,
    boss,
    name,
    title: boss ? BOSSES[boss].name : title,
    weapon,
    armor,
    style,
    look,
    level,
    hpMul,
    dmgMul,
    wLvl,
    aLvl,
    ability,
    abilityLvl: Math.max(0, Math.min(3, ch - 2)),
    variant: boss ? 3 : Math.floor(k / 3),
    reward: Math.round(((60 + 14 * id) * (boss ? 2.5 : 1)) / 5) * 5,
    stars: level < 0.3 ? 1 : level < 0.5 ? 2 : level < 0.7 ? 3 : level < 0.85 ? 4 : 5,
  };
});

export const battleById = (id) => BATTLES[id - 1] || null;
export const isBossBattle = (id) => !!battleById(id)?.boss;
