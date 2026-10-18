// Organisme : la simulation vue de l'extérieur.
// API : step(dt), spawnSpore(x, y, mutation), getState().
// La logique du monde (calendrier, lignées, recensement, spores) vit ici ;
// le calcul des champs est délégué à un Backend (GPU ou CPU). Aucun accès au DOM.

import {
  ALIVE_THRESHOLD,
  CENSUS_INTERVAL_TICKS,
  DEFAULT_GENOME,
  DEFAULT_PARAMS,
  SAVE_VERSION,
  SECONDS_PER_TICK,
  SEDIMENT_EARTH,
  SEED_SPORE_COUNT,
  SPORE_INHERIT_SEARCH_RADIUS,
  SPORE_RADIUS_FACTOR,
  SUBLINEAGE_PATCH_RADIUS,
  TICKS_PER_DAY,
} from './config';
import type { Params } from './config';
import { AUX, GENOME, SED, STAMP_DEFAULTS, STATE, stepConstants } from './backend';
import type { Backend } from './backend';
import { regenFactor } from './calendar';
import { applyMutation, clampGenome, randomGenome, sublineageJump } from './genome';
import { Rng } from './rng';
import { decodeSave, encodeSave } from './serialize';
import type { Genome, Lineage, MutationKind, SimState, SimStats } from './types';

export interface OrganismeOptions {
  seed?: number;
  params?: Partial<Params>;
}

export class Organisme {
  readonly size: number;
  params: Params;
  tick = 0;
  readonly lineages = new Map<number, Lineage>();
  stats: SimStats;

  private rng: Rng;
  private nextLineageId = 1;
  private pendingSeconds = 0;
  private lastCensusTick = 0;

  constructor(readonly backend: Backend, opts: OrganismeOptions = {}) {
    this.size = backend.size;
    this.params = { ...DEFAULT_PARAMS, ...opts.params };
    this.rng = new Rng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.stats = this.emptyStats();
    this.reset();
  }

  // --- API publique ------------------------------------------------------

  /**
   * Avance le monde de dt secondes simulées. Les ticks sont entiers : le
   * reliquat est conservé pour l'appel suivant. Renvoie le nombre de ticks joués.
   */
  step(dt: number): number {
    this.pendingSeconds += dt;
    const ticks = Math.floor(this.pendingSeconds / SECONDS_PER_TICK + 1e-9);
    this.pendingSeconds -= ticks * SECONDS_PER_TICK;
    this.runTicks(ticks);
    return ticks;
  }

  /** Joue exactement n ticks. */
  runTicks(n: number): void {
    if (n <= 0) return;
    this.backend.configure(stepConstants(this.params));
    for (let i = 0; i < n; i++) {
      const q = this.params;
      this.backend.tick(q.regenRate * regenFactor(this.tick, q.dayAmplitude, q.seasonAmplitude), this.seed());
      this.tick++;
      if (this.tick - this.lastCensusTick >= CENSUS_INTERVAL_TICKS) this.census();
    }
  }

  /**
   * Dépose une spore en (x, y) (coordonnées de case, réelles). Elle hérite du
   * génome vivant le plus proche, puis subit la mutation choisie.
   */
  spawnSpore(x: number, y: number, mutation: MutationKind | null): Lineage {
    const near = this.nearestLiving(x, y);
    let genome = near ? near.genome : { ...DEFAULT_GENOME, hue: this.rng.next() };
    if (mutation) genome = applyMutation(genome, mutation);
    const lineage = this.registerLineage(near?.lineage ?? null, 'spore', mutation, genome);
    this.stamp(0, x, y, genome.radius * this.params.radiusScale * SPORE_RADIUS_FACTOR, lineage.id, 0, genome);
    return lineage;
  }

  /** Pose une dizaine de spores de génomes variés, au hasard. */
  seedRandom(count = SEED_SPORE_COUNT): void {
    for (let i = 0; i < count; i++) {
      const g = randomGenome(this.rng);
      const lineage = this.registerLineage(null, 'spore', null, g);
      const x = this.rng.next() * this.size;
      const y = this.rng.next() * this.size;
      this.stamp(0, x, y, g.radius * this.params.radiusScale * SPORE_RADIUS_FACTOR, lineage.id, 0, g);
    }
  }

  /** Instantané complet lu depuis le GPU. */
  getState(): SimState {
    const st = this.backend.read(STATE);
    const ge = this.backend.read(GENOME);
    const au = this.backend.read(AUX);
    const se = this.backend.read(SED);
    const n = this.size * this.size;
    const s: SimState = {
      tick: this.tick,
      size: this.size,
      vitality: new Float32Array(n),
      nutrients: new Float32Array(n),
      lineage: new Float32Array(n),
      age: new Float32Array(n),
      radius: new Float32Array(n),
      mu: new Float32Array(n),
      sigma: new Float32Array(n),
      appetite: new Float32Array(n),
      hue: new Float32Array(n),
      sedimentColor: new Float32Array(n * 3),
      sediment: new Float32Array(n),
    };
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      s.vitality[i] = st[j];
      s.nutrients[i] = st[j + 1];
      s.lineage[i] = st[j + 2];
      s.age[i] = st[j + 3];
      s.radius[i] = ge[j];
      s.mu[i] = ge[j + 1];
      s.sigma[i] = ge[j + 2];
      s.appetite[i] = ge[j + 3];
      s.hue[i] = au[j];
      s.sedimentColor[i * 3] = se[j];
      s.sedimentColor[i * 3 + 1] = se[j + 1];
      s.sedimentColor[i * 3 + 2] = se[j + 2];
      s.sediment[i] = se[j + 3];
    }
    return s;
  }

  /** Remet le monde à zéro : nutriments pleins, aucune vie, aucun sédiment. */
  reset(): void {
    const n = this.size * this.size;
    const state = new Float32Array(n * 4);
    const genome = new Float32Array(n * 4);
    const aux = new Float32Array(n * 4);
    const sed = new Float32Array(n * 4);
    const g = DEFAULT_GENOME;
    for (let i = 0; i < n; i++) {
      state[i * 4 + 1] = 1;
      genome.set([g.radius, g.mu, g.sigma, g.appetite], i * 4);
      sed.set(SEDIMENT_EARTH, i * 4);
    }
    this.backend.upload([state, genome, aux, sed]);
    this.tick = 0;
    this.pendingSeconds = 0;
    this.lastCensusTick = 0;
    this.nextLineageId = 1;
    this.lineages.clear();
    this.stats = this.emptyStats();
  }

  /** Recensement : lignées vivantes, surface, extinctions, sous-lignées. */
  census(): SimStats {
    const st = this.backend.read(STATE).slice();
    const n = this.size * this.size;
    const areas = new Map<number, number>();
    let living = 0;
    let biomass = 0;
    let nutrients = 0;
    for (let i = 0; i < n; i++) {
      const v = st[i * 4];
      const lin = st[i * 4 + 2];
      nutrients += st[i * 4 + 1];
      if (v >= ALIVE_THRESHOLD && lin > 0.5) {
        living++;
        biomass += v;
        areas.set(lin, (areas.get(lin) ?? 0) + 1);
      }
    }
    for (const l of this.lineages.values()) {
      const a = areas.get(l.id) ?? 0;
      l.area = a;
      if (a > l.peakArea) l.peakArea = a;
      if (a === 0 && l.extinctTick === null && this.tick > l.bornTick) l.extinctTick = this.tick;
      if (a > 0) l.extinctTick = null;
    }
    const elapsed = this.tick - this.lastCensusTick;
    this.lastCensusTick = this.tick;
    this.stats = {
      tick: this.tick,
      livingCells: living,
      biomass,
      livingLineages: areas.size,
      totalLineages: this.lineages.size,
      meanNutrients: nutrients / n,
    };
    const events = this.rng.poisson(this.params.sublineageRate * living * elapsed);
    for (let e = 0; e < events; e++) this.spawnSublineage(st);
    return this.stats;
  }

  get ageDays(): number {
    return this.tick / TICKS_PER_DAY;
  }

  // --- Persistance -------------------------------------------------------

  serialize(): Uint8Array {
    return encodeSave(
      {
        version: SAVE_VERSION,
        size: this.size,
        tick: this.tick,
        nextLineageId: this.nextLineageId,
        rngSeed: this.rng.seed,
        params: this.params,
        lineages: [...this.lineages.values()],
      },
      this.getState(),
    );
  }

  restore(bytes: Uint8Array): void {
    const { header, state: s } = decodeSave(bytes);
    if (header.size !== this.size) throw new Error('Taille de grille différente : ' + header.size);
    const n = this.size * this.size;
    const state = new Float32Array(n * 4);
    const genome = new Float32Array(n * 4);
    const aux = new Float32Array(n * 4);
    const sed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      const alive = s.vitality[i] >= ALIVE_THRESHOLD && s.lineage[i] > 0.5;
      state.set([s.vitality[i], s.nutrients[i], s.lineage[i], s.age[i]], j);
      genome.set([s.radius[i], s.mu[i], s.sigma[i], s.appetite[i]], j);
      aux.set([s.hue[i], alive ? s.vitality[i] : 0, 0, 0], j);
      sed.set([s.sedimentColor[i * 3], s.sedimentColor[i * 3 + 1], s.sedimentColor[i * 3 + 2], s.sediment[i]], j);
    }
    this.backend.upload([state, genome, aux, sed]);
    this.tick = header.tick;
    this.lastCensusTick = header.tick;
    this.pendingSeconds = 0;
    this.nextLineageId = header.nextLineageId;
    this.rng.seed = header.rngSeed;
    this.params = { ...DEFAULT_PARAMS, ...header.params };
    this.lineages.clear();
    for (const l of header.lineages) this.lineages.set(l.id, l);
    this.census();
  }

  dispose(): void {
    this.backend.dispose();
  }

  // --- Interne -----------------------------------------------------------

  private emptyStats(): SimStats {
    return { tick: 0, livingCells: 0, biomass: 0, livingLineages: 0, totalLineages: 0, meanNutrients: 1 };
  }

  private seed(): number {
    return (this.rng.next() * 4294967296) >>> 0;
  }

  private stamp(mode: 0 | 1, x: number, y: number, radius: number, lineage: number, from: number, g: Genome): void {
    this.backend.stamp({
      mode, seed: this.seed(), x, y, radius, lineage, fromLineage: from,
      gene: [g.radius, g.mu, g.sigma, g.appetite], hue: g.hue,
      ...STAMP_DEFAULTS,
    });
  }

  private registerLineage(parentId: number | null, origin: Lineage['origin'], mutation: MutationKind | null, g: Genome): Lineage {
    const l: Lineage = {
      id: this.nextLineageId++,
      parentId,
      origin,
      mutation,
      founder: clampGenome(g),
      bornTick: this.tick,
      extinctTick: null,
      area: 0,
      peakArea: 0,
      name: null,
    };
    this.lineages.set(l.id, l);
    return l;
  }

  /** Génome de la case vivante la plus proche de (x, y), sur le tore. */
  private nearestLiving(x: number, y: number): { lineage: number; genome: Genome } | null {
    const st = this.backend.read(STATE);
    const n = this.size;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let best = -1;
    let bestD = Infinity;
    const R = Math.min(SPORE_INHERIT_SEARCH_RADIUS, n >> 1);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= bestD) continue;
        const i = (((cy + dy) % n + n) % n) * n + (((cx + dx) % n + n) % n);
        if (st[i * 4] >= ALIVE_THRESHOLD && st[i * 4 + 2] > 0.5) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best < 0) return null;
    return { lineage: st[best * 4 + 2], genome: this.genomeAt(best) };
  }

  private genomeAt(i: number): Genome {
    const ge = this.backend.read(GENOME);
    const au = this.backend.read(AUX);
    return { radius: ge[i * 4], mu: ge[i * 4 + 1], sigma: ge[i * 4 + 2], appetite: ge[i * 4 + 3], hue: au[i * 4] };
  }

  /** Une case vivante au hasard fonde une sous-lignée dans un petit patch. */
  private spawnSublineage(st: Float32Array): void {
    const n = this.size * this.size;
    for (let tries = 0; tries < 64; tries++) {
      const i = Math.floor(this.rng.next() * n);
      if (st[i * 4] < ALIVE_THRESHOLD || st[i * 4 + 2] < 0.5) continue;
      const parent = st[i * 4 + 2];
      const g = sublineageJump(this.genomeAt(i), this.rng, this.params.mutationRate);
      const l = this.registerLineage(parent, 'sous-lignee', null, g);
      this.stamp(1, (i % this.size) + 0.5, Math.floor(i / this.size) + 0.5, SUBLINEAGE_PATCH_RADIUS, l.id, parent, g);
      return;
    }
  }
}
