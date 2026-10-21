/**
 * Story + result screens: dialogue, cinematic captions, boss intro, hacking,
 * death, contract failed / complete, boss victory, final choice, ending.
 */
import { useEffect, useState } from "react";
import { NPCS } from "../data/npcs.js";
import { BOSSES } from "../engine/bosses.js";
import { STACKS } from "../data/items.js";
import { ENDINGS } from "../data/story.js";
import { allowed } from "../engine/hack.js";
import { DISTRICTS } from "../data/districts/index.js";

const SPEAKER_COLORS = { juno: "#a64dff", kenji: "#ffb02e", rhee: "#19f0ff", marta: "#ff8a1f", nan: "#ff2bd6", pip: "#19c8ff", ozzy: "#ffb02e", lena: "#7b8cff", kade: "#4dff9a", razor: "#ff3b5c", ironjaw: "#ff8a1f", specter: "#9fe7ff", vex: "#ff2bd6" };
export function speakerName(who, P) {
  const radio = who.startsWith("radio:");
  const id = who.replace("radio:", "");
  const name = id === "kade" ? P?.name || "Kade" : NPCS[id]?.name || BOSSES[id]?.name || id;
  return { name, radio, color: SPEAKER_COLORS[id] || "#fff", id };
}

export function Dialogue({ d, P, onNext, onSkip }) {
  const [line, setLine] = useState(0);
  const [shown, setShown] = useState(0);
  const cur = d.lines[d.i];
  const text = cur?.[1] || "";
  useEffect(() => {
    setShown(0);
    setLine(d.i);
  }, [d.i, d.key]);
  useEffect(() => {
    if (shown >= text.length) return;
    const id = setTimeout(() => setShown((s) => Math.min(text.length, s + 2)), 16);
    return () => clearTimeout(id);
  }, [shown, text]);
  if (!cur) return null;
  const sp = speakerName(cur[0], P);
  const done = shown >= text.length;
  return (
    <div className="nm-dialogue" onClick={() => (done ? onNext() : setShown(text.length))}>
      <div className="nm-dialogue__box" style={{ "--c": sp.color }}>
        <div className="nm-dialogue__who">
          <span className="nm-dialogue__badge">{sp.radio ? "◉ COMMS" : "◆"}</span>
          {sp.name}
        </div>
        <div className="nm-dialogue__text">{text.slice(0, shown)}</div>
        <div className="nm-dialogue__hint">
          <span>
            {line + 1}/{d.lines.length}
          </span>
          <span>
            <kbd>Space</kbd>/<kbd>E</kbd>/click to {done ? "continue" : "skip text"}
          </span>
          <button
            className="nm-link"
            onClick={(e) => {
              e.stopPropagation();
              onSkip();
            }}
          >
            Skip scene
          </button>
        </div>
      </div>
    </div>
  );
}

export function Cinematic({ cin, onSkip }) {
  const shot = cin?.shots?.[Math.min(cin.i, cin.shots.length - 1)];
  return (
    <div className="nm-cine">
      <div className="nm-cine__bar" />
      <div className="nm-cine__bar nm-cine__bar--b" />
      {cin?.title && cin.i === 0 && cin.t < 2.5 && <div className="nm-cine__title">{cin.title}</div>}
      {shot?.text && (
        <div key={cin.i} className="nm-cine__caption">
          {shot.text}
        </div>
      )}
      <button className="nm-cine__skip" onClick={onSkip}>
        Skip ▸▸ <kbd>Esc</kbd>
      </button>
    </div>
  );
}

export function BossIntro({ boss }) {
  const B = BOSSES[boss];
  if (!B) return null;
  return (
    <div className="nm-bossintro">
      <div className="nm-bossintro__kicker">HOSTILE // PRIORITY TARGET</div>
      <div className="nm-bossintro__name">{B.name}</div>
      <div className="nm-bossintro__title">{B.title}</div>
      <div className="nm-bossintro__text">{B.intro}</div>
    </div>
  );
}

export function Hack({ B, onPick, onAbort }) {
  if (!B) return null;
  const left = Math.max(0, B.time - B.t);
  return (
    <div className="nm-modal">
      <div className="nm-panel nm-hack">
        <div className="nm-kicker">BREACH PROTOCOL</div>
        <div className="nm-hack__top">
          <div>
            <div className="nm-small nm-dim">Upload this sequence</div>
            <div className="nm-hack__seq">
              {B.seq.map((c, i) => (
                <span key={i}>{c}</span>
              ))}
            </div>
          </div>
          <div className={`nm-hack__timer${left < 6 ? " nm-low" : ""}`}>{left.toFixed(1)} s</div>
        </div>
        <div className="nm-hack__buffer">
          {Array.from({ length: B.size }).map((_, i) => (
            <span key={i} className={B.buffer[i] ? "on" : ""}>
              {B.buffer[i] || ""}
            </span>
          ))}
        </div>
        <div className="nm-hack__grid" style={{ gridTemplateColumns: `repeat(${B.n}, 1fr)` }}>
          {B.grid.map((row, r) =>
            row.map((code, c) => {
              const used = B.picked.some(([pr, pc]) => pr === r && pc === c);
              const ok = allowed(B, r, c);
              const lane = B.axis === "row0" ? r === 0 : B.axis === "col" ? c === B.last[1] : r === B.last[0];
              return (
                <button key={`${r}-${c}`} className={`nm-hack__cell${used ? " used" : ""}${ok ? " ok" : ""}${lane ? " lane" : ""}`} disabled={!ok} onClick={() => onPick(r, c)}>
                  {used ? "[ ]" : code}
                </button>
              );
            })
          )}
        </div>
        <p className="nm-dim nm-small">Pick from the highlighted lane. The first pick is from the top row; then alternate column ↕ and row ↔ through the cell you just took. Hacking power adds time and buffer slots.</p>
        {B.status !== "active" && <div className={`nm-hack__result ${B.status === "success" ? "nm-up" : "nm-down"}`}>{B.status === "success" ? "ACCESS GRANTED" : "BREACH FAILED"}</div>}
        <div className="nm-row nm-row--end">
          <button className="nm-btn nm-btn--ghost" onClick={onAbort}>
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

export function Death({ lost, mission, onRetry }) {
  return (
    <div className="nm-modal nm-modal--red">
      <div className="nm-death">
        <div className="nm-death__title" data-text="FLATLINED">
          FLATLINED
        </div>
        <p>{mission ? `Contract “${mission}” failed. Your fixer pulls you out.` : "A street medic drags you back to the safehouse."}</p>
        <p className="nm-dim nm-small">Medical bill: {lost} ¢</p>
        <button className="nm-btn nm-btn--primary" onClick={onRetry} autoFocus>
          <span>{mission ? "Retry from checkpoint" : "Respawn"}</span>
        </button>
      </div>
    </div>
  );
}

const FAIL = { spotted: "You were spotted — the alarm wiped the target.", timer: "Time ran out.", protect: "Dr. Lena Sato was taken down.", death: "You flatlined." };
export function MissionFailed({ title, reason, onRetry, onAbandon }) {
  return (
    <div className="nm-modal nm-modal--red">
      <div className="nm-panel nm-result">
        <div className="nm-kicker nm-down">CONTRACT FAILED</div>
        <h2 className="nm-h2">{title}</h2>
        <p>{FAIL[reason] || "The contract failed."}</p>
        <div className="nm-row nm-row--end">
          <button className="nm-btn nm-btn--ghost" onClick={onAbandon}>
            Abandon
          </button>
          <button className="nm-btn nm-btn--primary" onClick={onRetry} autoFocus>
            <span>Retry from checkpoint</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function MissionComplete({ r, onClose, P }) {
  return (
    <div className="nm-modal">
      <div className="nm-panel nm-result nm-result--win">
        <div className="nm-kicker nm-up">CONTRACT COMPLETE</div>
        <h2 className="nm-h2">{r.title}</h2>
        <div className="nm-result__rewards">
          <div>
            <b>+{r.xp}</b>
            <span>XP</span>
          </div>
          <div>
            <b>+{r.credits.toLocaleString()}</b>
            <span>Credits</span>
          </div>
          {Object.entries(r.stacks || {}).map(([k, n]) => (
            <div key={k}>
              <b>{n}×</b>
              <span>{STACKS[k].name}</span>
            </div>
          ))}
        </div>
        {r.levels > 0 && (
          <p className="nm-up">
            LEVEL UP → {P.level} · {P.sp} skill point{P.sp === 1 ? "" : "s"} to spend (Tab)
          </p>
        )}
        {r.unlock && <p className="nm-up">New district unlocked: {DISTRICTS[r.unlock].name} — take the Maglev from the station.</p>}
        <button className="nm-btn nm-btn--primary" onClick={onClose} autoFocus>
          <span>Continue</span>
        </button>
      </div>
    </div>
  );
}

export function BossVictory({ v, onClose }) {
  return (
    <div className="nm-modal">
      <div className="nm-panel nm-result nm-result--boss">
        <div className="nm-kicker">TARGET ELIMINATED</div>
        <div className="nm-bossintro__name">{v.name}</div>
        <div className="nm-result__rewards">
          <div>
            <b>+{v.xp}</b>
            <span>XP</span>
          </div>
          <div>
            <b>+{v.credits.toLocaleString()}</b>
            <span>Credits</span>
          </div>
          <div>
            <b>+1</b>
            <span>Skill point</span>
          </div>
          {v.item && (
            <div className="nm-result__legend">
              <b>{v.item}</b>
              <span>Unique weapon</span>
            </div>
          )}
          {Object.entries(v.stacks || {}).map(([k, n]) => (
            <div key={k}>
              <b>{n}×</b>
              <span>{STACKS[k].name}</span>
            </div>
          ))}
        </div>
        <button className="nm-btn nm-btn--primary" onClick={onClose} autoFocus>
          <span>Continue</span>
        </button>
      </div>
    </div>
  );
}

export function Choice({ onChoose }) {
  return (
    <div className="nm-modal">
      <div className="nm-panel nm-choice">
        <div className="nm-kicker">THE CHOIR FILES</div>
        <h2 className="nm-h2">What happens to the truth?</h2>
        <div className="nm-choice__opts">
          <button className="nm-dest" style={{ "--c": "#19f0ff" }} onClick={() => onChoose("leak")}>
            <b>Broadcast it</b>
            <span className="nm-small">Push every file to every screen in Neon City. Halcyon burns.</span>
          </button>
          <button className="nm-dest" style={{ "--c": "#ffb02e" }} onClick={() => onChoose("sell")}>
            <b>Sell it</b>
            <span className="nm-small">Juno has buyers. 25,000 credits and a quiet life above the rain.</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Ending({ P, onFree, onMenu }) {
  const E = ENDINGS[P.ending || "leak"];
  const S = P.stats;
  return (
    <div className="nm-ending">
      <div className="nm-ending__inner">
        <div className="nm-kicker">NEON MERCENARY — ENDING</div>
        <h1 className="nm-title nm-title--sm">{E.title}</h1>
        {E.lines.map((l, i) => (
          <p key={i} style={{ animationDelay: `${0.6 + i * 1.1}s` }}>
            {l}
          </p>
        ))}
        <div className="nm-ending__stats">
          <span>Level {P.level}</span>
          <span>{S.kills} enemies</span>
          <span>{Object.keys(P.story.bosses).length}/4 bosses</span>
          <span>{Math.floor(S.time / 60)} min</span>
          <span>{S.deaths} flatlines</span>
        </div>
        <div className="nm-row nm-row--center">
          <button className="nm-btn" onClick={onMenu}>
            <span>Main menu</span>
          </button>
          <button className="nm-btn nm-btn--primary" onClick={onFree}>
            <span>Keep playing (free roam)</span>
          </button>
        </div>
        <div className="nm-dim nm-small nm-ending__credits">Thanks for playing. Characters & animations: Quaternius (CC0). City, weapons, robots, audio and story: generated in code.</div>
      </div>
    </div>
  );
}

export function TalkCard({ npc, onClose }) {
  const d = NPCS[npc];
  if (!d) return null;
  const line = d.idle[Math.floor(Date.now() / 7000) % d.idle.length];
  return (
    <div className="nm-dialogue" onClick={onClose}>
      <div className="nm-dialogue__box" style={{ "--c": SPEAKER_COLORS[npc] || "#fff" }}>
        <div className="nm-dialogue__who">
          <span className="nm-dialogue__badge">◆</span>
          {d.name} <small className="nm-dim">— {d.role}</small>
        </div>
        <div className="nm-dialogue__text">{line}</div>
        <div className="nm-dialogue__hint">
          <span />
          <span>Click / Space to close</span>
        </div>
      </div>
    </div>
  );
}
