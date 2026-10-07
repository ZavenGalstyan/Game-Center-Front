/**
 * Pirate Cove — in-game HUD (DOM over the canvas). Compact on purpose:
 *
 *   top-left    objective card (animates when it changes)
 *   top-centre  compass strip with the objective marker + distance
 *   top-right   gold · fragments · keys
 *   sea         hull bar + speed/sail setting (bottom-left),
 *               port / starboard cannon reload rings (bottom-centre) that
 *               glow when a target sits inside that broadside's arc
 *   ashore      health bar (bottom-left), item counters
 *   always      interaction prompt, toasts, tutorial tips, hit vignette,
 *               "the current pushes you back" sea-edge warning, fades
 * Reads game.hudState() ~12×/s; no per-frame React renders.
 */
import { useEffect, useRef, useState } from "react";
import { MODE, KNOTS } from "../engine/constants.js";
import { TIPS } from "./tips.js";

const DIRS = [
  ["N", 0],
  ["NE", 45],
  ["E", 90],
  ["SE", 135],
  ["S", 180],
  ["SW", 225],
  ["W", 270],
  ["NW", 315],
];

/** Compass bearing in degrees for a world direction (north = −z on our charts → use +z as north). */
function bearingDeg(dx, dz) {
  // heading convention: forward = (sin θ, cos θ); θ = 0 is "north" (+z)
  return ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
}

function Compass({ heading, target, from }) {
  const hd = ((-heading * 180) / Math.PI + 360) % 360; // heading θ → compass (clockwise = turning right = θ decreasing)
  const W = 300;
  const span = 140;
  const items = [];
  for (const [l, d] of DIRS) {
    let diff = ((d - hd + 540) % 360) - 180;
    if (Math.abs(diff) > span / 2) continue;
    items.push(
      <span key={l} className={`pc-compass__dir${l.length === 1 ? " pc-compass__dir--main" : ""}`} style={{ left: `${50 + (diff / span) * 100}%` }}>
        {l}
      </span>,
    );
  }
  for (let d = 0; d < 360; d += 15) {
    if (d % 45 === 0) continue;
    const diff = ((d - hd + 540) % 360) - 180;
    if (Math.abs(diff) > span / 2) continue;
    items.push(<i key={`t${d}`} className="pc-compass__tick" style={{ left: `${50 + (diff / span) * 100}%` }} />);
  }
  let marker = null;
  if (target && from) {
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const b = (360 - bearingDeg(dx, dz)) % 360;
    let diff = ((b - hd + 540) % 360) - 180;
    const clamped = Math.max(-span / 2, Math.min(span / 2, diff));
    const dist = Math.hypot(dx, dz);
    marker = (
      <span className={`pc-compass__obj${Math.abs(diff) > span / 2 ? " pc-compass__obj--edge" : ""}`} style={{ left: `${50 + (clamped / span) * 100}%` }}>
        <b>◆</b>
        <em>{dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`}</em>
      </span>
    );
  }
  return (
    <div className="pc-compass" style={{ width: W }}>
      <div className="pc-compass__strip">{items}</div>
      {marker}
      <div className="pc-compass__needle" />
    </div>
  );
}

function Ring({ k, ready, target, label, keyName }) {
  const R = 22;
  const C = 2 * Math.PI * R;
  return (
    <div className={`pc-gun${ready ? " pc-gun--ready" : ""}${ready && target ? " pc-gun--lock" : ""}`}>
      <svg viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={R} className="pc-gun__bg" />
        <circle cx="28" cy="28" r={R} className="pc-gun__fill" strokeDasharray={`${C * k} ${C}`} transform="rotate(-90 28 28)" />
        <path d="M17 31h16l5-3v6l-5-3M19 31v4h3v-4M29 31v4h3v-4" className="pc-gun__icon" />
      </svg>
      <div className="pc-gun__label">
        <kbd>{keyName}</kbd> {label}
      </div>
      {ready && target && <div className="pc-gun__tag">TARGET</div>}
    </div>
  );
}

export default function Hud({ game, touch, tip, onTipDone, flashKey, showMapHint, onOpenMap, keyHints = true }) {
  const [h, setH] = useState(() => game.hudState());
  const [objFlash, setObjFlash] = useState(0);
  const lastObj = useRef("");
  const [hit, setHit] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setH(game.hudState()), 80);
    return () => clearInterval(id);
  }, [game]);
  useEffect(() => {
    if (h.objective !== lastObj.current) {
      lastObj.current = h.objective;
      setObjFlash((n) => n + 1);
    }
  }, [h.objective]);
  useEffect(() => {
    if (!flashKey) return undefined;
    setHit(1);
    const id = setTimeout(() => setHit(0), 260);
    return () => clearTimeout(id);
  }, [flashKey]);
  useEffect(() => {
    if (!tip) return undefined;
    const id = setTimeout(() => onTipDone?.(), 11000);
    return () => clearTimeout(id);
  }, [tip, onTipDone]);

  const sea = h.mode === MODE.SAILING || h.mode === MODE.DOCKING || h.mode === MODE.SHIP_DESTROYED;
  const foot = h.mode === MODE.ISLAND || h.mode === MODE.DEFEATED || h.mode === MODE.BOARDING;
  const target = game.objectivePos();
  const from = foot && game.pirate ? game.pirate : game.player;
  const hullK = Math.max(0, h.hull / h.maxHull);
  const hpK = Math.max(0, h.hp / h.maxHp);
  const T = tip ? TIPS[tip] : null;
  const fireL = touch ? "◀" : "Q";
  const fireR = touch ? "▶" : "E";

  let prompt = null;
  if (sea && h.dockable && h.mode === MODE.SAILING) {
    prompt = h.dockable.ok ? { key: "F", text: `DOCK AT ${h.dockable.island.name.toUpperCase()}` } : { key: null, text: h.dockable.reason, warn: true };
  } else if (foot && h.focus) {
    prompt = { key: h.focus.kind === "board" ? "F" : "E", text: h.focus.label, warn: h.focus.locked };
  }

  return (
    <div className={`pc-hud${touch ? " pc-hud--touch" : ""}`}>
      <div className={`pc-hit${hit ? " pc-hit--on" : ""}`} />
      {h.outside > 0.05 && sea && <div className="pc-edge">THE CURRENT PUSHES YOU BACK</div>}

      <div className="pc-obj" key={`obj${objFlash}`}>
        <div className="pc-obj__label">{game.adv.name}</div>
        <div className="pc-obj__text">{h.objective}</div>
      </div>

      <Compass heading={h.heading} target={target} from={from} />

      <div className="pc-loot">
        <span className="pc-loot__gold">
          <i className="pc-coin" /> {h.gold}
        </span>
        {h.fragTotal > 0 && (
          <span className="pc-loot__item" title="Map fragments">
            <i className="pc-ico pc-ico--frag" /> {Math.min(h.fragments, h.fragTotal)}/{h.fragTotal}
          </span>
        )}
        {h.keys > 0 && (
          <span className="pc-loot__item" title="Keys">
            <i className="pc-ico pc-ico--key" /> {h.keys}
          </span>
        )}
        {showMapHint && (
          <button type="button" className="pc-loot__map" onClick={onOpenMap}>
            <i className="pc-ico pc-ico--map" /> {keyHints && !touch ? <kbd>M</kbd> : null} MAP
          </button>
        )}
      </div>

      {sea && (
        <>
          <div className="pc-shipbar">
            <div className="pc-bar">
              <div className="pc-bar__label">HULL</div>
              <div className="pc-bar__track">
                <div className={`pc-bar__fill pc-bar__fill--hull${hullK < 0.3 ? " pc-bar__fill--low" : ""}`} style={{ width: `${hullK * 100}%` }} />
              </div>
              <div className="pc-bar__num">{Math.ceil(h.hull)}</div>
            </div>
            <div className="pc-speed">
              <b>{Math.round(Math.abs(h.speed) * KNOTS)}</b>
              <span>KN</span>
              <div className="pc-sails" title="Sail setting (W / S)">
                {[0.25, 0.5, 0.75, 1].map((k) => (
                  <i key={k} className={h.throttle >= k - 0.05 ? "on" : ""} />
                ))}
                {h.throttle < -0.02 && <em>REV</em>}
              </div>
            </div>
          </div>
          <div className="pc-guns">
            <Ring k={1 - h.reload.left / h.reloadTime} ready={h.reload.left <= 0} target={!!h.targets.left} label="PORT" keyName={fireL} />
            <Ring k={1 - h.reload.right / h.reloadTime} ready={h.reload.right <= 0} target={!!h.targets.right} label="STARBOARD" keyName={fireR} />
          </div>
        </>
      )}

      {foot && (
        <div className="pc-shipbar">
          <div className="pc-bar">
            <div className="pc-bar__label">HEALTH</div>
            <div className="pc-bar__track">
              <div className={`pc-bar__fill pc-bar__fill--hp${hpK < 0.3 ? " pc-bar__fill--low" : ""}`} style={{ width: `${hpK * 100}%` }} />
            </div>
            <div className="pc-bar__num">{Math.ceil(h.hp)}</div>
          </div>
        </div>
      )}

      {prompt && (
        <div className={`pc-prompt${prompt.warn ? " pc-prompt--warn" : ""}`}>
          {prompt.key && <kbd>{touch ? "TAP" : prompt.key}</kbd>}
          {prompt.text}
        </div>
      )}

      {h.toast && (
        <div className="pc-toast" key={`toast${h.toast.id}`}>
          {h.toast.text}
        </div>
      )}

      {T && (
        <div className="pc-tip" key={`tip-${tip}`}>
          <div className="pc-tip__title">{T.title}</div>
          <ul>
            {(touch && T.touch ? T.touch : T.lines).map((l, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: l }} />
            ))}
          </ul>
          <button type="button" className="pc-tip__x" onClick={onTipDone} aria-label="Dismiss tip">
            ×
          </button>
        </div>
      )}

      <div className="pc-fade" style={{ opacity: h.fade }} />
    </div>
  );
}
