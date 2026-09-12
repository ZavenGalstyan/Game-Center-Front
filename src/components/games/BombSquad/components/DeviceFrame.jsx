/**
 * Bomb Squad — the device: a reusable case + timer + module-slot grid.
 * Layout adapts purely from `modules.length` (1-6) via CSS grid classes —
 * no per-mission manual positioning. This is the one visual hero of the
 * whole game; see BombSquad.css `.bs-device*` for the case chrome.
 */
import DeviceTimer from "./DeviceTimer.jsx";
import StrikeIndicator from "./StrikeIndicator.jsx";
import ModuleSlot from "./ModuleSlot.jsx";

export default function DeviceFrame({
  mission,
  accent,
  engineState,
  remaining,
  flashSet,
  settings,
  onSolve,
  onWrong,
  solvedCount,
  requiredCount,
}) {
  const pressure = remaining <= 5 ? "critical" : remaining <= 15 ? "high" : remaining <= 30 ? "warn" : "calm";
  const count = engineState.modules.length;

  return (
    <div className={`bs-device bs-device--${count} bs-device--${pressure}`} style={{ "--bs-accent": accent }}>
      <div className="bs-device__vents" aria-hidden="true" />
      <div className="bs-device__screws" aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      <div className="bs-device__top">
        <div className="bs-device__id">
          <span className="bs-device__serial">UNIT-{String(mission.id).padStart(2, "0")}</span>
          <span className="bs-device__op">{mission.label || `MISSION ${mission.id}`}</span>
        </div>
        <DeviceTimer remaining={remaining} total={mission.timer} reducedMotion={settings.reducedMotion} />
        <div className="bs-device__status">
          <StrikeIndicator strikes={engineState.strikes} maxStrikes={engineState.maxStrikes} />
          <span className="bs-device__progress">{solvedCount}/{requiredCount} MODULES</span>
        </div>
      </div>

      <div className="bs-device__body" role="list">
        {engineState.modules.map((m) => (
          <ModuleSlot
            key={m.index}
            module={m}
            dependsOnType={m.dependsOn != null ? engineState.modules[m.dependsOn]?.type : null}
            flashing={flashSet.has(m.index)}
            settings={settings}
            onSolve={() => onSolve(m.index)}
            onWrong={() => onWrong(m.index)}
          />
        ))}
      </div>

      <div className="bs-device__bottom">
        <span className="bs-device__tag">SAFE</span>
        <span className="bs-device__tag bs-device__tag--armed">ARMED</span>
        <span className="bs-device__code">SEQ-{(mission.id * 137) % 900 + 100}</span>
      </div>
    </div>
  );
}
