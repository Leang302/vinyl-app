// Regenerates the README screenshots in docs/screenshots. Usage: node qa/readme-shots.mjs [baseUrl]
import { chromium } from '@playwright/test';
const base = process.argv[2] || 'http://127.0.0.1:5173/';
const out = n => `docs/screenshots/${n}.png`;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const seen = () => localStorage.setItem('vinyl.ui.v1', JSON.stringify({ hintsSeen: true }));
// Desktop
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(seen);
const p = await ctx.newPage(); await p.goto(base); await p.waitForFunction(() => window.__vinylProject); await p.waitForTimeout(1500);
await p.locator('.pb-play').click(); await p.mouse.move(5, 5); await p.waitForTimeout(1500);
await p.screenshot({ path: out('desktop') });
await p.keyboard.press('3'); await p.waitForTimeout(1200); await p.screenshot({ path: out('close-up') });
await p.keyboard.press('2'); await p.waitForTimeout(1200); await p.screenshot({ path: out('top-down') });
await p.keyboard.press('1'); await p.waitForTimeout(900);
await p.getByRole('button', { name: 'Gestures and keyboard shortcuts' }).click(); await p.waitForTimeout(400); await p.screenshot({ path: out('shortcuts') }); await p.keyboard.press('Escape');
await p.locator('.pb-play').click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Add music' }).first().click(); await p.waitForTimeout(500); await p.screenshot({ path: out('add-music') });
await ctx.close();
// Mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
await m.addInitScript(seen);
const mp = await m.newPage(); await mp.goto(base); await mp.waitForFunction(() => window.__vinylProject); await mp.waitForTimeout(1500);
await mp.screenshot({ path: out('mobile') });
await mp.getByRole('button', { name: 'Show queue' }).click(); await mp.waitForTimeout(500); await mp.screenshot({ path: out('mobile-queue') });
await m.close(); await browser.close();
console.log('done');
