/**
 * In-game HUD (HTML over the 3D table): stage bar, rival nameplates and bet
 * tags anchored to the 3D seats (positioned every frame by the world, no
 * React re-render), pot, the player's panel (cards, stack, hand strength) and
 * the betting controls.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Portrait, Icon, fmt } from "./bits.jsx";
import { RIVALS, ARCHETYPES } from "../engine/rivals.js";

export function actionText(a, name, human) {
  const amt = a.to ?? a.amount ?? 0;
  if (human) {
    switch (a.type) {
      case "fold": return "You fold";
      case "check": return "You check";
      case "call": return `You call ${fmt(a.amount)}`;
      case "bet": return `You bet ${fmt(amt)}`;
      case "raise": return `You raise to ${fmt(amt)}`;
      case "allin": return `You go all-in for ${fmt(amt)}`;
      default: return "";
    }
  }
  switch (a.type) {
    case "fold": return `${name} folds`;
    case "check": return `${name} checks`;
    case "call": return `${name} calls ${fmt(a.amount)}`;
    case "bet": return `${name} bets ${fmt(amt)}`;
    case "raise": return `${name} raises to ${fmt(amt)}`;
    case "allin": return `${name} goes all-in for ${fmt(amt)}`;
    default: return "";
  }
}
export function shortAction(a) {
  if (!a) return "";
  const amt = a.to ?? a.amount ?? 0;
  switch (a.type) {
    case "fold": return "Folded";
    case "check": return "Check";
    case "call": return `Call ${fmt(a.amount)}`;
    case "bet": return `Bet ${fmt(amt)}`;
    case "raise": return `Raise ${fmt(amt)}`;
    case "allin": return "All-in";
    case "sb": return "Small blind";
    case "bb": return "Big blind";
    default: return "";
  }
}

export function TopBar({ stage, blinds, level, toLevel, left, onPause, handNo }) {
  return (
    <div className="wws-top">
      <div className="wws-top__stage">
        <span className="wws-top__num">{`Stage ${stage.id}`}</span>
        <span className="wws-top__town">{stage.town}</span>
        <span className="wws-top__saloon">{stage.saloon}</span>
      </div>
      <div className="wws-top__info">
        <span className="wws-pill" title="Blinds">
          <span className="wws-pill__k">Blinds</span>
          <b>{`${fmt(blinds.sb)} / ${fmt(blinds.bb)}`}</b>
        </span>
        <span className="wws-pill">
          <span className="wws-pill__k">{`Level ${level + 1}`}</span>
          <b>{toLevel === 1 ? "Rises next hand" : `Rises in ${toLevel} hands`}</b>
        </span>
        <span className={`wws-pill${left <= 5 ? " is-warn" : ""}`}>
          <span className="wws-pill__i">{Icon.sun}</span>
          <b>{left === 1 ? "Sundown: last hand" : `Sundown in ${left} hands`}</b>
        </span>
        {handNo > 0 && <span className="wws-pill wws-pill--dim">{`Hand ${handNo}`}</span>}
      </div>
      <button type="button" className="wws-iconbtn" onClick={onPause} aria-label="Pause">
        {Icon.pause}
      </button>
    </div>
  );
}

/** Nameplates over each rival (positions written by world.bindHud). */
export function SeatPlates({ table, rivals, toAct, plateRefs, betRefs, potRef, pots, thinking, lastAct, winners }) {
  const n = table.players.length;
  return (
    <>
      {table.players.map((p, i) => {
        if (i === 0) return null;
        const rv = RIVALS[rivals[i - 1]];
        const arche = ARCHETYPES[rv.archetype];
        const st = p.out ? "out" : p.folded ? "folded" : p.allIn ? "allin" : "";
        return (
          <div key={i} ref={(el) => (plateRefs.current[i] = el)} className={`wws-plate${toAct === i ? " is-turn" : ""}${st ? ` is-${st}` : ""}${winners?.includes(i) ? " is-win" : ""}`}>
            <div className="wws-plate__in">
              <Portrait rival={rv} size={34} out={p.out} />
              <div className="wws-plate__txt">
                <div className="wws-plate__name">
                  {rv.name}
                  {table.dealer === i && table.phase !== "waiting" && <span className="wws-dbadge" title="Dealer">D</span>}
                </div>
                <div className="wws-plate__arch">{arche.label}</div>
                <div className="wws-plate__stack">
                  {p.out ? <span className="wws-tag wws-tag--out">Out</span> : <><span className="wws-plate__chips">{Icon.chips}</span>{fmt(p.stack)}</>}
                </div>
              </div>
            </div>
            {toAct === i && thinking && <div className="wws-plate__think"><i /><i /><i /></div>}
            {!p.out && (lastAct?.[i] || st) && <div className={`wws-plate__act${st ? ` is-${st}` : ""}`}>{st === "allin" ? "All-in" : st === "folded" ? "Folded" : shortAction(lastAct[i])}</div>}
          </div>
        );
      })}
      {table.players.map((p, i) => (
        <div key={`b${i}`} ref={(el) => (betRefs.current[i] = el)} className="wws-bettag" style={{ opacity: p.bet > 0 && table.phase !== "complete" ? 1 : 0 }}>
          {fmt(p.bet)}
        </div>
      ))}
      <div ref={potRef} className="wws-pot" style={{ opacity: pots.total > 0 ? 1 : 0 }}>
        <span className="wws-pot__k">Pot</span>
        <b>{fmt(pots.total)}</b>
        {pots.side.length > 0 && <span className="wws-pot__side">{pots.side.map((s, k) => (k === 0 ? `Main ${fmt(s)}` : `Side ${fmt(s)}`)).join(" · ")}</span>}
      </div>
      {void n}
    </>
  );
}

export function PlayerPanel({ table, info, assist, isTurn, winner }) {
  const me = table.players[0];
  const inHand = me.inHand && !me.folded && me.hole.length === 2 && table.phase !== "waiting";
  return (
    <div className={`wws-me${isTurn ? " is-turn" : ""}${winner ? " is-win" : ""}`}>
      {assist && (
        <div className="wws-me__cards">
          {inHand ? me.hole.map((c, k) => <Card key={k} card={c} size="l" glow={info?.best?.includes(c)} />) : <><div className="wws-card-slot" /><div className="wws-card-slot" /></>}
        </div>
      )}
      <div className="wws-me__txt">
        <div className="wws-me__name">
          You
          {table.dealer === 0 && table.phase !== "waiting" && <span className="wws-dbadge" title="Dealer">D</span>}
          {me.allIn && <span className="wws-tag">All-in</span>}
          {me.folded && <span className="wws-tag wws-tag--dim">Folded</span>}
        </div>
        <div className="wws-me__stack">
          <span className="wws-plate__chips">{Icon.chips}</span>
          {fmt(me.stack)}
        </div>
        {assist && inHand && info && (
          <div className="wws-me__hand">
            <span className="wws-me__label">{info.label}</span>
            {info.equity != null && (
              <span className="wws-meter" title="Estimated chance to win against the hands still in">
                <span className="wws-meter__bar" style={{ width: `${Math.round(info.equity * 100)}%` }} />
                <span className="wws-meter__txt">{`${Math.round(info.equity * 100)}% to win`}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Betting controls. `la` = legalActions for the human (null = not your turn). */
export function ActionBar({ la, pot, bb, onAct, disabled }) {
  const [amt, setAmt] = useState(0);
  const rangeRef = useRef(null);
  const canRaise = !!la && (la.canBet || la.canRaise);
  const minTo = la?.minTo ?? 0, maxTo = la?.maxTo ?? 0;
  useEffect(() => {
    if (la) setAmt(Math.min(maxTo, Math.max(minTo, la.canBet ? Math.max(minTo, Math.round((pot * 0.5) / 5) * 5) : minTo)));
  }, [la, minTo, maxTo, pot]);
  const presets = useMemo(() => {
    if (!la || !canRaise) return [];
    const base = la.canBet ? 0 : la.currentBet;
    const callAmt = la.toCall;
    const potAfterCall = pot + callAmt;
    const mk = (f) => Math.min(maxTo, Math.max(minTo, Math.round((base + callAmt + potAfterCall * f) / 5) * 5));
    return [
      { k: "Min", v: minTo },
      { k: "½ Pot", v: mk(0.5) },
      { k: "¾ Pot", v: mk(0.75) },
      { k: "Pot", v: mk(1) },
    ];
  }, [la, canRaise, pot, minTo, maxTo]);
  const off = !la || disabled;
  const step = Math.max(1, Math.round(bb / 4));
  const raiseLabel = la?.canBet ? `Bet ${fmt(amt)}` : `Raise to ${fmt(amt)}`;
  const allInAmt = la ? la.stack + la.bet : 0;
  const wheel = (e) => {
    if (!canRaise) return;
    setAmt((a) => Math.min(maxTo, Math.max(minTo, a + (e.deltaY < 0 ? bb : -bb))));
  };
  return (
    <div className={`wws-actions${off ? " is-off" : ""}`} aria-label="Betting controls">
      <div className="wws-actions__sizer" onWheel={wheel}>
        <div className="wws-actions__presets">
          {presets.map((p) => (
            <button key={p.k} type="button" className={`wws-chipbtn${amt === p.v ? " is-on" : ""}`} disabled={off || !canRaise} onClick={() => setAmt(p.v)}>
              {p.k}
            </button>
          ))}
        </div>
        <input
          ref={rangeRef}
          className="wws-range"
          type="range"
          min={minTo}
          max={Math.max(minTo, maxTo)}
          step={step}
          value={amt}
          disabled={off || !canRaise || minTo >= maxTo}
          onChange={(e) => setAmt(Math.min(maxTo, Math.max(minTo, +e.target.value)))}
          aria-label="Bet amount"
        />
      </div>
      <div className="wws-actions__row">
        <button type="button" className="wws-btn wws-btn--fold" disabled={off} onClick={() => onAct({ type: "fold" })} title="F">
          Fold
        </button>
        {la?.canCheck || !la ? (
          <button type="button" className="wws-btn" disabled={off || !la?.canCheck} onClick={() => onAct({ type: "check" })} title="C">
            Check
          </button>
        ) : (
          <button type="button" className="wws-btn" disabled={off || !la.canCall} onClick={() => onAct({ type: "call" })} title="C">
            {la.callIsAllIn ? `Call all-in ${fmt(la.toCall)}` : `Call ${fmt(la.toCall)}`}
          </button>
        )}
        <button
          type="button"
          className="wws-btn wws-btn--raise"
          disabled={off || !canRaise}
          onClick={() => onAct(amt >= maxTo ? { type: "allin" } : { type: la.canBet ? "bet" : "raise", amount: amt })}
          title="R"
        >
          {canRaise ? raiseLabel : la?.canCheck === false && la?.toCall >= la?.stack ? "Raise" : la?.currentBet > 0 ? "Raise" : "Bet"}
        </button>
        <button type="button" className="wws-btn wws-btn--allin" disabled={off || !la?.canAllIn} onClick={() => onAct({ type: "allin" })} title="A">
          {la?.canAllIn ? `All-in ${fmt(allInAmt)}` : "All-in"}
        </button>
      </div>
    </div>
  );
}

export function Feed({ items }) {
  return (
    <div className="wws-feed" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`wws-feed__item${t.tone ? ` is-${t.tone}` : ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function HandBanner({ banner, onNext, auto }) {
  if (!banner) return null;
  return (
    <div className={`wws-banner is-${banner.tone || "neutral"}`}>
      <div className="wws-banner__title">{banner.title}</div>
      {banner.lines.map((l, i) => (
        <div key={i} className="wws-banner__line">
          {l.pot && <span className="wws-banner__pot">{l.pot}</span>}
          <span>{l.text}</span>
        </div>
      ))}
      {onNext && (
        <button type="button" className="wws-btn wws-btn--small" onClick={onNext}>
          {auto ? "Next hand" : "Continue"}
        </button>
      )}
    </div>
  );
}
