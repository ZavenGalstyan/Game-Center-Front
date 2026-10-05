/**
 * Island Conquest — in-battle HUD. Deliberately compact: the battlefield is
 * the UI. Top: level, power balance, timer, speed, pause. Bottom: the
 * 25 / 50 / 100 % send control. Overlays: pause and result.
 */
import { FACTION_INFO } from "../engine/constants.js";
import { regionOf } from "../data/regions.js";
import { Icon, Stars, fmtTime } from "./ui.jsx";

const ORDER = ["player", "neutral", "purple", "red"];

export function TopBar({ hud, level, speed, onPause, onSpeed }) {
  const total = hud.total || 1;
  return (
    <div className="ic-top" role="toolbar" aria-label="Battle controls">
      <div className="ic-top__lvl">
        <span className="ic-top__region">{regionOf(level.region).name}</span>
        <strong>
          {level.id}. {level.name}
        </strong>
      </div>
      <div className="ic-power" aria-label="Islands held">
        <div className="ic-power__bar">
          {ORDER.map((o) =>
            hud.own[o] ? (
              <span key={o} className={`ic-power__seg is-${o}`} style={{ flexGrow: hud.own[o] / total }}>
                {hud.own[o]}
              </span>
            ) : null
          )}
        </div>
        <div className="ic-power__troops">
          <span className="is-player">
            <i style={{ background: FACTION_INFO.player.color }} />
            {hud.troops.player} troops
          </span>
          {hud.factions
            .filter((f) => f !== "player")
            .map((f) => (
              <span key={f} className={`is-${f}`}>
                <i style={{ background: FACTION_INFO[f].color }} />
                {hud.troops[f]}
              </span>
            ))}
        </div>
      </div>
      <div className="ic-top__right">
        <span className="ic-timer" aria-label="Battle time">
          <Icon name="clock" size={16} />
          {fmtTime(hud.time)}
        </span>
        <button type="button" className={`ic-iconbtn ic-speed${speed === 2 ? " is-fast" : ""}`} onClick={onSpeed} aria-label={`Game speed ${speed}x, switch`} title="Game speed (S)">
          {speed}×
        </button>
        <button type="button" className="ic-iconbtn" onClick={onPause} aria-label="Pause" title="Pause (P / Esc)">
          <Icon name="pause" size={18} />
        </button>
      </div>
    </div>
  );
}

export function SendBar({ frac, onFrac }) {
  return (
    <div className="ic-send" role="radiogroup" aria-label="Troops to send">
      <span className="ic-send__label">
        <Icon name="boat" size={16} />
        SEND
      </span>
      {[
        [0.25, "25%", "1"],
        [0.5, "50%", "2"],
        [1, "100%", "3"],
      ].map(([v, t, key]) => (
        <button key={v} type="button" role="radio" aria-checked={frac === v} className={frac === v ? "is-on" : ""} onClick={() => onFrac(v)} title={`Send ${t} (key ${key})`}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function Hint({ text }) {
  if (!text) return null;
  return (
    <div className="ic-hint" role="status" key={text}>
      {text}
    </div>
  );
}

export function Banner({ banner }) {
  if (!banner) return null;
  return (
    <div className={`ic-banner is-${banner.kind}`} key={banner.key} role="status">
      {banner.kicker && <small>{banner.kicker}</small>}
      <strong>{banner.text}</strong>
      {banner.sub && <span>{banner.sub}</span>}
    </div>
  );
}

export function PauseOverlay({ onResume, onRestart, onSettings, onQuit }) {
  return (
    <div className="ic-overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="ic-panel ic-panel--narrow">
        <h2 className="ic-h2">PAUSED</h2>
        <div className="ic-col">
          <button type="button" className="ic-btn ic-btn--primary" onClick={onResume} autoFocus>
            <Icon name="play" size={18} />
            RESUME
          </button>
          <button type="button" className="ic-btn" onClick={onRestart}>
            <Icon name="replay" size={18} />
            RESTART LEVEL
          </button>
          <button type="button" className="ic-btn" onClick={onSettings}>
            <Icon name="gear" size={18} />
            SETTINGS
          </button>
          <button type="button" className="ic-btn" onClick={onQuit}>
            <Icon name="map" size={18} />
            LEVELS
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResultOverlay({ end, level, hasNext, onNext, onReplay, onLevels }) {
  const { summary, out } = end;
  const won = summary.result === "won";
  const r = summary.run;
  return (
    <div className="ic-overlay ic-overlay--result" role="dialog" aria-modal="true" aria-label={won ? "Victory" : "Defeat"}>
      <div className={`ic-panel ic-result ${won ? "is-won" : "is-lost"}`}>
        <small className="ic-result__kicker">
          LEVEL {level.id} · {level.name.toUpperCase()}
        </small>
        <h2 className="ic-result__title">{won ? "ISLANDS CONQUERED" : "DEFEAT"}</h2>
        {won && (
          <div className="ic-result__stars">
            <Stars n={summary.stars} size={34} />
            <span className="ic-result__crit">
              {fmtTime(level.stars[1])} for 3★ · {fmtTime(level.stars[0])} for 2★
            </span>
            {out?.improved && !out.firstClear && <span className="ic-result__best">NEW BEST</span>}
          </div>
        )}
        <dl className="ic-result__stats">
          <div>
            <dt>Battle time</dt>
            <dd>{fmtTime(summary.time)}</dd>
          </div>
          <div>
            <dt>Islands captured</dt>
            <dd>{r.islandsCaptured}</dd>
          </div>
          {won ? (
            <>
              <div>
                <dt>Troops sent</dt>
                <dd>{r.troopsSent}</dd>
              </div>
              <div>
                <dt>Troops lost</dt>
                <dd>{r.troopsLost}</dd>
              </div>
              <div>
                <dt>Enemy troops defeated</dt>
                <dd>{r.enemyDefeated}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Enemy islands remaining</dt>
              <dd>{summary.enemyIslandsLeft}</dd>
            </div>
          )}
        </dl>
        <div className="ic-row">
          {won && hasNext && (
            <button type="button" className="ic-btn ic-btn--primary" onClick={onNext} autoFocus>
              NEXT LEVEL
              <Icon name="next" size={18} />
            </button>
          )}
          <button type="button" className={`ic-btn${!won ? " ic-btn--primary" : ""}`} onClick={onReplay} autoFocus={!won}>
            <Icon name="replay" size={18} />
            {won ? "REPLAY" : "RETRY"}
          </button>
          <button type="button" className="ic-btn" onClick={onLevels}>
            <Icon name="map" size={18} />
            LEVELS
          </button>
        </div>
      </div>
    </div>
  );
}
