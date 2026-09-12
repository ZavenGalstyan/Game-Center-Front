/**
 * Blade Rush — the compact "new blade unlocked" toast. Shown briefly after a
 * stage completion crosses a blade's unlock milestone; auto-dismisses so it
 * never blocks play, and VIEW jumps straight to the Blades screen.
 */
import { useEffect } from "react";
import BladePreview from "./BladePreview.jsx";

const AUTO_DISMISS_MS = 3800;

export default function UnlockToast({ blade, onView, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [blade, onDismiss]);

  return (
    <div className="br-unlock-toast" role="status">
      <div className="br-unlock-toast__icon"><BladePreview skin={blade} /></div>
      <div className="br-unlock-toast__body">
        <span className="br-unlock-toast__label">NEW BLADE UNLOCKED</span>
        <span className="br-unlock-toast__name">{blade.name}</span>
      </div>
      <button type="button" className="br-btn br-btn--sm" onClick={onView}>VIEW</button>
    </div>
  );
}
