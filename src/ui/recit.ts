// Le récit : ce que le monde raconte au visiteur, centré sur sa famille
// (la filiation). Transforme le journal et les registres de la simulation
// en phrases courtes.

import { TICKS_PER_DAY } from '../sim/config';
import type { Organisme } from '../sim/organisme';
import type { Lineage, WorldEvent } from '../sim/types';
import { formatDate, formatDuration, isMine, lineageColor } from './story';

/** Extinctions du monde qui méritent d'être racontées (surface maximale atteinte). */
const NOTABLE_PEAK = 300;
/** Événements du monde gardés dans un récit. */
const WORLD_LINES = 5;

export function nameOf(sim: Organisme, id: number | null, pseudo: string): string {
  if (id === null) return 'un sol vide';
  const l = sim.lineages.get(id);
  if (!l) return `n°${id}`;
  const n = l.name ? `« ${l.name} »` : `n°${l.id}`;
  if (isMine(l.visitor, pseudo)) return `ta lignée ${n}`;
  return l.visitor ? `${n} de ${l.visitor}` : n;
}

/** Lignées des familles fondées par le visiteur (ses spores et toutes leurs descendantes). */
export function myFamily(sim: Organisme, pseudo: string): Set<number> {
  const roots = [...sim.lineages.values()].filter((l) => l.origin === 'spore' && isMine(l.visitor, pseudo));
  return new Set(roots.flatMap((l) => sim.descendants(l.id)));
}

const CAUSE_TEXT: Record<string, string> = {
  faim: 'affamée',
  vieillesse: 'de vieillesse',
  repli: 'en s’étiolant',
};

export function eventText(e: WorldEvent, sim: Organisme, pseudo: string, family: Set<number>): string {
  const name = (id: number | null) => nameOf(sim, id, pseudo);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  switch (e.kind) {
    case 'depot': {
      const who = isMine(e.visitor, pseudo) ? 'Tu déposes' : `${e.visitor} dépose`;
      const l = sim.lineages.get(e.lineage);
      const what = l?.name ? `« ${l.name} »` : 'une spore';
      if (e.other === null) return `${who} ${what} sur un sol vide.`;
      const graft = family.has(e.other) && !isMine(e.visitor, pseudo) ? ' Ta famille a une nouvelle descendante.' : '';
      return `${who} ${what} chez ${name(e.other)} : elle en descend.${graft}`;
    }
    case 'sous-lignee':
      return `Une sous-lignée naît au cœur de ${name(e.other)}.`;
    case 'extinction': {
      const how = e.cause === 'conquete' ? `, conquise par ${name(e.other)}` : e.cause ? `, ${CAUSE_TEXT[e.cause]}` : '';
      const born = sim.lineages.get(e.lineage)?.bornTick ?? e.tick;
      return `${cap(name(e.lineage))} s'éteint après ${formatDuration(e.tick - born)}${how}.`;
    }
    case 'conquete':
      return `${cap(name(e.lineage))} prend ${e.n} cases à ${name(e.other)}.`;
    case 'famine':
      return `Jour de famine : la faim tue ${e.n} fois plus que d'habitude.`;
    case 'anciennete': {
      const mine = isMine(e.visitor, pseudo);
      return `${mine ? 'Ta famille' : `La famille de ${name(e.lineage)}`} vit depuis ${e.n} jour${e.n > 1 ? 's' : ''}.`;
    }
  }
}

/** Un événement concerne-t-il la famille du visiteur ? */
export function concernsFamily(e: WorldEvent, family: Set<number>): boolean {
  return family.has(e.lineage) || (e.other !== null && family.has(e.other));
}

// --- Pendant ton absence ---------------------------------------------------------

export interface FamilyRecap {
  rootId: number;
  title: string;
  color: string;
  alive: boolean;
  lines: string[];
}

export interface Recap {
  from: number;
  to: number;
  families: FamilyRecap[];
  world: string[];
}

function areaAt(l: Lineage, t: number): number {
  let v = 0;
  for (let i = 0; i < l.history.length && l.history[i] <= t; i += 4) v = l.history[i + 1];
  return v;
}

function pct(part: number, total: number): string {
  return `${Math.round((100 * part) / Math.max(total, 1))} %`;
}

/** Ce qui est arrivé aux familles du visiteur, et au monde, entre deux instants. */
export function buildRecap(sim: Organisme, from: number, to: number, pseudo: string): Recap {
  const roots = [...sim.lineages.values()].filter((l) => l.origin === 'spore' && isMine(l.visitor, pseudo));
  const allFamily = myFamily(sim, pseudo);
  const fromDay = Math.floor(from / TICKS_PER_DAY);
  const toDay = Math.floor((to - 1) / TICKS_PER_DAY);
  const families: FamilyRecap[] = [];

  for (const root of roots) {
    const ids = sim.descendants(root.id);
    const members = ids.map((id) => sim.lineages.get(id)!);
    const before = members.reduce((s, m) => s + areaAt(m, from), 0);
    const after = members.reduce((s, m) => s + m.area, 0);
    const bornInside = members.filter((m) => m.bornTick > from && m.bornTick <= to && m.id !== root.id);
    if (before === 0 && after === 0 && root.bornTick <= from && bornInside.length === 0) continue;
    const lines: string[] = [];
    const title = root.name ? `« ${root.name} »` : `Lignée n°${root.id}`;

    if (root.bornTick > from) lines.push(`Déposée le ${formatDate(root.bornTick)}.`);
    if (after === 0) {
      const last = Math.max(...members.map((m) => m.extinctTick ?? 0));
      lines.push(`Ta famille s'est éteinte le ${formatDate(last)}. Il reste son sédiment.`);
    } else if (before > 0) {
      const trend = after > before * 1.1 ? 'grandi' : after < before * 0.9 ? 'reculé' : 'tenu';
      lines.push(`Elle a ${trend} : ${before} cases, puis ${after}.`);
    } else {
      lines.push(`Elle couvre ${after} cases.`);
    }

    // Pertes et gains de la famille, sans compter les échanges entre ses propres lignées.
    let faim = 0, vieux = 0, repli = 0, gained = 0;
    const lost = new Map<number, number>();
    const won = new Map<number, number>();
    for (const m of members) {
      for (const d of m.ledger) {
        if (d.day < fromDay || d.day > toDay) continue;
        faim += d.faim;
        vieux += d.vieillesse;
        repli += d.repli;
        gained += d.gained;
        for (const [k, v] of Object.entries(d.lostTo)) if (!ids.includes(Number(k))) lost.set(Number(k), (lost.get(Number(k)) ?? 0) + v);
        for (const [k, v] of Object.entries(d.wonFrom)) if (!ids.includes(Number(k))) won.set(Number(k), (won.get(Number(k)) ?? 0) + v);
      }
    }
    // Les cases meurent et renaissent sans cesse : on raconte les forces, pas des totaux.
    const lostOthers = [...lost.values()].reduce((a, b) => a + b, 0);
    const losses = faim + vieux + repli + lostOthers;
    if (losses > 0) {
      const top = [...lost.entries()].sort((a, b) => b[1] - a[1])[0];
      const forces: [number, string][] = [
        [faim, 'la faim'],
        [lostOthers, top ? `${nameOf(sim, top[0], pseudo)}, qui lui a pris du terrain` : ''],
        [vieux, 'la vieillesse'],
        [repli, 'l’étiolement'],
      ];
      const parts = forces.filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([v, t]) => `${t} (${pct(v, losses)})`);
      lines.push(`Ce qui l'a affaiblie : ${parts.join(', puis ')}.`);
    }
    const wonOthers = [...won.values()].reduce((a, b) => a + b, 0);
    if (gained + wonOthers > 0) {
      const top = [...won.entries()].sort((a, b) => b[1] - a[1])[0];
      lines.push(`Ce qui l'a nourrie : ${wonOthers > gained && top ? `le terrain pris à ${nameOf(sim, top[0], pseudo)}` : 'le sol libre autour d’elle'}.`);
    }

    for (const m of bornInside) {
      if (m.origin === 'sous-lignee') lines.push(`Une sous-lignée est née le ${formatDate(m.bornTick)}.`);
      else if (isMine(m.visitor, pseudo)) lines.push(`Tu y as greffé ${m.name ? `« ${m.name} »` : 'une spore'}.`);
      else lines.push(`${m.visitor ?? 'Quelqu’un'} y a greffé ${m.name ? `« ${m.name} »` : 'une spore'} : elle descend de toi.`);
    }
    for (const m of members) {
      if (m.extinctTick !== null && m.area === 0 && m.extinctTick > from && m.extinctTick <= to && m.id !== root.id) {
        lines.push(`${m.name ? `« ${m.name} »` : `n°${m.id}`} s'est éteinte.`);
      }
    }
    const alive = members.filter((m) => m.area > 0).length;
    if (alive > 1) lines.push(`Elle vit à travers ${alive} lignées.`);
    families.push({ rootId: root.id, title, color: lineageColor(root.founder.hue), alive: after > 0, lines });
  }

  const period = sim.events.filter((e) => e.tick > from && e.tick <= to && !concernsFamily(e, allFamily));
  const world: string[] = [];
  const visitors = [...new Set(period.filter((e) => e.kind === 'depot' && e.visitor).map((e) => e.visitor!))];
  if (visitors.length) {
    const who = visitors.length > 1 ? `${visitors.slice(0, -1).join(', ')} et ${visitors.at(-1)}` : visitors[0];
    world.push(`${who} ${visitors.length > 1 ? 'ont' : 'a'} déposé leur spore du jour.`);
  }
  const notable = period.filter((e) => e.kind === 'extinction' && (sim.lineages.get(e.lineage)?.peakArea ?? 0) >= NOTABLE_PEAK);
  const conquests = period.filter((e) => e.kind === 'conquete').sort((a, b) => b.n - a.n).slice(0, 2);
  const famine = period.filter((e) => e.kind === 'famine');
  for (const e of [...famine, ...notable, ...conquests].slice(0, WORLD_LINES - world.length)) world.push(eventText(e, sim, pseudo, allFamily));

  families.sort((a, b) => Number(b.alive) - Number(a.alive));
  return { from, to, families, world };
}

// --- Objectif du jour ---------------------------------------------------------------

/** Une question en une ligne, tournée vers la filiation, qui donne envie de revenir. */
export function objective(sim: Organisme, pseudo: string): string {
  const roots = [...sim.lineages.values()].filter((l) => l.origin === 'spore' && isMine(l.visitor, pseudo));
  if (!roots.length) return 'Dépose ta première spore : elle héritera de sa voisine.';
  const families = roots.map((r) => {
    const members = sim.descendants(r.id).map((id) => sim.lineages.get(id)!);
    return { root: r, members, alive: members.filter((m) => m.area > 0) };
  });
  const living = families.filter((f) => f.alive.length).sort((a, b) => a.root.bornTick - b.root.bornTick);
  if (!living.length) return 'Ta famille s’est éteinte. Greffe une spore sur une famille vivante pour continuer une lignée.';
  const f = living[0];
  const name = f.root.name ? `« ${f.root.name} »` : `Ta lignée n°${f.root.id}`;
  const age = formatDuration(sim.tick - f.root.bornTick);
  const heirs = f.alive.filter((m) => m.id !== f.root.id);
  const grafted = heirs.filter((m) => m.visitor && !isMine(m.visitor, pseudo)).length;
  if (!heirs.length) return `${name} vit depuis ${age}. Une spore déposée sur son territoire deviendrait sa première descendante.`;
  const by = grafted ? `, dont ${grafted} greffée${grafted > 1 ? 's' : ''} par d'autres` : '';
  const self = f.root.area > 0 ? '' : ' Elle-même s’est éteinte, mais sa lignée continue.';
  return `${name} vit depuis ${age} à travers ${heirs.length} descendante${heirs.length > 1 ? 's' : ''}${by}.${self}`;
}

// --- Arbre de famille -----------------------------------------------------------------

export interface TreeNode {
  id: number;
  depth: number;
  label: string;
  who: string;
  color: string;
  alive: boolean;
  area: number;
}

/** Arbre des descendantes d'une lignée, en profondeur d'abord. */
export function familyTree(sim: Organisme, id: number, pseudo: string): TreeNode[] {
  const children = new Map<number, Lineage[]>();
  for (const l of sim.lineages.values()) {
    if (l.parentId === null) continue;
    const c = children.get(l.parentId) ?? [];
    c.push(l);
    children.set(l.parentId, c);
  }
  const out: TreeNode[] = [];
  const walk = (l: Lineage, depth: number) => {
    out.push({
      id: l.id,
      depth,
      label: l.name ? `« ${l.name} »` : `n°${l.id}`,
      who: l.origin === 'sous-lignee' ? 'sous-lignée' : isMine(l.visitor, pseudo) ? 'toi' : (l.visitor ?? 'graine'),
      color: lineageColor(l.founder.hue),
      alive: l.area > 0,
      area: l.area,
    });
    for (const c of (children.get(l.id) ?? []).sort((a, b) => a.bornTick - b.bornTick)) walk(c, depth + 1);
  };
  const root = sim.lineages.get(id);
  if (root) walk(root, 0);
  return out;
}
