import { Vector4 } from 'three';
import { InteractionSource, MAX_INTERACTION_SOURCES, RepulsionSettings } from '../types/interaction';

export const DEFAULT_REPULSION_SETTINGS: Readonly<RepulsionSettings> = {
  activationSpeed: 6,
  recoverySpeed: 3,
  maxDisplacement: 3,
};

type Slot = {
  source: InteractionSource;
  index: number;
  retiring: boolean;
};

// Well beyond this scene's scale, but bounded to keep shader squares/sums in float range.
const MAX_WORLD_VALUE = 1_000_000;

function positive(value: number, name: string, allowZero = false) {
  if (!Number.isFinite(value) || value > MAX_WORLD_VALUE || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(`${name} must be finite, ${allowZero ? 'nonnegative' : 'positive'}, and at most ${MAX_WORLD_VALUE}`);
  }
}

/** Mutable source registry, not React state. Only this small uniform set changes per frame. */
export function createInteractionStore() {
  const slots = new Map<string, Slot>();
  const settings = { ...DEFAULT_REPULSION_SETTINGS };
  const uniforms = {
    uInteractionCount: { value: 0 },
    uInteractionSources: { value: Array.from({ length: MAX_INTERACTION_SOURCES }, () => new Vector4()) },
    uInteractionStrengths: { value: new Float32Array(MAX_INTERACTION_SOURCES) },
    uMaxDisplacement: { value: settings.maxDisplacement },
  };

  return {
    uniforms,
    upsert(source: InteractionSource) {
      if (!source.id || source.position.length !== 3 || !source.position.every((value) => Number.isFinite(value) && Math.abs(value) <= MAX_WORLD_VALUE)) {
        throw new RangeError('Interaction sources need an id and a finite world-space position');
      }
      positive(source.radius, 'radius');
      positive(source.strength, 'strength', true);
      let slot = slots.get(source.id);
      if (!slot) {
        const used = new Set(Array.from(slots.values(), (entry) => entry.index));
        const index = Array.from({ length: MAX_INTERACTION_SOURCES }, (_, i) => i).find((i) => !used.has(i));
        if (index === undefined) {
          throw new RangeError(`At most ${MAX_INTERACTION_SOURCES} sources, including recovering sources, are supported`);
        }
        slot = { source, index, retiring: false };
        uniforms.uInteractionSources.value[index].set(...source.position, source.radius);
        slots.set(source.id, slot);
      }
      // Snapshot inputs so caller-owned vectors/arrays cannot silently mutate the registry.
      slot.source = { ...source, position: [...source.position] };
      slot.retiring = false;
    },
    /** Keep the last position alive during recovery instead of popping the displacement off. */
    remove(id: string) {
      const slot = slots.get(id);
      if (slot) slot.retiring = true;
    },
    clear() {
      slots.forEach((slot) => { slot.retiring = true; });
    },
    configure(update: Partial<RepulsionSettings>) {
      for (const [key, value] of Object.entries(update)) positive(value, key);
      Object.assign(settings, update);
      uniforms.uMaxDisplacement.value = settings.maxDisplacement;
    },
    /** Call once per R3F frame, before particle uniforms/rendering; never once per eye or field. */
    step(delta: number) {
      if (!Number.isFinite(delta) || delta <= 0) return;
      const rise = -Math.expm1(-settings.activationSpeed * delta);
      const recover = -Math.expm1(-settings.recoverySpeed * delta);
      let count = 0;
      for (const [id, slot] of slots) {
        const { source, index, retiring } = slot;
        const target = source.active && !retiring ? source.strength : 0;
        const current = uniforms.uInteractionStrengths.value[index];
        const blend = target > current ? rise : recover;
        const strength = current + (target - current) * blend;
        uniforms.uInteractionStrengths.value[index] = strength;

        // Frozen on release/removal, so the residual influence recovers where it was applied.
        if (source.active && !retiring) {
          const position = uniforms.uInteractionSources.value[index];
          position.x += (source.position[0] - position.x) * rise;
          position.y += (source.position[1] - position.y) * rise;
          position.z += (source.position[2] - position.z) * rise;
          position.w += (source.radius - position.w) * rise;
        }
        // Below 0.01 mm, freeing the slot cannot produce a visible discontinuity.
        if (target === 0 && strength < 0.00001) {
          uniforms.uInteractionStrengths.value[index] = 0;
          if (retiring) {
            slots.delete(id);
            continue;
          }
        }
        count = Math.max(count, index + 1);
      }
      uniforms.uInteractionCount.value = count;
    },
  };
}

export const interactionStore = createInteractionStore();
