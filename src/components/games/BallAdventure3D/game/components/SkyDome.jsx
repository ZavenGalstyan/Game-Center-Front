import { useMemo } from "react";
import * as THREE from "three";

/** A big inverted gradient-sky sphere so worlds never read as "floating in a flat color". */
export default function SkyDome({ top, bottom, center = [0, 0, 0] }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      bottomColor: { value: new THREE.Color(bottom) },
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
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, clamp(h * 0.6 + 0.45, 0.0, 1.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  }), [top, bottom]);

  return (
    <mesh position={center} renderOrder={-10} material={material}>
      <sphereGeometry args={[280, 24, 16]} />
    </mesh>
  );
}
