import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Quaternion, Vector3 } from 'three';
import { FIELD_STREAMS } from '../app/data/fieldParticles';
import { PLAYER_SETTINGS as settings } from '../app/data/player';
import { Player } from '../app/simulation/player/Player';
import { PlayerRegistry } from '../app/simulation/player/PlayerRegistry';
import { sweepCapsule } from '../app/simulation/player/contacts';
import { createStreamRegion, findActiveRegion } from '../app/simulation/player/fieldRegions';
import { createGravitySources } from '../app/simulation/player/gravity';
import { createPlayerLocomotion } from '../app/simulation/player/locomotion';

const actor = (position = new Vector3(0, 0, 4)) => new Player({ id: 'local', ownership: 'local', position });
const region = { id: 'test-stream', radius: 0.4, points: [new Vector3(-10, 1, -2), new Vector3(10, 1, -2)] };
type Sim = ReturnType<typeof createPlayerLocomotion>;
const advance = (sim: Sim, p: Player, seconds: number, fps = 60) => {
  for (let i = 0; i < Math.round(seconds * fps); i++) sim.step(p, 1 / fps);
};
const until = (sim: Sim, p: Player, state: Player['movementState'], limit = 600) => {
  for (let i = 0; i < limit && p.getMovementSnapshot() !== state; i++) sim.step(p, 1 / 60);
  assert.equal(p.movementState, state);
};
const land = (normal = new Vector3(0, 1, 0)) => {
  const body = { id: 'planet', radius: 1, position: new Vector3(0, 5, 0) };
  const p = actor(body.position.clone().addScaledVector(normal, 3));
  p.movementState = 'FLOATING';
  const sim = createPlayerLocomotion(settings, [body], []);
  until(sim, p, 'WALKING_PLANET');
  return { body, p, sim };
};

test('ground spawn, designated volumes, debounce and a strong finite launch', () => {
  const regions = settings.activeFieldRegions.map((entry) => createStreamRegion(FIELD_STREAMS.find((stream) => stream.id === entry.streamId)!, entry.radius));
  const p = actor(); const sim = createPlayerLocomotion(settings, [], regions);
  sim.prepareSpawn(p); advance(sim, p, 2);
  assert.equal(p.movementState, 'WALKING_GROUND'); assert.equal(p.position.y, 0);
  for (let i = 0; i < 5; i++) {
    p.position.z = -2; advance(sim, p, 0.1);
    p.position.z = 4; advance(sim, p, 0.1);
  }
  assert.equal(p.movementState, 'WALKING_GROUND');
  p.position.z = -2;
  advance(sim, p, 0.2); assert.equal(p.movementState, 'LAUNCHING');
  p.desiredVelocity.set(3, -3, 0); // launch cannot be cancelled by horizontal/down input
  advance(sim, p, settings.launchDuration);
  assert.equal(p.movementState, 'FLOATING'); assert.ok(p.position.y > 4);
  p.desiredVelocity.set(0, 0, 0); advance(sim, p, 8);
  assert.ok(p.velocity.length() < 0.001); assert.ok(p.position.y < 10);
  const other = actor(new Vector3(0, 0, -2)); advance(createPlayerLocomotion(settings, [], []), other, 2);
  assert.equal(other.movementState, 'WALKING_GROUND', 'dust alone cannot launch');
});

test('one launch per entry, cooldown and no retrigger while floating in a field', () => {
  const p = actor(new Vector3(0, 0, -2)); const sim = createPlayerLocomotion(settings, [], [region]);
  const states: string[] = []; p.subscribeState(() => states.push(p.movementState));
  advance(sim, p, 5); assert.deepEqual(states, ['LAUNCHING', 'FLOATING']);
  p.movementState = 'WALKING_GROUND'; p.position.set(0, 0, -2); advance(sim, p, 2);
  assert.equal(p.movementState, 'WALKING_GROUND', 'remaining in same entry stays disarmed');
  p.position.z = 5; advance(sim, p, 0.1); p.position.z = -2; advance(sim, p, 0.2);
  assert.equal(p.movementState, 'LAUNCHING');
});

test('tilted stream volume checks full capsule and preserves authored region geometry', () => {
  const stream = FIELD_STREAMS.find((entry) => entry.id === 'standing-loop')!;
  const volume = createStreamRegion(stream, 0.3);
  const feet = volume.points[23].clone().add(new Vector3(0, -1.5, 0));
  assert.equal(findActiveRegion(feet, 0.3, 1.8, [volume]), stream.id);
  assert.equal(findActiveRegion(feet.clone().addScalar(100), 0.3, 1.8, [volume]), undefined);
});

test('floating controls are bounded, vertical and gently damped', () => {
  const p = actor(); p.movementState = 'FLOATING';
  const sim = createPlayerLocomotion(settings, [], []);
  p.desiredVelocity.set(2, 2, -2); advance(sim, p, 1);
  assert.ok(p.position.x > 0.5 && p.position.y > 0.5 && p.position.z < 3.5);
  assert.ok(p.velocity.length() <= settings.floatSpeed + 1e-8);
  p.desiredVelocity.set(0, -3, 0); const y = p.position.y; advance(sim, p, 2); assert.ok(p.position.y < y);
  p.desiredVelocity.set(0, 0, 0); advance(sim, p, 0.1); assert.ok(p.velocity.length() > 0.1);
});

test('capture starts before contact, attracts without teleporting and aligns gradually', () => {
  const body = { id: 'planet', radius: 1, position: new Vector3(0, 5, 0) };
  const p = actor(new Vector3(3, 5, 0)); p.movementState = 'FLOATING';
  p.lookOrientation.setFromAxisAngle(new Vector3(1, 0, 0), 0.3);
  const look = p.lookOrientation.clone(), sim = createPlayerLocomotion(settings, [body], []);
  const start = p.position.clone(); sim.step(p, 1 / 60);
  assert.equal(p.movementState, 'PLANET_CAPTURE');
  assert.ok(p.position.distanceTo(start) < 0.02); assert.ok(p.velocity.x < 0);
  assert.ok(p.localUp.x > 0 && p.localUp.x < 0.3, 'UP changes gradually');
  until(sim, p, 'WALKING_PLANET');
  assert.ok(Math.abs(p.position.distanceTo(body.position) - 1.08) < 0.003);
  assert.ok(p.localUp.dot(p.support!.normal) > 0.999);
  assert.ok(p.lookOrientation.equals(look), 'body gravity never rewrites local look');
});

test('capture overrides an active launch, with per-body configurable gravity', () => {
  const body = { id: 'planet', radius: 1, position: new Vector3(0, 5, -2) };
  const p = actor(new Vector3(0, 0, -2));
  const sources = createGravitySources([body], settings, { planet: { captureDistance: 4, attractionStrength: 10 } });
  const sim = createPlayerLocomotion(settings, sources, [region]);
  until(sim, p, 'LAUNCHING'); sim.step(p, 1 / 60);
  assert.equal(p.movementState, 'PLANET_CAPTURE');
  until(sim, p, 'WALKING_PLANET');
  assert.throws(() => createGravitySources([body], settings, { planet: { radius: NaN } }), /Invalid gravity/);
});

test('held steering cannot prevent a small planet from completing capture', () => {
  const body = { id: 'small', radius: 0.08, position: new Vector3(0, 4, 0) };
  const p = actor(new Vector3(0, 6, 0)); p.movementState = 'FLOATING'; p.desiredVelocity.set(3, 0, 0);
  const sim = createPlayerLocomotion(settings, [body], []); until(sim, p, 'WALKING_PLANET');
  assert.ok(Math.abs(p.position.distanceTo(body.position) - 0.16) < 0.003);
});

test('attached walking still detects another solid body moving into the capsule', () => {
  const { body, p } = land();
  const second = { id: 'intruder', radius: 0.25, position: new Vector3(3, 7, 0) };
  const sim = createPlayerLocomotion(settings, [body, second], []); sim.resume(p);
  second.position.x = 0; sim.step(p, 0.1);
  assert.equal(p.movementState, 'PLANET_CAPTURE');
  assert.equal(p.debug.activePlanet, second.id);
  assert.ok(p.position.toArray().every(Number.isFinite));
});

test('surface walking traverses sides, poles and underside at stable radius', () => {
  const { body, p, sim } = land();
  let underside = false, side = false; let maxAngle = 0;
  for (let i = 0; i < 300; i++) {
    p.desiredVelocity.set(0, 0, -settings.planetSpeed).applyQuaternion(p.orientation);
    const before = p.orientation.clone(); sim.step(p, 1 / 60);
    maxAngle = Math.max(maxAngle, before.angleTo(p.orientation));
    assert.equal(p.movementState, 'WALKING_PLANET');
    assert.ok(Math.abs(p.position.distanceTo(body.position) - 1.08) < 1e-8);
    assert.ok(p.localUp.dot(p.support!.normal) > 0.999);
    if (p.support!.normal.y < -0.8) underside = true;
    if (Math.abs(p.support!.normal.y) < 0.1) side = true;
  }
  assert.ok(underside && side); assert.ok(maxAngle < 0.04, 'no pole flips');
});

test('moving planet attachment has no relative sliding and detachment inherits translation', () => {
  const { body, p, sim } = land(); p.desiredVelocity.set(0, 0, 0); advance(sim, p, 1);
  const relative = p.position.clone().sub(body.position);
  for (let i = 0; i < 120; i++) {
    body.position.add(new Vector3(0.01, 0.005, -0.002)); sim.step(p, 1 / 60);
    assert.ok(p.position.clone().sub(body.position).distanceTo(relative) < 1e-7);
  }
  const normal = p.support!.normal.clone(); p.detachRequested = true;
  body.position.x += 0.01; sim.step(p, 1 / 60);
  assert.equal(p.movementState, 'DETACHING'); assert.equal(p.grounded, false);
  assert.ok(p.velocity.dot(normal) > 5); assert.ok(p.velocity.x > 0.5);
  assert.equal(p.support, null); assert.ok(p.debug.cooldown > 1.3);
});

test('detachment keeps tangent velocity, cooldown blocks same planet but not other planets', () => {
  const { body, p, sim } = land();
  p.desiredVelocity.set(2, 0, 0); advance(sim, p, 0.25);
  const tangent = p.velocity.clone().projectOnPlane(p.support!.normal);
  const normal = p.support!.normal.clone(); p.detachRequested = true; sim.step(p, 1 / 120);
  assert.ok(p.velocity.clone().projectOnPlane(normal).distanceTo(tangent) < 0.02);
  p.desiredVelocity.set(0, 0, 0); advance(sim, p, 0.25);
  assert.equal(p.movementState, 'FLOATING');
  // Put the test actor back inside the capture region during cooldown, not through the body.
  p.position.copy(body.position).addScaledVector(normal, 2); p.velocity.set(0, 0, 0);
  advance(sim, p, 0.5); assert.equal(p.movementState, 'FLOATING');
  advance(sim, p, 1); assert.notEqual(p.movementState, 'FLOATING');

  const second = { id: 'second', radius: 0.5, position: new Vector3(2.5, 5, 0) };
  const another = createPlayerLocomotion(settings, [body, second], []);
  const q = actor(body.position.clone().add(new Vector3(0, 3, 0))); q.movementState = 'FLOATING';
  until(another, q, 'WALKING_PLANET');
  const left = q.support!.id; q.detachRequested = true; another.step(q, 1 / 60);
  q.position.copy(left === body.id ? second.position : body.position).add(new Vector3(0, 1.6, 0)); q.velocity.set(0, 0, 0);
  another.step(q, 1 / 60); assert.equal(q.movementState, 'PLANET_CAPTURE');
  assert.notEqual(q.debug.activePlanet, left);
});

test('cooldown does not disable swept collision protection', () => {
  const { body, p, sim } = land(); p.detachRequested = true; sim.step(p, 1 / 60);
  p.position.copy(body.position).add(new Vector3(0, 1.2, 0)); p.velocity.set(0, -100, 0);
  p.desiredVelocity.set(0, -3, 0); sim.step(p, 0.1);
  assert.ok(p.position.distanceTo(body.position) >= body.radius);
  assert.notEqual(p.movementState, 'PLANET_CAPTURE');
});

test('underside capture and free-flight reorientation are finite and gradual', () => {
  const { p, sim } = land(new Vector3(0, -1, 0));
  assert.ok(p.localUp.y < -0.999); const before = p.orientation.clone();
  p.detachRequested = true; sim.step(p, 1 / 60);
  assert.ok(before.angleTo(p.orientation) < 0.3);
  advance(sim, p, 1); assert.ok(p.localUp.y > 0.95);
  assert.ok(p.orientation.toArray().every(Number.isFinite));
});

test('sweeps catch fast relative body motion and oriented underside capsules', () => {
  const body = { id: 'tiny', radius: 0.1, position: new Vector3(0, 4, 0) };
  const hit = sweepCapsule(new Vector3(0, 10, 0), new Vector3(0, -20, 0), 0.3, 1.8, body, body.position, new Vector3());
  assert.ok(hit && hit.time > 0 && hit.time < 1);
  const oriented = sweepCapsule(new Vector3(0, 0, 0), new Vector3(20, 0, 0), 0.3, 1.8,
    { ...body, position: new Vector3(5, -1, 0) }, new Vector3(5, -1, 0), new Vector3(), new Vector3(0, -1, 0));
  assert.ok(oriented && oriented.time > 0 && oriented.time < 1);
  const p = actor(new Vector3(0, 2, 0)); p.movementState = 'FLOATING';
  const moving = { id: 'moving', radius: 1, position: new Vector3(3, 3, 0) };
  const sim = createPlayerLocomotion(settings, [moving], []); sim.resume(p); moving.position.x = 0; sim.step(p, 0.1);
  assert.equal(p.movementState, 'PLANET_CAPTURE'); assert.ok(p.position.toArray().every(Number.isFinite));
});

test('explicit future player contacts attach and safely release when unregistered', () => {
  const registry = new PlayerRegistry();
  const peer = new Player({ id: 'peer', ownership: 'remote', position: new Vector3(4, 5, 6) }); registry.register(peer);
  const p = actor(new Vector3(4, 8, 6)); p.movementState = 'FLOATING';
  const sim = createPlayerLocomotion(settings, [], [], (kind, id, out) => kind === 'player' ? registry.getWorldPosition(id, out) : undefined);
  assert.ok(sim.beginLanding(p, { kind: 'player', id: peer.id, point: new Vector3(4, 6, 6), normal: new Vector3(0, 1, 0) }));
  until(sim, p, 'WALKING_PLANET'); assert.equal(p.support?.kind, 'player');
  peer.position.y += 2; sim.step(p, 1 / 60); assert.ok(p.position.y > 8);
  registry.unregister(peer.id); sim.step(p, 1 / 60); assert.equal(p.movementState, 'FLOATING');
});

test('pause/resume and repeated transitions preserve anchors without stale body sweeps', () => {
  const { body, p, sim } = land(); const normal = p.support!.normal.clone(), look = p.lookOrientation.clone();
  p.active = false; const paused = p.position.clone(); body.position.y += 2; advance(sim, p, 1); assert.ok(p.position.equals(paused));
  p.active = true; sim.resume(p); sim.step(p, 1 / 60);
  assert.ok(p.position.clone().sub(body.position).distanceTo(normal.multiplyScalar(1.08)) < 0.003);
  for (let cycle = 0; cycle < 4; cycle++) {
    p.detachRequested = true; sim.step(p, 1 / 60); advance(sim, p, 1.5);
    p.position.copy(body.position).add(new Vector3(0, 3, 0)); p.velocity.set(0, 0, 0);
    until(sim, p, 'WALKING_PLANET');
  }
  assert.ok(p.lookOrientation.equals(look));
});

test('30/60/120 Hz movement agrees and only state changes notify React subscribers', () => {
  const results = [30, 60, 120].map((fps) => {
    const p = actor(); let notices = 0; p.subscribeState(() => notices++);
    p.movementState = 'FLOATING'; p.desiredVelocity.set(1, 1, -1);
    const sim = createPlayerLocomotion(settings, [], []); advance(sim, p, 1, fps); assert.equal(notices, 1);
    return p.position.clone();
  });
  results.forEach((position) => assert.ok(position.distanceTo(results[0]) < 1e-8));
  const orientations = [30, 60, 120].map((fps) => {
    const { p, sim } = land();
    for (let i = 0; i < 2 * fps; i++) { p.desiredVelocity.set(2, 0, 0).applyQuaternion(p.orientation); sim.step(p, 1 / fps); }
    return p.orientation.clone();
  });
  orientations.forEach((q) => assert.ok(q.angleTo(orientations[0]) < 0.002));
  assert.ok(new Quaternion().angleTo(orientations[0]) > 0.1);
});
