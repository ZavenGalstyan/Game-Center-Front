/**
 * Iron Arena — in-match HUD.
 *
 * React renders the slow parts from a ~10 Hz snapshot (timer, scores, feed,
 * notices, health, weapon, ability, overlays). Everything that must track
 * the 3D view every frame — gun marker + reload ring, tank tags, floating
 * damage numbers, hit markers, damage-direction arrows, the minimap and the
 * touch joystick — is written straight to DOM refs from the game's fast
 * callback, so the HUD never re-renders at frame rate.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, ABILITY_ICON, fmtTime } from "./common.jsx";
import { Settings } from "./Menus.jsx";
import { mapImage } from "./mapImage.js";
import { TEAM_COLORS } from "../engine/tanks.js";

const MAX_TAGS = 8;
const MAX_NUMS = 12;
const MAX_DIRS = 6;

export default function HUD({ hud, gstate, game, world, input, fastRef, touch, save, commit, onResume, onLeave, onRestart, toggleFullscreen, fps, showBoard, setShowBoard }) {
  const markerRef = useRef(null);
  const ringRef = useRef(null);
  const crossRef = useRef(null);
  const hitRef = useRef(null);
  const tagRefs = useRef([]);
  const numRefs = useRef([]);
  const dirRefs = useRef([]);
  const miniRef = useRef(null);
  const joyRef = useRef(null);
  const knobRef = useRef(null);
  const scopeRef = useRef(null);
  const [pausePanel, setPausePanel] = useState("main");
  const [confirmQuit, setConfirmQuit] = useState(false);
  const mapId = game.current?.match?.map?.id;
  const mini = useMemo(() => (mapId ? mapImage(mapId, 256, "mini") : null), [mapId]);

  /* ---------------------------------------------------------------- per-frame */
  useEffect(() => {
    const losCache = new Map();
    let miniT = 0;
    const scr = {};
    fastRef.current = (G, dt) => {
      const M = G.match;
      const W = world.current;
      if (!M || !W) return;
      const P = M.player;
      const host = W.canvas;
      const w = host.clientWidth;
      const h = host.clientHeight;
      // gun marker + reload ring
      const mk = markerRef.current;
      if (mk) {
        if (P.alive && W.marker) {
          W.toScreen(W.marker.x, W.marker.y, W.marker.z, scr);
          const x = Math.max(0, Math.min(w, scr.x));
          const y = Math.max(0, Math.min(h, scr.y));
          mk.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          mk.style.opacity = scr.behind ? "0" : "1";
          const enemy = W.marker.tank && M.isEnemy(P, W.marker.tank);
          mk.classList.toggle("is-enemy", !!enemy);
          const ready = Math.max(0, Math.min(1, gameReady(P)));
          if (ringRef.current) ringRef.current.style.strokeDashoffset = String(113 * (1 - ready));
          mk.classList.toggle("is-ready", ready >= 1);
        } else mk.style.opacity = "0";
      }
      if (scopeRef.current) scopeRef.current.style.opacity = W.cam.scopeT > 0.6 ? String((W.cam.scopeT - 0.6) / 0.4) : "0";
      // hit marker
      const last = G.hits[G.hits.length - 1];
      if (hitRef.current) {
        const age = last ? G.time - last.t : 9;
        hitRef.current.style.opacity = age < 0.3 ? String(1 - age / 0.3) : "0";
        hitRef.current.classList.toggle("is-kill", !!last?.kill && age < 0.3);
        if (crossRef.current) crossRef.current.style.transform = `translate(-50%, -50%) scale(${age < 0.15 ? 1.25 : 1})`;
      }
      // tank tags
      let n = 0;
      for (const t of M.tanks) {
        if (t === P || n >= MAX_TAGS) continue;
        const el = tagRefs.current[n];
        if (!el) break;
        const d = Math.hypot(t.x - P.x, t.z - P.z);
        const enemy = M.isEnemy(P, t);
        let show = t.alive && d < (enemy ? 150 : 220);
        if (show && enemy) {
          if (t.fx.cloak > 0 && d > 12) show = false;
          else {
            // line of sight, refreshed a few times per second
            const c = losCache.get(t.id);
            if (!c || G.time - c.t > 0.2) {
              const vis = M.A.los(P.x, P.y + P.dims.top + 0.5, P.z, t.x, t.y + t.dims.top * 0.8, t.z) || M.A.los(W.camera.position.x, W.camera.position.y, W.camera.position.z, t.x, t.y + t.dims.top, t.z);
              losCache.set(t.id, { t: G.time, vis });
            }
            show = losCache.get(t.id).vis;
          }
        }
        if (show) {
          W.toScreen(t.x, t.y + t.dims.top + 1.6, t.z, scr);
          show = !scr.behind && scr.x > -40 && scr.x < w + 40 && scr.y > -20 && scr.y < h + 20;
        }
        if (show) {
          el.style.transform = `translate3d(${scr.x}px, ${scr.y}px, 0) scale(${Math.max(0.6, Math.min(1, 40 / Math.max(1, d)) + 0.25)})`;
          el.style.opacity = "1";
          el.dataset.side = enemy ? "enemy" : "ally";
          const hpF = Math.max(0, t.hp / t.stats.hp);
          el.style.setProperty("--hp", String(hpF));
          el.style.setProperty("--c", M.mode.teams ? TEAM_COLORS[t.realTeam] : t.color);
          const nm = el.firstChild;
          const label = t.name + (t.carrying >= 0 ? " ⚑" : "");
          if (nm.textContent !== label) nm.textContent = label;
        } else el.style.opacity = "0";
        n++;
      }
      for (let i = n; i < MAX_TAGS; i++) if (tagRefs.current[i]) tagRefs.current[i].style.opacity = "0";
      // damage numbers
      for (let i = 0; i < MAX_NUMS; i++) {
        const el = numRefs.current[i];
        if (!el) continue;
        const nb = G.numbers[G.numbers.length - 1 - i];
        const age = nb ? G.time - nb.t : 9;
        if (!nb || age > 1.1) {
          el.style.opacity = "0";
          continue;
        }
        W.toScreen(nb.x, nb.y + age * 1.6, nb.z, scr);
        if (scr.behind) {
          el.style.opacity = "0";
          continue;
        }
        el.style.transform = `translate3d(${scr.x}px, ${scr.y}px, 0) scale(${nb.crit ? 1.3 : 1})`;
        el.style.opacity = String(Math.min(1, (1.1 - age) * 2.5));
        const txt = String(Math.round(nb.amount));
        if (el.textContent !== txt) el.textContent = txt;
      }
      // damage direction arrows
      const camYaw = W.cam.yaw;
      for (let i = 0; i < MAX_DIRS; i++) {
        const el = dirRefs.current[i];
        if (!el) continue;
        const dd = G.dmgDir[G.dmgDir.length - 1 - i];
        const age = dd ? G.time - dd.t : 9;
        if (!dd || age > 1.6) {
          el.style.opacity = "0";
          continue;
        }
        const ang = Math.atan2(dd.x - P.x, dd.z - P.z);
        // screen angle: 0 = up (in front of the camera), clockwise positive
        const rel = -(ang - camYaw);
        el.style.transform = `translate(-50%, -50%) rotate(${rel}rad)`;
        el.style.opacity = String(Math.min(1, (1.6 - age) * 1.5) * Math.min(1, 0.4 + dd.amount / 120));
      }
      // touch joystick
      if (joyRef.current && input.S.joy.active) {
        joyRef.current.style.opacity = "1";
        joyRef.current.style.transform = `translate3d(${input.S.joy.ox}px, ${input.S.joy.oy}px, 0)`;
        knobRef.current.style.transform = `translate(${input.S.joy.x * 38}px, ${input.S.joy.y * 38}px)`;
      } else if (joyRef.current) joyRef.current.style.opacity = "0";
      // minimap at ~12 Hz
      miniT -= dt;
      if (miniT <= 0 && miniRef.current && mini) {
        miniT = 1 / 12;
        drawMini(miniRef.current, mini, M, W, losCache);
      }
    };
    return () => {
      fastRef.current = null;
    };
  }, [fastRef, world, input, mini]);

  if (!hud) return <div className="ia-hud" />;
  const M = hud.mode;
  const paused = gstate === "paused";
  const ready = paused && game.current?.pauseReason === "ready";
  const hpF = Math.max(0, hud.hp / hud.maxHp);
  const ab = hud.ability;
  const abReady = ab.cd <= 0;
  const W = hud.weapon;
  const myTeam = hud.team;

  return (
    <div className={`ia-hud${paused ? " is-paused" : ""}${touch ? " ia-hud--touch" : ""}`}>
      {/* scope vignette */}
      <div className="ia-scope" ref={scopeRef}>
        <i />
      </div>
      {/* top: timer + scores */}
      <div className="ia-top">
        {M.teams ? (
          <div className="ia-score">
            <span className={`ia-score__team ia-blue${myTeam === 0 ? " is-you" : ""}`}>
              <b>{hud.scores[0]}</b>
              <small>{myTeam === 0 ? "YOUR TEAM" : "BLUE"}</small>
            </span>
            <span className="ia-score__mid">
              <b>{fmtTime(hud.timeLeft)}</b>
              <small>
                {M.short} · first to {hud.limit}
              </small>
            </span>
            <span className={`ia-score__team ia-red${myTeam === 1 ? " is-you" : ""}`}>
              <b>{hud.scores[1]}</b>
              <small>{myTeam === 1 ? "YOUR TEAM" : "RED"}</small>
            </span>
          </div>
        ) : (
          <div className="ia-score">
            <span className="ia-score__team is-you">
              <b>{hud.kills}</b>
              <small>YOUR KILLS</small>
            </span>
            <span className="ia-score__mid">
              <b>{fmtTime(hud.timeLeft)}</b>
              <small>
                #{hud.place} of {hud.board.length} · first to {hud.limit}
              </small>
            </span>
            <span className="ia-score__team">
              <b>{Math.max(...hud.board.map((b) => b.kills))}</b>
              <small>LEADER</small>
            </span>
          </div>
        )}
        {hud.flags && (
          <div className="ia-flags">
            {hud.flags.map((f) => (
              <span key={f.team} className={`ia-flagstat ia-flagstat--${f.state}`} style={{ color: TEAM_COLORS[f.team] }}>
                <Icon name="flag" />
                <small>{f.state === "home" ? "Home" : f.state === "carried" ? f.carrier : `Dropped ${Math.ceil(f.dropT)}s`}</small>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* minimap */}
      <div className="ia-mini">
        <canvas ref={miniRef} width={200} height={200} />
      </div>

      {/* kill feed */}
      <div className="ia-feed">
        {hud.feed.map((f) => (
          <div key={f.id} className={`ia-feed__row${f.kYou || f.vYou ? " is-you" : ""}`}>
            {f.killer && <b style={{ color: M.teams ? TEAM_COLORS[f.kTeam] : f.kColor }}>{f.killer}</b>}
            <span className="ia-feed__w">
              <Icon name="damage" /> {f.weapon}
            </span>
            <b style={{ color: M.teams ? TEAM_COLORS[f.vTeam] : f.vColor }}>{f.victim}</b>
          </div>
        ))}
      </div>

      {/* notices */}
      <div className="ia-notices">
        {hud.notices.map((n) => (
          <div key={n.id} className={`ia-notice ia-notice--${n.kind}`}>
            <b>{n.text}</b>
            {n.sub && <small>{n.sub}</small>}
          </div>
        ))}
      </div>

      {/* centre: crosshair, gun marker, hit marker, damage arrows */}
      <div className="ia-cross" ref={crossRef}>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="ia-hit" ref={hitRef}>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="ia-marker" ref={markerRef}>
        <svg viewBox="0 0 40 40">
          <circle className="ia-marker__bg" cx="20" cy="20" r="18" />
          <circle className="ia-marker__ring" ref={ringRef} cx="20" cy="20" r="18" strokeDasharray="113" />
          <circle className="ia-marker__dot" cx="20" cy="20" r="1.6" />
        </svg>
      </div>
      <div className="ia-dirs">
        {Array.from({ length: MAX_DIRS }, (_, i) => (
          <i key={i} ref={(el) => (dirRefs.current[i] = el)} />
        ))}
      </div>
      <div className="ia-tags">
        {Array.from({ length: MAX_TAGS }, (_, i) => (
          <div key={i} className="ia-tag" ref={(el) => (tagRefs.current[i] = el)}>
            <span />
            <i>
              <u />
            </i>
          </div>
        ))}
      </div>
      <div className="ia-nums">
        {Array.from({ length: MAX_NUMS }, (_, i) => (
          <b key={i} ref={(el) => (numRefs.current[i] = el)} />
        ))}
      </div>

      {/* bottom-left: tank status */}
      <div className="ia-status">
        <div className="ia-status__name">
          <b>{hud.tankName}</b>
          <span>
            {Math.ceil(hud.hp)} / {hud.maxHp}
          </span>
        </div>
        <div className={`ia-hp${hpF < 0.3 ? " is-low" : ""}`}>
          <i style={{ width: `${hpF * 100}%` }} />
        </div>
        <div className="ia-fx">
          {hud.protT > 0 && <span className="ia-chip ia-chip--good">Spawn shield</span>}
          {hud.fx.shield > 0 && <span className="ia-chip ia-chip--good">Shield {Math.ceil(hud.fx.shield)}s</span>}
          {hud.fx.nitro > 0 && <span className="ia-chip ia-chip--good">Nitro</span>}
          {hud.fx.cloak > 0 && <span className="ia-chip ia-chip--good">Cloaked {Math.ceil(hud.fx.cloak)}s</span>}
          {hud.fx.focus > 0 && <span className="ia-chip ia-chip--good">Focus</span>}
          {hud.fx.over > 0 && <span className="ia-chip ia-chip--good">Overclock</span>}
          {hud.fx.repair > 0 && <span className="ia-chip ia-chip--good">Repairing</span>}
          {hud.fx.burn > 0 && <span className="ia-chip ia-chip--bad">Burning</span>}
          {hud.carrying >= 0 && <span className="ia-chip ia-chip--flag">Carrying flag</span>}
        </div>
      </div>

      {/* bottom-centre: weapon + ability */}
      <div className="ia-weapon">
        <div className="ia-weapon__name">
          <b>{W.name}</b>
          <span>{weaponStatus(W)}</span>
        </div>
        <div className={`ia-weapon__bar${W.overheated ? " is-hot" : ""}`}>
          {W.kind === "clip" ? (
            <span className="ia-ammo">
              {Array.from({ length: W.clipMax }, (_, i) => (
                <i key={i} className={i < W.clip && !W.reloading ? "is-on" : ""} />
              ))}
            </span>
          ) : W.kind === "flame" ? (
            <i style={{ width: `${W.heat * 100}%` }} className="ia-heat" />
          ) : (
            <i style={{ width: `${W.ready * 100}%` }} />
          )}
        </div>
      </div>
      <button className={`ia-ability${abReady ? " is-ready" : ""}${ab.active > 0 ? " is-active" : ""}`} data-touch-btn onPointerDown={(e) => (e.stopPropagation(), input.press("ability", true))} aria-label={ab.name}>
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" className="ia-ability__bg" />
          <circle cx="20" cy="20" r="18" className="ia-ability__ring" strokeDasharray="113" style={{ strokeDashoffset: 113 * (ab.cd / ab.cdMax) }} />
        </svg>
        <Icon name={ABILITY_ICON[ab.key]} />
        <span className="ia-ability__lbl">
          {abReady ? (touch ? ab.name : <><kbd>Space</kbd> {ab.name}</>) : Math.ceil(ab.cd) + "s"}
        </span>
      </button>

      {fps > 0 && <div className="ia-fps">{fps} FPS</div>}

      {/* countdown */}
      {hud.state === "countdown" && !paused && (
        <div className="ia-count">
          <b key={Math.ceil(hud.countdown)}>{Math.ceil(hud.countdown)}</b>
          <small>{M.name}</small>
        </div>
      )}

      {/* death */}
      {!hud.alive && !hud.ended && (
        <div className="ia-dead">
          <h2>DESTROYED</h2>
          {hud.killer?.name ? (
            <p>
              by <b style={{ color: hud.killer.color }}>{hud.killer.name}</b> · {hud.killer.tank} ({hud.killer.hp} HP left)
            </p>
          ) : (
            <p>Your tank was knocked out</p>
          )}
          <div className="ia-dead__timer">
            Redeploying in <b>{Math.ceil(hud.respawnIn)}</b>
          </div>
        </div>
      )}

      {/* scoreboard */}
      {(showBoard || hud.ended) && !paused && <Board hud={hud} />}

      {/* touch controls */}
      {touch && !paused && (
        <>
          <div className="ia-joy" ref={joyRef}>
            <i ref={knobRef} />
          </div>
          <div className="ia-touch">
            <button className="ia-tbtn ia-tbtn--fire" data-touch-btn onPointerDown={(e) => (e.stopPropagation(), input.press("fire", true))} onPointerUp={() => input.press("fire", false)} onPointerCancel={() => input.press("fire", false)} onPointerLeave={() => input.press("fire", false)} aria-label="Fire">
              <Icon name="fire" />
            </button>
            <button className="ia-tbtn ia-tbtn--scope" data-touch-btn onPointerDown={(e) => (e.stopPropagation(), input.press("scope", true))} aria-label="Scope">
              <Icon name="scope" />
            </button>
          </div>
          <div className="ia-touchtop">
            <button className="ia-tbtn ia-tbtn--small" data-touch-btn onPointerDown={(e) => e.stopPropagation()} onClick={() => setShowBoard((v) => !v)} aria-label="Scoreboard">
              <Icon name="board" />
            </button>
            <button className="ia-tbtn ia-tbtn--small" data-touch-btn onPointerDown={(e) => e.stopPropagation()} onClick={() => game.current?.pause("menu")} aria-label="Pause">
              <Icon name="pause" />
            </button>
          </div>
          <div className="ia-touchhint">Left: drive · Right: aim</div>
        </>
      )}

      {/* ready / pause overlays */}
      {ready && (
        <div className="ia-overlay ia-ready" onClick={onResume}>
          <div className="ia-ready__card">
            <span className="ia-pill">{M.name}</span>
            <h2>{touch ? "Tap to deploy" : "Click to deploy"}</h2>
            {touch ? (
              <p>Left thumb drives, right thumb aims. Fire, Scope and Ability buttons sit on the right.</p>
            ) : (
              <div className="ia-keys">
                <span><kbd>W A S D</kbd> drive</span>
                <span><kbd>Mouse</kbd> aim turret</span>
                <span><kbd>LMB</kbd> fire</span>
                <span><kbd>RMB</kbd> scope</span>
                <span><kbd>Wheel</kbd> camera zoom</span>
                <span><kbd>Space</kbd> ability</span>
                <span><kbd>Tab</kbd> scoreboard</span>
                <span><kbd>Esc</kbd> pause</span>
              </div>
            )}
            <button className="ia-deploy" onClick={(e) => (e.stopPropagation(), onResume())}>
              <span>Deploy</span>
            </button>
          </div>
        </div>
      )}
      {paused && !ready && (
        <div className="ia-overlay ia-pause">
          <div className="ia-pause__card">
            {pausePanel === "main" ? (
              <>
                <h2>Paused</h2>
                <button className="ia-deploy" onClick={onResume}>
                  <span>Resume</span>
                </button>
                <button className="ia-btn" onClick={onRestart}>
                  Restart match
                </button>
                <button className="ia-btn" onClick={() => setPausePanel("settings")}>
                  <Icon name="settings" /> Settings
                </button>
                <button className="ia-btn" onClick={toggleFullscreen}>
                  <Icon name="expand" /> Fullscreen
                </button>
                {confirmQuit ? (
                  <div className="ia-confirm">
                    Leave the match? You'll only earn the participation reward.
                    <button className="ia-btn ia-btn--danger" onClick={onLeave}>
                      Leave
                    </button>
                    <button className="ia-btn ia-btn--ghost" onClick={() => setConfirmQuit(false)}>
                      Stay
                    </button>
                  </div>
                ) : (
                  <button className="ia-btn ia-btn--ghost" onClick={() => setConfirmQuit(true)}>
                    Quit to menu
                  </button>
                )}
                <Board hud={hud} compact />
              </>
            ) : (
              <>
                <div className="ia-pause__head">
                  <button className="ia-back" onClick={() => setPausePanel("main")} aria-label="Back">
                    <Icon name="back" />
                  </button>
                  <h2>Settings</h2>
                </div>
                <Settings save={save} commit={commit} toggleFullscreen={toggleFullscreen} inGame />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function gameReady(P) {
  const w = P.stats.weapon;
  const S = P.ws;
  if (w.kind === "flame") return S.overheated ? 1 - S.heat : 1;
  if (w.kind === "clip") return S.reloading ? 1 - S.reloadT / w.reload : 1;
  if (w.kind === "rail" && S.charging) return 1 - S.chargeT / Math.max(0.05, S.chargeTotal || w.charge);
  if (w.kind === "burst" && S.burstLeft > 0) return 0;
  return 1 - S.cd / w.reload;
}

function weaponStatus(W) {
  if (W.kind === "flame") return W.overheated ? "OVERHEATED" : `Heat ${Math.round(W.heat * 100)}%`;
  if (W.kind === "clip") return W.reloading ? "Reloading…" : `${W.clip} / ${W.clipMax}`;
  if (W.charging) return "Charging…";
  return W.ready >= 1 ? "Ready" : "Reloading…";
}

function Board({ hud, compact = false }) {
  const M = hud.mode;
  const rows = [...hud.board].sort((a, b) => (M.teams ? a.team - b.team : 0) || b.kills - a.kills || a.deaths - b.deaths);
  return (
    <div className={`ia-board${compact ? " ia-board--compact" : ""}`}>
      <table>
        <thead>
          <tr>
            <th>Commander</th>
            <th>Tank</th>
            <th>K</th>
            <th>D</th>
            <th>A</th>
            {M.id === "ctf" && <th>Caps</th>}
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`${r.isPlayer ? "is-you" : ""}${r.alive ? "" : " is-dead"}`}>
              <td>
                <i className="ia-dot" style={{ background: M.teams ? TEAM_COLORS[r.team] : r.color }} />
                {r.name}
              </td>
              <td>{r.tank}</td>
              <td>{r.kills}</td>
              <td>{r.deaths}</td>
              <td>{r.assists}</td>
              {M.id === "ctf" && <td>{r.caps}</td>}
              <td>{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ minimap */
function drawMini(cv, mini, M, W, losCache) {
  const g = cv.getContext("2d");
  const S = cv.width;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  g.clip();
  g.globalAlpha = 0.92;
  g.drawImage(mini.canvas, 0, 0, S, S);
  g.globalAlpha = 1;
  const H = M.map.H;
  const k = S / (2 * H);
  const tp = (x, z) => [(H - x) * k, (H - z) * k];
  const P = M.player;
  // CTF flags + bases
  if (M.mode.id === "ctf")
    for (const f of M.flags) {
      const [hx, hy] = tp(f.home.x, f.home.z);
      g.strokeStyle = TEAM_COLORS[f.team];
      g.lineWidth = 2;
      g.beginPath();
      g.arc(hx, hy, 6, 0, Math.PI * 2);
      g.stroke();
      const [fx, fy] = tp(f.x, f.z);
      g.fillStyle = TEAM_COLORS[f.team];
      g.beginPath();
      g.moveTo(fx - 1, fy + 6);
      g.lineTo(fx - 1, fy - 7);
      g.lineTo(fx + 7, fy - 4);
      g.lineTo(fx, fy - 1);
      g.fill();
    }
  // tanks
  for (const t of M.tanks) {
    if (!t.alive || t === P) continue;
    const enemy = M.isEnemy(P, t);
    if (enemy) {
      const c = losCache.get(t.id);
      const recentlyFired = t.ws.cd > t.stats.weapon.reload * 0.6 || t.ws.firing;
      if (!(c && c.vis) && !(recentlyFired && t.fx.cloak <= 0)) continue;
      if (t.fx.cloak > 0) continue;
    }
    const [x, y] = tp(t.x, t.z);
    g.fillStyle = M.mode.teams ? TEAM_COLORS[t.realTeam] : t.color;
    g.strokeStyle = "rgba(0,0,0,0.7)";
    g.lineWidth = 1.5;
    g.beginPath();
    if (enemy) {
      g.moveTo(x, y - 4.5);
      g.lineTo(x + 4.5, y);
      g.lineTo(x, y + 4.5);
      g.lineTo(x - 4.5, y);
      g.closePath();
    } else g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // player arrow + camera cone
  const [px, py] = tp(P.x, P.z);
  const camYaw = W.cam.yaw;
  // world heading → screen: +z is up, +x is left (see mapImage.js)
  const dirTo = (yaw, len) => [px - Math.sin(yaw) * len, py - Math.cos(yaw) * len];
  g.fillStyle = "rgba(255,210,120,0.16)";
  g.beginPath();
  g.moveTo(px, py);
  const [ax, ay] = dirTo(camYaw + 0.45, 60);
  const [bx, by] = dirTo(camYaw - 0.45, 60);
  g.lineTo(ax, ay);
  g.lineTo(bx, by);
  g.closePath();
  g.fill();
  if (P.alive) {
    const [fx, fy] = dirTo(P.yaw, 8);
    const [lx, ly] = dirTo(P.yaw + 2.5, 6);
    const [rx, ry] = dirTo(P.yaw - 2.5, 6);
    g.fillStyle = "#ffd36a";
    g.strokeStyle = "#1a1206";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(fx, fy);
    g.lineTo(lx, ly);
    g.lineTo(rx, ry);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
  g.strokeStyle = "rgba(255,255,255,0.25)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  g.stroke();
  // north marker
  g.fillStyle = "rgba(255,255,255,0.8)";
  g.font = "bold 13px sans-serif";
  g.textAlign = "center";
  g.fillText("N", S / 2, 15);
}
