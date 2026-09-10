/**
 * Cake Designer — Free Design mode.
 *
 * The shared editor with no order, plus a presentation view after Finish:
 * editor UI hides, the cake is centred on a soft backdrop with a slow turn.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import CakeEditor from "./CakeEditor.jsx";
import CakePreview from "../components/CakePreview.jsx";
import BakeryBackdrop from "../components/BakeryBackdrop.jsx";
import { emptyCake } from "../editor/cakeState.js";
import { COLLECTIONS } from "../data/collections.js";

export default function FreeDesign({ state, settings, onExit, onSave }) {
  const [phase, setPhase] = useState("edit");
  const [cake, setCake] = useState(() => state.freeDesign || emptyCake());
  const [nonce, setNonce] = useState(0);
  const theme = COLLECTIONS[0].theme;
  const rot = useSlowTurn(phase === "present" && settings.animations);

  const finish = (finalCake, placed) => {
    setCake(finalCake);
    onSave?.(finalCake, placed);
    setPhase("present");
  };

  if (phase === "present") {
    return (
      <div className="cd-present" style={{ "--cd-accent": theme.accent }}>
        <BakeryBackdrop theme={theme} quality={settings.graphics} />
        <div className="cd-present__cake">
          <CakePreview cake={{ ...cake, rotation: rot }} quality={settings.graphics} animate={settings.animations} />
        </div>
        <div className="cd-present__bar">
          <span className="cd-present__title">My Cake</span>
          <div className="cd-present__actions">
            <button className="cd-btn cd-btn--primary" onClick={() => { setNonce((n) => n + 1); setPhase("edit"); }}>Edit</button>
            <button className="cd-btn" onClick={() => { setCake(emptyCake()); setNonce((n) => n + 1); setPhase("edit"); }}>New Cake</button>
            <button className="cd-btn" onClick={() => saveImage(cake, settings)}>Save Image</button>
            <button className="cd-btn cd-btn--ghost" onClick={onExit}>Main Menu</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CakeEditor
      mode="free"
      initialCake={cake}
      attemptNonce={nonce}
      state={state}
      settings={settings}
      theme={theme}
      onFinish={finish}
      onExit={onExit}
    />
  );
}

function useSlowTurn(on) {
  const [rot, setRot] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!on) { setRot(0); return; }
    let start;
    const loop = (t) => {
      if (!start) start = t;
      setRot(Math.sin((t - start) / 3200) * 0.6);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [on]);
  return rot;
}

/** best-effort PNG export of the presented cake */
async function saveImage(cake, settings) {
  try {
    const host = document.querySelector(".cd-present__cake .cd-cake");
    if (!host) return;
    const clone = host.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const xml = new XMLSerializer().serializeToString(clone);
    const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = svg64; });
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1080;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f3 e9 dc".replace(/\s/g, "");
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "my-cake.png";
    a.click();
  } catch {
    /* export not supported in this browser — no-op */
  }
}
