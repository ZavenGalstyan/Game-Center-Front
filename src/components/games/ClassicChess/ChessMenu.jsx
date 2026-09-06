/** Classic Chess main menu — rendered inside the shared GamePlayer window. */
export default function ChessMenu({ onPlayAI, onPlayLocal, onSettings }) {
  return (
    <div className="chess__screen chess__screen--menu">
      <div className="chess__decor" aria-hidden="true">
        <span className="chess__decor-piece chess__decor-piece--1">♞</span>
        <span className="chess__decor-piece chess__decor-piece--2">♚</span>
        <span className="chess__decor-piece chess__decor-piece--3">♜</span>
      </div>

      <div className="chess__center">
        <div className="chess__crest" aria-hidden="true">♛</div>
        <h2 className="chess__logo">Classic Chess</h2>
        <p className="chess__tagline">A quiet, classic game of chess.</p>
        <div className="chess__rule" aria-hidden="true" />

        <div className="chess__menu-list">
          <button
            type="button"
            className="chess__btn chess__btn--primary chess__btn--cta"
            onClick={onPlayAI}
          >
            <span className="chess__btn-glyph" aria-hidden="true">♟</span>
            Play with AI
          </button>
          <button
            type="button"
            className="chess__btn chess__btn--secondary"
            onClick={onPlayLocal}
          >
            Play Local
          </button>
          <button
            type="button"
            className="chess__btn chess__btn--secondary"
            onClick={onSettings}
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
