/**
 * In-mission HUD. Re-rendered ~10×/s from a snapshot; the crosshair, hit
 * marker, damage vignette and hold-to-use ring are updated imperatively by
 * the game loop through the refs passed in `fx`.
 */
import { memo } from "react";
import { WEAPONS, WEAPON_ORDER } from "../engine/data.js";

const WEAPON_ICON = {
  revolver: "M4 14h22l2-3h10v4h-8l-3 2h-6l-2 7h-6l1-6H4z",
  shotgun: "M2 12h40v3H22l-3 2-9 7H4l6-7H2z",
  rifle: "M1 12h44v2H24l-2 2h-4l-2 3-9 5H2l7-6H1z",
  dual: "M2 10h14l1-2h6v3h-5l-2 1h-4l-1 5H7l1-4H2zM24 18h14l1-2h6v3h-5l-2 1h-4l-1 5h-4l1-4h-6z",
};

export function WeaponIcon({ id, className }) {
  return (
    <svg className={className} viewBox="0 0 46 28" aria-hidden="true">
      <path d={WEAPON_ICON[id]} fill="currentColor" />
    </svg>
  );
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const Hud = memo(function Hud({ h, fx, hints, onPause }) {
  if (!h) return null;
  const w = WEAPONS[h.w];
  const hpPct = Math.max(0, (h.hp / h.maxHp) * 100);
  const lagPct = Math.max(0, (h.hpLag / h.maxHp) * 100);
  const stPct = (h.st / h.maxSt) * 100;
  return (
    <div className={`ol-hud ${h.duel ? "is-duel" : ""} ${h.deadEyeOn ? "is-deadeye" : ""}`}>
      <div className="ol-vignette" ref={fx.vignette} />
      <div className="ol-deadeye-tint" />

      {/* objective */}
      {!h.duel && (
        <div className="ol-obj">
          <div className="ol-obj-mission">{h.missionLabel}</div>
          <div className="ol-obj-step">
            <span className="ol-obj-bullet" aria-hidden="true">
              ★
            </span>
            <span className="ol-obj-text">{h.step}</span>
            {h.prog && h.prog.need != null && (
              <span className="ol-obj-count">
                {h.prog.n}/{h.prog.need}
              </span>
            )}
            {h.prog && h.prog.time != null && <span className="ol-obj-count">{fmtTime(h.prog.t)}</span>}
          </div>
          {hints && h.hint && <div className="ol-obj-hint">{h.hint}</div>}
        </div>
      )}

      {/* money / level */}
      <div className="ol-purse">
        <div className="ol-purse-money">${h.money}</div>
        <div className="ol-purse-level">
          <span className="ol-purse-lv">{`Level ${h.level}`}</span>
          <span className="ol-xpbar">
            <i style={{ width: `${h.xpPct}%` }} />
          </span>
        </div>
        <button type="button" className="ol-pausebtn" onClick={onPause} aria-label="Pause">
          ❚❚
        </button>
      </div>

      {/* compass */}
      {!h.duel && h.compass && (
        <div className="ol-compass" aria-hidden="true">
          <div className="ol-compass-strip">
            {h.compass.ticks.map((t) => (
              <i key={t.k} className={`ol-tick ${t.major ? "major" : ""}`} style={{ left: `${t.x}%` }} />
            ))}
            {h.compass.mark != null && (
              <span className="ol-compass-mark" style={{ left: `${h.compass.mark}%` }}>
                ◆
              </span>
            )}
          </div>
          {h.compass.dist != null && <div className="ol-compass-dist">{`${h.compass.dist} m`}</div>}
        </div>
      )}

      {/* boss / defend */}
      {h.boss && (
        <div className="ol-boss">
          <div className="ol-boss-name">{h.boss.name}</div>
          <div className="ol-boss-bar">
            <i style={{ width: `${(h.boss.hp / h.boss.max) * 100}%` }} />
          </div>
        </div>
      )}
      {h.defend && (
        <div className="ol-boss ol-defend">
          <div className="ol-boss-name">{h.defend.label}</div>
          <div className="ol-boss-bar">
            <i style={{ width: `${(h.defend.hp / h.defend.max) * 100}%` }} />
          </div>
        </div>
      )}

      {/* crosshair */}
      <div className={`ol-cross ${h.aiming ? "aiming" : ""} ${h.fists ? "fists" : ""}`} ref={fx.cross} aria-hidden="true">
        <i className="c-t" />
        <i className="c-b" />
        <i className="c-l" />
        <i className="c-r" />
        <b className="c-dot" />
        <span className="c-block">✕</span>
      </div>
      <div className="ol-hitmark" ref={fx.hit} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>

      {/* interaction */}
      {h.prompt && !h.duel && (
        <div className={`ol-prompt ${h.prompt.kind}`}>
          <span className="ol-key">E</span>
          <span className="ol-prompt-text">{h.prompt.text}</span>
          {h.prompt.hold && (
            <span className="ol-hold">
              <i ref={fx.hold} />
            </span>
          )}
        </div>
      )}
      {h.fists && !h.duel && <div className="ol-fists">Guns holstered — fight with your fists</div>}

      {/* subtitles */}
      {h.say && (
        <div className="ol-say" key={h.say.key}>
          <b>{h.say.who}</b>
          <span>{h.say.text}</span>
        </div>
      )}

      {/* vitals */}
      {!h.duel && (
        <div className="ol-vitals">
          <div className="ol-hp">
            <span className="ol-vlabel">Health</span>
            <div className="ol-bar hp">
              <i className="lag" style={{ width: `${lagPct}%` }} />
              <i className="fill" style={{ width: `${hpPct}%` }} />
              <em>{Math.ceil(h.hp)}</em>
            </div>
          </div>
          <div className="ol-st">
            <span className="ol-vlabel">Stamina</span>
            <div className={`ol-bar st ${h.exhausted ? "out" : ""}`}>
              <i className="fill" style={{ width: `${stPct}%` }} />
            </div>
          </div>
          {h.deadEye != null && (
            <div className={`ol-de ${h.deadEyeOn ? "on" : ""}`}>
              <span className="ol-key small">Z</span>
              <span className="ol-vlabel">Dead Eye</span>
              <div className="ol-bar de">
                <i className="fill" style={{ width: `${h.deadEye * 100}%` }} />
              </div>
            </div>
          )}
          {h.crouch && <div className="ol-state">Crouched</div>}
          {h.block && <div className="ol-state">Blocking</div>}
        </div>
      )}

      {/* weapon */}
      {!h.fists && (
        <div className="ol-weapon">
          <div className="ol-weapon-main">
            <WeaponIcon id={h.w} className="ol-weapon-icon" />
            <div className="ol-weapon-name">{w.name}</div>
          </div>
          <div className={`ol-ammo ${h.mag === 0 ? "empty" : ""}`}>
            <b>{h.mag}</b>
            <span>/{h.res}</span>
          </div>
          {h.reloading && <div className="ol-reloading">Reloading…</div>}
          {!h.reloading && h.mag === 0 && h.res === 0 && <div className="ol-reloading warn">Out of ammo</div>}
          <div className="ol-slots">
            {WEAPON_ORDER.map((id, i) => (
              <span key={id} className={`ol-slot ${h.owned.includes(id) ? "" : "locked"} ${h.w === id ? "on" : ""}`}>
                <i>{i + 1}</i>
                <WeaponIcon id={id} />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* duel */}
      {h.duel && (
        <div className={`ol-duel ${h.duel.phase}`}>
          {h.duel.phase === "intro" && (
            <>
              <div className="ol-duel-kicker">Duel</div>
              <div className="ol-duel-name">{h.duel.name}</div>
              <div className="ol-duel-tip">Keep your hand still. Draw only when the bell rings.</div>
            </>
          )}
          {h.duel.phase === "ready" && (
            <>
              <div className="ol-duel-steady">Steady…</div>
              <div className="ol-duel-tip">Wait for the signal. Shooting early loses the duel.</div>
            </>
          )}
          {h.duel.phase === "draw" && <div className="ol-duel-draw">DRAW!</div>}
          {h.duel.phase === "resolve" && h.duel.result === "win" && (
            <>
              <div className="ol-duel-win">You won the duel!</div>
              {h.duel.time != null && <div className="ol-duel-tip">{`Your draw: ${h.duel.time.toFixed(2)} s`}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
});
