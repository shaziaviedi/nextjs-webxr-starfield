import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { DUST_VOLUMES, FIELD_STREAMS } from '../app/data/fieldParticles';
import { particleCount } from '../app/data/fieldQuality';
import { createQualityGovernor } from '../app/simulation/qualityGovernor';
import { createDustParticles, createStreamParticles } from '../app/utils/fieldParticles';

// Captured from the original committed particle generators, before density changes.
const artworkHashes: Record<string, string> = {
  'great-arc': 'a46a133a70afa0a4b433878a5ea8c5a46d831ef2bf06329360325c458723eb55',
  undercurrent: '76bdd628ccab9f85f6f7647841bbb60999e3442ad7f3ed1fb5e4eb1464e3474d',
  crossing: '23d9c42fb81036705d23ef5e1640b29717e207c5ce1876e061934e9cc653ec55',
  'mass-wake': '6a2888138f1c1e75023bd1836795a49627aab05253822a30156962bff30b65ee',
  'standing-loop': 'e1c51e8e49bd94d62bffbe6e674ebfc0320a6c7b4ab3f1f9c270ce329d258974',
  'rear-current': '30981cab96333856b9baae54da33417c8e9cae78373350794e74e1931997fb0c',
  'far-current': 'ae06fcb3d82730e488ee1ec26f3080db633d2a72facca424daa10c172cb9359a',
  'near-dust': '73b5cb9bae2a763734efd76d1baf715df5a9d2504727614b90d3105d57e88164',
  'deep-dust': '037bbbcc9a14f492f7dd1c81166403d3bbedaa9a3d72ce75275b6d1349aaaad4',
};

test('all original particle positions, colours, sizes, glow seeds, and stream progress remain byte-identical', () => {
  for (const config of FIELD_STREAMS) {
    const particles = createStreamParticles(config), hash = createHash('sha256');
    for (const array of Object.values(particles)) {
      const prefix = array.subarray(0, config.referenceCount! * (array.length / config.count));
      hash.update(Buffer.from(prefix.buffer, prefix.byteOffset, prefix.byteLength));
    }
    assert.equal(hash.digest('hex'), artworkHashes[config.id], config.id);
  }
  for (const config of DUST_VOLUMES) {
    const particles = createDustParticles(config), hash = createHash('sha256');
    for (const array of Object.values(particles)) {
      const prefix = array.subarray(0, config.referenceCount! * (array.length / config.count));
      hash.update(Buffer.from(prefix.buffer, prefix.byteOffset, prefix.byteLength));
    }
    assert.equal(hash.digest('hex'), artworkHashes[config.id], config.id);
  }
});

test('quality budgets increase streams preferentially and never exceed allocated counts', () => {
  const totals = (['low', 'balanced', 'high'] as const).map((quality) => {
    const dust = DUST_VOLUMES.reduce((sum, c) => sum + particleCount(c, 'dust', quality), 0);
    const streams = FIELD_STREAMS.reduce((sum, c) => sum + particleCount(c, 'streams', quality), 0);
    return dust + streams;
  });
  assert.deepEqual(totals, [12100, 21200, 31300]);
  FIELD_STREAMS.forEach((config) => assert.equal(particleCount(config, 'streams', 'high'), config.count));
  DUST_VOLUMES.forEach((config) => assert.equal(particleCount(config, 'dust', 'high'), config.count));
});

test('added dust respects the original hollow, flattened bounds and deterministic negative-space distribution', () => {
  for (const config of DUST_VOLUMES) {
    const first = createDustParticles(config), second = createDustParticles(config);
    assert.deepEqual(first.positions, second.positions);
    for (let i = 0; i < config.count; i++) {
      const distance = Math.hypot(first.positions[i * 3] - config.center[0], (first.positions[i * 3 + 1] - config.center[1]) / 0.6, first.positions[i * 3 + 2] - config.center[2]);
      assert.ok(distance >= config.innerRadius - 0.00001 && distance <= config.outerRadius + 0.00001);
    }
  }
});

test('auto quality requires sustained slow windows, cooldown, and sustained recovery', () => {
  const governor = createQualityGovernor();
  assert.equal(governor.sample('balanced', 30, 40), 'balanced');
  assert.equal(governor.sample('balanced', 30, 40), 'balanced');
  assert.equal(governor.sample('balanced', 30, 40), 'low');
  for (let i = 0; i < 4; i++) assert.equal(governor.sample('low', 8, 10), 'low');
  assert.equal(governor.sample('low', 8, 10), 'balanced');
  governor.reset();
  assert.equal(governor.sample('balanced', 8, 100), 'balanced', 'isolated slow frame is not sustained pressure');
  assert.equal(governor.sample('balanced', NaN, 100), 'balanced');
});
