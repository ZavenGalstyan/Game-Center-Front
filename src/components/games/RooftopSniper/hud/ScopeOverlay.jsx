/**
 * Rooftop Sniper — the scope overlay: a DOM layer over the canvas (not a
 * flat PNG) that masks everything outside a circular sight picture, with a
 * crosshair, lens vignette and the in-scope readouts (zoom, distance, wind,
 * breath). The crosshair itself never moves — it marks screen-center, which
 * IS the camera's aim direction — so scope sway/recoil reads entirely
 * through the 3D world moving underneath it (three/RooftopScene.jsx).
 *
 * `engine` is the mission engine's store; this subscribes once via
 * useSyncExternalStore so it only re-renders on discrete state changes
 * (zoom step, reload, breath ticks at ~12Hz), never per animation frame.
 */
import { useSyncExternalStore } from "react";

export default function ScopeOverlay({ engine, mission }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getState);

  return (
    <div className={`rs-scope${state.scoped ? " rs-scope--on" : ""}`} aria-hidden="true">
      <div className="rs-scope__mask" />
      <div className="rs-scope__ring">
        <div className="rs-scope__crosshair">
          <span className="rs-scope__line rs-scope__line--v-top" />
          <span className="rs-scope__line rs-scope__line--v-bottom" />
          <span className="rs-scope__line rs-scope__line--h-left" />
          <span className="rs-scope__line rs-scope__line--h-right" />
          <span className="rs-scope__dot" />
        </div>
        <div className="rs-scope__glass" />
        <div className="rs-scope__readout rs-scope__readout--zoom">{state.zoom}×</div>
        {state.aimDistance != null && (
          <div className="rs-scope__readout rs-scope__readout--distance">
            <span className="rs-scope__readout-label">DISTANCE</span>
            <span>{Math.round(state.aimDistance)}m</span>
          </div>
        )}
        {mission.wind && (
          <div className="rs-scope__readout rs-scope__readout--wind">
            {mission.wind.x < 0 ? "←" : "→"} {Math.abs(mission.wind.x).toFixed(1)} m/s
          </div>
        )}
        <div className="rs-scope__breath">
          <div className="rs-scope__breath-fill" style={{ width: `${Math.round(state.breath * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
