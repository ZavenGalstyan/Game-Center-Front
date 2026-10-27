/**
 * Strike Force — in-match interface.
 *
 * Slow parts (scores, ammo, feed, panels) re-render from the ~15 Hz
 * snapshot; fast parts (crosshair spread, hit markers, damage arcs, radar,
 * ally / objective markers) are written straight to the DOM every frame
 * through `fastRef`, so React never re-renders at frame rate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { Loadout, SettingsPanel } from "./Menus.jsx";
import { getMap, mapMeta } from "../engine/maps/index.js";
import { WEAPON_BY_ID } from "../engine/weapons.js";
import { STREAKS } from "../engine/config.js";

const TEAM_COL = ["#3fa9ff", "#ff4a3d"];
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export default function HUD({ hud, gstate, game, world, input, fastRef, touch, save, thumbs, lockFail, onResume, onLeave, onRestart, commit, setLoadoutLive, toggleFullscreen, fps }) {
  const [panel, setPanel] = useState("pause"); // pause | loadout | settings
  const [board, setBoard] = useState(false);
  const rootRef = useRef(null);
  const crossRef = useRef(null);
  const hitRef = useRef(null);
  const dmgRef = useRef(null);
  const radarRef = useRef(null);
  const markRef = useRef(null);
  const vignetteRef = useRef(null);
  const paused = gstate === "paused";
  const reason = game.current?.pauseReason;

  useEffect(() => {
    input.S.onScores = (v) => setBoard(v);
    return () => {
      input.S.onScores = null;
    };
  }, [input]);
  useEffect(() => {
    if (paused) setPanel("pause");
  }, [paused]);

  // enable game input only while playing
  useEffect(() => {
    input.S.enabled = gstate === "play";
  }, [gstate, input]);

  /* ------------------------------------------------------------ radar static layer */
  const mapId = game.current?.match?.map.id;
  const radarBase = useMemo(() => (mapId ? buildRadarBase(getMap(mapId)) : null), [mapId]);

  /* ------------------------------------------------------------ fast per-frame updates */
  const markerPool = useRef([]);
  const fast = useCallback(
    (G, dt) => {
      const M = G.match;
      const w = world.current;
      if (!M || !w) return;
      const P = M.player;
      const root = rootRef.current;
      if (!root) return;
      const H = root.clientHeight || 1;
      const W = root.clientWidth || 1;
      // crosshair
      const spread = G.spreadDeg();
      const vf = (w.camera.fov * Math.PI) / 180;
      const px = (Math.tan((spread * Math.PI) / 180) / Math.tan(vf / 2)) * (H / 2);
      const ch = crossRef.current;
      if (ch) {
        ch.style.setProperty("--gap", `${Math.max(4, Math.min(120, px)).toFixed(1)}px`);
        const ws = P.weapons[P.cur];
        const hide = P.ads > 0.55 || P.sprinting || !P.alive || (ws.reloading && !ws.def.perShell) ;
        ch.style.opacity = hide ? "0" : "1";
        ch.dataset.shotgun = ws.def.pellets > 1 ? "1" : "0";
        // red when over an enemy
        const d = M.eye(P);
        const dir = G.viewDir(input.S.yaw + P.kickY, input.S.pitch + P.kickP);
        let over = false;
        for (const c of M.combatants) {
          if (!c.alive || c === P || !M.isEnemy(P, c)) continue;
          const dx = c.x - P.x;
          const dz = c.z - P.z;
          const dy = M.eye(c) - 0.4 - d;
          const L = Math.hypot(dx, dy, dz);
          if (L > 90) continue;
          const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / L;
          if (dot > Math.cos(Math.atan(0.45 / L)) && M.col.los(P.x, d, P.z, c.x, M.eye(c) - 0.3, c.z)) {
            over = true;
            break;
          }
        }
        ch.dataset.enemy = over ? "1" : "0";
      }
      // hit marker
      const hm = hitRef.current;
      const lastHit = G.hits[G.hits.length - 1];
      if (hm) {
        const age = lastHit ? G.time - lastHit.t : 9;
        hm.style.opacity = age < 0.22 ? String(1 - age / 0.22) : "0";
        hm.dataset.kind = lastHit?.kill ? "kill" : lastHit?.head ? "head" : "hit";
        hm.style.transform = `translate(-50%, -50%) scale(${age < 0.22 ? 1 + (0.22 - age) * 1.5 : 1})`;
      }
      // damage arcs
      const dmg = dmgRef.current;
      if (dmg) {
        const kids = dmg.children;
        for (let i = 0; i < kids.length; i++) {
          const d = G.dmg[G.dmg.length - 1 - i];
          const el = kids[i];
          const age = d ? G.time - d.t : 9;
          if (!d || age > 1.6) {
            el.style.opacity = "0";
            continue;
          }
          const ang = Math.atan2(d.x - P.x, d.z - P.z); // world angle of attacker (yaw-style: atan2(dx,dz))
          const facing = Math.atan2(-Math.sin(input.S.yaw), -Math.cos(input.S.yaw));
          const rel = ang - facing;
          el.style.opacity = String(Math.min(1, (1.6 - age) * 1.4));
          el.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
        }
      }
      // low health vignette
      const vg = vignetteRef.current;
      if (vg) {
        const lastDmg = G.dmg[G.dmg.length - 1];
        const flash = lastDmg ? Math.max(0, 1 - (G.time - lastDmg.t) / 0.5) : 0;
        const low = P.alive ? Math.max(0, 1 - P.hp / 60) : 0;
        vg.style.opacity = String(Math.min(1, low * 0.85 + flash * 0.6));
      }
      // radar (~20 Hz)
      G.radarT = (G.radarT || 0) - dt;
      if (G.radarT <= 0 && radarRef.current && radarBase) {
        G.radarT = 0.05;
        drawRadar(radarRef.current, radarBase, M, input.S.yaw, G);
      }
      // world markers: allies, flags, objective
      const mk = markRef.current;
      if (mk) {
        const pool = markerPool.current;
        let n = 0;
        const place = (x, y, z, cls, text, color, extra = "") => {
          const p = w.project(x, y, z);
          if (p.behind || p.x < -0.1 || p.x > 1.1 || p.y < -0.1 || p.y > 1.1) return;
          let el = pool[n];
          if (!el) {
            el = document.createElement("div");
            mk.appendChild(el);
            pool[n] = el;
          }
          n++;
          el.className = "sf-mk " + cls;
          el.style.transform = `translate(${(p.x * W).toFixed(1)}px, ${(p.y * H).toFixed(1)}px) translate(-50%, -100%)`;
          el.style.setProperty("--c", color);
          const label = text + extra + (cls.includes("flag") ? `<small>${Math.round(p.dist)}m</small>` : "");
          if (el.dataset.html !== label) {
            el.innerHTML = label;
            el.dataset.html = label;
          }
          el.style.display = "";
        };
        if (M.mode.teams && P.alive)
          for (const c of M.combatants) {
            if (c === P || !c.alive || c.team !== P.team) continue;
            const dist = Math.hypot(c.x - P.x, c.z - P.z);
            if (dist > 60) continue;
            place(c.x, c.y + 2.05, c.z, "sf-mk--ally", dist < 22 ? `<span>${c.name}</span>` : "", TEAM_COL[0]);
          }
        for (const f of M.flags) {
          const col = f.owner < 0 ? "#f2f2f2" : TEAM_COL[f.owner === P.team ? 0 : 1];
          const inside = Math.hypot(P.x - f.x, P.z - f.z) <= 4.6;
          if (inside) continue;
          place(f.x, f.y + 4.6, f.z, `sf-mk--flag${f.contested ? " is-contested" : ""}${f.capTeam >= 0 ? " is-capping" : ""}`, `<b>${f.key}</b>`, col);
        }
        for (let i = n; i < pool.length; i++) pool[i].style.display = "none";
      }
    },
    [world, input, radarBase],
  );
  useEffect(() => {
    fastRef.current = fast;
    return () => {
      if (fastRef.current === fast) fastRef.current = null;
    };
  }, [fast, fastRef]);

  /* ------------------------------------------------------------ touch buttons */
  const tb = (name, label, IconC, cls = "") => (
    <button
      data-touch-btn
      className={`sf-tbtn sf-tbtn--${name} ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        input.press(name, e);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        input.release(name);
      }}
      onPointerCancel={() => input.release(name)}
      onPointerLeave={(e) => {
        if (name !== "fire") input.release(name);
        void e;
      }}
      aria-label={label}
    >
      {IconC ? <IconC size={name === "fire" ? 34 : 22} /> : label}
    </button>
  );
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  useEffect(() => {
    if (touch) input.setStick(stickRef.current, knobRef.current);
  }, [touch, input]);

  const h = hud;
  const loading = !h;
  const mode = h?.mode;
  const flagsOwned = (t) => (h?.flags || []).filter((f) => f.owner === t).length;

  return (
    <div ref={rootRef} className={`sf-hud ${h?.scoped ? "is-scoped" : ""} ${h && !h.alive ? "is-dead" : ""}`} onContextMenu={(e) => e.preventDefault()}>
      <div ref={vignetteRef} className="sf-hurt" />
      {h?.scoped && <ScopeOverlay weapon={h.weapon.id} />}
      <div ref={markRef} className="sf-marks" />

      {/* crosshair + hit marker + damage */}
      <div ref={crossRef} className="sf-cross" data-enemy="0">
        <i className="t" />
        <i className="b" />
        <i className="l" />
        <i className="r" />
        <i className="c" />
        <i className="ring" />
      </div>
      <div ref={hitRef} className="sf-hitm">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div ref={dmgRef} className="sf-dmg">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="sf-dmg__arc">
            <i />
          </div>
        ))}
      </div>

      {!loading && (
        <>
          {/* top: radar, scores, feed */}
          <div className="sf-radar">
            <canvas ref={radarRef} width={180} height={180} />
            <span className="sf-radar__n">N</span>
            {h.uav > 0 && <span className="sf-radar__uav">UAV {Math.ceil(h.uav)}s</span>}
            {h.enemyUav > 0 && <span className="sf-radar__warn">ENEMY UAV</span>}
          </div>
          <div className="sf-top">
            {mode.teams ? (
              <div className="sf-score">
                <div className="sf-score__team t0">
                  <b>{h.scores[h.team]}</b>
                  <div className="sf-score__bar">
                    <i style={{ width: `${Math.min(100, (h.scores[h.team] / h.limit) * 100)}%` }} />
                  </div>
                </div>
                <div className="sf-score__mid">
                  <span className="sf-score__time">{fmtTime(h.timeLeft)}</span>
                  <small>{mode.short} · {h.limit}</small>
                </div>
                <div className="sf-score__team t1">
                  <b>{h.scores[1 - h.team]}</b>
                  <div className="sf-score__bar">
                    <i style={{ width: `${Math.min(100, (h.scores[1 - h.team] / h.limit) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="sf-score sf-score--ffa">
                <div className="sf-score__team t0">
                  <small>YOU</small>
                  <b>{h.kills}</b>
                </div>
                <div className="sf-score__mid">
                  <span className="sf-score__time">{fmtTime(h.timeLeft)}</span>
                  <small>#{h.place} · first to {h.limit}</small>
                </div>
                <div className="sf-score__team t1">
                  <small>{h.leader?.you ? "LEADING" : (h.leader?.name || "").toUpperCase()}</small>
                  <b>{h.leader?.kills ?? 0}</b>
                </div>
              </div>
            )}
            {mode.id === "dom" && (
              <div className="sf-flags">
                {h.flags.map((f) => {
                  const col = f.owner < 0 ? "#e9ecef" : TEAM_COL[f.owner === h.team ? 0 : 1];
                  const capCol = f.capTeam >= 0 ? TEAM_COL[f.capTeam === h.team ? 0 : 1] : col;
                  const prog = Math.abs(f.progress);
                  return (
                    <div key={f.key} className={`sf-flag ${f.contested ? "is-contested" : ""} ${f.inside ? "is-inside" : ""}`} style={{ "--c": col, "--cc": capCol }}>
                      <svg viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" className="bg" />
                        <circle cx="18" cy="18" r="15" className="pr" style={{ strokeDasharray: `${prog * 94.2} 94.2` }} />
                      </svg>
                      <b>{f.key}</b>
                    </div>
                  );
                })}
                <small className="sf-flags__held">
                  <i style={{ background: TEAM_COL[0] }} />
                  {flagsOwned(h.team)} held
                  <i style={{ background: TEAM_COL[1] }} />
                  {flagsOwned(1 - h.team)}
                </small>
              </div>
            )}
          </div>
          <div className="sf-feed">
            {h.feed.map((f) => (
              <div key={f.id} className={`sf-feed__row ${f.kId === 0 ? "is-mine" : ""} ${f.vId === 0 ? "is-me" : ""}`}>
                <span style={{ color: mode.teams ? TEAM_COL[f.kTeam === h.team ? 0 : 1] : "#ffd27a" }}>{f.killer}</span>
                <em>
                  {f.weapon}
                  {f.head && <Icon.head size={13} />}
                </em>
                <span style={{ color: mode.teams ? TEAM_COL[f.vTeam === h.team ? 0 : 1] : "#e6e6e6" }}>{f.victim}</span>
              </div>
            ))}
          </div>

          {/* notices */}
          <div className="sf-notices">
            {h.notices.map((n) => (
              <div key={n.id} className={`sf-notice sf-notice--${n.kind}`}>
                <b>{n.text}</b>
                {n.sub && <small>{n.sub}</small>}
              </div>
            ))}
          </div>
          {h.state === "countdown" && !paused && (
            <div className="sf-countdown">
              <small>MATCH STARTS IN</small>
              <b key={Math.ceil(h.countdown)}>{Math.max(1, Math.ceil(h.countdown))}</b>
            </div>
          )}
          {h.pickup && h.alive && (
            <div className="sf-prompt">
              <kbd>{touch ? "TAP" : "F"}</kbd> Swap for <b>{h.pickup.name}</b>
            </div>
          )}
          {h.alive && h.weapon.mag === 0 && h.weapon.reserve === 0 && h.other && <div className="sf-prompt sf-prompt--warn">No ammo — switch weapon</div>}
          {h.alive && !h.weapon.reloading && h.weapon.mag > 0 && h.weapon.mag <= Math.max(1, Math.floor(h.weapon.magSize * 0.25)) && h.weapon.reserve > 0 && (
            <div className="sf-prompt sf-prompt--low">
              <kbd>{touch ? "↻" : "R"}</kbd> Reload
            </div>
          )}
          {h.weapon.reloading && h.alive && (
            <div className="sf-reloadbar">
              <small>RELOADING</small>
              <div>
                <i style={{ width: `${h.weapon.reloadP * 100}%` }} />
              </div>
            </div>
          )}

          {/* bottom: vitals + weapon */}
          <div className="sf-vitals">
            <div className="sf-hp">
              <Icon.shield size={16} />
              <div className="sf-hp__bar">
                <i style={{ width: `${Math.max(0, h.hp)}%` }} className={h.hp < 35 ? "is-low" : ""} />
                {h.armor > 0 && <em style={{ width: `${(h.armor / 60) * 100}%` }} />}
              </div>
              <b>{Math.ceil(Math.max(0, h.hp))}</b>
            </div>
            <div className="sf-streak">
              {STREAKS.map((s) => (
                <span key={s.id} className={h.streak >= s.kills ? "is-on" : ""} title={`${s.kills} — ${s.name}`}>
                  {s.id === "uav" ? <Icon.uav size={15} /> : s.id === "overdrive" ? <Icon.bolt size={15} /> : <Icon.shield size={15} />}
                  <small>{s.kills}</small>
                </span>
              ))}
              <em>
                {h.streak} streak · {h.kills}/{h.deaths}
              </em>
            </div>
            {h.overdrive > 0 && <div className="sf-buff">OVERDRIVE {Math.ceil(h.overdrive)}s</div>}
          </div>
          <div className="sf-weapon" onClick={() => touch && input.press("swap")}>
            <div className="sf-weapon__main">
              {thumbs[h.weapon.id] && <img src={thumbs[h.weapon.id]} alt="" />}
              <div className="sf-weapon__ammo">
                <b className={h.weapon.mag <= Math.floor(h.weapon.magSize * 0.25) ? "is-low" : ""}>{h.weapon.mag}</b>
                <span>/ {h.weapon.reserve}</span>
              </div>
            </div>
            <div className="sf-weapon__name">
              {h.weapon.name}
              <small>{h.weapon.mode === "auto" ? "AUTO" : h.weapon.mode === "burst" ? "BURST" : h.weapon.mode === "bolt" ? "BOLT" : h.weapon.mode === "pump" ? "PUMP" : "SEMI"}</small>
            </div>
            <div className="sf-weapon__pips">
              {Array.from({ length: Math.min(30, h.weapon.magSize) }).map((_, i) => (
                <i key={i} className={i < Math.round((h.weapon.mag / h.weapon.magSize) * Math.min(30, h.weapon.magSize)) ? "on" : ""} />
              ))}
            </div>
            {h.other && (
              <div className="sf-weapon__other">
                <kbd>{touch ? "⇄" : h.slot === 0 ? "2" : "1"}</kbd>
                {h.other.name}
                <span>
                  {h.other.mag}/{h.other.reserve}
                </span>
              </div>
            )}
          </div>
          {fps > 0 && <div className="sf-fps">{fps} FPS</div>}
        </>
      )}

      {/* touch controls */}
      {touch && !paused && h && (
        <div className="sf-touch">
          <div ref={stickRef} className="sf-stick">
            <i ref={knobRef} />
          </div>
          <div className="sf-touch__hint">Drag left to move · drag right to look</div>
          {tb("fire", "Fire", Icon.fire)}
          {tb("fire", "Fire", Icon.fire, "sf-tbtn--fire2")}
          {tb("ads", "Aim", Icon.ads)}
          {tb("reload", "Reload", Icon.reload)}
          {tb("jump", "Jump", Icon.jump)}
          {tb("crouch", "Crouch", Icon.crouch)}
          {tb("sprint", "Sprint", Icon.sprint)}
          {tb("swap", "Switch weapon", Icon.swap)}
          {h.pickup && tb("interact", "Pick up", null, "sf-tbtn--pick")}
          <button className="sf-tbtn sf-tbtn--pause" data-touch-btn onClick={() => game.current?.pause("menu")} aria-label="Pause">
            <Icon.pause size={18} />
          </button>
          <button className="sf-tbtn sf-tbtn--board" data-touch-btn onPointerDown={() => setBoard(true)} onPointerUp={() => setBoard(false)} onPointerLeave={() => setBoard(false)} aria-label="Scoreboard">
            <Icon.board size={18} />
          </button>
        </div>
      )}

      {/* death */}
      {h && !h.alive && !h.ended && !paused && (
        <div className="sf-death">
          <small>ELIMINATED BY</small>
          <b>{h.killer?.name || "—"}</b>
          <span>
            {h.killer?.weapon}
            {h.killer?.head ? " · Headshot" : ""}
            {h.killer ? ` · ${h.killer.hp} HP left` : ""}
          </span>
          <div className="sf-death__timer">{h.canRespawn ? (touch ? "Tap FIRE to respawn" : "Click / Space to respawn") : `Respawn in ${Math.ceil(h.respawnIn)}`}</div>
          <button className="sf-btn sf-btn--ghost sf-btn--small" onClick={() => game.current?.pause("menu")}>
            Change loadout
          </button>
        </div>
      )}

      {(board || (h && h.ended)) && h && <Scoreboard h={h} />}

      {/* ready / pause */}
      {paused && reason === "ready" && h && (
        <div className="sf-ready" onClick={onResume}>
          <div className="sf-ready__card">
            <span className="sf-label">{mode.name}</span>
            <h2>{mapMeta(game.current?.match?.map.id).name}</h2>
            <p>{mode.blurb}</p>
            <button className="sf-btn sf-btn--primary sf-btn--xl">{touch ? "TAP TO DEPLOY" : "CLICK TO DEPLOY"}</button>
            {!touch && <small className="sf-muted">Mouse locks to the game · press Esc to pause</small>}
            {lockFail && <small className="sf-warn">The browser blocked mouse lock — click again.</small>}
          </div>
        </div>
      )}
      {paused && reason !== "ready" && (
        <div className="sf-pause">
          {panel === "pause" && (
            <div className="sf-pause__card">
              <h2>PAUSED</h2>
              {h && (
                <div className="sf-pause__score">
                  {mode.teams ? `${h.scores[h.team]} — ${h.scores[1 - h.team]}` : `${h.kills} kills · #${h.place}`} · {fmtTime(h.timeLeft)}
                </div>
              )}
              <button className="sf-btn sf-btn--primary sf-btn--block" onClick={onResume}>
                Resume
              </button>
              {lockFail && <small className="sf-warn">The browser needs a moment before re-locking the mouse — click Resume again.</small>}
              <button className="sf-btn sf-btn--block" onClick={() => setPanel("loadout")}>
                Loadout
              </button>
              <button className="sf-btn sf-btn--block" onClick={() => setPanel("settings")}>
                Settings
              </button>
              <button className="sf-btn sf-btn--block" onClick={onRestart}>
                Restart match
              </button>
              <button className="sf-btn sf-btn--ghost sf-btn--block" onClick={onLeave}>
                Leave match
              </button>
            </div>
          )}
          {panel === "loadout" && (
            <div className="sf-pause__wide">
              <Loadout save={save} setLoadoutLive={setLoadoutLive} back={() => setPanel("pause")} thumbs={thumbs} inGame />
            </div>
          )}
          {panel === "settings" && (
            <div className="sf-pause__wide sf-pause__settings">
              <div className="sf-screen">
                <header className="sf-screen__head">
                  <button className="sf-back" onClick={() => setPanel("pause")}>
                    <Icon.back size={18} />
                    <span>Back</span>
                  </button>
                  <h2 className="sf-screen__title">Settings</h2>
                </header>
                <div className="sf-scroll sf-scroll--settings">
                  <SettingsPanel save={save} commit={commit} toggleFullscreen={toggleFullscreen} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ====================================================================== scope */
function ScopeOverlay({ weapon }) {
  return (
    <div className={`sf-scope sf-scope--${weapon}`}>
      <div className="sf-scope__lens">
        <i className="h" />
        <i className="v" />
        <i className="dot" />
        {[1, 2, 3, 4].map((k) => (
          <em key={k} className="mil" style={{ "--k": k }} />
        ))}
      </div>
    </div>
  );
}

/* ====================================================================== scoreboard */
function Scoreboard({ h }) {
  const teams = h.mode.teams;
  const sorted = [...h.combatants].sort((a, b) => b.score - a.score || b.kills - a.kills);
  const Table = ({ rows, title, color }) => (
    <div className="sf-board__team">
      {title && (
        <div className="sf-board__title" style={{ color }}>
          {title}
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Soldier</th>
            <th>Score</th>
            <th>K</th>
            <th>D</th>
            <th>A</th>
            {h.mode.id === "dom" && <th>Caps</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className={`${c.isPlayer ? "is-you" : ""} ${c.alive ? "" : "is-down"}`}>
              <td>
                {!teams && <i className="sf-dot" style={{ background: c.color }} />}
                {c.name}
              </td>
              <td>{c.score}</td>
              <td>{c.kills}</td>
              <td>{c.deaths}</td>
              <td>{c.assists}</td>
              {h.mode.id === "dom" && <td>{c.caps}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="sf-board">
      <div className="sf-board__head">
        <b>{h.mode.name}</b>
        <span>{fmtTime(h.timeLeft)}</span>
      </div>
      {teams ? (
        <div className="sf-board__cols">
          <Table rows={sorted.filter((c) => c.team === h.team)} title={`VANGUARD · ${h.scores[h.team]}`} color={TEAM_COL[0]} />
          <Table rows={sorted.filter((c) => c.team !== h.team)} title={`OBSIDIAN · ${h.scores[1 - h.team]}`} color={TEAM_COL[1]} />
        </div>
      ) : (
        <Table rows={sorted} />
      )}
    </div>
  );
}

/* ====================================================================== radar */
const RADAR_R = 42; // metres shown from centre to edge
function buildRadarBase(map) {
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const S = 4; // px per metre
  const c = document.createElement("canvas");
  c.width = Math.ceil((maxX - minX) * S);
  c.height = Math.ceil((maxZ - minZ) * S);
  const g = c.getContext("2d");
  g.fillStyle = "rgba(20,28,34,0.0)";
  g.fillRect(0, 0, c.width, c.height);
  for (const p of map.ground) {
    if (/asphalt|road|path|dirtPath|quay/i.test(p.m)) {
      g.fillStyle = "rgba(120,140,150,0.16)";
      g.fillRect((p.x0 - minX) * S, (p.z0 - minZ) * S, (p.x1 - p.x0) * S, (p.z1 - p.z0) * S);
    }
  }
  const sorted = [...map.boxes].filter((b) => !b.hidden && b.k !== "invisible" && b.y1 > 0.7).sort((a, b) => a.y1 - b.y1);
  for (const b of sorted) {
    const tall = b.y1 > 2.4;
    g.fillStyle = b.k === "fence" ? "rgba(200,210,220,0.25)" : tall ? "rgba(200,214,224,0.62)" : "rgba(170,186,196,0.38)";
    g.fillRect((b.x0 - minX) * S, (b.z0 - minZ) * S, Math.max(1, (b.x1 - b.x0) * S), Math.max(1, (b.z1 - b.z0) * S));
  }
  return { canvas: c, S, minX, minZ };
}
function drawRadar(cv, base, M, yaw, G) {
  const g = cv.getContext("2d");
  const W = cv.width;
  const R = W / 2;
  const P = M.player;
  const k = R / RADAR_R; // px per metre on the radar
  g.clearRect(0, 0, W, W);
  g.save();
  g.beginPath();
  g.arc(R, R, R - 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = "rgba(10,16,22,0.72)";
  g.fillRect(0, 0, W, W);
  g.translate(R, R);
  // forward (view yaw) points up
  g.rotate(yaw);
  const sc = k / base.S;
  g.drawImage(base.canvas, -(P.x - base.minX) * k, -(P.z - base.minZ) * k, base.canvas.width * sc, base.canvas.height * sc);
  // range rings
  g.strokeStyle = "rgba(160,200,220,0.12)";
  g.lineWidth = 1;
  for (const r of [15, 30]) {
    g.beginPath();
    g.arc(0, 0, r * k, 0, Math.PI * 2);
    g.stroke();
  }
  const dot = (x, z, col, size = 3.4, arrow = null) => {
    const px = (x - P.x) * k;
    const pz = (z - P.z) * k;
    g.save();
    g.translate(px, pz);
    if (arrow !== null) {
      g.rotate(-arrow);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, -size * 1.6);
      g.lineTo(size, size);
      g.lineTo(-size, size);
      g.closePath();
      g.fill();
    } else {
      g.fillStyle = col;
      g.beginPath();
      g.arc(0, 0, size, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  // flags
  for (const f of M.flags) {
    const col = f.owner < 0 ? "#e9ecef" : TEAM_COL[f.owner === P.team ? 0 : 1];
    const px = (f.x - P.x) * k;
    const pz = (f.z - P.z) * k;
    g.save();
    g.translate(px, pz);
    g.rotate(-yaw);
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.beginPath();
    g.arc(0, 0, 8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = col;
    g.font = "bold 10px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(f.key, 0, 0.5);
    g.restore();
  }
  const uav = M.mode.teams ? M.uav[P.team] > 0 : M.uav[0] > 0;
  for (const c of M.combatants) {
    if (c === P || !c.alive) continue;
    if (M.mode.teams && c.team === P.team) dot(c.x, c.z, TEAM_COL[0], 3.6, c.yaw);
    else {
      const loud = M.clock - c.lastShot < 1.6 && !c.weapons[c.cur].def.silenced;
      if (uav || loud) dot(c.x, c.z, M.mode.teams ? TEAM_COL[1] : c.color || TEAM_COL[1], 3.6);
    }
  }
  g.restore();
  // player arrow (always up)
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(R, R - 7);
  g.lineTo(R + 5, R + 5);
  g.lineTo(R, R + 2);
  g.lineTo(R - 5, R + 5);
  g.closePath();
  g.fill();
  // view cone
  const grd = g.createRadialGradient(R, R, 0, R, R, R * 0.7);
  grd.addColorStop(0, "rgba(255,255,255,0.14)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(R, R);
  g.arc(R, R, R * 0.7, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.35)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(R, R, R - 2, 0, Math.PI * 2);
  g.stroke();
  void G;
}
