/**
 * Delivery Rush — the run state machine.
 *
 * One delivery is a short queue of targets: the pickup, then any intermediate
 * stops, then the drop-off. The clock covers the whole run (getting to the
 * pickup included), which is why data/missions.js measures the distance from
 * the spawn point rather than from the shop door.
 *
 * A target only triggers when the car is inside the marker *and* slow enough —
 * blasting through a pickup at 90 km/h does nothing, which is the difference
 * between a delivery game and a checkpoint game.
 */

const ARRIVE_SPEED = 6.0; // m/s — about 21 km/h
const DWELL = 0.22; // seconds inside the zone before it counts

export class DeliveryRun {
  constructor(mission, layout) {
    this.mission = mission;
    const at = (id) => layout.locationMap[id];
    const stops = (mission.stopIds || []).map(at).filter(Boolean);

    this.targets = [
      { ...at(mission.pickupId), stage: "pickup", label: "Pick up" },
      ...stops.map((s) => ({ ...s, stage: "stop", label: "Drop at" })),
      { ...at(mission.dropoffId), stage: "dropoff", label: "Deliver to" },
    ];

    this.index = 0;
    this.timeLeft = mission.timeLimit;
    this.elapsed = 0;
    this.condition = 100;
    this.collisions = 0;
    this.distance = 0;
    this.dwell = 0;
    this.state = "running"; // running | complete | failed
    this.failReason = null;
    this.carrying = false;
    this.events = [];
  }

  get target() {
    return this.targets[Math.min(this.index, this.targets.length - 1)];
  }

  /** Intermediate drops still to make — the final destination is not a "stop". */
  get remainingStops() {
    return Math.max(0, this.targets.length - this.index - 2);
  }

  /** Register an impact: costs the streak bonus, and cargo condition if fragile. */
  hit(impact) {
    this.collisions += 1;
    if (this.mission.fragile) {
      // a scrape is almost free; a real crash is not
      const damage = Math.min(26, Math.max(1.5, (impact - 1.2) * 4.2));
      this.condition = Math.max(0, this.condition - damage);
      this.events.push({ type: "damage", condition: this.condition });
      if (this.condition <= 0) this.fail("PACKAGE DESTROYED");
    }
  }

  fail(reason) {
    if (this.state !== "running") return;
    this.state = "failed";
    this.failReason = reason;
    this.events.push({ type: "fail", reason });
  }

  /**
   * Advance the run. Returns the events raised this frame; the caller drains
   * them for sound, HUD banners and scoring.
   */
  update(dt, car) {
    this.events.length = 0;
    if (this.state !== "running") return this.events;

    this.elapsed += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.fail("TIME EXPIRED");
      return this.events;
    }

    const t = this.target;
    const dx = car.x - t.x;
    const dz = car.z - t.z;
    const dist = Math.hypot(dx, dz);
    this.distanceToTarget = dist;

    const speed = Math.abs(car.speed);
    if (dist <= (t.radius || 6.5) && speed <= ARRIVE_SPEED) {
      this.dwell += dt;
      if (this.dwell >= DWELL) this.arrive();
    } else {
      this.dwell = 0;
    }
    return this.events;
  }

  arrive() {
    const t = this.target;
    this.dwell = 0;
    if (t.stage === "pickup") {
      this.carrying = true;
      this.index += 1;
      this.events.push({ type: "pickup", location: t, next: this.target });
      return;
    }
    if (t.stage === "stop") {
      this.index += 1;
      this.events.push({ type: "stop", location: t, next: this.target });
      return;
    }
    this.state = "complete";
    this.events.push({ type: "complete", location: t });
  }

  /** The snapshot the HUD renders from. */
  snapshot(car) {
    const t = this.target;
    return {
      state: this.state,
      stage: t.stage,
      targetName: t.name,
      targetLabel: t.label,
      targetX: t.x,
      targetZ: t.z,
      targetRadius: t.radius || 6.5,
      distance: this.distanceToTarget ?? Math.hypot(car.x - t.x, car.z - t.z),
      timeLeft: this.timeLeft,
      elapsed: this.elapsed,
      condition: this.condition,
      collisions: this.collisions,
      carrying: this.carrying,
      remainingStops: this.remainingStops,
      failReason: this.failReason,
    };
  }

  /** What progression.scoreDelivery needs when the run ends. */
  result(car) {
    return {
      time: this.elapsed,
      collisions: this.collisions,
      condition: Math.round(this.condition),
      distance: car?.distance ?? 0,
    };
  }
}

export { ARRIVE_SPEED };
