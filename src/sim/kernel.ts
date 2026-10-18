// Kernel en anneau type Lenia, échantillonné par taps polaires à rayon unité.
// Chaque case multiplie ces offsets par son propre rayon : le coût ne dépend
// pas du rayon du génome.

import { KERNEL_MIN_TAPS_PER_RING, KERNEL_RINGS, KERNEL_TAP_DENSITY } from './config';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Coque "bump" de Lenia, maximale à r = 0.5, nulle en 0 et en 1. */
export function kernelShell(r: number): number {
  if (r <= 0 || r >= 1) return 0;
  return Math.exp(4 - 1 / (r * (1 - r)));
}

/** Taps (dx, dy, poids, 0) à rayon unité, poids normalisés à une somme de 1. */
export function buildKernelTaps(): Float32Array {
  const taps: number[] = [];
  let total = 0;
  for (let i = 0; i < KERNEL_RINGS; i++) {
    const r = (i + 0.5) / KERNEL_RINGS;
    const n = Math.max(KERNEL_MIN_TAPS_PER_RING, Math.round(KERNEL_TAP_DENSITY * 2 * Math.PI * r));
    // Poids d'un tap : valeur du kernel fois l'aire de l'anneau partagée entre ses taps.
    const w = (kernelShell(r) * r) / n;
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n + i * GOLDEN_ANGLE;
      taps.push(Math.cos(a) * r, Math.sin(a) * r, w, 0);
      total += w;
    }
  }
  for (let j = 2; j < taps.length; j += 4) taps[j] /= total;
  return new Float32Array(taps);
}
