/**
 * A small standalone Three.js stage showing one or more characters idling
 * (and showing off a move now and then). Used by the main menu, the
 * character select and the victory screen. Owns its renderer and disposes
 * it on unmount; pauses while the tab is hidden.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCharacter, poseCharacter } from "../render/characters.js";
import { TURTLES } from "../data/turtles.js";

const SHOW = ["light", "light2", "heavy", "special"];
const DUR = { light: 0.45, light2: 0.45, heavy: 0.7, special: 0.95 };

export function Preview({ ids, spread = 1.5, className = "", turn = true, pose = null }) {
  const ref = useRef(null);
  const key = ids.join(",");
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return undefined; // no WebGL: the card still shows text
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "tmnt-preview-canvas";
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#5a4a6a", 1.5));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.1);
    sun.position.set(2, 5, 4);
    scene.add(sun);
    const rim = new THREE.DirectionalLight("#8ab8ff", 1.2);
    rim.position.set(-3, 3, -4);
    scene.add(rim);
    const list = key.split(",");
    const rigs = list.map((id, i) => {
      const R = buildCharacter(id, i);
      R.root.position.x = (i - (list.length - 1) / 2) * spread;
      R.root.rotation.y = list.length > 1 ? (i - (list.length - 1) / 2) * -0.12 : 0.5;
      scene.add(R.root);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.1, 32), new THREE.MeshLambertMaterial({ color: "#2a3a2e" }));
      disc.position.set(R.root.position.x, -0.05, 0);
      scene.add(disc);
      return { R, id, move: null, mt: 0, next: 1.2 + i * 0.8 };
    });
    const maxH = Math.max(...rigs.map((r) => r.R.H));
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    const fit = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      const span = Math.max(maxH * 1.4, ((list.length - 1) * spread + 1.8) / cam.aspect);
      cam.position.set(0, maxH * 0.62, span / 2 / Math.tan((16 * Math.PI) / 180));
      cam.lookAt(0, maxH * 0.46, 0);
      cam.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    let raf = 0, last = performance.now(), t = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      for (const r of rigs) {
        const T = TURTLES[r.id];
        let st = { anim: pose || "idle", p: 0 };
        if (T && !pose) {
          r.next -= dt;
          if (!r.move && r.next <= 0) {
            r.move = SHOW[Math.floor(Math.random() * SHOW.length)];
            r.mt = 0;
          }
          if (r.move) {
            r.mt += dt;
            const p = r.mt / DUR[r.move];
            const anim = r.move === "light2" ? "light" : r.move;
            const combo = r.move === "light2" ? 2 : 1;
            st = { anim, p, combo, special: T.special.id, style: anim === "heavy" ? T.anims.heavy : T.anims.light[combo - 1] };
            if (p >= 1) {
              r.move = null;
              r.next = 2.5 + Math.random() * 2.5;
            }
          }
        }
        poseCharacter(r.R, { ...st, t, speed: 0, grounded: true }, dt);
        if (turn && list.length === 1) r.R.root.rotation.y = 0.45 + Math.sin(t * 0.5) * 0.4;
      }
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [key, spread, turn, pose]);
  return <div ref={ref} className={`tmnt-preview ${className}`} />;
}
