// Real-network check: an embed-blocked video is skipped after ~1s with one message. Usage: node qa/embed-skip.mjs [baseUrl]
import { chromium } from '@playwright/test';
const base=process.argv[2]||'http://127.0.0.1:5173/';
const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const yt=(id,title)=>({id,videoId:id,title,artist:'YouTube',source:'youtube',artwork:`https://i.ytimg.com/vi/${id}/mqdefault.jpg`});
await page.addInitScript(q=>localStorage.setItem('vinyl.queue.v1',JSON.stringify({queue:q,index:0,position:0,shuffle:false,repeat:'off',unshuffled:null})),[yt('pMuyCwMkXAU','Blocked video'),yt('M7lc1UVf-VE','Playable video')]);
await page.goto(base);await page.waitForTimeout(1500);
await page.locator('.play-button').click();
await page.waitForSelector('.toast',{timeout:30000});
const t0=Date.now();const toast=await page.locator('.toast').innerText();const link=await page.locator('.toast a').getAttribute('href');
const inlineErrors=await page.locator('.source-error,[role=alert]').count();
await page.waitForFunction(()=>document.querySelectorAll('.queue-row')[1]?.classList.contains('current'),null,{timeout:10000});
const skipMs=Date.now()-t0;
const blockedRow=await page.locator('.queue-row').first().evaluate(r=>({blocked:r.classList.contains('blocked'),link:r.querySelector('a')?.getAttribute('href')}));
await page.waitForFunction(()=>document.querySelector('.play-button')?.getAttribute('aria-label')==='Pause',null,{timeout:30000}).catch(()=>{});
await page.screenshot({path:'qa/embed-skip.png'});
await page.waitForTimeout(4500);
console.log(JSON.stringify({toast:toast.replace(/\n/g,' | '),link,inlineErrors,skipAfterToastMs:skipMs,blockedRow,nowPlaying:await page.locator('.queue-row.current .queue-text strong').textContent(),player:await page.locator('.play-button').getAttribute('aria-label'),toastGoneAfter4s:await page.locator('.toast').count()===0}));
console.log('PAGE_ERRORS',JSON.stringify(errors));await browser.close();
// Second pass: the listener clicks the blocked song directly; the app must stay on it.
{
const p2=await (await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']})).newPage({viewport:{width:1440,height:900}});
await p2.addInitScript(q=>localStorage.setItem('vinyl.queue.v1',JSON.stringify({queue:q,index:1,position:0,shuffle:false,repeat:'off',unshuffled:null})),[yt('pMuyCwMkXAU','Blocked video'),yt('M7lc1UVf-VE','Playable video')]);
await p2.goto(base);await p2.waitForTimeout(1500);
await p2.locator('.queue-row-main').first().click();
await p2.waitForSelector('.toast',{timeout:30000});const msg=await p2.locator('.toast-message').innerText();
await p2.waitForTimeout(3000);
console.log('picked:',JSON.stringify({toast:msg,stillOnPicked:await p2.locator('.queue-row').first().evaluate(r=>r.classList.contains('current')),jumped:await p2.locator('.queue-row').nth(1).evaluate(r=>r.classList.contains('current'))}));
await p2.context().browser().close();
}
