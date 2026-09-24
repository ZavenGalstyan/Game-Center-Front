/**
 * Car Wash Studio — gameplay screen.
 *
 * React owns only the HUD (updated ~5x per second). Everything high
 * frequency lives in a mutable engine ref driven by one requestAnimationFrame
 * loop: pointer → capsule strokes into the JobSession surfaces → dirty-rect
 * compositing → canvas draw. The cleaning hit position is always the raw
 * pointer; tool smoothing only affects the drawn sprite.
 *
 * Safety: every exit path (pointerup / cancel / leave, blur, hidden tab, tool
 * or view switch, pause, completion, unmount) goes through `release()`,
 * which stops the stroke AND every audio loop.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JobSession } from "../engine/session.js";
import { STAGES, OPTIONAL } from "../engine/stages.js";
import { TOOLS, TOOL_ORDER } from "../engine/tools.js";
import { regionHit } from "../engine/surface.js";
import { LOCATIONS, TOOL_COLORS } from "../data/jobs.js";
import { SurfaceView, makePalette, drawSurfaces, buildAssistCanvas } from "../render/surfaceRender.js";
import { getBackdrop, drawWetFloor } from "../render/scene.js";
import { fitCamera, applyCam, drawCarWithSurfaces, lookFor, snapshot, isExterior } from "../render/viewRender.js";
import { drawInteriorBase, drawInteriorOverlay, drawTrashItem, drawCrumbs } from "../render/interiorPainter.js";
import { Effects, drawStream, drawLightSweep } from "../render/effects.js";
import { drawTool, nozzleTip, drawFootprint } from "../render/toolSprites.js";
import { clipRegion, pathOf } from "../render/paths.js";
import { hexToRgb } from "../render/color.js";
import { audio } from "../audio/audio.js";
import { TopBar, ViewBar, ToolTray } from "../components/Hud.jsx";
import { Icon } from "../components/icons.jsx";

const LOOP = { hose: "hose", foam: "foam", pressure: "pressure", spray: "spray", wheelCleaner: "spray", vacuum: "vacuum", polisher: "polisher", sponge: "sponge", cloth: "cloth", tireShine: "cloth", towel: "towel", wheelBrush: "brush", detailBrush: "brush" };

const CODE_MSG = {
  1: "This spot needs foam first — the sponge works through the suds.",
  2: "Dry this area with the towel before polishing.",
  3: "This area still needs washing first.",
};

function wrongSurfaceMsg(tool, viewKind) {
  if (tool === "sponge") return "The sponge is for paint — use the wheel brush on wheels.";
  if (tool === "cloth") return "The cloth is for glass and trim — dry paint with the drying towel.";
  if (tool === "polisher") return "The polisher is for painted panels only.";
  if (tool === "spray") return "Aim the spray bottle at glass or interior trim.";
  if (tool === "wheelCleaner" || tool === "wheelBrush" || tool === "tireShine") return "Aim at the wheel.";
  if (tool === "hose" || tool === "pressure") return viewKind === "int" ? "Keep the water out of the interior!" : "Aim the water at the car.";
  if (tool === "vacuum") return "The vacuum is for carpets and fabric.";
  return "That tool doesn't work there.";
}

const kindOf = (v) => (v.startsWith("wheel:") ? "wheel" : isExterior(v) ? "ext" : "int");
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function toolsFor(session, view) {
  const k = kindOf(view);
  const set = new Set();
  const addDef = (d) => {
    if (d.where !== k) return;
    for (const t of d.tools) set.add(t);
    for (const t of d.assist || []) set.add(t);
  };
  for (const id of session.activeStages()) addDef(STAGES[id]);
  for (const id of session.activeOptional()) addDef(OPTIONAL[id]);
  // after drying, keep the towel around if water got back on the paint
  if (k === "ext" && session.done.wash && !set.has("towel") && (session.fracs.dry ?? 1) < 0.985 && session.required.includes("polish") && !session.done.polish) set.add("towel");
  return TOOL_ORDER.filter((t) => set.has(t));
}

export default function Gameplay({
  job, attemptKey, settings, toolColor, kit, resume, muted,
  onCheckpoint, onStats, onHintUsed, onTrash, onComplete, onJobs, onMenu, onChangeSettings,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const E = useRef(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(resume?.view && resume.view !== "" ? resume.view : "left");
  const [tool, setTool] = useState(null);
  const [hud, setHud] = useState({ fracs: {}, done: {}, optDone: {}, current: null, overall: 0, wheels: {} });
  const [toast, setToast] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [phase, setPhase] = useState("play");
  const [pulse, setPulse] = useState(null);
  const loc = LOCATIONS[job.location - 1];
  const tint = (TOOL_COLORS.find((c) => c.id === toolColor) || TOOL_COLORS[0]).hex;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const menuRef = useRef(false);
  menuRef.current = menuOpen;
  const cbRef = useRef({});
  cbRef.current = { onCheckpoint, onStats, onHintUsed, onTrash, onComplete };

  /* ------------------------------------------------------------ toasts */
  const toastTimer = useRef(0);
  const showToast = useCallback((text, kind = "info", ms = 2600) => {
    clearTimeout(toastTimer.current);
    setToast({ text, kind, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ---------------------------------------------------------- audio */
  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
    audio.setMusic(settings.music);
  }, [settings.sound, settings.music, muted]);

  /* ------------------------------------------------ build the session */
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      const session = new JobSession(job, { toolLevel: kit });
      let restored = false;
      if (resume?.data) restored = session.restore(resume.data);
      session.evaluate();
      const pal = makePalette(job);
      const sviews = new Map();
      for (const [pid, s] of Object.entries(session.surfaces)) sviews.set(pid, new SurfaceView(s));
      const fx = new Effects();
      const e = {
        session, pal, sviews, fx, look: lookFor(job),
        view: resume?.view || "left", cam: null, trans: null,
        W: 0, H: 0, dpr: 1,
        p: { x: 0, y: 0, lastX: 0, lastY: 0, sx: 0, sy: 0, inside: false, active: false, id: null, rot: 0, speed: 0 },
        tool: null, t: 0, last: performance.now(), evalT: 0, dripT: 0, saveT: 0, statsT: 0, dirty: false,
        code: { code: 0, acc: 0 }, lastToast: 0, spin: 0, spongeDirt: 0, towelWet: 0,
        assist: { key: "", t: 0, canvases: new Map() },
        hint: null, flying: [], celebrate: null, completedSent: false, before: null, lastHud: "",
        pwActive: false, lastMoveT: 0,
      };
      if (!session.model.panels[e.view.slice(6)] && e.view.startsWith("wheel:")) e.view = "left";
      if (!isExterior(e.view) && !e.view.startsWith("wheel:") && !(session.interior && session.interior.views[e.view])) e.view = "left";
      E.current = e;
      setView(e.view);
      if (!restored) {
        // the real starting state, before a single stroke
        try {
          e.before = snapshot(session, job, "left", 720, 405).toDataURL("image/jpeg", 0.86);
        } catch {
          e.before = null;
        }
      } else {
        setTimeout(() => {
          if (!E.current || E.current !== e) return;
          try {
            e.before = snapshot(new JobSession(job), job, "left", 720, 405).toDataURL("image/jpeg", 0.86);
          } catch {
            e.before = null;
          }
        }, 1200);
      }
      setReady(true);
      if (!restored) {
        const first = STAGES[session.currentStage()];
        if (first) showToast(`${first.verb}: ${first.tip}`, "info", 4200);
      } else showToast("Welcome back — your progress on this car was saved.", "info", 3000);
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // the session is created once per mount (Restart remounts this screen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------- checkpoint */
  const checkpoint = useCallback(() => {
    const e = E.current;
    if (!e || e.session.completed) return;
    const d = e.session.takeStats();
    cbRef.current.onStats({ water: d.water * 0.14, foam: d.foam * 0.05, vacuumed: d.vacuum * 0.06 });
    cbRef.current.onCheckpoint({ jobId: job.id, data: e.session.serialize(), view: e.view.startsWith("wheel:") ? "left" : e.view }, attemptKey);
    e.dirty = false;
    e.saveT = 0;
  }, [job.id]);

  /* ----------------------------------------------------------- release */
  const release = useCallback(() => {
    const e = E.current;
    if (e) {
      e.p.active = false;
      e.p.id = null;
      e.pwActive = false;
    }
    audio.stopAll();
  }, []);

  /* -------------------------------------------------------- tools list */
  const tools = useMemo(() => {
    const e = E.current;
    if (!e || !ready) return [];
    return toolsFor(e.session, view);
    // hud changes when stages latch → recompute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view, hud.done, hud.optDone]);

  useEffect(() => {
    if (!ready) return;
    if (!tool || !tools.includes(tool)) {
      const e = E.current;
      const cur = e.session.currentStage();
      const pref = cur && STAGES[cur].tools.find((t) => tools.includes(t));
      const next = pref || tools[0] || null;
      setTool(next);
    }
  }, [tools, tool, ready]);

  useEffect(() => {
    if (E.current) E.current.tool = tool;
    release();
  }, [tool, release]);

  /* ------------------------------------------------------------- views */
  const goView = useCallback((v) => {
    const e = E.current;
    if (!e || e.trans || v === e.view) return;
    release();
    const reduced = settingsRef.current.reducedMotion;
    const from = e.cam;
    const to = fitCamera(e.session.model, e.session.interior, v, e.W, e.H);
    const zoom = from && from.base === to.base && (from.zoom || to.zoom);
    e.trans = { from, to, fromView: e.view, toView: v, t0: performance.now(), dur: reduced ? 1 : zoom ? 420 : 380, zoom };
    e.view = v;
    e.fx.clear();
    e.assist.key = "";
    setView(v);
    setPulse(null);
    if (!reduced) audio.whoosh();
    if (e.dirty) checkpoint();
  }, [release, checkpoint]);

  /* ------------------------------------------------------------- hints */
  const hint = useCallback(() => {
    const e = E.current;
    if (!e || phase !== "play") return;
    const s = e.session;
    const cur = s.currentStage() || s.activeOptional()[0];
    if (!cur) return;
    const loc2 = s.locate(cur);
    s.hintsUsed++;
    cbRef.current.onHintUsed();
    audio.select();
    if (!loc2) {
      showToast(STAGES[cur]?.tip || OPTIONAL[cur]?.label || "Keep going!");
      return;
    }
    e.hint = { ...loc2, until: performance.now() + 3800 };
    const inView = loc2.view === e.view || (loc2.view.startsWith("wheel:") && e.view === loc2.view);
    if (!inView) {
      setPulse(loc2.view.startsWith("wheel:") ? "wheel" : loc2.view);
      const vl = loc2.view.startsWith("wheel:") ? "WHEELS" : { left: "LEFT", right: "RIGHT", front: "FRONT", rear: "REAR", cabin: "CABIN", rearCabin: "REAR SEATS", trunk: "TRUNK" }[loc2.view];
      showToast(`${loc2.text} Switch to ${vl}.`, "hint", 4200);
    } else showToast(loc2.text, "hint", 3600);
  }, [phase, showToast]);

  const finishJob = useCallback(() => {
    const e = E.current;
    if (!e || phase !== "play") return;
    release();
    e.session.requestFinish();
    e.evalT = 1; // evaluate on the next frame
  }, [phase, release]);

  /* ------------------------------------------------------------- pause */
  const openMenu = useCallback(() => {
    release();
    setMenuOpen(true);
    checkpoint();
  }, [release, checkpoint]);

  /* ------------------------------------------------------ the main loop */
  useEffect(() => {
    if (!ready) return undefined;
    const e = E.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const layer = document.createElement("canvas");
    const lctx = layer.getContext("2d");
    let raf = 0;
    let alive = true;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const q = settingsRef.current.graphics;
      const dprMax = q === "low" ? 1 : q === "high" ? 2 : 1.5;
      const dpr = Math.min(dprMax, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(r.width));
      const H = Math.max(1, Math.round(r.height));
      if (W === e.W && H === e.H && dpr === e.dpr) return;
      e.W = W;
      e.H = H;
      e.dpr = dpr;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      layer.width = canvas.width;
      layer.height = canvas.height;
      const cam = fitCamera(e.session.model, e.session.interior, e.view, W, H);
      if (e.trans) e.trans.to = cam;
      e.cam = cam;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const toView = (cam, x, y) => [(x - cam.ox) / cam.s, (y - cam.oy) / cam.s];

    const regionsNow = () => e.session.viewRegions(e.view);

    const hitCar = (vx, vy) => {
      for (const r of regionsNow()) if (regionHit(r, vx, vy)) return r;
      return null;
    };

    const spawnDrips = () => {
      const s = e.session;
      const regs = regionsNow();
      if (!regs.length) return;
      for (let k = 0; k < 3; k++) {
        const r = regs[(Math.random() * regs.length) | 0];
        const surf = s.surfaces[r.panel];
        if (!surf || surf.material === "wheel") continue;
        const mask = surf.regionMasks.get(r);
        for (let tries = 0; tries < 10; tries++) {
          const i = (Math.random() * surf.n) | 0;
          if (!mask[i]) continue;
          const foam = surf.F[i] > 150;
          const wet = surf.W[i] > 200;
          if (!foam && !wet) continue;
          const u = i % surf.w;
          const v = (i / surf.w) | 0;
          const m = r.aff;
          const vx = m.a * (u + 0.5) + m.e;
          const vy = m.d * (v + 0.5) + m.f;
          const sx = vx * e.cam.s + e.cam.ox;
          const sy = vy * e.cam.s + e.cam.oy;
          e.fx.add({ type: "drip", x: sx, y: sy, vx: 0, vy: foam ? 6 : 14, g: foam ? 4 : 30, maxV: foam ? 12 : 40, r: foam ? 2.4 : 1.4, life: foam ? 4 : 1.6, water: !foam });
          return;
        }
      }
    };

    e.lastStrokeT = performance.now();
    e.strokeNow = (x, y, now) => {
      const P = e.p;
      const tl = e.tool;
      const def = tl && TOOLS[tl];
      const st = settingsRef.current;
      if (!P.active || !def || def.mode === "pick" || e.trans || e.celebrate || menuRef.current || !e.cam) return;
      const cam = e.cam;
      const dt = Math.min(0.05, Math.max(0.001, (now - e.lastStrokeT) / 1000));
      e.lastStrokeT = now;
      P.x = x;
      P.y = y;
      const radius = def.radius * (1 + kit * 0.06);
      const r = radius / cam.s;
      const [lx, ly] = toView(cam, P.lastX, P.lastY);
      const [vx, vy] = toView(cam, x, y);
      const moved = Math.hypot(x - P.lastX, y - P.lastY);
      P.speed = P.speed * 0.7 + (moved / dt) * 0.3;
      if (moved > 0.5) P.rot = P.rot * 0.9 + Math.atan2(y - P.lastY, x - P.lastX) * 0.025;
      let res = null;
      if (def.mode === "spray" || moved > 0.25) {
        res = e.session.stroke(e.view, tl, lx, ly, vx, vy, r, dt);
        if (res.changed) e.dirty = true;
      }
      P.lastX = x;
      P.lastY = y;
      const hitNow = !!(res && (res.changed || res.code)) || !!hitCar(vx, vy);
      // gentle feedback, only when the wrong thing keeps happening
      if (res && res.code) {
        e.code.acc += dt;
        if (e.code.acc > 0.4 && now - e.lastToast > 3200) {
          e.lastToast = now;
          e.code.acc = 0;
          const msg = res.code === 5 ? wrongSurfaceMsg(tl, kindOf(e.view))
            : res.code === 4 ? (tl === "wheelBrush" ? "Spray wheel cleaner first — the grime lifts much faster." : "Mist some cleaner first — it lifts the marks much faster.")
              : tl === "tireShine" && res.code === 3 ? "Clean the tire before dressing it." : CODE_MSG[res.code];
          if (msg) showToast(msg, "soft", 2400);
          audio.soft();
        }
      } else e.code.acc = Math.max(0, e.code.acc - dt);
      const ln = LOOP[tl];
      if (ln) audio.loop(ln, def.mode === "spray" ? (hitNow ? 1 : 0.55) : hitNow ? Math.min(1, P.speed / 700) : 0);
      if (hitNow && st.particles) {
        if (tl === "hose") {
          if (Math.random() < 0.6) e.fx.burst("drop", x, y, 2, { speed: 220, r: 1.8, life: 0.5 });
          if (Math.random() < 0.15) e.fx.burst("mist", x, y, 1, { speed: 20, r: 10, life: 0.5, g: -20 });
        } else if (tl === "pressure") {
          e.fx.burst("drop", x, y, 3, { speed: 340, r: 1.5, life: 0.45 });
          if (Math.random() < 0.35) e.fx.burst("mist", x, y, 1, { speed: 30, r: 12, life: 0.55, g: -30 });
        } else if (tl === "foam") {
          if (Math.random() < 0.5) e.fx.burst("foam", x, y, 1, { speed: 60, r: 3.5, life: 0.5, g: 120 });
        } else if (tl === "sponge" && moved > 2) {
          if (Math.random() < 0.4) e.fx.burst("suds", x, y, 1, { speed: 40, r: 2.5, life: 0.7, g: 80 });
          e.spongeDirt = Math.min(0.5, e.spongeDirt + dt * 0.08);
        } else if ((tl === "detailBrush" || tl === "wheelBrush") && moved > 2) {
          if (Math.random() < 0.3) e.fx.burst("dust", x, y, 1, { speed: 50, r: 2.5, life: 0.6, g: 40 });
        } else if ((tl === "spray" || tl === "wheelCleaner") && Math.random() < 0.25) {
          e.fx.burst("mist", x, y, 1, { speed: 20, r: 9, life: 0.4, g: 0 });
        }
      }
      if (tl === "towel" && res && res.changed) e.towelWet = Math.min(0.45, e.towelWet + dt * 0.03);
      if (tl === "polisher") e.spin += dt * 30;
      e.pwActive = tl === "pressure";
    };

    const frame = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const st = settingsRef.current;
      const dt = Math.min(0.05, (now - e.last) / 1000);
      e.last = now;
      e.t += dt;
      e.fx.quality = st.graphics;
      e.fx.enabled = st.particles;
      // ResizeObserver is the main path; this cheap poll is a fallback so a
      // fullscreen toggle can never leave the canvas at a stale size
      e.sizeT = (e.sizeT || 0) + dt;
      if (canvas.width !== Math.round(e.W * e.dpr) || !e.cam || e.sizeT > 0.5) {
        e.sizeT = 0;
        resize();
      }
      const s = e.session;

      // ---------------- camera / transition
      let cam = e.cam;
      let drawView = e.view;
      let alpha = 1;
      let slide = 0;
      if (e.trans) {
        const tr = e.trans;
        const p = Math.min(1, (now - tr.t0) / tr.dur);
        if (tr.zoom && tr.from) {
          const k = ease(p);
          cam = {
            ...tr.to,
            s: Math.exp(Math.log(tr.from.s) + (Math.log(tr.to.s) - Math.log(tr.from.s)) * k),
            ox: tr.from.ox + (tr.to.ox - tr.from.ox) * k,
            oy: tr.from.oy + (tr.to.oy - tr.from.oy) * k,
            base: tr.to.base,
          };
          drawView = kindOf(tr.toView) === "wheel" ? tr.toView : tr.toView;
        } else if (tr.from && p < 0.5) {
          cam = tr.from;
          drawView = tr.fromView;
          alpha = 1 - p * 2;
          slide = -p * 2 * 40;
        } else {
          cam = tr.to;
          drawView = tr.toView;
          alpha = tr.from ? (p - 0.5) * 2 : 1;
          slide = tr.from ? (1 - alpha) * 40 : 0;
        }
        if (p >= 1) {
          e.trans = null;
          e.cam = tr.to;
          cam = tr.to;
          alpha = 1;
          slide = 0;
        }
      }

      // ---------------- input → strokes
      // Strokes are applied from the pointer events themselves (see
      // strokeNow) so a flick that starts and ends between two frames still
      // cleans its whole path. Spray tools also keep spraying while the
      // pointer is held still, driven from here.
      const P = e.p;
      const tl = e.tool;
      const def = tl && TOOLS[tl];
      // only when the pointer is actually holding still — while it moves, the
      // move events carry all the spray time along the path (no dot trails)
      if (P.active && def && def.mode === "spray" && now - e.lastMoveT > 45 && now - e.lastStrokeT > 12) e.strokeNow(P.x, P.y, now);
      if (!P.active) e.pwActive = false;
      audio.reap();
      e.spongeDirt = Math.max(0, e.spongeDirt - dt * 0.01);
      if (tl !== "towel") e.towelWet = Math.max(0, e.towelWet - dt * 0.05);

      // ---------------- simulation tick
      if (!e.celebrate && !menuRef.current) s.tick(dt);
      for (const c of s.crumbs) if (!c.alive && c.pulled && c.fade == null) c.fade = 1;
      for (const c of s.crumbs) if (c.fade > 0) c.fade = Math.max(0, c.fade - dt * 4);

      // ---------------- evaluate (a few times per second)
      e.evalT += dt;
      if (e.evalT > 0.18 && !e.celebrate) {
        e.evalT = 0;
        const ev = s.evaluate();
        for (const id of ev.justDone) {
          const nxt = s.currentStage();
          audio.stage();
          if (id === "glass" || id === "iglass") {
            audio.sparkle();
            e.fx.add({ type: "spark", x: e.W * 0.5, y: e.H * 0.36, vx: 0, vy: 0, g: 0, r: 7, life: 0.9 });
          }
          e.dirty = true;
          showToast(nxt ? `${STAGES[id].label} done — next: ${STAGES[nxt].verb.toLowerCase()}. ${STAGES[nxt].tip}` : `${STAGES[id].label} done!`, "good", 4200);
          checkpoint();
        }
        for (const id of ev.optJust) {
          audio.sparkle();
          showToast(`Detail complete: ${OPTIONAL[id].label}`, "good", 2600);
        }
        const h = { fracs: ev.fracs, done: ev.done, optDone: ev.optDone, current: ev.current, overall: ev.overall, wheels: ev.wheels, allDone: ev.allDone };
        if (ev.allDone && ev.optPending.length && !e.announcedAll) {
          e.announcedAll = true;
          showToast("All required cleaning done! Finish the optional details for the third star — or tap FINISH JOB.", "good", 5200);
        }
        const key = JSON.stringify([ev.allDone, Object.keys(ev.done), Object.keys(ev.optDone), ev.current, Math.round(ev.overall * 100), Object.entries(ev.fracs).map(([k, v]) => Math.round(v * 40)), Object.values(ev.wheels).map((v) => v >= STAGES.wheels.th)]);
        if (key !== e.lastHud) {
          e.lastHud = key;
          setHud(h);
        }
        if (ev.completedNow && !e.celebrate) {
          release();
          e.celebrate = { t0: now };
          setPhase("celebrate");
          audio.complete();
          if (e.view !== "left") goView("left");
        }
      }

      // ---------------- periodic save / stats
      e.saveT += dt;
      if (e.dirty && e.saveT > 20 && !e.celebrate) checkpoint();

      // ---------------- drips
      e.dripT += dt;
      if (e.dripT > (st.graphics === "low" ? 0.9 : 0.45) && st.particles && !e.trans && isExterior(e.view)) {
        e.dripT = 0;
        spawnDrips();
      }
      e.fx.update(dt);

      // ---------------- composite dirty surfaces (visible first, budgeted)
      let budget = 140000;
      const regs = e.session.viewRegions(drawView);
      for (const r of regs) {
        const sv = e.sviews.get(r.panel);
        if (sv && sv.surf.dirty && budget > 0) budget -= sv.update(e.pal, budget);
      }

      // ---------------- draw
      const W = e.W;
      const H = e.H;
      const dpr = e.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const kind = kindOf(drawView);
      if (kind === "int") {
        ctx.fillStyle = "#0b0c0e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(getBackdrop(loc, W, H, cam.groundY, dpr, st.graphics), 0, 0, canvas.width, canvas.height);
        const waterAmt = Math.min(1, (s.ctx.water || 0) / 40);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (kind === "ext") {
          const b = s.model.views[drawView].bbox;
          drawWetFloor(ctx, cam.ox + (b.x0 + b.w / 2) * cam.s, cam.groundY, b.w * cam.s, waterAmt * (s.done.dry ? 0.5 : 1), e.t);
        }
        if (kind === "wheel") {
          ctx.fillStyle = "rgba(6,8,12,0.42)";
          ctx.fillRect(0, 0, W, H);
        }
      }

      // car / interior into the layer (so fades don't show overlapping parts)
      const target = alpha < 1 ? lctx : ctx;
      if (alpha < 1) {
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, layer.width, layer.height);
      }
      const shake = e.pwActive && !st.reducedMotion ? (Math.random() - 0.5) * 0.9 : 0;
      const camD = { ...cam, ox: cam.ox + slide + shake, oy: cam.oy + shake * 0.4 };
      applyCam(target, camD, dpr);
      const base = drawView.startsWith("wheel:") ? s.panels[drawView.slice(6)].primaryView : drawView;
      if (kind === "int") {
        drawInteriorBase(target, s.interior, base, { ...job.interior, paintRgb: hexToRgb(job.paint) }, loc);
        drawSurfaces(target, null, e.sviews, s.interior.views[base].regions);
        drawInteriorOverlay(target, s.interior, base);
        drawCrumbs(target, s.crumbs, base);
        for (const t of s.trash) if (!t.removed && t.view === base) drawTrashItem(target, t);
      } else {
        drawCarWithSurfaces(target, s.model, base, e.look, e.sviews, { wheelShine: null });
      }
      // cleaning assist: soft pulse on what the current stage still needs
      const cur = s.currentStage();
      const cdef = cur && STAGES[cur];
      if (st.assist && cdef && cdef.need && !e.celebrate && (s.fracs[cur] || 0) >= cdef.th - 0.12 && kindOf(drawView) === cdef.where) {
        const key = `${cur}|${drawView}`;
        e.assist.t += dt;
        if (e.assist.key !== key || e.assist.t > 0.8) {
          e.assist.key = key;
          e.assist.t = 0;
          e.assist.canvases.clear();
          const dom = new Set(s.domainSurfaces(cdef.domain).map((q) => q.id));
          for (const r of regs) {
            if (!dom.has(r.panel) || e.assist.canvases.has(r.panel)) continue;
            const c = buildAssistCanvas(s.surfaces[r.panel], cdef.need, s.ctx);
            if (c) e.assist.canvases.set(r.panel, c);
          }
        }
        const pulseA = st.reducedMotion ? 0.22 : 0.16 + 0.14 * Math.sin(e.t * 4.2);
        for (const r of regs) {
          const c = e.assist.canvases.get(r.panel);
          if (!c) continue;
          target.save();
          clipRegion(target, r);
          const m = r.aff;
          target.transform(m.a, m.b, m.c, m.d, m.e, m.f);
          target.globalAlpha = pulseA;
          target.drawImage(c, 0, 0);
          target.restore();
        }
      }
      // hint ring
      if (e.hint && now < e.hint.until && (e.hint.view === drawView)) {
        const k = (now % 900) / 900;
        target.save();
        target.strokeStyle = `rgba(255,214,90,${0.9 - k * 0.7})`;
        target.lineWidth = 3 / cam.s;
        target.beginPath();
        target.arc(e.hint.x, e.hint.y, (18 + k * 26) / cam.s, 0, Math.PI * 2);
        target.stroke();
        target.restore();
      } else if (e.hint && now >= e.hint.until) e.hint = null;

      // completion light sweep, clipped to the car
      if (e.celebrate && kind === "ext" && !e.trans) {
        const ct = (now - e.celebrate.t0) / 1000;
        const sv = s.model.views[base];
        const sweepT = (ct - 0.5) / 1.1;
        if (sweepT > 0 && sweepT < 1 && !st.reducedMotion) {
          target.save();
          if (sv.outline) target.clip(pathOf(sv.outline));
          drawLightSweep(target, sv.bbox, sweepT);
          target.restore();
        }
        if (!e.celebrate.sparks && ct > 0.7) {
          e.celebrate.sparks = true;
          const bb = sv.bbox;
          for (let k = 0; k < 4; k++) {
            const x = (bb.x0 + bb.w * (0.15 + 0.7 * Math.random())) * cam.s + cam.ox;
            const y = (bb.y0 + bb.h * (0.2 + 0.4 * Math.random())) * cam.s + cam.oy;
            setTimeout(() => e.fx.add({ type: "spark", x, y, vx: 0, vy: 0, g: 0, r: 5 + Math.random() * 3, life: 0.9 }), k * 180);
          }
          audio.sparkle();
        }
        if (ct > 2.0 && !e.completedSent) {
          e.completedSent = true;
          let after = null;
          try {
            after = snapshot(s, job, "left", 720, 405).toDataURL("image/jpeg", 0.86);
          } catch {
            after = null;
          }
          const d = s.takeStats();
          cbRef.current.onStats({ water: d.water * 0.14, foam: d.foam * 0.05, vacuumed: d.vacuum * 0.06 });
          const paintPanels = Object.values(s.model.panels).filter((q) => q.material === "paint").length;
          const windows = Object.values(s.model.panels).filter((q) => q.material === "glass").length;
          cbRef.current.onComplete({ result: s.results(), before: e.before, after, extra: { paintPanels, wheels: s.wheelPanels().length, windows } });
        }
      }

      if (alpha < 1) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.drawImage(layer, 0, 0);
        ctx.globalAlpha = 1;
      }

      // flying trash (bagged)
      if (e.flying.length) {
        applyCam(ctx, cam, dpr);
        e.flying = e.flying.filter((f) => {
          const k = (now - f.t0) / 450;
          if (k >= 1) return false;
          const q = ease(k);
          const it = { ...f.item, x: f.item.x + (1040 - f.item.x) * q, y: f.item.y + (620 - f.item.y) * q - Math.sin(q * Math.PI) * 90, size: f.item.size * (1 - q * 0.7) };
          drawTrashItem(ctx, it, 0);
          return true;
        });
      }

      // particles + tool, screen space
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      e.fx.draw(ctx);
      if (tl && P.inside && !e.celebrate && !menuRef.current) {
        const k = st.smoothing ? 1 - Math.pow(0.001, dt) : 1;
        P.sx += (P.x - P.sx) * Math.min(1, k * 1.4);
        P.sy += (P.y - P.sy) * Math.min(1, k * 1.4);
        if (P.active && def.mode === "spray" && tl !== "vacuum") {
          const [nx, ny] = nozzleTip(tl, P.sx, P.sy);
          drawStream(ctx, def.kind, nx, ny, P.x, P.y, e.t, 1);
        }
        if (!P.active && def.mode !== "pick") drawFootprint(ctx, P.x, P.y, def.radius * (1 + kit * 0.06));
        const sprX = def.mode === "spray" && tl !== "vacuum" ? P.x : P.sx;
        const sprY = def.mode === "spray" && tl !== "vacuum" ? P.y : P.sy;
        drawTool(ctx, tl, sprX, sprY, { tint, active: P.active, rot: P.rot, t: e.t, spin: e.spin, dirt: e.spongeDirt, wet: e.towelWet });
      }
    };
    raf = requestAnimationFrame(frame);

    const onBlur = () => release();
    const onVis = () => {
      if (document.visibilityState !== "visible") {
        release();
        if (E.current?.dirty) checkpoint();
      }
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      audio.stopAll();
    };
  }, [ready, loc, job, kit, tint, release, checkpoint, goView, showToast]);

  // final save on unmount (navigating away mid-job)
  useEffect(() => () => {
    const e = E.current;
    if (e && !e.session.completed && e.dirty) {
      try {
        const d = e.session.takeStats();
        cbRef.current.onStats({ water: d.water * 0.14, foam: d.foam * 0.05, vacuumed: d.vacuum * 0.06 });
        cbRef.current.onCheckpoint({ jobId: job.id, data: e.session.serialize(), view: e.view.startsWith("wheel:") ? "left" : e.view }, attemptKey);
      } catch {
        /* nothing to save */
      }
    }
    audio.stopAll();
    E.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------ pointer input */
  const localPt = (ev) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };

  const onPointerDown = (ev) => {
    const e = E.current;
    if (!e || phase !== "play" || menuOpen || e.trans) return;
    if (ev.button != null && ev.button !== 0) return;
    audio.unlock();
    const [x, y] = localPt(ev);
    const P = e.p;
    P.x = x;
    P.y = y;
    P.lastX = x;
    P.lastY = y;
    P.sx = x;
    P.sy = y;
    P.inside = true;
    if (!e.tool) return;
    if (TOOLS[e.tool].mode === "pick") {
      const [vx, vy] = [(x - e.cam.ox) / e.cam.s, (y - e.cam.oy) / e.cam.s];
      const t = e.session.pickTrash(e.view, vx, vy, 30 / e.cam.s);
      if (t) {
        e.flying.push({ item: t, t0: performance.now() });
        audio.pickup();
        cbRef.current.onTrash();
        e.dirty = true;
      }
      return;
    }
    try {
      canvasRef.current.setPointerCapture(ev.pointerId);
    } catch {
      /* capture not available */
    }
    P.active = true;
    P.id = ev.pointerId;
    e.lastStrokeT = performance.now() - 16;
    if (e.strokeNow && TOOLS[e.tool].mode === "spray") e.strokeNow(x, y, performance.now());
    ev.preventDefault();
  };

  const onPointerMove = (ev) => {
    const e = E.current;
    if (!e) return;
    const [x, y] = localPt(ev);
    const P = e.p;
    if (!P.inside) {
      P.sx = x;
      P.sy = y;
    }
    P.inside = true;
    // a mouse that is no longer pressed must never keep cleaning
    if (P.active && ev.pointerType === "mouse" && ev.buttons === 0) {
      release();
      P.x = x;
      P.y = y;
      return;
    }
    if (P.active && e.strokeNow) {
      e.lastMoveT = performance.now();
      e.strokeNow(x, y, e.lastMoveT);
    }
    else {
      P.x = x;
      P.y = y;
    }
  };

  const onPointerUp = (ev) => {
    const e = E.current;
    if (!e) return;
    if (e.p.active && e.strokeNow && ev.type === "pointerup") {
      const [x, y] = localPt(ev);
      e.strokeNow(x, y, performance.now()); // flush the last bit of the path
    }
    if (e.p.id === ev.pointerId || e.p.active) release();
    if (ev.pointerType !== "mouse") e.p.inside = false;
  };

  const onPointerLeave = (ev) => {
    const e = E.current;
    if (!e) return;
    if (ev.pointerType === "mouse") {
      e.p.inside = false;
      release();
    }
  };

  /* ----------------------------------------------------------- keyboard */
  useEffect(() => {
    const onKey = (ev) => {
      if (menuOpen || phase !== "play") return;
      const n = Number(ev.key);
      if (n >= 1 && n <= 9 && tools[n - 1]) setTool(tools[n - 1]);
      else if (ev.key === "Escape") openMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tools, menuOpen, phase, openMenu]);

  /* --------------------------------------------------------------- view */
  const e0 = E.current;
  const session = e0?.session;
  const extViews = ["front", "left", "right", "rear"];
  const wheels = session
    ? session.wheelPanels().map((p) => ({ id: p.id, label: p.label, short: `${p.id.includes("wheelF") ? "F" : "R"}${p.side}` }))
    : [];
  const wheelDone = {};
  for (const w of wheels) wheelDone[w.id] = (hud.wheels[w.id] || 0) >= STAGES.wheels.th || !!hud.done.wheels;
  const interiorViews = session?.interior ? Object.keys(session.interior.views) : [];
  const showWheels = job.stages.includes("wheels") || (job.optional || []).includes("tireShine");

  let trayMsg = null;
  let trayGo = null;
  if (session && !tools.length && phase === "play") {
    const cur = hud.current || session.activeOptional()[0];
    const def = cur && (STAGES[cur] || OPTIONAL[cur]);
    if (def) {
      if (def.where === "wheel") {
        trayMsg = "Next: clean the wheels — open WHEELS";
        trayGo = () => goView(`wheel:${(wheels.find((w) => !wheelDone[w.id]) || wheels[0]).id}`);
      } else if (def.where === "int") {
        trayMsg = `Next: ${def.verb ? def.verb.toLowerCase() : def.label.toLowerCase()} — open the interior`;
        trayGo = () => goView(def.view || interiorViews[0] || "cabin");
      } else {
        trayMsg = `Next: ${(def.verb || def.label).toLowerCase()} — back to the exterior`;
        trayGo = () => goView(def.view || "left");
      }
    }
  }

  return (
    <div className="cws-play" data-phase={phase}>
      <div ref={wrapRef} className="cws-play__stage">
        <canvas
          ref={canvasRef}
          className={`cws-canvas${tool ? " has-tool" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={(ev) => ev.preventDefault()}
        />
      </div>
      {!ready && (
        <div className="cws-loading">
          <div className="cws-loading__spinner" />
          <span>Preparing the wash bay…</span>
        </div>
      )}
      {ready && (
        <>
          <TopBar job={job} hud={hud} onHint={hint} onMenu={openMenu} hintBusy={phase !== "play"} />
          {toast && (
            <div key={toast.key} className={`cws-toast cws-toast--${toast.kind}`} role="status">{toast.text}</div>
          )}
          {hud.allDone && phase === "play" && (
            <button type="button" className="cws-finish" onClick={finishJob}><Icon.check /> FINISH JOB</button>
          )}
          <div className="cws-bottom">
            <ViewBar views={extViews} view={view} onView={goView} wheels={showWheels ? wheels : []} wheelState={wheelDone} pulse={pulse} interiorViews={interiorViews} />
            <ToolTray tools={tools} tool={tool} onTool={(t) => { audio.select(); setTool(t); }} tint={tint} message={trayMsg} onMessage={trayGo} />
          </div>
        </>
      )}
      {menuOpen && (
        <div className="cws-modal" role="dialog" aria-label="Paused">
          <div className="cws-modal__card">
            <h3>Paused</h3>
            <p className="cws-modal__sub">Job {job.id} · {job.name}</p>
            <div className="cws-pause-set">
              {[["sound", "Sound"], ["music", "Music"], ["assist", "Cleaning assist"], ["smoothing", "Tool smoothing"], ["particles", "Particles"]].map(([k, l]) => (
                <button key={k} type="button" className={`cws-toggle${settings[k] ? " is-on" : ""}`} onClick={() => onChangeSettings({ [k]: !settings[k] })}>
                  <i />{l}
                </button>
              ))}
            </div>
            <div className="cws-modal__actions">
              <button type="button" className="cws-btn cws-btn--primary" onClick={() => setMenuOpen(false)}><Icon.play /> Resume</button>
              <button type="button" className="cws-btn" onClick={() => { setMenuOpen(false); onJobs(); }}><Icon.list /> Job select</button>
              <button type="button" className="cws-btn" onClick={() => { setMenuOpen(false); onMenu(); }}><Icon.back /> Main menu</button>
            </div>
            <p className="cws-modal__note">Progress on this car is saved automatically. Use the Game Center Restart button to start this job over.</p>
          </div>
        </div>
      )}
    </div>
  );
}
