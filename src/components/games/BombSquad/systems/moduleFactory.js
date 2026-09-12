/**
 * Bomb Squad — dispatch table between a mission module config's `type` and
 * the pure generator in systems/moduleLogic.js. The single place that knows
 * "which generator goes with which type" so missionEngine.js and the module
 * components never import moduleLogic.js directly.
 */
import { makeRng } from "../utils/random.js";
import * as logic from "./moduleLogic.js";

const GENERATORS = {
  colorWires: logic.generateColorWires,
  symbolMatch: logic.generateSymbolMatch,
  switchOrder: logic.generateSwitchOrder,
  memoryLights: logic.generateMemoryLights,
  rotaryDial: logic.generateRotaryDial,
  signalRouter: logic.generateSignalRouter,
  codeChip: logic.generateCodeChip,
  pressureBar: logic.generatePressureBar,
  gridLink: logic.generateGridLink,
  sequenceLock: logic.generateSequenceLock,
};

/** Generates the puzzle for one module config, seeded by mission + slot. */
export function generateModulePuzzle(missionId, slotIndex, type, difficulty) {
  const gen = GENERATORS[type];
  if (!gen) throw new Error(`Bomb Squad: unknown module type "${type}"`);
  const rng = makeRng("bomb-squad", missionId, slotIndex, type, difficulty);
  return gen(Math.max(1, difficulty || 1), rng);
}

export function isKnownModuleType(type) {
  return Boolean(GENERATORS[type]);
}
