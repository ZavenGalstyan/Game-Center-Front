/**
 * In-level HUD (refreshed ~10×/s from a snapshot, never per frame):
 * hearts, coins, chests, friend status, level title, timer, boss health bar.
 */
export function fmtTime(t) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Heart({ full }) {
  return (
    <svg viewBox="0 0 24 22" className={`tq-heart ${full ? "full" : "empty"}`} aria-hidden="true">
      <path d="M12 21 L2.6 11.6 A5.6 5.6 0 0 1 12 3.6 A5.6 5.6 0 0 1 21.4 11.6 Z" />
    </svg>
  );
}

export function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="tq-icon" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#ffcc33" stroke="#b8860b" strokeWidth="2" />
      <path d="M12 6v12M9 9h5a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h5" stroke="#b8860b" strokeWidth="1.8" fill="none" />
    </svg>
  );
}

export function ChestIcon({ on = true }) {
  return (
    <svg viewBox="0 0 24 24" className={`tq-icon ${on ? "" : "dim"}`} aria-hidden="true">
      <rect x="3" y="10" width="18" height="10" rx="1.5" fill="#a0612c" stroke="#5a3415" strokeWidth="1.5" />
      <path d="M3 10 Q12 2 21 10 Z" fill="#c07a3a" stroke="#5a3415" strokeWidth="1.5" />
      <rect x="10.5" y="10" width="3" height="4" fill="#ffcc33" />
    </svg>
  );
}

export function PawIcon({ on = true }) {
  return (
    <svg viewBox="0 0 24 24" className={`tq-icon ${on ? "" : "dim"}`} aria-hidden="true">
      <ellipse cx="12" cy="15.5" rx="5" ry="4.2" fill="#6fd06f" />
      <circle cx="6" cy="10" r="2.2" fill="#6fd06f" />
      <circle cx="10" cy="6.5" r="2.2" fill="#6fd06f" />
      <circle cx="14" cy="6.5" r="2.2" fill="#6fd06f" />
      <circle cx="18" cy="10" r="2.2" fill="#6fd06f" />
    </svg>
  );
}

export function Hud({ s, onPause }) {
  if (!s) return null;
  return (
    <div className="tq-hud">
      <div className="tq-hud-left">
        <div className="tq-hearts" aria-label={`${s.hp} of ${s.maxHp} health`}>
          {Array.from({ length: s.maxHp }, (_, i) => (
            <Heart key={i} full={i < s.hp} />
          ))}
        </div>
        <div className="tq-chip" key={`c${s.coinPulse}`}>
          <CoinIcon />
          <b>{s.coins}</b>
          <span>/{s.coinTotal}</span>
        </div>
        {s.chestTotal > 0 && (
          <div className="tq-chip">
            <ChestIcon />
            <b>{s.chests}</b>
            <span>/{s.chestTotal}</span>
          </div>
        )}
        {s.friend && (
          <div className={`tq-chip ${s.friend.freed ? "good" : "warn"}`}>
            <PawIcon on={s.friend.freed} />
            <span>{s.friend.freed ? "Rescued!" : s.friend.name}</span>
          </div>
        )}
      </div>
      <div className="tq-hud-right">
        <div className="tq-level">
          <span>
            {s.world}-{s.index}
          </span>{" "}
          {s.levelName}
        </div>
        <div className="tq-time">{fmtTime(s.time)}</div>
        <button type="button" className="tq-pausebtn" aria-label="Pause" onClick={onPause}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="4" y="3" width="4" height="14" rx="1" />
            <rect x="12" y="3" width="4" height="14" rx="1" />
          </svg>
        </button>
      </div>
      {s.boss && (
        <div className="tq-boss">
          <div className="tq-boss-name">Baron Bristlesnout{s.boss.phase === 2 ? " — ENRAGED" : ""}</div>
          <div className="tq-boss-bar">
            <div className="lag" style={{ width: `${s.boss.lag}%` }} />
            <div className="hp" style={{ width: `${s.boss.pct}%` }} />
          </div>
          {s.boss.tip && <div className={`tq-boss-tip ${s.boss.vulnerable ? "go" : ""}`}>{s.boss.tip}</div>}
        </div>
      )}
    </div>
  );
}
