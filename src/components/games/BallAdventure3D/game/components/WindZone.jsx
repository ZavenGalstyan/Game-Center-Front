import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * Visual-only indicator for a wind force zone (the actual push is applied
 * directly in BallController by checking the ball's position against
 * `level.windZones` — no physics body here, so it can never "move" like a
 * platform). A few drifting streak sprites show the push direction so the
 * force is never invisible/unfair.
 */
export default function WindZone({ min, max, force }) {
  const streaksRef = useRef(null);
  const center = useMemo(() => [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], [min, max]);
  const size = useMemo(() => [max[0] - min[0], max[1] - min[1], max[2] - min[2]], [min, max]);
  const dir = useMemo(() => {
    const len = Math.hypot(force[0], force[1]) || 1;
    return [force[0] / len, force[1] / len];
  }, [force]);
  const angle = Math.atan2(dir[0], dir[1]);

  const streaks = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 6; i++) {
      arr.push({
        ox: (Math.random() - 0.5) * size[0] * 0.6,
        oy: (Math.random() - 0.5) * size[1] * 0.7,
        oz: (Math.random() - 0.5) * size[2] * 0.6,
        t: Math.random(),
      });
    }
    return arr;
  }, [size]);

  useFrame((_, dt) => {
    const group = streaksRef.current;
    if (!group) return;
    group.children.forEach((child, i) => {
      const s = streaks[i];
      s.t += dt * 0.6;
      if (s.t > 1) s.t -= 1;
      child.position.set(
        -dir[0] * (size[0] / 2) + dir[0] * size[0] * s.t + s.ox,
        s.oy,
        -dir[1] * (size[2] / 2) + dir[1] * size[2] * s.t + s.oz,
      );
      child.material.opacity = Math.sin(s.t * Math.PI) * 0.5;
    });
  });

  return (
    <group position={center}>
      <mesh>
        <boxGeometry args={size} />
        <meshBasicMaterial color="#cfeeff" transparent opacity={0.05} depthWrite={false} />
      </mesh>
      <group ref={streaksRef}>
        {streaks.map((s, i) => (
          <mesh key={i} rotation={[0, angle, 0]}>
            <boxGeometry args={[0.08, 0.08, 1.4]} />
            <meshBasicMaterial color="#eaf6ff" transparent opacity={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
