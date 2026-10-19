// Shaders du rendu : une passe de préparation à la résolution de la grille,
// puis une composition plein écran avec filtrage bicubique (pas de damier).

import { COMMON_GLSL } from '../sim/gpu/shaders';

/** Appétits entre lesquels la couleur d'une lignée passe de pâle à vive. */
const APPETITE_COLOR_RANGE = [0.3, 0.85];
/** Chroma relatif d'une lignée très sobre et d'une très gourmande. */
const APPETITE_CHROMA = [0.35, 1.8];

/** Nombre maximal de lignées mises en évidence ensemble (une lignée et ses descendantes). */
export const MAX_FOCUS = 32;

/** Prépare trois textures filtrables à partir des textures de simulation. */
export const PREP_SHADER = /* glsl */ `#version 300 es
#define MAX_FOCUS ${MAX_FOCUS}
#define APPETITE_LOW ${APPETITE_COLOR_RANGE[0].toFixed(3)}
#define APPETITE_HIGH ${APPETITE_COLOR_RANGE[1].toFixed(3)}
#define APPETITE_PALE ${APPETITE_CHROMA[0].toFixed(3)}
#define APPETITE_VIVID ${APPETITE_CHROMA[1].toFixed(3)}
precision highp float;
precision highp sampler2D;
uniform sampler2D uState;
uniform sampler2D uAux;
uniform sampler2D uSed;
uniform sampler2D uGenome;
uniform float uAliveT;
uniform float uSedRef;
uniform float uSedMaturity;
uniform float uFocus[MAX_FOCUS];
uniform int uFocusCount;
layout(location = 0) out vec4 oLife;
layout(location = 1) out vec4 oGround;
layout(location = 2) out vec4 oField;
layout(location = 3) out vec4 oFocus;
${COMMON_GLSL}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uState, p, 0);
  vec4 a = texelFetch(uAux, p, 0);
  vec4 sed = texelFetch(uSed, p, 0);
  float v = s.z > 0.5 ? s.x : 0.0;
  // La teinte dit la lignée, la vivacité son appétit : gourmande vive, sobre pâle.
  float app = texelFetch(uGenome, p, 0).w;
  float chroma = HUE_C * mix(APPETITE_PALE, APPETITE_VIVID, smoothstep(APPETITE_LOW, APPETITE_HIGH, app));
  oLife = vec4(oklch(HUE_L, chroma, a.x) * v, v);
  oGround = vec4(sed.rgb, smoothstep(0.15, 1.9, sed.a / uSedRef) * uSedMaturity);
  oField = vec4(s.y, a.z, s.x >= uAliveT ? 0.0 : a.y, fract(a.x));
  float f = 0.0;
  for (int i = 0; i < MAX_FOCUS; i++) {
    if (i >= uFocusCount) break;
    if (abs(s.z - uFocus[i]) < 0.5) f = v;
  }
  oFocus = vec4(f, 0.0, 0.0, 1.0);
}
`;

export const COMPOSITE_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uLife;
uniform sampler2D uGround;
uniform sampler2D uField;
uniform sampler2D uFocusTex;
uniform float uFocusOn;
uniform vec4 uMarker;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uScale;
uniform int uClip;
uniform int uLayer;
uniform float uTime;
uniform float uDaylight;
uniform float uGrid;
uniform vec3 uEarth;
// Spores récentes : position (uv), âge en secondes, intensité.
uniform vec4 uSpores[8];
out vec4 outColor;

// B-spline bicubique à partir de 4 lectures bilinéaires.
vec4 smoothTex(sampler2D t, vec2 uv) {
  vec2 st = uv * uGrid - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f * f - 3.0 * f * f * f) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / uGrid;
  vec2 h1 = (i + 1.5 + w3 / g1) / uGrid;
  return g0.y * (g0.x * textureLod(t, vec2(h0.x, h0.y), 0.0) + g1.x * textureLod(t, vec2(h1.x, h0.y), 0.0))
       + g1.y * (g0.x * textureLod(t, vec2(h0.x, h1.y), 0.0) + g1.x * textureLod(t, vec2(h1.x, h1.y), 0.0));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 nutrientMap(float n) {
  return mix(mix(vec3(0.02, 0.03, 0.05), vec3(0.05, 0.28, 0.32), smoothstep(0.0, 0.6, n)), vec3(0.75, 0.9, 0.82), smoothstep(0.6, 1.0, n));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - uCenter) / uScale + 0.5;
  if (uClip == 1 && (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0)) {
    outColor = vec4(0.02, 0.018, 0.016, 1.0);
    return;
  }
  vec4 life = smoothTex(uLife, uv);
  vec4 ground = smoothTex(uGround, uv);
  vec4 field = smoothTex(uField, uv);
  float v = clamp(life.a, 0.0, 1.0);
  vec3 hc = life.rgb / max(life.a, 1e-3);

  vec3 col;
  if (uLayer == 1) {
    col = vec3(v);
  } else if (uLayer == 2) {
    float body = smoothstep(0.01, 0.08, v);
    vec3 ghost = vec3(0.12) * smoothstep(0.0, 0.3, field.z);
    col = mix(ghost, hc * 1.25, body);
  } else if (uLayer == 3) {
    col = nutrientMap(clamp(field.x, 0.0, 1.0));
  } else if (uLayer == 4) {
    col = mix(vec3(0.0), ground.rgb * 1.6, clamp(ground.a, 0.0, 1.0));
  } else {
    // Fond terreux : sédiment accumulé sur une terre sombre.
    vec3 soil = mix(uEarth * 0.75, ground.rgb * 0.42, clamp(ground.a, 0.0, 1.0) * 0.9);

    // Lueur des nutriments sous la surface, floue et respirant avec le jour.
    float nutBlur = textureLod(uField, uv, 2.5).x;
    float light = 0.75 + 0.25 * uDaylight;
    soil += vec3(0.085, 0.10, 0.085) * pow(clamp(nutBlur, 0.0, 1.0), 2.0) * 0.6 * light;

    // Halo diffus autour du vivant.
    vec4 haloT = textureLod(uLife, uv, 3.0);
    vec3 haloC = haloT.rgb / max(haloT.a, 1e-3);
    soil += haloC * smoothstep(0.0, 0.5, haloT.a) * 0.07;

    // Corps : bords doux, lumière rasante sur le gradient, légère pulsation.
    vec2 e = vec2(1.0 / uGrid, 0.0);
    float gx = textureLod(uLife, uv + e.xy, 0.0).a - textureLod(uLife, uv - e.xy, 0.0).a;
    float gy = textureLod(uLife, uv + e.yx, 0.0).a - textureLod(uLife, uv - e.yx, 0.0).a;
    vec2 grad = vec2(gx, gy);
    float rim = clamp(length(grad) * 3.0, 0.0, 1.0);
    float shade = clamp(0.5 + dot(normalize(grad + 1e-5), vec2(-0.6, 0.8)) * length(grad) * 2.0, 0.0, 1.0);
    float phase = field.w * 6.2831853;
    float pulse = 1.0 + 0.06 * sin(uTime * 0.9 + phase + v * 3.0);
    float grow = clamp(field.y * 40.0, -1.0, 1.0);
    vec3 body = hc * (0.16 + 0.68 * pow(v, 0.8)) * pulse;
    body += hc * rim * 0.3 + vec3(0.9, 0.85, 0.75) * max(grow, 0.0) * 0.06 * v;
    body *= 0.85 + 0.3 * shade;
    body *= 0.8 + 0.2 * light;
    float cover = smoothstep(0.015, 0.35, v);
    col = mix(soil, body, cover * 0.95);

    // Mise en évidence d'une lignée : les autres s'estompent, un liseré respire autour d'elle.
    if (uFocusOn > 0.0) {
      float inside = smoothstep(0.015, 0.25, smoothTex(uFocusTex, uv).r);
      float near = textureLod(uFocusTex, uv, 2.5).r;
      float others = cover * (1.0 - inside);
      col = mix(col, soil * 0.85, others * 0.7 * uFocusOn);
      float glow = smoothstep(0.0, 0.2, near) * (1.0 - inside);
      col += vec3(0.95, 0.88, 0.72) * glow * (0.07 + 0.04 * sin(uTime * 1.7)) * uFocusOn;
    }

    // Anneau qui signale un lieu (où vit ou vivait une lignée).
    if (uMarker.z > 0.0) {
      vec2 md = uv - uMarker.xy;
      md -= floor(md + 0.5);
      float dist = length(md) * uGrid;
      float r = 9.0 + 1.5 * sin(uTime * 1.6);
      col += vec3(0.95, 0.88, 0.72) * exp(-pow((dist - r) / 1.3, 2.0)) * 0.3 * uMarker.z;
    }

    // Anneau discret autour des spores tout juste déposées.
    for (int i = 0; i < 8; i++) {
      vec4 sp = uSpores[i];
      if (sp.w <= 0.0) continue;
      vec2 dd = uv - sp.xy;
      dd -= floor(dd + 0.5);
      float dist = length(dd) * uGrid;
      float radius = 3.0 + sp.z * 9.0;
      float ring = exp(-pow((dist - radius) / 1.6, 2.0)) * (1.0 - smoothstep(0.0, 2.0, sp.z));
      col += vec3(0.85, 0.8, 0.68) * ring * 0.22 * sp.w;
    }

    // Vignette et grain très léger.
    vec2 q = frag / uResolution - 0.5;
    col *= 1.0 - 0.45 * dot(q, q);
    col += (hash12(frag + fract(uTime) * 100.0) - 0.5) * 0.012;
  }
  outColor = vec4(pow(max(col, 0.0), vec3(1.0 / 1.1)), 1.0);
}
`;
