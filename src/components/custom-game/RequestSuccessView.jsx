import { LaunchedEmblem } from "./Emblems.jsx";

/** Shown only after the backend confirmed the request with HTTP 201. */
export default function RequestSuccessView({ firstName, email, onDone }) {
  return (
    <div className="cg-notice cg-notice--success">
      <div className="cg-gate__art">
        <LaunchedEmblem />
      </div>

      <p className="cg-chip cg-chip--ok">
        <span className="cg-chip__dot" aria-hidden="true" />
        Pending review
      </p>

      <h2 id="cg-dialog-title" className="cg-dialog__title cg-dialog__title--center">
        Request received!
      </h2>
      <p id="cg-dialog-desc" className="cg-dialog__lead cg-dialog__lead--center" role="status">
        Thanks, {firstName}. We&apos;ll contact you at{" "}
        <strong className="cg-notice__email">{email}</strong> after reviewing your game idea.
      </p>

      <div className="cg-gate__actions cg-gate__actions--single">
        <button type="button" className="cg-btn cg-btn--primary" onClick={onDone} data-autofocus>
          <span>Done</span>
        </button>
      </div>
    </div>
  );
}
