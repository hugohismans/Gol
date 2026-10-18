// Shaders GLSL ES 3.00 de la simulation (ping-pong de textures).
//
// Textures d'état, une valeur par case :
//   state  : vitalité, nutriments, lignée, âge
//   genome : rayon, mu, sigma, appétit
//   aux    : teinte, influence, variation de vitalité du dernier tick, inutilisé
//   sed    : pigment rgb, épaisseur
//   vit    : copie R16F de la vitalité, filtrée et mipmappée pour le kernel
//
// Une case morte porte la lignée "fantôme" la plus influente autour d'elle :
// c'est le génome qu'elle utilise pour évaluer sa croissance, et dont elle
// hérite (avec mutation) si elle naît.

import { HUE_CHROMA, HUE_LIGHTNESS } from '../config';

export const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const COMMON_GLSL = /* glsl */ `
#define HUE_L ${HUE_LIGHTNESS.toFixed(4)}
#define HUE_C ${HUE_CHROMA.toFixed(4)}
uint hash(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}
float rnd(inout uint s) { s = hash(s); return float(s >> 8) * (1.0 / 16777216.0); }
float gauss(inout uint s) {
  float u1 = max(rnd(s), 1e-7);
  float u2 = rnd(s);
  return sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2);
}
// Couleur d'une teinte en OKLCH (luminosité et chroma fixes, donc sobre et
// homogène), convertie en sRGB approché.
vec3 oklch(float L, float C, float h) {
  float a = C * cos(6.2831853 * h);
  float b = C * sin(6.2831853 * h);
  float l = L + 0.3963377774 * a + 0.2158037573 * b;
  float m = L - 0.1055613458 * a - 0.0638541728 * b;
  float s = L - 0.0894841775 * a - 1.2914855480 * b;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 lin = vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return pow(clamp(lin, 0.0, 1.0), vec3(1.0 / 2.2));
}
vec3 hueColor(float h) { return oklch(HUE_L, HUE_C, h); }
`;

export function stepShader(tapCount: number): string {
  return /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform sampler2D uGenome;
uniform sampler2D uAux;
uniform sampler2D uSed;
uniform sampler2D uVit;

uniform vec4 uTaps[${tapCount}];
uniform int uSize;
uniform uint uSeed;
uniform float uDt;
uniform float uAliveT;
uniform float uLodGap;

uniform float uRadiusScale;
uniform float uMuOffset;
uniform float uSigmaScale;
uniform float uAppetiteScale;
uniform float uAppetiteGrowth;

uniform float uRegen;
uniform float uDiffusion;
uniform float uConsumption;
uniform float uNutHalf;
uniform float uUptakeHalf;
uniform float uStarvation;
uniform float uStarveBelow;
uniform float uSenescence;
uniform vec2 uSenescenceAge;

uniform float uGhostDecay;
uniform float uGhostMin;

uniform float uMutationRate;
uniform vec4 uMutSigma;
uniform float uMutHue;
uniform vec2 uRadiusBounds;
uniform vec2 uMuBounds;
uniform vec2 uSigmaBounds;
uniform vec2 uAppetiteBounds;

uniform float uSedRate;
uniform float uSedDarken;
uniform float uSedMemory;
uniform vec3 uEarth;

layout(location = 0) out vec4 oState;
layout(location = 1) out vec4 oGenome;
layout(location = 2) out vec4 oAux;
layout(location = 3) out vec4 oSed;

${COMMON_GLSL}

ivec2 wrap(ivec2 p) { return (p % uSize + uSize) % uSize; }

const ivec2 N8[8] = ivec2[8](
  ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1),
  ivec2(1, 1), ivec2(-1, 1), ivec2(1, -1), ivec2(-1, -1)
);

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uState, p, 0);
  vec4 g = texelFetch(uGenome, p, 0);
  vec4 a = texelFetch(uAux, p, 0);
  vec4 sed = texelFetch(uSed, p, 0);

  float vit = s.x;
  float nut = s.y;
  float lin = s.z;
  float age = s.w;
  float hue = a.x;
  bool alive = vit >= uAliveT && lin > 0.5;
  float influence = alive ? vit : 0.0;

  // Case morte : elle adopte la lignée la plus influente de son voisinage.
  if (!alive) {
    float best = 0.0;
    ivec2 bq = p;
    for (int i = 0; i < 8; i++) {
      ivec2 q = wrap(p + N8[i]);
      float inf = texelFetch(uAux, q, 0).y * (i < 4 ? uGhostDecay : uGhostDecay * uGhostDecay);
      if (inf > best) { best = inf; bq = q; }
    }
    if (best >= uGhostMin) {
      lin = texelFetch(uState, bq, 0).z;
      g = texelFetch(uGenome, bq, 0);
      hue = texelFetch(uAux, bq, 0).x;
      influence = best;
    } else {
      lin = 0.0;
      influence = 0.0;
    }
  }

  // Potentiel : convolution de la vitalité par le kernel en anneau de la case.
  // Sans lignée, rien ne peut pousser : inutile de calculer le potentiel.
  float U = 0.0;
  if (lin > 0.5) {
    float R = g.x * uRadiusScale;
    float lod = max(0.0, log2(R / uLodGap));
    vec2 c = (vec2(p) + 0.5) / float(uSize);
    float scale = R / float(uSize);
    for (int i = 0; i < ${tapCount}; i++) {
      vec4 t = uTaps[i];
      U += t.z * textureLod(uVit, c + t.xy * scale, lod).r;
    }
  }

  // Croissance en cloche, modulée par les nutriments et l'appétit.
  float mu = g.y + uMuOffset;
  float sig = max(1e-4, g.z * uSigmaScale);
  float app = max(0.0, g.w * uAppetiteScale);
  float d = (U - mu) / sig;
  float G = 2.0 * exp(-0.5 * d * d) - 1.0;
  float food = nut / (nut + uNutHalf) * (1.0 + uNutHalf);
  if (G > 0.0) G *= food * max(0.0, 1.0 + uAppetiteGrowth * (app - 0.5));
  G -= uStarvation * max(0.0, 1.0 - nut / max(uStarveBelow, 1e-4));
  G -= uSenescence * smoothstep(uSenescenceAge.x, uSenescenceAge.y, age);
  if (lin < 0.5) G = -1.0;
  float nv = clamp(vit + uDt * G, 0.0, 1.0);

  // Nutriments : consommation, diffusion, régénération.
  float lap = texelFetch(uState, wrap(p + ivec2(1, 0)), 0).y
            + texelFetch(uState, wrap(p + ivec2(-1, 0)), 0).y
            + texelFetch(uState, wrap(p + ivec2(0, 1)), 0).y
            + texelFetch(uState, wrap(p + ivec2(0, -1)), 0).y
            - 4.0 * nut;
  float consume = min(nut, nv * app * uConsumption * nut / (nut + uUptakeHalf + 1e-6));
  float nn = clamp(nut + uDiffusion * lap + uRegen * (1.0 - nut) - consume, 0.0, 1.0);

  // Naissance : héritage du génome fantôme avec mutation gaussienne légère.
  bool nowAlive = nv >= uAliveT && lin > 0.5;
  float nage = nowAlive ? (alive ? age + 1.0 : 0.0) : 0.0;
  if (nowAlive && !alive) {
    uint seed = hash(uint(p.x) + uint(p.y) * 65536u) ^ uSeed;
    float m = uMutationRate;
    g.x = clamp(g.x * (1.0 + uMutSigma.x * m * gauss(seed)), uRadiusBounds.x, uRadiusBounds.y);
    g.y = clamp(g.y * (1.0 + uMutSigma.y * m * gauss(seed)), uMuBounds.x, uMuBounds.y);
    g.z = clamp(g.z * (1.0 + uMutSigma.z * m * gauss(seed)), uSigmaBounds.x, uSigmaBounds.y);
    g.w = clamp(g.w * (1.0 + uMutSigma.w * m * gauss(seed)), uAppetiteBounds.x, uAppetiteBounds.y);
    hue = fract(hue + uMutHue * m * gauss(seed));
  }
  if (nowAlive) influence = nv;

  // Sédiment : la vitalité perdue se dépose, colorée par la teinte.
  float dep = max(0.0, vit - nv) * uSedRate;
  float th = sed.a + dep;
  vec3 pig = sed.rgb;
  if (dep > 0.0) pig = mix(pig, hueColor(hue), dep / max(min(th, uSedMemory), 1e-6));
  pig = mix(pig, uEarth, uSedDarken);

  oState = vec4(nv, nn, lin, nage);
  oGenome = g;
  oAux = vec4(hue, influence, nv - vit, 0.0);
  oSed = vec4(pig, th);
}
`;
}

/** Copie de la vitalité dans la texture R16F filtrable. */
export const COPY_VIT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uState;
out vec4 oVit;
void main() { oVit = vec4(texelFetch(uState, ivec2(gl_FragCoord.xy), 0).x, 0.0, 0.0, 1.0); }
`;

/**
 * Tampon : spore (mode 0) ou conversion en sous-lignée (mode 1) dans un disque.
 * Recopie toutes les autres cases à l'identique.
 */
export const STAMP_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uState;
uniform sampler2D uGenome;
uniform sampler2D uAux;
uniform sampler2D uSed;
uniform int uSize;
uniform int uMode;
uniform uint uSeed;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uLineage;
uniform float uFromLineage;
uniform vec4 uGene;
uniform float uHue;
uniform float uDensity;
uniform float uNutrientBoost;
uniform float uAliveT;

layout(location = 0) out vec4 oState;
layout(location = 1) out vec4 oGenome;
layout(location = 2) out vec4 oAux;
layout(location = 3) out vec4 oSed;

${COMMON_GLSL}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uState, p, 0);
  vec4 g = texelFetch(uGenome, p, 0);
  vec4 a = texelFetch(uAux, p, 0);
  oSed = texelFetch(uSed, p, 0);

  float size = float(uSize);
  vec2 d = vec2(p) + 0.5 - uCenter;
  d -= size * floor(d / size + 0.5);
  float r = length(d) / uRadius;

  if (r < 1.0) {
    if (uMode == 0) {
      uint seed = hash(uint(p.x) + uint(p.y) * 65536u) ^ uSeed;
      float f = 1.0 - smoothstep(0.55, 1.0, r);
      float v = f * uDensity * rnd(seed);
      if (f > 0.02) {
        s = vec4(max(v, s.x * (1.0 - f)), min(1.0, s.y + uNutrientBoost * f), uLineage, 0.0);
        g = uGene;
        a = vec4(uHue, max(v, uAliveT), 0.0, 0.0);
      }
    } else if (abs(s.z - uFromLineage) < 0.5 && s.x >= uAliveT) {
      s.z = uLineage;
      g = uGene;
      a.x = uHue;
    }
  }
  oState = s;
  oGenome = g;
  oAux = a;
}
`;
