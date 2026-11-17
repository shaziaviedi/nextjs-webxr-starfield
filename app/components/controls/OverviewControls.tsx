import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { useEffect, useRef } from 'react';
import { MOUSE, Raycaster, Vector2, Vector3 } from 'three';
import { interactionStore } from '../../simulation/interactionStore';

const MOUSE_BUTTONS = { LEFT: undefined, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };

type OverviewControlsProps = {
  // disabling only retires this adapter's source
  enabled?: boolean;
  sourceId?: string;
  // metres along the camera ray, not a hit on shader-animated points
  interactionDistance?: number;
  radius?: number;
  strength?: number;
};

export function OverviewControls({
  enabled = true,
  sourceId = 'overview-pointer',
  interactionDistance = 6,
  radius = 3,
  strength = 1.8,
}: OverviewControlsProps) {
  const { camera, gl } = useThree();
  const session = useXR((state) => state.session);
  const updateSource = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || session) return;
    if (!Number.isFinite(interactionDistance) || interactionDistance <= 0) {
      throw new RangeError('Overview interaction distance must be finite and positive');
    }

    const canvas = gl.domElement;
    const pointer = new Vector2();
    const raycaster = new Raycaster();
    const position = new Vector3();
    let pointerId: number | null = null;
    let clientX = 0;
    let clientY = 0;

    const release = () => {
      const capturedId = pointerId;
      pointerId = null;
      interactionStore.remove(sourceId);
      if (capturedId !== null && canvas.hasPointerCapture(capturedId)) {
        canvas.releasePointerCapture(capturedId);
      }
    };

    const update = () => {
      if (pointerId === null) return;
      // lostpointercapture can arrive late; check stationary pointers each frame too
      if (gl.xr.isPresenting || !canvas.hasPointerCapture(pointerId)) {
        release();
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) {
        release();
        return;
      }
      pointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      camera.updateWorldMatrix(true, false);
      raycaster.setFromCamera(pointer, camera);
      raycaster.ray.at(interactionDistance, position);
      interactionStore.upsert({
        id: sourceId,
        position: [position.x, position.y, position.z],
        radius,
        strength,
        active: true,
        type: 'pointer',
      });
    };

    const onDown = (event: PointerEvent) => {
      // do not hand an active repulsion drag to the camera
      if (pointerId !== null) {
        event.stopImmediatePropagation();
        return;
      }
      if (event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0 || event.buttons !== 1 || gl.xr.isPresenting) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pointerId = event.pointerId;
      clientX = event.clientX;
      clientY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      update();
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if ((event.buttons & 1) === 0) {
        release();
        return;
      }
      clientX = event.clientX;
      clientY = event.clientY;
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId === pointerId && (event.buttons & 1) === 0) release();
    };
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId) release();
    };
    const onVisibility = () => {
      if (document.hidden) release();
    };

    updateSource.current = update;
    // take left-down before OrbitControls; leave other camera input alone
    canvas.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('lostpointercapture', onCancel);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVisibility);
    gl.xr.addEventListener('sessionstart', release);

    return () => {
      updateSource.current = null;
      canvas.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('lostpointercapture', onCancel);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.xr.removeEventListener('sessionstart', release);
      release();
    };
  }, [camera, gl, enabled, session, sourceId, interactionDistance, radius, strength]);

  // after OrbitControls, before source smoothing; follows camera damping while held
  useFrame(() => updateSource.current?.(), -0.5);

  return (
    <OrbitControls
      enabled={enabled && !session}
      target={[0, 1.6, 0]}
      enablePan
      enableZoom
      enableRotate
      mouseButtons={MOUSE_BUTTONS}
    />
  );
}
