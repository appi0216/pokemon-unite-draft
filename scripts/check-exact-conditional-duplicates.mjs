import fs from 'node:fs';
import assert from 'node:assert/strict';
import postcss from 'postcss';
// Read-only guard. Layer boundaries are part of each comparison key.
const main=fs.readFileSync('src/main.tsx','utf8');
const legacy=fs.readFileSync('src/legacy.css','utf8');
const legacyFiles=[...legacy.matchAll(/@import\s+"\.\/([^";]+\.css)"\s+layer\(legacy\);/g)].map(m=>`src/${m[1]}`);
assert.equal(legacyFiles.length,9,'Review changed legacy import structure');
const directFiles=[...main.matchAll(/import\s+"\.\/([^";]+\.css)";/g)].map(m=>`src/${m[1]}`);
assert.equal(directFiles[0],'src/legacy.css','Review changed import ordering');
const groups=[{layer:'legacy',files:legacyFiles},{layer:'unlayered',files:directFiles.slice(1)}];
const duplicates=[];
for(const {layer,files} of groups){
 const seen=new Map();
 for(const file of files){
  postcss.parse(fs.readFileSync(file,'utf8'),{from:file}).walkRules(rule=>{
   const conditions=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent)conditions.unshift([p.name,p.params]);
   // Scope intentionally excludes nested layers, supports, containers and keyframes.
   if(!conditions.length || conditions.some(([name])=>name!=='media'))return;
   for(const decl of rule.nodes.filter(n=>n.type==='decl')){
    const key=JSON.stringify([conditions,rule.selector,decl.prop,decl.value,!!decl.important]);
    const location={file,line:decl.source.start.line};
    if(seen.has(key))duplicates.push({layer,earlier:seen.get(key),later:location,selector:rule.selector,conditions,declaration:decl.toString()});
    seen.set(key,location);
   }
  });
 }
}
if(duplicates.length){console.error(JSON.stringify(duplicates,null,2));process.exitCode=1;}
console.log(`${duplicates.length} identical conditional declaration duplicates across ${groups.reduce((n,g)=>n+g.files.length,0)} files (separate cascade layers)`);
