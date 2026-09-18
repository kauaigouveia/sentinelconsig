import { describe, it, expect } from 'vitest';
import { mapFactaStatusToInternal, normalizeFactaStatusKey } from '../../server/services/factaStatusMapper.js';

describe('FACTA Status Mapper Audit & Verification', () => {
  it('normalizes FACTA status strings correctly', () => {
    expect(normalizeFactaStatusKey('28 - CANCELADO')).toBe('CANCELADO');
    expect(normalizeFactaStatusKey('960 - REPROVADA')).toBe('REPROVADA');
    expect(normalizeFactaStatusKey('  aguardando formalização  ')).toBe('AGUARDANDO FORMALIZACAO');
  });

  it('maps activity 960 and REPROVADA to internal status REPROVADO', () => {
    const result1 = mapFactaStatusToInternal({
      status_proposta: 'REPROVADA',
      codigo_af: '960',
    });
    expect(result1.isMapped).toBe(true);
    expect(result1.targetStatusCode).toBe('REPROVADO');

    const result2 = mapFactaStatusToInternal({
      status_proposta: '960 - REPROVADA',
      status_crivo: 'REPROVADA PELO CRIVO',
    });
    expect(result2.isMapped).toBe(true);
    expect(result2.targetStatusCode).toBe('REPROVADO');
  });

  it('maps CANCELADO and variations correctly', () => {
    const res = mapFactaStatusToInternal({ status_proposta: 'SOLICITADO CANCELAMENTO' });
    expect(res.isMapped).toBe(true);
    expect(res.targetStatusCode).toBe('CANCELADO');
  });

  it('maps PAGO / CONCLUIDO correctly', () => {
    const res = mapFactaStatusToInternal({ status_proposta: 'PAGAMENTO EFETUADO' });
    expect(res.isMapped).toBe(true);
    expect(res.targetStatusCode).toBe('PAGO');
  });

  it('maps AGUARDANDO FORMALIZACAO to DB code AGUARDAR_FORMALIZACAO', () => {
    const res = mapFactaStatusToInternal({ status_proposta: 'AGUARDANDO FORMALIZACAO' });
    expect(res.isMapped).toBe(true);
    expect(res.targetStatusCode).toBe('AGUARDAR_FORMALIZACAO');
  });

  it('maps AVERBADO / INTEGRADO to INTEGRADO', () => {
    const res = mapFactaStatusToInternal({ status_proposta: 'AVERBADO' });
    expect(res.isMapped).toBe(true);
    expect(res.targetStatusCode).toBe('INTEGRADO');
  });

  it('detects status divergence between status_proposta and status_crivo', () => {
    const res = mapFactaStatusToInternal({
      status_proposta: 'PAGO',
      status_crivo: 'REPROVADA',
    });
    expect(res.isMapped).toBe(false);
    expect(res.divergenceDetected).toBe(true);
  });
});
