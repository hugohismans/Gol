// Parcours éprouvette : préparer une spore, régler son ADN, la lâcher, voir le registre.
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
await page.evaluate(() => { window.engine.setSpeed(0); window.engine.organisme.runTicks(300); });
await page.mouse.click(mobile ? 195 : 640, mobile ? 300 : 400);
await page.waitForSelector('.eprouvette');
// gourmande +2, compacte +1, prudente +1
await page.getByRole('radio', { name: 'gourmande +2' }).click();
await page.getByRole('radio', { name: 'compacte +1' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `.survie/e1-${tag}-desequilibre.png` });
await page.getByRole('radio', { name: 'prudente +1' }).click();
await page.getByPlaceholder('ex. Lichen du matin').fill('Lichen du matin');
await page.getByPlaceholder('obligatoire').fill('Hugo');
await page.waitForTimeout(6000);
await page.screenshot({ path: `.survie/e2-${tag}-essai.png` });
await page.getByRole('button', { name: 'lâcher dans le monde' }).click();
await page.evaluate(() => window.engine.organisme.runTicks(500));
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'registre' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `.survie/e3-${tag}-registre.png` });
await page.getByRole('tab', { name: 'étendues' }).click();
await page.waitForTimeout(300);
console.log(JSON.stringify(await page.evaluate(() => ({ registre: window.engine.registry.slice(0, 4).map((r) => [r.name ?? r.id, r.visitor, r.label]), spores: window.engine.spores.map((s) => [s.name, s.visitor, s.dna]) }))));
await page.locator('.row.mine').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `.survie/e4-${tag}-histoire.png` });
await browser.close();
