/**
 * Menu screens: main menu, Quick Fight setup (fighter → opponent → arena →
 * difficulty), settings and the controls reference. The 3D canvas stays
 * behind these panels and shows the highlighted fighter (world.showcase).
 */
import { useEffect, useState } from "react";
import { FIGHTERS, STYLES, headline, overall } from "../data/fighters.js";
import { ARENAS } from "../data/arenas.js";
import { COMBOS } from "../engine/moves.js";
import { DIFFICULTIES, DIFF_LABEL } from "../engine/constants.js";

export function MainMenu({ onPick, hasCareer, hasTournament, careerLabel }) {
  const items = [
    ["quick", "Quick Fight", "Pick two fighters, an arena and fight now."],
    ["career", hasCareer ? "Career — Continue" : "Career Mode", hasCareer ? careerLabel : "From unknown amateur to world champion."],
    ["tournament", hasTournament ? "Tournament — Continue" : "Tournament", "Eight fighters. Three rounds of knockouts. One champion."],
    ["training", "Training", "Learn every system against an adjustable dummy."],
    ["settings", "Settings", "Difficulty, graphics, round length, audio."],
    ["controls", "Controls", "Keyboard, gamepad and touch layouts."],
  ];
  return (
    <div className="umc-menu">
      <div className="umc-brand">
        <div className="umc-brand__kicker">FIGHT • DOMINATE • BECOME CHAMPION</div>
        <h1 className="umc-brand__title">
          ULTIMATE <span>MMA</span>
          <br />
          CHAMPIONSHIP <em>3D</em>
        </h1>
      </div>
      <nav className="umc-menu__list">
        {items.map(([id, label, sub], i) => (
          <button key={id} className="umc-menu__item" onClick={() => onPick(id)} autoFocus={i === 0} style={{ "--i": i }}>
            <span className="umc-menu__label">{label}</span>
            <span className="umc-menu__sub">{sub}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export function StatBars({ attrs }) {
  const h = headline(attrs);
  return (
    <div className="umc-statbars">
      {Object.entries(h).map(([k, v]) => (
        <div key={k} className="umc-statbar">
          <span>{k}</span>
          <div className="umc-bar">
            <i className="umc-bar__fill" style={{ width: `${v}%` }} />
          </div>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

export function FighterDetail({ f, compact = false }) {
  if (!f) return null;
  return (
    <div className="umc-detail">
      <div className="umc-detail__head">
        <span className="umc-detail__flag">{f.flag}</span>
        <div>
          <div className="umc-detail__name">{f.name}</div>
          <div className="umc-detail__nick">
            “{f.nick}” · {f.nation}
          </div>
        </div>
        <div className="umc-ovr">
          <b>{overall(f.attrs)}</b>
          <span>OVR</span>
        </div>
      </div>
      <div className="umc-detail__meta">
        <span>{STYLES[f.style].name}</span>
        <span>
          {f.record[0]}-{f.record[1]}
        </span>
        <span>{f.height} cm</span>
        <span>{f.weight} kg</span>
        <span>Reach {f.reach} cm</span>
      </div>
      <StatBars attrs={f.attrs} />
      {!compact && (
        <>
          <p className="umc-dim umc-detail__blurb">{STYLES[f.style].blurb}</p>
          <div className="umc-detail__combos">
            <b>Signature:</b> {f.combos.map((id) => COMBOS.find((c) => c.id === id)?.name).join(" · ")}
          </div>
        </>
      )}
    </div>
  );
}

export function FighterGrid({ list, value, onChange, disabledId }) {
  return (
    <div className="umc-grid" role="listbox">
      {list.map((f) => (
        <button
          key={f.id}
          role="option"
          aria-selected={value === f.id}
          disabled={disabledId === f.id}
          className={`umc-card ${value === f.id ? "is-on" : ""}`}
          onClick={() => onChange(f.id)}
          onMouseEnter={() => onChange(f.id, true)}
          style={{ "--c1": f.look.shorts, "--c2": f.look.accent }}
        >
          <span className="umc-card__flag">{f.flag}</span>
          <span className="umc-card__name">{f.name.split(" ").slice(-1)[0]}</span>
          <span className="umc-card__style">{STYLES[f.style].name}</span>
          <span className="umc-card__ovr">{overall(f.attrs)}</span>
        </button>
      ))}
    </div>
  );
}

export function ArenaPicker({ value, onChange, unlockedTier, freeAll }) {
  return (
    <div className="umc-arenas">
      {ARENAS.map((a) => {
        const locked = !freeAll && a.unlock > unlockedTier;
        return (
          <button key={a.id} disabled={locked} className={`umc-arena ${value === a.id ? "is-on" : ""} umc-arena--${a.id}`} onClick={() => onChange(a.id)}>
            <span className="umc-arena__name">{a.name}</span>
            <span className="umc-arena__meta">
              {a.city} · {a.capacity.toLocaleString()} seats
            </span>
            <span className="umc-arena__blurb">{locked ? `🔒 Reach the ${["", "", "Pro League", "", "International", "World"][a.unlock] || "next"} tier in Career to unlock` : a.blurb}</span>
          </button>
        );
      })}
    </div>
  );
}

export function DifficultyPicker({ value, onChange }) {
  const desc = {
    easy: "Slow reactions, frequent mistakes. Learn the game.",
    normal: "A solid opponent who blocks, counters and wrestles.",
    hard: "Fast reads, real combinations, punishes habits.",
    champion: "Elite decisions and adaptation. No extra health — just better.",
  };
  return (
    <div className="umc-diffs">
      {DIFFICULTIES.map((d) => (
        <button key={d} className={`umc-diff ${value === d ? "is-on" : ""} umc-diff--${d}`} onClick={() => onChange(d)}>
          <b>{DIFF_LABEL[d]}</b>
          <span>{desc[d]}</span>
        </button>
      ))}
    </div>
  );
}

/** Quick Fight: 4 steps. */
export function QuickFight({ settings, unlockedTier, onPreview, onStart, onBack, initial }) {
  const [step, setStep] = useState(0);
  const [me, setMe] = useState(initial?.me || "petrosyan");
  const [opp, setOpp] = useState(initial?.opp || "volkov");
  const [hover, setHover] = useState(null);
  const [arena, setArena] = useState(initial?.arena || "underground");
  const [diff, setDiff] = useState(settings.difficulty);
  const [rounds, setRounds] = useState(initial?.rounds || 3);
  const shown = FIGHTERS.find((f) => f.id === (hover || (step === 1 ? opp : me)));
  useEffect(() => {
    if (step <= 1 && shown) onPreview(shown);
  }, [shown, step, onPreview]);
  const titles = ["Choose Your Fighter", "Choose Your Opponent", "Choose the Arena", "Fight Settings"];
  const pick = (setter) => (id, isHover) => {
    if (isHover) setHover(id);
    else {
      setHover(null);
      setter(id);
    }
  };
  return (
    <div className="umc-setup" onMouseLeave={() => setHover(null)}>
      <header className="umc-setup__head">
        <button className="umc-back" onClick={() => (step ? setStep(step - 1) : onBack())}>
          ‹ {step ? "Back" : "Menu"}
        </button>
        <h2 className="umc-h2">{titles[step]}</h2>
        <div className="umc-steps">
          {titles.map((t, i) => (
            <i key={t} className={i <= step ? "is-on" : ""} />
          ))}
        </div>
      </header>
      {step <= 1 && (
        <div className="umc-select">
          <FighterGrid list={FIGHTERS} value={step === 0 ? me : opp} onChange={pick(step === 0 ? setMe : setOpp)} disabledId={step === 1 ? me : null} />
          <FighterDetail f={shown} />
        </div>
      )}
      {step === 2 && <ArenaPicker value={arena} onChange={setArena} unlockedTier={unlockedTier} />}
      {step === 3 && (
        <div className="umc-fightset">
          <DifficultyPicker value={diff} onChange={setDiff} />
          <div className="umc-seg">
            <span>Rounds</span>
            {[1, 3, 5].map((r) => (
              <button key={r} className={`umc-chip ${rounds === r ? "is-on" : ""}`} onClick={() => setRounds(r)}>
                {r}
              </button>
            ))}
            <span className="umc-dim">{settings.roundTime / 60} min rounds (Settings)</span>
          </div>
          <div className="umc-vsline">
            {FIGHTERS.find((f) => f.id === me).name} <b>vs</b> {FIGHTERS.find((f) => f.id === opp).name}
          </div>
        </div>
      )}
      <footer className="umc-setup__foot">
        {step < 3 ? (
          <button className="umc-btn umc-btn--primary" onClick={() => setStep(step + 1)}>
            Next ›
          </button>
        ) : (
          <button className="umc-btn umc-btn--primary umc-btn--big" onClick={() => onStart({ me, opp, arena, difficulty: diff, rounds })}>
            FIGHT!
          </button>
        )}
      </footer>
    </div>
  );
}

export function Settings({ settings, setSetting, onBack, onResetCareer, hasCareer }) {
  const seg = (label, key, opts, render = (x) => x) => (
    <div className="umc-seg">
      <span>{label}</span>
      {opts.map((o) => (
        <button key={String(o)} className={`umc-chip ${settings[key] === o ? "is-on" : ""}`} onClick={() => setSetting(key, o)}>
          {render(o)}
        </button>
      ))}
    </div>
  );
  const slider = (label, key) => (
    <label className="umc-slider">
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={settings[key]} onChange={(e) => setSetting(key, Number(e.target.value))} />
      <b>{Math.round(settings[key] * 100)}</b>
    </label>
  );
  return (
    <div className="umc-page">
      <header className="umc-setup__head">
        <button className="umc-back" onClick={onBack}>
          ‹ Menu
        </button>
        <h2 className="umc-h2">Settings</h2>
      </header>
      <div className="umc-settings">
        {seg("Default difficulty", "difficulty", DIFFICULTIES, (d) => DIFF_LABEL[d])}
        {seg("Graphics", "quality", ["low", "medium", "high"])}
        {seg("Round length", "roundTime", [60, 90, 120, 180, 300], (s) => `${s / 60} min`)}
        {slider("Master volume", "master")}
        {slider("Effects", "sfx")}
        {slider("Crowd", "crowd")}
        {seg("Control hints", "hints", [true, false], (v) => (v ? "On" : "Off"))}
        {seg("Touch controls", "touch", ["auto", "on", "off"])}
        <p className="umc-dim">Graphics: Low disables shadows and thins the crowd; High adds 4× MSAA, soft 2048² shadows and subtle bloom. The Game Center mute button silences everything.</p>
        {hasCareer && (
          <button className="umc-btn umc-btn--danger" onClick={onResetCareer}>
            Delete career save…
          </button>
        )}
      </div>
    </div>
  );
}

export function ControlsHelp({ onBack }) {
  const rows = [
    ["Move", "W A S D", "Left stick"],
    ["Jab · Cross", "J · K", "A · X"],
    ["Left / right hook", "L · O", "Y"],
    ["Uppercut", "U", "B"],
    ["Body shots", "hold S + J / K / L", "stick ↓ + button"],
    ["Body kick · Low · Head", "I · S+I · W+I", "RT (+ stick ↓/↑)"],
    ["Front kick", "H", "RB"],
    ["High guard · Body guard", "SPACE · SPACE + S", "LT (+ stick ↓)"],
    ["Slip · Duck · Step back", "SHIFT + A/D · SHIFT · SHIFT + S", "LB (+ stick)"],
    ["Clinch / shoot / pounce", "E", "D-pad ↓"],
    ["Sprawl (when he shoots)", "SHIFT or E", "LB"],
    ["Clinch: knee · elbow · trip · pummel · break", "I · L · E · R · SHIFT", ""],
    ["Ground: strike · advance/escape · sub · stand", "J/K · R · E (U guillotine) · SHIFT", "A · D-pad ↑ · D-pad ↓ · LB"],
    ["Submission struggle", "tap J / K / SPACE in your zone", "tap A / X"],
    ["Pause", "ESC", "START"],
  ];
  return (
    <div className="umc-page">
      <header className="umc-setup__head">
        <button className="umc-back" onClick={onBack}>
          ‹ Back
        </button>
        <h2 className="umc-h2">Controls</h2>
      </header>
      <table className="umc-keys">
        <thead>
          <tr>
            <th>Action</th>
            <th>Keyboard</th>
            <th>Gamepad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, k, g]) => (
            <tr key={a}>
              <td>{a}</td>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{g}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="umc-dim">Combos: press the next strike as the previous one lands (e.g. J → K → L). Counters: strike right after a slip or a block for +30% damage.</p>
    </div>
  );
}
