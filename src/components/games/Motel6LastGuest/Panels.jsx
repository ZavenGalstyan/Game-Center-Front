/**
 * Motel 6: Last Guest — desk panels: ID card (+UV), reservation terminal,
 * room board, questioning, rulebook, evidence log, document viewer, lockbox
 * keypad and the CCTV overlay. Pure presentational components; all game
 * decisions go through engine.js in the parent.
 */
import { useEffect, useMemo, useState } from "react";
import { STATES, EVIDENCE, EVIDENCE_BY_ID, CRITICAL, rulesForNight, questionsForNight, RULES } from "./data.js";
import { fmtDate, answerFor, ROOM_COUNT } from "./engine.js";
import { portraitURL } from "./portrait.js";
import { CCTV_NAMES } from "./scene.js";

export function Icon({ id, size = 18 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  switch (id) {
    case "id": return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.4" /><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14 10h4M14 13h3" /></svg>;
    case "terminal": return <svg {...p}><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M7 9l2.5 2L7 13M12 13h4M8 20h8" /></svg>;
    case "board": return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="1.5" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>;
    case "questions": return <svg {...p}><path d="M4 5h16v11H9l-5 4z" /><path d="M10 9a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6 1v.3M12 14.2v.1" /></svg>;
    case "cctv": return <svg {...p}><path d="M3 8l12-3 2 6-12 3z" /><path d="M17 9l3-1v5l-3 1M7 14l1 4H4" /></svg>;
    case "rules": return <svg {...p}><path d="M5 4h11l3 3v13H5z" /><path d="M9 9h6M9 13h6M9 17h4" /></svg>;
    case "evidence": return <svg {...p}><path d="M4 7h6l2 2h8v10H4z" /><path d="M9 14h6" /></svg>;
    case "walk": return <svg {...p}><circle cx="13" cy="4" r="2" /><path d="M10 21l2-6-3-3 1-4 4 3 3 1M9 12l-3 3" /></svg>;
    case "desk": return <svg {...p}><path d="M3 10h18M5 10v9M19 10v9M8 14h8" /><path d="M9 10V6h6v4" /></svg>;
    case "pause": return <svg {...p}><path d="M9 5v14M15 5v14" /></svg>;
    case "phone": return <svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" /></svg>;
    case "uv": return <svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></svg>;
    case "camera": return <svg {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
    case "key": return <svg {...p}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></svg>;
    case "x": return <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "bell": return <svg {...p}><path d="M5 17h14M7 17a5 5 0 0 1 10 0M12 9v3M12 7v.01" /></svg>;
    case "note": case "brochure": case "diary": case "register": case "ids":
      return <svg {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h7" /></svg>;
    case "tape": return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="8.5" cy="12" r="2" /><circle cx="15.5" cy="12" r="2" /></svg>;
    case "photo": return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="1" /><circle cx="9" cy="11" r="2" /><path d="M3 17l5-4 4 3 3-2 6 4" /></svg>;
    default: return null;
  }
}

/* ------------------------------------------------------------------ ID card */
export function IdCard({ g, night, uvAvailable, uv, onUV }) {
  const d = g.doc;
  const photo = useMemo(() => portraitURL(d.photo, { bg: "id", id: "idp" }), [d.photo]);
  const expired = false; // never hint — the player compares
  void expired;
  return (
    <div className={`m6-id${uv ? " is-uv" : ""}`}>
      <div className="m6-id__top">
        <span className="m6-id__state">{(STATES[d.state] || "UNKNOWN").toUpperCase()}</span>
        <span className="m6-id__kind">DRIVER LICENSE</span>
      </div>
      <div className="m6-id__body">
        <img className="m6-id__photo" src={photo} alt={`ID photo of ${d.name}`} draggable={false} />
        <dl className="m6-id__fields">
          <dt>NAME</dt><dd className="m6-id__name">{d.name}</dd>
          <dt>ID NO.</dt><dd className="m6-mono">{d.number}</dd>
          <dt>DOB</dt><dd className="m6-mono">{fmtDate(d.dob)}</dd>
          <dt>EXPIRES</dt><dd className="m6-mono">{fmtDate(d.expires)}</dd>
          <dt>ADDRESS</dt><dd>{d.address}, {d.state}</dd>
        </dl>
      </div>
      <div className="m6-id__sig">{d.name}</div>
      {uv && (
        <div className={`m6-id__seal${d.seal ? "" : " is-missing"}`}>
          {d.seal ? <><span>★</span><b>{d.state}</b><small>STATE SEAL</small></> : <small>NO SEAL</small>}
        </div>
      )}
      {uvAvailable && (
        <button type="button" className={`m6-btn m6-btn--uv${uv ? " is-on" : ""}`} onClick={onUV}>
          <Icon id="uv" size={15} /> UV lamp {uv ? "on" : "off"}
        </button>
      )}
      {night < 5 && <div className="m6-id__hint">Compare the photo with the guest's face.</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ terminal */
export function Terminal({ g, night, date, power }) {
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    setTyped(0);
    const t = setTimeout(() => setTyped(1), 380);
    return () => clearTimeout(t);
  }, [g?.id]);
  if (!power) return <div className="m6-term"><div className="m6-term__screen is-off">NO POWER</div></div>;
  const r = g?.res;
  const partial = r && r.name !== g.doc.name;
  return (
    <div className="m6-term">
      <div className="m6-term__screen">
        <div className="m6-term__head">ROUTE 6 MOTOR LODGE · RESERVATIONS · {fmtDate(date)}</div>
        {!g ? <p>&gt; NO GUEST AT DESK_</p> : (
          <>
            <p>&gt; SEARCH "{g.doc.name.toUpperCase()}"</p>
            {!typed ? <p className="m6-blink">SEARCHING…</p> : !r ? (
              <p className="m6-term__bad">NO RECORD FOUND.</p>
            ) : (
              <>
                <p>{partial ? "1 PARTIAL MATCH:" : "1 RECORD FOUND:"}</p>
                <table className="m6-term__rec"><tbody>
                  <tr><th>GUEST</th><td>{r.name.toUpperCase()}</td></tr>
                  <tr><th>CHECK-IN</th><td>{fmtDate(r.checkIn)}</td></tr>
                  <tr><th>NIGHTS</th><td>{r.nights}</td></tr>
                  <tr><th>ROOM</th><td>{r.room}</td></tr>
                  <tr><th>ID DIGITS</th><td>•••• {r.idLast4}</td></tr>
                  <tr><th>CONF. CODE</th><td>{r.code}</td></tr>
                  {night >= 3 && <tr><th>VEHICLE</th><td>{r.plate || "NONE"}</td></tr>}
                  {r.word && <tr><th>SEC. WORD</th><td>{r.word.toUpperCase()}</td></tr>}
                  <tr><th>BOOKED</th><td>{fmtDate(r.booked)} · {r.via.toUpperCase()}</td></tr>
                </tbody></table>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ room board */
export function RoomBoard({ board, night }) {
  return (
    <div className="m6-board">
      <div className="m6-board__grid">
        {Array.from({ length: ROOM_COUNT }, (_, i) => i + 1).map((r) => {
          const b = board[r];
          return (
            <div key={r} className={`m6-room is-${b.status}${b.alert ? " is-alert" : ""}${b.tonight ? " is-tonight" : ""}`}>
              <span className="m6-room__n">{r}</span>
              <span className="m6-room__s">{b.status === "vacant" ? "VACANT" : b.status === "ooo" ? "OUT OF ORDER" : b.name}</span>
              {b.alert && <span className="m6-room__a">{b.alert}</span>}
            </div>
          );
        })}
        {night >= 3 && <div className="m6-room is-ghost"><span className="m6-room__n">13</span><span className="m6-room__s">THERE IS NO ROOM 13</span></div>}
      </div>
      <p className="m6-panel__foot">Occupied rooms belong to their guest. Returning guests may only reclaim their own room.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ questioning */
export function Questions({ g, night, asked, onAsk }) {
  const qs = questionsForNight(night);
  return (
    <div className="m6-qs">
      <div className="m6-qs__list">
        {qs.map((q) => (
          <button key={q.id} type="button" className={`m6-q${asked[q.id] ? " is-asked" : ""}`} onClick={() => onAsk(q.id)} disabled={!g}>
            {q.text}
          </button>
        ))}
      </div>
      <div className="m6-qs__log">
        {qs.filter((q) => asked[q.id]).map((q) => (
          <div key={q.id} className="m6-qs__row">
            <span>{q.text}</span>
            <b>“{answerFor(g, q.id)}”</b>
          </div>
        ))}
        {!Object.keys(asked).length && <p className="m6-dim">Answers you get are written down here so you can compare them with the documents.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ rulebook */
export function Rulebook({ night }) {
  const rules = rulesForNight(night);
  return (
    <ol className="m6-rules">
      {rules.map((r) => (
        <li key={r.id} className={r.night === night && night > 1 ? "is-new" : ""}>
          <b>{r.title}</b>{r.night === night && night > 1 && <em>NEW</em>}
          <span>{r.text}</span>
        </li>
      ))}
      <li className="m6-rules__foot">When you reject a guest, cite the rule they broke. A correct citation on forged papers lets you keep the ID as evidence.</li>
    </ol>
  );
}

/* ------------------------------------------------------------------ evidence */
export function EvidenceLog({ evidence, onOpen, confiscated }) {
  const crit = CRITICAL.filter((id) => evidence.includes(id)).length;
  return (
    <div className="m6-ev">
      <div className="m6-ev__count">Critical evidence <b>{crit}/{CRITICAL.length}</b></div>
      <div className="m6-ev__grid">
        {EVIDENCE.map((e) => {
          const have = evidence.includes(e.id);
          return (
            <button key={e.id} type="button" className={`m6-evc${have ? " is-have" : ""}${e.critical ? " is-crit" : ""}`} disabled={!have} onClick={() => onOpen(e.id)}>
              <Icon id={e.icon} size={20} />
              <span>{have ? e.title : "? ? ?"}</span>
              {e.id === "x_ids" && have && <small>{confiscated.length} kept</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function DocViewer({ id, confiscated, onClose, still }) {
  const e = EVIDENCE_BY_ID[id];
  if (!e) return null;
  const text = e.id === "x_ids" ? `${e.text}\n\n${confiscated.map((n) => `• ${n}`).join("\n")}` : e.text;
  return (
    <div className="m6-modal" role="dialog" aria-label={e.title} onClick={onClose}>
      <div className={`m6-doc m6-doc--${e.icon}`} onClick={(ev) => ev.stopPropagation()}>
        <div className="m6-doc__head">
          <Icon id={e.icon} size={20} />
          <h3>{e.title}</h3>
          {e.critical && <span className="m6-tag">CRITICAL</span>}
        </div>
        {still && <img className="m6-doc__still" src={still} alt="" />}
        <div className="m6-doc__text">{text}</div>
        <button type="button" className="m6-btn m6-btn--primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ keypad */
export function Keypad({ onTry, onClose }) {
  const [code, setCode] = useState("");
  const [bad, setBad] = useState(false);
  const press = (k) => {
    setBad(false);
    if (k === "C") return setCode("");
    if (k === "OK") {
      if (code.length === 4 && !onTry(code)) {
        setBad(true);
        setCode("");
      }
      return;
    }
    setCode((c) => (c.length < 4 ? c + k : c));
  };
  useEffect(() => {
    const kd = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Enter") press("OK");
      else if (e.key === "Backspace") setCode((c) => c.slice(0, -1));
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", kd, true);
    return () => window.removeEventListener("keydown", kd, true);
  });
  return (
    <div className="m6-modal" role="dialog" aria-label="Lockbox" onClick={onClose}>
      <div className={`m6-keypad${bad ? " is-bad" : ""}`} onClick={(e) => e.stopPropagation()}>
        <h3>Rusted lockbox</h3>
        <div className="m6-keypad__disp">{code.padEnd(4, "•")}</div>
        <div className="m6-keypad__grid">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"].map((k) => (
            <button key={k} type="button" className="m6-btn" onClick={() => press(k)}>{k}</button>
          ))}
        </div>
        <p className="m6-dim">{bad ? "The dial clicks back to zero." : "Four digits. Something about the night it all began."}</p>
        <button type="button" className="m6-btn m6-btn--ghost" onClick={onClose}>Step away</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ CCTV */
export function CCTVOverlay({ cam, onCam, onCapture, onExit, power, clock, info, still, glitch }) {
  return (
    <div className={`m6-cctv${glitch ? " is-glitch" : ""}`}>
      <div className="m6-cctv__scan" />
      {!power && <div className="m6-cctv__nosig">NO SIGNAL<small>Power is out</small></div>}
      <div className="m6-cctv__tl"><span className="m6-rec" /> REC · {CCTV_NAMES[cam]}</div>
      <div className="m6-cctv__tr m6-mono">{clock}</div>
      {power && info && <div className="m6-cctv__info m6-mono">{info.map((l, i) => <div key={i} className={l.bad ? "is-bad" : ""}>{l.text}</div>)}</div>}
      {still && <img className="m6-cctv__still" src={still} alt="Captured still" />}
      <div className="m6-cctv__bar">
        {CCTV_NAMES.map((n, i) => (
          <button key={i} type="button" className={`m6-btn${cam === i ? " is-on" : ""}`} onClick={() => onCam(i)} aria-label={n}>CAM {i + 1}</button>
        ))}
        <button type="button" className="m6-btn m6-btn--red" onClick={onCapture} disabled={!power}><Icon id="camera" size={16} /> Capture</button>
        <button type="button" className="m6-btn m6-btn--ghost" onClick={onExit}>Back to desk</button>
      </div>
    </div>
  );
}

export const ruleTitle = (id) => RULES.find((r) => r.id === id)?.title || "No specific rule";
