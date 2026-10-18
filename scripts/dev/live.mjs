// Ouvre le site déployé et capture l'écran.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[erreur]', e.message));
await page.goto(process.argv[2]);
await page.waitForTimeout(6000);
console.log(await page.evaluate(() => ({ erreur: window.engine?.error ?? null, lignees: window.engine?.stats?.livingLineages })));
await page.screenshot({ path: '.survie/live.png' });
await browser.close();
