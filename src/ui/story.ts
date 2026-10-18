// Ce que le visiteur peut lire de ses spores : fiches et histoires,
// calculées à partir du registre des lignées de la simulation.

import { dateOf } from '../sim/calendar';
import { CENSUS_INTERVAL_TICKS, TICKS_PER_DAY } from '../sim/config';
import { hueColor } from '../sim/cpu/backend';
import type { Organisme } from '../sim/organisme';
import type { Lineage, MutationKind } from '../sim/types';

/** Identité du visiteur dans le prototype (un cookie en phase 2). */
export const ME = 'moi';

/** Déplacement (en cases) au delà duquel on raconte une migration. */
const MIGRATION_CELLS = 30;

export const MUTATION_LABELS: Record<MutationKind, string> = {
  gourmande: 'plus gourmande',
  sobre: 'plus sobre',
  expansive: 'plus expansive',
  compacte: 'plus compacte',
  teinte: 'décalage de teinte',
};

export interface SporeCard {
  id: number;
  color: string;
  mutation: MutationKind | null;
  bornTick: number;
  area: number;
  peakArea: number;
  extinctTick: number | null;
  /** Descendantes vivantes (sans la lignée elle même) et leur surface totale. */
  descendantsAlive: number;
  descendantsArea: number;
}

export interface StoryPoint {
  tick: number;
  own: number;
  /** La lignée plus toutes ses descendantes. */
  family: number;
}

export interface StoryEvent {
  tick: number;
  text: string;
}

export interface Story {
  card: SporeCard;
  family: number[];
  points: StoryPoint[];
  events: StoryEvent[];
  /** Fin de l'histoire : maintenant, ou extinction de toute la famille. */
  endTick: number;
  familyExtinctTick: number | null;
}

export function formatDate(tick: number): string {
  const d = dateOf(tick);
  return `${d.dayOfMonth} ${d.month}, ${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
}

export function formatDuration(ticks: number): string {
  const days = ticks / TICKS_PER_DAY;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} h`;
  return `${Math.round(days * 10) / 10} j`.replace('.', ',');
}

export function lineageColor(hue: number): string {
  const c = [0, 0, 0];
  hueColor(hue, c);
  return `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;
}

export function sporeCard(sim: Organisme, l: Lineage): SporeCard {
  const family = sim.descendants(l.id).slice(1).map((id) => sim.lineages.get(id)!);
  const alive = family.filter((d) => d.area > 0);
  return {
    id: l.id,
    color: lineageColor(l.founder.hue),
    mutation: l.mutation,
    bornTick: l.bornTick,
    area: l.area,
    peakArea: l.peakArea,
    extinctTick: l.extinctTick,
    descendantsAlive: alive.length,
    descendantsArea: alive.reduce((s, d) => s + d.area, 0),
  };
}

/** Les spores déposées par le visiteur, les plus récentes d'abord. */
export function mySpores(sim: Organisme): SporeCard[] {
  return [...sim.lineages.values()]
    .filter((l) => l.visitor === ME)
    .sort((a, b) => b.bornTick - a.bornTick)
    .map((l) => sporeCard(sim, l));
}

/** Valeur d'une histoire en escalier au tick t (0 avant sa naissance). */
function areaAt(h: number[], t: number): number {
  let v = 0;
  for (let i = 0; i < h.length && h[i] <= t; i += 4) v = h[i + 1];
  return v;
}

/** Centre du territoire au tick t (dernier point connu), ou null avant la naissance. */
export function placeAt(l: Lineage, t: number): { x: number; y: number; area: number } | null {
  const h = l.history;
  let p: { x: number; y: number; area: number } | null = null;
  for (let i = 0; i < h.length && h[i] <= t; i += 4) p = { x: h[i + 2], y: h[i + 3], area: h[i + 1] };
  return p;
}

export function lineageStory(sim: Organisme, id: number): Story | null {
  const l = sim.lineages.get(id);
  if (!l) return null;
  const familyIds = sim.descendants(id);
  const family = familyIds.map((i) => sim.lineages.get(i)!);
  const allExtinct = family.every((f) => f.area === 0 && f.extinctTick !== null);
  const familyExtinctTick = allExtinct ? Math.max(...family.map((f) => f.extinctTick ?? 0)) : null;
  const endTick = familyExtinctTick ?? sim.tick;

  const ticks = new Set<number>();
  for (const f of family) for (let i = 0; i < f.history.length; i += 4) ticks.add(f.history[i]);
  ticks.add(endTick);
  const points = [...ticks]
    .filter((t) => t >= l.bornTick && t <= endTick)
    .sort((a, b) => a - b)
    .map((t) => ({ tick: t, own: areaAt(l.history, t), family: family.reduce((s, f) => s + areaAt(f.history, t), 0) }));

  const events: StoryEvent[] = [];
  const parent = l.parentId ? sim.lineages.get(l.parentId) : null;
  const how = l.mutation ? `, mutation ${MUTATION_LABELS[l.mutation]}` : '';
  events.push({
    tick: l.bornTick,
    text: parent ? `Déposée près de la lignée n°${parent.id}, dont elle hérite${how}.` : `Déposée sur un sol vide${how}.`,
  });

  let peak = { tick: l.bornTick, area: 0 };
  for (let i = 0; i < l.history.length; i += 4) if (l.history[i + 1] > peak.area) peak = { tick: l.history[i], area: l.history[i + 1] };
  // Au dépôt, la surface est celle de la spore elle même : un record n'a de sens qu'après.
  if (peak.area > 0 && peak.tick > l.bornTick + CENSUS_INTERVAL_TICKS) {
    events.push({ tick: peak.tick, text: `Plus grande étendue : ${peak.area} cases.` });
  }

  const origin = l.history.length ? { x: l.history[2], y: l.history[3] } : null;
  if (origin) {
    for (let i = 4; i < l.history.length; i += 4) {
      if (l.history[i + 1] === 0) continue;
      const dx = torus(l.history[i + 2] - origin.x, sim.size);
      const dy = torus(l.history[i + 3] - origin.y, sim.size);
      if (Math.hypot(dx, dy) > MIGRATION_CELLS) {
        events.push({ tick: l.history[i], text: `Son territoire s'est déplacé de plus de ${MIGRATION_CELLS} cases.` });
        break;
      }
    }
  }

  for (const d of family.slice(1)) {
    const by = d.visitor === ME ? 'par toi' : d.visitor ? 'par un visiteur' : '';
    const text =
      d.origin === 'sous-lignee'
        ? `Une sous-lignée apparaît : n°${d.id}${d.parentId !== id ? ` (issue de n°${d.parentId})` : ''}.`
        : `Spore n°${d.id} déposée ${by} sur son territoire ; elle en hérite${d.mutation ? `, ${MUTATION_LABELS[d.mutation]}` : ''}.`;
    events.push({ tick: d.bornTick, text: text.replace('  ', ' ') });
  }

  if (l.extinctTick !== null && l.area === 0) {
    events.push({ tick: l.extinctTick, text: `S'éteint après ${formatDuration(l.extinctTick - l.bornTick)}.` });
  }
  if (familyExtinctTick !== null && family.length > 1) {
    events.push({ tick: familyExtinctTick, text: 'Sa dernière descendante s’éteint. Il ne reste que le sédiment.' });
  }
  events.sort((a, b) => a.tick - b.tick);

  return { card: sporeCard(sim, l), family: familyIds, points, events, endTick, familyExtinctTick };
}

function torus(d: number, size: number): number {
  return Math.abs(d - size * Math.round(d / size));
}
