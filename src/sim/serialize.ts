// Format binaire compact d'une sauvegarde : un en-tête JSON puis des grilles
// quantifiées. Indépendant du DOM et du GPU.

import { GENOME_BOUNDS, SAVE_VERSION } from './config';
import type { Params } from './config';
import type { Lineage, SimState, WorldEvent } from './types';

export interface SaveHeader {
  version: number;
  size: number;
  tick: number;
  nextLineageId: number;
  rngSeed: number;
  params: Params;
  lineages: Lineage[];
  events?: WorldEvent[];
  closedDay?: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function q16(v: Float32Array, lo: number, hi: number): Uint16Array {
  const out = new Uint16Array(v.length);
  const k = 65535 / (hi - lo);
  for (let i = 0; i < v.length; i++) out[i] = Math.round(Math.min(hi, Math.max(lo, v[i])) * k - lo * k);
  return out;
}

function dq16(v: Uint16Array, lo: number, hi: number): Float32Array {
  const out = new Float32Array(v.length);
  const k = (hi - lo) / 65535;
  for (let i = 0; i < v.length; i++) out[i] = lo + v[i] * k;
  return out;
}

function q8(v: Float32Array): Uint8Array {
  const out = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, v[i])) * 255);
  return out;
}

function dq8(v: Uint8Array): Float32Array {
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / 255;
  return out;
}

export function encodeSave(header: SaveHeader, s: SimState): Uint8Array {
  const b = GENOME_BOUNDS;
  const sections: ArrayBufferView[] = [
    q16(s.vitality, 0, 1),
    q16(s.nutrients, 0, 1),
    q16(s.radius, b.radius[0], b.radius[1]),
    q16(s.mu, b.mu[0], b.mu[1]),
    q16(s.sigma, b.sigma[0], b.sigma[1]),
    q16(s.appetite, b.appetite[0], b.appetite[1]),
    q16(s.hue, 0, 1),
    s.lineage,
    s.age,
    s.sediment,
    q8(s.sedimentColor),
  ];
  const head = enc.encode(JSON.stringify(header));
  // Aligne les sections sur 4 octets pour pouvoir les relire en vues typées.
  const headPadded = (head.length + 3) & ~3;
  let total = 4 + headPadded;
  for (const sec of sections) total += (sec.byteLength + 3) & ~3;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, 4);
  let off = 4 + headPadded;
  for (const sec of sections) {
    out.set(new Uint8Array(sec.buffer, sec.byteOffset, sec.byteLength), off);
    off += (sec.byteLength + 3) & ~3;
  }
  return out;
}

export function decodeSave(bytes: Uint8Array): { header: SaveHeader; state: SimState } {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const headLen = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(dec.decode(new Uint8Array(buf, 4, headLen))) as SaveHeader;
  if (header.version !== SAVE_VERSION) throw new Error('Version de sauvegarde inconnue : ' + header.version);
  const n = header.size * header.size;
  let off = 4 + ((headLen + 3) & ~3);
  const take16 = () => {
    const v = new Uint16Array(buf, off, n);
    off += (n * 2 + 3) & ~3;
    return v;
  };
  const take32 = () => {
    const v = new Float32Array(buf.slice(off, off + n * 4));
    off += n * 4;
    return v;
  };
  const b = GENOME_BOUNDS;
  const vitality = dq16(take16(), 0, 1);
  const nutrients = dq16(take16(), 0, 1);
  const radius = dq16(take16(), b.radius[0], b.radius[1]);
  const mu = dq16(take16(), b.mu[0], b.mu[1]);
  const sigma = dq16(take16(), b.sigma[0], b.sigma[1]);
  const appetite = dq16(take16(), b.appetite[0], b.appetite[1]);
  const hue = dq16(take16(), 0, 1);
  const lineage = take32();
  const age = take32();
  const sediment = take32();
  const sedimentColor = dq8(new Uint8Array(buf, off, n * 3));
  return {
    header,
    state: {
      tick: header.tick,
      size: header.size,
      vitality, nutrients, lineage, age, radius, mu, sigma, appetite, hue, sediment, sedimentColor,
    },
  };
}
