// Toutes les constantes de la simulation. Rien de magique ailleurs.
// Unités : un "tick" est un pas d'intégration. La croissance Lenia est
// exprimée en unités de temps Lenia (multipliée par LENIA_DT à chaque tick),
// les nutriments et le sédiment sont exprimés par tick.

import type { DnaGene, Genome, MutationKind } from './types';

// --- Monde ---------------------------------------------------------------

/** Côté de la grille torique. */
export const GRID_SIZE = 256;

/** Pas d'intégration Lenia (1 / T). */
export const LENIA_DT = 0.1;

/** Seuil de vitalité au dessus duquel une case est considérée vivante. */
export const ALIVE_THRESHOLD = 0.03;

// --- Temps ---------------------------------------------------------------

/** Ticks par seconde réelle à la vitesse x1. */
export const TICKS_PER_SECOND_X1 = 60;

/** Nombre de ticks dans un jour simulé. */
export const TICKS_PER_DAY = 2400;

/** Secondes simulées par tick (dérivé). */
export const SECONDS_PER_TICK = 86400 / TICKS_PER_DAY;

export const DAYS_PER_YEAR = 365;

/** Jour de l'année (0 = 1er janvier) où commence le monde. 78 = 20 mars. */
export const START_DAY_OF_YEAR = 78;

/** Heure de la journée où commence le monde. */
export const START_HOUR = 6;

/** Jour de l'année où la régénération saisonnière est maximale (solstice d'été). */
export const SEASON_PEAK_DAY = 172;

/** Heure de la journée où la régénération journalière est maximale. */
export const DAY_PEAK_HOUR = 13;

/** Multiplicateurs de vitesse proposés (0 = pause). */
export const SPEEDS = [0, 1, 10, 100, 1000] as const;

// --- Kernel --------------------------------------------------------------

/** Nombre d'anneaux d'échantillonnage du kernel. */
export const KERNEL_RINGS = 3;

/** Taps par unité de circonférence (à rayon unité). Coût GPU proportionnel. */
export const KERNEL_TAP_DENSITY = 4;

/** Nombre minimal de taps par anneau. */
export const KERNEL_MIN_TAPS_PER_RING = 6;

/** Écart visé (en cases) entre deux taps avant de flouter par mipmap. */
export const KERNEL_LOD_GAP = 1.2;

// --- Génome --------------------------------------------------------------

export const GENOME_BOUNDS: Record<keyof Genome, [number, number]> = {
  radius: [5, 20],
  mu: [0.08, 0.4],
  sigma: [0.008, 0.09],
  appetite: [0.1, 1.2],
  hue: [0, 1],
};

/** Génome utilisé quand une spore tombe dans un monde vide. */
export const DEFAULT_GENOME: Genome = {
  radius: 10,
  mu: 0.15,
  sigma: 0.03,
  appetite: 0.5,
  hue: 0.08,
};

/** Dispersion des génomes du bouton "seed aléatoire" (écart type absolu). */
export const SEED_GENOME_SPREAD: Omit<Genome, 'hue'> = {
  radius: 2.5,
  mu: 0.015,
  sigma: 0.006,
  appetite: 0.2,
};

/** Nombre de spores posées par "seed aléatoire". */
export const SEED_SPORE_COUNT = 10;

/** Effet multiplicatif (ou additif pour la teinte) de chaque mutation de visiteur. */
export const MUTATION_EFFECTS: Record<MutationKind, Partial<Genome>> = {
  gourmande: { appetite: 1.3 },
  sobre: { appetite: 0.75 },
  expansive: { radius: 1.12, mu: 0.96, sigma: 1.08 },
  compacte: { radius: 0.88, mu: 1.04, sigma: 0.93 },
  teinte: { hue: 0.09 },
};

/** Niveau maximal d'un gène d'ADN, dans un sens ou dans l'autre. */
export const DNA_MAX_LEVEL = 3;

/**
 * Effet d'un niveau d'ADN : facteur multiplicatif par niveau sur le gène du
 * génome. Le sens + est celui de la vigueur (plus gourmande, plus étendue,
 * plus tolérante, plus audacieuse : pousse là où le voisinage est plus maigre).
 */
export const DNA_EFFECTS: Record<DnaGene, { gene: keyof Genome; factor: number }> = {
  appetit: { gene: 'appetite', factor: 1.08 },
  envergure: { gene: 'radius', factor: 1.05 },
  tolerance: { gene: 'sigma', factor: 1.05 },
  audace: { gene: 'mu', factor: 0.97 },
};

/** Décalage de teinte maximal choisi par le visiteur (en tour de cercle). */
export const DNA_HUE_RANGE = 0.15;

/** Écart type relatif de la mutation gaussienne à chaque naissance (avant taux global). */
export const BIRTH_MUTATION_SIGMA = {
  radius: 0.004,
  mu: 0.002,
  sigma: 0.003,
  appetite: 0.004,
  /** Écart type absolu sur la teinte. */
  hue: 0.0015,
};

/** Amplitude de la mutation lors de la naissance d'une sous-lignée (multiplie BIRTH_MUTATION_SIGMA). */
export const SUBLINEAGE_JUMP = 12;

/** Rayon (en cases) du patch converti lors de la naissance d'une sous-lignée. */
export const SUBLINEAGE_PATCH_RADIUS = 5;

// --- Spore ---------------------------------------------------------------

/** Rayon de la spore relatif au rayon du kernel du génome. */
export const SPORE_RADIUS_FACTOR = 1.0;

/** Vitalité maximale du bruit initial de la spore. */
export const SPORE_DENSITY = 0.9;

/** Nutriments ajoutés sous la spore (une réserve d'amorçage). */
export const SPORE_NUTRIENT_BOOST = 0.3;

/** Rayon (en cases) dans lequel on cherche le génome vivant le plus proche. */
export const SPORE_INHERIT_SEARCH_RADIUS = 96;

// --- Lignée fantôme (héritage à la naissance) ----------------------------

/** Atténuation par case de l'influence d'une lignée sur les cases mortes voisines. */
export const GHOST_DECAY = 0.85;

/** Influence minimale pour qu'une case morte porte encore une lignée fantôme. */
export const GHOST_MIN_INFLUENCE = 0.03;

// --- Fertilité du sol ---------------------------------------------------

/** Taille (en cases) des grandes zones fertiles ou arides. */
export const FERTILITY_SCALE = 64;

/** Jours simulés pour que la carte de fertilité se renouvelle (dérive du climat). */
export const FERTILITY_DRIFT_DAYS = 24;

/** Pas (en ticks) de mise à jour de la carte de fertilité. */
export const FERTILITY_UPDATE_TICKS = 60;

// --- Couleur ---------------------------------------------------------------

/** Luminosité OKLCH des teintes de lignée. */
export const HUE_LIGHTNESS = 0.7;

/** Chroma OKLCH des teintes de lignée (bas = sobre). */
export const HUE_CHROMA = 0.085;

// --- Sédiment ------------------------------------------------------------

/** Couleur vers laquelle le sédiment s'assombrit (terre). */
export const SEDIMENT_EARTH: [number, number, number] = [0.07, 0.055, 0.045];

/** Épaisseur au delà de laquelle un nouveau dépôt ne colore presque plus le sédiment. */
export const SEDIMENT_COLOR_MEMORY = 4;

// --- Paramètres réglables en direct --------------------------------------

export interface Params {
  /** Multiplie le rayon du kernel de tous les génomes. */
  radiusScale: number;
  /** Décale le centre de croissance (mu) de tous les génomes. */
  muOffset: number;
  /** Multiplie la largeur de croissance (sigma) de tous les génomes. */
  sigmaScale: number;
  /** Multiplie l'appétit de tous les génomes. */
  appetiteScale: number;
  /** Bonus de croissance par unité d'appétit au dessus de 0.5. */
  appetiteGrowth: number;
  /** Régénération locale des nutriments par tick, vers 1. */
  regenRate: number;
  /** Niveau de nutriments d'un monde neuf (appliqué au reset). */
  initialNutrients: number;
  /** Contraste de fertilité du sol : 0 = régénération uniforme, 1 = zones arides sans régénération. */
  fertilityContrast: number;
  /** Coefficient de diffusion des nutriments par tick (stable sous 0.25). */
  diffusion: number;
  /** Consommation par tick à vitalité 1 et appétit 1. */
  consumption: number;
  /** Demi saturation : nutriments pour lesquels la croissance est à moitié. */
  nutrientHalf: number;
  /** Part de la largeur de croissance qui dépend des nutriments (0 : aucune). */
  nutrientWidth: number;
  /** Demi saturation de la consommation : on ne mange pas ce qui n'est plus là. */
  uptakeHalf: number;
  /** Déclin (unités Lenia) quand les nutriments sont épuisés. */
  starvation: number;
  /** Sous ce niveau de nutriments, la famine commence. */
  starveBelow: number;
  /** Déclin (unités Lenia) d'une case très vieille. */
  senescence: number;
  /** Âge (en jours) où la sénescence commence. */
  senescenceStartDays: number;
  /** Âge (en jours) où la sénescence est complète. */
  senescenceFullDays: number;
  /** Amplitude du cycle jour/nuit sur la régénération (0 à 1). */
  dayAmplitude: number;
  /** Amplitude du cycle saisonnier sur la régénération (0 à 1). */
  seasonAmplitude: number;
  /** Multiplie toutes les mutations à la naissance. */
  mutationRate: number;
  /** Probabilité par case vivante et par tick qu'une sous-lignée apparaisse. */
  sublineageRate: number;
  /** Fraction de la vitalité perdue qui se dépose en sédiment. */
  sedimentRate: number;
  /** Vitesse d'assombrissement du sédiment par tick. */
  sedimentDarkening: number;
}

export const DEFAULT_PARAMS: Params = {
  radiusScale: 1,
  muOffset: 0,
  sigmaScale: 1,
  appetiteScale: 1,
  appetiteGrowth: 0.4,
  regenRate: 0.0008,
  initialNutrients: 0.3,
  fertilityContrast: 1,
  diffusion: 0.04,
  consumption: 0.012,
  nutrientHalf: 0.4,
  uptakeHalf: 0.2,
  nutrientWidth: 0,
  starvation: 0.3,
  starveBelow: 0.3,
  senescence: 0.15,
  senescenceStartDays: 1,
  senescenceFullDays: 4,
  dayAmplitude: 0.25,
  seasonAmplitude: 0.35,
  mutationRate: 1,
  sublineageRate: 2e-8,
  sedimentRate: 0.02,
  sedimentDarkening: 1e-6,
};

/** Plages des sliders du panneau de debug. */
export const PARAM_RANGES: Record<keyof Params, { min: number; max: number; step: number; label: string }> = {
  radiusScale: { min: 0.5, max: 1.8, step: 0.01, label: 'Rayon du kernel (x)' },
  muOffset: { min: -0.06, max: 0.06, step: 0.001, label: 'Seuil de croissance mu (+)' },
  sigmaScale: { min: 0.4, max: 2, step: 0.01, label: 'Largeur de croissance sigma (x)' },
  appetiteScale: { min: 0.2, max: 2.5, step: 0.01, label: 'Appétit (x)' },
  appetiteGrowth: { min: 0, max: 2, step: 0.01, label: 'Bonus de croissance par appétit' },
  regenRate: { min: 0, max: 0.006, step: 0.00005, label: 'Régénération des nutriments' },
  fertilityContrast: { min: 0, max: 1, step: 0.01, label: 'Contraste de fertilité du sol' },
  initialNutrients: { min: 0, max: 1, step: 0.01, label: 'Nutriments initiaux (au reset)' },
  diffusion: { min: 0, max: 0.24, step: 0.005, label: 'Diffusion des nutriments' },
  consumption: { min: 0, max: 0.05, step: 0.0005, label: 'Consommation' },
  nutrientHalf: { min: 0.01, max: 1, step: 0.01, label: 'Demi saturation nutriments' },
  nutrientWidth: { min: 0, max: 1, step: 0.01, label: 'Largeur liée aux nutriments' },
  uptakeHalf: { min: 0, max: 1, step: 0.01, label: 'Demi saturation consommation' },
  starvation: { min: 0, max: 1.5, step: 0.01, label: 'Famine' },
  starveBelow: { min: 0, max: 0.5, step: 0.01, label: 'Seuil de famine' },
  senescence: { min: 0, max: 1, step: 0.01, label: 'Sénescence' },
  senescenceStartDays: { min: 0.05, max: 10, step: 0.05, label: 'Début de sénescence (jours)' },
  senescenceFullDays: { min: 0.1, max: 30, step: 0.1, label: 'Sénescence complète (jours)' },
  dayAmplitude: { min: 0, max: 1, step: 0.01, label: 'Amplitude jour/nuit' },
  seasonAmplitude: { min: 0, max: 1, step: 0.01, label: 'Amplitude saisonnière' },
  mutationRate: { min: 0, max: 10, step: 0.1, label: 'Taux de mutation (x)' },
  sublineageRate: { min: 0, max: 2e-8, step: 1e-10, label: 'Probabilité de sous-lignée' },
  sedimentRate: { min: 0, max: 0.2, step: 0.001, label: 'Vitesse de sédimentation' },
  sedimentDarkening: { min: 0, max: 2e-5, step: 1e-7, label: 'Assombrissement du sédiment' },
};

// --- Histoire -------------------------------------------------------------

/** Points d'histoire conservés par lignée ; au delà, les plus anciens sont éclaircis. */
export const HISTORY_MAX_POINTS = 480;

/** Intervalle en ticks entre deux instantanés du monde (pour revenir en arrière). */
export const SNAPSHOT_INTERVAL_TICKS = 600;

/** Jours récents où tous les instantanés sont gardés ; plus ancien : un par jour. */
export const SNAPSHOT_RECENT_DAYS = 7;

// --- Récit -------------------------------------------------------------------

/** Jours de registre conservés par lignée. */
export const LEDGER_DAYS = 90;

/** Événements du journal conservés. */
export const JOURNAL_SIZE = 400;

/** Cases prises en un jour à partir desquelles une conquête est racontée. */
export const CONQUEST_EVENT_CELLS = 120;

/** Part des cases vivantes mortes de faim en un jour à partir de laquelle on parle de famine. */
export const FAMINE_EVENT_FRACTION = 0.25;

/** Âges (en jours) d'une famille qui méritent d'être signalés. */
export const AGE_MILESTONES_DAYS = [1, 3, 7, 14, 30, 60, 100, 365];

// --- Persistance ---------------------------------------------------------

/** Version du format de sauvegarde. */
export const SAVE_VERSION = 1;

// --- Recensement ---------------------------------------------------------

/** Intervalle en ticks entre deux recensements (lecture GPU, lignées, sous-lignées). */
export const CENSUS_INTERVAL_TICKS = 240;
