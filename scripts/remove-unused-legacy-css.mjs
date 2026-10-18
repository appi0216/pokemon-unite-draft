import fs from 'node:fs';
import postcss from 'postcss';
const candidates=JSON.parse(fs.readFileSync('.artifacts/css-full-audit/static-candidates.json','utf8'));
const dynamic=new Set(['compact-view-roster','compact-view-purple','compact-view-orange']);
const absent=new Set(candidates.flatMap(r=>r.missing).filter(c=>!dynamic.has(c)));
const files=[...fs.readFileSync('src/legacy.css','utf8').matchAll(/@import "\.\/(.*?)"/g)].map(m=>'src/'+m[1]);
const removed=[],retained=[];
for(const file of files){
 const root=postcss.parse(fs.readFileSync(file,'utf8'));
 root.walkRules(rule=>{
  // Never split functional pseudo-classes: a missing class in :not() does
  // not make its selector unused. Such branches remain explicitly retained.
  if(rule.selector.includes('(')){retained.push({file,line:rule.source.start.line,selector:rule.selector,reason:'Functional pseudo-class semantics retained'});return;}
  const selectors=rule.selectors;
  const keep=selectors.filter(selector=>{
   const missing=[...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m=>m[1]).filter(c=>absent.has(c));
   if(!missing.length)return true;
   removed.push({file,line:rule.source.start.line,selector,missing,reason:'Required class absent from all current TS/TSX/JSON, DOM creation checked; compact-view dynamic family excluded'});return false;
  });
  if(keep.length===0)rule.remove();else if(keep.length!==selectors.length)rule.selectors=keep;
 });
 root.walkAtRules(rule=>{if(rule.nodes?.length===0)rule.remove()});
 fs.writeFileSync(file,root.toString());
}
fs.writeFileSync('docs/LEGACY-CSS-UNUSED-DECISIONS.json',JSON.stringify({absentClasses:[...absent],dynamicClasses:[...dynamic],removed,retained},null,2));
console.log({absentClasses:absent.size,removedSelectorBranches:removed.length,retainedFunctionalRules:retained.length});
