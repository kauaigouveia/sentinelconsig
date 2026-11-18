import { describe, expect, it } from 'vitest';
import { shouldBootstrapInitialMaster } from '../server/utils/masterBootstrapGuard';

const config = { masterEmail: 'owner@example.org', masterPassword: 'Strong-Initial-Only!2026' };

describe('serverless initial platform master bootstrap guard', () => {
  it('accepts only the configured master identity and initial credential', () => {
    expect(shouldBootstrapInitialMaster({ email: 'OWNER@example.org', password: 'Strong-Initial-Only!2026' }, config)).toBe(true);
  });
  it('rejects an incorrect password', () => {
    expect(shouldBootstrapInitialMaster({ email: 'owner@example.org', password: 'invalid' }, config)).toBe(false);
  });
  it('rejects another email even if the password is known', () => {
    expect(shouldBootstrapInitialMaster({ email: 'operator@example.org', password: 'Strong-Initial-Only!2026' }, config)).toBe(false);
  });
  it('does not initialize without an explicit initial password', () => {
    expect(shouldBootstrapInitialMaster({ email: 'owner@example.org', password: '' }, { masterEmail: config.masterEmail })).toBe(false);
  });
  it('never accepts an empty configured password', () => {
    expect(shouldBootstrapInitialMaster({ email: 'owner@example.org', password: '' }, { masterEmail: config.masterEmail, masterPassword: '' })).toBe(false);
  });
});
