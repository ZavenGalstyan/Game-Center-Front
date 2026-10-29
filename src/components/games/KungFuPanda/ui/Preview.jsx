/**
 * A small standalone Three.js stage showing one or more characters idling
 * (and showing off a move now and then). Used by the main menu and the
 * character select. Owns its renderer and disposes it on unmount.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCharacter, poseCharacter } from "../render/characters.js";
import { HEROES } from "../data/heroes.js";

const SHOW = ["punch", "kick", "special"];
const DUR = { punch: 0.5, kick: 0.6, special: 0.9 };

export function Preview({ ids, spread = 1.5, className = "", turn = true, camZ = 4.2, camY = 1.1 }) {
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
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#7a6a5a", 1.5));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.1);
    sun.position.set(2, 5, 4);
    scene.add(sun);
    const list = key.split(",");
    const rigs = list.map((id, i) => {
      const R = buildCharacter(id, i);
      R.root.position.x = (i - (list.length - 1) / 2) * spread;
      R.root.rotation.y = list.length > 1 ? 0 : 0.5;
      scene.add(R.root);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.82, 0.12, 32), new THREE.MeshLambertMaterial({ color: "#8a3a24" }));
      disc.position.set(R.root.position.x, -0.06, 0);
      scene.add(disc);
      return { R, id, move: null, mt: 0, next: 1.5 + i * 0.7 };
    });
    const maxH = Math.max(...rigs.map((r) => r.R.H));
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    const fit = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      const span = Math.max(maxH * 1.45, ((list.length - 1) * spread + 1.7) / cam.aspect);
      cam.position.set(0, maxH * 0.55 + camY * 0.2, (span / 2 / Math.tan((16 * Math.PI) / 180)) * (camZ / 4.2));
      cam.lookAt(0, maxH * 0.44, 0);
      cam.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    let raf = 0, last = performance.now(), t = 0;
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      for (const r of rigs) {
        r.next -= dt;
        if (!r.move && r.next <= 0) {
          r.move = SHOW[Math.floor(Math.random() * SHOW.length)];
          r.mt = 0;
        }
        let st = { anim: "idle", p: 0 };
        if (r.move) {
          r.mt += dt;
          const p = r.mt / DUR[r.move];
          st = { anim: r.move, p, combo: 1, special: HEROES[r.id]?.special.id };
          if (p >= 1) {
            r.move = null;
            r.next = 2.5 + Math.random() * 2.5;
          }
        }
        poseCharacter(r.R, { ...st, t, speed: 0, grounded: true }, dt);
        if (turn && list.length === 1) r.R.root.rotation.y = 0.45 + Math.sin(t * 0.5) * 0.35;
      }
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [key, spread, turn, camZ, camY]);
  return <div ref={ref} className={`kfp-preview ${className}`} />;
}
