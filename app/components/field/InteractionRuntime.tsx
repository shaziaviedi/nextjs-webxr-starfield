import { useFrame } from '@react-three/fiber';
import { interactionStore } from '../../simulation/interactionStore';

export function InteractionRuntime() {
  // Negative priority preserves R3F/XR's render loop and updates shared uniforms only once.
  useFrame((_, delta) => interactionStore.step(delta), -100);
  return null;
}
