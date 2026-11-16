import {expect,it} from 'vitest';
import {BI_SYNC_ENDPOINTS,LEGACY_SYNC_ENDPOINTS,syncEndpoints} from '../src/lib/scopedReads';
it('na tela BI sincroniza apenas os catálogos exigidos por filtros, busca global e identidade',()=>{
 expect(syncEndpoints('/bi')).toEqual(BI_SYNC_ENDPOINTS);
 expect(syncEndpoints('/dashboard-executivo')).toEqual(BI_SYNC_ENDPOINTS);
 expect(BI_SYNC_ENDPOINTS).toHaveLength(11);
 for(const necessary of ['/api/clients','/api/proposals','/api/banks','/api/partners','/api/products','/api/convenios?includeInactive=true','/api/users','/api/notifications','/api/whitelabel','/api/tenants']){
  expect(BI_SYNC_ENDPOINTS).toContain(necessary);
 }
 for(const unrelated of ['/api/audit-logs','/api/documents','/api/financial','/api/bank-promoters','/api/operational-rules']){
  expect(BI_SYNC_ENDPOINTS).not.toContain(unrelated);
 }
});
it('a navegação para Propostas volta a recuperar a sincronização completa',()=>{
 expect(syncEndpoints('/propostas')).toEqual(LEGACY_SYNC_ENDPOINTS);
 expect(syncEndpoints('/propostas')).toContain('/api/audit-logs');
});
it('perfis não autenticados e portais de parceiros não carregam catálogos do usuário',()=>{
 expect(syncEndpoints('/login')).toEqual([]);
 expect(syncEndpoints('/parceiro/dashboard')).toEqual([]);
});
