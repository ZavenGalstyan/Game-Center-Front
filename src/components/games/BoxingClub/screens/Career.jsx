/**
 * Boxing Club — career. Five venues across the top; the selected venue's
 * six bouts on a fight ladder; the chosen bout as a big fight poster
 * (YOU vs HIM, style, record, POWER / SPEED / DEFENSE / STAMINA from the
 * opponent's real config). Locked bouts stay locked until the one before
 * is won.
 */
import { useState } from "react";
import FighterCanvas from "../components/FighterCanvas.jsx";
import { Icon } from "../components/icons.jsx";
import { OPPONENTS, TIERS, ratings } from "../data/opponents.js";
import { careerIndex } from "../utils/progress.js";

function Bars({ o }) {
  const r = ratings(o);
  return (
    <div className="bc-bars">
      {[["POWER", r.power], ["SPEED", r.speed], ["DEFENSE", r.defense], ["STAMINA", r.stamina]].map(([k, v]) => (
        <div key={k} className="bc-bars__row">
          <span>{k}</span>
          <i><b style={{ width: `${Math.round(v * 100)}%` }} /></i>
        </div>
      ))}
    </div>
  );
}

export default function Career({ progress, playerLook, playerName, onFight, onBack }) {
  const next = careerIndex(progress);
  const done = next >= OPPONENTS.length;
  const [tier, setTier] = useState(() => (done ? 5 : OPPONENTS[next].tier));
  const [sel, setSel] = useState(() => (done ? OPPONENTS.length - 1 : next));
  const bouts = OPPONENTS.map((o, i) => ({ o, i })).filter(({ o }) => o.tier === tier);
  const o = OPPONENTS[sel];
  const beaten = progress.career.defeated.includes(o.id);
  const locked = sel > next;
  const st = progress.statistics;
  const pickTier = (t) => {
    setTier(t);
    const first = OPPONENTS.findIndex((x) => x.tier === t);
    // the next bout if it's in this venue, otherwise the venue's first bout
    setSel(OPPONENTS[next]?.tier === t ? next : first);
  };
  return (
    <div className="bc-career">
      <header className="bc-head">
        <button type="button" className="bc-btn bc-btn--icon" onClick={onBack} aria-label="Back"><Icon.back /></button>
        <h2 className="bc-head__title">Career</h2>
        <span className="bc-head__meta">{st.wins}–{st.losses} · {st.kos} KOs {progress.champion && "· CHAMPION"}</span>
      </header>
      <nav className="bc-tiers" aria-label="Venues">
        {TIERS.map((t) => {
          const firstIdx = OPPONENTS.findIndex((x) => x.tier === t.tier);
          const open = firstIdx <= next;
          const won = OPPONENTS.filter((x) => x.tier === t.tier && progress.career.defeated.includes(x.id)).length;
          return (
            <button key={t.tier} type="button" className={`bc-tier${t.tier === tier ? " is-on" : ""}${open ? "" : " is-locked"}`} onClick={() => open && pickTier(t.tier)} disabled={!open}>
              <b>{t.name}</b>
              <small>{open ? `${won}/6` : <><Icon.lock /> locked</>}</small>
            </button>
          );
        })}
      </nav>
      <div className="bc-career__body">
        <section className={`bc-poster${locked ? " is-locked" : ""}`} aria-label="Fight poster">
          <div className="bc-poster__venue">{TIERS[o.tier - 1].name.toUpperCase()} · BOUT {sel + 1} OF 30</div>
          <div className="bc-poster__vs">
            <div className="bc-poster__side">
              <FighterCanvas look={playerLook} facing={1} crop="bust" />
              <div className="bc-poster__name"><b>{playerName}</b><small>{st.wins}–{st.losses}</small></div>
            </div>
            <div className="bc-poster__v">VS</div>
            <div className="bc-poster__side is-right">
              <FighterCanvas look={o.look} facing={-1} crop="bust" />
              <div className="bc-poster__name"><b>{o.name}</b><small>“{o.nickname}” · {o.record}</small></div>
            </div>
          </div>
          <div className="bc-poster__info">
            <div>
              <div className="bc-poster__style">{o.style}</div>
              <p className="bc-poster__bio">{o.bio}</p>
            </div>
            <Bars o={o} />
          </div>
          <div className="bc-poster__cta">
            {locked ? (
              <span className="bc-poster__lock"><Icon.lock /> Win the previous bout to unlock</span>
            ) : (
              <button type="button" className="bc-btn bc-btn--primary bc-btn--big" onClick={() => onFight(o.id)}>
                <Icon.glove /> {beaten ? "Rematch" : sel === OPPONENTS.length - 1 ? "Title fight" : "Fight"}
              </button>
            )}
            {beaten && <span className="bc-poster__won"><Icon.check /> Defeated</span>}
          </div>
        </section>
        <ol className="bc-ladder" aria-label="Bouts">
          {bouts.map(({ o: x, i }) => {
            const won = progress.career.defeated.includes(x.id);
            const lk = i > next;
            return (
              <li key={x.id}>
                <button type="button" className={`bc-bout${i === sel ? " is-on" : ""}${won ? " is-won" : ""}${lk ? " is-locked" : ""}${i === next ? " is-next" : ""}`} onClick={() => setSel(i)}>
                  <span className="bc-bout__num">{i + 1}</span>
                  <span className="bc-bout__face"><FighterCanvas look={x.look} facing={-1} crop="bust" /></span>
                  <span className="bc-bout__text"><b>{x.name}</b><small>{x.style}</small></span>
                  <span className="bc-bout__state">{won ? <Icon.check /> : lk ? <Icon.lock /> : i === next ? "NEXT" : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
