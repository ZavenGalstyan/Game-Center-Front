/**
 * Bomb Squad — the defusal state machine. Pure reducer, no timers, no DOM,
 * no rendering — fully testable in isolation (see the ad-hoc checks run
 * during development). DefusalScreen.jsx is the only place that dispatches
 * into it and reacts to status transitions (sound, onComplete/onFailed).
 *
 *   status: "active" | "complete" | "failed"
 *   modules[i].status: "locked" | "active" | "solved"
 *
 * Transient in-puzzle interaction state (click progress, dial angle, drag)
 * lives as local component state inside each module component instead —
 * it never needs to survive a strike/solve re-render (same component
 * instance, same key) and is naturally discarded on mission restart
 * (DefusalScreen remounts the whole tree via a `key`).
 */
import { generateModulePuzzle } from "./moduleFactory.js";

export function initMissionState(mission) {
  const modules = mission.modules.map((cfg, index) => ({
    index,
    type: cfg.type,
    difficulty: cfg.difficulty,
    dependsOn: cfg.dependsOn ?? null,
    status: cfg.dependsOn != null ? "locked" : "active",
    puzzle: generateModulePuzzle(mission.id, index, cfg.type, cfg.difficulty),
  }));
  return {
    missionId: mission.id,
    timer: mission.timer,
    maxStrikes: mission.maxStrikes,
    strikePenalty: mission.strikePenalty || 0,
    strikes: 0,
    status: "active",
    failReason: null,
    modules,
  };
}

function unlockDependents(modules, solvedIndex) {
  return modules.map((m) =>
    m.status === "locked" && m.dependsOn === solvedIndex ? { ...m, status: "active" } : m,
  );
}

export function missionReducer(state, action) {
  if (state.status !== "active" && action.type !== "RESET") return state;

  switch (action.type) {
    case "RESET":
      return action.state;

    case "SOLVE": {
      const modules = state.modules.map((m) =>
        m.index === action.index && m.status === "active" ? { ...m, status: "solved" } : m,
      );
      const solvedModule = modules.find((m) => m.index === action.index);
      if (!solvedModule || solvedModule.status !== "solved") return state;
      const unlocked = unlockDependents(modules, action.index);
      const allSolved = unlocked.every((m) => m.status === "solved");
      return { ...state, modules: unlocked, status: allSolved ? "complete" : state.status };
    }

    case "STRIKE": {
      const strikes = state.strikes + 1;
      const failed = strikes >= state.maxStrikes;
      return { ...state, strikes, status: failed ? "failed" : state.status, failReason: failed ? "strikes" : null };
    }

    case "EXPIRE":
      return { ...state, status: "failed", failReason: "time" };

    default:
      return state;
  }
}

export function solvedCount(state) {
  return state.modules.filter((m) => m.status === "solved").length;
}

export function requiredCount(state) {
  return state.modules.length;
}
