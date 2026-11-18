// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import { encodeDaycoval } from '../server/services/daycovalWorkbook';
import {
 validateTelegramPdfDocument,downloadTelegramPdf,readTelegramInssPdf,
 parseTelegramSelectedContracts,telegramPdfReviewText,calculateTelegramInssQuotes,
 TELEGRAM_PDF_MAX_BYTES,telegramPdfErrorCode,telegramPdfErrorMessage,TelegramPdfProcessingError,
} from '../server/services/telegramInssPdfService';
import {SPREADSHEET_MODELS} from '../server/services/portRefinWorkbooks';

/** Minimal generated textual PDF with rows in exactly the parser's current column order. */
function makePdf(lines:string[]):Uint8Array{
 const instructions=[
  'BT /F1 9 Tf 30 800 Td',
  ...lines.flatMap((line,index)=>{
    const safe=line.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    return [index?'0 -16 Td ('+safe+') Tj':'('+safe+') Tj'];
  }),
  'ET',
 ].join('\n');
 const obj=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 615 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Length '+Buffer.byteLength(instructions,'latin1')+' >>\nstream\n'+instructions+'\nendstream',
 ];
 let doc='%PDF-1.4\n';const offsets=[0];
 for(const [i,value]of obj.entries()){offsets.push(Buffer.byteLength(doc,'latin1'));doc+=(i+1)+' 0 obj\n'+value+'\nendobj\n';}
 const xref=Buffer.byteLength(doc,'latin1');
 doc+='xref\n0 '+(obj.length+1)+'\n0000000000 65535 f \n';
 for(const offset of offsets.slice(1))doc+=String(offset).padStart(10,'0')+' 00000 n \n';
 doc+='trailer\n<< /Size '+(obj.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return Buffer.from(doc,'latin1');
}
const lines=[
 'Nome: Pessoa Teste',
 'CPF: 12345678909',
 'Beneficio: 0000000001',
 'Data Nascimento: 29/02/1960',
 'Especie: 42 - Aposentadoria',
 'Margem Emprestimo: 100,00',
 'Margem Cartao: 0,00',
 'DIB: 01/01/2010',
 'UF: AL',
 'Emprestimos Bancarios',
 'Contrato Banco Inicio Desconto. Vl. Emprestado Vl. Parcela Prazo Pagas Saldo Taxa',
 '001A-1 237 - Banco de Teste 2021-01 5.000,00 50,00 84 57 1.300,44 1.50',
 '002B-2 041 - Banco de Teste 2020-03 8.000,00 70,00 84 57 2.300,44 1.50',
];
const pdf=makePdf(lines);
const file={file_id:'ABCDEF012345678900',file_name:'extrato.pdf',mime_type:'application/pdf',file_size:pdf.byteLength};

describe('Telegram: extrato PDF sem armazenamento do original',()=>{
 it('rejeita uploads inválidos e arquivos acima de 5 MB',()=>{
  expect(()=>validateTelegramPdfDocument({...file,mime_type:'image/png'})).toThrow();
  expect(()=>validateTelegramPdfDocument({...file,file_size:TELEGRAM_PDF_MAX_BYTES+1})).toThrow();
  expect(()=>validateTelegramPdfDocument({...file,file_id:'../../bad'})).toThrow();
  expect(()=>validateTelegramPdfDocument(file)).not.toThrow();
  expect(()=>validateTelegramPdfDocument({file_id:file.file_id,file_name:file.file_name})).not.toThrow();
 });
 it('faz getFile e download somente de endereços fixos do Telegram, com conteúdo assinado',async()=>{
  const urls:string[]=[];
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
    urls.push(String(input));
    if(urls.length===1)return new Response(JSON.stringify({ok:true,result:{file_path:'documents/file_1.pdf',file_size:pdf.length}}),{headers:{'content-type':'application/json'}});
    return new Response(pdf,{headers:{'content-type':'application/pdf','content-length':String(pdf.length)}});
  }) as unknown as typeof fetch;
  const bytes=await downloadTelegramPdf('123456:token_for_tests_only',file,fetcher);
  expect(Buffer.compare(Buffer.from(bytes),Buffer.from(pdf))).toBe(0);
  expect(urls).toEqual([
    'https://api.telegram.org/bot123456:token_for_tests_only/getFile',
    'https://api.telegram.org/file/bot123456:token_for_tests_only/documents/file_1.pdf',
  ]);
  const malicious=vi.fn(async()=>new Response(JSON.stringify({ok:true,result:{file_path:'../../evil'}})));
  await expect(downloadTelegramPdf('token',file,malicious as unknown as typeof fetch)).rejects.toMatchObject({code:'TELEGRAM_DOWNLOAD'});
 });
 it('lê PDF textual e só exibe números mascarados, com identificadores bancários temporários',async()=>{
  const parsed=await readTelegramInssPdf(new Uint8Array(pdf));
  expect(parsed.benefitType).toBe(42);
  expect(parsed.birthDate).toBe('1960-02-29');
  expect(parsed.loanMargin).toBe(100);
  expect(parsed.contracts).toHaveLength(2);
  expect(parsed.contracts[0]).toMatchObject({bank:'237',numberSuffix:'01A1',originalTerm:84,remaining:27,installment:50,balance:1300.44});
  expect(parsed.bankConsultation).toMatchObject({
    cpf:'12345678909',benefitNumber:'0000000001',
    contracts:[{number:'001A-1'},{number:'002B-2'}],
  });
  // Public preview is masked; sensitive fields exist only in encrypted TTL chat state.
  const publicText=telegramPdfReviewText(parsed);
  for(const secret of ['12345678909','0000000001','Pessoa Teste','001A-1'])
    expect(publicText).not.toContain(secret);
  expect(telegramPdfReviewText(parsed)).toContain('contratos: 2');
 });
 it('reconhece os quatro empréstimos de um extrato de tabela extensa com cartão separado',async()=>{
  const sample=makePdf([
    'Nome: Pessoa Teste','CPF: 12345678909','Data Nascimento: 29/02/1960',
    'Beneficio: 0000000001','Espécie: 32 - Exemplo',
    'DIB: 15/12/2011','UF: AL','Margem Empréstimo: 87,66',
    'Empréstimos Bancários',
    'N° Contrato Banco Inicio Desconto. Vl. Emprestado Vl. Parcela Prazo Pagas Saldo Taxa',
    '001A-1 41 - BANCO DO ESTADO DO RIO GRANDE DO SUL SA 2024-06 10.295,88 216,30 84 30 7.966,45 1.50',
    '002B-2 237 - BANCO BRADESCO SA 2024-06 3.800,00 621,22 84 30 22.879,87 1.50',
    '003C-3 237 - BANCO BRADESCO SA 2024-06 1.274,04 30,00 84 30 1.018,99 1.85',
    '004D-4 623 - BANCO PAN SA 2023-06 2.529,56 64,66 84 42 1.835,70 1.97',
    'Reserva de Margem para Cartão de Crédito','Contrato Banco Data Autorização VL. Contrato Parcela',
    '99999999999999 237 26/05/2020 2.499,60 145,69',
    'Cartão Benefício','N° Contrato Banco Data Autorização VL. Contrato Parcela',
    '88888888888888 623 28/10/2022 3.041,00 145,69',
  ]);
  const parsed=await readTelegramInssPdf(new Uint8Array(sample));
  expect(parsed.contracts).toHaveLength(4);
  expect(parsed.contracts.map(contract=>contract.bank)).toEqual(['041','237','237','623']);
  expect(parsed.contracts[0]).toMatchObject({originalTerm:84,remaining:54,installment:216.3,balance:7966.45});
  expect(parsed.contracts[2]).toMatchObject({installment:30,balance:1018.99});
  expect(JSON.stringify(parsed)).not.toContain('99999999999999');
  expect(JSON.stringify(parsed)).not.toContain('88888888888888');
 });
 it('aceita PDF MultiCorban textual e mantém bloqueio de crédito novo separado da portabilidade',async()=>{
  const sample=makePdf([
 'Demonstrativo de Empréstimos Consignados',
 'Dados do Beneficiário',
 'Nome: Pessoa Teste Número do Benefício: 000.000.000-1 CPF: 529.982.247-25',
 'Data Nascimento: 29/02/1960',
 'Dados Complementares','UF: BA Município: TESTE',
 'Dados do Benefício','Espécie: 93 - Pensão por morte',
 'Situação: ATIVO DDB: 22/05/2021',
 'Possui Representante Legal: Não possui representante legal',
 'Bloqueado para Empréstimo: Bloqueado para empréstimo Elegível para Empréstimo: Elegível para empréstimos',
 'Margem Consignável',
 'Base de Cálculo: R$ 2.160,01 Margem Empréstimo: R$ 28,49 Margem para Cartão: R$ 0,00 Cartão Benefício: R$ 0,00',
 'Contratos de Empréstimos',
 'Empréstimo CBC/Banco Comp. 1ª Parcela Comp. Última Parcela Data Inclusão Parcelas Valor Parcela Valor Emprestado Taxa Saldo Quitação',
 'Situação: Ativo',
 '0000000000003000824',
 '41 - Banrisul 01/2026 06/2030 12/12/2025 44 / 54 33,00 1.070,41 2.0553 949,66',
 '8',
 'Situação: Ativo',
 '383258437-3 623 - PAN 02/2024 01/2031 24/01/2024 51 / 84 26,00 1.084,43 1.9071 843,12',
 'Situação: Ativo',
 '1100236816 121 - Agibank 05/2023 04/2030 10/04/2023 42 / 84 631,25 30.750,11 1.43 19.828,29',
 'Situação: Ativo',
 '626 - Ficsa (C6',
 '010121945511 03/2023 02/2030 14/02/2023 40 / 84 37,26 1.362,46 2.3443 960,34',
 'Consignado)',
 'Contratos de Cartão',
 '52-0887657/22 707 - Daycoval 07/01/2022 Ativo 2.610,00 108,00 RMC',
 '770677082-8 623 - PAN 15/02/2023 Ativo 2.626,00 108,00 RCC',
]);
  const review=await readTelegramInssPdf(new Uint8Array(sample));
  expect(review.contracts).toHaveLength(4);
  expect(review.benefitContractCount).toBe(4);
  expect(review.contracts.map(c=>c.bank)).toEqual(['041','623','121','626']);
  expect(review.contracts[0]).toMatchObject({
    numberSuffix:'8248',originalTerm:54,remaining:44,installment:33,balance:949.66,
  });
  expect(review.contracts[2]).toMatchObject({installment:631.25,balance:19828.29});
  expect(review.loanMargin).toBe(28.49);
  expect(review.loanBlocked).toBe(true);
  expect(review.benefitStartDate).toBe('');
  const text=telegramPdfReviewText(review);
  expect(text).toContain('bloqueado');
  expect(text).toContain('DIB');
  expect(text).not.toContain('52998224725');
  expect(text).not.toContain('0000000001');
  expect(text).not.toContain('00000000000030008248');
 });
 it('expõe apenas etapas genéricas, sem vazar erros brutos de PDF ou Telegram',async()=>{
  const secret='CPF fictício e token confidencial';
  for(const code of ['TELEGRAM_DOWNLOAD','PDF_READER','PDF_CONTENT','PDF_TIMEOUT'] as const){
    const error=new TelegramPdfProcessingError(code,secret);
    expect(telegramPdfErrorCode(error)).toBe(code);
    const message=telegramPdfErrorMessage(error);
    expect(message).not.toContain(secret);
    expect(message).toContain('Nenhuma simulação foi salva.');
  }
  const fails=vi.fn(async()=>{throw Error(secret);});
  await expect(downloadTelegramPdf('token',file,fails as unknown as typeof fetch))
    .rejects.toMatchObject({code:'TELEGRAM_DOWNLOAD'});
 });
 it('rejeita documento sem assinatura PDF, campos obrigatórios ou layout de extrato',async()=>{
  await expect(readTelegramInssPdf(new Uint8Array(100))).rejects.toThrow('PDF');
  await expect(readTelegramInssPdf(makePdf(['documento aleatório','sem contratos']))).rejects.toThrow();
 });
 it('aceita TODOS os contratos e seleção de até treze índices distintos',()=>{
  expect(parseTelegramSelectedContracts('1, 2, 4',4)).toEqual([0,1,3]);
  expect(parseTelegramSelectedContracts('1,2,3,4',4)).toEqual([0,1,2,3]);
  expect(parseTelegramSelectedContracts('TODOS',4)).toEqual([0,1,2,3]);
  expect(parseTelegramSelectedContracts('✅ Simular todos os contratos',4)).toEqual([0,1,2,3]);
  expect(parseTelegramSelectedContracts('todos',13)).toHaveLength(13);
  expect(parseTelegramSelectedContracts(Array.from({length:13},(_,i)=>String(i+1)).join(','),13)).toHaveLength(13);
  for(const invalid of ['1,1','0','5','1;2','a','14','1,2,1'])
    expect(parseTelegramSelectedContracts(invalid,4)).toBeNull();
  expect(parseTelegramSelectedContracts('TODOS',14)).toBeNull();
 });
 it('calcula quatro contratos individualmente em Daycoval, C6 e Paraná, mantendo o quarto no retorno',async()=>{
  const book=encodeDaycoval({enabled:true,terms:[108],hash:'teste'} as any);
  const db={systemConfig:{findUnique:vi.fn(async()=>({configValue:book}))}} as any;
  const review={
    birthDate:'1960-02-29',benefitType:32,benefitStartDate:'2011-12-15',uf:'AL',
    benefitContractCount:4,loanMargin:87.66,
    contracts:[
      {bank:'041',numberSuffix:'9904',originalTerm:84,remaining:54,balance:7966.45,installment:216.3},
      {bank:'237',numberSuffix:'5152',originalTerm:84,remaining:54,balance:22879.87,installment:621.22},
      {bank:'237',numberSuffix:'5469',originalTerm:84,remaining:54,balance:1018.99,installment:30},
      {bank:'623',numberSuffix:'3656',originalTerm:84,remaining:42,balance:1835.7,installment:64.66},
    ],
  };
  const seen:{bank:string;contracts:number[]}[]=[];
  const preview=vi.fn((bank:string,_book:any,input:any)=>{
    seen.push({bank,contracts:input.contracts.map((c:any)=>c.installment)});
    return {offers:[{name:'Tabela de teste',code:'800011',amount:900,term:108,rate:1.85,
      installment:input.contracts.reduce((sum:number,c:any)=>sum+c.installment,0),
      installmentChanges:input.contracts.map((c:any)=>({originalInstallment:c.installment,newInstallment:c.installment-1}))}]};
  });
  const selected=[0,1,2,3];
  const result=await calculateTelegramInssQuotes(db,'tenant-evolve',review,selected,'NO',preview as any);
  expect(result.calculatedBanks).toEqual(['DAYCOVAL','C6','PARANA']);
  for(const bank of ['DAYCOVAL','C6','PARANA']){
    const individual=seen.filter(x=>x.bank===bank&&x.contracts.length===1);
    expect(individual).toHaveLength(4);
    expect(individual.some(x=>x.contracts[0]===64.66)).toBe(true);
  }
  expect(seen.filter(x=>x.bank==='DAYCOVAL'&&x.contracts.length>=2)).toHaveLength(0);
  expect(result.texts.join('\\n')).toContain('Contrato 4');
  expect(result.quotes.filter(x=>x.bank==='DAYCOVAL'&&x.indices.length>1)).toHaveLength(0);
  expect(result.texts.join('\\n')).toContain('C6');
 });
 it('Daycoval unifica R$ 49,99 com R$ 50 somente após ausência confirmada de ofertas externas',async()=>{
  const book=encodeDaycoval({enabled:true,terms:[108],hash:'teste'} as any);
  const db={systemConfig:{findUnique:vi.fn(async()=>({configValue:book}))}} as any;
  const review={
    birthDate:'1960-02-29',benefitType:32,benefitStartDate:'2010-01-01',
    uf:'AL',benefitContractCount:3,loanMargin:30,
    contracts:[
      {bank:'237',numberSuffix:'0001',originalTerm:84,remaining:54,balance:500,installment:49.99},
      {bank:'237',numberSuffix:'0002',originalTerm:84,remaining:54,balance:500,installment:50},
      {bank:'237',numberSuffix:'0003',originalTerm:84,remaining:54,balance:500,installment:60},
    ],
  };
  const fake=vi.fn((bank:string,_book:any,input:any)=>({
    offers:bank==='DAYCOVAL'?[{
      name:'800581 - RFN - INSS 1',amount:900,term:108,rate:1.85,
      installment:input.contracts.reduce((sum:number,c:any)=>sum+c.installment,0),
      installmentChanges:input.contracts.map((c:any)=>({newInstallment:c.installment})),
    }]:[],
  }));
  const official=[
    {index:1,failed:false,completedWithoutOffer:true,rows:[]},
    {index:2,failed:false,completedWithoutOffer:false,
      rows:[{provider:'FACTA',state:'OFFER',amount:1000}]},
  ];
  const result=await calculateTelegramInssQuotes(
    db,'tenant-evolve',review,[0,1,2],'NO',fake as any,official);
  const day=result.quotes.filter(q=>q.bank==='DAYCOVAL');
  expect(day.filter(q=>q.indices.length===1).map(q=>q.indices[0])).toEqual([0,1]);
  expect(day.filter(q=>q.indices.length>1).map(q=>q.indices)).toEqual([[0,1]]);
  expect(day.find(q=>q.indices.length>1)?.changes.map(c=>c.original)).toEqual([49.99,50]);
  expect(day.some(q=>q.indices.includes(2))).toBe(false);
  // On a technical error or without completed evidence, a larger installment
  // cannot be silently treated as refused by another bank.
  const pending=await calculateTelegramInssQuotes(
    db,'tenant-evolve',review,[0,1,2],'NO',fake as any,
    [{index:1,failed:true,completedWithoutOffer:true,rows:[]}]);
  expect(pending.quotes.filter(q=>q.bank==='DAYCOVAL').map(q=>q.indices))
    .toEqual([[0]]);
 });
 it('usa apenas planilhas do tenant, informa bancos indisponíveis e exibe diferenças por contrato',async()=>{
  const lookups:any[]=[];
  const book=encodeDaycoval({enabled:true,terms:[108],hash:'test'} as any);
  const db={systemConfig:{
    findUnique:vi.fn(async(arg:any)=>{
      lookups.push(arg.where.tenantId_configKey);
      return arg.where.tenantId_configKey.configKey===SPREADSHEET_MODELS.C6.key?null:{configValue:book};
    }),
  }} as any;
  const fake=vi.fn((bank:string,_book:any,input:any)=>{
    const items=input.contracts;
    return {offers:[{name:'Tabela INSS',code:'800001',amount:700,term:108,rate:1.85,installment:items.reduce((sum:number,item:any)=>sum+item.installment,0),
      installmentChanges:items.map((item:any)=>({originalInstallment:item.installment,newInstallment:item.installment-1}))}]};
  });
  const review={
    birthDate:'1960-02-29',benefitType:42,benefitStartDate:'2010-01-01',uf:'AL',benefitContractCount:2,loanMargin:100,
    contracts:[{bank:'237',numberSuffix:'A101',originalTerm:84,remaining:27,balance:1300.44,installment:50},
      {bank:'041',numberSuffix:'B202',originalTerm:84,remaining:30,balance:2500,installment:70}],
  };
  const result=await calculateTelegramInssQuotes(db,'tenant-evolve',review,[0,1],'NO',fake as any);
  expect(lookups).toHaveLength(3);
  expect(lookups.every(v=>v.tenantId==='tenant-evolve')).toBe(true);
  expect(result.calculatedBanks).toEqual(['PARANA']);
  expect(result.unavailableBanks.join('')).toContain('C6');
  expect(result.quotes.some(x=>x.bank==='DAYCOVAL'&&x.indices.join('+')==='0+1')).toBe(false);
  expect(result.texts.join('')).toContain('R$');
  expect(result.texts.join('')).toContain('Parcela portada');
  expect(result.texts.join('')).toContain('Parcela do refin');
  expect(result.texts.join('')).toContain('Estimativas');
  expect(fake).toHaveBeenCalled();
  await expect(calculateTelegramInssQuotes(db,'tenant-evolve',review,[0,0],'NO',fake as any)).rejects.toThrow('Seleção');
 });
});
