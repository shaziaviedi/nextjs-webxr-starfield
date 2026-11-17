import { FIELD_BODIES } from '../../data/fieldBodies';
import { CelestialBody } from './bodies/CelestialBody';

export function FieldSystem() {
  return (
    <>
      {FIELD_BODIES.map((body) => (
        <CelestialBody key={body.id} {...body} />
      ))}
    </>
  );
}
