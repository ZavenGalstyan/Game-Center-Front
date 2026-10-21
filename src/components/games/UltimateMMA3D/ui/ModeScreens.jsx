/**
 * Tournament (setup + bracket + champion celebration) and Training (lesson
 * list + in-fight lesson panel) screens.
 */
import { useEffect, useState } from "react";
import { FIGHTERS, FIGHTER_BY_ID } from "../data/fighters.js";
import { ROUND_NAMES, playerMatch } from "../engine/tournament.js";
import { LESSONS, DUMMIES } from "../data/training.js";
import { FighterGrid, FighterDetail, ArenaPicker, DifficultyPicker } from "./Screens.jsx";

/* ================================================================ tournament */
export function TournamentSetup({ settings, unlockedTier, onPreview, onCreate, onBack }) {
  const [me, setMe] = useState("petrosyan");
  const [hover, setHover] = useState(null);
  const [arena, setArena] = useState("national");
  const [diff, setDiff] = useState(settings.difficulty);
  const [step, setStep] = useState(0);
  const shown = FIGHTER_BY_ID[hover || me];
  useEffect(() => {
    if (step === 0) onPreview(shown);
  }, [shown, step, onPreview]);
  return (
    <div className="umc-setup">
      <header className="umc-setup__head">
        <button className="umc-back" onClick={() => (step ? setStep(0) : onBack())}>
          ‹ {step ? "Back" : "Menu"}
        </button>
        <h2 className="umc-h2">{step === 0 ? "Tournament — Choose Your Fighter" : "Tournament Settings"}</h2>
      </header>
      {step === 0 ? (
        <div className="umc-select">
          <FighterGrid list={FIGHTERS} value={me} onChange={(id, h) => (h ? setHover(id) : (setHover(null), setMe(id)))} />
          <FighterDetail f={shown} />
        </div>
      ) : (
        <div className="umc-fightset">
          <ArenaPicker value={arena} onChange={setArena} unlockedTier={Math.max(2, unlockedTier)} />
          <DifficultyPicker value={diff} onChange={setDiff} />
        </div>
      )}
      <footer className="umc-setup__foot">
        {step === 0 ? (
          <button className="umc-btn umc-btn--primary" onClick={() => setStep(1)}>
            Next ›
          </button>
        ) : (
          <button className="umc-btn umc-btn--primary umc-btn--big" onClick={() => onCreate({ me, arena, difficulty: diff })}>
            Draw the Bracket
          </button>
        )}
      </footer>
    </div>
  );
}

export function Bracket({ t, onFight, onBack, onAbandon }) {
  const pm = playerMatch(t);
  const name = (id) => FIGHTER_BY_ID[id]?.name || "—";
  const cell = (m, r, i) => (
    <div key={`${r}-${i}`} className={`umc-bm ${m && (m.a === t.player || m.b === t.player) ? "is-you" : ""}`}>
      {m ? (
        <>
          {[m.a, m.b].map((id) => (
            <div key={id} className={`umc-bm__f ${m.winner === id ? "is-w" : m.winner ? "is-l" : ""}`}>
              {FIGHTER_BY_ID[id].flag} {name(id)}
            </div>
          ))}
          {m.winner && <div className="umc-bm__res">{m.method}</div>}
        </>
      ) : (
        <div className="umc-bm__f umc-dim">TBD</div>
      )}
    </div>
  );
  return (
    <div className="umc-page umc-bracket">
      <header className="umc-setup__head">
        <button className="umc-back" onClick={onBack}>
          ‹ Menu
        </button>
        <h2 className="umc-h2">Tournament — {t.done ? "Complete" : ROUND_NAMES[t.round]}</h2>
      </header>
      <div className="umc-bracket__cols">
        {[0, 1, 2].map((r) => (
          <div key={r} className="umc-bracket__col">
            <h3>{ROUND_NAMES[r]}</h3>
            {Array.from({ length: [4, 2, 1][r] }, (_, i) => cell(t.bracket[r][i], r, i))}
          </div>
        ))}
      </div>
      {t.done && (
        <div className={`umc-tchamp ${t.champion === t.player ? "is-you" : ""}`}>
          <div className="umc-champ__belt" style={{ "--belt": "#e8c35a" }}>
            <i />
          </div>
          <div>
            <b>{t.champion === t.player ? "YOU WON THE TOURNAMENT!" : "TOURNAMENT CHAMPION"}</b>
            <span>
              {FIGHTER_BY_ID[t.champion].flag} {name(t.champion)}
            </span>
          </div>
        </div>
      )}
      <footer className="umc-setup__foot">
        {pm && (
          <button className="umc-btn umc-btn--primary umc-btn--big" onClick={() => onFight(pm)}>
            Fight {name(pm.a === t.player ? pm.b : pm.a)} — {ROUND_NAMES[t.round]}
          </button>
        )}
        {(t.done || t.eliminated) && (
          <button className="umc-btn umc-btn--primary" onClick={onAbandon}>
            New Tournament
          </button>
        )}
        {!t.done && !t.eliminated && (
          <button className="umc-btn umc-btn--ghost" onClick={onAbandon}>
            Abandon
          </button>
        )}
      </footer>
    </div>
  );
}

/* ================================================================ training */
export function TrainingMenu({ done, onStart, onBack, onPreview }) {
  const [me, setMe] = useState("petrosyan");
  const [dummy, setDummy] = useState("sparring");
  useEffect(() => {
    onPreview(FIGHTER_BY_ID[me]);
  }, [me, onPreview]);
  return (
    <div className="umc-page umc-trainmenu">
      <header className="umc-setup__head">
        <button className="umc-back" onClick={onBack}>
          ‹ Menu
        </button>
        <h2 className="umc-h2">Training Camp</h2>
      </header>
      <div className="umc-trainmenu__body">
        <div>
          <h3>Lessons</h3>
          <div className="umc-lessons">
            {LESSONS.map((l, i) => (
              <button key={l.id} className={`umc-lesson ${done.includes(l.id) ? "is-done" : ""}`} onClick={() => onStart({ me, lesson: l.id })}>
                <b>
                  {i + 1}. {l.name}
                </b>
                <span>{done.includes(l.id) ? "✓ Complete" : `${l.goals.length} drills`}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3>Free practice</h3>
          <div className="umc-seg umc-seg--wrap">
            <span>Fighter</span>
            {FIGHTERS.map((f) => (
              <button key={f.id} className={`umc-chip ${me === f.id ? "is-on" : ""}`} onClick={() => setMe(f.id)}>
                {f.flag} {f.name.split(" ").pop()}
              </button>
            ))}
          </div>
          <div className="umc-seg umc-seg--wrap">
            <span>Dummy</span>
            {Object.entries(DUMMIES).map(([id, d]) => (
              <button key={id} className={`umc-chip ${dummy === id ? "is-on" : ""}`} onClick={() => setDummy(id)}>
                {d.label}
              </button>
            ))}
          </div>
          <button className="umc-btn umc-btn--primary" onClick={() => onStart({ me, dummy })}>
            Start Free Practice
          </button>
        </div>
      </div>
    </div>
  );
}

export function LessonPanel({ lesson, progress, dummy, setDummy, onNext }) {
  const L = LESSONS.find((l) => l.id === lesson);
  if (!L)
    return (
      <div className="umc-lessonpanel">
        <b>Free practice</b>
        <div className="umc-seg umc-seg--wrap">
          {Object.entries(DUMMIES).map(([id, d]) => (
            <button key={id} className={`umc-chip ${dummy === id ? "is-on" : ""}`} onClick={() => setDummy(id)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
    );
  const complete = L.goals.every((g) => (progress[g.k] || 0) >= g.n);
  return (
    <div className="umc-lessonpanel">
      <b>{L.name}</b>
      <p>{L.tip}</p>
      <ul>
        {L.goals.map((g) => {
          const v = Math.min(g.n, Math.floor(progress[g.k] || 0));
          return (
            <li key={g.k} className={v >= g.n ? "is-done" : ""}>
              {v >= g.n ? "✓" : "○"} {g.text} <em>{v >= g.n ? "" : `${v}/${g.n}`}</em>
            </li>
          );
        })}
      </ul>
      {complete && (
        <button className="umc-btn umc-btn--primary umc-btn--small" onClick={onNext}>
          Lesson complete — next ›
        </button>
      )}
    </div>
  );
}
