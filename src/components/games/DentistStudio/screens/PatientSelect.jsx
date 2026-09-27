import { useState } from "react";
import PatientFigure from "../components/PatientFigure.jsx";
import { Icon, Stars } from "../components/ui.jsx";
import { CHAPTERS, levelsInChapter, TOTAL_LEVELS } from "../data/levels.js";
import { getPatient } from "../data/patients.js";
import { totalStars, chapterUnlocked } from "../utils/progress.js";

/** Patient select: chapter tabs + a 5x2 waiting-room of patient cards. */
export default function PatientSelect({ progress, initialChapter = 1, onChapter, onPlay, onBack }) {
  const [ch, setCh] = useState(initialChapter);
  const list = levelsInChapter(ch);
  const chapter = CHAPTERS[ch - 1];
  return (
    <div className="dst-screen dst-list">
      <div className="dst-head">
        <button type="button" className="dst-back" onClick={onBack}>
          <Icon name="back" size={16} /> Menu
        </button>
        <h2>Patients</h2>
        <span className="dst-head__meta">
          <Stars n={1} of={1} size={15} /> {totalStars(progress)} / {TOTAL_LEVELS * 3}
        </span>
      </div>
      <div className="dst-tabs" role="tablist">
        {CHAPTERS.map((c) => {
          const open = chapterUnlocked(progress, c.id);
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === ch}
              className={`dst-tab ${c.id === ch ? "is-on" : ""}`}
              style={{ "--c": c.color }}
              disabled={!open}
              onClick={() => {
                setCh(c.id);
                onChapter?.(c.id);
              }}
            >
              {!open && <Icon name="lock" size={13} />}
              <span className="dst-tab__n">{c.id}</span> {c.name}
            </button>
          );
        })}
      </div>
      <p className="dst-blurb">{chapter?.blurb}</p>
      <div className="dst-cards">
        {list.map((lvl) => {
          const p = getPatient(lvl.patient);
          const rec = progress.levels[lvl.id];
          const locked = lvl.id > progress.unlocked;
          const inProgress = progress.current?.levelId === lvl.id;
          return (
            <button
              key={lvl.id}
              type="button"
              className={`dst-pcard ${locked ? "is-locked" : ""} ${rec?.completed ? "is-done" : ""}`}
              style={{ "--c": p.outfit }}
              disabled={locked}
              onClick={() => onPlay(lvl.id)}
            >
              <span className="dst-pcard__num">{lvl.id}</span>
              <span className="dst-pcard__face">
                <PatientFigure patient={p} head mood={rec?.completed ? "smile" : "calm"} />
                {locked && (
                  <span className="dst-pcard__lock">
                    <Icon name="lock" size={14} />
                  </span>
                )}
              </span>
              <strong>{p.name}</strong>
              <span className="dst-pcard__case">{lvl.caseType}</span>
              <span className="dst-pcard__foot">
                <span className="dst-diff" title={`Difficulty ${lvl.difficulty} of 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <i key={i} className={i < lvl.difficulty ? "on" : ""} />
                  ))}
                </span>
                {inProgress ? <span className="dst-chip">In progress</span> : <Stars n={rec?.stars || 0} size={13} />}
              </span>
            </button>
          );
        })}
        {list.length === 0 && <p className="dst-note">More patients are on their way.</p>}
      </div>
    </div>
  );
}
