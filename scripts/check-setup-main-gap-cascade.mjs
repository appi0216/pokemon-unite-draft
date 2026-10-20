import fs from 'node:fs';
import assert from 'node:assert/strict';
import postcss from 'postcss';

function matchingDeclarations(file, selector, media, property, value) {
  const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
  const matches = [];
  root.walkRules(rule => {
    if (rule.selector !== selector) return;
    const conditions = [];
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type === 'atrule') conditions.unshift(`${parent.name} ${parent.params}`);
    }
    if (conditions.length !== 1 || conditions[0] !== `media ${media}`) return;
    for (const declaration of rule.nodes.filter(node => node.type === 'decl'
      && node.prop === property && node.value === value)) matches.push(declaration);
  });
  return matches;
}

const refinement = 'src/refinement.css';
const experience = 'src/setup-experience.css';
const legacy = fs.readFileSync('src/legacy.css', 'utf8');
const imports = [...legacy.matchAll(/@import\s+"\.\/([^";]+\.css)"\s+layer\(legacy\);/g)].map(match => match[1]);
assert(imports.indexOf('refinement.css') < imports.indexOf('setup-experience.css'),
  'The legacy cascade must keep setup-experience after refinement');
assert.equal(matchingDeclarations(refinement, '.app .setup-main', '(max-width: 700px)', 'gap', '28px').length, 0,
  'The overridden narrow setup gap returned');
assert.equal(matchingDeclarations(refinement, '.app .setup-main', '(max-width: 1000px)', 'gap', '28px').length, 1,
  'Keep the broader setup fallback');
assert.equal(matchingDeclarations(experience, '.app .setup-main', '(max-width: 700px)', 'gap', '14px').length, 1,
  'Keep the later narrow setup gap');
console.log('PASS: narrow setup gap is absent; broad fallback, later winner and import order remain');
