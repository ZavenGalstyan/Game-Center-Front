/**
 * Dentist Studio — the quieter screens: Studio (clinic progression), Tools
 * (the tray collection + cosmetic sets), Settings and Statistics.
 */
import ClinicScene from "../components/ClinicScene.jsx";
import { Icon, Stars, ToolIcon } from "../components/ui.jsx";
import { CHAPTERS, levelsInChapter } from "../data/levels.js";
import { TOOLS, TOOL_ORDER } from "../engine/defs.js";
import { TOOL_SETS, DECOR, toolSet } from "../data/cosmetics.js";
import { totalStars, chapterComplete, toolUnlocked } from "../utils/progress.js";

function Head({ title, onBack, meta = null }) {
  return (
    <div className="dst-head">
      <button type="button" className="dst-back" onClick={onBack}>
        <Icon name="back" size={16} /> Back
      </button>
      <h2>{title}</h2>
      <span className="dst-head__meta">{meta}</span>
    </div>
  );
}

/* ------------------------------------------------------------ studio */

export function Studio({ progress, decor, onBack }) {
  return (
    <div className="dst-screen dst-studio">
      <ClinicScene decor={decor} className="dst-studio__scene" />
      <div className="dst-studio__overlay">
        <Head title="Your Studio" onBack={onBack} meta={<><Stars n={1} of={1} size={15} /> {totalStars(progress)}</>} />
        <p className="dst-studio__hint">Finish a chapter to add something new to the studio.</p>
        <div className="dst-card dst-studio__card">
          <ul className="dst-decor">
            {DECOR.map((d) => {
              const ch = CHAPTERS[d.chapter - 1];
              const list = levelsInChapter(d.chapter);
              const n = list.filter((l) => progress.levels[l.id]?.completed > 0).length;
              const have = decor.has(d.id);
              return (
                <li key={d.id} className={have ? "is-on" : ""} style={{ "--c": ch.color }}>
                  <span className="dst-decor__icon">{have ? <Icon name="check" size={14} stroke={3} /> : <Icon name="lock" size={13} />}</span>
                  <span className="dst-decor__txt">
                    <strong>{d.name}</strong>
                    <span>
                      {have ? d.desc : `Chapter ${d.chapter} · ${ch.name} — ${n}/${list.length || 10}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ tools */

export function ToolsScreen({ progress, onSet, onBack }) {
  const stars = totalStars(progress);
  const set = toolSet(progress.toolSet);
  return (
    <div className="dst-screen dst-list dst-toolsview">
      <Head title="Tools" onBack={onBack} meta={<><Stars n={1} of={1} size={15} /> {stars}</>} />
      <div className="dst-tray-case">
        {TOOL_ORDER.map((id) => {
          const open = toolUnlocked(progress, id);
          const t = TOOLS[id];
          return (
            <div key={id} className={`dst-slot ${open ? "" : "is-locked"}`} title={open ? t.desc : `Unlocks in chapter ${t.chapter}`}>
              <ToolIcon tool={id} set={set} size={72} locked={!open} />
              <strong>{t.name}</strong>
              <span>{open ? t.desc : `Chapter ${t.chapter}: ${CHAPTERS[t.chapter - 1].name}`}</span>
            </div>
          );
        })}
      </div>
      <div className="dst-sets">
        <span className="dst-sets__label">Tool colours</span>
        {TOOL_SETS.map((s) => {
          const open = stars >= s.stars;
          return (
            <button key={s.id} type="button" className={`dst-set ${progress.toolSet === s.id ? "is-on" : ""}`} disabled={!open} onClick={() => onSet(s.id)} title={open ? s.name : `${s.stars} stars to unlock`}>
              <span className="dst-set__sw" style={{ background: `linear-gradient(135deg, ${s.light}, ${s.main} 55%, ${s.dark})` }} />
              <span>{s.name}</span>
              {!open && (
                <em>
                  <Icon name="star" size={11} fill stroke={1} /> {s.stars}
                </em>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ settings */

export function Settings({ settings, muted, onChange, onBack }) {
  const toggle = (k, label, hint) => (
    <label className="dst-setting">
      <span>
        <strong>{label}</strong>
        {hint && <em>{hint}</em>}
      </span>
      <input type="checkbox" className="dst-toggle" checked={!!settings[k]} onChange={(e) => onChange({ [k]: e.target.checked })} />
    </label>
  );
  return (
    <div className="dst-screen dst-list">
      <Head title="Settings" onBack={onBack} />
      <div className="dst-card dst-settings">
        {toggle("sound", "Sound", muted ? "Muted by the Game Center" : null)}
        {toggle("music", "Music", "A calm studio tune")}
        <div className="dst-setting">
          <span>
            <strong>Graphics</strong>
            <em>Visual detail only — gameplay is identical</em>
          </span>
          <div className="dst-seg">
            {["low", "medium", "high"].map((g) => (
              <button key={g} type="button" className={settings.graphics === g ? "is-on" : ""} onClick={() => onChange({ graphics: g })}>
                {g}
              </button>
            ))}
          </div>
        </div>
        {toggle("particles", "Particles", "Bubbles, droplets and sparkles")}
        {toggle("smoothing", "Tool smoothing", "Slightly smooths the drawn tool (never the treatment point)")}
        {toggle("assist", "Cleaning assist", "Softly highlights the last spots when a step is nearly done")}
        {toggle("reducedMotion", "Reduced motion", "Skips zooms and sweeps")}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ statistics */

export function Statistics({ progress, onBack }) {
  const s = progress.stats;
  const mins = Math.round(s.playTimeMs / 60000);
  const rows = [
    ["users", "Patients treated", s.patientsTreated],
    ["sparkle", "Teeth cleaned", s.teethCleaned],
    ["tools", "Plaque & tartar removed", s.plaqueRemoved],
    ["eye", "Stains cleaned", s.stainsCleaned],
    ["check", "Food bits removed", s.foodRemoved],
    ["star", "Teeth polished", s.teethPolished],
    ["list", "Gaps flossed", s.flossing],
    ["hint", "Cavities treated", s.cavitiesTreated],
    ["studio", "Braces cleaned", s.bracesCleaned],
    ["star", "Perfect treatments", s.perfectTreatments],
    ["hint", "Hints used", s.hintsUsed],
    ["clock", "Time in the studio", mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} m`],
  ];
  const chDone = CHAPTERS.filter((c) => chapterComplete(progress, c.id)).length;
  return (
    <div className="dst-screen dst-list">
      <Head title="Statistics" onBack={onBack} meta={<>{chDone} / 5 chapters</>} />
      <div className="dst-board">
        {rows.map(([icon, label, v], i) => (
          <div key={label} className="dst-pin" style={{ "--r": `${((i * 37) % 7) - 3}deg` }}>
            <span className="dst-pin__icon">
              <Icon name={icon} size={16} />
            </span>
            <strong>{v}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
