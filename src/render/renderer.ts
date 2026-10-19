// Rendu WebGL2 : calques séparés et rendu final composé.

import { ALIVE_THRESHOLD, SEDIMENT_EARTH } from '../sim/config';
import { Program, createFramebuffer, createFullscreenTriangle, createTexture } from '../sim/gpu/gl';
import type { Frame } from '../sim/frame';
import { VERTEX_SHADER } from '../sim/gpu/shaders';
import { COMPOSITE_SHADER, MAX_FOCUS, PREP_SHADER } from './shaders';

export type Layer = 'final' | 'vitalite' | 'lignees' | 'nutriments' | 'sediment';
export const LAYERS: Layer[] = ['final', 'vitalite', 'lignees', 'nutriments', 'sediment'];
const LAYER_INDEX: Record<Layer, number> = { final: 0, vitalite: 1, lignees: 2, nutriments: 3, sediment: 4 };

/** Comment le monde carré occupe l'écran. */
export type ViewMode = 'mosaique' | 'couvrir' | 'contenir';

/**
 * Le sédiment s'affiche relativement à son épaisseur moyenne (ce qui raconte
 * l'histoire), atténué tant que le monde est jeune : couverture globale
 * 1 - exp(-moyenne / SEDIMENT_MATURITY).
 */
const SEDIMENT_MATURITY = 0.3;

/** Durée d'affichage de l'anneau d'une spore déposée. */
const SPORE_MARK_SECONDS = 2;

/** Ce que le rendu lit : les textures de la simulation, ou celles d'un instantané. */
export interface WorldTextures {
  state: WebGLTexture;
  aux: WebGLTexture;
  sediment: WebGLTexture;
  /** Génome : seul l'appétit (w) sert au rendu. */
  genome: WebGLTexture;
}

export interface RenderOptions {
  width: number;
  height: number;
  view: View;
  layer: Layer;
  /** Temps réel en secondes (pulsation). */
  time: number;
  daylight: number;
  meanSediment: number;
  /** Lignées mises en évidence ; les autres s'estompent. */
  focus?: { ids: number[]; strength: number };
  /** Anneau qui signale un lieu (en cases), par exemple où vivait une lignée. */
  marker?: { x: number; y: number; strength: number };
}

export interface View {
  centerX: number;
  centerY: number;
  /** Pixels par largeur de monde. */
  scale: number;
  clip: boolean;
}

export class Renderer {
  private prep: Program;
  private comp: Program;
  private vao: WebGLVertexArrayObject;
  private life: WebGLTexture;
  private ground: WebGLTexture;
  private field: WebGLTexture;
  private focusTex: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private focusData = new Float32Array(MAX_FOCUS);

  constructor(private gl: WebGL2RenderingContext, private size: number) {
    this.prep = new Program(gl, VERTEX_SHADER, PREP_SHADER);
    this.comp = new Program(gl, VERTEX_SHADER, COMPOSITE_SHADER);
    this.vao = createFullscreenTriangle(gl);
    const opts = {
      internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR, wrap: gl.REPEAT, mipmaps: true,
    };
    this.life = createTexture(gl, size, size, opts);
    this.ground = createTexture(gl, size, size, opts);
    this.field = createTexture(gl, size, size, opts);
    this.focusTex = createTexture(gl, size, size, opts);
    this.fbo = createFramebuffer(gl, [this.life, this.ground, this.field, this.focusTex]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Calcule la vue pour un canvas de w x h pixels. */
  static view(w: number, h: number, mode: ViewMode): View {
    const scale = mode === 'couvrir' ? Math.max(w, h) : Math.min(w, h);
    return { centerX: w / 2, centerY: h / 2, scale, clip: mode === 'contenir' };
  }

  /** Convertit un point écran (pixels, origine en haut à gauche) en case du monde. */
  static screenToWorld(px: number, py: number, h: number, v: View, size: number): { x: number; y: number; inside: boolean } {
    const u = (px - v.centerX) / v.scale + 0.5;
    const w = (h - py - v.centerY) / v.scale + 0.5;
    const inside = u >= 0 && u <= 1 && w >= 0 && w <= 1;
    const wrap = (t: number) => ((t % 1) + 1) % 1;
    return { x: wrap(u) * size, y: wrap(w) * size, inside };
  }

  /** Spores récentes à signaler : position en cases et âge en secondes. */
  private spores: { x: number; y: number; t: number }[] = [];
  private sporeData = new Float32Array(8 * 4);

  markSpore(x: number, y: number, time: number): void {
    this.spores.push({ x, y, t: time });
    if (this.spores.length > 8) this.spores.shift();
  }

  render(t: WorldTextures, o: RenderOptions): void {
    const { width, height, view, layer, time, daylight, meanSediment } = o;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    gl.viewport(0, 0, this.size, this.size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    this.prep.use().tex('uState', 0, t.state).tex('uAux', 1, t.aux).tex('uSed', 2, t.sediment).tex('uGenome', 3, t.genome);
    this.prep.f('uAliveT', ALIVE_THRESHOLD).f('uSedRef', Math.max(meanSediment, 1e-4));
    this.prep.f('uSedMaturity', 1 - Math.exp(-meanSediment / SEDIMENT_MATURITY));
    const ids = o.focus?.ids.slice(0, MAX_FOCUS) ?? [];
    this.focusData.fill(-1);
    this.focusData.set(ids);
    gl.uniform1fv(this.prep.loc('uFocus'), this.focusData);
    this.prep.i('uFocusCount', ids.length);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    for (const tex of [this.life, this.ground, this.field, this.focusTex]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    const c = this.comp.use();
    c.tex('uLife', 0, this.life).tex('uGround', 1, this.ground).tex('uField', 2, this.field).tex('uFocusTex', 3, this.focusTex);
    c.f('uFocusOn', ids.length ? (o.focus?.strength ?? 0) : 0);
    const m = o.marker;
    c.f('uMarker', m ? m.x / this.size : 0, m ? m.y / this.size : 0, m ? m.strength : 0, 0);
    c.f('uResolution', width, height).f('uCenter', view.centerX, view.centerY).f('uScale', view.scale);
    c.i('uClip', view.clip ? 1 : 0).i('uLayer', LAYER_INDEX[layer]);
    c.f('uTime', time).f('uDaylight', daylight).f('uGrid', this.size).f('uEarth', ...SEDIMENT_EARTH);
    this.spores = this.spores.filter((s) => time - s.t < SPORE_MARK_SECONDS);
    this.sporeData.fill(0);
    this.spores.forEach((s, i) => this.sporeData.set([s.x / this.size, s.y / this.size, time - s.t, 1], i * 4));
    gl.uniform4fv(c.loc('uSpores'), this.sporeData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    [this.life, this.ground, this.field, this.focusTex].forEach((t) => gl.deleteTexture(t));
    gl.deleteFramebuffer(this.fbo);
    this.prep.dispose();
    this.comp.dispose();
  }
}

/** Textures d'un instantané passé, pour le revoir avec le même rendu. */
export class FrameTextures implements WorldTextures {
  state: WebGLTexture;
  aux: WebGLTexture;
  sediment: WebGLTexture;
  genome: WebGLTexture;
  tick = -1;
  meanSediment = 0;

  constructor(private gl: WebGL2RenderingContext, private size: number) {
    const opts = { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE };
    this.state = createTexture(gl, size, size, opts);
    this.aux = createTexture(gl, size, size, opts);
    this.sediment = createTexture(gl, size, size, opts);
    this.genome = createTexture(gl, size, size, opts);
  }

  load(f: Frame): void {
    if (f.size !== this.size) throw new Error('Instantané de taille différente');
    const gl = this.gl;
    const put = (t: WebGLTexture, d: Float32Array) => {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, d);
    };
    put(this.state, f.state);
    put(this.aux, f.aux);
    put(this.sediment, f.sed);
    put(this.genome, f.genome);
    this.tick = f.tick;
    this.meanSediment = f.meanSediment;
  }

  dispose(): void {
    [this.state, this.aux, this.sediment, this.genome].forEach((t) => this.gl.deleteTexture(t));
  }
}
