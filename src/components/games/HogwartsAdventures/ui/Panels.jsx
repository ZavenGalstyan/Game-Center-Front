/**
 * Tabbed panels: Inventory, Spellbook (ranks + upgrades), Character (stats,
 * talents, the party), Journal (quests), Map; plus Snape's shop and the
 * hero switch.
 */
import { useEffect, useRef } from "react";
import { ITEMS, RARITY_COLOR, SHOP, EQUIP_SLOTS } from "../data/items.js";
import { SPELLS, HOTBAR, maxRank } from "../data/spells.js";
import { HEROES, HERO_IDS, TALENTS, xpToNext, LEVEL_CAP } from "../data/heroes.js";
import { QUESTS, QUEST_ORDER } from "../data/quests.js";
import { heroStats } from "../engine/profile.js";
import { drawWorldMap } from "./maps.js";
import { Icon } from "./icons.jsx";

const rar = (it) => RARITY_COLOR[it.rarity || "common"];

export function Inventory({ G, act, onUse, msg }) {
  const P = G.P;
  const S = P.heroes[P.hero];
  const items = Object.entries(P.inv).filter(([, n]) => n > 0);
  const group = (k) => items.filter(([id]) => ITEMS[id]?.kind === k);
  return (
    <div className="hwa-inv">
      <section>
        <h3>Equipped — {HEROES[P.hero].short}</h3>
        <div className="hwa-equip">
          {EQUIP_SLOTS.map((s) => {
            const id = S.equip[s];
            const it = id && ITEMS[id];
            return (
              <div key={s} className="hwa-equip__slot">
                <small>{s}</small>
                {it ? (
                  <span style={{ color: rar(it) }}>
                    <Icon name={it.icon} size={16} /> {it.name}
                  </span>
                ) : (
                  <span className="is-empty">— empty —</span>
                )}
                {it && <em>{it.desc}</em>}
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h3>Potions</h3>
        <div className="hwa-items">
          {group("potion").map(([id, n]) => (
            <button key={id} className="hwa-item" onClick={() => onUse(id)} title={ITEMS[id].desc}>
              <Icon name="potion" size={20} />
              <b style={{ color: ITEMS[id].color }}>{ITEMS[id].name}</b>
              <em>×{n}</em>
              <small>{ITEMS[id].desc} · click to drink</small>
            </button>
          ))}
          {!group("potion").length && <p className="hwa-muted">No potions. Snape sells them once you've finished his lesson.</p>}
        </div>
      </section>
      <section>
        <h3>Equipment</h3>
        <div className="hwa-items">
          {group("equip").map(([id]) => {
            const it = ITEMS[id];
            const on = S.equip[it.slot] === id;
            return (
              <button key={id} className={`hwa-item${on ? " is-on" : ""}`} onClick={() => !on && act("equip", id)}>
                <Icon name={it.icon} size={20} />
                <b style={{ color: rar(it) }}>{it.name}</b>
                <em>{on ? "equipped" : it.slot}</em>
                <small>{it.desc}</small>
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <h3>Treasures</h3>
        <div className="hwa-items">
          {[...group("key"), ...group("collect")].map(([id, n]) => (
            <div key={id} className="hwa-item is-static">
              <Icon name={ITEMS[id].icon} size={20} />
              <b>{ITEMS[id].name}</b>
              <em>{id === "page" ? `${n}/8` : ""}</em>
              <small>{ITEMS[id].desc}</small>
            </div>
          ))}
          <div className="hwa-item is-static">
            <Icon name="coin" size={20} />
            <b>Galleons</b>
            <em>{P.gold}</em>
            <small>Wizarding gold.</small>
          </div>
        </div>
      </section>
      {msg && <div className="hwa-msg">{msg}</div>}
    </div>
  );
}

export function Spellbook({ G, act, msg }) {
  const P = G.P;
  const sp = P.heroes[P.hero].sp;
  const list = [...HOTBAR, "protego"];
  return (
    <div className="hwa-book">
      <p className="hwa-muted">
        Skill points: <b className="hwa-gold">{sp}</b> — earned each level. Spell ranks are shared by the whole party.
      </p>
      <div className="hwa-book__grid">
        {list.map((id) => {
          const S = SPELLS[id];
          const r = P.spells[id] || 0;
          const max = maxRank(id);
          return (
            <div key={id} className={`hwa-spell${r ? "" : " is-locked"}`} style={{ "--c": S.color }}>
              <div className="hwa-spell__h">
                <Icon name={r ? S.icon : "lock"} size={20} />
                <b>{S.name}</b>
                <span className="hwa-spell__rank">{r ? "◆".repeat(r) + "◇".repeat(max - r) : "not learned"}</span>
              </div>
              <p>{S.desc}</p>
              <small>
                {S.cost ? `${S.cost} magic · ` : ""}
                {S.cd}s recovery{id === "protego" ? " · key F" : ""}
              </small>
              {r > 0 && (
                <ul>
                  {S.rankDesc
                    .filter((d) => d !== "—")
                    .map((d, i) => (
                      <li key={i} className={r >= i + 2 ? "is-have" : ""}>
                        Rank {i + 2}: {d}
                      </li>
                    ))}
                </ul>
              )}
              {r > 0 && r < max && (
                <button className="hwa-btn hwa-btn--sm" disabled={sp <= 0} onClick={() => act("spell", id)}>
                  Upgrade (1 point)
                </button>
              )}
            </div>
          );
        })}
      </div>
      {msg && <div className="hwa-msg">{msg}</div>}
    </div>
  );
}

export function Character({ G, act, msg }) {
  const P = G.P;
  const H = HEROES[P.hero];
  const S = P.heroes[P.hero];
  const st = G.stats;
  return (
    <div className="hwa-char">
      <section>
        <h3>
          {H.name} <small>{H.role}</small>
        </h3>
        <div className="hwa-stats">
          <div>
            <span>Level</span>
            <b>{S.level}</b>
          </div>
          <div>
            <span>Experience</span>
            <b>{S.level >= LEVEL_CAP ? "max" : `${S.xp} / ${xpToNext(S.level)}`}</b>
          </div>
          <div>
            <span>Health</span>
            <b>{st.maxHp}</b>
          </div>
          <div>
            <span>Magic</span>
            <b>{st.maxMana}</b>
          </div>
          <div>
            <span>Magic / sec</span>
            <b>{st.regen.toFixed(1)}</b>
          </div>
          <div>
            <span>Spell power</span>
            <b>{Math.round(st.dmgMul * 100)}%</b>
          </div>
          <div>
            <span>Recovery</span>
            <b>{Math.round((1 - st.cdMul) * 100)}% faster</b>
          </div>
          <div>
            <span>Protection</span>
            <b>{Math.round(st.armor * 100)}%</b>
          </div>
        </div>
        <p className="hwa-muted">
          <Icon name="star" size={12} /> <b>{H.passive.name}:</b> {H.passive.desc}
        </p>
      </section>
      <section>
        <h3>
          Talents <small>— {S.sp} point{S.sp === 1 ? "" : "s"} to spend</small>
        </h3>
        <div className="hwa-talents">
          {Object.entries(TALENTS).map(([k, T]) => (
            <div key={k} className="hwa-talent">
              <Icon name={T.icon} size={18} />
              <div>
                <b>{k === "q" ? H.q.name : k === "r" ? H.r.name : T.name}</b>
                <small>{T.desc}</small>
              </div>
              <span className="hwa-spell__rank">{"◆".repeat(S.talents[k])}{"◇".repeat(T.max - S.talents[k])}</span>
              <button className="hwa-btn hwa-btn--sm" disabled={S.sp <= 0 || S.talents[k] >= T.max} onClick={() => act("talent", k)}>
                +
              </button>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>The party</h3>
        <div className="hwa-party">
          {HERO_IDS.map((h) => {
            const s = P.heroes[h];
            const hs = heroStats(P, h);
            return (
              <div key={h} className={`hwa-party__m${h === P.hero ? " is-on" : ""}`}>
                <b>{HEROES[h].short}</b>
                <span>Lv {s.level}</span>
                <small>
                  {hs.maxHp} HP · {hs.maxMana} MP{s.sp ? ` · ${s.sp} pts` : ""}
                </small>
              </div>
            );
          })}
        </div>
        <p className="hwa-muted">Switch heroes by talking to your friends at the courtyard fountain, or at Hagrid's hut and the Great Hall doors.</p>
      </section>
      {msg && <div className="hwa-msg">{msg}</div>}
    </div>
  );
}

export function Journal({ G, onTrack }) {
  const P = G.P;
  const active = QUEST_ORDER.filter((id) => P.quests[id]?.state === "active");
  const done = QUEST_ORDER.filter((id) => P.quests[id]?.state === "done");
  return (
    <div className="hwa-journal">
      <div className="hwa-journal__count">
        {done.length} / {QUEST_ORDER.length} quests complete · {G.count("page")} / 8 Founders' Pages · {P.stats.chests} chests opened
      </div>
      <h3>Active</h3>
      {active.map((id) => {
        const q = QUESTS[id];
        const s = P.quests[id];
        return (
          <div key={id} className={`hwa-quest${P.tracked === id ? " is-tracked" : ""}`}>
            <div className="hwa-quest__h">
              <b>{q.name}</b>
              <button className="hwa-btn hwa-btn--sm" onClick={() => onTrack(id)}>
                {P.tracked === id ? "Tracking" : "Track"}
              </button>
            </div>
            <p>{q.stages[s.stage].text}</p>
            {G.quests.objectives(id).map((o, i) => (
              <div key={i} className={`hwa-track__obj${o.done ? " is-done" : ""}`}>
                <i>{o.done ? "✓" : "◆"}</i> {o.text}
                {o.of > 1 ? ` (${o.n}/${o.of})` : ""}
              </div>
            ))}
          </div>
        );
      })}
      {!active.length && <p className="hwa-muted">Nothing pressing. Explore, collect pages, upgrade your spells.</p>}
      <h3>Completed</h3>
      <div className="hwa-journal__done">
        {done.map((id) => (
          <div key={id}>
            <Icon name="check" size={13} /> {QUESTS[id].name}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorldMapPanel({ G, target }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * (window.devicePixelRatio || 1));
    c.height = Math.round(r.height * (window.devicePixelRatio || 1));
    drawWorldMap(c, G, target);
  });
  return (
    <div className="hwa-map">
      <canvas ref={ref} />
      <div className="hwa-map__legend">
        <span>
          <i style={{ background: "#fff" }} /> You
        </span>
        <span>
          <i style={{ background: "#ffd25a" }} /> Objective
        </span>
        <span>
          <i style={{ background: "#9fd8ff" }} /> People
        </span>
        <span>
          <i style={{ background: "#ffd27a" }} /> Friends
        </span>
      </div>
    </div>
  );
}

export function Shop({ G, act, msg, onClose }) {
  return (
    <div className="hwa-shop">
      <h2 className="hwa-panel__h">Snape's Potion Cabinet</h2>
      <p className="hwa-muted">"Do try not to drop them." — Galleons: {G.P.gold}</p>
      <div className="hwa-items">
        {SHOP.map((id) => (
          <button key={id} className="hwa-item" onClick={() => act("buy", id)} disabled={G.P.gold < ITEMS[id].price}>
            <Icon name="potion" size={20} />
            <b style={{ color: ITEMS[id].color }}>{ITEMS[id].name}</b>
            <em>{ITEMS[id].price} G</em>
            <small>
              {ITEMS[id].desc} · you have {G.count(id)}
            </small>
          </button>
        ))}
      </div>
      {msg && <div className="hwa-msg">{msg}</div>}
      <button className="hwa-btn hwa-btn--primary" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export function HeroSwitch({ G, onPick, onClose }) {
  return (
    <div className="hwa-shop">
      <h2 className="hwa-panel__h">Switch hero</h2>
      <div className="hwa-select__cards">
        {HERO_IDS.map((id) => (
          <button key={id} className={`hwa-hcard hwa-hcard--${HEROES[id].house}${id === G.P.hero ? " is-on" : ""}`} onClick={() => onPick(id)} disabled={id === G.P.hero}>
            <b>{HEROES[id].short}</b>
            <small>{HEROES[id].role}</small>
            <em>Lv {G.P.heroes[id].level}</em>
          </button>
        ))}
      </div>
      <button className="hwa-btn" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
