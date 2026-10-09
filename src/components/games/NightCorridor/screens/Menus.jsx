/**
 * Night Corridor — menu screens: Main Menu, Chapters (security-camera
 * frames with each section's floor plan), Statistics, Settings, Controls,
 * the between-sections card and the ending.
 */
import { useMemo } from "react";
import MenuScene from "../three/MenuScene.jsx";
import SettingsPanel from "./SettingsPanel.jsx";
import ControlsList from "./ControlsList.jsx";
import { SECTIONS, TOTAL_SECTIONS } from "../data/sections.js";

export function fmtTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(r).padStart(2, "0")}`;
}

export function MainMenu({ state, audio, onPlay, onNav, onAnyClick }) {
  const started = state.unlocked > 1 || Object.keys(state.completed).length > 0;
  const next = Math.min(state.unlocked, TOTAL_SECTIONS);
  const nextSection = SECTIONS.find((s) => s.id === next);
  return (
    <div className="nc-menu" onPointerDown={onAnyClick}>
      <MenuScene audio={audio} />
      <div className="nc-menu__veil" />
      <div className="nc-menu__content">
        <h1 className="nc-title">
          <span>NIGHT</span>
          <span>CORRIDOR</span>
        </h1>
        <div className="nc-tagline">RUN • HIDE • SURVIVE</div>
        <nav className="nc-menu__nav">
          <button type="button" className="nc-nav-btn nc-nav-btn--primary" onClick={() => onPlay(next)}>
            {started ? "Continue" : "Play"}
            {started && nextSection && <small>Section {String(next).padStart(2, "0")} · {nextSection.name}</small>}
          </button>
          <button type="button" className="nc-nav-btn" onClick={() => onNav("chapters")}>Chapters</button>
          <button type="button" className="nc-nav-btn" onClick={() => onNav("stats")}>Statistics</button>
          <button type="button" className="nc-nav-btn" onClick={() => onNav("settings")}>Settings</button>
          <button type="button" className="nc-nav-btn" onClick={() => onNav("controls")}>Controls</button>
        </nav>
      </div>
      <div className="nc-menu__foot">Headphones recommended · No combat — only escape</div>
    </div>
  );
}

function FloorPlan({ section }) {
  const cells = useMemo(() => {
    const out = [];
    section.map.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === "#" || ch === " ") continue;
        out.push({ c, r, ch });
      }
    });
    return out;
  }, [section]);
  const W = section.map[0].length;
  const H = section.map.length;
  return (
    <svg className="nc-plan" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {cells.map(({ c, r, ch }) => (
        <rect
          key={`${c},${r}`}
          x={c + 0.06}
          y={r + 0.06}
          width={0.88}
          height={0.88}
          className={ch === "D" || ch === "L" || ch === "X" ? "is-door" : ch === "e" ? "is-red" : ch === "@" ? "is-start" : ""}
        />
      ))}
    </svg>
  );
}

export function Chapters({ state, onPick, onBack }) {
  return (
    <div className="nc-screen nc-screen--chapters">
      <header className="nc-screen__head">
        <button type="button" className="nc-back" onClick={onBack}>← Back</button>
        <h2>Chapters</h2>
        <span className="nc-screen__sub">Security feed · {Object.keys(state.completed).length}/{TOTAL_SECTIONS} cleared</span>
      </header>
      <div className="nc-cams">
        {SECTIONS.map((s) => {
          const locked = s.id > state.unlocked;
          const done = Boolean(state.completed[s.id]);
          return (
            <button
              key={s.id}
              type="button"
              className={`nc-cam${locked ? " is-locked" : ""}${done ? " is-done" : ""}`}
              onClick={() => !locked && onPick(s.id)}
              disabled={locked}
              aria-label={locked ? `Section ${s.id} locked` : `Play section ${s.id}: ${s.name}`}
            >
              <div className="nc-cam__screen">
                {!locked && <FloorPlan section={s} />}
                {locked && <div className="nc-cam__static" />}
                <div className="nc-cam__scan" />
                <span className="nc-cam__label">CAM {String(s.id).padStart(2, "0")}</span>
                {!locked && <span className="nc-cam__rec">{done ? "CLEARED" : "● LIVE"}</span>}
                {locked && (
                  <span className="nc-cam__lock">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="5" y="11" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    NO SIGNAL
                  </span>
                )}
              </div>
              <div className="nc-cam__info">
                <span className="nc-cam__num">{String(s.id).padStart(2, "0")}</span>
                <span className="nc-cam__name">{locked ? "— — —" : s.name}</span>
                <span className="nc-cam__best">{done ? fmtTime(state.bestTime[s.id]) : ""}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Statistics({ state, onBack }) {
  const s = state.stats;
  const done = Object.keys(state.completed).length;
  const allDone = done >= TOTAL_SECTIONS;
  const completion = allDone ? SECTIONS.reduce((sum, sec) => sum + (state.bestTime[sec.id] || 0), 0) : null;
  const rows = [
    ["Sections Completed", `${done} / ${TOTAL_SECTIONS}`],
    ["Deaths", s.deaths],
    ["Chases Survived", s.chasesSurvived],
    ["Keys Found", s.keysFound],
    ["Times Hidden", s.hides],
    ["Distance Walked", s.distance >= 1000 ? `${(s.distance / 1000).toFixed(2)} km` : `${Math.round(s.distance)} m`],
    ["Playtime", fmtTime(s.playtime)],
    ["Completion Time", completion != null ? fmtTime(completion) : "Escape first"],
  ];
  return (
    <div className="nc-screen">
      <header className="nc-screen__head">
        <button type="button" className="nc-back" onClick={onBack}>← Back</button>
        <h2>Statistics</h2>
        <span className="nc-screen__sub">Incident report</span>
      </header>
      <div className="nc-report">
        {rows.map(([k, v]) => (
          <div key={k} className="nc-report__row">
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsScreen({ settings, onChange, muted, onBack }) {
  return (
    <div className="nc-screen">
      <header className="nc-screen__head">
        <button type="button" className="nc-back" onClick={onBack}>← Back</button>
        <h2>Settings</h2>
      </header>
      <div className="nc-screen__body">
        <SettingsPanel settings={settings} onChange={onChange} muted={muted} />
      </div>
    </div>
  );
}

export function ControlsScreen({ onBack }) {
  return (
    <div className="nc-screen">
      <header className="nc-screen__head">
        <button type="button" className="nc-back" onClick={onBack}>← Back</button>
        <h2>Controls</h2>
      </header>
      <div className="nc-screen__body">
        <ControlsList />
      </div>
    </div>
  );
}

export function SectionCleared({ section, result, best, hasNext, onNext, onMenu }) {
  return (
    <div className="nc-cleared">
      <div className="nc-cleared__panel">
        <div className="nc-cleared__kicker">SECTION {String(section.id).padStart(2, "0")} CLEARED</div>
        <div className="nc-cleared__name">{section.name}</div>
        <div className="nc-cleared__stats">
          <div><span>Time</span><b>{fmtTime(result.time)}</b></div>
          <div><span>Best</span><b>{fmtTime(best)}</b></div>
          <div><span>Caught</span><b>{result.deaths}</b></div>
        </div>
        <div className="nc-cleared__actions">
          {hasNext && (
            <button type="button" className="nc-menu-btn nc-menu-btn--primary" onClick={onNext} autoFocus>
              Go Deeper
            </button>
          )}
          <button type="button" className="nc-menu-btn nc-menu-btn--dim" onClick={onMenu}>Main Menu</button>
        </div>
      </div>
    </div>
  );
}

export function Ending({ state, onMenu }) {
  const total = SECTIONS.reduce((sum, sec) => sum + (state.bestTime[sec.id] || 0), 0);
  return (
    <div className="nc-ending">
      <div className="nc-ending__light" />
      <div className="nc-ending__content">
        <div className="nc-ending__kicker">5:12 AM</div>
        <h2>YOU ESCAPED</h2>
        <p>The door gives. Cold air, grey sky, rain. Behind you the building is silent — for now.</p>
        <div className="nc-cleared__stats">
          <div><span>Completion</span><b>{fmtTime(total)}</b></div>
          <div><span>Caught</span><b>{state.stats.deaths}</b></div>
          <div><span>Chases Survived</span><b>{state.stats.chasesSurvived}</b></div>
        </div>
        <button type="button" className="nc-menu-btn nc-menu-btn--primary" onClick={onMenu}>Main Menu</button>
      </div>
    </div>
  );
}
