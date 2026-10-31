/** Shared GLSL snippets for storm density + ray marching. */

export const noiseGLSL = /* glsl */ `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p = p * 2.07 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
`

export const stormDensityGLSL = /* glsl */ `
// Local coords in box: x,z horizontal, y vertical — roughly [-0.5,0.5] after normalize
float stormDensity(vec3 p, float time, float density, float verticalDev, float anvil, float turb, float fine, float edgeSoft) {
  // Remap box local position (~[-0.5..0.5] * scale) to storm space
  vec3 q = p;
  float h = q.y; // -0.5 base .. 0.5 top

  // Core tower: taller with verticalDev
  float towerH = mix(0.15, 0.55, verticalDev);
  float towerR = 0.14 + (1.0 - verticalDev) * 0.04;
  float tower = 1.0 - smoothstep(towerR * 0.6, towerR * (1.2 + edgeSoft), length(q.xz));
  tower *= smoothstep(-0.48, -0.35, h) * (1.0 - smoothstep(towerH - 0.05, towerH + 0.12, h));

  // Overshooting top
  float top = 1.0 - smoothstep(0.08, 0.18, length(q.xz));
  top *= smoothstep(towerH - 0.08, towerH + 0.02, h) * (1.0 - smoothstep(towerH + 0.05, towerH + 0.18, h));

  // Anvil: wide thin disk near top, biased downshear (+x)
  float anvilY = towerH - 0.02;
  float anvilR = mix(0.22, 0.55, anvil);
  vec2 anvilC = q.xz - vec2(anvil * 0.12, 0.0);
  float anvilShape = 1.0 - smoothstep(anvilR * 0.35, anvilR, length(anvilC));
  anvilShape *= exp(-pow((h - anvilY) / mix(0.04, 0.09, edgeSoft), 2.0));
  anvilShape *= mix(0.4, 1.0, anvil);

  // Lower base / flanking line
  float base = 1.0 - smoothstep(0.18, 0.42, length(q.xz + vec2(0.05, -0.02)));
  base *= smoothstep(-0.48, -0.42, h) * (1.0 - smoothstep(-0.28, -0.12, h));

  float body = max(max(tower, top * 0.85), max(anvilShape, base * 0.75));

  // Domain-warped turbulence
  vec3 wp = q * (3.2 + fine * 2.5) + vec3(time * 0.015, time * 0.008, -time * 0.012);
  float n = fbm(wp + fbm(wp * 1.7) * turb);
  float detail = mix(0.55, 1.15, n);
  body *= detail;

  // Edge softness via threshold
  float thresh = mix(0.42, 0.22, density);
  float d = smoothstep(thresh, thresh + mix(0.08, 0.22, edgeSoft), body * density);

  // Carve a bit of underside darkness near precip core
  float precipHole = smoothstep(0.12, 0.0, length(q.xz)) * smoothstep(-0.2, -0.45, h);
  d *= 1.0 - precipHole * 0.25;

  return clamp(d, 0.0, 1.0);
}
`

export const cloudVertexShader = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vLocalPos;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vLocalPos = position;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

export const cloudFragmentShader = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uDensity;
uniform float uVertical;
uniform float uAnvil;
uniform float uTurb;
uniform float uFine;
uniform float uEdge;
uniform float uLightResp;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uCoreColor;
uniform vec3 uHighlight;
uniform vec3 uLightningPos;
uniform float uLightningIntensity;
uniform float uNightFactor;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform int uSteps;
varying vec3 vWorldPos;
varying vec3 vLocalPos;

${noiseGLSL}
${stormDensityGLSL}

vec2 intersectBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tNear = max(max(tmin.x, tmin.y), tmin.z);
  float tFar = min(min(tmax.x, tmax.y), tmax.z);
  return vec2(tNear, tFar);
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - cameraPosition);

  vec2 hit = intersectBox(ro, rd, uBoxMin, uBoxMax);
  if (hit.y < 0.0 || hit.x > hit.y) discard;
  float t0 = max(hit.x, 0.0);
  float t1 = hit.y;

  float stepSize = (t1 - t0) / float(uSteps);
  vec3 p = ro + rd * (t0 + stepSize * 0.5);

  vec3 boxSize = uBoxMax - uBoxMin;
  vec3 boxCenter = 0.5 * (uBoxMin + uBoxMax);

  float transmittance = 1.0;
  vec3 scattered = vec3(0.0);

  for (int i = 0; i < 96; i++) {
    if (i >= uSteps) break;
    if (transmittance < 0.02) break;

    // Local normalized coords for density
    vec3 local = (p - boxCenter) / boxSize;
    float dens = stormDensity(local, uTime, uDensity, uVertical, uAnvil, uTurb, uFine, uEdge);

    if (dens > 0.01) {
      // Cheap self-shadow: sample density toward sun
      vec3 sp = p + uSunDir * (18.0 + 40.0 * uLightResp);
      vec3 slocal = (sp - boxCenter) / boxSize;
      float shadow = stormDensity(slocal, uTime, uDensity, uVertical, uAnvil, uTurb * 0.7, uFine * 0.5, uEdge);
      float sunVis = exp(-shadow * (2.2 + uLightResp));

      float heightNorm = clamp((local.y + 0.5), 0.0, 1.0);
      vec3 baseCol = mix(uCoreColor, uHighlight, heightNorm * 0.55 + sunVis * 0.35);
      // Sunset warmth only on lit faces — preserve depth
      baseCol = mix(baseCol, uSunColor * 0.85 + baseCol * 0.4, sunVis * (1.0 - uNightFactor) * 0.5);

      // Ambient sky fill (weak at night)
      vec3 ambient = uSkyColor * mix(0.04, 0.22, 1.0 - uNightFactor);

      // Local lightning illumination
      float lDist = length(p - uLightningPos);
      float lAtt = uLightningIntensity / (1.0 + lDist * 0.0045 + lDist * lDist * 0.000004);
      vec3 lightningCol = vec3(0.75, 0.85, 1.0) * lAtt;

      vec3 light = uSunColor * sunVis * mix(0.15, 1.1, 1.0 - uNightFactor * 0.85)
                 + ambient
                 + lightningCol;

      float absorb = dens * stepSize * 0.045;
      vec3 stepScatter = baseCol * light * dens * stepSize * 0.04;
      scattered += transmittance * stepScatter;
      transmittance *= exp(-absorb);
    }

    p += rd * stepSize;
  }

  float alpha = 1.0 - transmittance;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(scattered, alpha);
}
`
