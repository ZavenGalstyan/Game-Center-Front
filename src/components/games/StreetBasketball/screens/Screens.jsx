/**
 * Street Basketball — Quick Match, Training, Statistics and Settings.
 */
import { useState } from "react";
import { COURTS, courtById } from "../data/courts.js";
import { OPPONENTS, ARCHETYPES } from "../data/opponents.js";
import { opponentLook } from "../utils/progress.js";
import Portrait from "../hud/Portrait.jsx";

/* ------------------------------------------------------------ quick match */
export function QuickMatch({ progress, onPlay, onBack }) {
  const beaten = OPPONENTS.filter((o) => progress.defeated.includes(o.id));
  const [sel, setSel] = useState(beaten.length ? beaten[beaten.length - 1].id : null);
  const [courtId, setCourtId] = useState(beaten.length ? beaten[beaten.length - 1].court : "neighborhood");
  const [target, setTarget] = useState(11);
  return (
    <div className="sb-screen sb-quick">
      <header className="sb-head">
        <button type="button" className="sb-back" onClick={onBack}>‹ MENU</button>
        <h1>QUICK MATCH</h1>
        <span className="sb-head__meta">NO CAREER CHANGES</span>
      </header>
      {!beaten.length ? (
        <p className="sb-empty">Beat a rival in Career to replay them here.</p>
      ) : (
        <div className="sb-quick__body">
          <div className="sb-quick__grid">
            {beaten.map((o) => (
              <button type="button" key={o.id} className={`sb-qcard${o.id === sel ? " is-sel" : ""}`} onClick={() => setSel(o.id)}>
                <Portrait look={opponentLook(o)} size={52} />
                <b>{o.first} “{o.nickname}”</b>
                <small>{ARCHETYPES[o.archetype].label}</small>
              </button>
            ))}
          </div>
          <div className="sb-quick__side">
            <div className="sb-field">
              <span>COURT</span>
              <div className="sb-seg">
                {COURTS.map((c) => (
                  <button type="button" key={c.id} disabled={!progress.unlockedCourts.includes(c.id)} className={c.id === courtId ? "is-on" : ""} onClick={() => setCourtId(c.id)}>{c.short}</button>
                ))}
              </div>
            </div>
            <div className="sb-field">
              <span>GAME TO</span>
              <div className="sb-seg">
                {[7, 11, 15].map((n) => (
                  <button type="button" key={n} className={n === target ? "is-on" : ""} onClick={() => setTarget(n)}>{n}</button>
                ))}
              </div>
            </div>
            <button type="button" className="sb-btn sb-btn--primary" disabled={!sel} onClick={() => onPlay(sel, courtId, target)}>PLAY</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ training */
const DRILLS = [
  { id: "free", name: "FREE SHOOT", blurb: "Unlimited ball, no defender. Groove your release — the rebounder feeds you.", rec: (r) => `${r.free.makes}/${r.free.attempts} made · best streak ${r.free.bestStreak}` },
  { id: "three", name: "3-POINT CHALLENGE", blurb: "5 spots, 3 balls each, 70 seconds. The last ball at every spot is the money ball (3).", rec: (r) => `Best ${r.three.best}` },
  { id: "dunk", name: "DUNK PRACTICE", blurb: "60 seconds. Sprint (Shift) and drive (L) — dunks 3, layups 1.", rec: (r) => `Best ${r.dunk.best}` },
  { id: "dribble", name: "DRIBBLE PRACTICE", blurb: "Weave the cone gates in order with the ball. Cross (K) to change direction fast.", rec: (r) => (r.dribble.best ? `Best ${r.dribble.best.toFixed(2)}s` : "No time yet") },
  { id: "defense", name: "DEFENSE PRACTICE", blurb: "8 possessions against a sparring partner. Stay in front, contest, time your steals.", rec: (r) => `Best ${r.defense.best}/8 stops` },
];

export function Training({ progress, onStart, onBack }) {
  return (
    <div className="sb-screen sb-training">
      <header className="sb-head">
        <button type="button" className="sb-back" onClick={onBack}>‹ MENU</button>
        <h1>TRAINING</h1>
        <span className="sb-head__meta">{progress.statistics.trainingSessions} SESSIONS</span>
      </header>
      <div className="sb-drills">
        {DRILLS.map((d, i) => (
          <button type="button" key={d.id} className={`sb-drill sb-drill--${d.id}`} onClick={() => onStart(d.id)}>
            <span className="sb-drill__num">{String(i + 1).padStart(2, "0")}</span>
            <DrillArt id={d.id} />
            <b>{d.name}</b>
            <p>{d.blurb}</p>
            <small>{d.rec(progress.trainingRecords)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Little half-court chalkboard diagram for each drill. */
function DrillArt({ id }) {
  const line = "rgba(255,255,255,0.5)";
  const hot = "#ff7a1a";
  return (
    <svg className="sb-drill__art" viewBox="0 0 120 84" aria-hidden="true">
      <rect x="2" y="2" width="116" height="80" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" />
      <path d="M22 6 A 42 42 0 0 0 98 6" fill="none" stroke={line} strokeWidth="1.5" transform="translate(0 0) scale(1 1.25)" />
      <rect x="46" y="6" width="28" height="30" fill="rgba(255,255,255,0.06)" stroke={line} strokeWidth="1.5" />
      <line x1="52" y1="8" x2="68" y2="8" stroke="#fff" strokeWidth="2.5" />
      <circle cx="60" cy="12" r="3.2" fill="none" stroke={hot} strokeWidth="1.6" />
      {id === "free" && (
        <g>
          <circle cx="60" cy="58" r="4" fill={hot} />
          <path d="M60 54 Q 60 22 60 15" fill="none" stroke="#fff" strokeWidth="1.4" strokeDasharray="3 3" />
        </g>
      )}
      {id === "three" && [[18, 16], [32, 50], [60, 64], [88, 50], [102, 16]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.6" fill={i === 2 ? "#39e37a" : "#f5c542"} />
      ))}
      {id === "dunk" && (
        <g>
          <path d="M96 66 Q 80 40 62 16" fill="none" stroke={hot} strokeWidth="2.2" />
          <path d="M62 16 l2 7 l5 -4 z" fill={hot} />
          <circle cx="96" cy="66" r="4" fill="#fff" />
        </g>
      )}
      {id === "dribble" && (
        <g>
          {[[82, 72], [38, 60], [82, 48], [38, 36], [76, 24]].map(([x, y], i) => <path key={i} d={`M${x} ${y - 5} l4 8 h-8 z`} fill={hot} />)}
          <path d="M60 80 L82 70 L38 58 L82 46 L38 34 L76 22" fill="none" stroke="#fff" strokeWidth="1.3" strokeDasharray="3 3" />
        </g>
      )}
      {id === "defense" && (
        <g>
          <circle cx="60" cy="62" r="4.5" fill="#4f8dff" />
          <circle cx="60" cy="46" r="4.5" fill={hot} />
          <path d="M50 46 h20" stroke={hot} strokeWidth="2" />
          <path d="M60 58 v-4" stroke="#fff" strokeWidth="1.3" />
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------ statistics */
export function Statistics({ progress, onBack }) {
  const s = progress.statistics;
  const pct = s.fga ? Math.round((s.fgm / s.fga) * 100) : 0;
  const hrs = Math.floor(s.playTimeSec / 3600);
  const mins = Math.floor((s.playTimeSec % 3600) / 60);
  const big = [
    ["WINS", s.wins],
    ["LOSSES", s.losses],
    ["STREAK", s.winStreak],
    ["BEST STREAK", s.bestWinStreak],
  ];
  const rows = [
    ["MATCHES PLAYED", s.matches],
    ["POINTS SCORED", s.points],
    ["SHOTS MADE", s.fgm],
    ["SHOTS ATTEMPTED", s.fga],
    ["SHOT %", `${pct}%`],
    ["PERFECT RELEASES", s.perfect],
    ["2-POINT SHOTS", `${s.twoM}/${s.twoA}`],
    ["LAYUPS", s.layups],
    ["DUNKS", s.dunks],
    ["BLOCKS", s.blocks],
    ["STEALS", s.steals],
    ["REBOUNDS", s.rebounds],
    ["CROSSOVERS", s.crossovers],
    ["SWISHES", s.swishes],
    ["OPPONENTS DEFEATED", `${progress.defeated.length}/25`],
    ["COURTS UNLOCKED", `${progress.unlockedCourts.length}/5`],
    ["TRAINING SESSIONS", s.trainingSessions],
    ["TOTAL PLAY TIME", `${hrs}h ${mins}m`],
  ];
  return (
    <div className="sb-screen sb-stats">
      <header className="sb-head">
        <button type="button" className="sb-back" onClick={onBack}>‹ MENU</button>
        <h1>STATISTICS</h1>
        <span className="sb-head__meta">{progress.champion ? "👑 KING OF THE STREET" : "CAREER RECORD"}</span>
      </header>
      <div className="sb-board">
        <div className="sb-board__big">
          {big.map(([k, v]) => (
            <div key={k} className="sb-board__cell">
              <span className="sb-board__digits">{String(v).padStart(2, "0")}</span>
              <small>{k}</small>
            </div>
          ))}
        </div>
        <div className="sb-board__rows">
          {rows.map(([k, v]) => (
            <div key={k} className="sb-board__row"><span>{k}</span><b>{v}</b></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ settings */
export function Settings({ settings, muted, onChange, onBack }) {
  const Toggle = ({ k, label, hint }) => (
    <div className="sb-set">
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <button type="button" className={`sb-switch${settings[k] ? " is-on" : ""}`} aria-pressed={settings[k]} onClick={() => onChange({ [k]: !settings[k] })}>
        <i />
      </button>
    </div>
  );
  return (
    <div className="sb-screen sb-settings">
      <header className="sb-head">
        <button type="button" className="sb-back" onClick={onBack}>‹ MENU</button>
        <h1>SETTINGS</h1>
        <span className="sb-head__meta">{muted ? "MUTED (GAME CENTER)" : ""}</span>
      </header>
      <div className="sb-settings__grid">
        <Toggle k="sound" label="SOUND" hint="Ball, rim, crowd, shoes" />
        <Toggle k="music" label="MUSIC" />
        <div className="sb-set">
          <span><b>GRAPHICS</b><small>Physics never changes</small></span>
          <div className="sb-seg">
            {["low", "medium", "high"].map((q) => (
              <button type="button" key={q} className={settings.graphics === q ? "is-on" : ""} onClick={() => onChange({ graphics: q })}>{q.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <Toggle k="particles" label="PARTICLES" />
        <Toggle k="cameraShake" label="CAMERA SHAKE" hint="Dunks, blocks, game winners" />
        <Toggle k="shotMeter" label="SHOT METER" hint="Off = timing still counts, meter hidden" />
        <Toggle k="controlHelp" label="CONTROL HELP" />
        <Toggle k="reducedMotion" label="REDUCED MOTION" />
      </div>
    </div>
  );
}

export { courtById };
