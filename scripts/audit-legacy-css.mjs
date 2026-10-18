import fs from 'node:fs';
import postcss from 'postcss';
const files=[...fs.readFileSync('src/legacy.css','utf8').matchAll(/@import "\.\/(.*?)"/g)].map(m=>'src/'+m[1]);
const findings=[]; let removed=0;
for(const file of files){
 const root=postcss.parse(fs.readFileSync(file,'utf8'),{from:file});
 const rules=new Map(); const duplicates=[];
 const context=n=>{const a=[];for(let p=n.parent;p&&p.type!=='root';p=p.parent)a.unshift('@'+p.name+' '+p.params);return a.join(' > ')};
 root.walkRules(rule=>{
  if(!rule.nodes.every(n=>n.type==='decl'||n.type==='comment'))return;
  const key=context(rule)+'|'+rule.selector;
  const list=rules.get(key)||[];list.push(rule);rules.set(key,list);
 });
 for(const [key,list] of rules){
  const seen=new Map();
  for(const rule of [...list].reverse()){
   const signature=rule.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value,!!n.important].join(':')).join(';');
   if(seen.has(signature)){
    duplicates.push({line:rule.source.start.line,selector:rule.selector,context:context(rule),kept:seen.get(signature)});
    if(process.argv.includes('--fix'))rule.remove();removed++;
   } else seen.set(signature,rule.source.start.line);
  }
 }
 const repeated=[...rules].filter(([,v])=>v.length>1).map(([key,v])=>({selector:key,count:v.length,lines:v.map(n=>n.source.start.line)}));
 findings.push({file,ruleCount:[...rules.values()].reduce((n,v)=>n+v.length,0),exactDuplicateRules:duplicates,repeatedSelectors:repeated});
 if(process.argv.includes('--fix'))fs.writeFileSync(file,root.toString());
}
fs.mkdirSync('.artifacts/css-audit',{recursive:true});fs.writeFileSync('.artifacts/css-audit/report.json',JSON.stringify(findings,null,2));
console.log(JSON.stringify({files:files.length,exactDuplicateRules:removed,summary:findings.map(f=>({file:f.file,rules:f.ruleCount,duplicates:f.exactDuplicateRules.length,repeatedSelectors:f.repeatedSelectors.length}))},null,2));

// Cross-file candidates are reported, not automatically merged: intervening
// shorthand declarations, layers and selector lists require manual review.
const cross=new Map();
for(const file of files){
 postcss.parse(fs.readFileSync(file,'utf8')).walkRules(rule=>{
  const ancestors=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent)ancestors.unshift('@'+p.name+' '+p.params);
  const key=ancestors.join(' > ')+'|'+rule.selector;
  const entries=cross.get(key)||[];entries.push({file,line:rule.source.start.line});cross.set(key,entries);
 });
}
const candidates=[...cross].filter(([,entries])=>new Set(entries.map(e=>e.file)).size>1).map(([selector,entries])=>({selector,entries}));
fs.writeFileSync('.artifacts/css-audit/cross-file.json',JSON.stringify(candidates,null,2));
console.log('Cross-file repeated selector/context groups: '+candidates.length);
