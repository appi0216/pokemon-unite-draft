import fs from 'node:fs';
import assert from 'node:assert/strict';
import postcss from 'postcss';

const file = 'src/workspace-layout.css';
const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
const narrow = [];
const broad = [];
const laterOverride = [];

root.walkRules(rule => {
  if (rule.selector !== '.decision-main') return;
  const media = [];
  for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type === 'atrule') media.unshift(`${parent.name} ${parent.params}`);
  }
  const declarations = rule.nodes.filter(node => node.type === 'decl');
  if (media.length === 1 && media[0] === 'media (max-width: 600px)') {
    if (declarations.some(node => node.prop === 'grid-column' && node.value === '2')
      || declarations.some(node => node.prop === 'grid-row' && node.value === '1 / 3')) narrow.push(rule);
    if (declarations.some(node => node.prop === 'grid-area' && node.value === '1 / 1 / 2 / -1')) laterOverride.push(rule);
  }
  if (media.length === 1 && media[0] === 'media (max-width: 1000px)'
    && declarations.some(node => node.prop === 'grid-column' && node.value === '2')
    && declarations.some(node => node.prop === 'grid-row' && node.value === '1')) broad.push(rule);
});

assert.equal(narrow.length, 0, 'The overridden max-width:600px grid placement returned');
assert.equal(laterOverride.length, 1, 'Keep the later narrow grid-area placement');
assert.equal(broad.length, 1, 'Keep the distinct max-width:1000px placement');
console.log('PASS: only the overridden max-width:600px decision-main grid placement was removed');
