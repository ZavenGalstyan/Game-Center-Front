/**
 * In-game HUD. React re-renders it from a snapshot ~10×/s; the crosshair,
 * hit marker, damage vignette and objective marker are driven imperatively
 * through refs every frame (see DeepMine.jsx). Every visible string is a
 * whole English sentence so the Game Center translator can swap it.
 */
import { WEAPONS, WEAPON_ORDER, ENEMIES } from "../engine/sim.js";

function Progress({ p }) {
  if (!p) return null;
  if (p.kind === "enemies") return <div className="dm-obj-prog">{`Enemies left: ${p.n}`}</div>;
  if (p.kind === "wave") return <div className="dm-obj-prog">{p.left > 0 ? `Wave ${p.n} of ${p.of} · Enemies left: ${p.left}` : `Wave ${p.n} of ${p.of}`}</div>;
  if (p.kind === "count") return <div className="dm-obj-prog">{`${p.n} / ${p.of}`}</div>;
  return null;
}

export function Hud({ h, fx, hints, onPause }) {
  if (!h) return null;
  const W = h.w ? WEAPONS[h.w] : null;
  const hpPct = Math.max(0, (h.hp / h.maxHp) * 100);
  const lowAmmo = W && h.mag <= Math.ceil(W.mag / 4);
  const bat = Math.round(h.battery);
  return (
    <div className="dm-hud">
      <div ref={fx.vignette} className="dm-vignette" />
      <div ref={fx.blackout} className="dm-blackout" />
      <div ref={fx.dir} className="dm-hurtdir" />

      <div className="dm-objective">
        <div className="dm-obj-level">
          <span className="dm-badge">{`Level ${h.level}`}</span>
          <span>{h.levelName}</span>
        </div>
        {h.obj && (
          <>
            <div className={`dm-obj-text ${h.objFlash ? "flash" : ""}`}>{h.obj.text}</div>
            <Progress p={h.obj.progress} />
            {hints && h.obj.hint && <div className="dm-obj-hint">{h.obj.hint}</div>}
          </>
        )}
      </div>

      <button className="dm-pausebtn" onClick={onPause} aria-label="Pause" title="Pause">
        <span />
        <span />
      </button>

      {h.boss && (
        <div className={`dm-boss ${h.boss.enraged ? "enraged" : ""}`} role="status">
          <div className="dm-boss-name">
            <span>{h.boss.final ? "The Forgotten King" : ENEMIES.brute.name}</span>
            {h.boss.dazed && <span className="dm-boss-tag">Dazed!</span>}
          </div>
          <div className="dm-boss-bar" aria-label="Boss health">
            <div style={{ width: `${(h.boss.hp / h.boss.max) * 100}%` }} />
          </div>
        </div>
      )}

      <div ref={fx.cross} className={`dm-cross ${h.w || "none"}`}>
        <i />
        <i />
        <i />
        <i />
        <b />
      </div>
      <div ref={fx.hit} className="dm-hitmark">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div ref={fx.marker} className="dm-marker">
        <span className="dm-marker-dia" />
        <span ref={fx.markerDist} className="dm-marker-dist" />
      </div>

      {h.prompt && (
        <div className={`dm-prompt ${h.prompt.ok ? "" : "no"}`}>
          {h.prompt.ok && <kbd>E</kbd>}
          <span>{h.prompt.text}</span>
        </div>
      )}
      {h.status && <div className="dm-status">{h.status}</div>}

      <div className="dm-vitals">
        <div className="dm-hp" aria-label="Health">
          <span className="dm-hp-icon" aria-hidden="true">
            +
          </span>
          <div className="dm-bar hp">
            <div className="lag" style={{ width: `${h.hpLag}%` }} />
            <div className={`fill ${hpPct < 30 ? "low" : ""}`} style={{ width: `${hpPct}%` }} />
          </div>
          <span className="dm-hp-num">{Math.ceil(h.hp)}</span>
        </div>
        <div className="dm-bar st" aria-label="Stamina">
          <div className="fill" style={{ width: `${h.stamina}%` }} />
        </div>
        <div className={`dm-torch ${h.flash ? "on" : "off"} ${bat <= 20 ? "low" : ""}`} aria-label="Flashlight">
          <kbd>F</kbd>
          <span className="dm-torch-state">{h.flash ? "Flashlight on" : "Flashlight off"}</span>
          <span className="dm-battery" aria-label="Battery">
            <i style={{ width: `${bat}%` }} />
          </span>
          <span className="dm-torch-pct">{`${bat}%`}</span>
        </div>
        {(h.keys > 0 || h.carry.length > 0) && (
          <div className="dm-carry">
            {h.keys > 0 && <span className="dm-chip key">{`Keys: ${h.keys}`}</span>}
            {h.carry.map((c) => (
              <span key={c.kind} className={`dm-chip ${c.kind}`}>
                {c.kind === "u" ? `Fuel cans: ${c.n}` : `Gears: ${c.n}`}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="dm-ammo">
        <div className="dm-weapons">
          {WEAPON_ORDER.map((k, i) => (
            <span key={k} className={`dm-wslot ${h.w === k ? "on" : ""} ${h.owned[k] ? "" : "locked"}`}>
              <kbd>{i + 1}</kbd> {h.owned[k] ? WEAPONS[k].name : "Locked"}
            </span>
          ))}
        </div>
        {W ? (
          <>
            <div className="dm-ammo-row">
              <span className={`dm-mag ${lowAmmo ? "low" : ""}`}>{h.mag}</span>
              <span className="dm-res">{`/ ${h.res}`}</span>
            </div>
            <div className={`dm-ammo-name ${h.w}`}>{W.name}</div>
          </>
        ) : (
          <div className="dm-ammo-name">Unarmed</div>
        )}
      </div>
    </div>
  );
}
