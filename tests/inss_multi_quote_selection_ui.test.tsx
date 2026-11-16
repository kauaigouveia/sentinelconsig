// @vitest-environment jsdom
import React,{useState} from 'react';
import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {PortabilityResults} from '../src/components/simulation/PortabilityResults';
import {toggleInssQuoteSelection} from '../src/lib/inssQuoteSelection';
afterEach(cleanup);
const rows=[1,2,3].map(index=>({
  contractLabel:'Contrato '+index,provider:'FINANTO',success:true,requiresReview:true,term:108,
  troco:100+index,originalInstallment:30+index,
  table:{name:'Tabela '+index,cod_tabela:'T'+index},
  data:{rate:1.85,installment:30+index},
}));
it('seleciona três condições, mostra total e gera um resumo para cada contrato',()=>{
 function Workspace(){
  const [selected,setSelected]=useState<typeof rows>([]);
  return <><PortabilityResults rows={rows} selected={selected.at(-1)??null}
    selectedRows={selected} onSelect={row=>setSelected(current=>toggleInssQuoteSelection(current,row))}
    conditionFor={row=>({installment:row.data.installment,rate:row.data.rate})}/>
    <output data-testid="selected-count">{selected.length}</output></>;
 }
 render(<Workspace/>);
 const buttons=screen.getAllByRole('button',{name:'Selecionar cotação'});
 expect(buttons).toHaveLength(3);
 buttons.forEach(button=>fireEvent.click(button));
 expect(screen.getByTestId('selected-count').textContent).toBe('3');
 expect(screen.getAllByRole('button',{name:'Cotação selecionada'})).toHaveLength(3);
 expect(screen.getByText(/COTAÇÃO 3/)).toBeTruthy();
 const summary=screen.getByRole('complementary',{name:'Resumo selecionado para o parceiro'});
 expect(summary.textContent).toContain('Contrato 1');
 expect(summary.textContent).toContain('Contrato 2');
 expect(summary.textContent).toContain('Contrato 3');
});
it('a cotação já salva não pode ser selecionada ou enviada novamente nesta sessão',()=>{
 render(<PortabilityResults rows={[rows[0]]} selected={null} savedRows={[rows[0]]}
   onSelect={()=>{throw Error('não deve selecionar cotação salva')}}
   conditionFor={row=>({installment:row.data.installment,rate:row.data.rate})}/>);
 const button=screen.getByRole('button',{name:'Cotação salva'}) as HTMLButtonElement;
 expect(button.disabled).toBe(true);
});
