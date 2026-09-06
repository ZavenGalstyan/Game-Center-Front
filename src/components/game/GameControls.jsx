/**
 * Control toolbar for <GamePlayer>. Three buttons only: Restart, Mute/Unmute,
 * Fullscreen. Restart and Mute are disabled until a game wires up a handler.
 */

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function IconFullscreen() {
  return (
    <svg {...svgProps}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function IconExitFullscreen() {
  return (
    <svg {...svgProps}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function IconRestart() {
  return (
    <svg {...svgProps}>
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function IconSound() {
  return (
    <svg {...svgProps}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
    </svg>
  );
}

function IconMuted() {
  return (
    <svg {...svgProps}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="m22 9-6 6M16 9l6 6" />
    </svg>
  );
}

export default function GameControls({
  isFullscreen,
  muted,
  onToggleFullscreen,
  onRestart,
  onToggleMute,
}) {
  return (
    <div className="game-controls">
      <button
        type="button"
        className="game-controls__btn"
        onClick={onRestart}
        disabled={!onRestart}
        title={onRestart ? "Restart game" : "Available once a game is loaded"}
      >
        <IconRestart />
        <span>Restart</span>
      </button>

      <button
        type="button"
        className="game-controls__btn"
        onClick={onToggleMute}
        disabled={!onToggleMute}
        aria-pressed={muted}
        title={
          onToggleMute
            ? muted
              ? "Unmute"
              : "Mute"
            : "Available once a game is loaded"
        }
      >
        {muted ? <IconMuted /> : <IconSound />}
        <span>{muted ? "Unmute" : "Mute"}</span>
      </button>

      <button
        type="button"
        className="game-controls__btn game-controls__btn--primary"
        onClick={onToggleFullscreen}
        aria-pressed={isFullscreen}
      >
        {isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
        <span>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
      </button>
    </div>
  );
}
