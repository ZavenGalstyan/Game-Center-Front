/**
 * Venue builder: octagon (textured canvas, padded posts, chain-link fence,
 * raised platform with apron), cage-side tables, stands with an instanced
 * billboard crowd (one draw call, animated in the vertex shader), lighting
 * rig, spotlight beams, LED ribbons and a jumbotron for the big venues.
 *
 * All textures are generated on canvases at build time (no external images).
 * Returns { group, lights, update(dt, ctx), setBoard(text), dispose() }.
 */
import * as THREE from "three";
import { OCT_R } from "../engine/constants.js";

const TAU = Math.PI * 2;
const FENCE_H = 1.78;
const PLATFORM_H = 1.05;

/* ---------------------------------------------------------------- textures */
function canvasTex(w, h, draw, { repeat = null, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.userData.canvas = c;
  return t;
}

function noiseNormal(size = 256, strength = 1) {
  // fabric weave + noise → tangent-space normal map
  return canvasTex(
    size,
    size,
    (g, w, h) => {
      const img = g.createImageData(w, h);
      const H = new Float32Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) H[y * w + x] = Math.sin(x * 0.9) * 0.25 + Math.sin(y * 0.9) * 0.25 + Math.random() * 0.5;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const dx = (H[y * w + ((x + 1) % w)] - H[y * w + ((x - 1 + w) % w)]) * strength;
          const dy = (H[((y + 1) % h) * w + x] - H[((y - 1 + h) % h) * w + x]) * strength;
          const n = Math.hypot(dx, dy, 1);
          img.data[i * 4] = ((-dx / n) * 0.5 + 0.5) * 255;
          img.data[i * 4 + 1] = ((-dy / n) * 0.5 + 0.5) * 255;
          img.data[i * 4 + 2] = (1 / n) * 255;
          img.data[i * 4 + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    },
    { repeat: [24, 24], srgb: false }
  );
}

function canvasFloorTexture(A) {
  const C = A.canvas;
  return canvasTex(2048, 2048, (g, w) => {
    const cx = w / 2;
    g.fillStyle = C.base;
    g.fillRect(0, 0, w, w);
    // subtle wear / scuffs
    for (let i = 0; i < 2600 * C.wear; i++) {
      const r = Math.random() * w * 0.48;
      const a = Math.random() * TAU;
      g.fillStyle = `rgba(${90 + Math.random() * 40},${70 + Math.random() * 30},${60},${0.03 + Math.random() * 0.05})`;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 4 + Math.random() * 30, 2 + Math.random() * 10, Math.random() * 3, 0, TAU);
      g.fill();
    }
    // octagon edge band (under the fence) + inner line
    const oct = (rad) => {
      g.beginPath();
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * TAU;
        const x = cx + Math.cos(a) * rad;
        const y = cx + Math.sin(a) * rad;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
    };
    const scale = (w / 2) / 5.1; // canvas texture covers radius 5.1 m
    g.lineWidth = 60;
    g.strokeStyle = "#151515";
    oct(OCT_R * scale + 30);
    g.stroke();
    g.lineWidth = 10;
    g.strokeStyle = C.accent;
    oct(OCT_R * scale - 22);
    g.stroke();
    // corner markings: red & blue corners on opposite posts (x axis)
    for (const [ang, col] of [
      [Math.PI, "#c0151a"],
      [0, "#1650b8"],
    ]) {
      g.save();
      g.translate(cx + Math.cos(ang) * (OCT_R * scale - 70), cx + Math.sin(ang) * (OCT_R * scale - 70));
      g.rotate(ang);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(40, -120);
      g.lineTo(40, 120);
      g.lineTo(-70, 0);
      g.closePath();
      g.globalAlpha = 0.85;
      g.fill();
      g.restore();
    }
    // centre emblem
    g.globalAlpha = 1;
    g.save();
    g.translate(cx, cx);
    g.fillStyle = C.accent2;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(0, 0, 330, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 16;
    g.strokeStyle = C.accent;
    g.beginPath();
    g.arc(0, 0, 300, 0, TAU);
    g.stroke();
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "900 190px Impact, 'Arial Black', sans-serif";
    g.fillText("UMC", 0, -30);
    g.font = "700 46px 'Arial Black', Arial, sans-serif";
    g.fillStyle = C.accent;
    g.fillText(C.logo, 0, 120);
    g.restore();
    // ring-side wordmarks (fictional sponsors) between centre and fence
    const words = ["ULTIMATE MMA CHAMPIONSHIP", "TITAN GEAR", "APEX FUEL", "IRONCLAD", "ULTIMATE MMA CHAMPIONSHIP", "NOVA SPORTS", "REDLINE", "SUMMIT"];
    words.forEach((txt, i) => {
      const a = (i / 8) * TAU + TAU / 16;
      g.save();
      g.translate(cx + Math.cos(a) * 620, cx + Math.sin(a) * 620);
      g.rotate(a + Math.PI / 2);
      g.font = "800 58px 'Arial Black', Arial, sans-serif";
      g.textAlign = "center";
      g.fillStyle = i % 4 === 0 ? C.accent : "rgba(30,30,30,0.55)";
      g.fillText(txt, 0, 0);
      g.restore();
    });
  });
}

function fenceTexture() {
  // chain-link diamonds with alpha
  return canvasTex(
    128,
    128,
    (g, w) => {
      g.clearRect(0, 0, w, w);
      g.strokeStyle = "rgba(25,25,25,1)";
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(0, w / 2);
      g.lineTo(w / 2, 0);
      g.lineTo(w, w / 2);
      g.lineTo(w / 2, w);
      g.closePath();
      g.stroke();
      g.strokeStyle = "rgba(150,150,150,0.9)";
      g.lineWidth = 2;
      g.stroke();
    },
    { repeat: [1, 1], srgb: true }
  );
}

function brickTexture() {
  return canvasTex(
    512,
    512,
    (g, w) => {
      g.fillStyle = "#2a1c17";
      g.fillRect(0, 0, w, w);
      const bh = 32;
      const bw = 96;
      for (let y = 0; y < w / bh; y++)
        for (let x = -1; x < w / bw + 1; x++) {
          const ox = (y % 2) * (bw / 2);
          const l = 30 + Math.random() * 18;
          g.fillStyle = `hsl(${12 + Math.random() * 10},${35 + Math.random() * 15}%,${l * 0.6}%)`;
          g.fillRect(x * bw + ox + 3, y * bh + 3, bw - 6, bh - 6);
        }
    },
    { repeat: [8, 3] }
  );
}

function crowdAtlas() {
  // 4 body variants × (sitting, cheering). R = clothing, G = skin, B = hair, A = alpha
  return canvasTex(
    512,
    256,
    (g) => {
      g.clearRect(0, 0, 512, 256);
      for (let v = 0; v < 4; v++)
        for (let s = 0; s < 2; s++) {
          const x0 = v * 128;
          const y0 = s * 128;
          const cx = x0 + 64;
          const wide = 30 + v * 4;
          // torso
          g.fillStyle = "rgb(255,0,0)";
          g.beginPath();
          g.moveTo(cx - wide, y0 + 128);
          g.quadraticCurveTo(cx - wide, y0 + 62, cx, y0 + 60);
          g.quadraticCurveTo(cx + wide, y0 + 62, cx + wide, y0 + 128);
          g.fill();
          // arms raised when cheering
          if (s === 1) {
            g.lineWidth = 11;
            g.strokeStyle = "rgb(255,0,0)";
            g.beginPath();
            g.moveTo(cx - wide + 6, y0 + 76);
            g.lineTo(cx - wide - 6 + v * 3, y0 + 26);
            g.moveTo(cx + wide - 6, y0 + 76);
            g.lineTo(cx + wide + 6 - v * 2, y0 + 30);
            g.stroke();
            g.fillStyle = "rgb(0,255,0)";
            g.beginPath();
            g.arc(cx - wide - 6 + v * 3, y0 + 22, 7, 0, TAU);
            g.arc(cx + wide + 6 - v * 2, y0 + 26, 7, 0, TAU);
            g.fill();
          }
          // neck + head
          g.fillStyle = "rgb(0,255,0)";
          g.fillRect(cx - 7, y0 + 50, 14, 14);
          g.beginPath();
          g.ellipse(cx, y0 + 40, 15, 18, 0, 0, TAU);
          g.fill();
          // hair
          g.fillStyle = "rgb(0,0,255)";
          g.beginPath();
          g.ellipse(cx, y0 + 30 - (v % 2) * 2, 15.5, 10 + (v === 3 ? 8 : 0), 0, Math.PI, TAU);
          g.fill();
        }
    },
    { srgb: false, aniso: 2 }
  );
}

/* ---------------------------------------------------------------- crowd */
function buildCrowd(A, quality, tex) {
  const density = quality === "low" ? 0.45 : quality === "medium" ? 0.75 : 1;
  const pos = [];
  const tint = [];
  const vari = [];
  const phase = [];
  const tints = A.crowdTint.map((c) => new THREE.Color(c));
  for (let r = 0; r < A.rows; r++) {
    const rad = A.radius + 0.6 + r * A.rowDepth;
    const y = -PLATFORM_H + 0.2 + r * A.rowRise + 0.55;
    const n = Math.round((A.seatsPerRow + r * 6) * density);
    for (let i = 0; i < n; i++) {
      // aisles every 1/8th of the bowl
      const a = (i / n) * TAU + (r % 2) * 0.01;
      if (Math.abs(((a / TAU) * 8) % 1 - 0.5) < 0.035) continue;
      if (A.walls === "brick" && Math.random() < 0.12) continue; // standing-room gaps
      const jitter = (Math.random() - 0.5) * 0.12;
      pos.push(Math.cos(a) * (rad + jitter), y + (Math.random() - 0.5) * 0.08, Math.sin(a) * (rad + jitter));
      const c = tints[(Math.random() * tints.length) | 0].clone().multiplyScalar(0.7 + Math.random() * 0.6);
      tint.push(c.r, c.g, c.b);
      vari.push((Math.random() * 4) | 0);
      phase.push(Math.random());
    }
  }
  const base = new THREE.PlaneGeometry(0.62, 0.98);
  base.translate(0, 0.49, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;
  geo.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("iTint", new THREE.InstancedBufferAttribute(new Float32Array(tint), 3));
  geo.setAttribute("iVar", new THREE.InstancedBufferAttribute(new Float32Array(vari), 1));
  geo.setAttribute("iPhase", new THREE.InstancedBufferAttribute(new Float32Array(phase), 1));
  geo.instanceCount = pos.length / 3;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: tex },
      uTime: { value: 0 },
      uExcite: { value: 0.2 },
      uLight: { value: A.walls === "brick" ? 0.5 : 0.42 },
      uFlash: { value: A.jumbotron ? 1 : 0.25 },
      fogColor: { value: new THREE.Color(A.fog.color) },
      fogNear: { value: A.fog.near },
      fogFar: { value: A.fog.far },
    },
    vertexShader: /* glsl */ `
      attribute vec3 iPos; attribute vec3 iTint; attribute float iVar; attribute float iPhase;
      uniform float uTime; uniform float uExcite;
      varying vec2 vUv; varying vec3 vTint; varying float vFog; varying float vFlash; varying float vDist;
      uniform float uFlash;
      void main() {
        float cheer = step(1.0 - uExcite * 0.85, fract(iPhase * 7.31));
        float bob = sin(uTime * (3.0 + iPhase * 3.0) + iPhase * 40.0) * (0.02 + 0.09 * uExcite * cheer);
        vec4 mv = modelViewMatrix * vec4(iPos + vec3(0.0, bob + cheer * 0.06 * uExcite, 0.0), 1.0);
        mv.xy += position.xy * (0.9 + fract(iPhase * 3.7) * 0.25);
        gl_Position = projectionMatrix * mv;
        vUv = vec2((iVar + uv.x) / 4.0, (uv.y + (1.0 - cheer)) / 2.0);
        vTint = iTint;
        vFog = -mv.z;
        vDist = length(iPos.xz);
        vFlash = uFlash * step(0.9975, fract(uTime * 0.37 + iPhase * 91.7)) * step(0.5, fract(iPhase * 11.3));
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform float uLight; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
      varying vec2 vUv; varying vec3 vTint; varying float vFog; varying float vFlash; varying float vDist;
      void main() {
        vec4 t = texture2D(uTex, vUv);
        if (t.a < 0.5) discard;
        vec3 skin = mix(vec3(0.85, 0.62, 0.48), vec3(0.42, 0.28, 0.2), fract(vTint.r * 13.7));
        vec3 col = vTint * t.r + skin * t.g + vec3(0.06, 0.05, 0.045) * t.b;
        float light = uLight * (1.25 - smoothstep(6.0, 22.0, vDist) * 0.7);
        col *= light;
        col += vFlash * vec3(3.0);
        float f = smoothstep(fogNear, fogFar, vFog);
        gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.count = geo.instanceCount;
  return mesh;
}

/* ---------------------------------------------------------------- builder */
export function buildArena(A, { quality = "high", renderer } = {}) {
  const group = new THREE.Group();
  group.name = `arena-${A.id}`;
  const disposables = [];
  const track = (x) => (disposables.push(x), x);
  const mat = (o) => track(new THREE.MeshStandardMaterial(o));
  const geo = (g) => track(g);
  const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;

  /* ---- octagon floor */
  const floorTex = track(canvasFloorTexture(A));
  floorTex.anisotropy = aniso;
  const weave = track(noiseNormal(256, 2.2));
  const canvasGeo = geo(new THREE.CircleGeometry(5.1, 64));
  canvasGeo.rotateX(-Math.PI / 2);
  // circle uvs map [0,1] across the 10.2 m diameter
  const canvasMesh = new THREE.Mesh(canvasGeo, mat({ map: floorTex, normalMap: weave, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.86, metalness: 0 }));
  canvasMesh.receiveShadow = true;
  canvasMesh.rotation.y = 0;
  group.add(canvasMesh);

  /* ---- platform skirt + apron */
  const apronTex = track(
    canvasTex(2048, 128, (g, w, h) => {
      g.fillStyle = "#0c0c0e";
      g.fillRect(0, 0, w, h);
      g.font = "800 64px 'Arial Black', Arial, sans-serif";
      g.textBaseline = "middle";
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? "#e8e8e8" : A.canvas.accent;
        g.fillText(i % 2 ? "ULTIMATE MMA CHAMPIONSHIP" : A.canvas.logo, i * 256 + 10, h / 2, 236);
      }
    })
  );
  apronTex.wrapS = THREE.RepeatWrapping;
  const skirt = new THREE.Mesh(geo(new THREE.CylinderGeometry(5.5, 5.5, PLATFORM_H, 8, 1, true)), mat({ map: apronTex, roughness: 0.6 }));
  skirt.rotation.y = TAU / 16;
  skirt.position.y = -PLATFORM_H / 2;
  group.add(skirt);
  const apronTop = new THREE.Mesh(geo(new THREE.RingGeometry(5.05, 5.5, 8, 1)), mat({ color: "#111114", roughness: 0.55 }));
  apronTop.rotation.x = -Math.PI / 2;
  apronTop.rotation.z = TAU / 16;
  apronTop.position.y = 0.002;
  apronTop.receiveShadow = true;
  group.add(apronTop);
  // arena floor
  const floor = new THREE.Mesh(geo(new THREE.CircleGeometry(60, 48)), mat({ color: A.walls === "brick" ? "#1d1714" : "#121218", roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -PLATFORM_H;
  floor.receiveShadow = true;
  group.add(floor);

  /* ---- posts, rails, fence */
  const postMat = mat({ color: A.gold ? "#1a1a1a" : "#121212", roughness: 0.45 });
  const padMat = mat({ color: A.gold ? "#c9a227" : A.canvas.accent2 === "#111111" ? "#141414" : "#1b1b1b", roughness: 0.5, metalness: A.gold ? 0.6 : 0 });
  const postGeo = geo(new THREE.CylinderGeometry(0.11, 0.11, FENCE_H + 0.1, 16));
  const capGeo = geo(new THREE.SphereGeometry(0.12, 16, 10));
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const p = new THREE.Vector3(Math.cos(a) * OCT_R, 0, Math.sin(a) * OCT_R);
    pts.push(p);
    const post = new THREE.Mesh(postGeo, padMat);
    post.position.set(p.x, (FENCE_H + 0.1) / 2, p.z);
    post.castShadow = true;
    group.add(post);
    const cap = new THREE.Mesh(capGeo, padMat);
    cap.position.set(p.x, FENCE_H + 0.1, p.z);
    group.add(cap);
  }
  const fenceTex = track(fenceTexture());
  const fenceMat = track(new THREE.MeshStandardMaterial({ map: fenceTex, alphaTest: 0.35, transparent: false, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.6, color: "#d0d0d0" }));
  const railGeo = geo(new THREE.CylinderGeometry(0.075, 0.075, 1, 12));
  railGeo.rotateZ(Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 8];
    const len = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const ang = Math.atan2(b.z - a.z, b.x - a.x);
    const fg = geo(new THREE.PlaneGeometry(len - 0.2, FENCE_H - 0.12));
    const t = fenceTex.clone();
    t.needsUpdate = true;
    t.repeat.set((len - 0.2) / 0.075, (FENCE_H - 0.12) / 0.075);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    track(t);
    const fm = fenceMat.clone();
    fm.map = t;
    track(fm);
    const fence = new THREE.Mesh(fg, fm);
    fence.position.set(mid.x, 0.06 + (FENCE_H - 0.12) / 2, mid.z);
    fence.rotation.y = -ang;
    fence.castShadow = quality === "high";
    group.add(fence);
    for (const [y, r] of [
      [FENCE_H, 1],
      [0.05, 0.7],
    ]) {
      const rail = new THREE.Mesh(railGeo, r === 1 ? padMat : postMat);
      rail.scale.set(len, r, r);
      rail.position.set(mid.x, y, mid.z);
      rail.rotation.y = -ang;
      group.add(rail);
    }
  }

  /* ---- cage-side tables */
  const tableMat = mat({ color: "#0d0d10", roughness: 0.7 });
  const tableGeo = geo(new THREE.BoxGeometry(2.2, 0.75, 0.7));
  const screenMat = mat({ color: "#223", emissive: "#3a5a8a", emissiveIntensity: 0.6 });
  for (const a of [Math.PI / 2, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6]) {
    const t = new THREE.Mesh(tableGeo, tableMat);
    t.position.set(Math.cos(a) * 6.2, -PLATFORM_H + 0.375, Math.sin(a) * 6.2);
    t.rotation.y = -a + Math.PI / 2;
    group.add(t);
    const sc = new THREE.Mesh(geo(new THREE.BoxGeometry(0.5, 0.32, 0.03)), screenMat);
    sc.position.set(t.position.x, -PLATFORM_H + 0.92, t.position.z);
    sc.rotation.y = t.rotation.y;
    group.add(sc);
  }

  /* ---- stands */
  const standMat = mat({ color: A.walls === "brick" ? "#241c18" : "#15161c", roughness: 0.85 });
  const profile = [new THREE.Vector2(A.radius, -PLATFORM_H)];
  for (let r = 0; r < A.rows; r++) {
    const y = -PLATFORM_H + 0.2 + r * A.rowRise;
    const x0 = A.radius + r * A.rowDepth;
    profile.push(new THREE.Vector2(x0, y), new THREE.Vector2(x0 + A.rowDepth, y));
  }
  const last = profile[profile.length - 1];
  profile.push(new THREE.Vector2(last.x + 0.5, last.y + 1.4), new THREE.Vector2(last.x + 0.5, -PLATFORM_H));
  // LatheGeometry wants points ordered bottom → top-ish; reverse to keep normals outward-facing toward the ring
  const stands = new THREE.Mesh(geo(new THREE.LatheGeometry(profile.slice().reverse(), 64)), standMat);
  stands.material.side = THREE.DoubleSide;
  stands.receiveShadow = true;
  group.add(stands);
  const crowdTex = track(crowdAtlas());
  const crowd = buildCrowd(A, quality, crowdTex);
  track(crowd.geometry);
  track(crowd.material);
  group.add(crowd);

  /* ---- walls / roof */
  const outerR = last.x + 2;
  if (A.walls === "brick") {
    const bt = track(brickTexture());
    const room = new THREE.Mesh(geo(new THREE.CylinderGeometry(outerR + 1, outerR + 1, 9, 4, 1, true)), mat({ map: bt, side: THREE.BackSide, roughness: 0.95, color: "#8a7a70" }));
    room.rotation.y = Math.PI / 4;
    room.position.y = 3.5;
    group.add(room);
    const ceil = new THREE.Mesh(geo(new THREE.CircleGeometry(outerR + 3, 4)), mat({ color: "#0c0a09", roughness: 1, side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2;
    ceil.rotation.z = Math.PI / 4;
    ceil.position.y = 8;
    group.add(ceil);
  } else {
    const dome = new THREE.Mesh(geo(new THREE.SphereGeometry(outerR + 30, 32, 16, 0, TAU, 0, Math.PI / 2)), track(new THREE.MeshBasicMaterial({ color: A.sky, side: THREE.BackSide, fog: false })));
    dome.position.y = -2;
    group.add(dome);
    // upper rim structure catching light
    const rim = new THREE.Mesh(geo(new THREE.CylinderGeometry(outerR + 0.8, outerR + 0.8, 1.2, 64, 1, true)), mat({ color: "#1d1e24", emissive: A.led ? A.canvas.accent : "#000000", emissiveIntensity: A.led ? 0.12 : 0, side: THREE.DoubleSide }));
    rim.position.y = last.y + 2.2;
    group.add(rim);
  }

  /* ---- lighting rig */
  const lights = new THREE.Group();
  group.add(lights);
  const amb = new THREE.HemisphereLight("#9fb0d0", "#20160f", A.ambient);
  lights.add(amb);
  const key = new THREE.SpotLight(A.keyColor, A.keyIntensity * 0.55, 30, 0.62, 0.55, 1.6);
  key.position.set(0, 9.5, 0.6);
  key.target.position.set(0, 0, 0);
  key.castShadow = quality !== "low";
  const sm = quality === "high" ? 2048 : 1024;
  key.shadow.mapSize.set(sm, sm);
  key.shadow.bias = -0.00012;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 14;
  key.shadow.radius = 4;
  lights.add(key, key.target);
  const rimLights = [];
  // fixtures beyond these are emissive-only: every real light costs per-pixel shading
  const corners = Math.min(A.spots, quality === "high" ? 4 : 2);
  for (let i = 0; i < corners; i++) {
    const a = (i / corners) * TAU + 0.2;
    const s = new THREE.SpotLight(i % 2 ? A.rim[0] : A.rim[1], A.keyIntensity * 0.32, 26, 0.45, 0.7, 1.7);
    s.position.set(Math.cos(a) * 7.5, 8, Math.sin(a) * 7.5);
    s.target.position.set(Math.cos(a) * -0.6, 0.8, Math.sin(a) * -0.6);
    lights.add(s, s.target);
    rimLights.push(s);
  }
  // light truss
  const truss = new THREE.Group();
  const trussMat = mat({ color: "#2a2a2e", metalness: 0.7, roughness: 0.4 });
  const fixMat = mat({ color: "#222", emissive: A.keyColor, emissiveIntensity: 2.2 });
  const side = 5.4;
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(geo(new THREE.BoxGeometry(side * 2, 0.32, 0.32)), trussMat);
    const a = (i / 4) * TAU;
    bar.position.set(Math.cos(a) * side, 9.2, Math.sin(a) * side);
    bar.rotation.y = -a + Math.PI / 2;
    truss.add(bar);
    for (let k = -2; k <= 2; k++) {
      const f = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 12)), fixMat);
      const along = new THREE.Vector3(Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2)).multiplyScalar(k * 1.8);
      f.position.copy(bar.position).add(along);
      f.position.y = 8.95;
      truss.add(f);
    }
  }
  group.add(truss);

  /* ---- volumetric-looking beams */
  const beams = [];
  if (A.beams || A.moving) {
    const beamMat = track(
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(A.keyColor) }, uStrength: { value: A.walls === "brick" ? 0.09 : 0.05 } },
        vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); gl_FragColor = vec4(uColor * uStrength * edge * (0.25 + vY*0.9), 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    const bgeo = geo(new THREE.CylinderGeometry(0.15, 1.9, 9, 24, 1, true));
    bgeo.translate(0, -4.5, 0);
    const n = A.moving ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(bgeo, A.moving ? beamMat.clone() : beamMat);
      if (A.moving) {
        track(b.material);
        b.material.uniforms.uColor.value = new THREE.Color(i % 2 ? A.rim[0] : A.rim[1]);
      }
      const a = (i / n) * TAU;
      b.position.set(Math.cos(a) * (A.moving ? 7 : 2.4), 9.1, Math.sin(a) * (A.moving ? 7 : 2.4));
      b.userData = { a, base: b.position.clone() };
      group.add(b);
      beams.push(b);
    }
  }

  /* ---- LED ribbon + jumbotron */
  let ledTex = null;
  let boardTex = null;
  let boardText = { a: "", b: "", c: "" };
  if (A.led) {
    ledTex = track(
      canvasTex(2048, 64, (g, w, h) => {
        g.fillStyle = "#050505";
        g.fillRect(0, 0, w, h);
        g.font = "800 40px 'Arial Black', Arial, sans-serif";
        g.textBaseline = "middle";
        const msg = ["ULTIMATE MMA CHAMPIONSHIP", A.name.toUpperCase(), "FIGHT • DOMINATE • BECOME CHAMPION"];
        let x = 10;
        for (let i = 0; i < 6; i++) {
          g.fillStyle = i % 2 ? "#ffffff" : A.canvas.accent;
          const t = msg[i % 3];
          g.fillText(t, x, h / 2);
          x += g.measureText(t).width + 60;
        }
      })
    );
    ledTex.wrapS = THREE.RepeatWrapping;
    ledTex.repeat.set(3, 1);
    const ribbon = new THREE.Mesh(geo(new THREE.CylinderGeometry(A.radius - 0.02, A.radius - 0.02, 0.55, 96, 1, true)), track(new THREE.MeshBasicMaterial({ map: ledTex, side: THREE.BackSide, toneMapped: false })));
    ribbon.position.y = -PLATFORM_H + 0.5;
    group.add(ribbon);
  }
  const drawBoard = () => {
    if (!boardTex) return;
    const c = boardTex.userData.canvas;
    const g = c.getContext("2d");
    g.fillStyle = "#06070b";
    g.fillRect(0, 0, c.width, c.height);
    const grd = g.createLinearGradient(0, 0, c.width, 0);
    grd.addColorStop(0, A.canvas.accent);
    grd.addColorStop(1, "#111");
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, 26);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.font = "800 54px 'Arial Black', Arial, sans-serif";
    g.fillText(boardText.a, c.width / 2, 110);
    g.font = "700 40px Arial, sans-serif";
    g.fillStyle = A.gold ? "#e8c35a" : "#cfd6e6";
    g.fillText(boardText.b, c.width / 2, 175);
    g.font = "800 46px 'Arial Black', Arial, sans-serif";
    g.fillStyle = "#fff";
    g.fillText(boardText.c, c.width / 2, 236);
    boardTex.needsUpdate = true;
  };
  if (A.jumbotron) {
    boardTex = track(canvasTex(512, 288, () => {}));
    const cube = new THREE.Group();
    const frame = new THREE.Mesh(geo(new THREE.BoxGeometry(4.2, 2.5, 4.2)), mat({ color: "#0b0b0e", metalness: 0.5, roughness: 0.4 }));
    cube.add(frame);
    const sMat = track(new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(geo(new THREE.PlaneGeometry(3.9, 2.2)), sMat);
      const a = (i / 4) * TAU;
      s.position.set(Math.sin(a) * 2.11, 0, Math.cos(a) * 2.11);
      s.rotation.y = a;
      cube.add(s);
    }
    cube.position.y = 12.5;
    group.add(cube);
    drawBoard();
  }

  let t = 0;
  return {
    group,
    def: A,
    key,
    crowd,
    crowdCount: crowd.userData.count,
    /** ctx: { excite 0..1, camera } */
    update(dt, ctx = {}) {
      t += dt;
      crowd.material.uniforms.uTime.value = t;
      const ex = crowd.material.uniforms.uExcite;
      ex.value += ((ctx.excite ?? 0.2) - ex.value) * Math.min(1, dt * 2.5);
      if (ledTex) ledTex.offset.x = (t * 0.03) % 1;
      if (A.moving)
        beams.forEach((b, i) => {
          const s = b.userData;
          b.rotation.z = Math.sin(t * 0.5 + i) * 0.35;
          b.rotation.x = Math.cos(t * 0.37 + i * 1.7) * 0.3;
          b.position.copy(s.base);
        });
      rimLights.forEach((l, i) => (l.intensity = A.keyIntensity * 0.32 * (A.moving ? 0.8 + 0.2 * Math.sin(t * 1.3 + i) : 1)));
    },
    setBoard(a, b, c) {
      if (a === boardText.a && b === boardText.b && c === boardText.c) return;
      boardText = { a, b, c };
      drawBoard();
    },
    setQuality(q) {
      key.castShadow = q !== "low";
    },
    dispose() {
      for (const d of disposables) d.dispose?.();
      key.shadow.dispose(); // shadow-map render target
      rimLights.forEach((l) => l.shadow?.dispose());
    },
  };
}

export { PLATFORM_H, FENCE_H };
