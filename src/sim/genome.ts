// Opérations sur les génomes : bornes, mutations de visiteur, tirages.

import {
  BIRTH_MUTATION_SIGMA,
  DEFAULT_GENOME,
  GENOME_BOUNDS,
  MUTATION_EFFECTS,
  SEED_GENOME_SPREAD,
  SUBLINEAGE_JUMP,
} from './config';
import type { Rng } from './rng';
import type { Genome, MutationKind } from './types';

export function clampGenome(g: Genome): Genome {
  const c = (k: keyof Genome, v: number) => Math.min(GENOME_BOUNDS[k][1], Math.max(GENOME_BOUNDS[k][0], v));
  return {
    radius: c('radius', g.radius),
    mu: c('mu', g.mu),
    sigma: c('sigma', g.sigma),
    appetite: c('appetite', g.appetite),
    hue: ((g.hue % 1) + 1) % 1,
  };
}

/** Applique une des cinq mutations de visiteur. */
export function applyMutation(g: Genome, kind: MutationKind): Genome {
  const fx = MUTATION_EFFECTS[kind];
  const out = { ...g };
  for (const key of Object.keys(fx) as (keyof Genome)[]) {
    const v = fx[key] as number;
    out[key] = key === 'hue' ? g.hue + v : g[key] * v;
  }
  return clampGenome(out);
}

/** Saut génétique d'une sous-lignée : mutation gaussienne amplifiée. */
export function sublineageJump(g: Genome, rng: Rng, rate: number): Genome {
  const s = SUBLINEAGE_JUMP * rate;
  return clampGenome({
    radius: g.radius * (1 + BIRTH_MUTATION_SIGMA.radius * s * rng.gauss()),
    mu: g.mu * (1 + BIRTH_MUTATION_SIGMA.mu * s * rng.gauss()),
    sigma: g.sigma * (1 + BIRTH_MUTATION_SIGMA.sigma * s * rng.gauss()),
    appetite: g.appetite * (1 + BIRTH_MUTATION_SIGMA.appetite * s * rng.gauss()),
    hue: g.hue + BIRTH_MUTATION_SIGMA.hue * s * 4 * rng.gauss(),
  });
}

/** Génome varié autour du génome par défaut, pour le seed aléatoire. */
export function randomGenome(rng: Rng): Genome {
  return clampGenome({
    radius: DEFAULT_GENOME.radius + SEED_GENOME_SPREAD.radius * rng.gauss(),
    mu: DEFAULT_GENOME.mu + SEED_GENOME_SPREAD.mu * rng.gauss(),
    sigma: DEFAULT_GENOME.sigma + SEED_GENOME_SPREAD.sigma * rng.gauss(),
    appetite: DEFAULT_GENOME.appetite + SEED_GENOME_SPREAD.appetite * rng.gauss(),
    hue: rng.next(),
  });
}
