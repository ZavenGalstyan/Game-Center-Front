/**
 * Farm Life — the list of static, Y-sortable world entities (buildings,
 * fences, trees, bushes, props). Built once and reused every frame:
 * positions never change, so there's no reason to recompute this per-frame.
 *
 * `z` is each entity's sort key — top-down 2D uses a painter's-algorithm
 * depth sort ("Y-sort"): entities with a larger world Z (further south, so
 * visually lower/closer to the camera) draw on top of ones with a smaller
 * Z, exactly like Stardew-style top-down games. GameCanvas merges this list
 * with the player/chickens (whose Z changes every frame) and sorts the
 * union before drawing.
 */
import {
  FARMHOUSE, STORAGE_SHED, BARN, COOP, COOP_PEN, WELL, MAILBOX, SIGNPOST, WINDMILL,
  SEED_STAND, SHIPPING_BOX, buildBoundaryTrees, buildScatterDecor,
} from "../engine/terrain.js";

export const NEST_BOX = { x: COOP.minX - 0.55, z: (COOP.minZ + COOP.maxZ) / 2 };
export const FEEDER = { x: COOP_PEN.maxX - 0.5, z: COOP_PEN.minZ + 0.5 };

function rectZ(rect) {
  return rect.maxZ;
}

export function buildStaticEntities() {
  const entities = [];

  entities.push({ z: rectZ(FARMHOUSE), kind: "farmhouse", data: FARMHOUSE });
  entities.push({ z: rectZ(STORAGE_SHED), kind: "shed", data: STORAGE_SHED });
  entities.push({ z: rectZ(BARN), kind: "barn", data: BARN });
  entities.push({ z: rectZ(COOP), kind: "coopBuilding", data: COOP });
  entities.push({ z: WELL.z + WELL.r, kind: "well", data: WELL });
  entities.push({ z: MAILBOX.z + 0.3, kind: "mailbox", data: MAILBOX });
  entities.push({ z: SIGNPOST.z + 0.3, kind: "signpost", data: SIGNPOST });
  entities.push({ z: WINDMILL.z + 1, kind: "windmill", data: WINDMILL });
  entities.push({ z: SEED_STAND.z + 0.5, kind: "seedStand", data: SEED_STAND });
  entities.push({ z: SHIPPING_BOX.z + 0.4, kind: "shippingBox", data: SHIPPING_BOX });
  entities.push({ z: NEST_BOX.z + 0.2, kind: "nestBox", data: NEST_BOX });
  entities.push({ z: FEEDER.z + 0.15, kind: "feeder", data: FEEDER });

  const trees = buildBoundaryTrees();
  for (const t of trees) entities.push({ z: t.z + t.r, kind: "tree", data: t });

  const { bushes, rocks, flowers, grassTufts } = buildScatterDecor();
  for (const b of bushes) entities.push({ z: b.z + 0.35 * b.scale, kind: "bush", data: b });

  return { sortable: entities, rocks, flowers, grassTufts };
}
