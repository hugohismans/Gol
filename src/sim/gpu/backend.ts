// Moteur GPU : ping-pong de textures RGBA32F en WebGL2.
// Reçoit un contexte déjà créé, ne touche jamais au DOM.

import { AUX, GENOME, SED, STATE } from '../backend';
import type { Backend, StampArgs, StepConstants } from '../backend';
import { buildKernelTaps } from '../kernel';
import { Program, createFramebuffer, createFullscreenTriangle, createTexture, requireFloatTargets } from './gl';
import { COPY_VIT_SHADER, STAMP_SHADER, VERTEX_SHADER, stepShader } from './shaders';

interface Buffers {
  tex: WebGLTexture[];
  fbo: WebGLFramebuffer;
}

export interface SimTextures {
  state: WebGLTexture;
  genome: WebGLTexture;
  aux: WebGLTexture;
  sediment: WebGLTexture;
  vitality: WebGLTexture;
}

export class GpuBackend implements Backend {
  private cur = 0;
  private bufs: Buffers[];
  private vitTex: WebGLTexture;
  private vitFbo: WebGLFramebuffer;
  private vao: WebGLVertexArrayObject;
  private stepProg: Program;
  private copyProg: Program;
  private stampProg: Program;
  private taps: Float32Array;
  private readBuf = new Map<number, Float32Array>();

  constructor(private gl: WebGL2RenderingContext, readonly size: number) {
    requireFloatTargets(gl);
    this.taps = buildKernelTaps();
    this.vao = createFullscreenTriangle(gl);
    this.stepProg = new Program(gl, VERTEX_SHADER, stepShader(this.taps.length / 4));
    this.copyProg = new Program(gl, VERTEX_SHADER, COPY_VIT_SHADER);
    this.stampProg = new Program(gl, VERTEX_SHADER, STAMP_SHADER);
    const make = (): Buffers => {
      const tex = [0, 1, 2, 3].map(() =>
        createTexture(gl, size, size, {
          internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE,
        }),
      );
      return { tex, fbo: createFramebuffer(gl, tex) };
    };
    this.bufs = [make(), make()];
    this.vitTex = createTexture(gl, size, size, {
      internalFormat: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT, filter: gl.LINEAR, wrap: gl.REPEAT, mipmaps: true,
    });
    this.vitFbo = createFramebuffer(gl, [this.vitTex]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  get textures(): SimTextures {
    const b = this.bufs[this.cur];
    return { state: b.tex[STATE], genome: b.tex[GENOME], aux: b.tex[AUX], sediment: b.tex[SED], vitality: this.vitTex };
  }

  configure(c: StepConstants): void {
    const p = this.stepProg.use();
    this.gl.uniform4fv(p.loc('uTaps'), this.taps);
    p.i('uSize', this.size);
    p.f('uDt', c.dt).f('uAliveT', c.aliveT).f('uLodGap', c.lodGap);
    p.f('uRadiusScale', c.radiusScale).f('uMuOffset', c.muOffset).f('uSigmaScale', c.sigmaScale);
    p.f('uAppetiteScale', c.appetiteScale).f('uAppetiteGrowth', c.appetiteGrowth);
    p.f('uDiffusion', c.diffusion).f('uConsumption', c.consumption).f('uNutHalf', c.nutHalf).f('uUptakeHalf', c.uptakeHalf);
    p.f('uStarvation', c.starvation).f('uStarveBelow', c.starveBelow).f('uSenescence', c.senescence);
    p.f('uSenescenceAge', ...c.senescenceAge);
    p.f('uGhostDecay', c.ghostDecay).f('uGhostMin', c.ghostMin);
    p.f('uMutationRate', c.mutationRate).f('uMutSigma', ...c.mutSigma).f('uMutHue', c.mutHue);
    p.f('uRadiusBounds', ...c.radiusBounds).f('uMuBounds', ...c.muBounds);
    p.f('uSigmaBounds', ...c.sigmaBounds).f('uAppetiteBounds', ...c.appetiteBounds);
    p.f('uSedRate', c.sedRate).f('uSedDarken', c.sedDarken).f('uSedMemory', c.sedMemory).f('uEarth', ...c.earth);
  }

  tick(regen: number, seed: number): void {
    const gl = this.gl;
    const src = this.bufs[this.cur];
    const dst = this.bufs[1 - this.cur];
    const p = this.stepProg.use();
    p.f('uRegen', regen).u('uSeed', seed);
    p.tex('uState', 0, src.tex[STATE]).tex('uGenome', 1, src.tex[GENOME]).tex('uAux', 2, src.tex[AUX]);
    p.tex('uSed', 3, src.tex[SED]).tex('uVit', 4, this.vitTex);
    this.draw(dst.fbo);
    this.cur = 1 - this.cur;
    this.refreshVitality();
    this.readBuf.clear();
  }

  stamp(s: StampArgs): void {
    const src = this.bufs[this.cur];
    const dst = this.bufs[1 - this.cur];
    const p = this.stampProg.use();
    p.tex('uState', 0, src.tex[STATE]).tex('uGenome', 1, src.tex[GENOME]).tex('uAux', 2, src.tex[AUX]).tex('uSed', 3, src.tex[SED]);
    p.i('uSize', this.size).i('uMode', s.mode).u('uSeed', s.seed);
    p.f('uCenter', s.x, s.y).f('uRadius', Math.max(1, s.radius)).f('uLineage', s.lineage).f('uFromLineage', s.fromLineage);
    p.f('uGene', ...s.gene).f('uHue', s.hue);
    p.f('uDensity', s.density).f('uNutrientBoost', s.nutrientBoost).f('uAliveT', s.aliveT);
    this.draw(dst.fbo);
    this.cur = 1 - this.cur;
    this.refreshVitality();
    this.readBuf.clear();
  }

  read(index: number): Float32Array {
    // Le cache est vidé à chaque écriture : une lecture par grille et par état.
    const cached = this.readBuf.get(index);
    if (cached) return cached;
    const gl = this.gl;
    const data = new Float32Array(this.size * this.size * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.bufs[this.cur].fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + index);
    gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, data);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    this.readBuf.set(index, data);
    return data;
  }

  upload(data: Float32Array[]): void {
    const gl = this.gl;
    for (const b of this.bufs) {
      data.forEach((d, i) => {
        gl.bindTexture(gl.TEXTURE_2D, b.tex[i]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, d);
      });
    }
    this.refreshVitality();
    this.readBuf.clear();
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

  private draw(fbo: WebGLFramebuffer): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.size, this.size);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Recopie la vitalité dans la texture filtrable et régénère ses mipmaps. */
  private refreshVitality(): void {
    const gl = this.gl;
    this.copyProg.use().tex('uState', 0, this.bufs[this.cur].tex[STATE]);
    this.draw(this.vitFbo);
    gl.bindTexture(gl.TEXTURE_2D, this.vitTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
