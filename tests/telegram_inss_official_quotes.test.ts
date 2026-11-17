// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {calculateTelegramInssOfficialQuotes} from '../server/services/telegramInssOfficialQuotes';
import type {TelegramPdfReview} from '../server/services/telegramInssPdfService';
const review:TelegramPdfReview={
  birthDate:'1960-02-29',benefitType:32,benefitStartDate:'2011-12-15',uf:'AL',
  benefitContractCount:4,loanMargin:87.66,
  contracts:[
    {bank:'041',numberSuffix:'9904',originalTerm:84,remaining:54,balance:7966.45,installment:216.3},
    {bank:'237',numberSuffix:'5152',originalTerm:84,remaining:54,balance:22879.87,installment:621.22},
    {bank:'237',numberSuffix:'5469',originalTerm:84,remaining:54,balance:1018.99,installment:30},
    {bank:'623',numberSuffix:'3656',originalTerm:84,remaining:42,balance:1835.7,installment:64.66},
  ],
  bankConsultation:{
    cpf:'12345678909',benefitNumber:'0000000001',name:'Cliente Fictício',
    income:2913.82,legalRepresentative:false,
    contracts:[{number:'EX-9904'},{number:'EX-5152'},{number:'EX-5469'},{number:'EX-3656'}],
  },
};
describe('Telegram PDF integrações bancárias por contrato',()=>{
  it('chama motor do Portal uma vez por contrato, incluindo o quarto, com CPF/NB apenas internamente',async()=>{
    const run=vi.fn(async(_db:any,_tenant:string,input:any,action:any)=>{
      expect(action).toBe('SIMULATE');
      expect(input.product).toBe('INSS');
      expect(input.operation).toBe('PORT_REFIN');
      return {rows:[
        {provider:'FINANTO',institution:'FINANTO',state:'OFFER',amount:2000+input.originalInstallment,
          installment:input.originalInstallment,term:108,rate:1.85,name:'Tabela FINANTO'},
        {provider:'Nossa Fintech',institution:'Nossa Fintech',state:'OFFER',amount:1500+input.originalInstallment,
          installment:input.originalInstallment,term:108,rate:1.8,name:'Tabela FN'},
        {provider:'DAYCOVAL',state:'OFFER',amount:900,quoteKind:'ESTIMATE'},
        {provider:'C6',state:'OFFER',amount:800,quoteKind:'ESTIMATE'},
      ]};
    });
    const record=vi.fn(async()=>({id:'historico'}));
    const result=await calculateTelegramInssOfficialQuotes({} as any,'tenant-evolve',
      {id:'partner-1',name:'Parceiro teste',code:'010'},review,[0,1,2,3],'NO',
      '0123456789ABCDEF',{run:run as any,record:record as any});
    expect(result.consulted).toBe(4);
    expect(result.positive).toBe(8);
    expect(run).toHaveBeenCalledTimes(4);
    const inputs=run.mock.calls.map(x=>x[2]);
    expect(inputs.map((x:any)=>x.originalContract).sort()).toEqual(['EX-3656','EX-5152','EX-5469','EX-9904']);
    expect(inputs.map((x:any)=>x.originalInstallment).sort((a:number,b:number)=>a-b)).toEqual([30,64.66,216.3,621.22]);
    expect(inputs.every((x:any)=>x.cpf==='12345678909'&&x.benefitNumber==='0000000001'&&x.term===108)).toBe(true);
    expect(record).toHaveBeenCalledTimes(4);
    const combined=result.texts.join('\n');
    for(const index of [1,2,3,4])expect(combined).toContain('Contrato '+index);
    expect(combined).toContain('FINANTO');
    expect(combined).toContain('Nossa Fintech');
    expect(combined).not.toContain('EX-3656');
    expect(combined).not.toContain('12345678909');
    expect(combined).not.toContain('0000000001');
    expect(combined).not.toContain('DAYCOVAL');
    expect(combined).not.toContain('C6');
  });
  it('não consulta o banco sem identificadores bancários completos',async()=>{
    const run=vi.fn();
    const result=await calculateTelegramInssOfficialQuotes({} as any,'tenant-evolve',
      {id:'partner-1',name:'Parceiro',code:'010'}, {...review,bankConsultation:undefined},[0,1,2,3],'NO',
      '0123456789ABCDEF',{run:run as any});
    expect(result.consulted).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(result.texts[0]).toContain('não consultadas');
  });
  it('distingue erro de integração de inelegibilidade e ainda processa os demais contratos',async()=>{
    const run=vi.fn(async(_db:any,_tenant:string,input:any)=>{
      if(input.originalContract==='EX-5152')throw Error('segredo que não deve aparecer');
      return {rows:[{provider:'FINANTO',state:'PENDING',message:'Banco sem oferta'}]};
    });
    const result=await calculateTelegramInssOfficialQuotes({} as any,'tenant-evolve',
      {id:'partner-1',name:'Parceiro',code:'010'},review,[0,1,2,3],'NO',
      '0123456789ABCDEF',{run:run as any});
    expect(run).toHaveBeenCalledTimes(4);
    expect(result.consulted).toBe(4);
    expect(result.unavailableBanks).toEqual(['Contrato 2']);
    const all=result.texts.join('\n');
    expect(all).toContain('Contrato 4');
    expect(all).toContain('Não significa recusa');
    expect(all).not.toContain('segredo que não deve aparecer');
  });
  it('somente NO_OFFERS concluído autoriza fallback, e falhas técnicas não são recusas',async()=>{
    const make=async(status:string)=>calculateTelegramInssOfficialQuotes(
      {} as any,'tenant-evolve',{id:'partner-1',name:'Parceiro',code:'010'},
      review,[0],'NO','0123456789ABCDEF',{
        run:vi.fn(async()=>({rows:[],operationalStatus:status})) as any,
      });
    expect((await make('NO_OFFERS')).contracts[0].completedWithoutOffer).toBe(true);
    expect((await make('TECHNICAL_FAILURE')).contracts[0].completedWithoutOffer).toBe(false);
    expect((await make('PARTIAL')).contracts[0].completedWithoutOffer).toBe(false);
  });
  it('consulta todos os oito contratos em paralelo controlado sem omitir resultados',async()=>{
    const contracts=Array.from({length:8},(_,i)=>({
      ...review.contracts[i%4],numberSuffix:String(3000+i),
    }));
    const extended={...review,benefitContractCount:8,contracts,
      bankConsultation:{...review.bankConsultation!,
        contracts:contracts.map(c=>({number:'SYN-'+c.numberSuffix}))}};
    let running=0,maximum=0;
    const progress:number[]=[];
    const run=vi.fn(async(_db:any,_tenant:string,input:any)=>{
      running++;maximum=Math.max(maximum,running);
      await new Promise(resolve=>setTimeout(resolve,5));
      running--;
      return {operationalStatus:'OFFERS',rows:[{state:'OFFER',
        provider:'FINANTO',institution:'FINANTO',amount:500,
        name:'Tabela INSS normal',rate:1.85,term:108,installment:input.value}]};
    });
    const record=vi.fn(async()=>({id:'stored'}));
    const result=await calculateTelegramInssOfficialQuotes({} as any,'tenant-evolve',
      {id:'partner-1',name:'Parceiro',code:'010'},extended,
      [0,1,2,3,4,5,6,7],'NO','0123456789ABCDEF',{
        run:run as any,record:record as any,onProgress:async(done,total)=>{
          expect(total).toBe(8);progress.push(done);
        },
      });
    expect(result.consulted).toBe(8);
    expect(result.contracts).toHaveLength(8);
    expect(result.positive).toBe(8);
    expect(result.contracts.every(c=>!c.failed)).toBe(true);
    expect(run).toHaveBeenCalledTimes(8);
    expect(record).toHaveBeenCalledTimes(8);
    expect(maximum).toBeGreaterThan(2);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(progress).toEqual([3,6]);
    expect(result.texts.join('\\n')).not.toContain('12345678909');
  });
  it('rejeita índice repetido ou fora dos contratos',async()=>{
    await expect(calculateTelegramInssOfficialQuotes({} as any,'tenant-evolve',
      {id:'p',name:'P',code:'01'},review,[0,0],'NO','0123456789ABCDEF'))
      .rejects.toThrow('inválida');
  });
});
