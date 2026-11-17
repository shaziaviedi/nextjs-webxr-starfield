import type { Vec3 } from './field';

export type InteractionSource = {
  id: string;
  // world-space metres
  position: Vec3;
  radius: number;
  // radial displacement in metres, before the shared cap
  strength: number;
  active: boolean;
  type?: 'pointer' | 'player' | 'xr' | 'test';
};

export type RepulsionSettings = {
  // response rates in inverse seconds
  activationSpeed: number;
  recoverySpeed: number;
  maxDisplacement: number;
};
