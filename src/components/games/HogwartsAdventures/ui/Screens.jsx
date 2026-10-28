/**
 * Dialogue panel, the Game Over card, the Victory screen and the loader.
 */
import { useEffect, useState } from "react";
import { HEROES } from "../data/heroes.js";

export function Dialogue({ d, touch, onNext, onChoose }) {
  const [shown, setShown] = useState(0);
  const text = d.text || "";
  useEffect(() => setShown(0), [text]);
  useEffect(() => {
    if (shown >= text.length) return;
    const t = setTimeout(() => setShown((s) => Math.min(text.length, s + 3)), 16);
    return () => clearTimeout(t);
  }, [shown, text]);
  const done = shown >= text.length;
  const house = d.who === "you" ? HEROES[d.hero]?.house : null;
  return (
    <div className="hwa-dlg" onClick={() => (!d.choices ? (done ? onNext() : setShown(text.length)) : null)}>
      <div className="hwa-dlg__box">
        {d.name && <div className={`hwa-dlg__name${house ? ` is-${house}` : ""}`}>{d.name}</div>}
        <p className={d.who === "narrator" ? "is-narr" : ""}>{text.slice(0, shown)}</p>
        {d.choices && done ? (
          <div className="hwa-dlg__choices">
            {d.choices.map((c, i) => (
              <button key={i} onClick={(e) => (e.stopPropagation(), onChoose(i))}>
                {!touch && <kbd>{i + 1}</kbd>} {c}
              </button>
            ))}
          </div>
        ) : (
          <div className="hwa-dlg__more">{touch ? "Tap to continue" : "Space / E / click to continue · Esc to skip"}</div>
        )}
      </div>
    </div>
  );
}

export function Death({ where, onRetry, onMenu }) {
  return (
    <div className="hwa-modal hwa-modal--dark">
      <div className="hwa-panel hwa-panel--narrow hwa-death">
        <h2>You have fallen</h2>
        <p>Your friends drag you back to {where}. Catch your breath — and try again.</p>
        <button className="hwa-btn hwa-btn--primary" onClick={onRetry}>
          Rise again
        </button>
        <button className="hwa-btn hwa-btn--ghost" onClick={onMenu}>
          Quit to title
        </button>
      </div>
    </div>
  );
}

export function Victory({ P, onReturn, onMenu }) {
  const mins = Math.round(P.stats.time / 60);
  return (
    <div className="hwa-victory">
      <div className="hwa-victory__glow" />
      <div className="hwa-victory__box">
        <small>Victory</small>
        <h1>Hogwarts Stands</h1>
        <p>The Dark Lord's wand clatters across the broken stones, and with it his hold on the night. The Aegis Stone is safe; the wards burn bright again over the towers.</p>
        <p>Somewhere far below, the castle settles on its old foundations — and, for the first time in weeks, sleeps.</p>
        <div className="hwa-victory__stats">
          <div>
            <b>{HEROES[P.hero].short}</b>
            <span>finished the duel</span>
          </div>
          <div>
            <b>{mins} min</b>
            <span>played</span>
          </div>
          <div>
            <b>{P.stats.kills}</b>
            <span>foes defeated</span>
          </div>
          <div>
            <b>{P.stats.casts}</b>
            <span>spells cast</span>
          </div>
          <div>
            <b>{P.stats.pages}/8</b>
            <span>pages found</span>
          </div>
          <div>
            <b>{P.stats.deaths}</b>
            <span>falls</span>
          </div>
        </div>
        <div className="hwa-row">
          <button className="hwa-btn hwa-btn--primary" onClick={onReturn}>
            Return to Hogwarts
          </button>
          <button className="hwa-btn" onClick={onMenu}>
            Title screen
          </button>
        </div>
      </div>
    </div>
  );
}

export function Loading({ p, err, onRetry }) {
  return (
    <div className="hwa-loading">
      <h2>Hogwarts Adventures</h2>
      {err ? (
        <>
          <p>{err}</p>
          <button className="hwa-btn" onClick={onRetry}>
            Retry
          </button>
        </>
      ) : (
        <>
          <div className="hwa-loading__bar">
            <i style={{ width: `${Math.round(p * 100)}%` }} />
          </div>
          <p>Lighting the candles…</p>
        </>
      )}
    </div>
  );
}
