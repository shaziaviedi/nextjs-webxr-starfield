import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { useEffect, useRef } from 'react';
import { Euler, Quaternion, Vector3 } from 'three';
import { PLAYER_SETTINGS } from '../../data/player';
import { usePlayers } from '../player/PlayerProvider';

// desktop adapter only; the player model also supports other input sources
export function DesktopPlayerControls() {
  const { localPlayer: player, mode } = usePlayers();
  const { camera, gl } = useThree();
  const session = useXR((state) => state.session);
  const updateInput = useRef<(() => void) | null>(null);
  const followPlayer = useRef<((delta: number) => void) | null>(null);

  useEffect(() => {
    if (mode !== 'firstPerson' || session) return;
    const canvas = gl.domElement;
    const keys = new Set<string>();
    const forward = new Vector3();
    const right = new Vector3();
    const movement = new Vector3();
    const cameraTarget = new Vector3();
    const look = new Euler(0, 0, 0, 'YXZ');
    const view = new Quaternion();
    const savedPosition = camera.position.clone();
    const savedOrientation = camera.quaternion.clone();
    const oldTabIndex = canvas.getAttribute('tabindex');
    canvas.tabIndex = 0;
    let fallbackActive = false;
    let disposed = false;
    let inputSession: AbortController | null = null;
    let entryTime = 0;
    let suppressAscent = false;
    const hasControl = () => inputSession !== null && !inputSession.signal.aborted
      && (document.pointerLockElement === canvas || (fallbackActive && document.activeElement === canvas));
    const clear = () => {
      keys.clear();
      player.desiredVelocity.set(0, 0, 0);
      player.detachRequested = false;
      suppressAscent = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        suspend();
        return;
      }
      if (!hasControl()) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        event.preventDefault();
        if (event.code === 'Space' && player.movementState === 'WALKING_PLANET' && !event.repeat && !keys.has('Space')) {
          player.detachRequested = true;
          suppressAscent = true;
        }
        keys.add(event.code);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
      if (event.code === 'Space') suppressAscent = false;
    };
    const onLook = (event: MouseEvent) => {
      if (!hasControl() || gl.xr.isPresenting) return;
      if (document.pointerLockElement !== canvas && (event.buttons & 1) === 0) return;
      look.setFromQuaternion(player.lookOrientation, 'YXZ');
      look.y -= event.movementX * 0.002;
      look.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, look.x - event.movementY * 0.002));
      player.lookOrientation.setFromEuler(look);
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || gl.xr.isPresenting || document.pointerLockElement === canvas) return;
      inputSession?.abort();
      const request = new AbortController();
      inputSession = request;
      canvas.focus({ preventScroll: true });
      if (!canvas.requestPointerLock) {
        fallbackActive = true;
        return;
      }
      try {
        canvas.requestPointerLock()?.then(() => {
          // ignore late grants after Escape, blur, a mode switch or XR entry
          if ((disposed || request.signal.aborted || gl.xr.isPresenting) && document.pointerLockElement === canvas) document.exitPointerLock();
        }).catch(() => { if (!disposed && !request.signal.aborted && !gl.xr.isPresenting) { fallbackActive = true; clear(); } });
      } catch {
        fallbackActive = true;
        clear();
      }
    };
    const onLockChange = () => {
      fallbackActive = false;
      if (document.pointerLockElement !== canvas) {
        inputSession?.abort();
        inputSession = null;
        clear();
      } else if (disposed || !inputSession || inputSession.signal.aborted || gl.xr.isPresenting) {
        // older browsers return no Promise from requestPointerLock
        document.exitPointerLock();
      }
    };
    const onLockError = () => {
      if (inputSession && !inputSession.signal.aborted && !disposed && !gl.xr.isPresenting) {
        fallbackActive = true;
        clear();
      }
    };
    const suspend = () => {
      inputSession?.abort();
      inputSession = null;
      fallbackActive = false;
      clear();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
    const onVisibility = () => { if (document.hidden) suspend(); };

    updateInput.current = () => {
      if (!hasControl() || gl.xr.isPresenting || !player.active) {
        clear();
        return;
      }
      view.copy(player.orientation).multiply(player.lookOrientation);
      forward.set(0, 0, -1).applyQuaternion(view);
      right.set(1, 0, 0).applyQuaternion(view);
      const grounded = player.grounded;
      if (grounded) {
        // use yaw on surfaces so looking straight up does not stall movement
        look.setFromQuaternion(player.lookOrientation, 'YXZ');
        forward.set(-Math.sin(look.y), 0, -Math.cos(look.y)).applyQuaternion(player.orientation);
        right.set(Math.cos(look.y), 0, -Math.sin(look.y)).applyQuaternion(player.orientation);
        const up = player.support?.normal ?? player.localUp;
        forward.projectOnPlane(up).normalize();
        right.projectOnPlane(up).normalize();
      }
      movement.set(0, 0, 0);
      if (keys.has('KeyW')) movement.add(forward);
      if (keys.has('KeyS')) movement.sub(forward);
      if (keys.has('KeyD')) movement.add(right);
      if (keys.has('KeyA')) movement.sub(right);
      if (!grounded) {
        if (keys.has('Space') && !suppressAscent) movement.y += 1;
        if (keys.has('ShiftLeft') || keys.has('ShiftRight')) movement.y -= 1;
      }
      const speed = player.movementState === 'WALKING_PLANET' ? PLAYER_SETTINGS.planetSpeed
        : grounded ? PLAYER_SETTINGS.speed : PLAYER_SETTINGS.floatSpeed;
      player.desiredVelocity.copy(movement.normalize().multiplyScalar(speed));
    };
    followPlayer.current = (delta) => {
      if (gl.xr.isPresenting) return;
      entryTime = Math.min(PLAYER_SETTINGS.cameraEntryDuration, entryTime + delta);
      const progress = PLAYER_SETTINGS.cameraEntryDuration > 0 ? entryTime / PLAYER_SETTINGS.cameraEntryDuration : 1;
      const blend = progress * progress * (3 - 2 * progress);
      cameraTarget.copy(player.position);
      cameraTarget.addScaledVector(player.localUp, PLAYER_SETTINGS.eyeHeight);
      camera.position.lerpVectors(savedPosition, cameraTarget, blend);
      view.copy(player.orientation).multiply(player.lookOrientation);
      camera.quaternion.slerpQuaternions(savedOrientation, view, blend);
    };
    canvas.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onLook);
    window.addEventListener('blur', suspend);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);
    document.addEventListener('visibilitychange', onVisibility);
    gl.xr.addEventListener('sessionstart', suspend);

    return () => {
      disposed = true;
      updateInput.current = null;
      followPlayer.current = null;
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onLook);
      window.removeEventListener('blur', suspend);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.xr.removeEventListener('sessionstart', suspend);
      if (oldTabIndex === null) canvas.removeAttribute('tabindex');
      else canvas.setAttribute('tabindex', oldTabIndex);
      suspend();
      // Restore the desktop pose only; never write to the headset camera.
      if (!gl.xr.isPresenting) {
        camera.position.copy(savedPosition);
        camera.quaternion.copy(savedOrientation);
      }
    };
  }, [mode, session, camera, gl, player]);

  useFrame(() => updateInput.current?.(), -0.75);
  useFrame((_, delta) => followPlayer.current?.(Math.min(delta, 0.1)), -0.375);
  return null;
}
