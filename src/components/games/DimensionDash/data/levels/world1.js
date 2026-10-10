/**
 * World 1 — GREEN VELOCITY (levels 1-2 … 1-6). Level 1-1 is greenShift.js.
 * Bright checkered hills, loops and palm-lined 3D runs; the boss is the
 * Drill Crawler in a 2.5D arena.
 */
import { createBuilder } from "../../engine/builder.js";
import * as K from "./kit.js";

export function palmRush(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 16);
    K.sHill(S, 24, 2.4);
    K.sLedge(S, { star: true });
    K.sPit(S, 6);
    K.sLoop(S);
    S.checkpoint(2);
    K.sSpikes(S, { before: 10 });
    K.sRun(S, 14, { monitor: "speed" });
  });
  K.fRun(L, 20);
  K.fCurve(L, 60, 32);
  K.fPlaza(L, { enemies: ["patrol", "fly", "chaser"], monitor: "rings" });
  K.fRails(L, { count: 2, star: true, curve: -24 });
  L.checkpoint(4, 0);
  K.fRun(L, 16);
  L.side({ openEnd: false }, (S) => {
    K.sRun(S, 14);
    K.sHill(S, 22, 2);
    K.sRun(S, 10);
    S.goal(8);
    S.run(20);
  });
  return L.done();
}

export function waterfallWay(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, 0);
  L.spawn();
  K.fRun(L, 18, { w: 10 });
  K.fCurve(L, -45, 30);
  K.fIslands(L, { n: 3, star: true });
  L.side({}, (S) => {
    K.sRun(S, 12);
    K.sChaser(S);
    K.sLoop(S);
    S.checkpoint(2);
    K.sMoverPit(S);
    K.sLedge(S, { star: true });
    K.sRun(S, 10);
  });
  K.fRun(L, 14);
  K.fHalf(L, { r: 6 });
  K.fCurve(L, 40, 30);
  K.fPlaza(L, { enemies: ["patrol", "patrol", "fly"], starSide: 1, monitor: "magnet" });
  K.fRun(L, 10);
  L.goal();
  return L.done();
}

export function twinLoopHills(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 14);
    K.sLoop(S, { drop: -3 });
    K.sRun(S, 6);
    K.sLoop(S, { drop: -3 });
    S.checkpoint(2);
    K.sRun(S, 10);
    K.sSecret(S);
    K.sCrumble(S, 3);
    K.sRun(S, 10);
  });
  K.fRun(L, 12);
  K.fRamp(L, { gap: 12 });
  K.fRails(L, { count: 1, curve: 30, dh: -3 });
  L.checkpoint(4, 0);
  K.fCork(L);
  K.fPlaza(L, { enemies: ["chaser", "patrol"], monitor: "shield" });
  K.fRun(L, 10);
  L.side({ openEnd: false }, (S) => {
    K.sRun(S, 10);
    K.sLedge(S, { star: true });
    K.sHill(S, 20, 2);
    S.goal(10);
    S.run(22);
  });
  return L.done();
}

export function velocityValley(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, 0);
  L.spawn();
  K.fRun(L, 14, { w: 10 });
  K.fTunnel(L, 36);
  K.fCurve(L, 50, 34);
  K.fRails(L, { count: 3, star: true, curve: 18, wave: 1.2 });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sSlope(S);
    K.sTurret(S);
    S.checkpoint(2);
    K.sLift(S, { rise: 5.5 });
    K.sSecret(S, { h: 9 });
    K.sRun(S, 10);
  });
  K.fRun(L, 12);
  K.fDash(L);
  K.fPlaza(L, { enemies: ["fly", "chaser", "patrol"], monitor: "invincible" });
  K.fCurve(L, -60, 30);
  L.side({ openEnd: false }, (S) => {
    K.sRun(S, 10);
    K.sShield(S);
    S.goal(10);
    S.run(22);
  });
  return L.done();
}

export function drillCrawler(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false, openEnd: true }, (S) => {
    K.sRun(S, 16);
    K.sHill(S, 22, 2);
    S.redStar(8, { up: 6.5 });
    S.spring(8, { v: 22 });
    K.sRun(S, 16, { monitor: "rings" });
    S.redStar(6, { up: 1.2 });
    K.sRun(S, 12);
    S.redStar(4, { up: 4.5 });
    S.checkpoint(8);
    K.sRun(S, 12, { rings: 0 });
  });
  K.fRun(L, 10, { rings: false });
  K.sideArena(L, "drill", { len: 46 });
  return L.done();
}
