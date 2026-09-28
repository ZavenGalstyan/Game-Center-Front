/**
 * Street Basketball — main menu. The background is the REAL engine running a
 * free-shoot session on the Neighborhood Court with a scripted "showcase"
 * controller (dribble, hand switch, crossover, the odd jumper) — so the menu
 * shows the game itself, not a video or a mock-up.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createGame, setController } from "../engine/match.js";
import { courtById } from "../data/courts.js";
import World from "../three/World.jsx";
import Hoop from "../three/Hoop.jsx";
import { Simulation, Ball, Athlete } from "../three/SceneParts.jsx";
import { sound } from "../audio/sound.js";

function showcaseController(home) {
  let t = 0;
  let shootAt = 6.5;
  let pressed = false;
  return {
    intent(g, a, dt) {
      t += dt;
      const ev = [];
      let mx = 0;
      let mz = 0;
      const withBall = g.owner === "p";
      // drift home when away
      const dx = home.x - a.x;
      const dz = home.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.4) {
        mx = (dx / d) * Math.min(1, d) * 0.55;
        mz = (dz / d) * Math.min(1, d) * 0.55;
      } else {
        mx = Math.sin(t * 0.9) * 0.28;
      }
      if (withBall && !a.act) {
        const c = t % 3.1;
        if (c < dt * 1.01) ev.push("cross");
        if (!pressed && t > shootAt && d < 0.8) {
          pressed = true;
          ev.push("shootDown");
        }
      }
      if (pressed && a.act && a.act.kind === "shoot" && a.act.t > 0.56) {
        ev.push("shootUp");
        pressed = false;
        shootAt = t + 9 + Math.sin(t) * 2;
      }
      if (pressed && !a.act && g.owner !== "p") pressed = false;
      return { mx, mz, sprint: false, events: ev };
    },
  };
}

function MenuCamera({ game }) {
  const { camera, size } = useThree();
  const s = useRef({ x: 0 });
  useFrame((_, dt) => {
    const g = game.current;
    const narrow = size.width / Math.max(1, size.height) < 1.5;
    const px = g ? g.P.x : 2;
    s.current.x += (px - s.current.x) * Math.min(1, dt * 1.5);
    camera.position.set(s.current.x - 3.3, narrow ? 2.4 : 2.05, 12.6 + (narrow ? 1.5 : 0));
    camera.lookAt(s.current.x - 1.0, 2.0, 3.2);
  });
  return null;
}

function Showcase({ quality, look, ballSkin }) {
  const court = courtById("neighborhood");
  const game = useRef(null);
  if (!game.current) {
    const g = createGame({ mode: "free", seed: 11, player: { ratings: { shooting: 8, finishing: 6, speed: 5, defense: 5, stamina: 9 }, look } });
    g.P.x = 1.8;
    g.P.z = 6.6;
    setController(g, "p", showcaseController({ x: 1.8, z: 6.6 }));
    game.current = g;
  }
  const noop = useRef(null);
  const paused = useRef(false);
  const excitement = useRef(0);
  useEffect(() => {
    const onVis = () => {
      paused.current = document.visibilityState !== "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return (
    <>
      <Simulation game={game} onEvents={noop} paused={paused} />
      <World court={court} quality={quality === "high" ? "medium" : quality} shadows={false} excitement={excitement} />
      <Hoop game={game} accent={court.accent} />
      <Athlete game={game} id="p" look={look} shadows={false} />
      <Ball game={game} skin={ballSkin} />
      <MenuCamera game={game} />
    </>
  );
}

export default function MainMenu({ settings, look, ballSkin, progress, muted, onNav }) {
  const dpr = settings.graphics === "low" ? [0.75, 1] : [1, 1.5];
  useEffect(() => {
    sound.setEnabled(settings.sound && !muted);
    sound.setMusic(settings.music && !muted, "menu");
  }, [settings.sound, settings.music, muted]);
  const courts = progress.unlockedCourts.length;
  const next = progress.careerStage;
  const items = useMemo(() => [
    ["career", "CAREER", progress.champion ? "King of the Street" : `Opponent ${Math.min(next + 1, 25)} / 25`],
    ["quick", "QUICK MATCH", progress.defeated.length ? `${progress.defeated.length} rivals to replay` : "Beat a rival to unlock"],
    ["training", "TRAINING", "Free Shoot · 3PT · Dunks · Dribble · D"],
    ["player", "PLAYER", `${progress.skillPoints} skill point${progress.skillPoints === 1 ? "" : "s"}`],
    ["collection", "COLLECTION", "Outfits · Balls · Dunks"],
    ["stats", "STATISTICS", `${progress.statistics.wins}W – ${progress.statistics.losses}L`],
    ["settings", "SETTINGS", ""],
  ], [progress, next]);
  return (
    <div className="sb-menu">
      <Canvas
        className="sb-canvas"
        dpr={dpr}
        gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance" }}
        camera={{ fov: 42, position: [-1.5, 2.05, 12.6] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <Showcase quality={settings.graphics} look={look} ballSkin={ballSkin} />
      </Canvas>
      <div className="sb-menu__shade" />
      <div className="sb-menu__panel">
        <div className="sb-logo">
          <span className="sb-logo__street">STREET</span>
          <span className="sb-logo__bb">BASKETBALL</span>
          <span className="sb-logo__tag">DRIBBLE • SHOOT • RULE THE COURT</span>
        </div>
        <nav className="sb-menu__nav">
          {items.map(([id, label, sub], i) => (
            <button
              type="button"
              key={id}
              className={`sb-menu__item${i === 0 ? " sb-menu__item--primary" : ""}`}
              disabled={id === "quick" && !progress.defeated.length}
              onClick={() => {
                sound.unlock();
                sound.ui();
                onNav(id);
              }}
            >
              <span className="sb-menu__label">{label}</span>
              {sub && <span className="sb-menu__sub">{sub}</span>}
            </button>
          ))}
        </nav>
      </div>
      <div className="sb-menu__foot">{courts}/5 courts unlocked</div>
    </div>
  );
}
