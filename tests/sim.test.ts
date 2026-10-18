import { describe, expect, it } from 'vitest';
import { dateOf, regenFactor } from '../src/sim/calendar';
import { TICKS_PER_DAY } from '../src/sim/config';
import { CpuBackend } from '../src/sim/cpu/backend';
import { applyMutation } from '../src/sim/genome';
import { Organisme } from '../src/sim/organisme';

describe('calendrier', () => {
  it('commence le 20 mars de l’an 1 au printemps', () => {
    const d = dateOf(0);
    expect(d.dayOfMonth).toBe(20);
    expect(d.month).toBe('mars');
    expect(d.year).toBe(1);
    expect(d.season).toBe('printemps');
    expect(d.hour).toBe(6);
  });

  it('avance d’un jour par TICKS_PER_DAY ticks', () => {
    expect(dateOf(TICKS_PER_DAY).dayOfMonth).toBe(21);
    expect(dateOf(TICKS_PER_DAY * 365).year).toBe(2);
  });

  it('régénère davantage en été et le jour', () => {
    const summer = 94 * TICKS_PER_DAY; // vers le 22 juin
    const winter = 276 * TICKS_PER_DAY; // vers le 20 décembre
    expect(regenFactor(summer, 0, 0.3)).toBeGreaterThan(regenFactor(winter, 0, 0.3));
    expect(regenFactor(TICKS_PER_DAY * 0.3, 0.5, 0)).toBeGreaterThan(regenFactor(0, 0.5, 0));
  });
});

describe('mutations', () => {
  const g = { radius: 10, mu: 0.15, sigma: 0.03, appetite: 0.5, hue: 0.95 };
  it('gourmande augmente l’appétit, sobre le baisse', () => {
    expect(applyMutation(g, 'gourmande').appetite).toBeGreaterThan(g.appetite);
    expect(applyMutation(g, 'sobre').appetite).toBeLessThan(g.appetite);
  });
  it('expansive agrandit le rayon, compacte le réduit', () => {
    expect(applyMutation(g, 'expansive').radius).toBeGreaterThan(g.radius);
    expect(applyMutation(g, 'compacte').radius).toBeLessThan(g.radius);
  });
  it('le décalage de teinte reste entre 0 et 1', () => {
    const h = applyMutation(g, 'teinte').hue;
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(1);
  });
});

describe('organisme sur CPU', () => {
  it('une spore crée une lignée vivante qui hérite du génome voisin', () => {
    const sim = new Organisme(new CpuBackend(32), { seed: 3 });
    const a = sim.spawnSpore(16, 16, null);
    sim.runTicks(5);
    expect(sim.census().livingLineages).toBe(1);
    const b = sim.spawnSpore(20, 16, 'gourmande');
    expect(b.parentId).toBe(a.id);
    expect(b.founder.appetite).toBeGreaterThan(a.founder.appetite);
  });

  it('est déterministe pour une même graine', () => {
    const run = () => {
      const sim = new Organisme(new CpuBackend(32), { seed: 9 });
      sim.seedRandom(2);
      sim.runTicks(20);
      return sim.getState().vitality;
    };
    expect(run()).toEqual(run());
  });

  it('survit à un aller-retour de sauvegarde', () => {
    const sim = new Organisme(new CpuBackend(32), { seed: 5 });
    sim.seedRandom(2);
    sim.runTicks(30);
    const before = sim.census();
    const bytes = sim.serialize();
    const other = new Organisme(new CpuBackend(32), { seed: 1 });
    other.restore(bytes);
    const after = other.census();
    expect(other.tick).toBe(sim.tick);
    expect(after.livingCells).toBe(before.livingCells);
    expect(after.biomass).toBeCloseTo(before.biomass, 0);
    expect(other.lineages.size).toBe(sim.lineages.size);
  });
});
