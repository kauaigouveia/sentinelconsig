import {describe,expect,it} from 'vitest';
import {
  formatTelegramBankSimulation,formatTelegramCltMargin,
  verifiedTelegramAuthorizationUrl,telegramBankName,
} from '../server/services/telegramBankResultPresentation';

describe('Telegram: retorno por banco, autorização e consulta de margem',()=>{
 it('mostra instituição, condição, autorização e o link HTTPS devolvido pela integração FGTS',()=>{
   const rows=[
     {provider:'Nossa Fintech',institution:'QI Tech',state:'PENDING',
       message:'A consulta exige autorização do FGTS no aplicativo.',outcome:'AUTHORIZATION_REQUIRED'},
     {provider:'Nossa Fintech',institution:'BMP',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',
       message:'Autorize a consulta',link:'https://banco.example.com/autorizar?nonce=abc',
       data:{authorization:{status:'PENDING'}}},
     {provider:'FACTA',institution:'FACTA',state:'ERROR',outcome:'TECHNICAL_ERROR',
       message:'Falha de comunicação com a instituição.'},
     {provider:'Nossa Fintech',institution:'J17',state:'PENDING',outcome:'INELIGIBLE',
       message:'Saldo FGTS não elegível neste produto.'},
   ];
   const all=formatTelegramBankSimulation(rows,'FGTS','NEW',false).join('\n');
   expect(all).toContain('QI Tech');
   expect(all).toContain('BMP');
   expect(all).toContain('J17');
   expect(all).toContain('FACTA');
   expect(all).toContain('Autorização pendente');
   expect(all).toContain('aplicativo FGTS');
   expect(all).toContain('https://banco.example.com/autorizar?nonce=abc');
   expect(all).toContain('Não elegível');
   expect(all).toContain('Falha na integração');
   expect(all).not.toContain('1 retorno(s)');
 });
 it('só apresenta um link fornecido pela integração com origem pública HTTPS sem credenciais',()=>{
   for(const bad of ['http://bank.com/authorization','https://localhost/app',
      'https://192.168.0.1/auth','https://user:secret@bank.example.com/a',
      'javascript:alert(1)','https://localhost.local/path'])
     expect(verifiedTelegramAuthorizationUrl(bad)).toBeUndefined();
   expect(verifiedTelegramAuthorizationUrl('https://banco.example.com/a#secret')).toBe('https://banco.example.com/a');
   expect(verifiedTelegramAuthorizationUrl(undefined)).toBeUndefined();
 });
 it('preserva condições do FINANTO por instituição e não as confunde com C6 ou FACTA',()=>{
   const rows=[
     {provider:'FINANTO',institution:'FINANTO',state:'OFFER',amount:20780.74,
       installment:500,term:108,rate:1.85,name:'NORMAL ENTRANTE +90 DIAS'},
     {provider:'C6',institution:'C6',state:'OFFER',amount:22505.79,installment:500,term:108,rate:1.8},
     {provider:'FINANTO',institution:'FINANTO',state:'OFFER',amount:20200,installment:500,term:108,rate:1.9},
     {provider:'FACTA',institution:'FACTA',state:'OFFER',amount:22065.31,installment:500,term:108,rate:1.85},
   ];
   const all=formatTelegramBankSimulation(rows,'INSS','NEW',true).join('\n');
   expect(all).toContain('FINANTO');
   expect(all).toContain('20.780,74');
   expect(all).toContain('NORMAL ENTRANTE');
   expect(all).not.toContain('20.200,00');
   expect(all).toContain('C6');
   expect(all).toContain('FACTA');
   expect(all).toContain('histórico');
 });
 it('informa quando FINANTO não retornou oferta, com motivo sem fabricar valor',()=>{
   const msg=formatTelegramBankSimulation([{
     provider:'FINANTO',institution:'FINANTO',state:'PENDING',outcome:'MISSING_DATA',
     message:'A FINANTO não retornou uma cotação positiva para o prazo e os dados informados.',
   }],'INSS','NEW',false).join('\n');
   expect(msg).toContain('FINANTO');
   expect(msg).toContain('não retornou uma cotação positiva');
   expect(msg).not.toContain('R$ ');
 });
 it('apresenta margem individual de FACTA e QI Tech, sem somar nem assumir valores para outras instituições',()=>{
   const rows=[
     {provider:'FACTA',institution:'FACTA',state:'DATA',data:{margin:{available_balance:310.5,can_continue:true}}},
     {provider:'Nossa Fintech',institution:'QI Tech',state:'DATA',data:{margin:{available_balance:400,utilizable_balance:350,can_continue:true}}},
     {provider:'Nossa Fintech',institution:'BMP',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',
       data:{authorization:{status:'REQUESTED',mechanism:'SMS'}},
       message:'Aguardando SMS do cliente.'},
   ];
   const report=formatTelegramCltMargin(rows);
   const content=report.messages.join('\n');
   expect(report.hasMargin).toBe(true);
   expect(report.positiveBanks).toEqual(['FACTA','Nossa Fintech · QI Tech']);
   expect(content).toContain('R$ 310,50');
   expect(content).toContain('R$ 350,00');
   expect(content).not.toContain('R$ 660,50');
   expect(content).toContain('BMP');
   expect(content).toContain('SMS');
   expect(content).toContain('não disparou');
 });
 it('bloqueia margem não informada e evita vazar CPF/benefício em mensagens bancárias',()=>{
   const cpf='52998224725',nb='9876543210';
   const rows=[
     {provider:'FACTA',institution:'FACTA',state:'DATA',data:{margin:{available_balance:0,can_continue:true}}},
     {provider:'J17',institution:'J17',state:'ERROR',message:'Falha CPF '+cpf+' Benefício '+nb},
   ];
   const report=formatTelegramCltMargin(rows);
   expect(report.hasMargin).toBe(false);
   const all=report.messages.join('\n');
   expect(all).toContain('sem margem positiva');
   expect(all).not.toContain(cpf);
   expect(all).not.toContain(nb);
   expect(all).toContain('J17');
 });
 it('separa autorização de recusa e erro sem produzir links inventados',()=>{
   const rows=[
     {provider:'FACTA',institution:'FACTA',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED',data:{authorization:{mechanism:'SMS',status:'PENDING'}},message:'Cliente deve autorizar por SMS.'},
     {provider:'V8 DIGITAL',institution:'V8 · QI',state:'PENDING',outcome:'INELIGIBLE',message:'Cliente não elegível nesta consulta.'},
     {provider:'HAPPY',institution:'HAPPY / BYX',state:'PENDING',message:'Aguardando retorno Dataprev.'},
     {provider:'BMG',state:'ERROR',outcome:'TECHNICAL_ERROR',message:'Servidor não respondeu.'},
   ];
   const all=formatTelegramBankSimulation(rows,'CLT','NEW',false).join('\n');
   expect(all).toContain('FACTA');
   expect(all).toContain('SMS/OTP');
   expect(all).toContain('V8 DIGITAL');
   expect(all).toContain('Não elegível');
   expect(all).toContain('HAPPY');
   expect(all).toContain('Aguardando retorno');
   expect(all).toContain('BMG');
   expect(all).toContain('Falha na integração');
 });
});
