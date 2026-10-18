// Capture la page principale (bureau et mobile) pour vérifier l'interface.
import { chromium } from 'playwright-core';
const out = process.env.OUT ?? '.survie';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const [name, vp, mobile] of [['bureau', { width: 1280, height: 800 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[erreur]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(Number(process.env.WAIT ?? 4000));
  await page.screenshot({ path: `${out}/ui-${name}.png` });
  if (process.env.DEBUG) {
    await page.getByRole('button', { name: 'réglages' }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/ui-${name}-reglages.png` });
  }
  await ctx.close();
}
await browser.close();
