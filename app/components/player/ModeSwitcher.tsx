'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { FieldQualityControls } from '../field/quality/FieldQualityControls';
import { usePlayers } from './PlayerProvider';

export function ModeSwitcher() {
  const { mode, setMode, localPlayer } = usePlayers();
  const movement = useSyncExternalStore(localPlayer.subscribeState, localPlayer.getMovementSnapshot, localPlayer.getMovementSnapshot);
  return (
    <section aria-label="Experience mode" style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, padding: 10, maxWidth: 310, background: '#111e', color: 'white', fontSize: 13 }}>
      <div role="group" aria-label="Choose experience mode" style={{ display: 'flex', gap: 8 }}>
        <button type="button" aria-pressed={mode === 'overview'} onClick={() => setMode('overview')} style={{ padding: '6px 10px', border: '1px solid currentColor' }}>Overview</button>
        <button type="button" aria-pressed={mode === 'firstPerson'} onClick={() => setMode('firstPerson')} style={{ padding: '6px 10px', border: '1px solid currentColor' }}>First person</button>
      </div>
      <FieldQualityControls />
      <output aria-label="Player state" style={{ display: 'block', marginTop: 8 }}>{movement.toUpperCase()}</output>
      <p style={{ marginTop: 8 }}>{mode === 'overview' ? 'Left hold: repel · Right drag: orbit · Wheel: zoom' : 'WASD: move · Floating: Space up / Shift down · On planet: Space to detach · Esc: release mouse. Click for mouse-look; drag if lock is unavailable.'}</p>
      {process.env.NODE_ENV === 'development' && <PlayerDebug />}
    </section>
  );
}

function PlayerDebug() {
  const { localPlayer: player } = usePlayers();
  const output = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const vector = (value: { toArray(): number[] }) => value.toArray().map((n) => n.toFixed(2)).join(', ');
    const update = () => {
      const debug = player.debug;
      if (output.current) output.current.textContent = [
        player.movementState, `velocity: ${vector(player.velocity)}`,
        `planet: ${debug.activePlanet ?? 'none'}`, `nearest surface: ${debug.closestPlanetDistance.toFixed(2)} m`,
        `field: ${debug.fieldContact ?? 'none'}`, `gravity: ${vector(debug.gravityDirection)}`,
        `UP: ${vector(player.localUp)}`, `target: ${vector(debug.landingTarget)}`,
        `recapture: ${debug.cooldown.toFixed(2)} s (${debug.excludedPlanet ?? 'none'})`,
        `field cooldown: ${debug.fieldCooldown.toFixed(2)} s`,
      ].join('\n');
    };
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [player]);
  return <details><summary>Locomotion debug</summary><pre ref={output} style={{ whiteSpace: 'pre-wrap', fontSize: 11 }} /></details>;
}
