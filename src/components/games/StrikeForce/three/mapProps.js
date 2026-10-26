/**
 * Strike Force — extra map dressing used by the desert, neon, forest and
 * snow maps: street furniture, neon signs, cranes, radar dome, campfire,
 * mountains and skyline backdrops … plus visuals for the smaller collider
 * kinds (benches, dumpsters, log piles, scaffolds …).
 *
 * install(ctx) adds handlers into the map view's KIND / PROP tables.
 */
import * as THREE from "three";
import { boxMinMax, boxFaceUV, extrude, paint, place, projectUV } from "./geo.js";
import { canvasTexture } from "./textures.js";
import { hash2 } from "../engine/maps/build.js";

export function install(ctx) {
  const { add, B, lib, M, KIND, PROP, glowSprites, lightSpots, theme, quality, group, animated } = ctx;
  const lowQ = quality === "low";
  const night = !!theme.night;
  const glow = (g, color, gi = 2.2) => add(g, null, { glow: color, gi });
  const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const along = (b) => b.x1 - b.x0 >= b.z1 - b.z0;
  const C = (b) => [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];

  /* ================================================================ kinds */
  KIND.curb = (b) => add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, 2), "concreteDark");
  KIND.pillar = (b) => {
    add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, 2), "concrete");
    add(boxMinMax(b.x0 - 0.02, 0.0, b.z0 - 0.02, b.x1 + 0.02, 1.0, b.z1 + 0.02, 1), "paintedMetal", { c: "#d9b23a" });
  };
  KIND.planter = (b) => {
    add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, 2), "concrete");
    add(boxMinMax(b.x0 + 0.15, b.y1 - 0.05, b.z0 + 0.15, b.x1 - 0.15, b.y1 + 0.01, b.z1 - 0.15, 2), "dirt");
  };
  KIND.bench = (b) => {
    const ax = along(b);
    const [cx, cz] = C(b);
    const L = ax ? b.x1 - b.x0 : b.z1 - b.z0;
    for (const off of [-0.18, 0, 0.18]) {
      const g = ax ? boxMinMax(b.x0, 0.42, cz + off - 0.07, b.x1, 0.46, cz + off + 0.07) : boxMinMax(cx + off - 0.07, 0.42, b.z0, cx + off + 0.07, 0.46, b.z1);
      add(g, "woodDark");
    }
    const back = ax ? boxMinMax(b.x0, 0.5, b.z1 - 0.08, b.x1, 0.85, b.z1 - 0.03) : boxMinMax(b.x1 - 0.08, 0.5, b.z0, b.x1 - 0.03, 0.85, b.z1);
    add(back, "woodDark");
    for (const t of [-0.4, 0.4]) {
      const p = t * L;
      const g = ax ? boxMinMax(cx + p - 0.04, 0, b.z0 + 0.05, cx + p + 0.04, 0.85, b.z1 - 0.05) : boxMinMax(b.x0 + 0.05, 0, cz + p - 0.04, b.x1 - 0.05, 0.85, cz + p + 0.04);
      add(g, "darkMetal");
    }
  };
  KIND.dumpster = (b) => {
    add(boxMinMax(b.x0 + 0.04, 0.15, b.z0 + 0.04, b.x1 - 0.04, b.y1 - 0.08, b.z1 - 0.04, 1.4), "paintedMetal", { c: b.c });
    add(boxMinMax(b.x0, b.y1 - 0.1, b.z0, b.x1, b.y1, b.z1, 1.4), "paintedMetal", { c: "#202326" });
    for (const [x, z] of [
      [b.x0 + 0.15, b.z0 + 0.15],
      [b.x1 - 0.15, b.z0 + 0.15],
      [b.x0 + 0.15, b.z1 - 0.15],
      [b.x1 - 0.15, b.z1 - 0.15],
    ])
      add(place(cyl(0.08, 0.08, 0.06, 8), x, 0.08, z, Math.PI / 2, 0, 0), "rubber");
  };
  KIND.scaffold = (b) => {
    add(boxMinMax(b.x0, b.y1 - 0.08, b.z0, b.x1, b.y1, b.z1, 1.2), "metalGrate");
    const xs = [b.x0 + 0.05, (b.x0 + b.x1) / 2, b.x1 - 0.05];
    for (const x of xs)
      for (const z of [b.z0 + 0.05, b.z1 - 0.05]) {
        add(place(cyl(0.035, 0.035, b.y1 + 1.1, 6), x, (b.y1 + 1.1) / 2, z), "steel", { c: "#c9a227" });
      }
    for (const z of [b.z0 + 0.05, b.z1 - 0.05]) add(boxMinMax(b.x0, b.y1 + 1.0, z - 0.03, b.x1, b.y1 + 1.06, z + 0.03), "steel", { c: "#c9a227" });
    for (const z of [b.z0 + 0.05, b.z1 - 0.05]) {
      const L = Math.hypot(b.x1 - b.x0, b.y1);
      const g = new THREE.BoxGeometry(L, 0.05, 0.05);
      place(g, (b.x0 + b.x1) / 2, b.y1 / 2, z, 0, 0, Math.atan2(b.y1, b.x1 - b.x0));
      add(g, "steel", { c: "#c9a227" });
    }
  };
  KIND.arcade = (b) => {
    const [cx] = C(b);
    add(extrude([[b.z1, 0], [b.z0, 0], [b.z0, 1.0], [b.z0 + 0.2, 1.4], [b.z0 + 0.1, 1.8], [b.z1, 1.8]], b.x1 - b.x0).rotateY(-Math.PI / 2).translate(cx, 0, 0), "darkMetal", { c: b.c });
  };
  KIND.fountain = (b) => {
    const [cx, cz] = C(b);
    const r = (b.x1 - b.x0) / 2;
    add(place(cyl(r, r, b.y1, 20), cx, b.y1 / 2, cz), "concrete");
    add(place(cyl(0.25, 0.3, 1.4, 10), cx, 0.7, cz), "concrete");
    add(place(cyl(0.6, 0.4, 0.15, 14), cx, 1.35, cz), "concrete");
  };
  KIND.tent = (b) => {
    const ax = along(b);
    const W = ax ? b.z1 - b.z0 : b.x1 - b.x0;
    const L = ax ? b.x1 - b.x0 : b.z1 - b.z0;
    const H = b.y1 - b.y0;
    const g = extrude(
      [
        [-W / 2, 0],
        [W / 2, 0],
        [W / 2, H * 0.45],
        [0, H],
        [-W / 2, H * 0.45],
      ],
      L,
    );
    if (ax) g.rotateY(Math.PI / 2);
    const [cx, cz] = C(b);
    g.translate(cx, 0, cz);
    projectUV(g, 1.6);
    add(g, "sandbag", { c: b.c || "#a89670" });
    aoPush(b);
  };
  KIND.well = () => {};
  KIND.kiosk = () => {};
  KIND.busStop = () => {};
  const logCyl = (b, n = 1) => {
    const ax = along(b);
    const L = ax ? b.x1 - b.x0 : b.z1 - b.z0;
    const W = ax ? b.z1 - b.z0 : b.x1 - b.x0;
    const H = b.y1 - b.y0;
    const [cx, cz] = C(b);
    const rows = n > 1 ? Math.max(1, Math.round(H / (W / n))) : 1;
    const r = n > 1 ? W / n / 2 : Math.min(W, H) / 2;
    for (let row = 0; row < rows; row++) {
      const per = n - (row % 2);
      for (let k = 0; k < per; k++) {
        const off = -W / 2 + r + (row % 2 ? r : 0) + k * r * 2;
        const y = b.y0 + r + row * r * 1.72;
        if (y + r > b.y1 + 0.05) continue;
        const g = cyl(r * (0.9 + hash2(k, row) * 0.12), r, L * (0.92 + hash2(row, k) * 0.08), lowQ ? 8 : 12);
        if (ax) place(g, cx, y, cz + off, 0, 0, Math.PI / 2);
        else place(g, cx + off, y, cz, Math.PI / 2, 0, 0);
        projectUV(g, 1.4);
        add(g, "logs");
        // cut ends
        for (const s of [-1, 1]) {
          const e = new THREE.CircleGeometry(r * 0.96, 10);
          if (ax) {
            e.rotateY((s * Math.PI) / 2);
            e.translate(cx + s * L * 0.46, y, cz + off);
          } else {
            e.rotateY(s > 0 ? 0 : Math.PI);
            e.translate(cx + off, y, cz + s * L * 0.46);
          }
          add(e, "wood", { c: "#d9b98a" });
        }
      }
    }
  };
  KIND.logs = (b) => logCyl(b, 1);
  KIND.trunkLog = (b) => logCyl(b, 1);
  KIND.logpile = (b) => (logCyl(b, 4), aoPush(b));
  KIND.woodpile = (b) => logCyl(b, 4);
  KIND.lumber = (b) => {
    const H = b.y1 - b.y0;
    const n = Math.max(2, Math.round(H / 0.12));
    for (let k = 0; k < n; k++) {
      const y = b.y0 + (k * H) / n;
      const shrink = hash2(k, b.x0) * 0.1;
      add(boxMinMax(b.x0 + shrink, y + 0.005, b.z0 + shrink, b.x1 - shrink, y + H / n - 0.008, b.z1 - shrink, 1.5), "wood", { c: k % 3 ? "#e1c79a" : "#cdb184" });
    }
    aoPush(b);
  };
  KIND.sawbench = (b) => {
    add(boxMinMax(b.x0, 0.8, b.z0, b.x1, 0.95, b.z1, 1.5), "steel");
    for (const x of [b.x0 + 0.2, b.x1 - 0.2]) for (const z of [b.z0 + 0.1, b.z1 - 0.1]) add(boxMinMax(x - 0.06, 0, z - 0.06, x + 0.06, 0.8, z + 0.06), "darkMetal");
    const [cx, cz] = C(b);
    add(place(cyl(0.55, 0.55, 0.02, 24), cx, 0.95, cz, Math.PI / 2, 0, 0), "chrome");
    add(boxMinMax(cx - 0.6, 0.95, cz - 0.25, cx + 0.6, 1.3, cz + 0.25), "paintedMetal", { c: "#c9a227" });
  };
  KIND.generator = (b) => {
    add(boxMinMax(b.x0, 0.12, b.z0, b.x1, b.y1, b.z1, 1.4), "paintedMetal", { c: b.c });
    add(boxMinMax(b.x0 - 0.05, 0, b.z0 - 0.05, b.x1 + 0.05, 0.12, b.z1 + 0.05, 1), "darkMetal");
    const ax = along(b);
    for (let k = 0; k < 6; k++) {
      const t = 0.15 + k * 0.1;
      if (ax) add(boxMinMax(b.x0 + (b.x1 - b.x0) * t, 0.4, b.z1, b.x0 + (b.x1 - b.x0) * t + 0.04, b.y1 - 0.2, b.z1 + 0.02), "darkMetal");
      else add(boxMinMax(b.x1, 0.4, b.z0 + (b.z1 - b.z0) * t, b.x1 + 0.02, b.y1 - 0.2, b.z0 + (b.z1 - b.z0) * t + 0.04), "darkMetal");
    }
    add(place(cyl(0.08, 0.08, 0.7, 8), b.x1 - 0.3, b.y1 + 0.35, b.z0 + 0.3), "darkMetal");
    aoPush(b);
  };
  KIND.pipeRack = (b) => {
    const ax = along(b);
    const [cx, cz] = C(b);
    const L = ax ? b.x1 - b.x0 : b.z1 - b.z0;
    for (let t = -L / 2; t <= L / 2 + 0.01; t += L / 3) {
      const x = ax ? cx + t : cx;
      const z = ax ? cz : cz + t;
      add(boxMinMax(x - 0.08, 0, z - 0.3, x + 0.08, b.y1, z + 0.3), "steel", { c: "#c9a227" });
    }
  };
  KIND.desk = KIND.desk || ((b) => add(boxMinMax(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, 1), "steel"));

  /* ================================================================ props */
  PROP.mountains = (p) => {
    // unlit ring of ridges with baked sun shading and atmospheric haze
    const seg = lowQ ? 64 : 128;
    const R = p.dist;
    const H = p.height;
    const geo = new THREE.CylinderGeometry(R, R * 1.25, H, seg, 8, true);
    const pos = geo.attributes.position;
    const base = new THREE.Color(p.tint);
    const haze = new THREE.Color(theme.fog?.color || "#cccccc");
    const snow = new THREE.Color("#f4f7fa");
    const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - (theme.sky?.elevation ?? 30)), THREE.MathUtils.degToRad(theme.sky?.azimuth ?? 0));
    const hAt = (a, t) => {
      const ridge = 0.5 + 0.28 * Math.sin(a * 5 + p.seed) * Math.cos(a * 3.3 + p.seed * 2) + 0.16 * Math.sin(a * 13 + p.seed * 5) + 0.06 * Math.sin(a * 41 + p.seed);
      return t * Math.max(0.12, ridge) * H;
    };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const t = (y + H / 2) / H;
      const inward = 1 - t * 0.3;
      pos.setXYZ(i, x * inward, hAt(a, t) - 4, z * inward);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      n.set(-nrm.getX(i), -nrm.getY(i), -nrm.getZ(i)); // faces point inward
      const lit = 0.55 + 0.45 * Math.max(0, n.dot(sun));
      const k = Math.min(1, Math.max(0, pos.getY(i) + 4) / H);
      const c = base.clone().multiplyScalar(lit);
      const snowLine = p.snow ? 0.3 : 0.62;
      if (k > snowLine) c.lerp(snow.clone().multiplyScalar(0.75 + 0.25 * lit), Math.min(1, (k - snowLine) * 4));
      c.lerp(haze, 0.62 - k * 0.32);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = lib.track(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((ctx.bounds.minX + ctx.bounds.maxX) / 2, 0, (ctx.bounds.minZ + ctx.bounds.maxZ) / 2);
    mesh.renderOrder = -1;
    group.add(mesh);
  };
  PROP.skyline = (p) => {
    const rnd = (k) => hash2(k * 3.1, p.seed + k);
    const geos = [];
    const lit = [];
    for (let k = 0; k < (lowQ ? 40 : 80); k++) {
      const a = (k / (lowQ ? 40 : 80)) * Math.PI * 2;
      const d = 110 + rnd(k) * 120;
      const w = 12 + rnd(k + 1) * 22;
      const h = 30 + rnd(k + 2) * 90;
      const g = boxMinMax(-w / 2, 0, -w / 2, w / 2, h, w / 2);
      place(g, Math.cos(a) * d, 0, Math.sin(a) * d, 0, a, 0);
      geos.push(g);
      if (rnd(k + 3) > 0.4) lit.push([Math.cos(a) * (d - w / 2 - 0.2), h, Math.sin(a) * (d - w / 2 - 0.2), a, w]);
    }
    const tex = canvasTexture(
      64,
      128,
      (g, w, h) => {
        g.fillStyle = "#0b0e18";
        g.fillRect(0, 0, w, h);
        for (let y = 4; y < h; y += 8)
          for (let x = 3; x < w; x += 7) {
            const r = Math.random();
            g.fillStyle = r > 0.72 ? "#ffcf8a" : r > 0.6 ? "#9fd6ff" : "#141a26";
            g.fillRect(x, y, 4, 5);
          }
      },
      "skylineWin",
    );
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = lib.track(new THREE.MeshBasicMaterial({ map: tex, color: "#8a8fa8", fog: false }));
    for (const g of geos) {
      const uv = g.attributes.uv;
      const pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, (pos.getY(i) / 40) * 3);
      B.add(g, mat, { shadow: false, receive: false });
    }
    for (const [x, h, z] of lit) glowSprites.push({ x, y: h + 1.5, z, s: 3, color: "#ff3a2a", o: 0.8, blink: 1.4 + (x % 1) });
  };
  PROP.crosswalk = (p) => {
    const white = lib.plain("#e2e0d8", { rough: 0.6 });
    for (let k = -p.w / 2 + 0.4; k < p.w / 2; k += 1.0) {
      B.add(boxMinMax(p.x + k, 0.015, p.z - p.d / 2 + 5.3, p.x + k + 0.55, 0.025, p.z - p.d / 2 + 7.4), white, { shadow: false });
      B.add(boxMinMax(p.x + k, 0.015, p.z + p.d / 2 - 7.4, p.x + k + 0.55, 0.025, p.z + p.d / 2 - 5.3), white, { shadow: false });
    }
  };
  const signTex = (text, color, w = 512, h = 128) =>
    canvasTexture(
      w,
      h,
      (g) => {
        g.fillStyle = "#000000";
        g.fillRect(0, 0, w, h);
        g.font = `900 ${Math.round(h * 0.62)}px "Arial Black", Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.shadowColor = color;
        g.shadowBlur = h * 0.18;
        g.strokeStyle = color;
        g.lineWidth = h * 0.06;
        g.strokeText(text, w / 2, h / 2 + 4);
        g.fillStyle = "#ffffff";
        g.fillText(text, w / 2, h / 2 + 4);
      },
      "neon|" + text + color,
    );
  PROP.neon = (p) => {
    const w = p.w;
    const h = (p.big ? 0.42 : 0.3) * w;
    const tex = signTex(p.text, p.color);
    const mat = lib.track(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color("#ffffff").multiplyScalar(night ? 2.2 : 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const g = new THREE.PlaneGeometry(w, h);
    const rot = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[p.face] || 0;
    g.rotateY(rot);
    const off = 0.06;
    const dx = p.face === "e" ? off : p.face === "w" ? -off : 0;
    const dz = p.face === "s" ? off : p.face === "n" ? -off : 0;
    g.translate(p.x + dx, p.y + h / 2, p.z + dz);
    B.add(g, mat, { shadow: false, receive: false });
    // backing board
    const bb = boxMinMax(-w / 2 - 0.1, -0.08, -0.06, w / 2 + 0.1, h + 0.08, 0.0);
    bb.rotateY(rot);
    bb.translate(p.x, p.y, p.z);
    add(bb, "darkMetal");
    lightSpots.push({ x: p.x + dx * 30, y: p.y - 0.5, z: p.z + dz * 30, color: p.color, neon: true, r: 12 });
  };
  PROP.billboard = (p) => {
    const tex = canvasTexture(
      768,
      288,
      (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, "#081a2e");
        grd.addColorStop(1, "#1d0b33");
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
        g.fillStyle = p.color;
        g.globalAlpha = 0.25;
        for (let i = 0; i < 12; i++) g.fillRect(i * 70 - 40, 0, 26, h);
        g.globalAlpha = 1;
        g.font = '900 96px "Arial Black", Arial, sans-serif';
        g.fillStyle = "#ffffff";
        g.shadowColor = p.color;
        g.shadowBlur = 30;
        g.fillText(p.text.split(" ")[0], 40, 130);
        g.fillStyle = p.color;
        g.fillText(p.text.split(" ")[1] || "", 40, 235);
        g.shadowBlur = 0;
        g.beginPath();
        g.fillStyle = p.color;
        g.arc(640, 150, 90, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#081a2e";
        g.font = '900 120px "Arial Black", Arial, sans-serif';
        g.fillText("⚡", 585, 195);
      },
      "billboard|" + p.text,
    );
    const mat = lib.track(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color("#ffffff").multiplyScalar(night ? 1.5 : 1), toneMapped: false }));
    const g = new THREE.PlaneGeometry(p.w, p.h);
    g.translate(p.x, p.y, p.z + 0.12);
    B.add(g, mat, { shadow: false });
    add(boxMinMax(p.x - p.w / 2 - 0.2, p.y - p.h / 2 - 0.2, p.z - 0.1, p.x + p.w / 2 + 0.2, p.y + p.h / 2 + 0.2, p.z + 0.1), "darkMetal");
    for (const s of [-1, 1]) add(boxMinMax(p.x + s * p.w * 0.3 - 0.12, p.y - p.h / 2 - 3, p.z - 0.4, p.x + s * p.w * 0.3 + 0.12, p.y - p.h / 2, p.z - 0.15), "steel");
  };
  PROP.kiosk = (p) => {
    add(boxMinMax(p.x - 1.1, 0, p.z - 1.1, p.x + 1.1, 2.4, p.z + 1.1, 1.4), "paintedMetal", { c: "#2a2f36" });
    add(boxMinMax(p.x - 1.3, 2.4, p.z - 1.3, p.x + 1.3, 2.6, p.z + 1.3, 1.4), "paintedMetal", { c: p.c });
    glow(boxMinMax(p.x + 1.11, 1.0, p.z - 0.8, p.x + 1.12, 2.0, p.z + 0.8), "#cfefff", 1.6);
    glow(boxMinMax(p.x - 1.31, 2.42, p.z - 1.31, p.x + 1.31, 2.5, p.z + 1.31), p.c, 2);
  };
  PROP.acUnits = (p) => {
    for (let k = 0; k < p.n; k++) {
      const z = p.z - 3 + k * 3;
      const y = 3 + (k % 2) * 3;
      add(boxMinMax(p.x - 0.5, y, z - 0.5, p.x + 0.05, y + 0.6, z + 0.5, 1), "paintedMetal", { c: "#b8bcbf" });
      add(place(cyl(0.22, 0.22, 0.02, 14), p.x - 0.5, y + 0.3, z, 0, 0, Math.PI / 2), "darkMetal");
    }
  };
  PROP.towerCrane = (p) => {
    const yel = "#e2a12c";
    const s = 1.6;
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      add(boxMinMax(p.x + (dx * s) / 2 - 0.12, 0, p.z + (dz * s) / 2 - 0.12, p.x + (dx * s) / 2 + 0.12, p.h, p.z + (dz * s) / 2 + 0.12, 2), "paintedMetal", { c: yel });
    for (let y = 2; y < p.h; y += 2.6) {
      const g = new THREE.BoxGeometry(s * 1.4, 0.07, 0.07);
      place(g, p.x, y, p.z - s / 2, 0, 0, 0.9);
      add(g, "paintedMetal", { c: yel });
      const g2 = new THREE.BoxGeometry(0.07, 0.07, s * 1.4);
      place(g2, p.x - s / 2, y, p.z, 0.9, 0, 0);
      add(g2, "paintedMetal", { c: yel });
    }
    add(boxMinMax(p.x - 30, p.h, p.z - 0.7, p.x + 10, p.h + 1.4, p.z + 0.7, 2), "paintedMetal", { c: yel });
    add(boxMinMax(p.x + 4, p.h - 2, p.z - 1.2, p.x + 9, p.h, p.z + 1.2, 2), "concreteDark");
    add(boxMinMax(p.x - 1.2, p.h - 2.4, p.z - 1.2, p.x + 1.2, p.h, p.z + 1.2), "glass");
    add(place(cyl(0.02, 0.02, 14, 4), p.x - 18, p.h - 7, p.z), "darkMetal");
    add(boxMinMax(p.x - 19, p.h - 15, p.z - 1, p.x - 17, p.h - 14, p.z + 1), "concrete");
    glowSprites.push({ x: p.x - 30, y: p.h + 1.6, z: p.z, s: 2.5, color: "#ff3a2a", o: 0.9, blink: 1.3 });
    glowSprites.push({ x: p.x, y: p.h + 2, z: p.z, s: 2.5, color: "#ff3a2a", o: 0.9, blink: 1.7 });
  };
  PROP.cones = (p) => {
    for (let k = 0; k < p.n; k++) {
      const x = p.x + (p.along === "x" ? k * 1.2 : 0);
      const z = p.z + (p.along === "x" ? 0 : k * 1.2);
      add(place(new THREE.ConeGeometry(0.16, 0.6, 10), x, 0.32, z), "paintedMetal", { c: "#ff6a1a" });
      add(place(cyl(0.13, 0.15, 0.08, 10), x, 0.34, z), "paintedMetal", { c: "#f2f2f2" });
      add(boxMinMax(x - 0.22, 0, z - 0.22, x + 0.22, 0.03, z + 0.22), "rubber");
    }
  };
  PROP.arcadeScreens = (p) => {
    const cols = ["#3fe9ff", "#ff3fa8", "#7dff8a", "#ffd34f"];
    p.xs.forEach((x, i) => {
      glow(boxMinMax(x - 0.38, p.y, p.z - 0.31, x + 0.38, p.y + 0.42, p.z - 0.3), cols[i % 4], 1.8);
      lightSpots.push({ x, y: p.y, z: p.z - 1.0, color: cols[i % 4], interior: true, r: 4 });
    });
  };
  PROP.fountain = (p) => {
    const g = new THREE.CircleGeometry(1.15, 24);
    g.rotateX(-Math.PI / 2);
    g.translate(p.x, 0.62, p.z);
    B.add(g, lib.plain("#2a5a6a", { rough: 0.05, metal: 0.3 }), { shadow: false });
    glowSprites.push({ x: p.x, y: 1.6, z: p.z, s: 1.4, color: "#9fe3ff", o: 0.5 });
  };
  PROP.busStop = (p) => {
    const x0 = p.x - 1.6;
    const x1 = p.x + 1.6;
    for (const x of [x0 + 0.05, x1 - 0.05]) add(boxMinMax(x - 0.04, 0, p.z - 0.6, x + 0.04, 2.5, p.z - 0.52), "steel");
    add(boxMinMax(x0, 2.5, p.z - 0.9, x1, 2.58, p.z + 0.5), "steel");
    add(boxMinMax(x0 + 0.1, 0.3, p.z - 0.58, x1 - 0.1, 2.3, p.z - 0.55), "glass");
    glow(boxMinMax(x1 - 0.06, 0.4, p.z - 0.3, x1 - 0.04, 2.0, p.z + 0.4), "#9fd6ff", 1.4);
    add(boxMinMax(x0 + 0.3, 0.45, p.z - 0.5, x1 - 0.3, 0.5, p.z - 0.2), "woodDark");
  };
  PROP.trafficLight = (p) => {
    add(place(cyl(0.07, 0.09, 5, 8), p.x, 2.5, p.z), "darkMetal");
    const dir = p.z < 0 ? 1 : -1;
    add(boxMinMax(p.x - 0.05, 4.9, p.z, p.x + 0.05, 5.0, p.z + dir * 3.2), "darkMetal");
    const lz = p.z + dir * 3;
    add(boxMinMax(p.x - 0.2, 4.0, lz - 0.2, p.x + 0.2, 4.9, lz + 0.2), "darkMetal");
    const k = hash2(p.x, p.z) > 0.5;
    glow(place(new THREE.CircleGeometry(0.1, 10).rotateY(Math.PI / 2), p.x - 0.21, 4.72, lz), k ? "#ff2a1e" : "#2a0000", k ? 3 : 1);
    glow(place(new THREE.CircleGeometry(0.1, 10).rotateY(Math.PI / 2), p.x - 0.21, 4.18, lz), k ? "#002a08" : "#29ff6a", k ? 1 : 3);
    glowSprites.push({ x: p.x - 0.3, y: k ? 4.72 : 4.18, z: lz, s: 1.2, color: k ? "#ff3a2a" : "#3aff7a", o: 0.6 });
  };
  PROP.cables = (p) => {
    for (const z of p.zs)
      for (let x = p.x0; x < p.x1; x += 13) {
        const pts = [];
        for (let t = 0; t <= 8; t++) pts.push(new THREE.Vector3(x + (13 * t) / 8, p.y - Math.sin((t / 8) * Math.PI) * 0.7, z));
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.015, 4);
        add(g, "rubber", { shadow: false });
      }
  };
  PROP.flagpole = (p) => {
    add(place(cyl(0.05, 0.07, p.h, 8), p.x, p.h / 2, p.z), "steel");
    const tex = canvasTexture(
      256,
      160,
      (g, w, h) => {
        g.fillStyle = "#3c4a2f";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#d8c8a0";
        g.fillRect(0, h * 0.4, w, h * 0.2);
        g.fillStyle = "#c0392b";
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(w * 0.4, h / 2);
        g.lineTo(0, h);
        g.fill();
      },
      "outpostFlag",
    );
    const mat = lib.track(new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
    const g = new THREE.PlaneGeometry(1.8, 1.1, 8, 3);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 3) * 0.12 * (pos.getX(i) + 0.9));
    g.computeVertexNormals();
    g.translate(p.x + 0.95, p.h - 0.6, p.z);
    B.add(g, mat, { shadow: true });
  };
  PROP.antenna = (p) => {
    for (const [dx, dz] of [
      [-0.3, -0.3],
      [0.3, -0.3],
      [0, 0.3],
    ])
      add(place(cyl(0.03, 0.05, p.h, 6), p.x + dx * (1 - 0.3), p.h / 2, p.z + dz * 0.7), "steel", { c: "#c9ccd0" });
    for (let y = 1.5; y < p.h; y += 1.5) add(place(new THREE.TorusGeometry(0.3, 0.015, 3, 6), p.x, y, p.z, Math.PI / 2, 0, 0), "steel");
    glowSprites.push({ x: p.x, y: p.h + 0.2, z: p.z, s: 1.6, color: "#ff3a2a", o: 0.9, blink: 1.5 });
    add(place(new THREE.SphereGeometry(0.1, 8, 6), p.x, p.h + 0.15, p.z), null, { glow: "#ff3b1f", gi: 2.5 });
  };
  PROP.mast = (p) => {
    PROP.antenna(p);
    for (const [y, a] of [
      [p.h * 0.6, 0.6],
      [p.h * 0.75, 2.6],
    ]) {
      const g = new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6);
      place(g, p.x + Math.cos(a) * 0.5, y, p.z + Math.sin(a) * 0.5, Math.PI / 2, a, 0);
      add(g, "paintedMetal", { c: "#e8eaec" });
    }
  };
  PROP.dish = (p) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const r = (i / 10) * p.r;
      pts.push(new THREE.Vector2(r, (r * r) / (p.r * 2.4)));
    }
    const g = new THREE.LatheGeometry(pts, lowQ ? 16 : 28);
    place(g, p.x, 3.2, p.z, -0.9, 0.6, 0);
    add(g, "paintedMetal", { c: "#eef0f2" });
    add(place(cyl(0.18, 0.25, 1.8, 10), p.x, 2.3, p.z), "steel");
    add(place(cyl(0.03, 0.03, 1.6, 6), p.x, 3.8, p.z + 0.4, 0.6, 0, 0), "steel");
  };
  PROP.radome = (p) => {
    const g = new THREE.IcosahedronGeometry(p.r, lowQ ? 1 : 2);
    place(g, p.x, p.y + p.r * 0.85, p.z);
    const mat = lib.plain("#eef1f4", { rough: 0.55, flat: true });
    B.add(g, mat);
    add(place(cyl(p.r * 0.8, p.r * 0.9, 0.6, 16), p.x, p.y + 0.3, p.z), "concrete");
    glowSprites.push({ x: p.x, y: p.y + p.r * 1.9, z: p.z, s: 1.6, color: "#ff3a2a", o: 0.9, blink: 1.2 });
  };
  PROP.pipes = (p) => {
    for (const [dz, r, c] of [
      [-0.18, 0.14, "#b9c3cb"],
      [0.12, 0.1, "#c9a227"],
      [0.32, 0.08, "#8a3b2e"],
    ]) {
      const g = cyl(r, r, p.x1 - p.x0 + 2, 12);
      place(g, (p.x0 + p.x1) / 2, p.y + r, p.z + dz, 0, 0, Math.PI / 2);
      add(g, "paintedMetal", { c });
    }
  };
  PROP.windsock = (p) => {
    add(place(cyl(0.04, 0.05, 5, 6), p.x, 2.5, p.z), "steel");
    const g = new THREE.CylinderGeometry(0.2, 0.32, 1.4, 10, 1, true);
    place(g, p.x + 0.75, 4.8, p.z, 0, 0, Math.PI / 2 + 0.2);
    add(g, "paintedMetal", { c: "#ff6a1a" });
  };
  PROP.helipad = (p) => {
    const tex = canvasTexture(
      256,
      256,
      (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.strokeStyle = "#e9b824";
        g.lineWidth = 10;
        g.beginPath();
        g.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = "#f2f2f2";
        g.font = "900 150px Arial, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("H", w / 2, h / 2 + 8);
      },
      "helipad",
    );
    const mat = lib.track(new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    const g = new THREE.PlaneGeometry(p.r * 2, p.r * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(p.x, 0.03, p.z);
    B.add(g, mat, { shadow: false });
  };
  PROP.camoNet = (p) => {
    const g = new THREE.PlaneGeometry(p.w, p.d, 10, 8);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const edge = Math.max(Math.abs(x) / (p.w / 2), Math.abs(z) / (p.d / 2));
      pos.setY(i, -0.35 * (1 - edge) * (1 - edge) + Math.sin(x * 3 + z * 2) * 0.06);
    }
    g.computeVertexNormals();
    g.translate(p.x, p.h, p.z);
    const mat = lib.plain("#6b6a48", { rough: 0.95, side: THREE.DoubleSide, flat: true });
    B.add(g, mat, { shadow: true });
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      add(place(cyl(0.04, 0.04, p.h, 6), p.x + (dx * p.w) / 2.2, p.h / 2, p.z + (dz * p.d) / 2.2), "woodDark");
  };
  PROP.awning = (p) => {
    const tex = canvasTexture(
      128,
      32,
      (g, w, h) => {
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? "#efe6d2" : p.c;
          g.fillRect((i * w) / 8, 0, w / 8, h);
        }
      },
      "awning|" + p.c,
    );
    const mat = lib.track(new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
    const g = new THREE.PlaneGeometry(p.w, p.d);
    g.rotateX(-Math.PI / 2 + 0.25);
    g.translate(p.x, p.h, p.z);
    B.add(g, mat, { shadow: true });
    for (const s of [-1, 1]) add(place(cyl(0.035, 0.035, p.h, 6), p.x + (s * p.w) / 2.1, p.h / 2, p.z + p.d / 2.2), "woodDark");
  };
  PROP.well = (p) => {
    add(place(new THREE.TorusGeometry(0.7, 0.16, 8, 16), p.x, 0.8, p.z, Math.PI / 2, 0, 0), "plasterSand");
    add(place(cyl(0.78, 0.82, 0.8, 16, 1), p.x, 0.4, p.z), "plasterSand");
    for (const s of [-1, 1]) add(boxMinMax(p.x + s * 0.75 - 0.05, 0.8, p.z - 0.05, p.x + s * 0.75 + 0.05, 2.2, p.z + 0.05), "woodDark");
    add(place(cyl(0.05, 0.05, 1.6, 6), p.x, 2.1, p.z, 0, 0, Math.PI / 2), "woodDark");
  };
  PROP.campfire = (p) => {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      add(place(cyl(0.07, 0.08, 0.9, 6), p.x + Math.cos(a) * 0.15, 0.12, p.z + Math.sin(a) * 0.15, Math.PI / 2 - 0.35, a, 0), "logs");
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add(place(new THREE.DodecahedronGeometry(0.16, 0), p.x + Math.cos(a) * 0.55, 0.08, p.z + Math.sin(a) * 0.55), "rock");
    }
    glowSprites.push({ x: p.x, y: 0.45, z: p.z, s: 1.4, color: "#ffb24a", o: 0.95, flicker: true });
    glowSprites.push({ x: p.x, y: 0.7, z: p.z, s: 2.8, color: "#ff7a2a", o: 0.45, flicker: true });
    lightSpots.push({ x: p.x, y: 0.9, z: p.z, color: "#ff9a4a", r: 9, flicker: true });
  };
  void animated;
  void M;
  void boxFaceUV;
  void paint;
  function aoPush(b) {
    ctx.aoBoxes.push(b);
  }
}
