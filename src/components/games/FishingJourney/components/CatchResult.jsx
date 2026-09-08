/**
 * Fishing Journey — the result card shown after a reeling attempt.
 *
 * outcome "caught"  → species, weight, rarity, coin reward, "Continue"
 * outcome "escaped" → the one that got away, "Try Again"
 * outcome "missed"  → reacted too slowly to the bite, "Try Again"
 *
 * The card is tinted by rarity (`fj-result--{rarity}`) but kept subtle.
 */
import { rarityLabel } from "../utils/fishingLogic.js";
import { FishGlyph } from "./LakeScene.jsx";

export default function CatchResult({
  outcome,
  fish,
  weight,
  reward,
  isRecord,
  onContinue,
}) {
  if (outcome === "caught") {
    return (
      <div
        className={`fj-result fj-result--caught fj-result--${fish.rarity}`}
        role="dialog"
        aria-label="Catch result"
      >
        {isRecord && <div className="fj-result__ribbon">Personal best</div>}
        <div className="fj-result__banner">
          {isRecord ? "New personal best!" : "Great catch!"}
        </div>

        <div className="fj-result__portrait">
          <span className="fj-result__glow" />
          <span className="fj-result__fish">
            <FishGlyph />
          </span>
        </div>

        <h3 className="fj-result__name">{fish.name}</h3>
        <span className="fj-result__rarity">{rarityLabel(fish.rarity)}</span>

        <div className="fj-result__grid">
          <div className="fj-result__cell">
            <span className="fj-result__cell-k">Weight</span>
            <span className="fj-result__cell-v">{weight} kg</span>
          </div>
          <div className="fj-result__cell">
            <span className="fj-result__cell-k">Reward</span>
            <span className="fj-result__cell-v fj-result__cell-v--gold">
              +{reward}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="fj-btn fj-btn--primary fj-result__btn"
          onClick={onContinue}
        >
          Keep &amp; Continue
        </button>
      </div>
    );
  }

  const missed = outcome === "missed";
  return (
    <div className="fj-result fj-result--miss" role="dialog" aria-label="Catch result">
      <div className="fj-result__banner fj-result__banner--miss">
        {missed ? "Too late" : "It got away"}
      </div>
      <div className="fj-result__portrait">
        <span className="fj-result__fish fj-result__fish--ghost">
          <FishGlyph />
        </span>
      </div>
      <p className="fj-result__msg">
        {missed
          ? "The fish spat the hook before you reacted."
          : "The line went slack — that one's still out there."}
      </p>
      <button
        type="button"
        className="fj-btn fj-btn--primary fj-result__btn"
        onClick={onContinue}
      >
        Try Again
      </button>
    </div>
  );
}
