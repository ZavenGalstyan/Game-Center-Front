/**
 * School Life Simulator 3D — classroom activities (React overlays).
 *
 *   QuizRunner      timed questions: multiple choice, typed answers, timeline
 *                   ordering and sentence building (used by every subject,
 *                   homework, study sessions and exams)
 *   Experiment      Science: titration, circuit (Ohm's law), pigment mixing
 *   RobotPuzzle     Computer Science: program a robot across a 5×5 grid
 *   LessonOverlay   intro → activity parts → graded result (calls onFinish)
 *   ExamOverlay     timed multi-subject exam with a breakdown
 *   StudyOverlay    homework list / study sessions at study seats
 *   ComputerOverlay three robot puzzles in the Computer Room
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeQuestions, makeExam, isCorrect, scienceExperiment, robotPuzzle, runRobot, fmtYear } from "./questions.js";
import { SUBJECTS, letter, LETTER_COLOR, subjectInfo } from "./data.js";
import { audio } from "./audio.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================================================================ QuizRunner */
export function QuizRunner({ questions, timePer = 15, onDone, hints = [], title }) {
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(timePer);
  const [fb, setFb] = useState(null); // { ok, right }
  const [input, setInput] = useState("");
  const [order, setOrder] = useState([]);
  const [words, setWords] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [hintUsed, setHintUsed] = useState(false);
  const res = useRef({ correct: 0, total: questions.length, timeBonus: 0, by: {} });
  const leftRef = useRef(timePer);
  const q = questions[i];
  const inputRef = useRef(null);

  useEffect(() => {
    setLeft(timePer);
    leftRef.current = timePer;
    setInput("");
    setOrder([]);
    setWords([]);
    setHidden([]);
    if (q && q.type === "input") setTimeout(() => inputRef.current?.focus(), 30);
  }, [i, timePer, q]);

  const answer = useCallback(
    (given) => {
      if (fb || !q) return;
      const ok = isCorrect(q, given);
      const R = res.current;
      const s = q.subject || "x";
      R.by[s] = R.by[s] || { correct: 0, total: 0 };
      R.by[s].total++;
      if (ok) {
        R.correct++;
        R.by[s].correct++;
        R.timeBonus += leftRef.current / timePer;
        audio.correct();
      } else audio.wrong();
      const right = q.type === "mc" ? q.options[q.answer] : q.type === "input" ? String(q.answer) : q.type === "order" ? q.answer.map((k) => {
        const it = q.items.find((x) => x.key === k);
        return `${it.label} (${fmtYear(it.year)})`;
      }).join(" → ") : q.answer;
      setFb({ ok, right, given });
      setTimeout(() => {
        setFb(null);
        if (i + 1 >= questions.length) {
          const base = (R.correct / R.total) * 100;
          const bonus = R.correct ? (R.timeBonus / R.total) * 8 : 0;
          onDone({ correct: R.correct, total: R.total, score: clamp(Math.round(base + bonus), 0, 100), bySubject: R.by });
        } else setI((n) => n + 1);
      }, ok ? 850 : 1700);
    },
    [fb, q, timePer, i, questions.length, onDone],
  );

  // countdown
  useEffect(() => {
    if (fb || !q) return undefined;
    const id = setInterval(() => {
      leftRef.current = Math.max(0, leftRef.current - 0.1);
      setLeft(leftRef.current);
      if (leftRef.current <= 0) {
        clearInterval(id);
        answer(q.type === "mc" ? -1 : q.type === "order" ? [] : "");
      }
    }, 100);
    return () => clearInterval(id);
  }, [fb, q, answer]);

  // number keys for multiple choice
  useEffect(() => {
    const kd = (e) => {
      if (!q || fb) return;
      if (q.type === "mc" && /^Digit[1-4]$/.test(e.code)) {
        const k = Number(e.code.slice(5)) - 1;
        if (k < q.options.length && !hidden.includes(k)) {
          e.preventDefault();
          answer(k);
        }
      }
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, [q, fb, answer, hidden]);

  if (!q) return null;
  const useHint = () => {
    if (hintUsed || !hints.length) return;
    setHintUsed(true);
    audio.ui();
    if (q.type === "mc") {
      const wrong = q.options.map((_, k) => k).filter((k) => k !== q.answer);
      setHidden(wrong.slice(0, 2));
    } else if (q.type === "input") setInput(String(q.answer).slice(0, 1));
    else if (q.type === "order") setOrder([q.answer[0]]);
    else if (q.type === "arrange") setWords([q.answer.split(" ")[0]]);
  };
  const pct = left / timePer;
  return (
    <div className="sl-quiz">
      <div className="sl-quiz__top">
        <span className="sl-quiz__count">{title ? `${title} · ` : ""}Question {i + 1} / {questions.length}</span>
        <span className="sl-quiz__topic">{q.topic}</span>
      </div>
      <div className="sl-quiz__timer">
        <i style={{ transform: `scaleX(${pct})`, background: pct < 0.3 ? "#ef4c4c" : pct < 0.6 ? "#f2b20f" : "#2fbf71" }} />
      </div>
      <pre className={`sl-quiz__q${q.q.includes("\n") ? " sl-quiz__q--code" : ""}`}>{q.q}</pre>
      {q.type === "mc" && (
        <div className="sl-quiz__opts">
          {q.options.map((o, k) => (
            <button
              key={k}
              type="button"
              disabled={!!fb || hidden.includes(k)}
              className={`sl-opt${fb && k === q.answer ? " is-right" : ""}${fb && fb.given === k && !fb.ok ? " is-wrong" : ""}${hidden.includes(k) ? " is-hidden" : ""}`}
              onClick={() => answer(k)}
            >
              <kbd>{k + 1}</kbd>
              {o}
            </button>
          ))}
        </div>
      )}
      {q.type === "input" && (
        <form
          className="sl-quiz__input"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) answer(input);
          }}
        >
          <input ref={inputRef} inputMode="decimal" autoComplete="off" value={input} disabled={!!fb} onChange={(e) => setInput(e.target.value.replace(/[^0-9.,\-−]/g, "").replace("−", "-"))} placeholder="Type your answer" aria-label="Your answer" />
          <button type="submit" className="sl-btn sl-btn--primary" disabled={!!fb || !input.trim()}>
            Submit ⏎
          </button>
        </form>
      )}
      {q.type === "order" && (
        <div className="sl-quiz__order">
          <p className="sl-dim">Click the events from oldest to newest.</p>
          <div className="sl-quiz__chips">
            {q.items.map((it) => {
              const pos = order.indexOf(it.key);
              return (
                <button key={it.key} type="button" className={`sl-chipbtn${pos >= 0 ? " is-on" : ""}`} disabled={!!fb} onClick={() => setOrder((o) => (o.includes(it.key) ? o.filter((k) => k !== it.key) : [...o, it.key]))}>
                  {pos >= 0 && <b>{pos + 1}</b>}
                  {it.label}
                </button>
              );
            })}
          </div>
          <button type="button" className="sl-btn sl-btn--primary" disabled={!!fb || order.length !== q.items.length} onClick={() => answer(order)}>
            Check order
          </button>
        </div>
      )}
      {q.type === "arrange" && (
        <div className="sl-quiz__order">
          <div className="sl-quiz__sentence">{words.length ? words.join(" ") : <span className="sl-dim">Click the words in order…</span>}</div>
          <div className="sl-quiz__chips">
            {q.words.map((w, k) => {
              const used = words.filter((x) => x === w).length >= q.words.slice(0, k + 1).filter((x) => x === w).length;
              return (
                <button key={k} type="button" className={`sl-chipbtn${used ? " is-on" : ""}`} disabled={!!fb || used} onClick={() => setWords((ws) => [...ws, w])}>
                  {w}
                </button>
              );
            })}
          </div>
          <div className="sl-row">
            <button type="button" className="sl-btn" disabled={!!fb || !words.length} onClick={() => setWords((ws) => ws.slice(0, -1))}>
              Undo
            </button>
            <button type="button" className="sl-btn sl-btn--primary" disabled={!!fb || words.length !== q.words.length} onClick={() => answer(words.join(" "))}>
              Check sentence
            </button>
          </div>
        </div>
      )}
      {hints.length > 0 && !hintUsed && !fb && (
        <button type="button" className="sl-hint" onClick={useHint}>
          🤫 Ask {hints[0]} for a hint (once)
        </button>
      )}
      {fb && (
        <div className={`sl-quiz__fb ${fb.ok ? "is-ok" : "is-bad"}`}>
          {fb.ok ? "✓ Correct!" : `✗ The answer was: ${fb.right}`}
        </div>
      )}
    </div>
  );
}

/* ================================================================ Science experiments */
export function Experiment({ exp, onDone }) {
  if (exp.kind === "titration") return <Titration exp={exp} onDone={onDone} />;
  if (exp.kind === "circuit") return <Circuit exp={exp} onDone={onDone} />;
  return <Mixing exp={exp} onDone={onDone} />;
}
function Titration({ exp, onDone }) {
  const [lvl, setLvl] = useState(0);
  const [pouring, setPouring] = useState(false);
  const [flash, setFlash] = useState(0);
  const [done, setDone] = useState(null);
  const lv = useRef(0);
  useEffect(() => {
    if (!pouring || done) return undefined;
    const id = setInterval(() => {
      lv.current = Math.min(100, lv.current + 0.55);
      setLvl(lv.current);
      if (exp.target - lv.current < 7 && Math.random() < 0.3) setFlash(1);
    }, 50);
    return () => clearInterval(id);
  }, [pouring, done, exp.target]);
  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(0), 350);
    return () => clearTimeout(id);
  }, [flash]);
  useEffect(() => {
    const kd = (e) => {
      if (e.code === "Space" && !done) {
        e.preventDefault();
        setPouring(true);
      }
    };
    const ku = (e) => e.code === "Space" && setPouring(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [done]);
  const pink = lvl >= exp.target ? Math.min(1, 0.35 + (lvl - exp.target) / 12) : flash ? 0.25 : 0;
  const finish = () => {
    const err = lvl - exp.target;
    const score = lvl < exp.target - 15 ? 15 : clamp(Math.round(100 - Math.abs(err) * (err > 0 ? 7 : 9)), 10, 100);
    setDone({ score, err });
    audio[score >= 70 ? "success" : "fail"]();
  };
  return (
    <div className="sl-exp">
      <p className="sl-exp__instr">{exp.instr}</p>
      <div className="sl-titr">
        <div className="sl-titr__burette">
          <i style={{ height: `${100 - lvl}%` }} />
          <span>{Math.round(lvl)} mL</span>
        </div>
        <div className="sl-titr__flask" style={{ "--pink": pink }}>
          <div className="sl-titr__liquid" />
          {pouring && <div className="sl-titr__drop" />}
        </div>
      </div>
      {!done ? (
        <div className="sl-row">
          <button type="button" className={`sl-btn sl-btn--hold${pouring ? " is-on" : ""}`} onPointerDown={() => setPouring(true)} onPointerUp={() => setPouring(false)} onPointerLeave={() => setPouring(false)}>
            Hold to POUR (or Space)
          </button>
          <button type="button" className="sl-btn sl-btn--primary" onClick={finish} disabled={lvl < 2}>
            Stop — record result
          </button>
        </div>
      ) : (
        <div className="sl-exp__res">
          <p>
            End point at <b>{exp.target} mL</b> · you stopped at <b>{Math.round(lvl)} mL</b> ({done.err > 0 ? `${Math.round(done.err)} over` : `${Math.round(-done.err)} under`}).
          </p>
          <button type="button" className="sl-btn sl-btn--primary" onClick={() => onDone(done.score)}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
function Circuit({ exp, onDone }) {
  const [pick, setPick] = useState(null);
  const right = exp.volts / exp.target;
  const cur = pick != null ? exp.volts / pick : 0;
  const ok = pick != null && Math.abs(pick - right) < 0.01;
  return (
    <div className="sl-exp">
      <p className="sl-exp__instr">{exp.instr}</p>
      <div className="sl-circuit">
        <div className="sl-circuit__bat">🔋 {exp.volts} V</div>
        <div className="sl-circuit__wire" />
        <div className="sl-circuit__bulb" style={{ "--glow": pick == null ? 0 : clamp(cur / (exp.target * 1.6), 0.08, 1.6) }}>💡</div>
        <div className="sl-circuit__amp">{pick == null ? "— A" : `${cur.toFixed(2)} A`}</div>
      </div>
      <div className="sl-quiz__opts">
        {exp.options.map((r) => (
          <button key={r} type="button" className={`sl-opt${pick === r ? (ok ? " is-right" : " is-wrong") : ""}`} disabled={pick != null} onClick={() => {
            setPick(r);
            audio[Math.abs(r - right) < 0.01 ? "correct" : "wrong"]();
          }}>
            {Math.round(r * 10) / 10} Ω
          </button>
        ))}
      </div>
      {pick != null && (
        <div className="sl-exp__res">
          <p>{ok ? `Perfect — ${exp.volts} V ÷ ${right} Ω = ${exp.target} A. The bulb glows just right!` : `Not quite: you need R = V ÷ I = ${exp.volts} ÷ ${exp.target} = ${right} Ω.`}</p>
          <button type="button" className="sl-btn sl-btn--primary" onClick={() => onDone(ok ? 100 : 35)}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
const PIG = { red: [220, 40, 50], blue: [40, 90, 220], yellow: [245, 205, 40] };
function Mixing({ exp, onDone }) {
  const [drops, setDrops] = useState({ red: 0, blue: 0, yellow: 0 });
  const [res, setRes] = useState(null);
  const total = drops.red + drops.blue + drops.yellow;
  const mix = useMemo(() => {
    if (!total) return [235, 235, 235];
    // subtractive-ish mix: weighted average with a darkening term
    const c = [0, 0, 0];
    for (const k of Object.keys(PIG)) for (let i = 0; i < 3; i++) c[i] += (PIG[k][i] * drops[k]) / total;
    const used = Object.values(drops).filter((v) => v > 0).length;
    if (drops.blue && drops.yellow && !drops.red) return [60, 160, 70].map((v, i) => v * 0.7 + c[i] * 0.3);
    return c.map((v) => v * (1 - 0.12 * (used - 1)));
  }, [drops, total]);
  const tgt = exp.target;
  const test = () => {
    const want = Object.entries(tgt.parts).filter(([, v]) => v > 0).map(([k]) => k);
    const wrongPig = Object.keys(drops).filter((k) => drops[k] > 0 && !want.includes(k)).reduce((s, k) => s + drops[k], 0);
    const a = drops[want[0]];
    const b = drops[want[1]];
    const ratio = a && b ? Math.min(a, b) / Math.max(a, b) : 0;
    const score = clamp(Math.round(ratio * 100 - wrongPig * 15), 5, 100);
    setRes(score);
    audio[score >= 70 ? "success" : "fail"]();
  };
  return (
    <div className="sl-exp">
      <p className="sl-exp__instr">{exp.instr}</p>
      <div className="sl-mix">
        <div className="sl-mix__swatch" style={{ background: tgt.name === "Green" ? "#3ca046" : tgt.name === "Orange" ? "#f08a24" : "#8a3cb4" }}>
          Target: {tgt.name}
        </div>
        <div className="sl-mix__swatch" style={{ background: `rgb(${mix.map((v) => Math.round(v)).join(",")})` }}>
          Your mix ({total} drops)
        </div>
      </div>
      {res == null ? (
        <div className="sl-row">
          {Object.keys(PIG).map((k) => (
            <button key={k} type="button" className="sl-btn" style={{ background: `rgb(${PIG[k].join(",")})`, color: "#fff" }} onClick={() => {
              audio.click();
              setDrops((d) => ({ ...d, [k]: d[k] + 1 }));
            }}>
              + {k}
            </button>
          ))}
          <button type="button" className="sl-btn" onClick={() => setDrops({ red: 0, blue: 0, yellow: 0 })}>
            Empty
          </button>
          <button type="button" className="sl-btn sl-btn--primary" disabled={total < 2} onClick={test}>
            TEST
          </button>
        </div>
      ) : (
        <div className="sl-exp__res">
          <p>{res >= 90 ? "Perfect colour match!" : res >= 60 ? "Close! Equal parts give the cleanest colour." : `${tgt.name} is made from ${Object.entries(tgt.parts).filter(([, v]) => v).map(([k]) => k).join(" + ")} in equal parts.`}</p>
          <button type="button" className="sl-btn sl-btn--primary" onClick={() => onDone(res)}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

/* ================================================================ Robot puzzle */
const ARROW = ["→", "↓", "←", "↑"];
export function RobotPuzzle({ puzzle, onDone, label }) {
  const [prog, setProg] = useState([]);
  const [run, setRun] = useState(null); // { trail, i, result }
  const [tries, setTries] = useState(0);
  const P = puzzle;
  const walls = useMemo(() => new Set(P.walls), [P]);
  const exec = () => {
    const r = runRobot(P, prog);
    setTries((t) => t + 1);
    // animate step by step through the program
    let step = 0;
    let pos = [...P.start];
    let dir = P.dir;
    const frames = [{ pos: [...pos], dir }];
    for (const c of prog) {
      if (c === "L") dir = (dir + 3) % 4;
      else if (c === "R") dir = (dir + 1) % 4;
      else {
        const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][dir];
        const nx = pos[0] + d[0];
        const ny = pos[1] + d[1];
        if (nx < 0 || ny < 0 || nx >= P.N || ny >= P.N || walls.has(`${nx},${ny}`)) {
          frames.push({ pos: [...pos], dir, crash: true });
          break;
        }
        pos = [nx, ny];
      }
      frames.push({ pos: [...pos], dir });
    }
    setRun({ frames, i: 0, result: r });
    const id = setInterval(() => {
      step++;
      if (step >= frames.length) {
        clearInterval(id);
        setRun((s) => (s ? { ...s, i: frames.length - 1, done: true } : s));
        audio[r.reached ? "success" : "wrong"]();
        return;
      }
      audio.click();
      setRun((s) => (s ? { ...s, i: step } : s));
    }, 260);
  };
  const cur = run ? run.frames[run.i] : { pos: P.start, dir: P.dir };
  const finished = run && run.done;
  const success = finished && run.result.reached;
  const out = tries >= 3 && finished && !success;
  const score = success ? Math.max(40, 100 - (tries - 1) * 25 - Math.max(0, prog.length - P.best - 1) * 5) : 0;
  return (
    <div className="sl-robot">
      <p className="sl-exp__instr">{label || "Program the robot to reach the flag."} The robot starts facing →. Commands: Forward, Turn left, Turn right. Shortest possible: {P.best} commands. Attempt {Math.min(3, tries + (finished ? 0 : 1))}/3.</p>
      <div className="sl-robot__wrap">
        <div className="sl-robot__grid" style={{ gridTemplateColumns: `repeat(${P.N}, 1fr)` }}>
          {Array.from({ length: P.N * P.N }, (_, k) => {
            const x = k % P.N;
            const y = Math.floor(k / P.N);
            const isWall = walls.has(`${x},${y}`);
            const isGoal = x === P.goal[0] && y === P.goal[1];
            const isBot = x === cur.pos[0] && y === cur.pos[1];
            const trail = run && run.frames.slice(0, run.i + 1).some((f) => f.pos[0] === x && f.pos[1] === y);
            return (
              <div key={k} className={`sl-robot__cell${isWall ? " is-wall" : ""}${trail ? " is-trail" : ""}`}>
                {isGoal && <span className="sl-robot__goal">🏁</span>}
                {isBot && <span className={`sl-robot__bot${cur.crash ? " is-crash" : ""}`}>{ARROW[cur.dir]}</span>}
              </div>
            );
          })}
        </div>
        <div className="sl-robot__prog">
          <div className="sl-robot__list">
            {prog.length ? prog.map((c, k) => <span key={k} className={run && !run.done && run.i === k + 1 ? "is-cur" : ""}>{c === "F" ? "⬆ Fwd" : c === "L" ? "↺ Left" : "↻ Right"}</span>) : <em className="sl-dim">Empty program</em>}
          </div>
          {!finished || (!success && !out) ? (
            <>
              <div className="sl-row">
                {[["F", "⬆ Forward"], ["L", "↺ Left"], ["R", "↻ Right"]].map(([c, t]) => (
                  <button key={c} type="button" className="sl-btn" disabled={(run && !run.done) || prog.length >= 14} onClick={() => {
                    audio.click();
                    setRun(null);
                    setProg((p) => [...p, c]);
                  }}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="sl-row">
                <button type="button" className="sl-btn" disabled={!prog.length || (run && !run.done)} onClick={() => {
                  setRun(null);
                  setProg((p) => p.slice(0, -1));
                }}>
                  Undo
                </button>
                <button type="button" className="sl-btn" disabled={!prog.length || (run && !run.done)} onClick={() => {
                  setRun(null);
                  setProg([]);
                }}>
                  Clear
                </button>
                <button type="button" className="sl-btn sl-btn--primary" disabled={!prog.length || (run && !run.done)} onClick={exec}>
                  ▶ Run
                </button>
              </div>
              {finished && !success && <p className="sl-bad">The robot {run.result.crashed ? "crashed into a wall" : "stopped before the flag"}. Fix the program and try again.</p>}
            </>
          ) : (
            <div className="sl-exp__res">
              <p className={success ? "sl-good" : "sl-bad"}>{success ? `Reached the flag in ${prog.length} commands!` : "Out of attempts for this puzzle."}</p>
              <button type="button" className="sl-btn sl-btn--primary" onClick={() => onDone(score)}>
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ Lesson */
const PLAN = {
  math: { parts: [{ kind: "quiz", n: 6, t: 18 }], topic: "Arithmetic, equations & logic", instr: "Solve each problem before the timer runs out. Type numbers or pick an answer (keys 1-4)." },
  english: { parts: [{ kind: "quiz", n: 5, t: 20 }], topic: "Vocabulary & sentence building", instr: "Pick synonyms and antonyms, complete sentences and build a sentence from word tiles." },
  science: { parts: [{ kind: "quiz", n: 3, t: 18 }, { kind: "exp" }], topic: "Quiz + lab experiment", instr: "Answer a short quiz, then run today's experiment at your bench." },
  history: { parts: [{ kind: "quiz", n: 4, t: 22 }], topic: "Timelines & historical facts", instr: "Answer questions about dates and events, and put a timeline in order." },
  cs: { parts: [{ kind: "quiz", n: 3, t: 22 }, { kind: "robot" }], topic: "Code tracing + robot programming", instr: "Read short programs and predict their output, then program a robot to reach the flag." },
};
export function LessonOverlay({ subject, teacher, hints, focus, onFinish, onClose }) {
  const plan = PLAN[subject];
  const info = SUBJECTS[subject];
  const [stage, setStage] = useState("intro"); // intro | part | result
  const [pi, setPi] = useState(0);
  const scores = useRef([]);
  const corr = useRef({ correct: 0, total: 0 });
  const [result, setResult] = useState(null);
  const qs = useMemo(() => plan.parts.map((p) => (p.kind === "quiz" ? makeQuestions(subject, p.n) : null)), [plan, subject]);
  const exp = useMemo(() => (subject === "science" ? scienceExperiment() : null), [subject]);
  const puzzle = useMemo(() => (subject === "cs" ? robotPuzzle() : null), [subject]);
  const finishPart = (score, c) => {
    scores.current.push(score);
    if (c) {
      corr.current.correct += c.correct;
      corr.current.total += c.total;
    }
    if (pi + 1 < plan.parts.length) setPi(pi + 1);
    else {
      const avg = Math.round(scores.current.reduce((a, b) => a + b, 0) / scores.current.length);
      const r = onFinish({ score: avg, ...corr.current });
      setResult({ ...r, score: r?.score ?? avg, correct: corr.current.correct, total: corr.current.total });
      setStage("result");
      if (r && r.score >= 70) audio.success();
      else audio.fail();
    }
  };
  return (
    <div className="sl-card sl-lesson" style={{ "--subj": info.color }}>
      <header className="sl-lesson__head">
        <span className="sl-lesson__icon">{info.icon}</span>
        <div>
          <h2>{info.name}</h2>
          <p>{teacher} · {plan.topic}</p>
        </div>
      </header>
      {stage === "intro" && (
        <div className="sl-lesson__intro">
          <p>{plan.instr}</p>
          {focus > 1.01 && <p className="sl-good">You feel focused — extra time on every question.</p>}
          {focus < 0.99 && <p className="sl-bad">You're tired — less time per question. Eat something to restore energy.</p>}
          {hints.length > 0 && <p className="sl-good">Your friend {hints.join(" & ")} sits nearby and can whisper one hint.</p>}
          <button type="button" className="sl-btn sl-btn--primary sl-btn--big" autoFocus onClick={() => {
            audio.ui();
            setStage("part");
          }}>
            Start activity
          </button>
        </div>
      )}
      {stage === "part" && plan.parts[pi].kind === "quiz" && <QuizRunner key={pi} title={info.short} questions={qs[pi]} timePer={Math.round(plan.parts[pi].t * focus)} hints={hints} onDone={(r) => finishPart(r.score, r)} />}
      {stage === "part" && plan.parts[pi].kind === "exp" && <Experiment exp={exp} onDone={(s) => finishPart(s)} />}
      {stage === "part" && plan.parts[pi].kind === "robot" && <RobotPuzzle puzzle={puzzle} onDone={(s) => finishPart(s)} />}
      {stage === "result" && result && <ResultView result={result} onClose={onClose} />}
    </div>
  );
}
function ResultView({ result, onClose, extra }) {
  const g = result.grade || letter(result.score);
  return (
    <div className="sl-result">
      <div className="sl-result__grade" style={{ color: LETTER_COLOR[g] }}>
        {g}
      </div>
      <div className="sl-result__score">
        <b>{result.score}</b>/100
        {result.total ? <span> · {result.correct}/{result.total} correct</span> : null}
      </div>
      {result.feedback && <p className="sl-result__fb">“{result.feedback}”</p>}
      {extra}
      {result.homework && (
        <p className="sl-result__hw">
          📝 Homework: <b>{result.homework.desc}</b> — due day {result.homework.due}. Do it at a library table or a study station.
        </p>
      )}
      <button type="button" className="sl-btn sl-btn--primary sl-btn--big" autoFocus onClick={onClose}>
        Continue
      </button>
    </div>
  );
}

/* ================================================================ Exam */
export function ExamOverlay({ subjects, focus, onFinish, onClose }) {
  const [stage, setStage] = useState("intro");
  const [res, setRes] = useState(null);
  const qs = useMemo(() => makeExam(subjects, Math.random, 10), [subjects]);
  return (
    <div className="sl-card sl-lesson" style={{ "--subj": "#e0457b" }}>
      <header className="sl-lesson__head">
        <span className="sl-lesson__icon">📝</span>
        <div>
          <h2>Exam</h2>
          <p>Covers: {subjects.map((s) => SUBJECTS[s].name).join(", ")}</p>
        </div>
      </header>
      {stage === "intro" && (
        <div className="sl-lesson__intro">
          <p>10 timed questions ({Math.round(20 * focus)} s each). No hints during exams. Your score counts more than a normal lesson.</p>
          <button type="button" className="sl-btn sl-btn--primary sl-btn--big" autoFocus onClick={() => setStage("quiz")}>
            Begin exam
          </button>
        </div>
      )}
      {stage === "quiz" && (
        <QuizRunner
          title="Exam"
          questions={qs}
          timePer={Math.round(20 * focus)}
          onDone={(r) => {
            const out = onFinish(r);
            setRes({ ...r, ...out, score: out?.score ?? r.score });
            setStage("result");
            audio[(out?.score ?? r.score) >= 60 ? "success" : "fail"]();
          }}
        />
      )}
      {stage === "result" && res && (
        <ResultView
          result={res}
          onClose={onClose}
          extra={
            <ul className="sl-result__by">
              {Object.entries(res.bySubject || {}).map(([s, r]) => (
                <li key={s}>
                  <span>{SUBJECTS[s]?.icon} {SUBJECTS[s]?.name}</span>
                  <b>{r.correct}/{r.total}</b>
                </li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  );
}

/* ================================================================ Study / homework */
export function StudyOverlay({ homework, onHomework, onStudy, onClose, focus }) {
  const [mode, setMode] = useState(null); // { kind: 'hw', hw } | { kind: 'study', subject }
  const [res, setRes] = useState(null);
  const qs = useMemo(() => (mode ? makeQuestions(mode.kind === "hw" ? mode.hw.subject : mode.subject, mode.kind === "hw" ? 4 : 5) : null), [mode]);
  if (res) return <div className="sl-card sl-lesson"><ResultView result={res} onClose={onClose} /></div>;
  if (mode && qs) {
    const subj = mode.kind === "hw" ? mode.hw.subject : mode.subject;
    return (
      <div className="sl-card sl-lesson" style={{ "--subj": SUBJECTS[subj].color }}>
        <header className="sl-lesson__head">
          <span className="sl-lesson__icon">{SUBJECTS[subj].icon}</span>
          <div>
            <h2>{mode.kind === "hw" ? "Homework" : "Study session"}</h2>
            <p>{mode.kind === "hw" ? mode.hw.desc : `Reviewing ${SUBJECTS[subj].name}`}</p>
          </div>
        </header>
        <QuizRunner
          title={SUBJECTS[subj].short}
          questions={qs}
          timePer={Math.round(22 * focus)}
          onDone={(r) => {
            const out = mode.kind === "hw" ? onHomework(mode.hw.id, r) : onStudy(subj, r);
            setRes({ ...r, ...out, score: out?.score ?? r.score, feedback: mode.kind === "hw" ? "Homework handed in." : "Study session complete — it'll help in your next lesson (+5)." });
            audio[(out?.score ?? r.score) >= 60 ? "success" : "fail"]();
          }}
        />
      </div>
    );
  }
  return (
    <div className="sl-card sl-study">
      <h2>📚 Study desk</h2>
      <h3>Homework</h3>
      {homework.length ? (
        <ul className="sl-list">
          {homework.map((h) => (
            <li key={h.id}>
              <span>
                {SUBJECTS[h.subject].icon} <b>{SUBJECTS[h.subject].name}</b> — {h.desc}
                <em className="sl-dim"> · due day {h.due}</em>
              </span>
              <button type="button" className="sl-btn sl-btn--primary" onClick={() => setMode({ kind: "hw", hw: h })}>
                Do it
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sl-dim">No homework right now. 🎉</p>
      )}
      <h3>Study a subject</h3>
      <p className="sl-dim">A short review boosts your next lesson in that subject (+5) and earns XP.</p>
      <div className="sl-row sl-row--wrap">
        {["math", "english", "science", "history", "cs"].map((s) => (
          <button key={s} type="button" className="sl-btn" onClick={() => setMode({ kind: "study", subject: s })}>
            {SUBJECTS[s].icon} {SUBJECTS[s].short}
          </button>
        ))}
      </div>
      <button type="button" className="sl-btn sl-btn--ghost" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

/* ================================================================ Computer room */
export function ComputerOverlay({ onFinish, onClose }) {
  const puzzles = useMemo(() => [robotPuzzle(), robotPuzzle(), robotPuzzle()], []);
  const [i, setI] = useState(0);
  const scores = useRef([]);
  const [res, setRes] = useState(null);
  if (res) return <div className="sl-card sl-lesson"><ResultView result={res} onClose={onClose} /></div>;
  return (
    <div className="sl-card sl-lesson" style={{ "--subj": "#8b5cf6" }}>
      <header className="sl-lesson__head">
        <span className="sl-lesson__icon">🤖</span>
        <div>
          <h2>Coding Challenge</h2>
          <p>Puzzle {i + 1} of 3 · program the robot</p>
        </div>
      </header>
      <RobotPuzzle
        key={i}
        puzzle={puzzles[i]}
        onDone={(s) => {
          scores.current.push(s);
          if (i + 1 < puzzles.length) setI(i + 1);
          else {
            const score = Math.round(scores.current.reduce((a, b) => a + b, 0) / scores.current.length);
            const out = onFinish({ score });
            setRes({ score: out?.score ?? score, feedback: score >= 60 ? "Mr. Chen would be proud!" : "Keep practising — loops and turns take time." });
            audio[score >= 60 ? "success" : "fail"]();
          }
        }}
      />
    </div>
  );
}
export { subjectInfo };
