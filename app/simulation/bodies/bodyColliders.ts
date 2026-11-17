import type { Vector3 } from 'three';
import type { CelestialBodyConfig, FieldMotionModel } from '../../types/field';

export type BodyCollider = {
  id: string;
  position: Vector3;
  radius: number;
};

// use live positions; decorative rings, halos and transparent shells are not solid
export function createBodyColliders(bodies: readonly CelestialBodyConfig[], model: FieldMotionModel): BodyCollider[] {
  return bodies.flatMap((body) => {
    const radius = Math.max(body.core?.radius ?? 0, ...(body.shells ?? [])
      .filter((shell) => !shell.wireframe && (shell.opacity ?? 1) >= 1)
      .map((shell) => shell.radius));
    const position = model.getPosition(body.id);
    return position && radius > 0 ? [{ id: body.id, position, radius }] : [];
  });
}

