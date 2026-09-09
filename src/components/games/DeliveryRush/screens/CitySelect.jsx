/**
 * Delivery Rush — district select.
 *
 * Each district gets a card whose artwork is generated from its own palette and
 * road layout — the same colours the 3D world uses, plus a miniature of its
 * actual street plan drawn to a canvas. It is a game screen, not an admin grid.
 */

import { useEffect, useRef } from "react";
import { ZONES } from "../data/zones.js";
import { getLayout } from "../world/districts.js";
import { zoneProgress, totalStars } from "../systems/progression.js";
import { sfx } from "../utils/sound.js";

/** A tiny street-plan thumbnail drawn from the district's real road graph. */
function ZoneMap({ zone, locked }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const layout = getLayout(zone.id);
    const b = layout.playBounds;
    const w = b.maxX - b.minX;
    const h = b.maxZ - b.minZ;
    const S = 260;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = S * dpr;
    cv.height = S * dpr;
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const scale = (S * 0.92) / Math.max(w, h);
    const px = (x) => (x - b.minX) * scale + (S - w * scale) / 2;
    const pz = (z) => (z - b.minZ) * scale + (S - h * scale) / 2;

    g.clearRect(0, 0, S, S);
    g.globalAlpha = locked ? 0.3 : 0.85;
    g.fillStyle = zone.palette.asphalt;
    for (const wk of layout.walks) {
      g.fillRect(px(wk.x0), pz(wk.z0), (wk.x1 - wk.x0) * scale, (wk.z1 - wk.z0) * scale);
    }
    g.fillStyle = zone.palette.water;
    for (const s of layout.surfaces) {
      if (s.kind !== "water") continue;
      g.fillRect(px(s.x0), pz(s.z0), (s.x1 - s.x0) * scale, (s.z1 - s.z0) * scale);
    }
    g.lineCap = "round";
    for (const r of layout.roads) {
      g.strokeStyle = r.type === "main" ? zone.palette.marking : zone.palette.sidewalk;
      g.globalAlpha = (locked ? 0.28 : 0.9) * (r.type === "alley" ? 0.5 : 1);
      g.lineWidth = Math.max(1, r.w * scale * 0.7);
      g.beginPath();
      g.moveTo(px(r.ax), pz(r.az));
      g.lineTo(px(r.bx), pz(r.bz));
      g.stroke();
    }
    g.globalAlpha = 1;
  }, [zone, locked]);

  return <canvas className="dr-zonecard__map" ref={ref} aria-hidden="true" />;
}

export default function CitySelect({ state, onPick, onBack, sound }) {
  const stars = totalStars(state);

  return (
    <div className="dr-screen dr-screen--cities">
      <header className="dr-subhead">
        <button type="button" className="dr-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Menu
        </button>
        <h2 className="dr-subhead__title">Districts</h2>
        <span className="dr-coins">
          <span className="dr-coins__icon dr-coins__icon--star" aria-hidden="true" />
          {stars}
        </span>
      </header>

      <div className="dr-zonegrid">
        {ZONES.map((z) => {
          const p = zoneProgress(state, z.id);
          const locked = !p.unlocked;
          return (
            <button
              key={z.id}
              type="button"
              className={`dr-zonecard${locked ? " is-locked" : ""}`}
              style={{
                "--dr-z-sky": z.palette.skyMid,
                "--dr-z-top": z.palette.skyTop,
                "--dr-z-accent": z.palette.accent,
                "--dr-z-ground": z.palette.ground,
              }}
              onClick={() => {
                if (locked) {
                  sfx.denied(sound);
                  return;
                }
                sfx.ui(sound);
                onPick(z.id);
              }}
            >
              <span className="dr-zonecard__art">
                <ZoneMap zone={z} locked={locked} />
                <span className="dr-zonecard__glow" />
              </span>

              <span className="dr-zonecard__body">
                <span className="dr-zonecard__no">DISTRICT {z.order}</span>
                <span className="dr-zonecard__name">{z.name}</span>
                <span className="dr-zonecard__sub">{z.subtitle}</span>

                {locked ? (
                  <span className="dr-zonecard__lock">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 11h12v9H6z" />
                      <path d="M9 11V8a3 3 0 0 1 6 0v3" />
                    </svg>
                    {z.starsRequired} stars required
                  </span>
                ) : (
                  <span className="dr-zonecard__stats">
                    <b>{p.completed}/{p.total}</b> missions
                    <em>·</em>
                    <b>{p.stars}/{p.maxStars}</b> stars
                  </span>
                )}

                <span className="dr-zonecard__meta">
                  <i className={`dr-chip dr-chip--${z.weather}`}>{z.weather}</i>
                  <i className="dr-chip">{z.difficulty}</i>
                </span>
              </span>

              {!locked && (
                <span className="dr-zonecard__bar">
                  <i style={{ width: `${(p.stars / p.maxStars) * 100}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
