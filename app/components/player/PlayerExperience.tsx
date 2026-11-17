import { DesktopPlayerControls } from '../controls/DesktopPlayerControls';
import { OverviewControls } from '../controls/OverviewControls';
import { PlayerManager } from './PlayerManager';
import { usePlayers } from './PlayerProvider';

export function PlayerExperience() {
  const { mode } = usePlayers();
  return (
    <>
      <OverviewControls enabled={mode === 'overview'} />
      <DesktopPlayerControls />
      <PlayerManager />
    </>
  );
}
