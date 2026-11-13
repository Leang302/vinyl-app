// Visual + layout check for the decluttered UI. Usage: node qa/declutter-check.mjs [baseUrl]
import { chromium } from '@playwright/test';
const base = process.argv[2] || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const overlaps = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
for (const [name, width, height] of [['desktop', 1440, 900], ['tablet', 1000, 800], ['mobile', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  await page.goto(base); await page.waitForTimeout(2500);
  await page.screenshot({ path: `qa/${name}.png`, fullPage: name === 'mobile' });
  const report = await page.evaluate(() => {
    const r = sel => document.querySelector(sel)?.getBoundingClientRect().toJSON();
    const clipped = [...document.querySelectorAll('.player-bar button, .transport-row button, .stage-toolbar button')].filter(b => { const x = b.getBoundingClientRect(); return x.width > 0 && (x.left < 0 || x.right > innerWidth); }).map(b => b.getAttribute('aria-label'));
    return { overflowX: document.documentElement.scrollWidth > innerWidth, clipped, times: [...document.querySelectorAll('.pb-progress .time')].map(e => e.getBoundingClientRect().toJSON()), buttons: r('.pb-buttons') || r('.pb-play'), transport: r('.transport-row'), toolbar: r('.stage-toolbar'), addButtons: [...document.querySelectorAll('button')].filter(b => /add music/i.test(b.getAttribute('aria-label') || b.textContent)).length };
  });
  console.log(name, JSON.stringify({ overflowX: report.overflowX, clipped: report.clipped, addButtons: report.addButtons, timeOverlapsButtons: report.times.some(t => overlaps(t, report.buttons)) }));
  // Toast must not cover the transport row or player controls.
  await page.evaluate(() => window.__vinylNotify?.('Skipped: embedding disabled'));
  await page.waitForTimeout(300);
  const toast = await page.evaluate(() => document.querySelector('.toast')?.getBoundingClientRect().toJSON());
  if (toast) {
    const hits = await page.evaluate(t => [...document.querySelectorAll('.transport-row button, .player-bar button, .player-bar [role=slider]')].filter(b => { const x = b.getBoundingClientRect(); return x.width && !(x.right <= t.left || t.right <= x.left || x.bottom <= t.top || t.bottom <= x.top); }).map(b => b.getAttribute('aria-label')), toast);
    console.log(name, 'toast overlaps controls:', JSON.stringify(hits));
    await page.screenshot({ path: `qa/${name}-toast.png` });
  }
  await page.close();
}
console.log('PAGE_ERRORS', JSON.stringify(errors));
await browser.close();
