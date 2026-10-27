/**
 * Iron Arena — Garage (buy / select tanks, upgrades, skins) and the Tanks
 * comparison screen. The 3D showroom turntable renders behind both; the
 * panel only shows numbers, swatches and buttons.
 */
import { useEffect, useRef, useState } from "react";
import { Icon, Coins, Header, StatBar, ABILITY_ICON } from "./common.jsx";
import { TANKS, TANK_BY_ID, ABILITIES, SKINS, UPGRADE_KEYS, UPGRADE_MAX, UPGRADE_INFO, upgradeCost, tankStats, weaponDps } from "../engine/tanks.js";
import { buyTank, buyUpgrade, buySkin, selectTank } from "../progress.js";
import { sound } from "../audio.js";

const MAXS = { hp: 1700, armor: 55, speed: 20, dps: 130, range: 300 };
const RAD = 180 / Math.PI;

function statsOf(id, up) {
  const s = tankStats(id, up);
  return { hp: s.hp, armor: s.armor * 100, speed: s.speed * 3.6 * 0.28, rawSpeed: s.speed, dps: weaponDps(s.weapon), range: s.weapon.range, turn: s.turn * RAD, turret: s.turret * RAD, s };
}

export function Garage({ save, commit, back, view, setView, onCelebrate, deploy }) {
  const id = view;
  const t = TANK_BY_ID[id];
  const rec = save.tanks[id];
  const owned = rec.owned;
  const cur = statsOf(id, rec.up);
  const base = statsOf(id, {});
  const ab = ABILITIES[t.ability];
  const [flash, setFlash] = useState(null);
  const flashT = useRef(0);
  useEffect(() => () => clearTimeout(flashT.current), []);
  const say = (msg, kind = "info") => {
    setFlash({ msg, kind, k: Math.random() });
    clearTimeout(flashT.current);
    flashT.current = setTimeout(() => setFlash(null), 2200);
  };
  const tryCommit = (fn, okSound, okMsg) => {
    const next = fn(save);
    if (!next) {
      sound.ui("error");
      say("Not enough coins", "bad");
      return false;
    }
    commit(() => next);
    sound.ui(okSound);
    if (okMsg) say(okMsg, "good");
    return true;
  };
  const buy = () => {
    if (tryCommit((sv) => buyTank(sv, id), "unlock")) onCelebrate(t.name);
  };
  return (
    <div className="ia-screen ia-garage">
      <Header title="Garage" sub="Unlock, upgrade and paint your tanks" onBack={back} right={<Coins value={save.coins} animate />} />
      <div className="ia-garage__list">
        {TANKS.map((tk) => {
          const r = save.tanks[tk.id];
          return (
            <button key={tk.id} className={`ia-tankrow${tk.id === id ? " is-on" : ""}${r.owned ? "" : " is-locked"}`} onClick={() => (sound.ui("click"), setView(tk.id))}>
              <span className="ia-tankrow__name">
                <b>{tk.name}</b>
                <small>{tk.cls}</small>
              </span>
              {save.selected === tk.id ? (
                <span className="ia-tankrow__tag ia-tankrow__tag--sel">
                  <Icon name="check" /> Active
                </span>
              ) : r.owned ? (
                <span className="ia-tankrow__tag">Owned</span>
              ) : (
                <span className={`ia-tankrow__price${save.coins >= tk.price ? " is-afford" : ""}`}>
                  <Icon name="lock" /> {tk.price.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="ia-garage__panel">
        <div className="ia-garage__title">
          <span className="ia-tankcard__cls">
            {t.cls} · {t.role}
          </span>
          <h2>{t.name}</h2>
          <p>{t.blurb}</p>
        </div>
        <div className="ia-garage__stats">
          <StatBar label="Health" icon="shield" value={base.hp} extra={cur.hp - base.hp} max={MAXS.hp} />
          <StatBar label="Armor" icon="armor" value={base.armor} extra={cur.armor - base.armor} max={MAXS.armor} suffix="%" />
          <StatBar label="Top speed" icon="speed" value={base.rawSpeed * 3.6} extra={(cur.rawSpeed - base.rawSpeed) * 3.6} max={70} suffix=" km/h" />
          <StatBar label="Firepower" icon="damage" value={base.dps} extra={cur.dps - base.dps} max={MAXS.dps} suffix=" dps" />
          <StatBar label="Range" icon="target" value={base.range} max={MAXS.range} suffix=" m" />
          <div className="ia-garage__mini">
            <span>Hull turn {Math.round(cur.turn)}°/s</span>
            <span>Turret {Math.round(cur.turret)}°/s</span>
          </div>
        </div>
        {owned ? (
          <>
            <div className="ia-upgrades">
              {UPGRADE_KEYS.map((k) => {
                const lvl = rec.up[k];
                const cost = upgradeCost(id, k, lvl);
                const max = lvl >= UPGRADE_MAX;
                return (
                  <div key={k} className="ia-upg">
                    <Icon name={k === "armor" ? "armor" : k === "speed" ? "speed" : "damage"} />
                    <span className="ia-upg__name">
                      <b>{UPGRADE_INFO[k].name}</b>
                      <small>{UPGRADE_INFO[k].blurb}</small>
                    </span>
                    <span className="ia-pips">
                      {Array.from({ length: UPGRADE_MAX }, (_, i) => (
                        <i key={i} className={i < lvl ? "is-on" : ""} />
                      ))}
                    </span>
                    <button className="ia-btn ia-btn--small" disabled={max} onClick={() => tryCommit((sv) => buyUpgrade(sv, id, k), "upgrade", `${UPGRADE_INFO[k].name} level ${lvl + 1}`)}>
                      {max ? "MAX" : (
                        <>
                          <Icon name="coin" /> {cost.toLocaleString()}
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="ia-skins">
              {SKINS[id].map((sk) => {
                const have = rec.skins.includes(sk.id);
                const on = rec.skin === sk.id;
                return (
                  <button key={sk.id} className={`ia-skin${on ? " is-on" : ""}`} onClick={() => tryCommit((sv) => buySkin(sv, id, sk.id), have ? "click" : "buy", have ? null : `${sk.name} unlocked`)} title={sk.name}>
                    <span className="ia-skin__sw" style={{ background: `linear-gradient(135deg, ${sk.base} 0 45%, ${sk.accent} 45% 70%, ${sk.detail} 70%)`, boxShadow: `inset 0 -3px 0 ${sk.trim}` }} />
                    <small>{sk.name}</small>
                    <em>{on ? "Equipped" : have ? "Owned" : <><Icon name="coin" /> {sk.cost}</>}</em>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="ia-garage__locked">
            <Icon name="lock" /> Locked — unlock it to upgrade and paint
          </div>
        )}
        {flash && <div key={flash.k} className={`ia-flash ia-flash--${flash.kind}`}>{flash.msg}</div>}
      </div>
      <div className="ia-garage__dock">
        <div className="ia-garage__kit">
          <div>
            <Icon name="damage" />
            <span>
              <b>{t.weapon.name}</b>
              <small>{weaponLine(t.weapon)}</small>
            </span>
          </div>
          <div>
            <Icon name={ABILITY_ICON[ab.key]} />
            <span>
              <b>{ab.name}</b>
              <small>
                {ab.blurb} Cooldown {ab.cd}s.
              </small>
            </span>
          </div>
        </div>
        {owned ? (
            <div className="ia-garage__actions">
              {save.selected === id ? (
                <button className="ia-deploy" onClick={() => deploy()}>
                  <span>Deploy</span>
                  <small>Quick battle with the {t.name}</small>
                </button>
              ) : (
                <button className="ia-deploy" onClick={() => tryCommit((sv) => selectTank(sv, id), "click", `${t.name} is now your active tank`)}>
                  <span>Select {t.name}</span>
                </button>
              )}
            </div>
        ) : (
          <div className="ia-garage__buy">
            <Coins value={t.price} big />
            {save.coins >= t.price ? (
              <button className="ia-deploy" onClick={buy}>
                <span>Unlock {t.name}</span>
              </button>
            ) : (
              <div className="ia-need">
                <Icon name="lock" /> Earn <b>{(t.price - save.coins).toLocaleString()}</b> more coins in battle to unlock
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function weaponLine(w) {
  switch (w.kind) {
    case "burst":
      return `${w.burst}-round bursts · ${Math.round(w.damage)} per shell · ${w.reload}s between bursts`;
    case "clip":
      return `${w.clip}-shell magazine · ${Math.round(w.damage)} per shell · ${w.reload}s reload`;
    case "rail":
      return `${w.charge}s charge · ${Math.round(w.damage)} damage · pierces every tank in line`;
    case "flame":
      return `${Math.round(w.dps)} damage/s within ${w.range} m · sets targets ablaze · overheats after ${w.heatTime}s`;
    case "plasma":
      return `${Math.round(w.damage)} damage · straight-flying bolts with splash · ${w.reload}s reload`;
    case "he":
      return `${Math.round(w.damage)} damage · ${w.splash} m blast radius · ${w.reload}s reload`;
    default:
      return `${Math.round(w.damage)} damage · ${w.reload}s reload · ${w.range} m range`;
  }
}

export function Tanks({ save, back, view, setView, go }) {
  const bar = (v) => (
    <i className="ia-cmp__bar">
      <u style={{ width: `${Math.min(100, v * 100)}%` }} />
    </i>
  );
  const sel = TANK_BY_ID[view];
  const selAb = ABILITIES[sel.ability];
  return (
    <div className="ia-screen ia-tanks">
      <Header title="Tanks" sub="Compare all eight — select a row to put it on the turntable" onBack={back} right={<Coins value={save.coins} />} />
      <div className="ia-cmp">
        <table>
          <thead>
            <tr>
              <th>Tank</th>
              <th>Health</th>
              <th>Armor</th>
              <th>Speed</th>
              <th>Firepower</th>
              <th>Range</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {TANKS.map((t) => {
              const st = statsOf(t.id, {});
              const r = save.tanks[t.id];
              return (
                <tr key={t.id} className={view === t.id ? "is-on" : ""} onClick={() => (sound.ui("click"), setView(t.id))}>
                  <td>
                    <b>{t.name}</b>
                    <small>{t.cls}</small>
                  </td>
                  <td>
                    {bar(st.hp / MAXS.hp)}
                    <em>{st.hp}</em>
                  </td>
                  <td>
                    {bar(st.armor / MAXS.armor)}
                    <em>{Math.round(st.armor)}%</em>
                  </td>
                  <td>
                    {bar((st.rawSpeed * 3.6) / 70)}
                    <em>{Math.round(st.rawSpeed * 3.6)} km/h</em>
                  </td>
                  <td>
                    {bar(st.dps / MAXS.dps)}
                    <em>{Math.round(st.dps)} dps</em>
                  </td>
                  <td>
                    {bar(st.range / MAXS.range)}
                    <em>{st.range} m</em>
                  </td>
                  <td className="ia-cmp__own">{r.owned ? (save.selected === t.id ? "Active" : "Owned") : <><Icon name="coin" /> {t.price.toLocaleString()}</>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ia-cmp__card">
        <span className="ia-tankcard__cls">
          {sel.cls} · {sel.role}
        </span>
        <h3>{sel.name}</h3>
        <span className="ia-cmp__kit">
          <Icon name="damage" /> {sel.weapon.name} — {weaponLine(sel.weapon)}
        </span>
        <span className="ia-cmp__kit">
          <Icon name={ABILITY_ICON[selAb.key]} /> {selAb.name} — {selAb.blurb}
        </span>
        <button className="ia-btn" onClick={() => go("garage")}>
          <Icon name="garage" /> Open in garage
        </button>
      </div>
    </div>
  );
}
