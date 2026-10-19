/**
 * Memory Cards rules — a pure reducer, no timers or DOM. Time is passed in on
 * actions (`now`, ms) so the clock is testable; the component owns the
 * mismatch-hide timeout and the display tick.
 */
export const LEVELS = {
  easy: { label: "Easy", cols: 4, rows: 3 },
  medium: { label: "Medium", cols: 4, rows: 4 },
  hard: { label: "Hard", cols: 6, rows: 4 },
};
export const FACE_COUNT = 12;

export function shuffle(list, rnd = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A fresh shuffled deck: `pairs` random faces out of FACE_COUNT, each twice. */
export function deal(level, rnd = Math.random) {
  const { cols, rows } = LEVELS[level];
  const faces = shuffle([...Array(FACE_COUNT).keys()], rnd).slice(0, (cols * rows) / 2);
  return shuffle([...faces, ...faces], rnd).map((face, id) => ({ id, face, matched: false }));
}

export function newGame(level = "easy", rnd) {
  return {
    level,
    cards: deal(level, rnd),
    open: [], // indices currently face up and unmatched (max 2)
    moves: 0,
    pairs: 0,
    elapsed: 0, // ms accumulated while running
    since: null, // timestamp the clock last (re)started, null when stopped
    paused: false,
    won: false,
    key: Math.random(), // changes per game so the view can re-key the board
  };
}

export const totalPairs = (s) => s.cards.length / 2;
export const timeOf = (s, now) => s.elapsed + (s.since == null ? 0 : now - s.since);

export function reduce(s, a) {
  switch (a.type) {
    case "new":
      return newGame(a.level ?? s.level, a.rnd);
    case "flip": {
      const i = a.index;
      const card = s.cards[i];
      if (s.won || s.paused || !card || card.matched || s.open.length >= 2 || s.open.includes(i)) return s;
      const since = s.since ?? a.now; // the clock starts on the first flip
      if (s.open.length === 0) return { ...s, since, open: [i] };
      const j = s.open[0];
      const moves = s.moves + 1;
      if (s.cards[j].face !== card.face) return { ...s, since, moves, open: [j, i] };
      const cards = s.cards.map((c, k) => (k === i || k === j ? { ...c, matched: true } : c));
      const pairs = s.pairs + 1;
      const won = pairs === totalPairs(s);
      return {
        ...s, cards, moves, pairs, won, open: [],
        elapsed: won ? s.elapsed + (a.now - since) : s.elapsed,
        since: won ? null : since,
      };
    }
    case "hide": // after a mismatch
      return s.open.length === 2 ? { ...s, open: [] } : s;
    case "pause":
      if (s.won || s.paused) return s;
      return { ...s, paused: true, elapsed: timeOf(s, a.now), since: null, started: s.since != null || s.elapsed > 0 };
    case "resume":
      if (!s.paused) return s;
      return { ...s, paused: false, since: s.started ? a.now : null };
    default:
      return s;
  }
}

export function formatTime(ms) {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
