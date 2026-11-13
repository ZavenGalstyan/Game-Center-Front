/**
 * Battle HUD: monster nameplate + HP/Block/statuses, the intent marker that
 * floats above the monster's head (positioned imperatively by the root each
 * frame), the hunter panel, energy orb, the fanned hand, draw/discard/exhaust
 * piles, End Turn, banners and the floating-number layer.
 */
import { forwardRef, useRef } from "react";
import { BATTLE_BY_ID } from "../engine/battles.js";
import { cardStats, STATUS_INFO, CARDS } from "../engine/cards.js";
import { Card } from "./Card.jsx";
import { Icon } from "./Icons.jsx";

function Bar({ hp, max, block, kind }) {
  const f = Math.max(0, Math.min(1, hp / Math.max(1, max)));
  return (
    <div className={`dos-hp ${kind}`}>
      <i className="fill" style={{ width: `${f * 100}%` }} />
      <i className="lag" style={{ width: `${f * 100}%` }} />
      <span className="txt">{`${hp} / ${max}`}</span>
      {block > 0 && (
        <span className="blk">
          <Icon name="defend" />
          <b>{block}</b>
        </span>
      )}
    </div>
  );
}

function Statuses({ st }) {
  const keys = Object.keys(STATUS_INFO).filter((k) => st[k] > 0);
  if (!keys.length) return null;
  return (
    <div className="dos-sts">
      {keys.map((k) => (
        <span key={k} className={`dos-st st-${k}`} title={`${STATUS_INFO[k].name}: ${STATUS_INFO[k].desc}`}>
          <Icon name={k} />
          <b>{st[k]}</b>
        </span>
      ))}
    </div>
  );
}

export const IntentMarker = forwardRef(function IntentMarker({ info }, ref) {
  if (!info) return <div ref={ref} className="dos-intent hidden" />;
  const main = info.kinds[0] || "buff";
  return (
    <div ref={ref} className={`dos-intent k-${main}`} title={info.name}>
      <div className="dos-intent__icons">
        {info.kinds.map((k) => (
          <Icon key={k} name={k} />
        ))}
      </div>
      {info.kinds.includes("attack") && <b className="dos-intent__num">{info.hits > 1 ? `${info.dmg}×${info.hits}` : `${info.dmg}`}</b>}
      <span className="dos-intent__name">{info.name}</span>
    </div>
  );
});

export function BattleHud({ S, view, intent, busy, art, hovered, setHovered, flying, onPlay, onEnd, onPause, banner, intentRef, numbersRef, playerRef, handRef, endRef, energyRef, tutorial }) {
  const B = BATTLE_BY_ID[S.battleId];
  const v = view;
  const n = S.hand.length;
  const spread = Math.min(1, 7 / Math.max(1, n));
  // Touch has no hover, so a tap would play a card the player never got to
  // read. On touch the first tap enlarges the card, a second tap plays it.
  const ptr = useRef("mouse");
  const isTouch = () => ptr.current === "touch" || ptr.current === "pen";
  return (
    <div
      className={`dos-hud ${busy ? "busy" : ""} ${tutorial != null ? "tut" : ""}`}
      onPointerDown={(e) => {
        // a tap anywhere but a card dismisses a touch preview
        if ((e.pointerType === "touch" || e.pointerType === "pen") && !e.target.closest?.(".dos-slot")) setHovered(null);
      }}
    >
      <div className="dos-top">
        <div className="dos-top__title">
          <span className="dos-kicker">{`Battle ${B.id} · Turn ${S.turn}`}</span>
          <span className="t">{B.title}</span>
        </div>
        <div className="dos-plate">
          <div className="dos-plate__name">
            <span>{S.E.name}</span>
            {S.E.stage > 1 && <span className="ph">{`Phase ${S.E.stage}`}</span>}
          </div>
          <Bar hp={v.ehp} max={v.emax} block={v.eblock} kind="enemy" />
          <Statuses st={v.est} />
        </div>
        <button type="button" className="dos-iconbtn" onClick={onPause} aria-label="Pause">
          <Icon name="pause" />
        </button>
      </div>

      <IntentMarker ref={intentRef} info={S.phase === "player" ? intent : null} />

      <div className="dos-numbers" ref={numbersRef} aria-hidden="true" />

      {banner && (
        <div key={banner.id} className={`dos-banner ${banner.kind || ""}`}>
          <span>{banner.text}</span>
          {banner.sub && <small>{banner.sub}</small>}
        </div>
      )}

      <div className="dos-player" ref={playerRef}>
        <div className="dos-player__crest">
          <Icon name="sword" />
        </div>
        <div className="dos-player__info">
          <span className="nm">Hunter</span>
          <Bar hp={v.php} max={v.pmax} block={v.pblock} kind="player" />
          <Statuses st={v.pst} />
        </div>
      </div>

      <div className="dos-energy" ref={energyRef} aria-label={`Energy ${v.energy} of ${S.P.maxEnergy}`}>
        <span className="cur">{v.energy}</span>
        <span className="max">{`/${S.P.maxEnergy}`}</span>
      </div>

      <div className="dos-piles">
        <span className="dos-pile draw" title="Draw pile">
          <Icon name="deck" />
          <b>{S.draw.length}</b>
        </span>
        <span className="dos-pile disc" title="Discard pile">
          <Icon name="discard" />
          <b>{S.discard.length}</b>
        </span>
        {S.exhaust.length > 0 && (
          <span className="dos-pile exh" title="Exhausted">
            <Icon name="dread" />
            <b>{S.exhaust.length}</b>
          </span>
        )}
      </div>

      <div className="dos-hand" ref={handRef} style={{ "--n": n }}>
        {S.hand.map((h, i) => {
          const c = cardStats(h.r);
          const mid = (n - 1) / 2;
          const off = i - mid;
          const playable = S.phase === "player" && c.cost <= S.P.energy;
          const isFly = flying?.has(h.u);
          return (
            <div
              key={h.u}
              className={`dos-slot ${hovered === h.u ? "hov" : ""} ${isFly ? "fly" : ""}`}
              style={{
                "--off": off * spread,
                "--rot": `${off * 3.2 * spread}deg`,
                "--lift": `${Math.abs(off * spread) ** 1.6 * 0.9}`,
                "--i": i,
                zIndex: hovered === h.u ? 50 : 10 + i,
              }}
              data-u={h.u}
              onPointerDownCapture={(e) => (ptr.current = e.pointerType || "mouse")}
            >
              <Card
                refId={h.r}
                art={art(CARDS[h.r.replace("+", "")].art)}
                playable={playable}
                short={c.cost > S.P.energy}
                onClick={(e) => {
                  if (isTouch() && hovered !== h.u) {
                    setHovered(h.u);
                    return;
                  }
                  onPlay(h.u, e.currentTarget);
                }}
                onEnter={(e) => e?.pointerType !== "touch" && e?.pointerType !== "pen" && setHovered(h.u)}
                onLeave={(e) => e?.pointerType !== "touch" && e?.pointerType !== "pen" && setHovered(null)}
                badge={i < 9 ? <span className="dos-card__key">{i + 1}</span> : null}
              />
              {hovered === h.u && isTouch() && playable && <span className="dos-slot__tap">Tap again to play</span>}
            </div>
          );
        })}
      </div>

      <button type="button" ref={endRef} className={`dos-end ${S.phase === "player" && !busy && S.hand.every((h) => cardStats(h.r).cost > S.P.energy) ? "pulse" : ""}`} onClick={onEnd} disabled={busy || S.phase !== "player"}>
        <span>End Turn</span>
      </button>
    </div>
  );
}
