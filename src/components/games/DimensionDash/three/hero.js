/**
 * Dimension Dash — the hedgehog model + procedural animation.
 *
 * Personal fan-made prototype: an original procedural model in the spirit of
 * the classic blue hedgehog (no ripped / official assets). Built from
 * primitives in a small rig (feet at the origin, facing +Z):
 *
 *   root ─ body (bob / lean / squash)
 *          ├─ hips ─ legL / legR (thigh → knee → shin → shoe)
 *          └─ torso (blue back, peach belly, back spikes, tail)
 *               ├─ head (big blue dome, quills, muzzle, nose, eyes, ears)
 *               └─ armL / armR (upper → elbow → forearm → glove + cuff)
 *   ball ─ spin-ball form (jump / roll / spin dash / homing) + blur shell
 *   blur ─ figure-8 leg blur shown at top speed
 *
 * animate(st, dt) blends toward a target pose per state with damped joints:
 * idle (breath + foot tap), walk, run, max-speed run, jump (ball), spin
 * dash charge, homing, landing squash, skid, crouch, spring, fall, grind,
 * hurt, victory, dead.
 */
import * as THREE from "three";

const C = {
  blue: "#1f4fe0",
  blueDark: "#163ab0",
  peach: "#f6c99a",
  white: "#ffffff",
  green: "#2fb84a",
  black: "#0d0d12",
  red: "#e4261e",
  redDark: "#a8150f",
  gold: "#f3c234",
  sole: "#f2f2f2",
};

function spikeTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = C.blue;
  g.fillRect(0, 0, 256, 128);
  // swirl of darker quill streaks for the spin ball
  g.strokeStyle = C.blueDark;
  g.lineWidth = 10;
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    const x = i * 32;
    g.moveTo(x, 128);
    g.quadraticCurveTo(x + 22, 64, x + 6, 0);
    g.stroke();
  }
  g.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.ellipse(i * 32 + 14, 40, 4, 16, 0.3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function blurTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 62);
  grd.addColorStop(0, "rgba(228,38,30,0.0)");
  grd.addColorStop(0.45, "rgba(228,38,30,0.75)");
  grd.addColorStop(0.75, "rgba(255,255,255,0.35)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createHero({ shadows = true } = {}) {
  const geos = [];
  const mats = [];
  const texs = [];
  const geo = (g) => (geos.push(g), g);
  const std = (color, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.02, ...o });
    m.userData.base = new THREE.Color(color);
    mats.push(m);
    return m;
  };
  const M = {
    blue: std(C.blue, { roughness: 0.38 }),
    peach: std(C.peach, { roughness: 0.6 }),
    white: std(C.white, { roughness: 0.5 }),
    eye: std("#ffffff", { roughness: 0.15 }),
    iris: std(C.green, { roughness: 0.2, emissive: "#0a3a10", emissiveIntensity: 0.25 }),
    black: std(C.black, { roughness: 0.25 }),
    red: std(C.red, { roughness: 0.32 }),
    redDark: std(C.redDark, { roughness: 0.4 }),
    gold: std(C.gold, { roughness: 0.25, metalness: 0.6 }),
    sole: std(C.sole, { roughness: 0.6 }),
  };
  const SPH = geo(new THREE.SphereGeometry(1, 28, 20));
  const SPH_LO = geo(new THREE.SphereGeometry(1, 14, 10));
  const CAP = geo(new THREE.CapsuleGeometry(1, 1, 6, 12));
  const CONE = geo(new THREE.ConeGeometry(1, 1, 14, 1));
  const TOR = geo(new THREE.TorusGeometry(1, 0.35, 8, 20));
  const mesh = (g, m, parent, pos, scale, rot) => {
    const o = new THREE.Mesh(g, m);
    if (pos) o.position.set(pos[0], pos[1], pos[2]);
    if (scale) o.scale.set(scale[0], scale[1], scale[2]);
    if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
    o.castShadow = shadows;
    parent.add(o);
    return o;
  };
  const node = (parent, pos) => {
    const o = new THREE.Group();
    if (pos) o.position.set(pos[0], pos[1], pos[2]);
    parent.add(o);
    return o;
  };

  const root = new THREE.Group();
  root.name = "hero";
  const figure = node(root);
  const body = node(figure, [0, 0, 0]);
  const hips = node(body, [0, 0.46, 0]);
  const torso = node(hips, [0, 0.04, 0]);

  /* ---- torso: compact blue body, peach belly */
  mesh(SPH, M.blue, torso, [0, 0.16, -0.01], [0.2, 0.25, 0.18]);
  mesh(SPH, M.peach, torso, [0, 0.13, 0.07], [0.15, 0.19, 0.12]);
  // back spikes + tail
  mesh(CONE, M.blue, torso, [0, 0.25, -0.16], [0.07, 0.2, 0.07], [-2.2, 0, 0]);
  mesh(CONE, M.blue, torso, [0, 0.12, -0.17], [0.06, 0.16, 0.06], [-2.3, 0, 0]);
  mesh(CONE, M.blue, torso, [0, -0.04, -0.15], [0.05, 0.12, 0.05], [-2.4, 0, 0]);

  /* ---- head */
  const neck = node(torso, [0, 0.34, 0.0]);
  const head = node(neck, [0, 0.28, 0.02]);
  mesh(SPH, M.blue, head, [0, 0, 0], [0.34, 0.31, 0.32]);
  // quills: three big sweeping back + two side + top
  const quill = (pos, scale, rot) => {
    const q = mesh(CONE, M.blue, head, pos, scale, rot);
    return q;
  };
  quill([0, 0.12, -0.3], [0.13, 0.5, 0.12], [-1.95, 0, 0]);
  quill([0, -0.04, -0.33], [0.14, 0.56, 0.12], [-1.68, 0, 0]);
  quill([0, -0.19, -0.27], [0.12, 0.46, 0.11], [-1.35, 0, 0]);
  quill([0.17, 0.02, -0.26], [0.1, 0.4, 0.09], [-1.75, 0.0, -0.45]);
  quill([-0.17, 0.02, -0.26], [0.1, 0.4, 0.09], [-1.75, 0.0, 0.45]);
  quill([0, 0.25, -0.16], [0.11, 0.34, 0.1], [-2.35, 0, 0]);
  // muzzle + chin
  mesh(SPH, M.peach, head, [0, -0.12, 0.2], [0.21, 0.15, 0.16]);
  mesh(SPH_LO, M.peach, head, [0, -0.19, 0.16], [0.13, 0.08, 0.1]);
  // smile line
  mesh(geo(new THREE.TorusGeometry(0.075, 0.009, 6, 16, Math.PI * 0.7)), M.black, head, [0.02, -0.16, 0.335], null, [0.15, 0, Math.PI + 0.55]);
  // nose
  mesh(SPH_LO, M.black, head, [0, -0.05, 0.37], [0.05, 0.04, 0.045]);
  // eyes: joined white mask, green irises, pupils + highlights
  const eyes = node(head, [0, 0.06, 0.24]);
  for (const s of [-1, 1]) {
    mesh(SPH, M.eye, eyes, [0.085 * s, 0.0, 0.0], [0.11, 0.15, 0.07], [0, 0, -0.18 * s]);
    mesh(SPH_LO, M.iris, eyes, [0.09 * s, -0.01, 0.055], [0.055, 0.085, 0.03]);
    mesh(SPH_LO, M.black, eyes, [0.093 * s, -0.012, 0.075], [0.028, 0.05, 0.015]);
    mesh(SPH_LO, M.eye, eyes, [0.075 * s, 0.025, 0.085], [0.014, 0.018, 0.008]);
    // brow ridge (blue) over each eye
    mesh(SPH_LO, M.blue, head, [0.095 * s, 0.205, 0.22], [0.11, 0.04, 0.07], [0.3, 0, -0.25 * s]);
    // ears
    const ear = node(head, [0.2 * s, 0.25, -0.04]);
    ear.rotation.set(-0.15, 0, -0.45 * s);
    mesh(CONE, M.blue, ear, [0, 0.07, 0], [0.075, 0.17, 0.05]);
    mesh(CONE, M.peach, ear, [0, 0.06, 0.02], [0.045, 0.12, 0.02]);
  }
  mesh(SPH, M.eye, eyes, [0, 0.01, -0.01], [0.06, 0.1, 0.05]); // bridge between eyes

  /* ---- arms */
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = node(torso, [0.2 * s, 0.25, 0]);
    const upper = node(sh);
    mesh(CAP, M.peach, upper, [0.11 * s, 0, 0], [0.034, 0.08, 0.034], [0, 0, Math.PI / 2]);
    const elbow = node(upper, [0.22 * s, 0, 0]);
    mesh(CAP, M.peach, elbow, [0.1 * s, 0, 0], [0.032, 0.07, 0.032], [0, 0, Math.PI / 2]);
    const hand = node(elbow, [0.21 * s, 0, 0]);
    mesh(TOR, M.white, hand, [-0.02 * s, 0, 0], [0.05, 0.05, 0.05], [0, Math.PI / 2, 0]);
    mesh(SPH, M.white, hand, [0.05 * s, 0, 0.0], [0.085, 0.075, 0.08]);
    const thumb = mesh(SPH_LO, M.white, hand, [0.05 * s, 0.045, 0.05], [0.03, 0.05, 0.03]);
    arms.push({ s, sh, upper, elbow, hand, thumb });
  }

  /* ---- legs + shoes */
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = node(hips, [0.085 * s, 0.02, 0]);
    const thigh = node(hip);
    mesh(CAP, M.blue, thigh, [0, -0.11, 0], [0.04, 0.1, 0.04]);
    const knee = node(thigh, [0, -0.22, 0]);
    mesh(CAP, M.blue, knee, [0, -0.1, 0], [0.038, 0.1, 0.038]);
    const ankle = node(knee, [0, -0.2, 0]);
    // sock cuff
    mesh(TOR, M.white, ankle, [0, 0.0, 0], [0.055, 0.055, 0.05], [Math.PI / 2, 0, 0]);
    const shoe = node(ankle, [0, -0.05, 0.05]);
    mesh(SPH, M.red, shoe, [0, 0, 0.04], [0.105, 0.09, 0.2]);
    mesh(SPH_LO, M.redDark, shoe, [0, -0.04, -0.06], [0.09, 0.05, 0.08]);
    mesh(geo(new THREE.BoxGeometry(1, 1, 1)), M.white, shoe, [0, 0.055, 0.0], [0.2, 0.035, 0.07], [0.25, 0, 0]);
    mesh(SPH_LO, M.gold, shoe, [0.1 * s, 0.03, 0.0], [0.02, 0.03, 0.03]);
    mesh(SPH_LO, M.sole, shoe, [0, -0.075, 0.04], [0.1, 0.025, 0.19]);
    legs.push({ s, hip, thigh, knee, ankle, shoe });
  }

  /* ---- spin ball */
  const spinTex = spikeTexture();
  texs.push(spinTex);
  const ball = node(root, [0, 0.48, 0]);
  const ballSpin = node(ball);
  const ballMat = new THREE.MeshStandardMaterial({ color: "#ffffff", map: spinTex, roughness: 0.35 });
  mats.push(ballMat);
  mesh(SPH, ballMat, ballSpin, [0, 0, 0], [0.46, 0.46, 0.46]);
  // little spikes around the ball rim so it reads as a hedgehog, not a marble
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const sp = mesh(CONE, M.blue, ballSpin, [0, Math.cos(a) * 0.43, Math.sin(a) * 0.43], [0.08, 0.2, 0.08]);
    sp.rotation.x = a + Math.PI / 2;
  }
  // red shoe flashes peeking out of the ball
  mesh(SPH_LO, M.red, ballSpin, [0.12, -0.35, 0.18], [0.09, 0.07, 0.12]);
  mesh(SPH_LO, M.red, ballSpin, [-0.12, -0.33, 0.22], [0.09, 0.07, 0.12]);
  const shellMat = new THREE.MeshBasicMaterial({ color: "#8fc4ff", transparent: true, opacity: 0.22, depthWrite: false });
  mats.push(shellMat);
  const shell = mesh(SPH, shellMat, ball, [0, 0, 0], [0.6, 0.6, 0.6]);
  shell.castShadow = false;
  ball.visible = false;

  /* ---- top-speed leg blur (figure-8) */
  const btex = blurTexture();
  texs.push(btex);
  const blurMat = new THREE.MeshBasicMaterial({ map: btex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mats.push(blurMat);
  const blur = node(body, [0, 0.24, 0.06]);
  const bgeo = geo(new THREE.CircleGeometry(0.26, 24));
  const b1 = new THREE.Mesh(bgeo, blurMat);
  b1.rotation.y = Math.PI / 2;
  blur.add(b1);
  blur.visible = false;

  /* ---------------------------------------------------------------- animation */
  // damped joint state
  const J = {};
  const jset = (k, v, rate, dt) => {
    const c = J[k] ?? v;
    J[k] = c + (v - c) * (1 - Math.exp(-rate * dt));
    return J[k];
  };
  let phase = 0;
  let idleT = 0;
  let tapT = 0;
  let ballAng = 0;
  let squash = 0;
  let lastAction = "none";
  let flashT = 0;

  /**
   * st: { action, mode, speed, grounded, vy, landed (impact), skid, rev,
   *       invuln, rail, dt, time, victory, charge }
   */
  function animate(st, dt) {
    const a = st.action;
    const sp = st.speed || 0;
    const ballForm = a === "ball" || a === "roll" || a === "charge" || a === "dash" || a === "homing";
    figure.visible = !ballForm;
    ball.visible = ballForm;
    if (st.landImpact > 4) squash = Math.min(0.32, st.landImpact / 60);
    squash = Math.max(0, squash - dt * 3.2);

    if (ballForm) {
      const spinRate = a === "charge" ? 18 + st.rev * 34 : Math.max(10, sp / 0.46);
      ballAng += spinRate * dt;
      ballSpin.rotation.x = ballAng;
      const k = a === "charge" ? 0.86 : 1;
      ball.position.y = 0.46 * k;
      ball.scale.set(1 + (1 - k) * 0.5, k, 1 + (1 - k) * 0.3);
      shell.visible = a !== "ball" || sp > 10;
      shellMat.opacity = a === "homing" ? 0.42 : a === "charge" ? 0.18 + st.rev * 0.25 : 0.16;
      shellMat.color.set(a === "homing" ? "#7dd8ff" : "#8fc4ff");
      lastAction = a;
      flash(st, dt);
      return;
    }
    if (lastAction !== a) {
      idleT = 0;
      lastAction = a;
    }

    // ---- pick target pose
    let lean = 0;
    let bob = 0;
    let headPitch = 0;
    let headYaw = 0;
    const armSh = [0, 0];
    const armFw = [0, 0];
    const armEl = [0, 0];
    const legHip = [0, 0];
    const legKnee = [0, 0];
    let legSpread = 0;
    let crouch = 0;
    let twist = 0;
    let sideLean = 0;
    let rate = 16;
    let showBlur = false;

    if (a === "hurt") {
      lean = -0.45;
      headPitch = -0.3;
      armSh[0] = armSh[1] = -1.9;
      armFw[0] = armFw[1] = 0.5;
      legHip[0] = 0.6;
      legHip[1] = -0.2;
      legKnee[0] = legKnee[1] = 0.8;
      rate = 12;
    } else if (a === "dead") {
      lean = -0.9;
      armSh[0] = armSh[1] = -2.4;
      legHip[0] = 0.9;
      legHip[1] = 0.4;
      legKnee[0] = legKnee[1] = 0.6;
      rate = 8;
    } else if (a === "victory") {
      idleT += dt;
      const t = Math.min(1, idleT * 2.2);
      // thumbs up with one arm, other hand on hip
      armSh[1] = -0.9 * t;
      armFw[1] = 1.1 * t;
      armEl[1] = -1.5 * t;
      armSh[0] = -0.35 * t;
      armFw[0] = -0.2 * t;
      armEl[0] = -1.7 * t;
      legSpread = 0.12 * t;
      headPitch = -0.08;
      headYaw = 0.25 * t;
      bob = Math.sin(st.time * 3) * 0.008;
      rate = 10;
    } else if (a === "spring") {
      armSh[0] = armSh[1] = -2.7;
      armFw[0] = armFw[1] = 0.2;
      legHip[0] = 0.12;
      legHip[1] = -0.12;
      legKnee[0] = 0.15;
      legKnee[1] = 0.1;
      headPitch = -0.25;
      rate = 14;
    } else if (st.mode === "rail") {
      // grind: sideways stance, knees bent, arms out for balance
      twist = 0.95;
      crouch = 0.12;
      sideLean = Math.sin(st.time * 5) * 0.05;
      armSh[0] = armSh[1] = -1.25;
      armFw[0] = 0.35;
      armFw[1] = -0.35;
      legHip[0] = legHip[1] = 0.55;
      legKnee[0] = legKnee[1] = 1.0;
      legSpread = 0.1;
      headYaw = -0.8;
      rate = 12;
    } else if (a === "crouch") {
      crouch = 0.2;
      lean = 0.35;
      headPitch = 0.35;
      legHip[0] = legHip[1] = 1.15;
      legKnee[0] = legKnee[1] = 1.9;
      armFw[0] = armFw[1] = 0.6;
      armSh[0] = armSh[1] = 0.2;
      armEl[0] = armEl[1] = -0.6;
    } else if (!st.grounded && st.mode !== "ride") {
      // falling / airborne (not balled): flail a little
      const up = st.vy > 0;
      armSh[0] = armSh[1] = up ? -1.6 : -1.1;
      armFw[0] = Math.sin(st.time * 9) * 0.3;
      armFw[1] = -Math.sin(st.time * 9) * 0.3;
      legHip[0] = 0.35;
      legHip[1] = -0.15;
      legKnee[0] = 0.6;
      legKnee[1] = 0.3;
      headPitch = up ? -0.15 : 0.15;
      rate = 10;
    } else if (st.skid) {
      lean = -0.4;
      legHip[0] = -0.9;
      legKnee[0] = 0.1;
      legHip[1] = 0.4;
      legKnee[1] = 0.9;
      armSh[0] = armSh[1] = -0.6;
      armFw[0] = armFw[1] = -0.8;
      crouch = 0.08;
      rate = 18;
    } else if (sp > 0.6) {
      // walk → run → max-speed run
      const runK = Math.min(1, Math.max(0, (sp - 4) / 10));
      const maxK = Math.min(1, Math.max(0, (sp - 24) / 8));
      const stride = 0.55 + runK * 0.75;
      phase += (sp / (stride * 2.2)) * dt * Math.PI * 2 * (1 - maxK * 0.2);
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const amp = 0.55 + runK * 0.55;
      legHip[0] = s * amp - runK * 0.15;
      legHip[1] = -s * amp - runK * 0.15;
      legKnee[0] = Math.max(0, -c) * (0.4 + runK * 1.2) + 0.1;
      legKnee[1] = Math.max(0, c) * (0.4 + runK * 1.2) + 0.1;
      lean = 0.08 + runK * 0.22 + maxK * 0.2;
      bob = Math.abs(c) * (0.02 + runK * 0.03);
      // arms swing opposite at running speed, sweep back at max speed
      const armAmp = 0.5 + runK * 0.4;
      armSh[0] = -0.2 + maxK * 0.1;
      armSh[1] = -0.2 + maxK * 0.1;
      armFw[0] = -s * armAmp * (1 - maxK) - maxK * 1.35;
      armFw[1] = s * armAmp * (1 - maxK) - maxK * 1.35;
      armEl[0] = armEl[1] = -0.9 * runK * (1 - maxK) - 0.15;
      headPitch = -lean * 0.6;
      showBlur = maxK > 0.35;
      rate = 22;
    } else {
      // idle: breathe, glance around, impatient foot tap after a while
      idleT += dt;
      bob = Math.sin(st.time * 2.2) * 0.008;
      armSh[0] = armSh[1] = 0.12;
      armFw[0] = armFw[1] = 0.05;
      armEl[0] = armEl[1] = -0.35;
      headYaw = Math.sin(st.time * 0.6) * 0.25;
      if (idleT > 3.5) {
        tapT += dt;
        const tap = Math.max(0, Math.sin(tapT * 10));
        legHip[1] = -0.05;
        legKnee[1] = tap * 0.3;
        // arms crossed-ish
        armFw[0] = armFw[1] = 0.9;
        armSh[0] = armSh[1] = 0.25;
        armEl[0] = armEl[1] = -1.8;
        headPitch = 0.1;
      } else tapT = 0;
      rate = 8;
    }

    // ---- apply (damped)
    const r = rate;
    body.position.y = jset("bob", bob - crouch, r, dt);
    body.rotation.x = jset("lean", lean, r, dt);
    body.rotation.z = jset("side", sideLean, r, dt);
    hips.rotation.y = jset("twist", twist, r * 0.6, dt);
    torso.rotation.y = jset("torsoTw", -twist * 0.35, r * 0.6, dt);
    head.rotation.x = jset("hp", headPitch, r, dt);
    head.rotation.y = jset("hy", headYaw, r * 0.5, dt);
    for (let i = 0; i < 2; i++) {
      const A = arms[i];
      const s = A.s;
      // shoulder: z lowers the sideways arm (1.05 rad ≈ relaxed), x swings it fore/aft
      A.sh.rotation.z = -s * jset("az" + i, 1.05 + armSh[i], r, dt);
      A.sh.rotation.x = jset("ax" + i, -armFw[i], r, dt);
      // elbow: negative armEl bends the forearm forward on both sides
      A.elbow.rotation.y = jset("ae" + i, armEl[i] * s, r, dt);
      const L = legs[i];
      L.thigh.rotation.x = jset("lh" + i, -legHip[i], r, dt);
      L.thigh.rotation.z = jset("ls" + i, legSpread * L.s, r, dt);
      L.knee.rotation.x = jset("lk" + i, legKnee[i], r, dt);
      L.ankle.rotation.x = jset("la" + i, -legKnee[i] * 0.35 + legHip[i] * 0.2, r, dt);
    }
    // squash on landing
    const sq = squash;
    figure.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    blur.visible = showBlur;
    if (showBlur) {
      blur.rotation.x = phase * 0.5;
      for (const L of legs) L.shoe.visible = false;
    } else for (const L of legs) L.shoe.visible = true;
    flash(st, dt);
  }

  function flash(st, dt) {
    // invulnerability blink + invincibility shimmer
    flashT += dt;
    const blink = st.invuln > 0 && Math.floor(flashT * 18) % 2 === 0;
    root.visible = !blink;
    if (st.invincible) {
      const h = (flashT * 1.6) % 1;
      for (const m of mats) if (m.emissive) m.emissive.setHSL(h, 1, 0.22);
    } else if (st.wasInvincible) {
      for (const m of mats) if (m.emissive) m.emissive.set(m === M.iris ? "#0a3a10" : "#000000");
    }
  }

  function dispose() {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const t of texs) t.dispose();
  }

  return { root, figure, ball, animate, dispose, head };
}
