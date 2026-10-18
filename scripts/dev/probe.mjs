import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
console.log('lancé');
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[erreur]', e.message));
await page.goto('http://localhost:5173/survie.html', { timeout: 30000 });
console.log('chargé');
console.log(await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); return gl ? [gl.getParameter(gl.VERSION), !!gl.getExtension('EXT_color_buffer_float'), gl.getParameter(gl.MAX_DRAW_BUFFERS)] : 'pas de webgl2'; }));
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
console.log('prêt');
const t = Date.now();
console.log(JSON.stringify(await page.evaluate(() => window.harness.init(1, {}))));
console.log('init ms', Date.now() - t);
const t2 = Date.now();
console.log(JSON.stringify(await page.evaluate(() => window.harness.run(60))));
console.log('60 ticks ms', Date.now() - t2);
await browser.close();
