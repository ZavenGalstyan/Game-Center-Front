/**
 * World 4 — NEON METROPOLIS (levels 4-1 … 4-6). Glowing highways, speed
 * tunnels, laser gates, elevated rail networks and robot patrols over a
 * night city; switches open side alcoves. The boss is the Volt Sentinel in
 * a full-3D arena.
 */
import { createBuilder } from "../../engine/builder.js";
import * as K from "./kit.js";

export function neonNights(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, 0);
  L.spawn();
  K.fRun(L, 14, { w: 10 });
  K.fTunnel(L, 40, { speed: 40 });
  K.fCurve(L, 70, 34, { bank: 16 });
  K.fLasers(L, { n: 3 });
  L.checkpoint(3, 0);
  K.fRun(L, 10);
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sShield(S);
    K.sTurret(S);
    K.sLedge(S, { star: true });
    S.checkpoint(2);
    K.sLoop(S);
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fSwitch(L, { enemy: "chaser" });
  K.fRails(L, { count: 2, star: true, curve: 22 });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function laserLane(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 14);
    K.sChaser(S);
    K.sSpikes(S);
    K.sSecret(S);
    S.checkpoint(2);
    K.sTurret(S);
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fLasers(L, { n: 4 });
  K.fCurve(L, -90, 30, { bank: 15 });
  K.fTunnel(L, 34);
  L.checkpoint(3, 0);
  K.fPlaza(L, { enemies: ["shield", "chaser", "turret"], monitor: "speed", starSide: 1 });
  K.fLasers(L, { n: 2 });
  L.side({ openEnd: false }, (S) => {
    K.sRun(S, 10);
    K.sLedge(S, { star: true });
    K.sShield(S, { after: 16 });
    S.goal(8);
    S.run(20);
  });
  return L.done();
}

export function railCity(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 4);
  L.spawn();
  K.fRun(L, 12, { w: 10 });
  K.fRails(L, { count: 3, star: true, curve: 30, len: 60, wave: 1.4 });
  K.fCurve(L, -50, 30);
  K.fRails(L, { count: 2, curve: -35, len: 52, dh: -5 });
  L.checkpoint(3, 0);
  K.fRun(L, 10);
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sLift(S, { rise: 6 });
    K.sTurret(S);
    S.checkpoint(2);
    K.sMoverPit(S, { w: 18, period: 4 });
    K.sSecret(S);
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fRails(L, { count: 1, curve: 45, len: 46 });
  K.fPlaza(L, { enemies: ["chaser", "fly", "shield"], monitor: "rings", starSide: -1 });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function circuitGrid(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 12);
    K.sShield(S);
    K.sPit(S, 7);
    K.sLoop(S);
    S.checkpoint(2);
    K.sCrumble(S, 4);
    K.sLedge(S, { star: true });
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fSwitch(L, { enemy: "shield" });
  K.fHalf(L, { r: 6 });
  K.fLasers(L, { n: 3 });
  L.checkpoint(3, 0);
  K.fCork(L, { left: true });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sChaser(S);
    K.sDash(S, { w: 19 });
    K.sTurret(S);
  });
  K.fRails(L, { count: 2, star: true, curve: 30 });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function overdriveTower(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, 0);
  L.spawn();
  K.fRun(L, 12, { w: 10 });
  K.fLift(L, { rise: 7 });
  K.fLasers(L, { n: 3 });
  K.fLift(L, { rise: 7, period: 6 });
  L.checkpoint(3, 0);
  K.fTunnel(L, 36, { speed: 42 });
  K.fCurve(L, 120, 30, { bank: 18 });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sLift(S, { rise: 6 });
    K.sShield(S);
    S.checkpoint(2);
    K.sMoverPit(S, { w: 19 });
    K.sSecret(S, { h: 11 });
    K.sTurret(S);
  });
  K.fRun(L, 10);
  K.fMovers(L, { gap: 20 });
  K.fPlaza(L, { enemies: ["turret", "shield", "chaser", "fly"], monitor: "invincible", starSide: 1 });
  K.fRails(L, { count: 2, star: true, curve: -30 });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function voltSentinel(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 14);
    K.sLedge(S, { star: true });
    K.sSecret(S);
    K.sRun(S, 10, { monitor: "shield" });
  });
  K.fRun(L, 10);
  K.fRails(L, { count: 2, star: true, curve: 20, len: 40 });
  L.checkpoint(2, 0);
  K.fRun(L, 8, { rings: false });
  K.discArena(L, "sentinel", { r: 24 });
  return L.done();
}
