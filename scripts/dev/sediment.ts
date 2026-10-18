// Percentiles d'épaisseur du sédiment dans une sauvegarde.
import { readFileSync } from 'node:fs';
import { decodeSave } from '../../src/sim/serialize';
const { state } = decodeSave(new Uint8Array(readFileSync(process.argv[2])));
const s = [...state.sediment].sort((a, b) => a - b);
const p = (q: number) => s[Math.floor(q * (s.length - 1))].toFixed(3);
console.log(`jour ${(state.tick / 2400).toFixed(1)} sédiment p5 ${p(0.05)} p25 ${p(0.25)} p50 ${p(0.5)} p75 ${p(0.75)} p95 ${p(0.95)} max ${p(1)}`);
