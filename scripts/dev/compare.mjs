// Compare les moteurs GPU et CPU dans Chromium headless.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[erreur]', e.message));
await page.goto('http://localhost:5173/survie.html');
await page.waitForFunction(() => window.ready === true);
console.log(JSON.stringify(await page.evaluate((t) => window.harness.compare(t), Number(process.argv[2] ?? 30)), null, 1));
await browser.close();
