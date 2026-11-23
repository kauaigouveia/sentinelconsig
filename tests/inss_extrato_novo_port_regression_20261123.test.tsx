// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {inssNovoConsultationTerms,normalizeInssNovoOffers,dedupeInssNovoOffers}
  from '../src/lib/inssNovoConsultationTerms';
import {nossaFintechAgeError,finantoAgeError} from '../src/lib/inssEligibility';
import {PortabilityResults,displayedPortabilityQuoteCount} from '../src/components/simulation/PortabilityResults';
import {readFileSync} from 'node:fs';

afterEach(()=>cleanup());
const today=new Date(2026,10,23);

describe('Extrato INSS — consulta por prazos sem suposições sobre os bancos',()=>{
  it('idade 75: prazo 108 exclui Nossa Fintech NOVO, mas 60 pode ser consultado',()=>{
    const syntheticBirthDate='1951-03-03'; // pessoa sintética; nenhum identificador real do PDF
    expect(nossaFintechAgeError(syntheticBirthDate,108,today)).toMatch(/idade máxima/i);
    expect(nossaFintechAgeError(syntheticBirthDate,60,today)).toBeNull();
    expect(finantoAgeError(syntheticBirthDate,108,today)).toMatch(/idade permitida/i);
    expect(inssNovoConsultationTerms(syntheticBirthDate,today)).toEqual([108,60,48]);
  });
  it('clientes com faixa etária habitual mantêm a consulta padrão a 108 meses',()=>{
    expect(inssNovoConsultationTerms('1986-03-03',today)).toEqual([108]);
    expect(inssNovoConsultationTerms('invalid',today)).toEqual([108]);
  });
  it('consulta FINANTO em 96 meses aos 69 anos, sem ignorar as demais APIs',()=>{
    const birthDate='1957-03-03';
    expect(finantoAgeError(birthDate,108,today)).toMatch(/prazo máximo/i);
    expect(finantoAgeError(birthDate,96,today)).toBeNull();
    expect(inssNovoConsultationTerms(birthDate,today)).toEqual([108,96]);
  });
  it('consulta FINANTO em 48 meses aos 73 anos, sem confundir com ausência de produto',()=>{
    const birthDate='1953-03-03';
    expect(finantoAgeError(birthDate,60,today)).toMatch(/prazo máximo/i);
    expect(finantoAgeError(birthDate,48,today)).toBeNull();
    expect(inssNovoConsultationTerms(birthDate,today)).toEqual([108,84,72,60,48]);
  });
  it('preserva as ofertas de API com 60 meses sem alterar margem nem inventar valores',()=>{
    const data={offers:[
      {provider:'Nossa Fintech',institution:'Nossa Fintech',table:'INSS NOVO 60',amount:3400,
        installment:87.06,term:60,rate:1.85,source:'API'},
      {provider:'C6',institution:'C6',table:'sem oferta',amount:0,term:60,source:'API'},
      {provider:'FINANTO',amount:null,term:60,source:'API'},
    ]};
    const quotes=normalizeInssNovoOffers(data,60);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({provider:'Nossa Fintech',amount:3400,installment:87.06,term:60,source:'API'});
    expect(dedupeInssNovoOffers([...quotes,...quotes,{...quotes[0],term:48,amount:2800}]))
      .toEqual([quotes[0],{...quotes[0],term:48,amount:2800}]);
  });
  it('prévia 2027 aceita somente cenários explicitamente não vinculantes',()=>{
    const data={offers:[
      {provider:'C6',amount:1950,term:60,rate:1.85,source:'API'}, // sem sinalização: rejeitar
      {provider:'Nossa Fintech',amount:1800,term:60,source:'API',nonBinding:true,scenario:'PROJECTED_2027'},
      {provider:'FACTA',amount:-1,term:60,source:'API',nonBinding:true,scenario:'PROJECTED_2027'},
    ]};
    const rows=normalizeInssNovoOffers(data,60,true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({provider:'Nossa Fintech',amount:1800,installment:42});
  });
  it('não contabiliza vinte e seis tabelas recusadas como bancos com ofertas positivas',()=>{
    const rejected=Array.from({length:26},(_,i)=>({
      provider:'FINANTO',contractLabel:'Contrato sintético',success:false,skipped:true,
      error:'Prazo ou política não elegível',troco:null,
      table:{name:'Tabela '+(i+1)},
    }));
    render(<PortabilityResults rows={[
      ...rejected,
      {provider:'PARANA',contractLabel:'Contrato sintético',success:true,troco:500,
       term:108,table:{name:'Tabela de teste'},data:{installment:50,rate:1.8}},
    ]} selected={null} selectedRows={[]} onSelect={()=>{}}
      conditionFor={row=>({rate:row.data?.rate||1.8,installment:row.data?.installment||50})}/>);
    expect(screen.getByRole('heading',{name:'Paraná Banco'})).toBeTruthy();
    expect(screen.queryByRole('heading',{name:'Finanto'})).toBeNull();
    expect(screen.getByRole('button',{name:'Selecionar cotação'})).toBeTruthy();
  });
  it('modal faz tentativas com prazo alternativo e preserva modalidade separada',()=>{
    const source=readFileSync('src/components/simulation/NossaFintechPortRefinSimulationModal.tsx','utf8');
    expect(source).toContain("numberOfInstallments:'60'");
    expect(source).toContain("term: String(selected?.term || form.numberOfInstallments)");
    expect(source).toContain("inssNovoConsultationTerms(statement.customer.birthDate)");
    expect(source).toContain("PORTABILIDADE ({visiblePortabilityCount})");
    expect(source).not.toContain("alternativas em 60 meses quando elegíveis");
    expect(source).toContain("calculateNossaFintech(alternate)");
  });
});

it('o indicador de PORT conta as mesmas duas ofertas apresentadas, não 27 linhas calculadas',()=>{
  // Doze tabelas de cada instituição têm condições alternativas; o comparador
  // mostra apenas uma opção preferencial por banco/contrato.
  const rows=[
    ...Array.from({length:14},(_,i)=>({
      provider:'PARANA',contractLabel:'Contrato 2',success:true,skipped:false,
      troco:10419-i*10,table:{name:'Paraná '+i},term:108,
      data:{rate:1.85,installment:385},
    })),
    ...Array.from({length:13},(_,i)=>({
      provider:'FACTA',contractLabel:'Contrato 2',success:true,skipped:false,
      troco:5836-i*10,table:{name:'FACTA '+i},term:60,
      data:{rate:1.85,installment:385},
    })),
  ];
  expect(rows).toHaveLength(27);
  expect(displayedPortabilityQuoteCount(rows,row=>({rate:row.data.rate,installment:row.data.installment}))).toBe(2);
});
