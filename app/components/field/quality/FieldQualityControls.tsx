'use client';

import { useEffect, useState } from 'react';
import { DUST_VOLUMES, FIELD_STREAMS } from '../../../data/fieldParticles';
import type { QualitySelection } from '../../../data/fieldQuality';
import { particleCount } from '../../../data/fieldQuality';
import { useFieldQuality } from './FieldQualityProvider';

export function FieldQualityControls() {
  const { selection, setSelection, quality, xrActive, performance } = useFieldQuality();
  const [showPerformance, setShowPerformance] = useState(false);
  useEffect(() => { setShowPerformance(new URLSearchParams(window.location.search).get('performance') === '1'); }, []);
  const count = DUST_VOLUMES.reduce((sum, config) => sum + particleCount(config, 'dust', quality), 0)
    + FIELD_STREAMS.reduce((sum, config) => sum + particleCount(config, 'streams', quality), 0);
  return (
    <div style={{ marginTop: 8 }}>
      <label>Density: <select aria-label="Particle quality" value={selection} onChange={(event) => setSelection(event.target.value as QualitySelection)} style={{ background: '#111', color: 'white', border: '1px solid currentColor' }}>
        <option value="auto">Auto</option><option value="low">Low</option><option value="balanced">Balanced</option><option value="high">High</option>
      </select></label>
      <output aria-label="Field quality" style={{ display: 'block' }}>{quality}{xrActive ? ' (XR)' : ''} · {count.toLocaleString('en-US')} field particles</output>
      {showPerformance && <output aria-label="Frame performance" style={{ display: 'block' }}>{performance && performance.quality === quality ? `${performance.fps.toFixed(0)} FPS · p95 ${performance.p95Ms.toFixed(1)} ms` : 'Measuring frame timing…'}</output>}
    </div>
  );
}
