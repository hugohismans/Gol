// Organisme : la simulation vue de l'extérieur.
// API : step(dt), spawnSpore(x, y, mutation), getState().
// Le calcul tourne sur le GPU (ping-pong de textures WebGL2), mais rien ici
// ne touche au DOM : on reçoit un contexte WebGL2 déjà créé.

import {
  ALIVE_THRESHOLD,
  BIRTH_MUTATION_SIGMA,
  CENSUS_INTERVAL_TICKS,
  DEFAULT_GENOME,
  DEFAULT_PARAMS,
  GENOME_BOUNDS,
  GHOST_DECAY,
  GHOST_MIN_INFLUENCE,
  GRID_SIZE,
  KERNEL_LOD_GAP,
  KERNEL_TAP_DENSITY,
  LENIA_DT,
  SAVE_VERSION,
  SECONDS_PER_TICK,
  SEDIMENT_COLOR_MEMORY,
  SEDIMENT_EARTH,
  SEED_SPORE_COUNT,
  SPORE_DENSITY,
  SPORE_INHERIT_SEARCH_RADIUS,
  SPORE_NUTRIENT_BOOST,
  SPORE_RADIUS_FACTOR,
  SUBLINEAGE_PATCH_RADIUS,
  TICKS_PER_DAY,
} from './config';
import type { Params } from './config';
import { regenFactor } from './calendar';
import { applyMutation, clampGenome, randomGenome, sublineageJump } from './genome';
import { Program, createFramebuffer, createFullscreenTriangle, createTexture, requireFloatTargets } from './gl';
import { buildKernelTaps } from './kernel';
import { Rng } from './rng';
import { decodeSave, encodeSave } from './serialize';
import { COPY_VIT_SHADER, STAMP_SHADER, VERTEX_SHADER, stepShader } from './shaders';
import type { Genome, Lineage, MutationKind, SimState, SimStats } from './types';

/** Index des textures d'état dans un jeu de ping-pong. */
const STATE = 0;
const GENOME = 1;
const AUX = 2;
const SED = 3;

interface Buffers {
  tex: WebGLTexture[];
  fbo: WebGLFramebuffer;
}

export interface OrganismeOptions {
  seed?: number;
  /** Côté de la grille, GRID_SIZE par défaut (plus petit pour les essais rapides). */
  size?: number;
  params?: Partial<Params>;
}

export interface SimTextures {
  state: WebGLTexture;
  genome: WebGLTexture;
  aux: WebGLTexture;
  sediment: WebGLTexture;
  vitality: WebGLTexture;
}

export class Organisme {
  readonly size: number;
  params: Params;
  tick = 0;
  readonly lineages = new Map<number, Lineage>();
  stats: SimStats;

  private gl: WebGL2RenderingContext;
  private rng: Rng;
  private nextLineageId = 1;
  private pendingSeconds = 0;
  private lastCensusTick = 0;
  private cur = 0;
  private bufs: Buffers[];
  private vitTex: WebGLTexture;
  private vitFbo: WebGLFramebuffer;
  private vao: WebGLVertexArrayObject;
  private stepProg: Program;
  private copyProg: Program;
  private stampProg: Program;
  private taps: Float32Array;
  private cache = new Map<number, { tick: number; data: Float32Array }>();

  constructor(gl: WebGL2RenderingContext, opts: OrganismeOptions = {}) {
    this.gl = gl;
    this.size = opts.size ?? GRID_SIZE;
    requireFloatTargets(gl);
    this.params = { ...DEFAULT_PARAMS, ...opts.params };
    this.rng = new Rng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.taps = buildKernelTaps();
    this.vao = createFullscreenTriangle(gl);
    this.stepProg = new Program(gl, VERTEX_SHADER, stepShader(this.taps.length / 4));
    this.copyProg = new Program(gl, VERTEX_SHADER, COPY_VIT_SHADER);
    this.stampProg = new Program(gl, VERTEX_SHADER, STAMP_SHADER);

    const n = this.size;
    const make = () => {
      const tex = [0, 1, 2, 3].map(() =>
        createTexture(gl, n, n, {
          internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE,
        }),
      );
      return { tex, fbo: createFramebuffer(gl, tex) };
    };
    this.bufs = [make(), make()];
    this.vitTex = createTexture(gl, n, n, {
      internalFormat: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT, filter: gl.LINEAR, wrap: gl.REPEAT, mipmaps: true,
    });
    this.vitFbo = createFramebuffer(gl, [this.vitTex]);
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
    const gl = this.gl;
    this.bindStepUniforms();
    gl.viewport(0, 0, this.size, this.size);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    for (let i = 0; i < n; i++) {
      const src = this.bufs[this.cur];
      const dst = this.bufs[1 - this.cur];
      const p = this.stepProg.use();
      p.f('uRegen', this.params.regenRate * regenFactor(this.tick, this.params.dayAmplitude, this.params.seasonAmplitude));
      p.u('uSeed', this.rng.next() * 4294967296);
      p.tex('uState', 0, src.tex[STATE]).tex('uGenome', 1, src.tex[GENOME]).tex('uAux', 2, src.tex[AUX]);
      p.tex('uSed', 3, src.tex[SED]).tex('uVit', 4, this.vitTex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.cur = 1 - this.cur;
      this.tick++;
      this.refreshVitality();
      if (this.tick - this.lastCensusTick >= CENSUS_INTERVAL_TICKS) {
        this.census();
        this.bindStepUniforms();
        gl.viewport(0, 0, this.size, this.size);
        gl.bindVertexArray(this.vao);
      }
    }
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    const st = this.read(STATE);
    const ge = this.read(GENOME);
    const au = this.read(AUX);
    const se = this.read(SED);
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
    this.upload([state, genome, aux, sed]);
    this.tick = 0;
    this.pendingSeconds = 0;
    this.lastCensusTick = 0;
    this.nextLineageId = 1;
    this.lineages.clear();
    this.stats = this.emptyStats();
  }

  /** Recensement : lignées vivantes, surface, extinctions, sous-lignées. */
  census(): SimStats {
    const st = this.read(STATE);
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

  /** Textures courantes, pour le rendu. */
  get textures(): SimTextures {
    const b = this.bufs[this.cur];
    return { state: b.tex[STATE], genome: b.tex[GENOME], aux: b.tex[AUX], sediment: b.tex[SED], vitality: this.vitTex };
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
    this.upload([state, genome, aux, sed]);
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
    const gl = this.gl;
    for (const b of this.bufs) {
      b.tex.forEach((t) => gl.deleteTexture(t));
      gl.deleteFramebuffer(b.fbo);
    }
    gl.deleteTexture(this.vitTex);
    gl.deleteFramebuffer(this.vitFbo);
    this.stepProg.dispose();
    this.copyProg.dispose();
    this.stampProg.dispose();
  }

  // --- Interne -----------------------------------------------------------

  private emptyStats(): SimStats {
    return { tick: 0, livingCells: 0, biomass: 0, livingLineages: 0, totalLineages: 0, meanNutrients: 1 };
  }

  private bindStepUniforms(): void {
    const p = this.stepProg.use();
    const q = this.params;
    const b = GENOME_BOUNDS;
    this.gl.uniform4fv(p.loc('uTaps'), this.taps);
    p.i('uSize', this.size);
    p.f('uDt', LENIA_DT).f('uAliveT', ALIVE_THRESHOLD).f('uLodGap', KERNEL_TAP_DENSITY * KERNEL_LOD_GAP);
    p.f('uRadiusScale', q.radiusScale).f('uMuOffset', q.muOffset).f('uSigmaScale', q.sigmaScale);
    p.f('uAppetiteScale', q.appetiteScale).f('uAppetiteGrowth', q.appetiteGrowth);
    p.f('uDiffusion', q.diffusion).f('uConsumption', q.consumption).f('uNutHalf', q.nutrientHalf);
    p.f('uStarvation', q.starvation).f('uStarveBelow', q.starveBelow).f('uSenescence', q.senescence);
    p.f('uSenescenceAge', q.senescenceStartDays * TICKS_PER_DAY, Math.max(q.senescenceFullDays, q.senescenceStartDays + 0.01) * TICKS_PER_DAY);
    p.f('uGhostDecay', GHOST_DECAY).f('uGhostMin', GHOST_MIN_INFLUENCE);
    p.f('uMutationRate', q.mutationRate);
    const m = BIRTH_MUTATION_SIGMA;
    p.f('uMutSigma', m.radius, m.mu, m.sigma, m.appetite).f('uMutHue', m.hue);
    p.f('uRadiusBounds', ...b.radius).f('uMuBounds', ...b.mu).f('uSigmaBounds', ...b.sigma).f('uAppetiteBounds', ...b.appetite);
    p.f('uSedRate', q.sedimentRate).f('uSedDarken', q.sedimentDarkening).f('uSedMemory', SEDIMENT_COLOR_MEMORY);
    p.f('uEarth', ...SEDIMENT_EARTH);
  }

  /** Recopie la vitalité dans la texture filtrable et régénère ses mipmaps. */
  private refreshVitality(): void {
    const gl = this.gl;
    this.copyProg.use().tex('uState', 0, this.bufs[this.cur].tex[STATE]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.vitFbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, this.vitTex);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  private upload(data: Float32Array[]): void {
    const gl = this.gl;
    for (const b of this.bufs) {
      data.forEach((d, i) => {
        gl.bindTexture(gl.TEXTURE_2D, b.tex[i]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, d);
      });
    }
    this.cache.clear();
    gl.viewport(0, 0, this.size, this.size);
    gl.bindVertexArray(this.vao);
    this.refreshVitality();
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Lit une texture d'état (RGBA par case), avec cache par tick. */
  private read(index: number): Float32Array {
    const c = this.cache.get(index);
    if (c && c.tick === this.tick) return c.data;
    const gl = this.gl;
    const data = c?.data ?? new Float32Array(this.size * this.size * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.bufs[this.cur].fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + index);
    gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, data);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    this.cache.set(index, { tick: this.tick, data });
    return data;
  }

  /** Invalide le cache de lecture après une écriture hors tick. */
  private touch(): void {
    this.cache.clear();
  }

  private stamp(mode: 0 | 1, x: number, y: number, radius: number, lineage: number, from: number, g: Genome): void {
    const gl = this.gl;
    const src = this.bufs[this.cur];
    const dst = this.bufs[1 - this.cur];
    const p = this.stampProg.use();
    p.tex('uState', 0, src.tex[STATE]).tex('uGenome', 1, src.tex[GENOME]).tex('uAux', 2, src.tex[AUX]).tex('uSed', 3, src.tex[SED]);
    p.i('uSize', this.size).i('uMode', mode).u('uSeed', this.rng.next() * 4294967296);
    p.f('uCenter', x, y).f('uRadius', Math.max(1, radius)).f('uLineage', lineage).f('uFromLineage', from);
    p.f('uGene', g.radius, g.mu, g.sigma, g.appetite).f('uHue', g.hue);
    p.f('uDensity', SPORE_DENSITY).f('uNutrientBoost', SPORE_NUTRIENT_BOOST).f('uAliveT', ALIVE_THRESHOLD);
    gl.viewport(0, 0, this.size, this.size);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = 1 - this.cur;
    this.refreshVitality();
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.touch();
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
    const st = this.read(STATE);
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
    const ge = this.read(GENOME);
    const au = this.read(AUX);
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
