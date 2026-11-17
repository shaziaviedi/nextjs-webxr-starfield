# StarField

An interactive React Three Fiber / Three.js / TypeScript artwork with desktop exploration and preserved WebXR infrastructure. The scene uses seeded particle fields, autonomous celestial motion, and reusable player state.

## Run locally

```bash
npm ci
npm run dev
```

Open the Local URL printed by Next.js (normally http://localhost:3000). Build with `npm run build`; run the production build with `npm start`. The Next.js app remains deployable on Vercel.

## Code layout

- `app/page.tsx`, `layout.tsx`: Next.js entry points and the existing XR setup.
- `app/components/`: scene bodies/particles, field quality controls, player components and desktop controls.
- `app/simulation/player/`: player state, registry, locomotion, gravity, contacts and field triggers.
- `app/simulation/bodies/`: autonomous motion, response offsets and shared collision bounds.
- `app/simulation/`: shared interaction registry and quality governor.
- `app/data/`, `app/types/`, `app/utils/`: configuration, shared types and seeded particle helpers.
- `tests/`: simulation and particle regression checks.

## StarField overview controls

- Left mouse hold/drag: repel field particles and move the influence point.
- Right drag: orbit. Mouse wheel: zoom. Middle drag or Shift + right drag: pan.
- Release the pointer to recover the normal particle flow. Blur, tab hiding, capture loss, and XR entry also release the force.

`app/components/controls/OverviewControls.tsx` places the source along the camera's world-space ray, six metres from the camera by default. This does not depend on a horizontal plane or inaccurate raycasts against shader-animated points. It affects particles near that depth, rather than every particle under the cursor at every depth.

Configure `interactionDistance`, `radius`, and `strength` on `<OverviewControls />`. Disabling it retires only the overview source. Overview and active players use the shared interaction registry. Desktop controls are disabled during XR sessions.

The optional `?repulsionTest=1` panel still provides a separate fixed test source.

## Player architecture and experience modes

Use the mode buttons outside the canvas to select Overview or First person. First person uses WASD after clicking the scene to acquire mouse-look; Escape releases the mouse. Returning to Overview restores its saved camera pose. The canvas, scene, player objects, and animation clock stay mounted across mode changes.

- `app/simulation/player/Player.ts`: camera-independent world-space position/velocity (`Vector3`), body orientation and separate local look (`Quaternion`), local UP, ownership, active state, interaction settings, and six locomotion states plus grounded/airborne state. Position is the player's feet/root; eye height belongs to the camera adapter.
- `app/simulation/player/PlayerRegistry.ts`: register/unregister unique IDs, retrieve models, and `getWorldPosition(id, target?)`. Membership subscriptions notify React only when players are added/removed.
- `app/components/player/Player.tsx`: renderless R3F bridge that steps a model and publishes its particle interaction source. `PlayerManager` connects all registered models. No avatars or network clients are created.
- `PlayerProvider` shares one registry, one local model, and `overview | firstPerson` mode between the canvas and DOM controls. `usePlayers()` exposes that API for future input adapters.
- `DesktopPlayerControls` translates desktop input into world-space `desiredVelocity` and orientation; the locomotion simulation updates actual velocity/position. The camera composes body orientation with local mouse-look and offsets eye height along local UP. A future XR adapter can drive the same model; desktop input is suspended during XR without moving `XROrigin`.

The local model is active in desktop First person and inactive in Overview. Other explicitly registered players have independent activity. Add a model with `registry.register(player)` and remove it with `registry.unregister(player.id)` or the cleanup returned by `register`. Update its pose/velocity directly or with `setPose`/`setVelocity`; high-frequency changes do not use React state. All active models publish namespaced `player:<id>` sources, separate from the temporary overview pointer source.

Particle source storage grows as a float data texture instead of imposing an eight-source uniform limit. Each field still uses its original analytic animation and one draw call. The practical source count depends on device memory and GPU time; no real networking is implemented.

First-person walking uses `app/data/player.ts` for spawn, invisible ground height, eye height, capsule dimensions, speed, acceleration/deceleration, and the brief entry-camera blend. Spawn is checked against current body positions before first-person starts. Mouse pitch does not affect WASD direction or walking height. Click to capture the mouse; Escape releases it. If pointer lock is unavailable/denied, focus the scene by clicking, use WASD, and hold left-drag to look.

`app/simulation/player/groundMovement.ts` integrates acceleration analytically, sweeps a vertical capsule against conservative body spheres, and slides along contacts. Opaque shells and cores block walking; transparent shells, halos, wireframes, and rings remain decorative. The shared `FieldMotionProvider` steps the original body model before player movement, so collisions follow current orbits without creating another simulation. Ground is logical only: no floor or avatar is rendered.

### Cohesive locomotion

`locomotion.ts` extends the existing ground movement into:
`WALKING_GROUND → LAUNCHING → FLOATING → PLANET_CAPTURE → WALKING_PLANET → DETACHING → FLOATING`.
The crossing and standing-loop tubes in `app/data/player.ts` trigger a debounced, finite strong launch once per ground entry. Dust and individual particles do not trigger it. Floating WASD follows the full view direction, Space ascends and Shift descends, with bounded damped velocity. Particle repulsion stays active in every state.

`app/data/player.ts` centralizes speeds, launch strength/duration, trigger thresholds/cooldowns, capture acceleration/range/speed, alignment, landing tolerance, surface walking and detachment. `activeFieldRegions` contains trigger selection/radii. `PLANET_GRAVITY` overrides individual bodies; `gravity.ts` builds reusable `GravitySource` objects from the existing opaque-shell/core collision bounds. Capture distances are metres beyond the solid surface, not centre distances. Decorative rings/halos remain non-solid.

Capture attracts toward each body's current animated centre. Body UP aligns with the radial normal through minimal quaternion swings; local mouse yaw/pitch remain separate. An oriented capsule sweep prevents tunnelling through translating spheres. A `SurfaceAnchor` stores the target ID, radius and radial direction. Walking integrates tangent movement along the sphere and parallel-transports orientation continuously across sides, poles and underside. Tiny bodies have an angular speed cap. Anchors follow the shared body's translation; decorative mesh spin does not drag the player.

Space on a planet applies an outward impulse while preserving tangent and planet translation velocity. That press is consumed until key-up, so it cannot also ascend. A 1.35-second cooldown excludes only the planet just left from capture, while its collision protection remains active and other planets can capture. Releasing pointer lock clears input intent while the simulation continues damping/attraction. Switching modes retains the state, anchor and timers without remounting the scene. Desktop input/camera writes are suspended during XR; headset poses are never overwritten.

`beginLanding(player, contact)` still accepts explicit `kind: 'player'` contacts via a future adapter. Automatic player collisions, networking and XR locomotion are not implemented. Spherical collision bounds approximate faceted meshes. Development builds have a collapsible locomotion readout (state, velocity, planet, surface distance, field, gravity/UP, target and recapture timer) without per-frame React updates. Production retains the compact state/controls HUD.

See [locomotion implementation and validation](docs/LOCOMOTION.md). The earlier [milestone audit](docs/FUNCTIONAL_TEST_REPORT.md) describes the previous three-state implementation.

Run the model/registry tests without adding a test dependency:

```bash
./node_modules/.bin/tsc --outDir /tmp/starfield-tests --module commonjs --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop tests/*.test.ts
NODE_PATH="$PWD/node_modules" node --test /tmp/starfield-tests/tests/*.test.js
```

## Density, performance, and body response

The Density selector provides Auto, Low (12,100 field particles, the original budget), Balanced (21,200), and High (31,300). Auto starts Balanced, downgrades after sustained slow foreground frame windows, and only restores Balanced after a sustained recovery/cooldown. XR sessions force Low and restore the selected desktop preset on exit. Presets are configured in `app/data/fieldQuality.ts`.

Streams gain more density than ambient dust, retaining intentional empty pockets. `fieldParticles.ts` holds the high-preset capacity and each original `referenceCount`. Original particles retain their exact seeded attributes; additional particles use the same stream/dust distributions with a separate extension seed. Buffers are generated once and presets only change draw ranges, preserving time, stream geometry, materials, and colour/glow settings. Field draw calls remain nine.

Append `?performance=1` for a frame-timing HUD (mean FPS and p95 frame interval), updated every two seconds after warmup. These are presentation/frame-interval diagnostics, not GPU execution timings. Actual headset performance still needs device testing; XR uses the original low particle budget.

`responsiveMotionModel.ts` overlays a bounded response on `kinematicModel.ts` without modifying the original solver, phases, or configuration. It reads active sources from the shared interaction registry, applies smooth radial falloff from the solid collision boundary, reduces response with body mass, and exponentially recovers. All simultaneous sources contribute; total displacement is capped at 0.3 m, with lower own-response caps for heavier bodies. Moons inherit parent displacement to preserve their orbital relationships. Mouse and fixed test sources can also exercise the response. Configure gain, mass scaling, cap, and recovery in `app/data/bodyInteraction.ts`.

Rendered bodies, collision queries, and landing supports all read the same final responsive world positions. No n-body physics or new renderer is introduced. The unused potted-plant model, generated component, tutorial cube, GLTF-only type, and gltfjsx dependency have been removed.

Local verification: Chrome at 1280×900, DPR 1, with 180-frame foreground samples after warmup. The original 12,100-particle build and Low/Balanced/High/Auto presets all stayed near the display's 120 FPS cap in Overview and active First-Person walking. Baseline p95 frame intervals were 9.2–9.3 ms; final Balanced/High p95 samples were 9.8–10.3 ms (about 0.5–1.1 ms higher, with mean intervals still around 8.33 ms). These short vsync-limited samples do not measure GPU headroom or guarantee headset/mobile performance. Balanced remains the conservative Auto starting point. Low/High screenshots and GPU readback checks confirmed denser existing streams, unchanged original particle paths, nine field draws, and no buffer/shader rebuild on quality changes.
