import { Quaternion, Vector3 } from 'three';
import type { BodyCollider } from '../bodies/bodyColliders';
import type { Player } from './Player';
import type { CapsuleHit, LandingContact } from './contacts';
import { sweepCapsule } from './contacts';
import type { FieldRegion } from './fieldRegions';
import { findActiveRegion } from './fieldRegions';
import { alignPlayerUp, createGravitySources, surfaceRootDistance } from './gravity';
import type { GroundMovementSettings } from './groundMovement';
import { createGroundMovement } from './groundMovement';

export type LocomotionSettings = GroundMovementSettings & {
  triggerThreshold: number;
  triggerExitMargin: number;
  triggerDebounce: number;
  floatSpeed: number;
  floatAcceleration: number;
  floatDamping: number;
  maxFloatVelocity: number;
  launchStrength: number;
  launchDuration: number;
  launchAcceleration: number;
  fieldCooldown: number;
  captureDistance: number;
  captureAcceleration: number;
  captureMaxVelocity: number;
  captureDamping: number;
  captureEscapeMargin: number;
  alignmentSpeed: number;
  landingTolerance: number;
  landingClearance: number;
  planetSpeed: number;
  planetMaxAngularSpeed: number;
  detachmentImpulse: number;
  detachmentDuration: number;
  recaptureCooldown: number;
};

const MAX_FRAME_DELTA = 0.1;
const SUBSTEPS_PER_SECOND = 120;

type ResolveSupport = (kind: 'body' | 'player', id: string, target: Vector3) => Vector3 | undefined;
type LocomotionRuntime = {
  armed: boolean;
  entryTime: number;
  candidate?: string;
  elapsed: number;
  fieldCooldown: number;
  excludedPlanetId?: string;
  recaptureCooldown: number;
  captureId?: string;
  previousBodies: Map<string, Vector3>;
  bodyVelocities: Map<string, Vector3>;
  tangentVelocity: Vector3;
};

// one state machine per player, using the same live body positions as the scene
export function createPlayerLocomotion(
  settings: LocomotionSettings,
  bodies: readonly BodyCollider[],
  regions: readonly FieldRegion[],
  resolveExternal?: ResolveSupport,
) {
  const nonnegative = new Set(['groundLevel', 'triggerThreshold', 'triggerExitMargin', 'landingClearance']);
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || (!nonnegative.has(key) && value <= 0) || (key !== 'groundLevel' && value < 0))) throw new RangeError(`Invalid flight setting: ${key}`);
  }
  const groundMovement = createGroundMovement(settings, bodies);
  const sources = createGravitySources(bodies, settings);
  const gravityById = new Map(sources.map((source) => [source.id, source]));
  const runtimes = new WeakMap<Player, LocomotionRuntime>();
  const UP = new Vector3(0, 1, 0);
  const center = new Vector3();
  const normal = new Vector3();
  const target = new Vector3();
  const movement = new Vector3();
  const bodyStart = new Vector3();
  const bodyDelta = new Vector3();
  const bodyVelocity = new Vector3();
  const relative = new Vector3();
  const axis = new Vector3();
  const rotation = new Quaternion();
  const getRuntime = (player: Player) => {
    let state = runtimes.get(player);
    if (!state) {
      state = {
        armed: true, entryTime: 0, elapsed: 0, fieldCooldown: 0, recaptureCooldown: 0,
        previousBodies: new Map(bodies.map((body) => [body.id, body.position.clone()])),
        bodyVelocities: new Map(bodies.map((body) => [body.id, new Vector3()])), tangentVelocity: new Vector3()
      };
      runtimes.set(player, state);
    }
    return state;
  };
  const getBodyPosition = (id: string, state: LocomotionRuntime, frameProgress: number, out: Vector3) => {
    const body = gravityById.get(id);
    return body ? out.copy(state.previousBodies.get(id) ?? body.position).lerp(body.position, frameProgress) : undefined;
  };
  const releaseSupport = (player: Player, state: LocomotionRuntime) => {
    player.support = null;
    state.captureId = undefined;
    state.elapsed = 0;
    player.movementState = 'FLOATING';
  };
  const beginCapture = (player: Player, state: LocomotionRuntime, id: string) => {
    player.support = null;
    state.captureId = id;
    state.entryTime = 0;
    player.movementState = 'PLANET_CAPTURE';
  };
  const beginLanding = (player: Player, contact: LandingContact) => {
    if (player.grounded || !contact.normal.toArray().every(Number.isFinite) || contact.normal.lengthSq() < 1e-12 || !contact.point.toArray().every(Number.isFinite)) return false;
    const state = getRuntime(player);
    if (contact.kind === 'body') {
      if (!gravityById.has(contact.id) || (state.excludedPlanetId === contact.id && state.recaptureCooldown > 0)) return false;
      beginCapture(player, state, contact.id);
    } else {
      // future player collisions can submit contacts here
      if (!resolveExternal?.('player', contact.id, center)) return false;
      const radius = contact.point.distanceTo(contact.targetPosition ?? center);
      if (radius < 1e-6) return false;
      player.support = { kind: 'player', id: contact.id, radius, normal: contact.normal.clone().normalize() };
      state.captureId = undefined;
      player.movementState = 'PLANET_CAPTURE';
    }
    return true;
  };
  const selectCaptureSource = (player: Player, state: LocomotionRuntime, frameProgress: number) => {
    if (player.grounded || player.movementState === 'PLANET_CAPTURE') return;
    let nearest = Infinity;
    let selected: string | undefined;
    for (const source of sources) {
      if (state.excludedPlanetId === source.id && state.recaptureCooldown > 0) continue;
      getBodyPosition(source.id, state, frameProgress, center);
      const gap = player.position.distanceTo(center) - source.radius;
      if (gap <= source.captureDistance && gap < nearest) {
        nearest = gap;
        selected = source.id;
      }
    }
    if (selected) beginCapture(player, state, selected);
  };
  const resolveBodyContact = (
    player: Player,
    state: LocomotionRuntime,
    id: string,
    hit: CapsuleHit,
    frameProgress: number,
  ) => {
    player.position.copy(hit.point).addScaledVector(hit.normal, settings.collisionRadius + 0.002)
      .addScaledVector(player.localUp, -hit.capsuleOffset);
    getBodyPosition(id, state, frameProgress, center);
    player.position.add(center).sub(hit.targetPosition);
  };

  // cooldown skips capture, never collision
  const moveThroughBodies = (player: Player, state: LocomotionRuntime, stepDelta: number, frameProgress: number, substepFraction: number) => {
    movement.copy(player.velocity).multiplyScalar(stepDelta);
    let closest: {
      id: string;
      hit: CapsuleHit;
    } | undefined;
    for (const source of sources) {
      const previous = state.previousBodies.get(source.id) ?? source.position;
      bodyStart.copy(previous).lerp(source.position, frameProgress);
      bodyDelta.copy(source.position).sub(previous).multiplyScalar(substepFraction);
      const hit = sweepCapsule(player.position, movement, settings.collisionRadius, settings.height, source, bodyStart, bodyDelta, player.localUp);
      if (hit && (!closest || hit.time < closest.hit.time)) closest = { id: source.id, hit };
    }
    if (!closest) {
      player.position.add(movement);
      return;
    }
    const { id, hit } = closest;
    resolveBodyContact(player, state, id, hit, frameProgress + substepFraction);
    bodyVelocity.copy(state.bodyVelocities.get(id)!);
    relative.copy(player.velocity).sub(bodyVelocity);
    player.velocity.addScaledVector(hit.normal, -Math.min(0, relative.dot(hit.normal)));
    if (state.excludedPlanetId !== id || state.recaptureCooldown <= 0) {
      if (player.movementState !== 'PLANET_CAPTURE' || state.captureId !== id) beginCapture(player, state, id);
    }
  };
  const updateVelocity = (player: Player, stepDelta: number, rate: number, maxSpeed: number) => {
    player.velocity.lerp(target, -Math.expm1(-rate * stepDelta)).clampLength(0, maxSpeed);
  };
  const stepFreeFlight = (player: Player, state: LocomotionRuntime, stepDelta: number, frameProgress: number, substepFraction: number) => {
    alignPlayerUp(player, UP, settings.alignmentSpeed, stepDelta);
    target.copy(player.desiredVelocity).clampLength(0, settings.floatSpeed);
    if (player.movementState === 'LAUNCHING') {
      // movement input should not cancel the launch
      target.y = settings.launchStrength;
      updateVelocity(player, stepDelta, settings.launchAcceleration, Math.max(settings.maxFloatVelocity, settings.launchStrength));
    } else updateVelocity(player, stepDelta, target.lengthSq() > 1e-6 ? settings.floatAcceleration : settings.floatDamping, settings.maxFloatVelocity);
    moveThroughBodies(player, state, stepDelta, frameProgress, substepFraction);
    state.elapsed += stepDelta;
    if ((player.movementState === 'LAUNCHING' && state.elapsed >= settings.launchDuration)
      || (player.movementState === 'DETACHING' && state.elapsed >= settings.detachmentDuration)) {
      state.elapsed = 0;
      player.movementState = 'FLOATING';
    }
  };
  const stepCapture = (player: Player, state: LocomotionRuntime, stepDelta: number, frameProgress: number, substepFraction: number) => {
    const source = state.captureId ? gravityById.get(state.captureId) : undefined;
    const external = player.support?.kind === 'player' ? player.support : null;
    if (source) getBodyPosition(source.id, state, frameProgress + substepFraction, center);
    else if (!external || !resolveExternal?.('player', external.id, center)) {
      releaseSupport(player, state);
      return;
    }
    const radius = source?.radius ?? external!.radius;
    normal.copy(player.position).sub(center);
    const distance = normal.length();
    if (distance < 1e-8) normal.copy(player.localUp); else normal.divideScalar(distance);
    if (source && distance > radius + source.captureDistance + settings.captureEscapeMargin) {
      releaseSupport(player, state);
      return;
    }
    alignPlayerUp(player, normal, settings.alignmentSpeed, stepDelta);
    const clearance = surfaceRootDistance(radius, settings.height, settings.landingClearance, player.localUp.dot(normal));
    player.debug.gravityDirection.copy(normal).negate();
    player.debug.landingTarget.copy(center).addScaledVector(normal, radius + settings.landingClearance);
    if (distance <= clearance + (source?.landingTolerance ?? settings.landingTolerance)) {
      player.position.copy(center).addScaledVector(normal, clearance);
      if (player.localUp.dot(normal) > 0.9995) {
        player.support = { kind: source ? 'body' : 'player', id: source?.id ?? external!.id, radius, normal: normal.clone() };
        bodyVelocity.copy(source ? state.bodyVelocities.get(source.id)! : new Vector3());
        state.tangentVelocity.copy(player.velocity).sub(bodyVelocity).projectOnPlane(normal).clampLength(0, settings.planetSpeed);
        player.movementState = 'WALKING_PLANET';
        state.captureId = undefined;
        state.fieldCooldown = settings.fieldCooldown;
        state.armed = false;
      } else player.velocity.multiplyScalar(Math.exp(-settings.captureDamping * stepDelta));
      return;
    }
    bodyVelocity.copy(source ? state.bodyVelocities.get(source.id)! : new Vector3());
    relative.copy(player.velocity).sub(bodyVelocity);
    target.copy(player.desiredVelocity).projectOnPlane(normal).clampLength(0, settings.floatSpeed);
    // ease off steering near contact so small planets can finish capturing
    target.multiplyScalar(Math.min(1, Math.max(0, (distance - clearance) / (source?.captureDistance ?? settings.captureDistance))));
    target.addScaledVector(normal, -(source?.attractionStrength ?? settings.captureAcceleration) / settings.captureDamping);
    relative.lerp(target, -Math.expm1(-settings.captureDamping * stepDelta)).clampLength(0, source?.maxCaptureVelocity ?? settings.captureMaxVelocity);
    player.velocity.copy(relative).add(bodyVelocity);
    moveThroughBodies(player, state, stepDelta, frameProgress, substepFraction);
  };
  const detachFromSurface = (player: Player, state: LocomotionRuntime, anchor: NonNullable<Player['support']>) => {
    player.detachRequested = false;
    player.position.copy(center).addScaledVector(normal, anchor.radius + settings.landingClearance + 0.002);
    player.velocity.copy(state.tangentVelocity).add(bodyVelocity).addScaledVector(normal, settings.detachmentImpulse);
    state.excludedPlanetId = anchor.kind === 'body' ? anchor.id : undefined;
    state.recaptureCooldown = settings.recaptureCooldown;
    state.fieldCooldown = settings.fieldCooldown;
    state.armed = false;
    state.elapsed = 0;
    player.support = null;
    player.movementState = 'DETACHING';
  };

  const stepPlanetWalk = (player: Player, state: LocomotionRuntime, stepDelta: number, frameProgress: number, substepFraction: number) => {
    const anchor = player.support;
    if (!anchor) {
      releaseSupport(player, state);
      return;
    }
    if (anchor.kind === 'body') {
      if (!getBodyPosition(anchor.id, state, frameProgress, center)) {
        releaseSupport(player, state);
        return;
      }
      bodyVelocity.copy(state.bodyVelocities.get(anchor.id)!);
    } else {
      if (!resolveExternal?.('player', anchor.id, center)) {
        releaseSupport(player, state);
        return;
      }
      bodyVelocity.set(0, 0, 0);
    }
    normal.copy(anchor.normal);
    if (player.detachRequested) {
      detachFromSurface(player, state, anchor);
      return;
    }
    const distance = anchor.radius + settings.landingClearance;
    const speed = Math.min(settings.planetSpeed, distance * settings.planetMaxAngularSpeed);
    target.copy(player.desiredVelocity).projectOnPlane(normal).clampLength(0, speed);
    state.tangentVelocity.projectOnPlane(normal).lerp(target, -Math.expm1(-(target.lengthSq() > 0 ? settings.acceleration : settings.deceleration) * stepDelta));
    movement.copy(state.tangentVelocity).multiplyScalar(stepDelta);
    if (movement.lengthSq() > 1e-14) {
      axis.crossVectors(normal, movement).normalize();
      rotation.setFromAxisAngle(axis, movement.length() / distance);
      normal.applyQuaternion(rotation).normalize();
      state.tangentVelocity.applyQuaternion(rotation).projectOnPlane(normal);
      // carry orientation around the sphere, including poles and underside
      player.orientation.premultiply(rotation).normalize();
      player.localUp.copy(UP).applyQuaternion(player.orientation);
      anchor.normal.copy(normal);
    }
    alignPlayerUp(player, normal, settings.alignmentSpeed, stepDelta);
    target.copy(center).addScaledVector(normal, distance);
    movement.copy(target).sub(player.position);
    // still collide with other bodies while attached
    for (const source of sources) {
      if (anchor.kind === 'body' && source.id === anchor.id) continue;
      const previous = state.previousBodies.get(source.id)!;
      bodyStart.copy(previous).lerp(source.position, frameProgress - substepFraction);
      bodyDelta.copy(source.position).sub(previous).multiplyScalar(substepFraction);
      const hit = sweepCapsule(player.position, movement, settings.collisionRadius, settings.height, source, bodyStart, bodyDelta, player.localUp);
      if (!hit) continue;
      resolveBodyContact(player, state, source.id, hit, frameProgress);
      beginCapture(player, state, source.id);
      return;
    }
    player.position.copy(target);
    player.velocity.copy(state.tangentVelocity).add(bodyVelocity);
    player.debug.landingTarget.copy(player.position);
  };
  const stepGroundWalk = (player: Player, state: LocomotionRuntime, stepDelta: number) => {
    alignPlayerUp(player, UP, settings.alignmentSpeed, stepDelta);
    groundMovement.step(player, stepDelta);
    const inside = findActiveRegion(player.position, settings.collisionRadius, settings.height, regions, settings.triggerThreshold);
    const retained = inside ?? findActiveRegion(player.position, settings.collisionRadius, settings.height, regions, settings.triggerThreshold + settings.triggerExitMargin);
    if (!retained) state.armed = true;
    if (!inside || !state.armed || state.fieldCooldown > 0) {
      state.entryTime = 0;
      state.candidate = undefined;
      return;
    }
    if (state.candidate !== inside) {
      state.candidate = inside;
      state.entryTime = 0;
    }
    state.entryTime += stepDelta;
    if (state.entryTime + 1e-9 >= settings.triggerDebounce) {
      state.armed = false;
      state.entryTime = 0;
      state.elapsed = 0;
      state.fieldCooldown = settings.fieldCooldown;
      player.movementState = 'LAUNCHING';
    }
  };
  const updateDebug = (player: Player, state: LocomotionRuntime) => {
    const debug = player.debug;
    debug.activePlanet = state.captureId ?? player.support?.id ?? null;
    debug.closestPlanetDistance = Infinity;
    sources.forEach((body) => {
      debug.closestPlanetDistance = Math.min(debug.closestPlanetDistance, player.position.distanceTo(body.position) - body.radius);
    });
    debug.fieldContact = findActiveRegion(player.position, settings.collisionRadius, settings.height, regions, settings.triggerThreshold) ?? null;
    debug.cooldown = state.recaptureCooldown;
    debug.fieldCooldown = state.fieldCooldown;
    debug.excludedPlanet = state.recaptureCooldown > 0 ? state.excludedPlanetId ?? null : null;
    if (player.support) debug.gravityDirection.copy(player.support.normal).negate();
    else if (!state.captureId) {
      debug.gravityDirection.set(0, 0, 0);
      debug.landingTarget.set(0, 0, 0);
    }
  };

  return {
    prepareSpawn(player: Player) {
      player.support = null;
      player.detachRequested = false;
      player.orientation.identity();
      player.localUp.copy(UP);
      runtimes.delete(player);
      groundMovement.prepareSpawn(player);
      getRuntime(player);
    },
    resume(player: Player) {
      const state = getRuntime(player);
      sources.forEach((body) => {
        state.previousBodies.get(body.id)!.copy(body.position);
        state.bodyVelocities.get(body.id)!.set(0, 0, 0);
      });
      state.tangentVelocity.set(0, 0, 0);
      player.detachRequested = false;
    },
    beginLanding,
    step(player: Player, delta: number) {
      if (!player.active || !Number.isFinite(delta) || delta <= 0) return;
      const state = getRuntime(player);
      const frameDelta = Math.min(delta, MAX_FRAME_DELTA);
      sources.forEach((body) => state.bodyVelocities.get(body.id)!.copy(body.position).sub(state.previousBodies.get(body.id)!).divideScalar(frameDelta));
      const substeps = Math.ceil(frameDelta * SUBSTEPS_PER_SECOND);
      const stepDelta = frameDelta / substeps;
      for (let i = 0; i < substeps; i++) {
        state.fieldCooldown = Math.max(0, state.fieldCooldown - stepDelta);
        state.recaptureCooldown = Math.max(0, state.recaptureCooldown - stepDelta);
        if (!player.grounded) selectCaptureSource(player, state, i / substeps);
        switch (player.movementState) {
          case 'WALKING_GROUND': stepGroundWalk(player, state, stepDelta); break;
          case 'WALKING_PLANET': stepPlanetWalk(player, state, stepDelta, (i + 1) / substeps, 1 / substeps); break;
          case 'PLANET_CAPTURE': stepCapture(player, state, stepDelta, i / substeps, 1 / substeps); break;
          default: stepFreeFlight(player, state, stepDelta, i / substeps, 1 / substeps);
        }
        if (player.movementState !== 'WALKING_PLANET') player.detachRequested = false;
      }
      sources.forEach((body) => state.previousBodies.get(body.id)!.copy(body.position));
      updateDebug(player, state);
    },
  };
}
