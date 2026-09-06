import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyMove,
  findKing,
  getStatus,
  initialState,
  legalMovesFrom,
  WHITE,
  BLACK,
} from "./engine.js";
import { pickAIMove } from "./ai.js";
import { resolveTheme } from "./settings.js";

/**
 * The active chess match. One content area inside the GamePlayer window — no
 * side panels. Fresh standard position on mount (the parent remounts this via
 * `key` to start a new match or honour the outer Restart button).
 *
 * mode "ai": user is White, AI plays Black automatically after each user move.
 * mode "local": both sides played on the same device.
 *
 * Chess rules, AI and move validation all come from ./engine.js and ./ai.js.
 * This component only adds presentation state: `selected`, `promotion`,
 * `aiThinking`, and `lastMove` (from/to of the most recent move, for the
 * board highlight — it does not affect any rule).
 */

const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PROMO_TYPES = ["q", "r", "b", "n"];
const PIECE_NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };

export default function ChessBoard({ mode = "ai", settings, onMenu }) {
  const [state, setState] = useState(initialState);
  const [selected, setSelected] = useState(null); // { r, c }
  const [promotion, setPromotion] = useState(null); // { from, to }
  const [aiThinking, setAiThinking] = useState(false);
  const [lastMove, setLastMove] = useState(null); // { from: {r,c}, to: {r,c} }
  const [moveSeq, setMoveSeq] = useState(0); // bumps each move — drives the place animation

  const theme = resolveTheme(settings?.boardTheme);

  const status = useMemo(() => getStatus(state), [state]);
  const gameOver = status === "checkmate" || status === "stalemate";
  const aiToMove = mode === "ai" && state.turn === BLACK;
  const locked = gameOver || Boolean(promotion) || aiThinking || aiToMove;

  // The side to move is the side in check (engine already told us via `status`).
  const checkedKing =
    status === "check" || status === "checkmate"
      ? findKing(state.board, state.turn)
      : null;

  const legalMoves = useMemo(
    () => (selected ? legalMovesFrom(state, selected) : []),
    [selected, state],
  );
  const moveAt = useCallback(
    (r, c) => legalMoves.find((m) => m.r === r && m.c === c) || null,
    [legalMoves],
  );

  const commitMove = useCallback((nextState, from, to) => {
    setState(nextState);
    setLastMove({ from, to });
    setMoveSeq((n) => n + 1);
    setSelected(null);
  }, []);

  const resetMatch = useCallback(() => {
    setState(initialState());
    setSelected(null);
    setPromotion(null);
    setLastMove(null);
    setMoveSeq(0);
    setAiThinking(false);
  }, []);

  // AI plays Black in "ai" mode, with a short natural delay.
  useEffect(() => {
    if (mode !== "ai" || state.turn !== BLACK || gameOver) return undefined;
    let cancelled = false;
    setAiThinking(true);
    const timer = setTimeout(() => {
      if (cancelled) return;
      const mv = pickAIMove(state);
      if (mv) {
        const next = applyMove(state, mv.from, mv.to, mv.promotion ? "q" : undefined);
        setState(next);
        setLastMove({ from: mv.from, to: mv.to });
        setMoveSeq((n) => n + 1);
      }
      setSelected(null);
      setAiThinking(false);
    }, 300 + Math.floor(Math.random() * 400));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setAiThinking(false);
    };
  }, [state, mode, gameOver]);

  const handleSquare = useCallback(
    (r, c) => {
      if (locked) return;
      const piece = state.board[r][c];

      if (selected) {
        const move = moveAt(r, c);
        if (move) {
          if (move.promotion) {
            setPromotion({ from: selected, to: { r, c } });
          } else {
            commitMove(applyMove(state, selected, { r, c }), selected, { r, c });
          }
          return;
        }
        if (piece && piece.color === state.turn) {
          setSelected({ r, c });
          return;
        }
        setSelected(null);
        return;
      }

      if (piece && piece.color === state.turn) setSelected({ r, c });
    },
    [locked, state, selected, moveAt, commitMove],
  );

  const choosePromotion = useCallback(
    (type) => {
      const { from, to } = promotion;
      commitMove(applyMove(state, from, to, type), from, to);
      setPromotion(null);
    },
    [state, promotion, commitMove],
  );

  const turnLabel = state.turn === WHITE ? "White" : "Black";
  const inCheck = status === "check";
  let statusText;
  if (status === "checkmate") {
    statusText = `Checkmate — ${state.turn === WHITE ? "Black" : "White"} wins`;
  } else if (status === "stalemate") {
    statusText = "Stalemate — draw";
  } else if (aiThinking) {
    statusText = inCheck ? "Check — Black is thinking…" : "Black is thinking…";
  } else if (inCheck) {
    statusText = `Check — ${turnLabel} to move`;
  } else {
    statusText = `${turnLabel} to move`;
  }
  const danger = inCheck || status === "checkmate";

  const names =
    mode === "ai" ? { w: "You", b: "AI" } : { w: "Player 1", b: "Player 2" };

  const renderPlayer = (color) => {
    const isWhite = color === WHITE;
    const captured = isWhite ? state.captured.w : state.captured.b;
    const takenClass = isWhite ? "chess__piece--b" : "chess__piece--w";
    const sub = isWhite
      ? names.w
      : aiThinking && mode === "ai"
        ? `${names.b} · Thinking…`
        : names.b;
    return (
      <div
        className={
          "chess__player" +
          (state.turn === color && !gameOver ? " chess__player--active" : "") +
          (checkedKing && state.turn === color ? " chess__player--check" : "")
        }
      >
        <span
          className={`chess__player-piece chess__player-piece--${isWhite ? "w" : "b"}`}
          aria-hidden="true"
        >
          ♚
        </span>
        <span className="chess__player-meta">
          <span className="chess__player-name">{isWhite ? "White" : "Black"}</span>
          <span className="chess__player-sub">{sub}</span>
        </span>
        {captured.length > 0 && (
          <span className="chess__player-taken" aria-hidden="true">
            {captured.map((p, i) => (
              <span key={i} className={`chess__piece ${takenClass}`}>
                {GLYPH[p.type]}
              </span>
            ))}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="chess__screen chess__screen--game">
      <div className="chess__topbar">
        <button
          type="button"
          className="chess__btn chess__btn--secondary chess__btn--sm chess__btn--back"
          onClick={onMenu}
        >
          <span aria-hidden="true">←</span> Menu
        </button>
        <span
          className={"chess__turn" + (danger ? " chess__turn--danger" : "")}
          role="status"
        >
          <span className={`chess__turn-dot chess__turn-dot--${state.turn}`} />
          {statusText}
        </span>
      </div>

      <div className="chess__players">
        {renderPlayer(WHITE)}
        <span className="chess__players-vs" aria-hidden="true">vs</span>
        {renderPlayer(BLACK)}
      </div>

      <div className="chess__board-wrap">
        <div className="chess__board-frame">
          <div
            className="chess__board"
            data-theme={theme.id}
            style={{ "--sq-light": theme.light, "--sq-dark": theme.dark }}
            role="grid"
            aria-label="Chess board"
          >
            {state.board.map((row, r) =>
              row.map((piece, c) => {
                const dark = (r + c) % 2 === 1;
                const isSelected =
                  selected && selected.r === r && selected.c === c;
                const move = moveAt(r, c);
                const isCheckSq =
                  checkedKing && checkedKing.r === r && checkedKing.c === c;
                const isLastFrom =
                  lastMove && lastMove.from.r === r && lastMove.from.c === c;
                const isLastTo =
                  lastMove && lastMove.to.r === r && lastMove.to.c === c;

                let cls = "chess__sq " + (dark ? "chess__sq--dark" : "chess__sq--light");
                if (isCheckSq) {
                  cls +=
                    status === "checkmate"
                      ? " chess__sq--check chess__sq--mate"
                      : " chess__sq--check";
                }
                if (isSelected) cls += " chess__sq--selected";
                if (move) cls += piece ? " chess__sq--capture" : " chess__sq--move";
                if ((isLastFrom || isLastTo) && !isCheckSq) cls += " chess__sq--last";
                if (isLastTo && !isCheckSq) cls += " chess__sq--last-to";

                return (
                  <button
                    type="button"
                    key={`${r}-${c}`}
                    className={cls}
                    onClick={() => handleSquare(r, c)}
                    aria-label={
                      `${FILES[c]}${8 - r}` +
                      (piece
                        ? `, ${piece.color === WHITE ? "white" : "black"} ${PIECE_NAME[piece.type]}`
                        : ", empty")
                    }
                  >
                    {c === 0 && (
                      <span className="chess__coord chess__coord--rank">{8 - r}</span>
                    )}
                    {r === 7 && (
                      <span className="chess__coord chess__coord--file">{FILES[c]}</span>
                    )}
                    {piece && (
                      <span
                        key={isLastTo ? `mv-${moveSeq}` : "p"}
                        className={
                          `chess__piece chess__piece--${piece.color}` +
                          (isLastTo ? " chess__piece--placed" : "")
                        }
                      >
                        {GLYPH[piece.type]}
                      </span>
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </div>

      {promotion && (
        <div className="chess__promo" role="dialog" aria-label="Choose promotion piece">
          <div className="chess__promo-box">
            <p className="chess__promo-title">Promote to</p>
            <div className="chess__promo-opts">
              {PROMO_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  className="chess__promo-btn"
                  onClick={() => choosePromotion(t)}
                  aria-label={PIECE_NAME[t]}
                >
                  <span className={`chess__piece chess__piece--${state.turn}`}>
                    {GLYPH[t]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {gameOver && (
        <div className="chess__endgame" role="dialog" aria-label="Game over">
          <div className="chess__endgame-card">
            <p className="chess__endgame-title">
              {status === "checkmate" ? "Checkmate" : "Draw"}
            </p>
            <p className="chess__endgame-sub">
              {status === "checkmate"
                ? `${state.turn === WHITE ? "Black" : "White"} wins`
                : "Stalemate"}
            </p>
            <div className="chess__endgame-actions">
              <button
                type="button"
                className="chess__btn chess__btn--primary chess__btn--sm"
                onClick={resetMatch}
              >
                Play Again
              </button>
              <button
                type="button"
                className="chess__btn chess__btn--secondary chess__btn--sm"
                onClick={onMenu}
              >
                Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
