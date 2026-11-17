import type { FieldQuality } from '../data/fieldQuality';

// wait for sustained slowdown, not one shader-compilation spike
export function createQualityGovernor() {
  let slow = 0;
  let fast = 0;
  let cooldown = 0;
  return {
    reset() {
      slow = fast = cooldown = 0;
    },
    sample(quality: FieldQuality, meanMs: number, p95Ms: number): FieldQuality {
      if (!Number.isFinite(meanMs) || !Number.isFinite(p95Ms)) return quality;
      cooldown = Math.max(0, cooldown - 1);
      slow = meanMs > 24 && p95Ms > 28 ? slow + 1 : 0;
      fast = meanMs < 18 && p95Ms < 21 ? fast + 1 : 0;
      if (!cooldown && quality !== 'low' && slow >= 3) {
        slow = fast = 0;
        cooldown = 5;
        return 'low';
      }
      if (!cooldown && quality === 'low' && fast >= 5) {
        slow = fast = 0;
        cooldown = 5;
        return 'balanced';
      }
      return quality;
    },
  };
}
