/**
 * In-game HUD: turtle health + special / heavy cooldowns, combo counter,
 * mission tracker, the Shredder's health bar, objective compass, interact
 * prompt and speech bubble. Fed a plain snapshot ~10×/s by the shell.
 */
export function Hud({ s, touch, onPause }) {
  if (!s) return null;
  const hpPct = Math.max(0, s.hp / s.maxHp) * 100;
  const low = hpPct < 30;
  return (
    <div className="tmnt-hud">
      <div className="tmnt-hero" style={{ "--mask": s.mask }}>
        <div className="tmnt-badge">
          <span>{s.heroName[0]}</span>
        </div>
        <div className="tmnt-bars">
          <div className="tmnt-name">
            {s.heroName} <span>{s.heroTitle}</span>
          </div>
          <div className={`tmnt-hp ${low ? "low" : ""}`}>
            <div className="tmnt-hp-lag" style={{ width: `${s.hpLag}%` }} />
            <div className="tmnt-hp-fill" style={{ width: `${hpPct}%` }} />
            <span>
              {Math.ceil(s.hp)} / {s.maxHp}
            </span>
          </div>
          <div className="tmnt-cds">
            <div className={`tmnt-sp ${s.specialReady ? "ready" : ""}`}>
              <div className="tmnt-sp-fill" style={{ width: `${s.specialPct * 100}%` }} />
              <span>{s.specialReady ? `${s.specialName} ${touch ? "" : "(Q)"}` : `${s.specialName} ${s.specialCd.toFixed(1)}s`}</span>
            </div>
            <div className={`tmnt-hv ${s.heavyReady ? "ready" : ""}`} title="Heavy attack">
              <div className="tmnt-sp-fill" style={{ width: `${s.heavyPct * 100}%` }} />
              <span>HEAVY</span>
            </div>
          </div>
        </div>
      </div>
      {s.combo > 1 && (
        <div key={s.comboKey} className={`tmnt-combo c${s.combo}`}>
          {s.combo} HIT{s.combo === 3 ? "S!" : "S"}
        </div>
      )}

      <div className="tmnt-tracker">
        <div className="tmnt-tracker-title">{s.missionName}</div>
        <ul>
          {s.steps.map((st, i) => (
            <li key={i} className={st.done ? "done" : st.cur ? "cur" : "todo"}>
              <span className="tmnt-check">{st.done ? "✓" : st.cur ? "▸" : "·"}</span>
              <span className="tmnt-step-text">
                {st.text}
                {st.need > 1 && st.id !== "move" && st.id !== "look" ? ` ${Math.floor(st.count)}/${st.need}` : ""}
                {st.cur && <em>{st.hint}</em>}
              </span>
              {st.cur && (st.id === "move" || st.id === "look") && (
                <span className="tmnt-mini">
                  <i style={{ width: `${Math.min(100, (st.count / st.need) * 100)}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="tmnt-time">{fmtTime(s.time)}</div>
      </div>

      {s.boss && (
        <div className="tmnt-boss">
          <div className="tmnt-boss-name">
            THE SHREDDER {s.boss.phase === 2 && <span>ENRAGED</span>}
          </div>
          <div className="tmnt-boss-bar">
            <div className="tmnt-boss-lag" style={{ width: `${s.boss.lag}%` }} />
            <div className="tmnt-boss-fill" style={{ width: `${(s.boss.hp / s.boss.maxHp) * 100}%` }} />
          </div>
          {s.boss.warn && <div className="tmnt-boss-warn">{s.boss.warn}</div>}
        </div>
      )}

      {s.compass && (
        <div className="tmnt-compass" style={{ transform: `translateX(-50%) rotate(${s.compass.a}rad)` }}>
          <div className="tmnt-compass-arrow" />
        </div>
      )}
      {s.compass && <div className="tmnt-compass-d">{Math.round(s.compass.d)} m</div>}

      {s.prompt && (
        <div className={`tmnt-prompt ${s.prompt.disabled ? "off" : ""}`}>
          {!s.prompt.disabled && <kbd>{touch ? "USE" : "E"}</kbd>} {s.prompt.text}
        </div>
      )}
      {s.talk && (
        <div className="tmnt-talk">
          <b>{s.talk.who}</b>
          {s.talk.text}
        </div>
      )}
      {!touch && (
        <button type="button" className="tmnt-pausebtn" onClick={onPause} aria-label="Pause">
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
