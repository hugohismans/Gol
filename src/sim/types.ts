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

/**
 * Style d'un visiteur simulé (prototype) : fidèle à sa propre famille,
 * suiveur de la famille doyenne, voisin de la famille du joueur, explorateur
 * des sols vides, gourmand, prudent.
 */
export type VisitorStyle = 'fidele' | 'suiveur' | 'voisine' | 'exploratrice' | 'gourmand' | 'prudente';

/** Pourquoi une case vivante meurt : faim, grand âge, ou repli (la dynamique elle même). */
export type DeathCause = 'faim' | 'vieillesse' | 'repli';

/** Ce qui est arrivé à une lignée pendant un jour simulé. */
export interface LedgerDay {
  day: number;
  /** Cases conquises sur un sol libre. */
  gained: number;
  /** Cases mortes, par cause. */
  faim: number;
  vieillesse: number;
  repli: number;
  /** Cases prises à d'autres lignées (id : nombre), et cédées à d'autres. */
  wonFrom: Record<number, number>;
  lostTo: Record<number, number>;
}

export type WorldEventKind = 'depot' | 'sous-lignee' | 'extinction' | 'conquete' | 'famine' | 'anciennete';

/** Ce qui mérite d'être raconté. Données brutes : le texte est composé par l'interface. */
export interface WorldEvent {
  tick: number;
  kind: WorldEventKind;
  lineage: number;
  /** Lignée en face (conquête), ou parente (dépôt, sous-lignée). */
  other: number | null;
  visitor: string | null;
  /** Nombre de cases, ou de jours pour l'ancienneté. */
  n: number;
  /** Cause d'une extinction. */
  cause: DeathCause | 'conquete' | null;
  x: number;
  y: number;
}

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
  /** Ce qui lui est arrivé, jour par jour (les derniers jours seulement). */
  ledger: LedgerDay[];
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
