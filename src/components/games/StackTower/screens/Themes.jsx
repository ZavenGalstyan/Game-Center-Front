import { useEffect, useRef } from "react";
import { renderPreview } from "../render/preview.js";

function Preview({ theme }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    const draw = () => renderPreview(c, theme);
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [theme]);
  return <canvas ref={ref} className="st-theme__preview" aria-hidden="true" />;
}

/** Stack Tower — theme selector with live-rendered scene previews. */
export default function Themes({ themes, progress, onSelect, onBack }) {
  return (
    <div className="st-screen">
      <div className="st-panel st-sheet">
        <header className="st-sheet__head">
          <button type="button" className="st-iconbtn" onClick={onBack} aria-label="Back">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2>THEMES</h2>
          <span className="st-sheet__note">Unlock by tower height</span>
        </header>
        <div className="st-themes">
          {themes.map((t) => {
            const open = progress.unlockedThemes.includes(t.id);
            const sel = progress.selectedTheme === t.id;
            return (
              <button
                type="button"
                key={t.id}
                className={`st-theme${sel ? " is-selected" : ""}${open ? "" : " is-locked"}`}
                onClick={() => open && onSelect(t.id)}
                aria-pressed={sel}
                aria-disabled={!open}
              >
                <Preview theme={t} />
                <span className="st-theme__label">
                  <b>{t.name}</b>
                  <small>{sel ? "SELECTED" : open ? "SELECT" : `REACH ${t.unlock}`}</small>
                </span>
                {!open && (
                  <span className="st-theme__lock" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22">
                      <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor" />
                      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
