import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../src/sim/config';
import { CpuBackend } from '../src/sim/cpu/backend';
import { Organisme } from '../src/sim/organisme';
import type { WorldEvent } from '../src/sim/types';

describe('récit du monde', () => {
  it('tient le registre quotidien et raconte dépôts, conquêtes et extinctions', () => {
    const sim = new Organisme(new CpuBackend(64), { seed: 11 });
    const seen: WorldEvent[] = [];
    sim.onEvent = (e) => seen.push(e);
    const a = sim.spawnSpore(20, 32, null, 'Léa');
    sim.runTicks(200);
    const b = sim.spawnSpore(28, 32, { appetit: 2, envergure: 0, tolerance: 0, audace: -2, teinte: 0.1 }, 'Malik');
    expect(seen.filter((e) => e.kind === 'depot').map((e) => e.visitor)).toEqual(['Léa', 'Malik']);
    expect(seen.at(-1)!.other).toBe(a.id);
    sim.runTicks(TICKS_PER_DAY);
    const la = sim.lineages.get(a.id)!;
    const lb = sim.lineages.get(b.id)!;
    expect(la.ledger.length).toBeGreaterThan(0);
    const total = (l: typeof la) => l.ledger.reduce((s, d) => s + d.gained + d.faim + d.vieillesse + d.repli, 0);
    expect(total(la) + total(lb)).toBeGreaterThan(0);
    // Ce que l'une a pris à l'autre est noté des deux côtés.
    const won = lb.ledger.reduce((s, d) => s + (d.wonFrom[a.id] ?? 0), 0);
    const lost = la.ledger.reduce((s, d) => s + (d.lostTo[b.id] ?? 0), 0);
    expect(won).toBe(lost);
    expect(sim.events.length).toBe(seen.length);
  });

  it('garde le journal à travers une sauvegarde', () => {
    const sim = new Organisme(new CpuBackend(32), { seed: 3 });
    sim.spawnSpore(16, 16, null, 'Léa');
    sim.runTicks(300);
    const other = new Organisme(new CpuBackend(32), { seed: 1 });
    other.restore(sim.serialize());
    expect(other.events).toEqual(sim.events);
    expect(other.lineages.get(1)!.ledger).toEqual(sim.lineages.get(1)!.ledger);
  });
});
