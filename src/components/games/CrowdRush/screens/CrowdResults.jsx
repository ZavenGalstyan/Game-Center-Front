/**
 * Crowd Rush — level complete / level failed. Shows the crowd that reached the
 * finish, best crowd, enemies defeated, runners lost, stars earned and coins,
 * plus the star targets so the player sees what a better run needs.
 */

import { useEffect } from "react";
import { starTargets } from "../utils/scoring.js";
import { prevBest } from "../utils/storage.js";
import { sfx } from "../utils/sound.js";

export default function CrowdResults({ level, world, result, state, hasNext, onNext, onReplay, onLevels, onMenu }) {
  const best = prevBest(state, level.id);
  const targets = starTargets(level);
  const soundOn = state.settings.sound;

  useEffect(() => {
    if (result.success) {
      for (let i = 0; i < result.stars; i++) setTimeout(() => sfx.star(soundOn), 300 + i * 260);
      setTimeout(() => sfx.coin(soundOn), 300 + result.stars * 260);
    }
  }, [result, soundOn]);

  return (
    <div className="cr-screen cr-result" style={{ "--w-accent": world.accent }}>
      <div className={`cr-result__card ${result.success ? "is-win" : "is-fail"}`}>
        <h2 className="cr-result__title">
          {result.success ? "Level Complete" : result.reason || "Crowd Defeated"}
        </h2>

        {result.success && (
          <div className="cr-result__stars">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`cr-result__star ${i < result.stars ? "is-on" : ""}`} style={{ animationDelay: `${i * 0.25}s` }}>
                ★
              </span>
            ))}
          </div>
        )}

        <div className="cr-result__grid">
          <Row label="Final Crowd" value={result.finalCrowd} big />
          <Row label="Best Crowd" value={Math.max(best.bestCrowd, result.finalCrowd)} />
          <Row label="Enemies Defeated" value={result.enemiesDefeated} />
          <Row label="Runners Collected" value={result.runnersCollected} />
          <Row label="Runners Lost" value={result.runnersLost} />
          {result.bossDefeated && <Row label="Boss" value="Defeated" />}
          {result.staircaseMult != null && <Row label="Staircase" value={`×${result.staircaseMult}`} />}
          <Row label="Score" value={result.score} />
          {result.success && <Row label="Coins" value={`+${result.coins}`} />}
        </div>

        {result.success && result.stars < 3 && (
          <p className="cr-result__hint">
            {result.stars < 2
              ? `Reach ${targets.two} for ★★ · ${targets.three} for ★★★`
              : `Reach ${targets.three} with sharp gate choices for ★★★`}
          </p>
        )}

        <div className="cr-result__actions">
          {result.success && hasNext && (
            <button type="button" className="cr-btn cr-btn--primary cr-btn--lg" onClick={onNext}>Next Level</button>
          )}
          <button type="button" className="cr-btn cr-btn--lg" onClick={onReplay}>
            {result.success ? "Replay" : "Retry"}
          </button>
          <div className="cr-result__row">
            <button type="button" className="cr-btn" onClick={onLevels}>Level Select</button>
            <button type="button" className="cr-btn" onClick={onMenu}>Menu</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, big }) {
  return (
    <div className={`cr-result__cell ${big ? "is-big" : ""}`}>
      <span className="cr-result__cell-v">{value}</span>
      <span className="cr-result__cell-l">{label}</span>
    </div>
  );
}
