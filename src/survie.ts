// Banc d'essai headless : pilote la simulation sans interface, pour mesurer
// sa survie sur de longues durées (voir scripts/survie.mjs).

import { TICKS_PER_DAY } from './sim/config';
import type { Params } from './sim/config';
import { daylight } from './sim/calendar';
import { Organisme } from './sim/organisme';
import { GpuBackend } from './sim/gpu/backend';
import { GRID_SIZE } from './sim/config';
import { CpuBackend } from './sim/cpu/backend';
import { Renderer } from './render/renderer';
import type { Layer } from './render/renderer';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })!;
let sim: Organisme;
let gpu: GpuBackend;
let renderer: Renderer;

const harness = {
  _sim: () => sim,
  init(seed: number, params: Partial<Params> = {}, spores = 10, size?: number) {
    sim?.dispose();
    renderer?.dispose();
    gpu = new GpuBackend(gl, size ?? GRID_SIZE);
    sim = new Organisme(gpu, { seed, params });
    renderer = new Renderer(gl, sim.size);
    sim.seedRandom(spores);
    return sim.census();
  },
  /** Joue n ticks par paquets et renvoie la durée en ms. */
  run(ticks: number) {
    const t0 = performance.now();
    let left = ticks;
    while (left > 0) {
      const k = Math.min(left, 240);
      sim.runTicks(k);
      left -= k;
    }
    const st = sim.census();
    return { ms: performance.now() - t0, stats: st, day: sim.tick / TICKS_PER_DAY };
  },
  /** Joue des jours entiers et renvoie les statistiques à chaque jour. */
  runDays(days: number) {
    const out = [];
    for (let d = 0; d < days; d++) out.push(harness.run(TICKS_PER_DAY));
    return out;
  },
  render(layer: Layer = 'final') {
    renderer.render(gpu.textures, canvas.width, canvas.height, { centerX: canvas.width / 2, centerY: canvas.height / 2, scale: canvas.width, clip: false }, layer, performance.now() / 1000, daylight(sim.tick));
    gl.finish();
  },
  genomeStats() {
    const s = sim.getState();
    const acc = { radius: 0, mu: 0, sigma: 0, appetite: 0, n: 0 };
    for (let i = 0; i < s.vitality.length; i++) {
      if (s.vitality[i] < 0.03 || s.lineage[i] < 0.5) continue;
      acc.radius += s.radius[i]; acc.mu += s.mu[i]; acc.sigma += s.sigma[i]; acc.appetite += s.appetite[i]; acc.n++;
    }
    const n = Math.max(1, acc.n);
    return { radius: acc.radius / n, mu: acc.mu / n, sigma: acc.sigma / n, appetite: acc.appetite / n, n: acc.n };
  },
  lineages() {
    return [...sim.lineages.values()].map((l) => ({ id: l.id, parent: l.parentId, area: l.area, peak: l.peakArea, extinct: l.extinctTick }));
  },
  /** Compare les moteurs GPU et CPU sur les mêmes conditions initiales. */
  compare(ticks: number, size = 64, params: Partial<Params> = {}) {
    const a = new Organisme(new GpuBackend(gl, size), { seed: 7, params });
    const b = new Organisme(new CpuBackend(size), { seed: 7, params });
    a.seedRandom(3);
    b.seedRandom(3);
    const out = [];
    for (const k of [1, ticks]) {
      const done = a.tick;
      a.runTicks(k - done);
      b.runTicks(k - done);
      const sa = a.getState();
      const sb = b.getState();
      const diff = (x: Float32Array, y: Float32Array) => x.reduce((m, v, i) => Math.max(m, Math.abs(v - y[i])), 0);
      let linMismatch = 0;
      for (let i = 0; i < sa.lineage.length; i++) if (sa.lineage[i] !== sb.lineage[i]) linMismatch++;
      out.push({
        tick: k,
        vitalite: diff(sa.vitality, sb.vitality),
        nutriments: diff(sa.nutrients, sb.nutrients),
        rayon: diff(sa.radius, sb.radius),
        sediment: diff(sa.sediment, sb.sediment),
        lignees: linMismatch,
        biomasse: [a.census().biomass, b.census().biomass],
      });
    }
    a.dispose();
    return out;
  },
  /** Charge une sauvegarde (par exemple produite par le banc CPU) pour la rendre. */
  async load(url: string) {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const size = new DataView(bytes.buffer).getUint32(0, true) && JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + new DataView(bytes.buffer).getUint32(0, true)))).size;
    sim?.dispose();
    renderer?.dispose();
    gpu = new GpuBackend(gl, size);
    sim = new Organisme(gpu);
    renderer = new Renderer(gl, size);
    sim.restore(bytes);
    return sim.census();
  },
  roundTrip() {
    const bytes = sim.serialize();
    const before = sim.census();
    sim.restore(bytes);
    const after = sim.census();
    return { bytes: bytes.length, before, after };
  },
};

(window as unknown as { harness: typeof harness }).harness = harness;
(window as unknown as { ready: boolean }).ready = true;
