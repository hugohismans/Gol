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

export type LineageOrigin = 'spore' | 'sous-lignee';

export interface Lineage {
  id: number;
  parentId: number | null;
  origin: LineageOrigin;
  mutation: MutationKind | null;
  /** Génome fondateur (au moment de la naissance de la lignée). */
  founder: Genome;
  bornTick: number;
  /** Tick où la dernière case vivante a disparu, null si vivante. */
  extinctTick: number | null;
  /** Nombre de cases vivantes au dernier recensement. */
  area: number;
  peakArea: number;
  name: string | null;
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
