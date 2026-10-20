/**
 * Haunted Mansion Escape — puzzle modal bodies. Each keeps a local draft and
 * submits it through `submit(answer)`, which asks the engine (the only judge)
 * and returns true/false. None of these components knows an answer.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ITEMS, BOOKS_START, DINING_SEATS, DINING_OBJECTS, MUSICBOX_SYMBOLS, NOTES, GALLERY, GALLERY_START, GEAR_SYMBOLS, GEAR_START, GEAR_LINKS, ALTAR_SOCKETS, RELICS, CIRCUIT } from "./data.js";
import { circuitFlow, gearsAfter, rotMask } from "./engine.js";
import { paintingURL, SIGN_GLYPH } from "./art.js";

const BOOK_HEX = { red: "#8e1f22", blue: "#1f3f86", green: "#21603a", gold: "#b8892a", black: "#1c191f" };
const SIGN_NAME = { crown: "Crown", rose: "Rose", moon: "Moon", star: "Star", bird: "Bird", heart: "Heart", key: "Key", owl: "Owl", eye: "Eye" };
const swapAt = (arr, i, j) => {
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
};
const wrap = (v, n) => ((v % n) + n) % n;

function Wheel({ value, onUp, onDown, label, wide }) {
  return (
    <div className={`hme-wheel${wide ? " is-wide" : ""}`}>
      <button type="button" className="hme-wheel__btn" onClick={onUp} aria-label={`${label} up`}>▲</button>
      <div className="hme-wheel__val" key={value}>{value}</div>
      <button type="button" className="hme-wheel__btn" onClick={onDown} aria-label={`${label} down`}>▼</button>
    </div>
  );
}

/* 1 · clock --------------------------------------------------------------- */
export function ClockPuzzle({ submit, sfx }) {
  const [h, setH] = useState(3);
  const [m, setM] = useState(40);
  const hourA = ((h % 12) + m / 60) * 30, minA = m * 6;
  const roman = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  const turn = (fn) => {
    sfx("tick");
    fn();
  };
  return (
    <div className="hme-pz hme-pz--clock">
      <svg viewBox="-110 -110 220 220" className="hme-clock">
        <circle r="104" fill="#2a160c" />
        <circle r="96" fill="#ece2c8" />
        {roman.map((t, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          return <text key={t} x={Math.cos(a) * 76} y={Math.sin(a) * 76 + 5} textAnchor="middle" className="hme-clock__num">{t}</text>;
        })}
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const r0 = i % 5 ? 90 : 86;
          return <line key={i} x1={Math.sin(a) * r0} y1={-Math.cos(a) * r0} x2={Math.sin(a) * 94} y2={-Math.cos(a) * 94} stroke="#1a1410" strokeWidth={i % 5 ? 1 : 2} />;
        })}
        <line className="hme-clock__hand" style={{ transform: `rotate(${hourA}deg)` }} x1="0" y1="10" x2="0" y2="-50" stroke="#111" strokeWidth="6" strokeLinecap="round" />
        <line className="hme-clock__hand" style={{ transform: `rotate(${minA}deg)` }} x1="0" y1="14" x2="0" y2="-78" stroke="#111" strokeWidth="3.5" strokeLinecap="round" />
        <circle r="6" fill="#b8892a" />
      </svg>
      <div className="hme-row">
        <div className="hme-ctl">
          <span>Hour hand</span>
          <div>
            <button type="button" onClick={() => turn(() => setH((v) => wrap(v - 1, 12)))}>⟲</button>
            <button type="button" onClick={() => turn(() => setH((v) => wrap(v + 1, 12)))}>⟳</button>
          </div>
        </div>
        <div className="hme-ctl">
          <span>Minute hand</span>
          <div>
            <button type="button" onClick={() => turn(() => setM((v) => wrap(v - 5, 60)))}>⟲</button>
            <button type="button" onClick={() => turn(() => setM((v) => wrap(v + 5, 60)))}>⟳</button>
          </div>
        </div>
      </div>
      <button type="button" className="hme-btn hme-btn--gold" onClick={() => submit({ h: h === 0 ? 12 : h, m })}>Set the time</button>
    </div>
  );
}

/* 2 · books --------------------------------------------------------------- */
export function BooksPuzzle({ submit, sfx }) {
  const [order, setOrder] = useState(BOOKS_START);
  const [sel, setSel] = useState(-1);
  const click = (i) => {
    sfx("click");
    if (sel < 0) return setSel(i);
    if (sel !== i) setOrder((o) => swapAt(o, sel, i));
    setSel(-1);
  };
  return (
    <div className="hme-pz">
      <p className="hme-pz__lead">Click two volumes to swap them.</p>
      <div className="hme-books">
        {order.map((c, i) => (
          <button type="button" key={c} className={`hme-book${sel === i ? " is-sel" : ""}`} style={{ "--book": BOOK_HEX[c] }} onClick={() => click(i)}>
            <span className="hme-book__band" />
            <span className="hme-book__title">{c}</span>
            <span className="hme-book__band" />
          </button>
        ))}
      </div>
      <button type="button" className="hme-btn hme-btn--gold" onClick={() => submit(order)}>Pull the volumes</button>
    </div>
  );
}

/* 3 · dining -------------------------------------------------------------- */
function Placement({ slots, objects, inv, submit, sfx, verb, missingText, glyphs }) {
  const [place, setPlace] = useState({});
  const [sel, setSel] = useState(null);
  const held = objects.filter((o) => inv.includes(o));
  const tray = held.filter((o) => !Object.values(place).includes(o));
  const clickSlot = (k) => {
    sfx("click");
    if (sel) {
      setPlace((p) => {
        const n = { ...p };
        for (const s of Object.keys(n)) if (n[s] === sel) delete n[s];
        n[k] = sel;
        return n;
      });
      setSel(null);
    } else if (place[k]) {
      setPlace((p) => {
        const n = { ...p };
        delete n[k];
        return n;
      });
    }
  };
  const full = slots.every((k) => place[k]);
  return (
    <div className="hme-pz">
      <div className="hme-slots">
        {slots.map((k) => (
          <button type="button" key={k} className={`hme-slot${place[k] ? " is-full" : ""}${sel ? " is-target" : ""}`} onClick={() => clickSlot(k)}>
            <span className="hme-slot__sign">{glyphs[k]}</span>
            <span className="hme-slot__name">{SIGN_NAME[k]}</span>
            <span className="hme-slot__obj">{place[k] ? ITEMS[place[k]].icon : "—"}</span>
          </button>
        ))}
      </div>
      <div className="hme-tray">
        {tray.map((o) => (
          <button type="button" key={o} className={`hme-tray__item${sel === o ? " is-sel" : ""}`} onClick={() => (sfx("click"), setSel(sel === o ? null : o))}>
            <span>{ITEMS[o].icon}</span>
            <small>{ITEMS[o].name}</small>
          </button>
        ))}
        {held.length < objects.length && <p className="hme-pz__warn">{missingText(objects.length - held.length)}</p>}
        {!tray.length && held.length === objects.length && <p className="hme-pz__lead">Click a placed object to take it back.</p>}
      </div>
      <button type="button" className="hme-btn hme-btn--gold" disabled={!full} onClick={() => submit(place)}>{verb}</button>
    </div>
  );
}
export function DiningPuzzle(props) {
  return <Placement {...props} slots={DINING_SEATS} objects={DINING_OBJECTS} glyphs={SIGN_GLYPH} verb="Set the table" missingText={(n) => `You still need ${n} more piece${n > 1 ? "s" : ""} of tableware. Search the room.`} />;
}
export function AltarPuzzle(props) {
  return <Placement {...props} slots={ALTAR_SOCKETS} objects={RELICS} glyphs={SIGN_GLYPH} verb="Return the relics" missingText={(n) => `${n} relic${n > 1 ? "s are" : " is"} missing.`} />;
}

/* 4 · mirror -------------------------------------------------------------- */
const MIRROR_LINES = ["MY SONG BOX SLEEPS ON", "MOON · ROSE · BIRD", "REMEMBER ME —", "MY NAME OPENS THE LAST DOOR", "— CLARA"];
export function MirrorPuzzle() {
  const ref = useRef(null);
  const [lens, setLens] = useState({ x: 50, y: 50, on: false });
  const move = (e) => {
    const r = ref.current.getBoundingClientRect();
    setLens({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100, on: true });
  };
  const text = MIRROR_LINES.map((l) => <div key={l}>{l}</div>);
  return (
    <div className="hme-pz">
      <p className="hme-pz__lead">Move the hand mirror over the scratches to read them.</p>
      <div ref={ref} className="hme-mirror" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setLens((l) => ({ ...l, on: false }))}>
        <div className="hme-mirror__text is-reversed">{text}</div>
        <div className="hme-mirror__lens" style={{ clipPath: `circle(${lens.on ? 22 : 0}% at ${lens.x}% ${lens.y}%)` }}>
          <div className="hme-mirror__text">{text}</div>
        </div>
        <div className="hme-mirror__ring" style={{ left: `${lens.x}%`, top: `${lens.y}%`, opacity: lens.on ? 1 : 0 }} />
      </div>
      <p className="hme-pz__note">The message has been copied into your journal.</p>
    </div>
  );
}

/* 4 · music box ----------------------------------------------------------- */
export function MusicBoxPuzzle({ submit, sfx }) {
  const [d, setD] = useState([3, 4, 5]);
  const turn = (i, k) => {
    sfx("click");
    setD((v) => v.map((x, j) => (j === i ? wrap(x + k, MUSICBOX_SYMBOLS.length) : x)));
  };
  return (
    <div className="hme-pz">
      <p className="hme-pz__lead">Three enamel dials under a dancing figure.</p>
      <div className="hme-row">
        {d.map((v, i) => (
          <Wheel key={i} label={`Dial ${i + 1}`} wide value={<span className="hme-sym">{SIGN_GLYPH[MUSICBOX_SYMBOLS[v]]}<small>{SIGN_NAME[MUSICBOX_SYMBOLS[v]]}</small></span>} onUp={() => turn(i, 1)} onDown={() => turn(i, -1)} />
        ))}
      </div>
      <button type="button" className="hme-btn hme-btn--gold" onClick={() => submit(d.map((v) => MUSICBOX_SYMBOLS[v]))}>Wind the box</button>
    </div>
  );
}

/* 5 · safe ---------------------------------------------------------------- */
export function SafePuzzle({ submit, sfx }) {
  const [d, setD] = useState([0, 0, 0, 0]);
  const turn = (i, k) => {
    sfx("tick");
    setD((v) => v.map((x, j) => (j === i ? wrap(x + k, 10) : x)));
  };
  return (
    <div className="hme-pz">
      <div className="hme-safe">
        {d.map((v, i) => <Wheel key={i} label={`Digit ${i + 1}`} value={v} onUp={() => turn(i, 1)} onDown={() => turn(i, -1)} />)}
      </div>
      <button type="button" className="hme-btn hme-btn--gold" onClick={() => submit(d.join(""))}>Turn the handle</button>
    </div>
  );
}

/* 6 · piano --------------------------------------------------------------- */
const BLACK = [["C#", 0], ["D#", 1], ["F#", 3], ["G#", 4], ["A#", 5]];
export function PianoPuzzle({ submit, note, inv }) {
  const [seq, setSeq] = useState([]);
  const [lit, setLit] = useState(null);
  const play = (n) => {
    note(n);
    setLit(n);
    setTimeout(() => setLit((l) => (l === n ? null : l)), 220);
    const next = [...seq, n].slice(-12);
    setSeq(next);
    if (next.length >= 7) submit(next, { quiet: true });
  };
  useEffect(() => {
    const keys = { a: "C", s: "D", d: "E", f: "F", g: "G", h: "A", j: "B", k: "C2", w: "C#", e: "D#", t: "F#", y: "G#", u: "A#" };
    const down = (e) => {
      if (e.repeat || !keys[e.key.toLowerCase()]) return;
      play(keys[e.key.toLowerCase()]);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });
  const label = (n) => (n === "C2" ? "C" : n);
  return (
    <div className="hme-pz">
      {inv.includes("sheetMusic") ? (
        <div className="hme-sheet">
          <span className="hme-sheet__title">Clara's Lullaby</span>
          <div className="hme-sheet__notes">
            {["C", "E", "G", "A", "?", "?", "?"].map((n, i) => (
              <span key={i} className={n === "?" ? "is-smudge" : ""}>{n === "?" ? "♪" : n}</span>
            ))}
          </div>
        </div>
      ) : (
        <p className="hme-pz__lead">The music stand is empty. Perhaps the music was locked away somewhere.</p>
      )}
      <div className="hme-piano">
        {NOTES.map((n) => (
          <button type="button" key={n} className={`hme-key${lit === n ? " is-lit" : ""}`} onPointerDown={() => play(n)}>
            <span>{label(n)}</span>
          </button>
        ))}
        {BLACK.map(([n, i]) => (
          <button type="button" key={n} className={`hme-key hme-key--black${lit === n ? " is-lit" : ""}`} style={{ left: `calc(${((i + 1) / NOTES.length) * 100}% - 3.2%)` }} onPointerDown={() => play(n)} aria-label={n} />
        ))}
      </div>
      <div className="hme-trail">
        {seq.slice(-7).map((n, i) => <span key={i + n + seq.length}>{label(n)}</span>)}
        {!seq.length && <em>Play the melody…</em>}
      </div>
      <p className="hme-pz__note">Keyboard: A S D F G H J K for the white keys.</p>
    </div>
  );
}

/* 7 · circuit ------------------------------------------------------------- */
const BASE = { straight: 5, corner: 3, tee: 7, cross: 15, empty: 0 };
export function CircuitPuzzle({ submit, sfx }) {
  const [rots, setRots] = useState(CIRCUIT.start);
  const flow = useMemo(() => circuitFlow(rots), [rots]);
  const done = useRef(false);
  useEffect(() => {
    if (flow.done && !done.current) {
      done.current = true;
      setTimeout(() => submit(rots), 500);
    }
  }, [flow.done, rots, submit]);
  const rotate = (r, c) => {
    if (done.current) return;
    sfx("click");
    setRots((v) => v.map((row, i) => row.map((x, j) => (i === r && j === c ? (x + 1) % 4 : x))));
  };
  const S = 60;
  const arm = { 1: [0, -30], 2: [30, 0], 4: [0, 30], 8: [-30, 0] };
  return (
    <div className="hme-pz">
      <p className="hme-pz__lead">Click tiles to rotate them. Join the dynamo to the house line.</p>
      <svg viewBox={`-50 -10 ${CIRCUIT.cols * S + 100} ${CIRCUIT.rows * S + 20}`} className="hme-circuit">
        <g transform={`translate(-40 ${CIRCUIT.inRow * S + 10})`}>
          <rect width="36" height="40" rx="6" fill="#2e4a36" stroke="#9fd3c7" />
          <text x="18" y="25" textAnchor="middle" fill="#ffe08a" fontSize="16">⚡</text>
        </g>
        <g transform={`translate(${CIRCUIT.cols * S + 4} ${CIRCUIT.outRow * S + 10})`}>
          <rect width="36" height="40" rx="6" fill={flow.done ? "#ffe08a" : "#3a2a1a"} stroke="#e0b45a" />
          <text x="18" y="26" textAnchor="middle" fontSize="16">🏠</text>
        </g>
        {CIRCUIT.tiles.map((row, r) =>
          row.map((kind, c) => {
            const m = rotMask(BASE[kind], rots[r][c]);
            const on = flow.lit[r][c];
            return (
              <g key={`${r}-${c}`} transform={`translate(${c * S + 30} ${r * S + 30})`} onClick={() => rotate(r, c)} className="hme-tile">
                <rect x="-28" y="-28" width="56" height="56" rx="6" className={on ? "is-on" : ""} />
                {[1, 2, 4, 8].filter((b) => m & b).map((b) => (
                  <line key={b} x1="0" y1="0" x2={arm[b][0]} y2={arm[b][1]} className={`hme-wire${on ? " is-on" : ""}`} />
                ))}
                <circle r="6" className={`hme-node${on ? " is-on" : ""}`} />
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}

/* 8 · gallery ------------------------------------------------------------- */
export function GalleryPuzzle({ submit, sfx }) {
  const [order, setOrder] = useState(GALLERY_START);
  const [sel, setSel] = useState(-1);
  const urls = useMemo(() => Object.fromEntries(GALLERY.map((p) => [p.id, paintingURL(p.id)])), []);
  const byId = Object.fromEntries(GALLERY.map((p) => [p.id, p]));
  const click = (i) => {
    sfx("click");
    if (sel < 0) return setSel(i);
    if (sel !== i) setOrder((o) => swapAt(o, sel, i));
    setSel(-1);
  };
  return (
    <div className="hme-pz">
      <p className="hme-pz__lead">Click two paintings to swap them. Slots run left to right, I – V.</p>
      <div className="hme-gallery">
        {order.map((id, i) => (
          <button type="button" key={id} className={`hme-paint${sel === i ? " is-sel" : ""}`} onClick={() => click(i)}>
            <span className="hme-paint__slot">{["I", "II", "III", "IV", "V"][i]}</span>
            <img src={urls[id]} alt={byId[id].title} draggable="false" />
            <strong>{byId[id].title}</strong>
            <small>{byId[id].caption}</small>
          </button>
        ))}
      </div>
      <button type="button" className="hme-btn hme-btn--gold" onClick={() => submit(order)}>Straighten the frames</button>
    </div>
  );
}

/* 9 · gears --------------------------------------------------------------- */
export function GearsPuzzle({ submit, sfx }) {
  const [presses, setPresses] = useState([]);
  const rings = gearsAfter(GEAR_START, presses);
  const turns = [0, 1, 2].map((i) => presses.filter((l) => GEAR_LINKS[l].includes(i)).length);
  const N = GEAR_SYMBOLS.length;
  return (
    <div className="hme-pz">
      <p className="hme-pz__lead">Each lever turns its own ring — and the gear beside it. The top of each ring shows its symbol.</p>
      <div className="hme-gears">
        {[0, 1, 2].map((i) => (
          <div key={i} className="hme-gear">
            <div className="hme-gear__window">{SIGN_GLYPH[GEAR_SYMBOLS[rings[i]]]}<small>{SIGN_NAME[GEAR_SYMBOLS[rings[i]]]}</small></div>
            <svg viewBox="-60 -60 120 120" className="hme-gear__ring">
              <g style={{ transform: `rotate(${-(GEAR_START[i] + turns[i]) * (360 / N)}deg)` }} className="hme-gear__rot">
                <circle r="52" className="hme-gear__teeth" />
                <circle r="44" fill="#3a2a18" stroke="#b8892a" strokeWidth="2" />
                {GEAR_SYMBOLS.map((s, k) => {
                  const a = ((k * 360) / N - 90) * (Math.PI / 180);
                  return <text key={s} x={Math.cos(a) * 30} y={Math.sin(a) * 30 + 6} textAnchor="middle" fontSize="16" fill="#efe2c0" style={{ transform: `rotate(${(k * 360) / N}deg)`, transformOrigin: `${Math.cos(a) * 30}px ${Math.sin(a) * 30}px` }}>{SIGN_GLYPH[s]}</text>;
                })}
              </g>
              <path d="M -6 -60 L 6 -60 L 0 -50 Z" fill="#ffd27a" />
            </svg>
            <button type="button" className="hme-lever" onClick={() => (sfx("click"), setPresses((p) => [...p, i]))}>
              Lever {i + 1}
              <small>{GEAR_LINKS[i].length > 1 ? `turns ${i + 1} & ${i + 2}` : `turns ${i + 1}`}</small>
            </button>
          </div>
        ))}
      </div>
      <div className="hme-row">
        <button type="button" className="hme-btn" onClick={() => (sfx("click"), setPresses([]))}>Reset rings</button>
        <button type="button" className="hme-btn hme-btn--gold" onClick={() => submit(rings)}>Open the chest</button>
      </div>
    </div>
  );
}

/* 10 · exit --------------------------------------------------------------- */
const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function ExitPuzzle({ submit, sfx }) {
  const [w, setW] = useState([0, 0, 0, 0, 0]);
  const turn = (i, k) => {
    sfx("tick");
    setW((v) => v.map((x, j) => (j === i ? wrap(x + k, 26) : x)));
  };
  return (
    <div className="hme-pz">
      <p className="hme-pz__lead">"NAME THE ONE WHO NEVER LEFT."</p>
      <div className="hme-safe hme-safe--letters">
        {w.map((v, i) => <Wheel key={i} label={`Ring ${i + 1}`} value={AZ[v]} onUp={() => turn(i, 1)} onDown={() => turn(i, -1)} />)}
      </div>
      <button type="button" className="hme-btn hme-btn--gold" onClick={() => submit(w.map((v) => AZ[v]).join(""))}>Speak the name</button>
    </div>
  );
}

export const PUZZLE_UI = {
  clock: ClockPuzzle,
  books: BooksPuzzle,
  dining: DiningPuzzle,
  mirror: MirrorPuzzle,
  musicbox: MusicBoxPuzzle,
  safe: SafePuzzle,
  piano: PianoPuzzle,
  circuit: CircuitPuzzle,
  gallery: GalleryPuzzle,
  gears: GearsPuzzle,
  altar: AltarPuzzle,
  exit: ExitPuzzle,
};
