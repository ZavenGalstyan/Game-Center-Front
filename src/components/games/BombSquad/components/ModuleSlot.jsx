/**
 * Bomb Squad — one mounted module panel on the device. Renders the correct
 * module component for its type (module visuals live in ../modules/*),
 * or a LOCKED overlay while a dependency is unsolved, or a dimmed SOLVED
 * state once cleared. Never unmounts a solved module — it stays visible,
 * just inert, per the "don't hide solved modules" design requirement.
 */
import { LockIcon, CheckIcon } from "./icons.jsx";
import { moduleDisplayName } from "../data/missions.js";
import ColorWiresModule from "../modules/ColorWiresModule.jsx";
import SymbolMatchModule from "../modules/SymbolMatchModule.jsx";
import SwitchOrderModule from "../modules/SwitchOrderModule.jsx";
import MemoryLightsModule from "../modules/MemoryLightsModule.jsx";
import RotaryDialModule from "../modules/RotaryDialModule.jsx";
import SignalRouterModule from "../modules/SignalRouterModule.jsx";
import CodeChipModule from "../modules/CodeChipModule.jsx";
import PressureBarModule from "../modules/PressureBarModule.jsx";
import GridLinkModule from "../modules/GridLinkModule.jsx";
import SequenceLockModule from "../modules/SequenceLockModule.jsx";

const MODULE_COMPONENTS = {
  colorWires: ColorWiresModule,
  symbolMatch: SymbolMatchModule,
  switchOrder: SwitchOrderModule,
  memoryLights: MemoryLightsModule,
  rotaryDial: RotaryDialModule,
  signalRouter: SignalRouterModule,
  codeChip: CodeChipModule,
  pressureBar: PressureBarModule,
  gridLink: GridLinkModule,
  sequenceLock: SequenceLockModule,
};

const PANEL_LABELS = ["NODE A", "NODE B", "NODE C", "NODE D", "NODE E", "NODE F"];

export default function ModuleSlot({ module, dependsOnType, flashing, settings, onSolve, onWrong }) {
  const Comp = MODULE_COMPONENTS[module.type];
  const locked = module.status === "locked";
  const solved = module.status === "solved";

  return (
    <div
      className={`bs-slot bs-slot--${module.type}${locked ? " is-locked" : ""}${solved ? " is-solved" : ""}${flashing ? " is-flash" : ""}`}
      aria-label={`${moduleDisplayName(module.type)}${solved ? ", solved" : locked ? ", locked" : ""}`}
    >
      <div className="bs-slot__head">
        <span className="bs-slot__panel">{PANEL_LABELS[module.index] || `NODE ${module.index + 1}`}</span>
        <span className="bs-slot__name">{moduleDisplayName(module.type)}</span>
        <span className={`bs-slot__led${solved ? " is-solved" : ""}${locked ? " is-locked" : ""}`} aria-hidden="true" />
      </div>

      <div className="bs-slot__body">
        {locked ? (
          <div className="bs-slot__locked">
            <LockIcon />
            <span>LOCKED</span>
            <small>{dependsOnType ? `Restore ${moduleDisplayName(dependsOnType)} First` : "Dependency pending"}</small>
          </div>
        ) : Comp ? (
          <Comp
            puzzle={module.puzzle}
            solved={solved}
            settings={settings}
            onSolve={onSolve}
            onWrong={onWrong}
          />
        ) : null}
      </div>

      {solved && (
        <div className="bs-slot__solved-badge" aria-hidden="true">
          <CheckIcon />
        </div>
      )}
    </div>
  );
}
