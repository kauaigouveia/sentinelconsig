import ts from 'typescript';
const printer=ts.createPrinter({removeComments:true});
// Normalize presentation only; retain controls, API calls, permissions and state expressions.
export function presentationIndependentSource(src){const tree=ts.createSourceFile('x.tsx',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const result=ts.transform(tree,[ctx=>root=>{function visit(n){
if(ts.isImportDeclaration(n)&&n.moduleSpecifier.text.includes('configurationColorValues'))return;
if(ts.isJsxAttribute(n)&&['className','style','fill','stroke','stopColor','color'].includes(n.name.getText(tree)))return;
if(ts.isJsxElement(n)&&['linearGradient','radialGradient'].includes(n.openingElement.tagName.getText(tree)))return;
if(ts.isPropertyAssignment(n)&&['color','background','backgroundColor','borderColor','boxShadow','fill','stroke','stripColor'].includes(n.name.getText(tree)))return;
if(ts.isPropertyAccessExpression(n)&&n.expression.getText(tree)==='configurationColorValues')return ctx.factory.createStringLiteral('<color>');
if(ts.isStringLiteralLike(n)&&/^(?:#[\da-f]{3,8}|rgba?\([^)]*\)|var\(--[\w-]+\)|url\(#sentinel-chart-pattern-\d+\)|white|black)$/i.test(n.text))return ctx.factory.createStringLiteral('<color>');
if(ts.isStringLiteral(n)&&/(?:bg-|text-|border-|ring-|shadow-|active:|transition-|flex|grid)/.test(n.text))return ctx.factory.createStringLiteral('<classes>');
return ts.visitEachChild(n,visit,ctx)}return ts.visitNode(root,visit)}]);const out=printer.printFile(result.transformed[0]);result.dispose();return out.replace(/\r\n/g,'\n').split('\n').map(line=>line.trimEnd()).join('\n');}
