'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import type { FieldQuality, QualitySelection } from '../../../data/fieldQuality';

export type FieldPerformance = {
  fps: number;
  meanMs: number;
  p95Ms: number;
  samples: number;
  quality: FieldQuality;
  particles: number;
};
type QualityContext = {
  selection: QualitySelection;
  setSelection: Dispatch<SetStateAction<QualitySelection>>;
  quality: FieldQuality;
  autoQuality: FieldQuality;
  setAutoQuality: Dispatch<SetStateAction<FieldQuality>>;
  xrActive: boolean;
  setXRActive: Dispatch<SetStateAction<boolean>>;
  performance: FieldPerformance | null;
  setPerformance: Dispatch<SetStateAction<FieldPerformance | null>>;
};
const Context = createContext<QualityContext | null>(null);

export function FieldQualityProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<QualitySelection>('auto');
  const [autoQuality, setAutoQuality] = useState<FieldQuality>('balanced');
  const [xrActive, setXRActive] = useState(false);
  const [performance, setPerformance] = useState<FieldPerformance | null>(null);
  const quality = xrActive ? 'low' : selection === 'auto' ? autoQuality : selection;
  const value = useMemo(() => ({ selection, setSelection, quality, autoQuality, setAutoQuality, xrActive, setXRActive, performance, setPerformance }), [selection, quality, autoQuality, xrActive, performance]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFieldQuality() {
  const context = useContext(Context);
  if (!context) throw new Error('useFieldQuality requires FieldQualityProvider');
  return context;
}
