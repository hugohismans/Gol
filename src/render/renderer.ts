// Rendu WebGL2 : calques séparés et rendu final composé.

import { ALIVE_THRESHOLD, SEDIMENT_EARTH } from '../sim/config';
import { Program, createFramebuffer, createFullscreenTriangle, createTexture } from '../sim/gl';
import type { SimTextures } from '../sim/organisme';
import { VERTEX_SHADER } from '../sim/shaders';
import { COMPOSITE_SHADER, PREP_SHADER } from './shaders';

export type Layer = 'final' | 'vitalite' | 'lignees' | 'nutriments' | 'sediment';
export const LAYERS: Layer[] = ['final', 'vitalite', 'lignees', 'nutriments', 'sediment'];
const LAYER_INDEX: Record<Layer, number> = { final: 0, vitalite: 1, lignees: 2, nutriments: 3, sediment: 4 };

/** Comment le monde carré occupe l'écran. */
export type ViewMode = 'mosaique' | 'couvrir' | 'contenir';

/** Épaisseur de sédiment qui donne une couverture d'environ 63 %. */
const SEDIMENT_VISUAL_SCALE = 1.5;

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
  private fbo: WebGLFramebuffer;

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
    this.fbo = createFramebuffer(gl, [this.life, this.ground, this.field]);
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

  render(t: SimTextures, width: number, height: number, view: View, layer: Layer, time: number, daylight: number): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    gl.viewport(0, 0, this.size, this.size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    this.prep.use().tex('uState', 0, t.state).tex('uAux', 1, t.aux).tex('uSed', 2, t.sediment);
    this.prep.f('uAliveT', ALIVE_THRESHOLD).f('uSedScale', SEDIMENT_VISUAL_SCALE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    for (const tex of [this.life, this.ground, this.field]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    const c = this.comp.use();
    c.tex('uLife', 0, this.life).tex('uGround', 1, this.ground).tex('uField', 2, this.field);
    c.f('uResolution', width, height).f('uCenter', view.centerX, view.centerY).f('uScale', view.scale);
    c.i('uClip', view.clip ? 1 : 0).i('uLayer', LAYER_INDEX[layer]);
    c.f('uTime', time).f('uDaylight', daylight).f('uGrid', this.size).f('uEarth', ...SEDIMENT_EARTH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    [this.life, this.ground, this.field].forEach((t) => gl.deleteTexture(t));
    gl.deleteFramebuffer(this.fbo);
    this.prep.dispose();
    this.comp.dispose();
  }
}
