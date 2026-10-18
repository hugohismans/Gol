// Sauvegarde du monde dans localStorage : octets compressés (deflate) en base64.

const WORLD_KEY = 'organisme.monde.v1';
const PREFS_KEY = 'organisme.prefs.v1';

export async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Renvoie la taille stockée en caractères, ou lève une erreur si le quota est dépassé. */
export async function saveWorld(bytes: Uint8Array): Promise<number> {
  const text = toBase64(await compress(bytes));
  localStorage.setItem(WORLD_KEY, text);
  return text.length;
}

export async function loadWorld(): Promise<Uint8Array | null> {
  const text = localStorage.getItem(WORLD_KEY);
  if (!text) return null;
  return decompress(fromBase64(text));
}

export function clearWorld(): void {
  localStorage.removeItem(WORLD_KEY);
}

export function savePrefs(prefs: object): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Préférences non essentielles.
  }
}

export function loadPrefs<T extends object>(): Partial<T> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<T>;
  } catch {
    return {};
  }
}
