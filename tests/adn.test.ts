import { describe, expect, it } from 'vitest';
import { CpuBackend } from '../src/sim/cpu/backend';
import { NEUTRAL_DNA, applyDna, dnaSpent, isValidDna } from '../src/sim/genome';
import { Organisme } from '../src/sim/organisme';

const g = { radius: 10, mu: 0.15, sigma: 0.03, appetite: 0.5, hue: 0.5 };

describe('ADN à budget équilibré', () => {
  it('refuse un ADN dont la somme n’est pas nulle ou qui dépasse les bornes', () => {
    expect(isValidDna(NEUTRAL_DNA)).toBe(true);
    expect(isValidDna({ ...NEUTRAL_DNA, appetit: 1 })).toBe(false);
    expect(isValidDna({ ...NEUTRAL_DNA, appetit: 4, envergure: -4 })).toBe(false);
    expect(isValidDna({ ...NEUTRAL_DNA, appetit: 0.5, envergure: -0.5 })).toBe(false);
    expect(isValidDna({ ...NEUTRAL_DNA, teinte: 0.5 })).toBe(false);
    expect(() => applyDna(g, { ...NEUTRAL_DNA, appetit: 2 })).toThrow();
  });

  it('chaque gain de vigueur se paie ailleurs', () => {
    const d = { appetit: 2, envergure: -1, tolerance: 0, audace: -1, teinte: 0.05 };
    expect(isValidDna(d)).toBe(true);
    expect(dnaSpent(d)).toBe(2);
    const out = applyDna(g, d);
    expect(out.appetite).toBeGreaterThan(g.appetite);
    expect(out.radius).toBeLessThan(g.radius);
    expect(out.mu).toBeGreaterThan(g.mu);
    expect(out.hue).toBeCloseTo(0.55);
  });

  it('une spore garde son ADN, son nom et son visiteur', () => {
    const sim = new Organisme(new CpuBackend(32), { seed: 2 });
    const a = sim.spawnSpore(16, 16, null);
    sim.runTicks(2);
    const d = { appetit: -1, envergure: 1, tolerance: 0, audace: 0, teinte: 0 };
    const base = sim.inheritedGenome(18, 16);
    expect(base.lineage).toBe(a.id);
    const b = sim.plant(18, 16, applyDna(base.genome, d), { parentId: base.lineage, visitor: 'Hugo', dna: d, name: '  Lichen ' });
    expect(b.parentId).toBe(a.id);
    expect(b.visitor).toBe('Hugo');
    expect(b.name).toBe('Lichen');
    expect(b.dna).toEqual(d);
    expect(sim.spawnSpore(10, 10, d, 'Hugo').dna).toEqual(d);
  });
});
