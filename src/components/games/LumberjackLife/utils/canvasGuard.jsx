/**
 * Lumberjack Life — keeps the 3D view alive (same root cause as Ball
 * Adventure 3D / Penalty Kick): R3F only creates its renderer after its
 * ResizeObserver reports a non-zero container size, and in this Game Center
 * that first measurement can fail to arrive, leaving a 300×150 canvas.
 *
 *   useCanvasWatchdog  compares the canvas with its container every 250 ms
 *                      and nudges a re-measure (window "resize") on mismatch.
 *   hasWebGL           up-front WebGL2 check (three r169 needs WebGL2).
 *   SceneErrorBoundary any render / shader / context error shows a visible
 *                      message with Retry — never a blank stage.
 */
import { Component, useEffect } from "react";

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

export function useCanvasWatchdog(ref) {
  useEffect(() => {
    const host = ref.current;
    if (!host) return undefined;
    const check = () => {
      const r = host.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const c = host.querySelector("canvas");
      const ok = c && Math.abs(c.clientWidth - r.width) <= 2 && Math.abs(c.clientHeight - r.height) <= 2 && c.width > 0;
      if (!ok) window.dispatchEvent(new Event("resize"));
    };
    const id = setInterval(check, 250);
    let ro = null;
    try {
      ro = new ResizeObserver(check);
      ro.observe(host);
    } catch {
      /* interval covers it */
    }
    check();
    return () => {
      clearInterval(id);
      if (ro) ro.disconnect();
    };
  }, [ref]);
}

export class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error("[LumberjackLife] scene failed:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="ll-error">
          <div className="ll-error__title">Something went wrong in the forest</div>
          <p>{String(this.state.error?.message || this.state.error)}</p>
          <button type="button" className="ll-btn ll-btn--primary" onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
