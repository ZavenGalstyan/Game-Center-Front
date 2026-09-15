/**
 * Cozy Cleanup — a single shared, DOM-based sparkle/particle layer.
 * Cheap on purpose: plain divs with a CSS fade/float animation, capped
 * concurrent count, self-removing on `animationend`. Used for dust motes
 * while cleaning, trash-bag puffs, snap sparkles and the room-complete
 * sweep — never hundreds of React components, just a handful of divs at a
 * time appended imperatively (no React state per particle).
 */
import { useCallback, useRef } from "react";

const MAX_PARTICLES = 18;

export function useParticleLayer() {
  const layerRef = useRef(null);
  const countRef = useRef(0);

  const spawn = useCallback((xPct, yPct, variant = "mote") => {
    const layer = layerRef.current;
    if (!layer || countRef.current >= MAX_PARTICLES) return;
    const el = document.createElement("span");
    el.className = `cc-particle cc-particle--${variant}`;
    el.style.left = `${xPct}%`;
    el.style.top = `${yPct}%`;
    if (variant === "sparkle") {
      const hue = 40 + Math.random() * 20;
      el.style.background = `hsl(${hue} 85% 78%)`;
    }
    const dx = (Math.random() - 0.5) * 26;
    el.style.setProperty("--cc-dx", `${dx}px`);
    layer.appendChild(el);
    countRef.current += 1;
    const cleanup = () => {
      el.remove();
      countRef.current = Math.max(0, countRef.current - 1);
    };
    el.addEventListener("animationend", cleanup, { once: true });
    setTimeout(cleanup, 1400);
  }, []);

  return { layerRef, spawn };
}

export function ParticleLayer({ layerRef }) {
  return <div className="cc-particle-layer" ref={layerRef} aria-hidden="true" />;
}
