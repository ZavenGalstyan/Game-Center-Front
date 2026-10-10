/**
 * World 5 — FINAL DIMENSION (levels 5-1 … 5-6). Floating ruins, unstable
 * crumbling paths, moving platforms and energy rails under a fractured sky;
 * the dimension shifts often but always through a gate. The final boss,
 * the Dimension Core, folds its own arena from 3D into 2.5D and back.
 */
import { createBuilder } from "../../engine/builder.js";
import * as K from "./kit.js";

export function riftRuins(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 14);
    K.sCrumble(S, 4);
    K.sShield(S);
    K.sLedge(S, { star: true });
    S.checkpoint(2);
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fIslands(L, { n: 3, dh: -1 });
  K.fCurve(L, -70, 30);
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sMoverPit(S, { w: 18 });
    K.sTurret(S);
    K.sSecret(S);
  });
  K.fRun(L, 10);
  L.checkpoint(3, 0);
  K.fMovers(L, { gap: 20 });
  K.fPlaza(L, { disc: true, w: 34, l: 34, enemies: ["chaser", "shield", "fly"], monitor: "shield", starSide: 1 });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function shatterPath(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, 0);
  L.spawn();
  K.fRun(L, 12, { w: 10 });
  K.fRails(L, { count: 2, star: true, curve: 35, wave: 1.5 });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sCrumble(S, 5, { rise: 0.3 });
    K.sChaser(S);
    S.checkpoint(2);
    K.sLift(S, { rise: 6 });
    K.sCrumble(S, 4);
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fHalf(L, { r: 6, left: true });
  L.checkpoint(3, 0);
  K.fLasers(L, { n: 3 });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sSecret(S);
    K.sDash(S, { w: 19 });
    K.sTurret(S);
  });
  K.fPlaza(L, { enemies: ["turret", "chaser", "shield"], monitor: "invincible" });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function prismFalls(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 12);
    K.sSlope(S, { d: 9 });
    K.sLoop(S);
    K.sSecret(S);
    S.checkpoint(2);
    K.sShield(S);
    K.sRun(S, 8);
  });
  K.fTunnel(L, 36, { speed: 42 });
  K.fCork(L, { len: 42 });
  K.fCurve(L, 80, 30, { bank: 16 });
  L.checkpoint(3, 0);
  K.fIslands(L, { n: 3, star: true });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sMoverPit(S, { w: 19, period: 4 });
    K.sLedge(S, { star: true });
    K.sCrumble(S, 4);
  });
  K.fRun(L, 10);
  K.fDash(L, { gap: 16, dh: -3 });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function voidRails(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, -Math.PI / 4);
  L.spawn();
  K.fRun(L, 12, { w: 10 });
  K.fRails(L, { count: 3, star: true, curve: 40, len: 62, wave: 1.8 });
  K.fCurve(L, 60, 30);
  K.fRails(L, { count: 2, curve: -40, len: 56, dh: -6 });
  L.checkpoint(3, 0);
  K.fRun(L, 10);
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sTurret(S);
    K.sCrumble(S, 4);
    S.checkpoint(2);
    K.sLift(S, { rise: 6.5 });
    K.sSecret(S, { h: 11 });
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fRails(L, { count: 1, curve: 60, len: 50 });
  K.fSwitch(L, { enemy: "shield" });
  K.fLasers(L, { n: 2 });
  K.fRun(L, 8);
  L.goal();
  return L.done();
}

export function dimensionGate(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, Math.PI / 2);
  L.spawn({ side: true, zone: 0 });
  L.side({ openStart: false }, (S) => {
    K.sRun(S, 12);
    K.sLoop(S, { drop: -5 });
    K.sCrumble(S, 4);
    K.sLedge(S, { star: true });
  });
  K.fTunnel(L, 30);
  K.fMovers(L, { gap: 19 });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sChaser(S);
    K.sDash(S, { w: 18 });
    S.checkpoint(2);
    K.sRun(S, 8);
  });
  K.fRun(L, 10);
  K.fRails(L, { count: 2, star: true, curve: -30 });
  L.checkpoint(3, 0);
  K.fLasers(L, { n: 3 });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sShield(S);
    K.sMoverPit(S, { w: 18, period: 4 });
    K.sSecret(S);
  });
  K.fHalf(L, { r: 6 });
  K.fPlaza(L, { enemies: ["turret", "shield", "chaser", "fly"], monitor: "rings", star: false });
  L.side({ openEnd: false }, (S) => {
    K.sRun(S, 10);
    K.sTurret(S, { after: 16 });
    S.goal(8);
    S.run(20);
  });
  return L.done();
}

export function dimensionCore(meta) {
  const L = createBuilder(meta);
  L.moveTo(0, 0, 0, 0);
  L.spawn();
  K.fRun(L, 12, { w: 10 });
  K.fIslands(L, { n: 2, star: true });
  L.side({}, (S) => {
    K.sRun(S, 10);
    K.sLedge(S, { star: true, fly: false });
    K.sSecret(S);
    K.sRun(S, 10, { monitor: "shield" });
  });
  K.fRun(L, 10);
  L.checkpoint(2, 0);
  K.fRun(L, 8, { rings: false });
  K.coreArena(L, { r: 26 });
  return L.done();
}
