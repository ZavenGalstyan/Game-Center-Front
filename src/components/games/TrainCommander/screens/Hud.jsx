/**
 * Train Commander — in-route HUD (DOM over the canvas).
 *
 * Reads the throttled engine snapshot (`hud`, ≤10 updates/s, only when
 * something changed). Every button calls an engine transaction that
 * validates and applies synchronously, so rapid clicks can never double
 * charge or act on a stale wagon.
 */
import { MODULES, MODULE_IDS, stat, invested, EMERGENCY } from "../data/modules.js";
import { ENEMIES, BOSSES } from "../data/enemies.js";
import { regionOf } from "../data/regions.js";
import { Icon, ModuleIcon, EnemyIcon, Stars, fmtTime, fmtKm } from "./ui.jsx";

const pct = (a, b) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100))}%`;

/* ================================================================ top bar */
export function TopBar({ hud, route, onPause, onSpeed, flash }) {
  const loco = hud.loco;
  const lf = loco.hp / loco.max;
  const stops = route.events.filter((e) => e.type === "checkpoint");
  const fin = route.events.find((e) => e.type === "final");
  const L = hud.length;
  const threat = hud.boss && !hud.boss.dead ? "boss" : hud.enemies > 0 ? "attack" : hud.incoming > 0 ? "incoming" : hud.checkpoint && hud.checkpoint.arrived ? "station" : "clear";
  const threatText = { boss: "HEAVY THREAT", attack: `UNDER ATTACK · ${hud.enemies}`, incoming: "RAIDERS INCOMING", station: "AT STATION", clear: hud.travel === "braking" ? "BRAKING" : "ALL CLEAR" }[threat];
  return (
    <div className="tc-top" role="toolbar" aria-label="Route status">
      <button type="button" className="tc-iconbtn" onClick={onPause} aria-label="Pause (P)">
        <Icon name="pause" />
      </button>
      <div className={`tc-locohp${lf < 0.3 ? " is-crit" : lf < 0.55 ? " is-low" : ""}`} title="Locomotive HP — if it reaches zero the journey fails">
        <Icon name="loco" size={18} />
        <div className="tc-bar">
          <div className="tc-bar__fill" style={{ width: pct(loco.hp, loco.max) }} />
          <span className="tc-bar__txt">{loco.hp}</span>
        </div>
      </div>
      <div className={`tc-scrap${flash ? " is-flash" : ""}`} key={flash} title="Scrap — earned from wrecks and stations">
        <Icon name="scrap" size={20} />
        <strong>{hud.scrap}</strong>
      </div>
      <div className="tc-route" title="Route progress">
        <div className="tc-route__labels">
          <span>{route.from}</span>
          <span className="tc-route__pct">{Math.floor(hud.progress * 100)}%</span>
          <span>{route.to}</span>
        </div>
        <div className="tc-route__track">
          <div className="tc-route__fill" style={{ width: pct(hud.progress, 1) }} />
          {stops.map((s) => (
            <span key={s.at} className={`tc-route__stop${hud.d >= s.at - 1 ? " is-done" : ""}`} style={{ left: pct(s.at, L) }} title={s.name}>
              <Icon name="flag" size={11} />
            </span>
          ))}
          {fin && (
            <span className={`tc-route__boss${hud.final && hud.final.resolved ? " is-done" : ""}`} style={{ left: pct(fin.at, L) }} title={fin.boss ? BOSSES[fin.boss].name : "Final assault"}>
              <Icon name={fin.boss ? "boss" : "warn"} size={12} />
            </span>
          )}
          <span className="tc-route__train" style={{ left: pct(hud.progress, 1) }}>
            <Icon name="loco" size={14} />
          </span>
        </div>
      </div>
      <div className={`tc-threat is-${threat}`} aria-live="polite">
        <span className="tc-threat__dot" />
        {threatText}
      </div>
      <button type="button" className={`tc-iconbtn tc-speed${hud.speed === 2 ? " is-on" : ""}`} onClick={onSpeed} aria-label={`Game speed ${hud.speed}x (S)`}>
        <Icon name="fast" size={16} />
        <span>{hud.speed}x</span>
      </button>
    </div>
  );
}

/* ================================================================ car strip */
export function CarStrip({ hud, selected, onSelect, highlight }) {
  return (
    <div className="tc-strip" role="listbox" aria-label="Train cars">
      {[...hud.cars].map((c) => {
        const f = c.hp / c.max;
        const label = c.kind === "loco" ? "LOCO" : `W${c.index}`;
        return (
          <button
            key={c.index}
            type="button"
            role="option"
            aria-selected={selected === c.index}
            className={`tc-chip${selected === c.index ? " is-sel" : ""}${c.disabled ? " is-off" : ""}${highlight === c.index ? " is-hint" : ""}${c.kind === "loco" ? " is-loco" : ""}`}
            onClick={() => onSelect(selected === c.index ? null : c.index)}
            aria-label={`${c.kind === "loco" ? "Locomotive" : `Wagon ${c.index}`}, ${c.hp} of ${c.max} HP${c.module ? `, ${MODULES[c.module.type].name} level ${c.module.level}` : c.kind === "wagon" ? ", empty mount" : ""}`}
          >
            <span className="tc-chip__icon">{c.kind === "loco" ? <Icon name="loco" size={18} /> : c.module ? <ModuleIcon type={c.module.type} size={22} /> : <span className="tc-chip__empty">+</span>}</span>
            <span className="tc-chip__name">
              {label}
              {c.module && <i className="tc-pips">{"▮".repeat(c.module.level)}</i>}
            </span>
            <span className="tc-chip__hp">
              <span style={{ width: pct(c.hp, c.max) }} className={f < 0.3 ? "is-crit" : f < 0.6 ? "is-low" : ""} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================ wagon panel */
export function WagonPanel({ hud, index, onBuild, onUpgrade, onSell, onRepair, onClose, panelRef, compact, tutorialHl }) {
  const c = hud.cars[index];
  if (!c) return null;
  const scrap = hud.scrap;
  const hurt = c.hp < c.max;
  const repairOk = hurt && hud.emergencyCd <= 0 && scrap >= EMERGENCY.cost;
  const RepairBtn = (
    <button type="button" className="tc-act tc-act--repair" disabled={!repairOk} onClick={() => onRepair(index)} title={`Emergency repair: +${Math.round(EMERGENCY.share * 100)}% HP, ${EMERGENCY.cost} Scrap, ${EMERGENCY.cooldown}s cooldown (R)`}>
      <Icon name="wrench" size={16} />
      <span>{hud.emergencyCd > 0 ? `REPAIR ${hud.emergencyCd}s` : c.disabled ? "REVIVE" : "REPAIR"}</span>
      <em>
        <Icon name="scrap" size={13} />
        {EMERGENCY.cost}
      </em>
    </button>
  );
  const m = c.module;
  return (
    <div className={`tc-panel${compact ? " is-sheet" : ""}`} ref={panelRef} role="dialog" aria-label={c.kind === "loco" ? "Locomotive" : `Wagon ${index}`}>
      <div className="tc-panel__head">
        <strong>{c.kind === "loco" ? "LOCOMOTIVE" : `WAGON ${index}`}</strong>
        <div className={`tc-bar tc-bar--sm${c.hp / c.max < 0.3 ? " is-crit" : ""}`}>
          <div className="tc-bar__fill" style={{ width: pct(c.hp, c.max) }} />
          <span className="tc-bar__txt">
            {c.hp}/{c.max}
          </span>
        </div>
        {c.disabled && <span className="tc-tag tc-tag--red">DISABLED</span>}
        <button type="button" className="tc-panel__x" onClick={onClose} aria-label="Close (Esc)">
          <Icon name="close" size={16} />
        </button>
      </div>
      {c.kind === "loco" ? (
        <div className="tc-panel__body">
          <p className="tc-panel__note">Unarmed. Arm the wagons around it — if the locomotive is destroyed, the journey fails.</p>
          <div className="tc-panel__acts">{RepairBtn}</div>
        </div>
      ) : !m ? (
        <div className="tc-panel__body">
          <p className="tc-panel__note">{c.disabled ? "Wrecked mount — modules stay offline until it is repaired to 40%." : "Empty mount — fit a module:"}</p>
          <div className="tc-build">
            {MODULE_IDS.map((id, k) => {
              const M = MODULES[id];
              const locked = !hud.modules.includes(id);
              const poor = scrap < M.cost;
              return (
                <button key={id} type="button" className={`tc-buildbtn${locked ? " is-locked" : ""}${poor && !locked ? " is-poor" : ""}${tutorialHl === id ? " is-hint" : ""}`} disabled={locked || poor} onClick={() => onBuild(index, id)} title={locked ? "Unlocked later in the campaign" : `${M.name}: ${M.role} (${k + 1})`}>
                  <ModuleIcon type={id} size={compact ? 26 : 30} />
                  <span className="tc-buildbtn__name">{M.short}</span>
                  {locked ? (
                    <span className="tc-buildbtn__cost">
                      <Icon name="lock" size={12} /> LOCKED
                    </span>
                  ) : (
                    <span className="tc-buildbtn__cost">
                      <Icon name="scrap" size={13} />
                      {M.cost}
                    </span>
                  )}
                  <span className="tc-buildbtn__role">{M.role}</span>
                </button>
              );
            })}
          </div>
          {hurt && <div className="tc-panel__acts">{RepairBtn}</div>}
        </div>
      ) : (
        <ModuleBody c={c} m={m} scrap={scrap} onUpgrade={onUpgrade} onSell={onSell} index={index} RepairBtn={RepairBtn} />
      )}
    </div>
  );
}

function ModuleBody({ c, m, scrap, onUpgrade, onSell, index, RepairBtn }) {
  const M = MODULES[m.type];
  const max = m.level >= M.maxLevel;
  const cost = max ? 0 : M.upgradeCost[m.level - 1];
  const L = m.level;
  const N = Math.min(M.maxLevel, L + 1);
  const rows =
    m.type === "repair"
      ? [
          ["REPAIR", `${stat("repair", "repairRate", L)}/s`, `${stat("repair", "repairRate", N)}/s`],
          ["REACH", `±${stat("repair", "reach", L)} car`, `±${stat("repair", "reach", N)} car`],
        ]
      : [
          ["DMG", stat(m.type, "damage", L), stat(m.type, "damage", N)],
          ["RATE", `${stat(m.type, "attackSpeed", L)}/s`, `${stat(m.type, "attackSpeed", N)}/s`],
          ["RANGE", stat(m.type, "range", L), stat(m.type, "range", N)],
          ...(m.type === "cannon" ? [["SPLASH", stat("cannon", "splashRadius", L), stat("cannon", "splashRadius", N)]] : []),
        ];
  const refund = Math.floor(invested(m.type, L) * 0.5);
  return (
    <div className="tc-panel__body">
      <div className="tc-mod">
        <ModuleIcon type={m.type} size={36} />
        <div>
          <strong>
            {M.name.toUpperCase()} <span className="tc-lvl">LV {L}</span>
          </strong>
          <small>{M.role}</small>
        </div>
      </div>
      <table className="tc-stats">
        <tbody>
          {rows.map(([k, a, b]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{a}</td>
              {!max && <td className={String(a) !== String(b) ? "is-up" : ""}>{String(a) !== String(b) ? `→ ${b}` : ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tc-panel__acts">
        <button type="button" className="tc-act tc-act--up" disabled={max || scrap < cost || c.disabled} onClick={() => onUpgrade(index)} title={max ? "Max level" : `Upgrade to level ${L + 1} (U)`}>
          <Icon name="up" size={16} />
          <span>{max ? "MAX LEVEL" : `UPGRADE LV${L + 1}`}</span>
          {!max && (
            <em>
              <Icon name="scrap" size={13} />
              {cost}
            </em>
          )}
        </button>
        {RepairBtn}
        <button type="button" className="tc-act tc-act--sell" onClick={() => onSell(index)} title={`Scrap this module to replace it (+${refund} Scrap)`}>
          <Icon name="recycle" size={16} />
          <span>REPLACE</span>
          <em>+{refund}</em>
        </button>
      </div>
    </div>
  );
}

/* ================================================================ banners */
export function Banner({ banner }) {
  if (!banner) return null;
  return (
    <div className={`tc-banner is-${banner.kind}`} key={banner.key} role="status" aria-live="assertive">
      {banner.kicker && <small>{banner.kicker}</small>}
      <strong>
        {banner.icon && <span className="tc-banner__icon">{banner.icon}</span>}
        {banner.text}
      </strong>
      {banner.sub && <span>{banner.sub}</span>}
    </div>
  );
}

export function Hint({ text }) {
  if (!text) return null;
  return (
    <div className="tc-hint" role="note" key={text}>
      <Icon name="next" size={14} />
      {text}
    </div>
  );
}

export function CheckpointBar({ cp, onContinue }) {
  if (!cp || !cp.arrived) return null;
  return (
    <div className="tc-cp" role="status">
      <Icon name="flag" size={18} />
      <div>
        <strong>{cp.name.toUpperCase()}</strong>
        <span>{cp.clear ? `Repair, build & upgrade · departing in ${cp.t}s` : "Clear the raiders before departing"}</span>
      </div>
      <button type="button" className="tc-btn tc-btn--go" disabled={!cp.clear} onClick={onContinue}>
        CONTINUE <Icon name="next" size={16} />
      </button>
    </div>
  );
}

export function BossBar({ boss }) {
  if (!boss || boss.dead) return null;
  const B = BOSSES[boss.type];
  return (
    <div className={`tc-bossbar${boss.vent ? " is-vent" : ""}`} role="status">
      <EnemyIcon type={boss.type} size={26} />
      <div className="tc-bossbar__main">
        <div className="tc-bossbar__name">
          <strong>{B.name.toUpperCase()}</strong>
          {boss.vent && <em>ARMOUR OPEN — HIT IT NOW</em>}
        </div>
        <div className="tc-bar tc-bar--boss">
          <div className="tc-bar__fill" style={{ width: pct(boss.hp, boss.max) }} />
        </div>
      </div>
    </div>
  );
}

/* ================================================================ overlays */
export function PauseOverlay({ onResume, onRestart, onSettings, onQuit }) {
  return (
    <div className="tc-overlay" role="dialog" aria-label="Paused">
      <div className="tc-card tc-card--pause">
        <h2>PAUSED</h2>
        <button type="button" className="tc-btn tc-btn--primary" onClick={onResume} autoFocus>
          <Icon name="play" size={16} /> RESUME
        </button>
        <button type="button" className="tc-btn" onClick={onRestart}>
          <Icon name="rotate" size={16} /> RESTART ROUTE
        </button>
        <button type="button" className="tc-btn" onClick={onSettings}>
          <Icon name="gear" size={16} /> SETTINGS
        </button>
        <button type="button" className="tc-btn" onClick={onQuit}>
          <Icon name="map" size={16} /> ROUTES
        </button>
      </div>
    </div>
  );
}

export function ResultOverlay({ end, route, hasNext, onNext, onReplay, onRoutes }) {
  const s = end.summary;
  const won = s.result === "won";
  const r = s.run;
  const out = end.out || {};
  return (
    <div className={`tc-overlay tc-result is-${won ? "won" : "lost"}`} role="dialog" aria-label={won ? "Journey complete" : "Train destroyed"}>
      <div className="tc-card tc-card--result">
        <small className="tc-result__kicker">
          {regionOf(route.region).name.toUpperCase()} · ROUTE {route.id}
        </small>
        <h2>{won ? "JOURNEY COMPLETE" : "TRAIN DESTROYED"}</h2>
        <p className="tc-result__sub">{won ? `${route.from} → ${route.to}` : "The locomotive was lost. Arm the cars near it and keep it repaired."}</p>
        {won && (
          <div className="tc-result__stars">
            <Stars n={s.stars} size={40} />
            <span>{s.stars === 3 ? "Locomotive above 80% — flawless command" : s.stars === 2 ? "3★: finish with the locomotive above 80%" : "2★: locomotive above 50% · 3★: above 80%"}</span>
          </div>
        )}
        <dl className="tc-result__grid">
          <div>
            <dt>Locomotive HP</dt>
            <dd>
              {s.locoHp}/{s.locoMax}
            </dd>
          </div>
          <div>
            <dt>Wagons surviving</dt>
            <dd>
              {s.wagonsSurviving}/{s.wagonsTotal}
            </dd>
          </div>
          <div>
            <dt>Enemies defeated</dt>
            <dd>{r.kills}</dd>
          </div>
          <div>
            <dt>Scrap earned</dt>
            <dd>{Math.round(r.scrapEarned)}</dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>{fmtKm(r.distance)}</dd>
          </div>
          <div>
            <dt>Battle time</dt>
            <dd>{fmtTime(r.time)}</dd>
          </div>
        </dl>
        {won && (out.unlockedRoute || out.newLivery) && (
          <div className="tc-result__unlock">
            {out.unlockedRoute && <span>Route {out.unlockedRoute} unlocked</span>}
            {out.newLivery && <span>New train livery unlocked</span>}
          </div>
        )}
        <div className="tc-result__btns">
          {won && hasNext && (
            <button type="button" className="tc-btn tc-btn--primary" onClick={onNext} autoFocus>
              NEXT ROUTE <Icon name="next" size={16} />
            </button>
          )}
          <button type="button" className={`tc-btn${!won || !hasNext ? " tc-btn--primary" : ""}`} onClick={onReplay}>
            <Icon name="rotate" size={16} /> {won ? "REPLAY" : "RETRY"}
          </button>
          <button type="button" className="tc-btn" onClick={onRoutes}>
            <Icon name="map" size={16} /> ROUTES
          </button>
        </div>
      </div>
    </div>
  );
}

export { ENEMIES };
