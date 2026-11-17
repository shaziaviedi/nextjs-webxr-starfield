import type { Vec3 } from '../types/field';

// metres and seconds; ground and player remain invisible
export const PLAYER_SETTINGS = {
  spawn: [0, 0, 4] as Vec3,
  groundLevel: 0,
  eyeHeight: 1.6,
  height: 1.8,
  collisionRadius: 0.3,
  speed: 3,
  acceleration: 8,
  deceleration: 10,
  cameraEntryDuration: 0.2,
  activeFieldRegions: [
    { streamId: 'crossing', radius: 0.7 },
    { streamId: 'standing-loop', radius: 0.8 },
  ],
  triggerThreshold: 0.12,
  triggerExitMargin: 0.25,
  triggerDebounce: 0.18,
  floatSpeed: 3,
  floatAcceleration: 3.8,
  floatDamping: 1.8,
  maxFloatVelocity: 8,
  launchStrength: 6.5,
  launchDuration: 0.85,
  launchAcceleration: 14,
  fieldCooldown: 1.5,
  captureDistance: 2.2, // metres beyond the solid surface (not from its centre)
  captureAcceleration: 8,
  captureMaxVelocity: 4,
  captureDamping: 2.5,
  captureEscapeMargin: 1,
  alignmentSpeed: 5,
  landingTolerance: 0.025,
  planetSpeed: 2.4,
  planetMaxAngularSpeed: 1.5,
  detachmentImpulse: 5.5,
  detachmentDuration: 0.18,
  recaptureCooldown: 1.35,
  landingClearance: 0.08,
};

// override gravity tuning, not the decorative rings or halos
export const PLANET_GRAVITY = {
  mass: { captureDistance: 3, attractionStrength: 9 },
  'low-body': { captureDistance: 1.8, attractionStrength: 7 },
  'mass-moon-inner': { captureDistance: 1.1, attractionStrength: 5 },
  seed: { captureDistance: 0.45, attractionStrength: 3 },
} satisfies Record<string, { captureDistance?: number; attractionStrength?: number; radius?: number }>;
