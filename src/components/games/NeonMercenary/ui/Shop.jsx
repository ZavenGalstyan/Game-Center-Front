/**
 * Vendors (buy / sell / upgrade), contract terminal, Maglev transit, rest.
 */
import { useState } from "react";
import { SHOPS, shopStock } from "../data/shops.js";
import { WEAPONS, RARITY_COLOR, RARITY_LABEL, AMMO, MAX_UPGRADE, upgradeCost } from "../data/weapons.js";
import { ARMOR, STACKS, AMMO_PACKS } from "../data/items.js";
import { CYBERWARE } from "../data/cyberware.js";
import { NPCS } from "../data/npcs.js";
import { DISTRICTS, DISTRICT_ORDER } from "../data/districts/index.js";
import { stockPrice, canBuy, buy, sellWeapon, sellArmor, sellStack, sellPrice, canUpgrade, upgradeWeapon, sortedInventory, isEquipped, weaponStats, derive } from "../engine/profile.js";
import { Icon, itemIcon } from "./Panels.jsx";

function entryInfo(e) {
  if (e.kind === "weapon") {
    const d = WEAPONS[e.id];
    return { name: d.name, rarity: e.rarity || "common", icon: d.type, desc: d.desc, cat: "Weapon" };
  }
  if (e.kind === "armor") {
    const d = ARMOR[e.id];
    return { name: d.name, rarity: d.rarity, icon: d.slot === "head" ? "head" : "body", desc: `${d.desc} Armor ${d.armor}.`, cat: d.slot === "head" ? "Head armor" : "Body armor" };
  }
  if (e.kind === "cyber") {
    const d = CYBERWARE[e.id];
    const mats = Object.entries(d.mats || {}).map(([k, n]) => `${n}× ${STACKS[k].name}`).join(", ");
    return { name: d.name, rarity: d.rarity, icon: "chip", desc: `${d.desc}${d.req?.level ? ` Requires level ${d.req.level}.` : ""}${mats ? ` Needs ${mats}.` : ""}`, cat: d.active ? "Active cyberware (Q)" : "Passive cyberware" };
  }
  if (e.kind === "ammo") {
    const d = AMMO_PACKS[e.id];
    return { name: d.name, rarity: "common", icon: "material", desc: `${AMMO[d.ammo].name} for your reserves.`, cat: "Ammunition" };
  }
  const d = STACKS[e.id];
  return { name: d.name, rarity: d.rarity, icon: d.cat === "material" ? "material" : e.id === "battery" ? "battery" : e.id === "stim" ? "stim" : e.id === "trauma" ? "trauma" : "medkit", desc: d.desc, cat: d.cat === "material" ? "Material" : "Consumable" };
}

export function Shop({ shop, P, act, msg, onClose }) {
  const S = SHOPS[shop];
  const npc = NPCS[S.vendor];
  const [tab, setTab] = useState("buy");
  const D = derive(P);
  const stock = shopStock(shop, P);
  const sellables = [...sortedInventory(P, "weapons"), ...sortedInventory(P, "armor"), ...sortedInventory(P, "consumable"), ...sortedInventory(P, "material")];
  return (
    <div className="nm-shop">
      <div className="nm-shop__head">
        <div>
          <div className="nm-kicker">{npc.role}</div>
          <h2 className="nm-h2">{S.name}</h2>
          <div className="nm-dim">“{npc.idle[0]}” — {npc.name}</div>
        </div>
        <div className="nm-shop__cr">¢ {P.credits.toLocaleString()}</div>
      </div>
      <div className="nm-chips">
        <button className={tab === "buy" ? "on" : ""} onClick={() => setTab("buy")}>
          Buy
        </button>
        <button className={tab === "sell" ? "on" : ""} onClick={() => setTab("sell")}>
          Sell
        </button>
        {S.upgrades && (
          <button className={tab === "upgrade" ? "on" : ""} onClick={() => setTab("upgrade")}>
            Upgrade weapons
          </button>
        )}
      </div>
      {tab === "buy" && (
        <div className="nm-shop__list">
          {stock.map((e, i) => {
            const info = entryInfo(e);
            const c = canBuy(P, e);
            const owned = e.kind === "cyber" && P.cyber.owned.includes(e.id);
            let compare = null;
            if (e.kind === "weapon") {
              const st = weaponStats({ id: e.id, rarity: e.rarity || "common", level: 0 }, D);
              compare = st.melee ? `${st.dmg.toFixed(0)} dmg · ${st.rpm.toFixed(0)}/min` : `${st.dmg.toFixed(0)}${st.pellets > 1 ? `×${st.pellets}` : ""} dmg · ${st.rpm.toFixed(0)} rpm · mag ${st.mag}`;
            }
            return (
              <div key={`${e.kind}${e.id}${e.rarity || ""}${i}`} className={`nm-shopitem${c.ok ? "" : " nm-shopitem--no"}`} style={{ "--c": RARITY_COLOR[info.rarity] }}>
                <Icon kind={info.icon} color={RARITY_COLOR[info.rarity]} />
                <div className="nm-shopitem__body">
                  <b>{info.name}</b> <span className="nm-rarity">{RARITY_LABEL[info.rarity]}</span> <span className="nm-dim nm-small">{info.cat}</span>
                  <div className="nm-small">{info.desc}</div>
                  {compare && <div className="nm-small nm-dim">{compare}</div>}
                </div>
                <button className="nm-btn nm-btn--sm nm-btn--buy" disabled={!c.ok} title={c.msg} onClick={() => act((p) => buy(p, e), "buy")}>
                  {owned ? "Owned" : `${stockPrice(e).toLocaleString()} ¢`}
                </button>
                {!c.ok && !owned && <em className="nm-shopitem__why">{c.msg}</em>}
              </div>
            );
          })}
        </div>
      )}
      {tab === "sell" && (
        <div className="nm-shop__list">
          {sellables.length === 0 && <div className="nm-dim">Nothing to sell.</div>}
          {sellables.map((it) => {
            const eq = it.uid != null && isEquipped(P, it.uid);
            const price = it.kind === "weapon" ? sellPrice.weapon(it.ref) : it.kind === "armor" ? sellPrice.armor(it.ref) : sellPrice.stack(it.id);
            const fn = it.kind === "weapon" ? (p) => sellWeapon(p, it.uid) : it.kind === "armor" ? (p) => sellArmor(p, it.uid) : (p) => sellStack(p, it.id, 1);
            return (
              <div key={it.uid ?? it.id} className={`nm-shopitem${eq ? " nm-shopitem--no" : ""}`} style={{ "--c": RARITY_COLOR[it.rarity] }}>
                <Icon kind={itemIcon(it)} color={RARITY_COLOR[it.rarity]} />
                <div className="nm-shopitem__body">
                  <b>{it.name}</b> {it.qty > 1 && <span>×{it.qty}</span>} {it.ref?.level > 0 && <span className="nm-dim">Mk{it.ref.level + 1}</span>}
                  {eq && <div className="nm-small nm-dim">Equipped — unequip it to sell</div>}
                </div>
                <button className="nm-btn nm-btn--sm" disabled={eq || !price} onClick={() => act(fn, "buy")}>
                  Sell {price} ¢
                </button>
              </div>
            );
          })}
        </div>
      )}
      {tab === "upgrade" && (
        <div className="nm-shop__list">
          {P.weapons.map((w) => {
            const def = WEAPONS[w.id];
            const c = canUpgrade(P, w.uid);
            const cost = w.level < MAX_UPGRADE ? upgradeCost(def, w.rarity, w.level) : null;
            const now = weaponStats(w, D);
            const next = w.level < MAX_UPGRADE ? weaponStats({ ...w, level: w.level + 1 }, D) : null;
            return (
              <div key={w.uid} className="nm-shopitem" style={{ "--c": RARITY_COLOR[w.rarity] }}>
                <Icon kind={def.base ? WEAPONS[def.base].type : def.type} color={RARITY_COLOR[w.rarity]} />
                <div className="nm-shopitem__body">
                  <b>{def.name}</b> <span className="nm-dim">Mk{w.level + 1} → {next ? `Mk${w.level + 2}` : "max"}</span>
                  {next && (
                    <div className="nm-small">
                      Damage {now.dmg.toFixed(1)} → <span className="nm-up">{next.dmg.toFixed(1)}</span> · Reload {now.reload.toFixed(2)} → <span className="nm-up">{next.reload.toFixed(2)} s</span>
                    </div>
                  )}
                  {cost && (
                    <div className="nm-small nm-dim">
                      Cost: {cost.credits} ¢ + {Object.entries(cost.mats).map(([k, n]) => `${n}× ${STACKS[k].name} (have ${P.stacks[k] || 0})`).join(", ")}
                    </div>
                  )}
                </div>
                <button className="nm-btn nm-btn--sm" disabled={!c.ok} title={c.msg} onClick={() => act((p) => upgradeWeapon(p, w.uid), "buy")}>
                  {next ? "Upgrade" : "Maxed"}
                </button>
                {!c.ok && next && <em className="nm-shopitem__why">{c.msg}</em>}
              </div>
            );
          })}
        </div>
      )}
      {msg && <div className="nm-msg">{msg}</div>}
      <div className="nm-row nm-row--end">
        <button className="nm-btn nm-btn--primary" onClick={onClose}>
          <span>Leave</span>
        </button>
      </div>
    </div>
  );
}

export function ContractsTerminal({ G, onAccept, onClose }) {
  const avail = G.missions.available()[0];
  const active = G.P.story.active;
  const done = G.P.story.done;
  return (
    <div className="nm-terminal">
      <div className="nm-terminal__screen">
        <div className="nm-kicker">SWITCHBOARD // CONTRACT NETWORK</div>
        {active ? (
          <>
            <h2 className="nm-h2">Active contract</h2>
            <p>
              <b>#{active.id}</b> — finish it before taking another job.
            </p>
          </>
        ) : avail ? (
          <>
            <h2 className="nm-h2">
              #{avail.id} {avail.title}
            </h2>
            <div className="nm-dim">
              Client: {avail.giver} · {avail.location}
            </div>
            <p className="nm-terminal__brief">{avail.brief}</p>
            <div className="nm-rewards">
              <span>+{avail.rewards.xp} XP</span>
              <span>+{avail.rewards.credits} ¢</span>
              {Object.entries(avail.rewards.stacks || {}).map(([k, n]) => (
                <span key={k}>
                  {n}× {STACKS[k].name}
                </span>
              ))}
            </div>
            {!avail.here && <p className="nm-down">This job is in the {DISTRICTS[avail.district].name}. Take the Maglev.</p>}
          </>
        ) : (
          <>
            <h2 className="nm-h2">No contracts</h2>
            <p>The network is quiet. Neon City breathes easier — for now.</p>
          </>
        )}
        <div className="nm-terminal__done">Completed: {done.length}/20</div>
      </div>
      <div className="nm-row nm-row--end">
        <button className="nm-btn nm-btn--ghost" onClick={onClose}>
          Close
        </button>
        {avail && !active && avail.here && (
          <button className="nm-btn nm-btn--primary" onClick={() => onAccept(avail.id)}>
            <span>Accept contract</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function Transit({ G, onTravel, onClose }) {
  return (
    <div className="nm-transit">
      <div className="nm-kicker">NEON CITY MAGLEV</div>
      <h2 className="nm-h2">Choose a destination</h2>
      <div className="nm-transit__list">
        {DISTRICT_ORDER.map((id) => {
          const d = DISTRICTS[id];
          const open = G.P.unlocked[id];
          const here = G.districtId === id;
          return (
            <button key={id} className={`nm-dest${here ? " nm-dest--here" : ""}`} disabled={!open || here} onClick={() => onTravel(id)} style={{ "--c": d.palette.neon[0] }}>
              <b>{d.name}</b>
              <span className="nm-dim nm-small">{d.tagline}</span>
              <em>{here ? "You are here" : open ? "Depart" : id === "industrial" ? "Locked — finish Razor's Fall" : "Locked — finish Ironjaw Protocol"}</em>
            </button>
          );
        })}
      </div>
      <div className="nm-row nm-row--end">
        <button className="nm-btn nm-btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function Rest({ onRest, onClose }) {
  return (
    <div className="nm-transit">
      <div className="nm-kicker">SAFEHOUSE</div>
      <h2 className="nm-h2">Rest</h2>
      <p>Sleep off the bruises. Fully restores health, armor and cyber energy, and saves your game.</p>
      <div className="nm-row nm-row--end">
        <button className="nm-btn nm-btn--ghost" onClick={onClose}>
          Not now
        </button>
        <button className="nm-btn nm-btn--primary" onClick={onRest}>
          <span>Rest & save</span>
        </button>
      </div>
    </div>
  );
}
