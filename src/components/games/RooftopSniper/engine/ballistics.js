/**
 * Rooftop Sniper — bullet simulation. Every shot is a real projectile (no
 * hitscan): position, velocity, optional gravity (bullet drop) and optional
 * wind. Early missions disable drop/wind entirely (see data/missions.js);
 * later ones ramp them in gradually.
 *
 * Collision is a swept segment-vs-sphere test against each target's center,
 * run every physics step, so a fast bullet can't tunnel through a small
 * target between two frames.
 */
import * as THREE from "three";

const GRAVITY = -9.8;
const MAX_AGE = 2.5; // seconds — a shot that hits nothing self-retires
const MAX_RANGE = 400; // meters

const _prev = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _toCenter = new THREE.Vector3();
const _closest = new THREE.Vector3();

export function spawnBullet({ origin, direction, speed, bulletDrop, wind }) {
  const velocity = direction.clone().normalize().multiplyScalar(speed);
  return {
    position: origin.clone(),
    velocity,
    origin: origin.clone(),
    age: 0,
    dropEnabled: Boolean(bulletDrop),
    wind: wind ? { x: wind.x || 0, z: wind.z || 0 } : null,
    alive: true,
  };
}

/** Advances a bullet by dt and returns whether it stepped through `target`. */
export function stepBullet(bullet, dt, targets) {
  if (!bullet.alive) return null;
  _prev.copy(bullet.position);

  if (bullet.dropEnabled) bullet.velocity.y += GRAVITY * dt;
  if (bullet.wind) {
    bullet.velocity.x += bullet.wind.x * dt;
    bullet.velocity.z += bullet.wind.z * dt;
  }
  bullet.position.addScaledVector(bullet.velocity, dt);
  bullet.age += dt;

  let hitTarget = null;
  _seg.subVectors(bullet.position, _prev);
  const segLenSq = _seg.lengthSq();
  for (const target of targets) {
    if (target.hit) continue;
    _toCenter.subVectors(target.center, _prev);
    let t = segLenSq > 1e-8 ? _toCenter.dot(_seg) / segLenSq : 0;
    t = Math.max(0, Math.min(1, t));
    _closest.copy(_prev).addScaledVector(_seg, t);
    const dist = _closest.distanceTo(target.center);
    if (dist <= target.radius) {
      hitTarget = target;
      break;
    }
  }

  if (hitTarget) {
    bullet.alive = false;
  } else if (bullet.age > MAX_AGE || bullet.origin.distanceTo(bullet.position) > MAX_RANGE || bullet.position.y < -50) {
    bullet.alive = false;
  }

  return hitTarget;
}
