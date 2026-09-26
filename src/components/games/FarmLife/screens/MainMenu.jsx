import { useState } from "react";

export default function MainMenu({ hasSave, onContinue, onNewFarm, onResetFarm }) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <div className="fl-menu">
      <div className="fl-menu__card">
        <p className="fl-menu__tagline">PLANT · GROW · BUILD · LIVE</p>
        <h1 className="fl-menu__title">Farm Life</h1>
        <p className="fl-menu__blurb">
          A small field, a few seeds and a handful of coins — grow it into a
          real countryside farm.
        </p>

        <div className="fl-menu__actions">
          {hasSave ? (
            <button type="button" className="fl-btn fl-btn--primary fl-btn--big" onClick={onContinue}>
              Continue Farming
            </button>
          ) : (
            <button type="button" className="fl-btn fl-btn--primary fl-btn--big" onClick={onNewFarm}>
              Start New Farm
            </button>
          )}

          {hasSave && !confirmingReset && (
            <button type="button" className="fl-btn fl-btn--ghost" onClick={() => setConfirmingReset(true)}>
              Start Over…
            </button>
          )}
          {confirmingReset && (
            <div className="fl-menu__confirm">
              <p>This permanently deletes your saved farm. Are you sure?</p>
              <div className="fl-menu__confirm-row">
                <button
                  type="button"
                  className="fl-btn fl-btn--danger"
                  onClick={async () => { await onResetFarm(); setConfirmingReset(false); onNewFarm(); }}
                >
                  Delete &amp; Start Over
                </button>
                <button type="button" className="fl-btn" onClick={() => setConfirmingReset(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="fl-menu__controls">
          <strong>Controls</strong>
          <span>WASD move · Shift sprint · F interact · 1-9 hotbar · I inventory · Scroll to zoom</span>
        </div>
      </div>
    </div>
  );
}
