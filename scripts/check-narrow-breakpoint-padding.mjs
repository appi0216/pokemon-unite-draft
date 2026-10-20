import fs from 'node:fs';
import assert from 'node:assert/strict';
import postcss from 'postcss';

const file = 'src/workspace-layout.css';
const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
const narrow = [];
const broad = [];
const narrowLayout = [];
root.walkRules(rule => {
  if (rule.selector !== '.team-panel') return;
  const media = [];
  for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type === 'atrule') media.unshift(`${parent.name} ${parent.params}`);
  }
  const declarations = rule.nodes.filter(node => node.type === 'decl');
  if (media.length === 1 && media[0] === 'media (max-width: 600px)') {
    if (declarations.some(node => node.prop === 'padding' && node.value === '10px')) narrow.push(rule);
    if (declarations.some(node => node.prop === 'gap' && node.value === '6px')
      && declarations.some(node => node.prop === 'grid-template-rows')) narrowLayout.push(rule);
  }
  if (media.length === 1 && media[0] === 'media (max-width: 1000px)'
    && declarations.some(node => node.prop === 'padding' && node.value === '10px')) broad.push(rule);
});
assert.equal(narrow.length, 0, 'The redundant narrow padding declaration returned');
assert.equal(broad.length, 1, 'The wider max-width:1000px padding declaration must remain');
assert.equal(narrowLayout.length, 1, 'Keep the distinct narrow gap/grid adaptations');
console.log('PASS: only the redundant max-width:600px team-panel padding was removed');
