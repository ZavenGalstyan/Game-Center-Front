/**
 * Tab panels: Inventory (with comparison), Character, Skill Tree, Cyberware.
 * All mutations go through engine/profile.js (validated); the shell passes
 * `act(fn)` which runs fn(profile), refreshes derived stats and re-renders.
 */
import { useMemo, useState } from "react";
import { WEAPONS, RARITY_COLOR, RARITY_LABEL, MAX_UPGRADE } from "../data/weapons.js";
import { ARMOR, STACKS } from "../data/items.js";
import { CYBERWARE, CYBER_SLOTS } from "../data/cyberware.js";
import { SKILLS, BRANCHES, xpToNext, LEVEL_CAP } from "../data/skills.js";
import { derive, attributes, weaponStats, weaponByUid, armorByUid, equipWeapon, unequipWeapon, equipArmor, unequipArmor, equipCyber, unequipCyber, learnSkill, canLearn, sortedInventory, isEquipped } from "../engine/profile.js";

/* ------------------------------------------------------------ icons */
const PATHS = {
  pistol: "M3 9h13l1 2h3v3h-6l-1 1h-3l-1 4H5l1-4H3z",
  heavyPistol: "M2 8h16l1 2h3v4h-7l-1 1h-3l-1 5H6l1-5H2z",
  smg: "M2 9h17l2 2v2h-5v5h-3v-5H9l-1 3H5l1-3H2z",
  shotgun: "M1 10h20v3H11l-1 2H7l-1 3H3l1-3H1z",
  ar: "M1 9h18l2 2h2v2h-8v4h-2v-4H9l-1 4H5l1-4H1z",
  energy: "M2 8h17l3 3v3h-9l-1 4h-3l1-4H8l-1 2H4l1-2H2z M6 10h10v1H6z",
  blade: "M3 21l2-2 13-15 3-1-1 3L5 19l-2 2z",
  body: "M7 3l5 2 5-2 3 4-2 3v11H6V10L4 7z",
  head: "M5 12a7 7 0 0114 0v5H5z M7 12h10v2H7z",
  chip: "M7 7h10v10H7z M9 3v4M12 3v4M15 3v4M9 17v4M12 17v4M15 17v4M3 9h4M3 12h4M3 15h4M17 9h4M17 12h4M17 15h4",
  medkit: "M4 7h16v12H4z M10 10h4v2h2v4h-2v2h-4v-2H8v-4h2z",
  stim: "M10 3h4v4l3 3v11H7V10l3-3z",
  battery: "M8 4h8v2h2v15H6V6h2z M10 9h4v8h-4z",
  trauma: "M4 6h16v13H4z M11 8h2v4h4v2h-4v4h-2v-4H7v-2h4z",
  material: "M12 2l9 5v10l-9 5-9-5V7z",
  quest: "M12 2l8 10-8 10-8-10z",
};
export function Icon({ kind, color = "currentColor", size = 28 }) {
  const d = PATHS[kind] || PATHS.material;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={d} fill={kind === "chip" ? "none" : color} stroke={color} strokeWidth={kind === "chip" ? 1.6 : 0.4} strokeLinejoin="round" />
    </svg>
  );
}
const stackIcon = (id) => (STACKS[id]?.cat === "quest" ? "quest" : STACKS[id]?.cat === "material" ? "material" : id === "battery" ? "battery" : id === "stim" ? "stim" : id === "trauma" ? "trauma" : "medkit");
export function itemIcon(it) {
  if (it.kind === "weapon") return WEAPONS[it.ref.id].base ? WEAPONS[WEAPONS[it.ref.id].base].type : WEAPONS[it.ref.id].type;
  if (it.kind === "armor") return ARMOR[it.ref.id].slot === "head" ? "head" : "body";
  if (it.kind === "cyber") return "chip";
  return stackIcon(it.id);
}

/* ------------------------------------------------------------ stat rows */
function weaponRows(w, D) {
  const s = weaponStats(w, D);
  if (s.melee)
    return [
      ["Damage", s.dmg.toFixed(0)],
      ["Attacks / min", s.rpm.toFixed(0)],
      ["Reach", `${s.reach} m`],
    ];
  return [
    ["Damage", s.pellets > 1 ? `${s.dmg.toFixed(0)} ×${s.pellets}` : s.dmg.toFixed(0)],
    ["Fire rate", `${s.rpm.toFixed(0)} rpm`],
    ["Magazine", s.mag],
    ["Reload", `${s.reload.toFixed(2)} s`],
    ["Accuracy", `${Math.max(0, 100 - (s.spread * 180) / Math.PI * 9).toFixed(0)}`],
    ["Range", `${s.range} m`],
    ["Recoil", s.recoil.toFixed(1)],
    ["Crit chance", `${Math.round(s.crit * 100)}%`],
  ];
}
const num = (v) => parseFloat(String(v).replace(/[^\d.-]/g, "")) || 0;
const LOWER_BETTER = new Set(["Reload", "Recoil"]);

function Compare({ rows, base }) {
  return (
    <table className="nm-stats">
      <tbody>
        {rows.map(([k, v], i) => {
          const b = base?.[i]?.[1];
          let diff = null;
          if (b != null && b !== v) {
            const d = num(v) - num(b);
            if (Math.abs(d) > 0.005) {
              const good = LOWER_BETTER.has(k) ? d < 0 : d > 0;
              diff = <em className={good ? "nm-up" : "nm-down"}>{d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}</em>;
            }
          }
          return (
            <tr key={k}>
              <th>{k}</th>
              <td>
                {v} {diff}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------ inventory */
const CATS = [
  ["weapons", "Weapons"],
  ["armor", "Armor"],
  ["cyberware", "Cyberware"],
  ["consumable", "Consumables"],
  ["quest", "Quest"],
  ["material", "Materials"],
];
export function Inventory({ P, act, onUse, msg }) {
  const [cat, setCat] = useState("weapons");
  const [sort, setSort] = useState("rarity");
  const [sel, setSel] = useState(null);
  const D = derive(P);
  const list = sortedInventory(P, cat, sort);
  const selected = sel && list.find((x) => (x.uid != null ? x.uid === sel : x.id === sel));
  const detail = selected ? itemDetail(P, D, selected) : null;
  return (
    <div className="nm-inv">
      <div className="nm-inv__left">
        <div className="nm-chips">
          {CATS.map(([k, l]) => (
            <button key={k} className={cat === k ? "on" : ""} onClick={() => (setCat(k), setSel(null))}>
              {l}
            </button>
          ))}
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="rarity">Sort: rarity</option>
            <option value="name">Sort: name</option>
            <option value="value">Sort: value</option>
            <option value="type">Sort: type</option>
          </select>
        </div>
        <div className="nm-grid">
          {list.length === 0 && <div className="nm-dim nm-empty">Nothing here yet.</div>}
          {list.map((it) => {
            const key = it.uid ?? it.id;
            const eq = it.uid != null ? isEquipped(P, it.uid) : it.kind === "cyber" && Object.values(P.cyber.equipped).includes(it.id);
            return (
              <button key={key} className={`nm-item${sel === key ? " nm-item--sel" : ""}`} style={{ "--c": RARITY_COLOR[it.rarity] }} onClick={() => setSel(key)}>
                <Icon kind={itemIcon(it)} color={RARITY_COLOR[it.rarity]} />
                <span className="nm-item__name">{it.name}</span>
                {it.qty > 1 && <span className="nm-item__qty">×{it.qty}</span>}
                {it.ref?.level > 0 && <span className="nm-item__lv">Mk{it.ref.level + 1}</span>}
                {eq && <span className="nm-item__eq">E</span>}
              </button>
            );
          })}
        </div>
        <div className="nm-ammo">
          <b>Ammo</b>
          <span>Pistol ∞</span>
          <span>Light {P.ammo.light}</span>
          <span>Heavy {P.ammo.heavy}</span>
          <span>Shells {P.ammo.shell}</span>
          <span>Rifle {P.ammo.rifle}</span>
          <span>Cells {P.ammo.cell}</span>
        </div>
      </div>
      <div className="nm-inv__right">
        <Equipment P={P} />
        {detail ? (
          <div className="nm-detail" style={{ "--c": RARITY_COLOR[detail.rarity] }}>
            <div className="nm-detail__head">
              <Icon kind={detail.icon} color={RARITY_COLOR[detail.rarity]} size={40} />
              <div>
                <h3>{detail.name}</h3>
                <span className="nm-rarity">{RARITY_LABEL[detail.rarity]}</span>
                {detail.sub && <span className="nm-dim"> · {detail.sub}</span>}
              </div>
            </div>
            <p className="nm-detail__desc">{detail.desc}</p>
            {detail.rows && <Compare rows={detail.rows} base={detail.base} />}
            {detail.base && <div className="nm-dim nm-small">▲▼ compared with your equipped {detail.baseName}</div>}
            <div className="nm-row">
              {detail.actions.map(([label, fn, dis]) => (
                <button key={label} className="nm-btn nm-btn--sm" disabled={dis} onClick={() => act(fn)}>
                  {label}
                </button>
              ))}
              {detail.use && (
                <button className="nm-btn nm-btn--sm nm-btn--primary" onClick={() => onUse(detail.use)}>
                  Use
                </button>
              )}
            </div>
            {msg && <div className="nm-msg">{msg}</div>}
          </div>
        ) : (
          <div className="nm-detail nm-detail--empty nm-dim">Select an item to see its details.</div>
        )}
      </div>
    </div>
  );
}

function itemDetail(P, D, it) {
  if (it.kind === "weapon") {
    const w = it.ref;
    const def = WEAPONS[w.id];
    const slotEq = def.melee ? ["melee"] : ["w1", "w2"];
    const cur = weaponByUid(P, P.equip[def.melee ? "melee" : P.equip.w1 === w.uid ? "w2" : "w1"]);
    const actions = [];
    if (def.melee) actions.push(isEquipped(P, w.uid) ? ["Unequip", (p) => unequipWeapon(p, "melee")] : ["Equip", (p) => equipWeapon(p, w.uid, "melee")]);
    else {
      actions.push(["Equip slot 1", (p) => equipWeapon(p, w.uid, "w1"), P.equip.w1 === w.uid]);
      actions.push(["Equip slot 2", (p) => equipWeapon(p, w.uid, "w2"), P.equip.w2 === w.uid]);
      if (P.equip.w2 === w.uid) actions.push(["Unequip", (p) => unequipWeapon(p, "w2")]);
    }
    void slotEq;
    return { name: def.name, rarity: w.rarity, icon: itemIcon(it), desc: def.desc, sub: `Upgrade Mk${w.level + 1}/${MAX_UPGRADE + 1}${def.ammo && def.ammo !== "pistol" ? ` · ${def.ammo} ammo` : ""}`, rows: weaponRows(w, D), base: cur && cur.uid !== w.uid ? weaponRows(cur, D) : null, baseName: cur ? WEAPONS[cur.id].name : "", actions };
  }
  if (it.kind === "armor") {
    const a = it.ref;
    const def = ARMOR[a.id];
    const cur = armorByUid(P, P.equip[def.slot]);
    const rows = (x) => [["Armor", x.armor], ...Object.entries(x.bonus || {}).map(([k, v]) => [{ dr: "Damage reduction", hp: "Health", stamina: "Stamina", energy: "Cyber energy", crit: "Crit chance", accuracy: "Accuracy" }[k] || k, v < 1 ? `${Math.round(v * 100)}%` : v])];
    const eq = P.equip[def.slot] === a.uid;
    return { name: def.name, rarity: def.rarity, icon: itemIcon(it), desc: def.desc, sub: def.slot === "head" ? "Head" : "Body", rows: rows(def), base: cur && cur.uid !== a.uid ? rows(ARMOR[cur.id]) : null, baseName: cur ? ARMOR[cur.id].name : "", actions: [eq ? ["Unequip", (p) => unequipArmor(p, def.slot)] : ["Equip", (p) => equipArmor(p, a.uid)]] };
  }
  if (it.kind === "cyber") {
    const c = CYBERWARE[it.id];
    const eq = P.cyber.equipped[c.slot] === it.id;
    return { name: c.name, rarity: c.rarity, icon: "chip", desc: c.desc, sub: `${CYBER_SLOTS.find((s) => s.id === c.slot).name}${c.active ? ` · ${c.energy} energy · ${c.cd} s cooldown` : " · passive"}`, actions: [eq ? ["Disable", (p) => unequipCyber(p, c.slot)] : ["Install in slot", (p) => equipCyber(p, it.id)]] };
  }
  const s = STACKS[it.id];
  return { name: s.name, rarity: s.rarity, icon: stackIcon(it.id), desc: s.desc, sub: `${s.cat} · ×${it.qty}${s.sell ? ` · sells for ${s.sell} ¢` : ""}`, actions: [], use: s.cat === "consumable" ? it.id : null };
}

function Equipment({ P }) {
  const slot = (label, it, color, icon) => (
    <div className="nm-eqslot" style={{ "--c": color || "#444" }}>
      <span className="nm-eqslot__label">{label}</span>
      {it ? (
        <>
          <Icon kind={icon} color={color} size={22} />
          <span>{it}</span>
        </>
      ) : (
        <span className="nm-dim">— empty —</span>
      )}
    </div>
  );
  const w = (s) => weaponByUid(P, P.equip[s]);
  const a = (s) => armorByUid(P, P.equip[s]);
  const wi = (s) => w(s) && (WEAPONS[w(s).id].base ? WEAPONS[WEAPONS[w(s).id].base].type : WEAPONS[w(s).id].type);
  return (
    <div className="nm-equip">
      {slot("Weapon 1", w("w1") && WEAPONS[w("w1").id].name, w("w1") && RARITY_COLOR[w("w1").rarity], wi("w1"))}
      {slot("Weapon 2", w("w2") && WEAPONS[w("w2").id].name, w("w2") && RARITY_COLOR[w("w2").rarity], wi("w2"))}
      {slot("Melee", w("melee") && WEAPONS[w("melee").id].name, w("melee") && RARITY_COLOR[w("melee").rarity], "blade")}
      {slot("Head", a("head") && ARMOR[a("head").id].name, a("head") && RARITY_COLOR[ARMOR[a("head").id].rarity], "head")}
      {slot("Body", a("body") && ARMOR[a("body").id].name, a("body") && RARITY_COLOR[ARMOR[a("body").id].rarity], "body")}
      {CYBER_SLOTS.map((s) => {
        const id = P.cyber.equipped[s.id];
        return <div key={s.id}>{slot(s.name, id && CYBERWARE[id].name, id && CYBERWARE[id].color, "chip")}</div>;
      })}
    </div>
  );
}

/* ------------------------------------------------------------ character */
export function Character({ P }) {
  const attrs = attributes(P);
  const S = P.stats;
  const acc = S.shots ? Math.round((S.hits / S.shots) * 100) : 0;
  const atCap = P.level >= LEVEL_CAP;
  return (
    <div className="nm-char">
      <div className="nm-char__head">
        <div className="nm-char__lvl">{P.level}</div>
        <div>
          <h3>{P.name}</h3>
          <div className="nm-dim">Freelance Mercenary · {P.story.done.length}/20 contracts</div>
          <div className="nm-vitals__xp nm-char__xp">
            <div style={{ width: atCap ? "100%" : `${(P.xp / xpToNext(P.level)) * 100}%` }} />
          </div>
          <div className="nm-small nm-dim">{atCap ? "Level cap reached" : `${P.xp} / ${xpToNext(P.level)} XP to level ${P.level + 1}`}</div>
        </div>
        <div className="nm-char__cr">¢ {P.credits.toLocaleString()}</div>
      </div>
      <div className="nm-attrs">
        {attrs.map((a) => (
          <div key={a.id} className="nm-attr">
            <span>{a.label}</span>
            <b>{a.value}</b>
            {a.note && <small>{a.note}</small>}
          </div>
        ))}
      </div>
      <div className="nm-attrs nm-attrs--stats">
        <div className="nm-attr">
          <span>Enemies defeated</span>
          <b>{S.kills}</b>
        </div>
        <div className="nm-attr">
          <span>Accuracy</span>
          <b>{acc}%</b>
        </div>
        <div className="nm-attr">
          <span>Critical hits</span>
          <b>{S.crits}</b>
        </div>
        <div className="nm-attr">
          <span>Flatlines</span>
          <b>{S.deaths}</b>
        </div>
        <div className="nm-attr">
          <span>Bosses</span>
          <b>{Object.keys(P.story.bosses).length}/4</b>
        </div>
        <div className="nm-attr">
          <span>Time played</span>
          <b>{Math.floor(S.time / 60)} min</b>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ skill tree */
export function SkillTree({ P, act, msg }) {
  const [hover, setHover] = useState(null);
  const byBranch = useMemo(() => {
    const m = {};
    for (const [id, s] of Object.entries(SKILLS)) (m[s.branch] = m[s.branch] || []).push({ id, ...s });
    return m;
  }, []);
  const info = hover && SKILLS[hover];
  const can = hover ? canLearn(P, hover) : null;
  return (
    <div className="nm-skills">
      <div className="nm-skills__top">
        <span>
          Skill points: <b className={P.sp ? "nm-pulse" : ""}>{P.sp}</b>
        </span>
        <span className="nm-dim nm-small">Earn points by levelling up (1 per level) and defeating bosses. Click a node to spend one.</span>
      </div>
      <div className="nm-skills__branches">
        {BRANCHES.map((b) => (
          <div key={b.id} className="nm-branch" style={{ "--c": b.color }}>
            <h3>
              {b.icon} {b.name}
            </h3>
            <div className="nm-branch__grid">
              <svg className="nm-branch__lines" viewBox="0 0 300 500" preserveAspectRatio="none">
                {byBranch[b.id].map((s) =>
                  Object.keys(s.req || {}).map((r) => {
                    const a = SKILLS[r];
                    const on = (P.skills[r] || 0) >= s.req[r];
                    return <line key={`${s.id}-${r}`} x1={a.pos[0] * 100 + 50} y1={a.pos[1] * 100 + 50} x2={s.pos[0] * 100 + 50} y2={s.pos[1] * 100 + 50} className={on ? "on" : ""} />;
                  })
                )}
              </svg>
              {byBranch[b.id].map((s) => {
                const r = P.skills[s.id] || 0;
                const c = canLearn(P, s.id);
                return (
                  <button
                    key={s.id}
                    className={`nm-node${r ? " nm-node--has" : ""}${r >= s.ranks ? " nm-node--max" : ""}${c.ok ? " nm-node--can" : ""}`}
                    style={{ left: `${(s.pos[0] / 3) * 100 + 16.6}%`, top: `${(s.pos[1] / 5) * 100 + 10}%` }}
                    onMouseEnter={() => setHover(s.id)}
                    onFocus={() => setHover(s.id)}
                    onClick={() => act((p) => learnSkill(p, s.id))}
                  >
                    <span className="nm-node__name">{s.name}</span>
                    <span className="nm-node__rank">
                      {r}/{s.ranks}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="nm-skills__info">
        {info ? (
          <>
            <b>{info.name}</b> <span className="nm-dim">— rank {P.skills[hover] || 0}/{info.ranks}, requires level {info.level}
              {info.req ? `, ${Object.entries(info.req).map(([k, v]) => `${SKILLS[k].name} ${v}`).join(", ")}` : ""}</span>
            <div>{info.desc}</div>
            {!can.ok && <div className="nm-down nm-small">{can.msg}</div>}
          </>
        ) : (
          <span className="nm-dim">Hover a skill for details.</span>
        )}
        {msg && <div className="nm-msg">{msg}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ cyberware */
export function Cyberware({ P, act, msg }) {
  const owned = P.cyber.owned;
  return (
    <div className="nm-cyber">
      <p className="nm-dim">Cyberware is installed by Doc Rhee (Neon Market clinic). The Operating System slot holds your active Q ability; the others are passive.</p>
      <div className="nm-cyber__slots">
        {CYBER_SLOTS.map((s) => {
          const id = P.cyber.equipped[s.id];
          const c = id && CYBERWARE[id];
          const options = owned.filter((o) => CYBERWARE[o].slot === s.id);
          return (
            <div key={s.id} className="nm-cyber__slot" style={{ "--c": c?.color || "#333" }}>
              <div className="nm-cyber__slothead">
                <Icon kind="chip" color={c?.color || "#555"} />
                <div>
                  <b>{s.name}</b>
                  <div className="nm-dim nm-small">{s.hint}</div>
                </div>
              </div>
              {c ? (
                <div className="nm-cyber__eq">
                  <b style={{ color: c.color }}>{c.name}</b>
                  <div className="nm-small">{c.desc}</div>
                  {c.active && <div className="nm-dim nm-small">{c.energy} energy · {c.cd} s cooldown</div>}
                </div>
              ) : (
                <div className="nm-dim nm-small">Empty</div>
              )}
              <div className="nm-row nm-row--wrap">
                {options.map((o) => (
                  <button key={o} className={`nm-btn nm-btn--sm${o === id ? " nm-btn--primary" : ""}`} onClick={() => act((p) => (o === id ? unequipCyber(p, s.id) : equipCyber(p, o)))}>
                    {o === id ? `Disable ${CYBERWARE[o].name}` : `Install ${CYBERWARE[o].name}`}
                  </button>
                ))}
                {!options.length && <span className="nm-dim nm-small">No implant owned for this slot.</span>}
              </div>
            </div>
          );
        })}
      </div>
      {msg && <div className="nm-msg">{msg}</div>}
    </div>
  );
}

export { derive };
