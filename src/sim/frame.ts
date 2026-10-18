// Instantané compact du monde, pour le revoir plus tard (retour en arrière,
// et plus tard le timelapse). Ne garde que ce que le rendu affiche :
// vitalité, nutriments, teinte, lignée des cases vivantes, sédiment.

const FRAME_VERSION = 1;
const HEADER_BYTES = 16;
/** Résolution de l'épaisseur du sédiment (centièmes, jusqu'à 655). */
const SEDIMENT_STEP = 0.01;

export interface Frame {
  tick: number;
  size: number;
  meanSediment: number;
  /** Grilles RGBA prêtes à téléverser, au format des textures de simulation. */
  state: Float32Array;
  aux: Float32Array;
  sed: Float32Array;
}

const u8 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);

export function encodeFrame(tick: number, size: number, st: Float32Array, au: Float32Array, se: Float32Array, aliveT: number): Uint8Array {
  const n = size * size;
  // Ordre : lignées (u32, alignées), épaisseur (u16), puis 6 grilles d'octets.
  const out = new Uint8Array(HEADER_BYTES + n * 4 + n * 2 + n * 6);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, FRAME_VERSION);
  dv.setUint16(2, size, true);
  dv.setUint32(4, tick, true);
  let sedTotal = 0;
  for (let i = 0; i < n; i++) sedTotal += se[i * 4 + 3];
  dv.setFloat32(8, sedTotal / n, true);
  const lin = new Uint32Array(out.buffer, HEADER_BYTES, n);
  const th = new Uint16Array(out.buffer, HEADER_BYTES + n * 4, n);
  const bytes = HEADER_BYTES + n * 6;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const alive = st[j] >= aliveT && st[j + 2] > 0.5;
    lin[i] = alive ? st[j + 2] : 0;
    th[i] = Math.min(65535, Math.round(se[j + 3] / SEDIMENT_STEP));
    out[bytes + i] = u8(alive ? st[j] : 0);
    out[bytes + n + i] = u8(st[j + 1]);
    out[bytes + 2 * n + i] = u8(au[j]);
    out[bytes + 3 * n + i] = u8(se[j]);
    out[bytes + 4 * n + i] = u8(se[j + 1]);
    out[bytes + 5 * n + i] = u8(se[j + 2]);
  }
  return out;
}

export function decodeFrame(bytes: Uint8Array): Frame {
  const buf = bytes.byteOffset % 4 === 0 ? bytes : bytes.slice();
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint8(0) !== FRAME_VERSION) throw new Error('Version d’instantané inconnue');
  const size = dv.getUint16(2, true);
  const n = size * size;
  const lin = new Uint32Array(buf.buffer, buf.byteOffset + HEADER_BYTES, n);
  const th = new Uint16Array(buf.buffer, buf.byteOffset + HEADER_BYTES + n * 4, n);
  const b = HEADER_BYTES + n * 6;
  const state = new Float32Array(n * 4);
  const aux = new Float32Array(n * 4);
  const sed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    state[j] = buf[b + i] / 255;
    state[j + 1] = buf[b + n + i] / 255;
    state[j + 2] = lin[i];
    aux[j] = buf[b + 2 * n + i] / 255;
    sed[j] = buf[b + 3 * n + i] / 255;
    sed[j + 1] = buf[b + 4 * n + i] / 255;
    sed[j + 2] = buf[b + 5 * n + i] / 255;
    sed[j + 3] = th[i] * SEDIMENT_STEP;
  }
  return { tick: dv.getUint32(4, true), size, meanSediment: dv.getFloat32(8, true), state, aux, sed };
}
