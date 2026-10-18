import fs from 'node:fs';
import postcss from 'postcss';
const files=[...fs.readFileSync('src/legacy.css','utf8').matchAll(/@import "\.\/(.*?)"/g)].map(m=>'src/'+m[1]);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
const sources=walk('src').filter(p=>/\.(tsx?|json)$/.test(p)).map(p=>fs.readFileSync(p,'utf8')).join('\n');
const candidates=[];
for(const file of files)postcss.parse(fs.readFileSync(file,'utf8')).walkRules(r=>{
 const classes=[...r.selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m=>m[1]);
 const missing=classes.filter(c=>!sources.includes(c));
 if(missing.length)candidates.push({file,line:r.source.start.line,selector:r.selector,missing});
});
fs.mkdirSync('.artifacts/css-full-audit',{recursive:true});fs.writeFileSync('.artifacts/css-full-audit/static-candidates.json',JSON.stringify(candidates,null,2));
console.log([...new Set(candidates.flatMap(r=>r.missing))].join('\n'));
