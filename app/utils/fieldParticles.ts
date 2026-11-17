import { MathUtils } from 'three';
import type { AmbientDustConfig, FieldStreamConfig } from '../types/field';
import { createParticleLook } from './particleLook';
import { createSeededRandom } from './random';

function append<T extends Record<string, Float32Array>>(original: T, added: T): T {
  return Object.fromEntries(Object.keys(original).map((key) => {
    const array = new Float32Array(original[key].length + added[key].length);
    array.set(original[key]); array.set(added[key], original[key].length);
    return [key, array];
  })) as T;
}

export function createStreamParticles(config: FieldStreamConfig) {
  const generate = (count: number, seed: number) => {
    const random = createSeededRandom(seed);
    const progress = new Float32Array(count), offsets = new Float32Array(count * 3);
    const bell = () => (random() + random() + random() - 1.5) / 1.5;
    for (let i = 0; i < count; i++) {
      progress[i] = random();
      offsets[i * 3] = bell() * config.spread;
      offsets[i * 3 + 1] = bell() * config.spread * config.flatness;
      offsets[i * 3 + 2] = bell() * config.spread;
    }
    return { positions: new Float32Array(count * 3), progress, offsets, ...createParticleLook(config, count, random) };
  };
  const reference = Math.min(config.referenceCount ?? config.count, config.count);
  const original = generate(reference, config.seed);
  // a separate seed keeps every original particle attribute unchanged
  return config.count > reference ? append(original, generate(config.count - reference, config.seed ^ 0x9e3779b9)) : original;
}

function densityAt(x: number, y: number, z: number) {
  return (Math.sin(x * 0.13 + 0.7) + Math.sin(y * 0.21 + 1.3) + Math.sin(z * 0.11 + 2.1) + Math.sin((x + z) * 0.07)) / 4;
}

export function createDustParticles(config: AmbientDustConfig) {
  const generate = (count: number, seed: number) => {
    const random = createSeededRandom(seed), positions = new Float32Array(count * 3);
    const [centerX, centerY, centerZ] = config.center;
    let placed = 0, attempts = 0;
    while (placed < count && attempts < count * 30) {
      attempts++;
      const theta = random() * Math.PI * 2, phi = Math.acos(2 * random() - 1);
      const distance = config.innerRadius + (config.outerRadius - config.innerRadius) * Math.pow(random(), 1.6);
      const x = centerX + distance * Math.sin(phi) * Math.cos(theta);
      const y = centerY + distance * Math.cos(phi) * 0.6;
      const z = centerZ + distance * Math.sin(phi) * Math.sin(theta);
      const cloudiness = MathUtils.smoothstep(densityAt(x, y, z), -0.45, 0.45);
      if (random() > 1 - config.clumpiness * (1 - cloudiness)) continue;
      positions[placed * 3] = x; positions[placed * 3 + 1] = y; positions[placed * 3 + 2] = z;
      placed++;
    }
    return { positions, ...createParticleLook(config, count, random) };
  };
  const reference = Math.min(config.referenceCount ?? config.count, config.count);
  const original = generate(reference, config.seed);
  return config.count > reference ? append(original, generate(config.count - reference, config.seed ^ 0x9e3779b9)) : original;
}
