// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../src/router/routes';
import { operationalFamily } from '../src/components/redesign/operationalFamilies';
import { readDevelopmentPresentation, rememberDevelopmentPresentation } from '../src/components/redesign/developmentPresentation';
beforeEach(()=>localStorage.clear());
describe('Escopo da apresentação V2',()=>{
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
  it('conserva preferência em refresh e respeita rollback explícito',()=>{
    expect(readDevelopmentPresentation('')).toBe(false);
    rememberDevelopmentPresentation(true);
    expect(readDevelopmentPresentation('')).toBe(true);
    expect(readDevelopmentPresentation('?ui=legacy')).toBe(false);
    rememberDevelopmentPresentation(false);
    expect(readDevelopmentPresentation('')).toBe(false);
    expect(readDevelopmentPresentation('?ui=2')).toBe(true);
    expect(Object.values(localStorage)).toEqual(['legacy']);
  });
});
