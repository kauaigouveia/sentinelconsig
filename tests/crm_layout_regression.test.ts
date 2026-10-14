import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
describe('CRM layout regression', () => {
  it('keeps indicators, horizontal filters and batch actions in document order', () => {
    const source = readFileSync('src/components/crm/PartnerCrmHub.tsx', 'utf8');
    const metrics = source.indexOf('{/* KPI Metric Cards */}');
    const filters = source.indexOf('{/* Filter & Control Bar */}');
    const batch = source.indexOf('<PartnerBatchActions partners=');
    const results = source.indexOf('{/* Main Partners Display */}');
    expect(metrics).toBeLessThan(filters); expect(filters).toBeLessThan(batch); expect(batch).toBeLessThan(results);
    const css = readFileSync('src/styles/sentinel-2-modules.css', 'utf8');
    expect(css).toMatch(/\.s2-root \.p2-live-crm \{ display: flex; flex-direction: column;/);
    expect(css).not.toMatch(/\.s2-root \.p2-crm-filters \{[^}]*grid-row: 3/);
  });
  it('exposes bank bulk registration in the header with the existing permission guard', () => {
    const source = readFileSync('src/components/admin/BankPromoterManagement.tsx', 'utf8');
    expect(source).toContain('rightActions={canCreateBanks ? <BankBatchImport onCompleted={refresh} /> : undefined}');
    expect(source.match(/<BankBatchImport /g)).toHaveLength(1);
  });
});
