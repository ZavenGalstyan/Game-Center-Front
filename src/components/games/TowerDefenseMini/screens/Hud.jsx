/**
 * Tower Defense Mini — in-battle HUD (DOM over the canvas).
 *
 * The build menu and tower panel are anchored to their pad: a small rAF loop
 * re-projects the pad to screen space and clamps the panel inside the stage,
 * so they follow resizes / fullscreen and never leave the screen.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOWERS, TOWER_IDS, towerStats, sellValue } from "../data/towers.js";
import { ENEMIES } from "../data/enemies.js";
import { Icon, TowerIcon, EnemyIcon, Stars } from "./ui.jsx";

/* ------------------------------------------------------------ anchoring */
function useAnchor(ref, view, x, z, y, place) {
  useLayoutEffect(() => {
    let raf = 0;
    const update = () => {
      const el = ref.current;
      if (!el || !view.toScreen || !view.size) return;
      const [sx, sy] = view.toScreen(x, y, z);
      const [W, H] = view.size;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let [l, t] = place(sx, sy, w, h, W, H);
      const pad = 8;
      l = Math.max(pad, Math.min(W - w - pad, l));
      t = Math.max(pad + 48, Math.min(H - h - pad, t));
      el.style.transform = `translate(${Math.round(l)}px, ${Math.round(t)}px)`;
      el.style.visibility = "visible";
    };
    const tick = () => {
      update();
      raf = requestAnimationFrame(tick);
    };
    update();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
    };
  }, [ref, view, x, z, y, place]);
}

const fmt = (v) => (Math.round(v * 100) / 100).toString();

/* ------------------------------------------------------------ top bar */
export function TopBar({ hud, onPause, onSpeed, levelName, flash }) {
  const waveFrac = hud.phase === "wave" && hud.waveTotal ? 1 - hud.remaining / hud.waveTotal : hud.phase === "build" ? 0 : 1;
  const low = hud.lives <= Math.ceil(hud.maxLives * 0.3);
  return (
    <div className="tdm-top tdm-ui">
      <button type="button" className="tdm-iconbtn" aria-label="Pause" onClick={onPause}>
        <Icon name="pause" />
      </button>
      <div className={`tdm-stat tdm-stat--lives${low ? " is-low" : ""}`} title="Base health">
        <Icon name="heart" size={18} />
        <b key={hud.lives}>{hud.lives}</b>
      </div>
      <div className={`tdm-stat tdm-stat--coins${flash ? " is-flash" : ""}`} title="Coins" key={`c${flash}`}>
        <Icon name="coin" size={19} />
        <b key={hud.coins}>{hud.coins}</b>
      </div>
      <div className="tdm-stat tdm-stat--wave" title={levelName}>
        <span className="tdm-stat__label">WAVE</span>
        <b>
          {Math.max(1, hud.wave)}
          <small>/{hud.waves}</small>
        </b>
        <span className="tdm-wavebar" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, waveFrac))})` }} />
        </span>
        {hud.phase === "wave" && <span className="tdm-stat__rem">{hud.remaining} LEFT</span>}
      </div>
      <div className="tdm-top__spacer" />
      <button type="button" className={`tdm-speed${hud.speed === 2 ? " is-fast" : ""}`} onClick={onSpeed} aria-label={`Game speed ${hud.speed}x`}>
        <Icon name={hud.speed === 2 ? "fast" : "play"} size={16} />
        <b>{hud.speed}x</b>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ wave button */
export function WaveButton({ hud, onStart, first }) {
  if (hud.phase !== "build" || !hud.next) return null;
  const order = ["raider", "scout", "brute", "armored", "swarmer", "boss", "warlord"];
  return (
    <div className="tdm-wavebox tdm-ui">
      <div className="tdm-wavebox__preview" aria-label="Next wave">
        <span>NEXT</span>
        {order
          .filter((k) => hud.next.counts[k])
          .map((k) => (
            <span key={k} className={`tdm-chip${ENEMIES[k].boss ? " is-boss" : ""}`} title={ENEMIES[k].name}>
              <EnemyIcon type={k} size={20} />
              <b>{hud.next.counts[k]}</b>
            </span>
          ))}
      </div>
      <button type="button" className={`tdm-btn tdm-btn--primary tdm-btn--wave${hud.next.boss ? " is-boss" : ""}${first ? " is-pulse" : ""}`} onClick={onStart}>
        <Icon name={hud.next.boss ? "skull" : "play"} size={18} />
        {hud.next.boss ? "START BOSS WAVE" : `START WAVE ${hud.wave + 1}`}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ build menu */
const RING = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
export function BuildMenu({ spot, view, coins, onBuild, onClose, touch, audio }) {
  const ref = useRef(null);
  const [preview, setPreview] = useState(null);
  const place = useRef((sx, sy, w, h) => [sx - w / 2, sy - h / 2]).current;
  useAnchor(ref, view, spot.x, spot.z, 0.3, place);
  useEffect(() => {
    if (preview) view.range = { x: spot.x, z: spot.z, r: towerStats(preview, 1).range, color: TOWERS[preview].color };
    else view.range = null;
    return () => {
      view.range = null;
    };
  }, [preview, spot, view]);
  const info = preview ? TOWERS[preview] : null;
  const st = preview ? towerStats(preview, 1) : null;
  return (
    <div className="tdm-build tdm-ui" ref={ref} style={{ visibility: "hidden" }} role="dialog" aria-label="Build a tower">
      <div className="tdm-build__ring">
        {TOWER_IDS.map((id, i) => {
          const cost = TOWERS[id].levels[0].cost;
          const afford = coins >= cost;
          return (
            <button
              key={id}
              type="button"
              className={`tdm-build__opt${afford ? "" : " is-poor"}${preview === id ? " is-on" : ""}`}
              style={{ "--dx": RING[i][0], "--dy": RING[i][1], "--c": TOWERS[id].color }}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") {
                  setPreview(id);
                  audio.hover();
                }
              }}
              onPointerLeave={(e) => e.pointerType === "mouse" && setPreview((p) => (p === id ? null : p))}
              onFocus={() => setPreview(id)}
              onClick={() => {
                if (touch && preview !== id) {
                  setPreview(id);
                  audio.ui();
                  return;
                }
                onBuild(id);
              }}
              aria-label={`Build ${TOWERS[id].name} for ${cost} coins`}
            >
              <TowerIcon type={id} size={30} />
              <span className="tdm-build__cost">
                <Icon name="coin" size={12} />
                {cost}
              </span>
            </button>
          );
        })}
        <button type="button" className="tdm-build__close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
      {info && (
        <div className="tdm-build__tip">
          <b>{info.name}</b>
          <span>{info.role}</span>
          <span className="tdm-build__stats">
            <i>
              <Icon name="sword" size={12} />
              {st.damage}
            </i>
            <i>
              <Icon name="clock" size={12} />
              {fmt(st.attackSpeed)}/s
            </i>
            <i>
              <Icon name="range" size={12} />
              {fmt(st.range)}
            </i>
          </span>
          {touch && <em>{coins >= st.cost ? "TAP AGAIN TO BUILD" : "NOT ENOUGH COINS"}</em>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ tower panel */
export function TowerPanel({ tower, view, coins, onUpgrade, onSell, onClose, busy }) {
  const ref = useRef(null);
  const [confirm, setConfirm] = useState(false);
  const [hoverUp, setHoverUp] = useState(false);
  const place = useRef((sx, sy, w, h, W) => (sx + 70 + w < W ? [sx + 62, sy - h / 2] : [sx - 62 - w, sy - h / 2])).current;
  useAnchor(ref, view, tower.x, tower.z, 1.2, place);
  const T = TOWERS[tower.type];
  const s = towerStats(tower.type, tower.level);
  const n = tower.level < 3 ? towerStats(tower.type, tower.level + 1) : null;
  const refund = sellValue(tower.invested);
  useEffect(() => {
    view.range = { x: tower.x, z: tower.z, r: s.range, color: "#ffffff" };
    view.range2 = hoverUp && n ? { x: tower.x, z: tower.z, r: n.range, color: "#ffd34a" } : null;
    return () => {
      view.range = null;
      view.range2 = null;
    };
  }, [tower, tower.level, s.range, n, hoverUp, view]);
  useEffect(() => {
    if (!confirm) return undefined;
    const id = setTimeout(() => setConfirm(false), 2600);
    return () => clearTimeout(id);
  }, [confirm]);
  const row = (icon, label, a, b) => (
    <div className="tdm-panel__row">
      <Icon name={icon} size={14} />
      <span>{label}</span>
      <b>{a}</b>
      {b !== undefined && b !== a && <em>→ {b}</em>}
    </div>
  );
  const showNext = hoverUp && n;
  return (
    <div className="tdm-panel tdm-ui" ref={ref} style={{ visibility: "hidden", "--c": T.color }} role="dialog" aria-label={T.name}>
      <div className="tdm-panel__head">
        <TowerIcon type={tower.type} size={28} />
        <div>
          <b>{T.name}</b>
          <span className="tdm-pips" aria-label={`Level ${tower.level} of 3`}>
            {[1, 2, 3].map((i) => (
              <i key={i} className={i <= tower.level ? "is-on" : ""} />
            ))}
            <small>LV {tower.level}</small>
          </span>
        </div>
        <button type="button" className="tdm-panel__x" onClick={onClose} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      </div>
      {row("sword", "Damage", s.damage, showNext ? n.damage : undefined)}
      {row("clock", "Speed", `${fmt(s.attackSpeed)}/s`, showNext ? `${fmt(n.attackSpeed)}/s` : undefined)}
      {row("range", "Range", fmt(s.range), showNext ? fmt(n.range) : undefined)}
      {s.splashRadius > 0 && row("splash", "Splash", fmt(s.splashRadius), showNext ? fmt(n.splashRadius) : undefined)}
      {s.slowAmount > 0 && row("snow", "Slow", `${Math.round(s.slowAmount * 100)}%`, showNext ? `${Math.round(n.slowAmount * 100)}%` : undefined)}
      {tower.type === "mage" && row("shield", "Armour", "IGNORED")}
      {tower.type === "archer" && row("shield", "Armour", "WEAK")}
      <div className="tdm-panel__btns">
        {n ? (
          <button
            type="button"
            className="tdm-btn tdm-btn--primary tdm-btn--sm"
            disabled={busy || coins < s.upgradeCost}
            onClick={onUpgrade}
            onPointerEnter={() => setHoverUp(true)}
            onPointerLeave={() => setHoverUp(false)}
            onFocus={() => setHoverUp(true)}
            onBlur={() => setHoverUp(false)}
          >
            <Icon name="up" size={15} />
            UPGRADE
            <span className="tdm-cost">
              <Icon name="coin" size={13} />
              {s.upgradeCost}
            </span>
          </button>
        ) : (
          <span className="tdm-panel__max">MAX LEVEL</span>
        )}
        <button
          type="button"
          className={`tdm-btn tdm-btn--sm ${confirm ? "tdm-btn--danger" : "tdm-btn--ghost"}`}
          disabled={busy}
          onClick={() => (confirm ? onSell() : setConfirm(true))}
        >
          {confirm ? "CONFIRM" : "SELL"}
          <span className="tdm-cost">
            +<Icon name="coin" size={13} />
            {refund}
          </span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ banners, hint */
export function Banner({ banner }) {
  if (!banner) return null;
  return (
    <div className={`tdm-banner tdm-banner--${banner.kind}`} key={banner.key}>
      {banner.kind === "boss" && <Icon name="skull" size={30} />}
      <b>{banner.text}</b>
      {banner.sub && <span>{banner.sub}</span>}
    </div>
  );
}

export function Hint({ text }) {
  if (!text) return null;
  return <div className="tdm-hint tdm-ui">{text}</div>;
}

/* ------------------------------------------------------------ overlays */
export function PauseOverlay({ onResume, onRestart, onQuit, onSettings }) {
  return (
    <div className="tdm-veil tdm-ui">
      <div className="tdm-card tdm-pause">
        <h2>PAUSED</h2>
        <button type="button" className="tdm-btn tdm-btn--primary" onClick={onResume}>
          <Icon name="play" size={16} /> RESUME
        </button>
        <button type="button" className="tdm-btn" onClick={onRestart}>
          <Icon name="restart" size={16} /> RESTART LEVEL
        </button>
        <button type="button" className="tdm-btn" onClick={onSettings}>
          <Icon name="gear" size={16} /> SETTINGS
        </button>
        <button type="button" className="tdm-btn tdm-btn--ghost" onClick={onQuit}>
          <Icon name="map" size={16} /> QUIT TO LEVELS
        </button>
      </div>
    </div>
  );
}

const TIPS = {
  scout: "Scouts slipped through — a Frost Tower slows them for your Archers.",
  swarmer: "Swarmers overwhelmed you — Cannon splash clears whole packs.",
  armored: "Armored Guards shrug off arrows — Mage bolts ignore armour.",
  brute: "Brutes soak damage — focus Mage and Cannon fire on them.",
  boss: "The boss broke through — upgrade Mage Towers and slow it with Frost.",
  warlord: "The Warlord broke through — Cannons for the swarm, Mages for the Warlord.",
  raider: "Build early and upgrade the towers covering the most road.",
};

export function ResultOverlay({ end, level, hasNext, onNext, onReplay, onLevels }) {
  const s = end.summary;
  const won = s.result === "won";
  const leaks = end.leaksByType || {};
  const worst = Object.entries(leaks).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="tdm-veil tdm-ui">
      <div className={`tdm-card tdm-result ${won ? "is-win" : "is-loss"}`}>
        <span className="tdm-result__kicker">
          LEVEL {level.id} · {level.name.toUpperCase()}
        </span>
        <h2>{won ? "VICTORY" : "DEFEAT"}</h2>
        {won ? (
          <div className="tdm-result__stars">
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < s.stars ? "is-on" : ""} style={{ "--d": `${0.15 + i * 0.22}s` }}>
                <Icon name="star" size={44} />
              </span>
            ))}
          </div>
        ) : (
          <p className="tdm-result__line">
            The base fell on wave {s.wave} of {s.waves}.
          </p>
        )}
        <div className="tdm-result__grid">
          <div>
            <Icon name="heart" size={16} />
            <span>Base health</span>
            <b>
              {s.lives}/{s.maxLives}
            </b>
          </div>
          <div>
            <Icon name="tower" size={16} />
            <span>Towers built</span>
            <b>{s.run.towersBuilt}</b>
          </div>
          <div>
            <Icon name="sword" size={16} />
            <span>Enemies defeated</span>
            <b>{s.run.kills}</b>
          </div>
          <div>
            <Icon name="coin" size={16} />
            <span>Coins left</span>
            <b>{s.coins}</b>
          </div>
        </div>
        {won && end.out?.firstClear && hasNext && <p className="tdm-result__line is-hi">NEXT LEVEL UNLOCKED</p>}
        {won && s.stars < 3 && <p className="tdm-result__line">{s.stars === 1 ? "Keep 50% base health for 2 stars." : "Keep 80% base health for 3 stars."}</p>}
        {!won && worst && <p className="tdm-result__line is-tip">{TIPS[worst[0]] || TIPS.raider}</p>}
        <div className="tdm-result__btns">
          {won && hasNext && (
            <button type="button" className="tdm-btn tdm-btn--primary" onClick={onNext}>
              NEXT LEVEL
            </button>
          )}
          <button type="button" className={`tdm-btn${!won || !hasNext ? " tdm-btn--primary" : ""}`} onClick={onReplay}>
            <Icon name="restart" size={16} />
            {won ? "REPLAY" : "TRY AGAIN"}
          </button>
          <button type="button" className="tdm-btn tdm-btn--ghost" onClick={onLevels}>
            <Icon name="map" size={16} />
            LEVELS
          </button>
        </div>
      </div>
    </div>
  );
}

export { Stars };
