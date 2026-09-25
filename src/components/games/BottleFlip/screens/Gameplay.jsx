/**
 * Bottle Flip — gameplay screen.
 *
 * React owns only the HUD numbers, pause and hints. The bottle, camera,
 * particles and physics live in refs and are advanced by one
 * requestAnimationFrame loop (fixed physics steps inside session.update).
 *
 * Input: pointer events on the canvas (mouse + touch + pen), captured on
 * press, so releasing outside the game still ends the drag. pointercancel,
 * lost capture, window blur, pause and unmount all CANCEL a drag — only a
 * real release inside a valid aim throws.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createSession, update, launch, drainEvents, canThrow, quickRetry } from "../game/session.js";
import { createCamera, updateCamera } from "../game/camera.js";
import { renderGame } from "../render/renderer.js";
import { createFx, updateFx, spawn, floatText, burst, shake } from "../render/effects.js";
import { PHYS, wrap } from "../physics/constants.js";
import { platformTop } from "../physics/solids.js";
import { audio } from "../audio/audio.js";
import { Icon } from "../components/icons.jsx";

const DEAD = 14; // px — shorter drags cancel

function dragToAim(dx, dy, maxLen) {
  const len = Math.hypot(dx, dy);
  if (len < DEAD) return { dead: true, power: 0, angle: Math.PI / 2, cancel: false };
  let ang = Math.atan2(-dy, dx); // screen y is down
  // pointing clearly downward = cancel
  if (ang < -0.45 && ang > -Math.PI + 0.45) return { dead: false, cancel: true, power: 0, angle: Math.PI / 2 };
  if (ang < 0) ang = ang > -Math.PI / 2 ? PHYS.minAngle : Math.PI - PHYS.minAngle;
  ang = Math.max(PHYS.minAngle, Math.min(Math.PI - PHYS.minAngle, ang));
  const power = Math.min(1, (len - DEAD) / (maxLen - DEAD));
  return { dead: false, cancel: false, power, angle: ang };
}

export default function Gameplay({ level, skin, settings, muted, collectedInit, onEvent, onComplete, onPauseMenu, paused }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const sessionRef = useRef(null);
  const [hud, setHud] = useState(() => ({
    progress: 0,
    total: level.platforms.length - 1,
    collected: 0,
    falls: 0,
    streak: 0,
  }));
  const [hint, setHint] = useState(level.hint || null);
  const [thrown, setThrown] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const skinRef = useRef(skin);
  skinRef.current = skin;
  const cbRef = useRef({ onEvent, onComplete });
  cbRef.current = { onEvent, onComplete };

  // hide the hint after the first throw or a few seconds
  useEffect(() => {
    if (!hint) return undefined;
    const id = setTimeout(() => setHint(null), level.id === 1 ? 14000 : 5200);
    return () => clearTimeout(id);
  }, [hint, level.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapEl = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const s = createSession(level, { collected: collectedInit });
    sessionRef.current = s;
    const cam = createCamera();
    const fx = createFx();
    // dev-only inspection hook for manual QA (stripped from production builds)
    if (import.meta.env.DEV) window.__bottleFlip = { session: s, fx, cam };
    const vis = { tilt: 0, tiltV: 0, slosh: 0, time: 0, respawnK: 1, timeScale: 1 };
    const aim = { active: false, pointerId: null, sx: 0, sy: 0, power: 0, angle: Math.PI / 2, cancel: false, dead: true, last: null };
    let W = 1;
    let H = 1;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let focused = true;
    let completeTimer = 0;
    let lastHud = "";

    const targetDpr = () => {
      const q = settingsRef.current.graphics;
      return Math.min(window.devicePixelRatio || 1, q === "low" ? 1 : q === "high" ? 2 : 1.5);
    };
    const resize = () => {
      W = Math.max(1, wrapEl.clientWidth);
      H = Math.max(1, wrapEl.clientHeight);
      dpr = targetDpr();
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapEl);

    const pushHud = () => {
      const next = { progress: s.progress, total: s.finishIndex, collected: s.collected.size, falls: s.falls, streak: s.streak };
      const key = JSON.stringify(next);
      if (key !== lastHud) {
        lastHud = key;
        setHud(next);
      }
    };
    pushHud();

    const cancelAim = () => {
      if (!aim.active) return;
      if (aim.pointerId != null) {
        try {
          canvas.releasePointerCapture(aim.pointerId);
        } catch {
          /* already released */
        }
      }
      aim.active = false;
      aim.pointerId = null;
      audio.stopTension();
    };

    const maxLen = () => Math.max(110, Math.min(260, Math.min(W, H) * 0.34));

    const onDown = (e) => {
      if (pausedRef.current || aim.active || !canThrow(s)) return;
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      audio.unlock();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      aim.active = true;
      aim.pointerId = e.pointerId;
      aim.sx = e.clientX;
      aim.sy = e.clientY;
      aim.power = 0;
      aim.dead = true;
      aim.cancel = false;
      aim.angle = Math.PI / 2;
    };
    const onMove = (e) => {
      if (!aim.active || e.pointerId !== aim.pointerId) return;
      const r = dragToAim(e.clientX - aim.sx, e.clientY - aim.sy, maxLen());
      aim.power = r.power;
      aim.angle = r.angle;
      aim.dead = r.dead;
      aim.cancel = r.cancel;
      if (!r.dead && !r.cancel) audio.tension(r.power);
      else audio.stopTension();
    };
    const onUp = (e) => {
      if (!aim.active || e.pointerId !== aim.pointerId) return;
      const r = dragToAim(e.clientX - aim.sx, e.clientY - aim.sy, maxLen());
      cancelAim();
      if (r.dead || r.cancel || pausedRef.current) return;
      if (launch(s, r.angle, r.power)) {
        aim.last = { angle: r.angle, power: r.power, good: false };
        setThrown(true);
        setHint(null);
      }
    };
    const onCancel = (e) => {
      if (aim.active && e.pointerId === aim.pointerId) cancelAim();
    };
    const onLost = (e) => {
      if (aim.active && e.pointerId === aim.pointerId) {
        aim.pointerId = null;
        cancelAim();
      }
    };
    const onBlur = () => {
      focused = false;
      cancelAim();
    };
    const onFocus = () => {
      focused = true;
      last = performance.now();
    };
    const onVis = () => {
      if (document.hidden) cancelAim();
      last = performance.now();
    };
    const onKey = (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.key === "Escape" && aim.active) {
        cancelAim();
        return;
      }
      if ((e.key === "r" || e.key === "R") && !pausedRef.current && (s.state === "flight" || s.state === "contact")) {
        quickRetry(s);
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("lostpointercapture", onLost);
    // fallback if capture was refused: a release anywhere still ends the drag
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("keydown", onKey);

    const handleEvents = () => {
      const st = settingsRef.current;
      const sk = skinRef.current;
      let hudDirty = false;
      for (const e of drainEvents(s)) {
        switch (e.type) {
          case "launch":
            audio.release(e.power);
            cbRef.current.onEvent({ flips: 1 });
            break;
          case "swish":
            if (e.half <= 6) audio.swish(e.half);
            break;
          case "impact": {
            audio.impact(e.surface, e.speed, e.base);
            const k = Math.min(1, e.speed / 600);
            vis.slosh = Math.min(1, vis.slosh + k);
            vis.tiltV += (s.body.vx >= 0 ? -1 : 1) * k * 6;
            if (st.particles && e.speed > 160) {
              const n = st.graphics === "low" ? 2 : 4;
              spawn(fx, "dust", e.x, e.y + 0.5, n, { a0: 0, spread: Math.PI, speed: 30, life: 0.45, size: 1.3, color: "rgba(255,255,255,0.55)" });
              spawn(fx, "drop", e.x, e.y + 6, n, { a0: Math.PI * 0.25, spread: Math.PI * 0.5, speed: 55, life: 0.4, size: 0.9, color: sk.liquid[0], g: 300 });
            }
            break;
          }
          case "collect":
            audio.collect();
            if (st.particles) spawn(fx, "spark", e.x, e.y, st.graphics === "low" ? 4 : 8, { speed: 55, life: 0.6, size: 1.8, color: "#ffd75e" });
            burst(fx, e.x, e.y, { r: 16, max: 0.35 });
            hudDirty = true;
            break;
          case "wobble":
            audio.wobble();
            break;
          case "land": {
            vis.tiltV += 2;
            if (aim.last) aim.last.good = e.flipped;
            if (e.perfect) {
              audio.perfect();
              fx.flash = 1;
              floatText(fx, "PERFECT!", e.x, e.y + 34, { color: "#ffe27a", size: 1.15, sub: e.streak >= 2 ? `${e.streak}x FLIP STREAK` : undefined });
              if (st.particles) spawn(fx, "spark", e.x, e.y + 4, st.graphics === "low" ? 3 : 7, { a0: Math.PI * 0.1, spread: Math.PI * 0.8, speed: 70, life: 0.7, size: 1.7, color: "#ffe27a" });
              burst(fx, e.x, e.y + 8, { r: 22 });
            } else if (e.flipped) {
              audio.land(e.surface);
              if (e.turns >= 2) floatText(fx, e.turns >= 3 ? "TRIPLE FLIP!" : "DOUBLE FLIP!", e.x, e.y + 34, { color: "#9fe8ff", sub: e.streak >= 2 ? `${e.streak}x FLIP STREAK` : undefined });
              else if (e.streak >= 2) floatText(fx, `${e.streak}x ${e.streak >= 3 ? "FLIP STREAK" : "CLEAN FLIP"}`, e.x, e.y + 32, { color: "#bff5dc", size: 0.8 });
              else if (e.progressed) floatText(fx, "NICE!", e.x, e.y + 30, { color: "#ffffff", size: 0.7, max: 0.8 });
            }
            if (e.flipped && e.streak >= 2) audio.streak(e.streak);
            cbRef.current.onEvent({ landings: 1, perfects: e.perfect ? 1 : 0, bestStreak: s.bestStreak });
            hudDirty = true;
            break;
          }
          case "fail":
            audio.fail();
            if (st.shake && !st.reducedMotion && e.reason !== "retry") shake(fx, 5);
            if (st.particles && e.reason === "floor") spawn(fx, "dust", e.x, 1, 4, { a0: 0, spread: Math.PI, speed: 35, life: 0.5, size: 1.6, color: "rgba(255,255,255,0.5)" });
            cbRef.current.onEvent({ fails: 1 });
            hudDirty = true;
            break;
          case "respawn":
            audio.respawn();
            vis.respawnK = 0;
            vis.tilt = 0;
            vis.tiltV = 0;
            vis.slosh = 0.4;
            break;
          case "complete":
            audio.complete();
            burst(fx, s.body.x, s.body.y, { r: 40, max: 0.55 });
            if (st.particles) spawn(fx, "spark", s.body.x, s.body.y + 6, st.graphics === "low" ? 5 : 12, { a0: Math.PI * 0.1, spread: Math.PI * 0.8, speed: 90, life: 0.8, size: 1.9, color: "#ffe27a" });
            completeTimer = 0.55;
            break;
          default:
            break;
        }
      }
      if (hudDirty) pushHud();
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      // belt and braces next to the ResizeObserver (fullscreen, rotation)
      if (Math.max(1, wrapEl.clientWidth) !== W || Math.max(1, wrapEl.clientHeight) !== H || targetDpr() !== dpr) resize();
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      dt = Math.min(dt, PHYS.maxFrame);
      const running = !pausedRef.current && focused && !document.hidden;
      if (running) {
        // slow emphasis while the bottle settles on the finish
        const onFinish = s.state === "contact" && Math.abs(wrap(s.body.a)) < 0.35 && (() => {
          const fp = level.platforms[s.finishIndex];
          const t = platformTop(fp, s.t);
          return s.body.x > t.x0 - 4 && s.body.x < t.x1 + 4 && Math.abs(s.body.y - 8 - t.top) < 6;
        })();
        const target = onFinish ? 0.4 : 1;
        vis.timeScale += (target - vis.timeScale) * Math.min(1, dt * 10);
        update(s, dt * vis.timeScale);
        handleEvents();
        vis.time += dt;
        // liquid spring
        const b = s.body;
        const target2 = s.state === "flight" ? Math.max(-0.5, Math.min(0.5, -b.w * 0.03)) : Math.max(-0.4, Math.min(0.4, -wrap(b.a) * 0.8));
        vis.tiltV += ((target2 - vis.tilt) * 70 - vis.tiltV * 7) * dt;
        vis.tilt += vis.tiltV * dt;
        vis.tilt = Math.max(-0.7, Math.min(0.7, vis.tilt));
        vis.slosh *= Math.exp(-2.6 * dt);
        if (vis.respawnK < 1) vis.respawnK = Math.min(1, vis.respawnK + dt / 0.22);
        updateFx(fx, dt);
        if (completeTimer > 0) {
          completeTimer -= dt;
          if (completeTimer <= 0) {
            cbRef.current.onComplete({
              falls: s.falls,
              perfects: s.perfects,
              collected: s.collected.size,
              flips: s.flips,
              bestStreak: s.bestStreak,
            });
          }
        }
      }
      updateCamera(cam, s, W, H, running ? dt : 0);
      const v = { cx: cam.x, cy: cam.y, s: cam.s, W, H, dpr };
      const st = settingsRef.current;
      renderGame(ctx, v, s, fx, {
        skin: skinRef.current,
        tilt: vis.tilt,
        slosh: vis.slosh,
        time: vis.time,
        respawnK: vis.respawnK,
        quality: st.graphics,
        settings: st,
        aim: aim.active && !aim.dead ? aim : aim.active ? { ...aim, power: 0 } : null,
        uiScale: Math.max(0.8, Math.min(1.5, H / 560)),
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("lostpointercapture", onLost);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
      audio.stopAll();
      sessionRef.current = null;
    };
    // one engine per mounted attempt; parent remounts via key to restart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pausing always drops a drag in progress
  useEffect(() => {
    if (paused) audio.stopTension();
  }, [paused]);

  useEffect(() => {
    if (muted) audio.stopAll();
  }, [muted]);

  const pips = [];
  for (let i = 1; i <= hud.total; i++) pips.push(<i key={i} className={i <= hud.progress ? "is-on" : ""} />);
  const nColl = level.collectibles?.length || 0;
  const wind = level.wind || 0;

  const onPause = useCallback(() => {
    audio.ui();
    onPauseMenu();
  }, [onPauseMenu]);

  return (
    <div className="bf-play">
      <div ref={wrapRef} className="bf-canvas-wrap">
        <canvas ref={canvasRef} className="bf-canvas" aria-label={`Level ${level.id} — drag from the bottle and release to flip`} />
      </div>
      <div className="bf-hud">
        <div className="bf-hud__left">
          <button type="button" className="bf-iconbtn" onClick={onPause} aria-label="Pause">
            <Icon.pause />
          </button>
          <div className="bf-hud__level">
            <b>LEVEL {level.id}</b>
            <span>{level.name}</span>
          </div>
        </div>
        <div className="bf-hud__center">
          <div className="bf-pips" aria-label={`${hud.progress} of ${hud.total} landings`}>{pips}</div>
          <span className="bf-hud__count">
            {hud.progress} / {hud.total} {hud.total === 1 ? "LANDING" : "LANDINGS"}
          </span>
        </div>
        <div className="bf-hud__right">
          {nColl > 0 && (
            <span className="bf-chip" title="Bonus stars">
              <Icon.star /> {hud.collected}/{nColl}
            </span>
          )}
          <span className="bf-chip bf-chip--dim" title={`Falls (★ at ${level.par} or fewer)`}>
            <Icon.fall /> {hud.falls}
          </span>
        </div>
      </div>
      {wind !== 0 && (
        <div className="bf-wind" title="Wind pushes the bottle while it's in the air">
          <span>WIND</span>
          <i style={{ transform: `scaleX(${wind > 0 ? 1 : -1})` }}>
            <Icon.arrow />
          </i>
          <b>{Math.round(Math.abs(wind) / 10)}</b>
        </div>
      )}
      {hint && (
        <div className={`bf-hint${level.id === 1 && !thrown ? " bf-hint--tutorial" : ""}`}>
          {level.id === 1 && !thrown && <span className="bf-hand" aria-hidden="true" />}
          {hint}
        </div>
      )}
    </div>
  );
}
