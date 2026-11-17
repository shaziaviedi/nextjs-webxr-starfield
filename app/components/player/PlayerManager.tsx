import { useXR } from '@react-three/xr';
import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { FIELD_BODIES } from '../../data/fieldBodies';
import { FIELD_STREAMS } from '../../data/fieldParticles';
import { PLANET_GRAVITY, PLAYER_SETTINGS } from '../../data/player';
import { createBodyColliders } from '../../simulation/bodies/bodyColliders';
import { createStreamRegion } from '../../simulation/player/fieldRegions';
import { createGravitySources } from '../../simulation/player/gravity';
import { createPlayerLocomotion } from '../../simulation/player/locomotion';
import type { Player as PlayerModel } from '../../simulation/player/Player';
import { useFieldMotionModel } from '../field/FieldMotionProvider';
import { Player } from './Player';
import { usePlayers } from './PlayerProvider';

export function PlayerManager() {
  const { registry, localPlayer, mode } = usePlayers();
  const session = useXR((state) => state.session);
  const model = useFieldMotionModel();
  const locomotion = useMemo(() => {
    const regions = PLAYER_SETTINGS.activeFieldRegions.map(({ streamId, radius }) => {
      const stream = FIELD_STREAMS.find((entry) => entry.id === streamId);
      if (!stream) throw new Error(`Unknown active field stream: ${streamId}`);
      return createStreamRegion(stream, radius);
    });
    const colliders = createBodyColliders(FIELD_BODIES, model);
    const gravitySources = createGravitySources(colliders, PLAYER_SETTINGS, PLANET_GRAVITY);
    return createPlayerLocomotion(
      PLAYER_SETTINGS,
      gravitySources,
      regions,
      (kind, id, target) => kind === 'player' ? registry.getWorldPosition(id, target) : undefined,
    );
  }, [model, registry]);
  const spawned = useRef(false);
  const simulateLocal = useCallback((player: PlayerModel, delta: number) => {
    if (mode === 'firstPerson' && !session) locomotion.step(player, delta);
    else player.step(delta);
  }, [mode, session, locomotion]);
  useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);

  useLayoutEffect(() => {
    // desktop mode only controls the local player
    localPlayer.active = mode === 'firstPerson' && !session;
    if (localPlayer.active && !spawned.current) {
      locomotion.prepareSpawn(localPlayer);
      spawned.current = true;
    }
    if (localPlayer.active) locomotion.resume(localPlayer);
    localPlayer.velocity.set(0, 0, 0);
    localPlayer.desiredVelocity.set(0, 0, 0);
    return () => {
      localPlayer.active = false;
      localPlayer.velocity.set(0, 0, 0);
      localPlayer.desiredVelocity.set(0, 0, 0);
    };
  }, [mode, session, localPlayer, locomotion]);

  return <>{registry.getAll().map((player) => <Player key={player.id} player={player} simulate={player === localPlayer ? simulateLocal : undefined} />)}</>;
}
