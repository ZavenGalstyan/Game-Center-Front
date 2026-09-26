/**
 * Cozy Cleanup — small premium "Floor Clean ✓" notifications. A tiny
 * queue (see useToasts), never more than a couple on screen, each
 * auto-dismissing — never an intrusive modal.
 */
import { useCallback, useRef, useState } from "react";

let uid = 0;

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const push = useCallback((text) => {
    const id = ++uid;
    setToasts((prev) => [...prev.slice(-2), { id, text }]);
    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timers.current[id];
    }, 2200);
  }, []);

  return { toasts, push };
}

export default function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="cc-toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="cc-toast">{t.text}</div>
      ))}
    </div>
  );
}
