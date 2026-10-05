/**
 * Train Commander — geometry and timing shared by the engine and renderer.
 *
 * REFERENCE FRAME (the one rule everything follows):
 *   The simulation runs in the TRAIN FRAME. The train sits still on the X
 *   axis (front = +X, centred on x = 0); the ground, scenery, stations and
 *   wrecks slide past at −trainSpeed. Right of the train is +Z (camera side),
 *   left is −Z. Enemies steer with velocities relative to the train, so one
 *   pacing beside a wagon is motionless here while its wheels spin at
 *   ground speed (= relative velocity + train speed).
 *   Distance travelled `d` only feeds route progress and scenery scrolling
 *   (tile index = floor((d + x) / TILE)), so nothing ever drifts with long
 *   journeys — every position the player can see stays within ~±200 units.
 */
export const STEP = 1 / 60;
export const MAX_FRAME = 0.1; // clamp after tab switches, debugger pauses, fullscreen
export const MAX_STEPS = 24;

export const LOCO_LEN = 6.6;
export const WAGON_LEN = 4.9;
export const COUPLER = 0.62;
export const HALF_W = 1.25; // car body half-width (enemy collision)
export const RAIL_Y = 0.45; // rail head above the ground (cars ride here)
export const MOUNT_Y = 1.92; // module mount height on a wagon deck (above the rail)
export const TILE = 40; // scenery tile length (features snap to it)

export const LOCO_HP = 800;
export const WAGON_HP = 220;

export const SPAWN_Z = 23; // side spawns start this far out
export const AHEAD_X = 36; // ahead/behind spawns this far beyond the train ends
export const WARN_TIME = 2.6; // warning marker shows this long before a group arrives
export const MAX_ENEMIES = 46;
export const DYING_TIME = 1.25;
export const DYING_TIME_VEHICLE = 1.7;
export const ENDING_TIME = 2.2;

export const ACCEL = 1.8; // train acceleration leaving a stop (u/s²)
export const BRAKE_DIST = 70; // distance over which the train brakes into a station
export const CHECKPOINT_TIME = 15; // departure countdown once the field is clear
export const CHECKPOINT_HOLD = 30; // …or after this long stopped with threats around
export const FEATURE_LOOKAHEAD = 210; // bridges/tunnels commit this far ahead
export const BOSS_RAIL_Z = -10.6; // the parallel track (Iron Frontier final boss)

/** cars: index 0 = locomotive, then wagons front → rear; train centred on x=0 */
export function layoutTrain(wagons) {
  const lens = [LOCO_LEN];
  for (let i = 0; i < wagons; i++) lens.push(WAGON_LEN);
  const total = lens.reduce((a, b) => a + b, 0) + COUPLER * wagons;
  let front = total / 2;
  return lens.map((len, i) => {
    const c = { index: i, kind: i === 0 ? "loco" : "wagon", len, x: front - len / 2 };
    front -= len + COUPLER;
    return c;
  });
}

export const trainFront = (cars) => cars[0].x + cars[0].len / 2;
export const trainRear = (cars) => {
  const c = cars[cars.length - 1];
  return c.x - c.len / 2;
};
