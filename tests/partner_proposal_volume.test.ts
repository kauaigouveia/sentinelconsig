import { expect, it } from 'vitest';
import { partnerProposalVolume } from '../server/services/partnerProposalVolume';
it('uses proceeds even when gross contract amount is zero', () => {
  expect(partnerProposalVolume({ type: 'NOVO', releasedValue: 4889.59, contractValue: 0 })).toBe(4889.59);
  expect(partnerProposalVolume({ type: 'REFIN_PORTABILIDADE', releasedValue: 1200, debtBalance: 9000, contractValue: 12000 })).toBe(1200);
});
it('uses debt only for pure portability and preserves explicit zero', () => {
  expect(partnerProposalVolume({ type: 'PORTABILIDADE', debtBalance: 9000, releasedValue: 0 })).toBe(9000);
  expect(partnerProposalVolume({ type: 'NOVO', releasedValue: 0, contractValue: 1000 })).toBe(0);
});
