/**
 * Panels: inventory & equipment, character, skills, journal, world map
 * (fast travel), merchants and the weapon forge.
 */
import { useEffect, useRef, useState } from "react";
import { ITEMS, RARITY, SLOTS, SLOT_NAMES, SHOPS, UPGRADES, UPGRADE_MULT } from "../data/items.js";
import { HEROES, ABILITIES, xpToNext, LEVEL_CAP } from "../data/heroes.js";
import { QUESTS } from "../data/quests.js";
import { LOCATIONS } from "../data/worldmap.js";
import { byUid, itemStats, canEquip, computeStats, skillState, priceBuy, priceSell, upgradeCost } from "../engine/profile.js";
import { countItem } from "../engine/conditions.js";
import { Icon, itemIcon } from "./icons.jsx";
import { drawWorldMap } from "./maps.js";

const STAT_LABEL = { atk: "Attack", armor: "Armour", hp: "Health", st: "Stamina", res: "Resource", crit: "Crit chance", fire: "Fire damage", speed: "Move speed", resistFire: "Fire resistance" };
const fmtStat = (k, v) => (["crit", "fire", "speed", "resistFire"].includes(k) ? `${v > 0 ? "+" : ""}${Math.round(v * 100)}%` : `${v > 0 ? "+" : ""}${Math.round(v)}`);

function ItemTile({ it, onClick, selected, equipped, small }) {
  const d = ITEMS[it.id];
  return (
    <button className={`coa-item coa-r-${d.rarity}${selected ? " is-sel" : ""}${equipped ? " is-eq" : ""}${small ? " coa-item--sm" : ""}`} onClick={onClick} title={d.name}>
      <Icon name={itemIcon(d)} size={small ? 20 : 26} />
      {it.n > 1 && <small>{it.n}</small>}
      {it.up > 0 && <em>+{it.up}</em>}
    </button>
  );
}

function ItemDetail({ P, it, compare }) {
  if (!it) return <div className="coa-detail coa-dim">Select an item.</div>;
  const d = ITEMS[it.id];
  const s = d.slot ? itemStats(it) : {};
  const c = compare ? itemStats(compare) : null;
  return (
    <div className="coa-detail">
      <div className={`coa-detail__name coa-t-${d.rarity}`}>
        {d.name}
        {it.up ? ` +${it.up}` : ""}
      </div>
      <div className="coa-detail__type">
        {RARITY[d.rarity].name} {d.slot ? SLOT_NAMES[d.slot] : d.type === "potion" ? "Potion" : d.type === "quest" ? "Quest item" : "Material"}
        {d.for ? ` · ${HEROES[d.for].name}` : ""}
      </div>
      {d.for && d.for !== P.hero && <div className="coa-detail__warn">Your class can't use this.</div>}
      <ul className="coa-detail__stats">
        {Object.entries(s).map(([k, v]) => {
          const diff = c ? v - (c[k] || 0) : 0;
          return (
            <li key={k}>
              {STAT_LABEL[k] || k} <b>{fmtStat(k, v)}</b>
              {c && diff !== 0 && <i className={diff > 0 ? "is-up" : "is-down"}>{diff > 0 ? "▲" : "▼"} {fmtStat(k, Math.abs(diff)).replace("+", "")}</i>}
            </li>
          );
        })}
        {c &&
          Object.entries(c)
            .filter(([k]) => s[k] == null)
            .map(([k, v]) => (
              <li key={k} className="is-lose">
                {STAT_LABEL[k] || k} <i className="is-down">▼ {fmtStat(k, v).replace("+", "")}</i>
              </li>
            ))}
        {d.effect && <li className="coa-detail__fx">On hit: {d.effect === "burn" ? "sets foes ablaze" : d.effect === "frost" ? "chills and slows" : "opens bleeding wounds"}</li>}
        {d.heal && <li>Restores {Math.round(d.heal * 100)}% health</li>}
        {d.restore && <li>Restores {Math.round(d.restore * 100)}% stamina and resource</li>}
      </ul>
      <p className="coa-detail__desc">{d.desc}</p>
      <div className="coa-detail__value">
        <Icon name="coin" size={12} /> {d.value ? Math.round(d.value * (1 + (it.up || 0) * 0.25)) : "—"}
      </div>
    </div>
  );
}

export function Inventory({ G, act, onUse, msg }) {
  const P = G.P;
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState("all");
  const it = sel != null ? byUid(P, sel) : null;
  const d = it && ITEMS[it.id];
  const equippedUids = new Set(Object.values(P.equip));
  const cur = d?.slot ? byUid(P, P.equip[d.slot]) : null;
  const bag = P.inv.filter((x) => !equippedUids.has(x.uid)).filter((x) => filter === "all" || (filter === "gear" ? ITEMS[x.id].slot : filter === "use" ? ITEMS[x.id].type === "potion" : ["quest", "material"].includes(ITEMS[x.id].type)));
  const S = computeStats(P);
  return (
    <div className="coa-inv">
      <div className="coa-inv__doll">
        <h3>Equipment</h3>
        {SLOTS.map((slot) => {
          const e = byUid(P, P.equip[slot]);
          return (
            <div key={slot} className="coa-slot">
              <span>{SLOT_NAMES[slot]}</span>
              {e ? <ItemTile it={e} selected={sel === e.uid} equipped onClick={() => setSel(e.uid)} small /> : <div className="coa-item coa-item--sm coa-item--empty" />}
              <em className={e ? `coa-t-${ITEMS[e.id].rarity}` : "coa-dim"}>{e ? ITEMS[e.id].name + (e.up ? ` +${e.up}` : "") : "—"}</em>
            </div>
          );
        })}
        <div className="coa-inv__sum">
          <span>Attack {S.atk}</span>
          <span>Armour {S.armor}</span>
          <span>Health {S.maxHp}</span>
          <span>Crit {Math.round(S.crit * 100)}%</span>
        </div>
      </div>
      <div className="coa-inv__bag">
        <div className="coa-inv__filters">
          {[
            ["all", "All"],
            ["gear", "Gear"],
            ["use", "Potions"],
            ["misc", "Quest & materials"],
          ].map(([k, l]) => (
            <button key={k} className={`coa-chip${filter === k ? " is-on" : ""}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
          <span className="coa-gold">
            <Icon name="coin" size={13} /> {P.gold}
          </span>
        </div>
        <div className="coa-grid">
          {bag.map((x) => (
            <ItemTile key={x.uid} it={x} selected={sel === x.uid} onClick={() => setSel(x.uid)} />
          ))}
          {Array.from({ length: Math.max(0, 30 - bag.length) }).map((_, i) => (
            <div key={`e${i}`} className="coa-item coa-item--empty" />
          ))}
        </div>
      </div>
      <div className="coa-inv__side">
        <ItemDetail P={P} it={it} compare={cur && cur.uid !== it?.uid ? cur : null} />
        {it && (
          <div className="coa-inv__actions">
            {d.slot && !equippedUids.has(it.uid) && canEquip(P, it) && (
              <button className="coa-btn coa-btn--primary" onClick={() => act("equip", it.uid)}>
                Equip
              </button>
            )}
            {d.slot && equippedUids.has(it.uid) && d.slot !== "weapon" && (
              <button className="coa-btn" onClick={() => act("unequip", d.slot)}>
                Unequip
              </button>
            )}
            {d.type === "potion" && (
              <button className="coa-btn coa-btn--primary" onClick={() => onUse(it.uid)}>
                Drink
              </button>
            )}
          </div>
        )}
        {msg && <div className="coa-msg">{msg}</div>}
      </div>
    </div>
  );
}

export function Character({ G }) {
  const P = G.P;
  const H = HEROES[P.hero];
  const S = computeStats(P);
  const rep = (f) => P.rep[f] || 0;
  const repWord = (v) => (v >= 40 ? "Honoured" : v >= 15 ? "Friendly" : v > -15 ? "Neutral" : v > -40 ? "Wary" : "Hostile");
  return (
    <div className="coa-char">
      <div>
        <h3>
          {H.name} · Level {P.level}
        </h3>
        <div className="coa-xp coa-xp--big">
          <b style={{ width: `${P.level >= LEVEL_CAP ? 100 : (P.xp / xpToNext(P.level)) * 100}%` }} />
          <span>{P.level >= LEVEL_CAP ? "Max level" : `${P.xp} / ${xpToNext(P.level)} XP`}</span>
        </div>
        <table className="coa-stats">
          <tbody>
            {[
              ["Health", S.maxHp],
              ["Stamina", S.maxSt],
              [H.resource.name, S.maxRes],
              ["Attack", S.atk],
              ["Armour", `${S.armor} (−${Math.round((1 - 100 / (100 + S.armor)) * 100)}% damage)`],
              ["Critical chance", `${Math.round(S.crit * 100)}%`],
              ["Critical damage", `×${S.critMult.toFixed(2)}`],
              ["Move speed", `${Math.round(S.speed * 100)}%`],
              ["Fire damage", `+${Math.round(S.fire * 100)}%`],
              ["Fire resistance", `${Math.round(S.resistFire * 100)}%`],
            ].map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3>Reputation</h3>
        {[
          ["wardens", "Northern Wardens", "#6a8ac8"],
          ["ember", "Ember Court", "#d8583a"],
          ["marches", "Free Marches", "#7ab060"],
        ].map(([k, n, c]) => (
          <div key={k} className="coa-rep">
            <span>{n}</span>
            <div className="coa-rep__bar">
              <i style={{ left: "50%" }} />
              <b style={{ left: rep(k) >= 0 ? "50%" : `${50 + rep(k) / 2}%`, width: `${Math.abs(rep(k)) / 2}%`, background: c }} />
            </div>
            <em>
              {repWord(rep(k))} ({rep(k) > 0 ? "+" : ""}
              {rep(k)})
            </em>
          </div>
        ))}
        <h3>Chronicle</h3>
        <table className="coa-stats">
          <tbody>
            <tr>
              <td>Day</td>
              <td>{P.day}</td>
            </tr>
            <tr>
              <td>Foes defeated</td>
              <td>{P.stats.kills}</td>
            </tr>
            <tr>
              <td>Quests completed</td>
              <td>{P.stats.quests}</td>
            </tr>
            <tr>
              <td>Places discovered</td>
              <td>
                {Object.keys(P.discovered).length} / {LOCATIONS.length}
              </td>
            </tr>
            <tr>
              <td>Falls</td>
              <td>{P.stats.deaths}</td>
            </tr>
            <tr>
              <td>Companion</td>
              <td>{P.companion ? (P.companion === "wren" ? "Wren" : "Garrick") : "—"}</td>
            </tr>
          </tbody>
        </table>
        {Object.keys(P.flags).some((k) => ["garrickFate", "crownChoice", "dragonFate"].includes(k)) && (
          <>
            <h3>Choices</h3>
            <ul className="coa-choices">
              {P.flags.garrickFate && <li>Garrick Fenn: {{ spared: "spared, sworn to the Marches", executed: "executed", exiled: "exiled" }[P.flags.garrickFate]}</li>}
              {P.flags.crownChoice && <li>The Heartstone: pledged to the {{ wardens: "Northern Wardens", ember: "Ember Court", marches: "Free Marches" }[P.flags.crownChoice]}</li>}
              {P.flags.dragonFate && <li>Vaelith: {P.flags.dragonFate}</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export function Skills({ G, act, msg }) {
  const P = G.P;
  const H = HEROES[P.hero];
  const branches = [...new Set(H.tree.map((n) => n.branch))];
  return (
    <div className="coa-skills">
      <div className="coa-skills__head">
        <span>
          <Icon name="skill" size={14} /> Skill points: <b>{P.sp}</b>
        </span>
        <span className="coa-dim">One point per level. Each tier needs the skill above it and a higher level.</span>
      </div>
      <div className="coa-skills__cols">
        {branches.map((b) => (
          <div key={b} className="coa-branch">
            <h4>{b}</h4>
            {H.tree
              .filter((n) => n.branch === b)
              .sort((a, c) => a.tier - c.tier)
              .map((n) => {
                const s = skillState(P, n);
                return (
                  <button key={n.id} className={`coa-node${s.rank ? " is-has" : ""}${s.canLearn ? " is-can" : ""}${!s.reqOk || !s.levelOk ? " is-locked" : ""}${n.unlocks ? " is-abil" : ""}`} onClick={() => act("learn", n.id)}>
                    <div className="coa-node__top">
                      <b>{n.name}</b>
                      <span>
                        {s.rank}/{n.ranks}
                      </span>
                    </div>
                    <p>{n.desc}</p>
                    {!s.levelOk && <small>Requires level {(n.tier - 1) * 2 + 1}</small>}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      <div className="coa-skills__abil">
        {["q", "r", "f"].map((k) => {
          const A = ABILITIES[H.abilities[k]];
          return (
            <div key={k}>
              <Icon name={A.icon} size={20} /> <kbd>{A.key}</kbd> <b>{A.name}</b> — {A.desc} <span className="coa-dim">({A.cost} {H.resource.name}, {A.cd}s)</span>
            </div>
          );
        })}
      </div>
      {msg && <div className="coa-msg">{msg}</div>}
    </div>
  );
}

export function Journal({ G, onTrack }) {
  const P = G.P;
  const active = G.quests.active();
  const done = Object.entries(P.quests)
    .filter(([, q]) => q.state === "done")
    .map(([id]) => id);
  const [sel, setSel] = useState(P.tracked || active[0] || done[0] || null);
  const q = sel && QUESTS[sel];
  const st = sel && P.quests[sel];
  return (
    <div className="coa-journal">
      <div className="coa-journal__list">
        <h4>Active</h4>
        {active.length === 0 && <p className="coa-dim">No active quests.</p>}
        {active.map((id) => (
          <button key={id} className={`coa-jq${sel === id ? " is-on" : ""}${P.tracked === id ? " is-tracked" : ""}`} onClick={() => setSel(id)}>
            <Icon name={QUESTS[id].kind === "main" ? "crown" : "scroll"} size={14} /> {QUESTS[id].name}
          </button>
        ))}
        {done.length > 0 && <h4>Completed</h4>}
        {done.map((id) => (
          <button key={id} className={`coa-jq is-done${sel === id ? " is-on" : ""}`} onClick={() => setSel(id)}>
            <Icon name="check" size={14} /> {QUESTS[id].name}
          </button>
        ))}
      </div>
      <div className="coa-journal__page">
        {q ? (
          <>
            <h3>{q.name}</h3>
            <div className="coa-dim">{q.kind === "main" ? "Main quest" : "Side quest"}</div>
            <p className="coa-journal__sum">{q.summary}</p>
            {st.state === "active" && <p className="coa-journal__stage">{q.stages[st.stage].text}</p>}
            {st.state === "active" && (
              <ul className="coa-journal__obj">
                {G.quests.objectives(sel).map((o) => (
                  <li key={o.id} className={o.done ? "is-done" : ""}>
                    {o.done ? "✓" : "◇"} {o.text}
                    {o.of ? ` (${o.n}/${o.of})` : ""}
                    {o.optional ? " — optional" : ""}
                  </li>
                ))}
              </ul>
            )}
            {st.state === "done" && <p className="coa-journal__stage">Completed.</p>}
            {q.rewards && (
              <div className="coa-journal__rew">
                Rewards: {q.rewards.xp ? `${q.rewards.xp} XP` : ""}
                {q.rewards.gold ? ` · ${q.rewards.gold} gold` : ""}
                {q.rewards.items ? ` · ${q.rewards.items.map(([i, n]) => `${ITEMS[i].name}${n > 1 ? ` ×${n}` : ""}`).join(", ")}` : ""}
              </div>
            )}
            {st.state === "active" && (
              <button className="coa-btn" onClick={() => onTrack(sel)}>
                {P.tracked === sel ? "Tracked ✓" : "Track this quest"}
              </button>
            )}
          </>
        ) : (
          <p className="coa-dim">Your journal is empty.</p>
        )}
      </div>
    </div>
  );
}

export function WorldMap({ G, onTravel, msg }) {
  const cv = useRef(null);
  const [view, setView] = useState(() => ({ zoom: 1, cx: G.player.interior ? 0 : G.player.x * 0.3, cz: G.player.interior ? 0 : G.player.z * 0.3 }));
  const drag = useRef(null);
  const P = G.P;
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width);
    c.height = Math.round(r.height);
    drawWorldMap(c, G, view);
  });
  const safe = LOCATIONS.filter((l) => l.safe);
  return (
    <div className="coa-map">
      <canvas
        ref={cv}
        className="coa-map__canvas"
        onWheel={(e) => setView((v) => ({ ...v, zoom: Math.max(1, Math.min(4, v.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2))) }))}
        onPointerDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz })}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const k = (1024 / Math.min(cv.current.width, cv.current.height)) / view.zoom;
          setView((v) => ({ ...v, cx: drag.current.cx - (e.clientX - drag.current.x) * k, cz: drag.current.cz - (e.clientY - drag.current.y) * k }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      />
      <div className="coa-map__side">
        <h4>Fast travel</h4>
        <p className="coa-dim">Travel between safe camps you have discovered. Not while enemies hunt you.</p>
        {safe.map((l) => (
          <button key={l.id} className="coa-btn coa-btn--sm" disabled={!P.discovered[l.id]} onClick={() => onTravel(l.id)}>
            {P.discovered[l.id] ? l.name : "Undiscovered"}
          </button>
        ))}
        <div className="coa-map__zoom">
          <button className="coa-chip" onClick={() => setView((v) => ({ ...v, zoom: Math.min(4, v.zoom * 1.4) }))}>
            +
          </button>
          <button className="coa-chip" onClick={() => setView((v) => ({ ...v, zoom: Math.max(1, v.zoom / 1.4) }))}>
            −
          </button>
          <button className="coa-chip" onClick={() => setView({ zoom: 1, cx: 0, cz: 0 })}>
            Reset
          </button>
        </div>
        <div className="coa-map__legend">
          <span>◆ objective</span>
          <span>▲ safe camp</span>
          <span>✦ secret</span>
        </div>
        {msg && <div className="coa-msg">{msg}</div>}
      </div>
    </div>
  );
}

export function Shop({ G, shopId, act, msg, onClose }) {
  const P = G.P;
  const S = SHOPS[shopId];
  const [tab, setTab] = useState("buy");
  const [sel, setSel] = useState(null);
  const equipped = new Set(Object.values(P.equip));
  const sellable = P.inv.filter((x) => ITEMS[x.id].type !== "quest" && !equipped.has(x.uid));
  const stock = [...new Set(S.stock)];
  return (
    <div className="coa-shop">
      <div className="coa-shop__head">
        <h3>{S.name}</h3>
        <span className="coa-gold">
          <Icon name="coin" size={14} /> {P.gold}
        </span>
        <button className={`coa-chip${tab === "buy" ? " is-on" : ""}`} onClick={() => setTab("buy")}>
          Buy
        </button>
        <button className={`coa-chip${tab === "sell" ? " is-on" : ""}`} onClick={() => setTab("sell")}>
          Sell
        </button>
        <span className="coa-tabs__sp" />
        <button className="coa-x" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="coa-shop__body">
        <div className="coa-shop__list">
          {tab === "buy"
            ? stock.map((id) => {
                const d = ITEMS[id];
                const price = priceBuy(shopId, id);
                const wrong = d.for && d.for !== P.hero;
                return (
                  <div key={id} className={`coa-row${sel === id ? " is-sel" : ""}${wrong ? " is-dim" : ""}`} onClick={() => setSel(id)}>
                    <Icon name={itemIcon(d)} size={18} />
                    <span className={`coa-t-${d.rarity}`}>{d.name}</span>
                    {wrong && <small className="coa-dim">({HEROES[d.for].name})</small>}
                    <b>
                      <Icon name="coin" size={11} /> {price}
                    </b>
                    <button className="coa-btn coa-btn--sm" disabled={P.gold < price} onClick={(e) => (e.stopPropagation(), act("buy", shopId, id))}>
                      Buy
                    </button>
                  </div>
                );
              })
            : sellable.map((it) => {
                const d = ITEMS[it.id];
                return (
                  <div key={it.uid} className={`coa-row${sel === it.uid ? " is-sel" : ""}`} onClick={() => setSel(it.uid)}>
                    <Icon name={itemIcon(d)} size={18} />
                    <span className={`coa-t-${d.rarity}`}>
                      {d.name}
                      {it.n > 1 ? ` ×${it.n}` : ""}
                      {it.up ? ` +${it.up}` : ""}
                    </span>
                    <b>
                      <Icon name="coin" size={11} /> {priceSell(shopId, it)}
                    </b>
                    <button className="coa-btn coa-btn--sm" onClick={(e) => (e.stopPropagation(), act("sell", shopId, it.uid))}>
                      Sell
                    </button>
                  </div>
                );
              })}
          {tab === "sell" && sellable.length === 0 && <p className="coa-dim">Nothing to sell (equipped and quest items are kept).</p>}
        </div>
        <div className="coa-shop__detail">
          {tab === "buy" && sel && ITEMS[sel] ? (
            <ItemDetail P={P} it={{ id: sel, n: 1, up: 0 }} compare={ITEMS[sel].slot ? byUid(P, P.equip[ITEMS[sel].slot]) : null} />
          ) : tab === "sell" && sel && byUid(P, sel) ? (
            <ItemDetail P={P} it={byUid(P, sel)} />
          ) : (
            <p className="coa-dim">Select an item to inspect it.</p>
          )}
          {msg && <div className="coa-msg">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

export function Forge({ G, shopId, act, msg, onClose }) {
  const P = G.P;
  const w = byUid(P, P.equip.weapon);
  const d = w && ITEMS[w.id];
  const c = w ? upgradeCost(w) : null;
  const iron = countItem(P, "m_iron");
  const ember = countItem(P, "m_ember");
  return (
    <div className="coa-forge">
      <div className="coa-shop__head">
        <h3>{SHOPS[shopId]?.name || "Forge"} — Weapon upgrades</h3>
        <span className="coa-tabs__sp" />
        <button className="coa-x" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
      {w ? (
        <div className="coa-forge__body">
          <div className="coa-forge__item">
            <Icon name={itemIcon(d)} size={48} />
            <div>
              <div className={`coa-t-${d.rarity}`}>
                {d.name} {w.up ? `+${w.up}` : ""}
              </div>
              <div>
                Attack {itemStats(w).atk}
                {c ? ` → ${Math.round(d.stats.atk * (1 + (w.up + 1) * UPGRADE_MULT))}` : ""}
              </div>
            </div>
          </div>
          <div className="coa-forge__track">
            {UPGRADES.slice(1).map((_, i) => (
              <span key={i} className={i < (w.up || 0) ? "is-done" : ""}>
                +{i + 1}
              </span>
            ))}
          </div>
          {c ? (
            <div className="coa-forge__cost">
              <span className={P.gold >= c.gold ? "" : "is-short"}>
                <Icon name="coin" size={13} /> {c.gold} gold
              </span>
              <span className={iron >= c.iron ? "" : "is-short"}>
                <Icon name="ore" size={13} /> {c.iron} Iron Scrap ({iron})
              </span>
              {c.ember > 0 && (
                <span className={ember >= c.ember ? "" : "is-short"}>
                  <Icon name="gem" size={13} /> {c.ember} Ember Shard ({ember})
                </span>
              )}
              <button className="coa-btn coa-btn--primary" onClick={() => act("upgrade", w.uid)}>
                Upgrade to +{(w.up || 0) + 1}
              </button>
            </div>
          ) : (
            <p>This weapon is already at its finest.</p>
          )}
          {msg && <div className="coa-msg">{msg}</div>}
        </div>
      ) : (
        <p className="coa-dim">Equip a weapon first.</p>
      )}
    </div>
  );
}
