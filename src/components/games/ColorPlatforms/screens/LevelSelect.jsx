/** Color Platforms — level select: 5 chapter tabs × 10 nodes + a compact detail panel. */
import { useState } from "react";
import { Icon } from "./icons.jsx";
import { CHAPTERS } from "../data/chapters.js";
import { LEVELS, getLevel } from "../data/levels/index.js";
import { isUnlocked, starMask, starCount, highestUnlocked } from "../utils/storage.js";
import { ui, fmtTime } from "./ui.js";

export default function LevelSelect({ progress, chapter, onChapter, onPlay, onBack }) {
  const [sel, setSel] = useState(() => {
    const h = highestUnlocked(progress);
    return getLevel(h)?.chapter === chapter ? h : (chapter - 1) * 10 + 1;
  });
  const ch = CHAPTERS[chapter - 1];
  const ids = LEVELS.filter((L) => L.chapter === chapter).map((L) => L.id);
  const selL = getLevel(sel) && getLevel(sel).chapter === chapter ? getLevel(sel) : getLevel(ids[0]);
  const chapterStars = (c) => LEVELS.filter((L) => L.chapter === c).reduce((n, L) => n + starCount(starMask(progress, L.id)), 0);
  const chapterOpen = (c) => {
    const first = LEVELS.find((L) => L.chapter === c);
    return first && isUnlocked(progress, first.id);
  };
  const selUnlocked = selL && isUnlocked(progress, selL.id);
  const best = selL ? progress.bestTimes[selL.id] : null;
  const mask = selL ? starMask(progress, selL.id) : 0;

  return (
    <div className="cp-screen">
      <div className="cp-panel cp-levels">
        <header className="cp-sheet__head">
          <button type="button" className="cp-iconbtn" aria-label="Back" onClick={onBack} {...ui}>
            <Icon name="back" />
          </button>
          <h2>LEVELS</h2>
        </header>
        <nav className="cp-tabs" aria-label="Chapters">
          {CHAPTERS.map((c) => {
            const open = chapterOpen(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`cp-tab${c.id === chapter ? " is-on" : ""}${open ? "" : " is-locked"}`}
                style={{ "--a1": c.ui[0], "--a2": c.ui[1] }}
                onClick={() => {
                  onChapter(c.id);
                  setSel((c.id - 1) * 10 + 1);
                }}
                aria-pressed={c.id === chapter}
                {...ui}
              >
                <b>{c.id}</b>
                <span>{c.name}</span>
                <small>
                  {open ? (
                    <>
                      <Icon name="star" /> {chapterStars(c.id)}/30
                    </>
                  ) : (
                    <Icon name="lock" />
                  )}
                </small>
              </button>
            );
          })}
        </nav>
        <div className="cp-levels__body" style={{ "--a1": ch.ui[0], "--a2": ch.ui[1] }}>
          <div className="cp-path">
            {ids.length === 0 && <p className="cp-empty">Coming soon</p>}
            {ids.map((id, i) => {
              const open = isUnlocked(progress, id);
              const m = starMask(progress, id);
              const done = !!progress.completed[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`cp-node${id === selL?.id ? " is-sel" : ""}${open ? "" : " is-locked"}${done ? " is-done" : ""}`}
                  style={{ "--r": i < 5 ? 0 : 1, "--c": i < 5 ? i : 9 - i }}
                  onClick={() => setSel(id)}
                  onDoubleClick={() => open && onPlay(id)}
                  aria-label={`Level ${id}${open ? "" : " (locked)"}`}
                  {...ui}
                >
                  <span className="cp-node__num">{open ? id : <Icon name="lock" />}</span>
                  <span className="cp-node__stars">
                    {[0, 1, 2].map((k) => (
                      <Icon key={k} name="star" className={m & (1 << k) ? "is-on" : ""} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          {selL && (
            <aside className="cp-detail">
              <span className="cp-detail__kicker">
                {ch.name} · {selL.id}
              </span>
              <h3>{selL.name}</h3>
              <div className="cp-detail__stars">
                {[0, 1, 2].map((k) => (
                  <Icon key={k} name="star" className={mask & (1 << k) ? "is-on" : ""} />
                ))}
              </div>
              <dl>
                <div>
                  <dt>BEST</dt>
                  <dd>{best ? fmtTime(best) : "--:--.--"}</dd>
                </div>
                <div>
                  <dt>STATUS</dt>
                  <dd>{progress.perfect[selL.id] ? "PERFECT" : progress.completed[selL.id] ? "CLEARED" : selUnlocked ? "NEW" : "LOCKED"}</dd>
                </div>
              </dl>
              <button type="button" className="cp-btn cp-btn--primary" disabled={!selUnlocked} onClick={() => onPlay(selL.id)} {...ui}>
                {selUnlocked ? (
                  <>
                    <Icon name="play" /> PLAY
                  </>
                ) : (
                  <>
                    <Icon name="lock" /> LOCKED
                  </>
                )}
              </button>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
