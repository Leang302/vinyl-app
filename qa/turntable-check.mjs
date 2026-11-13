// 3D interaction check: direct manipulation, camera rig, keyboard, touch, 2D fallback.
// Usage: node qa/turntable-check.mjs [baseUrl]   (dev server running; uses dev-only window.__vinyl* probes)
import { chromium } from '@playwright/test';
const base = process.argv[2] || 'http://127.0.0.1:5173/';
const gl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
const browser = await chromium.launch({ channel: 'chrome', args: gl });
const TUNING_PARALLAX = 3;
const results = []; const ok = (name, pass, detail = '') => results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
const errors = [];

// ── Desktop mouse ──────────────────────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
await page.goto(base); await page.waitForFunction(() => window.__vinylProject, null, { timeout: 20000 }); await page.waitForTimeout(800);
ok('first-run hint visible on first visit', await page.locator('.first-run-hint:not(.hidden)').isVisible());
ok('no Hands on / Move camera toggle', (await page.getByRole('button', { name: /Hands on|Move camera/ }).count()) === 0);
// Low power quality disables the FPS guard so software rendering doesn't swap in the 2D fallback mid-test.
await page.getByRole('button', { name: 'Settings and info' }).click(); await page.getByRole('menuitem', { name: 'Turntable look' }).click();
await page.getByLabel('3D quality').click(); await page.getByRole('option', { name: 'Low power' }).click(); await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Close' }).click(); await page.waitForSelector('[role=dialog]', { state: 'detached' }); await page.waitForTimeout(800);
await page.waitForFunction(() => window.__vinylProject, null, { timeout: 20000 }); await page.waitForTimeout(500);
const P = (x, y, z) => page.evaluate(([x, y, z]) => window.__vinylProject(x, y, z), [x, y, z]);
const cam = () => page.evaluate(() => window.__vinylCamera());
const playLabel = () => page.locator('.pb-play').getAttribute('aria-label');

// Hover label (300ms delay) + click record = play/pause
const rc = await P(-0.78 + 1.2, 1.04, 0.5);
await page.mouse.move(rc.x, rc.y); await page.waitForTimeout(150);
const early = await page.locator('.pointer-label').count();
await page.waitForTimeout(400);
ok('hover label appears after ~300ms delay', early === 0 && await page.locator('.pointer-label').isVisible(), await page.locator('.pointer-label').innerText().catch(() => 'none'));
ok('cursor is grab over the record', (await page.evaluate(() => document.querySelector('.scene-wrap canvas').style.cursor)) === 'grab');
await page.mouse.click(rc.x, rc.y); await page.waitForTimeout(1200);
ok('click record → plays', (await playLabel()) === 'Pause');
ok('first-run hint fades after first interaction', await page.locator('.first-run-hint.hidden').count() === 1);
await page.mouse.click(rc.x, rc.y); await page.waitForTimeout(500);
ok('click record again → pauses', (await playLabel()) === 'Play');

// Drag around the center = scrub with a time label
await page.mouse.click(rc.x, rc.y); await page.waitForTimeout(1000);
const before = Number(await page.getByRole('slider', { name: 'Seek' }).getAttribute('aria-valuenow'));
const camBefore = await cam();
const pts = []; for (let a = 0; a <= Math.PI * 0.4; a += Math.PI / 24) pts.push(await P(-0.78 + 1.6 * Math.sin(a), 1.04, 1.6 * Math.cos(a)));
await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
let scrubLabel = '';
for (const p of pts) { await page.mouse.move(p.x, p.y, { steps: 3 }); scrubLabel = await page.locator('.pointer-label').innerText().catch(() => scrubLabel); }
await page.mouse.up(); await page.waitForTimeout(800);
const after = Number(await page.getByRole('slider', { name: 'Seek' }).getAttribute('aria-valuenow'));
const camAfter = await cam();
ok('drag record scrubs position', Math.abs(after - before) > 5, `${before.toFixed(1)}s → ${after.toFixed(1)}s, label "${scrubLabel}"`);
ok('camera did not orbit while scrubbing', Math.abs(camAfter.azimuth - camBefore.azimuth) < 0.5, `Δaz ${(camAfter.azimuth - camBefore.azimuth).toFixed(2)}°`);
ok('playback resumes after scrub', (await playLabel()) === 'Pause');

// Tonearm click = lift / drop
const armAt = () => page.evaluate(() => window.__vinylArm(1.6));
const arm = await armAt();
await page.mouse.click(arm.x, arm.y); await page.waitForTimeout(600);
const lifted = await page.getByRole('button', { name: /Needle up/ }).count();
ok('click tonearm → lifts needle and pauses', lifted === 1 && (await playLabel()) === 'Play');
const arm2 = await armAt(); await page.mouse.click(arm2.x, arm2.y); await page.waitForTimeout(1000);
ok('click tonearm again → drops needle and plays', (await page.getByRole('button', { name: /Needle down/ }).count()) === 1);

// Cover: keyboard C closes; clicking the closed cover opens it
await page.mouse.move(5, 5); await page.keyboard.press('c'); await page.waitForTimeout(900);
ok('C closes cover (2D button mirrors it)', (await page.getByRole('button', { name: 'Open cover' }).count()) === 1);
const cover = await P(-0.78, 1.5, 0); await page.mouse.click(cover.x, cover.y); await page.waitForTimeout(900);
ok('click closed cover → opens', (await page.getByRole('button', { name: 'Close cover' }).count()) === 1);

// Non-interactive details: the volume knob no longer reacts
const knob = await P(3.09, 1.1, 0.72); await page.mouse.move(knob.x, knob.y); await page.waitForTimeout(450);
ok('volume knob is decoration only (no hover label)', (await page.locator('.pointer-label').count()) === 0);

// Orbit on empty space, with hard limits
const empty = await P(-4.5, 3.6, -3.5);
const c0 = await cam();
await page.mouse.move(empty.x, empty.y); await page.mouse.down(); await page.mouse.move(empty.x + 1400, empty.y + 600, { steps: 25 }); await page.mouse.up(); await page.waitForTimeout(1200);
const c1 = await cam();
ok('drag on empty space orbits', Math.abs(c1.azimuth - c0.azimuth) > 5, `az ${c0.azimuth.toFixed(1)}° → ${c1.azimuth.toFixed(1)}°`);
ok('azimuth limited to ±35° of the preset', Math.abs(c1.azimuth - c0.azimuth) <= 35.5);
ok('polar stays within 25°–75°', c1.polar >= 24.5 && c1.polar <= 75.5, `${c1.polar.toFixed(1)}°`);

// Wheel: plain scroll never zooms; Ctrl+scroll does, within range
const mid = await P(0, 1, 0); await page.mouse.move(mid.x, mid.y);
const d0 = (await cam()).distance; await page.mouse.wheel(0, 600); await page.waitForTimeout(700);
const d1 = (await cam()).distance;
await page.keyboard.down('Control'); for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -400); await page.keyboard.up('Control'); await page.waitForTimeout(900);
const d2 = (await cam()).distance;
ok('plain wheel does not zoom', Math.abs(d1 - d0) < 0.05);
ok('Ctrl+wheel zooms within a narrow range', d2 < d1 - 0.5 && d2 >= d0 * 0.84, `${d0.toFixed(1)} → ${d2.toFixed(1)}`);

// Double-click empty space resets to preset; R also resets
const box = await page.locator('.scene-wrap').boundingBox(); await page.mouse.move(box.x + 30, box.y + box.height - 40); await page.waitForTimeout(200); await page.mouse.dblclick(box.x + 30, box.y + box.height - 40); await page.waitForTimeout(900);
const c2 = await cam();
ok('double-click empty space resets to preset (zoom and orbit undone, ±3° parallax allowed)', Math.abs(c2.azimuth - c0.azimuth) <= TUNING_PARALLAX + 0.5 && Math.abs(c2.distance - c0.distance) < 0.3, `az Δ${(c2.azimuth - c0.azimuth).toFixed(1)}°, distance ${d2.toFixed(1)} → ${c2.distance.toFixed(1)} (preset ${c0.distance.toFixed(1)})`);

// Presets via keys 2/3/1, tweened (not snapped)
await page.keyboard.press('2'); await page.waitForTimeout(250); const mid2 = await cam(); await page.waitForTimeout(600); const top = await cam();
ok('preset tween is animated (not a snap)', mid2.polar > top.polar + 3, `mid ${mid2.polar.toFixed(1)}° → end ${top.polar.toFixed(1)}°`);
ok('2 → Top-down', top.polar < 15 && (await page.getByRole('radio', { name: 'Top-down view' }).getAttribute('aria-checked')) === 'true');
await page.screenshot({ path: 'qa/turntable-topdown.png' });
await page.keyboard.press('3'); await page.waitForTimeout(800); const close = await cam();
ok('3 → Close-up (closer)', close.distance < c0.distance * 0.7); await page.screenshot({ path: 'qa/turntable-closeup.png' });
await page.keyboard.press('1'); await page.waitForTimeout(800);

// Idle auto-return after orbit
await page.mouse.move(empty.x, empty.y); await page.mouse.down(); await page.mouse.move(empty.x + 300, empty.y, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(1000); const away = await cam(); await page.waitForTimeout(8200); const back = await cam();
ok('auto-returns to preset after 8s idle', Math.abs(away.azimuth - c0.azimuth) > 3 && Math.abs(back.azimuth - c0.azimuth) < 1.5, `${away.azimuth.toFixed(1)}° → ${back.azimuth.toFixed(1)}°`);

// Keyboard: L needle, Space play, ? help popover content
await page.keyboard.press('l'); await page.waitForTimeout(500); ok('L lifts the needle', (await playLabel()) === 'Play');
await page.keyboard.press(' '); await page.waitForTimeout(800); ok('Space plays', (await playLabel()) === 'Pause');
await page.getByRole('button', { name: 'Gestures and keyboard shortcuts' }).click(); await page.waitForTimeout(300);
ok('help popover lists gestures and shortcuts', (await page.locator('[data-radix-popper-content-wrapper]').innerText()).includes('Reset camera'));
await page.keyboard.press('Escape');
const a11y = await page.locator('.scene-wrap [role=img]').getAttribute('aria-label');
ok('canvas has role=img with live status', /Playing: /.test(a11y || ''), a11y);
await page.mouse.move(rc.x, rc.y); await page.waitForTimeout(500);
await page.screenshot({ path: 'qa/turntable-room.png' });
await ctx.close();

// ── Touch ──────────────────────────────────────────────────────
const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const tp = await tctx.newPage(); tp.on('pageerror', e => errors.push(e.message));
await tp.goto(base); await tp.waitForFunction(() => window.__vinylProject, null, { timeout: 20000 }); await tp.waitForTimeout(800);
const trc = await tp.evaluate(() => window.__vinylProject(-0.78 + 1.2, 1.04, 0.5));
await tp.touchscreen.tap(trc.x, trc.y); await tp.waitForTimeout(1200);
ok('touch: tap record → plays', (await tp.locator('.pb-play').getAttribute('aria-label')) === 'Pause');
ok('touch: no hover label after tap', (await tp.locator('.pointer-label').count()) === 0);
await tp.screenshot({ path: 'qa/turntable-mobile.png' });
await tctx.close();

// ── No WebGL → 2D fallback still plays ─────────────────────────
const nb = await chromium.launch({ channel: 'chrome', args: ['--disable-webgl', '--disable-webgl2', '--autoplay-policy=no-user-gesture-required'] });
const np = await nb.newPage({ viewport: { width: 1440, height: 900 } });
await np.goto(base); await np.waitForTimeout(2000);
const vin = np.locator('.vinyl-2d');
ok('no WebGL → 2D turntable shown', await vin.isVisible());
await vin.click(); await np.waitForTimeout(1200);
ok('2D turntable click plays; transport still works', (await np.locator('.pb-play').getAttribute('aria-label')) === 'Pause' && await np.locator('.vinyl-2d.is-playing').count() === 1);
await np.screenshot({ path: 'qa/turntable-2d.png' }); await nb.close();

console.log(results.join('\n')); console.log('PAGE_ERRORS', JSON.stringify(errors));
await browser.close();
