import {describe,it,expect} from 'vitest';
import {
 normalizeTelegramMenuInput,telegramMainMenu,telegramSectionMenu,
 telegramMenuAction,telegramSimulationTarget,telegramPortalLink,
} from '../server/services/telegramProductMenu';

describe('Menu produto + empresa do SentinelConectaBot',()=>{
 it('oferece CLT, FGTS, INSS e PORT sem incluir dados sensíveis',()=>{
  const root=telegramMainMenu('EVOLVE · Parceiro 0123');
  expect(root.response).toContain('Consignado CLT');
  expect(root.response).toContain('FGTS');
  expect(root.response).toContain('INSS');
  expect(root.response).toContain('Portabilidade INSS');
  expect(root.response).toContain('EVOLVE · Parceiro 0123');
  expect(root.keyboard.flat()).toContain('👤 Trocar parceiro');
 });
 it('reconhece botões com ícones e atalhos numéricos só dentro do menu',()=>{
  expect(normalizeTelegramMenuInput('🔁 Refinanciamento INSS')).toBe('refinanciamento inss');
  expect(telegramMenuAction('🏛️ INSS','ROOT')).toBe('INSS');
  expect(telegramMenuAction('🔄 Portabilidade INSS','ROOT')).toBe('PORT');
  expect(telegramMenuAction('2','ROOT')).toBe('FGTS');
  expect(telegramMenuAction('1','PORT')).toBe('PORT_ONLY');
  expect(telegramMenuAction('2','PORT')).toBe('PORT_REFIN');
  expect(telegramMenuAction('2','ROOT',false)).toBeNull();
  expect(telegramMenuAction('Trocar empresa','INSS')).toBe('SWITCH');
  expect(telegramMenuAction('🏠 Menu principal','CLT')).toBe('HOME');
 });
 it('contempla todas as modalidades INSS e avisos corretos sobre PDF',()=>{
  const inss=telegramSectionMenu('INSS');
  const port=telegramSectionMenu('PORT');
  expect(inss.keyboard.flat()).toContain('💰 Novo INSS');
  expect(inss.keyboard.flat()).toContain('🔁 Refinanciamento INSS');
  expect(port.keyboard.flat()).toContain('🔄 Portabilidade pura');
  expect(port.keyboard.flat()).toContain('🔁 Portabilidade + refinanciamento');
  expect(port.response).toContain('em desenvolvimento');
  expect(telegramMenuAction('📄 Simular pelo extrato','PORT')).toBe('EXTRACT');
 });
 it('direciona ações para o simulador existente, nunca para uma URL de banco',()=>{
  expect(telegramSimulationTarget('CLT','SIMULATE')).toEqual({product:'CLT'});
  expect(telegramSimulationTarget('FGTS','SIMULATE')).toEqual({product:'FGTS'});
  expect(telegramSimulationTarget('INSS','NEW')).toEqual({product:'INSS',operation:'NEW'});
  expect(telegramSimulationTarget('INSS','REFIN')).toEqual({product:'INSS',operation:'REFIN'});
  expect(telegramSimulationTarget('PORT','PORT_ONLY')).toEqual({product:'INSS',operation:'PORT'});
  expect(telegramSimulationTarget('PORT','PORT_REFIN')).toEqual({product:'INSS',operation:'PORT_REFIN'});
  expect(telegramSimulationTarget('PORT','EXTRACT')).toBeNull();
 });
 it('gera links HTTPS para portal autenticado, sem nome CPF ou identidade do cliente',()=>{
  const url=telegramPortalLink({product:'INSS',operation:'PORT_REFIN'},'https://sentinelconsig.com.br');
  const parsed=new URL(url);
  expect(parsed.origin).toBe('https://sentinelconsig.com.br');
  expect(parsed.pathname).toBe('/parceiro');
  expect(parsed.searchParams.get('tab')).toBe('simulacoes');
  expect(parsed.searchParams.get('product')).toBe('INSS');
  expect(parsed.searchParams.get('operation')).toBe('PORT_REFIN');
  expect(url).not.toMatch(/cpf|beneficio|token|partnerId/i);
  expect(telegramPortalLink('PROFILE','https://sentinelconsig.com.br').includes('tab=perfil')).toBe(true);
  expect(()=>telegramPortalLink({product:'CLT'},'http://insecure.example.com')).toThrow('HTTPS');
  expect(()=>telegramPortalLink({product:'CLT'},'https://user:pass@example.com')).toThrow('HTTPS');
 });
});
