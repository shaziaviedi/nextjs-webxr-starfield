import { Euler, Quaternion, Vector3 } from 'three';
import type { FieldStreamConfig } from '../../types/field';

export type FieldRegion = {
  id: string;
  radius: number;
  points: readonly Vector3[]
};

export function createStreamRegion(stream: FieldStreamConfig, radius: number, samples = 96): FieldRegion {
  if (!(radius > 0) || !Number.isFinite(radius) || samples < 8) throw new RangeError('Invalid stream trigger volume');
  const rotation = new Quaternion().setFromEuler(new Euler(...stream.tilt));
  const center = new Vector3(...stream.center);
  const points = Array.from({ length: samples + 1 }, (_, i) => {
    const angle = (i / samples) * Math.PI * 2;
    return new Vector3(
      Math.cos(angle) * stream.radii[0],
      Math.sin(angle * Math.round(stream.waveFrequency)) * stream.waveAmplitude,
      Math.sin(angle) * stream.radii[1],
    ).applyQuaternion(rotation).add(center);
  });
  return { id: stream.id, radius, points };
}

// Squared distance from the player's vertical spine segment to a stream segment.
function spineDistance(feet: Vector3, radius: number, height: number, start: Vector3, end: Vector3) {
  const spine = height - 2 * radius;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const rx = feet.x - start.x;
  const ry = feet.y + radius - start.y;
  const rz = feet.z - start.z;
  const a = spine * spine;
  const e = dx * dx + dy * dy + dz * dz;
  const b = spine * dy;
  const c = spine * ry;
  const f = dx * rx + dy * ry + dz * rz;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  let s = 0;
  let t = 0;
  if (a <= 1e-12) t = e > 1e-12 ? clamp(f / e) : 0;
  else if (e <= 1e-12) s = clamp(-c / a);
  else {
    const denominator = a * e - b * b;
    if (denominator > 1e-12) s = clamp((b * f - c * e) / denominator);
    t = (b * s + f) / e;
    if (t < 0) {
      t = 0;
      s = clamp(-c / a);
    }
    else if (t > 1) {
      t = 1;
      s = clamp((b - c) / a);
    }
  }
  return (rx - dx * t) ** 2 + (ry + spine * s - dy * t) ** 2 + (rz - dz * t) ** 2;
}

// trigger against stream tubes, not individual particles or ambient dust
export function findActiveRegion(feet: Vector3, radius: number, height: number, regions: readonly FieldRegion[], padding = 0) {
  for (const region of regions) {
    const threshold = (region.radius + radius + padding) ** 2;
    for (let i = 1; i < region.points.length; i++) {
      if (spineDistance(feet, radius, height, region.points[i - 1], region.points[i]) <= threshold) return region.id;
    }
  }
  return undefined;
}
