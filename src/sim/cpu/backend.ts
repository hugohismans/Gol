// Moteur CPU : portage fidèle des shaders de src/sim/gpu/shaders.ts en
// TypeScript pur (Float32Array). Plus lent que le GPU, mais tourne partout :
// tests, réglage hors navigateur, et plus tard le serveur.
// Toute modification des règles doit être faite dans les deux moteurs.

import { AUX, GENOME, SED, STATE, fertilityPeriod } from '../backend';
import type { Backend, StampArgs, StepConstants } from '../backend';
import { HUE_CHROMA, HUE_LIGHTNESS } from '../config';
import { buildKernelTaps } from '../kernel';

function hash(x: number): number {
  x = x >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** Générateur par case identique au GLSL (état passé par objet mutable). */
class CellRng {
  s = 0;
  rnd(): number {
    this.s = hash(this.s);
    return (this.s >>> 8) / 16777216;
  }
  gauss(): number {
    const u1 = Math.max(this.rnd(), 1e-7);
    const u2 = this.rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(6.2831853 * u2);
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);

/** Couleur d'une teinte en OKLCH, identique à hueColor() en GLSL. */
export function hueColor(h: number, out: number[]): void {
  const a = HUE_CHROMA * Math.cos(6.2831853 * h);
  const b = HUE_CHROMA * Math.sin(6.2831853 * h);
  const L = HUE_LIGHTNESS;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  out[0] = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, 0, 1) ** (1 / 2.2);
  out[1] = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, 0, 1) ** (1 / 2.2);
  out[2] = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s, 0, 1) ** (1 / 2.2);
}

function lattice(x: number, y: number, z: number, period: number): number {
  const px = ((x % period) + period) % period;
  const py = ((y % period) + period) % period;
  const h = hash((px + py * 4096 + z * 16777216) >>> 0);
  return (h >>> 8) * (2 / 16777216) - 1;
}

function vnoise(x: number, y: number, z: number, period: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const q = (f: number) => f * f * f * (f * (f * 6 - 15) + 10);
  const ux = q(fx), uy = q(fy), uz = q(fz);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const a = mix(lattice(ix, iy, iz, period), lattice(ix + 1, iy, iz, period), ux);
  const b = mix(lattice(ix, iy + 1, iz, period), lattice(ix + 1, iy + 1, iz, period), ux);
  const d = mix(lattice(ix, iy, iz + 1, period), lattice(ix + 1, iy, iz + 1, period), ux);
  const e = mix(lattice(ix, iy + 1, iz + 1, period), lattice(ix + 1, iy + 1, iz + 1, period), ux);
  return mix(mix(a, b, uy), mix(d, e, uy), uz);
}

/** Multiplicateur de régénération, identique à fertility() en GLSL. */
export function fertility(qx: number, qy: number, period: number, t: number, contrast: number): number {
  const n =
    0.65 * vnoise(qx * period, qy * period, t, period) +
    0.35 * vnoise(qx * 2 * period, qy * 2 * period, t * 1.7 + 13, 2 * period);
  return Math.max(0, 1 + contrast * clamp(n * 1.5, -1, 1));
}

const N8 = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
];

export class CpuBackend implements Backend {
  private cur: Float32Array[];
  private next: Float32Array[];
  /** Pyramide de la vitalité (niveau 0 = pleine résolution), comme les mipmaps GPU. */
  private mips: Float32Array[] = [];
  private taps: Float32Array;
  private c!: StepConstants;
  private rng = new CellRng();
  private col = [0, 0, 0];
  private fert: Float32Array;
  private fertKey = '';

  constructor(readonly size: number) {
    const n = size * size * 4;
    this.cur = [0, 1, 2, 3].map(() => new Float32Array(n));
    this.next = [0, 1, 2, 3].map(() => new Float32Array(n));
    for (let s = size; s >= 1; s >>= 1) this.mips.push(new Float32Array(s * s));
    this.taps = buildKernelTaps();
    this.fert = new Float32Array(size * size);
  }

  configure(c: StepConstants): void {
    this.c = c;
  }

  tick(regen: number, seed: number, terrainTime: number): void {
    this.buildMips();
    const fert = this.fertilityMap(terrainTime);
    const c = this.c;
    const n = this.size;
    const st = this.cur[STATE], ge = this.cur[GENOME], au = this.cur[AUX], se = this.cur[SED];
    const ost = this.next[STATE], oge = this.next[GENOME], oau = this.next[AUX], ose = this.next[SED];
    const taps = this.taps;
    const ntaps = taps.length;
    const maxLevel = this.mips.length - 1;
    const decay2 = c.ghostDecay * c.ghostDecay;
    const rng = this.rng;
    const col = this.col;

    for (let py = 0; py < n; py++) {
      for (let px = 0; px < n; px++) {
        const i = (py * n + px) * 4;
        const vit = st[i];
        const nut = st[i + 1];
        let lin = st[i + 2];
        const age = st[i + 3];
        let g0 = ge[i], g1 = ge[i + 1], g2 = ge[i + 2], g3 = ge[i + 3];
        let hue = au[i];
        const alive = vit >= c.aliveT && lin > 0.5;
        let influence = alive ? vit : 0;

        if (!alive) {
          let best = 0;
          let bq = -1;
          for (let k = 0; k < 8; k++) {
            const qx = (px + N8[k][0] + n) % n;
            const qy = (py + N8[k][1] + n) % n;
            const q = (qy * n + qx) * 4;
            const inf = au[q + 1] * (k < 4 ? c.ghostDecay : decay2);
            if (inf > best) {
              best = inf;
              bq = q;
            }
          }
          if (best >= c.ghostMin) {
            lin = st[bq + 2];
            g0 = ge[bq]; g1 = ge[bq + 1]; g2 = ge[bq + 2]; g3 = ge[bq + 3];
            hue = au[bq];
            influence = best;
          } else {
            lin = 0;
            influence = 0;
          }
        }

        let U = 0;
        if (lin > 0.5) {
          const R = g0 * c.radiusScale;
          const lod = Math.max(0, Math.log2(R / c.lodGap));
          let l0 = Math.floor(lod);
          let fr = lod - l0;
          if (l0 >= maxLevel) {
            l0 = maxLevel;
            fr = 0;
          }
          const cx = px + 0.5;
          const cy = py + 0.5;
          for (let t = 0; t < ntaps; t += 4) {
            const x = cx + taps[t] * R;
            const y = cy + taps[t + 1] * R;
            let v = this.bilinear(l0, x, y);
            if (fr > 0) v += (this.bilinear(l0 + 1, x, y) - v) * fr;
            U += taps[t + 2] * v;
          }
        }

        const food = (nut / (nut + c.nutHalf)) * (1 + c.nutHalf);
        const mu = g1 + c.muOffset;
        const sig = Math.max(1e-4, g2 * c.sigmaScale * (1 - c.nutrientWidth + c.nutrientWidth * food));
        const app = Math.max(0, g3 * c.appetiteScale);
        const d = (U - mu) / sig;
        let G = 2 * Math.exp(-0.5 * d * d) - 1;
        if (G > 0) G *= food * Math.max(0, 1 + c.appetiteGrowth * (app - 0.5));
        G -= c.starvation * Math.max(0, 1 - nut / Math.max(c.starveBelow, 1e-4));
        G -= c.senescence * smoothstep(c.senescenceAge[0], c.senescenceAge[1], age);
        if (lin < 0.5) G = -1;
        const nv = clamp(vit + c.dt * G, 0, 1);

        const xp = ((py * n + ((px + 1) % n)) * 4) + 1;
        const xm = ((py * n + ((px - 1 + n) % n)) * 4) + 1;
        const yp = ((((py + 1) % n) * n + px) * 4) + 1;
        const ym = ((((py - 1 + n) % n) * n + px) * 4) + 1;
        const lap = st[xp] + st[xm] + st[yp] + st[ym] - 4 * nut;
        const consume = Math.min(nut, (nv * app * c.consumption * nut) / (nut + c.uptakeHalf + 1e-6));
        const nn = clamp(nut + c.diffusion * lap + regen * fert[py * n + px] * (1 - nut) - consume, 0, 1);

        const nowAlive = nv >= c.aliveT && lin > 0.5;
        const nage = nowAlive ? (alive ? age + 1 : 0) : 0;
        if (nowAlive && !alive) {
          rng.s = (hash((px + py * 65536) >>> 0) ^ seed) >>> 0;
          const m = c.mutationRate;
          g0 = clamp(g0 * (1 + c.mutSigma[0] * m * rng.gauss()), c.radiusBounds[0], c.radiusBounds[1]);
          g1 = clamp(g1 * (1 + c.mutSigma[1] * m * rng.gauss()), c.muBounds[0], c.muBounds[1]);
          g2 = clamp(g2 * (1 + c.mutSigma[2] * m * rng.gauss()), c.sigmaBounds[0], c.sigmaBounds[1]);
          g3 = clamp(g3 * (1 + c.mutSigma[3] * m * rng.gauss()), c.appetiteBounds[0], c.appetiteBounds[1]);
          hue = fract(hue + c.mutHue * m * rng.gauss());
        }
        if (nowAlive) influence = nv;

        const dep = Math.max(0, vit - nv) * c.sedRate;
        const th = se[i + 3] + dep;
        let p0 = se[i], p1 = se[i + 1], p2 = se[i + 2];
        if (dep > 0) {
          hueColor(hue, col);
          const k = dep / Math.max(Math.min(th, c.sedMemory), 1e-6);
          p0 += (col[0] - p0) * k;
          p1 += (col[1] - p1) * k;
          p2 += (col[2] - p2) * k;
        }
        p0 += (c.earth[0] - p0) * c.sedDarken;
        p1 += (c.earth[1] - p1) * c.sedDarken;
        p2 += (c.earth[2] - p2) * c.sedDarken;

        ost[i] = nv; ost[i + 1] = nn; ost[i + 2] = lin; ost[i + 3] = nage;
        oge[i] = g0; oge[i + 1] = g1; oge[i + 2] = g2; oge[i + 3] = g3;
        oau[i] = hue; oau[i + 1] = influence; oau[i + 2] = nv - vit; oau[i + 3] = 0;
        ose[i] = p0; ose[i + 1] = p1; ose[i + 2] = p2; ose[i + 3] = th;
      }
    }
    this.swap();
  }

  stamp(s: StampArgs): void {
    const n = this.size;
    const st = this.cur[STATE], ge = this.cur[GENOME], au = this.cur[AUX];
    const rng = this.rng;
    for (let py = 0; py < n; py++) {
      for (let px = 0; px < n; px++) {
        let dx = px + 0.5 - s.x;
        let dy = py + 0.5 - s.y;
        dx -= n * Math.floor(dx / n + 0.5);
        dy -= n * Math.floor(dy / n + 0.5);
        const r = Math.sqrt(dx * dx + dy * dy) / Math.max(1, s.radius);
        if (r >= 1) continue;
        const i = (py * n + px) * 4;
        if (s.mode === 0) {
          rng.s = (hash((px + py * 65536) >>> 0) ^ s.seed) >>> 0;
          const f = 1 - smoothstep(0.55, 1, r);
          const v = f * s.density * rng.rnd();
          if (f > 0.02) {
            st[i] = Math.max(v, st[i] * (1 - f));
            st[i + 1] = Math.min(1, st[i + 1] + s.nutrientBoost * f);
            st[i + 2] = s.lineage;
            st[i + 3] = 0;
            ge.set(s.gene, i);
            au[i] = s.hue;
            au[i + 1] = Math.max(v, s.aliveT);
            au[i + 2] = 0;
            au[i + 3] = 0;
          }
        } else if (Math.abs(st[i + 2] - s.fromLineage) < 0.5 && st[i] >= s.aliveT) {
          st[i + 2] = s.lineage;
          ge.set(s.gene, i);
          au[i] = s.hue;
        }
      }
    }
  }

  read(index: number): Float32Array {
    return this.cur[index];
  }

  upload(data: Float32Array[]): void {
    data.forEach((d, i) => this.cur[i].set(d));
  }

  dispose(): void {}

  /** Carte de fertilité, recalculée seulement quand le temps ou le contraste change. */
  private fertilityMap(t: number): Float32Array {
    const key = t + ':' + this.c.fertility;
    if (key === this.fertKey) return this.fert;
    this.fertKey = key;
    const n = this.size;
    const period = fertilityPeriod(n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        this.fert[y * n + x] = this.c.fertility > 0 ? fertility((x + 0.5) / n, (y + 0.5) / n, period, t, this.c.fertility) : 1;
      }
    }
    return this.fert;
  }

  private swap(): void {
    const t = this.cur;
    this.cur = this.next;
    this.next = t;
  }

  private buildMips(): void {
    const st = this.cur[STATE];
    const m0 = this.mips[0];
    for (let i = 0; i < m0.length; i++) m0[i] = st[i * 4];
    for (let l = 1; l < this.mips.length; l++) {
      const src = this.mips[l - 1];
      const dst = this.mips[l];
      const s = this.size >> l;
      const ss = s * 2;
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const a = (y * 2) * ss + x * 2;
          dst[y * s + x] = 0.25 * (src[a] + src[a + 1] + src[a + ss] + src[a + ss + 1]);
        }
      }
    }
  }

  /** Lecture bilinéaire répétée (REPEAT) au niveau l, en coordonnées de case du niveau 0. */
  private bilinear(l: number, x: number, y: number): number {
    const s = this.size >> l;
    const m = this.mips[l];
    const inv = 1 / (1 << l);
    const fx = x * inv - 0.5;
    const fy = y * inv - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const ax = fx - ix;
    const ay = fy - iy;
    const x0 = ((ix % s) + s) % s;
    const x1 = (x0 + 1) % s;
    const y0 = (((iy % s) + s) % s) * s;
    const y1 = ((((iy + 1) % s) + s) % s) * s;
    const a = m[y0 + x0], b = m[y0 + x1], c = m[y1 + x0], d = m[y1 + x1];
    return a + (b - a) * ax + (c - a + (a - b - c + d) * ax) * ay;
  }
}
