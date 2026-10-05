/**
 * Castle Rush — menu screens (DOM over the living 3D backdrop).
 * Main Menu · Battles (kingdom campaign map) · Army · Statistics · Settings.
 * Every screen is laid out to fit the GamePlayer stage without scrolling.
 */
import { UNITS, UNIT_IDS, dps } from "../data/units.js";
import { KINGDOMS, kingdomOf } from "../data/kingdoms.js";
import { battlesOfKingdom, getBattle, difficultyLabel } from "../data/battles.js";
import { isUnlocked, totalStars, kingdomStars } from "../utils/storage.js";
import { Icon, UnitIcon, Stars, fmtTime, fmtNum } from "./ui.jsx";

/* ================================================================ main menu */
export function MainMenu({ progress, onPlay, onBattles, onArmy, onStats, onSettings }) {
  const stars = totalStars(progress);
  const next = progress.unlockedBattle;
  const b = getBattle(Math.min(next, 30));
  const allDone = Object.keys(progress.battleStars).length >= 30;
  return (
    <div className="cr-menu cr-ui">
      <div className="cr-menu__brand">
        <span className="cr-menu__crest" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="100%" height="100%">
            <path d="M32 4l24 8v18c0 16-11 26-24 30C19 56 8 46 8 30V12z" fill="#1f4f9c" stroke="#f3c64f" strokeWidth="3" />
            <path d="M18 40V26h5v-5h5v5h8v-5h5v5h5v14z" fill="#f3c64f" />
            <path d="M29 40v-6a3 3 0 0 1 6 0v6z" fill="#1f4f9c" />
          </svg>
        </span>
        <h1 className="cr-menu__title">
          CASTLE <span>RUSH</span>
        </h1>
        <p className="cr-menu__tag">BUILD • DEPLOY • CONQUER</p>
      </div>
      <div className="cr-menu__actions">
        <button type="button" className="cr-btn cr-btn--primary cr-btn--hero" onClick={onPlay} autoFocus>
          <Icon name="play" size={22} />
          <span className="cr-btn__stack">
            <b>PLAY</b>
            <small>{allDone ? "Replay any battle" : `Battle ${b.id} · ${b.name}`}</small>
          </span>
        </button>
        <div className="cr-menu__grid">
          <button type="button" className="cr-btn cr-btn--tile" onClick={onBattles}>
            <Icon name="map" size={20} /> BATTLES
          </button>
          <button type="button" className="cr-btn cr-btn--tile" onClick={onArmy}>
            <Icon name="army" size={20} /> ARMY
          </button>
          <button type="button" className="cr-btn cr-btn--tile" onClick={onStats}>
            <Icon name="chart" size={20} /> STATISTICS
          </button>
          <button type="button" className="cr-btn cr-btn--tile" onClick={onSettings}>
            <Icon name="gear" size={20} /> SETTINGS
          </button>
        </div>
        <div className="cr-menu__foot">
          <span>
            <Icon name="star" size={15} /> {stars} / 90
          </span>
          <span>
            <Icon name="crown" size={15} /> {kingdomOf(b.kingdom).name}
          </span>
        </div>
      </div>
    </div>
  );
}

function Head({ title, onBack, right }) {
  return (
    <div className="cr-head">
      <button type="button" className="cr-iconbtn" aria-label="Back" onClick={onBack}>
        <Icon name="back" />
      </button>
      <h2>{title}</h2>
      <div className="cr-head__right">{right}</div>
    </div>
  );
}

/* ================================================================ battles */
// node positions on the campaign path, in % of the map box
const NODES = [
  [9, 74],
  [25, 44],
  [42, 66],
  [58, 34],
  [74, 58],
  [90, 28],
];
function pathD() {
  let d = `M ${NODES[0][0] * 10} ${NODES[0][1] * 4.2}`;
  for (let i = 1; i < NODES.length; i++) {
    const [x0, y0] = NODES[i - 1];
    const [x1, y1] = NODES[i];
    const mx = ((x0 + x1) / 2) * 10;
    d += ` C ${mx} ${y0 * 4.2}, ${mx} ${y1 * 4.2}, ${x1 * 10} ${y1 * 4.2}`;
  }
  return d;
}
const PATH = pathD();

function MapDecor({ k }) {
  // simple themed doodles on the parchment
  const c = k.props;
  const tree = (x, y, s = 1, key) =>
    c === "desert" ? (
      <g key={key} transform={`translate(${x} ${y}) scale(${s})`} opacity=".55">
        <path d="M0 0v-26" stroke="#7a5532" strokeWidth="3" />
        <path d="M0-26c-10-2-16 2-20 6M0-26c10-2 16 2 20 6M0-26c-6-8-12-8-16-6M0-26c6-8 12-8 16-6" stroke="#5f8a3a" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    ) : c === "shadow" ? (
      <g key={key} transform={`translate(${x} ${y}) scale(${s})`} opacity=".55">
        <path d="M0 0v-24M0-14l-8-8M0-18l7-7M-8-22l-3-4M7-25l3-3" stroke="#4a3a52" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </g>
    ) : (
      <g key={key} transform={`translate(${x} ${y}) scale(${s})`} opacity=".5">
        <path d="M0 0v-8" stroke="#6a4528" strokeWidth="3" />
        <path d="M-11-6L0-30 11-6z" fill={c === "frozen" ? "#4a7a6a" : "#3f7a40"} />
        {c === "frozen" && <path d="M-5-20L0-30 5-20z" fill="#fff" />}
      </g>
    );
  return (
    <g>
      <path d="M40 120l60-70 50 50 40-40 70 60" fill="none" stroke="rgba(90,70,50,.25)" strokeWidth="3" />
      <path d="M690 400l50-60 40 30 60-70 70 100" fill="none" stroke="rgba(90,70,50,.22)" strokeWidth="3" />
      {[
        [140, 380, 1],
        [180, 395, 0.8],
        [320, 120, 0.9],
        [360, 110, 1.1],
        [520, 380, 1],
        [560, 395, 0.8],
        [660, 90, 0.9],
        [840, 360, 1],
        [880, 380, 0.8],
        [470, 200, 0.8],
      ].map(([x, y, s], i) => tree(x, y, s, i))}
      <g transform="translate(935 60)" opacity=".7">
        <path d="M-26 40V8h8V0h8v8h6V-6h8V8h6V0h8v8h8v32z" fill="rgba(110,40,30,.55)" />
      </g>
    </g>
  );
}

export function BattlesScreen({ progress, kingdom, selected, onKingdom, onSelect, onPlay, onBack }) {
  const k = kingdomOf(kingdom);
  const list = battlesOfKingdom(kingdom);
  const sel = getBattle(selected) && getBattle(selected).kingdom === kingdom ? getBattle(selected) : list.find((b) => isUnlocked(progress, b.id) && !progress.battleStars[b.id]) || list.filter((b) => isUnlocked(progress, b.id)).pop() || list[0];
  const selUnlocked = isUnlocked(progress, sel.id);
  // progress along the path: up to the last unlocked node
  const reach = list.filter((b) => isUnlocked(progress, b.id)).length;
  return (
    <div className="cr-screen cr-ui" data-kingdom={k.props}>
      <Head
        title="BATTLES"
        onBack={onBack}
        right={
          <span className="cr-chip">
            <Icon name="star" size={15} /> {totalStars(progress)} / 90
          </span>
        }
      />
      <div className="cr-ktabs" role="tablist" aria-label="Kingdoms">
        {KINGDOMS.map((kk) => {
          const first = battlesOfKingdom(kk.id)[0];
          const open = isUnlocked(progress, first.id);
          return (
            <button key={kk.id} type="button" role="tab" aria-selected={kk.id === kingdom} className={`cr-ktab cr-ktab--${kk.props}${kk.id === kingdom ? " is-on" : ""}${open ? "" : " is-locked"}`} onClick={() => onKingdom(kk.id)}>
              <span className="cr-ktab__dot" />
              <span className="cr-ktab__name">{kk.name}</span>
              <span className="cr-ktab__stars">{open ? <><Icon name="star" size={12} /> {kingdomStars(progress, kk.id)}/18</> : <Icon name="lock" size={13} />}</span>
            </button>
          );
        })}
      </div>
      <div className="cr-campaign">
        <div className={`cr-map cr-map--${k.props}`}>
          <svg className="cr-map__svg" viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true">
            <MapDecor k={k} />
            <path d={PATH} className="cr-map__road" />
            <path d={PATH} className="cr-map__trail" pathLength="5" style={{ strokeDasharray: `${Math.max(0, reach - 1)} 99` }} />
          </svg>
          <span className="cr-map__title">{k.name.toUpperCase()}</span>
          {list.map((b, i) => {
            const open = isUnlocked(progress, b.id);
            const stars = progress.battleStars[b.id] || 0;
            const current = open && !stars;
            return (
              <button
                key={b.id}
                type="button"
                className={`cr-node${open ? "" : " is-locked"}${current ? " is-current" : ""}${sel.id === b.id ? " is-sel" : ""}${b.final ? " is-final" : ""}`}
                style={{ left: `${NODES[i][0]}%`, top: `${NODES[i][1]}%` }}
                onClick={() => onSelect(b.id)}
                onDoubleClick={() => open && onPlay(b.id)}
                aria-label={`Battle ${b.id}: ${b.name}${open ? `, ${stars} stars` : ", locked"}`}
              >
                <span className="cr-node__badge">{open ? b.id : <Icon name="lock" size={16} />}</span>
                {open && <Stars n={stars} size={11} className="cr-node__stars" />}
              </button>
            );
          })}
        </div>
        <div className="cr-bcard">
          <span className="cr-bcard__kicker">
            BATTLE {sel.id} · {difficultyLabel(sel).toUpperCase()}
          </span>
          <h3>{sel.name}</h3>
          <p className="cr-bcard__tag">{sel.final ? "The last fortress of the Royal Empire." : k.tagline}</p>
          <ul className="cr-bcard__facts">
            <li>
              <Icon name="castle" size={15} /> Enemy castle <b>{fmtNum(sel.enemyHp)} HP</b>
            </li>
            <li>
              <Icon name="coin" size={15} /> Start gold <b>{sel.startGold}</b> · enemy <b>{sel.enemyGold}</b>
            </li>
            <li className="cr-bcard__units">
              <Icon name="army" size={15} /> Your army
              <span>
                {sel.playerUnits.map((t) => (
                  <UnitIcon key={t} type={t} size={24} />
                ))}
              </span>
            </li>
            <li className="cr-bcard__units">
              <Icon name="skull" size={15} /> Enemy
              <span>
                {sel.enemyUnits.map((t) => (
                  <UnitIcon key={t} type={t} size={24} side="enemy" />
                ))}
              </span>
            </li>
          </ul>
          {sel.intro && selUnlocked && <p className="cr-bcard__new">{sel.intro === "treasury" ? "NEW: Treasury upgrade" : `NEW UNIT: ${UNITS[sel.intro].name}`}</p>}
          <div className="cr-bcard__best">
            <Stars n={progress.battleStars[sel.id] || 0} size={18} />
          </div>
          <button type="button" className="cr-btn cr-btn--primary cr-btn--big" disabled={!selUnlocked} onClick={() => onPlay(sel.id)}>
            {selUnlocked ? (
              <>
                <Icon name="swords" /> FIGHT
              </>
            ) : (
              <>
                <Icon name="lock" /> WIN BATTLE {sel.id - 1}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================ army */
const MAXS = { maxHp: 330, damage: 35, moveSpeed: 1.75, attackRange: 6.6 };
const VS = {
  swordsman: { good: "Archers (catches them fast)", bad: "Knights one-on-one" },
  archer: { good: "Swordsmen behind a frontline", bad: "Shield Guards, anything that reaches it" },
  shield: { good: "Archers, holding the line", bad: "Knights" },
  knight: { good: "Shield Guards, lone soldiers", bad: "Swarms of cheap Swordsmen" },
};
function StatBar({ label, value, max, text }) {
  return (
    <div className="cr-sbar">
      <span>{label}</span>
      <div className="cr-sbar__track">
        <i style={{ transform: `scaleX(${Math.min(1, value / max)})` }} />
      </div>
      <b>{text ?? value}</b>
    </div>
  );
}
export function ArmyScreen({ progress, type, onType, onBack }) {
  const def = UNITS[type];
  const unlocked = progress.unlockedUnits.includes(type);
  return (
    <div className="cr-screen cr-screen--army cr-ui">
      <Head title="ARMY" onBack={onBack} />
      <div className="cr-army-layout">
        <div className="cr-roster" role="listbox" aria-label="Units">
          {UNIT_IDS.map((t) => {
            const u = UNITS[t];
            const open = progress.unlockedUnits.includes(t);
            return (
              <button key={t} type="button" role="option" aria-selected={t === type} className={`cr-roster__item${t === type ? " is-on" : ""}${open ? "" : " is-locked"}`} onClick={() => onType(t)}>
                <UnitIcon type={t} size={40} />
                <span>
                  <b>{u.name}</b>
                  <small>{open ? u.role : `Unlocks at battle ${u.unlockLevel}`}</small>
                </span>
                {!open && <Icon name="lock" size={15} />}
              </button>
            );
          })}
        </div>
        <div className="cr-army-spacer" />
        <div className="cr-unitcard">
          <span className="cr-unitcard__role">{def.role.toUpperCase()}</span>
          <h3>{def.name}</h3>
          <p>{def.blurb}</p>
          <div className="cr-unitcard__stats">
            <StatBar label="Health" value={def.maxHp} max={MAXS.maxHp} />
            <StatBar label="Damage" value={def.damage} max={MAXS.damage} text={`${def.damage} / ${def.attackCooldown}s`} />
            <StatBar label="Speed" value={def.moveSpeed} max={MAXS.moveSpeed} text={def.moveSpeed.toFixed(2)} />
            <StatBar label="Range" value={def.ranged ? def.attackRange : 0.6} max={MAXS.attackRange} text={def.ranged ? `${def.attackRange} (ranged)` : "Melee"} />
          </div>
          <div className="cr-unitcard__row">
            <span className="cr-chip">
              <Icon name="coin" size={15} /> {def.cost} gold
            </span>
            {def.armor > 0 && <span className="cr-chip">Armor {Math.round(def.armor * 100)}%</span>}
            {def.rangedResistance > 0 && <span className="cr-chip">Arrow resist {Math.round(def.rangedResistance * 100)}%</span>}
          </div>
          <div className="cr-unitcard__vs">
            <span>
              <b>Strong vs</b> {VS[type].good}
            </span>
            <span>
              <b>Weak vs</b> {VS[type].bad}
            </span>
            <span className="cr-unitcard__dps">DPS vs Swordsman {dps(type, "swordsman").toFixed(1)} · vs Knight {dps(type, "knight").toFixed(1)}</span>
          </div>
          {!unlocked && (
            <p className="cr-unitcard__lock">
              <Icon name="lock" size={14} /> Win battle {def.unlockLevel - 1} to recruit
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ statistics */
export function StatsScreen({ progress, onBack }) {
  const s = progress.statistics;
  const winRate = s.battlesPlayed ? Math.round((s.battlesWon / s.battlesPlayed) * 100) : 0;
  const tiles = [
    ["flag", "Battles played", fmtNum(s.battlesPlayed)],
    ["crown", "Battles won", fmtNum(s.battlesWon)],
    ["skull", "Battles lost", fmtNum(s.battlesLost)],
    ["star", "Stars earned", `${totalStars(progress)} / 90`],
    ["army", "Units deployed", fmtNum(s.unitsDeployed)],
    ["swords", "Enemies defeated", fmtNum(s.enemiesDefeated)],
    ["castle", "Castles destroyed", fmtNum(s.castlesDestroyed)],
    ["coin", "Gold earned", fmtNum(s.goldEarned)],
    ["coin", "Gold spent", fmtNum(s.goldSpent)],
    ["people", "Highest army", fmtNum(s.highestArmy)],
    ["clock", "Fastest victory", s.fastestVictory ? fmtTime(s.fastestVictory) : "—"],
    ["crown", "Perfect victories", fmtNum(s.perfectVictories)],
    ["clock", "Total play time", fmtTime(s.playTime)],
    ["chart", "Win rate", s.battlesPlayed ? `${winRate}%` : "—"],
  ];
  return (
    <div className="cr-screen cr-ui">
      <Head title="STATISTICS" onBack={onBack} />
      <div className="cr-stats">
        <div className="cr-stats__grid">
          {tiles.map(([ic, label, val]) => (
            <div key={label} className="cr-stat">
              <Icon name={ic} size={17} />
              <span>{label}</span>
              <b>{val}</b>
            </div>
          ))}
        </div>
        <div className="cr-stats__units">
          {[
            ["swordsman", s.swordsmen],
            ["archer", s.archers],
            ["shield", s.shields],
            ["knight", s.knights],
          ].map(([t, n]) => (
            <div key={t} className="cr-stat cr-stat--unit">
              <UnitIcon type={t} size={34} />
              <span>{UNITS[t].name}s deployed</span>
              <b>{fmtNum(n)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ settings */
function Toggle({ label, value, onChange, hint }) {
  return (
    <button type="button" role="switch" aria-checked={value} className={`cr-toggle${value ? " is-on" : ""}`} onClick={() => onChange(!value)}>
      <span className="cr-toggle__txt">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <span className="cr-toggle__sw" aria-hidden="true">
        <i />
      </span>
    </button>
  );
}
export function SettingsScreen({ settings, onChange, onBack, inGame = false }) {
  const set = (k) => (v) => onChange({ ...settings, [k]: v });
  return (
    <div className={`cr-screen cr-ui${inGame ? " cr-screen--overlay" : ""}`}>
      <Head title="SETTINGS" onBack={onBack} />
      <div className="cr-settings">
        <div className="cr-seg-row">
          <span>
            <b>Graphics quality</b>
            <small>Low: fewer props & effects · High: sharper shadows, more scenery</small>
          </span>
          <div className="cr-seg" role="radiogroup" aria-label="Graphics quality">
            {["low", "medium", "high"].map((g) => (
              <button key={g} type="button" role="radio" aria-checked={settings.graphics === g} className={settings.graphics === g ? "is-on" : ""} onClick={() => onChange({ ...settings, graphics: g })}>
                {g.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="cr-settings__grid">
          <Toggle label="Sound" value={settings.sound} onChange={set("sound")} hint="Combat & interface" />
          <Toggle label="Music" value={settings.music} onChange={set("music")} hint="Medieval ambience" />
          <Toggle label="Particles" value={settings.particles} onChange={set("particles")} hint="Sparks, dust, stones" />
          <Toggle label="Shadows" value={settings.shadows} onChange={set("shadows")} hint="Real-time sun shadows" />
          <Toggle label="Camera motion" value={settings.cameraMotion} onChange={set("cameraMotion")} hint="Menu drift, impact shake" />
          <Toggle label="Damage numbers" value={settings.damageNumbers} onChange={set("damageNumbers")} hint="Floating hit values" />
          <Toggle label="Reduced motion" value={settings.reducedMotion} onChange={set("reducedMotion")} hint="Calmer UI, no shake" />
          <Toggle label="Start at 2x speed" value={settings.speed === 2} onChange={(v) => onChange({ ...settings, speed: v ? 2 : 1 })} hint="Default battle speed" />
        </div>
      </div>
    </div>
  );
}
