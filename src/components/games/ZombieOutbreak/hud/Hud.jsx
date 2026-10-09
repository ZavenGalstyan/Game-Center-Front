/**
 * Zombie Outbreak — in-game HUD (DOM over the canvas).
 *
 * `hud` is a ~20 Hz snapshot of engine state (game.hud()); `feed` holds the
 * short-lived, event-driven bits (hit markers, popups, damage arcs,
 * announcements) that Play.jsx pushes as engine events arrive.
 */
import { WEAPONS } from "../data/weapons.js";

const fmt = (n) => Math.round(n).toLocaleString("en-US");

function Bar({ value, max, kind, label }) {
  const k = Math.max(0, Math.min(1, value / max));
  return (
    <div className={`zo-bar zo-bar--${kind}`}>
      <div className="zo-bar__fill" style={{ transform: `scaleX(${k})` }} />
      {label != null && <span className="zo-bar__label">{label}</span>}
    </div>
  );
}

function Crosshair({ hud, marker }) {
  if (!hud.alive) return null;
  const scoped = hud.weapon === "marksman" && hud.ads > 0.92;
  if (scoped) return null;
  // Gap follows the real spread cone (px at a nominal 1080p/74° view).
  const gap = Math.min(70, 6 + hud.spread * 900);
  const op = 1 - hud.ads * 0.85;
  return (
    <div className="zo-cross" aria-hidden="true">
      <div className="zo-cross__lines" style={{ opacity: op, "--gap": `${gap}px` }}>
        <i className="t" />
        <i className="b" />
        <i className="l" />
        <i className="r" />
      </div>
      <div className="zo-cross__dot" style={{ opacity: hud.ads > 0.5 ? 0.9 : 0.75 }} />
      {marker && <div key={marker.id} className={`zo-hit zo-hit--${marker.kind}`} />}
    </div>
  );
}

function Scope({ hud }) {
  if (hud.weapon !== "marksman" || hud.ads <= 0.92 || !hud.alive) return null;
  return (
    <div className="zo-scope" aria-hidden="true">
      <div className="zo-scope__ring" />
      <div className="zo-scope__h" />
      <div className="zo-scope__v" />
      <div className="zo-scope__dot" />
    </div>
  );
}

function DamageArcs({ arcs, hud }) {
  return (
    <div className="zo-dmg" aria-hidden="true">
      {arcs.map((a) => {
        // World direction to the source, relative to where the player looks.
        const rel = Math.atan2(-(a.fx - hud.px), -(a.fz - hud.pz)) - hud.yaw;
        const deg = (-rel * 180) / Math.PI;
        return <div key={a.id} className="zo-dmg__arc" style={{ transform: `translate(-50%, -50%) rotate(${deg}deg)`, opacity: a.k }} />;
      })}
    </div>
  );
}

export default function Hud({ hud, feed, controlsHint }) {
  if (!hud) return null;
  const w = WEAPONS[hud.weapon];
  const lowMag = hud.mag <= Math.ceil(hud.magSize * 0.25);
  const empty = hud.mag === 0 && hud.reserve === 0;
  return (
    <div className="zo-hud">
      <div className={`zo-vignette${hud.lowHp ? " zo-vignette--low" : ""}`} style={{ opacity: feed.hurt }} />
      <Scope hud={hud} />
      <DamageArcs arcs={feed.arcs} hud={hud} />
      <Crosshair hud={hud} marker={feed.marker} />

      {/* Top-left: wave + remaining */}
      <div className="zo-hud__tl">
        <div className="zo-wave">
          <span className="zo-wave__label">WAVE</span>
          <span className="zo-wave__num">
            {Math.max(1, hud.wave)}
            <small>/{hud.waves}</small>
          </span>
        </div>
        <div className="zo-remaining">
          <span className="zo-skull" aria-hidden="true" />
          {hud.state === "PLAYING" ? `${hud.remaining} ZOMBIES LEFT` : hud.state === "BETWEEN_WAVES" ? `NEXT WAVE ${Math.ceil(hud.stateT)}s` : hud.state === "PREPARING" ? `GET READY ${Math.ceil(hud.stateT)}` : ""}
        </div>
      </div>

      {/* Top-right: score + combo + boost */}
      <div className="zo-hud__tr">
        <div className="zo-score">{fmt(hud.score)}</div>
        {hud.combo > 1 && (
          <div className="zo-combo" key={hud.combo}>
            x{hud.combo} COMBO
            <div className="zo-combo__t" style={{ transform: `scaleX(${Math.max(0, hud.comboT / 3.5)})` }} />
          </div>
        )}
        {hud.boostT > 0 && <div className="zo-boost">DAMAGE BOOST {Math.ceil(hud.boostT)}s</div>}
      </div>

      {/* Boss bar */}
      {hud.boss && (
        <div className="zo-bossbar">
          <div className="zo-bossbar__name">
            {hud.boss.name}
            {hud.boss.phase === 2 && <span className="zo-bossbar__enraged">ENRAGED</span>}
          </div>
          <div className="zo-bossbar__track">
            <div className="zo-bossbar__fill" style={{ transform: `scaleX(${Math.max(0, hud.boss.hp / hud.boss.maxHp)})` }} />
          </div>
        </div>
      )}

      {/* Bottom-left: vitals */}
      <div className="zo-hud__bl">
        <div className="zo-vitals">
          <div className="zo-vitals__row">
            <span className="zo-icon zo-icon--hp" aria-hidden="true" />
            <Bar value={hud.hp} max={hud.maxHp} kind={hud.lowHp ? "hp-low" : "hp"} label={Math.ceil(hud.hp)} />
          </div>
          {hud.armor > 0.5 && (
            <div className="zo-vitals__row">
              <span className="zo-icon zo-icon--armor" aria-hidden="true" />
              <Bar value={hud.armor} max={100} kind="armor" label={Math.ceil(hud.armor)} />
            </div>
          )}
          <div className="zo-vitals__row zo-vitals__row--thin">
            <span className="zo-icon zo-icon--stam" aria-hidden="true" />
            <Bar value={hud.stamina} max={100} kind={hud.exhausted ? "stam-out" : "stam"} />
          </div>
        </div>
      </div>

      {/* Bottom-right: weapon + ammo */}
      <div className="zo-hud__br">
        <div className="zo-slots">
          {hud.slots.map((s, i) => (
            <div key={s.id} className={`zo-slot${s.active ? " zo-slot--on" : ""}`}>
              <b>{i + 1}</b>
              {WEAPONS[s.id].kind}
            </div>
          ))}
        </div>
        <div className="zo-weapon">{w?.name}</div>
        <div className={`zo-ammo${lowMag ? " zo-ammo--low" : ""}`}>
          <span className="zo-ammo__mag">{hud.mag}</span>
          <span className="zo-ammo__sep">/</span>
          <span className="zo-ammo__res">{hud.reserve}</span>
        </div>
        <div className="zo-pips" aria-hidden="true">
          {Array.from({ length: Math.min(hud.magSize, 32) }, (_, i) => (
            <i key={i} className={i < hud.mag ? "on" : ""} />
          ))}
        </div>
        {hud.reloading >= 0 && (
          <div className="zo-reload">
            RELOADING
            <div className="zo-reload__bar">
              <div style={{ transform: `scaleX(${hud.reloading})` }} />
            </div>
          </div>
        )}
      </div>

      {/* Centre prompts */}
      <div className="zo-prompts">
        {hud.prompt && (
          <div className={`zo-prompt${hud.prompt.full ? " zo-prompt--full" : ""}`}>
            <kbd>E</kbd> {hud.prompt.full ? `${hud.prompt.label} — ALREADY FULL` : `PICK UP ${hud.prompt.label}`}
          </div>
        )}
        {!hud.prompt && hud.alive && hud.reloading < 0 && empty && <div className="zo-prompt zo-prompt--warn">NO AMMO — FIND AN AMMO BOX OR SWITCH WEAPON</div>}
        {!hud.prompt && hud.alive && hud.reloading < 0 && !empty && hud.mag === 0 && <div className="zo-prompt zo-prompt--warn"><kbd>R</kbd> RELOAD</div>}
      </div>

      {/* Popups near the crosshair */}
      <div className="zo-pops" aria-hidden="true">
        {feed.pops.map((p) => (
          <div key={p.id} className={`zo-pop zo-pop--${p.kind}`}>
            {p.text}
          </div>
        ))}
      </div>

      {/* Announcements */}
      {feed.banner && (
        <div key={feed.banner.id} className={`zo-banner zo-banner--${feed.banner.kind}`}>
          <div className="zo-banner__main">{feed.banner.text}</div>
          {feed.banner.sub && <div className="zo-banner__sub">{feed.banner.sub}</div>}
        </div>
      )}
      {feed.toast && (
        <div key={feed.toast.id} className="zo-toast">
          {feed.toast.text}
        </div>
      )}
      {controlsHint && (
        <div className="zo-hints">
          <span><kbd>WASD</kbd> move</span>
          <span><kbd>Mouse</kbd> aim</span>
          <span><kbd>LMB</kbd> shoot</span>
          <span><kbd>RMB</kbd> aim down sights</span>
          <span><kbd>R</kbd> reload</span>
          <span><kbd>Shift</kbd> sprint</span>
          <span><kbd>Space</kbd> jump</span>
          <span><kbd>E</kbd> pick up</span>
          <span><kbd>Esc</kbd> pause</span>
        </div>
      )}
    </div>
  );
}
