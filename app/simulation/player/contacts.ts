import { Quaternion, Vector3 } from 'three';
import type { BodyCollider } from '../bodies/bodyColliders';

export type LandingContact = {
  kind: 'body' | 'player';
  id: string;
  point: Vector3;
  normal: Vector3;
  capsuleOffset?: number;
  // centre at the hit time, not necessarily at the end of the frame
  targetPosition?: Vector3;
};

export type CapsuleHit = {
  time: number;
  point: Vector3;
  normal: Vector3;
  capsuleOffset: number;
  targetPosition: Vector3
};

// sweep in world-up space; rotate the query for an arbitrary capsule UP
export function sweepCapsule(
  feet: Vector3, movement: Vector3, radius: number, height: number,
  body: BodyCollider, bodyStart: Vector3, bodyMovement: Vector3,
  up?: Vector3,
): CapsuleHit | undefined {
  // rotate the query so the sweep also works on the underside
  if (up && up.distanceToSquared(new Vector3(0, 1, 0)) > 1e-12) {
    const rotation = new Quaternion().setFromUnitVectors(up, new Vector3(0, 1, 0));
    const hit = sweepCapsule(new Vector3(), movement.clone().applyQuaternion(rotation), radius, height,
      body, bodyStart.clone().sub(feet).applyQuaternion(rotation), bodyMovement.clone().applyQuaternion(rotation));
    if (!hit) return;
    rotation.invert();
    hit.point.applyQuaternion(rotation).add(feet);
    hit.targetPosition.applyQuaternion(rotation).add(feet);
    hit.normal.applyQuaternion(rotation);
    return hit;
  }
  const qx = bodyStart.x - feet.x;
  const qy = bodyStart.y - feet.y;
  const qz = bodyStart.z - feet.z;
  const vx = bodyMovement.x - movement.x;
  const vy = bodyMovement.y - movement.y;
  const vz = bodyMovement.z - movement.z;
  const bottom = radius;
  const top = height - radius;
  const expanded = body.radius + radius + 0.001;
  const nearest = Math.max(bottom, Math.min(top, qy));
  let time = qx * qx + qz * qz + (qy - nearest) ** 2 <= expanded ** 2 ? 0 : Infinity;
  const root = (a: number, b: number, c: number) => {
    const discriminant = b * b - a * c;
    if (a < 1e-14 || discriminant < 0) return Infinity;
    const t = (-b - Math.sqrt(discriminant)) / a;
    return t >= 0 && t <= 1 ? t : Infinity;
  };
  const side = root(vx * vx + vz * vz, qx * vx + qz * vz, qx * qx + qz * qz - expanded ** 2);
  const sideY = qy + vy * side;
  if (sideY >= bottom && sideY <= top) time = Math.min(time, side);
  for (const y of [bottom, top]) {
    const offset = qy - y;
    time = Math.min(time, root(vx * vx + vy * vy + vz * vz, qx * vx + offset * vy + qz * vz, qx * qx + offset * offset + qz * qz - expanded ** 2));
  }
  if (!Number.isFinite(time)) return undefined;
  const targetPosition = bodyStart.clone().addScaledVector(bodyMovement, time);
  const footAtHit = feet.clone().addScaledVector(movement, time);
  let capsuleOffset = Math.max(bottom, Math.min(top, targetPosition.y - footAtHit.y));
  const normal = footAtHit.clone().add(new Vector3(0, capsuleOffset, 0)).sub(targetPosition);
  if (normal.lengthSq() < 1e-12) {
    normal.set(0, 1, 0);
    capsuleOffset = bottom;
  }
  else normal.normalize();
  return { time, normal, capsuleOffset, targetPosition, point: targetPosition.clone().addScaledVector(normal, body.radius) };
}
