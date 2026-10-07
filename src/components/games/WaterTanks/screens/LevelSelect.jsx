/**
 * Water Tanks — level select. Five chapter "reservoirs" across the top; the
 * chosen chapter's ten levels sit on a lab pipeline (a snake of two rows),
 * each a round flask-valve node with its stars and best moves. Locked
 * levels show a lock; the next level to play pulses.
 */
import ScreenHead from "../components/ScreenHead.jsx";
import { Icon, Star, Stars } from "../components/icons.jsx";
import { CHAPTERS, chapterLevelIds } from "../data/chapters.js";
import { getLevel } from "../data/index.js";
import { chapterSummary, nextPlayable, summary } from "../utils/progress.js";

export default function LevelSelect({ progress, chapterId, onChapter, onPlay, onBack }) {
  const chapter = CHAPTERS[chapterId - 1];
  const cs = chapterSummary(progress, chapterId);
  const s = summary(progress);
  const next = nextPlayable(progress);
  const ids = chapterLevelIds(chapterId);
  // node centres on a 5 × 2 snake (percent of the map box)
  const pos = ids.map((_, i) => {
    const row = i < 5 ? 0 : 1;
    const col = row === 0 ? i : 9 - i;
    return { x: 10 + col * 20, y: row === 0 ? 27 : 75 };
  });
  const pathTo = (n) => pos.slice(0, n).map((p, i) => (i === 5
    ? `C${pos[4].x + 10},${pos[4].y} ${p.x + 10},${p.y} ${p.x},${p.y}`
    : `${i ? "L" : "M"}${p.x},${p.y}`)).join(" ");
  const path = pathTo(10);
  // the lit pipe runs through the leading run of solved levels
  let lit = 0;
  while (lit < ids.length && progress.completedLevels.includes(ids[lit])) lit++;

  return (
    <div className="wt-levels">
      <ScreenHead
        kicker="Water Tanks"
        title="Levels"
        onBack={onBack}
        right={<span className="wt-head__stat"><Star on size={14} /> {s.stars} / 150</span>}
      />

      <div className="wt-chapters" role="tablist" aria-label="Chapters">
        {CHAPTERS.map((c) => {
          const sum = chapterSummary(progress, c.id);
          const active = c.id === chapterId;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`wt-chapter${active ? " is-active" : ""}${sum.unlocked ? "" : " is-locked"}`}
              onClick={() => onChapter(c.id)}
            >
              <span className="wt-chapter__gauge" style={{ "--fill": `${(sum.completed / sum.total) * 100}%` }}>
                {sum.unlocked ? <b>{c.id}</b> : <Icon.lock />}
              </span>
              <span className="wt-chapter__text">
                <b>{c.name}</b>
                <small>{sum.completed}/{sum.total} · {sum.stars}★</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="wt-levels__body">
        <aside className="wt-levels__card">
          <span className="wt-head__kicker">Chapter {chapter.id}</span>
          <h3>{chapter.name}</h3>
          <p>{chapter.blurb}</p>
          <div className="wt-meter">
            <span className="wt-meter__label"><b>{cs.completed}</b> / {cs.total} solved</span>
            <span className="wt-meter__bar"><i style={{ width: `${(cs.completed / cs.total) * 100}%` }} /></span>
          </div>
          <div className="wt-meter">
            <span className="wt-meter__label"><b>{cs.stars}</b> / {cs.total * 3} stars</span>
            <span className="wt-meter__bar wt-meter__bar--gold"><i style={{ width: `${(cs.stars / (cs.total * 3)) * 100}%` }} /></span>
          </div>
          {!cs.unlocked && <p className="wt-levels__locked"><Icon.lock /> Finish chapter {chapter.id - 1} to open this lab.</p>}
        </aside>

        <div className="wt-map">
          <svg className="wt-map__pipe" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={path} className="wt-map__pipe-back" vectorEffect="non-scaling-stroke" />
            {lit > 1 && <path d={pathTo(lit)} className="wt-map__pipe-flow" vectorEffect="non-scaling-stroke" />}
          </svg>
          {ids.map((id, i) => {
            const lv = getLevel(id);
            const unlocked = id <= progress.highestUnlockedLevel;
            const stars = progress.starsByLevel[id] || 0;
            const best = progress.bestMovesByLevel[id];
            const done = progress.completedLevels.includes(id);
            const isNext = id === next && unlocked && !done;
            return (
              <button
                key={id}
                type="button"
                className={`wt-node${unlocked ? "" : " is-locked"}${done ? " is-done" : ""}${isNext ? " is-next" : ""}`}
                style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}
                disabled={!unlocked}
                onClick={() => onPlay(id)}
                aria-label={`Level ${id}, ${lv.name}${unlocked ? `, ${stars} stars${best ? `, best ${best} moves` : ""}` : ", locked"}`}
                title={lv.name}
              >
                <span className="wt-node__flask">
                  <span className="wt-node__water" style={{ height: done ? `${30 + stars * 20}%` : isNext ? "18%" : "0%" }} />
                  <span className="wt-node__num">{unlocked ? id : <Icon.lock />}</span>
                </span>
                <span className="wt-node__meta">
                  {unlocked ? <Stars n={stars} size={11} /> : <span className="wt-node__name">Locked</span>}
                  {best ? <small>best {best}</small> : <small className="wt-node__name">{unlocked ? lv.name : ""}</small>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
