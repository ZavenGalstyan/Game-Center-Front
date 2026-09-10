/**
 * Cake Designer — "My Collection": every unlockable grouped, with locked items
 * shown as silhouettes and their unlock rule. Coin-shop items can be bought here.
 */

import { useMemo } from "react";
import { CoinPill, LockIcon } from "../components/bits.jsx";
import Sprite from "../components/CakeSprites.jsx";
import {
  SHAPES, FROSTINGS, COLORS, DRIPS, TOPPINGS, DECORATIONS, FINAL_TOUCHES, COLOR_BY_ID,
} from "../data/items.js";
import { isUnlocked, lockLabel, collectionCounts } from "../utils/progression.js";

const GROUPS = [
  { key: "shape", title: "Cake Shapes", items: SHAPES.map((x) => ({ ...x, group: "shape" })) },
  { key: "frosting", title: "Frostings", items: FROSTINGS.map((x) => ({ ...x, group: "frosting" })) },
  { key: "color", title: "Colours", items: COLORS.map((x) => ({ ...x, group: "color" })) },
  { key: "drip", title: "Drips", items: DRIPS.filter((d) => d.id !== "none").map((x) => ({ ...x, group: "drip" })) },
  { key: "topping", title: "Toppings", items: TOPPINGS.map((x) => ({ ...x, group: "topping" })) },
  { key: "decoration", title: "Decorations", items: DECORATIONS.map((x) => ({ ...x, group: "decoration" })) },
  { key: "final", title: "Final Touches", items: FINAL_TOUCHES.map((x) => ({ ...x, group: "final" })) },
];

function Thumb({ group, id }) {
  if (group === "color") {
    return <span className="cd-inv-swatch" style={{ background: COLOR_BY_ID[id]?.hex }} />;
  }
  if (group === "shape") {
    const d = {
      round: "M16 17m-13 0a13 9 0 1 0 26 0a13 9 0 1 0 -26 0", square: "M16 5 L29 17 L16 29 L3 17 Z",
      heart: "M16 27 C -4 13 6 2 16 12 C 26 2 36 13 16 27 Z", flower: "M16 6a5 5 0 0 1 10 0 5 5 0 0 1 0 10 5 5 0 0 1-10 0 5 5 0 0 1 0-10z",
      star: "M16 3 L20 13 L31 13 L22 20 L25 30 L16 24 L7 30 L10 20 L1 13 L12 13 Z",
      hexagon: "M16 4 L27 10 L27 24 L16 30 L5 24 L5 10 Z", tall: "M8 4 h16 v24 h-16 z",
    }[id];
    return <svg viewBox="0 0 32 34" width="30" height="30" className="cd-inv-glyph"><path d={d} /></svg>;
  }
  if (group === "frosting" || group === "drip" || group === "final") {
    return <span className="cd-inv-dot" data-g={group} />;
  }
  return <svg viewBox="-16 -16 32 32" width="30" height="30"><Sprite id={id} animate={false} number={id === "candle-number" ? 5 : undefined} /></svg>;
}

export default function Collection({ state, onBack, onBuy }) {
  const counts = useMemo(() => collectionCounts(state), [state]);

  return (
    <div className="cd-inv">
      <div className="cd-inv__top">
        <button className="cd-btn cd-btn--ghost" onClick={onBack}>Menu</button>
        <h2>My Collection</h2>
        <CoinPill amount={state.coins} />
      </div>

      <div className="cd-inv__scroll">
        {GROUPS.map((g) => (
          <section key={g.key} className="cd-inv__group">
            <header>
              <h3>{g.title}</h3>
              <span>{counts[g.key]?.owned ?? 0} / {counts[g.key]?.total ?? g.items.length}</span>
            </header>
            <div className="cd-inv__grid">
              {g.items.map((it) => {
                const rule = it.unlock || (g.key === "color" ? colorRule(it.id) : { type: "start" });
                const owned = isUnlocked(rule, state);
                const buyable = !owned && rule.type === "coins";
                return (
                  <div key={it.id} className={`cd-inv-item${owned ? "" : " is-locked"}`}
                    title={owned ? it.name : lockLabel(rule)}>
                    <span className="cd-inv-item__art"><Thumb group={g.key} id={it.id} /></span>
                    <span className="cd-inv-item__name">{it.name}</span>
                    {!owned && (
                      <span className="cd-inv-item__lock">
                        <LockIcon size={12} /> {lockLabel(rule)}
                      </span>
                    )}
                    {buyable && (
                      <button className="cd-mini-btn"
                        disabled={state.coins < rule.cost}
                        onClick={() => onBuy(it.group + ":" + it.id, rule.cost)}>
                        Buy {rule.cost}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function colorRule(id) {
  const start = ["white", "cream", "chocolate", "pink", "yellow", "sky", "mint"];
  const lvl11 = ["rose", "red", "peach", "green", "blue"];
  const wedding = ["champagne", "sage", "lavender"];
  const luxury = ["black", "gold", "purple"];
  if (start.includes(id)) return { type: "start" };
  if (lvl11.includes(id)) return { type: "level", level: 11 };
  if (wedding.includes(id)) return { type: "collection", collection: "wedding" };
  if (luxury.includes(id)) return { type: "collection", collection: "luxury" };
  return { type: "start" };
}
