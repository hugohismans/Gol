// Petits utilitaires WebGL2 partagés par la simulation et le rendu.
// Ne touche jamais au DOM : reçoit un contexte déjà créé.

export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Compilation GLSL : ' + log);
    }
    return sh;
  };
  const prog = gl.createProgram()!;
  const v = make(gl.VERTEX_SHADER, vs);
  const f = make(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Édition de liens GLSL : ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

/** Programme avec cache des emplacements d'uniformes. */
export class Program {
  readonly prog: WebGLProgram;
  private locs = new Map<string, WebGLUniformLocation | null>();

  constructor(private gl: WebGL2RenderingContext, vs: string, fs: string) {
    this.prog = compile(gl, vs, fs);
  }

  use(): this {
    this.gl.useProgram(this.prog);
    return this;
  }

  loc(name: string): WebGLUniformLocation | null {
    let l = this.locs.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.prog, name);
      this.locs.set(name, l);
    }
    return l;
  }

  f(name: string, ...v: number[]): this {
    const l = this.loc(name);
    const gl = this.gl;
    if (v.length === 1) gl.uniform1f(l, v[0]);
    else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
    else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
    else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    return this;
  }

  i(name: string, v: number): this {
    this.gl.uniform1i(this.loc(name), v);
    return this;
  }

  u(name: string, v: number): this {
    this.gl.uniform1ui(this.loc(name), v >>> 0);
    return this;
  }

  /** Lie une texture sur une unité et l'associe à un sampler. */
  tex(name: string, unit: number, t: WebGLTexture): this {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(this.loc(name), unit);
    return this;
  }

  dispose(): void {
    this.gl.deleteProgram(this.prog);
  }
}

export interface TexOptions {
  internalFormat: number;
  format: number;
  type: number;
  filter: number;
  wrap: number;
  mipmaps?: boolean;
  data?: ArrayBufferView | null;
}

export function createTexture(gl: WebGL2RenderingContext, w: number, h: number, o: TexOptions): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, o.internalFormat, w, h, 0, o.format, o.type, o.data ?? null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : o.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, o.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, o.wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, o.wrap);
  if (o.mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

export function createFramebuffer(gl: WebGL2RenderingContext, textures: WebGLTexture[]): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  textures.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplet : 0x' + status.toString(16));
  return fb;
}

/** Triangle plein écran (VAO avec un seul attribut en location 0). */
export function createFullscreenTriangle(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

/** Vérifie les capacités nécessaires et renvoie un message clair sinon. */
export function requireFloatTargets(gl: WebGL2RenderingContext): void {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error("Ce navigateur ne permet pas de rendre dans des textures flottantes (EXT_color_buffer_float).");
  }
  if (gl.getParameter(gl.MAX_DRAW_BUFFERS) < 4) {
    throw new Error('Ce GPU ne supporte pas 4 cibles de rendu simultanées.');
  }
}
