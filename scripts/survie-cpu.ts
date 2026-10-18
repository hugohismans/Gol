// Banc de survie sur CPU (Node), sans navigateur ni GPU.
// Usage : npx tsx scripts/survie-cpu.ts [jours=30] [taille=128] [graine=1] ['{"param": valeur}']
// Variables : SPORES (10), PAS (ticks par ligne, 2400), SAUVE (fichier .bin écrit à la fin).

import { writeFileSync } from 'node:fs';
import { CpuBackend } from '../src/sim/cpu/backend';
import { Organisme } from '../src/sim/organisme';
import { TICKS_PER_DAY } from '../src/sim/config';
import { dateOf } from '../src/sim/calendar';

const days = Number(process.argv[2] ?? 30);
const size = Number(process.argv[3] ?? 128);
const seed = Number(process.argv[4] ?? 1);
const params = JSON.parse(process.argv[5] ?? '{}');
const spores = Number(process.env.SPORES ?? 10);
const chunk = Number(process.env.PAS ?? TICKS_PER_DAY);

const sim = new Organisme(new CpuBackend(size), { seed, params });
sim.seedRandom(spores);
const t0 = Date.now();
const steps = Math.round((days * TICKS_PER_DAY) / chunk);
let minLiving = Infinity;
let frozen = 0;
let prevVit: Float32Array | null = null;

for (let k = 1; k <= steps; k++) {
  const t = Date.now();
  sim.runTicks(chunk);
  const s = sim.census();
  const st = sim.getState();
  // Moyenne des génomes vivants et part des cases dont la vitalité a bougé.
  let r = 0, mu = 0, sg = 0, ap = 0, n = 0, moved = 0;
  for (let i = 0; i < st.vitality.length; i++) {
    if (prevVit && Math.abs(st.vitality[i] - prevVit[i]) > 0.05) moved++;
    if (st.vitality[i] < 0.03 || st.lineage[i] < 0.5) continue;
    r += st.radius[i]; mu += st.mu[i]; sg += st.sigma[i]; ap += st.appetite[i]; n++;
  }
  prevVit = st.vitality;
  n = Math.max(n, 1);
  const d = dateOf(sim.tick);
  const pct = (100 * s.livingCells) / (size * size);
  const changed = (100 * moved) / (size * size);
  if (k > 1 && changed < 0.5 && s.livingCells > 0) frozen++;
  minLiving = Math.min(minLiving, s.livingCells);
  console.log(
    `j${(sim.tick / TICKS_PER_DAY).toFixed(2).padStart(6)} ${d.season.padEnd(9)} vie ${pct.toFixed(1).padStart(5)}%` +
      ` lignées ${String(s.livingLineages).padStart(3)}/${String(s.totalLineages).padEnd(4)}` +
      ` nut ${s.meanNutrients.toFixed(3)} bouge ${changed.toFixed(1).padStart(5)}%` +
      ` R ${(r / n).toFixed(2)} mu ${(mu / n).toFixed(4)} sig ${(sg / n).toFixed(4)} app ${(ap / n).toFixed(3)}` +
      `  ${((Date.now() - t) / chunk).toFixed(1)} ms/tick`,
  );
  if (s.livingCells === 0) {
    console.log('EXTINCTION');
    break;
  }
}
console.log(`BILAN vie_min ${minLiving} figé ${frozen} durée ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (process.env.SAUVE) writeFileSync(process.env.SAUVE, sim.serialize());
