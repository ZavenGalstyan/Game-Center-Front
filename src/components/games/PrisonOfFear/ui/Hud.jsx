/**
 * In-game HUD. React re-renders it from a snapshot ~10×/s; the crosshair,
 * hit marker, damage vignette and objective marker are driven imperatively
 * through refs every frame (see PrisonOfFear.jsx).
 */
import { WEAPONS } from "../engine/sim.js";

function Progress({ p }) {
  if (!p) return null;
  if (p.kind === "enemies") return <div className="pf-obj-prog">{`Enemies left: ${p.n}`}</div>;
  if (p.kind === "wave") return <div className="pf-obj-prog">{p.left > 0 ? `Wave ${p.n} of ${p.of} · Enemies left: ${p.left}` : `Wave ${p.n} of ${p.of}`}</div>;
  if (p.kind === "count") return <div className="pf-obj-prog">{`${p.n} / ${p.of}`}</div>;
  return null;
}

export function Hud({ h, fx, hints, onPause }) {
  if (!h) return null;
  const W = WEAPONS[h.w];
  const hpPct = Math.max(0, (h.hp / h.maxHp) * 100);
  const lowAmmo = h.mag <= Math.ceil(W.mag / 4);
  return (
    <div className="pf-hud">
      <div ref={fx.vignette} className="pf-vignette" />
      <div ref={fx.blackout} className="pf-blackout" />
      <div ref={fx.dir} className="pf-hurtdir" />

      <div className="pf-objective">
        <div className="pf-obj-level">
          <span className="pf-badge">{`Level ${h.level}`}</span>
          <span>{h.levelName}</span>
        </div>
        {h.obj && (
          <>
            <div className={`pf-obj-text ${h.objFlash ? "flash" : ""}`}>{h.obj.text}</div>
            <Progress p={h.obj.progress} />
            {hints && h.obj.hint && <div className="pf-obj-hint">{h.obj.hint}</div>}
          </>
        )}
      </div>

      <button className="pf-pausebtn" onClick={onPause} aria-label="Pause">
        <span />
        <span />
      </button>

      {h.boss && (
        <div className={`pf-boss ${h.boss.enraged ? "enraged" : ""}`}>
          <div className="pf-boss-name">Prison Brute</div>
          <div className="pf-boss-bar">
            <div style={{ width: `${(h.boss.hp / h.boss.max) * 100}%` }} />
          </div>
        </div>
      )}

      <div ref={fx.cross} className={`pf-cross ${h.w}`}>
        <i />
        <i />
        <i />
        <i />
        <b />
      </div>
      <div ref={fx.hit} className="pf-hitmark">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div ref={fx.marker} className="pf-marker">
        <span className="pf-marker-dia" />
        <span ref={fx.markerDist} className="pf-marker-dist" />
      </div>

      {h.prompt && (
        <div className={`pf-prompt ${h.prompt.ok ? "" : "no"}`}>
          {h.prompt.ok && <kbd>E</kbd>}
          <span>{h.prompt.text}</span>
        </div>
      )}
      {h.status && <div className="pf-status">{h.status}</div>}

      <div className="pf-vitals">
        <div className="pf-hp">
          <span className="pf-hp-icon" aria-hidden="true">
            +
          </span>
          <div className="pf-bar hp">
            <div className="lag" style={{ width: `${h.hpLag}%` }} />
            <div className={`fill ${hpPct < 30 ? "low" : ""}`} style={{ width: `${hpPct}%` }} />
          </div>
          <span className="pf-hp-num">{Math.ceil(h.hp)}</span>
        </div>
        <div className="pf-bar st">
          <div className="fill" style={{ width: `${h.stamina}%` }} />
        </div>
        {h.blocking && <div className="pf-blocktag">Blocking</div>}
      </div>

      <div className="pf-ammo">
        <div className="pf-weapons">
          <span className={`pf-wslot ${h.w === "pistol" ? "on" : ""}`}>
            <kbd>1</kbd> {WEAPONS.pistol.name}
          </span>
          <span className={`pf-wslot ${h.w === "shotgun" ? "on" : ""} ${h.hasShotgun ? "" : "locked"}`}>
            <kbd>2</kbd> {h.hasShotgun ? WEAPONS.shotgun.name : "Locked"}
          </span>
        </div>
        <div className="pf-ammo-row">
          <span className={`pf-mag ${lowAmmo ? "low" : ""}`}>{h.mag}</span>
          <span className="pf-res">{`/ ${h.res}`}</span>
        </div>
        <div className="pf-ammo-name">{W.name}</div>
      </div>
    </div>
  );
}
