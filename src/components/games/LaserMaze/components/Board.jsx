/**
 * Laser Maze — the SVG puzzle board.
 *
 * Renders exactly what `trace` (engine/trace.js) says: beam segments,
 * impact sparks, lit/wrong targets, powered switches, open gates. It never
 * computes a path of its own.
 *
 * Layer order (bottom → top): frame & floor, walls, static mechanisms,
 * beams, mirrors/splitters, sources & targets, effects, hit areas. Static
 * layers are memoized on (level, world, graphics) so a mirror click only
 * re-renders beams and dynamic pieces.
 *
 * Coordinates: one cell = 100 SVG units. The SVG scales to its container
 * via viewBox, so fullscreen/resizing never changes hit-testing — the
 * browser maps pointer events onto the real elements.
 */
import { memo, useMemo } from "react";
import { COLORS, colorOf } from "../engine/constants.js";
import {
  WallLayer, wallGradients, Source, Target, MirrorBody, Prism, Filter, Portal,
  Switch, Gate, Slot, Crank, Shutter, portalColors,
} from "./pieces.jsx";

const PAD = 34;

const GLOW = {
  soft: { w: 14, o: 0.14, mid: 7 },
  normal: { w: 24, o: 0.2, mid: 9 },
  intense: { w: 36, o: 0.3, mid: 11 },
};

/* ------------------------------------------------------------------ defs */

function BoardDefs({ uid, world }) {
  return (
    <defs>
      {wallGradients(world, uid)}
      <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={world.tile} />
        <stop offset="1" stopColor={world.board} />
      </linearGradient>
      <linearGradient id={`${uid}-frame`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={world.frame} />
        <stop offset="0.5" stopColor={world.board} />
        <stop offset="1" stopColor={world.frame} stopOpacity="0.7" />
      </linearGradient>
      <radialGradient id={`${uid}-vignette`} cx="0.5" cy="0.4" r="0.75">
        <stop offset="0.55" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.45" />
      </radialGradient>
      <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5a6a86" />
        <stop offset="0.45" stopColor="#2b3548" />
        <stop offset="1" stopColor="#151b28" />
      </linearGradient>
      <radialGradient id={`${uid}-pedestal`} cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#3b4863" />
        <stop offset="1" stopColor="#10151f" />
      </radialGradient>
      <linearGradient id={`${uid}-mirror`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.35" stopColor="#c9dcf0" />
        <stop offset="0.6" stopColor="#7d93b3" />
        <stop offset="1" stopColor="#e6f2ff" />
      </linearGradient>
      <linearGradient id={`${uid}-splitter`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={world.accent2} stopOpacity="0.75" />
        <stop offset="1" stopColor={world.accent} stopOpacity="0.35" />
      </linearGradient>
      <linearGradient id={`${uid}-prism`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="1" stopColor="#9fb4ff" stopOpacity="0.2" />
      </linearGradient>
      {[1, 2, 3].map((p) => (
        <radialGradient key={p} id={`${uid}-portal${p}`}>
          <stop offset="0" stopColor="#000" />
          <stop offset="0.7" stopColor={portalColors(String(p))[0]} stopOpacity="0.35" />
          <stop offset="1" stopColor={portalColors(String(p))[1]} stopOpacity="0.1" />
        </radialGradient>
      ))}
      {Object.keys(COLORS).map((c) => (
        <radialGradient key={c} id={`${uid}-g${c}`}>
          <stop offset="0" stopColor={COLORS[c].core} stopOpacity="0.95" />
          <stop offset="0.3" stopColor={COLORS[c].hex} stopOpacity="0.55" />
          <stop offset="1" stopColor={COLORS[c].glow} stopOpacity="0" />
        </radialGradient>
      ))}
      <linearGradient id="rainbowSheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ff3355" />
        <stop offset="0.25" stopColor="#ffd23a" />
        <stop offset="0.5" stopColor="#2bff88" />
        <stop offset="0.75" stopColor="#3d86ff" />
        <stop offset="1" stopColor="#c65cff" />
      </linearGradient>
      <linearGradient id="lmShine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0.8" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="lmGold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8a6424" />
        <stop offset="0.5" stopColor="#ffe3a3" />
        <stop offset="1" stopColor="#8a6424" />
      </linearGradient>
      <linearGradient id="lmBrass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffd08a" />
        <stop offset="1" stopColor="#8a5e25" />
      </linearGradient>
      <filter id={`${uid}-blur`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="7" />
      </filter>
    </defs>
  );
}

/* ---------------------------------------------------------- static board */

const StaticBoard = memo(function StaticBoard({ level, world, uid, graphics }) {
  const W = level.w * 100;
  const H = level.h * 100;
  const tiles = [];
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      tiles.push(
        <rect key={`${x},${y}`} x={x * 100 + 3} y={y * 100 + 3} width="94" height="94" rx="12"
          fill={`url(#${uid}-floor)`} stroke={world.tileEdge} strokeWidth="1.5" />,
      );
    }
  }
  return (
    <g>
      {/* 2.5D slab: thickness + drop shadow, then the top surface */}
      <rect x={-PAD + 6} y={-PAD + 26} width={W + PAD * 2 - 12} height={H + PAD * 2} rx="30" fill="#000" opacity="0.45" />
      <rect x={-PAD} y={-PAD + 14} width={W + PAD * 2} height={H + PAD * 2} rx="30" fill={world.frame} opacity="0.55" />
      <rect x={-PAD} y={-PAD} width={W + PAD * 2} height={H + PAD * 2} rx="30" fill={`url(#${uid}-frame)`}
        stroke={world.accent} strokeOpacity="0.35" strokeWidth="2" />
      <rect x="-10" y="-10" width={W + 20} height={H + 20} rx="18" fill={world.board} stroke="#000" strokeOpacity="0.5" strokeWidth="4" />
      <g opacity={graphics === "low" ? 0.8 : 1}>{tiles}</g>
      {graphics !== "low" && (
        <rect x="-10" y="-10" width={W + 20} height={H + 20} rx="18" fill={`url(#${uid}-vignette)`} pointerEvents="none" />
      )}
      {/* frame corner studs */}
      {[[-PAD + 16, -PAD + 16], [W + PAD - 16, -PAD + 16], [-PAD + 16, H + PAD - 16], [W + PAD - 16, H + PAD - 16]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="5" fill={world.accent} opacity="0.55" />
      ))}
      <WallLayer level={level} world={world} uid={uid} />
      {level.statics.map((s) => {
        const key = `${s.x},${s.y}`;
        const tr = `translate(${s.x * 100 + 50} ${s.y * 100 + 50})`;
        if (s.type === "mirror") return <g key={key} transform={tr}><MirrorBody o={s.o} variant="fixed" world={world} uid={uid} /></g>;
        if (s.type === "splitter") return <g key={key} transform={tr}><MirrorBody o={s.o} kind="splitter" variant="fixed" world={world} uid={uid} /></g>;
        if (s.type === "prism") return <g key={key} transform={tr}><Prism uid={uid} /></g>;
        if (s.type === "filter") return <g key={key} transform={tr}><Filter c={s.c} /></g>;
        return null;
      })}
    </g>
  );
});

/* ------------------------------------------------------------------ beams */

function BeamLayer({ trace, uid, glow, graphics, particles, completing }) {
  const byColor = useMemo(() => {
    const m = new Map();
    for (const s of trace.segments) {
      const d = `M${s.x1 * 100} ${s.y1 * 100}L${s.x2 * 100} ${s.y2 * 100}`;
      m.set(s.c, (m.get(s.c) || "") + d);
    }
    return [...m.entries()];
  }, [trace]);
  const g = GLOW[glow] || GLOW.normal;
  const blur = graphics === "high";
  return (
    <g className={`lm-beams${completing ? " is-complete" : ""}`} pointerEvents="none">
      <g filter={blur ? `url(#${uid}-blur)` : undefined}>
        {byColor.map(([c, d]) => (
          <path key={c} d={d} stroke={colorOf(c).glow} strokeWidth={blur ? g.w * 1.2 : g.w} strokeOpacity={blur ? g.o * 2.2 : g.o}
            strokeLinecap="round" fill="none" className="lm-beam__glow" />
        ))}
      </g>
      {byColor.map(([c, d]) => (
        <path key={c} d={d} stroke={colorOf(c).hex} strokeWidth={g.mid} strokeOpacity="0.7" strokeLinecap="round" fill="none" />
      ))}
      {byColor.map(([c, d]) => (
        <path key={c} d={d} stroke={colorOf(c).core} strokeWidth="3.4" strokeLinecap="round" fill="none" />
      ))}
      {particles && graphics !== "low" && byColor.map(([c, d]) => (
        <path key={c} d={d} stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none"
          strokeDasharray="1.5 30" className="lm-beam__flow" opacity="0.85" />
      ))}
      {particles && graphics === "high" && byColor.map(([c, d]) => (
        <path key={c} d={d} stroke={colorOf(c).core} strokeWidth="6" strokeLinecap="round" fill="none"
          strokeDasharray="0.5 77" className="lm-beam__flow lm-beam__flow--slow" opacity="0.7" />
      ))}
      {completing && byColor.map(([c, d]) => (
        <path key={c} d={d} stroke="#fff" strokeWidth="7" strokeLinecap="round" fill="none"
          strokeDasharray="40 400" className="lm-beam__surge" />
      ))}
    </g>
  );
}

function Impacts({ trace, uid }) {
  return (
    <g pointerEvents="none">
      {trace.impacts.map((im, i) => (
        <circle key={i} cx={im.x * 100} cy={im.y * 100} r="15" fill={`url(#${uid}-g${im.c})`} className="lm-impact" />
      ))}
      {trace.portalHits.map((p, i) => (
        <path key={`p${i}`} d={`M${p.from.x * 100 + 50} ${p.from.y * 100 + 50}L${p.to.x * 100 + 50} ${p.to.y * 100 + 50}`}
          stroke={colorOf(p.c).hex} strokeWidth="2" strokeDasharray="3 10" strokeLinecap="round" opacity="0.4" className="lm-beam__flow" />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ board */

export default function Board({
  level, state, trace, world, uid = "lm",
  settings = {}, interactive = true,
  selected = null, hint = null, completing = false, pulse = [],
  onRotate, onCrank, onSelectMovable, onMoveTo, onBackground,
}) {
  const { graphics = "medium", particles = true, beamGlow = "normal", reducedMotion = false } = settings;
  const W = level.w * 100;
  const H = level.h * 100;
  const cells = trace.cells;


  const hintCells = useMemo(() => {
    if (!hint) return [];
    if (hint.t === "rot") return [{ ...level.rotatables[hint.i], role: "piece" }];
    if (hint.t === "crank") return [{ ...level.cranks[hint.i], role: "piece" }];
    if (hint.t === "mv") return [{ ...level.slots[state.mov[hint.i]], role: "piece" }, { ...level.slots[hint.s], role: "dest" }];
    return [];
  }, [hint, level, state.mov]);

  const occupied = new Set(state.mov);
  const fire = (fn, ...a) => (e) => {
    e.stopPropagation();
    if (interactive && fn) fn(...a);
  };
  const keyFire = (fn, ...a) => (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (interactive && fn) fn(...a);
    }
  };
  const at = (x, y) => `translate(${x * 100 + 50} ${y * 100 + 50})`;

  return (
    <svg
      className={`lm-board${interactive ? " is-interactive" : ""}${completing ? " is-complete" : ""}`}
      viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2 + 16}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={interactive ? onBackground : undefined}
      role="img"
      aria-label={`${level.name} puzzle board`}
    >
      <BoardDefs uid={uid} world={world} />
      <StaticBoard level={level} world={world} uid={uid} graphics={graphics} />

      {/* state-dependent mechanisms under the beam */}
      {level.slots.map((s, i) => (
        <g key={`slot${i}`} transform={at(s.x, s.y)}>
          <Slot active={selected !== null && !occupied.has(i)} />
        </g>
      ))}
      {level.switches.map((s) => (
        <g key={`sw${s.x},${s.y}`} transform={at(s.x, s.y)}>
          <Switch on={trace.switchesOn.has(s.id)} world={world} id={s.id} />
        </g>
      ))}
      {level.gates.map((g) => (
        <g key={`gt${g.x},${g.y}`} transform={at(g.x, g.y)}>
          <Gate open={trace.gatesOpen.has(g.id)} id={g.id} />
        </g>
      ))}
      {level.shutters.map((s) => (
        <g key={`sh${s.x},${s.y}`} transform={at(s.x, s.y)}>
          <Shutter open={cells[s.y * level.w + s.x].open} />
        </g>
      ))}
      {level.statics.filter((s) => s.type === "portal").map((p) => (
        <g key={`pt${p.x},${p.y}`} transform={at(p.x, p.y)}>
          <Portal pair={p.pair} uid={uid} active={trace.portalHits.some((h) => (h.from.x === p.x && h.from.y === p.y) || (h.to.x === p.x && h.to.y === p.y))} />
        </g>
      ))}

      <BeamLayer trace={trace} uid={uid} glow={beamGlow} graphics={graphics} particles={particles && !reducedMotion} completing={completing} />

      {/* dynamic mirrors (drawn over the beam so the reflection point reads) */}
      {level.rotatables.map((r, i) => (
        <g key={r.id} transform={at(r.x, r.y)} className="lm-piece">
          <MirrorBody o={state.rot[i] ? "\\" : "/"} kind={r.kind} world={world} uid={uid} reducedMotion={reducedMotion} />
        </g>
      ))}
      {level.geared.map((g) => (
        <g key={`gm${g.x},${g.y}`} transform={at(g.x, g.y)}>
          <MirrorBody o={cells[g.y * level.w + g.x].o} variant="geared" world={world} uid={uid} reducedMotion={reducedMotion} />
        </g>
      ))}
      {level.movables.map((m, i) => {
        const s = level.slots[state.mov[i]];
        return (
          <g key={m.id} className={`lm-movable${selected === i ? " is-selected" : ""}`}
            style={{ transform: `translate(${s.x * 100 + 50}px, ${s.y * 100 + 50}px)`, transition: reducedMotion ? "none" : undefined }}>
            {selected === i && <circle r="44" fill="none" stroke={world.accent2} strokeWidth="4" className="lm-select-ring" />}
            <MirrorBody o={m.o} variant="movable" world={world} uid={uid} reducedMotion={reducedMotion} />
          </g>
        );
      })}
      {level.cranks.map((c, i) => (
        <g key={c.id} transform={at(c.x, c.y)} className="lm-piece">
          <Crank phase={state.crank[i]} phases={c.phases} reducedMotion={reducedMotion} />
        </g>
      ))}

      {level.sources.map((s) => (
        <g key={`src${s.x},${s.y}`} transform={at(s.x, s.y)}>
          <Source d={s.d} c={s.c} uid={uid} />
        </g>
      ))}
      {level.targets.map((t, i) => (
        <g key={`tg${i}`} transform={at(t.x, t.y)} className={completing ? "lm-target-wrap is-final" : "lm-target-wrap"}>
          <Target c={t.c} lit={trace.targetLit[i]} wrong={trace.targetWrong[i]} style={world.target} uid={uid} pulseKey={pulse[i] || 0} />
        </g>
      ))}

      <Impacts trace={trace} uid={uid} />

      {hintCells.map((h, i) => (
        <g key={`hint${i}`} transform={at(h.x, h.y)} pointerEvents="none">
          {/* animated inner group: a CSS transform on the outer <g> would replace its translate */}
          <g className="lm-hint">
            <circle r="47" fill="none" stroke="#fff" strokeWidth="4" strokeDasharray={h.role === "dest" ? "8 8" : undefined} />
            <circle r="47" fill="none" stroke={world.accent} strokeWidth="9" opacity="0.35" />
          </g>
        </g>
      ))}

      {/* hit areas — last, so nothing decorative can swallow a click */}
      {interactive && (
        <g className="lm-hits">
          {level.rotatables.map((r, i) => (
            <rect key={r.id} x={r.x * 100} y={r.y * 100} width="100" height="100" rx="14" className="lm-hit"
              tabIndex={0} role="button" aria-label={`Rotate ${r.kind} at column ${r.x + 1}, row ${r.y + 1}`}
              onClick={fire(onRotate, i)} onKeyDown={keyFire(onRotate, i)} />
          ))}
          {level.cranks.map((c, i) => (
            <rect key={c.id} x={c.x * 100} y={c.y * 100} width="100" height="100" rx="14" className="lm-hit"
              tabIndex={0} role="button" aria-label="Turn crank"
              onClick={fire(onCrank, i)} onKeyDown={keyFire(onCrank, i)} />
          ))}
          {level.movables.map((m, i) => {
            const s = level.slots[state.mov[i]];
            return (
              <rect key={m.id} x={s.x * 100} y={s.y * 100} width="100" height="100" rx="14" className="lm-hit"
                tabIndex={0} role="button" aria-label={selected === i ? "Deselect mirror" : "Pick up movable mirror"}
                onClick={fire(onSelectMovable, i)} onKeyDown={keyFire(onSelectMovable, i)} />
            );
          })}
          {selected !== null && level.slots.map((s, i) => (occupied.has(i) ? null : (
            <rect key={`sl${i}`} x={s.x * 100} y={s.y * 100} width="100" height="100" rx="14" className="lm-hit lm-hit--slot"
              tabIndex={0} role="button" aria-label={`Place mirror at column ${s.x + 1}, row ${s.y + 1}`}
              onClick={fire(onMoveTo, i)} onKeyDown={keyFire(onMoveTo, i)} />
          )))}
        </g>
      )}
    </svg>
  );
}
