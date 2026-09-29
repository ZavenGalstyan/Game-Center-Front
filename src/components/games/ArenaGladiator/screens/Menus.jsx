/**
 * Arena Gladiator — menu screens. Everything is dressed as part of the game
 * (stone, bronze, parchment), never as website cards or dashboards.
 */
import { useMemo, useState } from "react";
import { TunnelScene, PreviewScene } from "../three/MenuScenes.jsx";
import { ARENAS } from "../data/arenas.js";
import { ENEMIES, displayName } from "../data/enemies.js";
import { WEAPONS, ARMORS, weaponById, armorById } from "../data/weapons.js";
import {
  HELMETS, COLORS, HAIRS, RANKS, rankOf, nextRank, WEAPON_UNLOCKS, ARMOR_UNLOCKS, isFightUnlocked, nextOpponent, playerLook,
} from "../utils/progress.js";

const fmtTime = (s) => {
  s = Math.round(s || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
};

export function Back({ onClick, label = "BACK" }) {
  return (
    <button type="button" className="ag-back" onClick={onClick}>
      <span aria-hidden="true">‹</span> {label}
    </button>
  );
}

/* ================================================================== main menu */
export function MainMenu({ progress, look, equip, onNav, onContinue, cameraMode, onCamera }) {
  const next = nextOpponent(progress);
  const done = progress.careerProgress >= ENEMIES.length;
  const items = [
    ["arena", "ARENA"],
    ["training", "TRAINING"],
    ["equipment", "EQUIPMENT"],
    ["fighter", "FIGHTER"],
    ["stats", "STATISTICS"],
    ["settings", "SETTINGS"],
  ];
  return (
    <div className="ag-screen ag-menu">
      <TunnelScene look={look} equip={equip} reduced={progress.settings.reducedMotion} />
      <div className="ag-menu__shade" />
      <div className="ag-menu__panel">
        <div className="ag-title">
          <span className="ag-title__main">ARENA</span>
          <span className="ag-title__main ag-title__main--2">GLADIATOR</span>
          <span className="ag-title__sub">FIGHT • SURVIVE • BECOME LEGEND</span>
        </div>
        <div className="ag-menu__rank">
          <b>{progress.name}</b> · {rankOf(progress.careerProgress)} · {progress.careerProgress}/{ENEMIES.length} victories
        </div>
        <nav className="ag-menu__nav">
          <button type="button" className="ag-mbtn ag-mbtn--primary" onClick={onContinue}>
            <span>{done ? "CHAMPION'S REMATCH" : progress.careerProgress === 0 ? "BEGIN CAREER" : "CONTINUE"}</span>
            <small>{done ? "The Arena of Legends awaits" : `Fight ${next.n} — ${next.first} “${next.nickname}” ${next.last}`}</small>
          </button>
          {items.map(([id, label]) => (
            <button key={id} type="button" className="ag-mbtn" onClick={() => onNav(id)}>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="ag-menu__cam">
          <span>VIEW</span>
          <button type="button" className={`ag-chip${cameraMode === "third" ? " on" : ""}`} onClick={() => onCamera("third")}>THIRD PERSON</button>
          <button type="button" className={`ag-chip${cameraMode === "first" ? " on" : ""}`} onClick={() => onCamera("first")}>FIRST PERSON</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== arena journey */
export function ArenaSelect({ progress, onFight, onBack }) {
  const firstLocked = ARENAS.findIndex((a) => !progress.unlockedArenas.includes(a.id));
  const current = ARENAS.findIndex((a) => a.fights[0] <= progress.careerProgress + 1 && progress.careerProgress + 1 <= a.fights[1]);
  const [sel, setSel] = useState(current >= 0 ? current : firstLocked > 0 ? firstLocked - 1 : ARENAS.length - 1);
  const arena = ARENAS[sel];
  const unlocked = progress.unlockedArenas.includes(arena.id);
  const foes = ENEMIES.filter((e) => e.arena === arena.id);
  return (
    <div className={`ag-screen ag-journey ag-theme--${arena.id}`}>
      <div className="ag-journey__sky" />
      <header className="ag-head">
        <Back onClick={onBack} />
        <h2>THE ROAD TO LEGEND</h2>
        <div className="ag-head__meta">{rankOf(progress.careerProgress)}</div>
      </header>
      <div className="ag-journey__path">
        {ARENAS.map((a, i) => {
          const open = progress.unlockedArenas.includes(a.id);
          const beaten = ENEMIES.filter((e) => e.arena === a.id).every((e) => progress.defeatedEnemies.includes(e.id));
          return (
            <button
              key={a.id}
              type="button"
              className={`ag-gatecard ag-theme--${a.id}${i === sel ? " sel" : ""}${open ? "" : " locked"}${beaten ? " beaten" : ""}`}
              onClick={() => setSel(i)}
            >
              <span className="ag-gatecard__arch" />
              <span className="ag-gatecard__tier">{["I", "II", "III", "IV", "V"][i]}</span>
              <span className="ag-gatecard__name">{a.name}</span>
              <span className="ag-gatecard__state">{beaten ? "CONQUERED" : open ? `FIGHTS ${a.fights[0]}–${a.fights[1]}` : `WIN ${a.unlockAfter} FIGHTS`}</span>
            </button>
          );
        })}
      </div>
      <div className="ag-journey__detail">
        <div className="ag-journey__blurb">
          <h3>{arena.name}</h3>
          <p>{arena.blurb}</p>
          {!unlocked && <p className="ag-locked-note">Sealed — defeat the champion of the previous arena.</p>}
        </div>
        <div className="ag-foes">
          {foes.map((e) => {
            const beaten = progress.defeatedEnemies.includes(e.id);
            const avail = unlocked && isFightUnlocked(progress, e);
            const isNext = e.n === progress.careerProgress + 1;
            const W = weaponById(e.weapon);
            return (
              <button
                key={e.id}
                type="button"
                disabled={!avail}
                className={`ag-foe${beaten ? " beaten" : ""}${isNext ? " next" : ""}${e.champion ? " champ" : ""}`}
                onClick={() => onFight(e)}
                style={{ "--foe-cloth": e.look.cloth, "--foe-accent": e.look.accent, "--foe-skin": e.look.skin }}
              >
                <span className="ag-foe__num">{e.n}</span>
                <span className="ag-foe__bust" aria-hidden="true"><i /></span>
                <span className="ag-foe__name">{e.first} <em>“{e.nickname}”</em> {e.last}</span>
                <span className="ag-foe__style">{e.style} · {W.short}</span>
                <span className="ag-foe__tag">{beaten ? `BEATEN${progress.bestTimes[e.id] ? ` · ${Math.round(progress.bestTimes[e.id])}s` : ""}` : isNext ? "NEXT BOUT" : avail ? "OPEN" : "LOCKED"}</span>
                {avail && <span className="ag-foe__blurb">{e.blurb}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== training */
export function Training({ onStart, onBack }) {
  return (
    <div className="ag-screen ag-training">
      <header className="ag-head">
        <Back onClick={onBack} />
        <h2>TRAINING YARD</h2>
        <div className="ag-head__meta">Nothing here touches your career</div>
      </header>
      <div className="ag-training__body">
        <p className="ag-training__intro">
          Old <b>Doctore</b> has trained a hundred champions. He will stand still for you to learn your swings, or spar
          gently so you can practise blocking, parrying and dodging real attacks. He never lets you fall.
        </p>
        <div className="ag-training__cards">
          <button type="button" className="ag-tcard" onClick={() => onStart("sparring")}>
            <span className="ag-tcard__title">SPARRING</span>
            <span className="ag-tcard__desc">Doctore attacks slowly with clear wind-ups. Practise block, parry, dodge and counters.</span>
            <span className="ag-tcard__cta">ENTER THE YARD ›</span>
          </button>
          <button type="button" className="ag-tcard" onClick={() => onStart("dummy")}>
            <span className="ag-tcard__title">HOLD STILL</span>
            <span className="ag-tcard__desc">Doctore only defends… by standing there. Learn your range, combos, heavies and kicks.</span>
            <span className="ag-tcard__cta">ENTER THE YARD ›</span>
          </button>
        </div>
        <div className="ag-lessons">
          {[
            ["LIGHT", "Fast, cheap on stamina. Chain up to three: right, backhand, thrust."],
            ["HEAVY", "Slow wind-up, big damage. Breaks a tired guard. Faster right after a parry."],
            ["BLOCK", "Hold right click. Only protects your front. Every blocked hit costs stamina."],
            ["PARRY", "Raise your guard just before the blade lands (≈0.2 s window). Tapping it constantly won't work."],
            ["DODGE", "Space + direction. Short, only briefly untouchable — and it costs stamina."],
            ["KICK", "F. Weak, but it knocks a raised shield aside."],
          ].map(([t, d]) => (
            <div key={t} className="ag-lesson"><b>{t}</b><span>{d}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== equipment */
function StatBar({ label, v }) {
  return (
    <div className="ag-stat">
      <span>{label}</span>
      <i>{[1, 2, 3, 4, 5].map((k) => <b key={k} className={k <= v ? "on" : ""} />)}</i>
    </div>
  );
}

export function Equipment({ progress, onSelect, onBack }) {
  const [tab, setTab] = useState("weapon");
  const look = useMemo(() => playerLook(progress), [progress]);
  const col = COLORS.find((c) => c.id === progress.color) || COLORS[0];
  const equip = useMemo(() => ({ weapon: weaponById(progress.selectedWeapon), armor: progress.selectedArmor, shieldColor: col.cloth, shieldTrim: col.accent, pattern: 0 }), [progress.selectedWeapon, progress.selectedArmor, col]);
  const W = weaponById(progress.selectedWeapon);
  const A = armorById(progress.selectedArmor);
  return (
    <div className="ag-screen ag-equip">
      <header className="ag-head">
        <Back onClick={onBack} />
        <h2>ARMOURY</h2>
        <div className="ag-head__meta">{W.name} · {A.name}</div>
      </header>
      <div className="ag-equip__body">
        <PreviewScene look={look} equip={equip} guard={tab === "weapon"} />
        <div className="ag-equip__panel">
          <div className="ag-tabs">
            {[["weapon", "WEAPON"], ["armor", "ARMOUR"], ["helmet", "HELMET"], ["color", "COLOURS"]].map(([id, l]) => (
              <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{l}</button>
            ))}
          </div>
          <div className="ag-items">
            {tab === "weapon" && WEAPONS.map((w) => {
              const own = progress.unlockedWeapons.includes(w.id);
              return (
                <button key={w.id} type="button" disabled={!own} className={`ag-item${progress.selectedWeapon === w.id ? " sel" : ""}`} onClick={() => onSelect("weapon", w.id)}>
                  <span className="ag-item__name">{w.name} <small>{w.short}</small></span>
                  {own ? (
                    <>
                      <span className="ag-item__desc">{w.desc}</span>
                      <span className="ag-item__stats">
                        <StatBar label="DAMAGE" v={w.stats.damage} />
                        <StatBar label="SPEED" v={w.stats.speed} />
                        <StatBar label="RANGE" v={w.stats.range} />
                        <StatBar label="STAMINA" v={w.stats.stamina} />
                      </span>
                    </>
                  ) : (
                    <span className="ag-item__lock">Unlocks after {WEAPON_UNLOCKS[w.id]} career wins</span>
                  )}
                </button>
              );
            })}
            {tab === "armor" && ARMORS.map((a) => {
              const own = progress.unlockedArmor.includes(a.id);
              return (
                <button key={a.id} type="button" disabled={!own} className={`ag-item${progress.selectedArmor === a.id ? " sel" : ""}`} onClick={() => onSelect("armor", a.id)}>
                  <span className="ag-item__name">{a.name} <small>{a.id.toUpperCase()}</small></span>
                  {own ? (
                    <>
                      <span className="ag-item__desc">{a.desc}</span>
                      <span className="ag-item__stats">
                        <StatBar label="DEFENCE" v={1 + Math.round(a.defense * 20)} />
                        <StatBar label="DODGE" v={Math.round(a.dodgeMul * 3 - 0.2)} />
                        <StatBar label="RECOVERY" v={Math.round(a.regenMul * 3 - 0.1)} />
                      </span>
                    </>
                  ) : (
                    <span className="ag-item__lock">Unlocks after {ARMOR_UNLOCKS[a.id]} career wins</span>
                  )}
                </button>
              );
            })}
            {tab === "helmet" && HELMETS.map((h) => {
              const own = progress.unlockedHelmets.includes(h.id);
              return (
                <button key={h.id} type="button" disabled={!own} className={`ag-item ag-item--compact${progress.helmet === h.id ? " sel" : ""}`} onClick={() => onSelect("helmet", h.id)}>
                  <span className="ag-item__name">{h.name}</span>
                  {!own && <span className="ag-item__lock">{h.at} wins</span>}
                </button>
              );
            })}
            {tab === "color" && (
              <div className="ag-swatches">
                {COLORS.map((c) => {
                  const own = progress.unlockedColors.includes(c.id);
                  return (
                    <button key={c.id} type="button" disabled={!own} title={own ? c.name : `${c.name} — ${c.at} wins`} className={`ag-swatch${progress.color === c.id ? " sel" : ""}`} onClick={() => onSelect("color", c.id)} style={{ "--c1": c.cloth, "--c2": c.accent }}>
                      <i />
                      <span>{own ? c.name : `${c.at} wins`}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== fighter */
const SKINS = ["#f0c9a6", "#e0b08c", "#c48d63", "#b98563", "#9c6a48", "#7a4a30", "#5e3a26"];
const HAIR_COLORS = ["#1b1410", "#3b2616", "#6b2f17", "#b8662a", "#d9b068", "#8a8a8a", "#e0dcd2"];

export function Fighter({ progress, onChange, onBack }) {
  const look = useMemo(() => playerLook(progress), [progress]);
  const col = COLORS.find((c) => c.id === progress.color) || COLORS[0];
  const equip = useMemo(() => ({ weapon: weaponById(progress.selectedWeapon), armor: progress.selectedArmor, shieldColor: col.cloth, shieldTrim: col.accent }), [progress.selectedWeapon, progress.selectedArmor, col]);
  const c = progress.careerProgress;
  const nr = nextRank(c);
  const cur = [...RANKS].reverse().find((r) => c >= r.at);
  const pct = nr ? ((c - cur.at) / (nr.at - cur.at)) * 100 : 100;
  const [name, setName] = useState(progress.name);
  const setLook = (patch) => onChange({ look: { ...progress.look, ...patch } });
  return (
    <div className="ag-screen ag-equip">
      <header className="ag-head">
        <Back onClick={onBack} />
        <h2>THE FIGHTER</h2>
        <div className="ag-head__meta">{rankOf(c)}</div>
      </header>
      <div className="ag-equip__body">
        <PreviewScene look={look} equip={equip} />
        <div className="ag-equip__panel">
          <div className="ag-career">
            <div className="ag-career__rank">{rankOf(c)}</div>
            <div className="ag-career__bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="ag-career__next">{nr ? `${nr.at - c} more victories to ${nr.name}` : "The arena will remember your name."}</div>
            <div className="ag-career__ladder">
              {RANKS.map((r) => <span key={r.name} className={c >= r.at ? "on" : ""}>{r.name}</span>)}
            </div>
          </div>
          <label className="ag-field">
            <span>ARENA NAME</span>
            <input
              value={name}
              maxLength={14}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              onBlur={() => onChange({ name: name.trim() ? name.trim().slice(0, 14) : "GLADIATOR" })}
            />
          </label>
          <div className="ag-field"><span>SKIN</span>
            <div className="ag-dots">{SKINS.map((s) => <button key={s} type="button" aria-label={`skin ${s}`} className={progress.look.skin === s ? "sel" : ""} style={{ background: s }} onClick={() => setLook({ skin: s })} />)}</div>
          </div>
          <div className="ag-field"><span>HAIR</span>
            <div className="ag-pills">{HAIRS.map((h) => <button key={h} type="button" className={progress.look.hair === h ? "sel" : ""} onClick={() => setLook({ hair: h })}>{h}</button>)}</div>
          </div>
          <div className="ag-field"><span>HAIR COLOUR</span>
            <div className="ag-dots">{HAIR_COLORS.map((s) => <button key={s} type="button" aria-label={`hair ${s}`} className={progress.look.hairColor === s ? "sel" : ""} style={{ background: s }} onClick={() => setLook({ hairColor: s })} />)}</div>
          </div>
          <div className="ag-field"><span>BEARD</span>
            <div className="ag-pills">
              <button type="button" className={!progress.look.beard ? "sel" : ""} onClick={() => setLook({ beard: false })}>none</button>
              <button type="button" className={progress.look.beard ? "sel" : ""} onClick={() => setLook({ beard: true })}>beard</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== statistics */
export function Statistics({ progress, onBack }) {
  const s = progress.statistics;
  const acc = s.attacksThrown ? Math.round((s.hitsLanded / s.attacksThrown) * 100) : 0;
  const rows = [
    ["FIGHTS", s.fights], ["WINS", s.wins], ["LOSSES", s.losses], ["ENEMIES DEFEATED", s.enemiesDefeated],
    ["LIGHT ATTACKS", s.lightAttacks], ["HEAVY ATTACKS", s.heavyAttacks], ["KICKS", s.kicks], ["HITS LANDED", s.hitsLanded],
    ["ACCURACY", `${acc}%`], ["DAMAGE DEALT", Math.round(s.damageDealt)], ["DAMAGE TAKEN", Math.round(s.damageTaken)], ["BLOCKS", s.blocks],
    ["PARRIES", s.parries], ["DODGES", s.dodges], ["COUNTERS", s.counters], ["GUARD BREAKS", s.guardBreaks],
    ["FIRST-PERSON TIME", fmtTime(s.fpTime)], ["THIRD-PERSON TIME", fmtTime(s.tpTime)],
    ["WEAPONS UNLOCKED", `${progress.unlockedWeapons.length}/${WEAPONS.length}`], ["ARENAS UNLOCKED", `${progress.unlockedArenas.length}/${ARENAS.length}`],
    ["CHAMPIONS DEFEATED", `${s.championsDefeated}/5`], ["TRAINING SESSIONS", s.trainingSessions], ["TOTAL PLAY TIME", fmtTime(s.playTime)],
    ["CAREER", `${progress.careerProgress}/${ENEMIES.length}`],
  ];
  return (
    <div className="ag-screen ag-stats">
      <header className="ag-head">
        <Back onClick={onBack} />
        <h2>THE RECORD</h2>
        <div className="ag-head__meta">{progress.name} · {rankOf(progress.careerProgress)}</div>
      </header>
      <div className="ag-stats__grid">
        {rows.map(([k, v]) => (
          <div key={k} className="ag-stats__cell"><b>{v}</b><span>{k}</span></div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== settings */
function Seg({ value, options, onChange }) {
  return (
    <div className="ag-seg">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Settings({ settings, cameraMode, muted, onChange, onCamera, onBack }) {
  const S = settings;
  const onOff = [[true, "ON"], [false, "OFF"]];
  return (
    <div className="ag-screen ag-settings">
      <header className="ag-head">
        <Back onClick={onBack} />
        <h2>SETTINGS</h2>
        <div className="ag-head__meta">{muted ? "Muted by the Game Center" : ""}</div>
      </header>
      <div className="ag-settings__body">
        <div className="ag-settings__col">
          <h4>CAMERA</h4>
          <div className="ag-set"><span>Camera mode</span><Seg value={cameraMode} options={[["third", "THIRD PERSON"], ["first", "FIRST PERSON"]]} onChange={onCamera} /></div>
          <div className="ag-set"><span>Field of view <b>{S.fov}°</b></span><input type="range" min={70} max={100} step={1} value={S.fov} onChange={(e) => onChange({ fov: Number(e.target.value) })} /></div>
          <div className="ag-set"><span>Mouse sensitivity <b>{S.sensitivity.toFixed(2)}</b></span><input type="range" min={0.3} max={2.5} step={0.05} value={S.sensitivity} onChange={(e) => onChange({ sensitivity: Number(e.target.value) })} /></div>
          <div className="ag-set"><span>Invert Y</span><Seg value={S.invertY} options={onOff} onChange={(v) => onChange({ invertY: v })} /></div>
          <div className="ag-set"><span>Head bob (first person)</span><Seg value={S.headBob} options={[["off", "OFF"], ["low", "LOW"], ["normal", "NORMAL"]]} onChange={(v) => onChange({ headBob: v })} /></div>
          <div className="ag-set"><span>Camera shake</span><Seg value={S.cameraShake} options={onOff} onChange={(v) => onChange({ cameraShake: v })} /></div>
          <div className="ag-set"><span>Reduced motion</span><Seg value={S.reducedMotion} options={onOff} onChange={(v) => onChange({ reducedMotion: v })} /></div>
        </div>
        <div className="ag-settings__col">
          <h4>AUDIO & VIDEO</h4>
          <div className="ag-set"><span>Sound</span><Seg value={S.sound} options={onOff} onChange={(v) => onChange({ sound: v })} /></div>
          <div className="ag-set"><span>Music</span><Seg value={S.music} options={onOff} onChange={(v) => onChange({ music: v })} /></div>
          <div className="ag-set"><span>Graphics</span><Seg value={S.graphics} options={[["low", "LOW"], ["medium", "MEDIUM"], ["high", "HIGH"]]} onChange={(v) => onChange({ graphics: v })} /></div>
          <div className="ag-set"><span>Shadows</span><Seg value={S.shadows} options={onOff} onChange={(v) => onChange({ shadows: v })} /></div>
          <div className="ag-set"><span>Particles</span><Seg value={S.particles} options={onOff} onChange={(v) => onChange({ particles: v })} /></div>
          <div className="ag-set"><span>Control help in fights</span><Seg value={S.controlHelp} options={onOff} onChange={(v) => onChange({ controlHelp: v })} /></div>
        </div>
        <div className="ag-settings__col ag-controls">
          <h4>CONTROLS</h4>
          {[
            ["W A S D", "Move"], ["Mouse", "Look / aim"], ["Shift", "Sprint"], ["Space + dir", "Dodge"], ["Left click", "Light attack"],
            ["Right click (hold)", "Block — raise just before a hit to parry"], ["Middle click / R", "Heavy attack"], ["F", "Kick (breaks guards)"],
            ["Q", "Lock-on (third person)"], ["V / C", "First ⇄ third person"], ["Esc / P", "Pause (releases the mouse)"],
            ["J / K / L + arrows", "Keyboard-only: light / block / heavy / look"],
          ].map(([k, d]) => (
            <div key={k} className="ag-ctl"><kbd>{k}</kbd><span>{d}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== result */
export function Result({ result, rewards, enemy, training, onNext, onRematch, onArena, onMenu, hasNext }) {
  const s = result.stats;
  const thrown = s.lightAttacks + s.heavyAttacks + s.kicks;
  const acc = thrown ? Math.round((s.hitsLanded / thrown) * 100) : 0;
  const won = result.won;
  return (
    <div className={`ag-screen ag-result ${training ? "ag-result--train" : won ? "ag-result--win" : "ag-result--lose"}`}>
      <div className="ag-result__card">
        <div className="ag-result__title">{training ? "TRAINING COMPLETE" : won ? "VICTORY" : "DEFEAT"}</div>
        {!training && (
          <div className="ag-result__sub">
            {won ? `${displayName(enemy)} falls. The crowd chants your name.` : `${displayName(enemy)} stands over you. The crowd wants more.`}
          </div>
        )}
        <div className="ag-result__grid">
          {[
            ["TIME", `${Math.round(result.duration)}s`], ["HITS", s.hitsLanded], ["ACCURACY", `${acc}%`], ["DAMAGE", Math.round(s.damageDealt)],
            ["TAKEN", Math.round(s.damageTaken)], ["BLOCKS", s.blocks], ["PARRIES", s.parries], ["DODGES", s.dodges],
            ["COUNTERS", s.counters], ["GUARD BREAKS", s.guardBreaks],
          ].map(([k, v]) => (
            <div key={k}><b>{v}</b><span>{k}</span></div>
          ))}
        </div>
        {rewards && rewards.rankUp && <div className="ag-result__rank">NEW RANK · {rewards.rankUp}</div>}
        {rewards && rewards.unlocks.length > 0 && (
          <div className="ag-result__unlocks">
            {rewards.unlocks.map((u) => <span key={u}>UNLOCKED · {u}</span>)}
          </div>
        )}
        {!won && !training && (
          <div className="ag-result__tip">
            {s.parries === 0 ? "Tip: raise your guard a split second before their blade lands to parry — then punish with a heavy." : s.dodges === 0 ? "Tip: don't block axes and heavies on low stamina — dodge sideways instead." : "Tip: watch their stamina bar. Tired fighters can't dodge or swing heavy."}
          </div>
        )}
        <div className="ag-result__actions">
          {won && hasNext && !training && <button type="button" className="ag-btn ag-btn--primary" onClick={onNext}>NEXT FIGHT</button>}
          {!training && <button type="button" className={`ag-btn${!won || !hasNext ? " ag-btn--primary" : ""}`} onClick={onRematch}>{won ? "REMATCH" : "TRY AGAIN"}</button>}
          {training && <button type="button" className="ag-btn ag-btn--primary" onClick={onRematch}>TRAIN AGAIN</button>}
          <button type="button" className="ag-btn" onClick={onArena}>{training ? "TRAINING YARD" : "ARENA"}</button>
          <button type="button" className="ag-btn ag-btn--ghost" onClick={onMenu}>MAIN MENU</button>
        </div>
      </div>
    </div>
  );
}
