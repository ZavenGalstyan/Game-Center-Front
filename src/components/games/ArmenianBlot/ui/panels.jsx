/**
 * HUD panels: scoreboard, contract panel, the human's bidding panel,
 * announcements, the practice coach and the hand-result breakdown.
 */
import { useEffect, useState } from "react";
import { legalBids } from "../engine/bidding.js";
import { strainsFor } from "../engine/rules.js";
import { teamOf } from "../engine/play.js";
import { cardLabel } from "../engine/deck.js";
import { StrainIcon, BidLabel, ContractLabel, strainName } from "./Table.jsx";
import { EternityPath } from "./art.jsx";

const teamName = (team, t) => (team === 0 ? t("teamAFull") : t("teamBFull"));

/* ------------------------------------------------------------ scoreboard */

export function Scoreboard({ m, t }) {
  const h = m.hand;
  const last = m.history.length ? m.history[m.history.length - 1] : null;
  const live = h.phase === "play" || h.phase === "trickEnd";
  return (
    <section className="ab-panel ab-score" aria-label={t("matchScore")}>
      <header className="ab-panel__head">
        <span>{t("matchScore")}</span>
        <small>{t("target")} {m.target}</small>
      </header>
      {[0, 1].map((team) => (
        <div key={team} className={`ab-score__row ab-team--${team ? "b" : "a"}`}>
          <i className="ab-teamdot" />
          <span className="ab-score__name">{teamName(team, t)}</span>
          <span className="ab-score__tricks" title={t("tricks")}>{live || h.phase === "scored" ? h.won[team] : ""}</span>
          <b className="ab-score__total">{m.scores[team]}</b>
        </div>
      ))}
      <div className="ab-score__bar" style={{ "--a": `${Math.min(100, (m.scores[0] / m.target) * 100)}%`, "--b": `${Math.min(100, (m.scores[1] / m.target) * 100)}%` }}>
        <i className="is-a" /><i className="is-b" />
      </div>
      <footer className="ab-score__foot">
        {live ? (
          <span>{t("handScore")}: <b>{h.cards[0]}</b> · <b>{h.cards[1]}</b> <small>({t("rawPoints").toLowerCase()})</small></span>
        ) : last ? (
          <span>{t("lastHand")}: <b>+{last.score[0]}</b> · <b>+{last.score[1]}</b> <small>{last.made ? t("made") : t("failed")}</small></span>
        ) : (
          <span>{t("handNo", { n: m.handNo })}</span>
        )}
      </footer>
    </section>
  );
}

/* ------------------------------------------------------------ contract panel */

export function ContractPanel({ m, t, onPause, onRules, practice }) {
  const h = m.hand;
  const a = h.auction;
  const c = h.contract;
  return (
    <section className="ab-panel ab-contract" aria-label={t("contract")}>
      <header className="ab-panel__head">
        <span>{t("handNo", { n: m.handNo })}{practice && <em className="ab-tag">{t("practiceTag")}</em>}</span>
        <span className="ab-panel__btns">
          <button type="button" className="ab-iconbtn" onClick={onRules} aria-label={t("rules")} title={t("rules")}>?</button>
          <button type="button" className="ab-iconbtn" onClick={onPause} aria-label={t("pause")} title={`${t("pause")} (Esc)`}>❚❚</button>
        </span>
      </header>
      {c ? (
        <div className="ab-contract__body">
          <div className="ab-contract__big">
            <StrainIcon strain={c.strain} t={t} big />
          </div>
          <div className="ab-contract__txt">
            <b><ContractLabel c={c} t={t} /> <span className="ab-contract__strain">{strainName(c.strain, t)}</span></b>
            <small className={`ab-team--${c.team ? "b" : "a"}`}><i className="ab-teamdot" />{c.seat === 0 ? t("teamAFull") : `${t(`seat${c.seat}`)} · ${teamName(c.team, t)}`}</small>
            <small>{c.kaput ? t("capot") : t("needPoints", { n: c.target })} · {t("trickNo", { n: Math.min(8, h.tricks.length + (h.trick.length ? 1 : 0)) || 1 })}</small>
          </div>
        </div>
      ) : (
        <div className="ab-contract__body">
          <div className={`ab-contract__big${a.high ? "" : " is-empty"}`}>
            {a.high ? <StrainIcon strain={a.high.strain} t={t} big /> : <svg viewBox="-50 -50 100 100"><EternityPath r={40} fill="var(--gold)" /></svg>}
          </div>
          <div className="ab-contract__txt">
            <b>{t("currentBid")}: {a.high ? <BidLabel action={a.high.kaput ? { type: "kaput", strain: a.high.strain } : { type: "bid", ...a.high }} t={t} /> : <span className="ab-dim">{t("noBidYet")}</span>}</b>
            <small>{a.high ? `${t(`seat${a.high.seat}`)} · ${teamName(teamOf(a.high.seat), t)}` : t("minBid", { n: m.rules.minBid })}</small>
            {a.mult > 1 && <small className="ab-contra-note">{a.mult === 2 ? t("contra") : t("recontra")} ×{a.mult}</small>}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ bidding */

export function BidPanel({ m, t, onBid, suggestion, disabled }) {
  const h = m.hand;
  const a = h.auction;
  const rules = m.rules;
  const lb = legalBids(a, 0, rules);
  const levels = [];
  for (let lv = rules.minBid; lv <= rules.maxBid; lv += rules.bidStep) levels.push(lv);
  const legalLevels = new Set(lb.bids.map((b) => b.level));
  const strains = strainsFor(rules);
  const [level, setLevel] = useState(null);
  const [strain, setStrain] = useState(null);
  const lv = level != null && legalLevels.has(level) ? level : null;
  useEffect(() => { setLevel(null); }, [a.history.length]);

  if (a.stage === "contra") {
    return (
      <div className="ab-bidpanel ab-bidpanel--contra" role="dialog" aria-label={t("yourBid")}>
        <h3>{t("contra")}! <ContractLabel c={{ ...a.high, mult: a.mult }} t={t} /></h3>
        <div className="ab-bidpanel__row">
          {lb.recontra && <button type="button" className="ab-btn ab-btn--gold" disabled={disabled} onClick={() => onBid({ type: "recontra" })}>{t("recontra")} ×4</button>}
          <button type="button" className="ab-btn" disabled={disabled} onClick={() => onBid({ type: "pass" })}>{t("pass")}</button>
        </div>
      </div>
    );
  }
  const canBid = lv != null && strain != null && lb.bids.some((b) => b.level === lv && b.strain === strain);
  return (
    <div className="ab-bidpanel" role="dialog" aria-label={t("yourBid")}>
      <h3>{t("yourBid")}</h3>
      <div className="ab-bidpanel__levels" role="radiogroup" aria-label={t("bid")}>
        {levels.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={lv === x} className={`ab-chip${lv === x ? " is-on" : ""}`} disabled={disabled || !legalLevels.has(x)} onClick={() => setLevel(x)}>{x}</button>
        ))}
      </div>
      <div className="ab-bidpanel__strains" role="radiogroup" aria-label={t("trump")}>
        {strains.map((s) => (
          <button key={String(s)} type="button" role="radio" aria-checked={strain === s} className={`ab-chip ab-chip--strain${strain === s ? " is-on" : ""}`} disabled={disabled} onClick={() => setStrain(s)} title={strainName(s, t)}>
            <StrainIcon strain={s} t={t} />
          </button>
        ))}
      </div>
      <div className="ab-bidpanel__row">
        <button type="button" className="ab-btn ab-btn--gold" disabled={disabled || !canBid} onClick={() => onBid({ type: "bid", level: lv, strain })}>
          {t("bid")} {canBid && <BidLabel action={{ type: "bid", level: lv, strain }} t={t} />}
        </button>
        <button type="button" className="ab-btn" disabled={disabled} onClick={() => onBid({ type: "pass" })}>{t("pass")}</button>
        {lb.contra && <button type="button" className="ab-btn ab-btn--red" disabled={disabled} onClick={() => onBid({ type: "contra" })}>{t("contra")} ×2</button>}
        {lb.kaput.length > 0 && (
          <button type="button" className="ab-btn ab-btn--ghost" disabled={disabled || strain == null || !lb.kaput.includes(strain)} onClick={() => onBid({ type: "kaput", strain })} title={t("capot")}>
            {t("kaput")}
          </button>
        )}
      </div>
      {suggestion && (
        <p className="ab-bidpanel__hint">{t("suggest", { x: "" })}<BidLabel action={suggestion} t={t} /></p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ announcements */

const DECL_KEY = { terz: "declTerz", fifty: "declFifty", hundred: "declHundred", quad: "declQuad" };

export function describeEvent(e, t) {
  switch (e.type) {
    case "declare": return { cls: "decl", text: t("declares", { name: t(`seat${e.seat}`), what: e.decls.map((d) => `${t(DECL_KEY[d.name])} ${d.value}`).join(" + ") }) };
    case "declResult": return e.team == null ? { cls: "decl", text: t("declTie") } : { cls: "decl", text: t("declWins", { team: teamName(e.team, t), n: e.points[e.team] }) };
    case "belote": return { cls: "belote", text: t("belote"), sub: t(`seat${e.seat}`) };
    case "rebelote": return { cls: "belote", text: t("rebelote"), sub: t(`seat${e.seat}`) };
    case "contract": return { cls: "contract", node: <><ContractLabel c={e.contract} t={t} /> · {t(`seat${e.seat}`)}</> };
    default: return null;
  }
}

export function Banners({ items, t }) {
  return (
    <div className="ab-banners" aria-live="polite">
      {items.map((b) => {
        const d = b.redeal ? { cls: "contract", text: t("redeal") } : describeEvent(b.e, t);
        if (!d) return null;
        return (
          <div key={b.id} className={`ab-banner ab-banner--${d.cls}`}>
            {d.node || <b>{d.text}</b>}
            {d.sub && <small>{d.sub}</small>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ coach / legal explanation */

export function Coach({ m, t, reason, suggestion, practice, showWhy }) {
  const h = m.hand;
  if (!practice && !(showWhy && reason)) return null;
  return (
    <aside className="ab-panel ab-coach" aria-live="polite">
      {practice && <header className="ab-panel__head"><span>{t("coach")}</span></header>}
      {reason && <p className="ab-coach__why">{t(`why_${reason}`)}</p>}
      {practice && suggestion != null && h.phase === "play" && <p className="ab-coach__tip">{t("suggest", { x: cardLabel(suggestion) })}</p>}
      {practice && h.phase === "bidding" && <p className="ab-coach__tip">{t("coachBid")}</p>}
      {practice && h.phase === "play" && h.trick.length > 0 && <p className="ab-coach__tip">{t("coachTrick")}</p>}
    </aside>
  );
}

/* ------------------------------------------------------------ hand result */

export function HandResult({ m, t, onNext, busy }) {
  const h = m.hand;
  const r = h.result;
  const c = h.contract;
  const mult = (k) => (k > 1 ? ` ×${k}` : "");
  const lineText = (l) => {
    switch (l.key) {
      case "made": return t("lineMade", { base: l.base, value: c.value, mult: mult(l.mult) });
      case "failed": return t("lineFailed", { base: l.base, value: c.value, mult: mult(l.mult) });
      case "cards": return t("lineCards");
      case "contract": return t("lineContract", { value: c.value, mult: mult(l.mult) });
      case "decl": return t("lineDecl");
      case "belote": return t("lineBelote");
      default: return l.key;
    }
  };
  return (
    <div className="ab-overlay ab-overlay--soft">
      <div className={`ab-result ${r.made ? "is-made" : "is-failed"}`} role="dialog" aria-label={t("handResult")}>
        <header className="ab-result__head">
          <h3>{t("handResult")}</h3>
          <p>
            <ContractLabel c={c} t={t} /> · {t(`seat${c.seat}`)} ·{" "}
            <b className={r.made ? "is-good" : "is-bad"}>{r.made ? t("made") : t("failed")}</b>
            {r.capotTeam != null && <em> · {t("capot")}</em>}
          </p>
        </header>
        <table className="ab-result__table">
          <thead>
            <tr><th /><th className="ab-team--a"><i className="ab-teamdot" />{t("teamAFull")}</th><th className="ab-team--b"><i className="ab-teamdot" />{t("teamBFull")}</th></tr>
          </thead>
          <tbody className="ab-result__raw">
            <tr><td>{t("rawPoints")} <small>({t("lastTrick")})</small></td><td>{r.raw.cards[0]}</td><td>{r.raw.cards[1]}</td></tr>
            <tr><td>{t("declPoints")}</td><td>{r.raw.decl[0] || "–"}</td><td>{r.raw.decl[1] || "–"}</td></tr>
            <tr><td>{t("belotePoints")}</td><td>{r.raw.belote[0] || "–"}</td><td>{r.raw.belote[1] || "–"}</td></tr>
            <tr className="is-sum"><td>{t("total")}</td><td>{r.raw.total[0]}</td><td>{r.raw.total[1]}</td></tr>
            <tr><td>{t("tricks")}</td><td>{h.won[0]}</td><td>{h.won[1]}</td></tr>
          </tbody>
          <tbody className="ab-result__lines">
            <tr className="is-caption"><td colSpan={3}>{t("contractResult")} — {c.kaput ? t("capot") : t("needPoints", { n: c.target })}</td></tr>
            {r.lines.map((l, k) => (
              <tr key={k}><td>{lineText(l)}</td><td>{l.team === 0 ? `+${l.value}` : ""}</td><td>{l.team === 1 ? `+${l.value}` : ""}</td></tr>
            ))}
            <tr className="is-sum"><td>{t("handScore")}</td><td>+{r.score[0]}</td><td>+{r.score[1]}</td></tr>
            <tr className="is-total"><td>{t("matchScore")}</td><td>{m.scores[0]}</td><td>{m.scores[1]}</td></tr>
          </tbody>
        </table>
        {!m.over && (
          <button type="button" className="ab-btn ab-btn--gold ab-result__next" onClick={onNext} disabled={busy} autoFocus>
            {t("nextHand")}
          </button>
        )}
      </div>
    </div>
  );
}
