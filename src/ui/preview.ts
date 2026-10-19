// L'éprouvette : un petit monde d'essai, dans son propre canvas, où la spore
// préparée vit seule pendant un jour simulé avant d'être lâchée.

import { TICKS_PER_DAY } from '../sim/config';
import type { Params } from '../sim/config';
import { daylight } from '../sim/calendar';
import { GpuBackend } from '../sim/gpu/backend';
import { Organisme } from '../sim/organisme';
import type { Genome } from '../sim/types';
import { Renderer } from '../render/renderer';

/** Côté du monde d'essai. */
const PREVIEW_SIZE = 96;
/** Durée simulée de l'essai, et durée réelle pour la jouer. */
const PREVIEW_DAYS = 1;
const PREVIEW_SECONDS = 20;

export interface PreviewState {
  /** Avancement de l'essai, de 0 à 1. */
  progress: number;
  area: number;
  peak: number;
  done: boolean;
}

export class Eprouvette {
  private gl: WebGL2RenderingContext;
  private gpu: GpuBackend;
  private sim: Organisme;
  private renderer: Renderer;
  private lineage = -1;
  private pending = 0;
  private readonly total = PREVIEW_DAYS * TICKS_PER_DAY;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl;
    this.gpu = new GpuBackend(gl, PREVIEW_SIZE);
    this.sim = new Organisme(this.gpu);
    this.renderer = new Renderer(gl, PREVIEW_SIZE);
  }

  /** Recommence l'essai avec ce génome, dans un sol au niveau de nutriments du monde. */
  start(genome: Genome, params: Params, nutrients: number): void {
    // Sol uniforme : on observe la spore elle même, pas la chance d'un emplacement.
    this.sim.params = { ...params, fertilityContrast: 0, initialNutrients: nutrients };
    this.sim.reset();
    this.lineage = this.sim.plant(PREVIEW_SIZE / 2, PREVIEW_SIZE / 2, genome).id;
    this.sim.census();
  }

  /** Avance l'essai d'une image de dt secondes réelles et le dessine. */
  frame(dt: number, time: number): PreviewState {
    const done = this.sim.tick >= this.total;
    if (!done && this.lineage >= 0) {
      this.pending += (this.total / PREVIEW_SECONDS) * dt;
      const n = Math.min(Math.floor(this.pending), this.total - this.sim.tick);
      this.pending -= n;
      this.sim.runTicks(n);
    }
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.renderer.render(this.gpu.textures, {
      width: w,
      height: h,
      view: Renderer.view(w, h, 'contenir'),
      layer: 'final',
      time,
      daylight: daylight(this.sim.tick),
      meanSediment: this.sim.stats.meanSediment,
    });
    const l = this.sim.lineages.get(this.lineage);
    return { progress: Math.min(1, this.sim.tick / this.total), area: l?.area ?? 0, peak: l?.peakArea ?? 0, done };
  }

  dispose(): void {
    this.renderer.dispose();
    this.sim.dispose();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
