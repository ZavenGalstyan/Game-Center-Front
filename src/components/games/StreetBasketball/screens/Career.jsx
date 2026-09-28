/**
 * Street Basketball — Career: a journey across five courts (not a grid of
 * 25 cards). The top strip is the road NEIGHBORHOOD → … → STREET LEGENDS;
 * the selected court shows its five challengers as a ladder up to the court
 * boss, and a scouting card for the selected challenger.
 */
import { useEffect, useMemo, useState } from "react";
import { COURTS, courtById } from "../data/courts.js";
import { OPPONENTS, ARCHETYPES, opponentBars, opponentById } from "../data/opponents.js";
import { opponentLook, isOpponentUnlocked } from "../utils/progress.js";
import Portrait from "../hud/Portrait.jsx";

export default function Career({ progress, onPlay, onBack }) {
  const nextOpp = OPPONENTS[Math.min(progress.careerStage, OPPONENTS.length - 1)];
  const [courtId, setCourtId] = useState(nextOpp.court);
  const court = courtById(courtId);
  const list = useMemo(() => OPPONENTS.filter((o) => o.court === courtId), [courtId]);
  const defaultSel = list.find((o) => !progress.defeated.includes(o.id)) || list[list.length - 1];
  const [selId, setSelId] = useState(defaultSel.id);
  useEffect(() => {
    const d = list.find((o) => !progress.defeated.includes(o.id)) || list[list.length - 1];
    setSelId(d.id);
  }, [courtId]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = opponentById(selId);
  const selUnlocked = isOpponentUnlocked(progress, sel.id) && progress.unlockedCourts.includes(sel.court);
  const beaten = progress.defeated.includes(sel.id);

  return (
    <div className="sb-screen sb-career" style={{ "--court-accent": court.accent, "--court-sky": court.sky.mid, "--court-top": court.sky.top }}>
      <header className="sb-head">
        <button type="button" className="sb-back" onClick={onBack}>‹ MENU</button>
        <h1>CAREER</h1>
        <span className="sb-head__meta">{progress.defeated.length}/25 DEFEATED</span>
      </header>

      <div className="sb-road">
        {COURTS.map((c, i) => {
          const open = progress.unlockedCourts.includes(c.id);
          const cleared = OPPONENTS.filter((o) => o.court === c.id).every((o) => progress.defeated.includes(o.id));
          return (
            <div key={c.id} className="sb-road__seg">
              {i > 0 && <span className={`sb-road__line${open ? " is-open" : ""}`} />}
              <button
                type="button"
                className={`sb-road__stop${c.id === courtId ? " is-sel" : ""}${open ? "" : " is-locked"}${cleared ? " is-cleared" : ""}`}
                onClick={() => open && setCourtId(c.id)}
                disabled={!open}
                style={{ "--stop": c.accent }}
              >
                <span className="sb-road__dot">{cleared ? "★" : open ? i + 1 : "🔒"}</span>
                <span className="sb-road__name">{c.short}</span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="sb-career__body">
        <section className="sb-ladder">
          <div className="sb-ladder__court">
            <b>{court.name.toUpperCase()}</b>
            <span>{court.tagline} · {court.time}</span>
          </div>
          <ol className="sb-ladder__list">
            {list.map((o) => {
              const done = progress.defeated.includes(o.id);
              const open = isOpponentUnlocked(progress, o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    className={`sb-rung${o.id === selId ? " is-sel" : ""}${done ? " is-done" : ""}${open ? "" : " is-locked"}${o.boss ? " is-boss" : ""}`}
                    onClick={() => setSelId(o.id)}
                  >
                    <span className="sb-rung__num">{o.index + 1}</span>
                    <Portrait look={{ ...opponentLook(o) }} size={46} className={open ? "" : "is-silhouette"} />
                    <span className="sb-rung__txt">
                      <b>{open ? `${o.first} “${o.nickname}”` : "???"}</b>
                      <small>{open ? ARCHETYPES[o.archetype].label : "Locked"}{o.boss ? " · COURT BOSS" : ""}</small>
                    </span>
                    <span className="sb-rung__state">{done ? "WON" : open ? "NEXT" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="sb-scout">
          <div className="sb-scout__top">
            <Portrait look={opponentLook(sel)} size={132} className={selUnlocked ? "" : "is-silhouette"} />
            <div>
              <div className="sb-scout__tag">{sel.final ? "FINAL CHAMPION" : sel.boss ? "COURT BOSS" : `CHALLENGER ${sel.index + 1}`}</div>
              <h2>{selUnlocked ? sel.display : "LOCKED"}</h2>
              <div className="sb-scout__style">STYLE: <b>{ARCHETYPES[sel.archetype].label.toUpperCase()}</b></div>
              <p>{ARCHETYPES[sel.archetype].blurb}</p>
            </div>
          </div>
          <div className="sb-bars">
            {opponentBars(sel).map(([k, v]) => (
              <div className="sb-bar" key={k}>
                <span>{k.toUpperCase()}</span>
                <i><em style={{ width: `${v * 10}%` }} /></i>
                <b>{v.toFixed(1)}</b>
              </div>
            ))}
          </div>
          <div className="sb-scout__foot">
            <span>FIRST TO {sel.target} · {courtById(sel.court).short}</span>
            <button
              type="button"
              className="sb-btn sb-btn--primary"
              disabled={!selUnlocked}
              onClick={() => onPlay(sel.id)}
            >
              {beaten ? "REMATCH" : "PLAY"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Short VS card before a match (skippable). */
export function VsIntro({ playerLook, playerName, opponent, court, reduced, onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, reduced ? 900 : 2300);
    const key = (e) => {
      if (e.code === "Enter" || e.code === "Space") onDone();
    };
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", key);
    };
  }, [onDone, reduced]);
  return (
    <div className={`sb-vs${reduced ? " is-reduced" : ""}`} style={{ "--court-accent": court.accent, "--court-top": court.sky.top, "--court-sky": court.sky.mid }} onClick={onDone} role="button" tabIndex={0}>
      <div className="sb-vs__side sb-vs__side--p">
        <Portrait look={playerLook} size={170} />
        <b>{playerName}</b>
      </div>
      <div className="sb-vs__mid">
        <span className="sb-vs__vs">VS</span>
        <span className="sb-vs__court">{court.name.toUpperCase()}</span>
        <span className="sb-vs__target">FIRST TO {opponent.target}</span>
      </div>
      <div className="sb-vs__side sb-vs__side--o">
        <Portrait look={opponentLook(opponent)} size={170} />
        <b>{opponent.display}</b>
        <small>{ARCHETYPES[opponent.archetype].label.toUpperCase()}</small>
      </div>
      <span className="sb-vs__skip">click to skip</span>
    </div>
  );
}
