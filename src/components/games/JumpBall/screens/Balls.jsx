/** Jump Ball — ball collection. Cosmetic only; every ball plays identically. */
import { useEffect, useRef } from "react";
import { Icon } from "./icons.jsx";
import { SKINS, unlockText } from "../data/skins.js";
import { skinUnlocked } from "../utils/storage.js";
import { drawBall } from "../render/ball.js";

function BallPreview({ skin, size = 64, spin = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawBall(ctx, { x: size / 2, y: size / 2, r: size * 0.42, rot: spin, skin, rim: "#cfe8ff", quality: "high" });
  }, [skin, size, spin]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}

export default function Balls({ progress, onSelect, onBack }) {
  return (
    <div className="jb-screen">
      <div className="jb-panel jb-sheet">
        <header className="jb-sheet__head">
          <button type="button" className="jb-iconbtn" aria-label="Back" onClick={onBack}>
            <Icon name="back" />
          </button>
          <h2>BALLS</h2>
          <span className="jb-sheet__note">SAME BOUNCE · NEW LOOK</span>
        </header>
        <div className="jb-balls">
          {SKINS.map((s, i) => {
            const open = skinUnlocked(progress, s);
            const on = progress.selectedSkin === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className={`jb-ball${on ? " is-on" : ""}${open ? "" : " is-locked"}`}
                onClick={() => open && onSelect(s.id)}
                disabled={!open}
                aria-pressed={on}
              >
                <span className="jb-ball__stage">
                  <span className="jb-ball__bob">
                    <BallPreview skin={s} spin={i * 0.7} />
                  </span>
                  <span className="jb-ball__shadow" />
                </span>
                <strong>{s.name}</strong>
                <small>{on ? "SELECTED" : open ? "SELECT" : (
                  <>
                    <Icon name="lock" /> {unlockText(s.unlock)}
                  </>
                )}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
