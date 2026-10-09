/**
 * Night Corridor — keeps the 3D view alive (same root cause as the other
 * R3F games here): R3F only sizes its renderer after its ResizeObserver
 * reports a non-zero container, and inside the Game Center that first
 * measurement can be missed, leaving a 300×150 canvas.
 *
 *   useCanvasWatchdog  compares canvas vs container every 250 ms and nudges
 *                      a re-measure (window "resize") on mismatch — this is
 *                      also what makes fullscreen toggles resize correctly
 *                      without recreating the scene or the loop.
 *   hasWebGL           up-front WebGL2 check (three r169 needs WebGL2).
 *   SceneErrorBoundary a render / shader / context error shows a message
 *                      with Retry — never a blank stage.
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
    console.error("[NightCorridor] scene failed:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="nc-error">
          <div className="nc-error__title">The building didn't load</div>
          <p>{String(this.state.error?.message || this.state.error)}</p>
          <button type="button" className="nc-btn nc-btn--primary" onClick={() => this.setState({ error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
