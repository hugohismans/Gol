// Types partagés de la simulation.

export interface Genome {
  /** Rayon du kernel en cases. */
  radius: number;
  /** Centre de la fonction de croissance. */
  mu: number;
  /** Largeur de la fonction de croissance. */
  sigma: number;
  /** Appétit : consommation et vigueur de croissance. */
  appetite: number;
  /** Teinte entre 0 et 1. */
  hue: number;
}

export type MutationKind = 'gourmande' | 'sobre' | 'expansive' | 'compacte' | 'teinte';

export const MUTATION_KINDS: MutationKind[] = ['gourmande', 'sobre', 'expansive', 'compacte', 'teinte'];

/** Gènes réglables par le visiteur ; le sens + est celui de la vigueur. */
export type DnaGene = 'appetit' | 'envergure' | 'tolerance' | 'audace';

export const DNA_GENES: DnaGene[] = ['appetit', 'envergure', 'tolerance', 'audace'];

/**
 * ADN choisi par le visiteur : un niveau entier par gène (somme nulle, chaque
 * gain de vigueur se paie ailleurs) et un décalage de teinte libre.
 */
export interface Dna {
  appetit: number;
  envergure: number;
  tolerance: number;
  audace: number;
  teinte: number;
}

export type LineageOrigin = 'spore' | 'sous-lignee';

export interface Lineage {
  id: number;
  parentId: number | null;
  origin: LineageOrigin;
  mutation: MutationKind | null;
  /** ADN choisi par le visiteur à la fondation, s'il y en a un. */
  dna: Dna | null;
  /** Génome fondateur (au moment de la naissance de la lignée). */
  founder: Genome;
  bornTick: number;
  /** Tick où la dernière case vivante a disparu, null si vivante. */
  extinctTick: number | null;
  /** Nombre de cases vivantes au dernier recensement. */
  area: number;
  peakArea: number;
  name: string | null;
  /** Qui a déposé la spore fondatrice (null : seed ou sous-lignée). */
  visitor: string | null;
  /**
   * Histoire échantillonnée à chaque recensement, à plat : tick, surface,
   * x, y répétés (x, y = centre du territoire sur le tore, en cases).
   */
  history: number[];
}

/** Instantané lisible côté CPU (une valeur par case, ligne par ligne). */
export interface SimState {
  tick: number;
  size: number;
  vitality: Float32Array;
  nutrients: Float32Array;
  /** Identifiant de lignée (vivante ou fantôme pour les cases mortes). */
  lineage: Float32Array;
  /** Âge en ticks des cases vivantes. */
  age: Float32Array;
  radius: Float32Array;
  mu: Float32Array;
  sigma: Float32Array;
  appetite: Float32Array;
  hue: Float32Array;
  /** Pigment du sédiment, trois valeurs par case. */
  sedimentColor: Float32Array;
  /** Épaisseur du sédiment. */
  sediment: Float32Array;
}

export interface SimStats {
  tick: number;
  livingCells: number;
  /** Somme des vitalités. */
  biomass: number;
  livingLineages: number;
  totalLineages: number;
  meanNutrients: number;
  /** Épaisseur moyenne du sédiment. */
  meanSediment: number;
}
