/**
 * Motel 6: Last Guest — full-screen overlays: main menu, night select,
 * endings gallery, settings, how-to-play, night intro, night summary,
 * failure, pause and ending screens.
 */
import { NIGHTS, NIGHT_COUNT, ENDINGS, ENDING_BY_ID, CRITICAL, rulesForNight } from "./data.js";
import { fmtDate } from "./engine.js";
import { portraitURL } from "./portrait.js";
import { GUESTS } from "./guests.js";

const TRUTH = { guest: "Genuine guest", invalid: "Broke the rules", forger: "Forger", entity: "Not human" };

export function Settings({ settings, onChange }) {
  return (
    <div className="m6-settings">
      <label>
        <span>Volume</span>
        <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} />
      </label>
      <label>
        <span>Look sensitivity</span>
        <input type="range" min="0.3" max="2.5" step="0.1" value={settings.sens} onChange={(e) => onChange({ sens: Number(e.target.value) })} />
      </label>
      <label className="m6-check">
        <input type="checkbox" checked={settings.scares === "full"} onChange={(e) => onChange({ scares: e.target.checked ? "full" : "reduced" })} />
        <span>Jumpscares (off = sound only, no flashes)</span>
      </label>
      <label className="m6-check">
        <input type="checkbox" checked={settings.hints} onChange={(e) => onChange({ hints: e.target.checked })} />
        <span>Show tutorial hints</span>
      </label>
    </div>
  );
}

export function HowTo() {
  return (
    <div className="m6-howto">
      <p>You are the night clerk. Each guest hands you an ID. Check it against the <b>reservation terminal</b>, the <b>room board</b>, the <b>cameras</b> and their <b>answers</b>, using the rules in the <b>rulebook</b>. Then stamp <b>ACCEPT</b> or <b>REJECT</b> — and cite the rule they broke.</p>
      <ul>
        <li><kbd>I</kbd> ID · <kbd>T</kbd> terminal · <kbd>B</kbd> room board · <kbd>Q</kbd> questions · <kbd>R</kbd> rulebook · <kbd>J</kbd> evidence · <kbd>C</kbd> cameras</li>
        <li>Between guests press <kbd>F</kbd> (Explore) to walk: <kbd>WASD</kbd> move, drag to look, <kbd>E</kbd> or click to examine, <kbd>Shift</kbd> to hurry.</li>
        <li>Every suspicious guest leaves a clue you can find. Mistakes raise <b>suspicion</b> — if it fills, the motel keeps you and you retry the night.</li>
        <li>Collect evidence. On the seventh night, it decides how your story ends.</li>
      </ul>
    </div>
  );
}

export function MainMenu({ view, setView, save, records, onContinue, onNew, onNight, settings, onSettings }) {
  const canContinue = save && save.phase !== "ended";
  return (
    <div className="m6-menu">
      <div className="m6-menu__title">
        <h1 className="m6-neon">MOTEL <span>6</span></h1>
        <h2>LAST GUEST</h2>
        <p className="m6-menu__tag">CHECK • DECIDE • SURVIVE</p>
      </div>
      {view === "main" && (
        <nav className="m6-menu__nav">
          {canContinue && (
            <button type="button" className="m6-btn m6-btn--primary m6-btn--lg" onClick={onContinue}>
              Continue <small>Night {save.night} · {fmtDate(NIGHTS[save.night].date)}</small>
            </button>
          )}
          <button type="button" className={`m6-btn m6-btn--lg${canContinue ? "" : " m6-btn--primary"}`} onClick={() => (save ? setView("confirm") : onNew())}>New Game</button>
          <button type="button" className="m6-btn" onClick={() => setView("nights")} disabled={!save}>Nights</button>
          <button type="button" className="m6-btn" onClick={() => setView("endings")}>Endings <small>{records.endings.length}/{ENDINGS.length}</small></button>
          <button type="button" className="m6-btn" onClick={() => setView("settings")}>Settings</button>
          <button type="button" className="m6-btn" onClick={() => setView("how")}>How to play</button>
        </nav>
      )}
      {view !== "main" && (
        <div className="m6-menu__card">
          {view === "confirm" && (
            <>
              <h3>Start over?</h3>
              <p>Your current shift and evidence will be erased. Unlocked endings are kept.</p>
              <div className="m6-row">
                <button type="button" className="m6-btn m6-btn--red" onClick={onNew}>Erase &amp; start</button>
                <button type="button" className="m6-btn m6-btn--ghost" onClick={() => setView("main")}>Cancel</button>
              </div>
            </>
          )}
          {view === "nights" && (
            <>
              <h3>Nights</h3>
              <p className="m6-dim">Replay any night you have reached. Progress after it is erased; evidence from earlier nights is kept.</p>
              <div className="m6-nights">
                {Array.from({ length: NIGHT_COUNT }, (_, i) => i + 1).map((n) => {
                  const open = save && n <= save.reached && save.nightStart?.[n];
                  return (
                    <button key={n} type="button" className={`m6-nightc${open ? "" : " is-locked"}${save?.night === n ? " is-cur" : ""}`} disabled={!open} onClick={() => onNight(n)}>
                      <b>Night {n}</b>
                      <span>{open ? NIGHTS[n].title : "Locked"}</span>
                      <small>{fmtDate(NIGHTS[n].date)}</small>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {view === "endings" && (
            <>
              <h3>Endings</h3>
              <div className="m6-endings">
                {ENDINGS.map((e) => {
                  const got = records.endings.includes(e.id);
                  return (
                    <div key={e.id} className={`m6-endc${got ? " is-got" : ""} m6-endc--${e.id}`}>
                      <b>{got ? e.title : "Locked"}</b>
                      <small>{e.kind}</small>
                      <p>{got ? "Unlocked." : `Clue: ${e.hint}`}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {view === "settings" && (
            <>
              <h3>Settings</h3>
              <Settings settings={settings} onChange={onSettings} />
            </>
          )}
          {view === "how" && (
            <>
              <h3>How to play</h3>
              <HowTo />
            </>
          )}
          {view !== "confirm" && <button type="button" className="m6-btn m6-btn--ghost" onClick={() => setView("main")}>Back</button>}
        </div>
      )}
      <p className="m6-menu__foot">Headphones recommended.</p>
    </div>
  );
}

export function NightIntro({ gs, onBegin }) {
  const night = NIGHTS[gs.night];
  const fresh = rulesForNight(gs.night).filter((r) => r.night === gs.night);
  const resumed = gs.step > 0;
  return (
    <div className="m6-full m6-intro">
      <div className="m6-intro__card">
        <p className="m6-eyebrow">{fmtDate(night.date)} · 11:00 PM</p>
        <h2>Night {gs.night} <span>— {night.title}</span></h2>
        <p className="m6-intro__text">{night.intro}</p>
        {fresh.length > 0 && (
          <div className="m6-intro__rules">
            <h4>{gs.night === 1 ? "Rules" : "New rules tonight"}</h4>
            {fresh.map((r) => <div key={r.id}><b>{r.title}.</b> {r.text}</div>)}
          </div>
        )}
        <div className="m6-intro__stats">
          <span>Suspicion <b>{gs.stats.suspicion}%</b></span>
          <span>Evidence <b>{gs.evidence.length}</b></span>
          <span>Critical <b>{CRITICAL.filter((id) => gs.evidence.includes(id)).length}/{CRITICAL.length}</b></span>
        </div>
        <button type="button" className="m6-btn m6-btn--primary m6-btn--lg" onClick={onBegin} autoFocus>{resumed ? "Resume shift" : "Begin shift"}</button>
      </div>
    </div>
  );
}

export function Summary({ gs, summary, onNext, onRetry }) {
  const night = NIGHTS[gs.night];
  const ok = summary.rows.filter((r) => r.correct).length;
  return (
    <div className="m6-full m6-sum">
      <div className="m6-sum__card">
        <p className="m6-eyebrow">Night {gs.night} · {night.title} · 6:00 AM</p>
        <h2>Shift report</h2>
        <p className="m6-sum__outro">{night.outro}</p>
        <div className="m6-sum__rows">
          {summary.rows.map((r) => (
            <div key={r.id} className={`m6-sumr${r.correct ? " is-ok" : " is-bad"}`}>
              <img src={portraitURL(GUESTS[r.id].face, { id: "s" + r.id })} alt="" />
              <div>
                <b>{r.name}</b>
                <small>{r.decision ? (r.decision === "accept" ? "Accepted" : "Rejected") : "—"}{r.reason ? ` · cited “${r.reason}”` : ""}{r.decision === "reject" && r.correct && !r.cited ? " · wrong rule cited" : ""}</small>
                <span>{r.explain.join(" ")}</span>
              </div>
              <em className={`m6-truth m6-truth--${r.truth}`}>{TRUTH[r.truth]}</em>
              <i>{r.correct ? "✓" : "✗"}</i>
            </div>
          ))}
        </div>
        <div className="m6-intro__stats">
          <span>Correct <b>{ok}/{summary.rows.length}</b></span>
          <span>Suspicion <b>{gs.stats.suspicion}%</b></span>
          <span>New evidence <b>{summary.found.length}</b></span>
          <span>Critical <b>{summary.critical}/{CRITICAL.length}</b></span>
        </div>
        <div className="m6-row">
          <button type="button" className="m6-btn m6-btn--primary m6-btn--lg" onClick={onNext}>Night {gs.night + 1} ▸</button>
          <button type="button" className="m6-btn m6-btn--ghost" onClick={onRetry}>Replay night {gs.night}</button>
        </div>
      </div>
    </div>
  );
}

export function Failed({ gs, onRetry, onMenu }) {
  return (
    <div className="m6-full m6-fail">
      <div className="m6-intro__card">
        <p className="m6-eyebrow">Night {gs.night} · {NIGHTS[gs.night].title}</p>
        <h2 className="m6-redtext">The motel kept you.</h2>
        <p className="m6-intro__text">Too many wrong guests. At 4 AM the lights go out and do not come back on. In the dark, the bell on the desk rings once — from your side of the counter.</p>
        <p className="m6-dim">Suspicion reached 100%. Every suspicious guest has a clue: check the rulebook against the ID, terminal, room board, cameras and answers.</p>
        <div className="m6-row">
          <button type="button" className="m6-btn m6-btn--primary m6-btn--lg" onClick={onRetry} autoFocus>Retry night {gs.night}</button>
          <button type="button" className="m6-btn m6-btn--ghost" onClick={onMenu}>Main menu</button>
        </div>
      </div>
    </div>
  );
}

export function Pause({ onResume, onRestart, onQuit, view, setView, settings, onSettings, rulebook }) {
  return (
    <div className="m6-full m6-pause">
      <div className="m6-intro__card">
        {view === "main" && (
          <>
            <h2>Paused</h2>
            <div className="m6-col">
              <button type="button" className="m6-btn m6-btn--primary m6-btn--lg" onClick={onResume} autoFocus>Resume</button>
              <button type="button" className="m6-btn" onClick={() => setView("rules")}>Rulebook</button>
              <button type="button" className="m6-btn" onClick={() => setView("settings")}>Settings</button>
              <button type="button" className="m6-btn" onClick={() => setView("how")}>How to play</button>
              <button type="button" className="m6-btn" onClick={onRestart}>Restart night</button>
              <button type="button" className="m6-btn m6-btn--ghost" onClick={onQuit}>Save &amp; quit to menu</button>
            </div>
          </>
        )}
        {view === "settings" && <><h2>Settings</h2><Settings settings={settings} onChange={onSettings} /></>}
        {view === "how" && <><h2>How to play</h2><HowTo /></>}
        {view === "rules" && <><h2>Rulebook</h2>{rulebook}</>}
        {view !== "main" && <button type="button" className="m6-btn m6-btn--ghost" onClick={() => setView("main")}>Back</button>}
      </div>
    </div>
  );
}

export function EndingScreen({ gs, records, onMenu, onReplay }) {
  const e = ENDING_BY_ID[gs.ending];
  if (!e) return null;
  return (
    <div className={`m6-full m6-ending m6-ending--${e.id}`}>
      <div className="m6-ending__card">
        <p className="m6-eyebrow">{e.kind}</p>
        <h2>{e.title}</h2>
        <div className="m6-ending__text">{e.text}</div>
        <div className="m6-intro__stats">
          <span>Correct calls <b>{gs.stats.correct}</b></span>
          <span>Mistakes <b>{gs.stats.mistakes}</b></span>
          <span>Evidence <b>{gs.evidence.length}</b></span>
          <span>Critical <b>{CRITICAL.filter((id) => gs.evidence.includes(id)).length}/{CRITICAL.length}</b></span>
          <span>Endings <b>{records.endings.length}/{ENDINGS.length}</b></span>
        </div>
        {records.endings.length < ENDINGS.length && (
          <p className="m6-dim">Still locked: {ENDINGS.filter((x) => !records.endings.includes(x.id)).map((x) => `${x.kind} — ${x.hint}`).join(" · ")}</p>
        )}
        <div className="m6-row">
          <button type="button" className="m6-btn m6-btn--primary m6-btn--lg" onClick={onMenu} autoFocus>Main menu</button>
          <button type="button" className="m6-btn m6-btn--ghost" onClick={onReplay}>Replay the last night</button>
        </div>
      </div>
    </div>
  );
}
