'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Vector3 } from 'three';
import { PLAYER_SETTINGS } from '../../data/player';
import { Player } from '../../simulation/player/Player';
import { PlayerRegistry } from '../../simulation/player/PlayerRegistry';

export type ExperienceMode = 'overview' | 'firstPerson';

type PlayerContextValue = {
  registry: PlayerRegistry;
  localPlayer: Player;
  mode: ExperienceMode;
  setMode: (mode: ExperienceMode) => void;
};
const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(() => {
    const registry = new PlayerRegistry();
    // position is at the feet; the camera adds eye height
    const localPlayer = new Player({ id: 'local', ownership: 'local', position: new Vector3(...PLAYER_SETTINGS.spawn), active: false });
    registry.register(localPlayer);
    return { registry, localPlayer };
  });
  const [mode, setModeState] = useState<ExperienceMode>('overview');
  const setMode = useCallback((next: ExperienceMode) => {
    runtime.localPlayer.velocity.set(0, 0, 0);
    runtime.localPlayer.desiredVelocity.set(0, 0, 0);
    setModeState(next);
  }, [runtime]);
  const value = useMemo(() => ({ ...runtime, mode, setMode }), [runtime, mode, setMode]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayers() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayers requires PlayerProvider');
  return context;
}
