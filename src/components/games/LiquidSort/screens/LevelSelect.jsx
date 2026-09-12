/**
 * Liquid Sort — Level Select: five chapters, each with its own subtle
 * palette (see data/chapters.js), 20 level tiles apiece.
 */
import { CHAPTERS } from "../data/chapters.js";
import LevelButton from "../components/LevelButton.jsx";

export default function LevelSelect({ state, onPlay, onBack }) {
  return (
    <div className="ls-levels">
      <div className="ls-topbar">
        <button type="button" className="ls-btn ls-btn--ghost" onClick={onBack}>← Menu</button>
        <div>
          <div className="ls-topbar__title">Level Select</div>
          <div className="ls-topbar__sub">{state.unlockedLevel} / 100 unlocked</div>
        </div>
        <span style={{ width: 64 }} />
      </div>

      <div className="ls-levels__body">
        {CHAPTERS.map((chapter) => {
          const [start, end] = chapter.range;
          const locked = state.unlockedLevel < start;
          return (
            <section
              key={chapter.id}
              className={`ls-chapter${locked ? " ls-chapter--locked" : ""}`}
              style={{
                "--ls-accent": chapter.theme.accent,
                "--ls-accent2": chapter.theme.accent2,
                "--ls-surface": chapter.theme.surface,
              }}
            >
              <div className="ls-chapter__head">
                <div>
                  <div className="ls-chapter__name">{chapter.name}</div>
                  <div className="ls-chapter__meta">{chapter.tagline} · {chapter.difficulty}</div>
                </div>
                <div className="ls-chapter__meta">{start}–{end}</div>
              </div>
              <div className="ls-chapter__grid">
                {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((id) => {
                  const lvl = state.levels[id];
                  return (
                    <LevelButton
                      key={id}
                      id={id}
                      unlocked={id <= state.unlockedLevel}
                      current={id === state.currentLevel}
                      stars={lvl?.stars || 0}
                      bestMoves={lvl?.bestMoves}
                      onPlay={onPlay}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
