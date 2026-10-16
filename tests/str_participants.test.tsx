// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BankCodeSelect } from '../src/components/common/BankCodeSelect';
import { STR_PARTICIPANTS, searchInstitutions, resolveInstitutionCode } from '../src/lib/strParticipants';
afterEach(cleanup);
function Form() { const [code,setCode]=useState('001'); return <form><BankCodeSelect label="Banco de origem" value={code} onChange={setCode} /><output data-testid="code">{code}</output><button type="button" onClick={()=>setCode('104')}>Alterar externamente</button></form>; }
it('imports unique numeric bank codes with leading zeroes and excludes settlement 000',()=>{
 expect(STR_PARTICIPANTS).toHaveLength(461); expect(new Set(STR_PARTICIPANTS.map(row=>row.code)).size).toBe(461);
 expect(STR_PARTICIPANTS.every(row=>/^\d{3}$/.test(row.code)&&row.code!=='000')).toBe(true);
 expect(searchInstitutions('itau').some(row=>row.code==='341')).toBe(true);
 expect(resolveInstitutionCode('1')).toBe('001'); expect(resolveInstitutionCode('000')).toBe('');
 expect(resolveInstitutionCode('Banco inventado')).toBe('');
});
it('searches names, saves only code, supports keyboard and follows external changes',()=>{
 render(<Form/>);const input=screen.getByRole('combobox',{name:'Banco de origem'});
 expect((input as HTMLInputElement).value).toContain('001');
 fireEvent.change(input,{target:{value:'itau'}});expect(screen.getByTestId('code').textContent).toBe('');
 const option=screen.getAllByRole('option').find(item=>item.textContent?.startsWith('341 -'))!;fireEvent.click(option);
 expect(screen.getByTestId('code').textContent).toBe('341');
 fireEvent.change(input,{target:{value:'104'}});fireEvent.keyDown(input,{key:'Enter'});expect(screen.getByTestId('code').textContent).toBe('104');
 fireEvent.click(screen.getByText('Alterar externamente'));expect((input as HTMLInputElement).value).toContain('104');
 fireEvent.change(input,{target:{value:'935'}});fireEvent.blur(input);expect(screen.getByTestId('code').textContent).toBe('935');
 fireEvent.change(input,{target:{value:''}});expect(screen.getByTestId('code').textContent).toBe('');
});
