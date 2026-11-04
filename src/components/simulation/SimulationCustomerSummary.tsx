import React from 'react';
import { ageAt } from '../../lib/inssEligibility';
export function SimulationCustomerSummary({name,cpf,birthDate,installment,term,rate,amount}:{name?:string;cpf:string;birthDate?:string;installment?:number;term?:number;rate?:number;amount?:number}) {
 const digits=cpf.replace(/\D/g,'');
 const masked=digits.length===11?`${digits.slice(0,3)}.***.***-${digits.slice(-2)}`:'CPF não informado';
 const age=ageAt(birthDate || '');
 const money=(value:number|undefined)=>value!=null && Number.isFinite(value) && value>0?value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não informada';
 const items=[{label:'Cliente',value:name?.trim()||'Nome não informado'},{label:'CPF',value:masked},{label:'Nascimento / idade',value:age!==null?`${birthDate!.split('-').reverse().join('/')} · ${age} anos`:'Não informado'}, {label:amount!=null?'Valor solicitado':'Parcela escolhida',value:money(amount ?? installment)}, {label:'Prazo escolhido',value:term && Number.isFinite(term)?`${term} meses`:'Não informado'}, {label:'Taxa escolhida',value:rate && Number.isFinite(rate)?`${rate.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4})}% a.m.`:'Todas as taxas'}];
 return <section aria-label="Resumo do cliente e das condições" className="shrink-0 border-b border-[var(--field-border)] bg-[var(--info-bg)] px-5 py-3 dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)]"><dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">{items.map(item=><div key={item.label} className="min-w-0"><dt className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">{item.label}</dt><dd title={item.value} className="mt-1 truncate text-xs font-semibold text-[var(--text-secondary)] sm:text-sm dark:text-[var(--text-primary)]">{item.value}</dd></div>)}</dl></section>;
}
