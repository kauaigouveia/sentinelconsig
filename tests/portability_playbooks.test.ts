import {PORTABILITY_ARCHIVE_BOOKS} from '../src/lib/portabilityPlaybooks';
import replacement from '../src/data/portabilityRulesReplacement20261030.json';
import { expect,it } from 'vitest';
import { PORTABILITY_PLAYBOOKS, searchBankPlaybooks } from '../src/lib/bankPlaybooks';
import historical from '../src/data/portabilityRules20261019.json';
import supplement from '../src/data/portabilityRulesSupplement.json';
it('preserves historical and supplemental sources without inventing PDF pages or precedence',()=>{
 expect(PORTABILITY_ARCHIVE_BOOKS).toHaveLength(historical.length+supplement.banks.length);
 expect(replacement.banks.every(bank=>PORTABILITY_PLAYBOOKS.filter(row=>row.bankId===bank.id).length===1)).toBe(true);
 expect(PORTABILITY_PLAYBOOKS.filter(row=>row.bankId==='brb')).toHaveLength(1);
 expect(PORTABILITY_PLAYBOOKS.some(row=>row.bankId==='quadro8')).toBe(false);
 expect(JSON.stringify(PORTABILITY_PLAYBOOKS)).not.toMatch(/prospecta|finconta|consig360|comissiona/i);
 expect(searchBankPlaybooks('C6 portabilidade 37 pagas').some(row=>row.excerpt.includes('37'))).toBe(true);
 expect(PORTABILITY_PLAYBOOKS.find(row=>row.bankId==='facta')?.text).toContain('R$ 1.900,00');
});
