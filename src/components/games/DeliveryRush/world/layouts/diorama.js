/**
 * Delivery Rush — the menu diorama.
 *
 * The main menu shows a real street, not a flat page: one lit intersection,
 * four blocks of the current district's building kit, planting and traffic. It
 * is built with exactly the same CityBuilder as the playable districts, just at
 * a fraction of the size, so it always matches whichever zone the player was
 * last in — palette, weather, building families and all.
 */

import { CityBuilder, SIDEWALK_W, ROAD_W } from "../cityBuilder.js";
import { signalise } from "./grid.js";

const KITS = {
  "central-city": {
    kinds: ["apartment", "shop", "office", "townhouse"],
    heights: [4, 8],
    shops: 0.75,
    trees: 3.0,
    treeKind: "tree",
  },
  "sunset-coast": {
    kinds: ["hotel", "shop", "apartment", "cafe"],
    heights: [3, 6],
    shops: 0.85,
    trees: 3.2,
    treeKind: "palm",
  },
  "industrial-run": {
    kinds: ["warehouse", "factory", "office"],
    heights: [1, 3],
    shops: 0.2,
    trees: 0.8,
    treeKind: "tree",
    widthRange: [14, 24],
    minDepth: 12,
    maxDepth: 18,
  },
  "frost-city": {
    kinds: ["townhouse", "house", "apartment"],
    heights: [2, 4],
    shops: 0.5,
    trees: 2.6,
    treeKind: "pine",
    widthRange: [6, 11],
  },
  "midnight-metro": {
    kinds: ["tower", "office", "shop", "apartment"],
    heights: [8, 14],
    shops: 0.9,
    trees: 1.4,
    treeKind: "tree",
  },
};

const EXT = 118;
const CROSS = 74;

export function buildDiorama(zone) {
  const b = new CityBuilder({ seed: zone.seed + 900, zone: zone.id });
  const kit = KITS[zone.id] || KITS["central-city"];

  b.road(-EXT, 0, EXT, 0, "main");
  b.road(0, -CROSS, 0, CROSS, "street");

  const hMain = ROAD_W.main / 2 + SIDEWALK_W;
  const hSide = ROAD_W.street / 2 + SIDEWALK_W;

  const quads = [
    [-EXT + 14, -CROSS + 8, -hSide, -hMain],
    [hSide, -CROSS + 8, EXT - 14, -hMain],
    [-EXT + 14, hMain, -hSide, CROSS - 8],
    [hSide, hMain, EXT - 14, CROSS - 8],
  ];

  quads.forEach((q, i) => {
    if (i === 2 && zone.id !== "industrial-run") {
      b.park(q[0], q[1], q[2], q[3], { trees: 12, benches: 4, treeKind: kit.treeKind, path: false });
    } else {
      b.block(q[0], q[1], q[2], q[3], kit);
    }
  });

  signalise(b, 0, 0, ROAD_W.street / 2, ROAD_W.main / 2);
  b.prop("bus-stop", -34, hMain - 1.4, 0);
  if (zone.id !== "industrial-run") {
    for (let i = 0; i < 4; i++) b.prop("terrace", 18 + i * 8, -hMain + 1.6, Math.PI);
  }

  // the hero parking spot: kerbside, just off the junction
  b.setSpawn(16, -ROAD_W.main / 2 + 5.3, Math.PI / 2 - 0.3);
  return b.finish();
}
