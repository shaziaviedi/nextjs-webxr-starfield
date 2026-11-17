import { Vector3 } from 'three';
import type { Player } from './Player';

import type { BodyCollider } from '../bodies/bodyColliders';
export type GroundMovementSettings = {
  groundLevel: number;
  height: number;
  collisionRadius: number;
  speed: number;
  acceleration: number;
  deceleration: number;
};

// ground movement uses a vertical capsule against body spheres
export function createGroundMovement(settings: GroundMovementSettings, colliders: readonly BodyCollider[]) {
  for (const key of ['groundLevel', 'height', 'collisionRadius', 'speed', 'acceleration', 'deceleration'] as const) {
    const value = settings[key];
    if (!Number.isFinite(value) || (key !== 'groundLevel' && value <= 0)) throw new RangeError(`Invalid walking setting: ${key}`);
  }
  if (settings.height < settings.collisionRadius * 2) throw new RangeError('Player height must fit the collision capsule');
  const skin = 0.001;
  const target = new Vector3();
  const displacement = new Vector3();
  const { collisionRadius: playerRadius, height } = settings;

  // sphere cross-section, expanded by the capsule radius
  const obstacleRadius = (body: BodyCollider, feetY: number) => {
    const bottom = feetY + playerRadius;
    const top = feetY + height - playerRadius;
    const nearestY = Math.max(bottom, Math.min(top, body.position.y));
    const dy = body.position.y - nearestY;
    const combined = body.radius + playerRadius + skin;
    return Math.sqrt(Math.max(0, combined * combined - dy * dy));
  };

  const resolveOverlaps = (player: Player) => {
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (const body of colliders) {
        const radius = obstacleRadius(body, player.position.y);
        const dx = player.position.x - body.position.x;
        const dz = player.position.z - body.position.z;
        const distance = Math.hypot(dx, dz);
        if (radius === 0 || distance >= radius) continue;
        const nx = distance > 0.00001 ? dx / distance : 1;
        const nz = distance > 0.00001 ? dz / distance : 0;
        player.position.x += nx * (radius - distance + skin);
        player.position.z += nz * (radius - distance + skin);
        const inward = player.velocity.x * nx + player.velocity.z * nz;
        if (inward < 0) {
          player.velocity.x -= inward * nx;
          player.velocity.z -= inward * nz;
        }
        changed = true;
      }
      if (!changed) break;
    }
  };

  const overlaps = (player: Player) => colliders.some((body) => {
    const radius = obstacleRadius(body, player.position.y);
    return radius > 0 && Math.hypot(player.position.x - body.position.x, player.position.z - body.position.z) < radius;
  });

  const move = (player: Player, dx: number, dz: number) => {
    for (let slide = 0; slide < 4; slide++) {
      const length = Math.hypot(dx, dz);
      if (length < 0.0000001) break;
      let earliest = 1;
      let hit: BodyCollider | undefined;
      for (const body of colliders) {
        const radius = obstacleRadius(body, player.position.y);
        if (radius === 0) continue;
        const ox = player.position.x - body.position.x;
        const oz = player.position.z - body.position.z;
        const b = ox * dx + oz * dz;
        if (b >= 0) continue;
        const a = dx * dx + dz * dz;
        const c = ox * ox + oz * oz - radius * radius;
        const discriminant = b * b - a * c;
        if (discriminant < 0) continue;
        const time = (-b - Math.sqrt(discriminant)) / a;
        if (time >= 0 && time <= earliest) {
          earliest = time;
          hit = body;
        }
      }
      const travel = hit ? Math.max(0, earliest - skin / length) : 1;
      player.position.x += dx * travel;
      player.position.z += dz * travel;
      if (!hit) break;
      const nx = player.position.x - hit.position.x;
      const nz = player.position.z - hit.position.z;
      const normalLength = Math.hypot(nx, nz);
      const normalX = nx / Math.max(normalLength, 0.00001);
      const normalZ = nz / Math.max(normalLength, 0.00001);
      dx *= 1 - travel;
      dz *= 1 - travel;
      const inward = Math.min(0, dx * normalX + dz * normalZ);
      dx -= inward * normalX;
      dz -= inward * normalZ;
      const velocityInward = Math.min(0, player.velocity.x * normalX + player.velocity.z * normalZ);
      player.velocity.x -= velocityInward * normalX;
      player.velocity.z -= velocityInward * normalZ;
    }
  };

  return {
    prepareSpawn(player: Player) {
      player.movementState = 'WALKING_GROUND';
      player.position.y = settings.groundLevel;
      player.velocity.set(0, 0, 0);
      player.desiredVelocity.set(0, 0, 0);
      resolveOverlaps(player);
      // use a clear fallback if overlapping bounds leave no room at spawn
      if (overlaps(player)) {
        player.position.x = Math.max(player.position.x, ...colliders.map((body) => body.position.x + body.radius + playerRadius + 1));
      }
    },
    step(player: Player, delta: number, groundHeight = settings.groundLevel) {
      if (!player.active || !Number.isFinite(delta) || delta <= 0) return;
      const walking = player.movementState === 'WALKING_GROUND';
      if (walking) {
        player.position.y = groundHeight;
        player.velocity.y = 0;
        player.grounded = true;
      }
      target.copy(player.desiredVelocity);
      if (walking) target.y = 0;
      target.clampLength(0, settings.speed);
      const rate = target.lengthSq() > 0 ? settings.acceleration : settings.deceleration;
      const steps = Math.ceil(Math.min(delta, 0.1) * 120);
      const dt = Math.min(delta, 0.1) / steps;
      const response = -Math.expm1(-rate * dt);
      for (let i = 0; i < steps; i++) {
        // integrate the damped velocity exactly across this step
        displacement.copy(player.velocity).sub(target).multiplyScalar(response / rate).addScaledVector(target, dt);
        player.velocity.lerp(target, response);
        if (!walking) player.position.y += displacement.y;
        // moving bodies can overlap a stationary player too
        resolveOverlaps(player);
        move(player, displacement.x, displacement.z);
      }
      if (target.lengthSq() === 0 && player.velocity.lengthSq() < 0.00000001) player.velocity.set(0, 0, 0);
    },
  };
}
