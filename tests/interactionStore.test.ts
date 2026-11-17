import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createInteractionStore } from '../app/simulation/interactionStore';
import { InteractionSource } from '../app/types/interaction';

const source = (id = 'test'): InteractionSource => ({ id, position: [0, 2.5, -2], radius: 3, strength: 2, active: true });
const data = (store: ReturnType<typeof createInteractionStore>) => store.uniforms.uInteractionTexture.value.image.data as Float32Array;
const strength = (store: ReturnType<typeof createInteractionStore>, index = 0) => data(store)[index * 8 + 4];
const position = (store: ReturnType<typeof createInteractionStore>, index = 0) => Array.from(data(store).slice(index * 8, index * 8 + 4));

test('activation and recovery agree across 30, 60, and 120 Hz', () => {
  const results = [30, 60, 120].map((fps) => {
    const store = createInteractionStore();
    store.upsert(source());
    for (let i = 0; i < fps; i++) store.step(1 / fps);
    const active = strength(store);
    store.upsert({ ...source(), active: false });
    for (let i = 0; i < fps; i++) store.step(1 / fps);
    return [active, strength(store)];
  });
  results.forEach(([active, recovered]) => {
    assert.ok(Math.abs(active - 2 * (1 - Math.exp(-6))) < 0.00001);
    assert.ok(Math.abs(recovered - active * Math.exp(-3)) < 0.00001);
  });
});

test('removal retains the last position and decays before freeing its slot', () => {
  const store = createInteractionStore();
  store.upsert(source());
  store.step(1);
  const before = strength(store);
  store.remove('test');
  assert.equal(strength(store), before);
  store.step(1 / 60);
  assert.ok(strength(store) > 0 && strength(store) < before);
  assert.deepEqual(position(store), [0, 2.5, -2, 3]);
  store.step(10);
  assert.equal(strength(store), 0);
  assert.equal(store.uniforms.uInteractionCount.value, 0);
});

test('multiple sources remain independent and recovering slots are not overwritten', () => {
  const store = createInteractionStore();
  store.upsert(source('a'));
  store.upsert({ ...source('b'), position: [10, 0, 0], strength: 1 });
  store.step(1);
  const second = strength(store, 1);
  store.remove('a');
  store.upsert(source('c'));
  store.step(1 / 60);
  assert.equal(store.uniforms.uInteractionCount.value, 3);
  assert.ok(strength(store, 0) > 0);
  assert.ok(strength(store, 1) >= second);
  assert.ok(strength(store, 2) > 0);
  assert.equal(position(store, 1)[0], 10);
});

test('source changes ease continuously and caller-owned positions are copied', () => {
  const store = createInteractionStore();
  const input = source();
  store.upsert(input);
  input.position[0] = 999;
  store.step(1);
  assert.equal(position(store)[0], 0);
  store.upsert({ ...source(), position: [10, 2.5, -2], radius: 6 });
  assert.equal(position(store)[0], 0);
  store.step(1 / 60);
  assert.ok(position(store)[0] > 0);
  assert.ok(position(store)[0] < 10);
  assert.ok(position(store)[3] < 6);
});

test('invalid inputs and shader overflow are rejected; bad frame deltas are ignored', () => {
  const store = createInteractionStore();
  for (const radius of [0, -1, NaN, Infinity, Number.MAX_VALUE]) {
    assert.throws(() => store.upsert({ ...source(), radius }), RangeError);
  }
  assert.throws(() => store.upsert({ ...source(), position: [Infinity, 0, 0] }), RangeError);
  assert.throws(() => store.upsert({ ...source(), strength: Number.MAX_VALUE }), RangeError);
  assert.throws(() => store.configure({ recoverySpeed: 0 }), RangeError);
  store.upsert(source());
  for (const delta of [0, -1, NaN, Infinity]) store.step(delta);
  assert.equal(strength(store), 0);
  store.step(3600);
  assert.equal(strength(store), 2);
});

test('source storage grows beyond eight, preserves existing data, and reuses released slots', () => {
  const store = createInteractionStore();
  store.upsert(source('0'));
  store.step(1);
  const firstStrength = strength(store);
  for (let i = 1; i < 70; i++) store.upsert({ ...source(String(i)), position: [i, 0, 0] });
  assert.equal(strength(store), firstStrength);
  assert.equal(position(store, 69)[0], 69);
  store.step(1);
  assert.equal(store.uniforms.uInteractionCount.value, 70);
  assert.ok(strength(store, 69) > 0);
  store.clear();
  store.step(10);
  assert.equal(store.uniforms.uInteractionCount.value, 0);
  store.upsert(source('new'));
  store.step(1 / 60);
  assert.equal(store.uniforms.uInteractionCount.value, 1);
});

test('recovery speed is configurable independently of activation', () => {
  const store = createInteractionStore();
  store.configure({ recoverySpeed: 1, maxDisplacement: 0.5 });
  store.upsert(source());
  store.step(1);
  const before = strength(store);
  store.upsert({ ...source(), active: false });
  store.step(1);
  assert.ok(Math.abs(strength(store) - before * Math.exp(-1)) < 0.00001);
  assert.equal(store.uniforms.uMaxDisplacement.value, 0.5);
});
