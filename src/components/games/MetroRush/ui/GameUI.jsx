/**
 * Metro Rush — in-run UI: HUD, power-up timers, toasts, tutorial hints,
 * countdown, pause menu, revive offer and the results screen. It renders
 * from the controller's HUD snapshot (~12 Hz), never per frame.
 */
import { CHARACTERS } from "../data/characters.js";
import { POWER_LABEL } from "../data/missions.js";
import { BoardIcon, CheckIcon, CoinIcon, HomeIcon, PauseIcon, PlayIcon, POWER_ICONS, RestartIcon, RunnerIcon, TargetIcon, TrophyIcon } from "./icons.jsx";

const fmt = (n) => Math.floor(n || 0).toLocaleString("en-US");

const HINTS = {
  jump: { key: "↑", swipe: "Swipe up", verb: "JUMP", arrow: "↑" },
  slide: { key: "↓", swipe: "Swipe down", verb: "SLIDE", arrow: "↓" },
  lane: { key: "← →", swipe: "Swipe left or right", verb: "DODGE", arrow: "⇆" },
};

function MissionList({ missions }) {
  return (
    <div className="mr-mlist">
      {missions.map((m) => (
        <div key={m.id} className={`mr-mlist__row${m.done ? " is-done" : ""}`}>
          <span className="mr-mlist__ck">{m.done ? <CheckIcon /> : null}</span>
          <span className="mr-mlist__t">{m.text}</span>
          <span className="mr-mlist__v">{m.done ? "Done" : `${fmt(m.value)}/${fmt(m.target)}`}</span>
        </div>
      ))}
    </div>
  );
}

export default function GameUI({ hud, touch, save, game, onMenu, onRestart, onCharacters }) {
  const st = hud.state;
  if (st === "idle" || hud.score === undefined) return <div className="mr-screen" />;
  const g = game.current;
  const count = st === "countdown" ? Math.ceil(hud.countdown / 0.8) : 0;
  const nextChar = CHARACTERS.find((c) => !save.chars[c.id]);

  return (
    <div className={`mr-screen mr-game mr-game--${st}`}>
      {/* ---------------- HUD */}
      <div className="mr-hud" data-hud>
        <div className="mr-hud__left">
          <button type="button" className="mr-iconbtn mr-hud__pause" onClick={() => g?.pause("user")} aria-label="Pause" data-ui disabled={st !== "play" && st !== "countdown"}>
            <PauseIcon />
          </button>
          <div className="mr-hud__stack">
            <span className="mr-hud__dist">{fmt(hud.dist)} m</span>
            <span className="mr-coins mr-coins--hud">
              <CoinIcon />
              <b>{fmt(hud.coins)}</b>
            </span>
          </div>
        </div>
        <div className="mr-hud__right">
          <div className="mr-hud__score">
            <b>{fmt(hud.score)}</b>
            <span className={`mr-hud__mult${hud.mult > save.mult ? " is-hot" : ""}`}>×{hud.mult}</span>
          </div>
          {hud.best > 0 && hud.score > hud.best && <span className="mr-hud__best">NEW BEST!</span>}
        </div>
        <div className="mr-powers">
          {hud.powers.map((p) => {
            const Icon = POWER_ICONS[p.kind];
            return (
              <div key={p.kind} className={`mr-power mr-power--${p.kind}${p.left < 2 ? " is-ending" : ""}`} title={POWER_LABEL[p.kind]}>
                <span className="mr-power__icon">
                  <Icon />
                </span>
                <span className="mr-power__bar">
                  <i style={{ width: `${Math.max(0, Math.min(1, p.frac)) * 100}%` }} />
                </span>
                <span className="mr-power__t">{Math.ceil(p.left)}s</span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className={`mr-boardbtn${hud.boardActive ? " is-active" : ""}`}
          onClick={() => g?.useBoard()}
          disabled={st !== "play" || hud.boardActive || hud.boards <= 0}
          aria-label={`Ride a hoverboard (${hud.boards} left)`}
          data-ui
        >
          <BoardIcon />
          <b>{hud.boards}</b>
          {!touch && <kbd>B</kbd>}
        </button>
      </div>

      <div className="mr-toasts">
        {hud.toasts.map((t) => (
          <div key={t.id} className={`mr-toast mr-toast--${t.kind}`}>
            <b>{t.text}</b>
            {t.sub && <span>{t.sub}</span>}
          </div>
        ))}
      </div>
      {hud.banner && (
        <div className="mr-banner" key={hud.banner.text}>
          {hud.banner.text}
        </div>
      )}
      {st === "play" && hud.hint && HINTS[hud.hint] && (
        <div className="mr-tut" key={hud.hint}>
          <span className="mr-tut__arrow">{HINTS[hud.hint].arrow}</span>
          <span>
            {touch ? HINTS[hud.hint].swipe : <>Press <kbd>{HINTS[hud.hint].key}</kbd></>} to <b>{HINTS[hud.hint].verb}</b>
          </span>
        </div>
      )}

      {/* ---------------- countdown */}
      {st === "countdown" && count > 0 && (
        <div className="mr-count" key={count}>
          {count}
        </div>
      )}

      {/* ---------------- pause */}
      {st === "paused" && (
        <div className="mr-modal" data-ui>
          <div className="mr-modal__card">
            <h2>Paused</h2>
            {hud.pauseReason === "hidden" && <p className="mr-small">We paused while you were away.</p>}
            {hud.pauseReason === "graphics" && <p className="mr-small">Paused while the graphics recover.</p>}
            <div className="mr-modal__stats">
              <span>
                <TrophyIcon /> {fmt(hud.score)}
              </span>
              <span>{fmt(hud.dist)} m</span>
              <span>
                <CoinIcon /> {fmt(hud.coins)}
              </span>
            </div>
            <MissionList missions={hud.missions} />
            <div className="mr-modal__btns">
              <button type="button" className="mr-btn mr-btn--primary" onClick={() => g?.resume()} autoFocus>
                <PlayIcon /> Resume
              </button>
              <button type="button" className="mr-btn" onClick={onRestart}>
                <RestartIcon /> Restart
              </button>
              <button type="button" className="mr-btn" onClick={onMenu}>
                <HomeIcon /> Main menu
              </button>
            </div>
            {!touch && <p className="mr-small mr-center">Press <kbd>Esc</kbd> to resume</p>}
          </div>
        </div>
      )}

      {/* ---------------- crash / revive */}
      {st === "dead" && (
        <div className="mr-crash" data-ui>
          <div className="mr-crash__title">CRASH!</div>
          {hud.revive.can && (
            <div className="mr-revive">
              <div className="mr-revive__ring" style={{ "--f": Math.max(0, hud.revive.left / hud.revive.max) }}>
                <span>{Math.max(0, Math.ceil(hud.revive.left))}</span>
              </div>
              <div className="mr-revive__txt">
                <b>Keep running?</b>
                <small>
                  You have <CoinIcon /> {fmt(hud.revive.avail)}
                </small>
              </div>
              <button type="button" className="mr-btn mr-btn--primary" onClick={() => g?.revive()} autoFocus>
                Revive <span className="mr-btn__cost"><CoinIcon /> {fmt(hud.revive.cost)}</span>
              </button>
              <button type="button" className="mr-btn mr-btn--ghost" onClick={() => g?.skipRevive()}>
                No thanks
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------------- results */}
      {st === "results" && hud.report && (
        <div className="mr-modal mr-results" data-ui>
          <div className="mr-modal__card mr-results__card">
            <div className="mr-results__head">
              <span className="mr-results__lbl">Score</span>
              <b className="mr-results__score">{fmt(hud.report.stats.score)}</b>
              {hud.report.newBest && <span className="mr-badge">NEW BEST!</span>}
            </div>
            <div className="mr-results__grid">
              <div>
                <small>Distance</small>
                <b>{fmt(hud.report.stats.dist)} m</b>
              </div>
              <div>
                <small>Coins</small>
                <b>
                  <CoinIcon /> {fmt(hud.report.coins)}
                </b>
              </div>
              <div>
                <small>Rewards</small>
                <b>
                  <CoinIcon /> {fmt(hud.report.missionCoins)}
                </b>
              </div>
              <div>
                <small>Best</small>
                <b>{fmt(save.best)}</b>
              </div>
            </div>
            {(hud.report.missions.length > 0 || hud.report.daily.length > 0 || hud.report.setDone) && (
              <div className="mr-results__earned">
                {hud.report.missions.map((m) => (
                  <div key={m.id} className="mr-earn">
                    <CheckIcon /> {m.text}
                    <span>+{m.reward}</span>
                  </div>
                ))}
                {hud.report.daily.map((m) => (
                  <div key={m.id} className="mr-earn mr-earn--daily">
                    <CheckIcon /> Daily: {m.text.replace("{n}", fmt(m.target))}
                    <span>+{m.reward}</span>
                  </div>
                ))}
                {hud.report.dailyBonus > 0 && (
                  <div className="mr-earn mr-earn--gold">
                    All daily challenges! <span>+{hud.report.dailyBonus}</span>
                  </div>
                )}
                {hud.report.setDone && (
                  <div className="mr-earn mr-earn--gold">
                    <TargetIcon /> Mission set {hud.report.setDone.index + 1} complete — multiplier ×{hud.report.setDone.mult}! <span>+{hud.report.setDone.bonus}</span>
                  </div>
                )}
              </div>
            )}
            {hud.report.spent > 0 && <p className="mr-small mr-center">Revives cost {fmt(hud.report.spent)} coins.</p>}
            <div className="mr-modal__btns">
              <button type="button" className="mr-btn mr-btn--primary" onClick={onRestart} autoFocus>
                <RestartIcon /> Run again
              </button>
              <button type="button" className="mr-btn" onClick={onMenu}>
                <HomeIcon /> Menu
              </button>
              <button type="button" className="mr-btn" onClick={onCharacters}>
                <RunnerIcon /> Runners
              </button>
            </div>
            <p className="mr-small mr-center">
              Bank: <CoinIcon /> {fmt(save.coins)}
              {nextChar && save.coins < nextChar.price && <> · {fmt(nextChar.price - save.coins)} more to unlock {nextChar.name}</>}
              {nextChar && save.coins >= nextChar.price && <> · You can unlock {nextChar.name}!</>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
