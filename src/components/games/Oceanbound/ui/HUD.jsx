/**
 * Oceanbound — in-game HUD. Reads the throttled snapshot from
 * sim/game.js hudSnapshot() (≈10 Hz) plus the live inventory; never touches
 * the sim directly except through the callbacks it is given.
 */
import { memo, useEffect, useRef } from "react";
import { ITEMS, PIECES, itemName } from "../data/items.js";
import { HOTBAR } from "../sim/inventory.js";
import { Icon } from "./icons.jsx";

const fmtClock = (h) => {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const isNight = (h) => h < 5.6 || h > 19.8;

function Meter({ icon, v, cls, label, warn }) {
  const p = Math.max(0, Math.min(100, v));
  return (
    <div className={`ob-meter ob-meter--${cls}${warn && p < 25 ? " is-low" : ""}`} title={`${label} ${Math.round(p)}%`}>
      <span className="ob-meter__ico">
        <Icon id={icon} size={16} />
      </span>
      <span className="ob-meter__bar">
        <i style={{ width: `${p}%` }} />
      </span>
    </div>
  );
}

const COMPASS = [
  ["N", 0],
  ["NE", 45],
  ["E", 90],
  ["SE", 135],
  ["S", 180],
  ["SW", 225],
  ["W", 270],
  ["NW", 315],
];
function Compass({ yaw, markers, clock, day }) {
  // heading in degrees: yaw 0 looks along -z ("north")
  const heading = ((-yaw * 180) / Math.PI) % 360;
  const rel = (deg) => {
    let d = deg - heading;
    d = ((d + 540) % 360) - 180;
    return d;
  };
  const SPAN = 100;
  return (
    <div className="ob-compass">
      <div className="ob-compass__strip">
        {COMPASS.map(([t, deg]) => {
          const d = rel(deg);
          if (Math.abs(d) > SPAN) return null;
          return (
            <span key={t} className={`ob-compass__tick${t.length === 1 ? " is-major" : ""}`} style={{ left: `${50 + (d / SPAN) * 50}%` }}>
              {t}
            </span>
          );
        })}
        {markers.map((m, k) => {
          // marker angle: atan2(dx, dz) in world → compass degrees (north = -z)
          const deg = (180 - (m.a * 180) / Math.PI + 360) % 360;
          const d = rel(deg);
          const clampD = Math.max(-SPAN, Math.min(SPAN, d));
          const off = Math.abs(d) > SPAN;
          const icon = m.kind === "raft" ? "raftI" : m.kind === "satchel" ? "satchelI" : `${m.kind}I`;
          return (
            <span key={k} className={`ob-compass__mk ob-compass__mk--${m.kind}${off ? " is-off" : ""}${m.found === false ? " is-new" : ""}`} style={{ left: `${50 + (clampD / SPAN) * 50}%` }}>
              <Icon id={icon} size={14} />
              <small>{m.d > 999 ? `${(m.d / 1000).toFixed(1)}km` : `${Math.round(m.d)}m`}</small>
            </span>
          );
        })}
        <span className="ob-compass__needle" />
      </div>
      <div className="ob-clock">
        <Icon id={isNight(clock) ? "moon" : "sun"} size={14} />
        <span>
          Day {day} · {fmtClock(clock)}
        </span>
      </div>
    </div>
  );
}

function Objectives({ objs, done, total, flash }) {
  return (
    <div className="ob-objs" data-ui>
      <div className="ob-objs__head">
        <span>Objectives</span>
        <b>
          {done}/{total}
        </b>
      </div>
      {objs.map((o) => (
        <div key={o.id} className={`ob-obj${flash === o.id ? " is-flash" : ""}`}>
          <div className="ob-obj__t">{o.title}</div>
          <div className="ob-obj__d">{o.desc}</div>
          {o.goal > 1 && (
            <div className="ob-obj__p">
              <i style={{ width: `${(o.v / o.goal) * 100}%` }} />
              <span>
                {o.v}/{o.goal}
              </span>
            </div>
          )}
        </div>
      ))}
      {objs.length === 0 && <div className="ob-obj ob-obj--done">Every objective complete — the sea is yours.</div>}
    </div>
  );
}

function Hotbar({ slots, sel, onSelect, touch }) {
  return (
    <div className="ob-hotbar" data-ui>
      {slots.slice(0, HOTBAR).map((s, i) => {
        const it = s && ITEMS[s.id];
        const dur = s && it?.tool?.dur ? s.dur / it.tool.dur : null;
        return (
          <button
            type="button"
            key={i}
            className={`ob-slot ob-hotbar__slot${i === sel ? " is-sel" : ""}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(i);
            }}
            aria-label={s ? `${itemName(s.id)} (slot ${i + 1})` : `Empty slot ${i + 1}`}
          >
            {!touch && <span className="ob-slot__key">{i + 1}</span>}
            {s && <Icon id={s.id} size={30} />}
            {s && s.n > 1 && <span className="ob-slot__n">{s.n}</span>}
            {dur != null && (
              <span className="ob-slot__dur">
                <i style={{ width: `${dur * 100}%`, background: dur < 0.25 ? "#ff6a5a" : dur < 0.5 ? "#ffc65a" : "#7fe08a" }} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function BuildBar({ b, inv, touch }) {
  if (!b) return null;
  const name = PIECES[b.type]?.name || itemName(b.type);
  return (
    <div className={`ob-build${b.ok ? "" : " is-bad"}`}>
      <div className="ob-build__row">
        <span className="ob-build__ico">
          <Icon id={b.type} size={26} />
        </span>
        <b>{name}</b>
        <span className="ob-build__cost">
          {Object.entries(b.cost).map(([id, n]) => {
            const have = inv.slots.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
            return (
              <span key={id} className={have >= n ? "is-ok" : "is-miss"} title={itemName(id)}>
                <Icon id={id} size={16} />
                {have}/{n}
              </span>
            );
          })}
        </span>
      </div>
      {!b.ok && b.reason && <div className="ob-build__why">{b.reason}</div>}
      {!touch && (
        <div className="ob-build__keys">
          <span>
            <kbd>LMB</kbd> place
          </span>
          <span>
            <kbd>R</kbd> rotate
          </span>
          {b.remove && (
            <span>
              <kbd>RMB</kbd> remove {b.remove === "foundation" ? "foundation" : PIECES[b.remove]?.name || itemName(b.remove)}
            </span>
          )}
          <span>
            <kbd>B</kbd> pieces
          </span>
        </div>
      )}
    </div>
  );
}

function Feed({ feed }) {
  return (
    <div className="ob-feed">
      {feed.map((f) => (
        <div key={f.id} className={`ob-feed__i ob-feed__i--${f.tone}`}>
          {f.item && <Icon id={f.item} size={18} />}
          <span>{f.text}</span>
        </div>
      ))}
    </div>
  );
}

function TouchControls({ input, hud, onInventory, onBuild, onPause }) {
  const btn = (name, label, cls = "") => (
    <button
      type="button"
      data-ui
      className={`ob-tbtn ob-tbtn--${name} ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        input.press(name, true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        input.press(name, false);
      }}
      onPointerCancel={() => input.press(name, false)}
      onPointerLeave={() => input.press(name, false)}
    >
      {label}
    </button>
  );
  const building = !!hud.build;
  return (
    <div className="ob-touch">
      <div className="ob-touch__joy">
        <span />
      </div>
      <div className="ob-touch__right">
        {btn("use", hud.eq ? (building ? "Place" : "Use") : "Use", "is-big")}
        {btn("jump", hud.swimming ? "Up" : "Jump")}
        {btn("interact", "E")}
        {hud.swimming ? btn("dive", "Dive") : btn("sprint", "Run")}
        {building && btn("rotate", "Rotate")}
        {building && btn("alt", "Remove")}
      </div>
      <div className="ob-touch__top" data-ui>
        <button type="button" className="ob-tbtn ob-tbtn--sm" onPointerDown={(e) => (e.stopPropagation(), onInventory())}>
          <Icon id="bag" size={18} />
        </button>
        <button type="button" className="ob-tbtn ob-tbtn--sm" onPointerDown={(e) => (e.stopPropagation(), onBuild())}>
          <Icon id="hammer" size={18} />
        </button>
        <button type="button" className="ob-tbtn ob-tbtn--sm" onPointerDown={(e) => (e.stopPropagation(), onPause())}>
          II
        </button>
      </div>
    </div>
  );
}

function JoystickVisual({ input }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      if (!el) return;
      const J = input.S.joy;
      if (J.id < 0) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = "1";
      el.style.transform = `translate(${J.ox}px, ${J.oy}px)`;
      el.firstChild.style.transform = `translate(${J.x * 34}px, ${J.y * 34}px)`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [input]);
  return (
    <div ref={ref} className="ob-joy">
      <i />
    </div>
  );
}

function HUD({ hud, inv, touch, input, onSelect, onInventory, onBuild, onPause, saveState, flashObj, banner, fps, hurt, lockHint }) {
  if (!hud) return null;
  const promptKey = hud.prompt?.key;
  const sharkMsg = hud.shark === "raft" ? (hud.sharkBiting ? "The shark is biting your raft — hit it with a spear!" : "A shark is circling in — protect the raft!") : hud.shark === "you" ? "Shark in the water — get back on the raft!" : null;
  const eqName = hud.eq ? itemName(hud.eq) : null;
  return (
    <div className={`ob-hud${hud.underwater ? " is-under" : ""}`}>
      {hud.underwater && <div className="ob-underwater" />}
      <div className={`ob-vignette${hud.hp < 30 ? " is-hurt" : ""}`} style={{ opacity: Math.min(1, (hurt || 0) + (hud.hp < 30 ? 0.5 : 0)) }} />
      <Objectives objs={hud.objs} done={hud.done} total={hud.total} flash={flashObj} />
      <Compass yaw={hud.yaw} markers={hud.markers} clock={hud.clock} day={hud.day} />
      {sharkMsg && (
        <div className={`ob-alert${hud.sharkBiting ? " is-hot" : ""}`}>
          <Icon id="fin" size={18} />
          <span>{sharkMsg}</span>
        </div>
      )}
      {banner && (
        <div className={`ob-banner ob-banner--${banner.kind}`} key={banner.k}>
          <small>{banner.sub}</small>
          <b>{banner.title}</b>
          {banner.extra && <span>{banner.extra}</span>}
        </div>
      )}
      <div className="ob-cross">
        <i className={hud.prompt && !hud.prompt.info ? "is-on" : ""} />
        {hud.hook >= 0 && (
          <svg className="ob-charge" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" />
            <circle cx="20" cy="20" r="16" className="is-fill" style={{ strokeDasharray: `${hud.hook * 100.5} 200` }} />
          </svg>
        )}
      </div>
      {hud.rod === "bite" && <div className="ob-bite">BITE! Click now!</div>}
      {hud.prompt && (
        <div className={`ob-prompt${hud.prompt.info ? " is-info" : ""}${hud.prompt.ok === false && !hud.prompt.info ? " is-bad" : ""}`}>
          {promptKey && <kbd>{touch && promptKey === "E" ? "E" : touch && promptKey === "LMB" ? "Use" : promptKey}</kbd>}
          <span>{hud.prompt.text}</span>
          {hud.prompt.cost && (
            <span className="ob-prompt__cost">
              {Object.entries(hud.prompt.cost).map(([id, n]) => (
                <span key={id}>
                  <Icon id={id} size={14} />
                  {n}
                </span>
              ))}
            </span>
          )}
          {hud.prompt.progress != null && (
            <span className="ob-prompt__prog">
              <i style={{ width: `${Math.min(100, hud.prompt.progress * 100)}%` }} />
            </span>
          )}
          {hud.prompt.alt && (
            <span className="ob-prompt__alt">
              <kbd>{hud.prompt.alt.key}</kbd>
              {hud.prompt.alt.text}
            </span>
          )}
        </div>
      )}
      {hud.underwater && (
        <div className={`ob-oxy${hud.oxygen < 30 ? " is-low" : ""}`}>
          <Icon id="oxygen" size={16} />
          <span>
            <i style={{ width: `${hud.oxygen}%` }} />
          </span>
        </div>
      )}
      <div className="ob-stats">
        <Meter icon="heart" v={hud.hp} cls="hp" label="Health" warn />
        <Meter icon="hunger" v={hud.hunger} cls="food" label="Hunger" warn />
        <Meter icon="thirst" v={hud.thirst} cls="water" label="Thirst" warn />
        <Meter icon="stamina" v={hud.stamina} cls="stam" label="Stamina" />
      </div>
      <div className="ob-raftinfo">
        {hud.island ? <span className="is-land">{hud.island}</span> : null}
        {hud.raft.anchored ? <span>Anchored</span> : hud.raft.sail ? <span>Sailing · {hud.raft.speed.toFixed(1)} m/s</span> : <span>Drifting · {hud.raft.speed.toFixed(1)} m/s</span>}
        {hud.raft.aground && <span className="is-warn">Aground</span>}
      </div>
      <div className="ob-bottom">
        {eqName && <div className="ob-eqname">{eqName}</div>}
        <BuildBar b={hud.build} inv={inv} touch={touch} />
        <Hotbar slots={inv.slots} sel={hud.sel} onSelect={onSelect} touch={touch} />
      </div>
      <Feed feed={hud.feed} />
      {saveState && (
        <div className={`ob-saving ob-saving--${saveState}`}>
          <span className="ob-saving__dot" />
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Game saved" : "Save failed — storage is full or blocked"}
        </div>
      )}
      {hud.warn && (
        <div className="ob-warn">
          {hud.warn === "oxygen" ? "Out of air — surface!" : hud.warn === "thirst" ? "You're dehydrated — drink fresh water" : hud.warn === "drift" ? "Your raft is drifting away — follow the compass!" : "You're starving — eat something"}
        </div>
      )}
      {lockHint && !touch && <div className="ob-lockhint">Click to look around</div>}
      {fps > 0 && <div className="ob-fps">{fps} fps</div>}
      {touch && (
        <>
          <JoystickVisual input={input} />
          <TouchControls input={input} hud={hud} onInventory={onInventory} onBuild={onBuild} onPause={onPause} />
        </>
      )}
    </div>
  );
}
export default memo(HUD);
