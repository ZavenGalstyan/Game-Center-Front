/**
 * Dungeon Knight — the menu screens drawn over the 3D backdrop:
 * Main Menu, Dungeon Select, Equipment (+ bag), Knight (stats + upgrades),
 * Statistics.
 */
import { useMemo, useState } from "react";
import { Icon, RoomIcon, SlotIcon } from "./icons.jsx";
import { DUNGEONS, ROOM_LABEL } from "../data/dungeons.js";
import { ENEMIES } from "../data/enemies.js";
import { THEMES } from "../data/themes.js";
import { itemById, RARITIES, BAG_SIZE, itemLines, compareLines, STARTER } from "../data/items.js";
import { computeStats, xpToNext, UPGRADES, upgradeCost, upgradeMax, MAX_LEVEL } from "../engine/progression.js";

const fmtTime = (t) => {
  if (!Number.isFinite(t) || t <= 0) return "—";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

function Head({ kicker, title, onBack, right }) {
  return (
    <header className="dk-head">
      <button type="button" className="dk-iconbtn" onClick={onBack} aria-label="Back">
        <Icon.back size={18} />
      </button>
      <div className="dk-head__titles">
        <small>{kicker}</small>
        <h2>{title}</h2>
      </div>
      {right && <div className="dk-head__right">{right}</div>}
    </header>
  );
}
const Gold = ({ v }) => (
  <span className="dk-goldtag">
    <Icon.coin size={15} /> {v}
  </span>
);

/* ================================================================== main menu */
export function MainMenu({ progress, onContinue, onEnter, onNav }) {
  const run = progress.run;
  const runD = run ? DUNGEONS[run.dungeonId - 1] : null;
  const stats = computeStats(progress);
  const xpK = progress.knightLevel >= MAX_LEVEL ? 1 : progress.xp / xpToNext(progress.knightLevel);
  return (
    <div className="dk-main">
      <div className="dk-main__col">
        <div className="dk-logo">
          <span className="dk-logo__kicker">A dungeon action RPG</span>
          <h1>
            <span>Dungeon</span>
            <span>Knight</span>
          </h1>
          <p className="dk-logo__tag">
            Fight <i /> Loot <i /> Descend
          </p>
        </div>
        {run && runD ? (
          <button type="button" className="dk-btn dk-btn--primary dk-btn--big" onClick={onContinue}>
            <Icon.play size={16} />
            <span className="dk-btn__stack">
              <b>Continue</b>
              <small>
                {runD.name} · Room {run.step + 1}/{runD.steps.length}
              </small>
            </span>
          </button>
        ) : (
          <button type="button" className="dk-btn dk-btn--primary dk-btn--big" onClick={onEnter}>
            <Icon.play size={16} />
            <span className="dk-btn__stack">
              <b>Enter Dungeon</b>
              <small>{DUNGEONS[Math.min(progress.unlockedDungeons, DUNGEONS.length) - 1].name}</small>
            </span>
          </button>
        )}
        <nav className="dk-main__grid" aria-label="Dungeon Knight menu">
          <button type="button" className="dk-btn" onClick={() => onNav("dungeons")}>
            <Icon.map size={17} /> Dungeons
          </button>
          <button type="button" className="dk-btn" onClick={() => onNav("equipment")}>
            <Icon.shield size={17} /> Equipment
          </button>
          <button type="button" className="dk-btn" onClick={() => onNav("knight")}>
            <Icon.knight size={17} /> Knight
          </button>
          <button type="button" className="dk-btn" onClick={() => onNav("stats")}>
            <Icon.stats size={17} /> Statistics
          </button>
          <button type="button" className="dk-btn" onClick={() => onNav("settings")}>
            <Icon.gear size={17} /> Settings
          </button>
          <button type="button" className="dk-btn" onClick={() => onNav("controls")}>
            <Icon.hand size={17} /> Controls
          </button>
        </nav>
        <div className="dk-main__status">
          <div className="dk-chipstat">
            <span className="dk-lvlbadge">LV {progress.knightLevel}</span>
            <span className="dk-xpmini">
              <i style={{ width: `${Math.round(xpK * 100)}%` }} />
            </span>
          </div>
          <div className="dk-chipstat">
            <Icon.heart size={14} /> {stats.maxHp}
          </div>
          <div className="dk-chipstat">
            <Icon.sword size={14} /> {stats.attack}
          </div>
          <Gold v={progress.gold} />
          <div className="dk-chipstat">
            <Icon.crown size={14} /> {progress.completedDungeons.length}/{DUNGEONS.length}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== dungeon select */
export function DungeonSelect({ progress, onEnter, onBack }) {
  const [sel, setSel] = useState(() => {
    const r = progress.run;
    return r ? r.dungeonId : Math.min(progress.unlockedDungeons, DUNGEONS.length);
  });
  const d = DUNGEONS[sel - 1];
  const unlocked = d.id <= progress.unlockedDungeons;
  const done = progress.completedDungeons.includes(d.id);
  const best = progress.best[d.id];
  const run = progress.run;
  const otherRun = run && run.dungeonId !== d.id ? DUNGEONS[run.dungeonId - 1] : null;
  const enemies = useMemo(() => {
    const set = new Set();
    for (const s of d.steps) for (const r of Array.isArray(s) ? s : [s]) for (const e of r.enemies) set.add(typeof e === "string" ? e : e.type);
    set.delete(d.boss);
    return [...set].map((t) => ENEMIES[t].name);
  }, [d]);
  const roomTypes = useMemo(() => {
    const c = {};
    for (const s of d.steps) for (const r of Array.isArray(s) ? s : [s]) c[r.type] = (c[r.type] || 0) + 1;
    return c;
  }, [d]);
  return (
    <div className="dk-screen dk-dungeons">
      <Head kicker="Descend" title="Dungeons" onBack={onBack} right={<span className="dk-head__stat"><Icon.crown size={15} /> {progress.completedDungeons.length}/{DUNGEONS.length}</span>} />
      <div className="dk-gates" role="listbox" aria-label="Dungeons">
        {DUNGEONS.map((x) => {
          const lk = x.id > progress.unlockedDungeons;
          const dn = progress.completedDungeons.includes(x.id);
          const th = THEMES[x.theme];
          return (
            <button
              key={x.id}
              type="button"
              role="option"
              aria-selected={sel === x.id}
              className={`dk-gate${sel === x.id ? " is-sel" : ""}${lk ? " is-locked" : ""}${dn ? " is-done" : ""}`}
              style={{ "--g1": th.wall, "--g2": th.bg, "--acc": th.accent }}
              onClick={() => setSel(x.id)}
            >
              <span className="dk-gate__door">
                <span className="dk-gate__arch" />
                <span className="dk-gate__num">{lk ? <Icon.lock size={18} /> : dn ? <Icon.check size={18} /> : x.id}</span>
              </span>
              <b>{x.name}</b>
              <small>{lk ? "Locked" : dn ? `Cleared · ${fmtTime(progress.best[x.id] && progress.best[x.id].time)}` : `Recommended LV ${x.recommended}`}</small>
              {run && run.dungeonId === x.id && <em className="dk-gate__run">Run in progress</em>}
            </button>
          );
        })}
      </div>
      <div className="dk-ddetail" style={{ "--acc": THEMES[d.theme].accent }}>
        <div className="dk-ddetail__text">
          <small className="dk-ddetail__kicker">Dungeon {d.id} · {THEMES[d.theme].name}</small>
          <h3>{d.name}</h3>
          <p>{d.blurb}</p>
          <div className="dk-ddetail__tags">
            {Object.entries(roomTypes).map(([t, n]) => (
              <span key={t} className="dk-tag">
                <RoomIcon type={t} size={13} /> {n} {ROOM_LABEL[t]}
              </span>
            ))}
          </div>
          <p className="dk-ddetail__enemies">
            <b>Foes:</b> {enemies.join(" · ")} — <b>Boss:</b> {ENEMIES[d.boss].name}
            {progress.bossesDefeated.includes(d.boss) && <span className="dk-tag dk-tag--good"><Icon.check size={12} /> defeated</span>}
          </p>
        </div>
        <div className="dk-ddetail__side">
          <div className="dk-ddetail__best">
            <span>Best time</span>
            <b>{best ? fmtTime(best.time) : "—"}</b>
          </div>
          <div className="dk-ddetail__best">
            <span>Rooms</span>
            <b>{d.steps.length}</b>
          </div>
          {otherRun && unlocked && <p className="dk-warn">Entering abandons your run in {otherRun.name} (progress so far is kept).</p>}
          <button type="button" className="dk-btn dk-btn--primary dk-btn--big" disabled={!unlocked} onClick={() => onEnter(d.id, !!(run && run.dungeonId === d.id))}>
            {unlocked ? <Icon.play size={15} /> : <Icon.lock size={15} />}
            <span>{!unlocked ? `Clear ${DUNGEONS[d.id - 2].name} first` : run && run.dungeonId === d.id ? "Continue run" : done ? "Enter again" : "Enter"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== equipment */
function ItemTile({ id, selected, onClick, equipped }) {
  const it = itemById(id);
  if (!it) return <div className="dk-tile is-empty" />;
  const R = RARITIES[it.rarity];
  return (
    <button type="button" className={`dk-tile${selected ? " is-sel" : ""}${equipped ? " is-eq" : ""}`} style={{ "--rar": R.color }} onClick={onClick} title={it.name}>
      <SlotIcon slot={it.slot} size={22} />
      <small>{it.slot === "weapon" ? it.damage : it.slot === "armor" ? it.defense : `${Math.round(it.block * 100)}%`}</small>
    </button>
  );
}

export function EquipmentScreen({ progress, onEquip, onDiscard, onBack }) {
  const [sel, setSel] = useState(progress.equipped.weapon);
  const it = itemById(sel);
  const isEq = it && progress.equipped[it.slot] === it.id;
  const eq = it ? itemById(progress.equipped[it.slot]) : null;
  const stats = computeStats(progress);
  const bag = progress.inventory;
  const [confirm, setConfirm] = useState(null);
  return (
    <div className="dk-screen dk-equip">
      <Head kicker="The knight's gear" title="Equipment" onBack={onBack} right={<Gold v={progress.gold} />} />
      <div className="dk-equip__body">
        <div className="dk-equip__col">
          <h3>Equipped</h3>
          {["weapon", "armor", "shield"].map((slot) => {
            const e = itemById(progress.equipped[slot]);
            const R = RARITIES[e.rarity];
            return (
              <button key={slot} type="button" className={`dk-slot${sel === e.id ? " is-sel" : ""}`} style={{ "--rar": R.color }} onClick={() => setSel(e.id)}>
                <span className="dk-slot__icon"><SlotIcon slot={slot} size={22} /></span>
                <span className="dk-slot__text">
                  <small>{slot}</small>
                  <b>{e.name}</b>
                  <em style={{ color: R.color }}>{R.name}</em>
                </span>
                <span className="dk-slot__val">{itemLines(e)[0].v}</span>
              </button>
            );
          })}
          <div className="dk-equip__stats">
            <span><Icon.heart size={14} /> {stats.maxHp} HP</span>
            <span><Icon.sword size={14} /> {stats.attack} ATK</span>
            <span><Icon.shield size={14} /> {stats.defense} DEF</span>
          </div>
        </div>
        <div className="dk-equip__col">
          <h3>
            Bag <small>{bag.length}/{BAG_SIZE}</small>
          </h3>
          <div className="dk-bag">
            {Array.from({ length: BAG_SIZE }, (_, i) => (
              <ItemTile key={i} id={bag[i]} selected={bag[i] === sel} onClick={() => bag[i] && setSel(bag[i])} />
            ))}
          </div>
          {it && (
            <div className="dk-idetail" style={{ "--rar": RARITIES[it.rarity].color }}>
              <div className="dk-idetail__head">
                <SlotIcon slot={it.slot} size={20} />
                <div>
                  <b>{it.name}</b>
                  <small style={{ color: RARITIES[it.rarity].color }}>
                    {RARITIES[it.rarity].name} {it.slot}
                    {isEq ? " · equipped" : ""}
                  </small>
                </div>
              </div>
              <ul className="dk-item__stats">
                {itemLines(it).map((l) => (
                  <li key={l.k}>
                    {l.k} <b>{l.v}</b>
                  </li>
                ))}
              </ul>
              {!isEq && eq && (
                <ul className="dk-item__cmp">
                  {compareLines(it, eq).map((c) => (
                    <li key={c.k} className={c.d > 0 ? "is-up" : c.d < 0 ? "is-down" : ""}>
                      {c.d > 0 ? "+" : ""}
                      {c.d}
                      {c.pct ? "%" : ""} {c.k} <small>vs {eq.name}</small>
                    </li>
                  ))}
                </ul>
              )}
              {!isEq && (
                <div className="dk-idetail__actions">
                  <button type="button" className="dk-btn dk-btn--primary" onClick={() => onEquip(it.id)}>
                    <Icon.check size={15} /> Equip
                  </button>
                  {!Object.values(STARTER).includes(it.id) &&
                    (confirm === it.id ? (
                      <button type="button" className="dk-btn dk-btn--danger" onClick={() => { onDiscard(it.id); setConfirm(null); setSel(progress.equipped[it.slot]); }}>
                        <Icon.trash size={15} /> Really discard?
                      </button>
                    ) : (
                      <button type="button" className="dk-btn dk-btn--ghost" onClick={() => setConfirm(it.id)}>
                        <Icon.trash size={15} /> Discard
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== knight */
export function KnightScreen({ progress, onUpgrade, onBack }) {
  const s = computeStats(progress);
  const max = progress.knightLevel >= MAX_LEVEL;
  const need = xpToNext(progress.knightLevel);
  const rows = [
    ["Level", progress.knightLevel, Icon.star],
    ["Health", s.maxHp, Icon.heart],
    ["Stamina", s.maxSt, Icon.bolt],
    ["Attack", s.attack, Icon.sword],
    ["Defense", s.defense, Icon.shield],
    ["Potions", s.potionMax, Icon.potion],
  ];
  return (
    <div className="dk-screen dk-knight">
      <Head kicker="Grow stronger" title="Knight" onBack={onBack} right={<Gold v={progress.gold} />} />
      <div className="dk-knight__body">
        <div className="dk-knight__stats">
          <h3>Stats</h3>
          <div className="dk-xpbar">
            <span>{max ? "Max level" : `XP ${progress.xp} / ${need}`}</span>
            <i style={{ width: `${max ? 100 : Math.round((progress.xp / need) * 100)}%` }} />
          </div>
          <dl className="dk-statlist">
            {rows.map(([k, v, I]) => (
              <div key={k}>
                <dt><I size={15} /> {k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="dk-note">Each level: +6 HP, +3 stamina, +1 attack. Gear and upgrades add the rest.</p>
        </div>
        <div className="dk-knight__ups">
          <h3>Permanent upgrades</h3>
          {UPGRADES.map((u) => {
            const lvl = progress.upgrades[u.id];
            const top = lvl >= upgradeMax(u);
            const cost = upgradeCost(u, lvl);
            const can = !top && progress.gold >= cost;
            return (
              <div key={u.id} className="dk-up">
                <div className="dk-up__text">
                  <b>{u.name}</b>
                  <small>{u.blurb}</small>
                  <span className="dk-pips" aria-label={`level ${lvl} of ${upgradeMax(u)}`}>
                    {Array.from({ length: upgradeMax(u) }, (_, i) => (
                      <i key={i} className={i < lvl ? "is-on" : ""} />
                    ))}
                  </span>
                </div>
                <button type="button" className={`dk-btn${can ? " dk-btn--primary" : ""}`} disabled={!can} onClick={() => onUpgrade(u.id)}>
                  {top ? "Max" : (
                    <>
                      <Icon.coin size={14} /> {cost}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== statistics */
const STAT_GROUPS = [
  ["Dungeons", [["dungeonsEntered", "Dungeons entered"], ["dungeonsCompleted", "Dungeons completed"], ["roomsCleared", "Rooms cleared"], ["deaths", "Deaths"], ["highestLevel", "Highest knight level"], ["playTimeMs", "Total play time", "time"]]],
  ["Foes", [["enemiesDefeated", "Enemies defeated"], ["slimesDefeated", "Slimes defeated"], ["skeletonsDefeated", "Skeletons defeated"], ["elitesDefeated", "Elites defeated"], ["bossesDefeated", "Bosses defeated"]]],
  ["Combat", [["swordAttacks", "Sword attacks"], ["successfulHits", "Successful hits"], ["damageDealt", "Damage dealt"], ["damageTaken", "Damage taken"], ["blocks", "Blocks"], ["damageBlocked", "Damage blocked"], ["dodges", "Dodges"], ["potionsUsed", "Potions used"]]],
  ["Treasure", [["chestsOpened", "Chests opened"], ["goldCollected", "Gold collected"], ["equipmentFound", "Equipment found"], ["rareItemsFound", "Rare items found"], ["epicItemsFound", "Epic items found"]]],
];
export function StatsScreen({ progress, onBack }) {
  const s = progress.statistics;
  const fmt = (v, kind) => {
    if (kind === "time") {
      const m = Math.floor(v / 60000);
      const h = Math.floor(m / 60);
      return h ? `${h}h ${m % 60}m` : `${m}m ${Math.floor((v % 60000) / 1000)}s`;
    }
    return Number(v || 0).toLocaleString();
  };
  return (
    <div className="dk-screen dk-stats">
      <Head kicker="Your legend so far" title="Statistics" onBack={onBack} />
      <div className="dk-stats__grid">
        {STAT_GROUPS.map(([g, rows]) => (
          <section key={g} className="dk-stats__group">
            <h3>{g}</h3>
            <dl>
              {rows.map(([k, label, kind]) => (
                <div key={k}>
                  <dt>{label}</dt>
                  <dd>{fmt(s[k], kind)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
