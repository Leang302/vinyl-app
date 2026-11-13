// Design-system audit: contrast, focus rings, accessible names, overflow, toast overlap.
// Usage: node qa/design-check.mjs [baseUrl]   (dev server must be running)
import { chromium } from '@playwright/test';
const base=process.argv[2]||'http://127.0.0.1:5173/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,width,height] of [['1440',1440,900],['390',390,844]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForTimeout(2500);
  await page.screenshot({path:`qa/design-${name}.png`});
  const audit=await page.evaluate(()=>{
    const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return null;const [r,g,b,a=1]=m[1].split(/[ ,/]+/).filter(Boolean).map(Number);return {r,g,b,a};};
    const lum=({r,g,b})=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};return .2126*f(r)+.7152*f(g)+.0722*f(b);};
    const bgOf=el=>{const layers=[];for(let n=el;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c&&c.a>0){layers.push(c);if(c.a>=1)break;}}let out={r:14,g:15,b:13};for(const c of layers.reverse())out={r:c.r*c.a+out.r*(1-c.a),g:c.g*c.a+out.g*(1-c.a),b:c.b*c.a+out.b*(1-c.a)};return out;};
    const low=[];
    for(const el of document.querySelectorAll('body *')){
      if(!el.childNodes.length||![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
      const r=el.getBoundingClientRect();if(!r.width||r.bottom<0||r.top>innerHeight)continue;
      const cs=getComputedStyle(el);if(cs.visibility==='hidden'||+cs.opacity===0||el.closest('[aria-hidden=true],.physical-guides-layer,iframe,[disabled],[data-disabled]'))continue;
      let op=1;for(let n=el;n;n=n.parentElement)op*=+getComputedStyle(n).opacity;if(op<.99)continue;
      const fg=parse(cs.color);const bg=bgOf(el);const L1=lum(fg),L2=lum(bg);const ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
      if(ratio<4.5)low.push(`${ratio.toFixed(2)} "${el.textContent.trim().slice(0,30)}" .${el.className}`);
    }
    const unnamed=[...document.querySelectorAll('button,a[href],[role=tab],[role=slider]')].filter(b=>{const r=b.getBoundingClientRect();return r.width&&!(b.getAttribute('aria-label')||b.textContent.trim()||b.getAttribute('aria-labelledby'));}).map(b=>b.outerHTML.slice(0,80));
    const clipped=[...document.querySelectorAll('.player-bar button,.transport-pill button,.stage-toolbar button')].filter(b=>{const x=b.getBoundingClientRect();return x.width>0&&(x.left<0||x.right>innerWidth);}).map(b=>b.getAttribute('aria-label'));
    return {low,unnamed,clipped,overflowX:document.documentElement.scrollWidth>innerWidth};
  });
  // Focus rings: tab through the first 40 stops and make sure each shows an outline.
  const noRing=[];let stops=0;
  for(let i=0;i<40;i++){await page.keyboard.press('Tab');const r=await page.evaluate(()=>{const el=document.activeElement;if(!el||el===document.body)return null;const cs=getComputedStyle(el);const ring=cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>=2;return {ring,label:el.getAttribute('aria-label')||el.textContent.trim().slice(0,25)||el.tagName};});if(!r)continue;stops++;if(!r.ring)noRing.push(r.label);}
  await page.evaluate(()=>window.__vinylNotify?.('Skipped “Song”: embedding disabled'));await page.waitForTimeout(900);
  const toastHits=await page.evaluate(()=>{const t=document.querySelector('[data-sonner-toast]')?.getBoundingClientRect();if(!t)return 'no toast';return [...document.querySelectorAll('.transport-pill button,.player-bar button,.player-bar [role=slider]')].filter(b=>{const x=b.getBoundingClientRect();return x.width&&!(x.right<=t.left||t.right<=x.left||x.bottom<=t.top||t.bottom<=x.top);}).map(b=>b.getAttribute('aria-label'));});
  await page.screenshot({path:`qa/design-${name}-toast.png`});
  console.log(`\n=== ${name}px`);console.log('contrast < 4.5:',audit.low.length?audit.low:'none');console.log('unnamed controls:',audit.unnamed.length?audit.unnamed:'none');console.log('focus stops checked:',stops,'without ring:',noRing.length?noRing:'none');console.log('clipped:',audit.clipped.length?audit.clipped:'none','| horizontal overflow:',audit.overflowX);console.log('toast overlaps:',toastHits.length?toastHits:'none');console.log('page errors:',errors.length?errors:'none');
  await page.close();
}
await browser.close();
