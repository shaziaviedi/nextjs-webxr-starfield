import { Quaternion, Vector3 } from 'three';
import type { InteractionSource } from '../../types/interaction';

export type MovementState = 'WALKING_GROUND' | 'LAUNCHING' | 'FLOATING' | 'PLANET_CAPTURE' | 'WALKING_PLANET' | 'DETACHING';
export type PlayerOwnership = 'local' | 'remote';

export type SurfaceAnchor = {
  kind: 'body' | 'player';
  id: string;
  // radial anchor follows the centre, not decorative mesh spin
  normal: Vector3;
  radius: number;
};

export type PlayerOptions = {
  id: string;
  ownership: PlayerOwnership;
  position?: Vector3;
  velocity?: Vector3;
  orientation?: Quaternion;
  interactionRadius?: number;
  interactionStrength?: number;
  movementState?: MovementState;
  active?: boolean;
};

// world-space state, shared by desktop and future XR/network adapters
export class Player {
  readonly id: string;
  readonly ownership: PlayerOwnership;
  readonly position: Vector3;
  readonly velocity: Vector3;
  // input intent in world metres/second
  readonly desiredVelocity = new Vector3();
  readonly orientation: Quaternion;
  // local look is applied after body rotation; never stores headset tracking
  readonly lookOrientation = new Quaternion();
  readonly localUp = new Vector3(0, 1, 0);
  detachRequested = false;
  interactionRadius: number;
  interactionStrength: number;
  active: boolean;
  support: SurfaceAnchor | null = null;
  readonly debug = {
    activePlanet: null as string | null, closestPlanetDistance: Infinity,
    fieldContact: null as string | null, gravityDirection: new Vector3(),
    landingTarget: new Vector3(), cooldown: 0, fieldCooldown: 0, excludedPlanet: null as string | null,
  };
  private movement: MovementState;
  private onGround: boolean;
  private stateListeners = new Set<() => void>();

  readonly subscribeState = (listener: () => void) => {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };
  readonly getMovementSnapshot = () => this.movement;

  constructor(options: PlayerOptions) {
    if (!options.id.trim()) throw new Error('Player id cannot be empty');
    this.id = options.id;
    this.ownership = options.ownership;
    this.position = options.position?.clone() ?? new Vector3();
    this.velocity = options.velocity?.clone() ?? new Vector3();
    this.orientation = options.orientation?.clone().normalize() ?? new Quaternion();
    this.localUp.applyQuaternion(this.orientation);
    this.interactionRadius = options.interactionRadius ?? 3;
    this.interactionStrength = options.interactionStrength ?? 1.8;
    this.active = options.active ?? true;
    this.movement = options.movementState ?? 'WALKING_GROUND';
    this.onGround = this.movement === 'WALKING_GROUND' || this.movement === 'WALKING_PLANET';
  }

  get movementState() {
    return this.movement;
  }
  set movementState(value: MovementState) {
    const changed = this.movement !== value;
    this.movement = value;
    this.onGround = value === 'WALKING_GROUND' || value === 'WALKING_PLANET';
    if (value === 'WALKING_GROUND') this.velocity.y = 0;
    if (changed) this.stateListeners.forEach((listener) => listener());
  }

  get grounded() {
    return this.onGround;
  }
  set grounded(value: boolean) {
    this.onGround = value;
    if (value) {
      this.movementState = this.support ? 'WALKING_PLANET' : 'WALKING_GROUND';
    }
  }
  get airborne() {
    return !this.onGround;
  }
  get interactionSourceId() {
    return `player:${this.id}`;
  }

  setPose(position: Vector3, orientation?: Quaternion) {
    this.position.copy(position);
    if (orientation) {
      this.orientation.copy(orientation).normalize();
      this.localUp.set(0, 1, 0).applyQuaternion(this.orientation);
    }
  }

  setVelocity(velocity: Vector3) {
    this.velocity.copy(velocity);
  }

  step(delta: number) {
    if (!this.active || !Number.isFinite(delta) || delta <= 0) return;
    this.position.addScaledVector(this.velocity, delta);
  }

  toInteractionSource(): InteractionSource {
    return {
      id: this.interactionSourceId,
      position: [this.position.x, this.position.y, this.position.z],
      radius: this.interactionRadius,
      strength: this.interactionStrength,
      active: this.active,
      type: 'player',
    };
  }
}
