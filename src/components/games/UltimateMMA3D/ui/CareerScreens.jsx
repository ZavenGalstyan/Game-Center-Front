/**
 * Career UI: fighter creation, career hub (contracts · training · rankings ·
 * profile · locker), coach dialogue scenes and the post-fight summary.
 */
import { useEffect, useMemo, useState } from "react";
import { STYLES } from "../data/fighters.js";
import { TIERS, TRAINING, TRAIN_MAX_LEVEL, TRAIN_STEP, trainCost, MILESTONES, COSMETICS, BELTS, RIVALS, COACH, STORY } from "../data/career.js";
import { careerAttrs, canTrain, rankingTable, unlockedCosmetics, careerFighterData } from "../engine/career.js";
import { StatBars } from "./Screens.jsx";
import { ARENA_BY_ID } from "../data/arenas.js";
import { STYLE_TEMPLATES } from "../data/career.js";

const NATIONS = [
  ["Armenia", "🇦🇲"],
  ["United States", "🇺🇸"],
  ["Brazil", "🇧🇷"],
  ["Russia", "🇷🇺"],
  ["Japan", "🇯🇵"],
  ["Thailand", "🇹🇭"],
  ["Mexico", "🇲🇽"],
  ["Ireland", "🇮🇪"],
  ["United Kingdom", "🇬🇧"],
  ["France", "🇫🇷"],
  ["Germany", "🇩🇪"],
  ["Georgia", "🇬🇪"],
  ["Nigeria", "🇳🇬"],
  ["Australia", "🇦🇺"],
  ["Canada", "🇨🇦"],
  ["Poland", "🇵🇱"],
];
const SKINS = [
  ["light", "#fbe6d6"],
  ["light", "#ecc7a6"],
  ["light", "#d9a57c"],
  ["dark", "#f1c9a6"],
  ["dark", "#d39a74"],
  ["dark", "#a5704e"],
];
const HAIRS = [
  ["Hair_Buzzed", "Buzzed"],
  ["Hair_SimpleParted", "Parted"],
  ["Hair_Long", "Long"],
  [null, "Shaved"],
];
const HAIR_COLORS = ["#0d0b0a", "#3b2a1a", "#6b4423", "#b98a4a", "#8a4b22", "#9a9a9a"];

export function CareerCreate({ onCreate, onBack, onPreview }) {
  const [name, setName] = useState("");
  const [nick, setNick] = useState("The Rookie");
  const [nat, setNat] = useState(0);
  const [style, setStyle] = useState("mma");
  const [skin, setSkin] = useState(1);
  const [hair, setHair] = useState(0);
  const [beard, setBeard] = useState(true);
  const [hc, setHc] = useState(0);
  const look = useMemo(() => ({ skinTex: SKINS[skin][0], skinTint: SKINS[skin][1], hair: HAIRS[hair][0], beard, hairColor: HAIR_COLORS[hc], shorts: "#b3141e", accent: "#ffffff", gloves: "#141414", gloveTrim: "#d8d8d8", scale: 1, girth: 1 }), [skin, hair, beard, hc]);
  const fighter = useMemo(
    () => ({ id: "career-preview", name: name || "Your Fighter", nick, nation: NATIONS[nat][0], flag: NATIONS[nat][1], style, look, height: 183, weight: 77, reach: 188 }),
    [name, nick, nat, style, look]
  );
  useEffect(() => {
    onPreview({ ...fighter, attrs: STYLE_TEMPLATES[style], record: [0, 0], combos: [] });
  }, [fighter, style, onPreview]);
  const valid = name.trim().length >= 2;
  return (
    <div className="umc-page umc-create">
      <header className="umc-setup__head">
        <button className="umc-back" onClick={onBack}>
          ‹ Menu
        </button>
        <h2 className="umc-h2">Create Your Fighter</h2>
      </header>
      <div className="umc-create__form">
        <label className="umc-field">
          <span>Name</span>
          <input value={name} maxLength={22} onChange={(e) => setName(e.target.value)} placeholder="First Last" autoFocus />
        </label>
        <label className="umc-field">
          <span>Nickname</span>
          <input value={nick} maxLength={18} onChange={(e) => setNick(e.target.value)} />
        </label>
        <div className="umc-seg umc-seg--wrap">
          <span>Nation</span>
          {NATIONS.map(([n, f], i) => (
            <button key={n} title={n} className={`umc-chip ${nat === i ? "is-on" : ""}`} onClick={() => setNat(i)}>
              {f}
            </button>
          ))}
        </div>
        <div className="umc-seg umc-seg--wrap">
          <span>Style</span>
          {Object.entries(STYLES).map(([id, s]) => (
            <button key={id} className={`umc-chip ${style === id ? "is-on" : ""}`} onClick={() => setStyle(id)}>
              {s.name}
            </button>
          ))}
        </div>
        <p className="umc-dim">{STYLES[style].blurb}</p>
        <StatBars attrs={STYLE_TEMPLATES[style]} />
        <div className="umc-seg">
          <span>Skin</span>
          {SKINS.map(([, c], i) => (
            <button key={c} className={`umc-swatch ${skin === i ? "is-on" : ""}`} style={{ background: c }} onClick={() => setSkin(i)} aria-label={`skin ${i + 1}`} />
          ))}
        </div>
        <div className="umc-seg">
          <span>Hair</span>
          {HAIRS.map(([id, l], i) => (
            <button key={l} className={`umc-chip ${hair === i ? "is-on" : ""}`} onClick={() => setHair(i)}>
              {l}
            </button>
          ))}
          <button className={`umc-chip ${beard ? "is-on" : ""}`} onClick={() => setBeard(!beard)}>
            Beard
          </button>
        </div>
        <div className="umc-seg">
          <span>Hair colour</span>
          {HAIR_COLORS.map((c, i) => (
            <button key={c} className={`umc-swatch ${hc === i ? "is-on" : ""}`} style={{ background: c }} onClick={() => setHc(i)} aria-label={`hair colour ${i + 1}`} />
          ))}
        </div>
        <button className="umc-btn umc-btn--primary umc-btn--big" disabled={!valid} onClick={() => onCreate({ name: name.trim(), nick: nick.trim() || "The Rookie", nation: NATIONS[nat][0], flag: NATIONS[nat][1], style, look, height: 183, weight: 77, reach: 188 })}>
          Begin Career
        </button>
      </div>
    </div>
  );
}

export function Dialogue({ scene, career, onDone }) {
  const lines = STORY[scene] || [];
  const [i, setI] = useState(0);
  const line = lines[i];
  if (!line) return null;
  const next = () => (i + 1 < lines.length ? setI(i + 1) : onDone());
  return (
    <div className="umc-modal" onClick={next}>
      <div className="umc-dialog">
        <div className="umc-dialog__who">
          <div className="umc-avatar">RT</div>
          <div>
            <b>{COACH.name}</b>
            <span>{COACH.title}</span>
          </div>
        </div>
        <p className="umc-dialog__text">{line.text.replace("{name}", career?.fighter?.name || "")}</p>
        <div className="umc-dialog__foot">
          <span className="umc-dim">
            {i + 1} / {lines.length}
          </span>
          <button className="umc-btn umc-btn--primary" onClick={(e) => (e.stopPropagation(), next())} autoFocus>
            {i + 1 < lines.length ? "Continue ›" : "Let's go"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Belt({ id, on }) {
  const b = BELTS[id];
  return (
    <div className={`umc-belt ${on ? "is-on" : ""}`} style={{ "--belt": b.color }} title={b.name}>
      <i />
      <span>{b.name.replace(" Champion", "")}</span>
    </div>
  );
}

export function CareerHub({ career, onFight, onTrain, onEquip, onBack, onPreview, outcome, clearOutcome }) {
  const [tab, setTab] = useState("fight");
  const attrs = careerAttrs(career);
  const T = TIERS[career.tier];
  const me = careerFighterData(career);
  useEffect(() => {
    onPreview(me);
  }, [career.equipped, career.fighter]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="umc-page umc-hub">
      <header className="umc-hub__head">
        <button className="umc-back" onClick={onBack}>
          ‹ Menu
        </button>
        <div className="umc-hub__id">
          <div className="umc-hub__name">
            {career.fighter.flag} {career.fighter.name} <em>“{career.fighter.nick}”</em>
          </div>
          <div className="umc-hub__meta">
            {STYLES[career.fighter.style].name} · {T.name} · Record {career.record.w}-{career.record.l}
            {career.record.d ? `-${career.record.d}` : ""} · ${career.earnings.toLocaleString()}
          </div>
        </div>
        <div className="umc-belts">
          {Object.keys(BELTS).map((id) => (
            <Belt key={id} id={id} on={career.belts[id]} />
          ))}
        </div>
      </header>
      <nav className="umc-tabs">
        {[
          ["fight", "Next Fight"],
          ["train", `Training (${career.points} pts)`],
          ["rank", "Rankings"],
          ["profile", "Profile"],
          ["locker", "Locker"],
        ].map(([id, l]) => (
          <button key={id} className={`umc-tab ${tab === id ? "is-on" : ""}`} onClick={() => setTab(id)}>
            {l}
          </button>
        ))}
      </nav>
      <div className="umc-hub__body">
        {tab === "fight" && <Offers career={career} onFight={onFight} />}
        {tab === "train" && <Training career={career} attrs={attrs} onTrain={onTrain} />}
        {tab === "rank" && <Rankings career={career} />}
        {tab === "profile" && <Profile career={career} attrs={attrs} />}
        {tab === "locker" && <Locker career={career} onEquip={onEquip} />}
      </div>
      {outcome && <Outcome outcome={outcome} onClose={clearOutcome} />}
    </div>
  );
}

function Progress({ career }) {
  return (
    <div className="umc-ladder">
      {TIERS.map((t) => (
        <div key={t.id} className={`umc-ladder__step ${career.tier === t.id ? "is-now" : career.tier > t.id ? "is-done" : ""}`}>
          <b>{t.short}</b>
          <span>{t.title ? (career.belts[t.title] ? "★ Champion" : "Title") : career.tier > t.id ? "✓" : `${t.wins} win${t.wins > 1 ? "s" : ""}`}</span>
        </div>
      ))}
    </div>
  );
}

function Offers({ career, onFight }) {
  const T = TIERS[career.tier];
  const need = career.titleShot ? "Title fight" : `${career.tierWins} / ${T.wins} wins in this tier${T.title ? " → title shot" : " → promotion"}`;
  return (
    <div className="umc-offers">
      <Progress career={career} />
      <p className="umc-dim">
        {T.name} — {need}
        {career.complete ? " · You are the World Champion: every fight now is a title defence." : ""}
      </p>
      <div className="umc-offers__list">
        {career.offers.map((o) => (
          <div key={o.id} className={`umc-offer ${o.title ? "umc-offer--title" : ""} ${o.rival ? "umc-offer--rival" : ""}`}>
            <div className="umc-offer__tag">{o.title ? `${BELTS[o.title].name.toUpperCase()} — TITLE FIGHT` : o.risk}</div>
            <div className="umc-offer__opp">
              {o.opp.flag} {o.opp.name} <em>“{o.opp.nick}”</em>
            </div>
            <div className="umc-offer__meta">
              {STYLES[o.opp.style].name} · {o.opp.record[0]}-{o.opp.record[1]} · {ARENA_BY_ID[o.arena].name} · {o.rounds} rounds
            </div>
            <StatBars attrs={o.opp.attrs} />
            {o.rival && <p className="umc-offer__rival">{RIVALS.find((r) => r.id === o.rival).intro}</p>}
            <div className="umc-offer__pay">
              Purse ${Math.round(o.purse).toLocaleString()} · +{o.points} training pts on a win
            </div>
            <button className="umc-btn umc-btn--primary" onClick={() => onFight(o)}>
              Sign &amp; Fight
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Training({ career, attrs, onTrain }) {
  return (
    <div className="umc-train">
      <p className="umc-dim">
        Each session raises an attribute by +{TRAIN_STEP} (max {TRAIN_MAX_LEVEL} sessions per skill, attributes cap at 95). Costs rise as you specialise — you can't max everything, so build a style.
      </p>
      <div className="umc-train__list">
        {TRAINING.map((t) => {
          const lv = career.levels[t.id] || 0;
          const chk = canTrain(career, t.id);
          return (
            <div key={t.id} className="umc-train__row">
              <div className="umc-train__name">
                <b>{t.name}</b>
                <span className="umc-dim">{t.desc}</span>
              </div>
              <div className="umc-train__pips">
                {Array.from({ length: TRAIN_MAX_LEVEL }, (_, i) => (
                  <i key={i} className={i < lv ? "is-on" : ""} />
                ))}
              </div>
              <div className="umc-train__val">{Math.round(attrs[t.attr])}</div>
              <button className="umc-btn umc-btn--small" disabled={!chk.ok} onClick={() => onTrain(t.id)}>
                {chk.ok ? `Train (${chk.cost})` : lv >= TRAIN_MAX_LEVEL ? "Max" : chk.why}
              </button>
            </div>
          );
        })}
      </div>
      <div className="umc-train__points">
        Training points: <b>{career.points}</b> · next costs: {TRAINING.map((t) => trainCost(career.levels[t.id] || 0)).join("/")}
      </div>
    </div>
  );
}

function Rankings({ career }) {
  const tiers = [3, 4, 5];
  return (
    <div className="umc-rankings">
      {tiers.map((ti) => {
        const tb = rankingTable(career, ti);
        return (
          <div key={ti} className="umc-rank">
            <h3>{TIERS[ti].name}</h3>
            <div className="umc-rank__champ">
              <span>C</span> {tb.champion}
            </div>
            <ol>
              {tb.rows.map((r, i) => (
                <li key={r.name + i} className={r.you ? "is-you" : ""}>
                  <span>{i + 1}</span> {r.flag} {r.name} <em>{r.record}</em>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function Profile({ career, attrs }) {
  const r = career.record;
  return (
    <div className="umc-profile">
      <div>
        <h3>Record</h3>
        <div className="umc-recbig">
          <b>{r.w}</b>-<b>{r.l}</b>
          {r.d ? `-${r.d}` : ""}
        </div>
        <p className="umc-dim">
          {r.ko} KO/TKO · {r.sub} submissions · {r.dec} decisions · streak {career.streak}
        </p>
        <StatBars attrs={attrs} />
        <h3>Rivals</h3>
        <ul className="umc-rivals">
          {RIVALS.map((rv) => {
            const s = career.rivals[rv.id];
            return (
              <li key={rv.id}>
                {rv.flag} {rv.name} “{rv.nick}” — {s.met ? `${s.w}-${s.l}` : "not met yet"}
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h3>Fight history</h3>
        <ul className="umc-history">
          {career.history.length === 0 && <li className="umc-dim">No fights yet.</li>}
          {career.history.map((h) => (
            <li key={h.n} className={h.won ? "umc-win" : h.won === false ? "umc-loss" : ""}>
              #{h.n} {h.won ? "W" : h.won === false ? "L" : "D"} vs {h.opp} — {h.method} R{h.round} {h.title ? `(${BELTS[h.title].name})` : ""}
            </li>
          ))}
        </ul>
        <h3>Milestones</h3>
        <ul className="umc-miles">
          {MILESTONES.map((m) => (
            <li key={m.id} className={career.milestones.includes(m.id) ? "is-on" : ""} title={m.desc}>
              {career.milestones.includes(m.id) ? "★" : "☆"} {m.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Locker({ career, onEquip }) {
  const un = unlockedCosmetics(career).map((x) => x.id);
  return (
    <div className="umc-locker">
      {["shorts", "gloves"].map((kind) => (
        <div key={kind}>
          <h3>{kind === "shorts" ? "Fight shorts" : "Gloves"}</h3>
          <div className="umc-locker__grid">
            {COSMETICS.filter((c) => c.kind === kind).map((c) => {
              const open = un.includes(c.id);
              const on = career.equipped[kind] === c.id;
              return (
                <button key={c.id} disabled={!open} className={`umc-cos ${on ? "is-on" : ""}`} onClick={() => onEquip(c.id)} title={open ? c.name : `Unlock: ${MILESTONES.find((m) => m.id === c.unlock)?.name}`}>
                  <i style={{ background: c.color, borderColor: c.accent || c.trim }} />
                  <span>{open ? c.name : `🔒 ${MILESTONES.find((m) => m.id === c.unlock)?.name}`}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Outcome({ outcome, onClose }) {
  const { belt, notes, unlocked, coach, rivalLine } = outcome;
  return (
    <div className="umc-modal">
      <div className={`umc-panel umc-outcome ${belt ? "umc-outcome--belt" : ""}`}>
        {belt && (
          <div className="umc-champ">
            <div className="umc-champ__belt" style={{ "--belt": BELTS[belt].color }}>
              <i />
            </div>
            <div className="umc-champ__title">{BELTS[belt].name.toUpperCase()}</div>
          </div>
        )}
        {rivalLine && <p className="umc-outcome__rival">{rivalLine}</p>}
        <p className="umc-outcome__coach">
          <b>{COACH.name}:</b> “{coach}”
        </p>
        <ul className="umc-outcome__notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {unlocked.map((u) => (
            <li key={u} className="umc-gold">
              ★ Milestone: {MILESTONES.find((m) => m.id === u)?.name}
              {COSMETICS.filter((c) => c.unlock === u).map((c) => ` — unlocked ${c.name} ${c.kind}`)}
            </li>
          ))}
        </ul>
        <button className="umc-btn umc-btn--primary" onClick={onClose} autoFocus>
          Continue
        </button>
      </div>
    </div>
  );
}
