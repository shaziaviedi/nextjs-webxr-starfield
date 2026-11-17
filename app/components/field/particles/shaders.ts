// particle movement is done here on the gpu, way cheaper than js for this many

const vertexHeader = /* glsl */ `
  uniform float uTime;
  uniform float uScale;        // metres -> pixels
  uniform float uFadeStart;
  uniform float uFadeEnd;
  uniform float uMaxPointSize;

  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlpha;

  uniform int uInteractionCount;
  uniform sampler2D uInteractionTexture;
  uniform vec2 uInteractionTextureSize;
  uniform float uMaxDisplacement;

  vec4 interactionTexel(float index) {
    vec2 pixel = vec2(mod(index, uInteractionTextureSize.x), floor(index / uInteractionTextureSize.x));
    return texture2D(uInteractionTexture, (pixel + 0.5) / uInteractionTextureSize);
  }

  // Approximate spring response: source envelopes ease in/recover on the CPU,
  // while every vertex keeps following its original analytic animated path.
  // No position accumulation, per-particle CPU work, or renderer-specific compute.
  vec3 interactionOffset(vec3 worldPosition) {
    vec3 displacement = vec3(0.0);
    for (int i = 0; i < uInteractionCount; i++) {
      float texel = float(i) * 2.0;
      float strength = interactionTexel(texel + 1.0).x;
      if (strength <= 0.0) continue;
      vec4 source = interactionTexel(texel);
      vec3 away = worldPosition - source.xyz;
      float radius = max(source.w, 0.0001);
      float distanceSquared = dot(away, away);
      if (distanceSquared >= radius * radius) continue;
      float distanceToSource = sqrt(distanceSquared);
      float falloff = 1.0 - smoothstep(0.0, radius, distanceToSource);
      // A regularized direction stays finite and continuous at the exact centre.
      vec3 direction = away / sqrt(distanceSquared + 0.0001);
      displacement += direction * strength * falloff;
    }
    float magnitude = length(displacement);
    return displacement * min(1.0, uMaxDisplacement / max(magnitude, 0.0001));
  }
`;

// shared end of both vertex shaders, needs "p" and "brightness" set
const vertexFinish = /* glsl */ `
  vec4 worldPosition = modelMatrix * vec4(p, 1.0);
  worldPosition.xyz += interactionOffset(worldPosition.xyz);
  vec4 viewPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * viewPosition;

  float distanceToCamera = max(-viewPosition.z, 0.1);
  float pixelSize = aSize * uScale / distanceToCamera;

  // under 1px they flicker, so clamp to 1px and dim instead
  float subPixelDim = clamp(pixelSize, 0.0, 1.0);
  gl_PointSize = clamp(pixelSize, 1.0, uMaxPointSize);

  float twinkle = 0.65 + 0.35 * sin(uTime * (0.3 + aSeed * 0.6) + aSeed * 40.0);

  // shader materials dont get scene fog so fade here
  float distanceFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distanceToCamera);

  vColor = aColor;
  vAlpha = brightness * twinkle * distanceFade * subPixelDim;
`;

// offset is based on position so nearby dust moves together, not jittery
export const dustVertexShader = /* glsl */ `
  ${vertexHeader}
  uniform float uFlowAmount;

  void main() {
    vec3 p = position;
    float t = uTime;

    p += vec3(
      sin(position.y * 0.12 + t * 0.050 + aSeed * 0.5),
      sin(position.z * 0.10 + t * 0.037) * 0.6,
      sin(position.x * 0.11 + t * 0.043)
    ) * uFlowAmount;

    p += vec3(
      sin(t * 0.31 + aSeed * 6.28),
      sin(t * 0.23 + aSeed * 12.57),
      sin(t * 0.27 + aSeed * 18.85)
    ) * 0.06;

    float brightness = 1.0;
    ${vertexFinish}
  }
`;

export const streamVertexShader = /* glsl */ `
  ${vertexHeader}
  uniform vec3 uCenter;
  uniform vec2 uRadii;
  uniform mat3 uRotation;
  uniform float uSpeed;     // loops per sec
  uniform float uWaveAmp;
  uniform float uWaveFreq;
  uniform float uClumping;

  attribute float aProgress; // 0-1 around the loop
  attribute vec3 aOffset;

  void main() {
    float progress = fract(aProgress + uTime * uSpeed);
    float angle = progress * 6.28318530718;

    vec3 p = vec3(
      cos(angle) * uRadii.x,
      sin(angle * uWaveFreq) * uWaveAmp,
      sin(angle) * uRadii.y
    );

    float swell = 1.0 + 0.35 * sin(angle * 3.0 + uTime * 0.07 + aSeed * 6.28);
    p += aOffset * swell;

    p = uRotation * p + uCenter;

    // brighter pulses drifting along the stream
    float brightness = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(angle * uClumping - uTime * 0.12), 2.0);

    ${vertexFinish}
  }
`;

// soft round dot w/ a brighter centre
export const particleFragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float distanceFromCentre = length(gl_PointCoord - vec2(0.5));

    float halo = smoothstep(0.5, 0.0, distanceFromCentre);
    halo *= halo;
    float core = smoothstep(0.2, 0.0, distanceFromCentre);
    float glow = halo * 0.7 + core * 0.6;

    gl_FragColor = vec4(vColor, glow * vAlpha * uOpacity);

    #include <colorspace_fragment>
  }
`;
