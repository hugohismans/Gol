// Mesure la vitesse réelle obtenue à chaque réglage, et le débit maximal brut.
import { chromium } from 'playwright-core';
const taille = process.env.TAILLE ?? '64';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 800), height: Number(process.env.H ?? 600) } });
page.on('pageerror', (e) => console.log('[erreur]', e.message));
await page.goto(`http://localhost:5173/?taille=${taille}`);
await page.waitForFunction(() => window.engine?.organisme);
await page.evaluate(() => { window.engine.eprouvette = false; });
const brut = await page.evaluate(() => {
  const s = window.engine.organisme;
  const t0 = performance.now(); s.runTicks(300); const st = s.backend.read(0);
  return (300 / ((performance.now() - t0) / 1000)).toFixed(0);
});
console.log(`débit brut : ${brut} ticks/s`);
for (const v of [1, 10, 100, 1000]) {
  await page.evaluate((v) => window.engine.setSpeed(v), v);
  const t0 = await page.evaluate(() => window.engine.organisme.tick);
  const start = Date.now();
  await page.waitForTimeout(6000);
  const t1 = await page.evaluate(() => window.engine.organisme.tick);
  const tps = (t1 - t0) / ((Date.now() - start) / 1000);
  console.log(`x${v} : ${tps.toFixed(0)} ticks/s, soit x${(tps / 60).toFixed(2)} ; affiché réel x${(await page.evaluate(() => window.engine.effectiveSpeed)).toFixed(2)}`);
}
await browser.close();
