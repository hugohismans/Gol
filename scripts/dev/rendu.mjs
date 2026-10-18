// Rend une sauvegarde .bin (servie par Vite) en PNG, calque par calque.
// Usage : node scripts/dev/rendu.mjs chemin/servi.bin sortie-prefixe
import { chromium } from 'playwright-core';
const [url, prefix] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
page.on('pageerror', (e) => console.log('[erreur]', e.message));
await page.goto('http://localhost:5173/survie.html');
await page.waitForFunction(() => window.ready === true);
console.log(JSON.stringify(await page.evaluate((u) => window.harness.load(u), url)));
for (const layer of (process.env.CALQUES ?? 'final,lignees,nutriments,sediment').split(',')) {
  await page.evaluate((l) => window.harness.render(l), layer);
  await page.locator('canvas').screenshot({ path: `${prefix}-${layer}.png` });
}
await browser.close();
