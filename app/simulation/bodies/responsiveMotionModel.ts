import { Vector3 } from 'three';
import type { FieldMotionModel, MotionNode } from '../../types/field';
import type { createInteractionStore } from '../interactionStore';

export type BodyResponseSettings = {
  enabled: boolean;
  gain: number;
  maxOffset: number;
  massScale: number;
  responseSpeed: number;
  recoverySpeed: number;
};

// add a bounded offset without changing the original orbit
export function createResponsiveMotionModel(
  base: FieldMotionModel,
  nodes: readonly MotionNode[],
  sources: Pick<ReturnType<typeof createInteractionStore>, 'forEachActiveSource'>,
  settings: BodyResponseSettings,
  bodyRadii: ReadonlyMap<string, number> = new Map(),
) {
  for (const key of ['gain', 'maxOffset', 'massScale', 'responseSpeed', 'recoverySpeed'] as const) {
    if (!Number.isFinite(settings[key]) || settings[key] < 0 || (settings[key] === 0 && key !== 'gain' && key !== 'massScale')) throw new RangeError(`Invalid body response setting: ${key}`);
  }
  const records = new Map(nodes.map((node) => {
    const position = base.getPosition(node.id);
    if (!position || !Number.isFinite(node.mass) || node.mass < 0) throw new Error(`Invalid responsive body: ${node.id}`);
    return [node.id, {
      node,
      radius: bodyRadii.get(node.id) ?? 0,
      position: position.clone(),
      offset: new Vector3(),
      combined: new Vector3(),
      target: new Vector3(),
      factor: node.mass > 0 ? 1 / Math.sqrt(1 + node.mass * settings.massScale) : 0,
    }];
  }));
  type BodyResponseRecord = NonNullable<ReturnType<typeof records.get>>;
  const ordered: BodyResponseRecord[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (record: BodyResponseRecord) => {
    if (done.has(record.node.id)) return;
    if (visiting.has(record.node.id)) throw new Error('Responsive body parent cycle');
    visiting.add(record.node.id);
    if (record.node.motion.type === 'orbit') {
      const parent = records.get(record.node.motion.parentId);
      if (!parent) throw new Error(`Missing responsive parent: ${record.node.motion.parentId}`);
      visit(parent);
    }
    visiting.delete(record.node.id);
    done.add(record.node.id);
    ordered.push(record);
  };
  records.forEach(visit);
  const away = new Vector3();

  return {
    step(elapsed: number, delta: number) {
      base.step(elapsed, delta);
      ordered.forEach((record) => record.target.set(0, 0, 0));
      if (settings.enabled) sources.forEachActiveSource((source) => {
        for (const record of ordered) {
          if (record.factor === 0) continue;
          away.copy(base.getPosition(record.node.id)!).add(record.combined);
          away.x -= source.position[0];
          away.y -= source.position[1];
          away.z -= source.position[2];
          const centerDistance = away.length();
          const distance = Math.max(0, centerDistance - record.radius);
          if (centerDistance < 0.00001 || distance >= source.radius) continue;
          const t = distance / source.radius;
          const falloff = 1 - t * t * (3 - 2 * t);
          record.target.addScaledVector(away, source.strength * settings.gain * record.factor * falloff / centerDistance);
        }
      });
      const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
      for (const record of ordered) {
        record.target.clampLength(0, settings.maxOffset * record.factor);
        const speed = record.target.lengthSq() > 0 ? settings.responseSpeed : settings.recoverySpeed;
        record.offset.lerp(record.target, -Math.expm1(-speed * dt));
        // carry moons with the parent offset, preserving their relative orbits
        const parent = record.node.motion.type === 'orbit' ? records.get(record.node.motion.parentId) : undefined;
        record.combined.copy(record.offset);
        if (parent) record.combined.add(parent.combined);
        record.combined.clampLength(0, settings.maxOffset);
        record.position.copy(base.getPosition(record.node.id)!).add(record.combined);
      }
    },
    getPosition: (id: string) => records.get(id)?.position,
    getBasePosition: (id: string) => base.getPosition(id),
    getInteractionOffset(id: string, target = new Vector3()) {
      const record = records.get(id);
      return record ? target.copy(record.combined) : undefined;
    },
  };
}
