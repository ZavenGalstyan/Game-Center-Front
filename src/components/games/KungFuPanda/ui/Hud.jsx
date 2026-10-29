/**
 * In-game HUD: hero health + special cooldown, mission tracker, Tai Lung's
 * health bar, objective compass, interact prompt and Shifu's speech bubble.
 * Fed a plain snapshot ~10×/s by the shell.
 */
export function Hud({ s, touch, onPause }) {
  if (!s) return null;
  const hpPct = Math.max(0, s.hp / s.maxHp) * 100;
  const low = hpPct < 30;
  return (
    <div className="kfp-hud">
      <div className="kfp-hero">
        <div className="kfp-badge" style={{ background: s.color, color: s.accent }}>
          {s.heroName[0]}
        </div>
        <div className="kfp-bars">
          <div className="kfp-name">
            {s.heroName} <span>{s.heroTitle}</span>
          </div>
          <div className={`kfp-hp ${low ? "low" : ""}`}>
            <div className="kfp-hp-lag" style={{ width: `${s.hpLag}%` }} />
            <div className="kfp-hp-fill" style={{ width: `${hpPct}%` }} />
            <span>
              {Math.ceil(s.hp)} / {s.maxHp}
            </span>
          </div>
          <div className={`kfp-sp ${s.specialReady ? "ready" : ""}`}>
            <div className="kfp-sp-fill" style={{ width: `${s.specialPct * 100}%` }} />
            <span>{s.specialReady ? `${s.specialName} — ready (${touch ? "SPECIAL" : "Q"})` : `${s.specialName} ${s.specialCd.toFixed(1)}s`}</span>
          </div>
        </div>
      </div>

      <div className="kfp-tracker">
        <div className="kfp-tracker-title">{s.missionName}</div>
        <ul>
          {s.steps.map((st, i) => (
            <li key={i} className={st.done ? "done" : st.cur ? "cur" : "todo"}>
              <span className="kfp-check">{st.done ? "✓" : st.cur ? "▸" : "·"}</span>
              <span className="kfp-step-text">
                {st.text}
                {st.need > 1 && st.id !== "move" && st.id !== "look" ? ` ${Math.floor(st.count)}/${st.need}` : ""}
                {st.cur && <em>{st.hint}</em>}
              </span>
              {st.cur && (st.id === "move" || st.id === "look") && (
                <span className="kfp-mini">
                  <i style={{ width: `${Math.min(100, (st.count / st.need) * 100)}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="kfp-time">{fmtTime(s.time)}</div>
      </div>

      {s.boss && (
        <div className="kfp-boss">
          <div className="kfp-boss-name">
            TAI LUNG {s.boss.phase === 2 && <span>ENRAGED</span>}
          </div>
          <div className="kfp-boss-bar">
            <div className="kfp-boss-lag" style={{ width: `${s.boss.lag}%` }} />
            <div className="kfp-boss-fill" style={{ width: `${(s.boss.hp / s.boss.maxHp) * 100}%` }} />
          </div>
          {s.boss.warn && <div className="kfp-boss-warn">{s.boss.warn}</div>}
        </div>
      )}

      {s.compass && (
        <div className="kfp-compass" style={{ transform: `translateX(-50%) rotate(${s.compass.a}rad)` }}>
          <div className="kfp-compass-arrow" />
        </div>
      )}
      {s.compass && <div className="kfp-compass-d">{Math.round(s.compass.d)} m</div>}

      {s.prompt && (
        <div className="kfp-prompt">
          <kbd>{touch ? "USE" : "E"}</kbd> {s.prompt}
        </div>
      )}
      {s.talk && (
        <div className="kfp-talk">
          <b>{s.talk.who}</b>
          {s.talk.text}
        </div>
      )}
      {!touch && (
        <button type="button" className="kfp-pausebtn" onClick={onPause} aria-label="Pause">
          II
        </button>
      )}
    </div>
  );
}

export function fmtTime(t) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
