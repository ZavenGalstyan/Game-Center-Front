/**
 * Lost Toy — the menu flow over the 3D bedroom backdrop:
 *   MainMenu       title, tagline, compact stitched-felt buttons
 *   LevelSelect    a dollhouse journey map (rooms of the house = worlds) and
 *                  a thread-stitched path of 10 button nodes per world
 *   ToyScreen      looks for Pip (live 3D close-up behind the panel)
 *   MemoriesScreen polaroid snapshots unlocked by Memory Buttons
 *   StatsScreen    real statistics only
 */
import { useEffect, useMemo, useState } from "react";
import { Btn, ButtonPips } from "./ui.jsx";
import { Icon } from "./icons.jsx";
import MemoryArt from "./MemoryArt.jsx";
import { WORLDS, worldById } from "../data/worlds.js";
import { LEVEL_NAMES, levelName, worldOf } from "../data/levelInfo.js";
import { MEMORIES } from "../data/memories.js";
import { COSMETICS } from "../data/cosmetics.js";
import { isUnlocked, buttonsIn, completedCount, worldDone, worldsCompleted, LEVEL_COUNT } from "../utils/storage.js";
import { levelById, LEVEL_COUNT as BUILT } from "../data/levels/index.js";
import { formatTime } from "../three/gameRenderer.js";

/* ================================================================== main menu */
export function MainMenu({ progress, onPlay, onNav }) {
  const done = completedCount(progress);
  const fresh = done === 0;
  const next = Math.min(LEVEL_COUNT, progress.lastLevel || 1);
  const newMem = (progress.newMemories || []).length;
  return (
    <div className="lt-menu">
      <div className="lt-logo" aria-label="Lost Toy">
        <span className="lt-logo__word">
          {"LOST".split("").map((c, i) => (
            <b key={i} style={{ "--i": i }}>
              {c}
            </b>
          ))}
        </span>
        <span className="lt-logo__word lt-logo__word--2">
          {"TOY".split("").map((c, i) => (
            <b key={i} style={{ "--i": i + 4 }}>
              {c}
            </b>
          ))}
        </span>
        <span className="lt-logo__tag">JUMP • EXPLORE • FIND YOUR WAY HOME</span>
      </div>
      <nav className="lt-menu__nav">
        <Btn kind="primary xl" onClick={onPlay}>
          <Icon name="play" /> {fresh ? "Play" : "Continue"}
          {!fresh && <span className="lt-btn__sub">Level {next} · {levelName(next)}</span>}
        </Btn>
        <div className="lt-menu__grid">
          <Btn onClick={() => onNav("levels")}>
            <Icon name="map" /> Levels
          </Btn>
          <Btn onClick={() => onNav("toy")}>
            <Icon name="toy" /> Toy
          </Btn>
          <Btn onClick={() => onNav("memories")}>
            <Icon name="heart" /> Memories
            {newMem > 0 && <span className="lt-badge">{newMem}</span>}
          </Btn>
          <Btn onClick={() => onNav("stats")}>
            <Icon name="stats" /> Statistics
          </Btn>
          <Btn onClick={() => onNav("settings")}>
            <Icon name="gear" /> Settings
          </Btn>
          <Btn onClick={() => onNav("controls")}>
            <Icon name="keys" /> Controls
          </Btn>
        </div>
      </nav>
      <div className="lt-menu__foot">
        <span className="lt-chip">
          <Icon name="button" /> <b>{progress.totalMemoryButtons}</b>
          <span>/ 150 Memory Buttons</span>
        </span>
        <span className="lt-chip">
          <Icon name="check" /> <b>{done}</b>
          <span>/ 50 levels</span>
        </span>
      </div>
    </div>
  );
}

/* ================================================================== level select */
const ROOMS = {
  1: { x: 34, y: 58, w: 86, h: 62, label: "Bedroom" },
  2: { x: 34, y: 124, w: 86, h: 62, label: "Kitchen" },
  3: { x: 196, y: 124, w: 76, h: 62, label: "Garage" },
  4: { x: 4, y: 194, w: 292, h: 42, label: "Backyard" },
  5: { x: 124, y: 58, w: 68, h: 128, label: "Night Journey" },
};

function RoomArt({ id }) {
  const r = ROOMS[id];
  const { x, y, w, h } = r;
  switch (id) {
    case 1:
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#f6dcb6" />
          <rect x={x + 30} y={y + 8} width="24" height="18" fill="#bcd8f0" stroke="#fff8ee" strokeWidth="3" />
          <rect x={x + 4} y={y + h - 20} width="30" height="12" rx="3" fill="#6f9bd1" />
          <rect x={x + 4} y={y + h - 26} width="6" height="18" fill="#e7cfa8" />
          <rect x={x + 54} y={y + h - 24} width="26" height="4" fill="#d2a679" />
          <rect x={x + 56} y={y + h - 20} width="3" height="20" fill="#d2a679" />
          <rect x={x + 75} y={y + h - 20} width="3" height="20" fill="#d2a679" />
          <rect x={x} y={y + h - 3} width={w} height="3" fill="#d9a873" />
        </g>
      );
    case 2:
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#e4efe9" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={x + i * 15} y={y + 6} width="13" height="13" fill="#f7fbff" opacity="0.8" />
          ))}
          <rect x={x + 4} y={y + h - 26} width="40" height="26" fill="#4fb3a8" />
          <rect x={x + 2} y={y + h - 29} width="44" height="4" fill="#f4f4f4" />
          <rect x={x + 58} y={y + 14} width="22" height={h - 14} rx="3" fill="#f4f4f4" stroke="#c9ccd2" />
          <rect x={x + 76} y={y + 30} width="2" height="10" fill="#c9ccd2" />
        </g>
      );
    case 3:
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#c4c8cf" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={x + 6} y={y + 8 + i * 10} width={w - 12} height="1.5" fill="#a9aeb6" />
          ))}
          <rect x={x + 6} y={y + h - 22} width="30" height="4" fill="#b8875a" />
          <rect x={x + 8} y={y + h - 18} width="3" height="18" fill="#b8875a" />
          <rect x={x + 31} y={y + h - 18} width="3" height="18" fill="#b8875a" />
          <circle cx={x + 56} cy={y + h - 9} r="9" fill="#2a2a2e" />
          <circle cx={x + 56} cy={y + h - 9} r="4" fill="#8a8f98" />
          <rect x={x + 44} y={y + 10} width="12" height="14" rx="2" fill="#e8a33a" />
        </g>
      );
    case 4:
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx="6" fill="#8cbc5a" />
          {Array.from({ length: 26 }).map((_, i) => (
            <path key={i} d={`M${x + 6 + i * 11} ${y + h} q2 -12 4 -16 q0 8 2 16z`} fill="#5f9b52" />
          ))}
          <circle cx={x + 250} cy={y + 12} r="6" fill="#f28da0" />
          <circle cx={x + 250} cy={y + 12} r="2.4" fill="#ffd23a" />
          <ellipse cx={x + 160} cy={y + h - 8} rx="18" ry="5" fill="#9fd0ff" />
          <rect x={x + 60} y={y + 8} width="4" height="22" fill="#e9d8bd" />
          <rect x={x + 70} y={y + 8} width="4" height="22" fill="#e9d8bd" />
          <rect x={x + 56} y={y + 14} width="22" height="3" fill="#e9d8bd" />
        </g>
      );
    case 5:
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#2a3160" />
          <circle cx={x + 50} cy={y + 18} r="9" fill="#bcd0f5" opacity="0.4" />
          <circle cx={x + 50} cy={y + 18} r="5" fill="#fff3c4" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect key={i} x={x + 6 + i * 8} y={y + h - 8 - i * 9} width="14" height="4" fill="#8a7a9a" />
          ))}
          <circle cx={x + 12} cy={y + 52} r="3.5" fill="#ffd27a" />
          <circle cx={x + 12} cy={y + 52} r="8" fill="#ffd27a" opacity="0.25" />
        </g>
      );
    default:
      return null;
  }
}

function Dollhouse({ progress, world, onWorld }) {
  const unlockedWorld = (w) => isUnlocked(progress, (w - 1) * 10 + 1);
  const cur = worldOf(Math.min(LEVEL_COUNT, progress.lastLevel || 1));
  // the journey thread through the rooms (bedroom → kitchen → garage → backyard → night)
  const centers = [1, 2, 3, 4, 5].map((w) => {
    const r = ROOMS[w];
    return w === 4 ? [r.x + 230, r.y + 20] : [r.x + r.w / 2, r.y + r.h / 2];
  });
  const thread = `M${centers[0][0]} ${centers[0][1]} C ${centers[0][0] - 20} ${centers[1][1] - 30}, ${centers[1][0] - 20} ${centers[1][1] - 10}, ${centers[1][0]} ${centers[1][1]} S ${centers[2][0] - 40} ${centers[2][1] + 20}, ${centers[2][0]} ${centers[2][1]} S ${centers[3][0] - 10} ${centers[3][1] - 30}, ${centers[3][0]} ${centers[3][1]} S ${centers[4][0] + 20} ${centers[4][1] + 60}, ${centers[4][0]} ${centers[4][1]}`;
  return (
    <svg className="lt-house" viewBox="0 0 300 240" role="group" aria-label="The house">
      <defs>
        <linearGradient id="lt-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#bfe0f5" />
          <stop offset="1" stopColor="#fde9cc" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="300" height="240" rx="14" fill="url(#lt-sky)" />
      {/* roof + house body */}
      <path d="M22 58 L113 8 L204 58z" fill="#c0504d" />
      <path d="M22 58 L113 8 L204 58" fill="none" stroke="#8a3330" strokeWidth="3" strokeLinejoin="round" />
      <rect x="28" y="52" width="170" height="140" fill="#f4e7cf" />
      <path d="M190 118 L234 96 L278 118z" fill="#7a8a9a" />
      <rect x="190" y="116" width="88" height="76" fill="#e1e4e8" />
      {/* the tree in the yard */}
      <rect x="280" y="150" width="8" height="46" fill="#8a5a3a" />
      <circle cx="284" cy="140" r="18" fill="#5f9b52" />
      {[1, 2, 3, 5, 4].map((w) => {
        const r = ROOMS[w];
        const open = unlockedWorld(w);
        const sel = world === w;
        const done = worldDone(progress, w);
        return (
          <g
            key={w}
            className={`lt-room${sel ? " is-sel" : ""}${open ? "" : " is-locked"}`}
            onClick={() => open && onWorld(w)}
            role="button"
            tabIndex={open ? 0 : -1}
            aria-label={`${worldById(w).name}${open ? "" : " (locked)"}`}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open && onWorld(w)}
          >
            <clipPath id={`lt-room-${w}`}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="3" />
            </clipPath>
            <g clipPath={`url(#lt-room-${w})`}>
              <RoomArt id={w} />
            </g>
            <rect className="lt-room__frame" x={r.x} y={r.y} width={r.w} height={r.h} rx="3" />
            {!open && (
              <g className="lt-room__lock">
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="3" fill="rgba(40,30,30,0.5)" />
                <circle cx={r.x + r.w / 2} cy={r.y + r.h / 2} r="9" fill="#fff6e8" />
                <path d={`M${r.x + r.w / 2 - 4} ${r.y + r.h / 2 - 1} h8 v6 h-8z M${r.x + r.w / 2 - 2.5} ${r.y + r.h / 2 - 1} v-2.5 a2.5 2.5 0 0 1 5 0 v2.5`} fill="none" stroke="#5b3a2a" strokeWidth="1.3" />
              </g>
            )}
            <text className="lt-room__label" x={r.x + 5} y={r.y + 11}>
              {w}. {r.label}
              {done ? " ✓" : ""}
            </text>
          </g>
        );
      })}
      <path className="lt-house__thread" d={thread} />
      <g transform={`translate(${centers[cur - 1][0]} ${centers[cur - 1][1]})`} className="lt-house__pip">
        <circle r="7" fill="#f1dfc3" stroke="#5b3a2a" strokeWidth="1" />
        <circle cx="-2.2" cy="-0.6" r="1.1" fill="#1d2230" />
        <circle cx="2.2" cy="-0.6" r="1.1" fill="#1d2230" />
        <rect x="-5" y="5" width="10" height="2.4" rx="1.2" fill="#d9473b" />
      </g>
    </svg>
  );
}

/** 10 nodes on a gentle S-curve thread (2 rows) */
const NODE_POS = [
  [8, 30],
  [24, 18],
  [40, 26],
  [56, 16],
  [72, 26],
  [88, 40],
  [72, 56],
  [56, 66],
  [40, 58],
  [24, 70],
].map(([x, y]) => [x * 1.0, y * 1.0]);

export function LevelSelect({ progress, onPlay, onBack, initialLevel }) {
  const startWorld = worldOf(Math.min(LEVEL_COUNT, initialLevel || progress.lastLevel || 1));
  const [world, setWorld] = useState(startWorld);
  const first = (world - 1) * 10 + 1;
  const defaultSel = useMemo(() => {
    for (let i = first; i < first + 10; i++) if (isUnlocked(progress, i) && !progress.completedLevels[i]) return i;
    return first;
  }, [first, progress]);
  const [sel, setSel] = useState(initialLevel && worldOf(initialLevel) === world ? initialLevel : defaultSel);
  useEffect(() => {
    if (worldOf(sel) !== world) setSel(defaultSel);
  }, [world, sel, defaultSel]);
  const W = worldById(world);
  const selOpen = isUnlocked(progress, sel);
  const selBuilt = sel <= BUILT && !!levelById(sel);
  const best = progress.bestTimes[sel];
  const pathD = NODE_POS.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <div className="lt-screen lt-screen--levels">
      <div className="lt-panel__head lt-panel__head--float">
        <Btn kind="ghost icon" onClick={onBack} title="Back">
          <Icon name="back" />
        </Btn>
        <h2>The way home</h2>
        <span className="lt-chip">
          <Icon name="button" /> <b>{progress.totalMemoryButtons}</b>
          <span>/ 150</span>
        </span>
      </div>
      <div className="lt-levels">
        <div className="lt-levels__house">
          <Dollhouse progress={progress} world={world} onWorld={setWorld} />
        </div>
        <div className="lt-levels__path" style={{ "--wc": W.accent, "--wc2": W.accent2 }}>
          <div className="lt-levels__world">
            <b>{W.name}</b>
            <span>{W.blurb}</span>
          </div>
          <div className="lt-levels__nodes">
            <svg viewBox="0 0 96 80" preserveAspectRatio="none" className="lt-levels__thread" aria-hidden="true">
              <path d={pathD} />
            </svg>
            {NODE_POS.map(([x, y], i) => {
              const id = first + i;
              const open = isUnlocked(progress, id);
              const done = !!progress.completedLevels[id];
              const got = progress.memoryButtonsByLevel[id] || [];
              return (
                <button
                  key={id}
                  type="button"
                  className={`lt-node${open ? "" : " is-locked"}${done ? " is-done" : ""}${sel === id ? " is-sel" : ""}`}
                  style={{ left: `${(x / 96) * 100}%`, top: `${(y / 80) * 100}%` }}
                  onClick={() => setSel(id)}
                  aria-label={`Level ${id}: ${levelName(id)}${open ? "" : " (locked)"}`}
                >
                  <span className="lt-node__disc">
                    <i />
                    <i />
                    <i />
                    <i />
                    <em>{open ? id : <Icon name="lock" />}</em>
                  </span>
                  {open && <ButtonPips got={got} size="xs" />}
                </button>
              );
            })}
          </div>
          <div className="lt-levels__detail">
            <div className="lt-levels__detail-head">
              <span className="lt-levels__num" style={{ background: W.accent }}>
                {sel}
              </span>
              <div>
                <b>{levelName(sel)}</b>
                <span>
                  {W.name} · Level {sel - first + 1} of 10
                </span>
              </div>
            </div>
            <div className="lt-levels__meta">
              <span>
                <ButtonPips got={progress.memoryButtonsByLevel[sel] || []} size="sm" /> {buttonsIn(progress, sel)}/3 buttons
              </span>
              {best > 0 && (
                <span>
                  <Icon name="clock" /> Best {formatTime(best)}
                </span>
              )}
              {progress.completedLevels[sel] && (
                <span className="lt-ok">
                  <Icon name="check" /> Completed
                </span>
              )}
            </div>
            <Btn kind="primary" onClick={() => onPlay(sel)} disabled={!selOpen || !selBuilt}>
              <Icon name="play" /> {!selOpen ? "Locked" : selBuilt ? "Play" : "Coming soon"}
            </Btn>
            {!selOpen && <small className="lt-levels__why">Finish level {sel - 1} to open this one.</small>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== toy */
export function ToyScreen({ progress, onSelect, onBack }) {
  return (
    <div className="lt-screen lt-screen--toy">
      <div className="lt-panel lt-panel--side">
        <div className="lt-panel__head">
          <Btn kind="ghost icon" onClick={onBack} title="Back">
            <Icon name="back" />
          </Btn>
          <h2>Pip's looks</h2>
        </div>
        <p className="lt-panel__intro">Same little explorer — a new scarf, patch or outfit. Unlocked by finding Memory Buttons and finishing worlds.</p>
        <div className="lt-panel__body lt-looks">
          {COSMETICS.map((c) => {
            const open = progress.unlockedCosmetics.includes(c.id);
            const on = progress.selectedCosmetic === c.id;
            const need = c.need && c.need.buttons ? `Find ${c.need.buttons} Memory Buttons` : c.need && c.need.world ? `Finish ${worldById(c.need.world).name}` : "";
            return (
              <button key={c.id} type="button" className={`lt-look${on ? " is-on" : ""}${open ? "" : " is-locked"}`} onClick={() => open && onSelect(c.id)} disabled={!open}>
                <span className="lt-look__sw">
                  <i style={{ background: c.scarf }} />
                  <i style={{ background: c.overalls }} />
                  <i style={{ background: c.patch }} />
                </span>
                <span className="lt-look__txt">
                  <b>{c.name}</b>
                  <small>{on ? "Wearing" : open ? "Tap to wear" : need}</small>
                </span>
                {!open && <Icon name="lock" />}
                {on && <Icon name="check" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== memories */
export function MemoriesScreen({ progress, onSeen, onBack }) {
  const fresh = progress.newMemories || [];
  useEffect(() => {
    const id = setTimeout(() => onSeen && onSeen(), 1200);
    return () => clearTimeout(id);
  }, [onSeen]);
  const [open, setOpen] = useState(null);
  const total = progress.totalMemoryButtons;
  const m = open ? MEMORIES.find((q) => q.id === open) : null;
  return (
    <div className="lt-screen lt-screen--memories">
      <div className="lt-panel lt-panel--wide">
        <div className="lt-panel__head">
          <Btn kind="ghost icon" onClick={onBack} title="Back">
            <Icon name="back" />
          </Btn>
          <h2>Memories</h2>
          <span className="lt-chip">
            <Icon name="heart" /> <b>{progress.unlockedMemories.length}</b>
            <span>/ {MEMORIES.length}</span>
          </span>
          <span className="lt-chip">
            <Icon name="button" /> <b>{total}</b>
            <span>/ 150 buttons</span>
          </span>
        </div>
        <div className="lt-panel__body lt-memories">
          {MEMORIES.map((q) => {
            const got = progress.unlockedMemories.includes(q.id);
            return (
              <button key={q.id} type="button" className={`lt-polaroid${got ? "" : " is-locked"}${fresh.includes(q.id) ? " is-new" : ""}`} onClick={() => got && setOpen(q.id)} disabled={!got}>
                <MemoryArt scene={q.scene} locked={!got} />
                <b>{got ? q.title : "? ? ?"}</b>
                <small>{got ? "Open" : `${q.need} buttons`}</small>
              </button>
            );
          })}
        </div>
      </div>
      {m && (
        <div className="lt-overlay" onClick={() => setOpen(null)}>
          <div className="lt-card lt-card--memory" onClick={(e) => e.stopPropagation()}>
            <MemoryArt scene={m.scene} />
            <div className="lt-card__title">{m.title}</div>
            {m.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <Btn onClick={() => setOpen(null)}>
              <Icon name="close" /> Close
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== stats */
const fmtDist = (u) => {
  const m = u / 10; // 1 unit = 10 cm of the real house
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(m < 100 ? 1 : 0)} m`;
};
const fmtTime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`;
};

export function StatsScreen({ progress, onBack }) {
  const st = progress.statistics;
  const rows = [
    ["Levels completed", `${completedCount(progress)} / 50`],
    ["Memory Buttons found", `${progress.totalMemoryButtons} / 150`],
    ["Worlds completed", `${worldsCompleted(progress)} / 5`],
    ["Memories unlocked", `${progress.unlockedMemories.length} / ${MEMORIES.length}`],
    ["Total jumps", st.jumps.toLocaleString()],
    ["Total falls", st.falls.toLocaleString()],
    ["Ledge saves", st.ledgeSaves.toLocaleString()],
    ["Objects pushed", st.pushes.toLocaleString()],
    ["Bounce jumps", st.bounces.toLocaleString()],
    ["Moving objects ridden", st.rides.toLocaleString()],
    ["Pet encounters", st.petEncounters.toLocaleString()],
    ["Checkpoints reached", st.checkpoints.toLocaleString()],
    ["Things used (E)", st.interacts.toLocaleString()],
    ["Distance travelled", fmtDist(st.distance)],
    ["Play time", fmtTime(st.playTime)],
    ["Levels started", st.levelRuns.toLocaleString()],
  ];
  return (
    <div className="lt-screen lt-screen--stats">
      <div className="lt-panel lt-panel--wide">
        <div className="lt-panel__head">
          <Btn kind="ghost icon" onClick={onBack} title="Back">
            <Icon name="back" />
          </Btn>
          <h2>Statistics</h2>
        </div>
        <div className="lt-panel__body lt-stats">
          {rows.map(([k, v]) => (
            <div key={k} className="lt-stat">
              <small>{k}</small>
              <b>{v}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const _names = LEVEL_NAMES;
export const _worlds = WORLDS;
