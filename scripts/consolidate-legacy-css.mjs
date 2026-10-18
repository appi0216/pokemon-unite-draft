import fs from 'node:fs';
import postcss from 'postcss';
const files=[...fs.readFileSync('src/legacy.css','utf8').matchAll(/@import "\.\/(.*?)"/g)].map(m=>'src/'+m[1]);
const roots=files.map(file=>({file,root:postcss.parse(fs.readFileSync(file,'utf8'),{from:file})}));
const context=n=>{const a=[];for(let p=n.parent;p&&p.type!=='root';p=p.parent)a.unshift('@'+p.name+' '+p.params);return a.join(' > ')};
const groups=new Map();
for(const {file,root} of roots)root.walkRules(rule=>{
 if(context(rule).includes('keyframes'))return;
 const key=context(rule)+'|'+rule.selector;
 const list=groups.get(key)||[];list.push({file,rule});groups.set(key,list);
});
const original=JSON.parse(fs.readFileSync('docs/LEGACY-CSS-CROSS-FILE.json','utf8'));
const report=[];let removed=0;
for(const candidate of original){
 const list=groups.get(candidate.selector)||[];
 const seen=new Map(), decisions=[];
 for(const {file,rule} of [...list].reverse())for(const decl of [...rule.nodes].reverse()){
  if(decl.type!=='decl')continue;
  const key=decl.prop+'|'+!!decl.important;
  const later=seen.get(key);
  const source={file,line:decl.source.start.line,property:decl.prop,value:decl.value,important:!!decl.important};
  if(later&&later.value===decl.value){
   decisions.push({...source,action:'remove-identical',supersededBy:later});
   if(process.argv.includes('--fix'))decl.remove();removed++;
  } else {
   decisions.push({...source,action:later?'retain-distinct-value':'retain-effective',reason:later?'Different values may be fallbacks or interact with intervening shorthand/state rules; preserve cascade order.':'Last declaration for this exact selector, conditional context and importance.'});
   seen.set(key,source);
  }
 }
 report.push({selector:candidate.selector,decision:decisions.some(d=>d.action==='remove-identical')?'deduplicated':'retained-with-reason',declarations:decisions});
}
if(process.argv.includes('--fix'))for(const {file,root} of roots){root.walkRules(r=>{if(!r.nodes.some(n=>n.type==='decl'||n.type==='rule'||n.type==='atrule'))r.remove()});fs.writeFileSync(file,root.toString());}
fs.writeFileSync('docs/LEGACY-CSS-DECISIONS.json',JSON.stringify(report,null,2));
console.log({groups:report.length,removed,retained:report.filter(r=>r.decision==='retained-with-reason').length});
