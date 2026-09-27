/**
 * Dentist Studio — treatment gameplay.
 *
 * React owns only the HUD (refreshed ~6x per second when something
 * changed). Everything high-frequency lives in a mutable engine ref and one
 * requestAnimationFrame loop: pointer → capsule strokes into the session's
 * cell layers → per-tooth overlay repaint → canvas draw. Strokes are applied
 * straight from pointer events (so fast flicks interpolate from the
 * previous point) and, for tools that also work held still, from the frame
 * loop. The treatment point is always the raw pointer; smoothing only moves
 * the drawn sprite.
 *
 * Safety: every exit path (pointerup / cancel / lost capture, leaving the
 * canvas, window blur, hidden tab, tool change, pause, completion, unmount)
 * goes through `release()`, which ends the stroke AND stops every sound loop.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TreatmentSession, EASE } from "../engine/session.js";
import { STAGES, TOOLS, stageKind, codeMessage } from "../engine/defs.js";
import { levelTools } from "../data/levels.js";
import { MouthRenderer, fitCamera, lerpCam, setWorld, renderSnapshot, drawBit } from "../render/mouthRenderer.js";
import { drawTool, TOOL_ANGLE, nozzlePoint } from "../render/toolSprites.js";
import { Effects, drawStream } from "../render/effects.js";
import { audio } from "../audio/audio.js";
import PatientFigure from "../components/PatientFigure.jsx";
import ClinicScene from "../components/ClinicScene.jsx";
import { Icon, ToolIcon, Stars } from "../components/ui.jsx";

const PRECISION_TOOLS = new Set(["brush", "scaler", "polisher", "cavity", "filler", "smoother", "stainBrush", "bracesBrush"]);
const ALIGN_TOOLS = new Set(["brush", "bracesBrush", "polisher", "stainBrush"]);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export default function Gameplay({
  level, patient, settings, toolSetDef, resume, muted, attemptKey, bestStars = 0,
  onCheckpoint, onStats, onHintUsed, onComplete, onRestart, onPatients, onMenu, onChangeSettings,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const hudRef = useRef(null);
  const trayRef = useRef(null);
  const E = useRef(null);
  const [phase, setPhase] = useState("intro");
  const [tool, setTool] = useState(null);
  const [view, setView] = useState("all");
  const [hud, setHud] = useState(null);
  const [toast, setToast] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const tools = useMemo(() => levelTools(level), [level]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const menuRef = useRef(false);
  menuRef.current = menuOpen;
  const cbRef = useRef({});
  cbRef.current = { onCheckpoint, onStats, onHintUsed, onComplete };
  const setRef = useRef(toolSetDef);
  setRef.current = toolSetDef;

  /* ------------------------------------------------------------ toasts */
  const toastTimer = useRef(0);
  const showToast = useCallback((text, kind = "info", ms = 2600) => {
    clearTimeout(toastTimer.current);
    setToast({ text, kind, key: performance.now() });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
    audio.setMusic(settings.music);
  }, [settings.sound, settings.music, muted]);

  /* ------------------------------------------------ build the session */
  if (!E.current) {
    const S = new TreatmentSession(level);
    let restored = false;
    if (resume?.data) restored = S.restore(resume.data);
    E.current = {
      S,
      restored,
      R: new MouthRenderer(S, patient, settings.graphics),
      fx: new Effects(),
      cam: null,
      trans: null,
      view: "all",
      W: 0,
      H: 0,
      dpr: 1,
      safe: { top: 60, bottom: 90, left: 12, right: 12 },
      p: { x: 0, y: 0, sx: 0, sy: 0, wx: 0, wy: 0, inside: false, active: false, id: null, lastT: 0, lastMoveT: 0, vx: 0, vy: 0, touch: false, ang: 0 },
      tool: null,
      grabbed: null,
      flossX: null,
      flyers: [],
      hint: null,
      contact: 0,
      spin: 0,
      time: 0,
      evalT: 0,
      hudT: 0,
      saveT: 0,
      dirty: false,
      lastCodeT: 0,
      codeAcc: 0,
      lastSparkT: 0,
      celebrate: null,
      doneSent: false,
      lastHud: "",
      tickT: 0,
    };
  }

  // dev-only handle for automated QA (stripped from production builds)
  if (import.meta.env?.DEV && typeof window !== "undefined") window.__dentistStudio = E.current;

  /* ------------------------------------------------------- checkpoint */
  const checkpoint = useCallback(() => {
    const e = E.current;
    if (!e || e.S.completed) return;
    cbRef.current.onCheckpoint({ levelId: level.id, data: e.S.serialize() }, attemptKey);
    e.dirty = false;
    e.saveT = 0;
  }, [level.id, attemptKey]);

  // save on the way out (screen change / unmount) — never after completion
  useEffect(() => () => {
    const e = E.current;
    if (e && !e.S.completed && e.dirty) cbRef.current.onCheckpoint({ levelId: level.id, data: e.S.serialize() }, attemptKey);
  }, [level.id, attemptKey]);

  /* ----------------------------------------------------------- release */
  const release = useCallback(() => {
    const e = E.current;
    if (e) {
      e.p.active = false;
      e.p.id = null;
      if (e.grabbed) {
        e.S.releaseGrab(e.grabbed);
        e.grabbed = null;
      }
      e.S.floss.gap = null;
      e.flossX = null;
    }
    audio.stopAll();
  }, []);

  useEffect(() => {
    E.current.tool = tool;
    release();
  }, [tool, release]);

  useEffect(() => () => {
    release();
    audio.stopAll();
  }, [release]);

  // default tool = the first step's tool
  useEffect(() => {
    const cur = E.current.S.currentStage;
    setTool(cur ? STAGES[stageKind(cur)].tool : tools[0]);
  }, [tools]);

  useEffect(() => {
    E.current.R.setQuality(settings.graphics);
  }, [settings.graphics]);

  /* ------------------------------------------------------------- views */
  const goView = useCallback((v) => {
    const e = E.current;
    if (!e || !e.cam || v === e.view) return;
    release();
    const to = fitCamera(e.S.mouth, v, e.W, e.H, e.safe);
    const reduced = settingsRef.current.reducedMotion;
    e.trans = { from: e.cam, to, t0: performance.now(), dur: reduced ? 1 : 300 };
    e.view = v;
    setView(v);
    audio.ui();
  }, [release]);

  /* ------------------------------------------------------------- hints */
  const hint = useCallback(() => {
    const e = E.current;
    if (!e || phaseRef.current !== "play") return;
    const h = e.S.hint();
    if (!h) return;
    e.S.hintsUsed++;
    cbRef.current.onHintUsed();
    audio.select();
    e.hint = { ...h, until: performance.now() + 3600 };
    // make sure the spot is on screen
    if (e.view !== "all") {
      const M = e.S.mouth.mouth;
      if ((e.view === "left" && h.x > M.cx + 30) || (e.view === "right" && h.x < M.cx - 30)) goView("all");
    }
    showToast(h.text, "hint", 4200);
    e.dirty = true;
  }, [showToast, goView]);

  /* ------------------------------------------------------------- pause */
  const openMenu = useCallback(() => {
    if (phaseRef.current !== "play") return;
    release();
    setMenuOpen(true);
    checkpoint();
    audio.ui();
  }, [release, checkpoint]);

  /* ------------------------------------------------------- main loop */
  useEffect(() => {
    const e = E.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let alive = true;

    const measure = () => {
      const r = wrap.getBoundingClientRect();
      const hudH = hudRef.current ? hudRef.current.getBoundingClientRect().height : 60;
      const trayH = trayRef.current ? trayRef.current.getBoundingClientRect().height : 84;
      const q = settingsRef.current.graphics;
      const dprMax = q === "low" ? 1 : q === "high" ? 2 : 1.5;
      const dpr = Math.min(dprMax, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(r.width));
      const H = Math.max(1, Math.round(r.height));
      e.safe = { top: hudH + 30, bottom: trayH + 8, left: 10, right: 10 };
      if (W !== e.W || H !== e.H || dpr !== e.dpr) {
        e.W = W;
        e.H = H;
        e.dpr = dpr;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      // on small screens start zoomed on one side so teeth stay easy to hit
      if (!e.cam) {
        const all = fitCamera(e.S.mouth, "all", W, H, e.safe);
        if (all.s < 0.42 && e.view === "all") {
          e.view = "left";
          setView("left");
        }
      }
      const cam = fitCamera(e.S.mouth, e.view, W, H, e.safe);
      if (e.trans) e.trans.to = cam;
      else e.cam = cam;
      if (!e.cam) e.cam = cam;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (hudRef.current) ro.observe(hudRef.current);
    if (trayRef.current) ro.observe(trayRef.current);

    const toWorld = (x, y) => [(x - e.cam.ox) / e.cam.s, (y - e.cam.oy) / e.cam.s];
    const toScreen = (x, y) => [x * e.cam.s + e.cam.ox, y * e.cam.s + e.cam.oy];
    const cupPos = () => [e.safe.left + 34, e.H - e.safe.bottom - 34];

    /* ---- apply the active tool along a world-space segment */
    e.apply = (ax, ay, bx, by, now, moving) => {
      const P = e.p;
      const tl = e.tool;
      const S = e.S;
      const st = settingsRef.current;
      if (!P.active || !tl || phaseRef.current !== "play" || menuRef.current || S.completed) return;
      const dt = clamp((now - P.lastT) / 1000, 0.001, 0.05);
      P.lastT = now;
      e.dirty = true;
      if (tl === "tweezers") {
        if (!e.grabbed) {
          const d = S.grab(bx, by);
          if (d) {
            e.grabbed = d;
            audio.grab();
          }
        } else {
          const r = S.tug(e.grabbed, bx, by);
          e.contact = Math.min(1, r.pull / 30);
          if (r.popped) {
            const d = e.grabbed;
            e.grabbed = null;
            audio.pop();
            const [sx, sy] = toScreen(bx, by);
            e.flyers.push({ kind: d.kind, size: d.size * e.cam.s, rot: d.rot, x0: sx, y0: sy, t0: now, dur: 480 });
          }
        }
        return;
      }
      if (tl === "floss") {
        const r = S.flossMove(ax, ay, bx, by);
        e.flossX = r.snapped ? r.x : null;
        if (r.travel > 0.3) {
          audio.loop("floss", 0.8);
          e.contact = 1;
          S.track(dt, true);
        }
        return;
      }
      const res = S.stroke(tl, ax, ay, bx, by, dt, moving);
      // precision: time spent on teeth that still need this tool vs. time misaimed
      // (gums, tongue, lips, or already-finished teeth)
      if (PRECISION_TOOLS.has(tl) && moving) S.track(dt, res.effective || res.relevant);
      e.contact = res.touched ? 1 : e.contact * 0.8;
      // gentle wrong-tool feedback, only when it keeps happening
      if (res.code && !res.effective) {
        e.codeAcc += dt;
        if (e.codeAcc > 0.35 && now - e.lastCodeT > 3200) {
          const msg = codeMessage(res.code, tl);
          if (msg) {
            e.lastCodeT = now;
            e.codeAcc = 0;
            showToast(msg, "soft", 2600);
            audio.soft();
          }
        }
      } else e.codeAcc = Math.max(0, e.codeAcc - dt);
      // sound
      const def = TOOLS[tl];
      if (def.loop) {
        const speed = Math.hypot(P.vx, P.vy);
        let lvl = 0;
        if (tl === "water") lvl = res.touched ? 1 : 0.6;
        else if (tl === "suction") lvl = res.sucked || S.pool.water > 0 ? 1 : 0.55;
        else if (tl === "polisher" || tl === "stainBrush" || tl === "cavity") lvl = res.touched ? 1 : 0.5;
        else if (tl === "scaler") lvl = res.scraped > 0 ? 1 : 0;
        else lvl = res.touched ? clamp(speed / 500, 0.25, 1) : 0;
        audio.loop(def.loop, lvl);
      }
      if (tl === "scaler" && res.scraped > 40 && Math.random() < 0.35) audio.tick();
      // particles (world space)
      if (!st.particles || !res.touched) return;
      const fx = e.fx;
      if (tl === "brush" && moving && res.touched) {
        if (Math.random() < 0.35) fx.burst("bubble", bx, by, 1, { speed: 40, r: 2.4, life: 0.6, g: -10 });
      } else if (tl === "scaler" && res.scraped > 0) {
        if (Math.random() < 0.5) fx.burst("fleck", bx, by, 1, { speed: 70, r: 2.2, life: 0.5, g: 260 });
      } else if (tl === "water") {
        if (Math.random() < 0.6) fx.burst("drop", bx, by, 2, { speed: 90, r: 1.8, life: 0.45, g: 320 });
        if (Math.random() < 0.12) fx.burst("mist", bx, by, 1, { speed: 12, r: 9, life: 0.5 });
      } else if (tl === "suction" && (res.sucked || S.pool.water > 0.02)) {
        if (Math.random() < 0.7) {
          const a = Math.random() * Math.PI * 2;
          fx.add({ type: "drop", x: bx + Math.cos(a) * 34, y: by + Math.sin(a) * 18, vx: 0, vy: 0, r: 1.8, life: 0.5, tx: bx, ty: by });
        }
      } else if ((tl === "polisher" || tl === "stainBrush") && res.effective) {
        if (Math.random() < 0.18) fx.burst("glint", bx + (Math.random() - 0.5) * 18, by + (Math.random() - 0.5) * 18, 1, { speed: 0, r: 4, life: 0.35 });
      } else if (tl === "cavity" && res.effective) {
        if (Math.random() < 0.3) fx.burst("dust", bx, by, 1, { speed: 30, r: 1.6, life: 0.5, g: 30 });
      }
    };

    /* ---- engine events → juice */
    const drainEvents = (now) => {
      const S = e.S;
      const st = settingsRef.current;
      for (const ev of S.events) {
        switch (ev.type) {
          case "toothClean":
          case "toothPolished":
            if (now - e.lastSparkT > 260) {
              e.lastSparkT = now;
              audio.sparkle();
            }
            e.fx.burst("sparkle", ev.x, ev.y, ev.type === "toothPolished" ? 3 : 2, { speed: 26, r: 7, life: 0.55 });
            break;
          case "chip":
            audio.chip();
            if (st.particles) e.fx.burst("chip", ev.x, ev.y, 3, { speed: 60, r: 3.4, life: 0.7, g: 200, color: ev.kind === "tartar" ? "#d9ccb0" : "#ecd490" });
            break;
          case "reveal":
            audio.reveal();
            e.fx.add({ type: "ring", x: ev.x, y: ev.y, vx: 0, vy: 0, r: 22, life: 0.6 });
            showToast("The mirror found a hidden food bit!", "good", 2400);
            break;
          case "debris":
            cbRef.current.onStats({ foodRemoved: 1 });
            break;
          case "flossSnap":
            audio.snap();
            break;
          case "flossDone":
            audio.sparkle();
            e.fx.burst("sparkle", ev.x, ev.y, 2, { speed: 20, r: 6, life: 0.5 });
            break;
          case "slurp":
            audio.slurp();
            break;
          case "stage": {
            audio.stage();
            const next = S.currentStage;
            if (next) {
              const d = STAGES[stageKind(next)];
              showToast(`${d.verb} — ${d.tip}`, "step", 3600);
            }
            e.saveT = 99; // checkpoint on the next frame
            break;
          }
          case "complete":
            if (!e.celebrate) {
              release();
              e.celebrate = { t0: now };
              setPhase("celebrate");
              audio.complete();
            }
            break;
          default:
            break;
        }
      }
      S.events.length = 0;
    };

    const pushHud = () => {
      const S = e.S;
      const T = S.totals();
      const cur = S.currentStage;
      const st = cur ? S.stageState(cur, T) : null;
      const h = {
        cur,
        latched: S.latched.length,
        frac: st ? Math.round(st.frac * 100) : 100,
        clean: Math.round(S.cleanliness(T) * 100),
        zones: st?.zones ? Object.fromEntries(Object.entries(st.zones).map(([k, v]) => [k, v >= 0.5])) : null,
        tidy: st?.tidy ?? true,
      };
      const key = JSON.stringify(h);
      if (key !== e.lastHud) {
        e.lastHud = key;
        setHud(h);
      }
    };
    pushHud();

    /* ---- frame */
    let last = performance.now();
    const frame = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      e.time += dt;
      const S = e.S;
      const P = e.p;
      const st = settingsRef.current;

      // camera transition
      if (e.trans) {
        const k = clamp((now - e.trans.t0) / e.trans.dur, 0, 1);
        e.cam = lerpCam(e.trans.from, e.trans.to, ease(k));
        if (k >= 1) e.trans = null;
      }

      // held-still treatment (spray, suction, mirror…)
      if (P.active && now - P.lastMoveT > 34 && e.tool && TOOLS[e.tool].stationary > 0 && e.tool !== "tweezers" && e.tool !== "floss") {
        e.apply(P.wx, P.wy, P.wx, P.wy, now, false);
      }
      if (!P.active) audio.reap();
      P.vx *= 0.85;
      P.vy *= 0.85;

      if (phaseRef.current === "play" || phaseRef.current === "celebrate") {
        S.tick(dt);
        e.evalT += dt;
        if (e.evalT > 0.12) {
          e.evalT = 0;
          S.evaluate();
        }
        drainEvents(now);
        e.hudT += dt;
        if (e.hudT > 0.16) {
          e.hudT = 0;
          pushHud();
        }
        e.saveT += dt;
        if (e.dirty && e.saveT > 6) checkpoint();
      }
      e.fx.update(dt);

      // celebration → results
      let smile = 0;
      let sweep = null;
      if (e.celebrate) {
        const t = (now - e.celebrate.t0) / 1000;
        smile = ease(clamp(t / 0.7, 0, 1));
        sweep = clamp((t - 0.25) / 0.9, 0, 1);
        if (!e.celebrate.spark && t > 0.5) {
          e.celebrate.spark = true;
          const teeth = S.teeth.filter((x) => x.g.index <= 2);
          for (let i = 0; i < 4; i++) {
            const tt = teeth[Math.floor(Math.random() * teeth.length)].g;
            e.fx.burst("sparkle", tt.x, tt.yGum + tt.dir * tt.h * tt.sy * 0.5, 1, { speed: 10, r: 10, life: 0.9 });
          }
          audio.sparkle();
        }
        if (t > 1.75 && !e.doneSent) {
          e.doneSent = true;
          let before = null;
          let after = null;
          try {
            before = renderSnapshot(new TreatmentSession(level), patient, 720, 420, { revealAll: true }).toDataURL("image/jpeg", 0.88);
            after = renderSnapshot(S, patient, 720, 420, {}).toDataURL("image/jpeg", 0.88);
          } catch {
            /* snapshots are a nicety */
          }
          cbRef.current.onComplete({ result: S.result(), before, after });
        }
      }

      /* ---- draw */
      const W = e.W;
      const H = e.H;
      const dpr = e.dpr;
      e.R.drawBackdrop(ctx, W, H, dpr);
      const kind = S.currentStage ? stageKind(S.currentStage) : null;
      let assist = null;
      const pulse = 0.5 + 0.5 * Math.sin(e.time * 4);
      if (kind === "final") {
        assist = new Set(S.teeth.filter((t) => !t.checked).map((t) => t.id));
      } else if (st.assist && kind && !["debris", "floss", "inspect"].includes(kind)) {
        const stt = S.stageState(S.currentStage);
        if (stt.frac >= 0.78) assist = new Set(S.remainingByTooth(kind).slice(0, 6).map((r) => r.t.id));
      }
      e.R.drawScene(ctx, e.cam, dpr, {
        time: e.time,
        smile,
        sweep,
        assist,
        pulse,
        grabbed: e.grabbed ? { id: e.grabbed.id, x: P.wx, y: P.wy } : null,
        showGaps: e.tool === "floss" && phaseRef.current === "play",
        flossGap: S.floss.gap?.id,
      });
      setWorld(ctx, e.cam, dpr);
      e.fx.draw(ctx);
      // hint ring
      if (e.hint && now < e.hint.until) {
        const a = clamp((e.hint.until - now) / 600, 0, 1);
        ctx.strokeStyle = `rgba(255, 200, 80, ${0.85 * a})`;
        ctx.lineWidth = 3.5 / e.cam.s;
        ctx.setLineDash([8 / e.cam.s, 6 / e.cam.s]);
        ctx.lineDashOffset = -e.time * 30;
        ctx.beginPath();
        ctx.arc(e.hint.x, e.hint.y, e.hint.r * (1 + 0.08 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // screen space from here
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // disposal cup (debris levels)
      if (S.debris.length) drawCup(ctx, ...cupPos(), S.debrisRemoved);
      for (let i = e.flyers.length - 1; i >= 0; i--) {
        const f = e.flyers[i];
        const t = clamp((now - f.t0) / f.dur, 0, 1);
        const [cx, cy] = cupPos();
        const x = f.x0 + (cx - f.x0) * t;
        const y = f.y0 + (cy - 14 - f.y0) * t - Math.sin(t * Math.PI) * 70;
        drawBit(ctx, f.kind, x, y, f.size * (1 - t * 0.3), f.rot + t * 4);
        if (t >= 1) {
          e.flyers.splice(i, 1);
          audio.plop();
        }
      }

      // tool sprite
      const tl = e.tool;
      const showTool = tl && P.inside && phaseRef.current === "play" && !menuRef.current;
      if (showTool) {
        const k = clamp(e.cam.s * 1.12, 0.6, 1.7);
        const smooth = st.smoothing ? 1 - Math.exp(-dt * 32) : 1;
        P.sx += (P.x - P.sx) * smooth;
        P.sy += (P.y - P.sy) * smooth;
        let tx = P.sx;
        let ty = P.sy;
        if (tl === "floss" && e.flossX != null) tx = toScreen(e.flossX, 0)[0];
        // orientation
        const base = TOOL_ANGLE[tl];
        let target = base + clamp(P.vx * 0.00035, -0.22, 0.22);
        if (ALIGN_TOOLS.has(tl) && P.active) {
          const sp = Math.hypot(P.vx, P.vy);
          if (sp > 120) {
            let d = Math.atan2(P.vy, P.vx);
            // fold to the direction nearest the resting angle
            while (d - base > Math.PI / 2) d -= Math.PI;
            while (d - base < -Math.PI / 2) d += Math.PI;
            target = base + clamp(d - base, -0.55, 0.55) * 0.6;
          }
        }
        P.ang += (target - P.ang) * (1 - Math.exp(-dt * 10));
        e.spin += dt * (P.active ? 26 : 3);
        // treatment footprint (honest reach), only while working
        if (P.active && !["mirror", "tweezers", "floss"].includes(tl)) {
          const rr = TOOLS[tl].radius * EASE.reach * e.cam.s;
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(P.x, P.y, rr, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (tl === "mirror") drawLens(ctx, canvas, P.x, P.y, 19 * k, dpr);
        if (tl === "water" && P.active) {
          const [nx, ny] = nozzlePoint(tx, ty, P.ang, k);
          drawStream(ctx, nx, ny, P.x, P.y, e.time, k);
        }
        drawTool(ctx, tl, tx, ty, P.ang, k, {
          set: setRef.current,
          contact: P.active ? e.contact : 0,
          spin: e.spin,
          open: !e.grabbed,
          snapped: e.flossX != null,
          foam: tl === "brush" && P.active && S.hasStage("brush") && !S.isLatched(S.stages.find((s) => stageKind(s) === "brush")) ? 1 : 0,
          time: e.time,
          lens: tl === "mirror",
        });
        if (tl === "tweezers" && e.grabbed) {
          const d = e.grabbed;
          const [gx, gy] = toScreen(P.wx, P.wy);
          drawBit(ctx, d.kind, gx, gy, d.size * e.cam.s * 0.9, d.rot);
        }
      }
    };
    raf = requestAnimationFrame(frame);

    const onBlur = () => release();
    const onVis = () => {
      if (document.visibilityState !== "visible") release();
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
  }, [level, patient, checkpoint, release, showToast]);

  /* ------------------------------------------------------- pointer */
  const localPoint = (ev) => {
    const r = canvasRef.current.getBoundingClientRect();
    const touch = ev.pointerType === "touch";
    // on touch, work just above the fingertip so the finger never hides the tool
    return [ev.clientX - r.left, ev.clientY - r.top - (touch ? 34 : 0), touch];
  };

  const onPointerDown = (ev) => {
    const e = E.current;
    if (phaseRef.current !== "play" || menuRef.current || !e.cam) return;
    if (ev.button !== undefined && ev.button !== 0 && ev.pointerType === "mouse") return;
    ev.preventDefault();
    audio.unlock();
    try {
      canvasRef.current.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    const [x, y, touch] = localPoint(ev);
    const P = e.p;
    P.touch = touch;
    P.x = x;
    P.y = y;
    if (!P.inside) {
      P.sx = x;
      P.sy = y;
      P.ang = TOOL_ANGLE[e.tool] || 0.6;
    }
    P.inside = true;
    P.active = true;
    P.id = ev.pointerId;
    const now = performance.now();
    P.lastT = now;
    P.lastMoveT = now;
    [P.wx, P.wy] = [(x - e.cam.ox) / e.cam.s, (y - e.cam.oy) / e.cam.s];
    e.apply(P.wx, P.wy, P.wx, P.wy, now, false);
  };

  const onPointerMove = (ev) => {
    const e = E.current;
    if (!e.cam) return;
    const [x, y, touch] = localPoint(ev);
    const P = e.p;
    if (P.active && ev.pointerId !== P.id) return;
    const now = performance.now();
    const dtm = Math.max(1, now - P.lastMoveT);
    P.vx = P.vx * 0.5 + ((x - P.x) / dtm) * 1000 * 0.5;
    P.vy = P.vy * 0.5 + ((y - P.y) / dtm) * 1000 * 0.5;
    if (!P.inside) {
      P.sx = x;
      P.sy = y;
      P.ang = TOOL_ANGLE[e.tool] || 0.6;
    }
    P.inside = true;
    P.touch = touch;
    P.x = x;
    P.y = y;
    P.lastMoveT = now;
    const ax = P.wx;
    const ay = P.wy;
    P.wx = (x - e.cam.ox) / e.cam.s;
    P.wy = (y - e.cam.oy) / e.cam.s;
    if (P.active) {
      // coalesced events keep very fast flicks precise; the capsule covers the rest
      const moved = Math.hypot(P.wx - ax, P.wy - ay);
      e.apply(ax, ay, P.wx, P.wy, now, moved > 0.35);
    }
  };

  const onPointerUp = (ev) => {
    const e = E.current;
    if (e.p.id !== null && ev.pointerId !== e.p.id) return;
    release();
    if (ev.pointerType === "touch") e.p.inside = false;
  };

  const onPointerLeave = (ev) => {
    const e = E.current;
    const captured = canvasRef.current?.hasPointerCapture?.(ev.pointerId);
    if (!captured) {
      if (e.p.active) release();
      e.p.inside = false;
    }
  };

  /* ------------------------------------------------------- keyboard */
  useEffect(() => {
    const onKey = (ev) => {
      if (phaseRef.current !== "play") return;
      if (ev.key === "Escape") {
        if (menuRef.current) setMenuOpen(false);
        else openMenu();
        return;
      }
      if (menuRef.current) return;
      const n = parseInt(ev.key, 10);
      if (n >= 1 && n <= tools.length) {
        setTool(tools[n - 1]);
        audio.select();
      } else if (ev.key === "h" || ev.key === "H") hint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tools, hint, openMenu]);

  /* ------------------------------------------------------- intro */
  const begin = useCallback(() => {
    audio.unlock();
    audio.select();
    setPhase(settingsRef.current.reducedMotion ? "play" : "zoom");
    if (!settingsRef.current.reducedMotion) setTimeout(() => setPhase((p) => (p === "zoom" ? "play" : p)), 320);
    const e = E.current;
    const cur = e.S.currentStage;
    if (cur && !e.restored) {
      const d = STAGES[stageKind(cur)];
      setTimeout(() => showToast(`${d.verb} — ${d.tip}`, "step", 4200), 340);
    } else if (e.restored) setTimeout(() => showToast("Welcome back — your progress on this patient was saved.", "info", 3000), 340);
  }, [showToast]);

  /* ------------------------------------------------------- render */
  const S = E.current.S;
  const curKind = hud?.cur ? stageKind(hud.cur) : null;
  const curDef = curKind ? STAGES[curKind] : null;
  const recommended = curDef?.tool;
  const stages = S.stages;
  const latchedN = hud?.latched ?? S.latched.length;
  // compact step window
  const winStart = stages.length <= 8 ? 0 : clamp(latchedN - 2, 0, stages.length - 7);
  const winEnd = stages.length <= 8 ? stages.length : winStart + 7;

  return (
    <div className="dst-screen dst-play">
      <div className={`dst-stage ${tool ? "dst-stage--tool" : ""}`} ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="dst-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={(ev) => ev.preventDefault()}
        />

        <header className="dst-hud" ref={hudRef}>
          <div className="dst-hud__who">
            <div className="dst-hud__face">
              <PatientFigure patient={patient} head mood={phase === "celebrate" ? "beam" : "calm"} look={0} />
            </div>
            <div className="dst-hud__names">
              <strong>{patient.name}</strong>
              <span>{level.caseType}</span>
            </div>
          </div>
          <ol className="dst-steps" aria-label="Procedure steps">
            {winStart > 0 && <li className="dst-step dst-step--more">+{winStart}</li>}
            {stages.slice(winStart, winEnd).map((id, i) => {
              const idx = winStart + i;
              const done = idx < latchedN;
              const now = idx === latchedN;
              return (
                <li key={id} className={`dst-step ${done ? "is-done" : ""} ${now ? "is-now" : ""}`} style={now ? { "--p": `${hud?.frac ?? 0}%` } : undefined}>
                  {done && <Icon name="check" size={11} stroke={3} />}
                  {STAGES[stageKind(id)].label}
                </li>
              );
            })}
            {winEnd < stages.length && <li className="dst-step dst-step--more">+{stages.length - winEnd}</li>}
          </ol>
          <div className="dst-hud__right">
            <div className="dst-clean" title="How clean the mouth is right now">
              <span>CLEAN</span>
              <strong>{hud?.clean ?? 0}%</strong>
            </div>
            <button type="button" className="dst-iconbtn dst-iconbtn--hint" onClick={hint} disabled={phase !== "play"} title="Hint (H)">
              <Icon name="hint" size={18} />
            </button>
            <button type="button" className="dst-iconbtn" onClick={openMenu} disabled={phase !== "play"} title="Pause (Esc)">
              <Icon name="pause" size={18} />
            </button>
          </div>
        </header>

        {phase === "play" && curDef && (
          <div className="dst-instr" key={hud?.cur}>
            <span className="dst-instr__verb">{curDef.verb}</span>
            {curKind === "final" && hud?.zones ? (
              <span className="dst-zones">
                {["upper", "lower", "left", "right"].map((z) => (
                  <span key={z} className={`dst-zone ${hud.zones[z] ? "is-done" : ""}`}>
                    {hud.zones[z] && <Icon name="check" size={10} stroke={3} />}
                    {z}
                  </span>
                ))}
                {!hud.tidy && <span className="dst-zone dst-zone--warn">tidy up</span>}
              </span>
            ) : (
              <span className="dst-instr__bar">
                <span style={{ width: `${hud?.frac ?? 0}%` }} />
              </span>
            )}
          </div>
        )}

        {toast && (
          <div className={`dst-toast dst-toast--${toast.kind}`} key={toast.key} role="status">
            {toast.text}
          </div>
        )}

        <footer className="dst-tray" ref={trayRef}>
          <div className="dst-tray__tools" role="toolbar" aria-label="Dental tools">
            {tools.map((id, i) => (
              <button
                key={id}
                type="button"
                className={`dst-tool ${tool === id ? "is-on" : ""} ${recommended === id && tool !== id ? "is-next" : ""}`}
                onClick={() => {
                  if (tool !== id) audio.select();
                  setTool(id);
                }}
                disabled={phase !== "play"}
                title={`${TOOLS[id].name} (${i + 1}) — ${TOOLS[id].desc}`}
              >
                <ToolIcon tool={id} set={toolSetDef} size={40} />
                <span>{TOOLS[id].name}</span>
                {recommended === id && tool !== id && <i className="dst-tool__dot" />}
              </button>
            ))}
          </div>
          <div className="dst-views" role="group" aria-label="View">
            <button type="button" className={view === "left" ? "is-on" : ""} onClick={() => goView("left")} disabled={phase !== "play"} title="Zoom left side">
              <Icon name="zoomL" size={15} />
            </button>
            <button type="button" className={view === "all" ? "is-on" : ""} onClick={() => goView("all")} disabled={phase !== "play"} title="Whole mouth">
              <Icon name="full" size={15} />
            </button>
            <button type="button" className={view === "right" ? "is-on" : ""} onClick={() => goView("right")} disabled={phase !== "play"} title="Zoom right side">
              <Icon name="zoomR" size={15} />
            </button>
          </div>
        </footer>

        {(phase === "intro" || phase === "zoom") && (
          <Intro level={level} patient={patient} zooming={phase === "zoom"} resumed={E.current.restored} bestStars={bestStars} onBegin={begin} onBack={onPatients} />
        )}

        {menuOpen && (
          <div className="dst-modal" role="dialog" aria-label="Paused">
            <div className="dst-card dst-pause">
              <h3>Treatment paused</h3>
              <p className="dst-dim">{level.name} · {patient.name}</p>
              <button type="button" className="dst-btn dst-btn--primary" onClick={() => { audio.ui(); setMenuOpen(false); }}>
                <Icon name="play" size={16} /> Resume
              </button>
              <button type="button" className="dst-btn" onClick={() => { setMenuOpen(false); onRestart(); }}>
                <Icon name="replay" size={16} /> Restart treatment
              </button>
              <div className="dst-pause__toggles">
                {[["sound", "Sound"], ["music", "Music"], ["assist", "Cleaning assist"], ["particles", "Particles"]].map(([k, label]) => (
                  <label key={k} className="dst-switch">
                    <input type="checkbox" checked={!!settings[k]} onChange={(ev) => onChangeSettings({ [k]: ev.target.checked })} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="dst-row">
                <button type="button" className="dst-btn" onClick={onPatients}>
                  <Icon name="users" size={16} /> Patients
                </button>
                <button type="button" className="dst-btn" onClick={onMenu}>
                  <Icon name="home" size={16} /> Menu
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pieces */

function Intro({ level, patient, zooming, resumed, bestStars, onBegin, onBack }) {
  return (
    <div className={`dst-intro ${zooming ? "is-zooming" : ""}`}>
      <ClinicScene patient={patient} mood="calm" pan={300} className="dst-intro__scene" />
      <div className="dst-bubble">“{level.request}”</div>
      <div className="dst-card dst-intro__card">
        <div className="dst-intro__lvl">Patient {level.id}</div>
        <h2>{level.name}</h2>
        <p className="dst-intro__case">
          <strong>{patient.name}</strong> · {level.caseType}
        </p>
        <ul className="dst-intro__steps">
          {level.stages.map((s) => (
            <li key={s}>{STAGES[stageKind(s)].label}</li>
          ))}
        </ul>
        {bestStars > 0 && (
          <div className="dst-intro__best">
            Best <Stars n={bestStars} size={14} />
          </div>
        )}
        <div className="dst-row">
          <button type="button" className="dst-btn" onClick={onBack}>
            <Icon name="back" size={16} /> Patients
          </button>
          <button type="button" className="dst-btn dst-btn--primary" onClick={onBegin} autoFocus>
            {resumed ? "Continue treatment" : "Begin treatment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function drawCup(ctx, x, y, n) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(60, 80, 90, 0.12)";
  ctx.beginPath();
  ctx.ellipse(0, 20, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(-18, 0, 18, 0);
  g.addColorStop(0, "#dff3f8");
  g.addColorStop(0.5, "#ffffff");
  g.addColorStop(1, "#c7e4ee");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-18, -16);
  ctx.lineTo(18, -16);
  ctx.lineTo(13, 20);
  ctx.lineTo(-13, 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(90, 150, 170, 0.6)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = "#8fd3e8";
  ctx.fillRect(-16, -4, 32, 5);
  ctx.fillStyle = "#e9f7fb";
  ctx.beginPath();
  ctx.ellipse(0, -16, 18, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (n > 0) {
    ctx.fillStyle = "#2f6f7e";
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(n), 0, 14);
  }
  ctx.restore();
}

/** Dental-mirror magnifier: copy the scene under the head, enlarged. */
function drawLens(ctx, canvas, x, y, r, dpr) {
  const zoom = 1.55;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const R = r * dpr;
  const cx = x * dpr;
  const cy = y * dpr;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  const src = (R * 2) / zoom;
  try {
    ctx.drawImage(canvas, cx - src / 2, cy - src / 2, src, src, cx - R, cy - R, R * 2, R * 2);
  } catch {
    /* ignore */
  }
  const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
  g.addColorStop(0, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(180, 215, 240, 0.28)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
}
