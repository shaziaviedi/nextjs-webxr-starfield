import { Quaternion, Vector3 } from 'three';
import type { BodyCollider } from '../bodies/bodyColliders';
import type { Player } from './Player';

export type GravitySource = BodyCollider & {
  captureDistance: number;
  attractionStrength: number;
  maxCaptureVelocity: number;
  landingTolerance: number;
};
export type GravityTuning = {
  captureDistance: number;
  captureAcceleration: number;
  captureMaxVelocity: number;
  landingTolerance: number;
};

export function createGravitySources(
  bodies: readonly BodyCollider[],
  settings: GravityTuning,
  overrides: Readonly<Record<string, Partial<Omit<GravitySource, 'id' | 'position'>>>> = {},
): GravitySource[] {
  return bodies.map((body) => {
    const source = {
      captureDistance: settings.captureDistance,
      attractionStrength: settings.captureAcceleration,
      maxCaptureVelocity: settings.captureMaxVelocity,
      landingTolerance: settings.landingTolerance,
      ...body,
      ...overrides[body.id],
    };
    for (const key of ['radius', 'captureDistance', 'attractionStrength', 'maxCaptureVelocity', 'landingTolerance'] as const) {
      if (!Number.isFinite(source[key]) || source[key] <= 0) throw new RangeError(`Invalid gravity source ${body.id}: ${key}`);
    }
    return source;
  });
}

const WORLD_UP = new Vector3(0, 1, 0);
const currentUp = new Vector3();
const correction = new Quaternion();
const target = new Quaternion();

// swing UP toward the normal without resetting forward or mouse pitch
export function alignPlayerUp(player: Player, up: Vector3, speed: number, dt: number) {
  currentUp.copy(WORLD_UP).applyQuaternion(player.orientation);
  correction.setFromUnitVectors(currentUp, up);
  target.copy(correction).multiply(player.orientation).normalize();
  player.orientation.slerp(target, -Math.expm1(-speed * dt)).normalize();
  player.localUp.copy(WORLD_UP).applyQuaternion(player.orientation).normalize();
}

// extra clearance while aligning; reduces to feet clearance once upright
export function surfaceRootDistance(radius: number, height: number, clearance: number, upDotNormal: number) {
  const half = height / 2;
  const cosine = Math.max(-1, Math.min(1, upDotNormal));
  return -cosine * half + Math.sqrt((radius + half + clearance) ** 2 - half * half * (1 - cosine * cosine));
}
