import { useFrame } from '@react-three/fiber';
import { interactionStore } from '../../simulation/interactionStore';

export function InteractionRuntime() {
  // after input/player updates, before particle uniforms; leave XR rendering to R3F
  useFrame((_, delta) => interactionStore.step(delta), -0.25);
  return null;
}
