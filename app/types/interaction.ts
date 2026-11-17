import type { Vec3 } from './field';

// Fixed shader budget; inactive slots cost only a uniform check.
export const MAX_INTERACTION_SOURCES = 8;

export type InteractionSource = {
  id: string;
  /** World-space metres, independent of the camera and particle object transform. */
  position: Vec3;
  radius: number;
  /** Maximum radial displacement in metres before the shared safety cap. */
  strength: number;
  active: boolean;
  type?: 'pointer' | 'player' | 'xr' | 'test';
};

export type RepulsionSettings = {
  /** Exponential response rates in inverse seconds. */
  activationSpeed: number;
  recoverySpeed: number;
  maxDisplacement: number;
};
