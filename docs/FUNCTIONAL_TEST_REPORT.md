# StarField functional prototype audit

Tested 2026-11-17 against the local production build at `http://localhost:3037`.
Environment: Node 24.21.0, Chrome 157.0.8103.79, 1280 × 900, DPR 1.
Next 15.5.27 / React 19.1 / Three 0.180 / R3F 9.3 / XR 6.6.26; existing WebGL renderer retained.
Browser checks used an isolated Chrome profile, CDP keyboard/mouse input, runtime inspection,
GPU position captures, and screenshots. Controlled cancellation tests deliberately delayed the pointer-lock API.

## Functional results

- **PASS — Overview camera.** Expected: orbit and zoom while left drag controls repulsion.
  Actual: right drag orbited, wheel zoomed, and left hold/drag left the camera unchanged.
  Remaining: other browsers and touch input unverified.
- **PASS — Overview repulsion.** Expected: nearby particles repel, dragging moves the source,
  release restores the moving pattern. Actual: GPU capture found 733 visibly displaced particles
  among 755 nearby particles; all 20,445 distant particles were unchanged. Drag moved the world
  source; after recovery, displacement was zero at the same analytic animation time.
  Remaining: interaction uses the existing configurable camera-ray depth, not surface picking.
- **PASS — Overview cancellation.** Expected: no stuck forces after interrupted input.
  Actual: release outside canvas, blur, pointer cancellation, lost capture, missing button-up,
  and hidden-tab signals retired the source without reactivating it on later movement.
  Remaining: hidden-tab behavior was exercised through its visibility handler, not OS minimization.
- **PASS — First-person controls and modes.** Expected: click locks mouse, mouse looks,
  WASD follows horizontal facing, Escape releases, Overview restores its camera.
  Actual: native pointer lock, relative mouse input, and all four movement directions worked;
  walking height stayed stable. Thirty mode-switch cycles preserved the player and canvas.
  Remaining: unsupported-pointer-lock fallback was not retested in this audit.
- **PASS — Player particle influence.** Expected: continuous local repulsion without holding click.
  Actual: first-person GPU capture found 523 displaced particles; all 20,657 distant particles
  stayed unchanged. Animation continued and particles recovered after Overview was restored.
  Remaining: real headset-driven player influence unverified.
- **PASS — Floating and landing.** Expected: designated volumes trigger floating, Space/Shift
  provide vertical movement, body contact transitions through LANDING back to WALKING.
  Actual: two complete cycles using keyboard navigation produced exactly
  `walking → floating → landing → walking → floating → landing → walking`.
  Lift, horizontal/vertical control, HUD states, cooldown, moving-body support, and resumed
  walking passed. Landing height remained above 5 m rather than resetting to world Y=0.
  Remaining: prototype uses a horizontal, unbounded support plane following body translation;
  this is not curved-surface walking and does not follow body rotation.
- **PASS — Registries and multiple sources.** Expected: independent registration/removal and
  simultaneous influence without per-frame React state updates.
  Actual: unit tests include 100 sources; browser registration/removal batches of 20 returned
  to one local player and zero remaining sources after decay. No fake players were left running.
  Remaining: networking and automatic player-to-player collisions are not implemented.
- **PASS — Artwork and autonomous motion.** Expected: retain original streams, materials,
  colors, particles, bodies, and kinematic motion. Actual: original particle attribute golden
  checks remained byte-identical; orbit/parent-motion tests passed; inspected browser screenshots
  retained the existing composition. This audit changed no artwork or simulation parameters.
  Remaining: exhaustive image comparison across every camera angle was not performed.
- **PASS, bounded check — Lifecycle and errors.** Expected: stable subscriptions/resources and
  no persistent errors. Actual: across 30 mode cycles, listeners stayed at 692, DOM nodes at 610,
  frame subscribers at 42, geometries at 37, textures at 2, and shader programs at 10.
  No lost WebGL context, shader failures, or console errors occurred. Collected JS heap rose
  from 11.76 MB to 12.27 MB including registration batches; this short sample does not establish
  long-term heap stability. Remaining: extended soak testing unverified.
- **PASS — Automated checks.** Expected: type, lint, regression tests, production build succeed.
  Actual: TypeScript, ESLint, all 45 unit tests, `git diff --check`, lockfile install dry-run,
  and `npm run build` passed. Static generation completed; `/` first load was 406 kB.
  Remaining: offline install dry-run is not a fresh online installation.
- **UNVERIFIED — Physical WebXR.** Expected: headset entry, stereo rendering, tracking and
  controller behavior. Actual: existing XR store, XR, XROrigin and entry UI remain; desktop
  adapters guard active XR sessions and XR selects Low density. No headset was available.
  Remaining: physical device testing; XR input-to-Player movement is not implemented.
- **PASS locally / UNVERIFIED hosted — Vercel.** Expected: standard Next deployment.
  Actual: production build/start passed, default Next configuration retained, and app code
  requires no environment variables or custom server. Remaining: deploy an HTTPS preview,
  inspect hosted logs/assets, repeat desktop smoke checks, then test a physical headset.

## Performance

**PASS for this desktop sample.** Each measurement covered 180 frames after warmup, with
movement active in First person. Overview / First person results:

- Low, 12,100 particles: approximately 120 / 120 FPS; p95 9.8 / 9.9 ms.
- Balanced, 21,200 particles: approximately 120 / 120 FPS; p95 9.8 / 10.3 ms.
- High, 31,300 particles: approximately 120 / 120 FPS; p95 10.3 / 9.9 ms.

No major regression appeared across presets. The previously recorded 12,100-particle baseline
also reached approximately 120 FPS; that historical build was not rerun during this audit.
These short, display-paced samples cannot establish mobile/XR performance or GPU headroom.
Auto density fallback and XR Low selection remain available; device performance is unverified.

## Bug fixed and audit files

A pending pointer-lock grant could reacquire the mouse after Escape or window blur.
The desktop adapter now cancels its input session and rejects late grants after cancellation,
mode disposal, or XR entry. Blur, Escape, and mode-change race regressions all pass.

- Modified: `app/components/controls/DesktopPlayerControls.tsx` — input-session lifecycle guard.
- Created: `scripts/audit-pointer-lock.mjs` — dependency-free browser regression for the three races.
- Created: `docs/FUNCTIONAL_TEST_REPORT.md` — this report.

Existing Overview, player, flight, registry, density and body-response features were audited;
no major functionality or artistic features were added. No further desktop bugs were reproduced
in the tested paths. Collision uses conservative body bounds; exact mesh contact is not implemented.

## Reproduction and release

```sh
./node_modules/.bin/tsc --noEmit --incremental false
npm run lint
./node_modules/.bin/tsc --outDir /private/tmp/starfield-milestone-tests --module commonjs --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop tests/*.test.ts
NODE_PATH="$PWD/node_modules" node --test /private/tmp/starfield-milestone-tests/tests/*.test.js
npm run build
npm run start -- --port 3037
```

For the saved browser race check, use Node 22+ and an isolated Chrome profile with remote
debugging on port 9229, then run:

```sh
node scripts/audit-pointer-lock.mjs http://localhost:3037 http://127.0.0.1:9229
```

The broader browser experiments were temporary audit harnesses, not installed test dependencies.
For manual smoke testing: right-drag/wheel in Overview, left-hold/drag/release near a stream;
enter First person, click, use WASD into the crossing stream, use Space/Shift, descend onto
a body, walk again, press Escape, and return to Overview. Repeat the cycle.

Git recommendation: review and commit the complete intended milestone, including the existing
untracked runtime/test files and plant-file removals, plus these audit changes. Suggested title:
`Prepare StarField functional prototype and fix cancelled pointer lock`.
No commit or push was made. Exclude build output, dependencies and temporary browser profiles.
Then deploy a Vercel preview using the repository root, Next.js preset and `npm run build`;
complete the hosted/physical-XR checks above before claiming hardware milestone verification.
