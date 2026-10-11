/**
 * Urban Skate Rush — WebGL availability check and error boundary
 */
import { Component } from "react";

/** Check if WebGL 2 is available */
function checkWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

export const hasWebGL = checkWebGL();

/**
 * Error boundary for the 3D scene
 */
export class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Urban Skate Rush scene error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="usr-error">
          <div className="usr-error__title">Something went wrong</div>
          <p>The 3D scene encountered an error. Please try refreshing the page.</p>
          <p style={{ fontSize: "0.75rem", color: "#666", marginTop: "1rem" }}>
            {this.state.error?.message || "Unknown error"}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
