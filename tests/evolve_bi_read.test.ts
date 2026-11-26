import { describe, expect, it } from 'vitest';
import { authorizedBIRead, storedBankStatus } from '../server/services/evolveBIRead';
const tenant='cmwwf76ef0000jm074ydgay0f';
const token='x'.repeat(64);
describe('EVOLVE BI readonly authentication',()=>{
 it('accepts only the dedicated token and the EVOLVE tenant',()=>{
  expect(authorizedBIRead('Bearer '+token,token,tenant)).toBe(true);
  expect(authorizedBIRead('Bearer '+token,token,'other-tenant')).toBe(false);
  expect(authorizedBIRead('Bearer wrong',token,tenant)).toBe(false);
  expect(authorizedBIRead('Bearer '+token,undefined,tenant)).toBe(false);
  expect(authorizedBIRead('Bearer short','short',tenant)).toBe(false);
 });
});

describe('EVOLVE BI independent bank status',()=>{
 it('returns the raw provider situation and timestamp without deriving it from the internal status',()=>{
  const at=new Date('2026-11-26T11:00:00Z');
  expect(storedBankStatus({bank:{code:'336',name:'C6 BANK'},c6RawSituation:'LIQUIDADO',c6LastSyncAt:at,standardCategory:'ESTEIRA'})).toEqual({bankStatus:'LIQUIDADO',bankStatusAt:at.toISOString(),bankStatusSource:'C6'});
  expect(storedBankStatus({bank:{name:'ICRED'},standardCategory:'PAGO'})).toBeNull();
  expect(storedBankStatus({bank:{code:'149'},factaRawStatus:'AGUARDANDO',factaLastSyncAt:at})).toMatchObject({bankStatus:'AGUARDANDO',bankStatusSource:'FACTA'});
  expect(storedBankStatus({bank:{name:'Happy'},happyStatusName:'Pago',happyLastSyncAt:at})).toMatchObject({bankStatus:'Pago',bankStatusSource:'Happy/BYX'});
  expect(storedBankStatus({bank:{name:'Paraná'},finantoSimulationId:'f',finantoStatus:'EM ANALISE'})).toMatchObject({bankStatus:'EM ANALISE',bankStatusSource:'Finanto'});
 });
});
