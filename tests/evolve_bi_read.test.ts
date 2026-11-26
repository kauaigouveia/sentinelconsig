import { describe, expect, it } from 'vitest';
import { authorizedBIRead } from '../server/services/evolveBIRead';
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
