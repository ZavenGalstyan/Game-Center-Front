/**
 * In-game HUD: health, fruit, crates, score, level + timer, boss bar.
 * Fed a plain snapshot ~10×/s by the shell (never reads the sim directly).
 */
export const fmtTime = (t) => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function FruitIcon({ size = "1.4em" }) {
  return (
    <svg className="jd-ico" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <ellipse cx="12" cy="14" rx="7.5" ry="8.5" fill="#ffc21a" stroke="#b86e00" strokeWidth="1.5" />
      <ellipse cx="9.5" cy="11" rx="2" ry="3" fill="#fff2a0" opacity="0.8" />
      <path d="M12 6 C 13 2, 17 2, 19 4 C 16 5, 14 6, 12 6 Z" fill="#4cc23a" stroke="#2a7a1e" strokeWidth="1" />
    </svg>
  );
}
export function HeartIcon({ on = true }) {
  return (
    <svg className={`jd-heart ${on ? "on" : "off"}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21 C 4 15, 1 11, 3 6.5 C 5 2.5, 10 3, 12 7 C 14 3, 19 2.5, 21 6.5 C 23 11, 20 15, 12 21 Z" />
    </svg>
  );
}
export function CrateIcon() {
  return (
    <svg className="jd-ico" viewBox="0 0 24 24" width="1.3em" height="1.3em" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="#c98a3f" stroke="#7a4a1c" strokeWidth="2.5" />
      <path d="M4 4 L20 20" stroke="#7a4a1c" strokeWidth="2.5" />
    </svg>
  );
}
export function Stars({ n, max = 3, big = false }) {
  return (
    <span className={`jd-stars ${big ? "big" : ""}`} aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className={i < n ? "on" : "off"} style={{ animationDelay: `${0.25 + i * 0.25}s` }}>
          <path d="M12 2 L14.9 8.6 L22 9.3 L16.6 14 L18.2 21 L12 17.3 L5.8 21 L7.4 14 L2 9.3 L9.1 8.6 Z" />
        </svg>
      ))}
    </span>
  );
}

export function Hud({ s, touch, onPause }) {
  if (!s) return null;
  return (
    <div className="jd-hud">
      <div className="jd-hud-left">
        <div className="jd-hearts" aria-label={`${s.hp} health`}>
          {Array.from({ length: s.maxHp }, (_, i) => (
            <HeartIcon key={i} on={i < s.hp} />
          ))}
        </div>
        <div className="jd-chips">
          <span className={`jd-chip fruit ${s.fruitPulse ? "pulse" : ""}`} key={`f${s.fruitPulse}`}>
            <FruitIcon /> <b>{s.fruits}</b>
          </span>
          <span className="jd-chip">
            <CrateIcon /> <b>{s.crates}</b>
            <small>/{s.crateTotal}</small>
          </span>
        </div>
      </div>
      <div className="jd-hud-right">
        <div className="jd-score">{s.score.toLocaleString()}</div>
        <div className="jd-level">
          <span>
            {s.levelId}. {s.levelName}
          </span>
          <span className="jd-time">{fmtTime(s.time)}</span>
        </div>
        {!touch && (
          <button type="button" className="jd-pausebtn" onClick={onPause} aria-label="Pause">
            II
          </button>
        )}
      </div>
      {s.boss && (
        <div className={`jd-bossbar ${s.boss.vulnerable ? "vul" : ""}`}>
          <div className="jd-bossname">
            Mossjaw, the Jungle Guardian {s.boss.phase === 2 && <em>ENRAGED</em>}
          </div>
          <div className="jd-bossmeter">
            <i style={{ width: `${s.boss.lag}%` }} className="lag" />
            <i style={{ width: `${s.boss.pct}%` }} />
            {Array.from({ length: s.boss.maxHp - 1 }, (_, i) => (
              <b key={i} style={{ left: `${((i + 1) / s.boss.maxHp) * 100}%` }} />
            ))}
          </div>
          {s.boss.tip && <div className="jd-bosstip">{s.boss.tip}</div>}
        </div>
      )}
    </div>
  );
}
