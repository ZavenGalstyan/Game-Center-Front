/**
 * Trump Masters — Durak (36 cards, Classic Throw-in or Transfer), you vs. 1–3
 * AI players. Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js); Restart / Mute / Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) deals a fresh match with the current
 * settings; `muted` silences the WebAudio sounds. Rules live in ./engine.js
 * (pure, tested by tools/engineTest.mjs). Settings are saved under
 * `trump-masters-settings`, results under `trump-masters-stats`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as E from "./engine.js";
import { SUIT_NAME, rankLabel } from "./engine.js";
import { Card, CardBack, Suit, cardName } from "./cards.jsx";
import { createAudio } from "./audio.js";
import "./TrumpMasters.css";

const SETTINGS_KEY = "trump-masters-settings";
const STATS_KEY = "trump-masters-stats";
const AI = [
  { name: "Viktor", avatar: "🦉" },
  { name: "Lena", avatar: "🦊" },
  { name: "Boris", avatar: "🐻" },
];
const MODES = {
  classic: { label: "Classic", sub: "Throw-in Durak" },
  transfer: { label: "Transfer", sub: "Pass the attack on" },
};
const BLANK_STATS = { played: 0, wins: 0, losses: 0, draws: 0, firsts: 0, streak: 0, best: 0, modes: { classic: { w: 0, l: 0 }, transfer: { w: 0, l: 0 } } };

const load = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === "object" ? { ...fallback, ...v } : fallback;
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
const speed = () => (import.meta.env.DEV && window.__trSpeed) || 1;
const name = (seat) => (seat === 0 ? "You" : AI[seat - 1].name);
const verb = (seat, v, you = v) => (seat === 0 ? you : v + "s");
const listRanks = (set) => [...set].sort((a, b) => a - b).map(rankLabel).join(", ");

function sortHand(hand, trump) {
  const order = ["S", "D", "C", "H"].filter((s) => s !== trump).concat(trump);
  return hand.slice().sort((a, b) => order.indexOf(a.s) - order.indexOf(b.s) || a.r - b.r);
}

export default function TrumpMasters({ restartSignal = 0, muted = false }) {
  const [settings, setSettings] = useState(() => load(SETTINGS_KEY, { players: 2, mode: "classic" }));
  const [stats, setStats] = useState(() => load(STATS_KEY, BLANK_STATS));
  const [screen, setScreen] = useState("menu"); // menu | game
  const [overlay, setOverlay] = useState(null); // pause | rules | result
  const [g, setG] = useState(null);
  const [gameId, setGameId] = useState(0);
  const [sel, setSel] = useState(null);
  const [shake, setShake] = useState(null);
  const [toast, setToast] = useState(null);

  const audio = useMemo(() => createAudio(), []);
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => audio.setMuted(muted), [audio, muted]);
  const pointer = useRef("mouse");

  const paused = overlay === "pause" || overlay === "rules";
  const inGame = screen === "game" && g;
  const who = inGame ? E.actor(g) : null;

  /* ---------- flow ---------- */
  const start = useCallback((cfg = settings) => {
    setG(E.newGame({ players: cfg.players, mode: cfg.mode }));
    setGameId((k) => k + 1);
    setScreen("game");
    setOverlay(null);
    setSel(null);
    setToast(null);
  }, [settings]);
  const updateSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    save(SETTINGS_KEY, next);
  };
  const toMenu = () => {
    setScreen("menu");
    setOverlay(null);
    setG(null);
  };

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "game") start();
  }, [restartSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI moves and bout resolution — one timer at a time, cleared on every change
  useEffect(() => {
    if (!inGame || paused) return;
    let t;
    if (g.phase === "end") t = setTimeout(() => setG(E.finishBout), 1000 * speed());
    else if (g.phase === "play" && who !== 0) {
      const delay = g.events.some((e) => e.type === "deal") ? 1500 : 650 + Math.random() * 350;
      t = setTimeout(() => setG((s) => (s.phase === "play" && E.actor(s) !== 0 ? E.act(s, E.actor(s), E.aiMove(s)) : s)), delay * speed());
    }
    return () => clearTimeout(t);
  }, [g, inGame, paused, who]);

  // match over → stats + result
  const recorded = useRef(0);
  useEffect(() => {
    if (!inGame || g.phase !== "over" || recorded.current === gameId) return;
    recorded.current = gameId;
    const result = g.loser === 0 ? "l" : g.loser == null ? "d" : "w";
    setStats((st) => {
      const m = st.modes?.[g.mode] ?? { w: 0, l: 0 };
      const streak = result === "w" ? st.streak + 1 : result === "l" ? 0 : st.streak;
      const next = {
        ...st,
        played: st.played + 1,
        wins: st.wins + (result === "w"),
        losses: st.losses + (result === "l"),
        draws: st.draws + (result === "d"),
        firsts: st.firsts + (g.finish[0] === 0),
        streak,
        best: Math.max(st.best, streak),
        modes: { ...st.modes, [g.mode]: { w: m.w + (result === "w"), l: m.l + (result === "l") } },
      };
      save(STATS_KEY, next);
      return next;
    });
    const t = setTimeout(() => {
      audio.play(result === "l" ? "lose" : "win");
      setOverlay("result");
    }, 900);
    return () => clearTimeout(t);
  }, [g, inGame, gameId, audio]);

  /* ---------- event feedback ---------- */
  const say = useCallback((text, kind = "") => setToast({ text, kind, id: Math.random() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  const seen = useRef(null);
  useEffect(() => {
    if (!g || g.events === seen.current) return;
    seen.current = g.events;
    for (const e of g.events) {
      if (e.type === "deal") {
        audio.play("deal");
        if (e.lead) say(`${name(e.lead.seat)} ${verb(e.lead.seat, "lead", "lead")} — lowest trump ${cardName(e.lead.card)}`);
        else say(`No trumps dealt — ${name(g.attacker)} ${verb(g.attacker, "lead", "lead")}`);
      } else if (e.type === "attack") audio.play(e.card.s === g.trump ? "trump" : "play");
      else if (e.type === "defend") audio.play(e.card.s === g.trump ? "trump" : "beat");
      else if (e.type === "transfer") {
        audio.play("transfer");
        say(`${name(e.seat)} ${verb(e.seat, "transfer")} the attack to ${e.to === 0 ? "you" : name(e.to)}!`, e.to === 0 ? "bad" : "good");
      } else if (e.type === "take") say(`${name(e.seat)} ${verb(e.seat, "take")} the cards`, e.seat === 0 ? "bad" : "");
      else if (e.type === "boutEnd") {
        audio.play(e.end === "beat" ? "discard" : "take");
        if (e.end === "beat") say(`${e.defender === 0 ? "You beat" : name(e.defender) + " beats"} off the attack`, e.defender === 0 ? "good" : "");
      } else if (e.type === "refill" && e.drawn.length) audio.play("draw");
      else if (e.type === "out") {
        audio.play("out");
        say(e.seat === 0 ? "You're out of cards — safe!" : `${name(e.seat)} is out — safe!`, e.seat === 0 ? "good" : "");
      }
    }
  }, [g, audio, say]);
  const wasMine = useRef(false);
  useEffect(() => {
    const mine = who === 0;
    if (mine && !wasMine.current) audio.play("turn");
    wasMine.current = mine;
    if (!mine) setSel(null);
  }, [who, audio]);

  /* ---------- human actions ---------- */
  const moves = useMemo(() => (inGame && who === 0 ? E.legal(g, 0) : []), [g, inGame, who]);
  const playable = useMemo(() => new Set(moves.filter((m) => m.card).map((m) => m.card)), [moves]);
  const selMoves = moves.filter((m) => m.card && m.card === sel);
  const targets = new Set(selMoves.filter((m) => m.type === "defend").map((m) => m.slot));
  const amDefender = inGame && g.defender === 0 && g.phase === "play";

  const run = (m) => {
    if (!m || paused) return;
    setSel(null);
    setG((s) => E.act(s, 0, m));
  };
  const primary = (id) => {
    const ms = moves.filter((m) => m.card === id);
    const atk = ms.find((m) => m.type === "attack"), def = ms.filter((m) => m.type === "defend"), tr = ms.find((m) => m.type === "transfer");
    if (atk) return run(atk), true;
    if (def.length === 1 && !tr) return run(def[0]), true;
    if (!def.length && tr) return run(tr), true;
    return false;
  };
  const nudge = (id, msg) => {
    audio.play("bad");
    setShake({ id, n: Math.random() });
    if (msg) say(msg);
  };
  const tapCard = (card) => {
    if (!inGame || paused || g.phase !== "play") return;
    if (who !== 0) return nudge(card.id, "Wait for your turn");
    if (!playable.has(card.id)) {
      if (amDefender) return nudge(card.id, `${cardName(card)} can't beat any card on the table`);
      return nudge(card.id, `You can only add ranks already on the table: ${listRanks(E.tableRanks(g))}`);
    }
    if ((pointer.current === "mouse" || sel === card.id) && primary(card.id)) return;
    audio.play("tap");
    setSel(card.id);
  };
  const tapSlot = (i) => {
    const m = selMoves.find((x) => x.type === "defend" && x.slot === i);
    if (m) run(m);
  };
  const act = {
    attack: selMoves.find((m) => m.type === "attack"),
    defend: selMoves.filter((m) => m.type === "defend").sort((a, b) => a.slot - b.slot)[0],
    transfer: selMoves.find((m) => m.type === "transfer"),
    take: moves.find((m) => m.type === "take"),
    pass: moves.find((m) => m.type === "pass"),
  };

  const keys = useRef(null);
  keys.current = {
    t: () => run(act.take),
    d: () => run(act.pass),
    p: () => inGame && overlay !== "result" && setOverlay((o) => (o ? null : "pause")),
    escape: () => (sel ? setSel(null) : inGame && overlay !== "result" && setOverlay((o) => (o ? null : "pause"))),
  };
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

  // DEV-only test hook (?trtest=1)
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has("trtest")) return;
    window.__tr = { state: () => g, setG, E, start, run, screen, overlay, setOverlay, stats: () => stats, settings };
  });

  /* ---------- render helpers ---------- */
  const opponents = inGame ? Array.from({ length: g.n - 1 }, (_, k) => k + 1) : [];
  const from = (seat) => {
    if (seat === 0) return [0, 50];
    const m = g.n - 1, k = seat - 1;
    return [(k - (m - 1) / 2) * 55, -40];
  };
  const fromStyle = (seat) => {
    const [x, y] = from(seat);
    return { "--fx": `calc(var(--u) * ${x})`, "--fy": `calc(var(--u) * ${y})` };
  };

  let status = "";
  if (inGame) {
    const def = g.defender;
    if (g.phase === "over") status = g.loser === 0 ? "You're the Durak!" : g.loser == null ? "A draw — nobody is left holding cards" : `${name(g.loser)} is the Durak — you win!`;
    else if (g.phase === "end") status = g.end === "beat" ? "Beaten — cards go to the discard pile" : `${name(def)} ${verb(def, "pick")} up ${g.table.length * 2 - g.table.filter((p) => !p.d).length} cards`;
    else if (who !== 0) status = `${name(who)} is ${who === def ? "defending" : g.table.length ? "throwing in" : "attacking"}…`;
    else if (!g.table.length) status = "Your attack — lead any card";
    else if (def === 0) status = moves.some((m) => m.type === "transfer") ?`Beat each card, transfer with a ${rankLabel(g.table[0].a.r)}, or take` : "Beat each card with a higher one of its suit or a trump — or take";
    else status = `${g.taking ? `${name(def)} ${verb(def, "is", "are")} taking — throw in` : "Add"} ${listRanks(E.tableRanks(g))} (${g.limit - g.table.length} more max) or press Done`;
  }
  const hand = inGame ? sortHand(g.hands[0], g.trump) : [];
  const n = hand.length;
  const overlap = Math.max(0.3, 1 - 10 / Math.max(1, n - 1));
  const dealing = inGame && g.events.some((e) => e.type === "deal");
  const roleOf = (seat) => {
    if (!inGame || g.out[seat] || g.phase === "over") return null;
    if (seat === g.defender) return g.taking ? "Taking" : "Defending";
    if (seat === g.attacker) return "Attacking";
    return null;
  };

  return (
    <div className={`tm${paused ? " is-paused" : ""}`} onPointerDown={(e) => (pointer.current = e.pointerType || "mouse")}>
      <div className="tm-felt" />

      {screen === "menu" && (
        <div className="tm-menu">
          <div className="tm-menu__fan" aria-hidden="true">
            {[{ id: "S14", s: "S", r: 14 }, { id: "H13", s: "H", r: 13 }, { id: "D12", s: "D", r: 12 }, { id: "C11", s: "C", r: 11 }].map((c, k) => (
              <Card key={c.id} card={c} style={{ "--k": k - 1.5 }} />
            ))}
          </div>
          <h1 className="tm-title">Trump <span>Masters</span></h1>
          <p className="tm-tag">ATTACK • DEFEND • OUTSMART</p>

          <div className="tm-opts">
            <div className="tm-opt">
              <span className="tm-opt__label">Players</span>
              <div className="tm-seg" role="radiogroup" aria-label="Players">
                {[2, 3, 4].map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={settings.players === k} className={settings.players === k ? "is-on" : ""} onClick={() => updateSettings({ players: k })}>
                    {k}
                    <small>{k === 2 ? "1 AI" : `${k - 1} AI`}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="tm-opt">
              <span className="tm-opt__label">Mode</span>
              <div className="tm-seg" role="radiogroup" aria-label="Mode">
                {Object.entries(MODES).map(([k, m]) => (
                  <button key={k} type="button" role="radio" aria-checked={settings.mode === k} className={settings.mode === k ? "is-on" : ""} onClick={() => updateSettings({ mode: k })}>
                    {m.label}
                    <small>{m.sub}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="tm-menu__btns">
            <button type="button" className="tm-btn tm-btn--gold tm-btn--big" onClick={() => start()}>Deal Cards</button>
            <button type="button" className="tm-btn" onClick={() => setOverlay("rules")}>How to Play</button>
          </div>

          <dl className="tm-stats">
            <div><dt>Wins</dt><dd>{stats.wins}</dd></div>
            <div><dt>Losses</dt><dd>{stats.losses}</dd></div>
            <div><dt>Win rate</dt><dd>{stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%</dd></div>
            <div><dt>Best streak</dt><dd>{stats.best}</dd></div>
            <div><dt>First out</dt><dd>{stats.firsts}</dd></div>
          </dl>
        </div>
      )}

      {inGame && (
        <div className="tm-board" key={gameId}>
          <header className="tm-hud">
            <div className="tm-hud__group">
              <span className="tm-chip">{MODES[g.mode].label}</span>
              <span className={`tm-chip tm-chip--trump ${E.RED[g.trump] ? "is-red" : ""}`} title="Trump suit">
                <Suit s={g.trump} /> Trump · {SUIT_NAME[g.trump]}
              </span>
              <span className="tm-chip tm-chip--soft">Bout {g.bout}</span>
            </div>
            <div className="tm-hud__group">
              <button type="button" className="tm-icon" onClick={() => setOverlay("rules")} aria-label="Rules" title="Rules">?</button>
              <button type="button" className="tm-icon" onClick={() => setOverlay("pause")} aria-label="Pause" title="Pause (P)">
                <span className="tm-pause-glyph" />
              </button>
            </div>
          </header>

          <div className="tm-opps">
            {opponents.map((seat) => {
              const cards = g.hands[seat].length, role = roleOf(seat);
              return (
                <div key={seat} className={`tm-opp${who === seat ? " is-turn" : ""}${g.out[seat] ? " is-out" : ""}${g.loser === seat ? " is-durak" : ""}`}>
                  <div className="tm-opp__fan">
                    {Array.from({ length: Math.min(cards, 8) }, (_, k) => (
                      <CardBack key={k} style={{ "--k": k - (Math.min(cards, 8) - 1) / 2 }} />
                    ))}
                  </div>
                  <div className="tm-opp__tag">
                    <span className="tm-ava">{AI[seat - 1].avatar}</span>
                    <span className="tm-opp__name">{AI[seat - 1].name}</span>
                    <span className="tm-count" aria-label={`${cards} cards`}>{cards}</span>
                  </div>
                  {role && <span className={`tm-role tm-role--${role.toLowerCase()}`}>{role}</span>}
                  {!role && g.phase === "play" && g.table.length > 0 && g.passed.includes(seat) && <span className="tm-role tm-role--done">Done</span>}
                  {g.out[seat] && <span className="tm-role tm-role--safe">Safe #{g.finish.indexOf(seat) + 1}</span>}
                  {g.loser === seat && <span className="tm-role tm-role--durak">Durak</span>}
                  {who === seat && <span className="tm-think"><i /><i /><i /></span>}
                </div>
              );
            })}
          </div>

          <div className="tm-mid">
            <div className="tm-deck" title={`${g.deck.length} cards left`}>
              {g.deck.length > 0 ? (
                <>
                  <Card card={g.trumpCard} className="tm-deck__trump" />
                  {g.deck.length > 1 && <CardBack className="tm-deck__top" style={{ "--depth": Math.min(6, Math.ceil((g.deck.length - 1) / 5)) }} />}
                </>
              ) : (
                <span className={`tm-deck__empty ${E.RED[g.trump] ? "is-red" : ""}`}><Suit s={g.trump} /></span>
              )}
              <span className="tm-deck__count">{g.deck.length}</span>
            </div>

            <div className={`tm-table${g.phase === "end" ? ` is-${g.end}` : ""}`} style={g.phase === "end" && g.end === "take" ? fromStyle(g.defender) : undefined}>
              {g.table.length === 0 && g.phase === "play" && (
                <p className="tm-table__hint">{who === 0 ? "Lead a card to attack" : `${name(g.attacker)} ${verb(g.attacker, "is", "are")} attacking ${g.defender === 0 ? "you" : name(g.defender)}`}</p>
              )}
              {g.table.map((p, i) => (
                <div key={p.a.id} className={`tm-pair${targets.has(i) ? " is-target" : ""}`} onClick={() => tapSlot(i)}>
                  <Card card={p.a} className="tm-pair__a" style={fromStyle(p.by)} />
                  {p.d && <Card card={p.d} className="tm-pair__d" style={fromStyle(g.defender)} />}
                </div>
              ))}
              {g.phase === "play" && g.table.length > 0 && <span className="tm-limit">{g.table.length}/{g.limit}</span>}
            </div>

            <div className="tm-discard" title="Discard pile">
              {g.discard > 0 && Array.from({ length: Math.min(4, Math.ceil(g.discard / 6)) }, (_, k) => <CardBack key={k} style={{ "--k": k }} />)}
              <span className="tm-deck__count">{g.discard}</span>
            </div>
          </div>

          <div className={`tm-bar${who === 0 ? " is-turn" : ""}`}>
            <p className="tm-status" aria-live="polite">{status}</p>
            <div className="tm-actions">
              {amDefender ? (
                <>
                  <button type="button" className="tm-btn tm-btn--gold" disabled={!act.defend} onClick={() => run(act.defend)}>Defend</button>
                  {g.mode === "transfer" && <button type="button" className="tm-btn tm-btn--blue" disabled={!act.transfer} onClick={() => run(act.transfer)}>Transfer</button>}
                  <button type="button" className="tm-btn tm-btn--red" disabled={!act.take} onClick={() => run(act.take)}>Take Cards</button>
                </>
              ) : (
                <>
                  <button type="button" className="tm-btn tm-btn--gold" disabled={!act.attack} onClick={() => run(act.attack)}>{g.table.length ? "Add Card" : "Attack"}</button>
                  <button type="button" className="tm-btn" disabled={!act.pass} onClick={() => run(act.pass)}>Done</button>
                </>
              )}
            </div>
          </div>

          <div className={`tm-hand${who === 0 ? " is-turn" : ""}${g.out[0] ? " is-out" : ""}`} style={{ "--n": n, "--ov": overlap }}>
            {g.out[0] && <span className="tm-role tm-role--safe tm-hand__safe">You're safe — #{g.finish.indexOf(0) + 1} out</span>}
            {hand.map((c, k) => {
              const cls = [
                playable.has(c.id) ? "is-playable" : who === 0 ? "is-dim" : "",
                sel === c.id ? "is-sel" : "",
                c.s === g.trump ? "is-trump" : "",
                shake?.id === c.id ? "is-shake" : "",
              ].join(" ");
              return (
                <Card
                  key={c.id + (shake?.id === c.id ? shake.n : "")}
                  card={c}
                  className={cls}
                  onClick={() => tapCard(c)}
                  style={{ "--k": k - (n - 1) / 2, "--fx": "calc(var(--u) * -70)", "--fy": "calc(var(--u) * -40)", animationDelay: dealing ? `${k * 80}ms` : undefined }}
                />
              );
            })}
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.id} className={`tm-toast ${toast.kind}`} role="status">{toast.text}</div>
      )}

      {overlay === "pause" && (
        <div className="tm-overlay">
          <div className="tm-panel">
            <h2>Paused</h2>
            <button type="button" className="tm-btn tm-btn--gold tm-btn--big" onClick={() => setOverlay(null)}>Resume</button>
            <button type="button" className="tm-btn" onClick={() => setOverlay("rules")}>Rules</button>
            <button type="button" className="tm-btn" onClick={() => start()}>New Deal</button>
            <button type="button" className="tm-btn" onClick={toMenu}>Main Menu</button>
          </div>
        </div>
      )}

      {overlay === "rules" && (
        <div className="tm-overlay" onClick={(e) => e.target === e.currentTarget && setOverlay(inGame ? "pause" : null)}>
          <div className="tm-panel tm-panel--rules">
            <h2>How to Play</h2>
            <div className="tm-rules">
              <p><b>Goal:</b> get rid of all your cards. The last player still holding cards is the <b>Durak</b> (the fool) and loses.</p>
              <p><b>Deck:</b> 36 cards, 6 up to Ace. Everyone gets 6 cards; the card under the pile shows the <b>trump</b> suit and is drawn last.</p>
              <p><b>Attack:</b> the holder of the lowest trump attacks first, on the player to their left. Anyone except the defender may then <b>add</b> cards whose rank is already on the table — at most 6 cards, and no more than the defender held when the bout began.</p>
              <p><b>Defend:</b> beat each card with a higher card of the same suit, or with any trump. A trump can only be beaten by a higher trump. If you can't (or won't), <b>Take Cards</b> — attackers may still throw in more.</p>
              <p><b>After the bout:</b> beaten cards are discarded and the defender attacks next. If the defender took, they lose their turn to attack. Hands refill to 6 — the first attacker draws first, the defender last.</p>
              <p><b>Transfer mode:</b> before beating anything, the defender may lay a card of the same rank to pass the attack to the next player — if that player has enough cards to answer it.</p>
              <p><b>Out:</b> once the pile is empty, players with no cards are safe.</p>
              <p className="tm-rules__keys">Tap a card to select it, tap again to play. Keys: <kbd>T</kbd> take · <kbd>D</kbd> done · <kbd>P</kbd> pause</p>
            </div>
            <button type="button" className="tm-btn tm-btn--gold" onClick={() => setOverlay(inGame ? "pause" : null)}>{inGame ? "Back" : "Close"}</button>
          </div>
        </div>
      )}

      {overlay === "result" && inGame && (
        <div className="tm-overlay">
          <div className={`tm-panel tm-result ${g.loser === 0 ? "is-loss" : "is-win"}`}>
            <p className="tm-result__kicker">{MODES[g.mode].label} · {g.n} players</p>
            <h2>{g.loser === 0 ? "Durak!" : g.loser == null ? "Draw" : "Victory!"}</h2>
            <p>{g.loser === 0 ? "You were left holding the cards." : g.loser == null ? "The last cards went out together." : `${name(g.loser)} is the Durak.`}</p>
            <ol className="tm-places">
              {g.finish.map((seat, k) => (
                <li key={seat} className={seat === 0 ? "is-me" : ""}><span>#{k + 1}</span>{seat === 0 ? "You" : `${AI[seat - 1].avatar} ${AI[seat - 1].name}`}</li>
              ))}
              {g.loser != null && (
                <li className={`is-durak${g.loser === 0 ? " is-me" : ""}`}><span>🃏</span>{g.loser === 0 ? "You" : `${AI[g.loser - 1].avatar} ${AI[g.loser - 1].name}`} — Durak</li>
              )}
            </ol>
            <p className="tm-result__stats">Record {stats.wins}–{stats.losses}{stats.draws ? `–${stats.draws}` : ""} · streak {stats.streak} · best {stats.best}</p>
            <div className="tm-menu__btns">
              <button type="button" className="tm-btn tm-btn--gold tm-btn--big" onClick={() => start()}>Play Again</button>
              <button type="button" className="tm-btn" onClick={toMenu}>Main Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
