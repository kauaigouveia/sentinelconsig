import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';

// Read-only source inspection. This script never imports application services.
export function inspectModule(path) {
  const text = fs.readFileSync(path, 'utf8');
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter({ removeComments: true });
  const controls = [], expressions = {};
  const hasJsx = node => {
    let found = false;
    const visit = item => {
      if (ts.isJsxElement(item) || ts.isJsxSelfClosingElement(item) || ts.isJsxFragment(item)) found = true;
      else ts.forEachChild(item, visit);
    };
    visit(node);
    return found;
  };
  const visit = node => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ['button','input','select','textarea','form'].includes(node.tagName.getText(tree))) {
      const attrs = node.attributes.properties.filter(a => ts.isJsxAttribute(a) && a.name.getText(tree) !== 'className').map(a => printer.printNode(ts.EmitHint.Unspecified,a,tree));
      controls.push({ tag: node.tagName.getText(tree), attrs });
    }
    if (ts.isVariableDeclaration(node) && node.initializer && !hasJsx(node.initializer)) {
      const name = node.name.getText(tree);
      (expressions[name] ||= []).push(createHash('sha256').update(printer.printNode(ts.EmitHint.Unspecified,node.initializer,tree)).digest('hex'));
    }
    ts.forEachChild(node,visit);
  };
  visit(tree);
  return { path, controls, expressions };
}
if (process.argv.includes('--capture')) {
  const paths = ['simulation/SimulationView','production/KanbanBoard','clients/Client360View','production/PortabilityView','admin/CentralPendencias'];
  fs.writeFileSync('docs/ui-redesign/modules-functional-baseline.json', JSON.stringify({ capturedBeforeMigration: true, modules: paths.map(p => inspectModule(`src/components/${p}.tsx`)) },null,2));
}
if (process.argv.includes('--capture-extra')) {
  const app = fs.readFileSync('src/App.tsx','utf8');
  const paths = [...app.matchAll(/lazyNamed\(\(\) => import\('\.\/(components\/[^']+)'\)/g)].map(match => `src/${match[1]}.tsx`);
  const initial = JSON.parse(fs.readFileSync('docs/ui-redesign/modules-functional-baseline.json','utf8')).modules.map(module => module.path);
  const remaining = [...new Set([...paths,'src/components/crm/PartnerCrmHub.tsx'])].filter(path => !initial.includes(path) && !path.endsWith('/ProductionList.tsx'));
  fs.writeFileSync('docs/ui-redesign/remaining-modules-baseline.json',JSON.stringify({capturedBeforeMigration:true,modules:remaining.map(inspectModule)},null,2));
}
