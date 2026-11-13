/**
 * In-game HUD. React re-renders it from a snapshot ~10×/s; the crosshair,
 * hit marker, damage vignette and objective marker are driven imperatively
 * through refs every frame (see CarnivalOfFear.jsx). Every visible string is
 * a whole English sentence so the Game Center translator can swap it.
 */
import { WEAPONS, WEAPON_ORDER, ENEMIES } from "../engine/sim.js";

function Progress({ p }) {
  if (!p) return null;
  if (p.kind === "enemies") return <div className="cf-obj-prog">{`Enemies left: ${p.n}`}</div>;
  if (p.kind === "wave") return <div className="cf-obj-prog">{p.left > 0 ? `Wave ${p.n} of ${p.of} · Enemies left: ${p.left}` : `Wave ${p.n} of ${p.of}`}</div>;
  if (p.kind === "count") return <div className="cf-obj-prog">{`${p.n} / ${p.of}`}</div>;
  return null;
}

export function Hud({ h, fx, hints, onPause }) {
  if (!h) return null;
  const W = h.w ? WEAPONS[h.w] : null;
  const hpPct = Math.max(0, (h.hp / h.maxHp) * 100);
  const lowAmmo = W && h.mag <= Math.ceil(W.mag / 4);
  return (
    <div className="cf-hud">
      <div ref={fx.vignette} className="cf-vignette" />
      <div ref={fx.blackout} className="cf-blackout" />
      <div ref={fx.dir} className="cf-hurtdir" />

      <div className="cf-objective">
        <div className="cf-obj-level">
          <span className="cf-badge">{`Level ${h.level}`}</span>
          <span>{h.levelName}</span>
        </div>
        {h.obj && (
          <>
            <div className={`cf-obj-text ${h.objFlash ? "flash" : ""}`}>{h.obj.text}</div>
            <Progress p={h.obj.progress} />
            {hints && h.obj.hint && <div className="cf-obj-hint">{h.obj.hint}</div>}
          </>
        )}
      </div>

      <button className="cf-pausebtn" onClick={onPause} aria-label="Pause" title="Pause">
        <span />
        <span />
      </button>

      {h.boss && (
        <div className={`cf-boss ${h.boss.enraged ? "enraged" : ""}`} role="status">
          <div className="cf-boss-name">
            <span>{ENEMIES.king.name}</span>
            {h.boss.dazed && <span className="cf-boss-tag">Dazed!</span>}
          </div>
          <div className="cf-boss-bar" aria-label="Boss health">
            <div style={{ width: `${(h.boss.hp / h.boss.max) * 100}%` }} />
          </div>
        </div>
      )}

      <div ref={fx.cross} className={`cf-cross ${h.w || "none"}`}>
        <i />
        <i />
        <i />
        <i />
        <b />
      </div>
      <div ref={fx.hit} className="cf-hitmark">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div ref={fx.marker} className="cf-marker">
        <span className="cf-marker-dia" />
        <span ref={fx.markerDist} className="cf-marker-dist" />
      </div>

      {h.prompt && (
        <div className={`cf-prompt ${h.prompt.ok ? "" : "no"}`}>
          {h.prompt.ok && <kbd>E</kbd>}
          <span>{h.prompt.text}</span>
        </div>
      )}
      {h.status && <div className="cf-status">{h.status}</div>}

      <div className="cf-vitals">
        <div className="cf-hp" aria-label="Health">
          <span className="cf-hp-icon" aria-hidden="true">
            ♥
          </span>
          <div className="cf-bar hp">
            <div className="lag" style={{ width: `${h.hpLag}%` }} />
            <div className={`fill ${hpPct < 30 ? "low" : ""}`} style={{ width: `${hpPct}%` }} />
          </div>
          <span className="cf-hp-num">{Math.ceil(h.hp)}</span>
        </div>
        <div className="cf-bar st" aria-label="Stamina">
          <div className="fill" style={{ width: `${h.stamina}%` }} />
        </div>
      </div>

      <div className="cf-ammo">
        <div className="cf-weapons">
          {WEAPON_ORDER.map((k, i) => (
            <span key={k} className={`cf-wslot ${h.w === k ? "on" : ""} ${h.owned[k] ? "" : "locked"}`}>
              <kbd>{i + 1}</kbd> {h.owned[k] ? WEAPONS[k].name : "Locked"}
            </span>
          ))}
        </div>
        {W ? (
          <>
            <div className="cf-ammo-row">
              <span className={`cf-mag ${lowAmmo ? "low" : ""}`}>{h.mag}</span>
              <span className="cf-res">{`/ ${h.res}`}</span>
            </div>
            <div className={`cf-ammo-name ${h.w}`}>{W.name}</div>
          </>
        ) : (
          <div className="cf-ammo-name">Unarmed</div>
        )}
      </div>
    </div>
  );
}
