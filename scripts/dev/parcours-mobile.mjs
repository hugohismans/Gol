// Parcours « mes spores » : déposer, laisser vivre, lire l'histoire, revoir.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('[erreur]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
await page.goto('http://localhost:5173/?taille=128');
await page.waitForFunction(() => window.engine?.organisme);
await page.evaluate(() => window.engine.setSpeed(0));
await page.mouse.click(195, 420);
await page.mouse.click(120, 300);
const ticks = Number(process.env.TICKS ?? 1300);
await page.evaluate((n) => { const s = window.engine.organisme; for (let i = 0; i < n; i += 100) s.runTicks(100); }, ticks);
await page.waitForTimeout(500);
await page.getByRole('button', { name: /mes spores/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: '.survie/m1-liste.png' });
await page.locator('.card').first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: '.survie/m2-histoire.png' });
await page.getByRole('button', { name: 'revoir son histoire' }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: '.survie/m3-souvenir.png' });
console.log(JSON.stringify(await page.evaluate(() => ({ replay: window.engine.replay && { n: window.engine.replay.ticks.length, i: window.engine.replay.index }, story: window.engine.story?.events.map((e) => e.text) }))));
await browser.close();
