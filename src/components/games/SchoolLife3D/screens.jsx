/**
 * School Life Simulator 3D — menus and overlays (React).
 */
import { useEffect, useRef, useState } from "react";
import {
  SKIN, HAIR_COLORS, HAIR_STYLES, EYE_COLORS, OUTFITS, BOTTOMS, ACCESSORIES, ACC_SLOTS, unlocked, STUDENTS, PERSONALITIES,
  SUBJECTS, SUBJECT_ORDER, ACADEMIC, MISSIONS, FOOD, VENDING, LEVEL_UNLOCKS, MAX_LEVEL, xpToNext, letter, LETTER_COLOR,
  friendTier, TIER_NAME, daySchedule, isExamDay, nextExamDay, examSubjects, BLOCKS, fmtTime, subjectInfo, ACTIVITIES, DAY_SPEED,
} from "./data.js";
import { roomById } from "./layout.js";
import { drawMap } from "./mapdraw.js";
import { audio } from "./audio.js";

const pct = (v) => `${Math.round(Math.max(0, Math.min(100, v)))}%`;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const dayName = (d) => DAY_NAMES[(d - 1) % 5];

/* ================================================================ main menu */
export function MainMenu({ save, onPlay, onContinue, onCreator, onHow, onSettings }) {
  const has = save.started;
  return (
    <div className="sl-menu">
      <div className="sl-menu__brand">
        <div className="sl-menu__badge">🏫</div>
        <h1>
          School Life <span>Simulator 3D</span>
        </h1>
        <p className="sl-menu__tag">LEARN • EXPLORE • LIVE</p>
      </div>
      <nav className="sl-menu__nav">
        <button type="button" className="sl-btn sl-btn--primary sl-btn--big" onClick={onPlay}>
          ▶ {has ? "New School Year" : "Play"}
        </button>
        <button type="button" className="sl-btn sl-btn--big" onClick={onContinue} disabled={!has} title={has ? "" : "No saved school year yet"}>
          ⏵ Continue{has ? ` — Day ${save.day}, Level ${save.level}` : ""}
        </button>
        <button type="button" className="sl-btn" onClick={onCreator}>
          🎨 Character Creator
        </button>
        <button type="button" className="sl-btn" onClick={onHow}>
          ❔ How to Play
        </button>
        <button type="button" className="sl-btn" onClick={onSettings}>
          ⚙ Settings
        </button>
      </nav>
      {!has && <p className="sl-menu__hint">Create your student, explore Maplewood High, attend classes and make friends.</p>}
    </div>
  );
}

/* ================================================================ creator / wardrobe */
function Swatches({ list, value, onPick, locked }) {
  return (
    <div className="sl-swatches">
      {list.map((c, i) => {
        const lock = locked && locked(i);
        return (
          <button key={i} type="button" aria-label={`Colour ${i + 1}${lock ? " (locked)" : ""}`} className={`sl-sw${value === i ? " is-on" : ""}${lock ? " is-lock" : ""}`} style={{ background: c }} disabled={!!lock} onClick={() => onPick(i)}>
            {lock ? "🔒" : ""}
          </button>
        );
      })}
    </div>
  );
}
function Choice({ items, value, onPick, level, render }) {
  return (
    <div className="sl-choices">
      {items.map((it) => {
        const lock = !unlocked(it, level);
        return (
          <button key={it.id} type="button" className={`sl-choice${value === it.id ? " is-on" : ""}${lock ? " is-lock" : ""}`} disabled={lock} onClick={() => onPick(it.id)} title={lock ? `Unlocks at level ${it.level}` : it.name}>
            {render ? render(it) : it.name}
            {lock && <small>🔒 Lv {it.level}</small>}
          </button>
        );
      })}
    </div>
  );
}
export function Creator({ look, setLook, level, mode, onDone, onCancel, onRotate, onPose }) {
  const L = look;
  const set = (patch) => {
    audio.click();
    setLook({ ...L, ...patch });
  };
  const setAcc = (slot, id) => {
    audio.click();
    setLook({ ...L, acc: { ...L.acc, [slot]: id } });
  };
  const randomize = () => {
    const r = (a) => a[Math.floor(Math.random() * a.length)];
    const okH = HAIR_STYLES.filter((h) => unlocked(h, level));
    const okC = HAIR_COLORS.filter((h) => unlocked(h, level));
    const okO = OUTFITS.filter((h) => unlocked(h, level));
    const accOk = (slot) => ["none", ...ACCESSORIES.filter((a) => a.slot === slot && unlocked(a, level)).map((a) => a.id)];
    setLook({
      ...L,
      skin: Math.floor(Math.random() * SKIN.length),
      hairStyle: r(okH).id,
      hairColor: r(okC).id,
      eyes: Math.floor(Math.random() * EYE_COLORS.length),
      outfit: r(okO).id,
      bottom: r(BOTTOMS).id,
      build: Math.floor(Math.random() * 3),
      acc: Object.fromEntries(ACC_SLOTS.map((s) => [s, Math.random() < 0.35 ? r(accOk(s)) : "none"])),
    });
    audio.ui();
  };
  const drag = useRef(null);
  return (
    <div className="sl-creator">
      <div
        className="sl-creator__stage"
        onPointerDown={(e) => {
          drag.current = e.clientX;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current == null) return;
          onRotate((e.clientX - drag.current) * 0.012);
          drag.current = e.clientX;
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <div className="sl-creator__tools">
          <button type="button" className="sl-btn sl-btn--sm" onClick={() => onRotate(-0.6)} aria-label="Rotate left">
            ⟲
          </button>
          <button type="button" className="sl-btn sl-btn--sm" onClick={() => onPose("wave")}>
            👋 Wave
          </button>
          <button type="button" className="sl-btn sl-btn--sm" onClick={() => onPose("celebrate")}>
            🎉 Celebrate
          </button>
          <button type="button" className="sl-btn sl-btn--sm" onClick={() => onRotate(0.6)} aria-label="Rotate right">
            ⟳
          </button>
        </div>
        <p className="sl-creator__drag">Drag to rotate</p>
      </div>
      <div className="sl-creator__panel">
        <h2>{mode === "wardrobe" ? "🔒 Your Locker" : "Create Your Student"}</h2>
        {mode !== "wardrobe" && (
          <label className="sl-field">
            <span>Name</span>
            <input value={L.name} maxLength={16} onChange={(e) => setLook({ ...L, name: e.target.value.replace(/[^\p{L}\p{N} '-]/gu, "") })} onBlur={() => !L.name.trim() && setLook({ ...L, name: "Alex" })} />
          </label>
        )}
        <div className="sl-field">
          <span>Skin tone</span>
          <Swatches list={SKIN} value={L.skin} onPick={(i) => set({ skin: i })} />
        </div>
        <div className="sl-field">
          <span>Eyes</span>
          <Swatches list={EYE_COLORS} value={L.eyes} onPick={(i) => set({ eyes: i })} />
        </div>
        <div className="sl-field">
          <span>Build</span>
          <Choice items={[{ id: 0, name: "Slim" }, { id: 1, name: "Average" }, { id: 2, name: "Sturdy" }]} value={L.build} level={level} onPick={(id) => set({ build: id })} />
        </div>
        <div className="sl-field">
          <span>Hair style</span>
          <Choice items={HAIR_STYLES} value={L.hairStyle} level={level} onPick={(id) => set({ hairStyle: id })} />
        </div>
        <div className="sl-field">
          <span>Hair colour</span>
          <Swatches list={HAIR_COLORS.map((h) => h.c)} value={HAIR_COLORS.findIndex((h) => h.id === L.hairColor)} onPick={(i) => set({ hairColor: HAIR_COLORS[i].id })} locked={(i) => !unlocked(HAIR_COLORS[i], level)} />
        </div>
        <div className="sl-field">
          <span>Outfit</span>
          <Choice
            items={OUTFITS}
            value={L.outfit}
            level={level}
            onPick={(id) => set({ outfit: id })}
            render={(o) => (
              <>
                <i className="sl-outfit" style={{ background: `linear-gradient(135deg, ${o.top} 0 50%, ${o.bottom} 50% 100%)`, borderColor: o.accent }} />
                {o.name}
              </>
            )}
          />
        </div>
        <div className="sl-field">
          <span>Bottoms</span>
          <Choice items={BOTTOMS} value={L.bottom} level={level} onPick={(id) => set({ bottom: id })} />
        </div>
        {ACC_SLOTS.map((slot) => {
          const list = [{ id: "none", name: "None" }, ...ACCESSORIES.filter((a) => a.slot === slot)];
          if (list.length < 2) return null;
          return (
            <div className="sl-field" key={slot}>
              <span>{{ face: "Eyewear", head: "Headwear", back: "Back", neck: "Neck", chest: "Pin" }[slot]}</span>
              <Choice items={list} value={L.acc[slot]} level={level} onPick={(id) => setAcc(slot, id)} />
            </div>
          );
        })}
        <div className="sl-row sl-creator__actions">
          <button type="button" className="sl-btn" onClick={randomize}>
            🎲 Randomize
          </button>
          {onCancel && (
            <button type="button" className="sl-btn sl-btn--ghost" onClick={onCancel}>
              {mode === "wardrobe" ? "Close" : "Back"}
            </button>
          )}
          <button type="button" className="sl-btn sl-btn--primary" onClick={onDone}>
            {mode === "new" ? "Start School! →" : "Save look"}
          </button>
        </div>
        {mode !== "new" && <p className="sl-dim">More outfits, hair and accessories unlock as you level up.</p>}
      </div>
    </div>
  );
}

/* ================================================================ how to play / settings */
export const CONTROLS = [
  ["W A S D", "Walk"],
  ["Mouse", "Rotate the camera · wheel zooms"],
  ["Shift", "Run (uses energy)"],
  ["Space", "Jump"],
  ["E", "Talk / interact / open doors"],
  ["F", "Sit down / stand up"],
  ["Left-click / hold E", "Shoot / kick in sports"],
  ["X", "Quit a sports activity"],
  ["M", "School map"],
  ["Tab", "Student profile"],
  ["J", "Journal (missions, homework, schedule)"],
  ["Esc", "Pause & release the mouse"],
];
export function HowTo({ onBack }) {
  return (
    <div className="sl-card sl-how">
      <h2>How to Play</h2>
      <div className="sl-how__cols">
        <section>
          <h3>Your school day</h3>
          <ul className="sl-bullets">
            <li>Arrive at 08:00. Classes start at <b>08:30, 09:30, 11:00 and 13:00</b>; break at 10:30, lunch at 12:00, sports/activities at 14:00 and school ends at 15:00.</li>
            <li>The HUD shows your next class and room. Bells ring at every class start and end.</li>
            <li>Sit at a <b>free glowing desk (F)</b> within 5 minutes of the bell to be on time. Up to 25 minutes late is “late”; after that you're absent.</li>
            <li>Once the teacher starts the activity, play the subject's minigame to earn a grade (A–F).</li>
            <li>Every 3rd day the 3rd class is an <b>exam</b> in the Exam Hall (Room 103).</li>
            <li>Do homework at library tables or the Study Room before its deadline.</li>
          </ul>
        </section>
        <section>
          <h3>Life at Maplewood</h3>
          <ul className="sl-bullets">
            <li>Talk to classmates (E) to build friendships (0–100). Friends greet you, ask favours, join activities and whisper hints in class.</li>
            <li>Eat at the cafeteria to restore energy. Running and activities use it up.</li>
            <li>Play basketball on the court or in the gym, take penalties on the field and race the track.</li>
            <li>Reputation rises when you attend, help and win; it drops when you skip, arrive late or disrupt lessons.</li>
            <li>Earn XP to level up (1–20) and unlock outfits, accessories, activities and special missions. Change outfits at your locker.</li>
          </ul>
        </section>
        <section>
          <h3>Controls</h3>
          <dl className="sl-keys">
            {CONTROLS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="sl-dim">On touch screens: left half = move stick, right half = look; buttons for E, F, jump and run.</p>
        </section>
      </div>
      <button type="button" className="sl-btn sl-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
export function SettingsPanel({ settings, onChange, onBack, compact }) {
  const S = settings;
  return (
    <div className={`sl-card sl-settings${compact ? " sl-settings--compact" : ""}`}>
      <h2>Settings</h2>
      <label className="sl-set">
        <span>Volume</span>
        <input type="range" min="0" max="1" step="0.05" value={S.volume} onChange={(e) => onChange("volume", Number(e.target.value))} />
        <b>{Math.round(S.volume * 100)}%</b>
      </label>
      <label className="sl-set">
        <span>Mouse sensitivity</span>
        <input type="range" min="0.3" max="3" step="0.1" value={S.sens} onChange={(e) => onChange("sens", Number(e.target.value))} />
        <b>{S.sens.toFixed(1)}×</b>
      </label>
      <label className="sl-set">
        <span>Camera distance</span>
        <input type="range" min="0.6" max="1.6" step="0.05" value={S.camDist} onChange={(e) => onChange("camDist", Number(e.target.value))} />
        <b>{S.camDist.toFixed(2)}×</b>
      </label>
      <div className="sl-set">
        <span>Invert vertical look</span>
        <button type="button" className={`sl-toggle${S.invertY ? " is-on" : ""}`} aria-pressed={S.invertY} onClick={() => onChange("invertY", !S.invertY)}>
          {S.invertY ? "On" : "Off"}
        </button>
      </div>
      <div className="sl-set">
        <span>Day length</span>
        <div className="sl-seg">
          {Object.keys(DAY_SPEED).map((k) => (
            <button key={k} type="button" className={S.dayLength === k ? "is-on" : ""} onClick={() => onChange("dayLength", k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="sl-set">
        <span>Graphics</span>
        <div className="sl-seg">
          {["low", "medium", "high"].map((k) => (
            <button key={k} type="button" className={S.quality === k ? "is-on" : ""} onClick={() => onChange("quality", k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="sl-set">
        <span>Minimap</span>
        <button type="button" className={`sl-toggle${S.minimap ? " is-on" : ""}`} aria-pressed={S.minimap} onClick={() => onChange("minimap", !S.minimap)}>
          {S.minimap ? "On" : "Off"}
        </button>
      </div>
      {onBack && (
        <button type="button" className="sl-btn sl-btn--primary" onClick={onBack}>
          Back
        </button>
      )}
    </div>
  );
}

/* ================================================================ pause */
export function PauseOverlay({ onResume, onSave, onSettings, onMenu, saved }) {
  return (
    <div className="sl-card sl-pause">
      <h2>Paused</h2>
      <div className="sl-pause__btns">
        <button type="button" className="sl-btn sl-btn--primary sl-btn--big" onClick={onResume} autoFocus>
          ▶ Resume
        </button>
        <button type="button" className="sl-btn" onClick={onSave}>
          💾 {saved ? "Saved!" : "Save"}
        </button>
        <button type="button" className="sl-btn" onClick={onSettings}>
          ⚙ Settings
        </button>
        <button type="button" className="sl-btn sl-btn--ghost" onClick={onMenu}>
          ⌂ Main Menu
        </button>
      </div>
      <dl className="sl-keys sl-keys--compact">
        {CONTROLS.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ================================================================ dialogue */
export function TalkOverlay({ sim, npc, onClose }) {
  const [lines, setLines] = useState(() => [{ who: "npc", text: npc.type === "student" ? greetLine(sim, npc) : npc.type === "teacher" ? `${npc.name} looks up.` : `${npc.name}: How can I help you?` }]);
  const [delta, setDelta] = useState(null);
  const [opts, setOpts] = useState(() => sim.talkOptions(npc));
  const endRef = useRef(null);
  const friend = sim.save.friends[npc.id];
  const isStudent = npc.type === "student";
  const choose = (o) => {
    audio.click();
    const r = sim.talk(npc, o.id);
    setLines((ls) => [...ls, { who: "you", text: o.label }, { who: "npc", text: r.text }]);
    if (r.friend) {
      setDelta({ v: r.friend, k: Date.now() });
      if (r.friend > 0) audio.xp();
    }
    setOpts(sim.talkOptions(npc));
    if (r.end) setTimeout(onClose, 650);
  };
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);
  useEffect(() => {
    const kd = (e) => {
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) {
        const o = opts[Number(m[1]) - 1];
        if (o) {
          e.preventDefault();
          choose(o);
        }
      }
      if (e.code === "Escape" || e.code === "KeyE") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  });
  const tier = friendTier(friend);
  return (
    <div className="sl-card sl-talk">
      <header className="sl-talk__head">
        <div className="sl-talk__avatar">{isStudent ? "🧑‍🎓" : npc.type === "teacher" ? "🧑‍🏫" : "🧑‍💼"}</div>
        <div className="sl-talk__who">
          <h2>{npc.name}</h2>
          <p>{isStudent ? `${PERSONALITIES[npc.pers].name} · ${TIER_NAME[tier]}` : npc.type === "teacher" ? (npc.subject ? `${SUBJECTS[npc.subject].name} teacher` : "Principal") : npc.role}</p>
        </div>
        {isStudent && (
          <div className="sl-talk__friend">
            <span>♥ {Math.round(sim.save.friends[npc.id])}</span>
            <i>
              <b style={{ transform: `scaleX(${sim.save.friends[npc.id] / 100})` }} />
              <em style={{ left: "50%" }} />
            </i>
            {delta && (
              <strong key={delta.k} className={delta.v > 0 ? "is-up" : "is-down"}>
                {delta.v > 0 ? `+${delta.v}` : delta.v} ♥
              </strong>
            )}
          </div>
        )}
      </header>
      <div className="sl-talk__log">
        {lines.map((l, i) => (
          <p key={i} className={`sl-talk__line sl-talk__line--${l.who}`}>
            {l.who === "you" ? <b>You: </b> : null}
            {l.text}
          </p>
        ))}
        <span ref={endRef} />
      </div>
      <div className="sl-talk__opts">
        {opts.map((o, i) => (
          <button key={o.id} type="button" className={`sl-opt${o.id === "end" ? " sl-opt--end" : ""}`} onClick={() => choose(o)}>
            <kbd>{i + 1}</kbd>
            {o.icon} {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
function greetLine(sim, n) {
  const f = sim.save.friends[n.id];
  const t = friendTier(f);
  if (sim.save.favor && sim.save.favor.npc === n.id && sim.favorReady()) return "Did you do what I asked? 😊";
  if (t === "best") return "Hey bestie! What's up?";
  if (t === "friend") return `Oh hi ${sim.save.look.name}!`;
  if (t === "acquaintance") return "Hey! What's up?";
  return n.pers === "shy" ? "…Oh. Hi." : n.pers === "cool" ? "Yeah?" : "Hi there!";
}

/* ================================================================ cafeteria */
export function FoodOverlay({ sim, menu, onClose }) {
  const [msg, setMsg] = useState(null);
  const [, force] = useState(0);
  const list = menu === "vending" ? VENDING : FOOD;
  return (
    <div className="sl-card sl-food">
      <h2>{menu === "vending" ? "🥤 Vending Machine" : "🍽️ Cafeteria Counter"}</h2>
      <p className="sl-dim">
        You have <b className="sl-pts">{sim.save.points} pts</b> · Energy {Math.round(sim.ds.energy)}%{sim.player.carry && sim.player.carry.food ? ` · carrying ${sim.player.carry.name}` : ""}
      </p>
      <div className="sl-food__grid">
        {list.map((f) => (
          <button
            key={f.id}
            type="button"
            className="sl-food__item"
            disabled={sim.save.points < f.cost}
            onClick={() => {
              const r = sim.buyFood(f.id, menu);
              setMsg(r);
              force((n) => n + 1);
              if (r.ok) audio.coin();
              else audio.wrong();
            }}
          >
            <span className="sl-food__icon">{f.icon}</span>
            <b>{f.name}</b>
            <small>
              +{f.energy} energy{f.happy ? ` · +${f.happy} 😊` : ""}
              {f.focus ? " · focus" : ""}
            </small>
            <em>{f.cost} pts</em>
          </button>
        ))}
      </div>
      {msg && <p className={msg.ok ? "sl-good" : "sl-bad"}>{msg.msg}</p>}
      <button type="button" className="sl-btn sl-btn--primary" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

/* ================================================================ map */
export function MapOverlay({ sim, onClose }) {
  const ref = useRef(null);
  const p = sim.player;
  const [floor, setFloor] = useState(p.y > 2.3 ? 1 : p.zone && p.zone.outdoor ? "campus" : 0);
  const nx = sim.nextClass();
  const highlight = nx?.cls.room;
  useEffect(() => {
    let raf = 0;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      const c = ref.current;
      if (c) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = c.clientWidth || 600;
        const h = c.clientHeight || 400;
        if (c.width !== Math.round(w * dpr)) {
          c.width = Math.round(w * dpr);
          c.height = Math.round(h * dpr);
        }
        drawMap(c.getContext("2d"), { sim, w, h, scale: dpr, floor, view: "full", t: performance.now() / 1000, highlight });
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    const id = setInterval(() => !document.hidden || draw(), 500);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [sim, floor, highlight]);
  const here = sim.player.zone?.name || "Campus";
  return (
    <div className="sl-card sl-map">
      <header className="sl-map__head">
        <h2>🗺 School Map</h2>
        <div className="sl-seg">
          <button type="button" className={floor === "campus" ? "is-on" : ""} onClick={() => setFloor("campus")}>
            Grounds
          </button>
          <button type="button" className={floor === 0 ? "is-on" : ""} onClick={() => setFloor(0)}>
            Ground floor
          </button>
          <button type="button" className={floor === 1 ? "is-on" : ""} onClick={() => setFloor(1)}>
            First floor
          </button>
        </div>
        <button type="button" className="sl-x" onClick={onClose} aria-label="Close map">
          ✕
        </button>
      </header>
      <div className="sl-map__body">
        <canvas ref={ref} className="sl-map__canvas" />
        <aside className="sl-map__side">
          <p>
            📍 You are in: <b>{here}</b>
            {p.y > 2.3 ? " (1st floor)" : ""}
          </p>
          {nx && nx.cls.room && (
            <p>
              ⭐ Next class: <b>{subjectInfo(nx.cls.subject).name}</b> — {roomById(nx.cls.room).name} ({roomById(nx.cls.room).f === 1 ? "1st floor" : "ground floor"}) at {fmtTime(nx.block.start)}
            </p>
          )}
          <ul className="sl-legend">
            <li><i style={{ background: "#ff4d6d" }} /> You</li>
            <li><i style={{ background: "#ffd23f" }} /> Objective / missions</li>
            <li><i style={{ background: "#4dff88" }} /> Friends</li>
            <li><i style={{ background: "#ffffff" }} /> Classmates</li>
            <li><i style={{ background: "#ff9f1c" }} /> Teachers</li>
          </ul>
          <h3>Key places</h3>
          <ul className="sl-places">
            <li>Ground: Rooms 101–103, Cafeteria, Lockers, Restrooms, Nurse, Music, Teachers' Lounge, Gym (east)</li>
            <li>1st floor: History 201, Library, Computer Room, Science Lab, Study 202, Principal, Art, Clubs, Lounge</li>
            <li>Stairs at both ends of the hallway (north side)</li>
            <li>Outside: Courtyard & court (north), Garden, Football field & track, Main gate (south)</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

/* ================================================================ profile */
export function ProfileOverlay({ sim, onClose }) {
  const [tab, setTab] = useState("overview");
  const S = sim.save;
  const ac = sim.academics();
  const need = xpToNext(S.level);
  return (
    <div className="sl-card sl-profile">
      <header className="sl-map__head">
        <h2>🎓 {S.look.name}</h2>
        <div className="sl-seg">
          {[["overview", "Overview"], ["grades", "Grades"], ["friends", "Friends"], ["unlocks", "Unlocks"]].map(([k, t]) => (
            <button key={k} type="button" className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
              {t}
            </button>
          ))}
        </div>
        <button type="button" className="sl-x" onClick={onClose} aria-label="Close profile">
          ✕
        </button>
      </header>
      {tab === "overview" && (
        <div className="sl-profile__grid">
          <div className="sl-stat sl-stat--wide">
            <span>Level {S.level}{S.level >= MAX_LEVEL ? " (max)" : ""}</span>
            <i>
              <b style={{ transform: `scaleX(${S.level >= MAX_LEVEL ? 1 : S.xp / need})` }} />
            </i>
            <small>{S.level >= MAX_LEVEL ? `${S.totalXp} XP total` : `${Math.floor(S.xp)} / ${need} XP to level ${S.level + 1}`}</small>
          </div>
          <StatBox label="Academics" value={ac == null ? "—" : `${Math.round(ac)} (${letter(ac)})`} bar={ac ?? 0} color="#4f8cff" />
          <StatBox label="Reputation" value={Math.round(S.rep)} bar={S.rep} color="#f2b20f" />
          <StatBox label="Energy" value={`${Math.round(sim.ds.energy)}%`} bar={sim.ds.energy} color="#2fbf71" />
          <StatBox label="Happiness" value={Math.round(S.happy)} bar={S.happy} color="#ff7a59" />
          <StatBox label="Attendance" value={`${Math.round(sim.attendancePct())}%`} bar={sim.attendancePct()} color="#8b5cf6" sub={`${S.att.attended}/${S.att.total} classes · ${S.att.late} late`} />
          <StatBox label="Friends" value={`${sim.friendsCount()} / ${STUDENTS.length}`} bar={(sim.friendsCount() / STUDENTS.length) * 100} color="#e0457b" />
          <StatBox label="School points" value={`${S.points} pts`} />
          <StatBox label="School day" value={`Day ${S.day} · ${dayName(S.day)}`} />
          <StatBox label="Missions" value={`${Object.keys(S.missions).length} / ${MISSIONS.length}`} bar={(Object.keys(S.missions).length / MISSIONS.length) * 100} color="#22b3c9" />
        </div>
      )}
      {tab === "grades" && (
        <div className="sl-grades">
          {SUBJECT_ORDER.map((s) => {
            const avg = sim.subjectAverage(s);
            const marks = S.grades[s].slice(-8);
            return (
              <div key={s} className="sl-grades__row">
                <span className="sl-grades__subj">
                  {SUBJECTS[s].icon} {SUBJECTS[s].name}
                </span>
                <span className="sl-grades__avg" style={{ color: avg == null ? undefined : LETTER_COLOR[letter(avg)] }}>
                  {avg == null ? "—" : `${letter(avg)} · ${Math.round(avg)}`}
                </span>
                <span className="sl-grades__marks">
                  {marks.length ? marks.map((m, i) => (
                    <em key={i} title={`${m.kind} · day ${m.day}`} style={{ background: LETTER_COLOR[letter(m.score)] }}>
                      {m.kind === "exam" ? "E" : m.kind === "homework" ? "H" : m.kind === "absent" ? "–" : m.kind === "study" ? "s" : "L"}
                      {Math.round(m.score)}
                    </em>
                  )) : <i className="sl-dim">no marks yet</i>}
                </span>
              </div>
            );
          })}
          <p className="sl-dim">L = lesson · H = homework · E = exam (counts most) · s = study · – = absent</p>
          {S.exams.length > 0 && (
            <p>
              Exams: {S.exams.slice(-5).map((e, i) => (
                <b key={i} style={{ color: LETTER_COLOR[e.grade], marginRight: 8 }}>
                  Day {e.day}: {e.grade} ({e.score})
                </b>
              ))}
            </p>
          )}
        </div>
      )}
      {tab === "friends" && (
        <div className="sl-friends">
          {STUDENTS.slice()
            .sort((a, b) => S.friends[b.id] - S.friends[a.id])
            .map((st) => {
              const v = S.friends[st.id];
              return (
                <div key={st.id} className="sl-friends__row">
                  <span>
                    <b>{st.name}</b>
                    <small> · {PERSONALITIES[st.pers].name}{S.met[st.id] ? "" : " · not met yet"}</small>
                  </span>
                  <i>
                    <b style={{ transform: `scaleX(${v / 100})`, background: v >= 50 ? "#2fbf71" : v >= 30 ? "#f2b20f" : "#9aa3b2" }} />
                  </i>
                  <em>{TIER_NAME[friendTier(v)]} · {Math.round(v)}</em>
                </div>
              );
            })}
          {S.favor && (
            <p className="sl-good">
              🤝 Favour for {STUDENTS.find((s) => s.id === S.favor.npc)?.name}: {S.favor.kind === "snack" ? "bring them any food from the cafeteria" : S.favor.kind === "baskets" ? "score 6 baskets in a shootout" : "finish a study session"} — then talk to them and pick the favour option.
            </p>
          )}
        </div>
      )}
      {tab === "unlocks" && (
        <div className="sl-unlocks">
          {Object.entries(LEVEL_UNLOCKS).map(([lv, items]) => (
            <div key={lv} className={`sl-unlocks__row${S.level >= Number(lv) ? " is-on" : ""}`}>
              <b>Level {lv}</b>
              <span>{items.join(" · ")}</span>
              <em>{S.level >= Number(lv) ? "✓ Unlocked" : "🔒"}</em>
            </div>
          ))}
          <p className="sl-dim">Activities: {Object.values(ACTIVITIES).map((a) => `${a.icon} ${a.name} (Lv ${a.level})`).join(" · ")}</p>
        </div>
      )}
    </div>
  );
}
function StatBox({ label, value, bar, color, sub }) {
  return (
    <div className="sl-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {bar != null && (
        <i>
          <b style={{ transform: `scaleX(${Math.max(0, Math.min(1, bar / 100))})`, background: color }} />
        </i>
      )}
      {sub && <small>{sub}</small>}
    </div>
  );
}

/* ================================================================ journal */
export function JournalOverlay({ sim, onClose, onEndDay }) {
  const [tab, setTab] = useState("missions");
  const S = sim.save;
  const ob = sim.objective();
  const missions = MISSIONS.filter((m) => !m.level || S.level >= m.level);
  const lockedSpecial = MISSIONS.filter((m) => m.level && S.level < m.level);
  const hw = S.homework.slice().reverse();
  const ex = nextExamDay(S.day);
  return (
    <div className="sl-card sl-journal">
      <header className="sl-map__head">
        <h2>📓 Journal</h2>
        <div className="sl-seg">
          {[["missions", "Missions"], ["homework", "Homework"], ["schedule", "Schedule & exams"]].map(([k, t]) => (
            <button key={k} type="button" className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
              {t}
            </button>
          ))}
        </div>
        <button type="button" className="sl-x" onClick={onClose} aria-label="Close journal">
          ✕
        </button>
      </header>
      {ob && (
        <div className="sl-journal__now">
          <b>Now:</b> {ob.title} — <span className="sl-dim">{ob.desc}</span>
        </div>
      )}
      {tab === "missions" && (
        <div className="sl-missions">
          {missions.map((m) => {
            const done = S.missions[m.id] != null;
            const [have, need] = sim.missionProgress(m.id);
            return (
              <div key={m.id} className={`sl-mission${done ? " is-done" : ""}${m.special ? " is-special" : ""}`}>
                <span className="sl-mission__check">{done ? "✓" : m.special ? "★" : "○"}</span>
                <div>
                  <b>{m.title}</b>
                  <p>{m.desc}</p>
                  {!done && need > 1 && (
                    <i className="sl-mission__bar">
                      <b style={{ transform: `scaleX(${Math.min(1, have / need)})` }} />
                      <em>{have}/{need}</em>
                    </i>
                  )}
                </div>
                <small>{done ? `Day ${S.missions[m.id]}` : `+${m.xp} XP · +${m.pts} pts`}</small>
              </div>
            );
          })}
          {lockedSpecial.map((m) => (
            <div key={m.id} className="sl-mission is-locked">
              <span className="sl-mission__check">🔒</span>
              <div>
                <b>{m.title}</b>
                <p>Special mission — unlocks at level {m.level}.</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === "homework" && (
        <div className="sl-hw">
          {hw.length ? (
            <ul className="sl-list">
              {hw.map((h) => (
                <li key={h.id} className={`sl-hw__row is-${h.status}`}>
                  <span>
                    {SUBJECTS[h.subject].icon} <b>{SUBJECTS[h.subject].name}</b> — {h.desc}
                  </span>
                  <em>
                    {h.status === "open" ? (h.due === S.day ? "⚠ due TODAY" : `due day ${h.due}`) : h.status === "done" ? `✓ done · ${h.score} (${letter(h.score)})` : "✗ missed"}
                  </em>
                  <small>
                    +{h.xp} XP · +{h.pts} pts
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sl-dim">No homework yet — teachers hand it out after each lesson.</p>
          )}
          <p className="sl-dim">Complete homework at a library table, the Study Room (202) or any study station: sit (F), then press E.</p>
        </div>
      )}
      {tab === "schedule" && (
        <div className="sl-sched">
          <h3>
            Today — Day {S.day} ({dayName(S.day)})
          </h3>
          <ul className="sl-list">
            {BLOCKS.filter((b) => b.kind !== "pass").map((b) => {
              const c = b.kind === "class" ? sim.ds.classes[b.slot] : null;
              const info = c ? subjectInfo(c.subject) : null;
              const now = sim.time >= b.start && sim.time < b.end;
              return (
                <li key={b.id} className={now ? "is-now" : ""}>
                  <span>
                    <b>{fmtTime(b.start)}</b> {c ? `${info.icon} ${info.name}` : b.label}
                    {c && c.room ? <em className="sl-dim"> · {roomById(c.room).short}</em> : null}
                  </span>
                  <em>{c ? statusLabel(c) : ""}</em>
                </li>
              );
            })}
          </ul>
          <h3>Upcoming exam</h3>
          <p>
            📝 Day {ex} ({dayName(ex)}) at 11:00 in the Exam Hall (Room 103) — {examSubjects(ex).map((s) => SUBJECTS[s].name).join(", ")}.
            {ex === S.day ? " That's today!" : ""}
          </p>
          <h3>Tomorrow</h3>
          <p className="sl-dim">{daySchedule(S.day + 1).map((s) => subjectInfo(s).name).join(" · ")}</p>
        </div>
      )}
      {sim.time >= 900 && !sim.dayOver && (
        <button type="button" className="sl-btn sl-btn--primary" onClick={onEndDay}>
          🏁 End the school day
        </button>
      )}
    </div>
  );
}
export function statusLabel(c) {
  if (c.subject === "activities") return c.status === "done" ? "✓" : "free choice";
  switch (c.status) {
    case "done":
      return `✓ ${c.grade} (${c.score})${c.late ? " · late" : ""}`;
    case "ontime":
      return "in class";
    case "late":
      return "in class (late)";
    case "absent":
      return "✗ absent";
    case "skipped":
      return "✗ left early";
    case "open":
      return "now";
    default:
      return "";
  }
}

/* ================================================================ day report */
export function DayReport({ summary, sim, onNext, onMenu }) {
  const s = summary;
  const missionsT = s.missions.map((id) => MISSIONS.find((m) => m.id === id)?.title).filter(Boolean);
  return (
    <div className="sl-card sl-report">
      <h2>🏁 Day {s.day} Report</h2>
      <p className="sl-dim">{dayName(s.day)} · {s.why === "gate" ? "You headed home through the gate." : "The school day is over."}</p>
      <div className="sl-report__grid">
        <div>
          <h3>Classes</h3>
          <ul className="sl-list">
            {s.classes.map((c, i) => (
              <li key={i}>
                <span>
                  {subjectInfo(c.subject).icon} {subjectInfo(c.subject).name}
                </span>
                <em style={{ color: c.grade ? LETTER_COLOR[c.grade] : undefined }}>{statusLabel(c)}</em>
              </li>
            ))}
          </ul>
          <p>
            Attendance today: <b>{s.attended}/{s.total}</b>
          </p>
        </div>
        <div className="sl-report__rewards">
          <h3>Rewards</h3>
          <div className="sl-report__big">+{s.xp} XP</div>
          <p>
            Points: <b>{s.points >= 0 ? `+${s.points}` : s.points}</b> · Level {s.levelFrom}
            {s.levelTo > s.levelFrom ? ` → ${s.levelTo} 🎉` : ""}
          </p>
          <p>
            Reputation: {s.repFrom} → <b>{s.repTo}</b> · Friends: <b>{s.friends}</b>
          </p>
          <p>Academic average: <b>{s.academics == null ? "—" : `${Math.round(s.academics)} (${letter(s.academics)})`}</b></p>
          <h3>Missions completed</h3>
          {missionsT.length ? (
            <ul className="sl-bullets">
              {missionsT.map((t) => (
                <li key={t}>✓ {t}</li>
              ))}
            </ul>
          ) : (
            <p className="sl-dim">None today.</p>
          )}
          {s.homeworkDue > 0 && <p className="sl-bad">📝 {s.homeworkDue} homework assignment(s) still open — check the deadlines!</p>}
        </div>
      </div>
      <div className="sl-row">
        <button type="button" className="sl-btn sl-btn--primary sl-btn--big" onClick={onNext} autoFocus>
          Start Day {s.day + 1} →
        </button>
        <button type="button" className="sl-btn sl-btn--ghost" onClick={onMenu}>
          Main Menu
        </button>
      </div>
      <p className="sl-dim">Progress is saved. Next up: {daySchedule(s.day + 1).map((x) => subjectInfo(x).short).join(" · ")}{isExamDay(s.day + 1) ? " (exam day!)" : ""}</p>
    </div>
  );
}
