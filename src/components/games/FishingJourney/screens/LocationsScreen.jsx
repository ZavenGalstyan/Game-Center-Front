/**
 * Fishing Journey — Locations. Unlock with coins, then travel there (the
 * fishing screen reads `progress.currentLocation`). Unlock state persists via
 * the parent's localStorage save.
 */
import { useState } from "react";
import { LOCATIONS } from "../data/locations.js";
import { fishForLocation, RARITIES } from "../data/fish.js";
import ScreenHeader from "../components/ScreenHeader.jsx";
import { IconLock, IconMap } from "../components/Icons.jsx";

/** A tiny layered postcard of the location, built from CSS-positioned spans. */
function LocationArt({ scene }) {
  return (
    <div className={`fj-loccard__art fj-loccard__art--${scene}`}>
      <span className="fj-loccard__sky" />
      <span className="fj-loccard__sun" />
      <span className="fj-loccard__ridge fj-loccard__ridge--far" />
      <span className="fj-loccard__ridge fj-loccard__ridge--near" />
      <span className="fj-loccard__trees" />
      <span className="fj-loccard__water">
        <span className="fj-loccard__glimmer" />
      </span>
      {scene === "marsh" && <span className="fj-loccard__mist" />}
      {scene === "ocean" && <span className="fj-loccard__swell" />}
    </div>
  );
}

export default function LocationsScreen({
  progress,
  onBack,
  onUnlockLocation,
  onTravel,
}) {
  const [notice, setNotice] = useState(null);

  const tryUnlock = (loc) => {
    if (progress.coins < loc.unlockCost) {
      setNotice({
        id: loc.id,
        kind: "error",
        text: `Need ${loc.unlockCost - progress.coins} more coins.`,
      });
      return;
    }
    onUnlockLocation(loc.id);
    setNotice({ id: loc.id, kind: "ok", text: "Unlocked!" });
  };

  return (
    <div className="fj-screen fj-locations">
      <ScreenHeader
        title="Locations"
        subtitle="New water, new fish, a tougher fight."
        coins={progress.coins}
        onBack={onBack}
        icon={<IconMap />}
      />

      <div className="fj-screen__body">
        <div className="fj-locgrid">
          {LOCATIONS.map((loc) => {
            const unlocked = progress.unlockedLocations.includes(loc.id);
            const current = progress.currentLocation === loc.id;
            const species = fishForLocation(loc.id);
            const n = notice && notice.id === loc.id ? notice : null;

            return (
              <article
                key={loc.id}
                className={`fj-loccard fj-loccard--${loc.scene} ${
                  current ? "fj-loccard--current" : ""
                } ${unlocked ? "" : "fj-loccard--locked"}`}
              >
                <div className="fj-loccard__frame">
                  <LocationArt scene={loc.scene} />
                  {current && <span className="fj-loccard__flag">Fishing here</span>}
                  {!unlocked && (
                    <div className="fj-loccard__veil">
                      <IconLock className="fj-loccard__lock-icon" />
                      <span className="fj-loccard__lock-cost">
                        {loc.unlockCost.toLocaleString()} coins
                      </span>
                    </div>
                  )}
                </div>

                <div className="fj-loccard__body">
                  <h3 className="fj-loccard__name">{loc.name}</h3>
                  <p className="fj-loccard__tag">{loc.tagline}</p>

                  <div className="fj-loccard__meta">
                    <span className="fj-loccard__count">
                      {species.length} species
                    </span>
                    <span className="fj-loccard__dots">
                      {["common", "uncommon", "rare", "epic"].map((r) => (
                        <i
                          key={r}
                          style={{ background: RARITIES[r].color }}
                          title={RARITIES[r].label}
                        />
                      ))}
                    </span>
                  </div>

                  <div className="fj-loccard__actions">
                    {!unlocked && (
                      <button
                        type="button"
                        className={`fj-btn fj-btn--primary fj-btn--sm ${
                          progress.coins >= loc.unlockCost ? "" : "is-disabled"
                        }`}
                        onClick={() => tryUnlock(loc)}
                      >
                        Unlock · {loc.unlockCost.toLocaleString()}
                      </button>
                    )}
                    {unlocked && !current && (
                      <button
                        type="button"
                        className="fj-btn fj-btn--sm"
                        onClick={() => onTravel(loc.id)}
                      >
                        Travel here
                      </button>
                    )}
                    {current && (
                      <span className="fj-loccard__here">Current spot</span>
                    )}
                  </div>

                  {n && (
                    <p
                      className={`fj-note fj-note--${n.kind}`}
                      role="status"
                    >
                      {n.text}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
