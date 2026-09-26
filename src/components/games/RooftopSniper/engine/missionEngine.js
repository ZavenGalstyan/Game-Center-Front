/**
 * Rooftop Sniper — the one reusable mission engine. Every mission (data-
 * driven by data/missions.js) is played through this same runtime: ammo,
 * reload, hold-breath stamina, bullet flight + collision (engine/ballistics.js),
 * scope zoom, a mission timer when one is set, scoring and pass/fail.
 *
 * Target variety (moving / pop-up / decoy / switch-gated / drone) is also
 * handled generically here — see `updateTargetMovement` — so every mission
 * still runs through this same engine instead of one-off per-mission code.
 *
 * Continuous per-frame numbers (camera yaw/pitch, sway, recoil) stay as refs
 * inside three/RooftopScene.jsx and never touch this engine. Everything
 * here is *discrete* run state — ammo, hits, reload progress, aim distance —
 * exposed through a small store (same `get/set/subscribe` shape as
 * Supermarket Rush's engine/gameStore.js) so the HUD re-renders only when
 * one of these actually changes, never once per frame.
 */
import * as THREE from "three";
import { spawnBullet, stepBullet } from "./ballistics.js";

const BREATH_DEPLETE_TIME = 4.2; // seconds of Shift before breath runs out
const BREATH_REGEN_TIME = 2.6; // seconds to refill after releasing Shift
export const BREATH_SWAY_MULT = 0.18; // sway multiplier while steadied (three/RooftopScene.jsx)
const AIM_COS_THRESHOLD = 0.997; // ~4.4° cone for "what's under the crosshair"
const SYNC_INTERVAL = 0.08; // seconds between HUD store syncs for continuous fields

/** Non-decoy, non-switch kinds count toward "hit all targets". */
const OBJECTIVE_KINDS = new Set(["stationary", "moving", "popup", "drone"]);

function buildTarget(t) {
  const base = new THREE.Vector3(...t.position);
  const to = t.movement?.to ? new THREE.Vector3(...t.movement.to) : null;
  return {
    id: t.id,
    label: t.label,
    kind: t.kind || "stationary",
    radius: t.radius,
    baseCenter: base,
    toCenter: to,
    center: base.clone(),
    hit: false,
    active: !t.unlocksAfter,
    locked: Boolean(t.unlocksAfter),
    unlocksAfter: t.unlocksAfter || null,
    movement: t.movement || null,
    spin: Boolean(t.spin),
    spinPhase: 0,
  };
}

/** Advances a target's live `center`/`active` from its movement descriptor. Pure mutation, no allocation per call beyond the temp vector. */
const _span = new THREE.Vector3();
function updateTargetMovement(t, elapsed) {
  if (t.hit || t.locked) return;
  const m = t.movement;
  if (!m) return;

  if (m.type === "patrol" && t.toCenter) {
    const speed = m.speed ?? 0.6;
    const phase = (Math.sin(elapsed * speed) + 1) / 2; // 0..1 ping-pong
    _span.subVectors(t.toCenter, t.baseCenter);
    t.center.copy(t.baseCenter).addScaledVector(_span, phase);
  } else if (m.type === "hover") {
    const r = m.radius ?? 1.4;
    const speed = m.speed ?? 0.8;
    t.center.set(
      t.baseCenter.x + Math.cos(elapsed * speed) * r,
      t.baseCenter.y + Math.sin(elapsed * speed * 1.4) * 0.5,
      t.baseCenter.z + Math.sin(elapsed * speed) * r,
    );
  }

  if (m.type === "popup") {
    const cycle = m.interval ?? 3.2;
    const visibleFor = m.visibleFor ?? 1.6;
    const local = (elapsed + (m.offset || 0)) % cycle;
    t.active = local < visibleFor;
  } else {
    t.active = true;
  }

  if (t.spin) t.spinPhase = elapsed * (m?.spinSpeed ?? 1.4);
}

export function createMissionEngine(mission, rifle, callbacks = {}) {
  const targets = mission.targets.map(buildTarget);
  const objectiveTotal = targets.filter((t) => OBJECTIVE_KINDS.has(t.kind)).length;

  let bullets = [];
  const zoomLevels = rifle.zoomLevels;

  let state = {
    rounds: rifle.magazine,
    magazineSize: rifle.magazine,
    spareMags: mission.reserveMags,
    reloading: false,
    scoped: false,
    zoomIndex: 0,
    zoom: zoomLevels[0],
    breath: 1,
    holdingBreath: false,
    timeRemaining: mission.timeLimit,
    elapsed: 0,
    shotsFired: 0,
    hits: 0,
    misses: 0,
    targetsHitIds: [],
    targetsTotal: objectiveTotal,
    aimDistance: null,
    finished: false,
    finishResult: null, // { success, reason, stars, accuracy, timeElapsed, shotsFired, hits, misses }
  };

  const subs = new Set();
  const notify = () => subs.forEach((fn) => fn());
  const set = (patch) => {
    state = { ...state, ...patch };
    notify();
  };

  let reloadElapsed = 0;
  let syncAccumulator = 0;
  let elapsedTrue = 0;
  let breathTrue = 1;
  let timeRemainingTrue = mission.timeLimit ?? 0;

  function finish(success, reason) {
    if (state.finished) return;
    const accuracy = state.shotsFired > 0 ? state.hits / state.shotsFired : 0;
    let stars = 0;
    if (success) {
      stars = accuracy >= mission.stars.threeAccuracy ? 3 : accuracy >= mission.stars.twoAccuracy ? 2 : 1;
    }
    const result = {
      success,
      reason,
      stars,
      accuracy,
      missionId: mission.id,
      timeElapsed: elapsedTrue,
      shotsFired: state.shotsFired,
      hits: state.hits,
      misses: state.misses,
    };
    set({ finished: true, finishResult: result });
    callbacks.onFinish?.(result);
  }

  function unlockGatedTargets(switchId) {
    for (const t of targets) {
      if (t.unlocksAfter === switchId) {
        t.locked = false;
      }
    }
  }

  /** A bullet found `target` under it — dispatch by kind. */
  function handleTargetHit(target) {
    target.hit = true;

    if (target.kind === "switch") {
      unlockGatedTargets(target.id);
      callbacks.onSwitch?.({ target });
      return;
    }

    if (target.kind === "decoy") {
      callbacks.onDecoy?.({ target });
      set({ misses: state.misses + 1 });
      if (mission.failOnDecoyHit) finish(false, "WRONG TARGET HIT");
      return;
    }

    callbacks.onImpact?.({ kind: "target", target });
    set({
      hits: state.hits + 1,
      targetsHitIds: [...state.targetsHitIds, target.id],
    });
    if (state.targetsHitIds.length >= objectiveTotal) {
      finish(true, null);
    }
  }

  function outOfOptions() {
    return state.rounds <= 0 && state.spareMags <= 0 && !state.reloading && bullets.length === 0;
  }

  return {
    mission,
    rifle,
    targets,
    get bullets() {
      return bullets;
    },
    getState: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    /** 0..1 reload progress, read imperatively (every frame) for the rifle's dip animation. */
    getReloadProgress() {
      return state.reloading ? Math.min(1, reloadElapsed / rifle.reloadTime) : 0;
    },

    tryFire(originVec3, dirVec3) {
      if (state.finished || state.reloading) return false;
      if (state.rounds <= 0) {
        callbacks.onEmpty?.();
        return false;
      }
      const bullet = spawnBullet({
        origin: originVec3,
        direction: dirVec3,
        speed: rifle.velocity,
        bulletDrop: mission.bulletDrop,
        wind: mission.wind,
      });
      bullets.push(bullet);
      set({ rounds: state.rounds - 1, shotsFired: state.shotsFired + 1 });
      callbacks.onShot?.();
      return true;
    },

    tryReload() {
      if (state.finished || state.reloading) return false;
      if (state.rounds >= state.magazineSize) return false;
      if (state.spareMags <= 0) {
        callbacks.onEmpty?.();
        return false;
      }
      reloadElapsed = 0;
      set({ reloading: true });
      callbacks.onReloadStart?.();
      return true;
    },

    cycleZoom(wheelDelta) {
      if (!wheelDelta || !state.scoped || zoomLevels.length < 2) return;
      const dir = wheelDelta > 0 ? 1 : -1;
      const next = Math.min(zoomLevels.length - 1, Math.max(0, state.zoomIndex + dir));
      if (next !== state.zoomIndex) {
        set({ zoomIndex: next, zoom: zoomLevels[next] });
        callbacks.onZoomStep?.();
      }
    },

    setScoped(scoped) {
      if (scoped !== state.scoped) set({ scoped });
    },

    /** Called once per frame with the live camera pose. */
    step(dt, { cameraPos, cameraDir, holdBreath }) {
      if (state.finished) return;

      let forceSync = false;

      // reload progress
      if (state.reloading) {
        reloadElapsed += dt;
        if (reloadElapsed >= rifle.reloadTime) {
          state = {
            ...state,
            reloading: false,
            rounds: state.magazineSize,
            spareMags: state.spareMags - 1,
          };
          callbacks.onReloadDone?.();
          forceSync = true;
        }
      }

      // breath stamina
      const holding = holdBreath && state.breath > 0;
      elapsedTrue += dt;
      breathTrue += holding ? -dt / BREATH_DEPLETE_TIME : dt / BREATH_REGEN_TIME;
      breathTrue = Math.max(0, Math.min(1, breathTrue));
      if (holding !== state.holdingBreath) forceSync = true;

      // mission timer
      if (mission.timeLimit != null) {
        timeRemainingTrue = Math.max(0, timeRemainingTrue - dt);
      }

      // target movement / pop-up visibility / switch gating
      for (const t of targets) updateTargetMovement(t, elapsedTrue);

      // bullets
      const activeTargets = targets.filter((t) => !t.hit && !t.locked && t.active);
      let missesDelta = 0;
      bullets = bullets.filter((b) => {
        const hitTarget = stepBullet(b, dt, activeTargets);
        if (hitTarget) {
          handleTargetHit(hitTarget);
          return false;
        }
        if (!b.alive) {
          missesDelta += 1;
          return false;
        }
        return true;
      });
      if (missesDelta > 0) {
        state = { ...state, misses: state.misses + missesDelta };
        forceSync = true;
      }

      // aim distance readout (what's under the crosshair right now)
      let aimDistance = null;
      for (const t of targets) {
        if (t.hit || t.locked || !t.active) continue;
        const toTarget = t.center.clone().sub(cameraPos);
        const dist = toTarget.length();
        if (dist < 1e-3) continue;
        toTarget.normalize();
        const cos = toTarget.dot(cameraDir);
        if (cos > AIM_COS_THRESHOLD && (aimDistance == null || dist < aimDistance)) {
          aimDistance = dist;
        }
      }
      if ((aimDistance == null) !== (state.aimDistance == null)) forceSync = true;

      syncAccumulator += dt;
      if (syncAccumulator >= SYNC_INTERVAL || forceSync) {
        syncAccumulator = 0;
        set({
          breath: breathTrue,
          holdingBreath: holding,
          elapsed: elapsedTrue,
          timeRemaining: mission.timeLimit != null ? timeRemainingTrue : null,
          aimDistance,
        });
      }

      if (mission.timeLimit != null && timeRemainingTrue <= 0 && !state.finished) {
        finish(false, "TIME EXPIRED");
        return;
      }
      if (!state.finished && outOfOptions()) {
        finish(false, "OUT OF AMMO");
      }
    },
  };
}
