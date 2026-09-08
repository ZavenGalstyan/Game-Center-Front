/**
 * Fishing Journey — Collection. Every species, grouped by location, styled like
 * an angler's field journal. Uncaught species show a shadowed silhouette;
 * caught ones show name, rarity, times caught and biggest weight. Backed by
 * `progress.caughtFish` in localStorage — read only.
 */
import { LOCATIONS } from "../data/locations.js";
import { fishForLocation } from "../data/fish.js";
import { rarityLabel } from "../utils/fishingLogic.js";
import ScreenHeader from "../components/ScreenHeader.jsx";
import { FishGlyph } from "../components/LakeScene.jsx";
import { IconBook, IconLock } from "../components/Icons.jsx";

export default function CollectionScreen({ progress, onBack }) {
  const totalSpecies = LOCATIONS.reduce(
    (n, l) => n + fishForLocation(l.id).length,
    0,
  );
  const discovered = Object.keys(progress.caughtFish).length;

  return (
    <div className="fj-screen fj-collection">
      <ScreenHeader
        title="Collection"
        subtitle="Your angler's journal."
        coins={progress.coins}
        onBack={onBack}
        icon={<IconBook />}
      />

      <div className="fj-screen__body">
        <div className="fj-coll-summary">
          <div className="fj-coll-summary__stat">
            <span className="fj-coll-summary__num">
              {discovered}
              <em>/ {totalSpecies}</em>
            </span>
            <span className="fj-coll-summary__lbl">Species discovered</span>
          </div>
          <div className="fj-coll-summary__bar">
            <div
              className="fj-coll-summary__bar-fill"
              style={{ width: `${(discovered / totalSpecies) * 100}%` }}
            />
          </div>
          <div className="fj-coll-summary__stat">
            <span className="fj-coll-summary__num">{progress.totalFishCaught}</span>
            <span className="fj-coll-summary__lbl">Fish caught</span>
          </div>
        </div>

        {LOCATIONS.map((loc) => {
          const species = fishForLocation(loc.id);
          const unlocked = progress.unlockedLocations.includes(loc.id);
          const found = species.filter((f) => progress.caughtFish[f.id]).length;

          return (
            <section
              key={loc.id}
              className={`fj-coll-group ${unlocked ? "" : "fj-coll-group--locked"}`}
            >
              <div className="fj-coll-group__head">
                <h3 className="fj-coll-group__title">{loc.name}</h3>
                <span className="fj-coll-group__count">
                  {unlocked ? (
                    `${found} / ${species.length} species`
                  ) : (
                    <>
                      <IconLock className="fj-coll-group__lock" /> locked
                    </>
                  )}
                </span>
              </div>

              <div className="fj-coll-grid">
                {species.map((fish) => {
                  const entry = progress.caughtFish[fish.id];
                  if (!entry) {
                    return (
                      <div
                        key={fish.id}
                        className="fj-collcard fj-collcard--unknown"
                      >
                        <div className="fj-collcard__portrait">
                          <span className="fj-collcard__silhouette">
                            <FishGlyph />
                          </span>
                        </div>
                        <div className="fj-collcard__name">???</div>
                        <div className="fj-collcard__sub">Not discovered</div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={fish.id}
                      className={`fj-collcard fj-collcard--${fish.rarity}`}
                    >
                      <div className="fj-collcard__portrait">
                        <span className="fj-collcard__fish">
                          <FishGlyph />
                        </span>
                      </div>
                      <div className="fj-collcard__name">{fish.name}</div>
                      <div className="fj-collcard__rarity">
                        {rarityLabel(fish.rarity)}
                      </div>
                      <div className="fj-collcard__stats">
                        <span>
                          <em>{entry.count}</em> caught
                        </span>
                        <span>
                          <em>{entry.best}</em> kg best
                        </span>
                      </div>
                    </div>
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
