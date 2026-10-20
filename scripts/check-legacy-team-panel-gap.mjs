import fs from 'node:fs';
import assert from 'node:assert/strict';
import postcss from 'postcss';

function declarations(file, selector, media, property, value) {
  const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
  const matches = [];
  root.walkRules(rule => {
    if (rule.selector !== selector) return;
    const conditions = [];
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type === 'atrule') conditions.unshift(`${parent.name} ${parent.params}`);
    }
    if (conditions.length === 1 && conditions[0] === `media ${media}`) {
      for (const decl of rule.nodes.filter(node => node.type === 'decl'
        && node.prop === property && node.value === value)) matches.push({ rule, decl });
    }
  });
  return matches;
}

const legacy = fs.readFileSync('src/legacy.css', 'utf8');
assert.match(legacy, /@import\s+"\.\/design\.css"\s+layer\(legacy\);/);
const main = fs.readFileSync('src/main.tsx', 'utf8');
const imports = [...main.matchAll(/import\s+"\.\/([^";]+\.css)";/g)].map(match => match[1]);
assert.equal(imports[0], 'legacy.css', 'The layered legacy stylesheet must load first');
assert(imports.indexOf('legacy.css') < imports.indexOf('workspace-layout.css'),
  'The unlayered workspace stylesheet must load after legacy');

assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 900px)', 'gap', '8px').length, 0,
  'The overridden narrow legacy gap returned');
assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 900px)', 'grid-template-rows', '41px 15px 51px 18px minmax(0, 1fr) 18px').length, 0,
  'The overridden narrow legacy grid rows returned');
assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 900px)', 'padding', '10px 7px').length, 0,
  'The overridden narrow legacy padding returned');
assert.equal(declarations('src/workspace-layout.css', '.team-panel', '(max-width: 1000px)', 'padding', '10px').length, 1,
  'Keep the unlayered broad workspace padding winner');
assert.equal(declarations('src/workspace-layout.css', '.team-panel', '(max-width: 1000px)', 'gap', '4px').length, 1,
  'Keep the unlayered broad workspace winner');
assert.equal(declarations('src/workspace-layout.css', '.team-panel', '(max-width: 600px)', 'gap', '6px').length, 1,
  'Keep the distinct unlayered phone override');
assert.equal(declarations('src/workspace-layout.css', '.team-panel', '(max-width: 1000px)', 'grid-template-rows', 'auto auto 44px auto minmax(0, 1fr)').length, 1,
  'Keep the unlayered broad workspace grid-row winner');
assert.equal(declarations('src/workspace-layout.css', '.team-panel', '(max-width: 600px)', 'grid-template-rows', 'auto 44px auto minmax(0, 1fr)').length, 1,
  'Keep the distinct unlayered phone grid-row override');
assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 680px)', 'grid-template-rows', '36px 14px 49px 15px minmax(0, 1fr) 18px').length, 0,
  'The overridden max-width:680px legacy grid rows returned');
assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 680px)', 'gap', '7px').length, 0,
  'The overridden max-width:680px legacy gap returned');
assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 680px)', 'padding', '10px 7px').length, 0,
  'The overridden max-width:680px legacy padding returned');
assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 680px)', 'border-radius', '13px').length, 1,
  'Keep the separate legacy max-width:680px radius');
assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 370px)', 'padding', '8px 5px').length, 0,
  'The overridden max-width:370px legacy padding returned');
assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 1200px)', 'gap', '8px').length, 1,
  'Keep the broader legacy fallback');
console.log('PASS: overridden narrow layered team-panel layout declarations are absent; unlayered winners and distinct fallbacks remain');
