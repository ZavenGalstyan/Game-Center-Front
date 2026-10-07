/**
 * Highway Racer — keeps the 3D view alive inside the Game Center (same root
 * cause as the other R3F games here): R3F sizes its renderer from a
 * ResizeObserver, and the first measurement can be missed, leaving a
 * 300×150 canvas. The watchdog compares canvas vs container and nudges a
 * re-measure — which is also what makes fullscreen toggles resize without
 * recreating the scene, loop, listeners or audio.
 */
import { Component, useEffect } from "react";

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
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
    const id = setInterval(check, 300);
    let ro = null;
    try {
      ro = new ResizeObserver(check);
      ro.observe(host);
    } catch {
      /* the interval covers it */
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
    console.error("[HighwayRacer] scene failed:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="hr-error">
          <div className="hr-error__title">The highway didn't load</div>
          <p>{String(this.state.error?.message || this.state.error)}</p>
          <button type="button" className="hr-btn hr-btn--primary" onClick={() => this.setState({ error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
