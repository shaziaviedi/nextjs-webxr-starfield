'use client';

import { useEffect, useState } from 'react';
import { interactionStore } from '../../simulation/interactionStore';

const SOURCE_ID = 'repulsion-test';

/** Temporary opt-in test harness. Normal visits have no source or extra scene geometry. */
export function RepulsionTestControls() {
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState<[number, number, number]>([0, 2.5, -2]);
  const [radius, setRadius] = useState(3);
  const [strength, setStrength] = useState(1.8);
  const [recoverySpeed, setRecoverySpeed] = useState(3);

  useEffect(() => {
    setVisible(new URLSearchParams(window.location.search).get('repulsionTest') === '1');
  }, []);

  useEffect(() => {
    if (!visible) return;
    interactionStore.upsert({ id: SOURCE_ID, position, radius, strength, active, type: 'test' });
    return () => interactionStore.remove(SOURCE_ID);
  }, [visible, active, position, radius, strength]);

  useEffect(() => {
    if (visible) interactionStore.configure({ recoverySpeed });
  }, [visible, recoverySpeed]);

  if (!visible) return null;

  return (
    <section aria-label="Repulsion test" style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, padding: 12, width: 270, background: '#111e', color: 'white', fontSize: 13 }}>
      <strong>Temporary repulsion source</strong>
      <p>Fixed world position near the crossing stream. Activate, then release to watch recovery.</p>
      <button type="button" aria-pressed={active} onClick={() => setActive(!active)} style={{ padding: '6px 12px', border: '1px solid currentColor', margin: '8px 0' }}>
        {active ? 'Release source' : 'Activate source'}
      </button>
      {position.map((value, axis) => (
        <label key={axis} style={{ display: 'block' }}>
          {'XYZ'[axis]} (m): {value.toFixed(1)}
          <input aria-label={`Source ${'XYZ'[axis]}`} type="range" min={-25} max={25} step={0.1} value={value} style={{ width: '100%' }} onChange={(event) => {
            const next: [number, number, number] = [...position];
            next[axis] = Number(event.target.value);
            setPosition(next);
          }} />
        </label>
      ))}
      {[
        { label: 'Radius (m)', value: radius, set: setRadius, min: 0.1, max: 10 },
        { label: 'Strength (m)', value: strength, set: setStrength, min: 0, max: 3 },
        { label: 'Recovery speed (1/s)', value: recoverySpeed, set: setRecoverySpeed, min: 0.2, max: 10 },
      ].map(({ label, value, set, min, max }) => (
        <label key={label} style={{ display: 'block' }}>
          {label}: {value.toFixed(1)}
          <input aria-label={label} type="range" min={min} max={max} step={0.1} value={value} style={{ width: '100%' }} onChange={(event) => set(Number(event.target.value))} />
        </label>
      ))}
    </section>
  );
}
