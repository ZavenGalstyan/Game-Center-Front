/**
 * Card illustrations, rendered once per session from small 3D vignettes:
 * the scanned CC0 props (estoc, mace, kite shield, skull, lantern, candles,
 * bust, fire pit…) lit like a painting with coloured key/rim lights, magic
 * particles and a smoky painted backdrop. Rendered by a short-lived offscreen
 * WebGLRenderer into data URLs the DOM cards use as artwork (no text is
 * drawn into the images, so they work in every language).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadProp, fitProp } from "./assets.js";
import { softSprite, smokeTexture } from "./materials.js";
import * as G from "./geo.js";

const W = 300;
const H = 400;
const cache = new Map();
let pending = null;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function backdrop(c1, c2, c3 = 0x000000) {
  const m = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: { uA: { value: new THREE.Color(c1) }, uB: { value: new THREE.Color(c2) }, uC: { value: new THREE.Color(c3) }, uSeed: { value: Math.random() * 10 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uA, uB, uC; uniform float uSeed; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * n(p); p = p * 2.1 + 1.3; a *= 0.5; } return s; }
      void main(){ vec2 p = vUv - vec2(0.5, 0.55); float r = length(p * vec2(1.2, 1.0));
        float s = fbm(vUv * 3.0 + uSeed) ; float s2 = fbm(vUv * 7.0 - uSeed);
        vec3 col = mix(uA * 1.4, uB, smoothstep(0.0, 0.62, r + (s - 0.5) * 0.35));
        col = mix(col, uC, smoothstep(0.45, 0.9, r));
        col += uA * smoothstep(0.55, 0.85, s2) * 0.25 * (1.0 - r);
        col *= 0.75 + 0.5 * s;
        gl_FragColor = vec4(col, 1.0); }`,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  q.frustumCulled = false;
  q.renderOrder = -1;
  return q;
}

function motes(scene, color, n, box, size = 0.06, center = V(0, 0, 0)) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.4 + Math.random() * 0.6 }));
    s.position.set(center.x + (Math.random() - 0.5) * box[0], center.y + (Math.random() - 0.5) * box[1], center.z + (Math.random() - 0.5) * box[2]);
    s.scale.setScalar(size * (0.4 + Math.random()));
    scene.add(s);
  }
}

function smoke(scene, color, n, box, size = 1, opacity = 0.5, center = V()) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color, transparent: true, depthWrite: false, opacity, rotation: Math.random() * 6 }));
    s.position.set(center.x + (Math.random() - 0.5) * box[0], center.y + (Math.random() - 0.5) * box[1], center.z + (Math.random() - 0.5) * box[2]);
    s.scale.setScalar(size * (0.6 + Math.random() * 0.8));
    scene.add(s);
  }
}

function glow(scene, color, size, pos, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity }));
  s.scale.setScalar(size);
  s.position.copy(pos);
  scene.add(s);
  return s;
}

function lights(scene, key, rim, { keyI = 3, rimI = 6, fill = 0x202030 } = {}) {
  const k = new THREE.DirectionalLight(key, keyI);
  k.position.set(-1.5, 2, 2.5);
  const r = new THREE.DirectionalLight(rim, rimI);
  r.position.set(1.5, 1, -2);
  scene.add(k, r, new THREE.HemisphereLight(fill, 0x000000, 0.8));
}

async function prop(name, size, axis = "y", ground = false) {
  return fitProp(await loadProp(name), size, axis, ground);
}

function emissive(obj, color, k = 0.5) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.userData.sharedMat = false;
      o.material.emissive = new THREE.Color(color);
      o.material.emissiveIntensity = k;
    }
  });
  return obj;
}

const sword = async (len = 1.6) => {
  const s = await prop("estoc", len, "z");
  return s;
};

/* Each recipe fills a scene; the camera looks at the origin from +Z. */
const ART = {
  async shadow(S) {
    S.add(backdrop(0x5a2aa8, 0x12061e));
    const s = await sword(1.7);
    s.rotation.set(0.3, 0.6, -0.75);
    S.add(emissive(s, 0x3a1070, 0.25));
    smoke(S, 0x1a0630, 8, [1.6, 1.8, 0.6], 1.1, 0.55);
    motes(S, 0xb070ff, 40, [1.6, 2, 0.6], 0.07);
    glow(S, 0x9a4aff, 1.6, V(0.1, 0.1, -0.3), 0.6);
    lights(S, 0xc8a0ff, 0x8a40ff);
  },
  async barrier(S) {
    S.add(backdrop(0x2a4aa8, 0x060a1e));
    const sh = await prop("kite_shield", 1.55);
    sh.rotation.y = -0.35;
    S.add(sh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.012, 8, 80), new THREE.MeshBasicMaterial({ color: 0x9ab8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    ring.position.z = -0.25;
    S.add(ring);
    glow(S, 0x6a8aff, 2.2, V(0, 0, -0.4), 0.5);
    motes(S, 0xa8c8ff, 40, [1.8, 2.2, 0.5], 0.05);
    lights(S, 0xd8e0ff, 0x5a7aff, { rimI: 8 });
  },
  async blood(S) {
    S.add(backdrop(0xa01020, 0x18020a));
    const s = await sword(1.7);
    s.rotation.set(-0.2, 0.4, 0.8);
    S.add(emissive(s, 0x600008, 0.35));
    motes(S, 0xff1a2a, 50, [1.6, 2, 0.6], 0.05);
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.018 + Math.random() * 0.02, 10, 8), new THREE.MeshPhysicalMaterial({ color: 0x6a0008, roughness: 0.1, clearcoat: 1 }));
      d.position.set((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.6, Math.random() * 0.4);
      d.scale.y = 1.6;
      S.add(d);
    }
    lights(S, 0xffd0c0, 0xff2a2a, { rimI: 8 });
  },
  async heal(S) {
    S.add(backdrop(0x4a8a3a, 0x081408));
    const c = await prop("candlestick", 1.5, "y");
    c.position.y = -0.85;
    S.add(c);
    glow(S, 0xffe08a, 0.9, V(0, 0.68, 0.05), 0.95);
    glow(S, 0x8aff9a, 2.2, V(0, 0.4, -0.4), 0.45);
    motes(S, 0xb8ffb0, 60, [1.6, 2.2, 0.6], 0.05, V(0, 0.2, 0));
    lights(S, 0xfff0c0, 0x8aff9a);
  },
  async crush(S) {
    S.add(backdrop(0x8a6a4a, 0x140c06));
    const m = await prop("mace", 1.75);
    m.rotation.set(0.2, 0.3, -0.6);
    S.add(m);
    smoke(S, 0x6a5a48, 7, [1.8, 1.4, 0.5], 1.0, 0.45, V(0.3, 0.4, 0));
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(G.longBone(0.06 + Math.random() * 0.12, 0.01, 1.5), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7 }));
      b.position.set(0.3 + (Math.random() - 0.5) * 1.2, 0.4 + (Math.random() - 0.5) * 1.0, Math.random() * 0.3);
      b.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      S.add(b);
    }
    lights(S, 0xfff0d8, 0xffb070);
  },
  async hex(S) {
    S.add(backdrop(0x6a2ab0, 0x0e0418));
    const sk = await prop("skull", 0.9, "z");
    sk.rotation.y = 0.35;
    S.add(sk);
    glow(S, 0xb050ff, 2, V(0, -0.5, -0.3), 0.6);
    motes(S, 0xd090ff, 50, [1.6, 2, 0.6], 0.05);
    smoke(S, 0x200838, 6, [1.6, 1.6, 0.5], 1.1, 0.5, V(0, -0.6, -0.3));
    lights(S, 0xc0a0ff, 0xa040ff, { keyI: 2 });
  },
  async wraith(S) {
    S.add(backdrop(0x4a6a8a, 0x060a10));
    const l = await prop("lantern", 1.4);
    l.rotation.y = 0.4;
    S.add(l);
    glow(S, 0xbfe8ff, 0.8, V(0, -0.05, 0.1), 0.9);
    smoke(S, 0x8aa8c0, 9, [1.8, 2, 0.6], 1.0, 0.25);
    motes(S, 0xd8f0ff, 30, [1.6, 2, 0.6], 0.05);
    lights(S, 0xd0e8ff, 0x8ab8ff);
  },
  async mark(S) {
    S.add(backdrop(0x8a1020, 0x100206));
    const sk = await prop("skull", 0.75, "z");
    sk.rotation.set(0.2, -0.3, 0);
    S.add(sk);
    for (const x of [-0.12, 0.12]) glow(S, 0xff2a2a, 0.22, V(x, 0.06, 0.4), 1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.01, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a3a, blending: THREE.AdditiveBlending, transparent: true }));
    ring.position.z = -0.4;
    S.add(ring);
    lights(S, 0xffc0b0, 0xff2020, { keyI: 2 });
  },
  async stake(S) {
    S.add(backdrop(0xb8c8e8, 0x0c1018));
    const s = await sword(1.85);
    s.rotation.set(0, 0.2, Math.PI / 2 + 0.1);
    S.add(emissive(s, 0x8aa8d8, 0.25));
    glow(S, 0xffffff, 1.2, V(0, -0.6, 0), 0.6);
    motes(S, 0xffffff, 40, [1.4, 2.2, 0.5], 0.04);
    lights(S, 0xffffff, 0xb8d0ff, { keyI: 4 });
  },
  async drain(S) {
    S.add(backdrop(0x701830, 0x0a0206));
    const sk = await prop("skull", 0.8, "z");
    sk.rotation.y = -0.5;
    S.add(sk);
    for (let i = 0; i < 5; i++) {
      const pts = [];
      for (let k = 0; k <= 12; k++) pts.push(V(Math.sin(k * 0.5 + i) * 0.5, -1 + k * 0.17, Math.cos(k * 0.5 + i) * 0.3));
      const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.012, 6), new THREE.MeshBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending }));
      S.add(t);
    }
    motes(S, 0xff4a6a, 40, [1.6, 2, 0.6], 0.05);
    lights(S, 0xffc0c8, 0xff2a4a);
  },
  async ward(S) {
    S.add(backdrop(0x3a5a6a, 0x060a0e));
    const st = await prop("gothic_statue", 2.0);
    st.position.set(0.2, -0.9, -0.8);
    S.add(st);
    const sh = await prop("kite_shield", 1.0);
    sh.position.set(-0.3, -0.3, 0.3);
    sh.rotation.y = 0.3;
    S.add(sh);
    glow(S, 0x8ad8ff, 2.2, V(0, 0, -0.9), 0.4);
    lights(S, 0xd8f0ff, 0x6ad0ff);
  },
  async bonearmor(S) {
    S.add(backdrop(0x8a8068, 0x0c0a06));
    const sk = await prop("skull", 0.62, "z");
    sk.position.y = 0.35;
    S.add(sk);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe0d4b8, roughness: 0.65 });
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(G.longBone(1.1, 0.035, 1.6), mat);
      b.position.set(0, -0.55, -0.1);
      b.rotation.z = -1 + (i / 7) * 2;
      b.position.x = Math.sin(b.rotation.z) * -0.25;
      S.add(b);
    }
    lights(S, 0xfff0d8, 0xc0b090);
  },
  async pact(S) {
    S.add(backdrop(0x5a1a8a, 0x08020e));
    const c = await prop("chest", 1.4, "x");
    c.position.y = -0.4;
    c.rotation.y = -0.4;
    S.add(c);
    glow(S, 0xb060ff, 1.6, V(0, -0.1, 0.1), 0.9);
    motes(S, 0xd8a0ff, 60, [1.4, 1.6, 0.6], 0.05, V(0, 0.3, 0));
    smoke(S, 0x14041e, 6, [1.8, 1.0, 0.5], 1, 0.5, V(0, 0.6, -0.2));
    lights(S, 0xd0b0ff, 0x8a3aff);
  },
  async purify(S) {
    S.add(backdrop(0xc8b070, 0x14100a));
    const b = await prop("marble_bust", 1.5);
    b.rotation.y = 0.5;
    S.add(b);
    glow(S, 0xfff0c0, 2.4, V(0, 0.6, -0.5), 0.6);
    motes(S, 0xfff8e0, 50, [1.6, 2.2, 0.6], 0.04);
    lights(S, 0xfff4e0, 0xffe0a0, { keyI: 3.5 });
  },
  async blades(S) {
    S.add(backdrop(0x2a7ab0, 0x040a14));
    for (let i = 0; i < 3; i++) {
      const s = await sword(1.6);
      s.rotation.set(0.2, 0.2, Math.PI / 2 + (i - 1) * 0.45);
      s.position.x = (i - 1) * 0.2;
      S.add(emissive(s, 0x2a8aff, 0.4));
    }
    glow(S, 0x7ad0ff, 2, V(0, 0, -0.4), 0.6);
    motes(S, 0xa0e0ff, 50, [1.6, 2.2, 0.6], 0.05);
    lights(S, 0xd0f0ff, 0x4aa0ff);
  },
  async rage(S) {
    S.add(backdrop(0xb02a10, 0x140402));
    const m = await prop("mace", 1.6);
    m.rotation.set(0, 0.3, 0.35);
    S.add(m);
    glow(S, 0xff4a10, 2.2, V(0, 0.4, -0.4), 0.7);
    motes(S, 0xffa040, 70, [1.6, 2.2, 0.6], 0.05);
    smoke(S, 0x2a0602, 6, [1.6, 1.4, 0.5], 1, 0.5, V(0, -0.5, -0.2));
    lights(S, 0xffd0a0, 0xff3a10, { rimI: 9 });
  },
  async fire(S) {
    S.add(backdrop(0xd05a10, 0x1a0602));
    const f = await prop("fire_pit", 1.5, "x");
    f.position.y = -0.7;
    f.rotation.x = 0.35;
    S.add(f);
    for (let i = 0; i < 9; i++) glow(S, i % 2 ? 0xffa030 : 0xff5a10, 0.5 + Math.random() * 0.7, V((Math.random() - 0.5) * 0.7, -0.4 + Math.random() * 0.9, 0.1), 0.8);
    motes(S, 0xffc060, 70, [1.4, 2.2, 0.6], 0.04, V(0, 0.3, 0));
    lights(S, 0xffd0a0, 0xff6a20, { keyI: 2 });
  },
  async eclipse(S) {
    S.add(backdrop(0x6a4ab0, 0x06030e));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 48, 32), new THREE.MeshStandardMaterial({ color: 0x050308, roughness: 0.9 }));
    S.add(orb);
    glow(S, 0xd0b0ff, 1.9, V(0, 0, -0.6), 1);
    glow(S, 0xffffff, 1.3, V(0, 0, -0.7), 0.6);
    motes(S, 0xc0a0ff, 40, [1.8, 2.2, 0.4], 0.04);
    lights(S, 0x8a6aff, 0x8a6aff, { keyI: 0.5 });
  },
  async execute(S) {
    S.add(backdrop(0x8a0a10, 0x080102));
    const s = await sword(1.8);
    s.rotation.set(0.1, 0.3, Math.PI / 2 - 0.6);
    S.add(s);
    const m = await prop("mace", 1.5);
    m.rotation.set(0, -0.2, -0.6);
    m.position.z = -0.15;
    S.add(m);
    glow(S, 0xff1a1a, 2.2, V(0, 0, -0.6), 0.6);
    motes(S, 0xff4a3a, 40, [1.6, 2.2, 0.5], 0.05);
    lights(S, 0xffe0d0, 0xff1a1a, { rimI: 9 });
  },
  async doom(S) {
    S.add(backdrop(0x7a2ad0, 0x050010));
    const sk = await prop("skull", 1.05, "z");
    sk.rotation.set(-0.15, 0.25, 0);
    S.add(sk);
    for (const x of [-0.16, 0.16]) glow(S, 0xd0a0ff, 0.26, V(x, 0.08, 0.5), 1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.95, 64), new THREE.MeshBasicMaterial({ color: 0xc080ff, blending: THREE.AdditiveBlending, transparent: true, side: THREE.DoubleSide }));
    ring.rotation.x = -1.2;
    ring.position.y = -0.7;
    S.add(ring);
    glow(S, 0xa040ff, 2.6, V(0, -0.2, -0.6), 0.7);
    motes(S, 0xe0c0ff, 70, [1.8, 2.4, 0.6], 0.05);
    lights(S, 0xd8c0ff, 0x9a40ff, { rimI: 9 });
  },
  async dread(S) {
    S.add(backdrop(0x2a2a30, 0x020203));
    const l = await prop("lantern", 1.2);
    l.position.y = -0.2;
    S.add(l);
    smoke(S, 0x050508, 12, [2, 2.4, 0.6], 1.2, 0.7);
    for (const x of [-0.25, -0.13]) glow(S, 0xffc030, 0.12, V(x + 0.5, 0.65, 0.3), 1);
    lights(S, 0x8a8a9a, 0x6a6a7a, { keyI: 0.8, rimI: 2 });
  },
};

/** Generate every card illustration (keys from cards.js `art`). Resolves to Map key → dataURL. */
export function generateCardArt(keys, onEach) {
  const todo = keys.filter((k) => !cache.has(k) && ART[k]);
  if (!todo.length) return Promise.resolve(cache);
  if (pending) return pending.then(() => generateCardArt(keys, onEach));
  pending = (async () => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    } catch {
      return cache;
    }
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    let envMap = null;
    let pm = null;
    try {
      pm = new THREE.PMREMGenerator(renderer);
      envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    } catch {
      /* lights alone are fine */
    }
    for (const k of todo) {
      const scene = new THREE.Scene();
      scene.environment = envMap;
      scene.environmentIntensity = 0.5;
      const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 50);
      camera.position.set(0, 0, 4.2);
      camera.lookAt(0, 0, 0);
      try {
        await ART[k](scene);
        renderer.render(scene, camera);
        const url = canvas.toDataURL("image/webp", 0.86);
        cache.set(k, url.startsWith("data:image/webp") ? url : canvas.toDataURL("image/jpeg", 0.88));
        onEach?.(k, cache.get(k));
      } catch {
        /* a missing prop just leaves the card with its painted frame */
      }
      scene.traverse((o) => {
        if (o.isSprite) o.material.dispose();
        if ((o.isMesh || o.isSprite) && !o.userData.sharedGeo) o.geometry?.dispose();
        if (o.isMesh && !o.userData.sharedMat) o.material?.dispose?.();
      });
      await new Promise((r) => setTimeout(r, 0));
    }
    envMap?.dispose();
    pm?.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    return cache;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

export function cardArtUrl(key) {
  return cache.get(key) || null;
}
