/**
 * Crowd Rush — gameplay HUD (plain DOM over the canvas). Subscribes to the tiny
 * hud store so it repaints on its own cadence, never per WebGL frame. Compact:
 * a level tag + progress bar up top, the live crowd count centred low, a VS
 * panel during battles, and transient banners ("×2!", "ENEMY DEFEATED").
 */

import { useSyncExternalStore, useEffect, useState } from "react";

export default function CrowdHud({ store, level }) {
  const s = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (!s.banner) return;
    setBanner(s.banner);
    const t = setTimeout(() => setBanner(null), 1100);
    return () => clearTimeout(t);
  }, [s.banner]);

  return (
    <div className="cr-hud" aria-hidden="true">
      <div className="cr-hud__top">
        <div className="cr-hud__level">
          <span className="cr-hud__world">{level.worldName}</span>
          <span className="cr-hud__lvl">Level {String(level.id).padStart(2, "0")}</span>
        </div>
        <div className="cr-hud__bar">
          <div className="cr-hud__bar-fill" style={{ width: `${Math.round(s.progress * 100)}%` }} />
          <div className="cr-hud__bar-dot" style={{ left: `${Math.round(s.progress * 100)}%` }} />
          <span className="cr-hud__flag cr-hud__flag--start">▸</span>
          <span className="cr-hud__flag cr-hud__flag--end">⚑</span>
        </div>
      </div>

      {s.enemy && (
        <div className="cr-hud__vs">
          <span className="cr-hud__vs-me">{s.count}</span>
          <span className="cr-hud__vs-x">VS</span>
          <span className="cr-hud__vs-foe">{s.enemy.count}</span>
        </div>
      )}

      <div className={`cr-hud__count ${s.enemy ? "is-low" : ""}`}>
        <span className="cr-hud__count-num">{s.count}</span>
        <span className="cr-hud__count-label">CROWD</span>
      </div>

      {banner && (
        <div className="cr-hud__banner" key={banner.key}>
          <span className="cr-hud__banner-text">{banner.text}</span>
          {banner.sub && <span className="cr-hud__banner-sub">{banner.sub}</span>}
        </div>
      )}
    </div>
  );
}
