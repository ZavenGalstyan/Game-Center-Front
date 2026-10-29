/**
 * The 50 levels, ten per island. Each level is plain data produced by the
 * builder helpers in ./builders.js (coordinates: x along the island, y = height
 * of a piece's bottom edge above the ground; the slingshot stands at x = 200).
 *
 * Mechanics arrive in order: wood + Ember (1-1), helmets (1-4), Zip's dash
 * (1-6), ledges (1-8), glass (2-1), Trio's split (2-2), stone (3-1), Boomer's
 * blast (3-2), slopes and boulders (3-4), ice + icy ground (4-1), explosive
 * crates (5-1) and the Moko King (5-10). Every level is proven winnable with
 * its own bird line-up by tools/solve.mjs.
 */
import { makeLevel } from "./builders.js";
import { WORLDS } from "./worlds.js";

export { WORLDS };

const R = "red", Y = "yellow", K = "black", B = "blue";

const SPECS = [
  /* ------------------------------------------------------------ 1 Sunny Beach */
  {
    name: "First Flight",
    birds: [R, R],
    hint: "Drag the bird back, aim with the dotted guide and let go!",
    build(b) {
      b.hut("wood", 900, 0);
    },
  },
  {
    name: "Twin Huts",
    birds: [R, R, R],
    hint: "Defeat every Moko to win. Leftover birds are worth bonus points.",
    build(b) {
      b.hut("wood", 880, 0);
      b.hut("wood", 1160, 0);
    },
  },
  {
    name: "Sandcastle",
    birds: [R, R, R],
    hint: "Knock the castle over — falling blocks hurt Mokos too.",
    build(b) {
      const top = b.pyramid("wood", 1000, 0, 4);
      b.enemy("small", 1000, top);
      b.enemy("small", 1200, 0);
    },
  },
  {
    name: "Lookout Post",
    birds: [R, R, R],
    hint: "Coconut helmets make Mokos tougher. Hit them hard!",
    build(b) {
      const top = b.tower(1050, 0, ["wood", "wood"], 100, 100, ["small"]);
      b.enemy("helmet", 1050, top);
    },
  },
  {
    name: "Plank Bridge",
    birds: [R, R, R],
    build(b) {
      b.stack("wood", 920, 0, 3);
      b.stack("wood", 1180, 0, 3);
      b.beam("wood", 1050, 120, 320);
      b.enemy("small", 1000, 140);
      b.enemy("small", 1100, 140);
      b.enemy("small", 1050, 0);
    },
  },
  {
    name: "Zip Lane",
    birds: [Y, Y, R],
    hint: "Zip: tap the screen while flying to dash forward. Great against wood!",
    build(b) {
      b.box("wood", 1000, 0, 40, 120);
      b.box("wood", 1000, 120, 40, 40);
      b.hut("wood", 1250, 0);
      b.hut("wood", 1400, 0, "helmet");
    },
  },
  {
    name: "Driftwood Row",
    birds: [R, Y, R],
    build(b) {
      for (const x of [900, 1050, 1200]) {
        const top = b.hut("wood", x, 0);
        b.ball("wood", x, top, 18);
      }
    },
  },
  {
    name: "Dune Fort",
    stars: [0, 16000, 18000], // par: the solver needs every bird here
    birds: [R, Y, R],
    hint: "Some forts sit on solid dunes — aim higher.",
    build(b) {
      b.plat(1150, 120, 340, 120, "rock");
      b.hut("wood", 1080, 120);
      b.hut("wood", 1220, 120, "helmet");
      b.enemy("small", 900, 0);
    },
  },
  {
    name: "Palm Stilts",
    birds: [Y, R, Y],
    build(b) {
      for (const x of [1000, 1320]) {
        b.post("wood", x - 40, 0, 200);
        b.post("wood", x + 40, 0, 200);
        b.beam("wood", x, 200, 140);
        b.enemy("small", x, 220);
      }
      b.enemy("helmet", 1160, 0);
    },
  },
  {
    name: "Beach Boss",
    birds: [R, Y, R, Y],
    hint: "Big Mokos take a real beating. Bring the house down on them!",
    build(b) {
      b.tower(950, 0, ["wood", "wood"], 100, 100, ["small", "small"]);
      b.enemy("big", 1150, 0);
      b.frame("wood", 1150, 0, 140, 110);
      b.frame("wood", 1150, 130, 140, 90);
      b.enemy("helmet", 1150, 240);
      b.tower(1350, 0, ["wood", "wood"], 100, 100, ["small"]);
    },
  },

  /* ------------------------------------------------------------ 2 Bamboo Jungle */
  {
    name: "Glass House",
    birds: [R, R, R],
    hint: "Glass shatters easily — but it hides Mokos well.",
    build(b) {
      b.hut("glass", 950, 0);
      b.hut("wood", 1150, 0, "small", 100, 100, "glass");
      b.enemy("small", 1150, 120);
    },
  },
  {
    name: "Trio Trouble",
    birds: [B, B, R],
    hint: "Trio: tap while flying to split into three. Shatters glass!",
    build(b) {
      const top = b.tower(1100, 0, ["glass", "glass", "glass"], 100, 90, ["small", "small", "small"]);
      b.enemy("small", 1100, top);
    },
  },
  {
    name: "Canopy",
    birds: [R, Y, B],
    build(b) {
      const top = b.tower(1150, 0, ["wood", "wood", "wood", "glass"], 100, 90, [null, "small", null, "small"]);
      b.enemy("helmet", 1150, top);
      b.hut("glass", 950, 0);
    },
  },
  {
    name: "Greenhouse",
    birds: [B, B, R],
    build(b) {
      for (const x of [950, 1070, 1190]) {
        b.hut("glass", x, 0);
        b.hut("glass", x, 120);
      }
    },
  },
  {
    name: "Bamboo Ladder",
    birds: [B, Y, R, B],
    hint: "Each step of the ladder needs its own shot — plan your angles.",
    build(b) {
      b.plat(950, 80, 160);
      b.plat(1130, 160, 160);
      b.plat(1310, 240, 160);
      b.hut("glass", 950, 80);
      b.hut("glass", 1130, 160, "helmet");
      b.hut("wood", 1310, 240, "small", 100, 100, "glass");
    },
  },
  {
    name: "Hanging Planks",
    birds: [R, B, Y],
    build(b) {
      const top = b.tower(1150, 0, ["wood", "glass", "wood", "glass", "wood"], 100, 80, ["small", null, "helmet", null, "small"]);
      b.enemy("small", 1150, top);
      b.plat(1460, 160, 160);
      b.stack("glass", 1405, 160, 3);
      b.enemy("helmet", 1470, 160);
    },
  },
  {
    name: "Twin Spires",
    birds: [Y, B, R, B],
    build(b) {
      let t = b.tower(1000, 0, ["wood", "glass", "wood"], 100, 100, [null, "small"]);
      b.enemy("helmet", 1000, t);
      t = b.tower(1400, 0, ["glass", "wood", "glass"], 100, 100, ["small", null, "small"]);
      b.enemy("helmet", 1400, t);
    },
  },
  {
    name: "Shelter Grove",
    stars: [0, 18000, 20000], // par: the solver needs every bird here
    birds: [R, B, Y],
    build(b) {
      b.enemy("big", 1150, 0);
      b.box("glass", 1070, 0, 20, 70);
      b.box("glass", 1230, 0, 20, 70);
      b.beam("glass", 1150, 70, 180);
      b.beam("wood", 1150, 90, 220);
      b.hut("wood", 920, 0);
      b.hut("wood", 1380, 0, "helmet");
    },
  },
  {
    name: "Temple Steps",
    birds: [B, R, B, Y],
    build(b) {
      const top = b.pyramid("glass", 1150, 0, 5);
      b.enemy("helmet", 1150, top);
      b.hut("wood", 900, 0);
      b.hut("glass", 1400, 0);
    },
  },
  {
    name: "Jungle Keep",
    birds: [R, Y, B, R],
    hint: "Find the weak floor and the whole keep comes down.",
    build(b) {
      b.tower(1000, 0, ["wood", "glass", "wood"], 100, 90, ["small", "small"]);
      b.enemy("big", 1200, 0);
      b.frame("wood", 1200, 0, 140, 100);
      b.frame("glass", 1200, 120, 140, 90);
      b.enemy("helmet", 1200, 120);
      b.frame("wood", 1200, 230, 140, 90);
      b.tower(1400, 0, ["glass", "wood", "glass"], 100, 90, [null, "small", "small"]);
    },
  },

  /* ------------------------------------------------------------ 3 Rocky Canyon */
  {
    name: "Stone Cold",
    stars: [0, 16000, 25000], // par: the solver needs every bird here
    birds: [R, R, R],
    hint: "Stone barely cracks. Topple it or hit the Mokos directly.",
    build(b) {
      b.frame("stone", 1000, 0, 100, 100);
      b.enemy("small", 1000, 120);
      b.hut("wood", 1200, 0, "small", 100, 100, "stone");
      b.enemy("helmet", 1200, 120);
    },
  },
  {
    name: "Boomer Arrives",
    birds: [K, K, R],
    hint: "Boomer: tap while flying to explode — or let it hit and the fuse does the rest.",
    build(b) {
      b.hut("stone", 1050, 0, "helmet");
      b.hut("stone", 1170, 0);
      b.frame("stone", 1110, 120, 220, 80);
      b.enemy("small", 1110, 220);
    },
  },
  {
    name: "Mesa Top",
    birds: [R, K, Y],
    build(b) {
      b.plat(1250, 200, 360, 200, "rock");
      b.hut("stone", 1150, 200, "small", 100, 100, "wood");
      b.hut("wood", 1300, 200, "helmet");
      b.post("stone", 1390, 200, 120);
      b.hut("wood", 950, 0);
    },
  },
  {
    name: "Boulder Run",
    stars: [0, 16000, 26000], // par: the solver needs every bird here
    birds: [R, R, K],
    hint: "Get those boulders rolling downhill!",
    build(b) {
      b.plat(1000, 160, 120);
      b.slope(1060, 1310, 160, true);
      b.ball("stone", 965, 160, 22);
      b.ball("stone", 1012, 160, 22);
      b.post("wood", 1050, 160, 60);
      b.enemy("small", 1360, 0);
      b.enemy("helmet", 1430, 0);
      b.hut("wood", 1520, 0);
    },
  },
  {
    name: "Canyon Wall",
    birds: [K, R, B],
    build(b) {
      b.stack("stone", 1000, 0, 5);
      b.hut("glass", 1150, 0, "helmet");
      b.hut("wood", 1270, 0);
      b.enemy("small", 1270, 120);
    },
  },
  {
    name: "Rock Bridge",
    birds: [Y, K, R],
    build(b) {
      b.plat(1000, 180, 140, 180);
      b.plat(1360, 180, 140, 180);
      b.beam("wood", 1180, 180, 300);
      b.beam("stone", 1180, 200, 220, 20);
      b.enemy("small", 1120, 220);
      b.enemy("helmet", 1240, 220);
      b.enemy("big", 1180, 0);
    },
  },
  {
    name: "Pillar Field",
    birds: [R, Y, K, R],
    build(b) {
      for (const [i, x] of [950, 1130, 1310, 1490].entries()) {
        b.post("stone", x - 30, 0, 160);
        b.post("stone", x + 30, 0, 160);
        b.beam(i % 2 ? "stone" : "wood", x, 160, 100);
        b.enemy(i === 3 ? "helmet" : "small", x, 180);
      }
    },
  },
  {
    name: "Rockslide",
    birds: [R, K, R],
    hint: "Loose rocks up high — knock them onto the Mokos below.",
    build(b) {
      b.plat(1300, 300, 200, 300);
      b.ball("stone", 1240, 300, 26);
      b.ball("stone", 1300, 300, 26);
      b.box("wood", 1360, 300, 40, 40);
      b.enemy("helmet", 1150, 0);
      b.enemy("small", 1080, 0);
      b.hut("wood", 1480, 0);
    },
  },
  {
    name: "Armory",
    birds: [K, B, K, R],
    build(b) {
      b.frame("stone", 1150, 0, 260, 110);
      b.enemy("helmet", 1100, 0);
      b.enemy("helmet", 1200, 0);
      b.box("glass", 1060, 130, 40, 60);
      b.box("glass", 1240, 130, 40, 60);
      b.beam("stone", 1150, 190, 260);
      b.enemy("small", 1150, 130);
      b.hut("glass", 1400, 0);
    },
  },
  {
    name: "Canyon Citadel",
    birds: [K, R, Y, K, B],
    hint: "The citadel is tough — use every bird's strength.",
    build(b) {
      b.plat(1450, 120, 220, 120);
      b.hut("stone", 1000, 0);
      b.enemy("big", 1200, 0);
      b.frame("stone", 1200, 0, 140, 110);
      b.frame("wood", 1200, 130, 140, 90);
      b.enemy("helmet", 1200, 130);
      b.beam("glass", 1200, 240, 160);
      b.enemy("small", 1200, 260);
      b.hut("stone", 1450, 120, "helmet", 100, 100, "wood");
    },
  },

  /* ------------------------------------------------------------ 4 Frozen Island */
  {
    name: "Thin Ice",
    birds: [R, B, R],
    icyGround: true,
    hint: "Ice is slippery: blocks slide far once they start moving.",
    build(b) {
      b.hut("ice", 980, 0);
      b.hut("ice", 1150, 0, "helmet");
      b.stack("ice", 1300, 0, 3);
      b.enemy("small", 1300, 120);
    },
  },
  {
    name: "Slip 'n' Slide",
    birds: [Y, B, R],
    icyGround: true,
    build(b) {
      b.slope(1050, 1250, 140, false, "rock", true);
      b.plat(1350, 140, 240, 140, "rock", true);
      b.box("ice", 1290, 140, 40, 40);
      b.enemy("small", 1340, 140);
      b.hut("ice", 1420, 140, "helmet");
      b.enemy("small", 1000, 0);
    },
  },
  {
    name: "Igloo",
    birds: [B, B, R],
    icyGround: true,
    build(b) {
      b.enemy("big", 1150, 0);
      b.stack("ice", 1070, 0, 2);
      b.stack("ice", 1230, 0, 2);
      b.beam("ice", 1150, 80, 220);
      b.box("ice", 1130, 100, 40, 40);
      b.box("ice", 1170, 100, 40, 40);
      b.box("ice", 1150, 140, 40, 40);
      b.hut("ice", 950, 0);
    },
  },
  {
    name: "Frost Towers",
    birds: [R, B, K],
    icyGround: true,
    build(b) {
      let t = b.tower(1000, 0, ["stone", "ice", "ice"], 100, 90, [null, "small", "small"]);
      b.enemy("small", 1000, t);
      t = b.tower(1300, 0, ["ice", "stone", "ice"], 100, 90, ["helmet", null, "small"]);
      b.enemy("small", 1300, t);
    },
  },
  {
    name: "Glacier Ledge",
    birds: [Y, R, B, K],
    icyGround: true,
    hint: "Push them off the icy ledge — the fall does the rest.",
    build(b) {
      b.plat(1250, 260, 300, 260, "rock", true);
      b.hut("ice", 1170, 260, "helmet");
      b.hut("ice", 1320, 260);
      b.box("ice", 1245, 260, 30, 30);
      b.hut("wood", 950, 0, "small", 100, 100, "ice");
    },
  },
  {
    name: "Snow Bunker",
    birds: [K, B, R],
    icyGround: true,
    build(b) {
      b.frame("stone", 1150, 0, 220, 100);
      b.enemy("helmet", 1110, 0);
      b.enemy("small", 1190, 0);
      b.pyramid("ice", 1150, 120, 3);
      b.hut("ice", 1380, 0);
    },
  },
  {
    name: "Icicle Bridge",
    birds: [R, B, Y],
    icyGround: true,
    build(b) {
      b.stack("stone", 1000, 0, 4);
      b.stack("stone", 1320, 0, 4);
      b.beam("ice", 1160, 160, 380);
      b.enemy("small", 1090, 180);
      b.enemy("helmet", 1160, 180);
      b.enemy("small", 1230, 180);
      b.enemy("small", 1160, 0);
    },
  },
  {
    name: "Sliding Stacks",
    birds: [B, Y, K],
    icyGround: true,
    build(b) {
      b.plat(1150, 100, 200, 100, "rock", true);
      b.stack("ice", 1090, 100, 3);
      b.stack("ice", 1210, 100, 3);
      b.beam("ice", 1150, 220, 160);
      b.enemy("helmet", 1150, 100);
      b.enemy("small", 1150, 240);
      b.hut("ice", 1400, 0);
    },
  },
  {
    name: "Frozen Keep",
    birds: [K, B, Y, R],
    icyGround: true,
    build(b) {
      b.tower(1000, 0, ["ice", "ice"], 100, 90, ["small", "small"]);
      b.enemy("big", 1200, 0);
      b.frame("stone", 1200, 0, 140, 110);
      b.frame("ice", 1200, 130, 140, 90);
      b.enemy("helmet", 1200, 130);
      b.beam("stone", 1200, 240, 160);
      b.tower(1400, 0, ["stone", "ice"], 100, 90, ["helmet", "small"]);
    },
  },
  {
    name: "Polar Palace",
    birds: [K, B, Y, R, B],
    icyGround: true,
    hint: "The palace of ice — three wings, one shot each if you're good.",
    build(b) {
      b.plat(1500, 140, 220, 140, "rock", true);
      b.tower(950, 0, ["ice", "wood", "ice"], 100, 80, ["small", null, "small"]);
      b.enemy("big", 1200, 0);
      b.frame("stone", 1200, 0, 140, 110);
      b.frame("ice", 1200, 130, 140, 100);
      b.enemy("helmet", 1200, 130);
      b.pyramid("ice", 1200, 250, 2);
      b.hut("ice", 1500, 140, "helmet");
      b.enemy("small", 1500, 260);
    },
  },

  /* ------------------------------------------------------------ 5 Volcano Fortress */
  {
    name: "Hot Crates",
    birds: [R, R],
    hint: "Explosive crates blow up when hit — and take everything nearby with them.",
    build(b) {
      b.hut("stone", 1100, 0);
      b.tnt(1180, 0);
      b.tnt(1020, 0);
      b.enemy("small", 1100, 120);
      b.hut("wood", 1350, 0);
    },
  },
  {
    name: "Chain Reaction",
    birds: [R, Y, R],
    build(b) {
      for (const x of [950, 1090, 1230]) {
        b.tnt(x, 0);
        b.hut("stone", x + 70, 0, "small", 80, 90);
      }
      b.plat(1560, 220, 160);
      b.hut("stone", 1560, 220, "helmet", 100, 100, "wood");
    },
  },
  {
    name: "Lava Steps",
    birds: [K, R, B],
    build(b) {
      b.plat(1000, 100, 160);
      b.plat(1200, 200, 160);
      b.plat(1400, 300, 160);
      b.hut("stone", 1000, 100, "small", 100, 100, "wood");
      b.hut("glass", 1200, 200, "helmet");
      b.tnt(1400, 300);
      b.enemy("small", 1450, 300);
      b.enemy("small", 1350, 300);
    },
  },
  {
    name: "Basalt Bastion",
    birds: [R, K, Y],
    build(b) {
      b.frame("stone", 1150, 0, 240, 110);
      b.tnt(1150, 0);
      b.enemy("helmet", 1080, 0);
      b.enemy("helmet", 1220, 0);
      b.frame("stone", 1150, 130, 160, 90);
      b.enemy("small", 1150, 130);
      b.stack("stone", 950, 0, 4);
    },
  },
  {
    name: "Powder Keg Tower",
    birds: [R, B, K],
    build(b) {
      let t = b.tower(1150, 0, ["stone", "stone"], 110, 90, ["helmet", "small"]);
      b.tnt(1150, t);
      t = b.frame("glass", 1150, t, 110, 90);
      t = b.tower(1150, t, ["wood"], 110, 90, ["small"]);
      b.enemy("helmet", 1150, t);
      b.hut("stone", 1480, 0, "helmet", 100, 100, "stone");
      b.box("stone", 1480, 120, 60, 40);
    },
  },
  {
    name: "Twin Calderas",
    birds: [Y, K, B, R],
    build(b) {
      b.plat(1050, 150, 220, 150);
      b.plat(1450, 150, 220, 150);
      b.hut("wood", 1000, 150, "helmet");
      b.tnt(1100, 150);
      b.hut("glass", 1390, 150);
      b.hut("stone", 1510, 150, "small", 100, 100, "wood");
      b.enemy("big", 1250, 0);
    },
  },
  {
    name: "Obsidian Maze",
    birds: [K, B, K],
    hint: "Layers inside layers. Blast your way to the centre.",
    build(b) {
      b.frame("stone", 1200, 0, 300, 160);
      b.frame("wood", 1200, 0, 180, 100);
      b.enemy("helmet", 1200, 0);
      b.enemy("small", 1090, 0);
      b.enemy("small", 1310, 0);
      b.frame("glass", 1200, 180, 180, 80);
      b.enemy("small", 1200, 180);
      b.tnt(980, 0);
      b.plat(1520, 260, 80);
      b.enemy("helmet", 1520, 260);
    },
  },
  {
    name: "Magma Bridge",
    birds: [Y, K, B],
    build(b) {
      b.plat(1000, 200, 120, 200);
      b.plat(1450, 200, 120, 200);
      b.beam("stone", 1225, 200, 520);
      b.tnt(1225, 220);
      b.hut("wood", 1120, 220, "small", 80, 90);
      b.hut("glass", 1330, 220, "helmet", 80, 90);
      b.enemy("big", 1225, 0);
    },
  },
  {
    name: "Fortress Gate",
    birds: [K, Y, B, R],
    build(b) {
      b.stack("stone", 950, 0, 6);
      b.stack("stone", 1050, 0, 6);
      b.beam("stone", 1000, 240, 160);
      b.enemy("helmet", 1000, 260);
      b.frame("wood", 1250, 0, 160, 110);
      b.enemy("big", 1250, 0);
      b.tnt(1250, 130);
      b.hut("glass", 1450, 0, "helmet");
      b.enemy("small", 1450, 120);
    },
  },
  {
    name: "Moko King's Throne",
    birds: [R, Y, B, K, K, R],
    hint: "The Moko King himself! Tear down the throne and win back the Sunfruit.",
    build(b) {
      b.plat(1300, 100, 400, 100);
      b.tower(950, 0, ["stone", "glass"], 100, 90, ["helmet", "small"]);
      b.enemy("king", 1300, 100);
      b.frame("stone", 1300, 100, 160, 120);
      b.tnt(1180, 100);
      b.tnt(1420, 100);
      b.frame("wood", 1300, 240, 160, 90);
      b.enemy("helmet", 1300, 240);
      b.beam("glass", 1300, 350, 200);
      b.enemy("small", 1250, 370);
      b.enemy("small", 1350, 370);
      b.hut("stone", 1600, 0, "big", 120, 110);
    },
  },
];

export const LEVELS = SPECS.map((s, i) => makeLevel({ ...s, id: i + 1, world: Math.floor(i / 10) }));
export const levelsOfWorld = (w) => LEVELS.slice(w * 10, w * 10 + 10);
