/**
 * Telegraph / hazard visuals mirroring G.hazards: ground decals that fill up
 * during the warning time (circle, ring, line, cone, panel), lasers that
 * brighten toward their lock, sweeping beams, toxic gas volumes, molten pools,
 * steam bursts and security-camera cones.
 */
import * as THREE from "three";

const decalShader = (shape) =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#ff3b5c") }, uFill: { value: 0 }, uActive: { value: 0 }, uTime: { value: 0 }, uInner: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uFill; uniform float uActive; uniform float uTime; uniform float uInner; varying vec2 vUv;
      void main(){
        ${
          shape === "disc"
            ? `vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0 || r < uInner) discard;
               float edge = smoothstep(0.93, 1.0, r) + smoothstep(uInner + 0.06, uInner, r) * step(0.001, uInner);
               float fill = step(r, mix(uInner, 1.0, uFill));`
            : `vec2 p = vUv; float edge = max(max(smoothstep(0.04, 0.0, p.x), smoothstep(0.96, 1.0, p.x)), max(smoothstep(0.02, 0.0, p.y), smoothstep(0.98, 1.0, p.y)));
               float fill = step(p.y, uFill);`
        }
        float stripes = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 40.0 - uTime * 6.0);
        float a = edge * 0.9 + fill * (0.22 + 0.12 * stripes) + uActive * 0.6;
        gl_FragColor = vec4(uColor * (1.5 + uActive * 2.0), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });

export function createHazardView(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const views = new Map();
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  planeGeo.rotateX(-Math.PI / 2);
  const lineGeo = new THREE.PlaneGeometry(1, 1);
  lineGeo.rotateX(-Math.PI / 2);
  lineGeo.translate(0, 0, 0.5);
  const coneGeo = (spread) => {
    const g = new THREE.CircleGeometry(1, 24, -spread / 2 + Math.PI / 2, spread);
    g.rotateX(-Math.PI / 2);
    return g;
  };
  const beamGeo = new THREE.BoxGeometry(0.16, 0.16, 1);
  beamGeo.translate(0, 0, 0.5);
  const gasGeo = new THREE.BoxGeometry(1, 1, 1);
  gasGeo.translate(0, 0.5, 0);
  let time = 0;

  function make(h) {
    let mesh;
    if (h.kind === "circle" || h.kind === "ring" || h.kind === "pool") {
      const m = decalShader("disc");
      mesh = new THREE.Mesh(planeGeo, m);
      const r = h.r;
      mesh.scale.set(r * 2, 1, r * 2);
      mesh.position.set(h.x, 0.06, h.z);
      if (h.kind === "ring") m.uniforms.uInner.value = h.r0 / h.r;
    } else if (h.kind === "line") {
      mesh = new THREE.Mesh(lineGeo, decalShader("rect"));
      mesh.scale.set(h.width, 1, h.len);
      mesh.position.set(h.x, 0.07, h.z);
      mesh.rotation.y = h.ang;
    } else if (h.kind === "cone") {
      mesh = new THREE.Mesh(coneGeo(h.spread), decalShader("rect"));
      mesh.scale.set(h.len, 1, h.len);
      mesh.position.set(h.x, 0.07, h.z);
      mesh.rotation.y = h.ang + Math.PI;
    } else if (h.kind === "panel") {
      mesh = new THREE.Mesh(planeGeo, decalShader("rect"));
      mesh.scale.set(h.x1 - h.x0, 1, h.z1 - h.z0);
      mesh.position.set((h.x0 + h.x1) / 2, 0.06, (h.z0 + h.z1) / 2);
    } else if (h.kind === "zone") {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(h.color || "#7dff3a") }, uK: { value: 1 } },
        vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }`,
        fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uK; varying vec3 vW;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
          float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
          void main(){ float k = n(vW.xz * 0.6 + vec2(uTime * 0.3, uTime * 0.2)) * n(vW.xz * 1.3 - uTime * 0.2 + vW.y);
            float fade = 1.0 - smoothstep(0.4, 2.6, vW.y);
            gl_FragColor = vec4(uColor * 0.8, (0.18 + 0.4 * k) * fade * uK); }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      mesh = new THREE.Mesh(gasGeo, m);
      mesh.scale.set(h.x1 - h.x0, 2.6, h.z1 - h.z0);
      mesh.position.set((h.x0 + h.x1) / 2, 0, (h.z0 + h.z1) / 2);
    } else if (h.kind === "laser" || h.kind === "aimline" || h.kind === "beam") {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(h.color || "#ff2050"), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      mesh = new THREE.Mesh(beamGeo, m);
      if (h.kind === "beam") {
        mesh.scale.set(3.2, 3.2, h.len);
        // floor telegraph of the sweep start
        const t = new THREE.Mesh(lineGeo, decalShader("rect"));
        t.scale.set(1.2, 1, h.len);
        t.material.uniforms.uColor.value.set(h.color);
        mesh.userData.floor = t;
        group.add(t);
      }
    } else return null;
    if (mesh.material.uniforms?.uColor && h.kind !== "zone") mesh.material.uniforms.uColor.value.set(h.color || "#ff3b5c");
    group.add(mesh);
    return mesh;
  }

  // camera cones (Ghost Network)
  const camMeshes = [];
  const camGeo = new THREE.ConeGeometry(1, 1, 18, 1, true);
  camGeo.translate(0, -0.5, 0);
  camGeo.rotateX(-Math.PI / 2);
  camGeo.translate(0, 0, 0);
  const camBody = new THREE.BoxGeometry(0.3, 0.25, 0.45);

  function update(G, dt) {
    time += dt;
    const live = new Set();
    for (const h of G.hazards) {
      live.add(h);
      let m = views.get(h);
      if (!m) {
        m = make(h);
        if (!m) continue;
        views.set(h, m);
      }
      const warn = Math.max(1e-3, h.warn);
      const fill = Math.min(1, h.t / warn);
      const active = h.t >= h.warn ? 1 : 0;
      const U = m.material.uniforms;
      if (U?.uTime) U.uTime.value = time;
      if (U?.uFill) {
        U.uFill.value = fill;
        U.uActive.value = active * (h.dps ? 0.5 + 0.2 * Math.sin(time * 12) : Math.max(0, 1 - (h.t - h.warn) / 0.25));
      }
      if (h.kind === "zone") {
        // fades out once cleared
        const k = h.life <= 0 ? 0 : 1;
        U.uK.value += (k - U.uK.value) * Math.min(1, dt * 2);
      }
      if (h.vent && U) U.uColor.value.set(active ? "#e8f4ff" : "#9fc8ff");
      if (h.kind === "laser") {
        if (h.dir) {
          m.position.set(h.ox, h.oy, h.oz);
          m.lookAt(h.ox + h.dir.x, h.oy + h.dir.y, h.oz + h.dir.z);
          const lockIn = h.t > h.warn - h.lock;
          m.scale.set(lockIn ? 0.35 : 0.12, lockIn ? 0.35 : 0.12, h.len);
          m.material.opacity = active ? 1 : lockIn ? 0.75 + 0.25 * Math.sin(time * 40) : 0.25 + 0.3 * fill;
        }
      } else if (h.kind === "aimline") {
        if (h.ox != null) {
          m.position.set(h.ox, h.oy, h.oz);
          m.lookAt(h.tx, h.ty, h.tz);
          m.scale.set(0.08, 0.08, Math.hypot(h.tx - h.ox, h.ty - h.oy, h.tz - h.oz));
          m.material.opacity = 0.3 + 0.5 * fill;
        }
      } else if (h.kind === "beam") {
        const ang = h.t < h.warn ? h.ang : h.cur ?? h.ang;
        m.position.set(h.x, h.height, h.z);
        m.rotation.set(0, ang, 0);
        m.visible = h.t >= h.warn;
        m.material.opacity = 0.85;
        const f = m.userData.floor;
        if (f) {
          f.position.set(h.x, 0.07, h.z);
          f.rotation.y = ang;
          f.material.uniforms.uFill.value = fill;
          f.material.uniforms.uTime.value = time;
          f.visible = true;
        }
      } else if (h.kind === "cone") m.visible = h.t < h.warn + 0.3;
    }
    for (const [h, m] of views)
      if (!live.has(h)) {
        group.remove(m);
        if (m.userData.floor) {
          group.remove(m.userData.floor);
          m.userData.floor.material.dispose();
        }
        m.material.dispose();
        if (m.geometry !== planeGeo && m.geometry !== lineGeo && m.geometry !== beamGeo && m.geometry !== gasGeo) m.geometry.dispose();
        views.delete(h);
      }
    // cameras
    const cams = G.missions.active?.data?.cams || [];
    while (camMeshes.length < cams.length) {
      const cone = new THREE.Mesh(camGeo, new THREE.MeshBasicMaterial({ color: "#ffe14d", transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      const body = new THREE.Mesh(camBody, new THREE.MeshStandardMaterial({ color: "#2a2e36", metalness: 0.8, roughness: 0.3 }));
      const g = new THREE.Group();
      g.add(cone, body);
      g.userData = { cone };
      group.add(g);
      camMeshes.push(g);
    }
    camMeshes.forEach((g, i) => {
      const c = cams[i];
      g.visible = !!c && !c.dead;
      if (!c) return;
      g.position.set(c.x, c.y, c.z);
      g.rotation.set(0, c.cur, 0);
      const cone = g.userData.cone;
      const r = Math.tan(0.42) * c.range;
      cone.scale.set(r, r * 0.55, c.range);
      cone.rotation.x = 0.25;
      cone.material.color.set(c.detect > 0.05 ? "#ff3b3b" : "#ffe14d");
      cone.material.opacity = 0.08 + c.detect * 0.25;
    });
  }

  return {
    update,
    clear() {
      for (const [, m] of views) {
        group.remove(m);
        m.material.dispose();
      }
      views.clear();
      for (const g of camMeshes) group.remove(g);
      camMeshes.length = 0;
    },
    dispose() {
      this.clear();
      scene.remove(group);
      planeGeo.dispose();
      lineGeo.dispose();
      beamGeo.dispose();
      gasGeo.dispose();
      camGeo.dispose();
      camBody.dispose();
    },
  };
}
