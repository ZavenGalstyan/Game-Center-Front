/**
 * Pirate Cove — sky dome + lighting rig.
 *
 *  <SkyDome>   gradient sky, sun (or moon) disc and halo, drifting procedural
 *              clouds, lightning flashes; below the horizon it melts into
 *              the fog colour so the sea's edge never shows
 *  <Lighting>  one shadow-casting sun that follows the focus point (tight
 *              shadow frustum = crisp ship/pirate shadows), hemisphere fill,
 *              scene fog from the preset
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // always at the far plane
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uFogCol;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform float uDisc;
  uniform float uMoon;
  uniform float uCover;
  uniform vec3 uCloudCol;
  uniform float uTime;
  uniform float uFlash;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
    // sun / moon
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    if (uMoon > 0.5) {
      col += uSunCol * (smoothstep(0.9992 - 0.0004 * uDisc, 0.9996, sd) * 1.4 + pow(sd, 400.0) * 0.4);
    } else {
      col += uSunCol * (smoothstep(0.9993 - 0.0006 * uDisc, 0.99975, sd) * 6.0 * step(0.01, uDisc) + pow(sd, 18.0) * 0.35 + pow(sd, 3.0) * 0.08);
    }
    // stars at night
    if (uMoon > 0.5) {
      vec2 sp = d.xz / max(d.y, 0.05) * 60.0;
      float st = step(0.996, hash(floor(sp))) * smoothstep(0.05, 0.4, h);
      col += vec3(st) * 0.8;
    }
    // clouds on a flat layer projected onto the dome
    if (h > 0.0) {
      vec2 cp = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
      float n = fbm(cp);
      float cov = smoothstep(1.0 - uCover * 0.75 - 0.2, 1.0 - uCover * 0.75 + 0.25, n);
      float lit = 0.75 + 0.35 * fbm(cp * 2.0 + 3.1) + pow(sd, 6.0) * 0.6;
      vec3 cc = uCloudCol * lit;
      col = mix(col, cc, cov * smoothstep(0.0, 0.18, h) * 0.92);
    }
    // below / at the horizon → fog colour
    col = mix(uFogCol, col, smoothstep(-0.02, 0.16, h));
    col += vec3(0.75, 0.8, 1.0) * uFlash;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function SkyDome({ atmos, flashRef }) {
  const ref = useRef();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uFogCol: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3() },
          uSunCol: { value: new THREE.Color() },
          uDisc: { value: 1 },
          uMoon: { value: 0 },
          uCover: { value: 0.3 },
          uCloudCol: { value: new THREE.Color() },
          uTime: { value: 0 },
          uFlash: { value: 0 },
        },
      }),
    [],
  );
  useEffect(() => {
    const u = material.uniforms;
    u.uZenith.value.set(atmos.sky[0]);
    u.uHorizon.value.set(atmos.sky[1]);
    u.uFogCol.value.set(atmos.fog.color);
    u.uSunDir.value.set(...atmos.sun.dir).normalize();
    u.uSunCol.value.set(atmos.sun.color);
    u.uDisc.value = atmos.sun.disc;
    u.uMoon.value = atmos.sun.moon ? 1 : 0;
    u.uCover.value = atmos.clouds.cover;
    u.uCloudCol.value.set(atmos.clouds.tint);
  }, [atmos, material]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ camera, clock }) => {
    if (!ref.current) return;
    ref.current.position.copy(camera.position);
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uFlash.value = flashRef?.current || 0;
  });
  return (
    <mesh ref={ref} material={material} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[1500, 32, 18]} />
    </mesh>
  );
}

/** Sun + fill + fog. `focus` is a ref to {x, y, z} the shadow camera should centre on. */
export function Lighting({ atmos, focus, shadows, flashRef, indoor = false }) {
  const sun = useRef();
  const hemi = useRef();
  const target = useMemo(() => new THREE.Object3D(), []);
  const { scene } = useThree();
  const dir = useMemo(() => new THREE.Vector3(...atmos.sun.dir).normalize(), [atmos]);
  const mapSize = shadows === "high" ? 2048 : 1024;
  const extent = shadows === "high" ? 46 : 38;

  useEffect(() => {
    scene.add(target);
    return () => scene.remove(target);
  }, [scene, target]);

  useEffect(() => {
    if (indoor) {
      scene.fog = new THREE.Fog("#0a1018", 8, 46);
      scene.background = new THREE.Color("#0a1018");
    } else {
      scene.fog = new THREE.Fog(atmos.fog.color, atmos.fog.near, atmos.fog.far);
      scene.background = new THREE.Color(atmos.fog.color);
    }
    return () => {
      scene.fog = null;
    };
  }, [scene, atmos, indoor]);

  useFrame(() => {
    const f = focus?.current || { x: 0, y: 0, z: 0 };
    if (sun.current) {
      sun.current.position.set(f.x + dir.x * 120, f.y + dir.y * 120, f.z + dir.z * 120);
      target.position.set(f.x, f.y, f.z);
      sun.current.target = target;
      const flash = flashRef?.current || 0;
      sun.current.intensity = (indoor ? 0.08 : atmos.sun.intensity) + flash * 4;
      if (hemi.current) hemi.current.intensity = (indoor ? 0.7 : atmos.hemi[2]) + flash * 1.5;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={indoor ? ["#5a7cb0", "#3a2c20", 0.7] : [atmos.hemi[0], atmos.hemi[1], atmos.hemi[2]]} />
      <directionalLight
        ref={sun}
        color={indoor ? "#6080b0" : atmos.sun.color}
        intensity={atmos.sun.intensity}
        castShadow={shadows !== "off"}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={1}
        shadow-camera-far={320}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
      />
    </>
  );
}
