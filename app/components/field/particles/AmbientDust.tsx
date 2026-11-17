import { useMemo } from 'react';
import * as THREE from 'three';
import type { AmbientDustProps } from '../../../types/field';
import { createDustParticles } from '../../../utils/fieldParticles';
import { dustVertexShader, particleFragmentShader } from './shaders';
import { useFieldParticleUniforms } from './useFieldParticleUniforms';

export function AmbientDust({ config, visibleCount = config.count }: AmbientDustProps) {
  const { flowAmount, opacity } = config;
  const particles = useMemo(() => createDustParticles(config), [config]);

  const extraUniforms = useMemo(() => ({ uFlowAmount: { value: flowAmount } }), [flowAmount]);
  const uniforms = useFieldParticleUniforms(opacity, extraUniforms);

  return (
    // shader moves them off their start spot, culling would hide them wrongly
    <points frustumCulled={false}>
      <bufferGeometry drawRange={{ start: 0, count: visibleCount }}>
        <bufferAttribute attach="attributes-position" args={[particles.positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[particles.sizes, 1]} />
        <bufferAttribute attach="attributes-aSeed" args={[particles.seeds, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[particles.colors, 3]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={dustVertexShader}
        fragmentShader={particleFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
