/**
 * Green Hills — World 1, Levels 1-3 (the mandated pre-expansion checkpoint).
 *
 * Every platform's top surface sits at `pos.y + size[1]/2`; segments are
 * sized to overlap generously at their seams so there is never an invisible
 * gap along the intended route. Gaps that DO exist are intentional (small,
 * rollable/jumpable hops) — never blind, never unfair.
 *
 * Every platform here is STATIC (fixed) — moving platforms were removed from
 * Green Hills after playtesting: jumping off one while it was mid-move threw
 * the player into the void. The moving-platform engine (engine/levelKit.js
 * `movingPlatform`, game/components/MovingPlatformMesh.jsx) stays for later
 * worlds; it's just unused here for now.
 *
 * `startYaw: Math.PI` on every level — the course runs from z≈0 (start)
 * toward increasing z (finish), i.e. "forward" is +Z, but the camera's own
 * yaw=0 convention faces -Z. Without this the player spawns facing directly
 * away from the level.
 */
import { level, platform, crystal, checkpoint, tree, flower, rock, cloud } from "../../engine/levelKit.js";

export const LEVEL_1 = level({
  id: 1,
  world: "green-hills",
  name: "First Roll",
  start: [0, 1.15, 0],
  startYaw: Math.PI,
  finish: [7, 0.6, 60],
  fallY: -12,
  platforms: [
    platform([0, 0, 0], [14, 1.2, 14], { style: "ground" }),
    platform([0, 0, 12], [10, 1.2, 12], { style: "ground" }),
    platform([7, 0, 22], [12, 1.2, 10], { style: "ground" }),
    platform([7, 0, 30], [8, 1.2, 8], { style: "ground" }),
    platform([7, 0.4, 44.5], [6, 0.4, 17], { style: "wood" }), // wide bridge over the small gap
    platform([7, 0, 58], [12, 1.2, 10], { style: "ground" }),
  ],
  crystals: [
    crystal([2, 1.3, 12]),
    crystal([11, 1.3, 22]),
    crystal([9.3, 1.3, 46]),
  ],
  checkpoints: [],
  decorations: [
    tree([-4, 0.6, -3]), tree([4.5, 0.6, 4]), tree([-3, 0.6, 9]),
    flower([2, 0.6, 5], { hue: 0.95 }), flower([-2, 0.6, 14], { hue: 0.55 }),
    rock([-4, 0.6, 16]), rock([3, 0.6, 25]),
    tree([12, 0.6, 20]), tree([2, 0.6, 30]),
    flower([10, 0.6, 32], { hue: 0.12 }),
    tree([2, 0.6, 56]), tree([12, 0.6, 62]),
    cloud([-10, 8, 20], { scale: 1.4 }), cloud([16, 10, 40], { scale: 1.8 }), cloud([-6, 9, 55], { scale: 1.2 }),
  ],
  tutorial: [
    { key: "move", text: "WASD / ARROWS — ROLL", trigger: "start" },
    { key: "crystals", text: "COLLECT CRYSTALS", trigger: "afterMove" },
    { key: "finish", text: "REACH THE PORTAL", trigger: "afterCrystal" },
  ],
});

export const LEVEL_2 = level({
  id: 2,
  world: "green-hills",
  name: "Bridge Path",
  start: [0, 1.15, 0],
  startYaw: Math.PI,
  finish: [0, 1.6, 60],
  fallY: -12,
  platforms: [
    platform([0, 0, 0], [10, 1.2, 10], { style: "ground" }),
    platform([0, 0.3, 11.5], [4, 0.6, 17], { style: "wood" }), // narrow bridge
    platform([0, 0, 24], [8, 1.2, 8], { style: "ground" }),
    // static staircase up to the elevated far side (replaces the old moving platform)
    platform([0, 0.35, 29], [5, 1, 5], { style: "stone" }),
    platform([0, 0.6, 32.5], [5, 1, 5], { style: "stone" }),
    platform([0, 0.85, 36], [5, 1, 5], { style: "stone" }),
    platform([0, 1.1, 39.5], [5, 1, 5], { style: "stone" }),
    platform([0, 1.0, 47], [10, 1.2, 12], { style: "ground" }),
    platform([0, 1.0, 58], [10, 1.2, 10], { style: "ground" }),
  ],
  crystals: [
    crystal([0, 1.3, 10]),
    crystal([2, 1.3, 24]),
    crystal([0, 2.3, 47]),
  ],
  checkpoints: [checkpoint([0, 0.6, 24])],
  decorations: [
    tree([-4, 0.6, -3]), tree([4, 0.6, 3]),
    flower([2, 0.9, 6], { hue: 0.3 }),
    rock([-3, 0.6, 22]), rock([3, 0.6, 26]),
    tree([-3, 0.6, 25]), tree([3, 1.6, 51]),
    flower([-2, 1.6, 55], { hue: 0.85 }),
    cloud([-12, 9, 15], { scale: 1.5 }), cloud([10, 11, 45], { scale: 1.6 }),
  ],
  tutorial: [
    { key: "checkpoint", text: "CHECKPOINTS SAVE YOUR PLACE", trigger: "start" },
    { key: "steps", text: "CLIMB THE STEPS", trigger: "afterMove" },
  ],
});

export const LEVEL_3 = level({
  id: 3,
  world: "green-hills",
  name: "Stepping Stones",
  start: [0, 1.15, 0],
  startYaw: Math.PI,
  finish: [0, 0.6, 52],
  fallY: -12,
  platforms: [
    platform([0, 0, 0], [10, 1.2, 10], { style: "ground" }),
    platform([0, 0, 9], [3, 1.2, 3], { style: "stone" }),
    platform([2, 0, 13], [3, 1.2, 3], { style: "stone" }),
    platform([0, 0, 18], [6, 1.2, 6], { style: "ground" }),
    platform([0, 0, 25], [3.5, 1.2, 3.5], { style: "stone" }),
    platform([-1, 0, 29], [3.5, 1.2, 3.5], { style: "stone" }),
    platform([1, 0, 33], [3.5, 1.2, 3.5], { style: "stone" }),
    platform([6, 0, 33], [3, 1.2, 3], { style: "stone" }), // optional side island for crystal 3
    platform([0, 0, 37.5], [3.5, 1.2, 3.5], { style: "stone" }),
    platform([0, 0, 42.5], [4, 1.2, 4], { style: "stone" }),
    platform([0, 0, 50], [10, 1.2, 10], { style: "ground" }),
  ],
  crystals: [
    crystal([0, 1.3, 18]),
    crystal([-3, 1.3, 50]),
    crystal([6, 1.3, 33]),
  ],
  checkpoints: [checkpoint([0, 0.6, 18])],
  decorations: [
    tree([-4, 0.6, -3]), tree([4, 0.6, 3]),
    rock([2.5, 0.6, 16]), rock([-2.5, 0.6, 20]),
    flower([2, 0.6, 18], { hue: 0.6 }),
    tree([-4, 0.6, 48]), tree([4, 0.6, 54]),
    flower([3, 0.6, 52], { hue: 0.1 }),
    cloud([-10, 9, 20], { scale: 1.4 }), cloud([12, 10, 35], { scale: 1.7 }),
  ],
  tutorial: [
    { key: "jumps", text: "JUMP CAREFULLY BETWEEN PLATFORMS", trigger: "start" },
  ],
});

export const GREEN_HILLS_LEVELS = [LEVEL_1, LEVEL_2, LEVEL_3];
