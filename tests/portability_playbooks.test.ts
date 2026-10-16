import { expect,it } from 'vitest';
import { PORTABILITY_PLAYBOOKS, searchBankPlaybooks } from '../src/lib/bankPlaybooks';
it('preserves page identities and channel distinctions without exposing promoter names',()=>{
 expect(PORTABILITY_PLAYBOOKS).toHaveLength(12);
 expect(PORTABILITY_PLAYBOOKS.filter(row=>row.bankId==='brb')).toHaveLength(2);
 expect(PORTABILITY_PLAYBOOKS.some(row=>row.bankId==='quadro8')).toBe(false);
 expect(JSON.stringify(PORTABILITY_PLAYBOOKS)).not.toMatch(/prospecta|finconta|consig360|comissiona/i);
 expect(searchBankPlaybooks('C6 portabilidade 37 pagas').some(row=>row.page==='3'&&row.excerpt.includes('37 pagas'))).toBe(true);
 expect(PORTABILITY_PLAYBOOKS.find(row=>row.bankId==='facta')?.text).toContain('R$ 1.900,00');
});
