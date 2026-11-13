// End-to-end UX flows: add-music preview, media dock, row menu, rename, clear + undo, persistence.
import { chromium } from '@playwright/test';
const base=process.argv[2]||'http://127.0.0.1:5173/';
const b=await chromium.launch({channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(base);await p.waitForTimeout(1500);
await p.getByRole('button',{name:'Add music'}).first().click();
await p.getByLabel(/YouTube link/).fill('not a link at all ://');await p.waitForTimeout(300);
const invalid=await p.locator('#add-url-status').innerText();
await p.getByLabel(/YouTube link/).fill('https://www.youtube.com/playlist?list=PL-osiE80TeTt2d9bfVyTiXJA-UTHn6WwU');
await p.waitForSelector('.preview:not([aria-hidden=true])',{timeout:20000});
const preview=(await p.locator('.preview').innerText()).replace(/\n/g,' | ');
await p.screenshot({path:'qa/flow-add-preview.png'});
await p.getByRole('button',{name:'Add to collection'}).click();
await p.waitForFunction(()=>document.querySelectorAll('.queue-panel .row').length>3,null,{timeout:20000});
await p.waitForTimeout(3000);
const dock=await p.locator('.media-dock').evaluate(e=>{const r=e.getBoundingClientRect();return `${Math.round(r.width)}x${Math.round(r.height)} visible=${getComputedStyle(e).display!=='none'}`;});
// Row menu → Rename
const firstUpNext=p.locator('.queue-panel .row').first();
await firstUpNext.hover();await firstUpNext.getByRole('button',{name:/More options/}).click();
const items=await p.locator('[role=menu] [role=menuitem]').allInnerTexts();
await p.getByRole('menuitem',{name:'Rename'}).click();await p.keyboard.type('Renamed track');await p.keyboard.press('Enter');
const renamed=await p.locator('.queue-panel .row').first().locator('strong').innerText();
// Clear + Undo
const before=await p.locator('.queue-panel .row').count();
await p.getByRole('button',{name:'Clear',exact:true}).click();
const toast=await p.locator('[data-sonner-toast]').innerText();
await p.getByRole('button',{name:'Undo'}).click();await p.waitForTimeout(300);
const after=await p.locator('.queue-panel .row').count();
// Duplicate add
await p.getByRole('button',{name:'Add music'}).first().click();await p.getByLabel(/YouTube link/).fill('https://www.youtube.com/playlist?list=PL-osiE80TeTt2d9bfVyTiXJA-UTHn6WwU');
await p.waitForSelector('.preview:not([aria-hidden=true])',{timeout:20000});await p.getByRole('button',{name:'Add to collection'}).click();await p.waitForTimeout(800);
await p.waitForTimeout(400);const dupToast=await p.locator('[data-sonner-toast] [data-title]').innerText().catch(()=>'');const collections=await p.locator('.library-panel .row').count();
await p.screenshot({path:'qa/flow-youtube-1440.png'});
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(800);
await p.screenshot({path:'qa/flow-youtube-390.png'});
await p.getByRole('button',{name:'Show queue'}).click();await p.waitForTimeout(500);await p.screenshot({path:'qa/flow-sheet-390.png'});
await p.reload();await p.waitForTimeout(2000);
const persisted=await p.evaluate(()=>({queue:JSON.parse(localStorage.getItem('vinyl.queue.v1')||'{}').queue?.length,ui:localStorage.getItem('vinyl.ui.v1')}));
console.log(JSON.stringify({invalid,preview,dock,menuItems:items,renamed,clear:{before,toast:toast.replace(/\n/g,' | '),afterUndo:after},duplicate:{toast:dupToast,collections},persisted,errors},null,1));
await b.close();
