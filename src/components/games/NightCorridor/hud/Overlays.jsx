/**
 * Night Corridor — pause menu, caught screen, click-to-begin, section
 * intro card and the full-screen post layers (vignette, grain, chase pulse,
 * locker slats, fade to black). Post layers are plain DOM driven by refs
 * from the scene, so they cost nothing per frame in React.
 */
import { useEffect, useState } from "react";
import SettingsPanel from "../screens/SettingsPanel.jsx";
import ControlsList from "../screens/ControlsList.jsx";

export function PostLayers({ fxRef }) {
  return (
    <div className="nc-post" aria-hidden="true">
      <div className="nc-post__grain" />
      <div className="nc-post__vignette" ref={(el) => (fxRef.current.vignette = el)} />
      <div className="nc-post__pulse" ref={(el) => (fxRef.current.pulse = el)} />
      <div className="nc-post__slats" ref={(el) => (fxRef.current.slats = el)} />
      <div className="nc-post__flash" ref={(el) => (fxRef.current.flash = el)} />
      <div className="nc-post__black" ref={(el) => (fxRef.current.black = el)} />
    </div>
  );
}

export function ClickToBegin({ section, onBegin, touch }) {
  return (
    <button type="button" className="nc-begin" onClick={onBegin}>
      <div className="nc-begin__num">SECTION {String(section.id).padStart(2, "0")}</div>
      <div className="nc-begin__name">{section.name}</div>
      <div className="nc-begin__place">{section.place}</div>
      <div className="nc-begin__cta">{touch ? "Tap to begin" : "Click to begin"}</div>
      <div className="nc-begin__tip">Headphones recommended</div>
    </button>
  );
}

export function PauseMenu({ onResume, onCheckpoint, onRestart, onQuit, settings, onChangeSettings, muted }) {
  const [tab, setTab] = useState("main");
  return (
    <div className="nc-pause" role="dialog" aria-label="Paused">
      <div className="nc-pause__panel">
        <div className="nc-pause__title">PAUSED</div>
        {tab === "main" && (
          <div className="nc-pause__list">
            <button type="button" className="nc-menu-btn nc-menu-btn--primary" onClick={onResume}>Resume</button>
            <button type="button" className="nc-menu-btn" onClick={onCheckpoint}>Restart from Checkpoint</button>
            <button type="button" className="nc-menu-btn" onClick={onRestart}>Restart Section</button>
            <button type="button" className="nc-menu-btn" onClick={() => setTab("settings")}>Settings</button>
            <button type="button" className="nc-menu-btn" onClick={() => setTab("controls")}>Controls</button>
            <button type="button" className="nc-menu-btn nc-menu-btn--dim" onClick={onQuit}>Quit to Menu</button>
          </div>
        )}
        {tab === "settings" && (
          <div className="nc-pause__sub">
            <SettingsPanel settings={settings} onChange={onChangeSettings} muted={muted} compact />
            <button type="button" className="nc-menu-btn" onClick={() => setTab("main")}>Back</button>
          </div>
        )}
        {tab === "controls" && (
          <div className="nc-pause__sub">
            <ControlsList />
            <button type="button" className="nc-menu-btn" onClick={() => setTab("main")}>Back</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CaughtScreen({ onRetry, onQuit, deaths }) {
  // Let the jumpscare and the cut to black land first.
  const [shown, setShown] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setShown(true), 1150);
    const b = setTimeout(() => setReady(true), 1900);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  useEffect(() => {
    if (!ready) return undefined;
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "")) return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "KeyE") {
        e.preventDefault();
        onRetry();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, onRetry]);
  if (!shown) return null;
  return (
    <div className="nc-caught" role="dialog" aria-label="Caught">
      <div className="nc-caught__word">CAUGHT</div>
      {ready && (
        <div className="nc-caught__actions">
          <button type="button" className="nc-menu-btn nc-menu-btn--primary" onClick={onRetry} autoFocus>
            Retry from Checkpoint
          </button>
          <button type="button" className="nc-menu-btn nc-menu-btn--dim" onClick={onQuit}>
            Quit to Menu
          </button>
          <div className="nc-caught__meta">{deaths > 1 ? `Caught ${deaths} times this section` : "Press E or Space to retry"}</div>
        </div>
      )}
    </div>
  );
}
