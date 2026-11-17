import { useFrame } from '@react-three/fiber';
import { useEffect } from 'react';
import { interactionStore } from '../../simulation/interactionStore';
import type { Player as PlayerModel } from '../../simulation/player/Player';

// no avatar yet; just step the model and publish its interaction source
export function Player({ player, simulate }: { player: PlayerModel; simulate?: (player: PlayerModel, delta: number) => void }) {
  useEffect(() => () => interactionStore.remove(player.interactionSourceId), [player]);

  useFrame((_, delta) => {
    if (!player.active) {
      interactionStore.remove(player.interactionSourceId);
      return;
    }
    // cap tab-resume jumps
    if (simulate) simulate(player, Math.min(delta, 0.1));
    else player.step(Math.min(delta, 0.1));
    interactionStore.upsert(player.toInteractionSource());
  }, -0.5);

  return null;
}
