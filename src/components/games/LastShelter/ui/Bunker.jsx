/**
 * Last Shelter — the shelter screen: the painted room on one side and the
 * day's journal on the other (tabs: Journal · Family · Expedition · Shelter),
 * a supplies bar on top and End Day at the bottom of the journal.
 *
 * The state object is mutated only through engine calls made by the parent
 * (LastShelter.jsx); `version` changes after each one so this re-renders.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BunkerScene } from "./BunkerScene.jsx";
import { EventArt } from "./EventArt.jsx";
import { Portrait } from "./Figure.jsx";
import { Icon } from "./icons.jsx";
import { BY_ID, FAMILY } from "../data/family.js";
import { EVENT_BY_ID, CATEGORIES } from "../data/events/index.js";
import { DESTS, GEAR } from "../data/expeditions.js";
import { TOOL_KEYS, TOOL_NAMES } from "../data/items.js";
import { conditions, choiceState, fill, planCost, present, ACTIONS, actionState } from "../engine/shelter.js";
import { canSend, destState, riskOf, riskLabel, tripDays, maxGear } from "../engine/expedition.js";

const days = (n) => `${n} day${n === 1 ? "" : "s"}`;

const QUIET = [
  "Nothing happened today. You counted the cans twice anyway.",
  "A quiet day. The ventilation fan ticked like a clock.",
  "Rain, maybe, far above. Everyone slept a little longer.",
  "The day passed in whispers and card games.",
  "Nobody came. Nothing broke. That counts as a good day now.",
];

export function Bunker({ S, version, onChoose, onToggle, onSuggest, onAction, onSend, onEndDay, onPause, dayFlash }) {
  const [tab, setTab] = useState("journal");
  const [sel, setSel] = useState(null);
  const ev = S.event && !S.event.quiet ? EVENT_BY_ID[S.event.id] : null;
  const eventOpen = !!ev && !S.event.done;
  const cost = planCost(S);
  const pres = present(S);
  const scroller = useRef(null);
  const sceneRef = useRef(null);
  const [aspect, setAspect] = useState(1.33);
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setAspect(Math.round((r.width / r.height) * 50) / 50);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [S.day, tab]);
  const selectMember = (id) => {
    setSel(id);
    setTab("family");
  };
  const thirstyUnfed = pres.filter((id) => S.fam[id].thirst >= 60 && !S.plan.water[id]).length;
  return (
    <div className="lsh-bunker">
      <div className="lsh-bunker__scene" ref={sceneRef}>
        <BunkerScene S={S} version={version} aspect={aspect} selected={tab === "family" ? sel : null} onSelect={selectMember} />
        <div className="lsh-dayplate" key={S.day}>
          <span>Day</span>
          <b>{S.day}</b>
        </div>
      </div>
      <div className="lsh-topbar">
        <Res k="food" n={S.res.food} need={pres.length} label="Food" />
        <Res k="water" n={S.res.water} need={pres.length} label="Water" />
        <Res k="meds" n={S.res.meds} label="Medicine" />
        <Res k="batteries" n={S.res.batteries} label="Batteries" />
        <span className={`lsh-res lsh-res--bar${S.shelter < 35 ? " is-low" : ""}`} title="Shelter condition">
          <Icon name="shelter" size={18} />
          <i style={{ "--v": `${S.shelter}%` }} />
          {Math.round(S.shelter)}%
        </span>
        <button type="button" className="lsh-iconbtn" onClick={onPause} aria-label="Pause">
          <Icon name="pause" size={18} />
        </button>
      </div>
      <aside className="lsh-panel">
        <nav className="lsh-tabs" role="tablist">
          {[
            ["journal", "Journal", "journal", eventOpen],
            ["family", "Family", "family", false],
            ["exp", "Expedition", "route", false],
            ["shelter", "Shelter", "crate", false],
          ].map(([k, label, icon, dot]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`lsh-tab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>
              <Icon name={icon} size={16} />
              <span>{label}</span>
              {dot && <i className="lsh-tab__dot" />}
            </button>
          ))}
        </nav>
        <div className="lsh-panel__body" ref={scroller}>
          {tab === "journal" && <Journal S={S} ev={ev} onChoose={onChoose} />}
          {tab === "family" && <FamilyTab S={S} sel={sel} setSel={setSel} onToggle={onToggle} onSuggest={onSuggest} />}
          {tab === "exp" && <ExpTab S={S} onSend={onSend} />}
          {tab === "shelter" && <ShelterTab S={S} onAction={onAction} />}
        </div>
        <footer className="lsh-panel__foot">
          <div className="lsh-plan">
            <span title="Food planned today">
              <Icon name="food" size={16} /> {cost.food}
            </span>
            <span title="Water planned today">
              <Icon name="water" size={16} /> {cost.water}
            </span>
            <span title="Medicine planned today">
              <Icon name="meds" size={16} /> {cost.meds}
            </span>
            {thirstyUnfed > 0 && <em className="lsh-warn">{thirstyUnfed} thirsty, no water planned</em>}
            {tab !== "family" && (
              <button type="button" className="lsh-link" onClick={() => setTab("family")}>
                Rations →
              </button>
            )}
          </div>
          <button type="button" className="lsh-btn lsh-btn--primary lsh-endday" disabled={eventOpen} onClick={onEndDay} title={eventOpen ? "Answer today's event first" : "End the day"}>
            {eventOpen ? "Answer today's event" : `End Day ${S.day}`}
          </button>
        </footer>
      </aside>
      {dayFlash && (
        <div className="lsh-dayflash" key={dayFlash.k}>
          <div className="lsh-dayflash__card">
            <span>Day</span>
            <b>{dayFlash.day}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function Res({ k, n, need = 0, label }) {
  const low = need && n < need;
  return (
    <span className={`lsh-res${n === 0 ? " is-out" : low ? " is-low" : ""}`} title={label}>
      <Icon name={k} size={20} />
      <b>{n}</b>
      <span className="lsh-res__lbl">{label}</span>
    </span>
  );
}

function Journal({ S, ev, onChoose }) {
  const E = S.event;
  const ctx = E?.ctx || {};
  const text = ev ? fill(typeof ev.text === "function" ? ev.text(S, ctx) : ev.text, ctx) : "";
  const quietLine = QUIET[S.day % QUIET.length];
  return (
    <div className="lsh-journal">
      {S.report.length > 0 && (
        <section className="lsh-report">
          <h3>Morning, day {S.day}</h3>
          <ul>
            {S.report.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}
      {ev ? (
        <article className={`lsh-event${E.done ? " is-done" : ""}`}>
          <EventArt cat={ev.cat} />
          <div className="lsh-event__cat">{CATEGORIES[ev.cat]}</div>
          <h2 className="lsh-event__title">{fill(ev.title, ctx)}</h2>
          <p className="lsh-event__text">{text}</p>
          {!E.done ? (
            <div className="lsh-choices">
              {ev.choices.map((ch, i) => {
                const st = choiceState(S, ch);
                return (
                  <button key={i} type="button" className="lsh-choice" disabled={st !== true} onClick={() => onChoose(i)}>
                    <span>{fill(ch.label, ctx)}</span>
                    {st !== true && <em>{st}</em>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="lsh-outcome">
              <div className="lsh-outcome__choice">You chose: {fill(ev.choices[E.choice].label, ctx)}</div>
              <p>{E.result.text}</p>
              {E.result.changes.length > 0 && (
                <div className="lsh-changes">
                  {E.result.changes.map((c, i) => (
                    <span key={i} className={`lsh-change ${c.good ? "is-good" : "is-bad"}`}>
                      {c.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </article>
      ) : (
        <article className="lsh-event lsh-event--quiet">
          <h2 className="lsh-event__title">A quiet day</h2>
          <p className="lsh-event__text">{quietLine}</p>
        </article>
      )}
      {S.action && (
        <section className="lsh-actionlog">
          <h3>Today's task</h3>
          <p>{S.action.text}</p>
          <div className="lsh-changes">
            {S.action.changes.map((c, i) => (
              <span key={i} className={`lsh-change ${c.good ? "is-good" : "is-bad"}`}>
                {c.text}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Bar({ v, kind, icon, label, invert }) {
  const shown = invert ? 100 - v : v;
  const bad = shown < 30;
  const warn = shown < 55;
  return (
    <div className={`lsh-bar${bad ? " is-bad" : warn ? " is-warn" : ""}`} title={`${label}: ${Math.round(shown)}%`}>
      <Icon name={icon} size={14} />
      <span className="lsh-bar__lbl">{label}</span>
      <span className="lsh-bar__track">
        <i className={`lsh-bar__fill lsh-bar__fill--${kind}`} style={{ width: `${shown}%` }} />
      </span>
    </div>
  );
}

function FamilyTab({ S, sel, setSel, onToggle, onSuggest }) {
  const ids = FAMILY.map((f) => f.id).filter((id) => S.fam[id] || S.lostInHouse.includes(id));
  return (
    <div className="lsh-family">
      <div className="lsh-family__head">
        <p>Choose who eats, drinks and gets medicine today. Rations are used when you end the day.</p>
        <button type="button" className="lsh-btn lsh-btn--small" onClick={onSuggest}>
          Suggest rations
        </button>
      </div>
      {ids.map((id) => {
        const m = S.fam[id];
        const c = BY_ID[id];
        if (!m) {
          return (
            <div key={id} className="lsh-member is-lost">
              <Portrait id={id} size={52} dead />
              <div>
                <b>{c.name}</b>
                <p className="lsh-muted">Never made it to the hatch.</p>
              </div>
            </div>
          );
        }
        const conds = conditions(m);
        const open = sel === id;
        return (
          <div key={id} className={`lsh-member${!m.alive ? " is-dead" : ""}${m.away ? " is-away" : ""}${open ? " is-open" : ""}`}>
            <button type="button" className="lsh-member__top" onClick={() => setSel(open ? null : id)} aria-expanded={open}>
              <Portrait id={id} m={m} size={56} dead={!m.alive} away={m.away} />
              <div className="lsh-member__name">
                <b>{c.name}</b>
                <span>{c.role}</span>
                <div className="lsh-tags">
                  {!m.alive ? (
                    <span className="lsh-tag is-bad">{m.left ? "left" : "died"} · day {m.diedDay}</span>
                  ) : m.away ? (
                    <span className="lsh-tag">on expedition</span>
                  ) : conds.length ? (
                    conds.map((t) => (
                      <span key={t} className={`lsh-tag${/starving|dehydrated|very sick|badly|near death|despair/.test(t) ? " is-bad" : ""}`}>
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="lsh-tag is-good">doing okay</span>
                  )}
                </div>
              </div>
            </button>
            {m.alive && (
              <div className="lsh-member__bars">
                <Bar v={m.hp} kind="hp" icon="heart" label="Health" />
                <Bar v={m.hunger} kind="food" icon="hunger" label="Fed" invert />
                <Bar v={m.thirst} kind="water" icon="thirst" label="Hydrated" invert />
                <Bar v={m.morale} kind="morale" icon="morale" label="Morale" />
                <Bar v={m.fatigue} kind="energy" icon="energy" label="Energy" invert />
              </div>
            )}
            {m.alive && !m.away && (
              <div className="lsh-member__plan">
                <Toggle on={!!S.plan.food[id]} disabled={!S.plan.food[id] && planCost(S).food >= S.res.food} onClick={() => onToggle("food", id)} icon="food" label="Eat" />
                <Toggle on={!!S.plan.water[id]} disabled={!S.plan.water[id] && planCost(S).water >= S.res.water} onClick={() => onToggle("water", id)} icon="water" label="Drink" />
                <Toggle on={!!S.plan.meds[id]} disabled={(!S.plan.meds[id] && planCost(S).meds >= S.res.meds) || (!m.sick && !m.injured)} onClick={() => onToggle("meds", id)} icon="meds" label="Medicine" />
              </div>
            )}
            {m.cause && !m.alive && <p className="lsh-muted">Cause: {m.cause}.</p>}
            {open && (
              <div className="lsh-member__more">
                <p>{c.blurb}</p>
                <ul className="lsh-traits">
                  {c.strengths.map((s) => (
                    <li key={s} className="is-good">
                      + {s}
                    </li>
                  ))}
                  {c.weaknesses.map((s) => (
                    <li key={s} className="is-bad">
                      − {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function Toggle({ on, disabled, onClick, icon, label }) {
  return (
    <button type="button" className={`lsh-toggle${on ? " is-on" : ""}`} disabled={disabled && !on} onClick={onClick} aria-pressed={on}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </button>
  );
}

function ExpTab({ S, onSend }) {
  const pres = present(S);
  const [who, setWho] = useState(null);
  const [dest, setDest] = useState(null);
  const [gear, setGear] = useState([]);
  const whoOk = who && canSend(S, who) === true ? who : null;
  const D = DESTS.find((d) => d.id === dest);
  const ownedGear = Object.keys(GEAR).filter((g) => S.items[g]);
  const risk = whoOk && D ? riskOf(S, D, whoOk, gear) : null;
  useEffect(() => {
    setGear((g) => g.filter((x) => S.items[x]).slice(0, maxGear(S)));
  }, [S, S.day]);
  if (S.exp) {
    const d = DESTS.find((x) => x.id === S.exp.dest);
    return (
      <div className="lsh-exp">
        <EventArt cat="expedition" />
        <div className="lsh-exp__active">
          <Portrait id={S.exp.who} m={S.fam[S.exp.who]} size={64} away />
          <div>
            <h3>
              {BY_ID[S.exp.who].name} is at {d.name}
            </h3>
            <p>
              Expected back in <b>{S.exp.left}</b> day{S.exp.left === 1 ? "" : "s"}. Took: {S.exp.gear.length ? S.exp.gear.map((g) => TOOL_NAMES[g]).join(", ") : "nothing"}.
            </p>
            <p className="lsh-muted">They forage while away and don't eat from the shelter's stock.</p>
          </div>
        </div>
        <LastTrip S={S} />
      </div>
    );
  }
  return (
    <div className="lsh-exp">
      <p className="lsh-muted">Send one person out with gear. They'll be gone for days. Danger depends on health, fatigue, morale, gear and where they go.</p>
      <h4>Who goes?</h4>
      <div className="lsh-pickrow">
        {pres.map((id) => {
          const st = canSend(S, id);
          return (
            <button key={id} type="button" className={`lsh-pick${who === id ? " is-on" : ""}`} disabled={st !== true} onClick={() => setWho(id)} title={st === true ? "" : st}>
              <Portrait id={id} m={S.fam[id]} size={46} />
              <span>{BY_ID[id].name}</span>
              {st !== true && <em>{st}</em>}
            </button>
          );
        })}
        {pres.length < 2 && <p className="lsh-warn">Nobody would be left to keep the shelter. Send the last person only if you must.</p>}
      </div>
      <h4>Where?</h4>
      <div className="lsh-dests">
        {DESTS.map((d) => {
          const st = destState(S, d, whoOk || "hollis");
          if (st === "Undiscovered") return null;
          const r = whoOk ? riskOf(S, d, whoOk, gear) : d.risk;
          return (
            <button key={d.id} type="button" className={`lsh-dest${dest === d.id ? " is-on" : ""}`} disabled={st !== true} onClick={() => setDest(d.id)}>
              <b>{d.name}</b>
              <span className="lsh-dest__blurb">{d.blurb}</span>
              <span className="lsh-dest__meta">
                <span>{days(whoOk ? tripDays(S, d, whoOk, gear) : d.days)}</span>
                <span className={`lsh-risk lsh-risk--${riskLabel(r).toLowerCase()}`}>{riskLabel(r)} risk</span>
                <span className="lsh-dest__loot">{Object.keys(d.loot).map((k) => <Icon key={k} name={k} size={14} />)}</span>
              </span>
              {st !== true && <em>{st}</em>}
            </button>
          );
        })}
      </div>
      <h4>
        Gear <span className="lsh-muted">(up to {maxGear(S)})</span>
      </h4>
      <div className="lsh-gear">
        {Object.keys(GEAR).map((g) => {
          const owned = !!S.items[g];
          const on = gear.includes(g);
          return (
            <button
              key={g}
              type="button"
              className={`lsh-gearbtn${on ? " is-on" : ""}`}
              disabled={!owned || (!on && gear.length >= maxGear(S))}
              onClick={() => setGear((x) => (on ? x.filter((y) => y !== g) : [...x, g]))}
              title={owned ? GEAR[g].note : "You don't have one"}
            >
              <Icon name={g} size={20} />
              <span>{TOOL_NAMES[g]}</span>
            </button>
          );
        })}
        {!ownedGear.length && <p className="lsh-muted">No gear to take.</p>}
      </div>
      <div className="lsh-exp__go">
        {risk != null && (
          <span className={`lsh-risk lsh-risk--${riskLabel(risk).toLowerCase()}`}>
            {riskLabel(risk)} risk · {days(tripDays(S, D, whoOk, gear))}
          </span>
        )}
        <button
          type="button"
          className="lsh-btn lsh-btn--primary"
          disabled={!whoOk || !D || destState(S, D, whoOk) !== true}
          onClick={() => {
            onSend(whoOk, D.id, gear);
            setWho(null);
            setDest(null);
            setGear([]);
          }}
        >
          Send {whoOk ? BY_ID[whoOk].name : "…"}
        </button>
      </div>
      <LastTrip S={S} />
    </div>
  );
}
function LastTrip({ S }) {
  if (!S.lastExp) return null;
  const L = S.lastExp;
  return (
    <div className="lsh-lasttrip">
      <h4>Last expedition</h4>
      {L.lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

function ShelterTab({ S, onAction }) {
  const hist = useMemo(() => S.history.slice(-12).reverse(), [S.history.length, S.day]);
  return (
    <div className="lsh-sheltertab">
      <h4>Supplies</h4>
      <div className="lsh-inv">
        {["food", "water", "meds", "batteries"].map((k) => (
          <div key={k} className={`lsh-invcell${S.res[k] === 0 ? " is-out" : ""}`}>
            <Icon name={k} size={26} />
            <b>{S.res[k]}</b>
            <span>{{ food: "Food", water: "Water", meds: "Medicine", batteries: "Batteries" }[k]}</span>
          </div>
        ))}
      </div>
      <h4>Equipment</h4>
      <div className="lsh-tools">
        {TOOL_KEYS.map((k) => (
          <div key={k} className={`lsh-tool${S.items[k] ? "" : " is-missing"}`} title={S.items[k] ? TOOL_NAMES[k] : `${TOOL_NAMES[k]} (missing)`}>
            <Icon name={k} size={24} />
            <span>{TOOL_NAMES[k]}</span>
          </div>
        ))}
      </div>
      <div className="lsh-conds">
        <div className={`lsh-bar${S.shelter < 35 ? " is-bad" : S.shelter < 60 ? " is-warn" : ""}`}>
          <Icon name="shelter" size={14} />
          <span className="lsh-bar__lbl">Shelter</span>
          <span className="lsh-bar__track">
            <i className="lsh-bar__fill lsh-bar__fill--hp" style={{ width: `${S.shelter}%` }} />
          </span>
          <b>{Math.round(S.shelter)}%</b>
        </div>
        {S.items.radio ? (
          <div className={`lsh-bar${S.radio <= 0 ? " is-bad" : S.radio < 50 ? " is-warn" : ""}`}>
            <Icon name="radio" size={14} />
            <span className="lsh-bar__lbl">Radio</span>
            <span className="lsh-bar__track">
              <i className="lsh-bar__fill lsh-bar__fill--morale" style={{ width: `${S.radio}%` }} />
            </span>
            <b>{S.radio <= 0 ? "broken" : `${Math.round(S.radio)}%`}</b>
          </div>
        ) : null}
        {S.flags.leak && <p className="lsh-warn">The ceiling leaks: the shelter weakens faster.</p>}
        {S.flags.garden && <p className="lsh-good">Mushroom beds: +1 food every 3 days.</p>}
        {S.flags.collector && <p className="lsh-good">Rain collector: +1 water every 2 days.</p>}
      </div>
      <h4>Today's task (one per day)</h4>
      <div className="lsh-actions">
        {Object.entries(ACTIONS).map(([k, a]) => {
          const st = actionState(S, k);
          return (
            <button key={k} type="button" className={`lsh-action${S.action?.key === k ? " is-done" : ""}`} disabled={st !== true} onClick={() => onAction(k)}>
              <b>{a.label}</b>
              <span>{st === true ? a.note : S.action?.key === k ? "Done today" : st}</span>
            </button>
          );
        })}
      </div>
      {S.action && <p className="lsh-actionres">{S.action.text}</p>}
      {hist.length > 0 && (
        <>
          <h4>Journal so far</h4>
          <ol className="lsh-history">
            {hist.map((h, i) => (
              <li key={i}>
                <span className="lsh-history__day">Day {h.day}</span> <b>{h.title}</b> — {h.choice}. <span className="lsh-muted">{h.result}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
