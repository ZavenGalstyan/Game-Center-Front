/**
 * Parking Jam — error boundary around each screen. If a screen ever throws
 * while rendering, the player gets a small recovery panel inside the game
 * stage instead of the whole Game Center page going blank. Progress is in
 * localStorage and untouched.
 */
import { Component } from "react";

export default class SafeScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Parking Jam screen error:", error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    // a new screen / attempt gets a fresh chance
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="pj-crash" role="alert">
        <div className="pj-stuck__sign">OUT OF ORDER</div>
        <p>This screen hit a problem. Your progress is safe.</p>
        <button type="button" className="pj-btn pj-btn--primary" onClick={() => { this.setState({ error: null }); this.props.onRecover?.(); }}>
          Back to menu
        </button>
      </div>
    );
  }
}
