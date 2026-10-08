import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { Partner, SimulationRequest } from '../../types';
import { formatCpf, isValidCpf, normalizeCpf } from '../../lib/utils';

type ApiItem = Record<string, any>;
type FileUpload = { name: string; type: string; content: string };
type InssQuote = { rule: ApiItem; calculation?: ApiItem; error?: string; originContract?: ApiItem; originContracts?: ApiItem[] };

interface Props {
  isOpen: boolean;
  operationCode: '1' | '2' | '3' | '4';
  onClose: () => void;
  partners: Partner[];
  onSuccess: (simulation: SimulationRequest) => void;
}

const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-300';
const readItems = (data: any): ApiItem[] => Array.isArray(data?.items) ? data.items : Array.isArray(data?.data?.items) ? data.data.items : [];
const readMessages = (data: any): string => Array.isArray(data?.messages) ? data.messages.map((item: any) => item?.text).filter(Boolean).join(' ') : '';

const readFile = (file: File): Promise<FileUpload> => new Promise((resolve, reject) => {
  if (file.size > 5 * 1024 * 1024) return reject(new Error(`${file.name}: o arquivo deve ter até 5 MB.`));
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) return reject(new Error(`${file.name}: use JPG, PNG ou PDF.`));
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
  reader.onload = () => {
    const content = String(reader.result || '').split(',')[1];
    if (!content) return reject(new Error(`Não foi possível processar ${file.name}.`));
    resolve({ name: file.name, type: file.type, content });
  };
  reader.readAsDataURL(file);
});

const OPERATION_LABELS: Record<Props['operationCode'], string> = {
  '1': 'INSS Novo', '2': 'INSS Portabilidade', '3': 'INSS Refinanciamento', '4': 'INSS Portabilidade + Refinanciamento',
};

export const FinantoInssSimulationModal: React.FC<Props> = ({ isOpen, operationCode, onClose, partners, onSuccess }) => {
  const [rules, setRules] = useState<ApiItem[]>([]);
  const [ruleId, setRuleId] = useState('');
  const [loadingRules, setLoadingRules] = useState(false);
  const [calculation, setCalculation] = useState<any>(null);
  const [quotes, setQuotes] = useState<InssQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<SimulationRequest | null>(null);
  const [authTerm, setAuthTerm] = useState<any>(null);
  const [loadingTerm, setLoadingTerm] = useState(false);

  const [partnerId, setPartnerId] = useState('');
  const [cpf, setCpf] = useState('');
  const [name, setName] = useState('');
  const [benefit, setBenefit] = useState('');
  const [benefitState, setBenefitState] = useState('SP');
  const [benefitStartDate, setBenefitStartDate] = useState('');
  const [benefitType, setBenefitType] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [income, setIncome] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SP');
  const [zipCode, setZipCode] = useState('');
  const [documentType, setDocumentType] = useState('RG');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuingDate, setIssuingDate] = useState('');
  const [issuingEntity, setIssuingEntity] = useState('SSP');
  const [issuingState, setIssuingState] = useState('SP');
  const [bank, setBank] = useState('');
  const [branch, setBranch] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountDigit, setAccountDigit] = useState('');
  const [loanValue, setLoanValue] = useState('');
  const [installmentValue, setInstallmentValue] = useState('');
  const [rate, setRate] = useState('');
  const [term, setTerm] = useState('84');
  const [hasInsurance, setHasInsurance] = useState(false);
  const [originLenderCode, setOriginLenderCode] = useState('');
  const [originContractNumber, setOriginContractNumber] = useState('');
  const [originTerm, setOriginTerm] = useState('');
  const [originInstallmentsRemaining, setOriginInstallmentsRemaining] = useState('');
  const [originInstallmentValue, setOriginInstallmentValue] = useState('');
  const [originDueBalanceValue, setOriginDueBalanceValue] = useState('');
  const [refinanceableContracts, setRefinanceableContracts] = useState<ApiItem[]>([]);
  const [selectedOriginContractKey, setSelectedOriginContractKey] = useState('');
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [refinanceTerm, setRefinanceTerm] = useState('84');
  const [refinanceRate, setRefinanceRate] = useState('');
  const [refinanceInstallmentValue, setRefinanceInstallmentValue] = useState('0');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);

  const availablePartners = useMemo(() => partners.filter(partner => partner.active), [partners]);
  const selectedRule = useMemo(() => rules.find(rule => rule.id === ruleId), [rules, ruleId]);

  const loadRules = async () => {
    setLoadingRules(true); setRules([]); setRuleId(''); setCalculation(null); setQuotes([]); setError('');
    try {
      const productsResponse = await fetch('/api/integrations/finanto/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'POST', endpoint: '/v3/loan-products/search/basic', body: { type: { code: { eq: 20 } }, operation: { code: { eq: Number(operationCode) } } } }),
      });
      const productsData = await productsResponse.json();
      if (!productsResponse.ok || readMessages(productsData)) throw new Error(productsData.error || readMessages(productsData) || 'Não foi possível consultar produtos INSS na FINANTO.');
      const inssProducts = readItems(productsData).filter(product => Number(product.type?.code ?? product.typeCode) === 20);
      const inssProductIds = new Set(inssProducts.map(product => String(product.id)));
      if (!inssProductIds.size) throw new Error('A FINANTO não retornou produtos INSS para esta operação.');
      const allRules: ApiItem[] = [];
      for (let offset = 0; offset < 2000; offset += 20) {
        const response = await fetch('/api/integrations/finanto/request', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'POST', endpoint: '/v3/loan-product-rules/search/basic', body: { offset, limit: 20, operation: { code: { eq: Number(operationCode) } } } }),
        });
        const data = await response.json();
        if (!response.ok || readMessages(data)) throw new Error(data.error || readMessages(data) || 'Não foi possível consultar as tabelas FINANTO.');
        const page = readItems(data);
        allRules.push(...page.filter(rule => inssProductIds.has(String(rule.product?.id))));
        if (page.length < 20) break;
      }
      setRules(allRules);
      setRuleId(allRules[0]?.id ? String(allRules[0].id) : '');
      if (!allRules.length) setError('Não há tabelas INSS disponíveis para esta modalidade.');
    } catch (err: any) { setError(err.message || 'Falha ao carregar tabelas.'); }
    finally { setLoadingRules(false); }
  };

  const findRefinanceableContracts = async () => {
    setError(''); setRefinanceableContracts([]); setSelectedOriginContractKey('');
    if (!isValidCpf(normalizeCpf(cpf)) || !benefit.trim() || !ruleId) return setError('Para buscar contratos elegíveis, informe CPF, número do benefício e selecione uma tabela INSS.');
    setLoadingContracts(true);
    try {
      const response = await fetch('/api/integrations/finanto/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'POST', endpoint: '/v3/loan-inss-simulations/refinanceable-contracts', body: { identity: normalizeCpf(cpf), benefit: benefit.replace(/\D/g, ''), ruleId } }) });
      const data = await response.json();
      if (!response.ok || readMessages(data)) throw new Error(data.error || readMessages(data) || 'Falha ao consultar contratos elegíveis.');
      const contracts = readItems(data);
      setRefinanceableContracts(contracts);
      if (contracts[0]?.key) setSelectedOriginContractKey(String(contracts[0].key));
      if (!contracts.length) setError('A FINANTO não retornou contratos elegíveis para esse benefício e tabela.');
    } catch (err: any) { setError(err.message || 'Falha ao consultar contratos elegíveis.'); }
    finally { setLoadingContracts(false); }
  };

  useEffect(() => { if (isOpen) void loadRules(); }, [isOpen, operationCode]);
  if (!isOpen) return null;

  const parseAmount = (value: string) => Number(value.replace(',', '.'));
  const handleCalculate = async () => {
    setError(''); setCalculation(null); setQuotes([]);
    if (!rules.length) return setError('Não há tabelas INSS disponíveis para comparar.');
    const originContract = operationCode === '2' || operationCode === '4' ? {
      lenderCode: Number(originLenderCode), contractNumber: originContractNumber.trim(), term: Number(originTerm),
      installmentsRemaining: Number(originInstallmentsRemaining), installmentValue: parseAmount(originInstallmentValue), dueBalanceValue: parseAmount(originDueBalanceValue),
    } : undefined;
    const refinancing = operationCode === '4' ? { term: Number(refinanceTerm), rate: parseAmount(refinanceRate), installmentValue: parseAmount(refinanceInstallmentValue) } : undefined;
    if (originContract && (!Number.isInteger(originContract.lenderCode) || !originContract.contractNumber || !Number.isInteger(originContract.term) || !Number.isInteger(originContract.installmentsRemaining) || originContract.installmentValue <= 0 || originContract.dueBalanceValue <= 0)) return setError('Preencha o banco de origem, contrato, prazo original, parcelas restantes, valor da parcela e saldo devedor.');
    if (refinancing && (!Number.isInteger(refinancing.term) || refinancing.rate <= 0 || refinancing.installmentValue < 0)) return setError('Informe prazo e taxa válidos para o refinanciamento adicional.');
    const enteredLoan = parseAmount(loanValue);
    const enteredInstallment = parseAmount(installmentValue);
    if (!(Number.isFinite(enteredLoan) && (operationCode === '3' ? enteredLoan >= 0 : enteredLoan > 0)) || !(Number.isFinite(enteredInstallment) && (operationCode === '3' ? enteredInstallment >= 0 : enteredInstallment > 0))) return setError(operationCode === '3' ? 'Informe valores válidos para refinanciamento; use 0 na parcela para cálculo automático.' : 'Informe valores válidos para crédito e parcela.');
    setLoading(true);
    try {
      const results: InssQuote[] = new Array(rules.length);
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < rules.length) {
          const index = nextIndex++;
          const rule = rules[index];
          try {
            const defaultItem = rule.items?.find((item: any) => item.default) || rule.items?.[0] || {};
            let originContracts: ApiItem[] | undefined;
            if (operationCode === '3') {
              if (!isValidCpf(normalizeCpf(cpf)) || !benefit.trim()) throw new Error('Informe CPF e benefício para buscar contratos de refinanciamento.');
              const eligibleResponse = await fetch('/api/integrations/finanto/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'POST', endpoint: '/v3/loan-inss-simulations/refinanceable-contracts', body: { identity: normalizeCpf(cpf), benefit: benefit.replace(/\D/g, ''), ruleId: rule.id } }) });
              const eligibleData = await eligibleResponse.json();
              if (!eligibleResponse.ok || readMessages(eligibleData)) throw new Error(eligibleData.error || readMessages(eligibleData) || 'Falha ao consultar contratos elegíveis.');
              const eligible = readItems(eligibleData);
              if (!eligible.length) throw new Error('Sem contrato elegível');
              const selected = rule.id === ruleId ? eligible.find((item: any) => String(item.key) === selectedOriginContractKey) || eligible[0] : eligible[0];
              originContracts = [{ lenderCode: selected.lenderCode, contractNumber: selected.contractNumber, dueBalanceValue: Number(selected.dueBalanceValue), installmentValue: Number(selected.installmentValue), installmentsRemaining: Number(selected.installmentsRemaining) }];
              results[index] = { rule, originContracts, originContract: selected };
            }
            const quoteRate = Number(defaultItem.rate || rate);
            const quoteTerm = Number(defaultItem.term || defaultItem.maxTerm || term);
            if (!(quoteRate > 0 && Number.isInteger(quoteTerm) && quoteTerm > 0)) throw new Error('A tabela não possui taxa ou prazo padrão.');
            const payload = {
              ruleId: rule.id, hasInsurance,
              installmentValue: operationCode === '3' ? (parseAmount(installmentValue) || 0) : parseAmount(installmentValue),
              ...(operationCode !== '3' ? { loanValue: parseAmount(loanValue) } : {}), rate: quoteRate, term: quoteTerm,
              referenceCode: rule.referenceCode || null,
              ...(originContract ? { originContract } : {}),
              ...(originContracts ? { originContracts } : {}),
              ...(refinancing ? { refinancing } : {}),
            };
            const response = await fetch('/api/integrations/finanto/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'POST', endpoint: '/v3/loan-inss-simulations/calculation', body: payload }) });
            const data = await response.json();
            if (!response.ok || readMessages(data)) throw new Error(data.error || readMessages(data) || 'A FINANTO não calculou esta tabela.');
            results[index] = { ...(results[index] || { rule }), rule, calculation: data, ...(originContracts ? { originContracts } : {}) };
          } catch (err: any) {
            results[index] = { ...(results[index] || {}), rule, error: err.message || 'Falha no cálculo.' };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, rules.length) }, () => worker()));
      setQuotes(results);
      const successful = results.filter(result => result.calculation);
      if (!successful.length) setError('A FINANTO não calculou condições nas tabelas encontradas. Confira os dados do contrato e tente novamente.');
    } catch (err: any) { setError(err.message || 'Falha no cálculo.'); }
    finally { setLoading(false); }
  };

  const selectQuote = (quote: InssQuote) => {
    if (!quote.calculation) return;
    setRuleId(String(quote.rule.id)); setCalculation(quote.calculation);
    if (quote.calculation.loanValue != null) setLoanValue(String(quote.calculation.loanValue));
    if (quote.calculation.installmentValue != null) setInstallmentValue(String(quote.calculation.installmentValue));
    if (quote.calculation.rate != null) setRate(String(quote.calculation.rate));
    if (quote.calculation.term != null) setTerm(String(quote.calculation.term));
    if (quote.originContract) {
      setRefinanceableContracts([quote.originContract]); setSelectedOriginContractKey(String(quote.originContract.key || ''));
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const cleanCpf = normalizeCpf(cpf);
    if (!calculation) return setError('Calcule e confira a condição antes de enviar a simulação.');
    const selectedQuote = quotes.find(quote => String(quote.rule.id) === String(ruleId));
    const selectedOriginForRefin = selectedQuote?.originContract;
    if (operationCode === '3' && !selectedOriginForRefin?.key) return setError('Selecione uma oferta de refinanciamento válida antes de criar a simulação.');
    if (operationCode === '3' && !(Number(calculation.loanValue) > 0 || parseAmount(loanValue) > 0)) return setError('A FINANTO não informou o valor refinanciado. Informe o valor pretendido antes de criar a simulação.');
    if (!isValidCpf(cleanCpf)) return setError('Informe um CPF válido.');
    if (!partnerId) return setError('Selecione o parceiro responsável.');
    if (!front || !back) return setError('Anexe frente e verso do documento do cliente.');
    setLoading(true);
    try {
      const [frontFile, backFile] = await Promise.all([readFile(front), readFile(back)]);
      const response = await fetch('/api/integrations/finanto/inss/simulations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId, operationCode, ruleId, hasInsurance, loanValue: Number(calculation.loanValue ?? parseAmount(loanValue)), installmentValue: Number(calculation.installmentValue ?? parseAmount(installmentValue)), rate: Number(calculation.rate ?? parseAmount(rate)), term: Number(calculation.term ?? term), ...(operationCode === '2' || operationCode === '4' ? { originContract: { lenderCode: Number(originLenderCode), contractNumber: originContractNumber.trim(), term: Number(originTerm), installmentsRemaining: Number(originInstallmentsRemaining), installmentValue: parseAmount(originInstallmentValue), dueBalanceValue: parseAmount(originDueBalanceValue) } } : {}), ...(operationCode === '3' && selectedOriginForRefin ? { originContracts: [selectedOriginForRefin] } : {}), ...(operationCode === '4' ? { refinancing: { term: Number(refinanceTerm), rate: parseAmount(refinanceRate), installmentValue: parseAmount(refinanceInstallmentValue) } } : {}),
          borrower: { name: name.trim(), identity: cleanCpf, benefit: benefit.replace(/\D/g, ''), benefitState: benefitState.toUpperCase(), benefitStartDate, benefitType: Number(benefitType), birthDate, income: parseAmount(income), phone: phone.replace(/\D/g, ''), email: email.trim(), address: { street: street.trim(), number: number.trim(), complement: complement.trim() || null, district: district.trim(), city: city.trim(), state: state.toUpperCase(), zipCode: zipCode.replace(/\D/g, '') }, document: { type: { code: documentType, name: documentType === 'RG' ? 'Registro Geral' : documentType }, number: documentNumber.trim(), issuingDate, issuingEntity: issuingEntity.trim(), issuingState: issuingState.toUpperCase() } },
          creditBankAccount: { bank: bank.trim(), branch: branch.trim(), number: accountNumber.trim(), digit: accountDigit.trim() }, files: { front: frontFile, back: backFile } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || readMessages(data) || 'Não foi possível criar a simulação FINANTO.');
      setCreated(data.simulation); onSuccess(data.simulation);
    } catch (err: any) { setError(err.message || 'Falha ao enviar a simulação.'); }
    finally { setLoading(false); }
  };

  const getAuthTerm = async () => {
    if (!created?.finantoSimulationId) return;
    setLoadingTerm(true); setError('');
    try {
      const response = await fetch(`/api/integrations/finanto/inss/simulations/${encodeURIComponent(created.id)}/auth-term`, { method: 'POST', credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível obter o termo de autorização.');
      setAuthTerm(data.term);
    } catch (err: any) { setError(err.message || 'Falha ao consultar termo.'); }
    finally { setLoadingTerm(false); }
  };

  const field = (title: string, value: string, change: (value: string) => void, type = 'text', required = true, maxLength?: number, step?: string) => <label className={labelClass}>{title}<input className={inputClass} type={type} required={required} value={value} maxLength={maxLength} step={type === 'number' ? step || 'any' : undefined} onChange={e => change(e.target.value)} /></label>;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
    <section className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">FINANTO · {OPERATION_LABELS[operationCode]}</h2><p className="mt-1 text-xs text-slate-500">Condição, dados do cliente e documentos enviados diretamente à FINANTO.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X className="h-5 w-5" /></button></header>
      <div className="overflow-y-auto p-5">
        {created ? <div className="space-y-4"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 className="mr-2 inline h-5 w-5" />Simulação criada no FINANTO e registrada na Central do Sentinel.<div className="mt-2 font-mono text-xs">Referência FINANTO: {created.finantoSimulationId}</div></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><ShieldCheck className="mr-2 inline h-5 w-5" />Próxima etapa: apresentar o termo ao cliente e obter autorização expressa. A assinatura não é realizada automaticamente pelo sistema.</div>
          {!authTerm && <button type="button" onClick={getAuthTerm} disabled={loadingTerm} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{loadingTerm ? 'Consultando termo...' : 'Consultar termo de autorização'}</button>}
          {authTerm && <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-200">{JSON.stringify(authTerm, null, 2)}</pre>}
          <button type="button" onClick={onClose} className="ml-2 rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Concluir</button></div> : <form onSubmit={handleCreate} className="space-y-6">
          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">1. Produto e condição</h3><div className="grid gap-3 md:grid-cols-2"><label className={labelClass}>Tabela para conferência<select className={inputClass} value={ruleId} onChange={e => { setRuleId(e.target.value); setCalculation(null); const rule = rules.find(item => item.id === e.target.value); const item = rule?.items?.find((value: any) => value.default) || rule?.items?.[0]; if (item) { setTerm(String(item.term || item.maxTerm || '84')); setRate(String(item.rate || '')); } }}><option value="">{loadingRules ? 'Carregando tabelas INSS...' : 'Selecione depois de comparar'}</option>{rules.map(rule => <option key={rule.id} value={rule.id}>{rule.name || rule.code} · {rule.product?.name || rule.operation?.name || 'FINANTO'}</option>)}</select></label><div className="self-end text-xs text-slate-500">A comparação consulta todas as tabelas INSS retornadas para esta modalidade.</div></div>
          {(operationCode === '2' || operationCode === '4') && <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h4 className="mb-3 text-sm font-bold">Dados do contrato atual para portabilidade</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field('Código do banco de origem', originLenderCode, setOriginLenderCode, 'number')}{field('Número do contrato', originContractNumber, setOriginContractNumber)}{field('Prazo original (meses)', originTerm, setOriginTerm, 'number')}{field('Parcelas restantes', originInstallmentsRemaining, setOriginInstallmentsRemaining, 'number')}{field('Valor da parcela atual (R$)', originInstallmentValue, setOriginInstallmentValue, 'number')}{field('Saldo devedor (R$)', originDueBalanceValue, setOriginDueBalanceValue, 'number')}</div></div>}
          {operationCode === '3' && <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h4 className="mb-2 text-sm font-bold">Contrato atual para refinanciamento</h4><p className="mb-3 text-xs text-slate-500">Informe CPF e benefício na seção abaixo, selecione a tabela e consulte os contratos que a FINANTO autoriza refinanciar.</p><div className="mb-3 flex flex-wrap items-end gap-3"><label className={`${labelClass} min-w-48 flex-1`}>CPF do beneficiário<input className={inputClass} value={cpf} onChange={e => setCpf(formatCpf(e.target.value))} /></label><label className={`${labelClass} min-w-48 flex-1`}>Número do benefício<input className={inputClass} value={benefit} onChange={e => setBenefit(e.target.value)} /></label><button type="button" onClick={findRefinanceableContracts} disabled={loadingContracts || !ruleId} className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50">{loadingContracts ? 'Buscando contratos...' : 'Buscar contratos elegíveis'}</button></div>{refinanceableContracts.length > 0 && <label className={labelClass}>Contrato elegível<select className={inputClass} value={selectedOriginContractKey} onChange={e => { setSelectedOriginContractKey(e.target.value); setCalculation(null); }}><option value="">Selecione um contrato</option>{refinanceableContracts.map(contract => <option key={String(contract.key)} value={String(contract.key)}>{contract.lenderName || contract.lender?.name || `Banco ${contract.lenderCode}`} · contrato {contract.contractNumber} · saldo R$ {Number(contract.dueBalanceValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</option>)}</select></label>}</div>}
          {operationCode === '4' && <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h4 className="mb-3 text-sm font-bold">Parâmetros do refinanciamento adicional</h4><div className="grid gap-3 sm:grid-cols-3">{field('Prazo do refinanciamento (meses)', refinanceTerm, setRefinanceTerm, 'number')}{field('Taxa mensal do refinanciamento (%)', refinanceRate, setRefinanceRate, 'number')}{field('Parcela adicional (R$; 0 para cálculo automático)', refinanceInstallmentValue, setRefinanceInstallmentValue, 'number')}</div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field('CPF do beneficiário', cpf, value => setCpf(formatCpf(value)))}{field('Número do benefício', benefit, setBenefit)}</div></div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{field('Valor do crédito (R$)', loanValue, value => { setLoanValue(value); setCalculation(null); }, 'number')}{field('Valor da parcela (R$)', installmentValue, value => { setInstallmentValue(value); setCalculation(null); }, 'number')}{field('Taxa mensal (%)', rate, value => { setRate(value); setCalculation(null); }, 'number')}{field('Prazo (meses)', term, value => { setTerm(value); setCalculation(null); }, 'number')}<label className={`${labelClass} flex items-center gap-2 self-end rounded-lg border border-slate-200 p-3 dark:border-slate-700`}><input type="checkbox" checked={hasInsurance} onChange={e => { setHasInsurance(e.target.checked); setCalculation(null); }} />Incluir seguro</label></div>
          <button type="button" onClick={handleCalculate} disabled={loading || loadingRules || !rules.length} className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50 dark:border-violet-900 dark:text-violet-300">{loading ? 'Comparando tabelas...' : `Comparar ${rules.length} tabelas INSS`}</button>{quotes.length > 0 && <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><h4 className="text-sm font-bold">Ofertas retornadas pela FINANTO</h4>{quotes.map(quote => <button type="button" key={String(quote.rule.id)} disabled={!quote.calculation} onClick={() => selectQuote(quote)} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm ${String(ruleId) === String(quote.rule.id) && calculation ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30' : 'border-slate-200 dark:border-slate-700'} disabled:cursor-not-allowed disabled:opacity-60`}><span><strong>{quote.rule.lender?.name || quote.rule.lenderName || quote.rule.product?.name || quote.rule.name || `Tabela ${quote.rule.code || quote.rule.id}`}</strong>{quote.error && <span className="block text-xs text-rose-600">{quote.error}</span>}</span>{quote.calculation ? <span className="whitespace-nowrap text-right">{quote.calculation.loanValue != null ? `R$ ${Number(quote.calculation.loanValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Oferta válida'}{quote.calculation.installmentValue != null ? <span className="block text-xs">Parcela R$ {Number(quote.calculation.installmentValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> : null}</span> : <span className="text-xs text-slate-500">Indisponível</span>}</button>)}</div>}{calculation && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">Oferta selecionada: {calculation.loanValue != null ? `crédito R$ ${Number(calculation.loanValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'cálculo validado'}{calculation.installmentValue != null ? ` · parcela R$ ${Number(calculation.installmentValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}{calculation.rate != null ? ` · taxa ${calculation.rate}%` : ''}{calculation.term != null ? ` · ${calculation.term} meses` : ''}</div>}</section>

          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">2. Cliente e benefício</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field('Nome completo', name, setName)}<label className={labelClass}>CPF<input className={inputClass} required value={cpf} onChange={e => setCpf(formatCpf(e.target.value))} /></label>{field('Número do benefício', benefit, setBenefit, 'text', true, 20)}{field('Nascimento', birthDate, setBirthDate, 'date')}{field('Início do benefício', benefitStartDate, setBenefitStartDate, 'date')}{field('Código do tipo do benefício', benefitType, setBenefitType, 'number', true, undefined, '1')}{field('UF do benefício', benefitState, setBenefitState, 'text', true, 2)}{field('Renda mensal (R$)', income, setIncome, 'number')}{field('Telefone com DDD', phone, setPhone)}{field('E-mail', email, setEmail, 'email')}</div></section>

          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">3. Endereço e documento</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{field('Logradouro', street, setStreet)}{field('Número', number, setNumber)}{field('Complemento', complement, setComplement, 'text', false)}{field('Bairro', district, setDistrict)}{field('Cidade', city, setCity)}{field('UF', state, setState, 'text', true, 2)}{field('CEP', zipCode, setZipCode)}<label className={labelClass}>Tipo de documento<select className={inputClass} value={documentType} onChange={e => setDocumentType(e.target.value)}><option value="RG">RG</option><option value="CNH">CNH</option></select></label>{field('Número do documento', documentNumber, setDocumentNumber)}{field('Data de emissão', issuingDate, setIssuingDate, 'date')}{field('Órgão emissor', issuingEntity, setIssuingEntity)}{field('UF emissora', issuingState, setIssuingState, 'text', true, 2)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Frente do documento (JPG, PNG ou PDF)<input className={inputClass} type="file" accept="image/jpeg,image/png,application/pdf" required onChange={e => setFront(e.target.files?.[0] || null)} /></label><label className={labelClass}>Verso do documento (JPG, PNG ou PDF)<input className={inputClass} type="file" accept="image/jpeg,image/png,application/pdf" required onChange={e => setBack(e.target.files?.[0] || null)} /></label></div></section>

          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">4. Conta para crédito e parceiro Sentinel</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className={labelClass}>Parceiro<select className={inputClass} required value={partnerId} onChange={e => setPartnerId(e.target.value)}><option value="">Selecione o parceiro</option>{availablePartners.map(partner => <option value={partner.id} key={partner.id}>{partner.name || partner.fullName}</option>)}</select></label>{field('Código do banco', bank, setBank)}{field('Agência', branch, setBranch)}{field('Conta', accountNumber, setAccountNumber)}{field('Dígito', accountDigit, setAccountDigit)}</div></section>
          <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">Os dados pessoais e documentos serão transmitidos à FINANTO para processamento desta simulação. Confirme que o cliente autorizou o tratamento e o envio antes de continuar. Arquivos temporários são removidos após o envio.</p>
          {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Cancelar</button><button type="submit" disabled={loading || !calculation} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{loading ? 'Enviando para FINANTO...' : 'Criar simulação FINANTO'}</button></div>
        </form>}
      </div>
    </section>
  </div>;
};
