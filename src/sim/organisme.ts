// Organisme : la simulation vue de l'extérieur.
// API : step(dt), spawnSpore(x, y, mutation), getState().
// La logique du monde (calendrier, lignées, recensement, spores) vit ici ;
// le calcul des champs est délégué à un Backend (GPU ou CPU). Aucun accès au DOM.

import {
  AGE_MILESTONES_DAYS,
  ALIVE_THRESHOLD,
  CENSUS_INTERVAL_TICKS,
  CONQUEST_EVENT_CELLS,
  FAMINE_EVENT_FACTOR,
  FAMINE_REFERENCE_DAYS,
  JOURNAL_SIZE,
  LEDGER_DAYS,
  HISTORY_MAX_POINTS,
  SNAPSHOT_INTERVAL_TICKS,
  DEFAULT_GENOME,
  DEFAULT_PARAMS,
  FERTILITY_DRIFT_DAYS,
  FERTILITY_UPDATE_TICKS,
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
import { applyDna, applyMutation, clampGenome, randomGenome, sublineageJump } from './genome';
import { Rng } from './rng';
import { decodeSave, encodeSave } from './serialize';
import { encodeFrame } from './frame';
import type { DeathCause, Dna, Genome, LedgerDay, Lineage, MutationKind, SimState, SimStats, WorldEvent } from './types';

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

  /** Appelé avec un instantané compact tous les SNAPSHOT_INTERVAL_TICKS. */
  onSnapshot: ((tick: number, frame: Uint8Array) => void) | null = null;
  /** Appelé avant chaque tick (pour programmer des visites, par exemple). */
  onTick: ((tick: number) => void) | null = null;
  /** Appelé à chaque événement du journal. */
  onEvent: ((e: WorldEvent) => void) | null = null;
  /** Journal des événements marquants, du plus ancien au plus récent. */
  events: WorldEvent[] = [];

  /** Lignée et âge des cases vivantes au recensement précédent (0 : morte). */
  private prevLin: Float32Array | null = null;
  private prevAge: Float32Array | null = null;
  /** Dernier jour simulé entièrement raconté. */
  private closedDay = 0;
  /** Morts de faim par case vivante, des derniers jours (pour reconnaître une famine). */
  private hunger: number[] = [];

  private rng: Rng;
  private nextLineageId = 1;
  private cosT: Float64Array;
  private sinT: Float64Array;
  private pendingSeconds = 0;
  private lastCensusTick = 0;

  constructor(readonly backend: Backend, opts: OrganismeOptions = {}) {
    this.size = backend.size;
    this.cosT = new Float64Array(this.size);
    this.sinT = new Float64Array(this.size);
    for (let i = 0; i < this.size; i++) {
      this.cosT[i] = Math.cos((2 * Math.PI * (i + 0.5)) / this.size);
      this.sinT[i] = Math.sin((2 * Math.PI * (i + 0.5)) / this.size);
    }
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
      this.onTick?.(this.tick);
      this.backend.tick(
        q.regenRate * regenFactor(this.tick, q.dayAmplitude, q.seasonAmplitude),
        this.seed(),
        (Math.floor(this.tick / FERTILITY_UPDATE_TICKS) * FERTILITY_UPDATE_TICKS) / (FERTILITY_DRIFT_DAYS * TICKS_PER_DAY),
      );
      this.tick++;
      if (this.tick - this.lastCensusTick >= CENSUS_INTERVAL_TICKS) this.census();
      if (this.onSnapshot && this.tick % SNAPSHOT_INTERVAL_TICKS === 0) this.onSnapshot(this.tick, this.snapshot());
    }
  }

  /**
   * Dépose une spore en (x, y) (coordonnées de case, réelles). Elle hérite du
   * génome vivant le plus proche, puis subit la mutation choisie.
   */
  spawnSpore(x: number, y: number, mutation: MutationKind | Dna | null, visitor: string | null = null): Lineage {
    const base = this.inheritedGenome(x, y);
    const dna = mutation && typeof mutation === 'object' ? mutation : null;
    const kind = typeof mutation === 'string' ? mutation : null;
    let genome = base.genome;
    if (kind) genome = applyMutation(genome, kind);
    if (dna) genome = applyDna(genome, dna);
    return this.plant(x, y, genome, { parentId: base.lineage, visitor, mutation: kind, dna });
  }

  /**
   * Génome dont hériterait une spore déposée en (x, y) : celui de la case
   * vivante la plus proche, ou le génome par défaut dans un monde vide.
   */
  inheritedGenome(x: number, y: number): { lineage: number | null; genome: Genome } {
    const near = this.nearestLiving(x, y);
    return near ?? { lineage: null, genome: { ...DEFAULT_GENOME, hue: this.rng.next() } };
  }

  /** Dépose une spore d'un génome donné (déjà hérité et muté). */
  plant(
    x: number,
    y: number,
    genome: Genome,
    o: { parentId?: number | null; visitor?: string | null; mutation?: MutationKind | null; dna?: Dna | null; name?: string | null } = {},
  ): Lineage {
    const lineage = this.registerLineage(o.parentId ?? null, 'spore', o.mutation ?? null, genome);
    lineage.visitor = o.visitor ?? null;
    lineage.dna = o.dna ?? null;
    lineage.name = o.name?.trim() || null;
    lineage.history.push(this.tick, 0, x, y);
    this.stamp(0, x, y, genome.radius * this.params.radiusScale * SPORE_RADIUS_FACTOR, lineage.id, 0, genome);
    if (lineage.visitor) this.emit({ kind: 'depot', lineage: lineage.id, other: lineage.parentId, visitor: lineage.visitor, n: 0, cause: null, x, y });
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

  /** Instantané complet lu depuis le moteur de calcul. */
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

  /** Remet le monde à zéro : nutriments initiaux, aucune vie, aucun sédiment. */
  reset(): void {
    const n = this.size * this.size;
    const state = new Float32Array(n * 4);
    const genome = new Float32Array(n * 4);
    const aux = new Float32Array(n * 4);
    const sed = new Float32Array(n * 4);
    const g = DEFAULT_GENOME;
    for (let i = 0; i < n; i++) {
      state[i * 4 + 1] = this.params.initialNutrients;
      genome.set([g.radius, g.mu, g.sigma, g.appetite], i * 4);
      sed.set(SEDIMENT_EARTH, i * 4);
    }
    this.backend.upload([state, genome, aux, sed]);
    this.tick = 0;
    this.pendingSeconds = 0;
    this.lastCensusTick = 0;
    this.nextLineageId = 1;
    this.lineages.clear();
    this.events = [];
    this.prevLin = null;
    this.prevAge = null;
    this.closedDay = 0;
    this.hunger = [];
    this.stats = this.emptyStats();
  }

  /** Recensement : lignées vivantes, surface, extinctions, sous-lignées. */
  census(): SimStats {
    const st = this.backend.read(STATE).slice();
    const n = this.size * this.size;
    // Par lignée : surface et somme des angles, pour un centre sur le tore.
    const areas = new Map<number, Float64Array>();
    let living = 0;
    let biomass = 0;
    let nutrients = 0;
    const size = this.size;
    for (let i = 0; i < n; i++) {
      const v = st[i * 4];
      const lin = st[i * 4 + 2];
      nutrients += st[i * 4 + 1];
      if (v >= ALIVE_THRESHOLD && lin > 0.5) {
        living++;
        biomass += v;
        let acc = areas.get(lin);
        if (!acc) areas.set(lin, (acc = new Float64Array(5)));
        const x = i % size;
        const y = (i - x) / size;
        acc[0]++;
        acc[1] += this.cosT[x];
        acc[2] += this.sinT[x];
        acc[3] += this.cosT[y];
        acc[4] += this.sinT[y];
      }
    }
    for (const l of this.lineages.values()) {
      const acc = areas.get(l.id);
      const a = acc ? acc[0] : 0;
      const wasAlive = l.area > 0 || l.extinctTick === null;
      l.area = a;
      if (a > l.peakArea) l.peakArea = a;
      if (a === 0 && l.extinctTick === null && this.tick > l.bornTick) {
        l.extinctTick = this.tick;
        if (wasAlive) this.reportExtinction(l);
      }
      if (a > 0) l.extinctTick = null;
      if (acc) this.record(l, a, this.angleToCell(acc[1], acc[2]), this.angleToCell(acc[3], acc[4]));
      else if (wasAlive && l.history.length) this.record(l, 0, l.history.at(-2)!, l.history.at(-1)!);
    }
    this.recordTransitions(st);
    const elapsed = this.tick - this.lastCensusTick;
    this.lastCensusTick = this.tick;
    this.stats = {
      tick: this.tick,
      livingCells: living,
      biomass,
      livingLineages: areas.size,
      totalLineages: this.lineages.size,
      meanNutrients: nutrients / n,
      meanSediment: this.meanSediment(),
    };
    const events = this.rng.poisson(this.params.sublineageRate * living * elapsed);
    for (let e = 0; e < events; e++) this.spawnSublineage(st);
    const day = Math.floor(this.tick / TICKS_PER_DAY);
    while (this.closedDay < day) this.closeDay(this.closedDay++, living);
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
        events: this.events,
        closedDay: this.closedDay,
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
    // Les sauvegardes antérieures à l'histoire n'ont ni visiteur ni histoire.
    for (const l of header.lineages) {
      this.lineages.set(l.id, { ...l, visitor: l.visitor ?? null, dna: l.dna ?? null, history: l.history ?? [], ledger: l.ledger ?? [] });
    }
    this.events = header.events ?? [];
    this.closedDay = header.closedDay ?? Math.floor(header.tick / TICKS_PER_DAY);
    this.prevLin = null;
    this.prevAge = null;
    this.census();
  }

  dispose(): void {
    this.backend.dispose();
  }

  // --- Interne -----------------------------------------------------------

  private emptyStats(): SimStats {
    return { tick: 0, livingCells: 0, biomass: 0, livingLineages: 0, totalLineages: 0, meanNutrients: 1, meanSediment: 0 };
  }

  // --- Récit ---------------------------------------------------------------

  private emit(e: Omit<WorldEvent, 'tick'>): void {
    const ev: WorldEvent = { tick: this.tick, ...e };
    this.events.push(ev);
    if (this.events.length > JOURNAL_SIZE) this.events.splice(0, this.events.length - JOURNAL_SIZE);
    this.onEvent?.(ev);
  }

  /** Entrée du registre d'une lignée pour un jour donné (créée au besoin). */
  private ledgerEntry(l: Lineage, day: number): LedgerDay {
    const last = l.ledger.at(-1);
    if (last && last.day === day) return last;
    const e: LedgerDay = { day, gained: 0, faim: 0, vieillesse: 0, repli: 0, wonFrom: {}, lostTo: {} };
    l.ledger.push(e);
    if (l.ledger.length > LEDGER_DAYS) l.ledger.splice(0, l.ledger.length - LEDGER_DAYS);
    return e;
  }

  /**
   * Compare chaque case à son état au recensement précédent : conquêtes sur
   * sol libre, cases prises à d'autres lignées, morts classées par cause.
   */
  private recordTransitions(st: Float32Array): void {
    const n = this.size * this.size;
    const lin = new Float32Array(n);
    const age = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (st[i * 4] >= ALIVE_THRESHOLD && st[i * 4 + 2] > 0.5) {
        lin[i] = st[i * 4 + 2];
        age[i] = st[i * 4 + 3];
      }
    }
    const prev = this.prevLin;
    const prevAge = this.prevAge;
    this.prevLin = lin;
    this.prevAge = age;
    if (!prev || !prevAge || this.tick === this.lastCensusTick) return;
    const day = Math.floor((this.tick - 1) / TICKS_PER_DAY);
    const oldAge = this.params.senescenceStartDays * TICKS_PER_DAY;
    const entries = new Map<number, LedgerDay>();
    const entry = (id: number) => {
      let e = entries.get(id);
      if (!e) {
        const l = this.lineages.get(id);
        if (!l) return null;
        entries.set(id, (e = this.ledgerEntry(l, day)));
      }
      return e;
    };
    for (let i = 0; i < n; i++) {
      const a = prev[i];
      const b = lin[i];
      if (a === b) continue;
      if (a > 0 && b === 0) {
        const cause: DeathCause = st[i * 4 + 1] < this.params.starveBelow ? 'faim' : prevAge[i] >= oldAge ? 'vieillesse' : 'repli';
        const e = entry(a);
        if (e) e[cause]++;
      } else if (a === 0) {
        const e = entry(b);
        if (e) e.gained++;
      } else {
        // Une sous-lignée qui vient de naître dans sa parente n'est pas une conquête.
        const lb = this.lineages.get(b);
        if (lb && lb.parentId === a && lb.origin === 'sous-lignee' && lb.bornTick >= this.lastCensusTick) continue;
        const ea = entry(a);
        const eb = entry(b);
        if (ea) ea.lostTo[b] = (ea.lostTo[b] ?? 0) + 1;
        if (eb) eb.wonFrom[a] = (eb.wonFrom[a] ?? 0) + 1;
      }
    }
  }

  /** Raconte une extinction, avec sa cause principale sur les deux derniers jours. */
  private reportExtinction(l: Lineage): void {
    const recent = l.ledger.slice(-2);
    const sum = (f: (d: LedgerDay) => number) => recent.reduce((s, d) => s + f(d), 0);
    const lost = new Map<number, number>();
    for (const d of recent) for (const [k, v] of Object.entries(d.lostTo)) lost.set(Number(k), (lost.get(Number(k)) ?? 0) + v);
    const top = [...lost.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const causes: [DeathCause | 'conquete', number][] = [
      ['faim', sum((d) => d.faim)],
      ['vieillesse', sum((d) => d.vieillesse)],
      ['repli', sum((d) => d.repli)],
      ['conquete', [...lost.values()].reduce((a, b) => a + b, 0)],
    ];
    const cause = causes.sort((a, b) => b[1] - a[1])[0];
    const x = l.history.at(-2) ?? 0;
    const y = l.history.at(-1) ?? 0;
    this.emit({
      kind: 'extinction', lineage: l.id, other: cause[0] === 'conquete' && top ? top[0] : null, visitor: l.visitor,
      n: Math.round((this.tick - l.bornTick) / TICKS_PER_DAY), cause: cause[1] > 0 ? cause[0] : null, x, y,
    });
  }

  /** Fin d'un jour simulé : grandes conquêtes, famine, anciennetés de familles. */
  private closeDay(day: number, living: number): void {
    let starved = 0;
    for (const l of this.lineages.values()) {
      const e = l.ledger.find((d) => d.day === day);
      if (!e) continue;
      starved += e.faim;
      for (const [k, v] of Object.entries(e.wonFrom)) {
        if (v < CONQUEST_EVENT_CELLS) continue;
        this.emit({ kind: 'conquete', lineage: l.id, other: Number(k), visitor: l.visitor, n: v, cause: null, x: l.history.at(-2) ?? 0, y: l.history.at(-1) ?? 0 });
      }
    }
    const ratio = starved / Math.max(living, 1);
    const ref = this.hunger.length ? this.hunger.reduce((a, b) => a + b, 0) / this.hunger.length : 0;
    if (this.hunger.length >= 3 && ratio > FAMINE_EVENT_FACTOR * ref) {
      this.emit({ kind: 'famine', lineage: 0, other: null, visitor: null, n: Math.round(ratio / Math.max(ref, 1e-6) * 10) / 10, cause: 'faim', x: 0, y: 0 });
    }
    this.hunger.push(ratio);
    if (this.hunger.length > FAMINE_REFERENCE_DAYS) this.hunger.shift();
    const end = (day + 1) * TICKS_PER_DAY;
    for (const l of this.lineages.values()) {
      if (l.origin !== 'spore' || !l.visitor) continue;
      const before = (end - TICKS_PER_DAY - l.bornTick) / TICKS_PER_DAY;
      const after = (end - l.bornTick) / TICKS_PER_DAY;
      const m = AGE_MILESTONES_DAYS.find((d) => before < d && d <= after);
      if (m === undefined) continue;
      const family = this.descendants(l.id).map((id) => this.lineages.get(id)!);
      if (!family.some((f) => f.area > 0)) continue;
      this.emit({ kind: 'anciennete', lineage: l.id, other: null, visitor: l.visitor, n: m, cause: null, x: l.history.at(-2) ?? 0, y: l.history.at(-1) ?? 0 });
    }
  }

  /** Ajoute un point d'histoire (au plus un par tick) et éclaircit les plus anciens. */
  private record(l: Lineage, area: number, x: number, y: number): void {
    const h = l.history;
    if (h.length && h.at(-4)! >= this.tick) {
      h.splice(h.length - 4, 4);
    }
    h.push(this.tick, area, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    if (h.length / 4 > HISTORY_MAX_POINTS) {
      // Garde un point sur deux dans la moitié la plus ancienne.
      const half = Math.floor(h.length / 8) * 4;
      const kept: number[] = [];
      for (let i = 0; i < half; i += 8) kept.push(h[i], h[i + 1], h[i + 2], h[i + 3]);
      l.history = kept.concat(h.slice(half));
    }
  }

  private angleToCell(c: number, s: number): number {
    const a = Math.atan2(s, c);
    return ((((a / (2 * Math.PI)) * this.size - 0.5) % this.size) + this.size) % this.size;
  }

  /** Lignée et toutes ses descendantes (sous-lignées et spores qui en héritent). */
  descendants(id: number): number[] {
    const out = [id];
    for (let i = 0; i < out.length; i++) {
      for (const l of this.lineages.values()) if (l.parentId === out[i] && !out.includes(l.id)) out.push(l.id);
    }
    return out;
  }

  /** Instantané compact du monde pour le revoir plus tard. */
  snapshot(): Uint8Array {
    const b = this.backend;
    return encodeFrame(this.tick, this.size, b.read(STATE), b.read(AUX), b.read(SED), b.read(GENOME), ALIVE_THRESHOLD);
  }

  private meanSediment(): number {
    const se = this.backend.read(SED);
    let total = 0;
    for (let i = 3; i < se.length; i += 4) total += se[i];
    return total / (this.size * this.size);
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
      dna: null,
      visitor: null,
      history: [],
      ledger: [],
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
      const x = (i % this.size) + 0.5;
      const y = Math.floor(i / this.size) + 0.5;
      l.history.push(this.tick, 0, x, y);
      this.stamp(1, x, y, SUBLINEAGE_PATCH_RADIUS, l.id, parent, g);
      this.emit({ kind: 'sous-lignee', lineage: l.id, other: parent, visitor: null, n: 0, cause: null, x, y });
      return;
    }
  }
}
