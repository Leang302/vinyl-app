import { chromium } from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [name,url] of [['radio','https://www.youtube.com/watch?v=pMuyCwMkXAU&list=RDpMuyCwMkXAU&start_radio=1'],['single','https://www.youtube.com/watch?v=pMuyCwMkXAU'],['supported-radio-seed','https://www.youtube.com/watch?v=M7lc1UVf-VE&list=RDM7lc1UVf-VE&start_radio=1']]){
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5174');await page.getByRole('button',{name:'Add music',exact:true}).click();await page.getByLabel('Video or playlist URL').fill(url);await page.getByRole('button',{name:'Add to my collection'}).click();
  for(let i=0;i<120;i++){const status=await page.evaluate(async()=>{const resource=performance.getEntriesByType('resource').find(r=>r.name.includes('/src/state/store.ts'));const {usePlayer}=await import(resource.name);const s=usePlayer.getState();return {state:s.state,title:s.track?.title,error:s.error};});if(['playing','error'].includes(status.state)||i===119){console.log(name,JSON.stringify(status));break;}await page.waitForTimeout(200);}
  await page.waitForTimeout(1000);console.log(name,'source-notice',await page.locator('.source-notice').count(),'source-error',await page.locator('.source-error').count(),'youtube-link',await page.getByRole('link',{name:'Open on YouTube'}).getAttribute('href'));
  console.log(name,'iframe',await page.locator('#youtube-host iframe').count(),'page-errors',JSON.stringify(errors));await page.close();
 }
}finally{await browser.close();}
