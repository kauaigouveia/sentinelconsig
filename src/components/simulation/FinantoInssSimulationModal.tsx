import { CurrencyInput } from '../common/CurrencyInput';
import { ParanaNovoOpportunities } from './ParanaNovoOpportunities';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { Partner, SimulationRequest } from '../../types';
import { parseCurrency, formatCpf, isValidCpf, normalizeCpf } from '../../lib/utils';
import { getNossaFintechNovoAmount, getNossaFintechNovoOptions } from '../../lib/nossaFintech';
import { FactaSimulationResults, type FactaComparisonOffer } from './FactaSimulationResults';
import { SimulationOfferCard } from './SimulationOfferCard';
import { OrderedSimulationBanks } from './OrderedSimulationBanks';
import { BmgCustomerAuthorization } from './BmgCustomerAuthorization';
import { readJsonResponse } from '../../lib/httpJson';
import { InssBenefitTypeSelect } from './InssBenefitTypeSelect';
import { nossaFintechTableRate, ageAt, finantoAgeError, finantoBenefitError, finantoCashOutError, finantoInstallmentError, finantoRuleItem, finantoTableLabel, finantoTableRateError } from '../../lib/inssEligibility';

type ApiItem = Record<string, any>;
type FileUpload = { name: string; type: string; content: string };
type InssQuote = { rule: ApiItem; calculation?: ApiItem; error?: string; skipped?: boolean; originContract?: ApiItem; originContracts?: ApiItem[] };
type NossaInssNovoQuote = { table?: ApiItem; success: boolean; status?: number; data?: ApiItem; error?: string };

interface Props {
  isOpen: boolean;
  operationCode: '1' | '2' | '3' | '4';
  onClose: () => void;
  partners: Partner[];
  onSuccess: (simulation: SimulationRequest) => void;
  initialDraft?: { condition: NonNullable<SimulationRequest['selectedCondition']>; values: Record<string, string>; calculation?: ApiItem };
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
// A enumeração oficial da API é: 1 Novo, 2 Refinanciamento, 3 Portabilidade, 4 Portabilidade + Refinanciamento.
const API_OPERATION_CODES: Record<Props['operationCode'], number> = { '1': 1, '2': 3, '3': 2, '4': 4 };

export const FinantoInssSimulationModal: React.FC<Props> = ({ isOpen, operationCode, onClose, partners, onSuccess, initialDraft }) => {
  const appliedDraft = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const [factaOffers, setFactaOffers] = useState<FactaComparisonOffer[]>([]);
  const [factaMessage, setFactaMessage] = useState('');
  const [c6Offers, setC6Offers] = useState<any[]>([]);
  const [c6Message, setC6Message] = useState('');
  const [bmgRows, setBmgRows] = useState<any[]>([]);
  const [c6Contract, setC6Contract] = useState('');
  const [factaContract, setFactaContract] = useState('');
  const [factaContracts, setFactaContracts] = useState<{ code: string; installment?: number; debt?: number }[]>([]);
  const [loadingFactaContracts, setLoadingFactaContracts] = useState(false);
  const [rules, setRules] = useState<ApiItem[]>([]);
  const [ruleId, setRuleId] = useState('');
  const [loadingRules, setLoadingRules] = useState(false);
  const [calculation, setCalculation] = useState<any>(null);
  const [quotes, setQuotes] = useState<InssQuote[]>([]);
  const [nossaFintechQuotes, setNossaFintechQuotes] = useState<NossaInssNovoQuote[]>([]);
  const [nossaFintechError, setNossaFintechError] = useState('');
  const [nossaFintechLegalRepresentative, setNossaFintechLegalRepresentative] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCondition, setSelectedCondition] = useState<SimulationRequest['selectedCondition']>();
  const [typing, setTyping] = useState(false);
  const [cepMessage, setCepMessage] = useState('');
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
  const [newSimulationMode, setNewSimulationMode] = useState<'AMOUNT' | 'INSTALLMENT'>('INSTALLMENT');
  const [rate, setRate] = useState('');
  const [term, setTerm] = useState('84');
  const [hasInsurance, setHasInsurance] = useState(false);
  const [originLenderCode, setOriginLenderCode] = useState('');
  const [originContractNumber, setOriginContractNumber] = useState('');
  const [originTerm, setOriginTerm] = useState('');
  const [originInstallmentsRemaining, setOriginInstallmentsRemaining] = useState('');
  const [originInstallmentValue, setOriginInstallmentValue] = useState('');
  const [originDueBalanceValue, setOriginDueBalanceValue] = useState('');
  const [refinanceTerm, setRefinanceTerm] = useState('84');
  const [refinanceRate, setRefinanceRate] = useState('');
  const [refinanceInstallmentValue, setRefinanceInstallmentValue] = useState('0');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);

  useEffect(() => {
    const cep = zipCode.replace(/\D/g, '');
    if (cep.length !== 8 || !typing) { setCepMessage(''); return; }
    const controller = new AbortController();
    setCepMessage('Consultando CEP...');
    fetch(`/api/address/cep/${cep}`, { signal: controller.signal }).then(async response => {
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error);
      if (controller.signal.aborted) return;
      setStreet(data.street); setDistrict(data.district); setCity(data.city); setState(data.state);
      setCepMessage('Endereço preenchido. Confira o número e o complemento.');
    }).catch(error => { if (!controller.signal.aborted) setCepMessage(error.message); });
    return () => controller.abort();
  }, [zipCode, typing]);
  useEffect(() => { setSelectedCondition(undefined); setTyping(false); }, [cpf, birthDate, benefit, benefitType, rate, term, installmentValue, loanValue, hasInsurance, newSimulationMode, originDueBalanceValue, originInstallmentValue, originContractNumber, originLenderCode, originTerm, originInstallmentsRemaining, refinanceRate, refinanceTerm, refinanceInstallmentValue, nossaFintechLegalRepresentative, factaContract, operationCode]);

  const availablePartners = useMemo(() => partners.filter(partner => partner.active), [partners]);
  const availableRates = useMemo(() => [...new Set([...rules.flatMap(rule => (rule.items || []).map((item: any) => Number(item.rate)).filter((value: number) => Number.isFinite(value) && value > 0)), 1.85, 1.83, 1.8, 1.78, 1.75, 1.72, 1.7, 1.65, 1.6])].sort((a, b) => b - a), [rules]);
  const availableTerms = useMemo(() => [...new Set([...rules.flatMap(rule => (rule.items || []).map((item: any) => Number(item.term || item.maxTerm)).filter((value: number) => Number.isInteger(value) && value > 0)), 108, 96, 84, 72, 60, 48])].sort((a, b) => b - a), [rules]);

  const loadRules = async () => {
    if (operationCode === '2' || operationCode === '4') setHasInsurance(false);
    setLoadingRules(true); setRules([]); setRuleId(''); setRate('1.85'); setTerm('108'); setCalculation(null); setQuotes([]); setNossaFintechQuotes([]); setNossaFintechError(''); setError('');
    try {
      const productsResponse = await fetch('/api/integrations/finanto/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'POST', endpoint: '/v3/loan-products/search/basic', body: { type: { code: { eq: 20 } }, operation: { code: { eq: API_OPERATION_CODES[operationCode] } } } }),
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
          body: JSON.stringify({ method: 'POST', endpoint: '/v3/loan-product-rules/search/basic', body: { offset, limit: 20, operation: { code: { eq: API_OPERATION_CODES[operationCode] } } } }),
        });
        const data = await readJsonResponse(response);
        if (!response.ok || readMessages(data)) throw new Error(data.error || readMessages(data) || 'Não foi possível consultar as tabelas FINANTO.');
        const page = readItems(data);
        allRules.push(...page.filter(rule => inssProductIds.has(String(rule.product?.id))));
        if (page.length < 20) break;
      }
      setRules(allRules);
      setRuleId(allRules[0]?.id ? String(allRules[0].id) : '');
      const defaultItem = allRules[0]?.items?.find((item: any) => item.default) || allRules[0]?.items?.[0];
      setRate(defaultItem?.rate != null ? String(defaultItem.rate) : '1.85');
      setTerm(defaultItem?.term != null ? String(defaultItem.term) : defaultItem?.maxTerm != null ? String(defaultItem.maxTerm) : '108');
      setRefinanceRate(defaultItem?.rate != null ? String(defaultItem.rate) : '');
      setRefinanceTerm(defaultItem?.term != null ? String(defaultItem.term) : defaultItem?.maxTerm != null ? String(defaultItem.maxTerm) : '108');
      if (!allRules.length) setError('Não há tabelas INSS disponíveis para esta modalidade.');
    } catch (err: any) { setError(err.message || 'Falha ao carregar tabelas.'); }
    finally { setLoadingRules(false); }
  };

  useEffect(() => {
    appliedDraft.current = false;
    setDraftReady(false);
    let cancelled = false;
    if (isOpen) {
      setCreated(null); setAuthTerm(null); setSelectedCondition(undefined); setTyping(false); setFront(null); setBack(null);
      void loadRules().then(() => {
        if (!initialDraft || cancelled) return;
        const v = initialDraft.values;
        setHasInsurance(false);
        setCpf(v.cpf); setBirthDate(v.birthDate); setBenefit(v.benefitNumber); setBenefitType(v.benefitType);
        setRate(v.rate); setTerm(v.term); setOriginLenderCode(v.originLenderCode); setOriginContractNumber(v.originContractNumber); setOriginTerm(v.originalTerm); setOriginInstallmentsRemaining(v.openedInstallmentNumber); setOriginInstallmentValue(v.installmentFaceValue); setOriginDueBalanceValue(v.lastDueBalance); setRefinanceRate(v.rate); setRefinanceTerm(v.term); setPartnerId(v.partnerId); setDraftReady(true);
      });
    }
    return () => { cancelled = true; };
  }, [isOpen, operationCode, initialDraft]);

  useEffect(() => { setCalculation(null); setQuotes([]); setNossaFintechQuotes([]); }, [cpf, birthDate, benefit, benefitType]);
  useEffect(() => { setNossaFintechQuotes([]); setNossaFintechError(''); }, [newSimulationMode, loanValue, installmentValue, term, rate, hasInsurance, nossaFintechLegalRepresentative]);
  useEffect(() => { setFactaOffers([]); setFactaMessage(''); }, [cpf, birthDate, benefit, benefitType, term, rate, loanValue, installmentValue, income, factaContract, originDueBalanceValue, originInstallmentValue, originTerm, originInstallmentsRemaining, refinanceRate, refinanceTerm, refinanceInstallmentValue]);
  useEffect(() => { setFactaContracts([]); setFactaContract(''); }, [cpf, benefit]);
  useEffect(() => {
    if (!draftReady || !isOpen || !initialDraft || appliedDraft.current || cpf !== initialDraft.values.cpf || term !== initialDraft.values.term || rate !== initialDraft.values.rate) return;
    appliedDraft.current = true;
    setSelectedCondition(initialDraft.condition); setTyping(true);
    if (initialDraft.calculation) { setCalculation(initialDraft.calculation); setRuleId(initialDraft.condition.tableId); }
  }, [draftReady, isOpen, initialDraft, cpf, term, rate]);
  if (!isOpen) return null;

  const parseAmount = (value: string) => parseCurrency(value) ?? 0;
  const originDataReady = Number.isInteger(Number(originLenderCode)) && Number(originLenderCode) > 0 && Boolean(originContractNumber.trim()) && Number.isInteger(Number(originTerm)) && Number(originTerm) > 0 && Number.isInteger(Number(originInstallmentsRemaining)) && Number(originInstallmentsRemaining) > 0 && parseAmount(originInstallmentValue) > 0 && parseAmount(originDueBalanceValue) > 0;
  const refinancingDataReady = Number.isInteger(Number(refinanceTerm)) && Number(refinanceTerm) > 0 && parseAmount(refinanceRate) > 0 && parseAmount(refinanceInstallmentValue) >= 0;
  const refinanceIdentityReady = isValidCpf(normalizeCpf(cpf)) && Boolean(benefit.replace(/\D/g, ''));
  const manualAmountsReady = newSimulationMode === 'AMOUNT' ? parseAmount(loanValue) > 0 : parseAmount(installmentValue) > 0;
  const borrowerSimulationDataReady = isValidCpf(normalizeCpf(cpf)) && ageAt(birthDate) !== null && Boolean(benefit.replace(/\D/g, '')) && Number.isInteger(Number(benefitType)) && Number(benefitType) > 0;
  const operationDataReady = operationCode === '1' ? manualAmountsReady
    : operationCode === '2' ? originDataReady
      : operationCode === '3' ? refinanceIdentityReady
        : originDataReady && refinancingDataReady;
  const canCalculate = Number(rate) > 0 && Number.isInteger(Number(term)) && Number(term) > 0 && operationDataReady && borrowerSimulationDataReady;
  const handleCalculate = async () => {
    setError(''); setSelectedCondition(undefined); setTyping(false); setCalculation(null); setQuotes([]); setNossaFintechQuotes([]); setNossaFintechError('');
    if (!borrowerSimulationDataReady) return setError('Antes de simular, informe CPF válido, data de nascimento, número do benefício e espécie do benefício.');
    const originContract = operationCode === '2' || operationCode === '4' ? {
      lenderCode: Number(originLenderCode), contractNumber: originContractNumber.trim(), term: Number(originTerm),
      installmentsRemaining: Number(originInstallmentsRemaining), installmentValue: parseAmount(originInstallmentValue), dueBalanceValue: parseAmount(originDueBalanceValue),
    } : undefined;
    const refinancing = operationCode === '4' ? { term: Number(refinanceTerm), rate: parseAmount(refinanceRate), installmentValue: parseAmount(originInstallmentValue) + parseAmount(refinanceInstallmentValue) } : undefined;
    if (originContract && (!Number.isInteger(originContract.lenderCode) || !originContract.contractNumber || !Number.isInteger(originContract.term) || !Number.isInteger(originContract.installmentsRemaining) || originContract.installmentValue <= 0 || originContract.dueBalanceValue <= 0)) return setError('Preencha o banco de origem, contrato, prazo original, parcelas restantes, valor da parcela e saldo devedor.');
    if (refinancing && (!Number.isInteger(refinancing.term) || refinancing.rate <= 0 || refinancing.installmentValue < 0)) return setError('Informe prazo e taxa válidos para o refinanciamento adicional.');
    const enteredLoan = parseAmount(loanValue);
    const enteredInstallment = parseAmount(installmentValue);
    if (operationCode === '1' && (newSimulationMode === 'AMOUNT' ? !(Number.isFinite(enteredLoan) && enteredLoan > 0) : !(Number.isFinite(enteredInstallment) && enteredInstallment > 0))) return setError(newSimulationMode === 'AMOUNT' ? 'Informe um valor liberado válido.' : 'Informe um valor de parcela válido.');
    if (operationCode === '2' && !originDataReady) return setError('Preencha todos os dados do contrato atual para calcular a portabilidade.');
    if (operationCode === '3' && !refinanceIdentityReady) return setError('Informe um CPF válido e o número do benefício para buscar contratos de refinanciamento.');
    if (operationCode === '4' && (!originDataReady || !refinancingDataReady)) return setError('Preencha os dados do contrato atual e do refinanciamento adicional antes de calcular.');
    if (!Number(rate) || !Number.isInteger(Number(term))) return setError('Selecione uma taxa e um prazo válidos nas opções disponíveis.');
    setLoading(true);
    setFactaOffers([]); setFactaMessage('');
    try {
      const factaPromise = (async () => {
        try {
          const response = await fetch('/api/integrations/facta/inss/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: normalizeCpf(cpf), birthDate, benefitNumber: benefit, benefitType: Number(benefitType), operation: ({ '1': 'NEW', '2': 'PORT', '3': 'REFIN', '4': 'PORT_REFIN' })[operationCode], mode: operationCode === '1' ? newSimulationMode : 'INSTALLMENT', value: operationCode === '1' ? newSimulationMode === 'AMOUNT' ? enteredLoan : enteredInstallment : (operationCode === '4' ? refinancing?.installmentValue : originContract?.installmentValue) || enteredInstallment || factaContracts.find(item => item.code === factaContract)?.installment, term: Number(operationCode === '4' ? refinanceTerm : term), rate: Number(operationCode === '4' ? refinanceRate : rate), debt: originContract?.dueBalanceValue, originalTerm: originContract?.term, remainingTerm: originContract?.installmentsRemaining, originalInstallment: originContract?.installmentValue, income: parseAmount(income), contract: factaContract }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Falha na consulta.');
          setFactaOffers(result.offers || []); setFactaMessage(result.message || '');
          return result.offers?.length || 0;
        } catch (error: any) { setFactaMessage(error.message); return 0; }
      })();
      const c6Promise = (async () => {
        setC6Offers([]); setC6Message('');
        if (operationCode === '2' || operationCode === '4') return 0;
        try {
          const response = await fetch('/api/integrations/c6/inss/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: normalizeCpf(cpf), birthDate, benefitNumber: benefit, benefitType: Number(benefitType), operation: ({ '1': 'NEW', '2': 'PORT', '3': 'REFIN', '4': 'PORT_REFIN' })[operationCode], mode: operationCode === '1' ? newSimulationMode : 'INSTALLMENT', value: operationCode === '1' && newSimulationMode === 'AMOUNT' ? enteredLoan : enteredInstallment, term: Number(term), income: parseAmount(income), c6Contract }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Falha na consulta C6.');
          setC6Offers(data.offers || []);
          return data.offers?.length || 0;
        } catch (error: any) { setC6Message(error.message); return 0; }
      })();
      const nossaFintechPromise = operationCode === '1'
        ? (async () => {
            try {
              const response = await fetch('/api/integrations/nossa-fintech/inss/novo/simulate-all', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numberOfInstallments: Number(term), mode: newSimulationMode, value: newSimulationMode === 'AMOUNT' ? enteredLoan : enteredInstallment, legalRepresentative: nossaFintechLegalRepresentative, birthDate, benefitType: Number(benefitType) }),
              });
              const data = await readJsonResponse(response);
              if (!response.ok || data.success === false) throw new Error(data.error || data.data?.message || `Nossa Fintech respondeu com HTTP ${data.status || response.status}.`);
              return { quotes: (data.data?.results || []) as NossaInssNovoQuote[], error: data.data?.results?.length ? '' : data.data?.message || 'Nenhuma tabela compatível com a espécie e o prazo selecionados.' };
            } catch (err: any) {
              return { quotes: [] as NossaInssNovoQuote[], error: err.message || 'Falha ao calcular na Nossa Fintech.' };
            }
          })()
        : Promise.resolve(null);
      const eligibleRules = rules.filter(rule => !finantoBenefitError(rule.name || '', benefitType));
      const results: InssQuote[] = new Array(eligibleRules.length);
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < eligibleRules.length) {
          const index = nextIndex++;
          const rule = eligibleRules[index];
          try {
            const requestedTerm = refinancing?.term || Number(term);
            const ageError = finantoAgeError(birthDate, requestedTerm);
            const installmentError = operationCode === '2' || operationCode === '4' ? finantoInstallmentError(rule.name || '', parseAmount(originInstallmentValue)) : null;
            const defaultItem = finantoRuleItem(rule, requestedTerm, Number(refinancing?.rate || rate));
            const rateError = finantoTableRateError(rule.name || '', Number(refinancing?.rate || rate));
            const eligibilityError = ageError || installmentError || rateError || (!defaultItem ? 'A tabela não atende à taxa e ao prazo escolhidos.' : null);
            if (eligibilityError) { results[index] = { rule, skipped: true, error: eligibilityError }; continue; }
            let originContracts: ApiItem[] | undefined;
            if (operationCode === '3') {
              if (!isValidCpf(normalizeCpf(cpf)) || !benefit.trim()) throw new Error('Informe CPF e benefício para buscar contratos de refinanciamento.');
              const eligibleResponse = await fetch('/api/integrations/finanto/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'POST', endpoint: '/v3/loan-inss-simulations/refinanceable-contracts', body: { identity: normalizeCpf(cpf), benefit: benefit.replace(/\D/g, ''), ruleId: rule.id } }) });
              const eligibleData = await eligibleResponse.json();
              if (!eligibleResponse.ok || readMessages(eligibleData)) throw new Error(eligibleData.error || readMessages(eligibleData) || 'Falha ao consultar contratos elegíveis.');
              const eligible = readItems(eligibleData);
              if (!eligible.length) throw new Error('Sem contrato elegível');
              const selected = eligible[0];
              originContracts = [{ lenderCode: selected.lenderCode, contractNumber: selected.contractNumber, dueBalanceValue: Number(selected.dueBalanceValue), installmentValue: Number(selected.installmentValue), installmentsRemaining: Number(selected.installmentsRemaining) }];
              results[index] = { rule, originContracts, originContract: selected };
            }
            const quoteRate = Number(rate || defaultItem.rate);
            const quoteTerm = Number(term || defaultItem.term || defaultItem.maxTerm);
            if (!(quoteRate > 0 && Number.isInteger(quoteTerm) && quoteTerm > 0)) throw new Error('A tabela não possui taxa ou prazo padrão.');
            const monthlyRate = quoteRate / 100;
            const annuityFactor = (1 - Math.pow(1 + monthlyRate, -quoteTerm)) / monthlyRate;
            const newLoanValue = newSimulationMode === 'AMOUNT' ? enteredLoan : enteredInstallment * annuityFactor;
            const newInstallmentValue = newSimulationMode === 'INSTALLMENT' ? enteredInstallment : enteredLoan / annuityFactor;
            const payload = {
              ruleId: rule.id, hasInsurance,
              installmentValue: operationCode === '1' ? newInstallmentValue : operationCode === '3' ? 0 : originContract?.installmentValue || 0,
              ...(operationCode === '1' ? { loanValue: newLoanValue } : operationCode === '2' || operationCode === '4' ? { loanValue: originContract?.dueBalanceValue } : {}),
              // O motor de crédito exige o valor de emissão mesmo no fluxo Port/Refin.
              // Nesse fluxo, o único valor de emissão informado pelo contrato de origem
              // é o saldo devedor que será portado.
              ...(operationCode === '4' ? { issueAmount: originContract?.dueBalanceValue } : {}),
              rate: quoteRate, term: originContract ? originContract.installmentsRemaining : quoteTerm,
              referenceCode: rule.referenceCode || null,
              ...(originContract ? { originContract } : {}),
              ...(originContracts ? { originContracts } : {}),
              ...(refinancing ? { refinancing } : {}),
            };
            const response = await fetch('/api/integrations/finanto/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'POST', endpoint: '/v3/loan-inss-simulations/calculation', body: payload, clientBirthDate: birthDate }) });
            const data = await readJsonResponse(response);
            if (!response.ok || readMessages(data)) throw new Error(data.error || readMessages(data) || 'A FINANTO não calculou esta tabela.');
            if (operationCode === '4') {
              const cashOutError = finantoCashOutError(rule.name || '', data);
              if (cashOutError) { results[index] = { rule, skipped: true, error: cashOutError }; continue; }
            }
            results[index] = { ...(results[index] || { rule }), rule, calculation: data, ...(originContracts ? { originContracts } : {}) };
          } catch (err: any) {
            results[index] = { ...(results[index] || {}), rule, error: err.message || 'Falha no cálculo.' };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, rules.length) }, () => worker()));
      const [nossaFintechResult, factaCount, c6Count] = await Promise.all([nossaFintechPromise, factaPromise, c6Promise]);
      if (nossaFintechResult) {
        setNossaFintechQuotes(nossaFintechResult.quotes);
        setNossaFintechError(nossaFintechResult.error || (!nossaFintechResult.quotes.length ? 'Nossa Fintech não retornou tabelas compatíveis com o prazo escolhido.' : ''));
      }
      setQuotes(results);
      const successful = results.filter(result => result.calculation);
      if (!successful.length && !factaCount && !c6Count && operationCode !== '1') setError('As integrações não calcularam condições nas tabelas encontradas. Confira os dados do contrato e tente novamente.');
      if (!successful.length && !factaCount && !c6Count && operationCode === '1' && !nossaFintechResult?.quotes.length) setError(`Nenhuma integração calculou condições. ${nossaFintechResult?.error || 'Revise a configuração das APIs e os dados da simulação.'}`);
    } catch (err: any) { setError(err.message || 'Falha no cálculo.'); }
    finally { setLoading(false); }
  };

  const selectQuote = (quote: InssQuote) => {
    if (!quote.calculation) return;
    setRuleId(String(quote.rule.id)); setCalculation(quote.calculation);
    setSelectedCondition({ provider: 'FINANTO', tableId: String(quote.rule.id), tableName: finantoTableLabel(quote.rule), amount: Number(quote.calculation.loanValue), installment: Number(quote.calculation.installmentValue), rate: Number(quote.calculation.rate), term: Number(quote.calculation.term) });

  };

  const saveDraft = async () => {
    if (!selectedCondition || !isValidCpf(cpf) || !partnerId) { setError('Selecione uma oferta, informe um CPF válido e escolha o parceiro.'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/simulations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: normalizeCpf(cpf), partnerId, simulationType: 'INSS_MULTI', operationType: ({ '1': 'NEW', '2': 'PORT', '3': 'REFIN', '4': 'PORT_REFIN' })[operationCode], selectedCondition, customerData: { birthDate, benefitNumber: benefit.replace(/\D/g, ''), benefitType: Number(benefitType), name, hasInsurance, legalRepresentative: nossaFintechLegalRepresentative, refinancing: { term: refinanceTerm, rate: refinanceRate, additionalInstallment: refinanceInstallmentValue }, originContract: operationCode === '3' ? Object.fromEntries(Object.entries(quotes.find(quote => String(quote.rule.id) === ruleId)?.originContract || {}).filter(([, value]) => typeof value === 'string' || typeof value === 'number').map(([key, value]) => [key, String(value)])) : { lenderCode: originLenderCode, contractNumber: originContractNumber, term: originTerm, installmentsRemaining: originInstallmentsRemaining, installmentValue: originInstallmentValue, dueBalanceValue: originDueBalanceValue }, ...(typing ? { phone, email, income, benefitState, benefitStartDate, address: { street, number, complement, district, city, state, zipCode }, document: { type: documentType, number: documentNumber, issuingDate, issuingEntity, issuingState }, creditBankAccount: { bank, branch, number: accountNumber, digit: accountDigit } } : {}) } }) });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a simulação.');
      const simulation = data.simulation || data;
      setCreated(simulation); onSuccess(simulation);
    } catch (error: any) { setError(error.message); } finally { setLoading(false); }
  };
  const uploadFile = async (file: File) => {
    const response = await fetch('/api/integrations/finanto/inss/documents/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type, size: file.size }) });
    const ticket = await readJsonResponse(response);
    if (!response.ok) throw new Error(ticket.error);
    for (let offset = 0, index = 0; offset < file.size; offset += ticket.chunkSize, index++) {
      const part = new File([file.slice(offset, offset + ticket.chunkSize)], file.name, { type: file.type });
      const chunk = await readFile(part);
      const uploaded = await fetch('/api/integrations/finanto/inss/documents/chunk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadToken: ticket.uploadToken, index, content: chunk.content }) });
      const result = await readJsonResponse(uploaded);
      if (!uploaded.ok) throw new Error(result.error);
    }
    return { uploadToken: ticket.uploadToken };
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (selectedCondition?.provider !== 'FINANTO') { await saveDraft(); return; }
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
      const [frontFile, backFile] = await Promise.all([uploadFile(front), uploadFile(back)]);
      const response = await fetch('/api/integrations/finanto/inss/simulations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId, operationCode: API_OPERATION_CODES[operationCode], ruleId, hasInsurance, loanValue: Number(calculation.loanValue ?? parseAmount(loanValue)), ...(operationCode === '4' ? { issueAmount: parseAmount(originDueBalanceValue) } : {}), installmentValue: Number(calculation.installmentValue ?? parseAmount(installmentValue)), rate: Number(calculation.rate ?? null), term: Number(calculation.term ?? term), ...(operationCode === '2' || operationCode === '4' ? { originContract: { lenderCode: Number(originLenderCode), contractNumber: originContractNumber.trim(), term: Number(originTerm), installmentsRemaining: Number(originInstallmentsRemaining), installmentValue: parseAmount(originInstallmentValue), dueBalanceValue: parseAmount(originDueBalanceValue) } } : {}), ...(operationCode === '3' && selectedOriginForRefin ? { originContracts: [selectedOriginForRefin] } : {}), ...(operationCode === '4' ? { refinancing: { term: Number(refinanceTerm), rate: parseAmount(refinanceRate), installmentValue: parseAmount(originInstallmentValue) + parseAmount(refinanceInstallmentValue) } } : {}),
          borrower: { name: name.trim(), identity: cleanCpf, benefit: benefit.replace(/\D/g, ''), benefitState: benefitState.toUpperCase(), benefitStartDate, benefitType: Number(benefitType), birthDate, income: parseAmount(income), phone: phone.replace(/\D/g, ''), email: email.trim(), address: { street: street.trim(), number: number.trim(), complement: complement.trim() || null, district: district.trim(), city: city.trim(), state: state.toUpperCase(), zipCode: zipCode.replace(/\D/g, '') }, document: { type: { code: documentType, name: documentType === 'RG' ? 'Registro Geral' : documentType }, number: documentNumber.trim(), issuingDate, issuingEntity: issuingEntity.trim(), issuingState: issuingState.toUpperCase() } },
          creditBankAccount: { bank: bank.trim(), branch: branch.trim(), number: accountNumber.trim(), digit: accountDigit.trim() }, files: { front: frontFile, back: backFile } }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(`${data.error || readMessages(data) || 'Não foi possível criar a simulação.'}${data.externalSimulationId ? ` Referência no banco: ${data.externalSimulationId}. Confira antes de repetir.` : ''}`);
      setCreated(data.simulation); onSuccess(data.simulation);
    } catch (err: any) { setError(err.message || 'Falha ao enviar a simulação.'); }
    finally { setLoading(false); }
  };

  const getAuthTerm = async () => {
    if (!created?.finantoSimulationId) return;
    setLoadingTerm(true); setError('');
    try {
      const response = await fetch(`/api/integrations/finanto/inss/simulations/${encodeURIComponent(created.id)}/auth-term`, { method: 'POST', credentials: 'same-origin' });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Não foi possível obter o termo de autorização.');
      setAuthTerm(data.term);
    } catch (err: any) { setError(err.message || 'Falha ao consultar termo.'); }
    finally { setLoadingTerm(false); }
  };

  const field = (title: string, value: string, change: (value: string) => void, type = 'text', required = true, maxLength?: number, step?: string) => <label className={labelClass}>{title}{title.includes('R$') ? <CurrencyInput className={inputClass} required={required} value={value} onValueChange={change} /> : <input className={inputClass} type={type} required={required} value={value} maxLength={maxLength} step={type === 'number' ? step || 'any' : undefined} onChange={e => change(e.target.value)} />}</label>;
  const selectField = (title: string, value: string, change: (value: string) => void, options: number[], placeholder: string) => <label className={labelClass}>{title}<select className={inputClass} required value={value} onChange={e => change(e.target.value)}><option value="">{placeholder}</option>{options.map(option => <option key={option} value={String(option)}>{option.toLocaleString('pt-BR')}</option>)}</select></label>;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
    <section className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">{OPERATION_LABELS[operationCode]}</h2><p className="mt-1 text-xs text-slate-500">Compare as condições disponíveis nas integrações habilitadas.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X className="h-5 w-5" /></button></header>
      <div className="overflow-y-auto p-5">
        {created ? <div className="space-y-4"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 className="mr-2 inline h-5 w-5" />{created.finantoSimulationId ? 'Envio concluído e registrado na Central do Sentinel.' : 'Simulação salva na esteira, aguardando digitação pela mesa.'}{created.finantoSimulationId && <div className="mt-2 font-mono text-xs">Referência: {created.finantoSimulationId}</div>}</div>
          {created.finantoSimulationId && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><ShieldCheck className="mr-2 inline h-5 w-5" />Próxima etapa: apresentar o termo ao cliente e obter autorização expressa. A assinatura não é realizada automaticamente pelo sistema.</div>}
          {created.finantoSimulationId && !authTerm && <button type="button" onClick={getAuthTerm} disabled={loadingTerm} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{loadingTerm ? 'Consultando termo...' : 'Consultar termo de autorização'}</button>}
          {authTerm && <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-200">{JSON.stringify(authTerm, null, 2)}</pre>}
          <button type="button" onClick={onClose} className="ml-2 rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Concluir</button></div> : <form onSubmit={handleCreate} className="space-y-6">
          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">1. Dados obrigatórios do cliente</h3><p className="text-xs text-slate-500">Esses dados são usados para validar a espécie e consultar as condições disponíveis.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className={labelClass}>CPF<input className={inputClass} required value={cpf} onChange={e => setCpf(formatCpf(e.target.value))} /></label>{field('Data de nascimento', birthDate, setBirthDate, 'date')}{field('Número do benefício', benefit, setBenefit, 'text', true, 20)}<InssBenefitTypeSelect className={labelClass} required value={benefitType} onChange={setBenefitType} /></div></section>

          {operationCode === '1' && <ParanaNovoOpportunities cpf={cpf} benefit={benefit} species={benefitType} selected={selectedCondition} onSelect={setSelectedCondition} onClear={() => setSelectedCondition(current => current?.provider === 'Paraná Banco' ? undefined : current)} />}

          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">2. Produto e condição</h3><p className="text-xs text-slate-500">{loadingRules ? 'Carregando condições disponíveis...' : 'As condições são consultadas nas integrações habilitadas para a modalidade e a espécie selecionadas.'}</p>
          {(operationCode === '2' || operationCode === '4') && <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h4 className="mb-3 text-sm font-bold">Dados do contrato atual para portabilidade</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field('Código do banco de origem', originLenderCode, setOriginLenderCode, 'number')}{field('Número do contrato', originContractNumber, setOriginContractNumber)}{field('Prazo original (meses)', originTerm, setOriginTerm, 'number')}{field('Parcelas restantes', originInstallmentsRemaining, setOriginInstallmentsRemaining, 'number')}{field('Valor da parcela atual (R$)', originInstallmentValue, setOriginInstallmentValue, 'number')}{field('Saldo devedor (R$)', originDueBalanceValue, setOriginDueBalanceValue, 'number')}</div></div>}
          {operationCode === '3' && <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h4 className="mb-2 text-sm font-bold">Dados para localizar o contrato de refinanciamento</h4><p className="text-xs text-slate-500">A busca usa o CPF e o benefício informados na primeira etapa.</p></div>}
          {operationCode === '4' && <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h4 className="mb-3 text-sm font-bold">Parâmetros do refinanciamento adicional</h4><div className="grid gap-3 sm:grid-cols-3">{selectField('Prazo do refinanciamento (meses)', refinanceTerm, setRefinanceTerm, availableTerms, 'Selecione o prazo')}{selectField('Taxa mensal do refinanciamento (%)', refinanceRate, setRefinanceRate, availableRates, 'Selecione a taxa')}{field('Parcela adicional (R$; 0 para manter a parcela atual)', refinanceInstallmentValue, setRefinanceInstallmentValue, 'number')}</div></div>}
          {operationCode === '1' && <div className="space-y-3"><div className="inline-flex rounded-lg border border-slate-200 p-1 dark:border-slate-700"><button type="button" onClick={() => { setNewSimulationMode('INSTALLMENT'); setCalculation(null); setQuotes([]); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${newSimulationMode === 'INSTALLMENT' ? 'bg-violet-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>Simular por parcela</button><button type="button" onClick={() => { setNewSimulationMode('AMOUNT'); setCalculation(null); setQuotes([]); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${newSimulationMode === 'AMOUNT' ? 'bg-violet-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>Simular por valor liberado</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{newSimulationMode === 'AMOUNT' ? field('Valor liberado desejado (R$)', loanValue, value => { setLoanValue(value); setCalculation(null); setQuotes([]); }, 'number') : field('Valor da parcela desejado (R$)', installmentValue, value => { setInstallmentValue(value); setCalculation(null); setQuotes([]); }, 'number')}<label className={`${labelClass} flex items-center gap-2 self-end rounded-lg border border-slate-200 p-3 dark:border-slate-700`}><input type="checkbox" checked={hasInsurance} onChange={e => { setHasInsurance(e.target.checked); setCalculation(null); setQuotes([]); }} />Incluir seguro</label><label className={`${labelClass} flex items-center gap-2 self-end rounded-lg border border-slate-200 p-3 dark:border-slate-700`}><input type="checkbox" checked={nossaFintechLegalRepresentative} onChange={e => setNossaFintechLegalRepresentative(e.target.checked)} />Possui representante legal</label></div></div>}
          <div className="grid gap-3 sm:grid-cols-2">{selectField('Taxa mensal (%)', rate, value => { setRate(value); setCalculation(null); setQuotes([]); }, availableRates, 'Selecione a taxa')}{selectField('Prazo (meses)', term, value => { setTerm(value); setCalculation(null); setQuotes([]); }, availableTerms, 'Selecione o prazo')}</div>
          {operationCode === '3' && <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <label className={labelClass}>Contrato C6<input value={c6Contract} onChange={e => setC6Contract(e.target.value)} className={inputClass} /></label>
            <label className={labelClass}>Renda para refinanciamento (R$)<CurrencyInput min="0.01" step="0.01" value={income} onValueChange={value => setIncome(value)} className={inputClass} /></label>
            <button type="button" disabled={loadingFactaContracts || !borrowerSimulationDataReady} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={async () => {
              setLoadingFactaContracts(true); setFactaMessage('');
              try { const response = await fetch('/api/integrations/facta/inss/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: normalizeCpf(cpf), benefitNumber: benefit }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setFactaContracts(result.contracts || []); if (!result.contracts?.length) setFactaMessage('Nenhum contrato elegível neste benefício.'); }
              catch (error: any) { setFactaMessage(error.message); } finally { setLoadingFactaContracts(false); }
            }}>{loadingFactaContracts ? 'Consultando...' : 'Consultar contratos para refinanciamento'}</button>
            {factaContracts.length > 0 && <label className={labelClass}>Contrato retornado pela FACTA<select value={factaContract} onChange={e => setFactaContract(e.target.value)} className={inputClass}><option value="">Selecione o contrato</option>{factaContracts.map(item => <option key={item.code} value={item.code}>{item.code} · parcela R$ {item.installment?.toLocaleString('pt-BR')} · saldo R$ {item.debt?.toLocaleString('pt-BR')}</option>)}</select></label>}
          </div>}
          {operationCode === '1' && <label className={labelClass}>Renda mensal para C6 (R$)<CurrencyInput min="0.01" step="0.01" value={income} onValueChange={value => setIncome(value)} className={inputClass} /></label>}
          {!canCalculate && <p className="text-xs text-slate-500">Informe os dados obrigatorios do cliente acima e selecione os campos desta modalidade, taxa e prazo.</p>}<button type="button" onClick={handleCalculate} disabled={loading || loadingRules || !canCalculate} className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50 dark:border-violet-900 dark:text-violet-300">{loading ? 'Calculando...' : 'Calcular simulação'}</button>
          <BmgCustomerAuthorization input={{ product: 'INSS', operation: ({ '1': 'NEW', '2': 'PORT', '3': 'REFIN', '4': 'PORT_REFIN' })[operationCode], cpf: normalizeCpf(cpf), birthDate, benefitNumber: benefit, income: parseAmount(income), term: Number(term), value: newSimulationMode === 'AMOUNT' ? parseAmount(loanValue) : parseAmount(installmentValue), mode: newSimulationMode }} onRows={setBmgRows} />
          <OrderedSimulationBanks operation={({ '1': 'NEW', '2': 'PORT', '3': 'REFIN', '4': 'PORT_REFIN' })[operationCode]} groups={[
            { bank: 'BMG', visible: bmgRows.length > 0, content: <>{bmgRows.map((row, index) => row.state === 'OFFER' ? <SimulationOfferCard key={index} name={row.name || 'Oferta BMG'} description="Integração: BMG" amount={row.amount} contractAmount={row.contractAmount} installment={row.installment} term={row.term} rate={row.rate} /> : <p key={index} className="text-sm">{row.message}</p>)}</> },
            { bank: 'C6', visible: !['2', '4'].includes(operationCode) && !!(c6Offers.length || c6Message), content: <>{c6Message && <p className="text-sm text-amber-600">C6: {c6Message}</p>}{c6Offers.length > 0 && <section className="space-y-2"><h4 className="font-bold">Ofertas C6</h4>{c6Offers.map(offer => <div key={offer.id} className="rounded-lg border border-slate-700 p-3 text-sm"><strong>{offer.name}</strong><p>Valor liberado: R$ {offer.amount.toLocaleString('pt-BR')} · parcela: R$ {offer.installment.toLocaleString('pt-BR')} · {offer.term} meses · {offer.rate}%</p></div>)}</section>}</> },
            { bank: 'FACTA', visible: !!(factaOffers.length || factaMessage), content: (<FactaSimulationResults offers={factaOffers} message={factaMessage} selectedCode={selectedCondition?.provider === 'FACTA' ? selectedCondition.tableId : undefined} onSelect={offer => setSelectedCondition({ provider: 'FACTA', tableId: offer.code, tableName: offer.name, amount: Number(offer.amount || offer.contractAmount), installment: Number(offer.installment), rate: Number(offer.rate), term: Number(offer.term), portabilityCode: offer.portabilityCode })} />) },
            { bank: 'FINANTO', visible: quotes.length > 0, content: (quotes.length > 0 && <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><h4 className="text-sm font-bold">Ofertas FINANTO</h4>{quotes.map(quote => { const selected = selectedCondition?.provider === 'FINANTO' && String(ruleId) === String(quote.rule.id) && Boolean(calculation); const tableName = finantoTableLabel(quote.rule); const lenderName = quote.calculation?.lender?.name || quote.calculation?.fund?.name || quote.rule.lender?.name || quote.rule.lenderName || 'Instituicao nao identificada'; return operationCode === '1' ? <SimulationOfferCard key={String(quote.rule.id)} name={tableName} description={`Integração: FINANTO · ${lenderName} · tabela ${quote.rule.code || quote.rule.id}`} amount={quote.calculation?.netValue ?? quote.calculation?.loanValue} contractAmount={quote.calculation?.loanValue} installment={quote.calculation?.installmentValue} term={quote.calculation?.term} rate={quote.calculation?.rate} selected={selected} disabled={!quote.calculation} onSelect={() => selectQuote(quote)}>{quote.error && <p role="status" className="mt-2 text-xs text-rose-600">{quote.error}</p>}</SimulationOfferCard> : <button type="button" key={String(quote.rule.id)} aria-pressed={selected} disabled={!quote.calculation} onClick={() => selectQuote(quote)} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm ${selected ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30' : 'border-slate-200 dark:border-slate-700'} disabled:cursor-not-allowed disabled:opacity-60`}><span><strong className="block">{tableName}</strong><span className="block text-xs text-slate-500">Integração: FINANTO · {lenderName} · tabela {quote.rule.code || quote.rule.id}</span>{quote.originContract && <span className="block text-xs text-slate-500">Contrato {quote.originContract.contractNumber} - saldo R$ {Number(quote.originContract.dueBalanceValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}{quote.error && <span className="block text-xs text-rose-600">{quote.error}</span>}{selected && <span className="block text-xs font-semibold text-violet-700 dark:text-violet-300">Oferta selecionada</span>}</span>{quote.calculation ? <span className="whitespace-nowrap text-right">{quote.calculation.loanValue != null ? `R$ ${Number(quote.calculation.loanValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Oferta valida'}{quote.calculation.installmentValue != null ? <span className="block text-xs">Parcela R$ {Number(quote.calculation.installmentValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> : null}</span> : <span className="text-xs text-slate-500">Indisponivel</span>}</button>})}</div>) },
            { bank: 'NOSSA_FINTECH', visible: operationCode === '1' && !!(nossaFintechQuotes.length || nossaFintechError), content: (operationCode === '1' && (nossaFintechQuotes.length > 0 || nossaFintechError) && <div className="space-y-2 rounded-xl border border-emerald-200 p-3 dark:border-emerald-900"><h4 className="text-sm font-bold">Ofertas Nossa Fintech</h4><p className="text-xs text-slate-500">Compare as condições retornadas pelas demais integrações.</p>{nossaFintechError && <p role="status" className="text-xs text-rose-600">{nossaFintechError}</p>}{nossaFintechQuotes.map((quote, index) => { const amount = getNossaFintechNovoAmount(quote.data); const tableName = getNossaFintechNovoOptions(quote.data)[0]?.table_name || getNossaFintechNovoOptions(quote.data)[0]?.nome_tabela || quote.table?.nome_tabela || quote.table?.name || quote.table?.descricao || quote.table?.description || `Produto ${quote.table?.cod_produto ?? index + 1}`; const option = getNossaFintechNovoOptions(quote.data)[0]; const condition = { provider: 'Nossa Fintech', tableId: String(option?.cod_tabela || quote.table?.cod_tabela || quote.table?.cod_produto), tableName, amount: Number(amount), installment: (option?.installment_face_value != null ? Number(option.installment_face_value) : option?.installment_amount != null ? Number(option.installment_amount) : newSimulationMode === 'INSTALLMENT' ? parseAmount(installmentValue) : null), rate: (option?.interest_rate?.monthly_rate != null ? Number(option.interest_rate.monthly_rate) * 100 : option?.monthly_interest_rate != null ? Number(option.monthly_interest_rate) : option?.monthly_rate != null ? Number(option.monthly_rate) : nossaFintechTableRate(quote.table || {})), term: Number(option?.number_of_installments ?? term) }; return <SimulationOfferCard key={`${quote.table?.cod_produto ?? 'produto'}-${index}`} name={tableName} description={`Integração: Nossa Fintech · tabela ${quote.table?.cod_tabela || 'não identificada'}`} amount={amount} contractAmount={option?.issue_amount != null ? Number(option.issue_amount) : undefined} installment={condition.installment} rate={condition.rate} term={condition.term} disabled={!quote.success || !amount || !quote.table?.cod_tabela} selected={selectedCondition?.provider === condition.provider && selectedCondition.tableId === condition.tableId && selectedCondition.amount === condition.amount} onSelect={() => setSelectedCondition(condition)}>{quote.error && <p role="status" className="mt-2 text-xs text-rose-600">{quote.error}</p>}</SimulationOfferCard>})}</div>) },
          ]} />
          {selectedCondition && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">Oferta selecionada: {selectedCondition.tableName} · {selectedCondition.provider} · R$ {selectedCondition.amount.toLocaleString('pt-BR')} · parcela R$ {selectedCondition.installment?.toLocaleString('pt-BR') || 'Não informada'} · {selectedCondition.rate != null ? `${selectedCondition.rate}%` : 'Taxa não informada'} · {selectedCondition.term} meses</div>}</section>

          <label className={labelClass}>Parceiro responsável<select className={inputClass} required value={partnerId} onChange={e => setPartnerId(e.target.value)}><option value="">Selecione o parceiro</option>{availablePartners.map(partner => <option value={partner.id} key={partner.id}>{partner.name || partner.fullName}</option>)}</select></label>
          {typing && <>
          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">3. Dados adicionais do cliente</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field('Nome completo', name, setName)}{field('Início do benefício', benefitStartDate, setBenefitStartDate, 'date')}{field('UF do benefício', benefitState, setBenefitState, 'text', true, 2)}{field('Renda mensal (R$)', income, setIncome, 'number')}{field('Telefone com DDD', phone, setPhone)}{field('E-mail', email, setEmail, 'email')}</div></section>

          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">4. Endereço e documento</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{field('Logradouro', street, setStreet)}{field('Número', number, setNumber)}{field('Complemento', complement, setComplement, 'text', false)}{field('Bairro', district, setDistrict)}{field('Cidade', city, setCity)}{field('UF', state, setState, 'text', true, 2)}{field('CEP', zipCode, setZipCode)}<p role="status" className="text-xs text-slate-500">{cepMessage}</p><label className={labelClass}>Tipo de documento<select className={inputClass} value={documentType} onChange={e => setDocumentType(e.target.value)}><option value="RG">RG</option><option value="CNH">CNH</option></select></label>{field('Número do documento', documentNumber, setDocumentNumber)}{field('Data de emissão', issuingDate, setIssuingDate, 'date')}{field('Órgão emissor', issuingEntity, setIssuingEntity)}{field('UF emissora', issuingState, setIssuingState, 'text', true, 2)}</div>
          {selectedCondition?.provider === 'FINANTO' && <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Frente do documento (JPG, PNG ou PDF)<input className={inputClass} type="file" accept="image/jpeg,image/png,application/pdf" required={selectedCondition?.provider === 'FINANTO'} onChange={e => setFront(e.target.files?.[0] || null)} /></label><label className={labelClass}>Verso do documento (JPG, PNG ou PDF)<input className={inputClass} type="file" accept="image/jpeg,image/png,application/pdf" required={selectedCondition?.provider === 'FINANTO'} onChange={e => setBack(e.target.files?.[0] || null)} /></label></div>}</section>

          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">5. Conta para crédito e parceiro Sentinel</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{field('Código do banco', bank, setBank)}{field('Agência', branch, setBranch)}{field('Conta', accountNumber, setAccountNumber)}{field('Dígito', accountDigit, setAccountDigit)}</div></section>
          <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{selectedCondition?.provider === 'FINANTO' ? 'Os dados e documentos serão enviados à instituição selecionada. Confirme a autorização do cliente antes de continuar.' : 'Os dados serão guardados na esteira para digitação pela mesa. O envio ao banco será realizado na etapa operacional.'}</p>
          </>}
          {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Cancelar</button>{typing ? <><button type="button" onClick={() => setTyping(false)} className="rounded-lg border px-4 py-2">Voltar à simulação</button><button type="submit" disabled={loading || !selectedCondition} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Enviando...' : selectedCondition?.provider === 'FINANTO' ? 'Enviar para digitação' : 'Salvar dados para a mesa'}</button></> : <><button type="button" onClick={saveDraft} disabled={loading || !selectedCondition} className="rounded-lg border px-4 py-2 disabled:opacity-50">{loading ? 'Salvando...' : 'Salvar simulação'}</button><button type="button" onClick={() => { if (!partnerId) { setError('Selecione o parceiro responsável.'); return; } setTyping(true); setError(''); }} disabled={loading || !selectedCondition} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Seguir para digitação</button></>}</div>
        </form>}
      </div>
    </section>
  </div>;
};
