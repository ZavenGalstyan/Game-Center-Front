/**
 * Vice Streets 3D — side activities, generated as stage lists for the same
 * runner the story missions use (engine/missions.js).
 *
 *   taxi       3 fares: pick up on the sidewalk, drive them before the meter runs out
 *   delivery   Sunny Post van, 3 parcels to random addresses against one clock
 *   race       street race against 3 AI racers
 *   parking    park in 3 marked bays, no scrapes, 45 s each
 *   trial      checkpoint time trial along the coast and downtown
 * Paid fares / parcels add to run.earned (kept even when the run fails).
 */
import { ACTIVITIES } from "../data/missions.js";
import { COLS, ROWS, WALK_OFF } from "./city.js";
import { dist } from "./util.js";

export const activityById = (id) => ACTIVITIES.find((a) => a.id === id);

/** a random sidewalk + kerb pair in an open district, between dmin and dmax from (x, z) */
function streetSpot(sim, x, z, dmin, dmax) {
  const c = sim.city;
  for (let k = 0; k < 60; k++) {
    const i = sim.rand.int(0, COLS.length - 2);
    const j = sim.rand.int(0, ROWS.length - 2);
    const d = c.districtAt((COLS[i] + COLS[i + 1]) / 2, (ROWS[j] + ROWS[j + 1]) / 2);
    if (!sim.districtOpen(d)) continue;
    const side = sim.rand.pick(["N", "S", "E", "W"]);
    const t = sim.rand.range(0.3, 0.7);
    const curb = c.curbPt(i, j, side, t);
    const dd = dist(curb.x, curb.z, x, z);
    if (dd < dmin || dd > dmax) continue;
    const foot = c.walkPt(i, j, side, t);
    // keep the waiting spot clear of lamp posts and palms
    if (c.solids.some((s) => foot.x > s.x0 - 0.7 && foot.x < s.x1 + 0.7 && foot.z > s.z0 - 0.7 && foot.z < s.z1 + 0.7)) continue;
    return { curb: { x: curb.x, z: curb.z, h: curb.h }, foot: { x: foot.x, z: foot.z, h: curb.h }, district: d, name: `${["North", "South", "East", "West"][["N", "S", "E", "W"].indexOf(side)]} ${d}` };
  }
  return null;
}

export function buildActivity(sim, id) {
  const act = activityById(id);
  const P = sim.focus();
  const car = sim.player.mode === "car" ? sim.player.car : null;
  const def = { activity: true, id, name: act.name, title: act.name, stages: [], reward: act.reward };
  const S = def.stages;
  switch (id) {
    case "taxi": {
      if (!car || car.type !== "taxi") {
        S.push({ type: "spawn", key: "cab", vehicle: "taxi", at: "taxiCurb" });
        S.push({ type: "enter", kind: "taxi", text: "Get into a taxi" });
      }
      let from = sim.city.places.taxiCurb;
      for (let f = 1; f <= 3; f++) {
        const a = streetSpot(sim, from.x, from.z, 40, 230);
        const b = streetSpot(sim, a.curb.x, a.curb.z, 160, 420);
        const d = dist(a.curb.x, a.curb.z, b.curb.x, b.curb.z);
        S.push({ type: "spawnNpc", key: `fare${f}`, look: "random", at: a.foot });
        S.push({ type: "board", npc: `fare${f}`, text: `Fare ${f}/3: pick up the passenger` });
        S.push({ type: "drive", to: b.curb, r: 7, time: Math.round(d / 9.5 + 22), text: `Fare ${f}/3: drive to ${b.name}` });
        S.push({ type: "alight", npc: `fare${f}`, text: "Let the passenger out" });
        S.push({ type: "pay", amount: Math.round(45 + d * 0.32), label: `Fare ${f} paid` });
        from = b.curb;
      }
      break;
    }
    case "delivery": {
      if (!car || car.type !== "van") {
        S.push({ type: "spawn", key: "postVan", vehicle: "van", at: "postCurb", paint: "#ffd166" });
        S.push({ type: "enter", key: "postVan", text: "Get into the Sunny Post van" });
      }
      let from = sim.city.places.postCurb;
      let total = 30;
      for (let k = 1; k <= 3; k++) {
        const b = streetSpot(sim, from.x, from.z, 140, 360);
        total += dist(from.x, from.z, b.curb.x, b.curb.z) / 9 + 10;
        S.push({ type: "drive", to: b.curb, r: 7, text: `Parcel ${k}/3: ${b.name}` });
        S.push({ type: "pay", amount: 60, label: `Parcel ${k} delivered` });
        from = b.curb;
      }
      def.time = Math.round(total);
      break;
    }
    case "race": {
      if (!car) S.push({ type: "enter", any: true, text: "Get into a car" });
      S.push({ type: "goto", to: "raceFlag", r: 8, on: "car", stop: true, text: "Line up at the start" });
      S.push({ type: "race", racers: 3, matchClass: true, tune: 0, pace: 0.72, easy: true, pts: [["n", 5, 1], ["n", 5, 2], ["n", 7, 2], ["n", 7, 0], ["n", 4, 0], ["n", 4, 1], ["n", 6, 1], "raceFlag"], r: 11, text: "Win the boulevard race" });
      break;
    }
    case "parking": {
      if (!car) S.push({ type: "enter", any: true, text: "Get into a car" });
      // the challenge uses the public lot's bays only (not the island's casino / marina lots)
      const bays = sim.city.parking.filter((p) => p.bay && p.lot === "public");
      const pick = [];
      while (pick.length < 3) {
        const b = sim.rand.pick(bays);
        if (!pick.includes(b)) pick.push(b);
      }
      pick.forEach((b, k) => {
        const along = Math.abs(Math.sin(b.h)) > 0.5;
        const rect = along ? { x0: b.x - 3.3, x1: b.x + 3.3, z0: b.z - 1.6, z1: b.z + 1.6 } : { x0: b.x - 1.6, x1: b.x + 1.6, z0: b.z - 3.3, z1: b.z + 3.3 };
        S.push({ type: "clearBay", bay: b });
        // the lot's aisle runs east–west between the two rows of bays, entered from the east kerb
        const lot = sim.city.places.parkingLot.rect;
        const aisleZ = (lot.z0 + lot.z1) / 2 + 1;
        const via = [{ x: lot.x1 + 4.6, z: aisleZ }, { x: lot.x1 - 6, z: aisleZ }];
        S.push({ type: "park", at: { x: b.x, z: b.z, h: b.h, rect, via }, time: 50, noScrape: true, text: `Bay ${k + 1}/3: park inside the marked bay — no scrapes` });
        S.push({ type: "pay", amount: 50, label: `Bay ${k + 1} done` });
      });
      break;
    }
    case "trial": {
      if (!car) S.push({ type: "enter", any: true, text: "Get into a car" });
      S.push({ type: "goto", to: "trialFlag", r: 8, on: "car", text: "Drive to the start line" });
      S.push({ type: "checkpoints", pts: [["n", 7, 2], ["n", 7, 4], ["n", 6, 4], ["n", 6, 3], ["n", 5, 3], ["n", 4, 3], ["n", 4, 2], ["n", 6, 2], ["n", 6, 0], ["n", 7, 0]], r: 11, time: 95, text: "Hit every checkpoint before time runs out" });
      break;
    }
    default:
  }
  void P;
  return def;
}
export { ACTIVITIES, WALK_OFF };
