/**
 * Boxing Club — one training drill. Same controls, same fighter rules and
 * the same painter as a fight; the drill logic lives in engine/training.js.
 * One rAF loop + one input controller for the lifetime of the screen.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createBagDrill, stepBagDrill, createPadDrill, stepPadDrill, scoreBag, medalFor, DRILLS, bagCenterX, attackLabel } from "../engine/training.js";
import { ATTACKS } from "../engine/attacks.js";
import { createInput } from "../utils/input.js";
import { computePose, createAnim, updateAnim } from "../render/rig.js";
import { drawFighter, drawShadow, makeProjector } from "../render/fighterArt.js";
import { drawBackdrop, worldToScreen } from "../render/arena.js";
import { createView, renderFight, gloveScreen } from "../render/scene.js";
import { createFx, impact, blockSpark, word, stepFx, drawFx, clearFx } from "../render/fx.js";
import { arenaById } from "../data/arenas.js";
import { audio } from "../audio/audio.js";
import TouchControls from "../components/TouchControls.jsx";
import { Icon } from "../components/icons.jsx";

const COACH_LOOK = { skin: "#a86c43", hair: "bald", hairColor: "#1d1712", shorts: "#1c1c22", shortsTrim: "#f2c14e", shoes: "#1c1c22", gloves: { base: "#f2c14e", trim: "#1c1c22", cuff: "#1c1c22" }, build: 1.05 };
const MEDAL = ["NO MEDAL", "BRONZE", "SILVER", "GOLD"];

function drawMatFloor(ctx, W, H, cam) {
  const fl = worldToScreen(cam, -4, 0, -1.6);
  const fr = worldToScreen(cam, 4, 0, 1.4);
  const g = ctx.createLinearGradient(0, fl.y, 0, fr.y);
  g.addColorStop(0, "#1d2a44");
  g.addColorStop(1, "#2b3d63");
  ctx.fillStyle = g;
  ctx.fillRect(0, fl.y, W, H - fl.y);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  for (let i = -4; i <= 4; i++) {
    const a = worldToScreen(cam, i, 0, -1.6);
    const b = worldToScreen(cam, i * 1.1, 0, 1.4);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawHeavyBag(ctx, cam, d) {
  const b = d.bag;
  const piv = worldToScreen(cam, b.pivotX, b.pivotY + 0.6, -0.05);
  const cx = bagCenterX(d);
  const top = { x: b.pivotX + Math.sin(b.theta) * (b.L - 0.5), y: b.pivotY - Math.cos(b.theta) * (b.L - 0.5) };
  const topS = worldToScreen(cam, top.x, top.y, -0.05);
  ctx.strokeStyle = "#8a8f96";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(piv.x, 0);
  ctx.lineTo(topS.x, topS.y);
  ctx.stroke();
  const c = worldToScreen(cam, cx, b.pivotY - Math.cos(b.theta) * b.L, -0.05);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(-b.theta * 0.9);
  const w = b.r * cam.S;
  const h = 0.95 * cam.S;
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, "#2a100c");
  g.addColorStop(0.35, b.flash > 0 ? "#c24a36" : "#9a3526");
  g.addColorStop(1, "#1f0b08");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-w, -h / 2, w * 2, h, w * 0.8);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(-w, -h * 0.28, w * 2, 6);
  ctx.fillRect(-w, h * 0.22, w * 2, 6);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `900 ${Math.round(w * 0.55)}px Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("BC", 0, 4);
  ctx.restore();
}

function drawSpeedBag(ctx, cam, d) {
  const sb = d.speedBag;
  const plat = worldToScreen(cam, sb.x - 0.1, 2.02, -0.1);
  ctx.fillStyle = "#3a2618";
  ctx.fillRect(plat.x - 0.45 * cam.S, plat.y - 10, 0.9 * cam.S, 14);
  ctx.fillStyle = "#1a120c";
  ctx.fillRect(plat.x - 0.04 * cam.S, 0, 0.08 * cam.S, plat.y - 10);
  const c = worldToScreen(cam, sb.x, sb.y, -0.1);
  const swing = Math.sin(sb.spin * Math.PI * 3) * 0.6 * sb.spin;
  ctx.save();
  ctx.translate(plat.x, plat.y + 4);
  ctx.rotate(swing);
  const L = plat.y + 4 - c.y;
  const g = ctx.createRadialGradient(-6, -L * 0.2 + L, 2, 0, L * 0.85, L * 0.55);
  g.addColorStop(0, "#e2574a");
  g.addColorStop(1, "#6a1c14");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -L * 0.55 + L * 0.2, L * 0.28, L * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export default function DrillScreen({ kind, player, settings, muted, touch, onFinish, onExit }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const isBag = kind === "heavy" || kind === "speed";
  const drill = useMemo(() => (isBag ? createBagDrill(kind, player.stats) : createPadDrill(kind, player.stats, 7)), [kind, isBag, player.stats]);
  const input = useMemo(() => createInput(), []);
  const [hud, setHud] = useState({});
  const [done, setDone] = useState(null);
  const sent = useRef(false);

  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
    audio.setMusic(settings.music && !muted, "fight");
    audio.crowd(0);
  }, [settings.sound, settings.music, muted]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const arena = arenaById("gym");
    const fx = createFx();
    const view = createView();
    const anim = isBag ? createAnim(drill.fighter) : null;
    let W = 1;
    let H = 1;
    let dpr = 1;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, settingsRef.current.graphics === "low" ? 1 : 2);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    input.attach();
    let raf = 0;
    let last = performance.now();
    let hudT = 0;
    let t = 0;
    let alive = true;
    const pending = [];

    const frame = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(100, now - last);
      last = now;
      t += dt / 1000;
      const st = settingsRef.current;
      const inp = input.frame();
      if (inp.pause) {
        onExit();
        return;
      }
      const evs = isBag ? stepBagDrill(drill, dt, inp) : stepPadDrill(drill, dt, inp);
      for (const e of evs) {
        if (e.type === "bag") {
          audio.bag(e.power / 100);
          pending.push(e);
        } else if (e.type === "whiff") audio.whiff(ATTACKS[e.attack]?.kind === "hook" ? "hook" : "jab");
        else if (e.type === "sbHit") {
          audio.speedBag();
          if (e.perfect && e.streak % 8 === 0) pending.push({ type: "word", text: `${e.streak} STREAK` });
        } else if (e.type === "sbMiss") audio.back();
        else if (e.type === "beat") audio.count();
        else if (e.type === "signal") audio.signal();
        else if (e.type === "hit") {
          audio.hit(ATTACKS[e.attack].kind === "hook" ? "hook" : "jab");
          pending.push(e);
        } else if (e.type === "block") {
          audio.block("cross");
          pending.push(e);
        } else if (e.type === "perfect") audio.perfect();
        else if (e.type === "drillResult") pending.push({ type: "word", text: e.outcome === "hit" ? "HIT!" : e.outcome === "perfect" ? "PERFECT" : e.outcome === "distance" ? "OUT OF RANGE" : "GOOD", good: e.outcome !== "hit" });
        else if (e.type === "comboDone") {
          audio.success();
          pending.push({ type: "word", text: `+${e.pts}`, good: true });
        } else if (e.type === "comboWrong") audio.back();
        else if (e.type === "drillOver" && !sent.current) {
          sent.current = true;
          const score = e.score;
          const medal = medalFor(kind, score);
          const res = onFinish(kind, score, medal);
          audio.bell(1);
          setTimeout(() => alive && setDone({ score, medal, ...res }), 600);
        }
      }

      // ---- draw
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (isBag) {
        const S = Math.min(W / 5.2, H / 3.2);
        const f = drill.fighter;
        const cam = { S, cx: W * 0.42, floorY: H * 0.84, camX: 0 };
        ctx.clearRect(0, 0, W, H);
        drawBackdrop(ctx, { ...cam, camX: 0 }, W, H, arena, t, { excite: 0, detail: st.graphics, reduced: true, flashes: [] });
        drawMatFloor(ctx, W, H, cam);
        updateAnim(anim, f, dt, st.reducedMotion);
        const dist = kind === "heavy" ? bagCenterX(drill) - f.x : 0.9;
        const pose = computePose(f, anim, dist, t, { build: player.look.build });
        drawShadow(ctx, cam, f, pose);
        if (kind === "heavy") drawHeavyBag(ctx, cam, drill);
        drawFighter(ctx, cam, f, pose, player.look, { lowDetail: st.graphics === "low" });
        if (kind === "speed") drawSpeedBag(ctx, cam, drill);
        while (pending.length) {
          const p = pending.shift();
          if (p.type === "bag") {
            const hand = ATTACKS[p.attack].hand;
            const g = makeProjector(cam, f)(hand === "lead" ? pose.gloveL : pose.gloveR);
            impact(fx, g.x + 0.08 * S, g.y, 1, Math.max(0.3, p.power / 100), S, { detail: st.graphics, particles: st.particles });
            if (p.combo >= 3) word(fx, `${p.combo} HIT`, g.x + 0.3 * S, g.y - 0.4 * S, "#fff", 0.8);
          } else if (p.type === "word") {
            word(fx, p.text, W * 0.62, H * 0.3, "#7ee7ff", 0.9);
          }
        }
        stepFx(fx, dt);
        drawFx(ctx, fx, S);
      } else {
        const r = renderFight(ctx, W, H, drill.fight, view, fx, {
          detail: st.graphics, particles: st.particles, shake: st.cameraShake, reduced: st.reducedMotion,
          lookP: player.look, lookO: COACH_LOOK, arena, frozen: drill.fight.hitstop > 0,
        }, dt);
        while (pending.length) {
          const p = pending.shift();
          if (p.type === "word") {
            word(fx, p.text, W / 2, H * 0.3, p.good ? "#7ee08a" : "#ff7a6a", 1);
            continue;
          }
          const g = gloveScreen(view, drill.fight, p.who, ATTACKS[p.attack].hand);
          if (!g) continue;
          const dir = p.who === "player" ? 1 : -1;
          if (p.type === "hit") impact(fx, g.x, g.y, dir, 0.6, r.cam.S, { detail: st.graphics, particles: st.particles });
          else blockSpark(fx, g.x, g.y, dir, r.cam.S, { particles: st.particles });
        }
      }

      // ---- HUD (10 Hz)
      hudT -= dt;
      if (hudT <= 0) {
        hudT = 100;
        if (isBag) {
          const s = drill.stats;
          setHud({
            time: Math.max(0, Math.ceil((drill.duration - drill.t) / 1000)),
            score: scoreBag(drill),
            power: s.lastPower, combo: s.combo, best: s.bestCombo,
            acc: s.thrown ? Math.round((s.hits / s.thrown) * 100) : 0,
            stam: s.samples ? Math.round((s.fresh / s.samples) * 100) : 100,
            onBeat: s.onBeat, perfect: s.perfect, streak: s.streak, misses: s.misses, bpm: Math.round(drill.beat.bpm),
          });
        } else {
          setHud({
            score: drill.score,
            prompt: drill.prompt ? { ...drill.prompt } : null,
            n: kind === "dodge" ? drill.results.length : drill.comboIdx,
            total: kind === "dodge" ? DRILLS.dodge.count : drill.combos.length,
            time: kind === "combo" ? Math.max(0, Math.ceil((DRILLS.combo.duration - drill.t) / 1000)) : null,
          });
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      input.detach();
      clearFx(fx);
    };
    // one loop for this drill's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill]);

  const d = DRILLS[kind];
  return (
    <div className="bc-fight bc-drillscreen" ref={wrapRef}>
      <canvas ref={canvasRef} className="bc-fight__canvas" aria-label={d.name} />
      <div className="bc-drillhud">
        <div className="bc-drillhud__title">{d.name.toUpperCase()}</div>
        {kind === "heavy" && (
          <>
            <Stat k="TIME" v={`${hud.time ?? 40}s`} />
            <Stat k="SCORE" v={hud.score ?? 0} big />
            <Stat k="HIT POWER" v={hud.power ?? 0} />
            <Stat k="COMBO" v={`${hud.combo ?? 0} (best ${hud.best ?? 0})`} />
            <Stat k="ACCURACY" v={`${hud.acc ?? 0}%`} />
            <Stat k="STAMINA CONTROL" v={`${hud.stam ?? 100}%`} />
          </>
        )}
        {kind === "speed" && (
          <>
            <Stat k="TIME" v={`${hud.time ?? 40}s`} />
            <Stat k="ON BEAT" v={hud.onBeat ?? 0} big />
            <Stat k="PERFECT" v={hud.perfect ?? 0} />
            <Stat k="STREAK" v={hud.streak ?? 0} />
            <Stat k="MISSES" v={hud.misses ?? 0} />
            <Stat k="TEMPO" v={`${hud.bpm ?? 96} bpm`} />
          </>
        )}
        {(kind === "dodge" || kind === "combo") && (
          <>
            <Stat k={kind === "dodge" ? "ATTACKS" : "COMBOS"} v={`${hud.n ?? 0}/${hud.total ?? d.count}`} />
            <Stat k="SCORE" v={hud.score ?? 0} big />
            {hud.time !== null && hud.time !== undefined && <Stat k="TIME" v={`${hud.time}s`} />}
          </>
        )}
      </div>
      {kind === "dodge" && hud.prompt && <div className={`bc-signal is-${hud.prompt.want}`} key={hud.prompt.text + hud.n}>{hud.prompt.text}<small>{hud.prompt.want === "slip" ? "Shift + A / D" : hud.prompt.want === "duck" ? "Shift + D (slip in)" : "Hold Space"}</small></div>}
      {kind === "combo" && hud.prompt && (
        <div className={`bc-comboprompt${hud.prompt.wrong ? " is-wrong" : ""}`}>
          {hud.prompt.combo.map((a, i) => <span key={i} className={i < hud.prompt.step ? "is-done" : i === hud.prompt.step ? "is-now" : ""}>{attackLabel(a)}</span>)}
        </div>
      )}
      {kind === "speed" && <div className="bc-help">Punch <kbd>J</kbd>/<kbd>K</kbd> on the beat — the tempo keeps rising</div>}
      {kind === "heavy" && <div className="bc-help">Stay at range, mix <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd>, keep stamina above a quarter</div>}
      {touch && !done && <TouchControls input={input} />}
      <button type="button" className="bc-fight__pause" onClick={onExit} aria-label="Leave drill"><Icon.back /></button>
      {done && (
        <div className="bc-result" role="dialog" aria-label="Drill result">
          <div className={`bc-result__card${done.medal ? " is-win" : ""}`}>
            <div className="bc-result__method">{d.name}</div>
            <div className="bc-result__verdict">{done.score}</div>
            <div className={`bc-medal bc-medal--big m${done.medal}`}>{MEDAL[done.medal]}</div>
            <p className="bc-result__vs">Medal targets: {d.medals.join(" / ")}</p>
            {(done.gained > 0 || done.newGloves?.length > 0) && (
              <ul className="bc-result__rewards">
                {done.gained > 0 && <li>+{done.gained} Training Point{done.gained > 1 ? "s" : ""}</li>}
                {done.newGloves?.length > 0 && <li>New gloves unlocked!</li>}
              </ul>
            )}
            <div className="bc-result__buttons">
              <button type="button" className="bc-btn" onClick={() => onExit("retry")}><Icon.restart /> Again</button>
              <button type="button" className="bc-btn bc-btn--primary" onClick={() => onExit()} autoFocus>Done <Icon.check /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, big }) {
  return (
    <div className={`bc-drillhud__stat${big ? " is-big" : ""}`}>
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}
