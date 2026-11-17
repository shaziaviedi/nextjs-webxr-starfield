import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Quaternion, Vector3 } from 'three';
import { createInteractionStore } from '../app/simulation/interactionStore';
import { Player } from '../app/simulation/player/Player';
import { PlayerRegistry } from '../app/simulation/player/PlayerRegistry';

test('register, retrieve, unregister, and protect a newer player from stale cleanup', () => {
  const registry = new PlayerRegistry();
  const first = new Player({ id: 'a', ownership: 'local' });
  const cleanup = registry.register(first);
  assert.equal(registry.get('a'), first);
  assert.throws(() => registry.register(new Player({ id: 'a', ownership: 'remote' })), /already registered/);
  assert.equal(registry.unregister('missing'), false);
  assert.equal(registry.unregister('a'), true);
  const replacement = new Player({ id: 'a', ownership: 'remote' });
  registry.register(replacement);
  cleanup();
  assert.equal(registry.get('a'), replacement);
});

test('model owns its world pose and integrates movement independently of any camera', () => {
  const position = new Vector3(1, 2, 3);
  const player = new Player({ id: 'a', ownership: 'local', position, velocity: new Vector3(2, 0, -1) });
  position.set(100, 100, 100);
  player.step(0.5);
  assert.deepEqual(player.position.toArray(), [2, 2, 2.5]);
  const pose = new Vector3(5, 6, 7);
  const orientation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  player.setPose(pose, orientation);
  player.setVelocity(new Vector3(0, 0, 2));
  player.step(0.25);
  assert.deepEqual(player.position.toArray(), [5, 6, 7.5]);
  assert.ok(player.orientation.equals(orientation));
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  player.setPose(player.position, tilt);
  assert.ok(player.localUp.distanceTo(new Vector3(0, 0, 1)) < 1e-10);
  assert.ok(player.lookOrientation.equals(new Quaternion()), 'pose does not overwrite local input look');
  player.active = false;
  player.step(1);
  assert.deepEqual(player.position.toArray(), [5, 6, 7.5]);
});

test('world position retrieval copies into an optional reusable target', () => {
  const registry = new PlayerRegistry();
  const player = new Player({ id: 'a', ownership: 'remote', position: new Vector3(1, 2, 3) });
  registry.register(player);
  const target = new Vector3();
  assert.equal(registry.getWorldPosition('a', target), target);
  target.set(0, 0, 0);
  assert.deepEqual(player.position.toArray(), [1, 2, 3]);
  player.position.x = 9;
  assert.equal(registry.getWorldPosition('a', target)?.x, 9);
  assert.equal(registry.getWorldPosition('missing'), undefined);
});

test('walking, floating, and ground contact transitions stay consistent', () => {
  const player = new Player({ id: 'a', ownership: 'local' });
  assert.equal(player.movementState, 'WALKING_GROUND');
  assert.equal(player.grounded, true);
  player.movementState = 'FLOATING';
  player.velocity.y = 2;
  assert.equal(player.airborne, true);
  player.grounded = true;
  assert.equal(player.movementState, 'WALKING_GROUND');
  assert.equal(player.velocity.y, 0);
  player.grounded = false;
  assert.equal(player.airborne, true);
  player.movementState = 'WALKING_GROUND';
  assert.equal(player.airborne, false);
});

test('membership subscriptions ignore high-frequency movement and unsubscribe cleanly', () => {
  const registry = new PlayerRegistry();
  let notifications = 0;
  const unsubscribe = registry.subscribe(() => notifications++);
  const player = new Player({ id: 'a', ownership: 'local', velocity: new Vector3(1, 0, 0) });
  registry.register(player);
  const revision = registry.getSnapshot();
  for (let i = 0; i < 60; i++) player.step(1 / 60);
  assert.equal(registry.getSnapshot(), revision);
  assert.equal(notifications, 1);
  registry.unregister('a');
  assert.equal(notifications, 2);
  unsubscribe();
  registry.register(player);
  assert.equal(notifications, 2);
});

test('many player models become independent simultaneous particle sources without an eight-player cap', () => {
  const registry = new PlayerRegistry();
  const interactions = createInteractionStore();
  for (let i = 0; i < 100; i++) {
    const player = new Player({ id: `test-${i}`, ownership: i === 0 ? 'local' : 'remote', position: new Vector3(i, 0, 0) });
    registry.register(player);
    interactions.upsert(player.toInteractionSource());
  }
  interactions.step(1);
  assert.equal(registry.size, 100);
  assert.equal(interactions.uniforms.uInteractionCount.value, 100);
  const player = registry.get('test-50')!;
  assert.equal(player.toInteractionSource().id, 'player:test-50');
  assert.equal(player.toInteractionSource().type, 'player');
  player.active = false;
  interactions.upsert(player.toInteractionSource());
  registry.unregister(player.id);
  interactions.remove(player.interactionSourceId);
  interactions.step(10);
  const data = interactions.uniforms.uInteractionTexture.value.image.data as Float32Array;
  assert.equal(data[50 * 8 + 4], 0);
  assert.ok(data[51 * 8 + 4] > 0);
});
