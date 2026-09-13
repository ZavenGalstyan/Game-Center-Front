/**
 * Stonewild — World Select. Lists every saved world (localStorage metadata
 * only — see utils/storage.js) with Play/Rename/Delete, and a way to start a
 * new one. Dark stone/glass panel, not a corporate table.
 */

import { useState } from "react";

function formatWhen(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatPlayTime(sec) {
  const total = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "< 1m";
}

const DIFFICULTY_LABEL = { peaceful: "Peaceful", survival: "Survival", hard: "Hard" };

export default function WorldSelect({ worlds, onPlay, onDelete, onRename, onCreate, onBack }) {
  const [confirmId, setConfirmId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [draftName, setDraftName] = useState("");

  return (
    <div className="sw-screen sw-panelscreen">
      <div className="sw-panel">
        <div className="sw-panel__header">
          <h2 className="sw-panel__title">Your Worlds</h2>
          <button type="button" className="sw-btn" onClick={onBack}>Back</button>
        </div>

        {worlds.length === 0 ? (
          <div className="sw-empty">
            <p>No worlds yet. Create one to start exploring Stonewild.</p>
          </div>
        ) : (
          <ul className="sw-worldlist">
            {worlds.map((w) => (
              <li key={w.id} className="sw-worldrow">
                <div className="sw-worldrow__info">
                  {renamingId === w.id ? (
                    <input
                      className="sw-input sw-worldrow__nameinput"
                      value={draftName}
                      autoFocus
                      maxLength={40}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onRename(w.id, draftName);
                          setRenamingId(null);
                        } else if (e.key === "Escape") {
                          setRenamingId(null);
                        }
                      }}
                      onBlur={() => {
                        onRename(w.id, draftName);
                        setRenamingId(null);
                      }}
                    />
                  ) : (
                    <span className="sw-worldrow__name">{w.name}</span>
                  )}
                  <span className="sw-worldrow__meta">
                    Seed {w.seed} &middot; {DIFFICULTY_LABEL[w.difficulty]} &middot; Last played {formatWhen(w.lastPlayedAt)} &middot; {formatPlayTime(w.playTimeSec)} played
                  </span>
                </div>
                <div className="sw-worldrow__actions">
                  <button type="button" className="sw-btn sw-btn--primary" onClick={() => onPlay(w.id)}>Play</button>
                  <button
                    type="button"
                    className="sw-btn sw-btn--sm"
                    onClick={() => {
                      setDraftName(w.name);
                      setRenamingId(w.id);
                    }}
                  >
                    Rename
                  </button>
                  {confirmId === w.id ? (
                    <>
                      <button type="button" className="sw-btn sw-btn--sm sw-btn--danger" onClick={() => onDelete(w.id)}>
                        Confirm Delete
                      </button>
                      <button type="button" className="sw-btn sw-btn--sm" onClick={() => setConfirmId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="sw-btn sw-btn--sm sw-btn--danger" onClick={() => setConfirmId(w.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className="sw-btn sw-btn--primary sw-btn--lg sw-panel__cta" onClick={onCreate}>
          + Create New World
        </button>
      </div>
    </div>
  );
}
