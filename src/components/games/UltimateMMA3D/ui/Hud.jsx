/**
 * In-fight UI: HUD bars, grappling context panel, submission struggle meter,
 * intro card, round break, result screen, pause menu and the touch pad.
 * Pure presentational components fed by a ~10 Hz snapshot (never per frame).
 */
import { useEffect, useRef } from "react";
import { GROUND_NAMES, SUB_NAMES } from "../engine/constants.js";
import { STYLES } from "../data/fighters.js";
import { JUDGE_NAMES } from "../engine/scoring.js";

const fmt = (s) => {
  if (!Number.isFinite(s)) return "∞";
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const pct = (v) => `${Math.max(0, Math.min(100, v))}%`;

function Bars({ f, side }) {
  return (
    <div className={`umc-fp umc-fp--${side}`}>
      <div className="umc-fp__id">
        <span className="umc-fp__flag">{f.flag}</span>
        <span className="umc-fp__name">{f.name}</span>
        <span className="umc-fp__rec">{f.record}</span>
        {f.kd > 0 && <span className="umc-fp__kd" title="Knockdowns">{"▼".repeat(Math.min(3, f.kd))}</span>}
      </div>
      <div className="umc-bar umc-bar--hp" aria-label={`${f.name} health`}>
        <i className="umc-bar__lag" style={{ width: pct(f.hpLag) }} />
        <i className="umc-bar__fill" style={{ width: pct(f.hp) }} />
      </div>
      <div className="umc-fp__row">
        <div className="umc-bar umc-bar--sta" aria-label="stamina">
          <i className="umc-bar__fill" style={{ width: pct((f.sta / f.staMax) * 100) }} />
          <i className="umc-bar__cap" style={{ width: pct(100 - (f.staMax / f.staBase) * 100) }} />
        </div>
        <div className="umc-zones" title="Head · Body · Legs">
          {[
            ["H", f.head],
            ["B", f.body],
            ["L", f.legs],
          ].map(([k, v]) => (
            <span key={k} className="umc-zone" style={{ "--z": v / 100 }}>
              {k}
            </span>
          ))}
        </div>
      </div>
      {f.daze > 55 && <div className="umc-fp__hurt">HURT</div>}
    </div>
  );
}

export function FightHud({ hud, hints, onPause, touchMode }) {
  if (!hud) return null;
  return (
    <div className="umc-hud">
      <div className="umc-hud__top">
        <Bars f={hud.f[0]} side="l" />
        <div className="umc-clock">
          {hud.title && <div className="umc-clock__belt">{hud.title}</div>}
          <div className="umc-clock__time">{hud.training ? "TRAINING" : fmt(hud.clock)}</div>
          <div className="umc-clock__round">{hud.training ? "∞" : `ROUND ${hud.round} / ${hud.rounds}`}</div>
        </div>
        <Bars f={hud.f[1]} side="r" />
      </div>
      <button className="umc-pausebtn" onClick={onPause} aria-label="Pause">
        ❚❚
      </button>
      <ContextPanel hud={hud} touchMode={touchMode} />
      {hud.sub && <SubMeter sub={hud.sub} />}
      {hints && !touchMode && !hud.sub && hud.ctx === "stand" && (
        <div className="umc-hints">
          <b>WASD</b> move <b>J</b> jab <b>K</b> cross <b>L/O</b> hooks <b>U</b> upper <b>I</b> kick <b>S/W+I</b> low/head <b>H</b> teep <b>SPACE</b> guard <b>SHIFT</b> dodge <b>E</b> clinch/shoot <b>ESC</b> pause
        </div>
      )}
    </div>
  );
}

const KEY = { gstrike: "J/K", advance: "R", escape: "R", sub: "E", sub2: "U", standup: "SHIFT", td: "E", pummel: "R", break: "SHIFT", knee: "I", elbow: "L/O", shortPunch: "J/K", cover: "SPACE" };
function ContextPanel({ hud, touchMode }) {
  if (hud.ctx === "stand" || hud.ctx === "sub" || hud.phase !== "fight") return null;
  let title = "";
  let acts = [];
  if (hud.ctx === "clinch") {
    title = `CLINCH — ${hud.clinchDom > 0.3 ? "you control" : hud.clinchDom < -0.3 ? "he controls" : "even"}`;
    acts = [
      ["knee", "Knee"],
      ["elbow", "Elbow"],
      ["shortPunch", "Short uppercut"],
      ["pummel", "Pummel for control"],
      ["td", "Trip takedown"],
      ["break", "Break away"],
    ];
  } else if (hud.ctx === "ground") {
    title = `${GROUND_NAMES[hud.ground.pos].toUpperCase()} — ${hud.ground.top ? "TOP" : "BOTTOM"}`;
    acts = hud.options.map((o) => [o.action, o.label]);
    if (!hud.ground.top) acts.push(["cover", "Cover up"]);
  } else if (hud.ctx === "transition") title = "TAKEDOWN!";
  return (
    <div className="umc-ctx">
      <div className="umc-ctx__title">{title}</div>
      {!touchMode && (
        <div className="umc-ctx__acts">
          {acts.map(([k, l]) => (
            <span key={k + l}>
              <b>{KEY[k] || "?"}</b> {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SubMeter({ sub }) {
  const mine = sub.zones[0];
  const theirs = sub.zones[1];
  return (
    <div className="umc-sub">
      <div className="umc-sub__title">
        {SUB_NAMES[sub.type].toUpperCase()} — {sub.att === 0 ? "FINISH IT!" : "ESCAPE!"}
      </div>
      <div className="umc-sub__track">
        <i className="umc-sub__zone umc-sub__zone--mine" style={{ left: pct((mine.c - mine.w / 2) * 100), width: pct(mine.w * 100) }} />
        <i className="umc-sub__zone umc-sub__zone--theirs" style={{ left: pct((theirs.c - theirs.w / 2) * 100), width: pct(theirs.w * 100) }} />
        <i className="umc-sub__marker" style={{ left: pct(sub.marker * 100) }} />
      </div>
      <div className="umc-sub__bars">
        <div>
          <span>{sub.att === 0 ? "HOLD" : "HIS HOLD"}</span>
          <div className="umc-bar umc-bar--att">
            <i className="umc-bar__fill" style={{ width: pct(sub.prog * 100) }} />
          </div>
        </div>
        <div>
          <span>{sub.att === 0 ? "HIS ESCAPE" : "ESCAPE"}</span>
          <div className="umc-bar umc-bar--esc">
            <i className="umc-bar__fill" style={{ width: pct(sub.esc * 100) }} />
          </div>
        </div>
      </div>
      <div className="umc-sub__hint">Tap J / K / SPACE when the marker is in your gold zone</div>
    </div>
  );
}

/* ------------------------------------------------------------ popups */
export function Popups({ items }) {
  return (
    <div className="umc-popups" aria-live="polite">
      {items.map((p) => (
        <div key={p.id} className={`umc-pop umc-pop--${p.kind}`}>
          {p.text}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ intro */
export function IntroCard({ step, fight, onSkip }) {
  const [a, b] = fight.fighters;
  const card = (f, corner) => (
    <div className={`umc-intro__card umc-intro__card--${corner}`}>
      <div className="umc-intro__corner">{corner === "red" ? "RED CORNER" : "BLUE CORNER"}</div>
      <div className="umc-intro__name">
        {f.flag} {f.name}
      </div>
      {f.nick && <div className="umc-intro__nick">“{f.nick}”</div>}
      <div className="umc-intro__meta">
        {STYLES[f.style]?.name} · {f.record?.[0] ?? 0}-{f.record?.[1] ?? 0} · {f.height} cm · {f.weight} kg · reach {f.reach} cm
      </div>
    </div>
  );
  return (
    <div className="umc-intro" onClick={onSkip}>
      {step === 0 && (
        <div className="umc-intro__venue">
          <div className="umc-intro__event">{fight.title ? fight.title.toUpperCase() : "ULTIMATE MMA CHAMPIONSHIP"}</div>
          <div className="umc-intro__arena">{fight.arenaName}</div>
          {fight.announce && <p className="umc-intro__announce">{fight.announce}</p>}
        </div>
      )}
      {step === 1 && card(a, "red")}
      {step === 2 && card(b, "blue")}
      {step === 3 && (
        <div className="umc-intro__vs">
          <span>{a.name}</span>
          <b>VS</b>
          <span>{b.name}</span>
          {fight.trash && <p className="umc-intro__trash">“{fight.trash}”</p>}
        </div>
      )}
      <button className="umc-skip" onClick={onSkip}>
        Skip ▸
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ round break */
export function RoundBreak({ hud, cards, advice, onContinue }) {
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  const last = cards[cards.length - 1];
  return (
    <div className="umc-modal umc-modal--round">
      <div className="umc-panel">
        <h2 className="umc-h2">END OF ROUND {cards.length}</h2>
        <ScoreTable cards={cards} names={[hud.f[0].name, hud.f[1].name]} />
        {last && (
          <p className="umc-dim">
            Round {cards.length}:{" "}
            {last.judges.map((j, i) => (
              <span key={i}>
                {j[0]}-{j[1]}
                {i < 2 ? " · " : ""}
              </span>
            ))}
          </p>
        )}
        <div className="umc-corner">
          <b>Corner:</b> {advice}
        </div>
        <button ref={ref} className="umc-btn umc-btn--primary" onClick={onContinue}>
          Start Round {cards.length + 1}
        </button>
      </div>
    </div>
  );
}

export function ScoreTable({ cards, names }) {
  if (!cards?.length) return null;
  return (
    <table className="umc-score">
      <thead>
        <tr>
          <th>Judge</th>
          {cards.map((_, i) => (
            <th key={i}>R{i + 1}</th>
          ))}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {JUDGE_NAMES.map((jn, j) => {
          const tot = cards.reduce((a, c) => [a[0] + c.judges[j][0], a[1] + c.judges[j][1]], [0, 0]);
          return (
            <tr key={jn}>
              <td className="umc-score__judge">{jn.replace("Judge ", "")}</td>
              {cards.map((c, i) => (
                <td key={i}>
                  {c.judges[j][0]}-{c.judges[j][1]}
                </td>
              ))}
              <td className={tot[0] > tot[1] ? "umc-win" : tot[1] > tot[0] ? "umc-loss" : ""}>
                {tot[0]}-{tot[1]}
              </td>
            </tr>
          );
        })}
      </tbody>
      <caption className="umc-dim">
        {names[0]} – {names[1]}
      </caption>
    </table>
  );
}

/* ------------------------------------------------------------ result */
export function ResultPanel({ result, names, cards, stats, extra, buttons }) {
  const won = result.winner === 0;
  const draw = result.winner < 0;
  const methodText = { KO: "KNOCKOUT", TKO: "TECHNICAL KNOCKOUT", SUB: "SUBMISSION", DEC: result.detail?.toUpperCase(), DRAW: result.detail?.toUpperCase() || "DRAW" }[result.method];
  return (
    <div className="umc-modal">
      <div className={`umc-panel umc-result ${won ? "umc-result--win" : draw ? "" : "umc-result--loss"}`}>
        <div className="umc-result__head">{draw ? "DRAW" : won ? "VICTORY" : "DEFEAT"}</div>
        <div className="umc-result__method">
          {methodText}
          {result.method !== "DEC" && result.method !== "DRAW" && result.detail && result.method !== "SUB" ? ` — ${result.detail}` : result.method === "SUB" ? ` — ${result.detail}` : ""}
        </div>
        <div className="umc-dim">
          {draw ? "The judges couldn't separate them." : `${names[result.winner]} wins`} · Round {result.round} · {fmt(result.time)}
        </div>
        {cards?.length > 0 && <ScoreTable cards={cards} names={names} />}
        {stats && (
          <div className="umc-stats">
            {stats.map(([k, a, b]) => (
              <div key={k} className="umc-stats__row">
                <span>{a}</span>
                <em>{k}</em>
                <span>{b}</span>
              </div>
            ))}
          </div>
        )}
        {extra}
        <div className="umc-btnrow">
          {buttons.map((b) => (
            <button key={b.label} className={`umc-btn ${b.primary ? "umc-btn--primary" : ""}`} onClick={b.onClick} autoFocus={b.primary}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pause */
export function PauseMenu({ onResume, onRestart, onQuit, onControls, quality, setQuality, training }) {
  return (
    <div className="umc-modal">
      <div className="umc-panel umc-pause">
        <h2 className="umc-h2">PAUSED</h2>
        <button className="umc-btn umc-btn--primary" onClick={onResume} autoFocus>
          Resume
        </button>
        <button className="umc-btn" onClick={onRestart}>
          Restart Fight
        </button>
        <button className="umc-btn" onClick={onControls}>
          Controls
        </button>
        <div className="umc-seg">
          <span>Graphics</span>
          {["low", "medium", "high"].map((q) => (
            <button key={q} className={`umc-chip ${quality === q ? "is-on" : ""}`} onClick={() => setQuality(q)}>
              {q}
            </button>
          ))}
        </div>
        <button className="umc-btn umc-btn--ghost" onClick={onQuit}>
          {training ? "Leave Training" : "Quit to Menu"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ touch pad */
export function TouchPad({ controls, ctx }) {
  const stick = useRef(null);
  const knob = useRef(null);
  const id = useRef(null);
  const move = (e) => {
    const r = stick.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    controls.touch.mx = -dx;
    controls.touch.mz = -dy;
    knob.current.style.transform = `translate(${dx * 38}%, ${dy * 38}%)`;
  };
  const end = () => {
    id.current = null;
    controls.touch.mx = controls.touch.mz = 0;
    if (knob.current) knob.current.style.transform = "";
  };
  const btn = (label, action, cls = "") => (
    <button
      key={label}
      className={`umc-tb ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        if (action === "guard") controls.touch.guard = true;
        else controls.press(action);
      }}
      onPointerUp={() => action === "guard" && (controls.touch.guard = false)}
      onPointerLeave={() => action === "guard" && (controls.touch.guard = false)}
      onPointerCancel={() => action === "guard" && (controls.touch.guard = false)}
    >
      {label}
    </button>
  );
  const ground = ctx === "ground";
  const clinch = ctx === "clinch";
  return (
    <div className="umc-touch">
      <div
        ref={stick}
        className="umc-stick"
        onPointerDown={(e) => {
          id.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => id.current === e.pointerId && move(e)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <i ref={knob} />
      </div>
      <div className="umc-tbtns">
        {btn(ground ? "Strike" : clinch ? "Punch" : "Jab", "jab")}
        {btn(ground ? "Strike" : clinch ? "Punch" : "Cross", "cross")}
        {btn(clinch ? "Elbow" : "Hook", "hookL")}
        {btn(ground ? "Sub 2" : "Upper", "upper")}
        {btn(clinch ? "Knee" : "Kick", "kick")}
        {btn("Guard", "guard", "umc-tb--guard")}
        {btn(ground ? "Stand" : clinch ? "Break" : "Dodge", "dodge")}
        {btn(ground ? "Sub" : clinch ? "Trip" : "Grab", "grab", "umc-tb--grab")}
        {btn(ground ? (ctx === "ground" ? "Move" : "R") : clinch ? "Pummel" : "Teep", ground || clinch ? "grapple" : "teep")}
      </div>
    </div>
  );
}
