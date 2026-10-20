import fs from 'node:fs';
import assert from 'node:assert/strict';
import postcss from 'postcss';
// Limited to these two direct, unlayered imports; full ancestor paths are keys.
const files=['src/adaptive-ui.css','src/workspace-layout.css'];
const main=fs.readFileSync('src/main.tsx','utf8');
assert(main.includes('"./adaptive-ui.css"') && main.includes('"./workspace-layout.css"'));
assert(main.indexOf('"./adaptive-ui.css"') < main.indexOf('"./workspace-layout.css"'));
const trees=files.map(file=>({file,root:postcss.parse(fs.readFileSync(file,'utf8'),{from:file})}));
const seen=new Map(), removed=[];
for(const {file,root} of trees) root.walkRules(rule=>{
 const conditions=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent)conditions.unshift([p.name,p.params]);
 if(!conditions.length || conditions.some(([name])=>name!=='media'))return;
 for(const decl of [...rule.nodes].filter(n=>n.type==='decl')){
  const key=JSON.stringify([conditions,rule.selector,decl.prop,decl.value,!!decl.important]);
  const prior=seen.get(key);
  if(prior){removed.push({file:prior.file,line:prior.decl.source.start.line,selector:rule.selector,conditions,declaration:decl.toString(),dominator:{file,line:decl.source.start.line},reason:'Identical selector, ancestor media predicates, value and priority; same unlayered origin; later declaration always wins when earlier can apply.'});if(process.argv.includes('--fix'))prior.decl.remove();}
  seen.set(key,{file,decl});
 }
});
if(process.argv.includes('--fix')){
 assert.equal(removed.length,8,'Review changed candidate set before editing');
 for(const {file,root} of trees){root.walkRules(r=>{if(!r.nodes.length)r.remove();});fs.writeFileSync(file,root.toString());}
 fs.writeFileSync('docs/EXACT-CONDITIONAL-DUPLICATES.json',JSON.stringify({scope:'Current static stylesheet imports; no external CSSOM modifications',removed},null,2)+'\n');
}else if(removed.length){console.error(removed);process.exitCode=1;}
console.log(`${removed.length} identical conditional declaration duplicates`);

