import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const css=fs.readFileSync('src/ui-system.css','utf8');
for(const token of ['--decision-action-width','--decision-action-height','--decision-action-font-size'])
 assert(!css.includes(token),`Obsolete decision token returned: ${token}`);
assert(!/\.app:not\(\.setup-mode\)\s+\.decision-main\s*\{[^}]*display:\s*grid\b[^}]*grid-template-rows:/s.test(css),'Obsolete legacy decision grid returned');
assert(!css.includes('.complete-button')&&!css.includes('.next-game')&&!css.includes('.final-image-action'),'Obsolete legacy action selector returned');
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(f.endsWith('.tsx'))files.push(f)}}walk('src');
const source=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
for(const name of ['complete-button','next-game','final-image-action'])assert(!new RegExp(`\\b${name}\\b`).test(source),`Review old CSS cleanup if JSX reintroduces ${name}`);
console.log('PASS: legacy decision controls absent; current JSX selector contract unchanged');
