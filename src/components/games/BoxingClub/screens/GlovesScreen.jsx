/**
 * Boxing Club — glove collection, hung on a locker-room wall. Cosmetic only.
 */
import { useEffect, useRef } from "react";
import { Icon } from "../components/icons.jsx";
import { GLOVES, unlockText } from "../data/gloves.js";
import { glove } from "../render/fighterArt.js";

function GlovePair({ g, locked }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width;
    const H = r.height;
    const R = Math.min(W, H) * 0.24;
    // hanging lace
    ctx.strokeStyle = "rgba(240,235,220,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, 4);
    ctx.lineTo(W * 0.33, H * 0.3);
    ctx.moveTo(W * 0.5, 4);
    ctx.lineTo(W * 0.67, H * 0.3);
    ctx.stroke();
    const colors = locked ? { base: "#3a3a40", trim: "#55555c", cuff: "#46464c" } : g;
    glove(ctx, { x: W * 0.33, y: H * 0.18 }, { x: W * 0.33, y: H * 0.6 }, R, colors, "rgba(0,0,0,0.5)", !locked);
    glove(ctx, { x: W * 0.67, y: H * 0.2 }, { x: W * 0.67, y: H * 0.64 }, R, colors, "rgba(0,0,0,0.5)", !locked);
  }, [g, locked]);
  return <canvas ref={ref} className="bc-glovepair" aria-hidden="true" />;
}

export default function GlovesScreen({ progress, onSelect, onBack }) {
  const owned = progress.gloves.unlocked;
  return (
    <div className="bc-gloves">
      <header className="bc-head">
        <button type="button" className="bc-btn bc-btn--icon" onClick={onBack} aria-label="Back"><Icon.back /></button>
        <h2 className="bc-head__title">Gloves</h2>
        <span className="bc-head__meta">{owned.length}/{GLOVES.length} pairs · cosmetic only</span>
      </header>
      <div className="bc-gloves__wall">
        {GLOVES.map((g) => {
          const have = owned.includes(g.id);
          const on = progress.gloves.selected === g.id;
          return (
            <button key={g.id} type="button" className={`bc-hook${on ? " is-on" : ""}${have ? "" : " is-locked"}`} onClick={() => have && onSelect(g.id)} disabled={!have} aria-pressed={on}>
              <span className="bc-hook__peg" />
              <GlovePair g={g} locked={!have} />
              <b>{g.name}</b>
              <small>{have ? (on ? "Wearing" : "Tap to wear") : <><Icon.lock /> {unlockText(g)}</>}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
