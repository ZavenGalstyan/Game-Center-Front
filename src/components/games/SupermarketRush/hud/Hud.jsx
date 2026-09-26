/**
 * Supermarket Rush — the minimal gameplay HUD. Per the design brief: the
 * 3D store dominates the screen, so this is compact task progress top-left,
 * money top-right, a crosshair, a context prompt, and a restock/spill
 * progress sliver — never a panel covering the store. The full task list
 * only appears on Tab (see TaskListOverlay).
 */
import { useSyncExternalStore } from "react";
import { tasksSummary } from "../engine/tasks.js";
import TaskListOverlay from "./TaskListOverlay.jsx";
import HelpPromptPanel from "./HelpPromptPanel.jsx";
import CheckoutPanel from "./CheckoutPanel.jsx";

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Hud({ store, wallet, levelName, locked, tasksOpen, showClickToPlay }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const summary = tasksSummary(state.tasks);
  const progress = state.restockProgress || state.spillProgress;

  return (
    <div className="sr-hud">
      <div className="sr-hud__top-left">
        <div className="sr-hud__shift">{levelName}</div>
        <div className="sr-hud__tasks-compact">
          Tasks {summary.done}/{summary.total} · {formatTime(state.elapsedSec)}
        </div>
      </div>

      <div className="sr-hud__top-right">${wallet}</div>

      {locked && !state.finished && <div className="sr-hud__crosshair" aria-hidden="true" />}

      {state.interactPrompt && !state.helpPrompt && (
        <div className="sr-hud__prompt">{state.interactPrompt}</div>
      )}

      {progress && (
        <div className="sr-hud__progress">
          <div className="sr-hud__progress-fill" style={{ width: `${Math.min(100, progress.pct * 100)}%` }} />
        </div>
      )}

      <div className="sr-hud__toasts">
        {state.toast && <div className="sr-hud__toast">{state.toast.text}</div>}
      </div>

      {tasksOpen && <TaskListOverlay tasks={state.tasks} />}
      {state.helpPrompt && <HelpPromptPanel prompt={state.helpPrompt} />}
      {state.checkout && <CheckoutPanel checkout={state.checkout} />}

      {showClickToPlay && !state.finished && (
        <div className="sr-hud__click-overlay">
          <div className="sr-hud__click-card">
            <strong>Click to play</strong>
            <span>WASD move · Mouse look · E interact · Shift sprint</span>
          </div>
        </div>
      )}
    </div>
  );
}
