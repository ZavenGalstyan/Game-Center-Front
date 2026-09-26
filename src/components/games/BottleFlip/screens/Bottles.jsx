/** Bottle Flip — bottle collection: bottles on shelves, pick one, equip. */
import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/icons.jsx";
import { SKINS, unlockText } from "../data/skins.js";
import { drawBottle } from "../render/bottle.js";
import { audio } from "../audio/audio.js";

export function BottleThumb({ skin, locked, size = 64 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(size * 0.55);
    const h = size;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const k = h / 24;
    ctx.translate(w / 2, h - 8.5 * k);
    ctx.scale(k, k);
    if (locked) ctx.filter = "saturate(0.35) brightness(0.6)";
    drawBottle(ctx, skin, { tilt: 0, slosh: 0, time: 0.4, quality: "high" });
    ctx.filter = "none";
  }, [skin, locked, size]);
  return <canvas ref={ref} className="bf-thumb" style={{ width: size * 0.55, height: size }} />;
}

export default function Bottles({ progress, onEquip, onBack }) {
  const [sel, setSel] = useState(progress.skin);
  const skin = SKINS.find((s) => s.id === sel) || SKINS[0];
  const owned = progress.skins.includes(skin.id);
  const equipped = progress.skin === skin.id;
  const rows = [SKINS.slice(0, 5), SKINS.slice(5, 10)];
  return (
    <div className="bf-screen bf-list">
      <header className="bf-head">
        <button type="button" className="bf-back" onClick={onBack}>
          <Icon.back /> Back
        </button>
        <h2>Bottles</h2>
        <span className="bf-head__meta">
          {progress.skins.length}/{SKINS.length}
        </span>
      </header>
      <div className="bf-bottles">
        <div className="bf-shelves">
          {rows.map((row, r) => (
            <div key={r} className="bf-shelf">
              <div className="bf-shelf__items">
                {row.map((s) => {
                  const have = progress.skins.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`bf-shelf__btn${s.id === sel ? " is-sel" : ""}${have ? "" : " is-locked"}`}
                      onClick={() => {
                        audio.ui();
                        setSel(s.id);
                      }}
                      aria-label={`${s.name}${have ? "" : " (locked)"}`}
                      aria-pressed={s.id === sel}
                    >
                      <BottleThumb skin={s} locked={!have} size={130} />
                      {progress.skin === s.id && <em className="bf-shelf__eq">ON</em>}
                      {!have && (
                        <span className="bf-shelf__lock">
                          <Icon.lock />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="bf-shelf__board" />
            </div>
          ))}
        </div>
        <aside className="bf-bottle-info">
          <div className="bf-bottle-info__stage" key={skin.id}>
            <BottleThumb skin={skin} locked={!owned} size={180} />
          </div>
          <h3>{skin.name}</h3>
          <p className="bf-note">{owned ? "Unlocked · looks only — every bottle flips the same" : unlockText(skin.unlock)}</p>
          <button type="button" className="bf-btn bf-btn--primary bf-btn--wide" disabled={!owned || equipped} onClick={() => onEquip(skin.id)}>
            {equipped ? (
              <>
                <Icon.check /> EQUIPPED
              </>
            ) : owned ? (
              "EQUIP"
            ) : (
              <>
                <Icon.lock /> LOCKED
              </>
            )}
          </button>
        </aside>
      </div>
    </div>
  );
}
