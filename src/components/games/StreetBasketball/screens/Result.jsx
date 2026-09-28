/**
 * Street Basketball — match result and training result cards.
 */
import { courtById } from "../data/courts.js";
import Portrait from "../hud/Portrait.jsx";
import { opponentLook } from "../utils/progress.js";

export function MatchResult({ result, rewards, opponent, playerLook, playerName, hasNext, mode, onNext, onReplay, onCareer }) {
  const won = result.winner === "p";
  const s = result.stats.p;
  const pct = s.fga ? Math.round((s.fgm / s.fga) * 100) : 0;
  const rows = [
    ["SHOTS MADE", s.fgm],
    ["SHOTS ATTEMPTED", s.fga],
    ["ACCURACY", `${pct}%`],
    ["2-POINTERS", `${s.twoM}/${s.twoA}`],
    ["PERFECT RELEASES", s.perfect],
    ["DUNKS", s.dunks],
    ["LAYUPS", s.layups],
    ["BLOCKS", s.blocks],
    ["STEALS", s.steals],
    ["REBOUNDS", s.rebounds],
  ];
  return (
    <div className={`sb-screen sb-result ${won ? "is-win" : "is-loss"}`}>
      <div className="sb-result__banner">
        <span className="sb-result__word">{won ? "WIN" : "LOSS"}</span>
        <div className="sb-result__score">
          <div>
            <Portrait look={playerLook} size={64} />
            <b>{playerName}</b>
          </div>
          <strong>{result.score.p}<i>–</i>{result.score.o}</strong>
          <div>
            <Portrait look={opponentLook(opponent)} size={64} />
            <b>{opponent.first.toUpperCase()}</b>
          </div>
        </div>
      </div>
      <div className="sb-result__body">
        <table className="sb-boxscore">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}><th>{k}</th><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="sb-rewards">
          {rewards?.newlyDefeated && <div className="sb-reward sb-reward--gold">{opponent.final ? "👑 KING OF THE STREET" : `${opponent.first.toUpperCase()} DEFEATED`}</div>}
          {rewards?.skillPoints > 0 && <div className="sb-reward">+{rewards.skillPoints} SKILL POINTS</div>}
          {rewards?.courtUnlocked && <div className="sb-reward sb-reward--court">NEW COURT: {courtById(rewards.courtUnlocked).name.toUpperCase()}</div>}
          {rewards?.unlocks?.map((u) => <div key={u} className="sb-reward">UNLOCKED · {u.toUpperCase()}</div>)}
          {!won && <div className="sb-reward sb-reward--tip">{tipFor(s)}</div>}
          {mode === "quick" && <div className="sb-reward sb-reward--tip">Quick Match — no career changes.</div>}
        </div>
      </div>
      <div className="sb-result__actions">
        {won && hasNext && <button type="button" className="sb-btn sb-btn--primary" onClick={onNext}>NEXT OPPONENT</button>}
        <button type="button" className={`sb-btn${won && hasNext ? "" : " sb-btn--primary"}`} onClick={onReplay}>{won ? "REPLAY" : "RUN IT BACK"}</button>
        <button type="button" className="sb-btn sb-btn--ghost" onClick={onCareer}>{mode === "quick" ? "QUICK MATCH" : "CAREER"}</button>
      </div>
    </div>
  );
}

function tipFor(s) {
  if (s.fga > 0 && s.perfect / s.fga < 0.25) return "TIP: release J right as the meter hits the green band.";
  if (s.rebounds < 3) return "TIP: crash the glass — Space to jump for rebounds.";
  if (s.layups + s.dunks < 2) return "TIP: attack the rim with L — sprint in with Shift to dunk.";
  return "TIP: cross him (K) when he leans the wrong way, then drive.";
}

export function DrillResult({ mode, result, record, unlocks, best, onRetry, onBack }) {
  const title = { free: "SESSION OVER", three: "3-POINT CHALLENGE", dunk: "DUNK PRACTICE", dribble: "DRIBBLE PRACTICE", defense: "DEFENSE PRACTICE" }[mode];
  let big = result.score;
  let sub = "";
  if (mode === "free") { big = `${result.makes}`; sub = "shots made"; }
  if (mode === "three") sub = `points · ${result.makes} makes`;
  if (mode === "dunk") sub = `points · ${result.dunks} dunks · ${result.layups} layups`;
  if (mode === "dribble") { big = `${Number(result.time).toFixed(2)}s`; sub = `course time · ${result.crosses} crossovers`; }
  if (mode === "defense") sub = `stops · ${result.allowed} allowed`;
  return (
    <div className="sb-screen sb-result is-win">
      <div className="sb-result__banner">
        <span className="sb-result__word sb-result__word--small">{title}</span>
        <div className="sb-drillscore"><strong>{big}</strong><span>{sub}</span></div>
        {record && <div className="sb-reward sb-reward--gold">NEW PERSONAL BEST</div>}
        {!record && best != null && <div className="sb-reward">BEST: {best}</div>}
        {unlocks?.map((u) => <div key={u} className="sb-reward">UNLOCKED · {u.toUpperCase()}</div>)}
      </div>
      <div className="sb-result__actions">
        <button type="button" className="sb-btn sb-btn--primary" onClick={onRetry}>AGAIN</button>
        <button type="button" className="sb-btn sb-btn--ghost" onClick={onBack}>TRAINING</button>
      </div>
    </div>
  );
}
