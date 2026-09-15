/**
 * Supermarket Rush — level select, grouped by store tier so progression
 * reads as "grow the store", not a flat grid of 15 buttons. A tier is
 * locked until its first level is reachable (i.e. the previous tier's
 * last level is cleared).
 */
import { levelsByTier } from "../data/levels.js";
import { buildTierLayout } from "../data/tiers.js";

const TIER_BLURB = {
  small: "Levels 1–5 · Learn the ropes",
  neighborhood: "Levels 6–10 · Deliveries, carts & checkout",
  supermarket: "Levels 11–15 · The full supermarket",
};

function Stars({ count }) {
  return (
    <span className="sr-levels__stars">
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < count ? "sr-star sr-star--on" : "sr-star"}>★</span>
      ))}
    </span>
  );
}

export default function LevelSelect({ state, onPick, onBack }) {
  const groups = levelsByTier();

  return (
    <div className="sr-screen sr-levels">
      <header className="sr-screen__header">
        <button type="button" className="sr-btn sr-btn--icon" onClick={onBack}>‹</button>
        <h1>Levels</h1>
      </header>
      <div className="sr-levels__tiers">
        {groups.map(({ tierId, levels }) => {
          const layout = buildTierLayout(tierId);
          const tierUnlocked = levels.some((l) => l.id <= state.unlockedLevel);
          return (
            <section key={tierId} className={`sr-levels__tier${tierUnlocked ? "" : " sr-levels__tier--locked"}`}>
              <div className="sr-levels__tier-head">
                <h2>{layout.name}</h2>
                <span>{TIER_BLURB[tierId]}</span>
              </div>
              <div className="sr-levels__grid">
                {levels.map((l) => {
                  const unlocked = l.id <= state.unlockedLevel;
                  const stars = state.stars[l.id] || 0;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className={`sr-levels__card${unlocked ? "" : " sr-levels__card--locked"}`}
                      disabled={!unlocked}
                      onClick={() => unlocked && onPick(l.id)}
                    >
                      <span className="sr-levels__num">{l.id}</span>
                      <span className="sr-levels__name">{l.name}</span>
                      {unlocked ? <Stars count={stars} /> : <span className="sr-levels__lock">🔒</span>}
                    </button>
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
