import { Component } from "react";

/**
 * Rapier's physics world loads its WASM binary asynchronously (via Suspense,
 * see GameScene.jsx). If that load ever rejects — flaky network, a strict ad
 * blocker, a corrupted cache — there was previously no boundary catching it,
 * so the whole GamePlayer went blank with no feedback. This catches it and
 * asks the parent (LevelWorld) to show a proper retry overlay instead.
 */
export default class PhysicsErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Ball Adventure 3D: physics failed to load", error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
