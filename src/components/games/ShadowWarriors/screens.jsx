/**
 * Shadow Warriors — menu screens (React). They only read the save and call
 * back into the main component; nothing here runs per frame.
 */
import { useState } from "react";
import { CHAPTERS, BATTLES, battleById } from "./data/campaign.js";
import { WEAPONS, ARMORS, ABILITIES, MAX_LEVEL, weaponById, armorById, abilityById, armorStats, weaponPower, abilityPower } from "./data/gear.js";
import { BOSSES } from "./engine/bosses.js";
import { isBattleOpen, itemUnlocked, upgradePrice, LAST_BATTLE } from "./progress.js";

const STYLE_NAMES = { brawler: "Brawler", defender: "Defender", zoner: "Zoner", trickster: "Trickster", berserker: "Berserker", duelist: "Duelist" };
const STYLE_TIPS = {
  brawler: "Presses forward with close strings.",
  defender: "Blocks and punishes your mistakes.",
  zoner: "Keeps you at the tip of a long weapon.",
  trickster: "Jumps, dashes and mixes high and low.",
  berserker: "Relentless — but rarely blocks.",
  duelist: "Balanced, patient, and can parry.",
};

export const Coin = () => (
  <svg className="sw-coin" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v12M8.5 9.5h5a2 2 0 0 1 0 4h-3a2 2 0 0 0 0 4h5" fill="none" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const Stars = ({ n, max = 5 }) => (
  <span className="sw-stars" aria-label={`${n} of ${max}`}>
    {Array.from({ length: max }, (_, i) => (
      <i key={i} className={i < n ? "on" : ""}>◆</i>
    ))}
  </span>
);

// ------------------------------------------------------------------ menu
export function MainMenu({ save, onContinue, onMap, onShop, onSettings, onHelp }) {
  const next = Math.min(LAST_BATTLE, save.cleared + 1);
  const started = save.cleared > 0 || save.stats.fights > 0;
  return (
    <div className="sw-screen sw-screen--menu">
      <div className="sw-title">
        <span className="sw-title__a">Shadow Warriors</span>
        <span className="sw-title__b">Rise of Legends</span>
        <span className="sw-title__tag">Master the Shadows. Defeat the Legends.</span>
      </div>
      <div className="sw-menu">
        <button type="button" className="sw-btn sw-btn--primary" onClick={onContinue}>
          {save.finished ? "Replay Final Battle" : started ? `Continue · Battle ${next}` : "Begin Campaign"}
        </button>
        <button type="button" className="sw-btn" onClick={onMap}>Campaign Map</button>
        <button type="button" className="sw-btn" onClick={onShop}>Dojo &amp; Equipment</button>
        <div className="sw-menu__row">
          <button type="button" className="sw-btn sw-btn--ghost" onClick={onSettings}>Settings</button>
          <button type="button" className="sw-btn sw-btn--ghost" onClick={onHelp}>How to Play</button>
        </div>
      </div>
      <div className="sw-menu__stats">
        <span><Coin /> {save.coins}</span>
        <span>{save.cleared}/{LAST_BATTLE} battles won</span>
        <span>{save.stats.perfects} perfect</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ campaign map
export function CampaignMap({ save, chapter, setChapter, onPick, onBack, onShop }) {
  const ch = CHAPTERS[chapter];
  const battles = BATTLES.filter((b) => b.chapter === chapter);
  // zig-zag path positions (percent)
  const pos = battles.map((b, i) => ({ x: 7 + i * 9.6, y: i === 9 ? 46 : i % 2 ? 64 : 30 }));
  return (
    <div className="sw-screen sw-screen--map">
      <div className="sw-panel sw-panel--wide">
        <div className="sw-panel__head">
          <button type="button" className="sw-back" onClick={onBack} aria-label="Back">‹</button>
          <h3>Campaign</h3>
          <span className="sw-panel__meta"><Coin /> {save.coins}</span>
        </div>
        <div className="sw-tabs" role="tablist">
          {CHAPTERS.map((c) => {
            const locked = save.cleared < c.id * 10;
            return (
              <button key={c.id} type="button" role="tab" aria-selected={chapter === c.id} className={`sw-tab${chapter === c.id ? " sw-tab--on" : ""}`} style={{ "--chc": c.color }} onClick={() => setChapter(c.id)}>
                {locked && <span aria-hidden="true">🔒 </span>}
                {c.id + 1}. {c.name.replace(/^The /, "")}
              </button>
            );
          })}
        </div>
        <p className="sw-chapter" style={{ "--chc": ch.color }}>
          <strong>Chapter {ch.id + 1} — {ch.name}</strong> · {ch.blurb}
        </p>
        <div className="sw-map" style={{ "--chc": ch.color }}>
          <svg className="sw-map__path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={pos.map((p) => `${p.x},${p.y}`).join(" ")} />
          </svg>
          {battles.map((b, i) => {
            const open = isBattleOpen(save, b.id);
            const rec = save.battles[b.id];
            const won = rec?.wins > 0;
            return (
              <button
                key={b.id}
                type="button"
                className={`sw-node${b.boss ? " sw-node--boss" : ""}${won ? " sw-node--won" : ""}${!open ? " sw-node--locked" : ""}${open && !won ? " sw-node--next" : ""}`}
                style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}
                disabled={!open}
                onClick={() => onPick(b.id)}
                title={`${b.id}. ${b.name}${b.title ? `, ${b.title}` : ""}`}
              >
                <span className="sw-node__n">{open ? (b.boss ? "☠" : b.id) : "🔒"}</span>
                <span className="sw-node__name">{b.boss ? "BOSS" : b.name}</span>
                {won && <span className="sw-node__ok">{rec.perfect ? "★" : "✓"}</span>}
              </button>
            );
          })}
        </div>
        <div className="sw-map__foot">
          <button type="button" className="sw-btn sw-btn--small" onClick={onShop}>Dojo &amp; Equipment</button>
          <span>Won battles can be replayed for 40% coins.</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pre-fight
function LoadoutLine({ save }) {
  const w = weaponById(save.eq.weapon);
  const a = armorById(save.eq.armor);
  const ab = abilityById(save.eq.ability);
  return (
    <ul className="sw-loadout">
      <li><span>Weapon</span><b>{w.name}{save.lv.weapon[w.id] ? ` +${save.lv.weapon[w.id]}` : ""}</b></li>
      <li><span>Armor</span><b>{a.name}{save.lv.armor[a.id] ? ` +${save.lv.armor[a.id]}` : ""}</b></li>
      <li><span>Ability</span><b>{ab ? ab.name : "—"}</b></li>
    </ul>
  );
}

export function PreFight({ save, battleId, onFight, onShop, onBack }) {
  const b = battleById(battleId);
  const ch = CHAPTERS[b.chapter];
  const w = weaponById(b.weapon);
  const a = armorById(b.armor);
  const boss = b.boss ? BOSSES[b.boss] : null;
  const rec = save.battles[b.id];
  return (
    <div className="sw-screen sw-screen--dim">
      <div className="sw-panel sw-vs" style={{ "--chc": ch.color }}>
        <div className="sw-vs__k">Chapter {ch.id + 1} · Battle {b.id}{boss ? " · BOSS" : ""}</div>
        <div className="sw-vs__row">
          <div className="sw-vs__side">
            <span className="sw-vs__name">Shadow</span>
            <span className="sw-vs__title">You</span>
            <LoadoutLine save={save} />
          </div>
          <div className="sw-vs__mid">VS</div>
          <div className="sw-vs__side sw-vs__side--enemy">
            <span className="sw-vs__name">{boss ? boss.name.split(",")[0] : b.name}</span>
            <span className="sw-vs__title">{boss ? boss.name.split(",")[1]?.trim() : b.title}</span>
            <ul className="sw-loadout">
              <li><span>Style</span><b>{STYLE_NAMES[b.style]}</b></li>
              <li><span>Weapon</span><b>{w.name}{b.wLvl ? ` +${b.wLvl}` : ""}</b></li>
              <li><span>Armor</span><b>{a.name}</b></li>
              <li><span>Threat</span><b><Stars n={b.stars} /></b></li>
            </ul>
          </div>
        </div>
        <p className="sw-vs__tip">{boss ? boss.mechanic : STYLE_TIPS[b.style]}{b.ability && !boss ? ` Uses ${abilityById(b.ability).name}.` : ""}</p>
        <p className="sw-vs__reward">
          Reward <Coin /> {rec?.wins ? Math.round((b.reward * 0.4) / 5) * 5 : b.reward}
          {!rec?.wins && boss && b.id < LAST_BATTLE ? ` · teaches ${ABILITIES.find((x) => x.from === b.id)?.name || ""}` : ""}
          {boss ? " · best of 3 · the boss grows stronger each round" : " · best of 3 rounds"}
        </p>
        <button type="button" className="sw-btn sw-btn--primary sw-btn--big" onClick={onFight}>Fight!</button>
        <div className="sw-menu__row">
          <button type="button" className="sw-btn" onClick={onShop}>Change Gear</button>
          <button type="button" className="sw-btn sw-btn--ghost" onClick={onBack}>Back</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ result
export function ResultScreen({ result, onNext, onRetry, onMap, onShop }) {
  const b = battleById(result.id);
  const won = result.won;
  return (
    <div className="sw-screen sw-screen--dim">
      <div className={`sw-panel sw-result${won ? " sw-result--win" : " sw-result--lose"}`}>
        <span className="sw-result__k">Battle {b.id} · {b.boss ? BOSSES[b.boss].name : `${b.name}, ${b.title}`}</span>
        <h3 className="sw-result__title">{won ? (result.perfect ? "Flawless Victory" : "Victory") : "Defeated"}</h3>
        <div className="sw-result__coins"><Coin /> +{result.coins}</div>
        <div className="sw-stats">
          <div><span>Damage dealt</span><strong>{Math.round(result.dmg)}</strong></div>
          <div><span>Best combo</span><strong>{result.combo}</strong></div>
          <div><span>Parries</span><strong>{result.parries}</strong></div>
          <div><span>Rounds</span><strong>{result.rounds}</strong></div>
        </div>
        {result.ability && <p className="sw-badge sw-badge--big">New ability learned: {result.ability.name}!</p>}
        {result.unlocks.length > 0 && (
          <p className="sw-badge">Now in the Dojo: {result.unlocks.map((u) => u.item.name).join(", ")}</p>
        )}
        {!won && <p className="sw-note">{result.tip}</p>}
        {result.finished && <p className="sw-badge sw-badge--big">The Shadow Emperor has fallen. You are a Legend.</p>}
        <div className="sw-result__btns">
          {won && b.id < LAST_BATTLE && <button type="button" className="sw-btn sw-btn--primary" onClick={onNext}>Next Battle</button>}
          {!won && <button type="button" className="sw-btn sw-btn--primary" onClick={onRetry}>Retry</button>}
          {won && <button type="button" className="sw-btn" onClick={onRetry}>Replay</button>}
          <button type="button" className="sw-btn" onClick={onShop}>Dojo</button>
          <button type="button" className="sw-btn sw-btn--ghost" onClick={onMap}>Map</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ shop / dojo
const pct = (v) => `${Math.round(v * 100)}%`;

function weaponBars(w, lvl) {
  const reach = w.len + 70;
  const speed = 1 / w.speed;
  return [
    ["Damage", Math.min(1, (w.dmg * weaponPower(lvl)) / 2.3)],
    ["Speed", Math.min(1, speed / 1.45)],
    ["Reach", Math.min(1, reach / 230)],
    ["Recovery", Math.max(0.05, 1 - (w.rec + 2) / 10)],
  ];
}
function armorBars(a, lvl) {
  const st = armorStats(a, lvl);
  return [
    ["Defense", Math.min(1, st.def / 0.3)],
    ["Health", Math.min(1, st.hp / 50)],
    ["Stamina", Math.min(1, (100 + st.stam) / 140)],
    ["Agility", Math.min(1, (st.speed * st.regen) / 1.35)],
  ];
}

export function Shop({ save, onBuy, onUpgrade, onEquip, onBack, flash }) {
  const [tab, setTab] = useState("weapon");
  const list = tab === "weapon" ? WEAPONS : tab === "armor" ? ARMORS : ABILITIES;
  return (
    <div className="sw-screen sw-screen--dim">
      <div className="sw-panel sw-panel--wide sw-shop">
        <div className="sw-panel__head">
          <button type="button" className="sw-back" onClick={onBack} aria-label="Back">‹</button>
          <h3>Dojo &amp; Equipment</h3>
          <span className="sw-panel__meta sw-shop__coins"><Coin /> {save.coins}</span>
        </div>
        <div className="sw-tabs" role="tablist">
          {[["weapon", "Weapons"], ["armor", "Armor"], ["ability", "Abilities"]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sw-tab${tab === k ? " sw-tab--on" : ""}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {flash && <p className={`sw-shop__flash${flash.ok ? "" : " sw-shop__flash--bad"}`}>{flash.text}</p>}
        <div className="sw-items">
          {list.map((it) => {
            const owned = save.owned[tab].includes(it.id);
            const lvl = save.lv[tab][it.id] || 0;
            const equipped = save.eq[tab] === it.id;
            const unlocked = tab === "ability" ? owned : itemUnlocked(save, it);
            const up = owned ? upgradePrice(save, tab, it.id) : null;
            const bars = tab === "weapon" ? weaponBars(it, lvl) : tab === "armor" ? armorBars(it, lvl) : null;
            return (
              <div key={it.id} className={`sw-item${equipped ? " sw-item--eq" : ""}${!unlocked ? " sw-item--locked" : ""}`}>
                <div className="sw-item__head">
                  <strong>{it.name}</strong>
                  {owned && <span className="sw-item__lvl">{tab === "ability" ? `Lv ${lvl + 1}/4` : `+${lvl}/${MAX_LEVEL}`}</span>}
                </div>
                <p className="sw-item__desc">{it.desc}</p>
                {bars && (
                  <div className="sw-bars">
                    {bars.map(([k, v]) => (
                      <div key={k} className="sw-bar"><span>{k}</span><i style={{ "--v": v }} /></div>
                    ))}
                  </div>
                )}
                {tab === "ability" && <p className="sw-item__meta">Shadow meter cost: {it.cost} · power {pct(abilityPower(lvl))}</p>}
                <div className="sw-item__btns">
                  {!unlocked && <span className="sw-item__lock">{tab === "ability" ? `Defeat the boss of battle ${it.from}` : `Win battle ${it.unlock} to unlock`}</span>}
                  {unlocked && !owned && (
                    <button type="button" className="sw-btn sw-btn--small sw-btn--primary" disabled={save.coins < it.price} onClick={() => onBuy(tab, it.id)}>
                      Buy <Coin /> {it.price}
                    </button>
                  )}
                  {owned && !equipped && <button type="button" className="sw-btn sw-btn--small" onClick={() => onEquip(tab, it.id)}>Equip</button>}
                  {equipped && <span className="sw-item__eq">Equipped</span>}
                  {owned && up != null && (
                    <button type="button" className="sw-btn sw-btn--small" disabled={save.coins < up} onClick={() => onUpgrade(tab, it.id)}>
                      Upgrade <Coin /> {up}
                    </button>
                  )}
                  {owned && up == null && <span className="sw-item__eq">Max level</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ settings & help
export function Settings({ save, update, onBack, onReset, muted, inFight }) {
  const [confirm, setConfirm] = useState(false);
  const st = save.settings;
  const Toggle = ({ k, label }) => (
    <div className="sw-row">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={st[k]} className={`sw-switch${st[k] ? " sw-switch--on" : ""}`} onClick={() => update({ [k]: !st[k] })}><i /></button>
    </div>
  );
  return (
    <div className="sw-screen sw-screen--dim">
      <div className="sw-panel">
        <div className="sw-panel__head">
          <button type="button" className="sw-back" onClick={onBack} aria-label="Back">‹</button>
          <h3>Settings</h3>
        </div>
        <Toggle k="music" label="Music" />
        <Toggle k="sfx" label="Sound effects" />
        <Toggle k="shake" label="Screen shake" />
        <Toggle k="effects" label="Particles & trails" />
        <Toggle k="hints" label="Combat tips" />
        <div className="sw-row">
          <span>Touch controls</span>
          <div className="sw-seg">
            {["auto", "on", "off"].map((m) => (
              <button key={m} type="button" className={st.touch === m ? "on" : ""} onClick={() => update({ touch: m })}>{m}</button>
            ))}
          </div>
        </div>
        {muted && <p className="sw-note">Sound is muted from the game player bar.</p>}
        {!inFight && (
          <div className="sw-row sw-row--danger">
            {!confirm ? (
              <button type="button" className="sw-btn sw-btn--ghost sw-btn--small" onClick={() => setConfirm(true)}>Reset progress</button>
            ) : (
              <>
                <span>Erase all progress, coins and gear?</span>
                <div className="sw-seg">
                  <button type="button" onClick={() => setConfirm(false)}>No</button>
                  <button type="button" className="danger" onClick={() => { setConfirm(false); onReset(); }}>Erase</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Help({ onBack }) {
  return (
    <div className="sw-screen sw-screen--dim">
      <div className="sw-panel sw-panel--wide">
        <div className="sw-panel__head">
          <button type="button" className="sw-back" onClick={onBack} aria-label="Back">‹</button>
          <h3>How to Play</h3>
        </div>
        <div className="sw-help">
          <div>
            <h4>Keyboard</h4>
            <ul>
              <li><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd> move · double-tap to dash</li>
              <li><kbd>W</kbd> / <kbd>↑</kbd> jump · <kbd>S</kbd> / <kbd>↓</kbd> crouch</li>
              <li><kbd>J</kbd> punch · <kbd>K</kbd> kick · <kbd>L</kbd> weapon / heavy</li>
              <li><kbd>Shift</kbd> block · <kbd>U</kbd> shadow ability</li>
              <li><kbd>Esc</kbd> / <kbd>P</kbd> pause</li>
            </ul>
            <h4>Touch</h4>
            <p>Left stick moves (flick twice to dash, pull down to crouch). Right buttons: Punch, Kick, Weapon, Block, Jump and Shadow.</p>
          </div>
          <div>
            <h4>Combat</h4>
            <ul>
              <li><b>Strings:</b> J J J, J K, K K, L L (L L L L with daggers). Press the next attack as the previous one lands.</li>
              <li><b>Direction + attack:</b> forward+J rising fist, forward+K push kick, forward+L heavy weapon move; down+attack = low attacks; attacks in the air are overheads.</li>
              <li><b>Blocking:</b> standing block stops high, mid and air attacks; crouch-block (Shift+S) stops lows. Blocking drains stamina — at zero your guard breaks.</li>
              <li><b>Parry:</b> press block just before a hit lands to stagger the attacker.</li>
              <li><b>Stamina</b> (yellow) powers attacks and dashes. <b>Shadow meter</b> (purple) fills as you fight; use it for your ability.</li>
              <li>Hitting someone during their wind-up is a <b>counter</b> (+20%). Long combos weaken and end in a knockdown — no infinites.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Ending({ onDone }) {
  return (
    <div className="sw-screen sw-screen--dim">
      <div className="sw-panel sw-ending">
        <span className="sw-result__k">Chapter 5 complete</span>
        <h3 className="sw-result__title">Rise of a Legend</h3>
        <p>The Shadow Emperor&apos;s blade shatters on the frozen peak. Across the temple, the forest, the city and the sands, the warriors you defeated speak your name.</p>
        <p>Every battle stays open — replay them for coins, finish your Dojo, and chase flawless victories.</p>
        <button type="button" className="sw-btn sw-btn--primary" onClick={onDone}>Return to the Campaign</button>
      </div>
    </div>
  );
}
