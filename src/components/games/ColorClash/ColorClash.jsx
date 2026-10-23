/**
 * Color Clash — a four-colour shedding card game: you vs. three AI players.
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js); Restart / Mute / Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) restarts the current match (Quick
 * Match or Challenge); `muted` silences the WebAudio blips. Rules live in
 * ./engine.js (pure, tested by tools/engineTest.mjs). Settings are saved under
 * `color-clash-settings`, wins / losses under `color-clash-stats`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as E from "./engine.js";
import { COLOR_NAMES } from "./engine.js";
import { Card, CardBack, Emblem, cardName } from "./cards.jsx";
import { createAudio } from "./audio.js";
import "./ColorClash.css";

const SETTINGS_KEY = "color-clash-settings";
const STATS_KEY = "color-clash-stats";
const PLAYERS = [
  { name: "You", avatar: "😎" },
  { name: "Foxy", avatar: "🦊", ai: true },
  { name: "Bolt", avatar: "🤖", ai: true },
  { name: "Inky", avatar: "🐙", ai: true },
];
const TARGETS = [250, 500];
const LEVELS = { easy: "Easy", normal: "Normal", hard: "Hard" };
const ORDER = { r: 0, y: 1, g: 2, b: 3, w: 4 };
const VORDER = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "rev", "d2", "wild", "wd4"];
const sortHand = (hand) => hand.slice().sort((a, b) => ORDER[a.c] - ORDER[b.c] || VORDER.indexOf(a.v) - VORDER.indexOf(b.v));
const VALUE_LABEL = { skip: "Skip", rev: "Reverse", d2: "+2" };

const load = (key, fallback) => {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key)) };
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
};
const speed = () => (import.meta.env.DEV && window.__ccSpeed) || 1;

export default function ColorClash({ restartSignal = 0, muted = false }) {
  const [settings, setSettings] = useState(() => load(SETTINGS_KEY, { difficulty: "normal", target: 500, hints: true }));
  const [stats, setStats] = useState(() => load(STATS_KEY, { quick: { w: 0, l: 0 }, challenge: { w: 0, l: 0 } }));
  const [screen, setScreen] = useState("menu"); // menu | game | round | match
  const [overlay, setOverlay] = useState(null); // pause | rules
  const [match, setMatch] = useState(null);
  const [g, setG] = useState(null);
  const [sel, setSel] = useState(null);
  const [wildFor, setWildFor] = useState(null); // card id waiting for a colour
  const [shake, setShake] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [banner, setBanner] = useState(null);
  const [flies, setFlies] = useState([]);
  const [landFrom, setLandFrom] = useState(0);

  const audio = useMemo(() => createAudio(), []);
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => audio.setMuted(muted), [audio, muted]);
  const pointer = useRef("mouse"); // touch taps select first, then play; mouse clicks play at once

  const paused = overlay !== null;
  const inGame = screen === "game" && g;
  const me = g?.players[0];
  const myTurn = inGame && E.actor(g) === 0 && (g.phase === "play" || g.phase === "drawn");

  /* ---------- match flow ---------- */
  const startMatch = useCallback(
    (mode) => {
      const dealer = Math.floor(Math.random() * 4);
      setMatch({ mode, target: settings.target, difficulty: settings.difficulty, scores: [0, 0, 0, 0], round: 1, dealer, last: null, done: false });
      setG(E.newRound({ players: PLAYERS, dealer, difficulty: settings.difficulty }));
      setScreen("game");
      setOverlay(null);
      setSel(null);
      setWildFor(null);
      setToasts([]);
      setFlies([]);
    },
    [settings.target, settings.difficulty],
  );

  const nextRound = () => {
    const dealer = (match.dealer + 1) % 4;
    setMatch({ ...match, dealer, round: match.round + 1 });
    setG(E.newRound({ players: PLAYERS, dealer, difficulty: match.difficulty }));
    setScreen("game");
    setSel(null);
    setWildFor(null);
    setToasts([]);
  };

  const record = (mode, won) => {
    setStats((st) => {
      const next = { ...st, [mode]: { ...st[mode], [won ? "w" : "l"]: st[mode][won ? "w" : "l"] + 1 } };
      save(STATS_KEY, next);
      return next;
    });
    audio.play(won ? "win" : "lose");
  };

  const endRound = () => {
    const { winner, points } = g;
    const last = { winner, points, hands: g.players.map((p) => sortHand(p.hand)) };
    if (match.mode === "quick") {
      setMatch({ ...match, last, done: true });
      record("quick", winner === 0);
      setScreen("match");
      return;
    }
    const scores = match.scores.map((v, i) => (i === winner ? v + points : v));
    const done = scores[winner] >= match.target;
    setMatch({ ...match, scores, last, done });
    if (done) record("challenge", winner === 0);
    else audio.play(winner === 0 ? "win" : "lose");
    setScreen(done ? "match" : "round");
  };

  // GamePlayer Restart → restart the current match
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (match && screen !== "menu") startMatch(match.mode);
  }, [restartSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- AI / timers ---------- */
  useEffect(() => {
    if (!inGame || paused) return;
    let t;
    if (g.phase === "over") t = setTimeout(endRound, 1500);
    else if (g.pendingLast != null) t = setTimeout(() => setG(E.catchLast), (g.pendingLast === 0 ? 1900 : 900) * speed());
    else if (g.players[E.actor(g)].ai) t = setTimeout(() => setG(E.aiAct), (g.phase === "challenge" ? 1100 : 850 + Math.random() * 350) * speed());
    return () => clearTimeout(t);
  }, [g, inGame, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- event feedback (sounds, toasts, banners, flying cards) ---------- */
  const seen = useRef(null);
  const toast = useCallback((text, kind = "") => {
    const id = Math.random();
    setToasts((ts) => [...ts.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2400);
  }, []);
  useEffect(() => {
    if (!g || g.events === seen.current) return;
    seen.current = g.events;
    const name = (seat) => (seat === 0 ? "You" : PLAYERS[seat].name);
    const pop = (text, cls) => setBanner({ text, cls, id: Math.random() });
    let flyN = 0;
    for (const e of g.events) {
      if (e.type === "play") {
        setLandFrom(e.seat);
        const v = e.card.v;
        audio.play(v === "skip" ? "skip" : v === "rev" ? "reverse" : v === "d2" || v === "wd4" ? "plus" : e.card.c === "w" ? "wild" : "play");
        if (v === "skip") pop("SKIP", `c-${e.card.c}`);
        else if (v === "rev") pop("REVERSE", `c-${e.card.c}`);
        else if (v === "d2") pop("+2", `c-${e.card.c}`);
        else if (v === "wd4") pop("+4", "c-w");
      } else if (e.type === "color") {
        if (g.events.every((x) => x.type !== "play" || x.card.v !== "wd4")) pop(COLOR_NAMES[e.color].toUpperCase(), `c-${e.color}`);
        toast(`${name(e.seat)} ${e.seat === 0 ? "pick" : "picks"} ${COLOR_NAMES[e.color]}`, `c-${e.color}`);
      } else if (e.type === "draw") {
        const id = Math.random();
        const n = Math.min(e.n, 6);
        setFlies((f) => [...f, ...Array.from({ length: n }, (_, k) => ({ id: id + k, seat: e.seat, delay: (flyN + k) * 70 }))]);
        setTimeout(() => setFlies((f) => f.filter((x) => x.id < id || x.id >= id + n)), 900 + (flyN + n) * 70);
        flyN += n;
        audio.play("draw");
        if (e.reason === "d2") toast(`${name(e.seat)} ${e.seat === 0 ? "draw" : "draws"} 2 and ${e.seat === 0 ? "lose" : "loses"} the turn`, "bad");
        if (e.reason === "wd4") toast(`${name(e.seat)} ${e.seat === 0 ? "draw" : "draws"} 4 and ${e.seat === 0 ? "lose" : "loses"} the turn`, "bad");
      } else if (e.type === "skip" && !g.events.some((x) => x.type === "draw" && x.seat === e.seat)) {
        toast(`${name(e.seat)} ${e.seat === 0 ? "are" : "is"} skipped`);
      } else if (e.type === "reverse") {
        toast(e.dir === 1 ? "Play runs clockwise" : "Play runs counter-clockwise");
      } else if (e.type === "lastCall") {
        audio.play("last");
        toast(`${name(e.seat)}: LAST CARD!`, "good");
        if (e.seat !== 0) pop("LAST CARD!", "c-last");
      } else if (e.type === "lastReady") {
        audio.play("last");
      } else if (e.type === "lastPenalty") {
        audio.play("penalty");
        toast(`${name(e.seat)} forgot to call LAST CARD — +2`, "bad");
      } else if (e.type === "challenge") {
        const by = name(e.by);
        toast(e.guilty ? `Challenge! ${by} ${e.by === 0 ? "were" : "was"} bluffing — +4 to ${by}` : `Challenge failed — ${name(e.seat)} ${e.seat === 0 ? "draw" : "draws"} 6`, e.guilty === (e.seat === 0) ? "good" : "bad");
      } else if (e.type === "reshuffle") {
        toast("Discard pile reshuffled into the deck");
      } else if (e.type === "pass" && e.seat !== 0) {
        toast(`${name(e.seat)} passes`);
      } else if (e.type === "win") {
        toast(e.seat === 0 ? "You played your last card!" : `${name(e.seat)} played their last card!`, e.seat === 0 ? "good" : "bad");
      }
    }
  }, [g, audio, toast]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 950);
    return () => clearTimeout(t);
  }, [banner]);
  // a chime when the turn comes back to you
  const wasMine = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMine.current && g.phase === "play") audio.play("turn");
    wasMine.current = !!myTurn;
    if (!myTurn) setSel(null);
  }, [myTurn, g, audio]);

  /* ---------- human actions ---------- */
  const nudge = (id, msg) => {
    audio.play("bad");
    setShake({ id, n: Math.random() });
    if (msg) toast(msg);
  };
  const tapCard = (card) => {
    if (!inGame || paused) return;
    if (!myTurn) return nudge(card.id, g.phase === "challenge" && E.actor(g) === 0 ? "Decide on the challenge first" : "Wait for your turn");
    if (g.phase === "drawn" && card.id !== g.drawnId) return nudge(card.id, "Play the card you drew, or keep it");
    if (!E.canPlay(g, card)) return nudge(card.id, `That card doesn't match — play ${COLOR_NAMES[g.color]}, a ${VALUE_LABEL[E.top(g).v] ?? E.top(g).v}, or a Wild`);
    if (pointer.current === "touch" && sel !== card.id) {
      audio.play("tap");
      return setSel(card.id);
    }
    if (card.c === "w") return setWildFor(card.id);
    setSel(null);
    setG((s) => E.play(s, 0, card.id));
  };
  const pickColor = (color) => {
    const id = wildFor;
    setWildFor(null);
    setSel(null);
    setG((s) => E.play(s, 0, id, color));
  };
  const canDraw = myTurn && g.phase === "play";
  const doDraw = () => canDraw && !paused && setG((s) => E.draw(s, 0));
  const doKeep = () => myTurn && g.phase === "drawn" && !paused && setG((s) => E.keep(s, 0));
  const canCall = inGame && !paused && E.canDeclare(g, 0);
  const doCall = () => canCall && setG((s) => E.declareLast(s, 0));
  const challengeMe = inGame && g.phase === "challenge" && E.actor(g) === 0;
  const answer = (yes) => !paused && setG((s) => E.resolveChallenge(s, 0, yes));

  // keyboard: D draw, K keep, L last card, P / Esc pause
  const keys = useRef(null);
  keys.current = { d: doDraw, k: doKeep, l: doCall, p: () => inGame && setOverlay((o) => (o ? null : "pause")), escape: () => (wildFor ? setWildFor(null) : inGame && setOverlay((o) => (o ? null : "pause"))) };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
      const fn = keys.current[e.key.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    save(SETTINGS_KEY, next);
  };

  // DEV test hook (?cctest=1)
  const gRef = useRef(g);
  gRef.current = g;
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has("cctest")) return;
    window.__cc = { E, g: () => gRef.current, setG, screen: () => screen, match: () => match, start: startMatch, tapCard, pickColor, draw: doDraw, keep: doKeep, call: doCall, answer, setOverlay, nextRound };
  });

  /* ---------- render ---------- */
  const hand = useMemo(() => (me ? sortHand(me.hand) : []), [me]);
  const n = hand.length;
  const playable = useMemo(() => new Set(myTurn ? hand.filter((c) => (g.phase === "drawn" ? c.id === g.drawnId : E.canPlay(g, c))).map((c) => c.id) : []), [hand, myTurn, g]);
  const wildCard = wildFor != null && me?.hand.find((c) => c.id === wildFor);
  const bluffing = wildCard && wildCard.v === "wd4" && !E.honestWD4(me.hand, g.color, wildCard.id);

  let status = "";
  if (inGame) {
    const who = E.actor(g);
    if (g.phase === "over") status = g.winner === 0 ? "You win the round!" : `${PLAYERS[g.winner].name} wins the round`;
    else if (g.phase === "challenge") status = who === 0 ? "Challenge the Wild Draw Four?" : `${PLAYERS[who].name} is deciding whether to challenge…`;
    else if (who !== 0) status = `${PLAYERS[who].name} is thinking…`;
    else if (g.phase === "drawn") status = "You drew a playable card — play it or keep it";
    else status = playable.size ? `Your turn — match ${COLOR_NAMES[g.color]} or ${VALUE_LABEL[E.top(g).v] ?? E.top(g).v}` : "No match — draw a card";
  }

  return (
    <div className={`cc${paused ? " is-paused" : ""}`}>
      <div className="cc-felt" />

      {screen === "menu" && (
        <Menu settings={settings} stats={stats} onChange={changeSettings} onStart={startMatch} onRules={() => setOverlay("rules")} />
      )}

      {g && screen !== "menu" && (
        <div className="cc-table">
          <header className="cc-hud">
            <span className="cc-chip">
              {match.mode === "quick" ? "Quick Match" : `Challenge · Round ${match.round} · First to ${match.target}`}
            </span>
            <span className="cc-chip cc-chip--soft">{LEVELS[match.difficulty]} AI</span>
          </header>
          <div className="cc-hud cc-hud--right">
            <button type="button" className="cc-icon-btn" onClick={() => setOverlay("rules")} aria-label="Rules" title="Rules">?</button>
            <button type="button" className="cc-icon-btn" onClick={() => setOverlay("pause")} aria-label="Pause" title="Pause (P)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            </button>
          </div>

          {[1, 2, 3].map((seat) => (
            <Opponent key={seat} seat={seat} p={g.players[seat]} turn={E.actor(g) === seat} score={match.mode === "challenge" ? match.scores[seat] : null} pending={g.pendingLast === seat} />
          ))}

          <div className="cc-center">
            <svg className={`cc-dir${g.dir < 0 ? " is-ccw" : ""}`} viewBox="-50 -50 100 100" aria-hidden="true">
              <circle r="44" />
              {[0, 120, 240].map((a) => (
                <path key={a} transform={`rotate(${a}) ${g.dir < 0 ? "scale(-1 1)" : ""}`} d="M-6 -48 L4 -44 L-6 -40 Z" />
              ))}
            </svg>
            <button type="button" className={`cc-deck${canDraw ? " is-live" : ""}`} onClick={doDraw} disabled={!canDraw || paused} aria-label={`Draw a card (${g.drawPile.length} left)`}>
              <CardBack className="cc-deck__under2" />
              <CardBack className="cc-deck__under" />
              <CardBack />
              <span className="cc-deck__count">{g.drawPile.length}</span>
              {canDraw && <span className="cc-deck__label">DRAW</span>}
            </button>
            <div className={`cc-pile cc-glow-${g.color}`}>
              {g.discard.slice(-3).map((c, k, arr) =>
                k === arr.length - 1 ? (
                  <Card key={c.id} card={c} className={`cc-pile__top cc-from-${landFrom}`} style={{ "--r": `${(c.id * 37) % 18 - 9}deg` }} />
                ) : (
                  <Card key={c.id} card={c} className="cc-pile__under" style={{ "--r": `${(c.id * 37) % 24 - 12}deg` }} />
                ),
              )}
              <span className={`cc-colorchip c-${g.color}`} aria-label={`Current colour: ${COLOR_NAMES[g.color]}`}>
                <Emblem c={g.color} />
                {COLOR_NAMES[g.color]}
              </span>
            </div>
          </div>

          {banner && (
            <div key={banner.id} className={`cc-banner ${banner.cls}`} aria-hidden="true">{banner.text}</div>
          )}
          <div className="cc-toasts" role="status" aria-live="polite">
            {toasts.map((t) => <div key={t.id} className={`cc-toast ${t.kind}`}>{t.text}</div>)}
          </div>
          {flies.map((f) => <CardBack key={f.id} className={`cc-fly cc-fly--${f.seat}`} style={{ animationDelay: `${f.delay}ms` }} />)}

          <p className={`cc-status${myTurn ? " is-mine" : ""}`}>{status}</p>

          <div className="cc-me">
            <span className="cc-avatar">{PLAYERS[0].avatar}</span>
            <span className="cc-me__name">You</span>
            {match.mode === "challenge" && <span className="cc-me__score">{match.scores[0]} pts</span>}
          </div>

          <div className={`cc-hand${myTurn ? " is-turn" : ""}${settings.hints ? " has-hints" : ""}`} style={{ "--n": n }}>
            {hand.map((c, i) => {
              const off = i - (n - 1) / 2;
              const spread = Math.min(3.2, 34 / Math.max(n, 1));
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`cc-slot${playable.has(c.id) ? " is-ok" : ""}${sel === c.id ? " is-sel" : ""}${g.drawnId === c.id ? " is-drawn" : ""}${shake?.id === c.id ? " is-shake" : ""}`}
                  style={{ "--i": i, "--rot": `${off * spread}deg`, "--dy": `${Math.abs(off) * Math.abs(off) * spread * 0.05}`, "--k": i }}
                  onPointerDown={(e) => (pointer.current = e.pointerType)}
                  onClick={() => tapCard(c)}
                  onAnimationEnd={(e) => e.animationName === "cc-shake" && setShake(null)}
                  aria-label={`${cardName(c)}${playable.has(c.id) ? " (playable)" : ""}`}
                >
                  <Card card={c} />
                </button>
              );
            })}
          </div>

          <div className="cc-dock">
            {myTurn && g.phase === "drawn" && !wildFor && (
              <button type="button" className="cc-btn cc-btn--ghost" onClick={doKeep} title="Keep (K)">Keep</button>
            )}
            {canDraw && !wildFor && (
              <button type="button" className="cc-btn cc-btn--ghost" onClick={doDraw} title="Draw (D)">Draw</button>
            )}
            <button
              type="button"
              className={`cc-last${canCall ? " is-live" : ""}${me.said || (me.hand.length === 1 && g.pendingLast !== 0) ? " is-done" : ""}`}
              onClick={doCall}
              disabled={!canCall}
              title="Call LAST CARD (L)"
            >
              <span>LAST</span>
              <span>CARD</span>
            </button>
          </div>

          {wildCard && !paused && (
            <div className="cc-modal" role="dialog" aria-label="Choose a colour">
              <div className="cc-picker">
                <h3>Choose a colour</h3>
                <div className="cc-picker__grid">
                  {E.COLORS.map((c) => (
                    <button type="button" key={c} className={`cc-swatch c-${c}`} onClick={() => pickColor(c)}>
                      <Emblem c={c} />
                      <span>{COLOR_NAMES[c]}</span>
                    </button>
                  ))}
                </div>
                {bluffing && <p className="cc-warn">Bluff! You still hold {COLOR_NAMES[g.color]} cards — {PLAYERS[E.nextSeat(g, 0)].name} may challenge.</p>}
                <button type="button" className="cc-btn cc-btn--ghost cc-btn--sm" onClick={() => setWildFor(null)}>Cancel</button>
              </div>
            </div>
          )}

          {challengeMe && !paused && (
            <div className="cc-modal" role="dialog" aria-label="Challenge">
              <div className="cc-picker">
                <div className="cc-picker__icon"><Card card={E.top(g)} /></div>
                <h3>{PLAYERS[g.wd4.by].name} played Wild Draw Four</h3>
                <p>Challenge it? If they were bluffing (holding {COLOR_NAMES[g.wd4.prevColor]}), <b>they draw 4</b> and you play on. If not, <b>you draw 6</b>.</p>
                <div className="cc-row">
                  <button type="button" className="cc-btn" onClick={() => answer(true)}>Challenge</button>
                  <button type="button" className="cc-btn cc-btn--ghost" onClick={() => answer(false)}>Accept +4</button>
                </div>
              </div>
            </div>
          )}

          {(screen === "round" || screen === "match") && match.last && (
            <Results match={match} stats={stats} onNext={nextRound} onAgain={() => startMatch(match.mode)} onMenu={() => setScreen("menu")} />
          )}
        </div>
      )}

      {overlay === "pause" && (
        <div className="cc-screen cc-screen--dim">
          <div className="cc-panel cc-panel--small">
            <h2 className="cc-h">Paused</h2>
            <button type="button" className="cc-btn" onClick={() => setOverlay(null)}>Resume</button>
            <button type="button" className="cc-btn cc-btn--ghost" onClick={() => setOverlay("rulesP")}>Rules</button>
            <button type="button" className="cc-btn cc-btn--ghost" onClick={() => startMatch(match.mode)}>Restart Match</button>
            <button type="button" className="cc-btn cc-btn--ghost" onClick={() => (setOverlay(null), setScreen("menu"), setG(null))}>Quit to Menu</button>
          </div>
        </div>
      )}
      {overlay?.startsWith("rules") && <Rules onClose={() => setOverlay(overlay === "rulesP" ? "pause" : null)} />}
    </div>
  );
}

function Opponent({ seat, p, turn, score, pending }) {
  const n = p.hand.length;
  const shown = Math.min(n, 9);
  return (
    <div className={`cc-opp cc-opp--${seat}${turn ? " is-turn" : ""}`}>
      <div className="cc-opp__fan" style={{ "--n": shown }}>
        {Array.from({ length: shown }, (_, k) => (
          <CardBack key={k} style={{ "--k": k - (shown - 1) / 2 }} />
        ))}
      </div>
      <div className="cc-opp__info">
        <span className="cc-avatar">{PLAYERS[seat].avatar}</span>
        <span className="cc-opp__name">{p.name}</span>
        <span key={n} className="cc-count" aria-label={`${n} cards`}>{n}</span>
        {turn && <span className="cc-dots" aria-hidden="true"><i /><i /><i /></span>}
      </div>
      {score != null && <span className="cc-opp__score">{score} pts</span>}
      {n === 1 && <span className={`cc-flag${pending ? " is-risk" : ""}`}>{pending ? "UNCALLED!" : "LAST CARD"}</span>}
    </div>
  );
}

function Menu({ settings, stats, onChange, onStart, onRules }) {
  const fan = [
    { id: 1, c: "r", v: "7" },
    { id: 2, c: "y", v: "skip" },
    { id: 3, c: "w", v: "wd4" },
    { id: 4, c: "g", v: "rev" },
    { id: 5, c: "b", v: "d2" },
  ];
  return (
    <div className="cc-screen cc-menu">
      <div className="cc-menu__fan" aria-hidden="true">
        {fan.map((c, k) => <Card key={c.id} card={c} style={{ "--k": k - 2 }} />)}
      </div>
      <h1 className="cc-logo">
        {"COLOR".split("").map((ch, k) => <span key={k} className={`c-${"rygbr"[k]}`}>{ch}</span>)}
        <em>CLASH</em>
      </h1>
      <p className="cc-tagline">MATCH • PLAY • WIN</p>
      <div className="cc-modes">
        <button type="button" className="cc-mode" onClick={() => onStart("quick")}>
          <strong>Quick Match</strong>
          <span>One round · first to empty their hand wins</span>
          <small>{stats.quick.w}W · {stats.quick.l}L</small>
        </button>
        <button type="button" className="cc-mode cc-mode--alt" onClick={() => onStart("challenge")}>
          <strong>Challenge</strong>
          <span>Rounds score points · first to {settings.target} wins</span>
          <small>{stats.challenge.w}W · {stats.challenge.l}L</small>
        </button>
      </div>
      <div className="cc-opts">
        <Seg label="AI" value={settings.difficulty} options={Object.entries(LEVELS)} onPick={(v) => onChange({ difficulty: v })} />
        <Seg label="Target" value={settings.target} options={TARGETS.map((t) => [t, String(t)])} onPick={(v) => onChange({ target: v })} />
        <Seg label="Hints" value={settings.hints} options={[[true, "On"], [false, "Off"]]} onPick={(v) => onChange({ hints: v })} />
        <button type="button" className="cc-btn cc-btn--ghost cc-btn--sm" onClick={onRules}>Rules</button>
      </div>
    </div>
  );
}

function Seg({ label, value, options, onPick }) {
  return (
    <div className="cc-seg" role="group" aria-label={label}>
      <span>{label}</span>
      {options.map(([v, text]) => (
        <button type="button" key={String(v)} className={v === value ? "is-on" : ""} aria-pressed={v === value} onClick={() => onPick(v)}>{text}</button>
      ))}
    </div>
  );
}

function Results({ match, stats, onNext, onAgain, onMenu }) {
  const { winner, points, hands } = match.last;
  const youWon = winner === 0;
  const final = match.done;
  const challenge = match.mode === "challenge";
  const champ = final && challenge ? match.scores.indexOf(Math.max(...match.scores)) : winner;
  const rec = stats[match.mode];
  const title = final ? (champ === 0 ? "Victory!" : `${PLAYERS[champ].name} wins the match`) : youWon ? "Round won!" : `${PLAYERS[winner].name} takes the round`;
  return (
    <div className="cc-screen cc-screen--dim">
      <div className={`cc-panel cc-result${(final ? champ : winner) === 0 ? " is-win" : ""}`}>
        <div className="cc-result__badge">{PLAYERS[final ? champ : winner].avatar}</div>
        <p className="cc-kicker">{final ? (challenge ? "Match Result" : "Quick Match Result") : `Round ${match.round} Result`}</p>
        <h2 className="cc-h">{title}</h2>
        <p className="cc-sub">
          {youWon ? "You" : PLAYERS[winner].name} scored <b>{points}</b> points from the cards left in other hands.
        </p>
        <ul className="cc-standings">
          {PLAYERS.map((p, i) => (
            <li key={i} className={i === winner ? "is-top" : ""}>
              <span className="cc-avatar">{p.avatar}</span>
              <span className="cc-standings__name">{p.name}</span>
              <span className="cc-standings__cards">{hands[i].length ? `${hands[i].length} card${hands[i].length > 1 ? "s" : ""} · ${E.handPoints(hands[i])} pts` : "Out!"}</span>
              {challenge && (
                <span className="cc-standings__total">
                  <i style={{ width: `${Math.min(100, (match.scores[i] / match.target) * 100)}%` }} />
                  <b>{match.scores[i]}</b>
                </span>
              )}
            </li>
          ))}
        </ul>
        {final && <p className="cc-sub">Your {challenge ? "Challenge" : "Quick Match"} record: <b>{rec.w}</b> {rec.w === 1 ? "win" : "wins"} · <b>{rec.l}</b> {rec.l === 1 ? "loss" : "losses"}</p>}
        <div className="cc-row">
          {final ? (
            <button type="button" className="cc-btn" onClick={onAgain}>Play Again</button>
          ) : (
            <button type="button" className="cc-btn" onClick={onNext}>Next Round</button>
          )}
          <button type="button" className="cc-btn cc-btn--ghost" onClick={onMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}

function Rules({ onClose }) {
  return (
    <div className="cc-screen cc-screen--dim">
      <div className="cc-panel cc-rules">
        <h2 className="cc-h">How to play</h2>
        <div className="cc-rules__body">
          <p><b>Goal:</b> be first to play every card in your hand. You play against three AI opponents; play moves clockwise to start.</p>
          <p><b>On your turn</b> play one card that matches the top card's <b>colour</b>, <b>number</b> or <b>symbol</b>, or play a Wild. Can't (or don't want to)? Draw one card — if it fits you may play it right away or keep it. Either way your turn ends.</p>
          <ul className="cc-rules__cards">
            <li><Card card={{ id: 1, c: "r", v: "skip" }} /><span><b>Skip</b> — the next player loses their turn.</span></li>
            <li><Card card={{ id: 2, c: "y", v: "rev" }} /><span><b>Reverse</b> — play changes direction.</span></li>
            <li><Card card={{ id: 3, c: "g", v: "d2" }} /><span><b>Draw Two</b> — the next player draws 2 and loses their turn.</span></li>
            <li><Card card={{ id: 4, c: "w", v: "wild" }} /><span><b>Wild</b> — choose the next colour.</span></li>
            <li><Card card={{ id: 5, c: "w", v: "wd4" }} /><span><b>Wild Draw Four</b> — choose a colour; the next player draws 4 and loses their turn.</span></li>
          </ul>
          <p><b>Wild Draw Four challenge:</b> it should only be played when you hold no card of the current colour. The victim may challenge: if it was a bluff, the bluffer draws 4 instead (and the victim plays on); if it was honest, the challenger draws 6 and loses the turn.</p>
          <p><b>Draw penalties don't stack</b> — you can't answer a +2 with another +2.</p>
          <p><b>LAST CARD:</b> press the LAST CARD button when you're about to drop to one card (or right after). If the next turn starts before you call it, you draw 2. The AI plays by the same rule.</p>
          <p><b>Scoring:</b> the round winner scores the cards left in everyone else's hand — numbers at face value, Skip / Reverse / Draw Two 20, Wilds 50. <b>Quick Match</b> is a single round; <b>Challenge</b> plays rounds until someone reaches the target (250 or 500).</p>
          <p><b>Other details:</b> a Wild turned up as the starting card is reshuffled; a starting Skip, Reverse or Draw Two applies to the first player. When the deck runs out, the discard pile is reshuffled.</p>
          <p><b>Controls:</b> click a card to play it (on touch screens: tap to select, tap again to play). Click the deck to draw. Keys: <kbd>D</kbd> draw · <kbd>K</kbd> keep · <kbd>L</kbd> last card · <kbd>P</kbd> pause.</p>
        </div>
        <button type="button" className="cc-btn" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
