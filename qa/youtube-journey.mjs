import { chromium } from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(r.url().includes('youtube.com'))console.log('REQUEST_FAILURE',r.failure().errorText,r.url().slice(0,110));});
await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Add music',exact:true}).click();await page.getByLabel('Video or playlist URL').fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');await page.getByRole('button',{name:'Add to my collection'}).click();
await page.waitForTimeout(8000);
console.log('iframes',await page.locator('#youtube-host iframe').count());console.log('state',await page.evaluate(async()=>{const {usePlayer}=await import('/src/state/store.ts');const s=usePlayer.getState();return {state:s.state,title:s.track?.title,error:s.error};}));
if(await page.locator('#youtube-host iframe').count()){const frame=page.locator('#youtube-host iframe');console.log('player-size',await frame.boundingBox());await page.screenshot({path:'qa/youtube.png',fullPage:true});}
await page.getByRole('button',{name:'Local audio',exact:true}).click();await page.waitForTimeout(700);console.log('source-switch',await page.evaluate(async()=>{const {usePlayer}=await import('/src/state/store.ts');return {mode:usePlayer.getState().mode,remainingYouTubePlayers:document.querySelectorAll('#youtube-host iframe').length};}));
console.log('PAGE_ERRORS',errors);await browser.close();
