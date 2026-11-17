// density only changes draw ranges; all nine fields keep their paths

import { DUST_VOLUMES, FIELD_STREAMS } from '../../data/fieldParticles';
import { particleCount } from '../../data/fieldQuality';
import { InteractionRuntime } from './InteractionRuntime';
import { AmbientDust } from './particles/AmbientDust';
import { FieldStream } from './particles/FieldStream';
import { useFieldQuality } from './quality/FieldQualityProvider';
import { FieldQualityRuntime } from './quality/FieldQualityRuntime';

export function GravitationalField() {
  const { quality } = useFieldQuality();
  return (
    <group>
      <InteractionRuntime />
      <FieldQualityRuntime />
      {DUST_VOLUMES.map((dust) => (
        <AmbientDust key={dust.id} config={dust} visibleCount={particleCount(dust, 'dust', quality)} />
      ))}
      {FIELD_STREAMS.map((stream) => (
        <FieldStream key={stream.id} config={stream} visibleCount={particleCount(stream, 'streams', quality)} />
      ))}
    </group>
  );
}
