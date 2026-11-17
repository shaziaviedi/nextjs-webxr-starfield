import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { useEffect, useMemo, useRef } from 'react';
import { DUST_VOLUMES, FIELD_STREAMS } from '../../../data/fieldParticles';
import { particleCount } from '../../../data/fieldQuality';
import { createQualityGovernor } from '../../../simulation/qualityGovernor';
import { useFieldQuality } from './FieldQualityProvider';

export function FieldQualityRuntime() {
  const { selection, quality, autoQuality, setAutoQuality, setXRActive, setPerformance } = useFieldQuality();
  const session = useXR((state) => state.session);
  const governor = useMemo(createQualityGovernor, []);
  useEffect(() => { governor.reset(); }, [selection, governor]);
  const sampling = useRef({ warmup: 0, elapsed: 0, frames: [] as number[] });
  useEffect(() => { setXRActive(Boolean(session)); }, [session, setXRActive]);
  useEffect(() => { sampling.current = { warmup: 0, elapsed: 0, frames: [] }; }, [selection, quality, session]);

  useFrame((_, delta) => {
    const sample = sampling.current;
    // skip tab-resume pauses, but count slow foreground frames
    if (document.hidden || !Number.isFinite(delta) || delta <= 0 || delta > 2) {
      sample.elapsed = 0; sample.frames.length = 0; sample.warmup = 0;
      return;
    }
    sample.warmup += delta;
    if (sample.warmup < 3) return;
    sample.frames.push(delta * 1000);
    sample.elapsed += delta;
    if (sample.elapsed < 2) return;
    sample.frames.sort((a, b) => a - b);
    const meanMs = sample.elapsed * 1000 / sample.frames.length;
    const p95Ms = sample.frames[Math.floor((sample.frames.length - 1) * 0.95)];
    const particles = DUST_VOLUMES.reduce((sum, config) => sum + particleCount(config, 'dust', quality), 0)
      + FIELD_STREAMS.reduce((sum, config) => sum + particleCount(config, 'streams', quality), 0);
    // diagnostics only update once per sample window
    setPerformance({ fps: 1000 / meanMs, meanMs, p95Ms, samples: sample.frames.length, quality, particles });
    if (selection === 'auto' && !session) setAutoQuality(governor.sample(autoQuality, meanMs, p95Ms));
    sample.elapsed = 0; sample.frames.length = 0;
  });
  return null;
}
