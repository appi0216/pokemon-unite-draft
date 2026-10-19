import fs from 'node:fs';
import postcss from 'postcss';
import parser from 'postcss-selector-parser';
import assert from 'node:assert/strict';
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${d}/${e.name}`):[`${d}/${e.name}`]);
const files=walk('src');
const source=files.filter(f=>/\.(tsx?|json)$/.test(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n');
// Only use the previously reviewed obsolete UI class contract; a fresh
// lexical absence alone never adds a class to the deletion allowlist.
const old=JSON.parse(fs.readFileSync('docs/LEGACY-CSS-UNUSED-DECISIONS.json','utf8'));
const absent=new Set(old.absentClasses.filter(c=>!source.includes(c)));
function impossible(selector) {
 return selector.nodes.some(n=>{
  if(n.type==='class')return absent.has(n.value);
  // An absent class inside :not() does NOT make the subject impossible.
  // :is/:where need one possible alternative; :has needs one possible match.
  if(n.type==='pseudo' && [':is',':where',':has'].includes(n.value))
   return n.nodes?.length>0 && n.nodes.every(impossible);
  return false;
 });
}
const removed=[],retained=[];
// Regression cases for the deletion proof's boolean semantics.
const probe=[...absent][0];
for(const [selector,expected] of [[`.${probe}`,true],[`:not(.${probe})`,false],[`:is(.${probe},.app)`,false],[`:has(.${probe})`,true],[`:has(:not(.${probe}))`,false],[`.app:not(.${probe})`,false]])
 assert.equal(impossible(parser().astSync(selector).nodes[0]),expected,selector);
for(const file of files.filter(f=>f.endsWith('.css'))) {
 const css=postcss.parse(fs.readFileSync(file,'utf8'),{from:file});
 css.walkRules(rule=>{
  if(rule.parent.type==='atrule' && /keyframes$/.test(rule.parent.name))return;
  const tree=parser().astSync(rule.selector);
  for(const branch of [...tree.nodes]) {
   if(impossible(branch)) {
    removed.push({file,line:rule.source.start.line,selector:branch.toString(),reason:'Required positive obsolete UI class, or all positive alternatives impossible; negation never used as absence evidence'});
    branch.remove();
   } else retained.push({file,selector:branch.toString(),decision:'retain; unreachable not established by obsolete-class contract'});
  }
  if(!tree.nodes.length)rule.remove();else rule.selector=tree.toString();
 });
 if(process.argv.includes('--fix'))fs.writeFileSync(file,css.toString());
}
const report={scope:'Current application, reviewed obsolete-class contract only; not universal future DOM proof',absentClasses:[...absent],removed,retained};
fs.mkdirSync('.artifacts/css-batch',{recursive:true});
fs.writeFileSync('.artifacts/css-batch/disposition.json',JSON.stringify(report,null,2));
console.log({removed:removed.length,retained:retained.length,changedFiles:[...new Set(removed.map(r=>r.file))]});
if(process.argv.includes('--check') && removed.length)process.exitCode=1;
