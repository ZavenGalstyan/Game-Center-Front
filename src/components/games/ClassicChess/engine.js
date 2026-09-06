/**
 * Classic Chess engine — plain data, no React.
 *
 * Board layout: `board[r][c]`, row 0 = rank 8 (black's back rank, top of the
 * screen), row 7 = rank 1 (white's back rank, bottom). Column 0 = file a.
 *
 * A piece is `{ type, color }` where type is one of p r n b q k and color is
 * "w" | "b". Empty squares are `null`.
 *
 * Supported rules: legal movement for every piece, blocking (knights excepted),
 * captures, turn alternation, pawn double-step / diagonal capture / promotion,
 * en passant, castling (with all its restrictions), check, checkmate, stalemate.
 */

export const WHITE = "w";
export const BLACK = "b";

const KNIGHT_DELTAS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];
const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHOGONALS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const other = (color) => (color === WHITE ? BLACK : WHITE);

export function initialBoard() {
  const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: back[c], color: BLACK };
    board[1][c] = { type: "p", color: BLACK };
    board[6][c] = { type: "p", color: WHITE };
    board[7][c] = { type: back[c], color: WHITE };
  }
  return board;
}

export function initialState() {
  return {
    board: initialBoard(),
    turn: WHITE,
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null, // { r, c } square a pawn may move onto to capture en passant
    captured: { w: [], b: [] }, // pieces captured BY white / BY black
  };
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === "k" && p.color === color) return { r, c };
    }
  }
  return null;
}

/** Is square (r,c) attacked by any piece of `byColor`? */
export function isAttacked(board, r, c, byColor) {
  const pawnDir = byColor === WHITE ? -1 : 1; // direction that colour's pawns move
  for (const dc of [-1, 1]) {
    const pr = r - pawnDir;
    const pc = c + dc;
    if (inBounds(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.color === byColor && p.type === "p") return true;
    }
  }

  for (const [dr, dc] of KNIGHT_DELTAS) {
    const tr = r + dr;
    const tc = c + dc;
    if (inBounds(tr, tc)) {
      const p = board[tr][tc];
      if (p && p.color === byColor && p.type === "n") return true;
    }
  }

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const tr = r + dr;
      const tc = c + dc;
      if (inBounds(tr, tc)) {
        const p = board[tr][tc];
        if (p && p.color === byColor && p.type === "k") return true;
      }
    }
  }

  for (const [dr, dc] of DIAGONALS) {
    let tr = r + dr;
    let tc = c + dc;
    while (inBounds(tr, tc)) {
      const p = board[tr][tc];
      if (p) {
        if (p.color === byColor && (p.type === "b" || p.type === "q")) return true;
        break;
      }
      tr += dr;
      tc += dc;
    }
  }

  for (const [dr, dc] of ORTHOGONALS) {
    let tr = r + dr;
    let tc = c + dc;
    while (inBounds(tr, tc)) {
      const p = board[tr][tc];
      if (p) {
        if (p.color === byColor && (p.type === "r" || p.type === "q")) return true;
        break;
      }
      tr += dr;
      tc += dc;
    }
  }

  return false;
}

export function inCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  return isAttacked(board, king.r, king.c, other(color));
}

function pushPawnMove(moves, r, c, color) {
  const promoteRow = color === WHITE ? 0 : 7;
  moves.push(r === promoteRow ? { r, c, promotion: true } : { r, c });
}

/**
 * Pseudo-legal moves for the piece at (r,c): correct movement, blocking,
 * captures, castling and en passant — but NOT filtered for leaving your own
 * king in check. `legalMovesFrom` does that filtering.
 */
export function pseudoMoves(state, r, c) {
  const { board, castling, enPassant } = state;
  const piece = board[r][c];
  if (!piece) return [];

  const moves = [];
  const { color } = piece;
  const opp = other(color);
  const add = (tr, tc, extra) => moves.push({ r: tr, c: tc, ...extra });

  const slide = (deltas) => {
    for (const [dr, dc] of deltas) {
      let tr = r + dr;
      let tc = c + dc;
      while (inBounds(tr, tc)) {
        const t = board[tr][tc];
        if (!t) {
          add(tr, tc);
        } else {
          if (t.color === opp) add(tr, tc);
          break;
        }
        tr += dr;
        tc += dc;
      }
    }
  };

  if (piece.type === "p") {
    const dir = color === WHITE ? -1 : 1;
    const startRow = color === WHITE ? 6 : 1;

    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      pushPawnMove(moves, r + dir, c, color);
      if (r === startRow && !board[r + 2 * dir][c]) {
        add(r + 2 * dir, c, { double: true });
      }
    }

    for (const dc of [-1, 1]) {
      const tr = r + dir;
      const tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const t = board[tr][tc];
      if (t && t.color === opp) {
        pushPawnMove(moves, tr, tc, color);
      } else if (enPassant && enPassant.r === tr && enPassant.c === tc) {
        add(tr, tc, { enPassant: true });
      }
    }
  } else if (piece.type === "n") {
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const tr = r + dr;
      const tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const t = board[tr][tc];
      if (!t || t.color === opp) add(tr, tc);
    }
  } else if (piece.type === "b") {
    slide(DIAGONALS);
  } else if (piece.type === "r") {
    slide(ORTHOGONALS);
  } else if (piece.type === "q") {
    slide([...DIAGONALS, ...ORTHOGONALS]);
  } else if (piece.type === "k") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const tr = r + dr;
        const tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const t = board[tr][tc];
        if (!t || t.color === opp) add(tr, tc);
      }
    }

    const homeRow = color === WHITE ? 7 : 0;
    if (r === homeRow && c === 4) {
      const kSide = color === WHITE ? castling.wK : castling.bK;
      const qSide = color === WHITE ? castling.wQ : castling.bQ;
      const rookOK = (rc) => {
        const rook = board[homeRow][rc];
        return rook && rook.type === "r" && rook.color === color;
      };
      const clear = (...cols) => cols.every((cc) => !board[homeRow][cc]);
      const safe = (...cols) =>
        cols.every((cc) => !isAttacked(board, homeRow, cc, opp));

      if (kSide && rookOK(7) && clear(5, 6) && safe(4, 5, 6)) {
        add(homeRow, 6, { castle: "K" });
      }
      if (qSide && rookOK(0) && clear(1, 2, 3) && safe(4, 3, 2)) {
        add(homeRow, 2, { castle: "Q" });
      }
    }
  }

  return moves;
}

/**
 * Apply a move and return the next state. `from`/`to` are `{ r, c }`.
 * `promotionType` (p r n b q k → use q/r/b/n) is used only when a pawn reaches
 * the last rank; it defaults to a queen.
 */
export function applyMove(state, from, to, promotionType) {
  const board = cloneBoard(state.board);
  const piece = board[from.r][from.c];
  const { color } = piece;
  const castling = { ...state.castling };
  const captured = { w: [...state.captured.w], b: [...state.captured.b] };
  let enPassant = null;

  const target = board[to.r][to.c];
  const isEnPassant = piece.type === "p" && to.c !== from.c && !target;

  if (isEnPassant) {
    const grabbed = board[from.r][to.c];
    if (grabbed) captured[color].push(grabbed);
    board[from.r][to.c] = null;
  } else if (target) {
    captured[color].push(target);
  }

  board[to.r][to.c] = piece;
  board[from.r][from.c] = null;

  if (piece.type === "p" && (to.r === 0 || to.r === 7)) {
    board[to.r][to.c] = { type: promotionType || "q", color };
  }

  if (piece.type === "k" && Math.abs(to.c - from.c) === 2) {
    const row = from.r;
    if (to.c === 6) {
      board[row][5] = board[row][7];
      board[row][7] = null;
    } else if (to.c === 2) {
      board[row][3] = board[row][0];
      board[row][0] = null;
    }
  }

  if (piece.type === "k") {
    if (color === WHITE) {
      castling.wK = false;
      castling.wQ = false;
    } else {
      castling.bK = false;
      castling.bQ = false;
    }
  }

  const dropRight = (r, c) => {
    if (r === 7 && c === 0) castling.wQ = false;
    if (r === 7 && c === 7) castling.wK = false;
    if (r === 0 && c === 0) castling.bQ = false;
    if (r === 0 && c === 7) castling.bK = false;
  };
  if (piece.type === "r") dropRight(from.r, from.c);
  dropRight(to.r, to.c); // a rook that got captured on its home square

  if (piece.type === "p" && Math.abs(to.r - from.r) === 2) {
    enPassant = { r: (to.r + from.r) / 2, c: from.c };
  }

  return { board, turn: other(color), castling, enPassant, captured };
}

/** Fully legal moves for the piece at `from` (must belong to the side to move). */
export function legalMovesFrom(state, from) {
  const piece = state.board[from.r][from.c];
  if (!piece || piece.color !== state.turn) return [];
  return pseudoMoves(state, from.r, from.c).filter((m) => {
    const next = applyMove(state, from, { r: m.r, c: m.c }, "q");
    return !inCheck(next.board, piece.color);
  });
}

function hasAnyLegalMove(state, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p || p.color !== color) continue;
      for (const m of pseudoMoves(state, r, c)) {
        const next = applyMove(state, { r, c }, { r: m.r, c: m.c }, "q");
        if (!inCheck(next.board, color)) return true;
      }
    }
  }
  return false;
}

/** "playing" | "check" | "checkmate" | "stalemate" for the side to move. */
export function getStatus(state) {
  const color = state.turn;
  const check = inCheck(state.board, color);
  if (!hasAnyLegalMove(state, color)) return check ? "checkmate" : "stalemate";
  return check ? "check" : "playing";
}
