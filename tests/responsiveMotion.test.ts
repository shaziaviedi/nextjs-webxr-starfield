import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { BODY_INTERACTION } from '../app/data/bodyInteraction';
import { MOTION_NODES } from '../app/data/fieldBodies';
import { createKinematicModel } from '../app/simulation/bodies/kinematicModel';
import { createResponsiveMotionModel } from '../app/simulation/bodies/responsiveMotionModel';
import { createInteractionStore } from '../app/simulation/interactionStore';
import type { MotionNode } from '../app/types/field';

const node = (id: string, mass: number, x = 0): MotionNode => ({ id, mass, motion: { type: 'drift', home: [x, 0, 0], amplitude: [0, 0, 0] } });
const source = (id = 'player') => ({ id, position: [1, 0, 0] as [number, number, number], radius: 4, strength: 2, active: true, type: 'player' as const });

test('without sources the responsive world exactly follows all original kinematic paths', () => {
  const original = createKinematicModel(MOTION_NODES), base = createKinematicModel(MOTION_NODES);
  const model = createResponsiveMotionModel(base, MOTION_NODES, createInteractionStore(), BODY_INTERACTION);
  for (const time of [0, 1, 20, 100]) {
    original.step(time, 1 / 60); model.step(time, 1 / 60);
    MOTION_NODES.forEach((entry) => assert.ok(model.getPosition(entry.id)!.equals(original.getPosition(entry.id)!)));
  }
});

test('near bodies move outward, heavier bodies respond less, and distant bodies remain unchanged', () => {
  const nodes = [node('small', 0.05), node('large', 50), node('far', 1, 100)];
  const store = createInteractionStore(), base = createKinematicModel(nodes);
  const model = createResponsiveMotionModel(base, nodes, store, BODY_INTERACTION);
  store.upsert(source());
  for (let i = 0; i < 120; i++) model.step(i / 60, 1 / 60);
  const small = model.getInteractionOffset('small')!, large = model.getInteractionOffset('large')!;
  assert.ok(small.x < -0.1 && large.x < 0);
  assert.ok(large.length() < small.length() / 4);
  assert.ok(model.getPosition('far')!.equals(base.getPosition('far')!));
  assert.deepEqual(base.getPosition('small')!.toArray(), [0, 0, 0], 'raw model was never mutated');
});

test('multiple sources combine, remain bounded under sustained influence, and safely handle exact overlap', () => {
  const nodes = [node('body', 1)], store = createInteractionStore();
  const model = createResponsiveMotionModel(createKinematicModel(nodes), nodes, store, BODY_INTERACTION);
  store.upsert(source('x'));
  store.upsert({ ...source('y'), position: [0, 1, 0] });
  for (let i = 0; i < 300; i++) model.step(i / 60, 1 / 60);
  assert.ok(model.getInteractionOffset('body')!.x < 0 && model.getInteractionOffset('body')!.y < 0);
  for (let i = 0; i < 100; i++) store.upsert({ ...source(String(i)), strength: 1000000, radius: 100 });
  for (let i = 0; i < 1000; i++) {
    model.step(i / 60, 1 / 60);
    assert.ok(model.getInteractionOffset('body')!.length() <= BODY_INTERACTION.maxOffset + 1e-10);
    assert.ok(model.getPosition('body')!.toArray().every(Number.isFinite));
  }
  const overlapStore = createInteractionStore(); overlapStore.upsert({ ...source(), position: [0, 0, 0] });
  const overlap = createResponsiveMotionModel(createKinematicModel(nodes), nodes, overlapStore, BODY_INTERACTION);
  overlap.step(1, 1); assert.ok(overlap.getPosition('body')!.toArray().every(Number.isFinite));
});

test('large bodies respond near their visible solid boundary even when the centre is outside the source radius', () => {
  const nodes = [node('large', 50)], store = createInteractionStore();
  const model = createResponsiveMotionModel(createKinematicModel(nodes), nodes, store, BODY_INTERACTION, new Map([['large', 2.4]]));
  store.upsert({ ...source(), position: [0, 0, 4.4], radius: 3 });
  model.step(0, 1);
  assert.ok(model.getInteractionOffset('large')!.z < -0.005);
  assert.ok(model.getInteractionOffset('large')!.length() < 0.05);
});

test('recovery is frame-rate independent and returns toward the continuing animated path', () => {
  for (const fps of [30, 60, 120]) {
    const nodes = [node('body', 1)], store = createInteractionStore();
    const model = createResponsiveMotionModel(createKinematicModel(nodes), nodes, store, BODY_INTERACTION);
    store.upsert(source()); model.step(0, 1);
    const before = model.getInteractionOffset('body')!.length();
    store.remove('player');
    for (let i = 0; i < fps; i++) model.step(1 + i / fps, 1 / fps);
    assert.ok(Math.abs(model.getInteractionOffset('body')!.length() - before * Math.exp(-BODY_INTERACTION.recoverySpeed)) < 1e-10);
  }
  const store = createInteractionStore(), base = createKinematicModel(MOTION_NODES);
  const model = createResponsiveMotionModel(base, MOTION_NODES, store, BODY_INTERACTION);
  const start = base.getPosition('seed')!.clone();
  store.upsert({ ...source(), position: start.clone().add(new Vector3(0.5, 0, 0)).toArray() as [number, number, number] });
  model.step(0, 1); store.clear();
  for (let i = 0; i < 600; i++) model.step(i / 60, 1 / 60);
  assert.ok(model.getPosition('seed')!.distanceTo(base.getPosition('seed')!) < 1e-8);
  assert.ok(base.getPosition('seed')!.distanceTo(start) > 0.01, 'autonomous motion continues');
});

test('moons inherit parent displacement while their baseline relative orbit stays intact', () => {
  const nodes: MotionNode[] = [node('parent', 10), { id: 'moon', mass: 0.5, motion: { type: 'orbit', parentId: 'parent', radius: 10, period: 30 } }];
  const store = createInteractionStore(), base = createKinematicModel(nodes);
  const model = createResponsiveMotionModel(base, nodes, store, BODY_INTERACTION);
  store.upsert(source()); model.step(0, 1);
  const relative = model.getPosition('moon')!.clone().sub(model.getPosition('parent')!);
  const raw = base.getPosition('moon')!.clone().sub(base.getPosition('parent')!);
  assert.ok(relative.distanceTo(raw) < 1e-10);
});

test('shared source iteration excludes inactive and retiring sources without affecting particle recovery', () => {
  const store = createInteractionStore();
  store.upsert(source('a')); store.upsert({ ...source('b'), active: false }); store.upsert(source('c'));
  store.step(1); store.remove('c');
  const ids: string[] = []; store.forEachActiveSource((entry) => ids.push(entry.id));
  assert.deepEqual(ids, ['a']);
  const data = store.uniforms.uInteractionTexture.value.image.data as Float32Array;
  assert.ok(data[2 * 8 + 4] > 0, 'particle source retains its fade after CPU response begins recovery');
});
