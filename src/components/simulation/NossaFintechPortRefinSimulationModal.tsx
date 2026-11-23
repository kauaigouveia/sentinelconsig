import type { ReviewedInssStatement } from '../../lib/inssStatement';
import {PortabilityResults, displayedPortabilityQuoteCount} from './PortabilityResults';
import { portabilityQuoteCondition } from '../../lib/portRefinQuote';
import {originContractSuffix,type PortedInstallmentChange} from '../../lib/portRefinBreakdown';
import { formatMonthlyRate } from '../../lib/portRefinQuote';
import { inssProjectedMargin } from '../../lib/inssProjectedMargin';
import { inssStatementWhatsAppText } from '../../lib/inssStatementShare';
import { inssBankProjectedQuotes } from '../../lib/inssBankProjectedQuotes';
import {dedupeInssNovoOffers, inssNovoConsultationTerms, normalizeInssNovoOffers} from '../../lib/inssNovoConsultationTerms';
import { toggleInssQuoteSelection } from '../../lib/inssQuoteSelection';
import {StorageService} from '../../services/storageService';
import {EMPTY_ORIGIN_CONTRACT,hasOriginContractDraft,simulationContracts,contractDraft,contractKey,validateSimulationContracts,MAX_SIMULATION_CONTRACTS,type PortabilityContractDraft} from '../../lib/multiContractSimulation';
import {EligibilityResult} from './EligibilityResult';
import { portabilityReviewMetadata } from '../../lib/portabilitySimulationPolicy';
import { PortabilityReviewFields } from './PortabilityReviewFields';
import { SimulationCustomerSummary } from './SimulationCustomerSummary';
import { SimulationSteps, SimulationBack, SimulationContinue, continueSimulation } from './SimulationSteps';
import { paidFromTerms, portabilityEligibility } from '../../lib/portabilityEligibility';
import { BankCodeSelect } from '../common/BankCodeSelect';
import { HappyInssSimulationModal } from './HappyInssSimulationModal';
import { BankPlaybooksPanel } from './BankPlaybooksPanel';
import { CurrencyInput } from '../common/CurrencyInput';
import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, LoaderCircle, X } from 'lucide-react';
import { Partner, SimulationRequest } from '../../types';
import { readJsonResponse } from '../../lib/httpJson';
import { formatCpf, isValidCpf, normalizeCpf, parseCurrency } from '../../lib/utils';
import { getNossaFintechTroco } from '../../lib/nossaFintech';
import { InssBenefitTypeSelect } from './InssBenefitTypeSelect';
import { nossaFintechTableRate, ageAt, finantoAgeError, finantoBenefitError, finantoCashOut, finantoCashOutError, finantoInstallmentError, finantoRefinancingChoices, finantoTableLabel, INSS_TERMS } from '../../lib/inssEligibility';

type SimulationRow = { installmentChanges?: PortedInstallmentChange[]; originalInstallment?: number; contractLabel?: string; sourceForm?: any; unified?: boolean; provider: string; table?: any; success: boolean; requiresReview?: boolean; status?: number; data?: any; error?: string; troco?: number | null; skipped?: boolean; term?: number; lender?: string; sourceVersionDate?:string | null; sourceContracts?:PortabilityContractDraft[] };
type Props = { statement?: ReviewedInssStatement; autoRunFromStatement?: boolean; onBack?: () => void; happyEnabled?: boolean; isOpen: boolean; onClose: () => void; partners?: Partner[]; onSuccess?: (simulation: SimulationRequest) => void; onContinue?: (draft: { condition: NonNullable<SimulationRequest['selectedCondition']>; values: Record<string, string>; calculation?: any }) => void };
const currency = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'mt-1 block w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)]';
const labelClass = 'text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]';
const itemsOf = (data: any) => Array.isArray(data?.items) ? data.items : Array.isArray(data?.data?.items) ? data.data.items : [];
const messagesOf = (data: any) => Array.isArray(data?.messages) ? data.messages.map((item: any) => item?.text).filter(Boolean).join(' ') : '';

const EMPTY_FORM={
    name: '', cpf: '', birthDate: '', benefitNumber: '', benefitType: '',
    originLenderCode: '', originContractNumber: '', originalTerm: '',
    lastDueBalance: '', installmentFaceValue: '', openedInstallmentNumber: '', numberOfInstallments: '108', refinancingRate: '', benefitContractCount:'', legalRepresentative: false,
};

export const NossaFintechPortRefinSimulationModal: React.FC<Props> = ({ isOpen, onBack, happyEnabled = false, onClose, partners = [], onSuccess, onContinue, statement, autoRunFromStatement = false }) => {
  const [portabilityContext,setPortabilityContext]=useState<Record<string,string>>(statement ? { illiterate: statement.illiterate, ...(Number(parseCurrency(statement.loanMargin)) < 0 ? {negativeMarginAmount:statement.loanMargin} : {}), benefitStartDate: statement.benefitStart } : {});
  const [form, setForm] = useState<typeof EMPTY_FORM & {reviewMetadata?:Record<string,string>}>({...EMPTY_FORM, ...statement?.customer, benefitContractCount: statement?.benefitContractCount ?? '', legalRepresentative: statement ? statement.legalRepresentative : false});
  type FormSnapshot=typeof form & {reviewMetadata?:Record<string,string>};
  const [contractQueue,setContractQueue]=useState<PortabilityContractDraft[]>(statement?.contracts ?? []);
  const unify=true;
  const [progress,setProgress]=useState('');
  const running=React.useRef(false);
  const autoStarted=React.useRef(false);
  const identity=()=>`${StorageService.getCurrentTenantId()}:${StorageService.getActiveUser()?.id||''}`;
  const scope=React.useRef(identity());
  const transport=React.useRef<AbortController|null>(null);
  const request:typeof fetch=async(input,init)=>{
    if(scope.current!==identity())throw Error('Empresa ou sessão alterada. Abra uma nova simulação.');
    if(transport.current?.signal.aborted)throw Error('Simulação interrompida.');
    const response=await fetch(input,{...init,signal:transport.current?.signal});
    if(response.status===401)transport.current?.abort();
    if(scope.current!==identity())throw Error('Empresa ou sessão alterada. Abra uma nova simulação.');
    return response;
  };
  useEffect(()=>{
    const check=()=>{if(scope.current!==identity()){transport.current?.abort();setForm({...EMPTY_FORM});setRows([]);setSelected(null);setSelectedRows([]);setSavedRows([]);setSaveMessage('');setContractQueue([]);setProviderNotes([]);setError('Empresa ou sessão alterada. Abra uma nova simulação.');}};
    window.addEventListener('credit_gestao_storage_update',check);window.addEventListener('storage',check);
    return()=>{transport.current?.abort();window.removeEventListener('credit_gestao_storage_update',check);window.removeEventListener('storage',check);};
  },[]);
  const [step,setStep]=useState(statement ? 1 : 0);
  const [rows, setRows] = useState<SimulationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [providerNotes, setProviderNotes] = useState<string[]>([]);
  const [selected, setSelected] = useState<SimulationRow | null>(null);
  const [selectedRows, setSelectedRows] = useState<SimulationRow[]>([]);
  const [savedRows, setSavedRows] = useState<SimulationRow[]>([]);
  const [saveMessage, setSaveMessage] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [saved, setSaved] = useState(false);
  type MarginOffer = { provider:string; institution:string; table:string; amount:number; installment:number|null; term:number|null; rate:number|null; source:'API'|'PLANILHA' };
  const [marginOffers,setMarginOffers]=useState<MarginOffer[]>([]);
  const [marginState,setMarginState]=useState<'idle'|'loading'|'ready'>('idle');
  const [projectedState,setProjectedState]=useState<'idle'|'loading'|'ready'>('idle');
  const [projectedApiOffers,setProjectedApiOffers]=useState<MarginOffer[]>([]);
  const [projectedNote,setProjectedNote]=useState('');
  const [marginNote,setMarginNote]=useState('');
  const [selectedMargin,setSelectedMargin]=useState<number|null>(null);
  const [selectedProjected,setSelectedProjected]=useState<number|null>(null);
  const [activeTab,setActiveTab]=useState<'PORT'|'NEW'>(statement?.contracts.length===0?'NEW':'PORT');
  const [novoScenario,setNovoScenario]=useState<'CURRENT'|'PROJECTED'>('CURRENT');
  const [shareStatus,setShareStatus]=useState('');

  useEffect(()=>{if(!isOpen)transport.current?.abort();else if(!running.current)scope.current=identity();},[isOpen]);
  const previousCustomer = React.useRef([normalizeCpf(form.cpf), form.benefitNumber]);
  useEffect(() => {
    const nextCpf = normalizeCpf(form.cpf);
    if (previousCustomer.current[0] !== nextCpf || previousCustomer.current[1] !== form.benefitNumber) {
      previousCustomer.current = [nextCpf, form.benefitNumber];
      setPortabilityContext({});
      setContractQueue([]);
    }
  }, [form.cpf, form.benefitNumber]);
  // O retorno antecipado fica abaixo dos hooks de inicialização da simulação por extrato.

  const update = (key: keyof typeof form, value: string | boolean) => { setForm(current => ({ ...current, [key]: value })); setRows([]); setSelected(null);setSelectedRows([]);setSavedRows([]);setSaveMessage(''); setProviderNotes([]); setError(''); };
  const calculateNossaFintech = async (form:FormSnapshot): Promise<SimulationRow[]> => {
    const response = await request('/api/integrations/nossa-fintech/port-refin/simulate-all', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(form.reviewMetadata??portabilityContext),originalBank:form.originLenderCode,originalTerm:Number(form.originalTerm),lastDueBalance: parseCurrency(form.lastDueBalance), installmentFaceValue: parseCurrency(form.installmentFaceValue), openedInstallmentNumber: Number(form.openedInstallmentNumber), numberOfInstallments: Number(form.numberOfInstallments), legalRepresentative: form.legalRepresentative, birthDate: form.birthDate, benefitType: Number(form.benefitType), refinancingRate: form.refinancingRate ? parseCurrency(form.refinancingRate) : undefined }),
    });
    const result = await readJsonResponse(response);
    if (response.status === 422) throw new Error(result.error || 'Nossa Fintech: condição não elegível conforme as regras da instituição.');
    if (!response.ok || result.success === false) throw new Error(result.error || result.data?.message || `Nossa Fintech respondeu com HTTP ${result.status || response.status}.`);
    if (result.data?.noEligibleTables) throw new Error('Nossa Fintech: nenhuma tabela elegível para o banco de origem, idade, prazo e saldo informados.');
    if (!result.data?.results?.length && !result.data?.excludedTables?.length) throw new Error('Nossa Fintech não retornou tabelas compatíveis com a taxa, o prazo e o saldo escolhidos.');
    return [
      ...(result.data?.results || []).map((row: any) => ({ ...row, provider: 'Nossa Fintech', term: Number(form.numberOfInstallments), troco: row.success ? getNossaFintechTroco(row.data) : null })),
      ...(result.data?.excludedTables || []).map((row: any) => ({ provider: 'Nossa Fintech', table: row.table, term: Number(form.numberOfInstallments), success: false, skipped: true, error: row.reason })),
    ];
  };

  const calculateFacta = async (form:FormSnapshot): Promise<SimulationRow[]> => {
    const agreement = portabilityEligibility('facta', form.originLenderCode, paidFromTerms(form.originalTerm, form.openedInstallmentNumber)); if (agreement.blocked) throw new Error(agreement.reason);
    const response = await request('/api/integrations/facta/inss/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(form.reviewMetadata??portabilityContext),cpf: normalizeCpf(form.cpf), birthDate: form.birthDate, benefitNumber: form.benefitNumber, benefitType: Number(form.benefitType), operation: 'PORT_REFIN', mode: 'INSTALLMENT', value: parseCurrency(form.installmentFaceValue), term: Number(form.numberOfInstallments), rate: form.refinancingRate ? parseCurrency(form.refinancingRate) : undefined, debt: parseCurrency(form.lastDueBalance), originalBank: form.originLenderCode, originalTerm: Number(form.originalTerm), remainingTerm: Number(form.openedInstallmentNumber), originalInstallment: parseCurrency(form.installmentFaceValue) }) });
    const result = await readJsonResponse(response);
    if (!response.ok) throw new Error(result.error || 'Falha ao consultar FACTA.');
    if (result.message && !result.offers?.length) throw new Error(result.message);
    return (result.offers || []).map((offer: any) => ({ provider: 'FACTA', table: { name: offer.name, cod_tabela: offer.code, amount: offer.rate }, success: Boolean(offer.amount), term: offer.term, troco: offer.amount, data: offer, error: offer.amount ? undefined : 'O banco não informou troco nesta condição.' }));
  };

  const calculateWorkbook = async (provider:'DAYCOVAL'|'C6'|'PARANA',form:FormSnapshot,group:PortabilityContractDraft[]=[form]):Promise<SimulationRow[]> => {
    const route=provider==='DAYCOVAL'?'daycoval':provider==='PARANA'?'parana-spreadsheet':'c6-spreadsheet';
    // O backend Paraná encontra todas as taxas válidas na planilha ativa quando
    // nenhuma taxa específica é informada. Nunca reduzir a uma taxa arbitrária.
    // A planilha C6 Portabilidade só admite 108 meses; explicitar o prazo retornado.
    const chosenRate=form.refinancingRate?parseCurrency(form.refinancingRate):undefined;
    const targetTerm=provider==='C6'?108:Number(form.numberOfInstallments);
    const response=await request(`/api/${route}/calculate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(form.reviewMetadata??portabilityContext),birthDate:form.birthDate,benefitType:Number(form.benefitType),term:targetTerm,benefitContractCount:form.benefitContractCount?Number(form.benefitContractCount):undefined,refinanceRate:chosenRate,contracts:group.map(contract=>({originBank:contract.originLenderCode,originalTerm:Number(contract.originalTerm),remaining:Number(contract.openedInstallmentNumber),balance:parseCurrency(contract.lastDueBalance),installment:parseCurrency(contract.installmentFaceValue)}))})});
    const result=await readJsonResponse(response);if(!response.ok)throw Error(result.error||`Não foi possível calcular ${provider}.`);
    if(!result.offers?.length)throw Error(result.message||'A planilha não retornou condições calculadas.');
    // previewPortRefin já filtra ofertas não calculáveis; sua resposta pública
    // não possui os campos internos "calculated" nem "eligible".
    return result.offers.map((offer:any)=>({
      provider,table:{name:offer.name||offer.tableName,cod_tabela:offer.code||offer.tableId,amount:offer.rate},
      success:true,requiresReview:true,term:offer.term,troco:offer.amount,data:offer,
      sourceVersionDate:result.version?.versionDate || null,installmentChanges:offer.installmentChanges,
      reviewReason:offer.requiresReview?'Conferência comercial/documental pendente.':'Cotação por planilha; aprovação bancária pendente.',
    }));
  };

  const calculateAdditionalBanks=async(snapshot:FormSnapshot):Promise<SimulationRow[]>=>{
    if(!statement)return [];
    const response=await request('/api/inss/statement/quote',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        confirmedClientAuthorization:true,operation:'PORT_REFIN',onlyAdditionalPortBanks:true,
        cpf:normalizeCpf(statement.customer.cpf),name:statement.customer.name,
        benefitNumber:statement.customer.benefitNumber,
        benefitType:Number(statement.customer.benefitType),birthDate:statement.customer.birthDate,
        benefitStartDate:statement.benefitStart,illiterate:statement.illiterate,
        legalRepresentative:statement.legalRepresentative===true,
        loanBlocked:statement.loanBlocked===true,loanMargin:parseCurrency(statement.loanMargin),
        income:parseCurrency(statement.income),term:Number(snapshot.numberOfInstallments),
        contract:{
          originBank:snapshot.originLenderCode,contractNumber:snapshot.originContractNumber,
          originalTerm:Number(snapshot.originalTerm),remainingTerm:Number(snapshot.openedInstallmentNumber),
          debt:parseCurrency(snapshot.lastDueBalance),installment:parseCurrency(snapshot.installmentFaceValue),
        },
      }),
    });
    const data=await readJsonResponse(response);
    if(!response.ok)throw Error(data.error||'Consulta complementar HAPPY/BMG não concluída.');
    const offers=(Array.isArray(data.offers)?data.offers:[])
      .filter((q:any)=>Number(q.amount)>0&&['HAPPY','BMG'].some(bank=>String(q.provider||'').toUpperCase().includes(bank)));
    if(!offers.length && Array.isArray(data.notices)&&data.notices.length)
      throw Error(data.notices.map((m:any)=>String(m).slice(0,150)).join(' · '));
    return offers.map((q:any)=>({
      provider:String(q.provider||q.institution),table:{name:String(q.table||'Condição INSS'),cod_tabela:String(q.table||''),amount:q.rate},
      success:true,requiresReview:q.review===true,term:Number(q.term)||Number(snapshot.numberOfInstallments),
      troco:Number(q.amount),data:{installment:q.installment,rate:q.rate,contractAmount:null},
    }));
  };

  const calculateFinanto = async (form:FormSnapshot): Promise<SimulationRow[]> => {
    const agreement = portabilityEligibility('finanto', form.originLenderCode, paidFromTerms(form.originalTerm, form.openedInstallmentNumber)); if (agreement.blocked) throw new Error(agreement.reason);
    const ageError = finantoAgeError(form.birthDate, Number(form.numberOfInstallments),undefined,'PORT_REFIN');
    if (ageError) throw new Error(ageError);
    const configResponse = await request('/api/integrations/finanto/config', { credentials: 'same-origin' });
    const config = configResponse.ok ? await configResponse.json() : null;
    if (!config?.isConfigured || !config?.enabled) throw new Error('FINANTO não está configurada e ativada para esta empresa.');
    const call = async (endpoint: string, body: any) => {
      const response = await request('/api/integrations/finanto/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'POST', endpoint, body, clientBirthDate: form.birthDate, benefitType: Number(form.benefitType),portabilityContext }) });
      const data = await response.json();
      if (!response.ok || messagesOf(data)) throw new Error(data.error || messagesOf(data) || 'Falha na consulta FINANTO.');
      return data;
    };
    const products = itemsOf(await call('/v3/loan-products/search/basic', { type: { code: { eq: 20 } }, operation: { code: { eq: 4 } } }))
      .filter((item: any) => Number(item?.type?.code ?? item?.typeCode) === 20);
    const productIds = new Set(products.map((item: any) => String(item.id)));
    if (!productIds.size) throw new Error('FINANTO não retornou produtos INSS Portabilidade + Refinanciamento.');
    const allRules: any[] = [];
    for (let offset = 0; offset < 2000; offset += 20) {
      const page = itemsOf(await call('/v3/loan-product-rules/search/basic', { offset, limit: 20, operation: { code: { eq: 4 } } }));
      allRules.push(...page.filter((rule: any) => productIds.has(String(rule?.product?.id))));
      if (page.length < 20) break;
    }
    const results: SimulationRow[] = [];
    const eligible = allRules.flatMap(rule => {
      const choices = finantoRefinancingChoices(rule, Number(form.numberOfInstallments), form.refinancingRate ? parseCurrency(form.refinancingRate) : undefined,'PORT_REFIN');
      const reason = finantoBenefitError(rule.name || '', form.benefitType) || finantoInstallmentError(rule.name || '', parseCurrency(form.installmentFaceValue),'PORT_REFIN');
      if (reason || !choices.length) {
        results.push({ provider: 'FINANTO', table: { name: finantoTableLabel(rule,'PORT_REFIN'), originalName: rule.name, id: rule.id, cod_tabela: rule.code || rule.id }, term: Number(form.numberOfInstallments), success: false, skipped: true, error: reason || 'A tabela não atende à taxa e ao prazo escolhidos.' });
        return [];
      }
      return choices.map(({ item, rate }) => ({ rule, item, rate }));
    });
    let next = 0;
    const worker = async () => {
      while (next < eligible.length) {
        const { rule, rate: selectedRate } = eligible[next++];
        try {
          const response = await call('/v3/loan-inss-simulations/calculation', {
            ruleId: rule.id, hasInsurance: false,
            loanValue: parseCurrency(form.lastDueBalance), installmentValue: parseCurrency(form.installmentFaceValue),
            rate: selectedRate, term: Number(form.openedInstallmentNumber),
            issueAmount: parseCurrency(form.lastDueBalance),
            originContract: { lenderCode: Number(form.originLenderCode), contractNumber: form.originContractNumber.trim(), term: Number(form.originalTerm), installmentsRemaining: Number(form.openedInstallmentNumber), installmentValue: parseCurrency(form.installmentFaceValue), dueBalanceValue: parseCurrency(form.lastDueBalance) },
            refinancing: { term: Number(form.numberOfInstallments), rate: selectedRate, installmentValue: parseCurrency(form.installmentFaceValue) },
          });
          const cashOutError = finantoCashOutError(rule.name || '', response,'PORT_REFIN');
          results.push({ provider: 'FINANTO', table: { name: finantoTableLabel(rule,'PORT_REFIN'), originalName: rule.name, id: rule.id, cod_tabela: rule.code || rule.id, amount: selectedRate }, lender: response.lender?.name || response.fund?.name, term: Number(form.numberOfInstallments), success: !cashOutError, skipped: Boolean(cashOutError), error: cashOutError || undefined, data: response, troco: finantoCashOut(response) });
        } catch (err: any) {
          results.push({ provider: 'FINANTO', table: { name: finantoTableLabel(rule,'PORT_REFIN'), originalName: rule.name, id: rule.id, cod_tabela: rule.code || rule.id, amount: selectedRate }, term: Number(form.numberOfInstallments), success: false, error: err.message || 'Falha nesta tabela FINANTO.' });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, eligible.length) }, worker));
    return results;
  };

  const contractRequired=contractQueue.length===0||hasOriginContractDraft(form);
  const calculate = async (event: React.FormEvent) => {
    event.preventDefault(); if(running.current)return;transport.current=new AbortController();running.current=true; setSelected(null);setSelectedRows([]);setSavedRows([]);setSaveMessage(''); setSaved(false); setLoading(true); setRows([]); setError(''); setProviderNotes([]);
    if (!isValidCpf(normalizeCpf(form.cpf))) { setError('Informe um CPF válido.'); setLoading(false);running.current=false; return; }
    if (ageAt(form.birthDate) === null) { setError('Informe uma data de nascimento válida.'); setLoading(false);running.current=false; return; }
    try {
      const contracts=simulationContracts(contractQueue,{...form,reviewMetadata:portabilityContext});
      validateSimulationContracts(contracts);
      const combined:SimulationRow[]=[],notes:string[]=[];
      for(const [index,contract] of contracts.entries()){
        if(transport.current?.signal.aborted)throw Error('Simulação interrompida. Verifique a sessão e as permissões.');
        const snapshot={...form,...contract};
        const contractOrdinal=index+1;
        const label=`Contrato ${index+1} · banco ${contract.originLenderCode} · parcela ${currency(parseCurrency(contract.installmentFaceValue))}`;
        setProgress(`Simulando contrato ${index+1} de ${contracts.length}`);
        const calls=await Promise.allSettled([calculateNossaFintech(snapshot),calculateFinanto(snapshot),calculateFacta(snapshot),calculateWorkbook('DAYCOVAL',snapshot),calculateWorkbook('C6',snapshot),calculateWorkbook('PARANA',snapshot),calculateAdditionalBanks(snapshot)]);
        calls.forEach((result,index)=>{
          const provider=['Nossa Fintech','FINANTO','FACTA','DAYCOVAL','C6','PARANA','HAPPY/BMG'][index];
          if(result.status==='fulfilled'){
            const providerRows=result.value;
            combined.push(...providerRows.map(row=>({...row,contractLabel:label,sourceForm:snapshot,originalInstallment:parseCurrency(snapshot.installmentFaceValue)??undefined,installmentChanges:row.installmentChanges?.map(change=>({...change,label:`Contrato ${contractOrdinal}`,bankCode:contract.originLenderCode,contractSuffix:originContractSuffix(contract.originContractNumber)}))})));
            // A bank returning many rejected tables is NOT several executable offers.
            if(!providerRows.some(row=>row.success&&!row.skipped&&Number(row.troco)>0)){
              const reasons=[...new Set(providerRows.map(row=>row.error?.trim()).filter(Boolean))].slice(0,2);
              notes.push(`${label} · ${provider}: ${reasons.join(' · ') || 'nenhuma cotação positiva disponível nas condições atuais.'}`);
            }
          }else notes.push(`${label} · ${provider}: ${String(result.reason?.message||'não foi possível simular').slice(0,220)}`);
        });
        // At older ages the requested 108-month term may have no eligible
        // table. Try real bank/worksheet results at 60 months only for
        // providers that did not return a positive offer at 108; C6 workbook
        // explicitly uses 108 and must not be counted twice.
        if(statement && Number(snapshot.numberOfInstallments)>60 &&
          inssNovoConsultationTerms(snapshot.birthDate).includes(60)){
          const alternate={...snapshot,numberOfInstallments:'60'};
          const fallbackProviders: Array<{name:string;index:number;run:()=>Promise<SimulationRow[]>}>=[
            {name:'Nossa Fintech',index:0,run:()=>calculateNossaFintech(alternate)},
            {name:'FINANTO',index:1,run:()=>calculateFinanto(alternate)},
            {name:'FACTA',index:2,run:()=>calculateFacta(alternate)},
            {name:'DAYCOVAL',index:3,run:()=>calculateWorkbook('DAYCOVAL',alternate)},
            {name:'PARANA',index:5,run:()=>calculateWorkbook('PARANA',alternate)},
            {name:'HAPPY/BMG',index:6,run:()=>calculateAdditionalBanks(alternate)},
          ];
          const pending=fallbackProviders.filter(({index})=>{
            const original=calls[index];
            if(original.status==='fulfilled'&&original.value.some(row=>row.success&&!row.skipped&&Number(row.troco)>0))return false;
            if(original.status==='rejected'&&/não (?:está )?configurad|desativad|não habilitad|sem autorização/i.test(String(original.reason?.message||'')))return false;
            return true;
          });
          if(pending.length){
            setProgress(`Conferindo prazos alternativos de 60 meses · contrato ${contractOrdinal}`);
            const retry=await Promise.allSettled(pending.map(item=>item.run()));
            retry.forEach((result,index)=>{
              const provider=pending[index].name;
              if(result.status==='fulfilled'){
                const valid=result.value.filter(row=>row.success&&!row.skipped&&Number(row.troco)>0);
                combined.push(...valid.map(row=>({...row,contractLabel:label,sourceForm:alternate,
                  originalInstallment:parseCurrency(alternate.installmentFaceValue)??undefined,
                  installmentChanges:row.installmentChanges?.map(change=>({...change,label:`Contrato ${contractOrdinal}`,
                    bankCode:alternate.originLenderCode,contractSuffix:originContractSuffix(alternate.originContractNumber)}))})));
                if(!valid.length){
                  const reasons=[...new Set(result.value.map(row=>row.error?.trim()).filter(Boolean))].slice(0,2);
                  notes.push(`${label} · ${provider} (60 meses): ${reasons.join(' · ')||'nenhuma oferta positiva disponível.'}`);
                }
              }else notes.push(`${label} · ${provider} (60 meses): ${String(result.reason?.message||'não foi possível simular').slice(0,180)}`);
            });
          }
        }
        if(scope.current!==identity())throw Error('Empresa ou sessão alterada. Abra uma nova simulação.');
        setRows(combined.filter(row=>row.troco==null||row.troco>=0));setProviderNotes([...notes]);
      }
      if(transport.current?.signal.aborted)throw Error('Simulação interrompida. Verifique a sessão e as permissões.');
      if(unify&&contracts.length>1){
        setProgress('Calculando combinações Daycoval pela planilha');
        let offset=0;
        while(true){
        setProgress(`Calculando unificações Daycoval · bloco ${Math.floor(offset/35)+1}`);
        const response=await request('/api/daycoval/calculate-groups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({offset,...(form.reviewMetadata??portabilityContext),birthDate:form.birthDate,benefitType:Number(form.benefitType),term:Number(form.numberOfInstallments),refinanceRate:form.refinancingRate?parseCurrency(form.refinancingRate):undefined,contracts:contracts.map(c=>({reviewMetadata:c.reviewMetadata,contractNumber:c.originContractNumber,originBank:c.originLenderCode,originalTerm:Number(c.originalTerm),remaining:Number(c.openedInstallmentNumber),balance:parseCurrency(c.lastDueBalance),installment:parseCurrency(c.installmentFaceValue)}))})});
        const data=await readJsonResponse(response);
        if(!response.ok){notes.push(`Unificação Daycoval: ${data.error||'cálculo indisponível'}`);break;}
        else for(const result of data.groups||[]){
          const label=`Unificação Daycoval · contratos ${result.indices.map((index:number)=>index+1).join(' + ')}`;
          if(result.error||!result.offers?.length)notes.push(`${label}: ${result.error||result.message||'Sem oferta'}`);
          const originals=result.indices.map((index:number)=>parseCurrency(contracts[index]?.installmentFaceValue));
          const originalInstallment=originals.length&&originals.every((value:number|null)=>value!==null&&Number.isFinite(value)&&value>0)?Math.round(originals.reduce((sum:number,value:number)=>sum+value,0)*100)/100:undefined;
          for(const offer of result.offers||[])combined.push({provider:'DAYCOVAL',contractLabel:label,originalInstallment,unified:true,requiresReview:true,success:true,sourceForm:{...form,...contracts[result.indices[0]]},sourceContracts:result.indices.map((index:number)=>contracts[index]),term:offer.term,troco:offer.amount,data:offer,sourceVersionDate:result.version?.versionDate || null,installmentChanges:offer.installmentChanges?.map((change:any,index:number)=>({...change,label:`Contrato ${result.indices[index]+1}`,bankCode:contracts[result.indices[index]]?.originLenderCode,contractSuffix:originContractSuffix(contracts[result.indices[index]]?.originContractNumber)})),table:{name:offer.name,cod_tabela:offer.code,amount:offer.rate}});
        }
        if(scope.current!==identity())throw Error('Empresa ou sessão alterada. Abra uma nova simulação.');
        setRows(combined.filter(row=>row.troco==null||row.troco>=0));setProviderNotes([...notes]);
        if(data.nextOffset==null)break;
        if(!Number.isInteger(data.nextOffset)||data.nextOffset<=offset)throw Error('Resposta inválida no acompanhamento das unificações.');
        offset=data.nextOffset;
        }
      }
      if(!combined.some(row=>row.success))setError('Nenhuma oferta calculada; confira as pendências por contrato e banco.');
    } catch(error:any){setError(error.message||'Não foi possível simular os contratos.');}
    finally { setLoading(false);running.current=false;setProgress(''); }
  };

  const loadStatementMargin = async () => {
    if(!statement)return;
    const margin=parseCurrency(statement.loanMargin);
    setMarginState('loading');setMarginOffers([]);setMarginNote('');setSelectedMargin(null);
    if(statement.loanBlocked || margin==null || margin<=0){
      setMarginState('ready');
      setMarginNote(statement.loanBlocked?'Benefício bloqueado para empréstimos conforme extrato.':'Sem margem atual positiva para NOVO.');
      return;
    }
    const quotes:ReturnType<typeof normalizeInssNovoOffers>=[];
    const notes:string[]=[];
    // 108 meses sozinho pode excluir todos os bancos para clientes mais idosos.
    // Consultar prazos mais curtos com a MESMA margem atual (sem inventar taxas).
    const terms=inssNovoConsultationTerms(statement.customer.birthDate);
    for(const term of terms){
      if(transport.current?.signal.aborted || scope.current!==identity())break;
      try{
        const response=await request('/api/inss/statement/quote',{
          method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
          body:JSON.stringify({
            confirmedClientAuthorization:true,operation:'NEW',
            cpf:normalizeCpf(statement.customer.cpf),name:statement.customer.name,
            benefitNumber:statement.customer.benefitNumber,
            benefitType:Number(statement.customer.benefitType),birthDate:statement.customer.birthDate,
            benefitStartDate:statement.benefitStart,illiterate:statement.illiterate,
            legalRepresentative:statement.legalRepresentative===true,loanBlocked:false,
            loanMargin:margin,income:parseCurrency(statement.income),term,
          }),
        });
        const data=await readJsonResponse(response);
        if(!response.ok)throw Error(data.error||`Consulta NOVO HTTP ${response.status}.`);
        if(scope.current!==identity()||transport.current?.signal.aborted)break;
        const found=normalizeInssNovoOffers(data,term);
        quotes.push(...found);
        // A falta de cotação de um banco deve ser visível mesmo quando outros
        // bancos retornam ofertas. Não tratar a falha da FINANTO como sucesso geral.
        const messages=(Array.isArray(data.notices)?data.notices:[]).map((value:unknown)=>String(value).slice(0,180));
        const finantoMessages=messages.filter((message:string)=>/\bFINANTO\b/i.test(message)).slice(0,3);
        notes.push(...finantoMessages.map((message:string)=>`${term} meses · ${message}`));
        if(found.length===0){
          const otherMessages=messages.filter((message:string)=>!/\bFINANTO\b/i.test(message)).slice(0,3);
          if(otherMessages.length) notes.push(`${term} meses: ${otherMessages.join(' · ')}`);
          else if(!finantoMessages.length) notes.push(`${term} meses: Nenhuma oferta bancária retornada.`);
        }
        setMarginOffers(dedupeInssNovoOffers(quotes));
      }catch(error:any){
        if(transport.current?.signal.aborted)break;
        notes.push(`${term} meses: ${String(error?.message||'Consulta indisponível.').slice(0,180)}`);
      }
    }
    if(scope.current===identity()&&!transport.current?.signal.aborted){
      setMarginOffers(dedupeInssNovoOffers(quotes));
      setMarginNote(notes.join(' · ').slice(0,1500));
      setMarginState('ready');
    }
  };

  useEffect(()=>{
    if(!isOpen || !statement || !autoRunFromStatement || autoStarted.current)return;
    autoStarted.current=true;
    setStep(2);
    // A margin-only statement must not enter portability validation (zero contracts).
    if(statement.contracts.length>0)void calculate({preventDefault:()=>{}} as React.FormEvent);
    else {
      // NOVO-only still needs a cancellable request if the user closes the modal
      // or the active tenant/session changes mid-consultation.
      transport.current=new AbortController();
      setRows([]);setProviderNotes([]);setActiveTab('NEW');
    }
    void loadStatementMargin();
  },[isOpen,statement,autoRunFromStatement]);

  // Cenário hipotético separado: R$42 enviados às APIs exclusivamente como
  // parcela de cálculo FUTURA, nunca como margem Dataprev já disponível.
  useEffect(()=>{
    if(!isOpen||!statement||!autoRunFromStatement||novoScenario!=='PROJECTED'||projectedState!=='idle')return;
    const forecast=inssProjectedMargin(statement.income,statement.loanMargin,statement.loanBlocked);
    if(!forecast||forecast.loanBlocked){setProjectedState('ready');return;}
    setProjectedState('loading');setProjectedNote('');setProjectedApiOffers([]);setSelectedProjected(null);
    void (async()=>{
      const quotes:ReturnType<typeof normalizeInssNovoOffers>=[];
      const notes:string[]=[];
      for(const term of inssNovoConsultationTerms(statement.customer.birthDate)){
        if(transport.current?.signal.aborted||scope.current!==identity())break;
        try{
          const response=await request('/api/inss/statement/quote',{
            method:'POST',credentials:'same-origin',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              confirmedClientAuthorization:true,operation:'PROJECTED_NEW',forecastYear:2027,
              cpf:normalizeCpf(statement.customer.cpf),name:statement.customer.name,
              benefitNumber:statement.customer.benefitNumber,
              benefitType:Number(statement.customer.benefitType),
              birthDate:statement.customer.birthDate,benefitStartDate:statement.benefitStart,
              illiterate:statement.illiterate,legalRepresentative:statement.legalRepresentative===true,
              loanBlocked:statement.loanBlocked===true,loanMargin:parseCurrency(statement.loanMargin),
              income:parseCurrency(statement.income),term,
            }),
          });
          const data=await readJsonResponse(response);
          if(!response.ok)throw Error(data.error||'Cenário bancário de 2027 indisponível.');
          if(scope.current!==identity()||transport.current?.signal.aborted)break;
          if(data.scenario!=='PROJECTED_2027'||data.officialMarginAvailable!==false)
            throw Error('O servidor não confirmou que esta consulta é apenas uma projeção.');
          const found=normalizeInssNovoOffers(data,term,true);
          quotes.push(...found);
          setProjectedApiOffers(dedupeInssNovoOffers(quotes));
          if(!found.length){
            const warnings=(Array.isArray(data.notices)?data.notices:[]).slice(0,3).map((note:unknown)=>String(note).slice(0,180));
            notes.push(`${term} meses: ${warnings.join(' · ')||'Nenhuma condição retornada.'}`);
          }
        }catch(error:any){
          if(transport.current?.signal.aborted)break;
          notes.push(`${term} meses: ${String(error?.message||'Consulta indisponível.').slice(0,180)}`);
        }
      }
      if(scope.current===identity()&&!transport.current?.signal.aborted){
        setProjectedApiOffers(dedupeInssNovoOffers(quotes));
        setProjectedNote(notes.join(' · ').slice(0,1500));
        setProjectedState('ready');
      }
    })();
  },[isOpen,statement,autoRunFromStatement,novoScenario,projectedState]);

  const conditionFor = (row: SimulationRow): NonNullable<SimulationRequest['selectedCondition']> =>
    portabilityQuoteCondition(row, parseCurrency(row.sourceForm?.installmentFaceValue ?? form.installmentFaceValue));
  const visiblePortabilityCount = displayedPortabilityQuoteCount(rows, conditionFor);
  const draftValues = () => ({ ...Object.fromEntries(Object.entries(selected?.sourceForm||form).filter(([, value]) => typeof value === 'string')) as Record<string, string>, ...(statement ? { illiterate: statement.illiterate } : {}), partnerId, rate: String(selected ? conditionFor(selected).rate || form.refinancingRate : form.refinancingRate), term: String(selected?.term || form.numberOfInstallments) });
  const toggleQuote = (row:SimulationRow) => {
    if (loading || savedRows.includes(row)) return;
    const next = toggleInssQuoteSelection(selectedRows,row);
    setSelectedRows(next);
    setSelected(next[next.length - 1] ?? null);
    setSaved(false);
    setSaveMessage('');
    setError('');
  };
  const save = async () => {
    const quotes = selectedRows.filter(row => !savedRows.includes(row));
    if (!quotes.length || !partnerId) {
      setError('Selecione ao menos uma cotação e informe o parceiro responsável.');
      return;
    }
    setLoading(true); setError(''); setSaveMessage('');
    const savedNow:SimulationRow[] = [];
    const failures:string[] = [];
    let lastSaved:SimulationRequest | null = null;
    try {
      // Sequential writes avoid simultaneous requests for the same benefit and
      // preserve independent records for each originating contract.
      for (const row of quotes) {
        const source:FormSnapshot = row.sourceForm || { ...EMPTY_FORM, ...(statement?.customer || {}) };
        if (!Number.isFinite(row.troco) || Number(row.troco) <= 0 || !source.originContractNumber || !source.originLenderCode) {
          failures.push((row.contractLabel || 'Contrato') + ': dados ou cotação inválidos.');
          continue;
        }
        try {
          const response = await request('/api/simulations', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              cpf:normalizeCpf(source.cpf),partnerId,simulationType:'INSS_MULTI',operationType:'PORT_REFIN',
              selectedCondition:conditionFor(row),
              customerData:{
                name:source.name,...(statement ? { illiterate:statement.illiterate === 'YES' } : {}),
                birthDate:source.birthDate,benefitNumber:source.benefitNumber,benefitType:Number(source.benefitType),
                originContract:{
                  lenderCode:source.originLenderCode,contractNumber:source.originContractNumber,
                  term:source.originalTerm,installmentsRemaining:source.openedInstallmentNumber,
                  installmentValue:source.installmentFaceValue,dueBalanceValue:source.lastDueBalance,
                },
                ...(row.sourceContracts?.length ? {originContracts:row.sourceContracts.map(contract=>({
                  lenderCode:contract.originLenderCode,contractNumber:contract.originContractNumber,
                  term:contract.originalTerm,installmentsRemaining:contract.openedInstallmentNumber,
                  installmentValue:contract.installmentFaceValue,dueBalanceValue:contract.lastDueBalance,
                }))} : {}),
              },
            }),
          });
          const data = await readJsonResponse(response);
          if (!response.ok) {
            failures.push((row.contractLabel || 'Contrato') + ': ' + (data.error || 'Não foi possível salvar.'));
            if (response.status !== 409) break;
            continue;
          }
          savedNow.push(row);
          lastSaved=data as SimulationRequest;
          setSavedRows(previous=>[...previous,row]);
        } catch (error:any) {
          failures.push((row.contractLabel || 'Contrato') + ': ' + (error.message || 'Falha de conexão.'));
          break;
        }
      }
      if (savedNow.length) {
        setSelectedRows(previous=>previous.filter(row=>!savedNow.includes(row)));
        setSelected(null);
        setSaved(true);
        if (lastSaved) onSuccess?.(lastSaved);
      }
      if (savedNow.length) setSaveMessage(savedNow.length + (savedNow.length === 1 ? ' cotação salva' : ' cotações salvas') + ' para conferência. Cada contrato possui registro independente.');
      if (failures.length) setError(failures.join(' '));
    } finally {
      setLoading(false);
    }
  };

  const forecast=statement?inssProjectedMargin(statement.income,statement.loanMargin,statement.loanBlocked):null;
  const projectedRows=projectedState!=='ready'?[]:[
    // Cenários efetivamente calculados pelas APIs têm prioridade para cada banco.
    ...projectedApiOffers.map(quote=>({
      ...quote,projectedGross:quote.amount,scenario:'FUTURE_NOT_AVAILABLE' as const,
      calculation:'API_SCENARIO' as const,
    })),
    // Outros bancos: simulação matemática com suas próprias taxas atuais, sem
    // classificar o resultado como oferta ou consulta do aumento na API.
    ...inssBankProjectedQuotes(marginOffers,Boolean(forecast&&!forecast.loanBlocked))
      .filter(quote=>!projectedApiOffers.some(api=>api.provider===quote.provider))
      .map(quote=>({...quote,calculation:'RATE_REFERENCE' as const})),
  ];
  const projectedBest=projectedRows.map((quote,index)=>({...quote,index}))
    .filter((quote,index,all)=>all.findIndex(item=>item.provider===quote.provider)===index);
  const chosenMargin=selectedProjected!=null&&projectedRows[selectedProjected]
    ? {...projectedRows[selectedProjected],amount:projectedRows[selectedProjected].projectedGross,
       installment:42,scenario:'PROJECTED_2027' as const,
       calculatedByApi:projectedRows[selectedProjected].calculation==='API_SCENARIO'}
    : selectedMargin==null?null:marginOffers[selectedMargin]||null;
  const messageForWhatsApp=statement?inssStatementWhatsAppText(statement.customer.name,chosenMargin,selectedRows,(row)=>{
    const quoted=conditionFor(row as SimulationRow);
    return {installment:quoted.installment,rate:quoted.rate};
  }):'';
  const marginBest=marginOffers.map((quote,index)=>({...quote,index}))
    .filter((quote,index,all)=>all.findIndex(item=>item.provider===quote.provider)===index);
  const marginOther=marginOffers.map((quote,index)=>({...quote,index}))
    .filter(quote=>!marginBest.some(best=>best.index===quote.index));
  const copyToWhatsApp=async()=>{
    try{
      if(!navigator.clipboard?.writeText)throw Error('Área de transferência indisponível.');
      await navigator.clipboard.writeText(messageForWhatsApp);
      setShareStatus('Resumo copiado! Cole na conversa do WhatsApp.');
    }catch{setShareStatus('Selecione e copie manualmente o texto do resumo abaixo.');}
  };
  if(!isOpen)return null;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--scrim)] p-3 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" aria-labelledby="port-refin-simulation-title" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)]  dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]">
      <header className="flex items-start justify-between border-b border-[var(--field-border)] p-5 dark:border-[var(--field-border)]"><div><SimulationBack onBack={onBack} disabled={loading} label={statement ? 'Voltar ao extrato' : undefined}/><h2 id="port-refin-simulation-title" className="text-xl font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{statement?.contracts.length===0?'INSS · NOVO pela margem do extrato':statement?'INSS · Simulação completa por extrato':'INSS · Portabilidade + Refinanciamento'}</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">{statement?.contracts.length===0?'Compare ofertas de NOVO com a margem disponível do extrato.':statement ? 'Compare as condições dos contratos selecionados no extrato.' : 'Informe cliente e dívida para comparar as condições nas integrações habilitadas.'}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]"><X className="h-5 w-5" /></button></header>
      {!statement && <SimulationSteps labels={['Cliente','Contrato','Ofertas']} step={step} onChange={setStep} disabled={loading}/>}
      {step===2 && (statement
        ? <section aria-label="Resumo dos contratos do extrato" className="flex flex-wrap gap-x-7 gap-y-2 border-b border-[var(--field-border)] px-5 py-3 text-xs">
            <span>Cliente: <strong>{form.name||'Benefício INSS'}</strong></span>
            {contractQueue.length>0 && <>
              <span>Contratos: <strong>{contractQueue.length}</strong></span>
              <span>Parcelas originais somadas: <strong>{currency(contractQueue.reduce((sum,item)=>sum+Number(parseCurrency(item.installmentFaceValue)||0),0))}</strong></span>
            </>}
            <span>Prazo de referência: <strong>{form.numberOfInstallments} meses</strong></span>
          </section>
        : <SimulationCustomerSummary name={form.name} cpf={form.cpf} birthDate={form.birthDate} installment={parseCurrency(form.installmentFaceValue)} term={Number(form.numberOfInstallments)} rate={form.refinancingRate?parseCurrency(form.refinancingRate):undefined}/>)}
      <div className="overflow-y-auto p-5 sm:p-7"><form onSubmit={event=>{if(step!==1){event.preventDefault();return;}setStep(2);void calculate(event);}} className="space-y-4">
        {!statement && <fieldset data-simulation-step hidden={step!==0} disabled={step!==0} className="space-y-4"><section className="rounded-xl border border-[var(--field-border)] p-5 dark:border-[var(--field-border)]"><h3 className="mb-3 text-sm font-bold">1. Cliente e benefício</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>CPF<input required value={form.cpf} onChange={e => update('cpf', formatCpf(e.target.value))} className={inputClass} /></label>
          <label className={labelClass}>Nome do cliente (opcional)<input value={form.name} onChange={e=>update('name',e.target.value)} className={inputClass}/></label>
          <label className={labelClass}>Data de nascimento<input required type="date" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Número do benefício<input required value={form.benefitNumber} onChange={e => update('benefitNumber', e.target.value.replace(/\D/g, '').slice(0, 20))} className={inputClass} /></label>
          <InssBenefitTypeSelect className={labelClass} required value={form.benefitType} onChange={value => update('benefitType', value)} />
        </div></section>
        <PortabilityReviewFields value={portabilityContext} onChange={value=>{setPortabilityContext(value);setRows([]);setSelected(null);setSelectedRows([]);setSavedRows([]);setSaveMessage('');}}/>
        <SimulationContinue onClick={event=>continueSimulation(event,()=>setStep(1))}/></fieldset>}
        <fieldset hidden={step!==1} disabled={step!==1||loading} className="space-y-5"><section className="rounded-xl border border-[var(--field-border)] p-4 dark:border-[var(--field-border)]"><h3 className="mb-3 text-sm font-bold">{statement ? `Contratos selecionados no extrato: ${contractQueue.length}` : '2. Contrato de origem'}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {!statement && <><BankCodeSelect required={contractRequired} label="Banco de origem" value={form.originLenderCode} onChange={value => update('originLenderCode', value)} className={inputClass} labelClassName={labelClass} />
          <label className={labelClass}>Número do contrato<input required={contractRequired} value={form.originContractNumber} onChange={e => update('originContractNumber', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Prazo original (meses)<input required={contractRequired} type="number" min="1" value={form.originalTerm} onChange={e => update('originalTerm', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Parcelas restantes<input required={contractRequired} type="number" min="1" value={form.openedInstallmentNumber} onChange={e => update('openedInstallmentNumber', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Saldo devedor (R$)<CurrencyInput required={contractRequired} min="0.01" step="0.01" value={form.lastDueBalance} onValueChange={value => update('lastDueBalance', value)} className={inputClass} /></label>
          <label className={labelClass}>Parcela atual (R$)<CurrencyInput required={contractRequired} min="0.01" step="0.01" value={form.installmentFaceValue} onValueChange={value => update('installmentFaceValue', value)} className={inputClass} /></label></>}
          <label className={labelClass}>Prazo do novo refinanciamento<select value={form.numberOfInstallments} onChange={e => update('numberOfInstallments', e.target.value)} className={inputClass}>{INSS_TERMS.map(term => <option key={term} value={term}>{term} meses</option>)}</select></label>
          {!statement && <><label className={labelClass}>Taxa da tabela oficial (opcional)<input type="number" min="0" step="0.01" value={form.refinancingRate} onChange={e=>update('refinancingRate',e.target.value)} className={inputClass} placeholder="Em branco: condições retornadas pelo banco"/></label>
          <label className={labelClass}>Total de contratos no benefício (Paraná)<select value={form.benefitContractCount} onChange={e=>update('benefitContractCount',e.target.value)} className={inputClass}><option value="">Informar para calcular Paraná</option>{Array.from({length:13},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label>
          <label className="mt-5 inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={form.legalRepresentative} onChange={e => update('legalRepresentative', e.target.checked)} />Possui representante legal</label></>}
        </div></section>
        <section className="space-y-3 rounded-xl border p-4">
          {!statement && <><h3 className="font-semibold">Múltiplos contratos · até {MAX_SIMULATION_CONTRACTS}</h3>
          <p className="text-xs text-[var(--text-secondary)]">Adicione o contrato atual e preencha o próximo. Ao adicionar, os campos são limpos para o próximo contrato. Você pode comparar somente os contratos da lista; um novo contrato preenchido também será incluído, sem duplicar banco e número.</p>
          <button type="button" disabled={loading} className="rounded-lg border px-3 py-2 text-sm" onClick={event=>{
            if(!event.currentTarget.closest('form')?.reportValidity())return;
            try{const next=[...contractQueue.filter(c=>contractKey(c)!==contractKey(form)),contractDraft({...form,reviewMetadata:portabilityContext})];validateSimulationContracts(next);setContractQueue(next);setForm(current=>({...current,...EMPTY_ORIGIN_CONTRACT}));setError('');setRows([]);setSelected(null);setSelectedRows([]);setSavedRows([]);setSaveMessage('');}catch(error:any){setError(error.message);}
          }}>Adicionar contrato à lista</button></>}
          {contractQueue.map((c,index)=><div key={contractKey(c)} className="flex items-center justify-between gap-3 text-sm"><span>Contrato {index+1} · banco {c.originLenderCode} · {currency(parseCurrency(c.installmentFaceValue))}</span>{!statement && <button type="button" disabled={loading} aria-label={`Remover contrato ${index+1}`} onClick={()=>{setContractQueue(contractQueue.filter(row=>row!==c));setRows([]);setSelected(null);setSelectedRows([]);setSavedRows([]);setSaveMessage('');}}>Remover</button>}</div>)}
          <p className="text-xs text-[var(--text-secondary)]">Daycoval: unificações automáticas de até 3 contratos, sem repetições, priorizando tabelas de 1 a 9.</p>
          <p className="text-xs text-[var(--warning-text)] dark:text-[var(--warning-text)]">Alternativas que usam o mesmo contrato não podem ser somadas. Unificações são estimativas para revisão e não geram propostas.</p>
        </section>
        <p className="rounded-lg bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]">As integrações retornam propostas de simulação separadas. Os dados pessoais são usados para identificar a modalidade; confirme autorização do cliente antes de consultar os bancos.</p>
        {error && <div role="alert" className="rounded-lg bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
        {!statement && <SimulationBack onBack={()=>setStep(0)} disabled={loading} label="Voltar ao cliente"/>}<button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[var(--action)] px-4 py-2.5 text-sm font-semibold text-[var(--action-ink)] disabled:opacity-90"><Activity className="h-4 w-4" />{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" />Calculando…</> : 'Comparar ofertas'}</button>
      </fieldset></form>
      {step===2&&!statement && <SimulationBack onBack={()=>setStep(1)} disabled={loading} label="Voltar ao contrato"/>}
      {step===2 && error && <p role="alert" className="my-3 rounded-lg bg-[var(--danger-bg)] p-4 text-sm text-[var(--danger-text)]">{error}</p>}
      <div hidden={step!==2}>
      {statement && <nav aria-label="Modalidade da simulação" className={'sticky top-0 z-10 grid gap-2 rounded-xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-2 '+(statement.contracts.length>0?'grid-cols-2':'grid-cols-1')}>
        {statement.contracts.length>0 && <button type="button" aria-pressed={activeTab==='PORT'} onClick={()=>setActiveTab('PORT')}
          className={'rounded-lg px-3 py-3 text-sm font-bold '+(activeTab==='PORT'?'bg-[var(--action)] text-[var(--action-ink)]':'border border-[var(--field-border)] text-[var(--text-secondary)]')}>
          PORTABILIDADE ({visiblePortabilityCount}) {selectedRows.length>0?' · '+selectedRows.length+' selecionadas':''}
        </button>}
        <button type="button" aria-pressed={activeTab==='NEW'} onClick={()=>setActiveTab('NEW')}
          className={'rounded-lg px-3 py-3 text-sm font-bold '+(activeTab==='NEW'?'bg-[var(--action)] text-[var(--action-ink)]':'border border-[var(--field-border)] text-[var(--text-secondary)]')}>
          NOVO ({marginOffers.length}) {chosenMargin?' · 1 selecionada':''}
        </button>
      </nav>}
      {statement && (selectedRows.length>0||chosenMargin) && <section aria-label="Cotações selecionadas preservadas" className="mt-3 rounded-xl border border-[var(--success-border)] p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <strong className="mr-1">Selecionadas ({selectedRows.length+(chosenMargin?1:0)})</strong>
          {selectedRows.map((row,index)=><span key={index} className="rounded-full border border-[var(--success-border)] px-2 py-1">
            {row.provider}: {row.contractLabel||'Contrato'}{row.unified?' · unificação':''} · troco {currency(row.troco)}
          </span>)}
          {chosenMargin && <span className="rounded-full border border-[var(--success-border)] px-2 py-1">
            NOVO: {chosenMargin.institution}{chosenMargin.scenario==='PROJECTED_2027'?' · prévia 2027':''}
          </span>}
        </div>
      </section>}
      {loading && <p role="status" className="my-4 rounded-xl bg-[var(--info-bg)] p-4 text-sm">{progress||'Consultando as condições disponíveis…'}</p>}

      {(!statement||activeTab==='PORT')&&happyEnabled && portabilityEligibility('happy', form.originLenderCode, paidFromTerms(form.originalTerm, form.openedInstallmentNumber)).blocked && <p role="status" className="mt-3 text-sm text-[var(--warning-text)]">{portabilityEligibility('happy', form.originLenderCode, paidFromTerms(form.originalTerm, form.openedInstallmentNumber)).reason}</p>}
      {(!statement||activeTab==='PORT')&&happyEnabled && !portabilityEligibility('happy', form.originLenderCode, paidFromTerms(form.originalTerm, form.openedInstallmentNumber)).blocked && <details className="mt-5 rounded-xl border border-[var(--field-border)] p-3 dark:border-[var(--field-border)]"><summary className="cursor-pointer font-bold">Happy INSS · autorização e simulação</summary><HappyInssSimulationModal embedded initialOperation="PORTABILIDADE_REFIN" isOpen key={`happy-${form.cpf}-${form.benefitNumber}`} initialData={{ cpf: form.cpf, birthDate: form.birthDate, benefit: form.benefitNumber, partnerId }} partners={partners} onClose={() => {}} onSuccess={simulation => onSuccess?.(simulation)} /></details>}
      {statement && activeTab==='PORT' && !loading && <details open={new Set(rows.filter(row=>row.success&&!row.skipped&&Number(row.troco)>0).map(row=>row.provider)).size<=1} className="mt-3 rounded-lg border border-[var(--field-border)] p-3 text-xs">
        <summary className="cursor-pointer font-semibold">Bancos e situação das cotações ({new Set(rows.filter(row=>row.success&&!row.skipped&&Number(row.troco)>0).map(row=>row.provider)).size} com ofertas)</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {['DAYCOVAL','C6','PARANA','FINANTO','FACTA','Nossa Fintech','HAPPY','BMG'].map(bank=><span key={bank} className="rounded-md border border-[var(--field-border)] px-2 py-1">
            {bank==='PARANA'?'Paraná Banco':bank} · {rows.some(row=>row.provider===bank&&row.success&&!row.skipped&&Number(row.troco)>0)?'com condição':'sem oferta calculada'}
          </span>)}
        </div>
      </details>}
      {statement && activeTab==='NEW' && <section className="mt-4 space-y-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 sm:p-4" aria-label="Simulação NOVO pela margem atual">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-sm font-bold">NOVO · Simulações por banco</h3>
            <p className="text-xs text-[var(--text-secondary)]">Condições da margem atual e prévia do aumento, com origem identificada.</p></div>
          <span className="text-xs text-[var(--text-secondary)]">{marginState==='loading'?'Consultando bancos…':marginOffers.length+' condições · '+marginBest.length+' bancos'}</span>
        </div>
        <div role="group" aria-label="Cenário do empréstimo NOVO" className="grid gap-2 sm:grid-cols-2">
          <button type="button" aria-pressed={novoScenario==='CURRENT'} onClick={()=>setNovoScenario('CURRENT')}
            className={'rounded-lg border px-3 py-2.5 text-left text-xs font-semibold '+(novoScenario==='CURRENT'?'border-[var(--action)] bg-[var(--bg-surface-elevated)]':'border-[var(--field-border)]')}>
            Margem disponível · {currency(parseCurrency(statement.loanMargin))}
          </button>
          <button type="button" aria-pressed={novoScenario==='PROJECTED'} disabled={!forecast} onClick={()=>setNovoScenario('PROJECTED')}
            className={'rounded-lg border px-3 py-2.5 text-left text-xs font-semibold disabled:opacity-50 '+(novoScenario==='PROJECTED'?'border-[var(--action)] bg-[var(--bg-surface-elevated)]':'border-[var(--field-border)]')}>
            Aumento projetado · +R$ 42,00 (2027)
          </button>
        </div>
        {marginState==='loading' && <p role="status" className="text-xs">Consultando os bancos em prazos compatíveis com a idade…</p>}
        {novoScenario==='CURRENT' && marginState==='ready' && marginOffers.length===0 && <p className="text-xs text-[var(--text-secondary)]">Nenhuma oferta válida nos prazos consultados. Veja o status dos bancos e os critérios de idade e prazo.</p>}
        {novoScenario==='CURRENT' && marginBest.length>0 && <div className="grid gap-2 sm:grid-cols-2">{marginBest.map(quote=>
          <div key={quote.index} className={'rounded-lg border p-3 text-xs '+(selectedMargin===quote.index?'border-[var(--action)] bg-[var(--bg-surface-elevated)]':'border-[var(--border-default)]')}>
            <div className="flex items-center justify-between gap-2"><strong>{quote.institution}</strong><span className="text-[var(--text-secondary)]">{quote.source==='API'?'API':'Planilha'}</span></div>
            <p className="mt-1 truncate text-[var(--text-secondary)]" title={quote.table}>{quote.table}</p>
            <p className="mt-2 text-[var(--text-secondary)]">Estimativa de valor a liberar</p>
            <strong className="text-lg text-[var(--success-text)]">{currency(quote.amount)}</strong>
            <p className="mt-1 text-[var(--text-secondary)]">Parcela {currency(quote.installment)} · {quote.term||108} meses · {formatMonthlyRate(quote.rate)}</p>
            <button type="button" aria-pressed={selectedMargin===quote.index} disabled={marginState==='loading'} className="mt-2 rounded-lg border border-[var(--field-border)] px-3 py-1.5 font-semibold"
              onClick={()=>{setSelectedProjected(null);setSelectedMargin(old=>old===quote.index?null:quote.index);setShareStatus('');}}>
              {selectedMargin===quote.index?'✓ NOVO selecionado':'Selecionar NOVO'}
            </button>
          </div>)}</div>}
        {novoScenario==='CURRENT' && marginOther.length>0 && <details className="rounded-lg border border-[var(--border-default)] p-3 text-xs">
          <summary className="cursor-pointer font-semibold">Outras {marginOther.length} condições de NOVO</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{marginOther.map(quote=>
            <button type="button" key={quote.index} disabled={marginState==='loading'} aria-pressed={selectedMargin===quote.index}
              onClick={()=>{setSelectedProjected(null);setSelectedMargin(old=>old===quote.index?null:quote.index);setShareStatus('');}}
              className={'rounded-lg border p-3 text-left '+(selectedMargin===quote.index?'border-[var(--action)]':'border-[var(--border-default)]')}>
              <strong>{quote.institution} · {currency(quote.amount)}</strong>
              <span className="mt-1 block text-[var(--text-secondary)]">{quote.table} · {quote.term||108} meses · {formatMonthlyRate(quote.rate)} · {selectedMargin===quote.index?'Selecionada':'Selecionar'}</span>
            </button>)}</div>
        </details>}
        {marginState==='ready' && <details open={marginOffers.length===0 || !marginOffers.some(quote=>quote.provider.toUpperCase().includes('FINANTO'))} className="rounded-lg border border-[var(--field-border)] p-3 text-xs">
          <summary className="cursor-pointer font-semibold">Status das integrações de NOVO · {inssNovoConsultationTerms(statement.customer.birthDate).join(', ')} meses consultados</summary>
          <div className="mt-2 flex flex-wrap gap-2">{['C6','FACTA','Nossa Fintech','FINANTO','HAPPY','BMG'].map(bank=>{
            const found=marginOffers.some(quote=>quote.provider.toUpperCase().includes(bank.toUpperCase()));
            return <span key={bank} className="rounded-md border border-[var(--field-border)] px-2 py-1">
              {bank}: {found?'cotação retornada':'sem oferta ou integração indisponível'}
            </span>;
          })}</div>
          {marginNote && <p className="mt-3 text-[var(--warning-text)]">{marginNote}</p>}
        </details>}
        {forecast && novoScenario==='PROJECTED' && <section className="space-y-3" aria-label="Prévia bancária de aumento de margem 2027">
          <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)]">
            <strong>Cenário futuro: parcela adicional hipotética de R$ 42,00 em 2027</strong>
            <p className="mt-1">As APIs habilitadas recebem a parcela de R$ 42,00 identificada como CENÁRIO FUTURO para cálculo, nunca como margem já liberada. Resultados das APIs são simulações hipotéticas; os demais usam taxas vigentes e fórmula Price. Nenhum representa aprovação, contratação ou disponibilidade em 2027.</p>
          </div>
          {projectedState==='loading' && <p role="status" className="text-xs">Consultando bancos para simular a parcela futura de R$ 42,00…</p>}
          {projectedState==='ready' && projectedRows.length>0 ? <>
            <p className="text-xs text-[var(--text-secondary)]">{projectedApiOffers.length} cenários retornados pelas APIs · {projectedRows.filter(q=>q.calculation==='RATE_REFERENCE').length} estimativas por taxas atuais. Selecione para compartilhar como prévia.</p>
            <div className="grid gap-2 sm:grid-cols-2">{projectedBest.map(quote=><article key={quote.index}
              className={'rounded-lg border p-3 text-xs '+(selectedProjected===quote.index?'border-[var(--action)] bg-[var(--bg-surface-elevated)]':'border-[var(--field-border)]')}>
              <div className="flex items-center justify-between gap-2"><strong>{quote.institution}</strong><span className="text-[var(--warning-text)]">{quote.calculation==='API_SCENARIO'?'API · cenário 2027':'Price · taxa atual'}</span></div>
              <p className="mt-1 truncate text-[var(--text-secondary)]" title={quote.table}>{quote.table}</p>
              <p className="mt-2 text-[var(--text-secondary)]">{quote.calculation==='API_SCENARIO'?'Valor calculado pela API no cenário de R$ 42,00':'Bruto teórico pela taxa vigente · parcela R$ 42,00'}</p>
              <strong className="block text-lg">{currency(quote.projectedGross)}</strong>
              <p className="mt-1 text-[var(--text-secondary)]">{quote.term} meses · {formatMonthlyRate(quote.rate)}</p>
              <button type="button" aria-pressed={selectedProjected===quote.index}
                onClick={()=>{setSelectedMargin(null);setSelectedProjected(old=>old===quote.index?null:quote.index);setShareStatus('');}}
                className="mt-2 rounded-lg border border-[var(--field-border)] px-3 py-1.5 font-semibold">
                {selectedProjected===quote.index?'✓ Prévia selecionada':'Selecionar prévia'}
              </button>
            </article>)}</div>
            {projectedRows.length>projectedBest.length && <details className="rounded-lg border border-[var(--field-border)] p-3">
              <summary className="cursor-pointer text-xs font-semibold">Outras {projectedRows.length-projectedBest.length} condições de taxas bancárias</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{projectedRows.map((quote,index)=>({...quote,index}))
                .filter(quote=>!projectedBest.some(best=>best.index===quote.index))
                .map(quote=><button key={quote.index} type="button" aria-pressed={selectedProjected===quote.index}
                  onClick={()=>{setSelectedMargin(null);setSelectedProjected(old=>old===quote.index?null:quote.index);setShareStatus('');}}
                  className={'rounded-lg border p-3 text-left text-xs '+(selectedProjected===quote.index?'border-[var(--action)]':'border-[var(--field-border)]')}>
                  <strong>{quote.institution}: {currency(quote.projectedGross)}</strong>
                  <span className="mt-1 block text-[var(--text-secondary)]">{quote.table} · {formatMonthlyRate(quote.rate)} · {quote.term} meses</span>
                </button>)}</div>
            </details>}
          </> : projectedState==='ready' ? <p className="text-xs text-[var(--text-secondary)]">Nenhum banco retornou cálculo ou taxa válida para a prévia. Nenhuma oferta foi inventada.</p> : null}
          {projectedState==='ready' && projectedNote && <details className="rounded-lg border border-[var(--warning-border)] p-3 text-xs">
            <summary className="cursor-pointer">Pendências das APIs para o aumento de 2027</summary>
            <p className="mt-2 text-[var(--warning-text)]">{projectedNote}</p>
          </details>}
          <details className="rounded-lg border border-[var(--field-border)] p-3 text-xs">
            <summary className="cursor-pointer font-semibold">Instituições sem taxa para a prévia</summary>
            <p className="mt-2 text-[var(--text-secondary)]">{['C6','FACTA','FINANTO','Nossa Fintech','HAPPY','BMG']
              .filter(bank=>!projectedRows.some(quote=>quote.provider.toUpperCase().includes(bank.toUpperCase())))
              .join(' · ')||'Nenhuma entre as integrações NOVO conhecidas.'}</p>
          </details>
        </section>}
      </section>}
      {(!statement||activeTab==='PORT')&&rows.some(row=>row.provider==='DAYCOVAL'&&row.success&&row.term!==Number(form.numberOfInstallments))&&<p role="status" className="mt-4 text-sm text-[var(--link)]">Daycoval: condição calculada em {rows.find(row=>row.provider==='DAYCOVAL'&&row.success)?.term} meses. Prazo solicitado: {form.numberOfInstallments} meses.</p>}
      {(!statement||activeTab==='PORT')&&providerNotes.length > 0 && <details open={Boolean(statement)&&new Set(rows.filter(row=>row.success&&!row.skipped&&Number(row.troco)>0).map(row=>row.provider)).size<=1} className="mt-4 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)]"><summary className="cursor-pointer font-semibold">Pendências e orientações por banco ({new Set(providerNotes).size})</summary><div className="mt-3 space-y-2">{[...new Set(providerNotes)].map(note => <p key={note}>{note}</p>)}</div></details>}
      {/* Mantém montado o comparador para preservar aba de unificações, filtros,
          página e seleções quando o operador alterna para NOVO. */}
      {rows.some(row => !row.skipped) && <div className={statement&&activeTab==='NEW'?'hidden':''}>
        <PortabilityResults rows={rows} selected={selected} selectedRows={selectedRows} savedRows={savedRows}
          conditionFor={conditionFor} onSelect={toggleQuote} showOwnShare={!statement}/>
      </div>}
      {statement && messageForWhatsApp && <section className="mt-4 space-y-2 rounded-xl border border-[var(--success-border)] p-4" aria-label="Copiar seleções para WhatsApp">
        <h3 className="font-semibold">Compartilhar condições selecionadas</h3>
        <p className="text-xs text-[var(--text-secondary)]">{selectedRows.length} portabilidade(s) e {chosenMargin?1:0} NOVO selecionado. Apenas as condições escolhidas entram no resumo.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>void copyToWhatsApp()} className="rounded-lg bg-[var(--action)] px-4 py-2 text-xs font-semibold text-[var(--action-ink)]">Copiar para WhatsApp</button>
          <button type="button" onClick={()=>window.open('https://wa.me/?text='+encodeURIComponent(messageForWhatsApp),'_blank','noopener,noreferrer')} className="rounded-lg border border-[var(--field-border)] px-4 py-2 text-xs font-semibold">Abrir WhatsApp</button>
        </div>
        <details className="text-xs"><summary className="cursor-pointer font-semibold">Conferir texto da mensagem</summary>
          <textarea readOnly value={messageForWhatsApp} rows={9} aria-label="Mensagem para WhatsApp" className="mt-2 w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-canvas)] p-3 text-xs"/>
        </details>
        {shareStatus && <p role="status" className="text-xs text-[var(--success-text)]">{shareStatus}</p>}
      </section>}
      {(selectedRows.length > 0 || savedRows.length > 0 || saveMessage) && <details open={!statement} className="mt-4 rounded-xl border border-[var(--border-default)] p-3">
        <summary className={statement?'cursor-pointer text-xs font-semibold':'hidden'}>Salvar cotações no sistema (opcional)</summary>
        <section className="mt-2 space-y-3" aria-label="Salvar cotações selecionadas">
        <h3 className="font-semibold">Cotações dos contratos</h3>
        <p className="text-sm text-[var(--text-secondary)]">Selecione uma condição por contrato. É possível salvar contratos distintos do mesmo cliente e parceiro de uma só vez.</p>
        <p className="text-sm font-semibold">{selectedRows.length} {selectedRows.length === 1 ? 'cotação selecionada' : 'cotações selecionadas'}{savedRows.length ? ' · ' + savedRows.length + ' salva(s) nesta comparação' : ''}</p>
        {selectedRows.some(row=>conditionFor(row).reviewRequired) && <p className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)]">Cotações de planilha são estimativas para conferência. Não há liberação automática para contratação ou digitação bancária.</p>}
        <label className={labelClass}>Parceiro responsável<select className={inputClass} value={partnerId} onChange={event=>setPartnerId(event.target.value)}><option value="">Selecione</option>{partners.filter(partner=>partner.active).map(partner=><option key={partner.id} value={partner.id}>{partner.name || partner.fullName}</option>)}</select></label>
        {selectedRows.length > 0 && <div className="flex flex-wrap gap-3">
          <button type="button" disabled={loading} onClick={()=>void save()} className="rounded-lg bg-[var(--action)] px-4 py-2.5 text-sm font-semibold text-[var(--action-ink)] disabled:opacity-60">{loading ? 'Salvando...' : 'Salvar ' + selectedRows.length + (selectedRows.length === 1 ? ' cotação' : ' cotações') + ' para conferência'}</button>
          {onContinue && selectedRows.length === 1 && selected && !conditionFor(selected).reviewRequired && <button type="button" disabled={loading} onClick={()=>{if(!partnerId){setError('Selecione o parceiro responsável.');return;}onContinue({condition:conditionFor(selected),values:draftValues(),calculation:selected.provider==='FINANTO'?selected.data:undefined});}} className="rounded-lg border border-[var(--field-border)] px-4 py-2 text-sm">Seguir para digitação</button>}
        </div>}
        {saveMessage && <p role="status" className="text-sm text-[var(--success-text)]">{saveMessage}</p>}
        </section>
      </details>}
      {(!statement||activeTab==='PORT')&&rows.some(row => row.skipped) && <details className="mt-4 rounded-xl border border-[var(--warning-border)] p-4 text-sm dark:border-[var(--warning-border)]"><summary className="cursor-pointer font-semibold">Tabelas sem oferta ou com validação pendente ({rows.filter(row => row.skipped).length})</summary><div className="mt-3 space-y-2">{rows.filter(row => row.skipped).map((row, index) => <div key={`${row.contractLabel}-${row.provider}-${row.table?.cod_tabela || index}-${row.table?.amount || index}`}><strong>{row.contractLabel} · {row.provider} · {row.table?.name || row.table?.cod_tabela}</strong><EligibilityResult input={{bank:row.provider,product:'INSS',operation:'PORT_REFIN',table:row.table?.name,message:row.error}}/></div>)}</div></details>}
      {(!statement||(activeTab==='PORT'&&statement.contracts.length>0))&&<BankPlaybooksPanel input={{ ...portabilityReviewMetadata(portabilityContext),originBank: form.originLenderCode, paidInstallments: paidFromTerms(form.originalTerm, form.openedInstallmentNumber), birthDate: form.birthDate, species: String(form.benefitType), operation: 'PORT_REFIN', term: Number(form.numberOfInstallments), debt: parseCurrency(form.lastDueBalance), originalInstallment: parseCurrency(form.installmentFaceValue), remainingInstallments: form.openedInstallmentNumber.trim()?Number(form.openedInstallmentNumber):undefined }} />}
      </div>
      </div>
    </div>
  </div>;
};
