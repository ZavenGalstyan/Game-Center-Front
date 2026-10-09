/**
 * Mario Adventure 3D — sky, light, sea and the distant backdrop of a world.
 *
 *   sky       gradient dome (shader, no fog) + sun disc
 *   lights    hemisphere fill + one shadow-casting sun that follows Mario
 *   sea       water (scrolling ripples), lava (glowing, scrolling) or
 *             quicksand for the desert
 *   clouds    puffy sphere clusters drifting slowly
 *   backdrop  a ring of world-specific giants: green hills & pipes, dunes &
 *             pyramids, palm islands, snowy peaks, smoking volcanoes
 */
import * as THREE from "three";
import { tex } from "./materials.js";

export function createEnvironment(scene, world, opts) {
  const disposables = [];
  const keep = (o) => (disposables.push(o), o);
  const group = new THREE.Group();
  group.name = "environment";
  scene.add(group);

  /* sky */
  const skyGeo = keep(new THREE.SphereGeometry(480, 32, 16));
  const skyMat = keep(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(world.sky[0]) },
        mid: { value: new THREE.Color(world.sky[1]) },
        bot: { value: new THREE.Color(world.sky[2]) },
      },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      // (#include must sit on its own line)
      fragmentShader: [
        "uniform vec3 top;",
        "uniform vec3 mid;",
        "uniform vec3 bot;",
        "varying vec3 vP;",
        "void main() {",
        "  float h = vP.y;",
        "  vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, bot, smoothstep(0.0, -0.25, h));",
        "  gl_FragColor = vec4(c, 1.0);",
        "  #include <colorspace_fragment>",
        "}",
      ].join("\n"),
    }),
  );
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);
  scene.fog = new THREE.Fog(world.fog, world.fogNear, world.fogFar);
  scene.background = null;

  /* lights */
  const hemi = new THREE.HemisphereLight(world.hemi[0], world.hemi[1], world.key === "lava" ? 0.9 : 1.15);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(world.sun, world.sunI);
  const sunDir = new THREE.Vector3(0.42, 0.85, -0.42).normalize(); // behind the default camera: faces toward the player are lit
  sun.castShadow = !!opts.shadows;
  if (sun.castShadow) {
    const sz = opts.quality === "high" ? 2048 : 1024;
    sun.shadow.mapSize.set(sz, sz);
    const r = 26;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 120 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
  }
  group.add(sun, sun.target);
  // sun disc
  const discMat = keep(new THREE.MeshBasicMaterial({ color: world.key === "lava" ? "#ff8a4a" : "#fffbe8", fog: false, transparent: true, opacity: 0.95 }));
  const discGeo = keep(new THREE.CircleGeometry(18, 32));
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.copy(sunDir).multiplyScalar(420);
  disc.lookAt(0, 0, 0);
  group.add(disc);
  const glowMat = keep(new THREE.MeshBasicMaterial({ color: world.key === "lava" ? "#ff5a1f" : "#fff2c4", fog: false, transparent: true, opacity: 0.25, depthWrite: false }));
  const glow = new THREE.Mesh(keep(new THREE.CircleGeometry(40, 32)), glowMat);
  glow.position.copy(disc.position).multiplyScalar(1.01);
  glow.lookAt(0, 0, 0);
  group.add(glow);

  /* sea */
  const sea = opts.sea;
  let seaMesh = null;
  let seaTex = null;
  if (sea && sea.kind !== "none") {
    const seaGeo = keep(new THREE.PlaneGeometry(1400, 1400, 1, 1));
    seaGeo.rotateX(-Math.PI / 2);
    let mat;
    if (sea.kind === "lava") {
      seaTex = tex("lava").clone();
      seaTex.needsUpdate = true;
      seaTex.repeat.set(90, 90);
      keep(seaTex);
      mat = new THREE.MeshStandardMaterial({ map: seaTex, emissiveMap: seaTex, emissive: "#ff5a1f", emissiveIntensity: 1.1, roughness: 0.7 });
    } else if (world.sea.quicksand) {
      seaTex = tex("sand").clone();
      seaTex.needsUpdate = true;
      seaTex.repeat.set(120, 120);
      keep(seaTex);
      mat = new THREE.MeshStandardMaterial({ map: seaTex, color: "#e8b866", roughness: 1 });
    } else {
      seaTex = tex("water").clone();
      seaTex.needsUpdate = true;
      seaTex.repeat.set(110, 110);
      keep(seaTex);
      mat = new THREE.MeshStandardMaterial({ color: world.sea.color, map: seaTex, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.93 });
    }
    keep(mat);
    seaMesh = new THREE.Mesh(seaGeo, mat);
    seaMesh.position.y = sea.y;
    seaMesh.receiveShadow = sea.kind !== "lava";
    group.add(seaMesh);
  }

  /* clouds */
  const cloudGeo = keep(new THREE.SphereGeometry(1, 14, 10));
  const cloudMat = keep(new THREE.MeshStandardMaterial({ color: world.key === "lava" ? "#5a3a3a" : "#ffffff", roughness: 1, emissive: world.key === "lava" ? "#1a0a0a" : "#c8d8e8", emissiveIntensity: world.key === "lava" ? 0.5 : 0.35 }));
  const clouds = [];
  const nC = world.key === "lava" ? 8 : 16;
  for (let i = 0; i < nC; i++) {
    const c = new THREE.Group();
    const a = (i / nC) * Math.PI * 2 + Math.sin(i * 7.1) * 0.3;
    const r = 90 + ((i * 37) % 70);
    c.position.set(Math.cos(a) * r, 34 + ((i * 13) % 22), Math.sin(a) * r);
    const n = 4 + (i % 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      const s = 4 + ((k * 7 + i) % 5);
      m.scale.set(s * 1.3, s * 0.8, s);
      m.position.set((k - n / 2) * 4.2, Math.sin(k * 2.3) * 1.2, Math.cos(k * 1.7) * 2);
      c.add(m);
    }
    group.add(c);
    clouds.push({ g: c, a, r, y: c.position.y, sp: 0.004 + (i % 4) * 0.0015 });
  }

  /* backdrop */
  const back = new THREE.Group();
  group.add(back);
  const R = 250;
  const ring = (n, f) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.sin(i * 3.3) * 0.12;
      f(Math.cos(a) * R * (0.9 + ((i * 17) % 10) / 40), Math.sin(a) * R * (0.9 + ((i * 11) % 10) / 40), i);
    }
  };
  const seaY = sea ? sea.y : -10;
  const hillGeo = keep(new THREE.SphereGeometry(1, 24, 14));
  const coneGeo = keep(new THREE.ConeGeometry(1, 1, 24));
  const cyl = keep(new THREE.CylinderGeometry(1, 1, 1, 20));
  const mat = (c, o = {}) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, ...o }));
  const add = (g, m, x, y, z, sx, sy, sz, ry = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.rotation.y = ry;
    back.add(o);
    return o;
  };
  const smokes = [];
  switch (world.key) {
    case "green": {
      const g1 = mat("#4cae46");
      const g2 = mat("#3d9a3c");
      ring(18, (x, z, i) => add(hillGeo, i % 2 ? g1 : g2, x, seaY - 6, z, 26 + (i % 4) * 8, 30 + (i % 5) * 9, 26 + (i % 3) * 7));
      const pipe = mat("#25b34a", { roughness: 0.4 });
      ring(5, (x, z, i) => add(cyl, pipe, x * 0.85, seaY + 8, z * 0.85, 5, 26 + i * 4, 5));
      break;
    }
    case "desert": {
      const d1 = mat("#e8b866");
      const d2 = mat("#d9a352");
      ring(16, (x, z, i) => add(hillGeo, i % 2 ? d1 : d2, x, seaY - 4, z, 40, 14 + (i % 4) * 5, 26));
      const py = keep(new THREE.MeshStandardMaterial({ map: tex("sandstone"), roughness: 0.9 }));
      ring(4, (x, z, i) => add(coneGeo, py, x * 0.8, seaY + 18 + i * 3, z * 0.8, 30 + i * 4, 40 + i * 6, 30 + i * 4, Math.PI / 4));
      break;
    }
    case "ocean": {
      const sand = mat("#f3df9f");
      const jungle = mat("#3fbf55");
      ring(10, (x, z, i) => {
        add(hillGeo, sand, x, seaY - 1, z, 26 + (i % 3) * 6, 4, 22);
        add(hillGeo, jungle, x, seaY + 1, z, 16 + (i % 3) * 4, 12 + (i % 4) * 4, 13);
      });
      break;
    }
    case "snow": {
      const rock = mat("#8ea6c4");
      const snow = mat("#ffffff");
      ring(16, (x, z, i) => {
        const h = 70 + (i % 5) * 18;
        add(coneGeo, rock, x, seaY + h / 2 - 8, z, 34 + (i % 3) * 8, h, 34 + (i % 3) * 8);
        add(coneGeo, snow, x, seaY + h * 0.78 - 8, z, (34 + (i % 3) * 8) * 0.45, h * 0.45, (34 + (i % 3) * 8) * 0.45);
      });
      break;
    }
    case "lava": {
      const rock = mat("#2c2122");
      const glowM = keep(new THREE.MeshStandardMaterial({ color: "#ff5a1f", emissive: "#ff3a00", emissiveIntensity: 1.6 }));
      ring(9, (x, z, i) => {
        const h = 60 + (i % 4) * 22;
        add(coneGeo, rock, x, seaY + h / 2 - 6, z, 44 + (i % 3) * 10, h, 44 + (i % 3) * 10);
        add(cyl, glowM, x, seaY + h - 7.5, z, 8 + (i % 3) * 2, 1.5, 8 + (i % 3) * 2);
        smokes.push([x, seaY + h - 4, z]);
      });
      break;
    }
    default:
  }

  let t = 0;
  return {
    sun,
    hemi,
    group,
    smokes,
    seaMesh,
    update(dt, focus) {
      t += dt;
      // the sun's shadow box follows Mario
      sun.position.set(focus.x + sunDir.x * 60, focus.y + sunDir.y * 60, focus.z + sunDir.z * 60);
      sun.target.position.set(focus.x, focus.y, focus.z);
      sky.position.set(focus.x, 0, focus.z);
      disc.position.set(focus.x + sunDir.x * 420, sunDir.y * 420, focus.z + sunDir.z * 420);
      glow.position.set(focus.x + sunDir.x * 424, sunDir.y * 424, focus.z + sunDir.z * 424);
      for (const c of clouds) {
        c.a += c.sp * dt;
        c.g.position.set(Math.cos(c.a) * c.r, c.y + Math.sin(t * 0.2 + c.r) * 0.6, Math.sin(c.a) * c.r);
      }
      if (seaTex) {
        if (sea.kind === "lava") {
          seaTex.offset.x = t * 0.004;
          seaTex.offset.y = t * 0.0025;
          seaMesh.material.emissiveIntensity = 1.0 + Math.sin(t * 1.3) * 0.15;
        } else {
          seaTex.offset.x = t * 0.006;
          seaTex.offset.y = Math.sin(t * 0.3) * 0.01;
        }
      }
    },
    dispose() {
      scene.remove(group);
      scene.fog = null;
      for (const d of disposables) d.dispose();
    },
  };
}
