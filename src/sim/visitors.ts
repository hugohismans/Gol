// Visiteurs simulés (prototype) : de faux joueurs qui déposent une spore par
// jour selon leur style, pour éprouver un monde partagé avant le serveur.
// Ils passent par la même API qu'un vrai visiteur : inheritedGenome et plant.

import {
  ALIVE_THRESHOLD,
  EXPLORER_SAMPLES,
  LINEAGE_NAMES,
  NAMING_PROBABILITY,
  SIMULATED_VISITORS,
  STYLE_DNA,
  TICKS_PER_DAY,
} from './config';
import { STATE } from './backend';
import { NEUTRAL_DNA, applyDna } from './genome';
import type { Organisme } from './organisme';
import { Rng } from './rng';
import { DNA_GENES } from './types';
import type { Dna, VisitorStyle } from './types';

interface Visit {
  tick: number;
  pseudo: string;
  style: VisitorStyle;
}

export class SimulatedVisitors {
  private rng: Rng;
  private agenda: Visit[] = [];
  private plannedDay = -1;

  /** player : pseudo du vrai joueur, pour les visiteurs qui aiment se greffer sur sa famille. */
  constructor(private sim: Organisme, seed: number, private player: () => string) {
    this.rng = new Rng(seed);
  }

  /** À appeler avant chaque tick : programme la journée et fait passer les visiteurs à l'heure. */
  tick(t: number): void {
    const day = Math.floor(t / TICKS_PER_DAY);
    if (day !== this.plannedDay) this.plan(day, t);
    while (this.agenda.length && this.agenda[0].tick <= t) this.visit(this.agenda.shift()!);
  }

  private plan(day: number, now: number): void {
    this.plannedDay = day;
    this.agenda = [];
    for (const v of SIMULATED_VISITORS) {
      if (this.rng.next() > v.assiduity) continue;
      const tick = day * TICKS_PER_DAY + Math.floor(this.rng.next() * TICKS_PER_DAY);
      if (tick >= now) this.agenda.push({ tick, pseudo: v.pseudo, style: v.style });
    }
    this.agenda.sort((a, b) => a.tick - b.tick);
  }

  private visit(v: Visit): void {
    const spot = this.choose(v);
    if (!spot) return;
    const base = this.sim.inheritedGenome(spot.x, spot.y);
    const dna = this.dna(v.style);
    const name = this.rng.next() < NAMING_PROBABILITY ? LINEAGE_NAMES[Math.floor(this.rng.next() * LINEAGE_NAMES.length)] : null;
    this.sim.plant(spot.x, spot.y, applyDna(base.genome, dna), { parentId: base.lineage, visitor: v.pseudo, dna, name });
  }

  private choose(v: Visit): { x: number; y: number } | null {
    const lineages = [...this.sim.lineages.values()];
    const familyOf = (ids: number[]) => new Set(ids.flatMap((id) => this.sim.descendants(id)));
    const mine = (pseudo: string) => lineages.filter((l) => l.visitor === pseudo && l.origin === 'spore');
    const doyenne = () => {
      const roots = lineages
        .filter((l) => l.origin === 'spore' && this.sim.descendants(l.id).some((id) => this.sim.lineages.get(id)!.area > 0))
        .sort((a, b) => a.bornTick - b.bornTick);
      return roots.length ? familyOf([roots[0].id]) : null;
    };
    switch (v.style) {
      case 'fidele': {
        const own = mine(v.pseudo);
        return (own.length && this.cellIn(familyOf(own.map((l) => l.id)))) || this.cellIn(doyenne());
      }
      case 'voisine': {
        const p = this.player();
        const theirs = p ? mine(p) : [];
        return (theirs.length && this.cellIn(familyOf(theirs.map((l) => l.id)))) || this.cellIn(doyenne());
      }
      case 'suiveur':
        return this.cellIn(doyenne()) || this.emptyFertile();
      case 'exploratrice':
        return this.emptyFertile() || this.cellIn(null);
      default:
        return this.cellIn(null) || this.emptyFertile();
    }
  }

  /** Une case vivante au hasard, dans ces lignées (ou n'importe laquelle si null). */
  private cellIn(ids: Set<number> | null): { x: number; y: number } | null {
    if (ids && ids.size === 0) return null;
    const st = this.sim.backend.read(STATE);
    const n = this.sim.size;
    const found: number[] = [];
    for (let i = 0; i < n * n; i++) {
      if (st[i * 4] < ALIVE_THRESHOLD || st[i * 4 + 2] < 0.5) continue;
      if (!ids || ids.has(st[i * 4 + 2])) found.push(i);
    }
    if (!found.length) return null;
    const i = found[Math.floor(this.rng.next() * found.length)];
    return { x: (i % n) + 0.5, y: Math.floor(i / n) + 0.5 };
  }

  /** Le sol le plus riche parmi des cases tirées au hasard, loin de toute lignée. */
  private emptyFertile(): { x: number; y: number } | null {
    const st = this.sim.backend.read(STATE);
    const n = this.sim.size;
    let best = -1;
    let bestN = -1;
    for (let k = 0; k < EXPLORER_SAMPLES; k++) {
      const i = Math.floor(this.rng.next() * n * n);
      // Lignée nulle : ni vivante, ni fantôme, donc à l'écart des colonies.
      if (st[i * 4 + 2] > 0.5) continue;
      if (st[i * 4 + 1] > bestN) {
        bestN = st[i * 4 + 1];
        best = i;
      }
    }
    return best < 0 ? null : { x: (best % n) + 0.5, y: Math.floor(best / n) + 0.5 };
  }

  private dna(style: VisitorStyle): Dna {
    const fixed = STYLE_DNA[style];
    if (fixed) return { ...fixed, teinte: (this.rng.next() - 0.5) * 0.1 };
    // Petite retouche : un pas de vigueur payé par un pas de retenue, une fois sur deux.
    const d = { ...NEUTRAL_DNA, teinte: (this.rng.next() - 0.5) * 0.1 };
    if (this.rng.next() < 0.5) {
      const up = DNA_GENES[Math.floor(this.rng.next() * DNA_GENES.length)];
      const others = DNA_GENES.filter((g) => g !== up);
      d[up] = 1;
      d[others[Math.floor(this.rng.next() * others.length)]] = -1;
    }
    return d;
  }
}
