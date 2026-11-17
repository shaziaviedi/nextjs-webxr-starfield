import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { FIELD_BODIES, MOTION_NODES } from '../app/data/fieldBodies';
import { PLAYER_SETTINGS } from '../app/data/player';
import { createBodyColliders } from '../app/simulation/bodies/bodyColliders';
import { createKinematicModel } from '../app/simulation/bodies/kinematicModel';
import { createGroundMovement } from '../app/simulation/player/groundMovement';
import { Player } from '../app/simulation/player/Player';

const playerAt = (x = 0, z = 4) => new Player({ id: 'test', ownership: 'local', position: new Vector3(x, 0, z) });

test('configured spawn starts walking at ground height and outside current celestial bodies', () => {
  const model = createKinematicModel(MOTION_NODES);
  model.step(42, 0);
  const sim = createGroundMovement(PLAYER_SETTINGS, createBodyColliders(FIELD_BODIES, model));
  const player = playerAt();
  player.position.fromArray(PLAYER_SETTINGS.spawn);
  sim.prepareSpawn(player);
  assert.deepEqual(player.position.toArray(), PLAYER_SETTINGS.spawn);
  assert.equal(player.movementState, 'WALKING_GROUND');
  assert.equal(player.grounded, true);
});

test('a requested spawn inside a body is safely moved out before walking starts', () => {
  const body = { id: 'solid', position: new Vector3(0, 1, 0), radius: 1 };
  const player = playerAt(0, 0);
  player.position.y = 99;
  createGroundMovement(PLAYER_SETTINGS, [body]).prepareSpawn(player);
  assert.equal(player.position.y, 0);
  assert.ok(Math.hypot(player.position.x, player.position.z) > 1.3);
});

test('acceleration and deceleration integrate consistently at 30, 60, and 120 Hz', () => {
  const results = [30, 60, 120].map((fps) => {
    const player = playerAt(0, 0);
    const sim = createGroundMovement(PLAYER_SETTINGS, []);
    player.desiredVelocity.set(0, 0, -3);
    for (let i = 0; i < fps; i++) sim.step(player, 1 / fps);
    const movingPosition = player.position.z;
    assert.ok(Math.abs(player.velocity.z + 3 * (1 - Math.exp(-8))) < 0.00001);
    player.desiredVelocity.set(0, 0, 0);
    sim.step(player, 1 / fps);
    assert.ok(player.velocity.z < 0, 'release decelerates instead of snapping velocity to zero');
    for (let i = 1; i < fps; i++) sim.step(player, 1 / fps);
    return [movingPosition, player.position.z];
  });
  for (const result of results) {
    assert.ok(Math.abs(result[0] - results[0][0]) < 0.00001);
    assert.ok(Math.abs(result[1] - results[0][1]) < 0.00001);
  }
});

test('walking has stable ground height and bounded horizontal speed', () => {
  const player = playerAt();
  const sim = createGroundMovement(PLAYER_SETTINGS, []);
  player.position.y = 10;
  player.velocity.y = 20;
  player.desiredVelocity.set(3, 10, 3);
  for (let i = 0; i < 120; i++) sim.step(player, 1 / 60);
  assert.equal(player.position.y, PLAYER_SETTINGS.groundLevel);
  assert.equal(player.velocity.y, 0);
  assert.ok(player.velocity.length() <= PLAYER_SETTINGS.speed + 0.000001);
});

test('capsule blocks head-height bodies and allows walking below high bodies', () => {
  const player = playerAt(0, 3);
  const body = { id: 'head-height', position: new Vector3(0, 2, 0), radius: 0.6 };
  const sim = createGroundMovement(PLAYER_SETTINGS, [body]);
  player.desiredVelocity.set(0, 0, -3);
  for (let i = 0; i < 180; i++) sim.step(player, 1 / 60);
  const expandedSection = Math.sqrt((0.6 + 0.3 + 0.001) ** 2 - 0.5 ** 2);
  assert.ok(player.position.z >= expandedSection - 0.00001);
  body.position.y = 5;
  for (let i = 0; i < 180; i++) sim.step(player, 1 / 60);
  assert.ok(player.position.z < -3);
});

test('swept movement cannot tunnel through a small solid body at high speed', () => {
  const player = playerAt(0, 5);
  const sim = createGroundMovement({ ...PLAYER_SETTINGS, speed: 1000, acceleration: 1000 }, [
    { id: 'tiny', position: new Vector3(0, 1, 0), radius: 0.1 },
  ]);
  player.velocity.set(0, 0, -1000);
  player.desiredVelocity.set(0, 0, -1000);
  sim.step(player, 0.1);
  assert.ok(player.position.z >= 0.401);
  assert.equal(player.position.y, 0);
});

test('diagonal movement slides along a body without penetrating it', () => {
  const player = playerAt(-1.5, 2);
  const sim = createGroundMovement(PLAYER_SETTINGS, [{ id: 'solid', position: new Vector3(0, 1, 0), radius: 1 }]);
  player.desiredVelocity.set(3, 0, -3);
  for (let i = 0; i < 120; i++) {
    sim.step(player, 1 / 60);
    assert.ok(Math.hypot(player.position.x, player.position.z) >= 1.3);
  }
  assert.ok(player.position.x > -0.5);
  assert.ok(player.position.z < 2);
});

test('moving colliders push a stationary capsule clear using their current positions', () => {
  const body = { id: 'moving', position: new Vector3(0, 1, 0), radius: 0.4 };
  const player = playerAt(0.8, 0);
  const sim = createGroundMovement(PLAYER_SETTINGS, [body]);
  body.position.x = 0.5;
  sim.step(player, 1 / 60);
  assert.ok(player.position.x - body.position.x >= 0.701);
  assert.equal(player.position.y, 0);
});

test('collision bodies use opaque shells/cores and track the existing live motion model', () => {
  const model = createKinematicModel(MOTION_NODES);
  const bodies = createBodyColliders(FIELD_BODIES, model);
  assert.equal(bodies.find((body) => body.id === 'mass')?.radius, 2.4);
  assert.equal(bodies.find((body) => body.id === 'cage')?.radius, 0.05);
  assert.equal(bodies.find((body) => body.id === 'lantern')?.radius, 0.16);
  const moon = bodies.find((body) => body.id === 'mass-moon-inner')!;
  assert.equal(moon.position, model.getPosition(moon.id));
  const previous = moon.position.clone();
  model.step(20, 1 / 60);
  assert.ok(moon.position.distanceTo(previous) > 0.1);
});

test('inactive players and invalid frame deltas do not move; invalid settings are rejected', () => {
  const player = playerAt();
  const sim = createGroundMovement(PLAYER_SETTINGS, []);
  player.desiredVelocity.set(0, 0, -3);
  for (const delta of [0, -1, Infinity, NaN]) sim.step(player, delta);
  player.active = false;
  sim.step(player, 1);
  assert.deepEqual(player.position.toArray(), [0, 0, 4]);
  assert.throws(() => createGroundMovement({ ...PLAYER_SETTINGS, acceleration: 0 }, []), RangeError);
});
