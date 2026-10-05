/**
 * Island Conquest — keeps the 3D view alive (same proven guard as Castle Rush).
 *
 * ROOT CAUSE this exists for: React Three Fiber does not create its WebGL
 * renderer until its internal ResizeObserver (react-use-measure) reports a
 * non-zero container size. In this Game Center that first measurement can
 * fail to arrive (same bug as Ball Adventure 3D), which leaves the <canvas>
 * at the browser default 300×150 with NOTHING drawn — the menu/HUD then sits
 * on the plain `.ic` background. react-use-measure also listens to
 * window "resize", so dispatching one forces a fresh measurement.
 *
 *   useCanvasWatchdog  compares the canvas to its stage every 250 ms (and on
 *                      our own ResizeObserver) and nudges a re-measure on any
 *                      mismatch; reports "stuck" after ~6 s so the UI can show
 *                      a real error instead of an empty stage.
 *   hasWebGL           up-front WebGL2 check (three r169 needs WebGL2).
 *   SceneErrorBoundary any render / shader / context error inside the scene
 *                      shows a visible message with Retry — never a blank stage.
 */
import { Component, useEffect, useState } from "react";

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

export function useCanvasWatchdog(stageRef) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let bad = 0;
    let warned = false;
    const check = () => {
      const r = stage.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return; // stage itself not laid out yet
      const c = stage.querySelector("canvas");
      const ok = c && Math.abs(c.clientWidth - r.width) <= 2 && Math.abs(c.clientHeight - r.height) <= 2 && c.width > 0;
      if (ok) {
        bad = 0;
        if (warned) setStuck(false);
        warned = false;
        return;
      }
      bad++;
      window.dispatchEvent(new Event("resize"));
      if (bad === 24 && !warned) {
        warned = true;
        if (import.meta.env.DEV) console.error("[IslandConquest] 3D canvas never received its size", { stage: [r.width, r.height], canvas: c ? [c.clientWidth, c.clientHeight, c.width, c.height] : null });
        setStuck(true);
      }
    };
    const id = setInterval(check, 250);
    let ro = null;
    try {
      ro = new ResizeObserver(check);
      ro.observe(stage);
    } catch {
      /* no ResizeObserver: the interval still covers it */
    }
    check();
    return () => {
      clearInterval(id);
      if (ro) ro.disconnect();
    };
  }, [stageRef]);
  return stuck;
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
    console.error("[IslandConquest] 3D scene failed:", error);
  }
  render() {
    if (this.state.error) return this.props.fallback(String(this.state.error?.message || this.state.error), () => this.setState({ error: null }));
    return this.props.children;
  }
}
