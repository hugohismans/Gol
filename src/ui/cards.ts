// Phrases courtes décrivant l'état d'une lignée, partagées par les panneaux.

import { formatDuration } from './story';
import type { SporeCard } from './story';

export function status(c: SporeCard): string {
  if (c.area > 0) return `vivante · ${c.area} cases`;
  const age = c.extinctTick !== null ? ` après ${formatDuration(c.extinctTick - c.bornTick)}` : '';
  return `éteinte${age}`;
}

export function family(c: SporeCard): string {
  if (!c.descendantsAlive) return '';
  const s = c.descendantsAlive > 1 ? 's' : '';
  return `${c.area > 0 ? 'et ' : 'survit à travers '}${c.descendantsAlive} descendante${s} vivante${s}`;
}
