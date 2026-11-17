import { DataTexture, FloatType, RGBAFormat, Vector2 } from 'three';
import type { InteractionSource, RepulsionSettings } from '../types/interaction';

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

// source state stays outside React; only the texture uniforms change each frame
export function createInteractionStore() {
  const slots = new Map<string, Slot>();
  const freeIndices = new Set<number>();
  let nextIndex = 0;
  let capacity = 8;
  // Two RGBA texels per source: world xyz/radius, then strength/padding.
  let data = new Float32Array(capacity * 8);
  const texture = new DataTexture(data, capacity * 2, 1, RGBAFormat, FloatType);
  texture.needsUpdate = true;
  const settings = { ...DEFAULT_REPULSION_SETTINGS };
  const uniforms = {
    uInteractionCount: { value: 0 },
    uInteractionTexture: { value: texture },
    uInteractionTextureSize: { value: new Vector2(capacity * 2, 1) },
    uMaxDisplacement: { value: settings.maxDisplacement },
  };

  return {
    uniforms,
    // body response reads the same sources as the particle shaders
    forEachActiveSource(visitor: (source: Readonly<Omit<InteractionSource, 'position'>> & { readonly position: readonly [number, number, number] }) => void) {
      for (const { source, retiring } of slots.values()) {
        if (source.active && !retiring && source.strength > 0) visitor(source);
      }
    },
    upsert(source: InteractionSource) {
      if (!source.id || source.position.length !== 3 || !source.position.every((value) => Number.isFinite(value) && Math.abs(value) <= MAX_WORLD_VALUE)) {
        throw new RangeError('Interaction sources need an id and a finite world-space position');
      }
      positive(source.radius, 'radius');
      positive(source.strength, 'strength', true);
      let slot = slots.get(source.id);
      if (!slot) {
        const free = freeIndices.values().next().value;
        const index = free ?? nextIndex++;
        if (free !== undefined) freeIndices.delete(free);
        if (index >= capacity) {
          capacity *= 2;
          const width = Math.min(capacity * 2, 1024);
          const height = Math.ceil((capacity * 2) / width);
          const expanded = new Float32Array(width * height * 4);
          expanded.set(data);
          data = expanded;
          const replacement = new DataTexture(data, width, height, RGBAFormat, FloatType);
          replacement.needsUpdate = true;
          uniforms.uInteractionTexture.value.dispose();
          uniforms.uInteractionTexture.value = replacement;
          uniforms.uInteractionTextureSize.value.set(width, height);
        }
        slot = { source, index, retiring: false };
        data.set([...source.position, source.radius, 0, 0, 0, 0], index * 8);
        slots.set(source.id, slot);
      }
      // copy inputs so callers cannot move a source behind the registry
      slot.source = { ...source, position: [...source.position] };
      slot.retiring = false;
    },
    // keep the release position until the remaining force fades
    remove(id: string) {
      const slot = slots.get(id);
      if (slot) slot.retiring = true;
    },
    clear() {
      slots.forEach((slot) => {
        slot.retiring = true;
      });
    },
    configure(update: Partial<RepulsionSettings>) {
      for (const [key, value] of Object.entries(update)) positive(value, key);
      Object.assign(settings, update);
      uniforms.uMaxDisplacement.value = settings.maxDisplacement;
    },
    // once per frame, not per field or XR eye
    step(delta: number) {
      if (!Number.isFinite(delta) || delta <= 0) return;
      const rise = -Math.expm1(-settings.activationSpeed * delta);
      const recover = -Math.expm1(-settings.recoverySpeed * delta);
      let count = 0;
      for (const [id, slot] of slots) {
        const { source, index, retiring } = slot;
        const target = source.active && !retiring ? source.strength : 0;
        const offset = index * 8;
        const current = data[offset + 4];
        const blend = target > current ? rise : recover;
        const strength = current + (target - current) * blend;
        data[offset + 4] = strength;

        // fade at the release point instead of following later pointer movement
        if (source.active && !retiring) {
          for (let axis = 0; axis < 3; axis++) {
            data[offset + axis] += (source.position[axis] - data[offset + axis]) * rise;
          }
          data[offset + 3] += (source.radius - data[offset + 3]) * rise;
        }
        // Below 0.01 mm, freeing the slot cannot produce a visible discontinuity.
        if (target === 0 && strength < 0.00001) {
          data[offset + 4] = 0;
          if (retiring) {
            slots.delete(id);
            freeIndices.add(index);
            while (nextIndex > 0 && freeIndices.delete(nextIndex - 1)) nextIndex--;
            continue;
          }
        }
        count = Math.max(count, index + 1);
      }
      if (count > 0 || uniforms.uInteractionCount.value > 0) uniforms.uInteractionTexture.value.needsUpdate = true;
      uniforms.uInteractionCount.value = count;
    },
  };
}

export const interactionStore = createInteractionStore();
