/**
 * Last Hope — hand-held weapons and tools, in "grip space":
 *   melee: the handle runs up +y out of the fist (grip at the origin),
 *          the blade / head faces +z
 *   guns:  barrel along +z, top along +y, grip at the origin
 *   bow:   limbs along ±y, string toward -z
 * The renderer parents them to the right hand with a fixed basis.
 */
import { builder } from "./builder.js";

const HANDLE = "#6a4a30";
const STONE = "#7f7c75";

function stoneAxe() {
  const B = builder(3001);
  B.cyl("m", HANDLE, [0.022, 0.026, 0.72, 6], [0, 0.22, 0]);
  B.ico("r", STONE, [0.07, 0], [0, 0.5, 0.07], { s: [0.6, 1.2, 1.4], lump: 0.3 });
  B.tor("m", "#8a7a52", [0.03, 0.012, 4, 8], [0, 0.49, 0], { r: [Math.PI / 2, 0, 0] });
  return B.build();
}
function stonePick() {
  const B = builder(3011);
  B.cyl("m", HANDLE, [0.022, 0.026, 0.72, 6], [0, 0.22, 0]);
  B.beam("r", STONE, [0, 0.52, -0.18], [0, 0.55, 0.2], 0.035, { r2: 0.012 });
  B.tor("m", "#8a7a52", [0.03, 0.012, 4, 8], [0, 0.53, 0], { r: [Math.PI / 2, 0, 0] });
  return B.build();
}
function ironAxe() {
  const B = builder(3021);
  B.cyl("m", "#4a3020", [0.022, 0.026, 0.78, 6], [0, 0.24, 0]);
  B.shape("x", "#9aa0a6", [[0, -0.07], [0.2, -0.12], [0.22, 0.1], [0, 0.06]], 0.02, [0, 0.55, 0.02], { r: [0, -Math.PI / 2, 0] });
  return B.build();
}
function ironPick() {
  const B = builder(3031);
  B.cyl("m", "#4a3020", [0.022, 0.026, 0.78, 6], [0, 0.24, 0]);
  B.beam("x", "#9aa0a6", [0, 0.58, -0.22], [0, 0.6, 0.24], 0.03, { r2: 0.008 });
  return B.build();
}
function club() {
  const B = builder(3041);
  B.cyl("m", "#7a5a3a", [0.06, 0.028, 0.75, 7], [0, 0.25, 0], { jit: 0.08 });
  for (let k = 0; k < 4; k++) B.ico("m", "#5a3e28", [0.03, 0], [Math.cos(k * 1.6) * 0.05, 0.42 + k * 0.08, Math.sin(k * 1.6) * 0.05]);
  return B.build();
}
function spear() {
  const B = builder(3051);
  B.cyl("m", "#8a6a44", [0.02, 0.022, 1.7, 6], [0, 0.35, 0]);
  B.cone("m", "#c8a874", [0.03, 0.22, 6], [0, 1.31, 0]);
  B.tor("m", "#8a7a52", [0.024, 0.01, 4, 8], [0, 1.18, 0], { r: [Math.PI / 2, 0, 0] });
  return B.build();
}
function crowbar() {
  const B = builder(3061);
  B.cyl("x", "#3a3e44", [0.016, 0.016, 0.8, 6], [0, 0.25, 0]);
  B.beam("x", "#3a3e44", [0, 0.64, 0], [0, 0.72, 0.08], 0.016);
  B.box("s", "#b8302a", [0.04, 0.2, 0.04], [0, -0.05, 0]);
  return B.build();
}
function machete() {
  const B = builder(3071);
  B.box("m", "#1e1e1e", [0.035, 0.16, 0.035], [0, 0.0, 0]);
  B.shape("x", "#b8bec4", [[-0.02, 0.08], [0.03, 0.08], [0.05, 0.55], [0.0, 0.66], [-0.02, 0.5]], 0.006, [0, 0, 0], { r: [0, Math.PI / 2, 0] });
  return B.build();
}
function fireAxe() {
  const B = builder(3081);
  B.cyl("m", "#c8a058", [0.024, 0.028, 0.9, 6], [0, 0.28, 0]);
  B.shape("s", "#b8302a", [[0, -0.08], [0.22, -0.14], [0.24, 0.12], [0, 0.07]], 0.024, [0, 0.66, 0.02], { r: [0, -Math.PI / 2, 0] });
  B.cone("x", "#6a6e74", [0.03, 0.16, 5], [0, 0.66, -0.1], { r: [-Math.PI / 2, 0, 0] });
  return B.build();
}
function bow() {
  const B = builder(3091);
  for (const s of [-1, 1]) {
    B.beam("m", "#6a4628", [0, 0, 0], [0, s * 0.32, -0.08], 0.018, { r2: 0.014 });
    B.beam("m", "#6a4628", [0, s * 0.32, -0.08], [0, s * 0.62, 0.02], 0.014, { r2: 0.008 });
  }
  B.beam("m", "#e8e0c8", [0, -0.62, 0.02], [0, 0.62, 0.02], 0.003);
  B.box("m", "#3a2a1a", [0.04, 0.12, 0.04], [0, 0, 0]);
  return B.build();
}
function pistol() {
  const B = builder(3101);
  B.box("x", "#2a2d33", [0.035, 0.05, 0.2], [0, 0.05, 0.06]);
  B.box("m", "#1e1f22", [0.03, 0.1, 0.045], [0, -0.01, -0.01], { r: [0.2, 0, 0] });
  B.cyl("x", "#1e1f22", [0.009, 0.009, 0.04, 6], [0, 0.06, 0.175], { r: [Math.PI / 2, 0, 0] });
  return B.build();
}
function rifle() {
  const B = builder(3111);
  B.box("x", "#262a26", [0.05, 0.08, 0.5], [0, 0.05, 0.14]);
  B.cyl("x", "#1e1f22", [0.013, 0.013, 0.26, 6], [0, 0.06, 0.5], { r: [Math.PI / 2, 0, 0] });
  B.box("m", "#1e1f22", [0.032, 0.12, 0.045], [0, -0.02, 0]);
  B.box("m", "#1e1f22", [0.035, 0.16, 0.06], [0, -0.06, 0.13]);
  B.box("m", "#3a3a2a", [0.04, 0.07, 0.24], [0, 0.04, -0.2]);
  B.box("x", "#1e1f22", [0.03, 0.05, 0.12], [0, 0.115, 0.1]);
  return B.build();
}

export const WEAPON_MODELS = {
  stone_axe: stoneAxe,
  stone_pickaxe: stonePick,
  iron_axe: ironAxe,
  iron_pickaxe: ironPick,
  wooden_club: club,
  wooden_spear: spear,
  crowbar,
  machete,
  fire_axe: fireAxe,
  bow,
  pistol,
  rifle,
};
export const GUNS = new Set(["pistol", "rifle"]);
