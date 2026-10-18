// Lance la simulation dans Chromium headless et mesure sa survie.
// Usage : node scripts/survie.mjs [jours] [graine] '{"param": valeur}'
// Nécessite le serveur de dev (npm run dev) sur le port 5173.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const days = Number(process.argv[2] ?? 30);
const chunk = Number(process.env.TICKS ?? 2400);
const seed = Number(process.argv[3] ?? 1);
const params = JSON.parse(process.argv[4] ?? '{}');
const size = process.env.SIZE ? Number(process.env.SIZE) : undefined;
const spores = Number(process.env.SPORES ?? 10);
const shots = (process.env.SHOTS ?? '').split(',').filter(Boolean).map(Number);
const out = process.env.OUT ?? '.survie';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[erreur]', e.message));
await page.goto(`http://localhost:${process.env.PORT ?? 5173}/survie.html`);
await page.waitForFunction(() => window.ready === true);

console.log('init', JSON.stringify(await page.evaluate(([s, p, n, z]) => window.harness.init(s, p, n, z), [seed, params, spores, size])));
const t0 = Date.now();
const steps = Math.round((days * 2400) / chunk);
for (let d = 1; d <= steps; d++) {
  const r = await page.evaluate((k) => window.harness.run(k), chunk);
  const s = r.stats;
  const g = await page.evaluate(() => window.harness.genomeStats());
  console.log(
    `jour ${r.day.toFixed(2).padStart(6)}  vivantes ${String(s.livingCells).padStart(6)}  lignées ${s.livingLineages}/${s.totalLineages}` +
      `  biomasse ${s.biomass.toFixed(0).padStart(6)}  nutriments ${s.meanNutrients.toFixed(3)}` +
      `  R ${g.radius.toFixed(2)} mu ${g.mu.toFixed(4)} sig ${g.sigma.toFixed(4)} app ${g.appetite.toFixed(3)}  ${(chunk / (r.ms / 1000)).toFixed(0)} ticks/s`,
  );
  if (shots.includes(d)) {
    for (const layer of ['final', 'lignees', 'nutriments', 'sediment']) {
      await page.evaluate((l) => window.harness.render(l), layer);
      await page.locator('canvas').screenshot({ path: `${out}/j${d}-${layer}.png` });
    }
  }
  if (s.livingCells === 0) {
    console.log('extinction totale');
    break;
  }
}
console.log(`durée ${(Date.now() - t0) / 1000}s`);
await browser.close();
