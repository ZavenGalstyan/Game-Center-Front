/**
 * Fishing Journey — Upgrades. Rods only in this version.
 *
 * Buy with coins (never allowed without enough — shows a clear message),
 * then Equip. Ownership + the equipped rod persist through the parent's
 * localStorage save. Purely visual here: the tier label / accent is derived
 * from the rod's position in RODS, it changes nothing in the data.
 */
import { useState } from "react";
import { RODS, getRod } from "../data/rods.js";
import ScreenHeader from "../components/ScreenHeader.jsx";
import StatBar from "../components/StatBar.jsx";
import { IconRod } from "../components/Icons.jsx";

const TIERS = ["Starter", "Angler", "Pro", "Master"];

/** Rod illustration — a graphite blank with a wound grip + reel, tinted by tier. */
function RodArt({ tier }) {
  return (
    <div className={`fj-rodcard__art fj-rodcard__art--t${tier}`}>
      <svg viewBox="0 0 120 64" aria-hidden="true">
        <defs>
          <linearGradient id={`fjBlank${tier}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#6b4a2e" />
            <stop offset="0.4" stopColor="#3a3f47" />
            <stop offset="1" stopColor="#171a20" />
          </linearGradient>
        </defs>
        <path
          className="fj-rodcard__blank"
          d="M12 52 Q 60 30 112 10"
          style={{ stroke: `url(#fjBlank${tier})` }}
        />
        <g className="fj-rodcard__wraps">
          <path d="M14 51l3-1M22 47l3-1M30 44l3-1" />
        </g>
        <circle className="fj-rodcard__guide" cx="60" cy="30.5" r="2.4" />
        <circle className="fj-rodcard__guide" cx="88" cy="19" r="2" />
        <circle className="fj-rodcard__reel" cx="14" cy="52" r="7" />
        <circle className="fj-rodcard__reel-hub" cx="14" cy="52" r="2.4" />
        <circle className="fj-rodcard__tip" cx="112" cy="10" r="2.2" />
      </svg>
    </div>
  );
}

export default function UpgradesScreen({ progress, onBack, onBuyRod, onEquipRod }) {
  const [notice, setNotice] = useState(null); // { rodId, text, kind }
  const equipped = getRod(progress.equippedRod);

  const tryBuy = (rod) => {
    if (progress.coins < rod.price) {
      setNotice({
        rodId: rod.id,
        kind: "error",
        text: `Need ${rod.price - progress.coins} more coins.`,
      });
      return;
    }
    onBuyRod(rod.id);
    setNotice({ rodId: rod.id, kind: "ok", text: "Purchased!" });
  };

  return (
    <div className="fj-screen fj-upgrades">
      <ScreenHeader
        title="Upgrades"
        subtitle="Better gear. Bigger catches."
        coins={progress.coins}
        onBack={onBack}
        icon={<IconRod />}
      />

      <div className="fj-screen__body">
        <div className="fj-rodgrid">
          {RODS.map((rod, i) => {
            const owned = progress.ownedRods.includes(rod.id);
            const isEquipped = progress.equippedRod === rod.id;
            const canAfford = progress.coins >= rod.price;
            const n = notice && notice.rodId === rod.id ? notice : null;
            const lockedStat = owned || isEquipped;

            return (
              <article
                key={rod.id}
                className={`fj-rodcard fj-rodcard--t${i} ${
                  isEquipped ? "fj-rodcard--equipped" : ""
                } ${!owned && !canAfford ? "fj-rodcard--unaffordable" : ""}`}
              >
                <div className="fj-rodcard__top">
                  <RodArt tier={i} />
                  <span className="fj-rodcard__tier">Tier {i + 1} · {TIERS[i]}</span>
                </div>

                <div className="fj-rodcard__head">
                  <h3 className="fj-rodcard__name">{rod.name}</h3>
                  {isEquipped ? (
                    <span className="fj-tag fj-tag--on">Equipped</span>
                  ) : owned ? (
                    <span className="fj-tag">Owned</span>
                  ) : (
                    <span className="fj-tag fj-tag--price">
                      {rod.price.toLocaleString()}
                    </span>
                  )}
                </div>

                <p className="fj-rodcard__blurb">{rod.blurb}</p>

                <div className="fj-rodcard__stats">
                  <StatBar
                    label="Power"
                    value={rod.power}
                    delta={lockedStat ? 0 : rod.power - equipped.power}
                  />
                  <StatBar
                    label="Control"
                    value={rod.control}
                    delta={lockedStat ? 0 : rod.control - equipped.control}
                  />
                  <StatBar
                    label="Cast Distance"
                    value={rod.castDistance}
                    delta={lockedStat ? 0 : rod.castDistance - equipped.castDistance}
                  />
                </div>

                <div className="fj-rodcard__actions">
                  {!owned && (
                    <button
                      type="button"
                      className={`fj-btn fj-btn--primary fj-btn--sm ${
                        canAfford ? "" : "is-disabled"
                      }`}
                      onClick={() => tryBuy(rod)}
                    >
                      Buy · {rod.price.toLocaleString()}
                    </button>
                  )}
                  {owned && !isEquipped && (
                    <button
                      type="button"
                      className="fj-btn fj-btn--sm"
                      onClick={() => onEquipRod(rod.id)}
                    >
                      Equip
                    </button>
                  )}
                  {isEquipped && <span className="fj-rodcard__inuse">In use</span>}
                </div>

                {n && (
                  <p className={`fj-note fj-note--${n.kind}`} role="status">
                    {n.text}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
