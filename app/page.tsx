"use client";

import { Canvas } from "@react-three/fiber";
import { createXRStore, XR, XROrigin } from "@react-three/xr";
import { FieldMotionProvider } from "./components/field/FieldMotionProvider";
import { FieldSystem } from "./components/field/FieldSystem";
import { GravitationalField } from "./components/field/GravitationalField";
import { FieldQualityProvider } from "./components/field/quality/FieldQualityProvider";
import { RepulsionTestControls } from "./components/field/RepulsionTestControls";
import { ModeSwitcher } from "./components/player/ModeSwitcher";
import { PlayerExperience } from "./components/player/PlayerExperience";
import { PlayerProvider } from "./components/player/PlayerProvider";
import { MOTION_NODES } from "./data/fieldBodies";

const store = createXRStore();

// bg + fog same colour so far stuff fades out instead of cutting off
const VOID_COLOR = "#030308";

export default function Home() {
  return (
    <FieldQualityProvider>
      <PlayerProvider>
        <div style={{ width: "100vw", height: "100vh" }}>
          <Canvas camera={{ position: [0, 1.6, 4] }}>
            <XR store={store}>
              {/* y is 0 bc the headset already adds real eye height */}
              <XROrigin position={[0, 0, 0]} />

              <color attach="background" args={[VOID_COLOR]} />
              <fog attach="fog" args={[VOID_COLOR, 12, 45]} />

              {/* dim on purpose, the bodies do most of the glowing. no shadows (too heavy for xr) */}
              <hemisphereLight args={["#5a6a9a", "#000000", 0.25]} />
              <directionalLight position={[-6, 10, 4]} intensity={0.35} color="#c8d4ff" />

              <FieldMotionProvider nodes={MOTION_NODES}>
                <GravitationalField />
                <FieldSystem />
                <PlayerExperience />
              </FieldMotionProvider>
            </XR>
          </Canvas>
          <RepulsionTestControls />
          <ModeSwitcher />
        </div>
      </PlayerProvider>
    </FieldQualityProvider>
  );
}
