/**
 * Last Shelter — the scavenging HUD: countdown ring, family rescue status,
 * carry slots, what's gone down the hatch, the action prompt, an edge arrow
 * toward the hatch when it's off screen, and touch controls.
 */
import { useRef } from "react";
import { Icon } from "./icons.jsx";
import { Portrait } from "./Figure.jsx";
import { ITEMS } from "../data/items.js";
import { BY_ID } from "../data/family.js";

const fmt = (s) => `0:${String(Math.max(0, Math.ceil(s))).padStart(2, "0")}`;

export function HouseHUD({ hud, touch, input, onPause, onGrab, onDescend }) {
  if (!hud) return null;
  const { left, intro, cap, used, carry, family, delivered, target, inHatch, hatch, ended, runner } = hud;
  const urgent = left <= 10 && !intro && !ended;
  const frac = Math.max(0, left / 60);
  const R = 34;
  const C = 2 * Math.PI * R;
  let prompt = null;
  if (target) {
    const label = target.type === "item" ? ITEMS[target.kind].name : `Take ${BY_ID[target.id].name}`;
    if (target.blocked === "full") prompt = { bad: true, text: `No room for the ${ITEMS[target.kind].name} — drop things at the hatch` };
    else if (target.blocked === "escort") prompt = { bad: true, text: `Hands full — get ${BY_ID[hud.escort]?.name || "them"} to the hatch first` };
    else if (target.blocked === "hands") prompt = { bad: true, text: "Drop your items at the hatch before carrying someone" };
    else prompt = { text: label, key: touch ? null : "E" };
  } else if (inHatch && !ended) prompt = { good: true, text: left > 1 ? "At the hatch — supplies dropped. Go down now, or keep scavenging." : "Stay on the hatch!" };
  return (
    <div className={`lsh-hud${urgent ? " is-urgent" : ""}`}>
      {urgent && <div className="lsh-hud__vignette" />}
      <div className="lsh-hud__top">
        <div className="lsh-hud__family" aria-label="Family">
          {family.map((f) => (
            <div key={f.id} className={`lsh-hud__fam is-${f.state}`} title={`${BY_ID[f.id].name}: ${f.state === "saved" ? "safe below" : f.state === "following" ? "with you" : "still in the house"}`}>
              <Portrait id={f.id} size={40} />
              <span className="lsh-hud__fam-badge">{f.state === "saved" ? <Icon name="check" size={12} /> : f.state === "following" ? "→" : "!"}</span>
            </div>
          ))}
        </div>
        <div className={`lsh-timer${urgent ? " is-urgent" : ""}`} role="timer" aria-live="off" aria-label={`${Math.ceil(left)} seconds left`}>
          <svg viewBox="0 0 80 80" width="78" height="78">
            <circle cx="40" cy="40" r={R} className="lsh-timer__track" />
            <circle cx="40" cy="40" r={R} className="lsh-timer__bar" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 40 40)" />
          </svg>
          <span className="lsh-timer__txt">{fmt(left)}</span>
        </div>
        <div className="lsh-hud__right">
          <div className="lsh-hud__delivered" aria-label="Down the hatch">
            <span className="lsh-hud__lbl">In the shelter</span>
            <div className="lsh-hud__chips">
              {["food", "water", "medkit", "batteries"].map((k) => (
                <span key={k} className="lsh-chip">
                  <Icon name={k} size={16} />
                  {delivered[k] || 0}
                </span>
              ))}
              {["flashlight", "radio", "toolkit", "map", "gasmask", "books", "backpack"].map((k) =>
                delivered[k] ? (
                  <span key={k} className="lsh-chip lsh-chip--tool" title={ITEMS[k].name}>
                    <Icon name={k} size={16} />
                  </span>
                ) : null,
              )}
            </div>
          </div>
          <button type="button" className="lsh-iconbtn" onClick={onPause} aria-label="Pause">
            <Icon name="pause" size={18} />
          </button>
        </div>
      </div>

      {hatch && !hatch.on && !ended && (
        <div className="lsh-edge" style={{ left: hatch.ex, top: hatch.ey, "--rot": `${hatch.ang}rad` }}>
          <span className="lsh-edge__arrow" />
          <span className="lsh-edge__lbl">Hatch</span>
        </div>
      )}
      {hatch && hatch.on && !ended && !inHatch && (
        <div className="lsh-hatchlbl" style={{ left: hatch.x, top: hatch.y }}>
          SHELTER
        </div>
      )}

      <div className="lsh-hud__bottom">
        {prompt && (
          <div className={`lsh-prompt${prompt.bad ? " is-bad" : ""}${prompt.good ? " is-good" : ""}`}>
            {prompt.key && <kbd>{prompt.key}</kbd>}
            {prompt.text}
          </div>
        )}
        <div className="lsh-slots" aria-label={`Carrying ${used} of ${cap}`}>
          {hud.escort ? (
            <div className="lsh-slots__escort">
              <Portrait id={hud.escort} size={34} /> Escorting {BY_ID[hud.escort].name}
            </div>
          ) : (
            Array.from({ length: cap }, (_, i) => {
              const k = carry[i];
              return (
                <div key={i} className={`lsh-slot${k ? " is-full" : ""}${k && ITEMS[k].slots === 2 ? " is-wide" : ""}`}>
                  {k ? <Icon name={k} size={24} /> : null}
                </div>
              );
            })
          )}
          {hud.backpack && <span className="lsh-slots__bp" title="Backpack: +2 slots"><Icon name="backpack" size={18} /></span>}
        </div>
      </div>

      {intro > 0 && (
        <div className="lsh-intro">
          <div className="lsh-intro__siren">EMERGENCY BROADCAST</div>
          <h2>Get to the shelter!</h2>
          <p>
            Grab supplies, find your family, and be standing on the <b>green hatch</b> in the garage when the clock hits zero.
          </p>
          <div className="lsh-intro__count" key={Math.ceil(intro)}>
            {Math.ceil(intro) > 0 ? Math.ceil(intro) : "GO"}
          </div>
          <p className="lsh-intro__as">
            You are <b>{BY_ID[runner].name}</b>
          </p>
        </div>
      )}

      {touch && !ended && (
        <>
          <Joystick input={input} />
          <div className="lsh-touchbtns">
            {inHatch && (
              <button type="button" className="lsh-tbtn lsh-tbtn--descend" onPointerDown={(e) => (e.preventDefault(), onDescend())}>
                Go down
              </button>
            )}
            <button type="button" className={`lsh-tbtn lsh-tbtn--grab${target && !target.blocked ? " is-ready" : ""}`} onPointerDown={(e) => (e.preventDefault(), onGrab())}>
              Grab
            </button>
          </div>
        </>
      )}
      {!touch && inHatch && !ended && (
        <button type="button" className="lsh-descend" onClick={onDescend}>
          <kbd>Enter</kbd> Go down now
        </button>
      )}
    </div>
  );
}

function Joystick({ input }) {
  const base = useRef(null);
  const knob = useRef(null);
  const id = useRef(null);
  const move = (e) => {
    const r = base.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    const dead = m < 0.12;
    input.S.joy.active = true;
    input.S.joy.x = dead ? 0 : dx;
    input.S.joy.y = dead ? 0 : dy;
    knob.current.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
  };
  const end = () => {
    id.current = null;
    input.S.joy.active = false;
    input.S.joy.x = input.S.joy.y = 0;
    if (knob.current) knob.current.style.transform = "translate(0,0)";
  };
  return (
    <div
      ref={base}
      className="lsh-joy"
      onPointerDown={(e) => {
        e.preventDefault();
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => id.current === e.pointerId && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Move"
    >
      <div ref={knob} className="lsh-joy__knob" />
    </div>
  );
}
