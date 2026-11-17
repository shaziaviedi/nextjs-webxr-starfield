# StarField locomotion consolidation

Implemented and tested 2026-11-17. Extends the existing Player, R3F bridge, field triggers,
collision queries and live body-motion model. No particle/artwork, orbit, renderer, dependency
or WebXR infrastructure changes.

## What caused the previous behavior

The previous launch was a 1.4 m/s sine-shaped target lasting 0.9 seconds, further smoothed by
velocity response, sharing a 3 m/s cap with horizontal movement. Vertical input cancelled it.
There was no planetary attraction: a world-up capsule had to physically hit a body before
landing could start. Landing then used an unbounded horizontal plane, not the body's sphere.
The desktop adapter also reset actual velocity every frame without pointer lock, repeatedly
interrupting simulation-driven movement. It now clears input intent while physics continues.

## Implemented behavior and configuration

`WALKING_GROUND → LAUNCHING → FLOATING → PLANET_CAPTURE → WALKING_PLANET → DETACHING → FLOATING`.

- Ground: existing invisible surface, capsule sliding and stable eye height; WASD and mouse-look.
- Launch: designated stream tubes, debounce/entry latch/cooldown; 6.5 m/s upward target reached
  quickly over a finite 0.85-second launch, without cancelling it through other movement input.
- Float: full view-relative WASD, world-up Space/world-down Shift, bounded inertia and damping.
- Capture: nearest eligible solid body's live animated centre; configurable attraction and
  terminal speed, sticky target with escape hysteresis, tangent steering reduced near contact.
  Capture supersedes launching. Oriented capsule sweeps include relative body translation.
- Surface: radial `SurfaceAnchor`, exact spherical tangent stepping, continuous parallel
  transport across poles/underside, stable radius, moving-body attachment and other-body contact.
- Detach: one Space press produces an outward impulse plus tangent/body translation velocity;
  held Space cannot also ascend. The departed body is excluded from capture for 1.35 seconds,
  while collision remains enabled and other bodies remain eligible.
- Orientation: body quaternion and local mouse-look are separate; minimal interpolated UP
  alignment preserves forward where possible. Eye height follows body UP. Free flight smoothly
  recovers world UP. Desktop code never writes headset poses during an XR session.
- Debug: development-only collapsible readout for state, velocity, planet, nearest surface,
  field contact, gravity/UP, landing target and both cooldowns; updates at 5 Hz outside React state.

Tune `PLAYER_SETTINGS` and per-body `PLANET_GRAVITY` in `app/data/player.ts`. Capture distance
means metres beyond the solid surface. Collision radius can be overridden per source.
Tube radii/selection are `PLAYER_SETTINGS.activeFieldRegions`. Tiny bodies have
an angular walking-speed limit. `GravitySource` and `SurfaceAnchor` support reusable inputs;
explicit future `kind: 'player'` contacts remain supported without automatic player collisions.

## Validation

- **PASS:** TypeScript, ESLint, production build (static route, 408 kB first load), and 51 tests.
  Tests cover designated triggers/debounce, strong finite lift, bounded flight, capture priority,
  small-body capture under held input, moving bodies, underside/pole traversal, detach momentum,
  cooldown collision protection, capture by another body, repeated cycles, pause/resume,
  30/60/120 Hz agreement, registries, original particle attributes and autonomous body motion.
- **PASS, Chrome production browser:** keyboard/mouse cycle from ground through the crossing
  stream, approximately 5.2 m rise during launch, capture/landing on `mass`, walking around its
  side and underside, detachment, onward flight, capture/landing underneath `low-body`.
  No player-position/state teleport was used; local mouse aim was reset once for deterministic
  keyboard navigation. Holding detach Space did not ascend. Moving support stayed stable.
- **PASS:** ten repeated mode-switch cycles preserved canvas, player anchor and listener counts;
  no browser console errors during the full cycle. The original Overview orbit/zoom/hold/drag/
  release and cancellation paths passed. GPU captures showed 733 nearby displaced particles,
  all 20,445 distant particles unchanged, and zero residual offset after recovery.
- **PASS:** automatic player GPU repulsion without clicking displaced 154 nearby particles;
  all 21,040 distant particles stayed unchanged and recovery restored exact baseline positions.
- **PASS:** production builds keep the detailed developer readout out of the rendered HUD.
- **PASS:** development browser readout contained every requested field plus field/recapture
  cooldowns. Final Balanced production samples (180 frames each, Chrome 157, 1280×900 DPR 1)
  averaged 120 FPS in Overview and moving First person, with p95 intervals 10.2 / 9.8 ms.
  These short display-paced samples do not establish mobile/XR performance or GPU headroom.
- **UNVERIFIED:** physical headset tracking/controllers/comfort, other browsers, mobile input
  and long-duration soak. Existing XR entry/store/XROrigin remain available; XR player input
  and locomotion still require a future adapter.

Run checks without installing test packages:

```sh
./node_modules/.bin/tsc --noEmit --incremental false
npm run lint
./node_modules/.bin/tsc --outDir /private/tmp/starfield-locomotion-tests --module commonjs --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop tests/*.test.ts
NODE_PATH="$PWD/node_modules" node --test /private/tmp/starfield-locomotion-tests/tests/*.test.js
npm run build
npm run start -- --port 3047
```

Manual cycle: enter First person and click; W toward the crossing stream; after launch steer
toward `mass`, release steering when captured, walk around its sphere, press Space to detach,
move away during cooldown, then approach another body. Escape releases mouse; Overview restores
orbit controls. Repeat. Use `npm run dev` for the detailed debug readout. Browser experiments
used temporary CDP harnesses, not additional production code or installed dependencies.

## Files and remaining limits

New: `app/simulation/player/gravity.ts`, this document.
Updated: `Player.ts`, `locomotion.ts`, `contacts.ts`, `groundMovement.ts`,
`app/data/player.ts`, `PlayerManager.tsx`,
`DesktopPlayerControls.tsx`, `ModeSwitcher.tsx`,
the three player/locomotion test files, and README.

Collision/walking use conservative spheres rather than faceted mesh triangles. Anchors follow
translation/orbit, not decorative body spin. Overlap resolution can push a player outward if
a solid body moves into it; this is a bounded kinematic prototype, not a rigid-body physics engine.
Networking, automatic player-to-player collision and headset locomotion are not implemented.
The prior functional audit report documents the previous three-state implementation.

No commit, push or deployment was made. Standard Next/Vercel build remains applicable;
hosted HTTPS and physical-XR verification remain release steps.
