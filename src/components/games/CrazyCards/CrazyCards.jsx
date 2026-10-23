/**
 * Crazy Cards — Crazy Eights with a standard deck: you vs. 1–3 AI players.
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js); Restart / Mute / Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) restarts the current match (Quick
 * Match or Championship); `muted` silences the WebAudio blips. Rules live in
 * ./engine.js (pure, tested by tools/engineTest.mjs). Settings are saved under
 * `crazy-cards-settings`, wins / losses / high scores under `crazy-cards-stats`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as E from "./engine.js";
import { SUITS, SUIT_NAMES, SUIT_SYMBOL } from "./engine.js";
import { Card, CardBack, Suit, SuitToken } from "./cards.jsx";
import { createAudio } from "./audio.js";
import "./CrazyCards.css";

const SETTINGS_KEY = "crazy-cards-settings";
const STATS_KEY = "crazy-cards-stats";
const CAST = [
  { name: "You", avatar: "🙂" },
  { name: "Rosa", avatar: "🦩", ai: true },
  { name: "Duke", avatar: "🦉", ai: true },
  { name: "Jinx", avatar: "🐈", ai: true },
];
// table position of each opponent seat, by player count
const SPOTS = { 2: [null, "t"], 3: [null, "tl", "tr"], 4: [null, "l", "t", "r"] };
const TARGETS = [100, 200, 300];
const LEVELS = { easy: "Easy", normal: "Normal", hard: "Hard" };
const SUIT_ORDER = { s: 0, h: 1, c: 2, d: 3 };
const withArticle = (r) => `${r === 1 || r === 8 ? "an" : "a"} ${E.rankLabel(r)}`;
const sortHand = (hand) => hand.slice().sort((a, b) => (a.r === 8) - (b.r === 8) || SUIT_ORDER[a.s] - SUIT_ORDER[b.s] || a.r - b.r);
const DEFAULT_STATS = { quick: { w: 0, l: 0, d: 0 }, champ: { w: 0, l: 0 }, bestRound: 0, bestMatch: 0 };

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
const speed = () => (import.meta.env.DEV && window.__kcSpeed) || 1;

export default function CrazyCards({ restartSignal = 0, muted = false }) {
  const [settings, setSettings] = useState(() => load(SETTINGS_KEY, { opponents: 3, difficulty: "normal", target: 200, hints: true }));
  const [stats, setStats] = useState(() => load(STATS_KEY, DEFAULT_STATS));
  const [screen, setScreen] = useState("menu"); // menu | game | round | match
  const [overlay, setOverlay] = useState(null); // pause | rules | rulesP
  const [match, setMatch] = useState(null);
  const [g, setG] = useState(null);
  const [sel, setSel] = useState(null);
  const [eightFor, setEightFor] = useState(null); // card id waiting for a suit
  const [shake, setShake] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [banner, setBanner] = useState(null);
  const [flies, setFlies] = useState([]);
  const [landFrom, setLandFrom] = useState("b");

  const audio = useMemo(() => createAudio(), []);
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => audio.setMuted(muted), [audio, muted]);
  const pointer = useRef("mouse"); // touch taps select first, then play; mouse clicks play at once

  const paused = overlay !== null;
  const inGame = screen === "game" && g;
  const n = g?.players.length ?? 4;
  const players = CAST.slice(0, n);
  const spot = (seat) => (seat === 0 ? "b" : SPOTS[n][seat]);
  const myTurn = inGame && g.turn === 0 && g.phase !== "over";
  const legal = useMemo(() => (myTurn ? E.legalPlays(g, 0) : []), [g, myTurn]);
  const stuck = myTurn && g.phase === "play" && !legal.length;

  /* ---------- match flow ---------- */
  const deal = (m) => {
    setG(E.newRound({ players: CAST.slice(0, m.players), dealer: m.dealer, difficulty: m.difficulty }));
    setScreen("game");
    setSel(null);
    setEightFor(null);
    setToasts([]);
    setFlies([]);
    audio.play("deal");
  };
  const startMatch = useCallback(
    (mode) => {
      const players = settings.opponents + 1;
      const m = { mode, players, target: settings.target, difficulty: settings.difficulty, scores: Array(players).fill(0), round: 1, dealer: Math.floor(Math.random() * players), last: null, done: false };
      setMatch(m);
      setOverlay(null);
      deal(m);
    },
    [settings], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const nextRound = () => {
    const m = { ...match, dealer: (match.dealer + 1) % match.players, round: match.round + 1 };
    setMatch(m);
    deal(m);
  };

  const record = (patch, won) => {
    setStats((st) => {
      const next = patch(st);
      save(STATS_KEY, next);
      return next;
    });
    audio.play(won ? "win" : "lose");
  };
  const endRound = () => {
    const { winner, points, blocked } = g;
    const last = { winner, points, blocked, hands: g.players.map((p) => sortHand(p.hand)) };
    const best = (st) => (winner === 0 ? Math.max(st.bestRound, points) : st.bestRound);
    if (match.mode === "quick") {
      setMatch({ ...match, last, done: true });
      const key = winner === 0 ? "w" : winner == null ? "d" : "l";
      record((st) => ({ ...st, quick: { ...st.quick, [key]: (st.quick[key] ?? 0) + 1 }, bestRound: best(st) }), winner === 0);
      setScreen("match");
      return;
    }
    const scores = match.scores.map((v, i) => (i === winner ? v + points : v));
    const top = Math.max(...scores);
    const done = top >= match.target && scores.filter((v) => v === top).length === 1;
    setMatch({ ...match, scores, last, done });
    if (done) {
      const won = scores[0] === top;
      record((st) => ({ ...st, champ: { ...st.champ, [won ? "w" : "l"]: st.champ[won ? "w" : "l"] + 1 }, bestRound: best(st), bestMatch: Math.max(st.bestMatch, scores[0]) }), won);
    } else {
      if (winner === 0 && points > stats.bestRound) record((st) => ({ ...st, bestRound: best(st) }), true);
      else audio.play(winner === 0 ? "win" : "lose");
    }
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
    if (g.phase === "over") t = setTimeout(endRound, 1500 * speed());
    else if (g.players[g.turn].ai) t = setTimeout(() => setG(E.aiAct), (g.phase === "drawn" ? 600 : 800 + Math.random() * 400) * speed());
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
    const name = (seat) => CAST[seat].name;
    for (const e of g.events) {
      if (e.type === "play") {
        setLandFrom(seat2spot(g, e.seat));
        audio.play(E.isEight(e.card) ? "wild" : "play");
      } else if (e.type === "suit") {
        setBanner({ suit: e.suit, id: Math.random() });
        toast(`${name(e.seat)} ${e.seat === 0 ? "choose" : "chooses"} ${SUIT_NAMES[e.suit]}`, E.isRed(e.suit) ? "red" : "black");
      } else if (e.type === "draw") {
        const id = Math.random();
        setFlies((f) => [...f, { id, spot: seat2spot(g, e.seat) }]);
        setTimeout(() => setFlies((f) => f.filter((x) => x.id !== id)), 800);
        audio.play("draw");
      } else if (e.type === "reshuffle") {
        audio.play("shuffle");
        toast(`Discards reshuffled into the stock (${e.count})`);
      } else if (e.type === "pass") {
        if (e.seat !== 0 || !e.drew) toast(e.seat === 0 ? "You pass" : `${name(e.seat)} ${e.drew ? "draws and passes" : "can't play — passes"}`);
        audio.play("pass");
      } else if (e.type === "last") {
        audio.play("last");
        toast(e.seat === 0 ? "One card left!" : `${name(e.seat)} has one card left!`, e.seat === 0 ? "good" : "bad");
      } else if (e.type === "win") {
        toast(e.seat === 0 ? "You played your last card!" : `${name(e.seat)} went out!`, e.seat === 0 ? "good" : "bad");
      } else if (e.type === "blocked") {
        toast("Blocked — nobody can play. Lowest hand wins.");
      }
    }
  }, [g, audio, toast]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1100);
    return () => clearTimeout(t);
  }, [banner]);
  const wasMine = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMine.current && g.phase === "play") audio.play("turn");
    wasMine.current = !!myTurn;
    if (!myTurn) setSel(null);
  }, [myTurn, g, audio]);

  /* ---------- human actions ---------- */
  const nudge = (id, msg) => {
    audio.play("bad");
    if (id != null) setShake({ id, n: Math.random() });
    if (msg) toast(msg);
  };
  const tapCard = (card) => {
    if (!inGame || paused || eightFor) return;
    if (!myTurn) return nudge(card.id, "Wait for your turn");
    if (g.phase === "drawn" && card.id !== g.drawnId) return nudge(card.id, "Play the card you drew, or keep it");
    if (!E.canPlay(g, card)) return nudge(card.id, `Play a ${SUIT_NAMES[g.suit].slice(0, -1).toLowerCase()} ${SUIT_SYMBOL[g.suit]}, ${withArticle(E.top(g).r)}, or an eight`);
    if (pointer.current === "touch" && sel !== card.id) {
      audio.play("tap");
      return setSel(card.id);
    }
    if (E.isEight(card)) return setEightFor(card.id);
    setSel(null);
    setG((s) => E.play(s, 0, card.id));
  };
  const pickSuit = (suit) => {
    const id = eightFor;
    setEightFor(null);
    setSel(null);
    setG((s) => E.play(s, 0, id, suit));
  };
  const canDraw = stuck && E.canDraw(g);
  const doDraw = () => {
    if (!myTurn || paused || eightFor) return;
    if (canDraw) return setG((s) => E.draw(s, 0));
    if (g.phase === "play" && legal.length) nudge(null, "You have a playable card — draw only when you can't play");
  };
  const canPass = myTurn && (g.phase === "drawn" || (stuck && !E.canDraw(g)));
  const doPass = () => canPass && !paused && !eightFor && setG((s) => E.pass(s, 0));

  // keyboard: D / Space draw, K keep / pass, P / Esc pause
  const keys = useRef(null);
  const togglePause = () => inGame && setOverlay((o) => (o ? null : "pause"));
  keys.current = { d: doDraw, " ": doDraw, k: doPass, p: togglePause, escape: () => (eightFor ? setEightFor(null) : togglePause()) };
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

  // DEV test hook (?kctest=1)
  const gRef = useRef(g);
  gRef.current = g;
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has("kctest")) return;
    window.__kc = { E, g: () => gRef.current, setG, screen: () => screen, match: () => match, stats: () => stats, start: startMatch, tapCard, pickSuit, draw: doDraw, pass: doPass, setOverlay, nextRound, changeSettings };
  });

  /* ---------- render ---------- */
  const me = g?.players[0];
  const hand = useMemo(() => (me ? sortHand(me.hand) : []), [me]);
  const hn = hand.length;
  const playable = useMemo(() => new Set(myTurn ? legal.filter((c) => g.phase !== "drawn" || c.id === g.drawnId).map((c) => c.id) : []), [legal, myTurn, g]);

  let status = "";
  if (inGame) {
    const t = E.top(g);
    if (g.phase === "over") status = g.winner === 0 ? "You win the round!" : g.winner == null ? "Blocked round — tied" : `${CAST[g.winner].name} wins the round`;
    else if (g.turn !== 0) status = `${CAST[g.turn].name} is thinking…`;
    else if (g.phase === "drawn") status = "You drew a playable card — play it or keep it";
    else if (legal.length) status = `Your turn — play ${SUIT_SYMBOL[g.suit]} ${SUIT_NAMES[g.suit]}, ${withArticle(t.r)}, or an eight`;
    else if (E.canDraw(g)) status = "No match — draw a card";
    else status = "No match and the stock is empty — pass";
  }

  return (
    <div className={`kc${paused ? " is-paused" : ""}`}>
      <div className="kc-felt" />

      {screen === "menu" && <Menu settings={settings} stats={stats} onChange={changeSettings} onStart={startMatch} onRules={() => setOverlay("rules")} />}

      {g && screen !== "menu" && (
        <div className="kc-table">
          <header className="kc-hud">
            <span className="kc-chip">{match.mode === "quick" ? "Quick Match" : `Championship · Round ${match.round} · to ${match.target}`}</span>
            <span className="kc-chip kc-chip--soft">{LEVELS[match.difficulty]} AI</span>
          </header>
          <div className="kc-hud kc-hud--right">
            <button type="button" className="kc-icon-btn" onClick={() => setOverlay("rules")} aria-label="Rules" title="Rules">?</button>
            <button type="button" className="kc-icon-btn" onClick={() => setOverlay("pause")} aria-label="Pause" title="Pause (P)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            </button>
          </div>

          {g.players.slice(1).map((p, k) => (
            <Opponent key={k + 1} seat={k + 1} spot={spot(k + 1)} p={p} turn={g.turn === k + 1 && g.phase !== "over"} score={match.mode === "champ" ? match.scores[k + 1] : null} />
          ))}

          <div className="kc-center">
            <button type="button" className={`kc-stock${canDraw ? " is-live" : ""}`} onClick={doDraw} disabled={paused || !myTurn} aria-label={`Draw a card (${g.stock.length} left)`}>
              {g.stock.length > 2 && <CardBack className="kc-stock__under2" />}
              {g.stock.length > 1 && <CardBack className="kc-stock__under" />}
              {g.stock.length > 0 ? <CardBack /> : <span className="kc-card kc-empty">{E.canDraw(g) ? "↻" : "∅"}</span>}
              <span className="kc-stock__count">{g.stock.length}</span>
              {canDraw && <span className="kc-stock__label">DRAW</span>}
            </button>
            <div className="kc-pile">
              {g.discard.slice(-3).map((c, k, arr) =>
                k === arr.length - 1 ? (
                  <Card key={c.id} card={c} className={`kc-pile__top kc-from-${landFrom}`} style={{ "--r": `${((c.id * 37) % 14) - 7}deg` }} />
                ) : (
                  <Card key={c.id} card={c} className="kc-pile__under" style={{ "--r": `${((c.id * 53) % 22) - 11}deg` }} />
                ),
              )}
            </div>
            <div className={`kc-suitbox${E.isEight(E.top(g)) ? " is-wild" : ""}`}>
              <SuitToken key={g.suit} suit={g.suit} />
              <span>{SUIT_NAMES[g.suit]}</span>
            </div>
          </div>

          {banner && (
            <div key={banner.id} className={`kc-banner ${E.isRed(banner.suit) ? "is-red" : "is-black"}`} aria-hidden="true">
              <Suit s={banner.suit} />
              <span>{SUIT_NAMES[banner.suit].toUpperCase()}</span>
            </div>
          )}
          <div className="kc-toasts" role="status" aria-live="polite">
            {toasts.map((t) => <div key={t.id} className={`kc-toast ${t.kind}`}>{t.text}</div>)}
          </div>
          {flies.map((f) => <CardBack key={f.id} className={`kc-fly kc-fly--${f.spot}`} />)}

          <p className={`kc-status${myTurn ? " is-mine" : ""}`}>{status}</p>

          <div className={`kc-me${myTurn ? " is-turn" : ""}`}>
            <span className="kc-avatar">{CAST[0].avatar}</span>
            <span className="kc-me__name">You</span>
            {match.mode === "champ" && <span className="kc-me__score">{match.scores[0]} pts</span>}
          </div>

          <div className={`kc-hand${myTurn ? " is-turn" : ""}${settings.hints ? " has-hints" : ""}`} style={{ "--n": hn }}>
            {hand.map((c, i) => {
              const off = i - (hn - 1) / 2;
              const spread = Math.min(3, 30 / Math.max(hn, 1));
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`kc-slot${playable.has(c.id) ? " is-ok" : ""}${sel === c.id ? " is-sel" : ""}${g.drawnId === c.id ? " is-drawn" : ""}${shake?.id === c.id ? " is-shake" : ""}`}
                  style={{ "--i": i, "--rot": `${off * spread}deg`, "--dy": `${off * off * spread * 0.05}` }}
                  onPointerDown={(e) => (pointer.current = e.pointerType)}
                  onClick={() => tapCard(c)}
                  onAnimationEnd={(e) => e.animationName === "kc-shake" && setShake(null)}
                  aria-label={`${E.cardName(c)}${playable.has(c.id) ? " (playable)" : ""}`}
                >
                  <Card card={c} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }} />
                </button>
              );
            })}
          </div>

          <div className="kc-dock">
            {canPass && (
              <button type="button" className="kc-btn kc-btn--ghost" onClick={doPass} title="Keep / pass (K)">{g.phase === "drawn" ? "Keep" : "Pass"}</button>
            )}
            {canDraw && <button type="button" className="kc-btn" onClick={doDraw} title="Draw (D)">Draw</button>}
          </div>

          {eightFor != null && !paused && (
            <div className="kc-modal" role="dialog" aria-label="Choose a suit">
              <div className="kc-picker">
                <h3>Crazy eight! Name the suit</h3>
                <div className="kc-picker__grid">
                  {SUITS.map((s) => (
                    <button type="button" key={s} className={`kc-swatch ${E.isRed(s) ? "is-red" : "is-black"}`} onClick={() => pickSuit(s)}>
                      <Suit s={s} />
                      <span>{SUIT_NAMES[s]}</span>
                      <small>{me.hand.filter((c) => c.s === s && c.id !== eightFor && !E.isEight(c)).length} in hand</small>
                    </button>
                  ))}
                </div>
                <button type="button" className="kc-btn kc-btn--ghost kc-btn--sm" onClick={() => setEightFor(null)}>Cancel</button>
              </div>
            </div>
          )}

          {(screen === "round" || screen === "match") && match.last && (
            <Results match={match} stats={stats} onNext={nextRound} onAgain={() => startMatch(match.mode)} onMenu={() => setScreen("menu")} />
          )}
        </div>
      )}

      {overlay === "pause" && (
        <div className="kc-screen kc-screen--dim">
          <div className="kc-panel kc-panel--small">
            <h2 className="kc-h">Paused</h2>
            <button type="button" className="kc-btn" onClick={() => setOverlay(null)}>Resume</button>
            <button type="button" className="kc-btn kc-btn--ghost" onClick={() => setOverlay("rulesP")}>Rules</button>
            <button type="button" className="kc-btn kc-btn--ghost" onClick={() => startMatch(match.mode)}>Restart Match</button>
            <button type="button" className="kc-btn kc-btn--ghost" onClick={() => (setOverlay(null), setScreen("menu"), setG(null))}>Quit to Menu</button>
          </div>
        </div>
      )}
      {overlay?.startsWith("rules") && <Rules onClose={() => setOverlay(overlay === "rulesP" ? "pause" : null)} />}
    </div>
  );
}

const seat2spot = (g, seat) => (seat === 0 ? "b" : SPOTS[g.players.length][seat]);

function Opponent({ seat, spot, p, turn, score }) {
  const n = p.hand.length;
  const shown = Math.min(n, 8);
  return (
    <div className={`kc-opp kc-opp--${spot}${turn ? " is-turn" : ""}`}>
      <div className="kc-opp__fan">
        {Array.from({ length: shown }, (_, k) => <CardBack key={k} style={{ "--k": k - (shown - 1) / 2 }} />)}
      </div>
      <div className="kc-opp__info">
        <span className="kc-avatar">{CAST[seat].avatar}</span>
        <span className="kc-opp__name">{p.name}</span>
        <span key={n} className="kc-count" aria-label={`${n} cards`}>{n}</span>
        {turn && <span className="kc-dots" aria-hidden="true"><i /><i /><i /></span>}
      </div>
      {score != null && <span className="kc-opp__score">{score} pts</span>}
      {n === 1 && <span className="kc-flag">LAST CARD</span>}
    </div>
  );
}

function Menu({ settings, stats, onChange, onStart, onRules }) {
  const fan = [
    { id: 1, s: "h", r: 8 },
    { id: 2, s: "s", r: 1 },
    { id: 3, s: "d", r: 12 },
    { id: 4, s: "c", r: 8 },
    { id: 5, s: "h", r: 7 },
  ];
  return (
    <div className="kc-screen kc-menu">
      <div className="kc-menu__fan" aria-hidden="true">
        {fan.map((c, k) => <Card key={c.id} card={c} style={{ "--k": k - 2 }} />)}
      </div>
      <h1 className="kc-logo">
        <span>CRAZY</span>
        <em>CARDS</em>
      </h1>
      <p className="kc-tagline">MATCH • SWITCH • WIN</p>
      <div className="kc-modes">
        <button type="button" className="kc-mode" onClick={() => onStart("quick")}>
          <strong>Quick Match</strong>
          <span>One round · first to empty their hand</span>
          <small>{stats.quick.w}W · {stats.quick.l}L{stats.quick.d ? ` · ${stats.quick.d}D` : ""}</small>
        </button>
        <button type="button" className="kc-mode kc-mode--alt" onClick={() => onStart("champ")}>
          <strong>Championship</strong>
          <span>Rounds add up · first to {settings.target} points</span>
          <small>{stats.champ.w}W · {stats.champ.l}L</small>
        </button>
      </div>
      <div className="kc-opts">
        <Seg label="Opponents" value={settings.opponents} options={[[1, "1"], [2, "2"], [3, "3"]]} onPick={(v) => onChange({ opponents: v })} />
        <Seg label="AI" value={settings.difficulty} options={Object.entries(LEVELS)} onPick={(v) => onChange({ difficulty: v })} />
        <Seg label="Target" value={settings.target} options={TARGETS.map((t) => [t, String(t)])} onPick={(v) => onChange({ target: v })} />
        <Seg label="Hints" value={settings.hints} options={[[true, "On"], [false, "Off"]]} onPick={(v) => onChange({ hints: v })} />
        <button type="button" className="kc-btn kc-btn--ghost kc-btn--sm" onClick={onRules}>Rules</button>
      </div>
      <p className="kc-best">Best round <b>{stats.bestRound}</b> · Best championship <b>{stats.bestMatch}</b></p>
    </div>
  );
}

function Seg({ label, value, options, onPick }) {
  return (
    <div className="kc-seg" role="group" aria-label={label}>
      <span>{label}</span>
      {options.map(([v, text]) => (
        <button type="button" key={String(v)} className={v === value ? "is-on" : ""} aria-pressed={v === value} onClick={() => onPick(v)}>{text}</button>
      ))}
    </div>
  );
}

function Results({ match, stats, onNext, onAgain, onMenu }) {
  const { winner, points, blocked, hands } = match.last;
  const final = match.done;
  const champ = match.mode === "champ";
  const leader = final && champ ? match.scores.indexOf(Math.max(...match.scores)) : winner;
  const players = CAST.slice(0, match.players);
  const rec = champ ? stats.champ : stats.quick;
  let title;
  if (final && champ) title = leader === 0 ? "Champion!" : `${CAST[leader].name} wins the championship`;
  else if (winner == null) title = "Blocked — it's a tie";
  else title = winner === 0 ? (final ? "Victory!" : "Round won!") : `${CAST[winner].name} takes the round`;
  const hero = leader ?? null;
  return (
    <div className="kc-screen kc-screen--dim">
      <div className={`kc-panel kc-result${hero === 0 ? " is-win" : ""}`}>
        <div className="kc-result__badge">{hero == null ? "🤝" : CAST[hero].avatar}</div>
        <p className="kc-kicker">{final ? (champ ? "Championship Result" : "Quick Match Result") : `Round ${match.round} Result`}{blocked ? " · Blocked" : ""}</p>
        <h2 className="kc-h">{title}</h2>
        <p className="kc-sub">
          {winner == null
            ? "Nobody could play and the lowest hands tied — no points this round."
            : <>{winner === 0 ? "You" : CAST[winner].name} scored <b>{points}</b> points {blocked ? "with the lowest hand" : "from the cards left in other hands"}.</>}
        </p>
        <ul className="kc-standings">
          {players.map((p, i) => (
            <li key={i} className={i === winner ? "is-top" : ""}>
              <span className="kc-avatar">{p.avatar}</span>
              <span className="kc-standings__name">{p.name}</span>
              <span className="kc-standings__cards">
                {hands[i].length ? (
                  <>
                    <span className="kc-mini">{hands[i].slice(0, 8).map((c) => <Card key={c.id} card={c} />)}</span>
                    <em>{E.handPoints(hands[i])} pts</em>
                  </>
                ) : (
                  <em>Out!</em>
                )}
              </span>
              {champ && (
                <span className="kc-standings__total">
                  <i style={{ width: `${Math.min(100, (match.scores[i] / match.target) * 100)}%` }} />
                  <b>{match.scores[i]}</b>
                </span>
              )}
            </li>
          ))}
        </ul>
        {final && (
          <p className="kc-sub">
            Record: <b>{rec.w}</b> W · <b>{rec.l}</b> L · Best round <b>{stats.bestRound}</b>{champ ? <> · Best championship <b>{stats.bestMatch}</b></> : null}
          </p>
        )}
        <div className="kc-row">
          {final ? <button type="button" className="kc-btn" onClick={onAgain}>Play Again</button> : <button type="button" className="kc-btn" onClick={onNext}>Next Round</button>}
          <button type="button" className="kc-btn kc-btn--ghost" onClick={onMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}

function Rules({ onClose }) {
  return (
    <div className="kc-screen kc-screen--dim">
      <div className="kc-panel kc-rules">
        <h2 className="kc-h">How to play</h2>
        <div className="kc-rules__body">
          <p><b>Goal:</b> be first to play every card in your hand. A standard 52-card deck; 7 cards each with one opponent, 5 each with two or three. Play runs clockwise.</p>
          <ul className="kc-rules__cards">
            <li><Card card={{ id: 1, s: "h", r: 7 }} /><span><b>Match</b> the top card's <b>suit</b> or <b>rank</b> — a 7♥ goes on any heart or any 7.</span></li>
            <li><Card card={{ id: 2, s: "c", r: 8 }} /><span><b>Eights are wild</b> — play one on anything and name the next suit.</span></li>
          </ul>
          <p><b>Can't play?</b> Draw one card from the stock. If it fits you may play it right away (or keep it); otherwise your turn passes. You can only draw when you have no playable card.</p>
          <p><b>Empty stock:</b> the discard pile is shuffled back in, keeping its top card. If even that is impossible and you can't play, you pass. When every player passes in a row the round is <b>blocked</b>.</p>
          <p><b>Scoring:</b> eight 50 · K, Q, J 10 · ace 1 · others face value. The player who goes out scores the cards left in every other hand. In a blocked round the lowest hand wins the difference to each other hand (a tie scores nobody).</p>
          <p><b>Quick Match</b> is one round. <b>Championship</b> plays rounds until someone reaches the target (100, 200 or 300).</p>
          <p><b>Controls:</b> click a card to play it (touch: tap to select, tap again to play). Click the stock to draw. Keys: <kbd>D</kbd>/<kbd>Space</kbd> draw · <kbd>K</kbd> keep / pass · <kbd>P</kbd> pause.</p>
        </div>
        <button type="button" className="kc-btn" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
