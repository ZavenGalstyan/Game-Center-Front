/**
 * Cake Designer — main menu. A premium bakery scene: decorated cake on a
 * stand with a slow idle turn, title, primary actions and the run totals.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import BakeryBackdrop from "../components/BakeryBackdrop.jsx";
import CakePreview from "../components/CakePreview.jsx";
import { CoinPill } from "../components/bits.jsx";
import { cakeFromPreview } from "../editor/cakeState.js";
import { COLLECTIONS } from "../data/collections.js";

export default function CakeMenu({ state, settings, onPlay, onFree, onCollection, onStats, onSettings }) {
  const furthest = useMemo(() => {
    const reached = COLLECTIONS.filter((c) => state.unlockedLevel >= c.range[0]);
    return reached[reached.length - 1] || COLLECTIONS[0];
  }, [state.unlockedLevel]);

  const cake = useMemo(() => cakeFromPreview(furthest.preview), [furthest]);
  const rot = useIdleTurn(settings.animations);

  const ordersDone = Object.values(state.levels).filter((l) => l.completed).length;

  return (
    <div className="cd-menu" style={{ "--cd-accent": furthest.theme.accent, "--cd-accent2": furthest.theme.accent2 }}>
      <BakeryBackdrop theme={furthest.theme} quality={settings.graphics} />

      <div className="cd-menu__inner">
        <div className="cd-menu__left">
          <h1 className="cd-menu__title"><span>Cake</span><span>Designer</span></h1>
          <p className="cd-menu__subtitle">Bake · Decorate · Create</p>

          <div className="cd-menu__buttons">
            <button className="cd-btn cd-btn--primary cd-btn--lg" onClick={onPlay}>Play Orders</button>
            <button className="cd-btn cd-btn--lg" onClick={onFree}>Free Design</button>
            <button className="cd-btn cd-btn--lg" onClick={onCollection}>My Collection</button>
            <div className="cd-menu__row">
              <button className="cd-btn" onClick={onStats}>Statistics</button>
              <button className="cd-btn" onClick={onSettings}>Settings</button>
            </div>
          </div>

          <div className="cd-menu__totals">
            <span><b>{state.statistics.stars}</b> stars</span>
            <span className="cd-menu__totals-sep" />
            <CoinPill amount={state.coins} />
            <span className="cd-menu__totals-sep" />
            <span><b>{ordersDone}</b>/50 orders</span>
          </div>
        </div>

        <div className="cd-menu__cake">
          <CakePreview cake={{ ...cake, rotation: rot }} quality={settings.graphics}
            animate={settings.animations} />
        </div>
      </div>
    </div>
  );
}

function useIdleTurn(on) {
  const [rot, setRot] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!on) { setRot(0); return; }
    let start;
    const loop = (t) => {
      if (!start) start = t;
      setRot(Math.sin((t - start) / 2600) * 0.5);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [on]);
  return rot;
}
