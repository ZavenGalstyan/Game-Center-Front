/**
 * Parking Master — the player's car in the scene.
 *
 * Pure view. It renders the shared shell plus four wheels and writes every ref
 * it creates into the `api` object handed down by <ParkingScene>, which owns
 * the frame loop and drives position, wheel spin, steering and the light
 * materials from the physics state. Nothing here re-renders per frame.
 */

import { useMemo } from "react";
import { CarShell, Wheel, wheelPositions } from "./carParts.jsx";

export default function PlayerCar({ api, color = "#e9edf2", bodyType = "compact", headlights = false }) {
  const wp = useMemo(() => wheelPositions(bodyType), [bodyType]);

  return (
    <group ref={(g) => (api.group = g)}>
      <CarShell
        color={color}
        bodyType={bodyType}
        onLights={(l) => (api.lights = l)}
        headlightCones={headlights}
      />

      {/* front wheels: outer group steers (Y), inner group spins (X) */}
      <group position={wp.fl} ref={(g) => (api.steer[0] = g)}>
        <group ref={(g) => (api.spin[0] = g)}>
          <Wheel r={wp.r} />
        </group>
      </group>
      <group position={wp.fr} ref={(g) => (api.steer[1] = g)}>
        <group ref={(g) => (api.spin[1] = g)}>
          <Wheel r={wp.r} />
        </group>
      </group>

      {/* rear wheels: spin only */}
      <group position={wp.rl}>
        <group ref={(g) => (api.spin[2] = g)}>
          <Wheel r={wp.r} />
        </group>
      </group>
      <group position={wp.rr}>
        <group ref={(g) => (api.spin[3] = g)}>
          <Wheel r={wp.r} />
        </group>
      </group>

      {/* soft contact shadow so the car reads as grounded even on low graphics */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[2.6, 5.2]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}
