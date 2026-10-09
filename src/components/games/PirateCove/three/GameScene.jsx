/**
 * Pirate Cove — the gameplay scene. Owns no game state: it steps the engine
 * (fixed 60 Hz, inside useFrame at negative priority so R3F's auto-render
 * stays on), drains its events into effects / audio / HUD callbacks, and
 * draws what the engine says exists:
 *
 *   outdoors   sky, ocean, islands (props + vegetation only when near),
 *              rocks, wrecks, markers, floats, ships + wakes, pirate + foes
 *              of the island you're on, interactables, weather, gulls
 *   cave       only that cave (its own dark lighting, torches, foes, items)
 * Only one controller is ever drawn: the pirate exists only while ashore.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MODE } from "../engine/constants.js";
import { createOceanGeometry, createOceanMaterial, bakeDepthTexture, applyWaterColors } from "./ocean.js";
import { SkyDome, Lighting } from "./Sky.jsx";
import ShipModel from "./ShipModel.jsx";
import { buildIslandGeometry } from "./islandGeo.js";
import Vegetation from "./Vegetation.jsx";
import { PropMesh, propEmitters, LightPool } from "./Props.jsx";
import { Character } from "./Characters.jsx";
import Interactables from "./Interactables.jsx";
import { createFX, Effects, Wake } from "./Effects.jsx";
import { SeaRocks, Wrecks, Markers, Floats, Gulls } from "./SeaObjects.jsx";
import Cave from "./Cave.jsx";
import { Rain, Lightning } from "./Weather.jsx";
import CameraRig from "./CameraRig.jsx";
import { detailNoise } from "./textures.js";
import { forwardOf } from "../engine/ship.js";
import { TEST } from "../utils/testHooks.js";

function Ocean({ game, quality }) {
  const ref = useRef();
  const { geo, mat, depth } = useMemo(() => {
    const extent = game.world.radius + 260;
    const depth = bakeDepthTexture(game.T, extent, quality === "low" ? 384 : 640);
    const N = quality === "low" ? 120 : quality === "high" ? 240 : 180;
    const geo = createOceanGeometry(N);
    const mat = createOceanMaterial(depth);
    applyWaterColors(mat, game.atmos);
    mat.uniforms.uDetail.value = quality === "low" ? 0.4 : quality === "high" ? 1.15 : 0.85;
    return { geo, mat, depth };
  }, [game, quality]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
      depth.dispose();
    },
    [geo, mat, depth],
  );
  useFrame(({ camera }) => {
    if (!ref.current) return;
    const s = geo.userData.snap;
    ref.current.position.set(Math.round(camera.position.x / s) * s, 0, Math.round(camera.position.z / s) * s);
    mat.uniforms.uTime.value = game.time;
    mat.uniforms.uAmp.value = game.waveAmp;
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} receiveShadow={false} renderOrder={0} />;
}

function IslandView({ isl, near, shadows, terrainMat }) {
  const geo = useMemo(() => buildIslandGeometry(isl), [isl]);
  useEffect(() => () => geo.dispose(), [geo]);
  const dock = isl.dock;
  return (
    <group>
      <mesh geometry={geo} material={terrainMat} receiveShadow castShadow={false} />
      <Dock dock={dock} />
      {near && (
        <>
          {isl.props.map((p) => (
            <PropMesh key={p.key} p={p} />
          ))}
          <Vegetation isl={isl} shadows={shadows} />
        </>
      )}
    </group>
  );
}

function Dock({ dock }) {
  const len = Math.hypot(dock.end.x - dock.land.x, dock.end.z - dock.land.z);
  const rot = Math.atan2(dock.dir.x, dock.dir.z);
  const cx = (dock.land.x + dock.end.x) / 2;
  const cz = (dock.land.z + dock.end.z) / 2;
  const posts = [];
  for (let d = 2; d < len; d += 4) for (const s of [-1.5, 1.5]) posts.push([s, d - len / 2]);
  return (
    <group position={[cx, 0, cz]} rotation={[0, rot, 0]}>
      <mesh position={[0, dock.deckY - 0.12, 0]} receiveShadow castShadow>
        <boxGeometry args={[3.2, 0.24, len]} />
        <meshStandardMaterial color="#a07a52" roughness={0.9} />
      </mesh>
      {Array.from({ length: Math.floor(len / 0.9) }).map((_, i) => (
        <mesh key={i} position={[0, dock.deckY + 0.005, -len / 2 + 0.45 + i * 0.9]}>
          <boxGeometry args={[3.22, 0.012, 0.06]} />
          <meshStandardMaterial color="#5a4028" />
        </mesh>
      ))}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, dock.deckY - 2, z]} castShadow>
          <cylinderGeometry args={[0.16, 0.18, 4.6, 7]} />
          <meshStandardMaterial color="#5a4028" roughness={0.9} />
        </mesh>
      ))}
      {[-1.55, 1.55].map((x) => (
        <mesh key={x} position={[x, dock.deckY + 0.55, 0]}>
          <boxGeometry args={[0.08, 0.08, len]} />
          <meshStandardMaterial color="#6b4a30" />
        </mesh>
      ))}
      <mesh position={[1.55, dock.deckY + 0.6, len / 2 - 0.5]}>
        <cylinderGeometry args={[0.2, 0.22, 1.2, 8]} />
        <meshStandardMaterial color="#4a3020" />
      </mesh>
    </group>
  );
}

function Gangplank({ game }) {
  const ref = useRef();
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const P = game.player;
    const isl = game.dockedAt;
    const show = P.docked && isl && game.mode !== MODE.DOCKING;
    g.visible = !!show;
    if (!show) return;
    const b = isl.dock.board;
    const sx = P.x;
    const sz = P.z;
    const dx = sx - b.x;
    const dz = sz - b.z;
    const d = Math.hypot(dx, dz);
    g.position.set((b.x + sx) / 2, isl.dock.deckY + 0.25, (b.z + sz) / 2);
    g.rotation.set(0, Math.atan2(dx, dz), 0);
    g.scale.set(1, 1, Math.max(0.1, d - P.stats.beam * 0.3));
  });
  return (
    <mesh ref={ref} castShadow>
      <boxGeometry args={[0.9, 0.08, 1]} />
      <meshStandardMaterial color="#8a6440" roughness={0.9} />
    </mesh>
  );
}

const SURFACE_BY_BIOME = { tropic: "sand", reef: "sand", misty: "stone", storm: "stone", cursed: "stone" };

export default function GameScene({ game, input, audio, settings, paused, onEvents, focusRef }) {
  const { camera, scene, gl } = useThree();
  const [near, setNear] = useState(() => new Set());
  const [version, setVersion] = useState(0);
  const [area, setArea] = useState(game.area);
  const [islandId, setIslandId] = useState(game.island?.id || null);
  const flash = useRef(0);
  const shadows = settings.graphics === "low" ? "off" : settings.shadows;
  const fx = useMemo(() => {
    const f = createFX(settings.particles);
    // smoke and spray are unlit sprites: dim them to the scene's light (night, storm, mist)
    const a = game.atmos;
    const k = a.sun.moon ? 0.42 : a.rain ? 0.55 : a.id === "mist" ? 0.8 : a.id === "sunset" ? 0.9 : 1;
    const sun = new THREE.Color(a.hemi[0]).lerp(new THREE.Color("#ffffff"), 0.5);
    f.pools.smoke.mat.uniforms.uTint.value.copy(sun).multiplyScalar(k);
    f.pools.spray.mat.uniforms.uTint.value.copy(sun).multiplyScalar(Math.min(1, k + 0.15));
    return f;
  }, [settings.particles, game]);
  const terrainMat = useMemo(() => {
    const t = detailNoise();
    return new THREE.MeshStandardMaterial({ vertexColors: true, map: t, roughness: 0.96 });
  }, []);
  useEffect(() => () => terrainMat.dispose(), [terrainMat]);
  const emitters = useMemo(() => {
    const out = [];
    for (const isl of game.world.islands) out.push(...propEmitters(isl.props.map((p) => ({ ...p, cursed: isl.biome === "cursed" }))));
    for (const isl of game.world.islands) if (isl.cave) out.push(...propEmitters(isl.cave.props));
    return out;
  }, [game]);
  const nearAcc = useRef(0);
  const stepAcc = useRef(0);
  const smokeAcc = useRef(0);
  const footRef = useRef({ last: 0 });
  const atmos = game.atmos;
  const storm = atmos.rain ? 1 : 0;
  const style = game.region.id === 3 && game.adv.id === 14 ? "ghost" : game.region.id === 4 ? "beacon" : game.region.id === 5 ? "wreck" : "buoy";

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    if (!paused) {
      input.mode = game.mode === MODE.ISLAND ? "foot" : "sea";
      game.update(dt, input);
    }
    fx.env.time = game.time;
    fx.env.waveAmp = game.waveAmp;
    const events = game.drainEvents();
    if (events.length) handleEvents(events);
    if (game.area !== area) setArea(game.area);
    const iid = game.island?.id || null;
    if (iid !== islandId) setIslandId(iid);

    // which islands get props/vegetation
    nearAcc.current -= dt;
    if (nearAcc.current <= 0) {
      nearAcc.current = 0.5;
      // the player, not the camera: the camera may still be catching up after a dock/fade
      const cx = game.pirate ? game.pirate.x : game.player.x;
      const cz = game.pirate ? game.pirate.z : game.player.z;
      const n = new Set();
      for (const isl of game.world.islands) {
        const d = Math.hypot(isl.I.x - cx, isl.I.z - cz) - isl.I.maxR;
        if (d < (settings.graphics === "low" ? 220 : 380)) n.add(isl.id);
      }
      let same = n.size === near.size;
      if (same) for (const k of n) if (!near.has(k)) same = false;
      if (!same) setNear(n);
    }

    // ship damage smoke + fire
    smokeAcc.current += dt;
    if (smokeAcc.current > 0.12) {
      smokeAcc.current = 0;
      for (const s of game.ships) {
        if (s.removed) continue;
        s._game = game;
        s._targeted = game.targets.left?.ship === s || game.targets.right?.ship === s;
        const k = s.hull / s.maxHull;
        if (k < 0.55 || !s.alive) {
          const f = forwardOf(s.heading);
          const off = ((s.spawnIndex % 3) - 1) * s.stats.length * 0.2;
          if (!s.alive && s.sinkT > 9) continue;
          fx.damageSmoke(s.x + f.x * off, s.y + s.stats.deckY + 0.6, s.z + f.z * off, k < 0.3 || !s.alive, k < 0.3 || !s.alive);
        }
      }
    }

    // footsteps + dig dust
    const p = game.pirate;
    if (p && !paused) {
      const step = Math.floor(p.moveAnim / (p.speed > 5 ? 1.25 : 0.95));
      if (step !== footRef.current.last) {
        footRef.current.last = step;
        if (p.grounded && p.speed > 0.6) {
          const onDeck = game.area === "out" && game.land && p.y > 0.7 && game.T.height(p.x, p.z) < p.y - 0.3;
          const surface = game.area !== "out" ? "cave" : onDeck ? "wood" : SURFACE_BY_BIOME[game.island?.biome] || "sand";
          audio?.step(surface, p.speed > 5 ? 1.2 : 0.8);
          if (p.speed > 5 && surface === "sand") fx.dust(p.x, p.y, p.z, "#e0cfa0", 2);
        }
      }
      if (p.state === "dig") {
        stepAcc.current += dt;
        if (stepAcc.current > 0.28) {
          stepAcc.current = 0;
          fx.dust(p.x + Math.sin(p.yaw) * 0.9, p.y, p.z + Math.cos(p.yaw) * 0.9, "#e2cf9c", 6);
          audio?.dig();
        }
      }
    }

    // audio world state
    if (audio) {
      const L = camera.position;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      let shore = 999;
      const fx0 = p ? p.x : game.player.x;
      const fz0 = p ? p.z : game.player.z;
      for (const isl of game.world.islands) shore = Math.min(shore, Math.max(0, Math.hypot(isl.I.x - fx0, isl.I.z - fz0) - isl.I.radius));
      const fighting = game.foes.some((f) => f.alive && (f.state === "CHASE" || f.state === "ATTACK") && f.island === game.island?.id);
      audio.update(dt, {
        listener: { x: L.x, y: L.y, z: L.z, yaw: Math.atan2(dir.x, dir.z) },
        mode: game.mode,
        speed: Math.abs(game.player.speed),
        sailing: game.mode === MODE.SAILING,
        shore,
        storm,
        rain: atmos.rain || 0,
        cave: game.area !== "out",
        onFoot: !!p,
        battle: game.mode === MODE.SAILING && game.inBattle(),
        fight: fighting,
        final: game.region.id === 5,
        night: !!atmos.sun.moon,
      });
    }
  }, -1);

  function handleEvents(events) {
    const hud = [];
    let bump = false;
    for (const e of events) {
      switch (e.type) {
        case "muzzle":
          fx.muzzle(e.x, e.y, e.z, e.dx, e.dz, e.big);
          audio?.cannon(e.x, e.z, e.big, e.ship === game.player);
          break;
        case "hit":
          fx.hit(e.x, e.y, e.z, e.vx, e.vz);
          audio?.woodHit(e.x, e.z, e.big);
          if (e.ship === game.player) hud.push({ type: "playerHit" });
          else if (e.by === game.player) hud.push({ type: "hitMarker" });
          break;
        case "splash":
          fx.splash(e.x, e.y, e.z, e.big);
          audio?.splash(e.x, e.z, e.big);
          break;
        case "landHit":
          fx.landHit(e.x, e.y, e.z);
          audio?.thud(e.x, e.z);
          break;
        case "sunk":
          fx.sinkBurst(e.ship.x, e.ship.y, e.ship.z);
          audio?.sink(e.ship.x, e.ship.z);
          hud.push(e);
          bump = true;
          break;
        case "scrape":
          fx.splash(e.x, 0, e.z, false);
          audio?.scrape(e.x, e.z, Math.min(1, e.speed / 6));
          if (e.player) hud.push({ type: "playerHit" });
          break;
        case "ram":
          audio?.woodHit(e.x, e.z, true);
          fx.hit(e.x, 1, e.z);
          break;
        case "enemyNotice":
          audio?.horn();
          hud.push(e);
          break;
        case "floatCollected":
          fx.sparkle(e.float.x, (e.float.y || 0) + 0.6, e.float.z, e.float.kind === "map" ? "#9fffd8" : "#ffe08a", 18);
          audio?.pickup();
          if (e.float.kind === "gold" || e.float.kind === "crate") audio?.coins();
          hud.push(e);
          break;
        case "marker":
          audio?.objective();
          break;
        case "docking":
          audio?.dock();
          break;
        case "swing":
          audio?.swing(e.combo);
          break;
        case "foeHit":
          fx.sparks(e.x, e.y, e.z, e.foe.type === "skeleton" || e.foe.type === "guardian" ? "#e8e2d0" : "#ffd27a", e.heavy ? 16 : 9);
          audio?.slash(e.x, e.z, e.heavy);
          if (e.foe.type === "skeleton" || e.foe.type === "guardian") audio?.bones(e.x, e.z);
          hud.push({ type: "hitMarker" });
          break;
        case "foeDefeated":
          if (e.foe.type === "skeleton" || e.foe.type === "guardian") {
            fx.boneDust(e.x, e.foe.y, e.z, e.foe.type === "guardian" ? "#9fffd0" : "#d8d2c0");
            audio?.bones(e.x, e.z);
          } else fx.dust(e.x, e.foe.y, e.z, "#c9b48a", 10);
          bump = true;
          break;
        case "foeWindup":
          audio?.grunt(e.foe.x, e.foe.z);
          break;
        case "foeNotice":
          hud.push(e);
          break;
        case "pirateHurt":
          audio?.hurt();
          hud.push({ type: "playerHit" });
          break;
        case "blocked":
          audio?.clang(e.x, e.z);
          fx.sparks(e.x, (game.pirate?.y || 0) + 1.3, e.z, "#fff2c0", 12);
          break;
        case "jump":
          audio?.step("sand", 0.6);
          break;
        case "land":
          audio?.step("sand", e.hard ? 1.4 : 0.9);
          if (game.pirate) fx.dust(game.pirate.x, game.pirate.y, game.pirate.z, "#e0cfa0", 4);
          break;
        case "dug":
          fx.dust(e.x, game.pirate?.y || 0, e.z, "#e2cf9c", 16);
          break;
        case "chestOpen":
          fx.chestBurst(e.x, e.y, e.z);
          audio?.chest();
          hud.push(e);
          break;
        case "pickup":
          fx.sparkle(e.item.x, e.item.y + 0.6, e.item.z, "#ffe08a", 14);
          audio?.pickup();
          if (e.item.item === "coins" || e.item.item === "gold") audio?.coins();
          hud.push(e);
          bump = true;
          break;
        case "lever":
          audio?.lever();
          break;
        case "gateOpen":
          audio?.rumble();
          break;
        case "locked":
          audio?.locked();
          break;
        case "landed":
        case "boarded":
          nearAcc.current = 0; // re-pick nearby islands right away
          hud.push(e);
          break;
        case "worldReset":
          nearAcc.current = 0;
          fx.reset();
          bump = true;
          hud.push(e);
          break;
        case "spawn":
        case "drop":
        case "foeSpawn":
          bump = true;
          if (e.type === "spawn") hud.push(e);
          break;
        case "stepDone":
          audio?.objective();
          hud.push(e);
          break;
        case "complete":
          audio?.victory();
          hud.push(e);
          break;
        default:
          hud.push(e);
      }
    }
    if (bump) setVersion((v) => v + 1);
    if (hud.length) onEvents?.(hud);
  }

  const inCave = area !== "out";
  const curIsland = islandId ? game.world.byId.get(islandId) : null;
  const pirate = game.pirate;
  const islandFoes = curIsland ? game.foes.filter((f) => f.island === curIsland.id && f.area === area) : [];
  void version;

  useEffect(() => {
    if (TEST) window.__pc = { ...(window.__pc || {}), fx, camera, scene, gl };
  }, [fx, camera, scene, gl]);

  return (
    <>
      <CameraRig game={game} focus={focusRef} settings={settings} />
      <Lighting atmos={atmos} focus={focusRef} shadows={shadows} flashRef={flash} indoor={inCave} />
      <LightPool emitters={emitters} focus={focusRef} count={inCave ? 6 : 4} />
      <Effects fx={fx} />
      {inCave && curIsland?.cave ? (
        <group>
          <Cave isl={curIsland} />
          <Interactables game={game} islandId={curIsland.id} area={area} key={`ci${version}`} />
        </group>
      ) : (
        <group>
          <SkyDome atmos={atmos} flashRef={flash} />
          <Ocean game={game} quality={settings.water} />
          {game.world.islands.map((isl) => (
            <IslandView key={isl.id} isl={isl} near={near.has(isl.id)} shadows={shadows} terrainMat={terrainMat} />
          ))}
          <SeaRocks rocks={game.world.terrain.rocks} biome={game.world.islands[0]?.biome} />
          <Wrecks wrecks={game.world.terrain.wrecks} />
          <Markers game={game} style={style} />
          <Floats game={game} version={version} />
          {game.ships.map((s) => (
            <group key={s.id}>
              <ShipModel ship={s} healthBar={s.team === "enemy"} />
              <Wake ship={s} env={game} fx={fx} />
            </group>
          ))}
          <Gangplank game={game} />
          {curIsland && <Interactables game={game} islandId={curIsland.id} area="out" key={`oi${version}`} />}
          {!atmos.rain && !atmos.sun.moon && <Gulls focus={focusRef} dark={game.region.id === 5} />}
          {atmos.rain && settings.particles !== "off" && <Rain intensity={settings.particles === "low" ? 0.5 : 1} />}
          <Lightning flashRef={flash} enabled={!!atmos.lightning} reduced={settings.reducedMotion} onStrike={(d) => audio?.thunder(d)} />
        </group>
      )}
      {pirate && <Character key={`p${version}`} body={pirate} type="pirate" />}
      {islandFoes.map((f) => (
        <Character key={f.id} body={f} type={f.type} hpBar />
      ))}
    </>
  );
}
