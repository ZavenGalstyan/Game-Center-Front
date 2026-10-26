/**
 * Metro Rush — menu screens: main menu, runners, hoverboards, shop,
 * missions and settings. They draw over the live 3D world; all purchases go
 * through progress.js and only ever spend in-game coins.
 */
import { useEffect, useState } from "react";
import { CHARACTERS, charById, outfitOf } from "../data/characters.js";
import { BOARDS, BOARD_PACKS, boardById } from "../data/boards.js";
import { THEMES, themeIndex } from "../data/themes.js";
import { MAX_MULT, MISSION_SETS, SET_BONUS, UPGRADES, UPGRADE_MAX, upgradeCost, upgradeMul } from "../data/missions.js";
import { POWER_T } from "../engine/config.js";
import { buyBoard, buyCharacter, buyOutfit, buyPack, buyUpgrade, defaultSave, ensureDaily, liveDaily, liveMissions, selectBoard, selectCharacter } from "../progress.js";
import { sound } from "../audio.js";
import { BackIcon, BoardIcon, CalendarIcon, CheckIcon, CityIcon, CoinIcon, FlameIcon, GearIcon, LockIcon, NextIcon, PlayIcon, POWER_ICONS, RunnerIcon, ShopIcon, TargetIcon, TrophyIcon } from "./icons.jsx";

const fmt = (n) => Math.floor(n).toLocaleString("en-US");

export function Coins({ n, big }) {
  return (
    <span className={`mr-coins${big ? " mr-coins--big" : ""}`}>
      <CoinIcon />
      <b>{fmt(n)}</b>
    </span>
  );
}

function TopBar({ title, onBack, save, children }) {
  return (
    <header className="mr-bar" data-ui>
      {onBack && (
        <button type="button" className="mr-iconbtn" onClick={onBack} aria-label="Back">
          <BackIcon />
        </button>
      )}
      {title && <h2 className="mr-bar__title">{title}</h2>}
      <div className="mr-bar__fill" />
      {children}
      <Coins n={save.coins} />
    </header>
  );
}

function Progress({ value, target, done }) {
  const f = Math.max(0, Math.min(1, value / target));
  return (
    <div className={`mr-prog${done ? " is-done" : ""}`}>
      <div className="mr-prog__fill" style={{ width: `${f * 100}%` }} />
    </div>
  );
}

/* ======================================================================= main menu */
export function MainMenu({ save, commit, go, play }) {
  const ti = themeIndex(save.settings.theme);
  const th = THEMES[ti];
  const missions = liveMissions(save, {});
  const daily = liveDaily(save, {});
  const setTheme = (d) => {
    sound.ui();
    commit((s) => ({ ...s, settings: { ...s.settings, theme: THEMES[(ti + d + THEMES.length) % THEMES.length].id } }));
  };
  const toggleTour = () => {
    sound.ui();
    commit((s) => ({ ...s, settings: { ...s.settings, tour: !s.settings.tour } }));
  };
  return (
    <div className="mr-screen mr-menu">
      <header className="mr-bar" data-ui>
        <span className="mr-pill" title="Best score">
          <TrophyIcon /> <b>{fmt(save.best)}</b>
        </span>
        <span className="mr-pill mr-pill--mult" title="Score multiplier — finish mission sets to raise it">
          ×<b>{save.mult}</b>
        </span>
        <div className="mr-bar__fill" />
        <Coins n={save.coins} />
      </header>
      <div className="mr-menu__main" data-ui>
        <div className="mr-logo">
          <span className="mr-logo__a">METRO</span>
          <span className="mr-logo__b">RUSH</span>
          <span className="mr-logo__c">CITY RUNNER</span>
        </div>
        <p className="mr-tag">Run Fast. Dodge Trains. Rule the City.</p>
        <button type="button" className="mr-play" onClick={play}>
          <PlayIcon /> PLAY
        </button>
        <div className="mr-city">
          <button type="button" className="mr-iconbtn mr-iconbtn--sm" onClick={() => setTheme(-1)} aria-label="Previous city">
            <BackIcon />
          </button>
          <div className="mr-city__name" style={{ "--acc": th.accent }}>
            <CityIcon />
            <span>{save.settings.tour ? `Start: ${th.short}` : th.short}</span>
          </div>
          <button type="button" className="mr-iconbtn mr-iconbtn--sm" onClick={() => setTheme(1)} aria-label="Next city">
            <NextIcon />
          </button>
          <button type="button" className={`mr-chip${save.settings.tour ? " is-on" : ""}`} onClick={toggleTour} aria-pressed={save.settings.tour} title="Change city every 1.5 km">
            World Tour
          </button>
        </div>
        <nav className="mr-nav">
          <button type="button" onClick={() => go("chars")}>
            <RunnerIcon />
            <span>Runners</span>
          </button>
          <button type="button" onClick={() => go("boards")}>
            <BoardIcon />
            <span>Boards</span>
          </button>
          <button type="button" onClick={() => go("shop")}>
            <ShopIcon />
            <span>Shop</span>
          </button>
          <button type="button" onClick={() => go("missions")}>
            <TargetIcon />
            <span>Missions</span>
          </button>
          <button type="button" onClick={() => go("settings")} aria-label="Settings">
            <GearIcon />
            <span>Settings</span>
          </button>
        </nav>
      </div>
      <button type="button" className="mr-quest" onClick={() => go("missions")} data-ui>
        <div className="mr-quest__head">
          <TargetIcon /> {missions.length ? `Mission set ${save.mset + 1}/${MISSION_SETS.length}` : "All missions complete!"}
        </div>
        {missions.map((m) => (
          <div key={m.id} className={`mr-quest__row${m.done ? " is-done" : ""}`}>
            <span>{m.done ? <CheckIcon /> : null}{m.text}</span>
            <Progress value={m.value} target={m.target} done={m.done} />
          </div>
        ))}
        <div className="mr-quest__head mr-quest__head--daily">
          <CalendarIcon /> Daily challenges {save.daily?.streak ? <em><FlameIcon /> {save.daily.streak}</em> : null}
        </div>
        <div className="mr-quest__dots">
          {daily.map((d) => (
            <span key={d.id} className={d.done ? "is-done" : ""} title={d.text}>
              {d.done ? <CheckIcon /> : `${Math.floor((d.value / d.target) * 100)}%`}
            </span>
          ))}
        </div>
      </button>
      <div className="mr-hint" data-ui>
        {th.blurb}
      </div>
    </div>
  );
}

/* ======================================================================= runners */
export function Characters({ save, setSave, back, preview, setPreview, world }) {
  const ch = charById(preview.char);
  const outfit = outfitOf(ch, preview.outfit);
  const ownedChar = !!save.chars[ch.id];
  const ownedOutfit = ownedChar && save.chars[ch.id].includes(outfit.id);
  const selected = save.char === ch.id && save.outfit === outfit.id;
  const idx = CHARACTERS.indexOf(ch);
  const pickChar = (c) => {
    sound.ui();
    const o = save.char === c.id ? save.outfit : "classic";
    setPreview((p) => ({ ...p, char: c.id, outfit: o }));
  };
  const step = (d) => pickChar(CHARACTERS[(idx + d + CHARACTERS.length) % CHARACTERS.length]);
  const act = () => {
    let next = null;
    if (!ownedChar) next = buyCharacter(save, ch.id);
    else if (!ownedOutfit) next = buyOutfit(save, ch.id, outfit.id);
    else next = selectCharacter(save, ch.id, outfit.id);
    if (!next) {
      sound.deny();
      return;
    }
    if (!ownedChar || !ownedOutfit) {
      sound.buy();
      world.current?.cheer();
    } else sound.ui();
    setSave(next);
  };
  let label;
  let cost = 0;
  if (!ownedChar) (label = "Unlock"), (cost = ch.price);
  else if (!ownedOutfit) (label = "Buy outfit"), (cost = outfit.price);
  else label = selected ? "Selected" : "Select";
  const afford = save.coins >= cost;
  return (
    <div className="mr-screen mr-shop">
      <TopBar title="Runners" onBack={back} save={save} />
      <div className="mr-panel mr-panel--list" data-ui>
        <div className="mr-cards">
          {CHARACTERS.map((c) => {
            const own = !!save.chars[c.id];
            return (
              <button key={c.id} type="button" className={`mr-card${c.id === ch.id ? " is-active" : ""}${save.char === c.id ? " is-equipped" : ""}`} onClick={() => pickChar(c)} style={{ "--c1": c.outfits[0].c.top, "--c2": c.outfits[0].c.top2 }}>
                <span className="mr-card__swatch" />
                <span className="mr-card__name">{c.name}</span>
                <span className="mr-card__meta">{save.char === c.id ? <><CheckIcon /> Equipped</> : own ? "Owned" : <><LockIcon /> {fmt(c.price)}</>}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mr-detail" data-ui>
        <div className="mr-detail__nav">
          <button type="button" className="mr-iconbtn mr-iconbtn--sm" onClick={() => step(-1)} aria-label="Previous runner">
            <BackIcon />
          </button>
          <h3>{ch.name}</h3>
          <button type="button" className="mr-iconbtn mr-iconbtn--sm" onClick={() => step(1)} aria-label="Next runner">
            <NextIcon />
          </button>
        </div>
        <p>{ch.tagline}</p>
        <div className="mr-outfits">
          {ch.outfits.map((o) => {
            const own = ownedChar && save.chars[ch.id].includes(o.id);
            return (
              <button key={o.id} type="button" className={`mr-chip${o.id === outfit.id ? " is-on" : ""}`} onClick={() => (sound.ui(), setPreview((p) => ({ ...p, outfit: o.id })))} style={{ "--c1": o.c.top }}>
                <i className="mr-dot" />
                {o.name}
                {!own && o.price > 0 && (
                  <small>
                    <CoinIcon /> {fmt(o.price)}
                  </small>
                )}
              </button>
            );
          })}
        </div>
        <button type="button" className={`mr-btn mr-btn--primary${selected ? " is-done" : ""}`} onClick={act} disabled={selected || (cost > 0 && !afford)}>
          {selected && <CheckIcon />} {label}
          {cost > 0 && (
            <span className="mr-btn__cost">
              <CoinIcon /> {fmt(cost)}
            </span>
          )}
        </button>
        {cost > 0 && !afford && <div className="mr-note">Need {fmt(cost - save.coins)} more coins — keep running!</div>}
        {!ownedChar && <div className="mr-note mr-note--soft">Outfits unlock after the runner.</div>}
      </div>
      <div className="mr-drag">drag to spin</div>
    </div>
  );
}

/* ======================================================================= boards */
export function Boards({ save, setSave, back, preview, setPreview, world, go }) {
  const b = boardById(preview.board);
  const own = save.boards.includes(b.id);
  const selected = save.board === b.id;
  const act = () => {
    const next = own ? selectBoard(save, b.id) : buyBoard(save, b.id);
    if (!next) return sound.deny();
    if (!own) {
      sound.buy();
      world.current?.cheer();
    } else sound.ui();
    setSave(next);
  };
  const afford = save.coins >= b.price;
  return (
    <div className="mr-screen mr-shop">
      <TopBar title="Hoverboards" onBack={back} save={save}>
        <span className="mr-pill" title="Hoverboard charges">
          <BoardIcon /> <b>{save.charges}</b>
        </span>
      </TopBar>
      <div className="mr-panel mr-panel--list" data-ui>
        <div className="mr-cards">
          {BOARDS.map((x) => (
            <button key={x.id} type="button" className={`mr-card${x.id === b.id ? " is-active" : ""}${save.board === x.id ? " is-equipped" : ""}`} onClick={() => (sound.ui(), setPreview((p) => ({ ...p, board: x.id })))} style={{ "--c1": x.deck, "--c2": x.glow }}>
              <span className="mr-card__swatch mr-card__swatch--board" />
              <span className="mr-card__name">{x.name}</span>
              <span className="mr-card__meta">{save.board === x.id ? <><CheckIcon /> Equipped</> : save.boards.includes(x.id) ? "Owned" : <><LockIcon /> {fmt(x.price)}</>}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mr-detail" data-ui>
        <h3>{b.name}</h3>
        <p>{b.blurb}</p>
        <p className="mr-small">
          Ride one with <kbd>B</kbd> / double-tap. It absorbs one crash and lasts {Math.round(POWER_T.board * upgradeMul(save.upgrades.board))} s.
        </p>
        <button type="button" className={`mr-btn mr-btn--primary${selected ? " is-done" : ""}`} onClick={act} disabled={selected || (!own && !afford)}>
          {selected && <CheckIcon />} {own ? (selected ? "Equipped" : "Equip") : "Unlock"}
          {!own && (
            <span className="mr-btn__cost">
              <CoinIcon /> {fmt(b.price)}
            </span>
          )}
        </button>
        <button type="button" className="mr-btn" onClick={() => go("shop")}>
          <BoardIcon /> {save.charges} charges · buy more
        </button>
      </div>
      <div className="mr-drag">drag to spin</div>
    </div>
  );
}

/* ======================================================================= shop */
export function Shop({ save, setSave, back }) {
  const up = (id) => {
    const next = buyUpgrade(save, id);
    if (!next) return sound.deny();
    sound.buy();
    setSave(next);
  };
  const pack = (id) => {
    const next = buyPack(save, id);
    if (!next) return sound.deny();
    sound.buy();
    setSave(next);
  };
  return (
    <div className="mr-screen mr-page">
      <TopBar title="Shop" onBack={back} save={save} />
      <div className="mr-sheet" data-ui>
        <h4 className="mr-sec">Power-up upgrades</h4>
        <div className="mr-ups">
          {UPGRADES.map((u) => {
            const lvl = save.upgrades[u.id] || 0;
            const Icon = POWER_ICONS[u.id];
            const cost = upgradeCost(lvl);
            const max = lvl >= UPGRADE_MAX;
            return (
              <div key={u.id} className="mr-up">
                <span className="mr-up__icon">
                  <Icon />
                </span>
                <div className="mr-up__txt">
                  <b>{u.name}</b>
                  <small>
                    {u.blurb} {(POWER_T[u.id] * upgradeMul(lvl)).toFixed(1)} s{!max && ` → ${(POWER_T[u.id] * upgradeMul(lvl + 1)).toFixed(1)} s`}
                  </small>
                  <div className="mr-pips">
                    {Array.from({ length: UPGRADE_MAX }, (_, i) => (
                      <i key={i} className={i < lvl ? "is-on" : ""} />
                    ))}
                  </div>
                </div>
                <button type="button" className="mr-btn mr-btn--sm mr-btn--primary" disabled={max || save.coins < cost} onClick={() => up(u.id)}>
                  {max ? (
                    "MAX"
                  ) : (
                    <>
                      <CoinIcon /> {fmt(cost)}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <h4 className="mr-sec">
          Hoverboard charges <span className="mr-pill mr-pill--sm"><BoardIcon /> {save.charges}</span>
        </h4>
        <div className="mr-packs">
          {BOARD_PACKS.map((p) => (
            <button key={p.id} type="button" className="mr-pack" disabled={save.coins < p.price} onClick={() => pack(p.id)}>
              <BoardIcon />
              <b>×{p.count}</b>
              <span>
                <CoinIcon /> {fmt(p.price)}
              </span>
            </button>
          ))}
        </div>
        <p className="mr-small mr-center">Everything is bought with coins collected while running — no real money, ever.</p>
      </div>
    </div>
  );
}

/* ======================================================================= missions */
function untilMidnight() {
  const now = new Date();
  const m = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  const h = Math.floor(m / 3600000);
  const mm = Math.floor((m % 3600000) / 60000);
  return `${h}h ${String(mm).padStart(2, "0")}m`;
}
export function Missions({ save, back }) {
  const missions = liveMissions(save, {});
  const daily = liveDaily(save, {});
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mr-screen mr-page">
      <TopBar title="Missions" onBack={back} save={save}>
        <span className="mr-pill mr-pill--mult">
          ×<b>{save.mult}</b>
        </span>
      </TopBar>
      <div className="mr-sheet mr-sheet--two" data-ui>
        <section>
          <h4 className="mr-sec">
            <TargetIcon /> {missions.length ? `Set ${save.mset + 1} of ${MISSION_SETS.length}` : "Every set complete"}
          </h4>
          {missions.length ? (
            <>
              {missions.map((m) => (
                <div key={m.id} className={`mr-mission${m.done ? " is-done" : ""}`}>
                  <span className="mr-mission__check">{m.done ? <CheckIcon /> : null}</span>
                  <div className="mr-mission__body">
                    <b>{m.text}</b>
                    <Progress value={m.value} target={m.target} done={m.done} />
                    <small>
                      {fmt(m.value)} / {fmt(m.target)} {m.scope === "run" ? "· in one run" : ""}
                    </small>
                  </div>
                  <span className="mr-mission__reward">
                    <CoinIcon /> {m.reward}
                  </span>
                </div>
              ))}
              <p className="mr-small">
                Finish all three to raise your score multiplier to <b>×{Math.min(MAX_MULT, save.mult + 1)}</b> and earn a <CoinIcon /> {SET_BONUS(save.mset)} bonus. Rewards are paid at the end of the run.
              </p>
            </>
          ) : (
            <p className="mr-small">You finished all {MISSION_SETS.length * 3} missions — the city is yours. Your multiplier is maxed at ×{save.mult}.</p>
          )}
          <div className="mr-sets">
            {MISSION_SETS.map((_, i) => (
              <i key={i} className={i < save.mset ? "is-done" : i === save.mset ? "is-now" : ""} title={`Set ${i + 1}`} />
            ))}
          </div>
        </section>
        <section>
          <h4 className="mr-sec">
            <CalendarIcon /> Daily challenges
            {save.daily?.streak ? (
              <span className="mr-pill mr-pill--sm">
                <FlameIcon /> {save.daily.streak} day{save.daily.streak > 1 ? "s" : ""}
              </span>
            ) : null}
          </h4>
          {daily.map((d) => (
            <div key={d.id} className={`mr-mission${d.done ? " is-done" : ""}`}>
              <span className="mr-mission__check">{d.done ? <CheckIcon /> : null}</span>
              <div className="mr-mission__body">
                <b>{d.text.replace("{n}", fmt(d.target))}</b>
                <Progress value={d.value} target={d.target} done={d.done} />
                <small>
                  {fmt(d.value)} / {fmt(d.target)}
                </small>
              </div>
              <span className="mr-mission__reward">
                <CoinIcon /> {d.reward}
              </span>
            </div>
          ))}
          <p className="mr-small">
            {save.daily?.bonus ? "All done today — come back tomorrow!" : "Clear all three for a 500-coin bonus (more on a streak)."} New challenges in {untilMidnight()}.
          </p>
        </section>
      </div>
    </div>
  );
}

/* ======================================================================= settings */
export function Settings({ save, setSave, commit, back, muted }) {
  const st = save.settings;
  const [confirm, setConfirm] = useState(false);
  const set = (patch) => commit((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  return (
    <div className="mr-screen mr-page">
      <TopBar title="Settings" onBack={back} save={save} />
      <div className="mr-sheet mr-sheet--two" data-ui>
        <section>
          <h4 className="mr-sec">Sound {muted && <span className="mr-pill mr-pill--sm">muted by the player bar</span>}</h4>
          <label className="mr-range">
            <span>Music</span>
            <input type="range" min="0" max="1" step="0.05" value={st.music} onChange={(e) => set({ music: +e.target.value })} />
            <b>{Math.round(st.music * 100)}</b>
          </label>
          <label className="mr-range">
            <span>Effects</span>
            <input type="range" min="0" max="1" step="0.05" value={st.sfx} onChange={(e) => (set({ sfx: +e.target.value }), sound.coin())} />
            <b>{Math.round(st.sfx * 100)}</b>
          </label>
          <h4 className="mr-sec">Graphics</h4>
          <div className="mr-seg" role="radiogroup" aria-label="Graphics quality">
            {[
              ["auto", "Auto"],
              ["high", "High"],
              ["medium", "Medium"],
              ["low", "Low"],
            ].map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={st.quality === k} className={st.quality === k ? "is-on" : ""} onClick={() => (sound.ui(), set({ quality: k }))}>
                {l}
              </button>
            ))}
          </div>
          <p className="mr-small">Low turns off shadows and weather and renders at 1× — best for phones and older laptops.</p>
          <h4 className="mr-sec">Tutorial</h4>
          <button type="button" className="mr-btn" onClick={() => (sound.ui(), commit((s) => ({ ...s, tutorialDone: false })))} disabled={!save.tutorialDone}>
            {save.tutorialDone ? "Show hints on the next run" : "Hints will show on the next run"}
          </button>
        </section>
        <section>
          <h4 className="mr-sec">Controls</h4>
          <table className="mr-keys">
            <tbody>
              <tr><td><kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd></td><td>Change lane</td><td>Swipe ← →</td></tr>
              <tr><td><kbd>↑</kbd> / <kbd>W</kbd> / <kbd>Space</kbd></td><td>Jump</td><td>Swipe ↑</td></tr>
              <tr><td><kbd>↓</kbd> / <kbd>S</kbd></td><td>Slide (dive in the air)</td><td>Swipe ↓</td></tr>
              <tr><td><kbd>B</kbd> / <kbd>Shift</kbd></td><td>Ride a hoverboard</td><td>Double-tap</td></tr>
              <tr><td><kbd>Esc</kbd> / <kbd>P</kbd></td><td>Pause</td><td>❚❚ button</td></tr>
            </tbody>
          </table>
          <h4 className="mr-sec">Progress</h4>
          {!confirm ? (
            <button type="button" className="mr-btn mr-btn--danger" onClick={() => setConfirm(true)}>
              Reset all progress…
            </button>
          ) : (
            <div className="mr-confirm">
              <span>Erase coins, runners, boards, upgrades and missions?</span>
              <button type="button" className="mr-btn mr-btn--danger" onClick={() => (setSave(ensureDaily({ ...defaultSave(), settings: st })), setConfirm(false), sound.back())}>
                Yes, reset
              </button>
              <button type="button" className="mr-btn" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </div>
          )}
          <p className="mr-small">Progress is saved in this browser only.</p>
        </section>
      </div>
    </div>
  );
}

