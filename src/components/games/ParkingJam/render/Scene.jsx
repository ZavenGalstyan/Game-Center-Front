/**
 * Parking Jam — the playable scene: fitted viewport, static environment,
 * vehicles, feedback overlays and every vehicle animation.
 *
 * Source of truth: the `present` array owned by Gameplay. A vehicle is drawn
 * parked exactly where the compiled level says it is (parkedPose) whenever it
 * is present; while it drives out it is drawn from the `exiting` list. The
 * rules never look at anything drawn here.
 *
 * Animation runs in ONE requestAnimationFrame loop that writes SVG transform
 * attributes on refs — React renders only when a car starts or finishes
 * moving, never per frame. Unmount cancels the loop and drops callbacks,
 * so Restart / screen change mid-animation can't touch stale state.
 *
 * Imperative API (via ref):
 *   exit(i, { onClear, onDone })  drive vehicle i out along its route
 *   nudge(i)                      tiny blocked bump toward its nose
 *   bringBack(i)                  undo: reverse vehicle i into its space
 */
import {
  forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import Environment from "./Environment.jsx";
import { VehicleTop, VehicleDefs, paintFor } from "./Vehicle.jsx";
import { CELL, vehicleGeometry, bodyPath } from "./geometry.js";
import { ROAD, parkedPose, exitRoute, poseAt, exitDuration, easeExit } from "./path.js";
import { mix } from "./color.js";
import { pathCells } from "../engine/logic.js";
import { VEHICLE_TYPES } from "../engine/level.js";

const MARGIN = 46; // minimum scenery kept visible beyond the ring road
const MAX_SCALE = 1.05; // px per world unit cap, so tiny lots don't balloon
const SKIRT = 6; // body side height (world units, straight down)
const SHADOW = [6, 11];
const NUDGE = 10;
const RETURN_MS = 420;
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/* ------------------------------------------------------------------ fit */

/**
 * Fit the lot into the container. On a portrait stage a wide lot is shown
 * rotated a quarter turn (`rotated`) so cars stay large enough to tap; the
 * rules never know — only the drawing transform and swipe mapping change.
 * `vb` is the screen-space viewBox, `worldVb` the same area in lot space.
 */
function useFit(ref, level, insets, allowRotate) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  const W = level.cols * CELL;
  const H = level.rows * CELL;
  const ins = insets || {};
  return useMemo(() => {
    const cw = Math.max(1, size.w);
    const ch = Math.max(1, size.h);
    // insets are px, or "NN%" of the container's width/height
    const px = (v, total) => (typeof v === "string" && v.endsWith("%") ? (parseFloat(v) / 100) * total : v || 0);
    const top = px(ins.top, ch);
    const bottom = px(ins.bottom, ch);
    const left = px(ins.left, cw);
    const right = px(ins.right, cw);
    const aw = Math.max(40, cw - left - right);
    const ah = Math.max(40, ch - top - bottom);
    const rotated = Boolean(allowRotate) && aw / ah < 0.85 && W > H;
    const vw = rotated ? H : W; // lot size as drawn on screen
    const vh = rotated ? W : H;
    const coreW = vw + 2 * (ROAD + MARGIN);
    const coreH = vh + 2 * (ROAD + MARGIN);
    const scale = Math.min(aw / coreW, ah / coreH, MAX_SCALE);
    const cx = left + aw / 2;
    const cy = top + ah / 2;
    const round = (n) => Math.round(n * 10) / 10;
    const vb = { x: round(vw / 2 - cx / scale), y: round(vh / 2 - cy / scale), w: round(cw / scale), h: round(ch / scale) };
    // screen (x', y') = (H - y, x) for lot point (x, y) when rotated
    const worldVb = rotated ? { x: vb.y, y: H - vb.x - vb.w, w: vb.h, h: vb.w } : vb;
    return {
      ready: size.w > 0,
      scale,
      rotated,
      vb,
      worldVb,
      xf: rotated ? `translate(${H} 0) rotate(90)` : undefined,
    };
  }, [size.w, size.h, W, H, ins.top, ins.right, ins.bottom, ins.left, allowRotate]);
}

/* -------------------------------------------------------------- vehicle */

const Car = memo(function Car({
  v, skin, uid, night, detail, register, state, interactive, label, onKeyTap, beams,
}) {
  const pose = parkedPose(v);
  const g = vehicleGeometry(v.type, v.length);
  const body = bodyPath(g.W, g.L, g.s.rf, g.s.rr);
  const p = paintFor(v.color, skin);
  const footprint = v.length * CELL;
  const setRef = useCallback((el) => register(v.index, el), [register, v.index]);
  return (
    <g
      ref={setRef}
      className={`pj-car${state ? ` ${state}` : ""}`}
      data-index={v.index}
      transform={`translate(${pose.x} ${pose.y})`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      onKeyDown={interactive ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onKeyTap(v.index);
        }
      } : undefined}
    >
      <g className="pj-car__nudge">
        <g data-rot="shadow" transform={`translate(${SHADOW[0]} ${SHADOW[1]}) rotate(${pose.angle})`}>
          <path d={bodyPath(g.W + 6, g.L + 6, g.s.rf, g.s.rr)} className="pj-car__shadow"
            filter={detail === "low" ? undefined : `url(#${uid}-soft)`} />
        </g>
        <g className="pj-car__lift">
          <g data-rot="skirt" transform={`translate(0 ${SKIRT}) rotate(${pose.angle})`}>
            <path d={body} fill={mix(p.base, "#0b0d10", 0.55)} />
          </g>
          <g data-rot="top" transform={`rotate(${pose.angle})`}>
            {beams && night && (
              <path className="pj-car__beam" d={`M ${-g.W / 2 + 8} ${-g.L / 2} L ${-g.W * 1.1} ${-g.L / 2 - 170} L ${g.W * 1.1} ${-g.L / 2 - 170} L ${g.W / 2 - 8} ${-g.L / 2} Z`}
                fill={`url(#${uid}-beam)`} />
            )}
            <rect className="pj-car__hit" x={-CELL / 2 + 2} y={-footprint / 2 + 2} width={CELL - 4} height={footprint - 4} rx={10} />
            <path className="pj-car__ring" d={bodyPath(g.W + 12, g.L + 12, g.s.rf, g.s.rr)} />
            <VehicleTop type={v.type} cells={v.length} color={v.color} skin={skin} defs={uid} night={night} detail={detail} />
            <g className="pj-car__dir">
              <path d={`M -10 ${-g.L / 2 - 14} L 0 ${-g.L / 2 - 24} L 10 ${-g.L / 2 - 14}`} />
              <path d={`M -10 ${-g.L / 2 - 28} L 0 ${-g.L / 2 - 38} L 10 ${-g.L / 2 - 28}`} />
            </g>
            {night && <g className="pj-car__glow">
              <circle cx={-g.W / 2 + 11} cy={-g.L / 2 + 4} r={9} />
              <circle cx={g.W / 2 - 11} cy={-g.L / 2 + 4} r={9} />
            </g>}
          </g>
        </g>
      </g>
    </g>
  );
});

function writePose(el, x, y, a) {
  if (!el) return;
  el.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  for (const child of el.querySelectorAll("[data-rot]")) {
    const kind = child.getAttribute("data-rot");
    const pre = kind === "shadow" ? `translate(${SHADOW[0]} ${SHADOW[1]}) ` : kind === "skirt" ? `translate(0 ${SKIRT}) ` : "";
    child.setAttribute("transform", `${pre}rotate(${a.toFixed(2)})`);
  }
}

/* ---------------------------------------------------------------- scene */

const Scene = forwardRef(function Scene({
  level, world, present, skin, settings, uid = "pj", insets, interactive = true,
  onTap, hint = null, flash = null, assist = null, className = "", allowRotate = false,
}, ref) {
  const rootRef = useRef(null);
  const fxRef = useRef(null);
  const fit = useFit(rootRef, level, insets, allowRotate);
  const rotatedRef = useRef(false);
  rotatedRef.current = fit.rotated;
  const detail = settings.graphics;
  const reduced = settings.reducedMotion;
  const particles = settings.particles && detail !== "low" && !reduced;
  const night = world.night;

  /* --- node registry + animation loop --- */
  const nodes = useRef(new Map());
  const anims = useRef(new Map());
  const raf = useRef(0);
  const alive = useRef(true);
  const [exiting, setExiting] = useState(() => new Set());
  // Timer fallbacks: game logic (input unlock, completion) must never wait on
  // animation frames, which browsers pause in hidden tabs.
  const timers = useRef(new Set());
  const after = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      if (alive.current) fn();
    }, ms);
    timers.current.add(id);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelAnimationFrame(raf.current);
      anims.current.clear();
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const frame = useCallback(function frame(now) {
    raf.current = 0;
    for (const [i, an] of anims.current) {
      const el = nodes.current.get(i);
      const t = Math.min(1, (now - an.t0) / an.dur);
      if (an.kind === "exit") {
        const s = easeExit(t) * an.route.length;
        const p = poseAt(an.route, s);
        writePose(el, p.x, p.y, p.a);
        if (el) el.style.opacity = t > 0.72 ? String(Math.max(0, 1 - (t - 0.72) / 0.28)) : "";
        if (s >= an.route.clearAt) an.clear();
        if (t >= 1) an.finish();
      } else if (an.kind === "return") {
        const e = 1 - (1 - t) * (1 - t) * (1 - t);
        writePose(el, an.from.x + (an.to.x - an.from.x) * e, an.from.y + (an.to.y - an.from.y) * e, an.to.angle);
        if (el) el.style.opacity = String(Math.min(1, t * 3));
        if (t >= 1) an.finish();
      }
    }
    if (anims.current.size && alive.current) raf.current = requestAnimationFrame(frame);
  }, []);

  const kick = useCallback(() => {
    if (!raf.current && alive.current) raf.current = requestAnimationFrame(frame);
  }, [frame]);

  const register = useCallback((i, el) => {
    if (el) {
      nodes.current.set(i, el);
      // A node mounting mid-animation (undo of a car that had left) starts at
      // its animated pose, so there is never a one-frame flash in its space.
      const an = anims.current.get(i);
      if (an?.kind === "return") {
        writePose(el, an.from.x, an.from.y, an.to.angle);
        el.style.opacity = "0";
      }
    } else nodes.current.delete(i);
  }, []);

  const puff = useCallback((x, y, dx, dy, n = 3) => {
    const g = fxRef.current;
    if (!g || !particles) return;
    for (let k = 0; k < n; k++) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", String(x + (Math.random() - 0.5) * 14));
      c.setAttribute("cy", String(y + (Math.random() - 0.5) * 14));
      c.setAttribute("r", String(6 + Math.random() * 5));
      c.setAttribute("class", "pj-puff");
      g.appendChild(c);
      const a = c.animate(
        [
          { transform: "translate(0px, 0px) scale(0.6)", opacity: 0.55 },
          { transform: `translate(${dx * (22 + k * 10)}px, ${dy * (22 + k * 10)}px) scale(${1.8 + k * 0.3})`, opacity: 0 },
        ],
        { duration: 520 + k * 90, easing: "cubic-bezier(.2,.7,.3,1)", delay: k * 40 },
      );
      a.onfinish = () => c.remove();
    }
  }, [particles]);

  useImperativeHandle(ref, () => ({
    exit(i, { onClear, onDone } = {}) {
      const v = level.vehicles[i];
      const route = exitRoute(v, level.rows, level.cols);
      const dur = reduced ? 280 : exitDuration(route);
      const an = { kind: "exit", route, t0: performance.now(), dur, cleared: false, done: false };
      an.clear = () => {
        if (an.cleared) return;
        an.cleared = true;
        onClear?.();
      };
      an.finish = () => {
        if (an.done) return;
        an.done = true;
        an.clear();
        if (anims.current.get(i) === an) anims.current.delete(i);
        setExiting((set) => {
          if (!set.has(i)) return set;
          const n = new Set(set);
          n.delete(i);
          return n;
        });
        onDone?.();
      };
      anims.current.set(i, an);
      setExiting((set) => new Set(set).add(i));
      after(an.clear, dur * 0.85);
      after(an.finish, dur + 120);
      const pose = parkedPose(v);
      const [dx, dy] = DIR_VEC[v.dir];
      const g = vehicleGeometry(v.type, v.length);
      puff(pose.x - dx * (g.L / 2 + 4), pose.y - dy * (g.L / 2 + 4), -dx, -dy);
      kick();
    },
    nudge(i) {
      const el = nodes.current.get(i)?.querySelector(".pj-car__nudge");
      if (!el || reduced) return;
      const [dx, dy] = DIR_VEC[level.vehicles[i].dir];
      el.animate(
        [
          { transform: "translate(0px, 0px)" },
          { transform: `translate(${dx * NUDGE}px, ${dy * NUDGE}px)`, offset: 0.35 },
          { transform: `translate(${-dx * 2}px, ${-dy * 2}px)`, offset: 0.7 },
          { transform: "translate(0px, 0px)" },
        ],
        { duration: 210, easing: "ease-out" },
      );
    },
    bringBack(i, { onDone } = {}) {
      const v = level.vehicles[i];
      const to = parkedPose(v);
      const [dx, dy] = DIR_VEC[v.dir];
      // start just outside the lot edge, nose-first out → reversing in
      const W = level.cols * CELL;
      const H = level.rows * CELL;
      const g = vehicleGeometry(v.type, v.length);
      const out = v.dir === "up" ? to.y + g.L / 2 : v.dir === "down" ? H - to.y + g.L / 2 : v.dir === "left" ? to.x + g.L / 2 : W - to.x + g.L / 2;
      const dist = Math.min(out, 2.4 * CELL);
      const from = { x: to.x + dx * dist, y: to.y + dy * dist };
      setExiting((set) => {
        if (!set.has(i)) return set;
        const n = new Set(set);
        n.delete(i);
        return n;
      });
      // an undo replaces any exit still running for this car (its callbacks are dropped)
      const prev = anims.current.get(i);
      if (prev) prev.done = prev.cleared = true;
      const dur = reduced ? 180 : RETURN_MS;
      const an = { kind: "return", from, to, t0: performance.now(), dur, done: false };
      an.finish = () => {
        if (an.done) return;
        an.done = true;
        if (anims.current.get(i) === an) anims.current.delete(i);
        const node = nodes.current.get(i);
        writePose(node, to.x, to.y, to.angle);
        if (node) node.style.opacity = "";
        onDone?.();
      };
      anims.current.set(i, an);
      after(an.finish, dur + 120);
      const el = nodes.current.get(i);
      if (el) writePose(el, from.x, from.y, to.angle);
      kick();
    },
  }), [level, reduced, kick, puff, after]);

  /* --- input: tap, or a short swipe along the car's direction --- */
  const down = useRef(null);
  const onPointerDown = useCallback((e) => {
    if (!interactive) return;
    const node = e.target.closest?.(".pj-car");
    if (!node || e.button > 0) return;
    const index = Number(node.getAttribute("data-index"));
    down.current = { index, x: e.clientX, y: e.clientY, id: e.pointerId, fired: false };
  }, [interactive]);
  const onPointerMove = useCallback((e) => {
    const d = down.current;
    if (!d || d.id !== e.pointerId || d.fired) return;
    // screen movement → lot movement (undo the quarter turn when rotated)
    const sx = e.clientX - d.x;
    const sy = e.clientY - d.y;
    const mx = rotatedRef.current ? sy : sx;
    const my = rotatedRef.current ? -sx : sy;
    if (Math.hypot(mx, my) < 18) return;
    const [dx, dy] = DIR_VEC[level.vehicles[d.index].dir];
    d.fired = true; // one gesture = one attempt, whatever happens next
    if ((mx * dx + my * dy) / Math.hypot(mx, my) > 0.55) onTap?.(d.index, "swipe");
  }, [level, onTap]);
  const onPointerUp = useCallback((e) => {
    const d = down.current;
    down.current = null;
    if (!d || d.id !== e.pointerId || d.fired) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 18) onTap?.(d.index, "tap");
  }, [onTap]);
  const onPointerCancel = useCallback(() => {
    down.current = null;
  }, []);
  const onKeyTap = useCallback((i) => onTap?.(i, "key"), [onTap]);

  /* --- render lists --- */
  const drawn = useMemo(() => {
    const list = level.vehicles.filter((v) => present[v.index] || exiting.has(v.index));
    // lower cars draw later so their skirt/shadow overlap reads correctly;
    // cars that are driving out always draw on top.
    return list.sort((a, b) => {
      const ea = exiting.has(a.index) && !present[a.index];
      const eb = exiting.has(b.index) && !present[b.index];
      if (ea !== eb) return ea ? 1 : -1;
      return parkedPose(a).y - parkedPose(b).y;
    });
  }, [level, present, exiting]);

  const hintPath = useMemo(() => {
    if (hint == null || !present[hint]) return null;
    const v = level.vehicles[hint];
    return { v, cells: pathCells(level, v) };
  }, [hint, level, present]);

  const { vb, worldVb, xf } = fit;
  // warm pools of street light along the ring road (night only, overlay layer)
  const streetLights = useMemo(() => {
    if (!night) return null;
    const W = level.cols * CELL;
    const H = level.rows * CELL;
    const pools = [];
    const gap = 330;
    const v = worldVb;
    for (let x = Math.floor(v.x / gap) * gap; x < v.x + v.w + gap; x += gap) {
      pools.push([x, -ROAD - 6], [x + gap / 2, H + ROAD + 6]);
    }
    for (let y = Math.floor(v.y / gap) * gap; y < v.y + v.h + gap; y += gap) {
      pools.push([-ROAD - 6, y + gap / 2], [W + ROAD + 6, y]);
    }
    return <g transform={xf}>{pools.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={170} fill={`url(#${uid}-pool)`} />)}</g>;
  }, [night, level, worldVb, xf, uid]);
  const viewBox = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
  const colorName = (c) => c;

  return (
    <div ref={rootRef} className={`pj-scene ${className}`}>
      {fit.ready && (
        <>
          <svg className="pj-scene__layer" viewBox={viewBox} aria-hidden="true">
            <g transform={xf}>
              <Environment level={level} world={world} vb={worldVb} graphics={detail} uid={`${uid}e`} />
            </g>
          </svg>
          <svg
            className={`pj-scene__layer pj-scene__cars${interactive ? " is-interactive" : ""}`}
            viewBox={viewBox}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            role={interactive ? "group" : undefined}
            aria-label={interactive ? "Parking lot" : undefined}
          >
            <defs><VehicleDefs id={uid} /></defs>
            <g transform={xf}>

            {hintPath && (
              <g className="pj-hintpath">
                {hintPath.cells.map(([r, c], k) => (
                  <rect key={k} x={c * CELL + 18} y={r * CELL + 18} width={CELL - 36} height={CELL - 36} rx={14}
                    style={{ animationDelay: `${k * 60}ms` }} />
                ))}
              </g>
            )}
            {flash && flash.cells.length > 0 && (
              <g className="pj-blockpath" key={flash.key}>
                {flash.cells.map(([r, c], k) => (
                  <rect key={k} x={c * CELL + 10} y={r * CELL + 10} width={CELL - 20} height={CELL - 20} rx={12}
                    className={k === flash.cells.length - 1 ? "is-hit" : ""} />
                ))}
              </g>
            )}

            <g className="pj-cars">
              {drawn.map((v) => {
                let state = "";
                if (exiting.has(v.index) && !present[v.index]) state = "is-exiting";
                else if (hint === v.index) state = "is-hint";
                else if (flash && flash.blocker === v.index) state = "is-blocker";
                else if (flash && flash.index === v.index) state = "is-blocked";
                else if (assist && assist.includes(v.index)) state = "is-assist";
                return (
                  <Car
                    key={v.id}
                    v={v}
                    skin={skin}
                    uid={uid}
                    night={night}
                    detail={detail}
                    register={register}
                    state={state}
                    interactive={interactive && present[v.index]}
                    beams={state === "is-exiting" && detail !== "low"}
                    label={`${colorName(v.color)} ${VEHICLE_TYPES[v.type].label.toLowerCase()} facing ${v.dir}`}
                    onKeyTap={onKeyTap}
                  />
                );
              })}
            </g>
            <g ref={fxRef} className="pj-fx" />
            </g>
          </svg>
          {(night || world.scene.tint) && (
            <svg className="pj-scene__layer pj-scene__night" viewBox={viewBox} aria-hidden="true">
              <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={world.scene.tint || "rgba(0,0,0,0.2)"} />
              <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={`url(#${uid}-vig)`} />
              {detail !== "low" && <g className="pj-scene__lights">{streetLights}</g>}
              <defs>
                <radialGradient id={`${uid}-vig`} cx="0.5" cy="0.5" r="0.75">
                  <stop offset="0.55" stopColor="#000" stopOpacity="0" />
                  <stop offset="1" stopColor="#000" stopOpacity="0.45" />
                </radialGradient>
                <radialGradient id={`${uid}-pool`}>
                  <stop offset="0" stopColor="#ffd98a" stopOpacity="0.32" />
                  <stop offset="0.55" stopColor="#ffb86b" stopOpacity="0.1" />
                  <stop offset="1" stopColor="#ffb86b" stopOpacity="0" />
                </radialGradient>
              </defs>
            </svg>
          )}
        </>
      )}
    </div>
  );
});

export default Scene;
