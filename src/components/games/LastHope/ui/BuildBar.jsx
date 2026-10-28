/**
 * Last Hope — build mode bar: pick a piece, see its cost and the live
 * placement verdict, rotate, or switch to upgrade / demolish modes that
 * target the structure under the cursor (or in front of you on touch).
 */
import { Icon, pieceIcon } from "./icons.jsx";
import { PIECES, BUILD_ORDER } from "../data/structures.js";
import { ITEMS } from "../data/items.js";
import { count } from "../engine/inventory.js";

function Cost({ cost, G }) {
  return (
    <div className="lh-bcost">
      {Object.entries(cost).map(([id, n]) => {
        const have = count(G.inv, id);
        return (
          <span key={id} className={have >= n ? "ok" : "no"} title={ITEMS[id].name}>
            <Icon id={id} size={18} />
            {have}/{n}
          </span>
        );
      })}
    </div>
  );
}

export default function BuildBar({ G, build, setBuild, preview, target, onPlace, onRotate, onUpgrade, onDemolish, onClose, touch, version }) {
  void version;
  const mode = build.mode || "place";
  const piece = PIECES[build.piece];
  const t = target ? PIECES[target.kind] : null;
  const next = t ? t.tiers[target.tier + 1] : null;
  return (
    <div className="lh-build" data-ui onPointerDown={(e) => e.stopPropagation()}>
      <div className="lh-build__top">
        <div className="lh-build__modes">
          {[
            ["place", "Build"],
            ["upgrade", "Upgrade"],
            ["demolish", "Demolish"],
          ].map(([k, n]) => (
            <button key={k} className={mode === k ? "is-on" : ""} onClick={() => setBuild({ ...build, mode: k })}>
              {n}
            </button>
          ))}
        </div>
        <div className="lh-build__status">
          {G.loc !== "camp" ? (
            <span className="no">You can only build at your Survivor's Camp.</span>
          ) : mode === "place" ? (
            <>
              <b>{piece.tiers[0].name}</b>
              <Cost cost={piece.tiers[0].cost} G={G} />
              <span className={preview?.ok ? "ok" : "no"}>{preview ? (preview.ok ? "Ready to place" : preview.reason) : touch ? "Move to aim the piece" : "Point at the ground"}</span>
            </>
          ) : target ? (
            mode === "upgrade" ? (
              next ? (
                <>
                  <b>
                    {t.tiers[target.tier].name} → {next.name}
                  </b>
                  <Cost cost={next.cost} G={G} />
                  {next.level && G.P.level < next.level ? <span className="no">Requires level {next.level}</span> : null}
                </>
              ) : (
                <span className="no">{t.tiers[target.tier].name} is fully upgraded</span>
              )
            ) : (
              <>
                <b>Demolish {t.tiers[target.tier].name}</b>
                <span>Refunds half the materials</span>
              </>
            )
          ) : (
            <span>{touch ? "Stand next to a structure" : "Point at one of your structures"}</span>
          )}
        </div>
        <div className="lh-build__act">
          {mode === "place" && (
            <button onClick={onRotate} title="Rotate (R / right-click)">
              ⟳ Rotate
            </button>
          )}
          {touch && mode === "place" && (
            <button className="lh-btn-primary" disabled={!preview?.ok} onClick={onPlace}>
              Place
            </button>
          )}
          {mode === "upgrade" && target && next && (
            <button className="lh-btn-primary" onClick={onUpgrade}>
              Upgrade
            </button>
          )}
          {mode === "demolish" && target && (
            <button className="lh-btn-danger" onClick={onDemolish}>
              Demolish
            </button>
          )}
          <button onClick={onClose} title="Exit build mode (B / Esc)">
            Done
          </button>
        </div>
      </div>
      {mode === "place" && (
        <div className="lh-build__pieces" data-scroll>
          {BUILD_ORDER.map((k) => {
            const P = PIECES[k];
            const T0 = P.tiers[0];
            const locked = T0.level && G.P.level < T0.level;
            const afford = Object.entries(T0.cost).every(([id, n]) => count(G.inv, id) >= n);
            return (
              <button key={k} className={`lh-piece${build.piece === k ? " is-on" : ""}${afford ? "" : " is-poor"}${locked ? " is-locked" : ""}`} onClick={() => setBuild({ ...build, piece: k })} title={P.desc}>
                <Icon id={pieceIcon(k)} size={40} />
                <b>{P.name}</b>
                {locked ? <em>Lv {T0.level}</em> : <Cost cost={T0.cost} G={G} />}
              </button>
            );
          })}
        </div>
      )}
      {!touch && <div className="lh-build__hint">Left-click to {mode === "place" ? "place" : mode} · R / right-click to rotate · B or Esc to exit</div>}
    </div>
  );
}
