/**
 * Human betting controls. Only legal actions are rendered enabled; the
 * slider's range is exactly [minTo, maxTo] from legalActions(). Each click
 * goes through `onAct`, which the parent locks per table seq so a double
 * click can never submit twice.
 */
import { useEffect, useState } from "react";
import { fmt } from "./pieces.jsx";

const clampTo = (v, a, b) => Math.max(a, Math.min(b, v));

export default function ActionBar({ la, onAct, disabled, pot, bb }) {
  const [amount, setAmount] = useState(la ? la.minTo : 0);
  const key = la ? `${la.minTo}-${la.maxTo}-${la.currentBet}` : "";
  useEffect(() => { if (la) setAmount(la.minTo); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!la) return null;
  const canSize = la.canBet || la.canRaise;
  const verb = la.canBet ? "Bet" : "Raise";
  const v = clampTo(Math.round(amount), la.minTo, la.maxTo);
  const isAll = v >= la.maxTo;
  // pot-sized raise-to = call + (pot after call) × fraction
  const potTo = (f) => clampTo(Math.round(la.bet + la.toCall + (pot + la.toCall) * f), la.minTo, la.maxTo);
  const presets = [
    ["Min", la.minTo],
    ["½ Pot", potTo(0.5)],
    ["¾ Pot", potTo(0.75)],
    ["Pot", potTo(1)],
    ["Max", la.maxTo],
  ];
  const step = Math.max(1, Math.round(bb / 2));
  const nudge = (d) => setAmount((x) => clampTo(Math.round(x) + d * step, la.minTo, la.maxTo));

  return (
    <div className={`thp-actions${disabled ? " is-locked" : ""}`} role="group" aria-label="Your action">
      {canSize && (
        <div className="thp-sizer">
          <div className="thp-sizer__presets">
            {presets.map(([label, val]) => (
              <button key={label} type="button" className={v === val ? "is-on" : ""} disabled={disabled} onClick={() => setAmount(val)}>{label}</button>
            ))}
          </div>
          <div className="thp-sizer__row">
            <button type="button" className="thp-nudge" disabled={disabled || v <= la.minTo} onClick={() => nudge(-1)} aria-label="Decrease amount">−</button>
            <input
              type="range"
              min={la.minTo}
              max={la.maxTo}
              step={1}
              value={v}
              disabled={disabled || la.minTo === la.maxTo}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label={`${verb} amount`}
              style={{ "--p": la.maxTo > la.minTo ? `${((v - la.minTo) / (la.maxTo - la.minTo)) * 100}%` : "100%" }}
            />
            <button type="button" className="thp-nudge" disabled={disabled || v >= la.maxTo} onClick={() => nudge(1)} aria-label="Increase amount">+</button>
          </div>
          <div className="thp-sizer__info">
            <span>Min <b>{fmt(la.minTo)}</b></span>
            <span className="thp-sizer__sel">{verb} to <b>{fmt(v)}</b></span>
            <span>Max <b>{fmt(la.maxTo)}</b></span>
          </div>
        </div>
      )}
      <div className="thp-btns">
        <button type="button" className="thp-btn-act thp-btn-act--fold" disabled={disabled} onClick={() => onAct({ type: "fold" })}>
          Fold
        </button>
        {la.canCheck ? (
          <button type="button" className="thp-btn-act thp-btn-act--check" disabled={disabled} onClick={() => onAct({ type: "check" })}>Check</button>
        ) : (
          <button type="button" className="thp-btn-act thp-btn-act--call" disabled={disabled || !la.canCall} onClick={() => onAct({ type: "call" })}>
            {la.callIsAllIn ? "Call all-in" : "Call"} <small>{fmt(la.toCall)}</small>
          </button>
        )}
        {canSize && !isAll && (
          <button type="button" className="thp-btn-act thp-btn-act--raise" disabled={disabled} onClick={() => onAct({ type: la.canBet ? "bet" : "raise", amount: v })}>
            {verb} <small>{fmt(v)}</small>
          </button>
        )}
        {la.canAllIn && (
          <button type="button" className="thp-btn-act thp-btn-act--allin" disabled={disabled} onClick={() => onAct({ type: "allin" })}>
            All-in <small>{fmt(la.stack)}</small>
          </button>
        )}
      </div>
      <div className="thp-actions__meta">
        <span>To call <b>{fmt(la.toCall)}</b></span>
        <span>Pot <b>{fmt(pot)}</b></span>
        <span>Stack <b>{fmt(la.stack)}</b></span>
      </div>
    </div>
  );
}
