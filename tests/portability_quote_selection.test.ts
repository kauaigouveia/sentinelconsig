import {describe,it,expect} from 'vitest';
import {daycovalTablePosition,orderDaycovalUnifications,selectPortabilityQuoteRows} from '../src/lib/portabilityQuoteSelection';
const select=(rows:any[],bank:string)=>selectPortabilityQuoteRows(rows,bank,{
  name:r=>r.name,rate:r=>r.rate,amount:r=>r.amount,valid:r=>r.eligible!==false,
});
describe('priorização INSS PORT_REFIN compartilhada entre Telegram e site',()=>{
  it('extrai a numeração da tabela Daycoval sem confundir o ticket 20K ou código',()=>{
    expect(daycovalTablePosition('800587 - RFN - INSS 20K 7')).toBe(7);
    expect(daycovalTablePosition('800584 - RFN - INSS 4')).toBe(4);
    expect(daycovalTablePosition('Tabela 1')).toBe(1);
    expect(daycovalTablePosition('Tabela sem numeração')).toBeNull();
  });
  it('escolhe a tabela Daycoval mais próxima da 1, independente do maior troco, e preserva empates',()=>{
    const rows=[
      {name:'800587 - RFN - INSS 20K 7',amount:9500,eligible:true},
      {name:'800585 - RFN - INSS 3',amount:3200,eligible:true},
      {name:'800581 - RFN - INSS 1',amount:2700,eligible:false},
      {name:'800583 - RFN - INSS 3',amount:3000,eligible:true},
    ];
    expect(select(rows,'DAYCOVAL').map(x=>x.name)).toEqual([
      '800585 - RFN - INSS 3','800583 - RFN - INSS 3',
    ]);
  });
  it('destaca melhor tabela de três contratos, depois melhor tabela de dois e ordena o restante pelo troco',()=>{
    const groups=[
      {indices:[0,1],name:'800586 - RFN - INSS 15K 6',amount:9546.63},
      {indices:[0,1,3],name:'800585 - RFN - INSS 10K 5',amount:10312.75},
      {indices:[0,2,3],name:'800584 - RFN - INSS 4',amount:3815.43},
      {indices:[2,3],name:'800581 - RFN - INSS 1',amount:1406.45},
      {indices:[0,1,2],name:'800586 - RFN - INSS 15K 6',amount:9971.91},
      {indices:[1,2,3],name:'800585 - RFN - INSS 10K 5',amount:8375.77},
      {indices:[1,2],name:'800586 - RFN - INSS 15K 6',amount:7506.37},
    ];
    const sorted=orderDaycovalUnifications(groups,row=>({
      contractCount:row.indices.length,table:row.name,cashOut:row.amount,
    }));
    expect(sorted.slice(0,3).map(row=>row.indices.join('+'))).toEqual([
      '0+2+3','2+3','0+1+3',
    ]);
    expect(sorted.slice(2).map(row=>row.amount)).toEqual([
      10312.75,9971.91,9546.63,8375.77,7506.37,
    ]);
    expect(sorted).toHaveLength(groups.length);
  });
  it('seleciona uma oferta por banco com preferência por 1,85% e próxima menor taxa',()=>{
    const rows=[
      {name:'Maior troco',amount:9000,rate:1.72},
      {name:'Alvo',amount:5000,rate:1.85},
      {name:'Taxa inferior',amount:8500,rate:1.81},
    ];
    expect(select(rows,'FINANTO').map(x=>x.name)).toEqual(['Alvo']);
    expect(select(rows.filter(x=>x.rate!==1.85),'FINANTO').map(x=>x.name))
      .toEqual(['Taxa inferior']);
    expect(select(rows,'FACTA')).toHaveLength(1);
  });
});
