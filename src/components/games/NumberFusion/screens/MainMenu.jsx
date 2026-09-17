import { IconPlay, IconSettings } from "../components/uiIcons.jsx";

const PREVIEW = [2, 4, 8, 16];

export default function MainMenu({ bestScore, statistics, hasSavedGame, onPlay, onSettings }) {
  return (
    <div className="nf-menu">
      <div className="nf-menu__preview" aria-hidden="true">
        {PREVIEW.map((v, i) => (
          <span key={v} className="nf-menu__preview-tile" data-v={v} style={{ "--i": i }}>{v}</span>
        ))}
      </div>

      <h1 className="nf-menu__title">Number Fusion</h1>
      <p className="nf-menu__tagline">SLIDE • MERGE • MULTIPLY</p>

      <div className="nf-menu__stats">
        <div><strong>{bestScore}</strong><span>Best score</span></div>
        <div><strong>{statistics.highestTile || "—"}</strong><span>Highest tile</span></div>
        <div><strong>{statistics.gamesPlayed}</strong><span>Games played</span></div>
      </div>

      <div className="nf-menu__buttons">
        <button type="button" className="nf-btn nf-btn--primary nf-btn--lg" onClick={onPlay}>
          <IconPlay /> {hasSavedGame ? "Continue" : "Play"}
        </button>
        <button type="button" className="nf-btn nf-btn--ghost" onClick={onSettings}><IconSettings /> Settings</button>
      </div>
    </div>
  );
}
