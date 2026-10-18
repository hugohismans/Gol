import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { CENSUS_INTERVAL_TICKS, SNAPSHOT_INTERVAL_TICKS } from '../src/sim/config';
import { CpuBackend } from '../src/sim/cpu/backend';
import { decodeFrame } from '../src/sim/frame';
import { Organisme } from '../src/sim/organisme';

describe('histoire d’une lignée', () => {
  it('note la surface et le centre à chaque recensement', () => {
    const sim = new Organisme(new CpuBackend(96), { seed: 3 });
    // Déposée contre le bord : le centre doit traverser le tore, pas tomber au milieu.
    const l = sim.spawnSpore(2, 20, 'sobre', 'moi');
    expect(l.visitor).toBe('moi');
    sim.runTicks(1);
    sim.census();
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), 96 - Math.abs(a - b));
    expect(near(l.history.at(-2)!, 2)).toBeLessThan(2);
    expect(near(l.history.at(-1)!, 20)).toBeLessThan(2);
    sim.runTicks(CENSUS_INTERVAL_TICKS * 2);
    expect(l.history.length / 4).toBeGreaterThanOrEqual(3);
    expect(l.history.at(-4)).toBe(sim.tick);
    expect(l.history.at(-3)).toBe(l.area);
  });

  it('retrouve les descendantes', () => {
    const sim = new Organisme(new CpuBackend(32), { seed: 4 });
    const a = sim.spawnSpore(16, 16, null, 'moi');
    sim.runTicks(3);
    const b = sim.spawnSpore(18, 16, 'gourmande');
    const c = sim.spawnSpore(20, 16, 'teinte');
    expect(b.parentId).toBe(a.id);
    expect(sim.descendants(a.id)).toContain(b.id);
    expect(sim.descendants(a.id).length).toBeGreaterThanOrEqual(2);
    expect(c.parentId).not.toBeNull();
  });

  it('survit à la sauvegarde', () => {
    const sim = new Organisme(new CpuBackend(32), { seed: 5 });
    const l = sim.spawnSpore(16, 16, null, 'moi');
    sim.runTicks(CENSUS_INTERVAL_TICKS);
    const other = new Organisme(new CpuBackend(32), { seed: 1 });
    other.restore(sim.serialize());
    const r = other.lineages.get(l.id)!;
    expect(r.visitor).toBe('moi');
    expect(r.history.length).toBeGreaterThanOrEqual(l.history.length);
  });
});

describe('instantanés', () => {
  it('sont produits à intervalle régulier et se relisent', () => {
    const sim = new Organisme(new CpuBackend(32), { seed: 6 });
    sim.seedRandom(2);
    const ticks: number[] = [];
    let last: Uint8Array | null = null;
    sim.onSnapshot = (t, f) => {
      ticks.push(t);
      last = f;
    };
    sim.runTicks(SNAPSHOT_INTERVAL_TICKS * 2);
    expect(ticks).toEqual([SNAPSHOT_INTERVAL_TICKS, SNAPSHOT_INTERVAL_TICKS * 2]);
    const f = decodeFrame(last!);
    expect(f.tick).toBe(SNAPSHOT_INTERVAL_TICKS * 2);
    const s = sim.getState();
    for (let i = 0; i < 32 * 32; i += 37) {
      expect(f.state[i * 4 + 1]).toBeCloseTo(s.nutrients[i], 2);
      if (s.vitality[i] >= 0.03 && s.lineage[i] > 0.5) expect(f.state[i * 4 + 2]).toBe(s.lineage[i]);
    }
  });

  it('pèsent peu une fois compressés', () => {
    const sim = new Organisme(new CpuBackend(128), { seed: 2 });
    sim.seedRandom(6);
    sim.runTicks(200);
    const raw = sim.snapshot();
    const z = deflateRawSync(raw);
    console.log(`instantané 128x128 : ${(raw.length / 1024).toFixed(0)} ko brut, ${(z.length / 1024).toFixed(0)} ko compressé`);
    expect(z.length).toBeLessThan(raw.length / 2);
  }, 30000);
});
