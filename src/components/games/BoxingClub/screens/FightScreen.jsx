/**
 * Boxing Club — the fight screen.
 *
 * Owns ONE fight simulation, ONE requestAnimationFrame loop and ONE input
 * controller for its lifetime. The parent remounts it (new key) for Restart /
 * Rematch, which tears all three down — so restarts can never stack loops,
 * AI instances, timers or audio. Fullscreen only resizes the canvas.
 *
 * React renders only when something discrete changes (announcement, count,
 * corner, pause, result); health/stamina bars and the clock are written to
 * the DOM directly each frame from the same fight state the rules use, so the
 * HUD can never disagree with the simulation.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createFight, stepFight, INTRO } from "../engine/fight.js";
import { ATTACKS } from "../engine/attacks.js";
import { createInput } from "../utils/input.js";
import { createView, renderFight, gloveScreen, headScreen } from "../render/scene.js";
import { createFx, impact, blockSpark, dust, word, clearFx } from "../render/fx.js";
import { audio } from "../audio/audio.js";
import Hud from "../components/Hud.jsx";
import TouchControls from "../components/TouchControls.jsx";
import { Icon } from "../components/icons.jsx";

const kindOf = (id) => (ATTACKS[id].kind === "hook" ? "hook" : id === "cross" || id === "bodyCross" ? "cross" : "jab");

export default function FightScreen({
  player, opponent, arena, settings, muted, rounds = 3, roundTime = 75, seed = 1,
  showHelp, touch, onResult, onExit, title,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const hudRef = useRef(null);
  const meterRef = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const fight = useMemo(() => createFight({
    seed,
    rounds,
    roundTime,
    player: { name: player.name, stats: player.stats, maxHealth: 100 },
    opponent: { name: opponent.name, stats: opponent.stats, maxHealth: opponent.maxHealth, profile: opponent.profile },
  }), [seed, rounds, roundTime, player.name, player.stats, opponent]);

  const [announce, setAnnounce] = useState(null);
  const [kd, setKd] = useState(null);
  const [corner, setCorner] = useState(null);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null);
  const [help, setHelp] = useState(Boolean(showHelp));
  const pausedRef = useRef(false);
  const resultSent = useRef(false);

  const setPause = useCallback((v) => {
    pausedRef.current = v;
    fight.paused = v;
    setPaused(v);
    audio.crowd(v ? 0 : arena.crowdLevel);
  }, [fight, arena.crowdLevel]);

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
    audio.setMusic(settings.music && !muted, "fight");
    audio.crowd(arena.crowdLevel);
  }, [settings.sound, settings.music, muted, arena.crowdLevel]);
  useEffect(() => () => audio.crowd(0), []);

  /* ------------------------------------------------------ control help */
  useEffect(() => {
    if (!help) return undefined;
    const id = setTimeout(() => setHelp(false), 6500);
    return () => clearTimeout(id);
  }, [help]);

  /* ------------------------------------------------------- main loop */
  const input = useMemo(() => createInput(), []);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const view = createView();
    const fx = createFx();
    let W = 0;
    let H = 0;
    let dpr = 1;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const lowRes = settingsRef.current.graphics === "low";
      dpr = Math.min(window.devicePixelRatio || 1, lowRes ? 1 : 2);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    input.attach();

    let raf = 0;
    let last = performance.now();
    let lastAnnounce = null;
    let lastKdKey = "";
    let combo = { n: 0, t: 0 };
    let stepCd = 0;
    let resultTimer = 0;
    let cornerOpen = false;
    let alive = true;
    const pending = [];

    const onVis = () => {
      if (document.visibilityState !== "visible" && !fight.over && !pausedRef.current) setPause(true);
    };
    document.addEventListener("visibilitychange", onVis);

    const handle = (events) => {
      for (const e of events) {
        switch (e.type) {
          case "hit": {
            const k = kindOf(e.attack);
            if (e.body) audio.body(k);
            else audio.hit(k, e.counter);
            pending.push({ kind: "hit", e });
            if (e.counter || k === "hook") {
              audio.roar(e.counter ? 0.55 : 0.3);
              view.excite = Math.min(1.2, view.excite + (e.counter ? 0.6 : 0.3));
            }
            if (e.who === "player") {
              combo = { n: combo.t > 0 ? combo.n + 1 : 1, t: 900 };
            }
            break;
          }
          case "block":
            audio.block(kindOf(e.attack));
            pending.push({ kind: "block", e });
            break;
          case "whiff":
            audio.whiff(kindOf(e.attack));
            break;
          case "evade":
            audio.whiff(kindOf(e.attack));
            pending.push({ kind: "evade", e });
            break;
          case "perfect":
            audio.whiff(kindOf(e.attack));
            audio.perfect();
            pending.push({ kind: "perfect", e });
            break;
          case "guardBreak":
            audio.block("hook");
            audio.roar(0.4);
            pending.push({ kind: "guardBreak", e });
            break;
          case "rope":
            audio.rope();
            break;
          case "bell":
            audio.bell(e.kind === "start" ? 1 : 2);
            break;
          case "count":
            audio.count();
            break;
          case "result":
            if (e.method === "KO" || e.method === "TKO") audio.ko();
            else {
              audio.bell(3);
              audio.roar(0.8);
            }
            view.excite = 1.5;
            break;
          default:
            break;
        }
      }
    };

    const frame = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(100, now - last);
      last = now;
      const st = settingsRef.current;

      const inp = input.frame();
      if (inp.pause && !fight.over) setPause(!pausedRef.current);
      let frozen = false;
      if (!pausedRef.current) {
        const hadKd = Boolean(fight.kd);
        const evs = stepFight(fight, dt, inp);
        handle(evs);
        if (!hadKd && fight.kd) {
          audio.knockdown();
          view.excite = 1.4;
          pending.push({ kind: "knockdown" });
        }
        if (evs.some((e) => e.type === "result") && !resultSent.current) {
          resultSent.current = true;
          const res = { ...fight.result, stats: fight.stats, timeMs: fight.time };
          const rewards = onResult ? onResult(res) : null;
          resultTimer = setTimeout(() => alive && setResult({ ...res, rewards }), 1700);
        }
        frozen = fight.hitstop > 0;
        if (combo.t > 0) {
          combo.t -= dt;
          if (combo.t <= 0 && combo.n >= 2) combo.n = 0;
        }
      }

      // ----- draw
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r = renderFight(ctx, W, H, fight, view, fx, {
        detail: st.graphics,
        particles: st.particles,
        shake: st.cameraShake,
        reduced: st.reducedMotion,
        lookP: player.look,
        lookO: opponent.look,
        arena,
        frozen: frozen || pausedRef.current,
      }, pausedRef.current ? 0 : dt);
      if ((r.stepP || r.stepO) && stepCd <= 0) {
        audio.step();
        stepCd = 120;
      }
      stepCd -= dt;

      // effects anchored to where the glove actually is right now
      while (pending.length) {
        const p = pending.shift();
        const S = r.cam.S;
        if (p.kind === "hit" || p.kind === "block" || p.kind === "guardBreak") {
          const e = p.e;
          const hand = ATTACKS[e.attack].hand;
          const g = gloveScreen(view, fight, e.who, hand);
          if (!g) continue;
          const dir = e.who === "player" ? 1 : -1;
          const strength = kindOf(e.attack) === "hook" ? 1 : kindOf(e.attack) === "cross" ? 0.7 : 0.4;
          if (p.kind === "hit") {
            impact(fx, g.x + dir * 0.06 * S, g.y, dir, strength * (e.counter ? 1.3 : 1), S, { detail: st.graphics, particles: st.particles, color: e.counter ? "255,214,90" : "255,255,255" });
            if (e.counter) word(fx, "COUNTER", g.x, g.y - 0.35 * S, "#ffd65a", 1);
            if (e.who === "player" && combo.n >= 2) word(fx, `${combo.n} HIT`, g.x + 0.2 * S, g.y - 0.55 * S, "#ffffff", 0.8);
          } else if (p.kind === "block") {
            blockSpark(fx, g.x, g.y, dir, S, { particles: st.particles });
          } else {
            blockSpark(fx, g.x, g.y, dir, S, { particles: st.particles });
            word(fx, "GUARD BROKEN", g.x, g.y - 0.35 * S, "#ff8a65", 0.8);
          }
        } else if (p.kind === "perfect" || p.kind === "evade") {
          const h = headScreen(view, fight, p.e.who);
          if (h && p.kind === "perfect") word(fx, "PERFECT DODGE", h.x, h.y - 0.3 * r.cam.S, "#7ee7ff", 0.85);
        } else if (p.kind === "knockdown") {
          const down = fight.kd?.who === "player" ? fight.player : fight.opponent;
          dust(fx, r.cam.cx + (down.x - r.cam.camX) * r.cam.S, r.cam.floorY, r.cam.S, st.particles ? 12 : 0);
        }
      }

      // ----- HUD (direct DOM writes; values come straight from the fight)
      hudRef.current?.update(fight);

      // ----- discrete UI
      let ann = null;
      if (fight.phase === "intro") ann = fight.phaseT < INTRO.round ? `ROUND ${fight.round}` : "FIGHT!";
      else if (fight.phase === "resume") ann = "BOX!";
      else if (fight.phase === "roundEnd") ann = fight.roundLog.length ? `END OF ROUND ${fight.round}` : null;
      else if (fight.phase === "over") ann = fight.result?.method === "KO" ? "K.O.!" : fight.result?.method === "TKO" ? "T.K.O.!" : fight.result?.method === "DRAW" ? "DRAW" : "DECISION";
      if (ann !== lastAnnounce) {
        lastAnnounce = ann;
        setAnnounce(ann);
      }
      const k = fight.kd;
      const kdKey = k ? `${k.who}:${k.count}:${k.hits ?? ""}:${k.recovered}` : "";
      if (kdKey !== lastKdKey) {
        lastKdKey = kdKey;
        setKd(k ? { who: k.who, count: k.count, need: k.need, hits: k.hits, recovered: k.recovered, zone: k.zone, zoneAt: k.zoneAt } : null);
      }
      if (k && k.who === "player" && meterRef.current) {
        meterRef.current.style.left = `${(k.marker * 100).toFixed(2)}%`;
      }
      if (fight.phase === "corner" && !cornerOpen) {
        cornerOpen = true;
        setCorner({ tip: fight.cornerTip, round: fight.round, log: fight.roundLog[fight.roundLog.length - 1] });
      } else if (fight.phase !== "corner" && cornerOpen) {
        cornerOpen = false;
        setCorner(null);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(resultTimer);
      ro.disconnect();
      input.detach();
      document.removeEventListener("visibilitychange", onVis);
      clearFx(fx);
    };
    // one loop for the lifetime of this fight; everything it needs is in refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fight]);

  const skipCorner = () => input.press("skip");

  return (
    <div className="bc-fight" ref={wrapRef}>
      <canvas ref={canvasRef} className="bc-fight__canvas" aria-label={`Fight: ${player.name} versus ${opponent.name}`} />
      <Hud ref={hudRef} player={player} opponent={opponent} rounds={rounds} title={title} />

      <button type="button" className="bc-fight__pause" onClick={() => !fight.over && setPause(!pausedRef.current)} aria-label="Pause">
        <Icon.pause />
      </button>

      {announce && !paused && !result && (
        <div className={`bc-announce${announce === "FIGHT!" || announce === "BOX!" ? " is-go" : ""}${announce.startsWith("K.O") || announce.startsWith("T.K.O") ? " is-ko" : ""}`} key={announce}>
          {announce}
        </div>
      )}

      {kd && !result && (
        <div className="bc-count">
          <div className="bc-count__num" key={kd.count}>{kd.count > 0 ? kd.count : ""}</div>
          {kd.who === "player" && !kd.recovered && (
            <div className="bc-recover">
              <p>GET UP! Press <kbd>J</kbd>/<kbd>Space</kbd> when the marker is in the zone</p>
              <div className="bc-recover__bar">
                <span className="bc-recover__zone" style={{ left: `${(kd.zoneAt - kd.zone / 2) * 100}%`, width: `${kd.zone * 100}%` }} />
                <span className="bc-recover__marker" ref={meterRef} />
              </div>
              <div className="bc-recover__pips">
                {Array.from({ length: kd.need }, (_, i) => <i key={i} className={i < kd.hits ? "is-on" : ""} />)}
              </div>
              {touch && <button type="button" className="bc-btn bc-btn--primary" onPointerDown={() => input.press("recover")}>GET UP</button>}
            </div>
          )}
          {kd.who === "player" && kd.recovered && <p className="bc-count__note">You're up — wait for the referee…</p>}
        </div>
      )}

      {corner && (
        <div className="bc-corner" onClick={skipCorner} role="dialog" aria-label="Between rounds">
          <div className="bc-corner__card">
            <div className="bc-corner__head">END OF ROUND {corner.round}</div>
            <div className={`bc-corner__result is-${corner.log?.result}`}>
              {corner.log?.result === "won" ? "ROUND WON" : corner.log?.result === "lost" ? "ROUND LOST" : "ROUND EVEN"}
              <small>{corner.log ? `${corner.log.player} – ${corner.log.opponent}` : ""}</small>
            </div>
            <div className="bc-corner__coach">
              <span className="bc-corner__coachLabel">COACH</span>
              “{corner.tip}”
            </div>
            <p className="bc-corner__recover">Health +12% · Stamina restored</p>
            <button type="button" className="bc-btn" onClick={skipCorner}>Next round <kbd>Enter</kbd></button>
          </div>
        </div>
      )}

      {help && !paused && !result && (
        <div className="bc-help" onClick={() => setHelp(false)}>
          {touch ? (
            <span>Hold ◀ ▶ to move · <b>JAB CROSS HOOK</b> to punch · hold <b>BLOCK</b> · <b>DODGE</b> slips (with ▶ it slips in)</span>
          ) : (
            <span><kbd>A</kbd><kbd>D</kbd> move · <kbd>J</kbd> jab · <kbd>K</kbd> cross · <kbd>L</kbd> hook · <kbd>Space</kbd> block · hold <kbd>S</kbd> body · <kbd>Shift</kbd>+dir dodge · <kbd>P</kbd> pause</span>
          )}
        </div>
      )}

      {touch && !result && <TouchControls input={input} />}

      {paused && !result && (
        <div className="bc-pause" role="dialog" aria-label="Paused">
          <div className="bc-pause__card">
            <h2>PAUSED</h2>
            <button type="button" className="bc-btn bc-btn--primary" onClick={() => setPause(false)} autoFocus><Icon.play /> Resume</button>
            <button type="button" className="bc-btn" onClick={() => onExit("restart")}><Icon.restart /> Restart fight</button>
            <button type="button" className="bc-btn" onClick={() => { setHelp(true); setPause(false); }}><Icon.keys /> Controls</button>
            <button type="button" className="bc-btn bc-btn--ghost" onClick={() => onExit("menu")}><Icon.back /> Quit fight</button>
          </div>
        </div>
      )}

      {result && (
        <ResultPanel result={result} player={player} opponent={opponent} onExit={onExit} />
      )}
    </div>
  );
}

function pct(a, b) {
  return b ? Math.round((a / b) * 100) : 0;
}

function ResultPanel({ result, player, opponent, onExit }) {
  const won = result.winner === "player";
  const draw = result.winner === "draw";
  const s = result.stats.player;
  const o = result.stats.opponent;
  const rw = result.rewards;
  return (
    <div className="bc-result" role="dialog" aria-label="Fight result">
      <div className={`bc-result__card${won ? " is-win" : draw ? "" : " is-loss"}`}>
        <div className="bc-result__verdict">{won ? "VICTORY" : draw ? "DRAW" : "DEFEAT"}</div>
        <div className="bc-result__method">
          {result.method === "DECISION" ? `Decision ${result.cards.player}–${result.cards.opponent}` : result.method === "DRAW" ? `Scorecards ${result.cards.player}–${result.cards.opponent}` : `${result.method} · Round ${result.round}`}
        </div>
        <div className="bc-result__vs"><b>{player.name}</b> vs <b>{opponent.name}</b></div>
        <table className="bc-result__table">
          <tbody>
            <tr><td>{s.landed}/{s.thrown}</td><th>Punches landed</th><td>{o.landed}/{o.thrown}</td></tr>
            <tr><td>{pct(s.landed, s.thrown)}%</td><th>Accuracy</th><td>{pct(o.landed, o.thrown)}%</td></tr>
            <tr><td>{s.counters}</td><th>Counters</th><td>{o.counters}</td></tr>
            <tr><td>{s.blocks}</td><th>Blocks</th><td>{o.blocks}</td></tr>
            <tr><td>{s.evades}</td><th>Dodges</th><td>{o.evades}</td></tr>
            <tr><td>{s.knockdowns}</td><th>Knockdowns</th><td>{o.knockdowns}</td></tr>
          </tbody>
        </table>
        {rw && rw.lines?.length > 0 && (
          <ul className="bc-result__rewards">
            {rw.lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}
        <div className="bc-result__buttons">
          <button type="button" className="bc-btn" onClick={() => onExit("rematch")}><Icon.restart /> {won ? "Fight again" : "Rematch"}</button>
          <button type="button" className="bc-btn bc-btn--primary" onClick={() => onExit(won ? "continue" : "menu")} autoFocus>
            {won ? <>Continue <Icon.next /></> : <>Back <Icon.back /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
