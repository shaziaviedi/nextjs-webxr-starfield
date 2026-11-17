export const FIELD_QUALITY = {
  low: { streams: 1, dust: 1 },
  balanced: { streams: 2, dust: 1.25 },
  high: { streams: 3, dust: 1.75 },
} as const;
export type FieldQuality = keyof typeof FIELD_QUALITY;
export type QualitySelection = FieldQuality | 'auto';

export function particleCount(config: { count: number; referenceCount?: number }, kind: 'streams' | 'dust', quality: FieldQuality) {
  return Math.min(config.count, Math.round((config.referenceCount ?? config.count) * FIELD_QUALITY[quality][kind]));
}
