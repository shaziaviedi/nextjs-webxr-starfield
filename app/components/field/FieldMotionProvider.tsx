// one model moves every body. bodies register their group here and
// each frame we step the model and copy positions over

import { useFrame } from '@react-three/fiber';
import type { RefObject } from 'react';
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BODY_INTERACTION } from '../../data/bodyInteraction';
import { FIELD_BODIES } from '../../data/fieldBodies';
import { createBodyColliders } from '../../simulation/bodies/bodyColliders';
import { createKinematicModel } from '../../simulation/bodies/kinematicModel';
import { createResponsiveMotionModel } from '../../simulation/bodies/responsiveMotionModel';
import { interactionStore } from '../../simulation/interactionStore';
import type { FieldMotionContextValue, FieldMotionProviderProps } from '../../types/field';

const FieldMotionContext = createContext<FieldMotionContextValue | null>(null);

export function FieldMotionProvider({ nodes, children }: FieldMotionProviderProps) {
  // rendering, collisions and surface anchors share these positions
  const model = useMemo(() => {
    const base = createKinematicModel(nodes);
    const radii = new Map(createBodyColliders(FIELD_BODIES, base).map((body) => [body.id, body.radius]));
    return createResponsiveMotionModel(base, nodes, interactionStore, BODY_INTERACTION, radii);
  }, [nodes]);
  const bodies = useRef(new Map<string, THREE.Group>());

  const registerBody = useCallback(
    (id: string, object: THREE.Group) => {
      bodies.current.set(id, object);
      const start = model.getPosition(id);
      if (start) object.position.copy(start);
      return () => {
        bodies.current.delete(id);
      };
    },
    [model],
  );

  useFrame((state, delta) => {
    model.step(state.clock.elapsedTime, delta);
    bodies.current.forEach((object, id) => {
      const position = model.getPosition(id);
      if (position) object.position.copy(position);
    });
  }, -2);

  const value = useMemo(() => ({ model, registerBody }), [model, registerBody]);

  return <FieldMotionContext.Provider value={value}>{children}</FieldMotionContext.Provider>;
}

export function useFieldBody(id: string, ref: RefObject<THREE.Group | null>) {
  const context = useContext(FieldMotionContext);

  // layout effect so it's placed before the first frame draws
  useLayoutEffect(() => {
    if (!context || !ref.current) return;
    return context.registerBody(id, ref.current);
  }, [context, id, ref]);
}

export function useFieldMotionModel() {
  const context = useContext(FieldMotionContext);
  if (!context) throw new Error('useFieldMotionModel requires FieldMotionProvider');
  return context.model;
}
