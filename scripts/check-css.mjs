import fs from 'node:fs';
import postcss from 'postcss';
const fix = process.argv.includes('--fix');
let duplicateRules = 0;
for (const file of fs.readdirSync('src/styles').filter((name) => name.endsWith('.css'))) {
  const path = `src/styles/${file}`;
  const root = postcss.parse(fs.readFileSync(path, 'utf8'), { from: path });
  function clean(container, depth = 0) {
    const seen = new Set();
    for (const node of [...container.nodes].reverse()) {
      const signature = node.toString().replace(/\s+/g, ' ').trim();
      if (seen.has(signature)) { duplicateRules++; if (fix) node.remove(); } else seen.add(signature);
    }
    for (const node of container.nodes) {
      if (!fix) continue;
      node.raws.before = `\n${'  '.repeat(depth)}`;
      if (node.type === 'decl') node.raws.between = ': ';
      if (node.nodes) {
        node.raws.between = ' ';
        node.raws.after = `\n${'  '.repeat(depth)}`;
        clean(node, depth + 1);
      }
    }
  }
  clean(root);
  if (fix) fs.writeFileSync(path, root.toString().trim() + '\n');
}
console.log(JSON.stringify({ cssParsed: true, duplicateRules, fixed: fix }));
