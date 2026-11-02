/**
 * Fight HUD. The per-frame values (health, damage-lag, timer, special meter)
 * are written straight to DOM nodes by `createHudUpdater()` from the world's
 * onFrame hook — React only re-renders on discrete events (announcements,
 * round pips, combo popups).
 */
import { useRef } from "react";
import { FIGHTER_BY_ID } from "../engine/fighters.js";
import { Portrait } from "./Screens.jsx";

export function useHudRefs() {
  const r = useRef(null);
  if (!r.current) r.current = { hp: [null, null], lag: [null, null], sp: [null, null], spWrap: [null, null], timer: null, lagV: [1, 1], hpV: [1, 1] };
  return r.current;
}

/** Called every rendered frame with the live match. */
export function updateHud(refs, m, dt) {
  if (!m) return;
  for (let i = 0; i < 2; i++) {
    const F = m.f[i];
    const hp = F.hp / F.maxHp;
    refs.hpV[i] = hp;
    // damage-lag bar drains after a short pause
    if (refs.lagV[i] < hp) refs.lagV[i] = hp;
    else refs.lagV[i] = Math.max(hp, refs.lagV[i] - dt * (F.state === "hitstun" || F.state === "knockdown" ? 0.05 : 0.6));
    if (refs.hp[i]) {
      refs.hp[i].style.transform = `scaleX(${hp})`;
      refs.hp[i].classList.toggle("low", hp < 0.3);
    }
    if (refs.lag[i]) refs.lag[i].style.transform = `scaleX(${refs.lagV[i]})`;
    const cd = F.special.cooldown;
    const k = 1 - F.cdSpecial / cd;
    if (refs.sp[i]) refs.sp[i].style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`;
    if (refs.spWrap[i]) refs.spWrap[i].classList.toggle("ready", F.cdSpecial <= 0);
  }
  if (refs.timer) {
    const t = Math.ceil(m.clock);
    if (refs.timer.textContent !== String(t)) refs.timer.textContent = String(t);
    refs.timer.classList.toggle("low", m.clock <= 10 && m.phase === "fight");
  }
}

function Bar({ side, id, name, sub, wins, need, refs, portrait, alt, boss }) {
  const f = FIGHTER_BY_ID[id];
  return (
    <div className={`ifa-bar ifa-bar--${side}`} style={{ "--fc": f.color }}>
      <Portrait id={id} src={portrait} className="ifa-bar__face" alt={alt} />
      <div className="ifa-bar__main">
        <div className="ifa-bar__name">
          <b>{name}</b>
          {boss && <span className="ifa-badge">BOSS</span>}
          <small>{sub}</small>
        </div>
        <div className="ifa-hp">
          <i className="ifa-hp__lag" ref={(el) => (refs.lag[side] = el)} />
          <i className="ifa-hp__fill" ref={(el) => (refs.hp[side] = el)} />
        </div>
        <div className="ifa-bar__row">
          <div className="ifa-sp" ref={(el) => (refs.spWrap[side] = el)}>
            <i ref={(el) => (refs.sp[side] = el)} />
            <span>{f.specialName}</span>
          </div>
          <div className="ifa-pips">
            {Array.from({ length: need }, (_, k) => (
              <b key={k} className={k < wins ? "on" : ""} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FightHud({ cfg, wins, need, refs, portraits, announce, banner, combos, hint, keysHint }) {
  const names = cfg.fighters.map((id, i) => (cfg.alt?.[i] && cfg.mode === "arcade" ? `Dark ${FIGHTER_BY_ID[id].name}` : FIGHTER_BY_ID[id].name));
  const subs = cfg.mode === "vs" ? ["P1", "P2"] : ["You", cfg.battleTitle || "CPU"];
  return (
    <div className="ifa-hud">
      <div className="ifa-hud__top">
        <Bar side={0} id={cfg.fighters[0]} name={names[0]} sub={subs[0]} wins={wins[0]} need={need} refs={refs} portrait={portraits[cfg.fighters[0]]} alt={cfg.alt?.[0]} />
        <div className="ifa-timer" ref={(el) => (refs.timer = el)}>
          60
        </div>
        <Bar side={1} id={cfg.fighters[1]} name={names[1]} sub={subs[1]} wins={wins[1]} need={need} refs={refs} portrait={portraits[cfg.fighters[1]]} alt={cfg.alt?.[1]} boss={cfg.boss?.[1]} />
      </div>
      {combos.map((c, i) =>
        c ? (
          <div key={c.key} className={`ifa-combo ifa-combo--${i}`}>
            <b>{c.n}</b> HITS
          </div>
        ) : null
      )}
      {announce && (
        <div key={announce.key} className={`ifa-announce ifa-announce--${announce.kind || "big"}`}>
          {announce.text}
          {announce.sub && <small>{announce.sub}</small>}
        </div>
      )}
      {banner && (
        <div key={banner.key} className="ifa-banner">
          <b>{banner.text}</b>
          {banner.sub && <small>{banner.sub}</small>}
        </div>
      )}
      {hint && <div className="ifa-keys">{keysHint}</div>}
    </div>
  );
}
