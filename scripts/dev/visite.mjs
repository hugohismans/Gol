// Parcours d'un nouveau visiteur : visite guidée, dépôt, revenir demain, récit.
import { chromium } from 'playwright-core';
const mobile = process.env.MOBILE === '1';
const tag = mobile ? 'mob' : 'bur';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[erreur]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
await page.goto('http://localhost:5173/?taille=128');
await page.waitForFunction(() => window.engine?.organisme);
await page.waitForTimeout(800);
await page.screenshot({ path: `.survie/v1-${tag}-accueil.png` });
await page.getByRole('button', { name: 'suivant' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `.survie/v2-${tag}-toucher.png` });
await page.mouse.click(mobile ? 195 : 640, mobile ? 420 : 400);
await page.waitForSelector('.eprouvette');
await page.getByPlaceholder('obligatoire').fill('Hugo');
await page.getByPlaceholder('ex. Lichen du matin').fill('Lichen');
await page.waitForTimeout(1500);
await page.screenshot({ path: `.survie/v3-${tag}-eprouvette.png` });
await page.getByRole('button', { name: 'lâcher dans le monde' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `.survie/v4-${tag}-lachee.png` });
// « revenir demain » : on accélère la journée directement pour le test (SwiftShader est lent).
await page.evaluate(() => { const e = window.engine; e.recapFrom = e.organisme.tick; e.organisme.runTicks(2400); e.fastForward = { left: 1, total: 2400 }; });
await page.waitForSelector('.recap', { timeout: 60000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `.survie/v5-${tag}-recit.png` });
console.log(JSON.stringify(await page.evaluate(() => ({ recap: window.engine.recap, objectif: window.engine.objectiveText, journal: window.engine.organisme.events.filter((e) => e.kind === 'depot').map((e) => e.visitor + '>' + e.other) })), null, 1));
await page.getByRole('button', { name: 'retourner au monde' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `.survie/v6-${tag}-monde.png` });
await browser.close();
