import {createRequire} from 'node:module';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
for(const [name,engine] of Object.entries({chromium,webkit})){
 const browser=await engine.launch();
 const page=await browser.newPage({viewport:{width:320,height:568},reducedMotion:'reduce'});
 try{
  await page.clock.install();
  await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:5174/pokemon-unite-draft/v2/');
  await page.getByRole('switch').click();await page.locator('.begin').click();await page.locator('.first-choice button').first().click();
  await page.clock.runFor(15000);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('unite-draft.studio.v2')).draft.actions.length===1);
  for(let i=1;i<6;i++){
   await page.getByRole('button',{name:'その他の操作'}).click();
   await page.getByRole('button',{name:'BANをスキップ'}).click();
  }
  await page.getByRole('button',{name:'タイマーを開始'}).click();await page.clock.runFor(20000);
  if(await page.evaluate(()=>JSON.parse(localStorage.getItem('unite-draft.studio.v2')).draft.actions.length)!==6)throw Error('PICK timeout changed choices');
  for(const [width,height] of [[667,375],[1440,900],[768,1024],[320,568]]){
   await page.setViewportSize({width,height});
   await page.locator('.creature:not(:disabled)').first().click();await page.locator('.commit').click();
   const m=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,bar:document.querySelector('.command-bar').getBoundingClientRect().bottom,height:innerHeight}));
   if(m.overflow||m.bar>m.height+1)throw Error('Resize layout failed');
  }
  await page.getByRole('button',{name:'使い方',exact:true}).click();await page.keyboard.press('Escape');
  if(await page.locator('dialog[open]').count())throw Error('Escape did not close dialog');
  console.log(`${name}: timer, live resizing, keyboard dialog dismissal passed`);
 }finally{await browser.close();}
}
