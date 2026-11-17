// big loop of flowing particles. each one just stores where it starts on the loop
// + its offset from the centre line, the shader does the moving

import { useMemo } from 'react';
import * as THREE from 'three';
import type { FieldStreamProps } from '../../../types/field';
import { createStreamParticles } from '../../../utils/fieldParticles';
import { particleFragmentShader, streamVertexShader } from './shaders';
import { useFieldParticleUniforms } from './useFieldParticleUniforms';

export function FieldStream({ config, visibleCount = config.count }: FieldStreamProps) {
  const { center, radii, tilt, period, waveAmplitude, waveFrequency, clumping, opacity } = config;
  const particles = useMemo(() => createStreamParticles(config), [config]);

  const extraUniforms = useMemo(() => {
    const rotation = new THREE.Matrix3().setFromMatrix4(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...tilt)),
    );
    return {
      uCenter: { value: new THREE.Vector3(...center) },
      uRadii: { value: new THREE.Vector2(...radii) },
      uRotation: { value: rotation },
      uSpeed: { value: 1 / period },
      uWaveAmp: { value: waveAmplitude },
      uWaveFreq: { value: Math.round(waveFrequency) },
      uClumping: { value: clumping },
    };
  }, [center, radii, tilt, period, waveAmplitude, waveFrequency, clumping]);

  const uniforms = useFieldParticleUniforms(opacity, extraUniforms);

  return (
    <points frustumCulled={false}>
      <bufferGeometry drawRange={{ start: 0, count: visibleCount }}>
        <bufferAttribute attach="attributes-position" args={[particles.positions, 3]} />
        <bufferAttribute attach="attributes-aProgress" args={[particles.progress, 1]} />
        <bufferAttribute attach="attributes-aOffset" args={[particles.offsets, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[particles.sizes, 1]} />
        <bufferAttribute attach="attributes-aSeed" args={[particles.seeds, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[particles.colors, 3]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={streamVertexShader}
        fragmentShader={particleFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
