/**
 * GPU rain: N streak quads wrapped in a box around the camera (no per-frame
 * CPU work beyond two uniforms), plus ground splash rings. Hidden under
 * ceilings (interiors, tunnels).
 */
import * as THREE from "three";

export function createRain(scene, count, color = "#9fb4d8") {
  const box = new THREE.Vector3(36, 22, 36);
  const N = count;
  const pos = new Float32Array(N * 4 * 3);
  const off = new Float32Array(N * 4 * 4);
  const idx = [];
  for (let i = 0; i < N; i++) {
    const x = Math.random() * box.x;
    const y = Math.random() * box.y;
    const z = Math.random() * box.z;
    const s = 0.7 + Math.random() * 0.6;
    for (let k = 0; k < 4; k++) {
      off.set([x, y, z, s], (i * 4 + k) * 4);
      // corner id in position.xy (side, top)
      pos.set([k & 1 ? 1 : -1, k & 2 ? 1 : 0, 0], (i * 4 + k) * 3);
    }
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aOff", new THREE.BufferAttribute(off, 4));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.35 } },
    vertexShader: `attribute vec4 aOff; uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; varying float vA; varying float vT;
      void main(){
        vec3 p = aOff.xyz;
        p.y -= uTime * 16.0 * aOff.w;
        p.x += uTime * 2.2;
        p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
        float len = 0.55 * aOff.w;
        vec3 dir = normalize(vec3(0.14, -1.0, 0.0));
        vec3 wp = p + dir * len * position.y;
        // billboard width toward the camera
        vec3 toCam = normalize(cameraPosition - wp);
        vec3 side = normalize(cross(dir, toCam)) * 0.012;
        wp += side * position.x;
        vT = position.y;
        float d = length(wp - cameraPosition);
        vA = smoothstep(1.0, 3.0, d) * (1.0 - smoothstep(14.0, 18.0, d));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA; varying float vT;
      void main(){ gl_FragColor = vec4(uColor, vA * uOpacity * (0.3 + 0.7 * vT)); }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);

  // splashes
  const NS = Math.floor(N / 8);
  const sp = new Float32Array(NS * 3);
  const ss = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    sp.set([Math.random() * 30 - 15, 0.05, Math.random() * 30 - 15], i * 3);
    ss[i] = Math.random();
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  sg.setAttribute("aSeed", new THREE.BufferAttribute(ss, 1));
  const sm = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 300 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `attribute float aSeed; uniform float uTime; uniform vec3 uCam; uniform float uScale; varying float vK;
      void main(){ float t = fract(uTime * 1.3 + aSeed * 13.0); float cyc = floor(uTime * 1.3 + aSeed * 13.0);
        vec3 p = position + vec3(fract(sin(cyc * 12.9 + aSeed * 78.2) * 437.5) * 6.0 - 3.0, 0.0, fract(sin(cyc * 39.3 + aSeed * 11.1) * 917.1) * 6.0 - 3.0);
        p.xz = mod(p.xz - uCam.xz + 15.0, 30.0) + uCam.xz - 15.0;
        vK = 1.0 - t;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * (0.15 + t * 0.35) / -mv.z;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying float vK; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r = length(vec2(q.x, q.y * 2.5)); float ring = smoothstep(0.75, 0.9, r) * smoothstep(1.0, 0.92, r); gl_FragColor = vec4(uColor, ring * vK * 0.6); }`,
    transparent: true,
    depthWrite: false,
  });
  const splash = new THREE.Points(sg, sm);
  splash.frustumCulled = false;
  scene.add(splash);

  return {
    update(t, cam, outdoors, groundY = 0) {
      m.uniforms.uTime.value = t;
      m.uniforms.uCam.value.copy(cam);
      sm.uniforms.uTime.value = t;
      sm.uniforms.uCam.value.copy(cam);
      mesh.visible = outdoors;
      splash.visible = outdoors;
      splash.position.y = groundY;
    },
    setScale(h) {
      sm.uniforms.uScale.value = h * 0.5;
    },
    dispose() {
      scene.remove(mesh, splash);
      g.dispose();
      m.dispose();
      sg.dispose();
      sm.dispose();
    },
  };
}
