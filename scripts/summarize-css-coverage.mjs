import fs from 'node:fs';
const dir='.artifacts/css-full-final';
const files=fs.readdirSync(dir).filter(f=>f.endsWith('-selectors.json'));
const observed=new Set(),matched=new Set();
for(const file of files){const r=JSON.parse(fs.readFileSync(dir+'/'+file,'utf8'));r.observed.forEach(s=>observed.add(s));r.matched.forEach(s=>matched.add(s));}
fs.writeFileSync('docs/LEGACY-CSS-RUNTIME-COVERAGE.json',JSON.stringify({runs:files,observedCount:observed.size,matchedCount:matched.size,note:'DOM selector matches, not proof of active declarations or unused selectors. Conditional unmatched selectors are retained.',unmatched:[...observed].filter(s=>!matched.has(s))},null,2));
console.log({runs:files.length,observed:observed.size,matched:matched.size});
