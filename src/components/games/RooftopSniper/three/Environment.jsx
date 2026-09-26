/**
 * Rooftop Sniper — shared environment pieces used by both the gameplay
 * scene (three/RooftopScene.jsx) and the Main Menu's cinematic background
 * (screens/MainMenu.jsx): the gradient sky dome and the rooftop platform
 * itself (floor, parapet, AC unit, water tank, antenna).
 */
import { useMemo } from "react";
import * as THREE from "three";

export function RooftopPlatform() {
  return (
    <group>
      <mesh position={[0, -1.7, -4]} receiveShadow>
        <boxGeometry args={[14, 0.4, 14]} />
        <meshStandardMaterial color="#565a5e" roughness={0.95} />
      </mesh>
      {/* parapet wall facing the city */}
      <mesh position={[0, -1.05, -10.8]} castShadow receiveShadow>
        <boxGeometry args={[14, 1.1, 0.4]} />
        <meshStandardMaterial color="#4b4e52" roughness={0.9} />
      </mesh>
      <mesh position={[-6.8, -1.05, -5]} castShadow receiveShadow>
        <boxGeometry args={[0.4, 1.1, 12]} />
        <meshStandardMaterial color="#4b4e52" roughness={0.9} />
      </mesh>
      <mesh position={[6.8, -1.05, -5]} castShadow receiveShadow>
        <boxGeometry args={[0.4, 1.1, 12]} />
        <meshStandardMaterial color="#4b4e52" roughness={0.9} />
      </mesh>
      {/* AC unit + water tank for atmosphere */}
      <mesh position={[3.6, -1.35, -1]} castShadow>
        <boxGeometry args={[1.4, 0.9, 1.4]} />
        <meshStandardMaterial color="#7a7f84" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[-4.2, -0.4, -2.5]} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 1.8, 12]} />
        <meshStandardMaterial color="#5a4632" roughness={0.8} />
      </mesh>
      <mesh position={[-4.2, 0.7, -2.5]} castShadow>
        <coneGeometry args={[1.05, 0.5, 12]} />
        <meshStandardMaterial color="#3f3022" roughness={0.85} />
      </mesh>
      {/* antenna */}
      <mesh position={[5.6, 1.4, -6]} castShadow>
        <cylinderGeometry args={[0.03, 0.05, 4, 6]} />
        <meshStandardMaterial color="#2b2b2b" roughness={0.6} metalness={0.5} />
      </mesh>
    </group>
  );
}

export function SkyDome({ location }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          top: { value: new THREE.Color(location.sky[1]) },
          bottom: { value: new THREE.Color(location.sky[0]) },
        },
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vWorldPosition;
          uniform vec3 top;
          uniform vec3 bottom;
          void main() {
            float h = normalize(vWorldPosition).y * 0.5 + 0.5;
            gl_FragColor = vec4(mix(bottom, top, clamp(h, 0.0, 1.0)), 1.0);
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [location],
  );
  return (
    <mesh scale={300} material={material}>
      <sphereGeometry args={[1, 24, 16]} />
    </mesh>
  );
}
