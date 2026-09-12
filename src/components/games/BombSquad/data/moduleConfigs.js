/**
 * Bomb Squad — metadata for the 10 reusable module types. Used by the
 * Device Archive (discovery gallery) and by moduleFactory.js to dispatch
 * generation/checking logic. All fictional puzzle mechanics — see
 * systems/moduleLogic.js for the actual rules.
 */
export const MODULE_TYPES = [
  {
    type: "colorWires",
    name: "Color Wires",
    short: "A bundle of colored cables. Cut the one the posted serial rule points to.",
  },
  {
    type: "symbolMatch",
    name: "Symbol Match",
    short: "Reproduce the indicator strip's symbol order on the panel below it.",
  },
  {
    type: "switchOrder",
    name: "Switch Order",
    short: "Set every switch to match the coded UP/DOWN rule, then confirm.",
  },
  {
    type: "memoryLights",
    name: "Memory Lights",
    short: "Watch the flash sequence, then repeat it exactly (some panels want it reversed).",
  },
  {
    type: "rotaryDial",
    name: "Rotary Dial",
    short: "Rotate the dial to the target value(s) in order.",
  },
  {
    type: "signalRouter",
    name: "Signal Router",
    short: "Activate exactly the nodes that route a signal from START to OUTPUT.",
  },
  {
    type: "codeChip",
    name: "Code Chip",
    short: "Select the fictional code chips in the order the rule demands.",
  },
  {
    type: "pressureBar",
    name: "Pressure Bar",
    short: "Tap the moment the marker enters the safe zone. Repeat as required.",
  },
  {
    type: "gridLink",
    name: "Grid Link",
    short: "Trace a path from START to END without touching restricted cells.",
  },
  {
    type: "sequenceLock",
    name: "Sequence Lock",
    short: "Enter the ring of icons in the order the rule describes.",
  },
];

export function moduleConfig(type) {
  return MODULE_TYPES.find((m) => m.type === type) || null;
}
