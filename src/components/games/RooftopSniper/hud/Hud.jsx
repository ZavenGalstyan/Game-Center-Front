/**
 * Rooftop Sniper — compact gameplay HUD: mission name/objective (top-left),
 * ammo (top-right), targets-remaining pip row and a reload prompt. Kept
 * deliberately small — the scope (hud/ScopeOverlay.jsx) carries the
 * precision readouts, this layer only orients the player between shots.
 */
import { useSyncExternalStore } from "react";

export default function Hud({ engine, mission, locked, showClickToPlay }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const hitCount = state.targetsHitIds.length;

  return (
    <div className="rs-hud">
      <div className="rs-hud__top-left">
        <p className="rs-hud__mission-name">MISSION {mission.id} — {mission.name}</p>
        <p className="rs-hud__objective">{mission.objective}</p>
        <div className="rs-hud__pips">
          {mission.targets.map((t) => (
            <span
              key={t.id}
              className={`rs-hud__pip${state.targetsHitIds.includes(t.id) ? " rs-hud__pip--hit" : ""}`}
            />
          ))}
        </div>
      </div>

      <div className="rs-hud__top-right">
        <p className="rs-hud__ammo">
          <span className="rs-hud__ammo-mag">{state.rounds}</span>
          <span className="rs-hud__ammo-sep">/</span>
          <span className="rs-hud__ammo-spare">{state.spareMags}</span>
        </p>
        {state.reloading && <p className="rs-hud__reloading">RELOADING…</p>}
        {!state.reloading && state.rounds === 0 && (
          <p className="rs-hud__reload-prompt">PRESS R TO RELOAD</p>
        )}
      </div>

      {hitCount > 0 && (
        <p className="rs-hud__progress">
          {hitCount} / {mission.targets.length} TARGETS
        </p>
      )}

      {locked && (
        <div className="rs-hud__hints">
          <span>LMB SHOOT</span>
          <span>RMB SCOPE</span>
          <span>WHEEL ZOOM</span>
          <span>R RELOAD</span>
          <span>SHIFT HOLD BREATH</span>
        </div>
      )}

      {showClickToPlay && (
        <div className="rs-hud__click-to-play">
          <p>CLICK TO AIM</p>
        </div>
      )}
    </div>
  );
}
