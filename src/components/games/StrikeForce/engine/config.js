/** Strike Force — shared tuning constants (pure data). */
export const GRAVITY = 17;
export const BODY_R = 0.34;
export const STAND_H = 1.8;
export const CROUCH_H = 1.22;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.08;
export const WALK = 4.7;
export const SPRINT = 6.9;
export const CROUCH_SPEED = 2.3;
export const ADS_SPEED = 0.58; // multiplier at full ADS
export const JUMP_V = 5.7;
export const ACCEL = 46;
export const AIR_ACCEL = 9;
export const FRICTION = 34;
export const MAX_HP = 100;
export const REGEN_DELAY = 4.2;
export const REGEN_RATE = 26;
export const SPAWN_PROTECT = 1.6;
export const RESPAWN_BOT = 3.6;
export const RESPAWN_PLAYER = 4.5;
export const RESPAWN_PLAYER_MIN = 1.6;
export const COUNTDOWN = 3;
export const LADDER_V = 3.4;

export const MODES = {
  tdm: { id: "tdm", name: "Team Deathmatch", short: "TDM", blurb: "Two squads, one goal: reach the kill limit first.", limit: 50, time: 480, teams: true },
  ffa: { id: "ffa", name: "Free For All", short: "FFA", blurb: "Every soldier for themselves. First to the kill limit wins.", limit: 20, time: 420, teams: false },
  dom: { id: "dom", name: "Domination", short: "DOM", blurb: "Capture and hold A, B and C. Held points score over time.", limit: 150, time: 480, teams: true },
};
export const DOM_TICK = 3; // seconds per score tick per flag
export const DOM_RADIUS = 4.6;
export const DOM_CAPTURE = 7; // seconds for one soldier from neutral

export const DIFFICULTY = {
  easy: { id: "easy", name: "Easy", react: [0.62, 0.95], turn: 150, err0: 7.5, err1: 2.6, settle: 1.25, headChance: 0.1, comp: 0.25, tap: 3, burst: [0.18, 0.42], pause: [0.32, 0.6], fov: 100, sight: 55, dmg: 0.8, strafe: 0.45 },
  normal: { id: "normal", name: "Normal", react: [0.4, 0.62], turn: 230, err0: 5, err1: 1.55, settle: 0.95, headChance: 0.22, comp: 0.5, tap: 4, burst: [0.25, 0.6], pause: [0.22, 0.42], fov: 115, sight: 70, dmg: 0.92, strafe: 0.7 },
  hard: { id: "hard", name: "Hard", react: [0.26, 0.42], turn: 330, err0: 3.4, err1: 0.95, settle: 0.7, headChance: 0.38, comp: 0.72, tap: 5.2, burst: [0.35, 0.8], pause: [0.14, 0.3], fov: 125, sight: 85, dmg: 1, strafe: 0.9 },
};

export const SIZES = {
  small: { id: "small", name: "4 v 4", team: 4, ffa: 6 },
  standard: { id: "standard", name: "6 v 6", team: 6, ffa: 8 },
};

export const STREAKS = [
  { kills: 3, id: "uav", name: "Recon UAV", blurb: "Enemies show on your radar", time: 22 },
  { kills: 5, id: "overdrive", name: "Overdrive", blurb: "Faster movement, reloads and aim", time: 25 },
  { kills: 7, id: "plating", name: "Armor Plating", blurb: "+60 armor until you fall", time: 0 },
];

export const TEAM_NAMES = ["Vanguard", "Obsidian"];
export const BOT_NAMES = ["Kestrel", "Havoc", "Nomad", "Rook", "Spectre", "Talon", "Viking", "Mako", "Ghostline", "Brick", "Cinder", "Duke", "Echo", "Frost", "Gunner", "Hex", "Jinx", "Kilo", "Lynx", "Moss", "Nitro", "Onyx", "Pike", "Quill", "Ridge", "Saber", "Tank", "Ursa", "Volt", "Wraith", "Yeti", "Zulu"];
export const FFA_COLORS = ["#4fc3ff", "#ff5a4f", "#ffd34f", "#7dff8a", "#c58bff", "#ff9a3d", "#3dffd8", "#ff6fcf", "#d6e0e8"];
