// Interface commune aux deux moteurs de calcul des champs :
// GPU (WebGL2, navigateur) et CPU (TypeScript pur, tests et futur serveur).
// Les deux appliquent exactement les mêmes règles ; la logique du monde
// (lignées, recensement, spores) vit dans Organisme et ne dépend d'aucun.

import {
  ALIVE_THRESHOLD,
  BIRTH_MUTATION_SIGMA,
  GENOME_BOUNDS,
  GHOST_DECAY,
  GHOST_MIN_INFLUENCE,
  KERNEL_LOD_GAP,
  KERNEL_TAP_DENSITY,
  LENIA_DT,
  SEDIMENT_COLOR_MEMORY,
  SEDIMENT_EARTH,
  SPORE_DENSITY,
  SPORE_NUTRIENT_BOOST,
  TICKS_PER_DAY,
} from './config';
import type { Params } from './config';

/** Index des grilles d'état (RGBA par case) dans un backend. */
export const STATE = 0;
export const GENOME = 1;
export const AUX = 2;
export const SED = 3;

/** Constantes d'un pas de simulation, dérivées des paramètres. */
export interface StepConstants {
  dt: number;
  aliveT: number;
  lodGap: number;
  radiusScale: number;
  muOffset: number;
  sigmaScale: number;
  appetiteScale: number;
  appetiteGrowth: number;
  diffusion: number;
  consumption: number;
  nutHalf: number;
  uptakeHalf: number;
  starvation: number;
  starveBelow: number;
  senescence: number;
  senescenceAge: [number, number];
  ghostDecay: number;
  ghostMin: number;
  mutationRate: number;
  mutSigma: [number, number, number, number];
  mutHue: number;
  radiusBounds: [number, number];
  muBounds: [number, number];
  sigmaBounds: [number, number];
  appetiteBounds: [number, number];
  sedRate: number;
  sedDarken: number;
  sedMemory: number;
  earth: [number, number, number];
}

export function stepConstants(q: Params): StepConstants {
  const m = BIRTH_MUTATION_SIGMA;
  return {
    dt: LENIA_DT,
    aliveT: ALIVE_THRESHOLD,
    lodGap: KERNEL_TAP_DENSITY * KERNEL_LOD_GAP,
    radiusScale: q.radiusScale,
    muOffset: q.muOffset,
    sigmaScale: q.sigmaScale,
    appetiteScale: q.appetiteScale,
    appetiteGrowth: q.appetiteGrowth,
    diffusion: q.diffusion,
    consumption: q.consumption,
    nutHalf: q.nutrientHalf,
    uptakeHalf: q.uptakeHalf,
    starvation: q.starvation,
    starveBelow: q.starveBelow,
    senescence: q.senescence,
    senescenceAge: [
      q.senescenceStartDays * TICKS_PER_DAY,
      Math.max(q.senescenceFullDays, q.senescenceStartDays + 0.01) * TICKS_PER_DAY,
    ],
    ghostDecay: GHOST_DECAY,
    ghostMin: GHOST_MIN_INFLUENCE,
    mutationRate: q.mutationRate,
    mutSigma: [m.radius, m.mu, m.sigma, m.appetite],
    mutHue: m.hue,
    radiusBounds: GENOME_BOUNDS.radius,
    muBounds: GENOME_BOUNDS.mu,
    sigmaBounds: GENOME_BOUNDS.sigma,
    appetiteBounds: GENOME_BOUNDS.appetite,
    sedRate: q.sedimentRate,
    sedDarken: q.sedimentDarkening,
    sedMemory: SEDIMENT_COLOR_MEMORY,
    earth: SEDIMENT_EARTH,
  };
}

/** Tampon : spore (mode 0) ou conversion en sous-lignée (mode 1) dans un disque. */
export interface StampArgs {
  mode: 0 | 1;
  seed: number;
  x: number;
  y: number;
  radius: number;
  lineage: number;
  fromLineage: number;
  gene: [number, number, number, number];
  hue: number;
  density: number;
  nutrientBoost: number;
  aliveT: number;
}

export const STAMP_DEFAULTS = {
  density: SPORE_DENSITY,
  nutrientBoost: SPORE_NUTRIENT_BOOST,
  aliveT: ALIVE_THRESHOLD,
};

export interface Backend {
  readonly size: number;
  /** Fixe les constantes des prochains ticks. */
  configure(c: StepConstants): void;
  /** Joue un tick avec la régénération du moment et une graine aléatoire. */
  tick(regen: number, seed: number): void;
  stamp(s: StampArgs): void;
  /** Grille RGBA d'index STATE, GENOME, AUX ou SED. Ne pas conserver : peut être réutilisée. */
  read(index: number): Float32Array;
  /** Remplace les quatre grilles. */
  upload(data: Float32Array[]): void;
  dispose(): void;
}
