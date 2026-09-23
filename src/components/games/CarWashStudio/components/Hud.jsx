/**
 * Car Wash Studio — compact gameplay HUD. Deliberately small: the car is the
 * screen. Updated a few times per second from engine measurements, never per
 * pointer move.
 */
import { Icon, ToolIcon } from "./icons.jsx";
import { STAGES, OPTIONAL, EXTERIOR_ORDER, INTERIOR_ORDER } from "../engine/stages.js";
import { TOOLS } from "../engine/tools.js";

export function TopBar({ job, hud, onHint, onMenu, hintBusy }) {
  const ext = EXTERIOR_ORDER.filter((id) => job.stages.includes(id));
  const int = INTERIOR_ORDER.filter((id) => job.stages.includes(id));
  const intDone = int.filter((id) => hud.done[id]).length;
  const intCurrent = int.includes(hud.current);
  const pct = Math.round(Math.max(0, Math.min(1, hud.overall)) * 100);
  const opt = job.optional || [];
  const optDone = opt.filter((id) => hud.optDone[id]).length;
  return (
    <div className="cws-top">
      <div className="cws-top__job">
        <span className="cws-top__num">JOB {String(job.id).padStart(2, "0")}</span>
        <span className="cws-top__name">{job.name}</span>
      </div>
      <ol className="cws-steps" aria-label="Cleaning steps">
        {ext.map((id) => {
          const done = hud.done[id];
          const cur = hud.current === id;
          const f = Math.min(1, (hud.fracs[id] || 0) / STAGES[id].th);
          return (
            <li key={id} className={`cws-step${done ? " is-done" : ""}${cur ? " is-current" : ""}`}>
              {done ? <Icon.check /> : null}
              <span>{STAGES[id].label}</span>
              {cur && <i className="cws-step__bar" style={{ transform: `scaleX(${f})` }} />}
            </li>
          );
        })}
        {int.length > 0 && (
          <li className={`cws-step${intDone === int.length ? " is-done" : ""}${intCurrent ? " is-current" : ""}`}>
            {intDone === int.length ? <Icon.check /> : null}
            <span>INTERIOR {intDone}/{int.length}</span>
          </li>
        )}
      </ol>
      <div className="cws-top__right">
        {opt.length > 0 && (
          <div className="cws-chip cws-chip--opt" title={opt.map((id) => `${hud.optDone[id] ? "✓ " : "• "}${OPTIONAL[id].label}`).join("\n")}>
            <Icon.sparkle /> {optDone}/{opt.length}
          </div>
        )}
        <div className="cws-chip cws-chip--clean" aria-label={`Cleanliness ${pct}%`}>
          <b>{pct}%</b>
          <span>CLEAN</span>
        </div>
        <button type="button" className="cws-iconbtn" onClick={onHint} disabled={hintBusy} aria-label="Hint">
          <Icon.hint />
        </button>
        <button type="button" className="cws-iconbtn" onClick={onMenu} aria-label="Pause menu">
          <Icon.menu />
        </button>
      </div>
    </div>
  );
}

const VIEW_LABELS = { front: "FRONT", left: "LEFT", right: "RIGHT", rear: "REAR", cabin: "CABIN", rearCabin: "REAR SEATS", trunk: "TRUNK" };
const VIEW_SHORT = { front: "F", left: "L", right: "R", rear: "B", cabin: "CAB", rearCabin: "RS", trunk: "TR" };
const Label = ({ v }) => (
  <>
    <span className="cws-long">{VIEW_LABELS[v]}</span>
    <span className="cws-short">{VIEW_SHORT[v]}</span>
  </>
);

export function ViewBar({ views, view, onView, wheels, wheelState, pulse, interiorViews }) {
  const inWheel = view.startsWith("wheel:");
  return (
    <div className="cws-views">
      {inWheel && (
        <div className="cws-wheels" role="group" aria-label="Choose wheel">
          {wheels.map((w) => (
            <button key={w.id} type="button" className={`cws-wbtn${view === `wheel:${w.id}` ? " is-on" : ""}${wheelState[w.id] ? " is-done" : ""}`}
              onClick={() => onView(`wheel:${w.id}`)} aria-label={w.label}>
              {w.short}
              {wheelState[w.id] ? <Icon.check /> : null}
            </button>
          ))}
        </div>
      )}
      <div className="cws-views__row" role="group" aria-label="Camera view">
        {views.map((v) => (
          <button key={v} type="button" className={`cws-vbtn${view === v ? " is-on" : ""}${pulse === v ? " is-pulse" : ""}`} onClick={() => onView(v)}>
            <Label v={v} />
          </button>
        ))}
        {wheels.length > 0 && (
          <button type="button" className={`cws-vbtn${inWheel ? " is-on" : ""}${pulse === "wheel" ? " is-pulse" : ""}`}
            onClick={() => onView(inWheel ? view : `wheel:${(wheels.find((w) => !wheelState[w.id]) || wheels[0]).id}`)}>
            <Icon.wheel /> <span className="cws-long">WHEELS</span>
          </button>
        )}
        {interiorViews.map((v) => (
          <button key={v} type="button" className={`cws-vbtn cws-vbtn--int${view === v ? " is-on" : ""}${pulse === v ? " is-pulse" : ""}`} onClick={() => onView(v)}>
            <Icon.seat /> <Label v={v} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ToolTray({ tools, tool, onTool, tint, message, onMessage }) {
  if (!tools.length) {
    return (
      <div className="cws-tray cws-tray--msg">
        {message ? (
          <button type="button" className="cws-tray__go" onClick={onMessage}>{message}</button>
        ) : (
          <span>Nothing to do here right now.</span>
        )}
      </div>
    );
  }
  return (
    <div className="cws-tray" role="toolbar" aria-label="Tools">
      {tools.map((t, i) => (
        <button key={t} type="button" className={`cws-tool${tool === t ? " is-on" : ""}`} onClick={() => onTool(t)}
          aria-pressed={tool === t} title={`${TOOLS[t].name} (${i + 1})`}>
          <ToolIcon tool={t} tint={tint} size={34} />
          <span>{TOOLS[t].name}</span>
        </button>
      ))}
    </div>
  );
}
