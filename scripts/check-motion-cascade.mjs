import fs from 'node:fs';
import assert from 'node:assert/strict';
import postcss from 'postcss';
const main=fs.readFileSync('src/main.tsx','utf8');
const order=[...main.matchAll(/import\s+["']\.\/(.*?\.css)["']/g)].map(m=>m[1]);
assert(order.indexOf('legacy.css')>=0);
assert(order.indexOf('legacy.css')<order.indexOf('adaptive-ui.css'));
assert(order.indexOf('adaptive-ui.css')<order.indexOf('workspace-layout.css'));
const canonical=s=>s.replace(/\s/g,'').replace(/::/g,':');
const requirements=[['src/adaptive-ui.css','scroll-behavior','auto'],['src/workspace-layout.css','animation','none'],['src/workspace-layout.css','transition','none']];
for(const [file,property,value] of requirements){
 const root=postcss.parse(fs.readFileSync(file,'utf8'));let count=0;
 root.walkRules(rule=>{
  if(canonical(rule.selector)!=='*,*:before,*:after')return;
  if(rule.parent.type!=='atrule'||rule.parent.name!=='media'||rule.parent.params!=='(prefers-reduced-motion: reduce)'||rule.parent.parent.type!=='root')return;
  for(const d of rule.nodes)if(d.type==='decl'&&d.prop===property&&d.value===value&&d.important)count++;
 });
 assert.equal(count,1,`${file}: retain one unlayered global ${property} suppression`);
}
console.log('PASS: reduced-motion suppression and import-order assumptions retained');
