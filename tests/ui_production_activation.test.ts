// @vitest-environment jsdom
import {beforeEach,describe,expect,it} from 'vitest';
import {initialPresentation,canSwitchProductionPresentation} from '../src/components/redesign/productionPresentation';
import {readFileSync} from 'node:fs';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
beforeEach(()=>localStorage.clear());
describe('Ativação de produção sem alterar autenticação',()=>{
  it('V2 é padrão e ignora query e preferência de desenvolvimento',()=>{
    localStorage.setItem('sentinel.ui-development','legacy');
    expect(initialPresentation(false,undefined,'?ui=legacy')).toBe(true);
    expect(initialPresentation(false,'v2','?ui=legacy')).toBe(true);
    expect(initialPresentation(false,'legacy','?ui=2')).toBe(false);
  });
  it('preserva o opt-in e rollback no desenvolvimento',()=>{
    expect(initialPresentation(true,undefined,'?ui=2')).toBe(true);
    expect(initialPresentation(true,undefined,'?ui=legacy')).toBe(false);
  });
  it.each(['USUARIO','GESTOR','GERENTE','SIMULACAO','DIGITADOR',undefined])('não oferece override de produção ao perfil %s',role=>{
    expect(canSwitchProductionPresentation(true,role,undefined)).toBe(false);
  });
  it('override exige sessão MASTER/PLATFORM_MASTER e respeita rollback global',()=>{
    expect(canSwitchProductionPresentation(true,'MASTER',undefined)).toBe(true);
    expect(canSwitchProductionPresentation(true,'PLATFORM_MASTER',undefined)).toBe(true);
    expect(canSwitchProductionPresentation(false,'MASTER',undefined)).toBe(false);
    expect(canSwitchProductionPresentation(true,'MASTER','legacy')).toBe(false);
  });
  it('build Vercel preparado não executa migrations',()=>{
    const scripts=JSON.parse(readFileSync('package.json','utf8')).scripts;
    expect(scripts['vercel-build']).toBe('npm run build');
    expect(scripts.build).not.toMatch(/migrate|db push|seed/);
    expect(JSON.parse(readFileSync('vercel.json','utf8')).buildCommand).toBe('npm run build');
  });
  it('o grafo real da aplicação não alcança galeria, testes ou fixtures',()=>{
    const visited=new Set<string>();
    function visit(path:string) {
      if(visited.has(path))return;visited.add(path);
      expect(path.replaceAll('\\','/')).not.toMatch(/\/tests\/|galleryFixtures|GalleryWorkspaces|sentinel-2-preview\.tsx/);
      const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
      function dependency(value:string) {
        if(!value.startsWith('.'))return;
        const base=resolve(dirname(path),value);
        const next=[base,base+'.tsx',base+'.ts',resolve(base,'index.tsx'),resolve(base,'index.ts')].find(file=>/\.(ts|tsx)$/.test(file)&&existsSync(file));
        if(next)visit(next);
      }
      function walk(node:ts.Node) {
        if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier))dependency(node.moduleSpecifier.text);
        if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))dependency(node.arguments[0].text);
        ts.forEachChild(node,walk);
      }
      walk(source);
    }
    visit(resolve('src/App.tsx'));
    expect(visited.size).toBeGreaterThan(50);
  });
});
