import { LaunchPadEmblem } from "./Emblems.jsx";

/** Honest post-validation state: the request was NOT sent anywhere. */
export default function ComingSoonView({ onDone }) {
  return (
    <div className="cg-notice">
      <div className="cg-gate__art">
        <LaunchPadEmblem />
      </div>

      <p className="cg-chip cg-chip--warn">
        <span className="cg-chip__dot" aria-hidden="true" />
        Not sent yet
      </p>

      <h2 id="cg-dialog-title" className="cg-dialog__title cg-dialog__title--center">
        Almost There!
      </h2>
      <p id="cg-dialog-desc" className="cg-dialog__lead cg-dialog__lead--center" role="status">
        Your game request is ready, but online submissions are coming soon. Please check back
        shortly.
      </p>

      <div className="cg-gate__actions cg-gate__actions--single">
        <button type="button" className="cg-btn cg-btn--primary" onClick={onDone} data-autofocus>
          <span>Got It</span>
        </button>
      </div>
    </div>
  );
}
