// Plays the first N results of a search one by one in real Chrome and records YouTube's error codes.
// Usage: node qa/embed-survey.mjs "<search or link>" [baseUrl]   (needs VITE_YOUTUBE_API_KEY in .env.local for search)
import { chromium } from '@playwright/test';
const query=process.argv[2]||'Noly Records';const base=process.argv[3]||'http://127.0.0.1:5173/';const N=8;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const codes=[];page.on('console',m=>{const t=m.text();if(t.startsWith('[VINYL] YouTube error'))codes.push(t.replace('[VINYL] YouTube error ',''));});
await page.goto(base);await page.waitForTimeout(1500);
await page.getByRole('button',{name:'Clear'}).click().catch(()=>{});await page.getByRole('radio',{name:'YouTube'}).click();
await page.getByRole('textbox',{name:/YouTube link/}).fill(query);await page.getByRole('button',{name:'Start this record'}).click();
await page.waitForFunction(()=>document.querySelectorAll('.queue-row').length>0,null,{timeout:30000});
const total=await page.locator('.queue-row').count();const results=[];
for(let i=0;i<Math.min(N,total);i++){
  const before=codes.length;
  await page.locator('.queue-row-main').nth(i).click();
  let status='timeout';
  for(let t=0;t<40;t++){await page.waitForTimeout(250);if(codes.length>before){status='error '+codes.at(-1).split(' ')[0];break;}if(await page.locator('.play-button').getAttribute('aria-label')==='Pause'){status='plays';break;}}
  results.push(`${status.padEnd(10)} ${(await page.locator('.queue-row .queue-text strong').nth(i).innerText()).slice(0,60)}`);
}
console.log(`query: ${query} (${total} queued)\n`+results.join('\n'));
await browser.close();
