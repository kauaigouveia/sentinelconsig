// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../src/router/routes';
import { operationalFamily } from '../src/components/redesign/operationalFamilies';
beforeEach(()=>localStorage.clear());
describe('Escopo dos módulos da área de trabalho',()=>{
  it.each(APP_ROUTES.filter(route=>route.category!=='Portal do Parceiro'))('$path possui família operacional sem alterar sua rota', route=>{
    expect(operationalFamily(route.viewId)).toBeTruthy();
  });
  it.each(APP_ROUTES.filter(route=>route.category==='Portal do Parceiro'))('$path não recebe a apresentação administrativa',route=>{
    expect(operationalFamily(route.viewId)).toBeUndefined();
  });
  it('Command Center e dashboard mantêm famílias separadas',()=>{
    expect(operationalFamily('command-center')).toBe('command');
    expect(operationalFamily('torre-controle')).toBe('special');
  });

});
