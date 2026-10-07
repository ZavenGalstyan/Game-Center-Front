/**
 * Night Corridor — the minimal HUD. The environment dominates; the HUD
 * only shows what you need, when you need it:
 *
 *   objective     small, top-left; flares briefly when it changes
 *   prompt        "[E] Open" under the crosshair when you look at something
 *   message       short centre-screen line ("LOCKED", "MAINTENANCE KEY")
 *   stamina       a thin bar that only appears while sprinting / recovering
 *   battery       a tiny flashlight gauge only when low or toggled
 *   items         tiny chips for carried keys / fuses
 */
import { useEffect, useRef, useState } from "react";

const ITEM_ICON = {
  key: "M7 14a5 5 0 1 1 4.9-6H22v4h-2v3h-3v-3h-5.1A5 5 0 0 1 7 14zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  fuse: "M8 3h8v3h-2v12h2v3H8v-3h2V6H8z",
  keycard: "M3 6h18v12H3zM5 9h6v2H5z",
};

function useHudSnapshot(game, hz = 15) {
  const [snap, setSnap] = useState(() => read(game));
  useEffect(() => {
    const id = setInterval(() => setSnap(read(game)), 1000 / hz);
    return () => clearInterval(id);
  }, [game, hz]);
  return snap;
}

function read(game) {
  const p = game.player;
  return {
    objective: game.objective.text,
    objectiveT: game.objective.t,
    time: game.time,
    prompt: game.prompt,
    message: game.message && game.time < game.message.until ? game.message.text : null,
    messageT: game.message?.t ?? 0,
    stamina: p.stamina,
    exhausted: p.exhausted,
    sprinting: p.sprinting,
    battery: p.battery,
    flashlight: p.flashlight,
    inventory: game.inventory.map((id) => {
      const it = game.items.find((i) => i.item === id);
      return { id, name: it?.name || id, model: it?.model || "key" };
    }),
    mode: game.mode,
    chase: Boolean(game.chase),
    hiding: Boolean(game.hiding),
  };
}

export default function Hud({ game, showHints, touch }) {
  const s = useHudSnapshot(game);
  const [flashT, setFlashT] = useState(-10);
  const lastFlash = useRef(s.flashlight);
  useEffect(() => {
    if (s.flashlight !== lastFlash.current) {
      lastFlash.current = s.flashlight;
      setFlashT(s.time);
    }
  }, [s.flashlight, s.time]);

  if (s.mode === "COMPLETE") return null;
  const fresh = s.time - s.objectiveT < 4;
  const showStamina = s.sprinting || s.stamina < 0.98;
  const showBattery = s.battery < 0.35 || s.time - flashT < 2.5;
  return (
    <div className="nc-hud" aria-live="polite">
      {s.objective && s.mode !== "CAUGHT" && (
        <div key={s.objective} className={`nc-objective${fresh ? " nc-objective--fresh" : ""}${s.chase ? " nc-objective--chase" : ""}`}>
          <span className="nc-objective__mark" />
          {s.objective}
        </div>
      )}

      {s.inventory.length > 0 && (
        <div className="nc-items">
          {s.inventory.map((it) => (
            <div key={it.id} className="nc-item" title={it.name}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={ITEM_ICON[it.model] || ITEM_ICON.key} fill="currentColor" />
              </svg>
              <span>{it.name}</span>
            </div>
          ))}
        </div>
      )}

      {s.mode !== "CAUGHT" && !s.hiding && <div className={`nc-crosshair${s.prompt ? " nc-crosshair--active" : ""}`} />}
      {s.prompt && s.mode !== "CAUGHT" && (
        <div className="nc-prompt">
          <span className="nc-key">{touch ? "USE" : "E"}</span>
          {s.prompt}
        </div>
      )}
      {s.message && (
        <div key={`${s.message}${s.messageT}`} className="nc-message">
          {s.message}
        </div>
      )}

      <div className={`nc-stamina${showStamina ? " is-visible" : ""}${s.exhausted ? " is-exhausted" : ""}`}>
        <div className="nc-stamina__fill" style={{ transform: `scaleX(${Math.max(0, s.stamina)})` }} />
      </div>

      <div className={`nc-battery${showBattery ? " is-visible" : ""}${s.battery < 0.2 ? " is-low" : ""}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9h9l5-3v12l-5-3H4z" fill={s.flashlight ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <div className="nc-battery__bar">
          <div style={{ transform: `scaleX(${s.battery})` }} />
        </div>
      </div>

      {showHints && s.mode === "PLAYING" && !touch && (
        <div className="nc-hints">
          <span><b>WASD</b> move</span>
          <span><b>Mouse</b> look</span>
          <span><b>Shift</b> sprint</span>
          <span><b>E</b> interact</span>
          <span><b>F</b> flashlight</span>
          <span><b>C</b> crouch</span>
          <span><b>P</b> pause</span>
        </div>
      )}
    </div>
  );
}
