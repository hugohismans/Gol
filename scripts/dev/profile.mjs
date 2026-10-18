import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[erreur]', e.message));
await page.goto('http://localhost:5173/survie.html');
await page.waitForFunction(() => window.ready === true);
await page.evaluate(() => window.harness.init(1, {}));
const r = await page.evaluate(() => {
  const s = window.harness._sim();
  const gl = s.gl;
  const px = new Float32Array(4); const sync = () => { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.bufs[s.cur].fbo); gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,px); };
  const time = (label, fn, n = 10) => { sync(); const t = performance.now(); for (let i = 0; i < n; i++) fn(); sync(); return label + ' ' + ((performance.now() - t) / n).toFixed(1) + 'ms'; };
  return [
    time('tick complet', () => s.runTicks(1)),
    time('mipmap seul', () => { gl.bindTexture(gl.TEXTURE_2D, s.vitTex); gl.generateMipmap(gl.TEXTURE_2D); }),
    time('copie vit', () => s.refreshVitality()),
  ];
});
console.log(r);
await browser.close();
