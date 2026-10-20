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
assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 900px)', 'padding', '10px 7px').length, 1,
  'Keep the separate legacy narrow padding');
assert.equal(declarations('src/workspace-layout.css', '.team-panel', '(max-width: 1000px)', 'gap', '4px').length, 1,
  'Keep the unlayered broad workspace winner');
assert.equal(declarations('src/workspace-layout.css', '.team-panel', '(max-width: 600px)', 'gap', '6px').length, 1,
  'Keep the distinct unlayered phone override');
assert.equal(declarations('src/design.css', '.team-panel', '(max-width: 1200px)', 'gap', '8px').length, 1,
  'Keep the broader legacy fallback');
console.log('PASS: narrow layered gap is absent; unlayered winners and distinct fallbacks remain');
