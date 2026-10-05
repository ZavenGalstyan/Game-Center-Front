/**
 * Castle Rush — in-battle HUD (DOM over the canvas).
 * Top: castle health for both sides, battle name + clock, pause, speed.
 * Bottom: gold + income, the deployment cards, treasury, army size.
 * Everything here is driven by the engine's small HUD snapshot; clicks go
 * back through the engine's validated deploy / upgrade calls.
 */
import { UNITS } from "../data/units.js";
import { ARMY_CAP, TREASURY } from "../engine/constants.js";
import { kingdomOf } from "../data/kingdoms.js";
import { Icon, UnitIcon, Stars, fmtTime, fmtNum } from "./ui.jsx";

function CastleBar({ side, hp, max, label }) {
  const f = Math.max(0, Math.min(1, hp / Math.max(1, max)));
  return (
    <div className={`cr-cbar cr-cbar--${side}${f < 0.3 ? " is-low" : ""}`} title={`${label}: ${hp} / ${max}`}>
      <span className="cr-cbar__icon">
        <Icon name="castle" size={18} />
      </span>
      <div className="cr-cbar__body">
        <div className="cr-cbar__label">
          <span>{label}</span>
          <b>
            {fmtNum(hp)}
            <small>/{fmtNum(max)}</small>
          </b>
        </div>
        <div className="cr-cbar__track">
          <i style={{ transform: `scaleX(${f})` }} />
        </div>
      </div>
    </div>
  );
}

export function TopBar({ hud, battle, onPause, onSpeed }) {
  return (
    <div className="cr-top cr-ui">
      <button type="button" className="cr-iconbtn" aria-label="Pause" onClick={onPause}>
        <Icon name="pause" />
      </button>
      <CastleBar side="player" hp={hud.hp} max={hud.maxHp} label="YOUR CASTLE" />
      <div className="cr-top__mid">
        <span className="cr-top__name">
          {battle.id}. {battle.name}
        </span>
        <span className="cr-top__time">
          <Icon name="clock" size={13} /> {fmtTime(hud.time)}
        </span>
      </div>
      <CastleBar side="enemy" hp={hud.enemyHp} max={hud.enemyMax} label="ENEMY CASTLE" />
      <button type="button" className={`cr-speed${hud.speed === 2 ? " is-on" : ""}`} aria-label={`Game speed ${hud.speed}x`} onClick={onSpeed}>
        <span>{hud.speed}x</span>
      </button>
    </div>
  );
}

export function UnitBar({ hud, onDeploy, onTreasury, highlight, flash }) {
  const full = hud.army >= ARMY_CAP;
  const tCost = hud.treasuryCost;
  return (
    <div className="cr-bottom cr-ui">
      <div className={`cr-gold${flash ? " is-flash" : ""}`} key={`g${flash}`}>
        <Icon name="coin" size={30} />
        <div>
          <b>{fmtNum(hud.gold)}</b>
          <span>+{hud.income} / sec</span>
        </div>
      </div>
      <div className="cr-cards">
        {hud.roster.map((t, i) => {
          const def = UNITS[t];
          const cd = hud.cooldowns[t] || 0;
          const afford = hud.gold >= def.cost;
          const ready = afford && cd <= 0 && !full;
          const prog = Math.min(1, hud.gold / def.cost);
          return (
            <button
              key={t}
              type="button"
              className={`cr-card${ready ? " is-ready" : ""}${!afford ? " is-poor" : ""}${highlight === t ? " is-hint" : ""}`}
              aria-disabled={!ready}
              aria-label={`Deploy ${def.name}, ${def.cost} gold${!afford ? " (not enough gold)" : cd > 0 ? " (recharging)" : full ? " (army full)" : ""}`}
              onClick={() => onDeploy(t)}
            >
              <span className="cr-card__key">{i + 1}</span>
              <span className="cr-card__art">
                <UnitIcon type={t} size={38} />
              </span>
              <span className="cr-card__name">{def.name}</span>
              <span className="cr-card__cost">
                <Icon name="coin" size={13} />
                {def.cost}
              </span>
              {!afford && <span className="cr-card__fill" style={{ transform: `scaleX(${prog})` }} />}
              {cd > 0 && <span className="cr-card__cd" style={{ "--cd": cd }} />}
            </button>
          );
        })}
      </div>
      {hud.upgrades && (
        <button
          type="button"
          className={`cr-treasury${tCost != null && hud.gold >= tCost ? " is-ready" : ""}`}
          aria-disabled={tCost == null || hud.gold < tCost}
          onClick={onTreasury}
          aria-label={tCost == null ? "Treasury fully upgraded" : `Upgrade treasury for ${tCost} gold: +${TREASURY.perLevel} gold per second`}
          title="Treasury: more gold per second for the rest of this battle"
        >
          <Icon name="chest" size={20} />
          <span className="cr-treasury__lbl">TREASURY {hud.treasury > 0 ? `${hud.treasury}/${TREASURY.costs.length}` : ""}</span>
          {tCost != null ? (
            <span className="cr-treasury__cost">
              +{TREASURY.perLevel}/s · <Icon name="coin" size={12} />
              {tCost}
            </span>
          ) : (
            <span className="cr-treasury__cost">MAX</span>
          )}
        </button>
      )}
      <div className={`cr-army${full ? " is-full" : ""}`} title="Soldiers on the field">
        <Icon name="people" size={16} />
        <b>
          {hud.army}/{ARMY_CAP}
        </b>
      </div>
    </div>
  );
}

export function Banner({ banner }) {
  if (!banner) return null;
  return (
    <div className={`cr-banner cr-banner--${banner.kind}`} key={banner.key} role="status">
      {banner.kicker && <span className="cr-banner__kicker">{banner.kicker}</span>}
      <strong>{banner.text}</strong>
      {banner.sub && <span className="cr-banner__sub">{banner.sub}</span>}
      {banner.unit && (
        <span className="cr-banner__unit">
          <UnitIcon type={banner.unit} size={34} />
          <span>
            <b>NEW UNIT · {UNITS[banner.unit].name.toUpperCase()}</b>
            <em>{UNITS[banner.unit].blurb}</em>
          </span>
        </span>
      )}
    </div>
  );
}

export function Hint({ text }) {
  if (!text) return null;
  return (
    <div className="cr-hint cr-ui" key={text} role="status">
      {text}
    </div>
  );
}

export function PauseOverlay({ onResume, onRestart, onSettings, onQuit }) {
  return (
    <div className="cr-overlay cr-ui" role="dialog" aria-label="Paused">
      <div className="cr-panel cr-panel--narrow">
        <h2 className="cr-title-sm">PAUSED</h2>
        <div className="cr-stack">
          <button type="button" className="cr-btn cr-btn--primary cr-btn--big" onClick={onResume} autoFocus>
            <Icon name="play" /> RESUME
          </button>
          <button type="button" className="cr-btn" onClick={onRestart}>
            <Icon name="restart" /> RESTART BATTLE
          </button>
          <button type="button" className="cr-btn" onClick={onSettings}>
            <Icon name="gear" /> SETTINGS
          </button>
          <button type="button" className="cr-btn cr-btn--ghost" onClick={onQuit}>
            <Icon name="map" /> LEAVE TO BATTLES
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResultOverlay({ end, battle, hasNext, onNext, onReplay, onLevels }) {
  const s = end.summary;
  const won = s.result === "won";
  const r = s.run;
  const k = kingdomOf(battle.kingdom);
  return (
    <div className={`cr-overlay cr-overlay--result cr-ui ${won ? "is-won" : "is-lost"}`} role="dialog" aria-label={won ? "Victory" : "Defeat"}>
      <div className="cr-panel cr-result">
        <span className="cr-result__kicker">
          {k.name.toUpperCase()} · BATTLE {battle.id}
        </span>
        <h2 className="cr-result__title">{won ? "VICTORY" : "DEFEAT"}</h2>
        {won ? <Stars n={s.stars} size={34} className="cr-result__stars" /> : <p className="cr-result__sub">Your castle has fallen. Regroup and try a new plan.</p>}
        <div className="cr-result__grid">
          <div>
            <Icon name="clock" size={16} />
            <span>Battle time</span>
            <b>{fmtTime(r.time)}</b>
          </div>
          <div>
            <Icon name="flag" size={16} />
            <span>Units deployed</span>
            <b>{r.deployed}</b>
          </div>
          {won ? (
            <>
              <div>
                <Icon name="swords" size={16} />
                <span>Enemies defeated</span>
                <b>{r.kills}</b>
              </div>
              <div>
                <Icon name="castle" size={16} />
                <span>Castle health</span>
                <b>{Math.round((s.castleHp / s.castleMax) * 100)}%</b>
              </div>
            </>
          ) : (
            <>
              <div>
                <Icon name="castle" size={16} />
                <span>Enemy castle left</span>
                <b>
                  {fmtNum(s.enemyHp)} <small>/ {fmtNum(s.enemyMax)}</small>
                </b>
              </div>
              <div>
                <Icon name="swords" size={16} />
                <span>Enemies defeated</span>
                <b>{r.kills}</b>
              </div>
            </>
          )}
        </div>
        {won && end.out?.unlockedNew && (
          <div className="cr-result__unlock">
            <UnitIcon type={end.out.unlockedNew} size={34} />
            <span>
              <b>NEW UNIT UNLOCKED</b> {UNITS[end.out.unlockedNew].name}
            </span>
          </div>
        )}
        {won && <p className="cr-result__tip">{s.stars < 3 ? (s.stars < 2 ? "2 stars: finish with 50% castle health" : "3 stars: finish with 80% castle health") : battle.final ? "The Final Fortress has fallen. The realm is yours!" : "Flawless command."}</p>}
        {!won && <p className="cr-result__tip">{lossTip(r)}</p>}
        <div className="cr-result__actions">
          {won && hasNext && (
            <button type="button" className="cr-btn cr-btn--primary cr-btn--big" onClick={onNext} autoFocus>
              NEXT BATTLE <Icon name="next" />
            </button>
          )}
          {won ? (
            <button type="button" className="cr-btn" onClick={onReplay} autoFocus={!hasNext}>
              <Icon name="restart" /> REPLAY
            </button>
          ) : (
            <button type="button" className="cr-btn cr-btn--primary cr-btn--big" onClick={onReplay} autoFocus>
              <Icon name="restart" /> RETRY
            </button>
          )}
          <button type="button" className="cr-btn cr-btn--ghost" onClick={onLevels}>
            <Icon name="map" /> BATTLES
          </button>
        </div>
      </div>
    </div>
  );
}

function lossTip(r) {
  const d = r.deployedByType;
  if (r.deployed < 6) return "Tip: keep spending — idle gold doesn't defend the gate.";
  if (d.archer === 0 && d.swordsman > 6) return "Tip: Archers behind a frontline deal damage safely.";
  if (d.shield === 0 && d.archer > 3) return "Tip: Shield Guards soak arrows and protect your Archers.";
  if (d.knight === 0) return "Tip: save up for a Knight to smash shield walls.";
  return "Tip: bank gold, then deploy a group at once to break their line.";
}
