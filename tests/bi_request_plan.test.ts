import {expect,it} from 'vitest';
import {BI_TAB_REQUESTS,biRequestsForTab} from '../src/lib/biRequestPlan';
it('carrega somente quatro recursos na Visão Executiva, em vez de 16',()=>{
 expect(biRequestsForTab('visao-geral')).toEqual(['overview','production','comparison','operationalHealth']);
 expect(biRequestsForTab('visao-geral')).toHaveLength(4);
});
it('cada aba ativa consulta exclusivamente os seus indicadores',()=>{
 expect(biRequestsForTab('producao')).toEqual(['production']);
 expect(biRequestsForTab('conversao')).toEqual(['conversion']);
 expect(biRequestsForTab('bancos')).toEqual(['banks']);
 expect(biRequestsForTab('produtos')).toEqual(['products','convenios']);
 expect(biRequestsForTab('parceiros')).toEqual(['partners']);
 expect(biRequestsForTab('operadores')).toEqual(['operators']);
 expect(biRequestsForTab('sla-pendencias')).toEqual(['pendencies']);
 expect(biRequestsForTab('gargalos')).toEqual(['bottlenecks','cancellations','refusals']);
 expect(biRequestsForTab('integracoes')).toEqual(['integrations']);
});
it('o plano não inclui rankings nunca exibidos, nem dispara filtros de outra aba',()=>{
 expect(Object.values(BI_TAB_REQUESTS).flat()).not.toContain('rankings');
 expect(new Set(Object.keys(BI_TAB_REQUESTS)).size).toBe(10);
});
