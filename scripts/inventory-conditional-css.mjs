import fs from 'node:fs';
import crypto from 'node:crypto';
import postcss from 'postcss';

// An inventory, deliberately NOT an unused-CSS detector. Source references
// and querySelector matches cannot establish cascade necessity or reachability.
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const files = walk('src').sort();
const sources = files.filter(f => /\.(tsx?|json)$/.test(f));
const css = files.filter(f => f.endsWith('.css'));
const entries = [];
const priorCoverage = JSON.parse(fs.readFileSync('docs/LEGACY-CSS-RUNTIME-COVERAGE.json', 'utf8'));
const hashes = {};
for (const file of [...sources, ...css, 'docs/LEGACY-CSS-RUNTIME-COVERAGE.json']) {
  hashes[file] = crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
}
const lines = sources.flatMap(file => fs.readFileSync(file, 'utf8').split(/\r?\n/)
  .map((text, index) => ({ file, line: index + 1, text })));
for (const file of css) {
  postcss.parse(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), { from: file }).walkRules(rule => {
    const conditions = [];
    for (let p = rule.parent; p; p = p.parent) {
      if (p.type === 'atrule') conditions.unshift(`@${p.name} ${p.params}`);
    }
    // Include every rule: class/attribute states may be conditional even when
    // there is no media query or pseudo-class in the selector.
    const classes = [...new Set([...rule.selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m => m[1]))];
    const forcedWitness = file === 'src/setup-refresh.css' && conditions.some(c => c.includes('forced-colors: active'));
    const disabledWitness = file === 'src/pwa/install.css' && rule.selector === '.pwa-panel button:disabled';
    const focusWitness = file === 'src/responsive-controls.css' && rule.selector === '.app .pokemon-grid .pokemon-card:focus-visible';
    entries.push({
      id: entries.length + 1, file, line: rule.source.start.line,
      selector: rule.selector, conditions,
      conditionKinds: [...new Set([
        ...conditions.map(c => c.split(' ')[0]),
        ...[...rule.selector.matchAll(/:{1,2}([\w-]+)/g)].map(m => `:${m[1]}`),
      ])],
      historicalUnmatched: priorCoverage.unmatched.includes(rule.selector),
      declarations: rule.nodes.filter(n => n.type === 'decl').map(n => n.toString()),
      references: classes.map(name => ({ name, locations: lines.filter(l => l.text.includes(name)).map(({ file, line }) => ({ file, line })) })),
      status: forcedWitness || disabledWitness || focusWitness || (file === 'src/ui-tokens.css' && rule.selector === '.app' && conditions.some(c => /pointer\s*:\s*coarse/.test(c))) ? 'retain-observed-effect' : 'unproven-retained',
      reason: forcedWitness ? 'tests/browser/css-forced-colors.mjs: forced-colors active; removal changes computed outlines for existing home selected controls/switch, restoration returns original in Chromium/WebKit. Effect witness for each rule, not every selector alternative or all states.' : disabledWitness ? 'tests/browser/css-disabled.mjs: actual offline transition disables update button; removal changes opacity .5 to .48 and cursor default to pointer in Chromium/WebKit; restoration reverses both. Keep; effect witness only.' : focusWitness ? 'tests/browser/css-necessity.mjs: keyboard focus matches; removing the rule changes outline offset from -3px to -2px in Chromium/WebKit, restoration returns -3px. Evidence of effect, not a claim that every declaration is individually essential.' : file === 'src/ui-tokens.css' && rule.selector === '.app' && conditions.some(c => /pointer\s*:\s*coarse/.test(c))
        ? 'tests/browser/css-necessity.mjs: removing this declaration changes sort button height from 44px to 30px in Chromium/WebKit at 390x844 with coarse pointer; restoring returns 44px. This is a necessity witness, not a universal unusedness proof.'
        : 'Text references are search evidence only. DOM reachability, environmental predicates and cascade equivalence have not been proved for all states.',
    });
  });
}
const report = { scope: 'All src CSS rules, including keyframe steps; lexical class extraction is not selector semantics.',
  proofComplete: false, cssFiles: css.length, ruleCount: entries.length,
  sourceHashes: hashes, entries };
const destination = 'docs/CONDITIONAL-CSS-INVENTORY.json';
const serialized = JSON.stringify(report, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8').replace(/\r\n/g, '\n') !== serialized) {
    console.error('CSS inventory is stale. Regenerate and review it; regeneration is not a proof of unusedness.');
    process.exitCode = 1;
  }
} else fs.writeFileSync(destination, serialized);
console.log(JSON.stringify({ cssFiles: css.length, rules: entries.length, proofComplete: false }));
