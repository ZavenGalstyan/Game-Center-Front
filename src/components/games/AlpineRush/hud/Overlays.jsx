/**
 * Alpine Rush — race overlays: pause menu, results, and the medal art shared
 * with the menus.
 */
import { useState } from "react";
import { fmtTime, ordinal } from "./useSample.js";
import { MODE_NAMES } from "../engine/race.js";
import { SKI_BY_ID } from "../data/skis.js";
import { WORLD_BY_ID } from "../data/worlds.js";

const MEDAL_COL = {
  gold: ["#ffe27a", "#f4b81c", "#9a6a00"],
  silver: ["#f4f6fa", "#b9c2cf", "#5f6878"],
  bronze: ["#f2c093", "#c9803f", "#6e3f17"],
};

export function Medal({ kind, size = 40, dim = false }) {
  if (!kind) {
    return (
      <svg className="ar-medal ar-medal--none" width={size} height={size} viewBox="0 0 40 40" aria-label="No medal">
        <circle cx="20" cy="22" r="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" opacity="0.45" />
      </svg>
    );
  }
  const [hi, mid, lo] = MEDAL_COL[kind];
  const id = `arm-${kind}`;
  return (
    <svg className={`ar-medal${dim ? " is-dim" : ""}`} width={size} height={size} viewBox="0 0 40 40" aria-label={`${kind} medal`}>
      <defs>
        <radialGradient id={id} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.6" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </radialGradient>
      </defs>
      <path d="M12 2h6l3 10h-6z" fill="#1f6fff" />
      <path d="M28 2h-6l-3 10h6z" fill="#e8343a" />
      <circle cx="20" cy="24" r="12" fill={`url(#${id})`} stroke={lo} strokeWidth="1.2" />
      <circle cx="20" cy="24" r="8.2" fill="none" stroke={hi} strokeWidth="1" opacity="0.8" />
      <path d="M13.5 28.5l4-7 2.6 3.6 2-2.7 4.4 6.1z" fill={lo} opacity="0.75" />
      <path d="M17.5 21.5l.9 1.2.8-.9z" fill="#fff" opacity="0.9" />
    </svg>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div className="ar-seg">
      {options.map(([v, label]) => (
        <button type="button" key={String(v)} className={v === value ? "is-on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function PauseMenu({ def, free, onResume, onRestart, onQuit, onControls, settings, onChangeSettings, muted }) {
  const [tab, setTab] = useState("main");
  return (
    <div className="ar-overlay">
      <div className="ar-card ar-card--pause">
        <div className="ar-card__eyebrow">PAUSED</div>
        <h2 className="ar-card__title">{free ? `Free Ski · ${def.name}` : def.name}</h2>
        {tab === "main" ? (
          <div className="ar-col">
            <button type="button" className="ar-btn ar-btn--primary ar-btn--lg" onClick={onResume} autoFocus>
              RESUME
            </button>
            <button type="button" className="ar-btn" onClick={onRestart}>
              {free ? "RESTART RUN" : "RESTART RACE"}
            </button>
            <button type="button" className="ar-btn" onClick={() => setTab("settings")}>
              SETTINGS
            </button>
            <button type="button" className="ar-btn" onClick={onControls}>
              CONTROLS
            </button>
            <button type="button" className="ar-btn ar-btn--ghost" onClick={onQuit}>
              MAIN MENU
            </button>
          </div>
        ) : (
          <div className="ar-pause-settings">
            <label className="ar-mini-set">
              <span>Music</span>
              <input type="range" min="0" max="1" step="0.05" value={settings.music} onChange={(e) => onChangeSettings({ music: Number(e.target.value) })} />
            </label>
            <label className="ar-mini-set">
              <span>Sound FX</span>
              <input type="range" min="0" max="1" step="0.05" value={settings.sfx} onChange={(e) => onChangeSettings({ sfx: Number(e.target.value) })} />
            </label>
            <div className="ar-mini-set">
              <span>Camera</span>
              <Seg value={settings.camDist} options={[["near", "Near"], ["normal", "Normal"], ["far", "Far"]]} onChange={(v) => onChangeSettings({ camDist: v })} />
            </div>
            <label className="ar-mini-set">
              <span>Camera follow</span>
              <input type="range" min="0" max="1" step="0.05" value={settings.camSens} onChange={(e) => onChangeSettings({ camSens: Number(e.target.value) })} />
            </label>
            <div className="ar-mini-set">
              <span>Control hints</span>
              <Seg value={settings.hints} options={[[true, "On"], [false, "Off"]]} onChange={(v) => onChangeSettings({ hints: v })} />
            </div>
            <div className="ar-mini-set">
              <span>Reduced effects</span>
              <Seg value={settings.reducedFx} options={[[false, "Off"], [true, "On"]]} onChange={(v) => onChangeSettings({ reducedFx: v })} />
            </div>
            {muted && <div className="ar-note">Sound is muted from the Game Center controls.</div>}
            <button type="button" className="ar-btn ar-btn--primary" onClick={() => setTab("main")}>
              BACK
            </button>
          </div>
        )}
        <div className="ar-hint">Esc / P to resume</div>
      </div>
    </div>
  );
}

export function Results({ def, results, outcome, skiId, hasNext, nextLocked, onNext, onRetry, onWorlds, onMenu, best }) {
  const { time, penalty, adjusted, missed, gates, dsq, place, order, splits, free } = results;
  const world = WORLD_BY_ID.get(def.world);
  const medal = free ? null : dsq ? null : results.medal;
  const headline = free ? "RUN COMPLETE" : dsq ? "DISQUALIFIED" : medal ? `${medal.toUpperCase()} MEDAL!` : "RACE COMPLETE";
  const ski = SKI_BY_ID.get(skiId);
  const m = def.medals;
  return (
    <div className="ar-overlay ar-overlay--results">
      <div className={`ar-card ar-card--results${medal ? " is-" + medal : ""}${dsq ? " is-dsq" : ""}`}>
        <div className="ar-results__head">
          <div className={`ar-results__medal${medal ? " is-" + medal : ""}`}>
            <Medal kind={medal} size={84} />
          </div>
          <div className="ar-results__titles">
            <div className="ar-card__eyebrow" style={{ color: world?.accent }}>
              {world?.name} · Level {def.id} · {free ? "Free Ski" : MODE_NAMES[results.mode]}
            </div>
            <h2 className="ar-card__title">{headline}</h2>
            <div className="ar-results__sub">
              {def.name}
              {order && !dsq && (
                <>
                  {" "}
                  — finished <b>{ordinal(place)}</b>
                </>
              )}
              {dsq && <> — {missed} of {gates} gates missed (limit {Math.floor(gates / 3)})</>}
            </div>
          </div>
        </div>
        <div className="ar-results__body">
          <div className="ar-results__times">
            <div className="ar-kv">
              <span>{free ? "Run time" : "Race time"}</span>
              <b>{fmtTime(time)}</b>
            </div>
            {!free && (
              <>
                <div className="ar-kv ar-kv--sub">
                  <span>Gates</span>
                  <b>
                    {gates - missed} / {gates}
                  </b>
                </div>
                <div className="ar-kv ar-kv--sub">
                  <span>Penalties</span>
                  <b className={penalty ? "is-bad" : ""}>{penalty ? `+${penalty.toFixed(0)} s (${missed} missed)` : "none"}</b>
                </div>
                <div className="ar-kv ar-kv--big">
                  <span>Final time</span>
                  <b>{dsq ? "DSQ" : fmtTime(adjusted)}</b>
                  {outcome?.newBestTime && <i className="ar-tag ar-tag--green">Best</i>}
                </div>
                {best && !outcome?.newBestTime && (
                  <div className="ar-kv ar-kv--sub">
                    <span>Best time</span>
                    <b>{fmtTime(best.time)}</b>
                  </div>
                )}
              </>
            )}
            <div className="ar-kv ar-kv--sub">
              <span>Top speed</span>
              <b>{Math.round(results.topSpeed * 3.6)} km/h</b>
            </div>
            <div className="ar-kv ar-kv--sub">
              <span>Jumps · falls</span>
              <b>
                {results.jumps} · {results.falls}
              </b>
            </div>
            <div className="ar-kv ar-kv--sub">
              <span>Skis</span>
              <b>{ski?.name}</b>
            </div>
            {outcome && !outcome.improved && outcome.prevMedal && (
              <div className="ar-kv ar-kv--sub">
                <span>Best medal kept</span>
                <b className="ar-cap">{outcome.prevMedal}</b>
              </div>
            )}
          </div>
          {order ? (
            <ol className="ar-order">
              {order.map((r, i) => (
                <li key={r.name} className={r.isPlayer ? "is-player" : ""}>
                  <span className="ar-order__pos">{i + 1}</span>
                  <span className="ar-order__chip" style={{ background: r.isPlayer ? "#ffd21f" : r.colors.jacket }} />
                  <span className="ar-order__name">{r.isPlayer ? "You" : r.name}</span>
                  <span className="ar-order__time">
                    {r.projected ? "~" : ""}
                    {fmtTime(r.time)}
                    {r.missed > 0 && <em> +{r.missed}</em>}
                  </span>
                </li>
              ))}
            </ol>
          ) : !free && m ? (
            <div className="ar-thresholds">
              {["gold", "silver", "bronze"].map((k, i) => (
                <div key={k} className={`ar-threshold${medal === k ? " is-hit" : ""}`}>
                  <Medal kind={k} size={30} />
                  <b>{fmtTime(m[i])}</b>
                </div>
              ))}
              {splits?.length > 0 && (
                <div className="ar-splits">
                  {splits
                    .filter((_, i) => i % Math.max(1, Math.ceil(splits.length / 6)) === 0)
                    .map((t, i) => (
                      <span key={i}>{fmtTime(t)}</span>
                    ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
        {(outcome?.newUnlocks?.length > 0 || outcome?.nextUnlocked) && (
          <div className="ar-unlocks">
            {outcome.nextUnlocked && (
              <div className="ar-unlock">
                <span className="ar-unlock__icon">⛷</span> New race unlocked: <b>Level {def.id + 1}</b>
              </div>
            )}
            {outcome.newUnlocks.map((u) => {
              const [kind, id] = u.split(":");
              const name = kind === "ski" ? `${SKI_BY_ID.get(id)?.name} skis` : `${WORLD_BY_ID.get(Number(id))?.name}`;
              return (
                <div key={u} className="ar-unlock">
                  <span className="ar-unlock__icon">{kind === "ski" ? "🎿" : "🏔"}</span> Unlocked: <b>{name}</b>
                </div>
              );
            })}
          </div>
        )}
        {!free && !medal && hasNext && nextLocked && <div className="ar-note ar-center">{dsq ? "Pass more gates — a disqualified run can't unlock the next race." : "Earn a medal to unlock the next race."}</div>}
        <div className="ar-row">
          {hasNext && !free && (
            <button type="button" className="ar-btn ar-btn--primary ar-btn--lg" onClick={onNext} disabled={nextLocked} title={nextLocked ? "Earn a medal to unlock" : ""}>
              NEXT RACE ▸
            </button>
          )}
          <button type="button" className={`ar-btn${hasNext && !nextLocked && !free ? "" : " ar-btn--primary ar-btn--lg"}`} onClick={onRetry} autoFocus={nextLocked || free}>
            {free ? "SKI AGAIN" : "RETRY"}
          </button>
          <button type="button" className="ar-btn" onClick={onWorlds}>
            WORLD SELECT
          </button>
          <button type="button" className="ar-btn ar-btn--ghost" onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
