import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { Partner, SimulationRequest } from '../../types';
import { formatCpf, isValidCpf, normalizeCpf } from '../../lib/utils';
import { getNossaFintechNovoAmount } from '../../lib/nossaFintech';
import { InssBenefitTypeSelect } from './InssBenefitTypeSelect';
import { ageAt, finantoAgeError, finantoBenefitError, finantoCashOutError, finantoInstallmentError, finantoRuleItem, finantoTableLabel, finantoTableRateError } from '../../lib/inssEligibility';

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

export const FinantoInssSimulationModal: React.FC<Props> = ({ isOpen, operationCode, onClose, partners, onSuccess }) => {
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

  const availablePartners = useMemo(() => partners.filter(partner => partner.active), [partners]);
  const availableRates = useMemo(() => [...new Set(rules.flatMap(rule => (rule.items || []).map((item: any) => Number(item.rate)).filter((value: number) => Number.isFinite(value) && value > 0)))].sort((a, b) => b - a), [rules]);
  const availableTerms = useMemo(() => [...new Set(rules.flatMap(rule => (rule.items || []).map((item: any) => Number(item.term || item.maxTerm)).filter((value: number) => Number.isInteger(value) && value > 0)))].sort((a, b) => b - a), [rules]);

  const loadRules = async () => {
    if (operationCode === '2' || operationCode === '4') setHasInsurance(false);
    setLoadingRules(true); setRules([]); setRuleId(''); setRate(''); setTerm(''); setCalculation(null); setQuotes([]); setNossaFintechQuotes([]); setNossaFintechError(''); setError('');
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
        const data = await response.json();
        if (!response.ok || readMessages(data)) throw new Error(data.error || readMessages(data) || 'Não foi possível consultar as tabelas FINANTO.');
        const page = readItems(data);
        allRules.push(...page.filter(rule => inssProductIds.has(String(rule.product?.id))));
        if (page.length < 20) break;
      }
      setRules(allRules);
      setRuleId(allRules[0]?.id ? String(allRules[0].id) : '');
      const defaultItem = allRules[0]?.items?.find((item: any) => item.default) || allRules[0]?.items?.[0];
      setRate(defaultItem?.rate != null ? String(defaultItem.rate) : '');
      setTerm(defaultItem?.term != null ? String(defaultItem.term) : defaultItem?.maxTerm != null ? String(defaultItem.maxTerm) : '');
      setRefinanceRate(defaultItem?.rate != null ? String(defaultItem.rate) : '');
      setRefinanceTerm(defaultItem?.term != null ? String(defaultItem.term) : defaultItem?.maxTerm != null ? String(defaultItem.maxTerm) : '');
      if (!allRules.length) setError('Não há tabelas INSS disponíveis para esta modalidade.');
    } catch (err: any) { setError(err.message || 'Falha ao carregar tabelas.'); }
    finally { setLoadingRules(false); }
  };

  useEffect(() => { if (isOpen) void loadRules(); }, [isOpen, operationCode]);
  useEffect(() => { setCalculation(null); setQuotes([]); setNossaFintechQuotes([]); }, [cpf, birthDate, benefit, benefitType]);
  useEffect(() => { setNossaFintechQuotes([]); setNossaFintechError(''); }, [newSimulationMode, loanValue, installmentValue, term, rate, hasInsurance, nossaFintechLegalRepresentative]);
  if (!isOpen) return null;

  const parseAmount = (value: string) => Number(value.replace(',', '.'));
  const originDataReady = Number.isInteger(Number(originLenderCode)) && Number(originLenderCode) > 0 && Boolean(originContractNumber.trim()) && Number.isInteger(Number(originTerm)) && Number(originTerm) > 0 && Number.isInteger(Number(originInstallmentsRemaining)) && Number(originInstallmentsRemaining) > 0 && parseAmount(originInstallmentValue) > 0 && parseAmount(originDueBalanceValue) > 0;
  const refinancingDataReady = Number.isInteger(Number(refinanceTerm)) && Number(refinanceTerm) > 0 && parseAmount(refinanceRate) > 0 && parseAmount(refinanceInstallmentValue) >= 0;
  const refinanceIdentityReady = isValidCpf(normalizeCpf(cpf)) && Boolean(benefit.replace(/\D/g, ''));
  const manualAmountsReady = newSimulationMode === 'AMOUNT' ? parseAmount(loanValue) > 0 : parseAmount(installmentValue) > 0;
  const borrowerSimulationDataReady = isValidCpf(normalizeCpf(cpf)) && ageAt(birthDate) !== null && Boolean(benefit.replace(/\D/g, '')) && Number.isInteger(Number(benefitType)) && Number(benefitType) > 0;
  const operationDataReady = operationCode === '1' ? manualAmountsReady
    : operationCode === '2' ? originDataReady
      : operationCode === '3' ? refinanceIdentityReady
        : originDataReady && refinancingDataReady;
  const canCalculate = (rules.length > 0 || operationCode === '1') && Number(rate) > 0 && Number.isInteger(Number(term)) && Number(term) > 0 && operationDataReady && borrowerSimulationDataReady;
  const handleCalculate = async () => {
    setError(''); setCalculation(null); setQuotes([]); setNossaFintechQuotes([]); setNossaFintechError('');
    if (!rules.length && operationCode !== '1') return setError('Não há tabelas INSS disponíveis para comparar.');
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
    try {
      const nossaFintechPromise = operationCode === '1'
        ? (async () => {
            try {
              const response = await fetch('/api/integrations/nossa-fintech/inss/novo/simulate-all', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numberOfInstallments: Number(term), mode: newSimulationMode, value: newSimulationMode === 'AMOUNT' ? enteredLoan : enteredInstallment, legalRepresentative: nossaFintechLegalRepresentative, birthDate, benefitType: Number(benefitType) }),
              });
              const data = await response.json();
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
            const data = await response.json();
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
      const nossaFintechResult = await nossaFintechPromise;
      if (nossaFintechResult) {
        setNossaFintechQuotes(nossaFintechResult.quotes);
        setNossaFintechError(nossaFintechResult.error || (!nossaFintechResult.quotes.length ? 'Nossa Fintech não retornou tabelas compatíveis com o prazo escolhido.' : ''));
      }
      setQuotes(results);
      const successful = results.filter(result => result.calculation);
      if (!successful.length && operationCode !== '1') setError('A FINANTO não calculou condições nas tabelas encontradas. Confira os dados do contrato e tente novamente.');
      if (!successful.length && operationCode === '1' && !nossaFintechResult?.quotes.length) setError(`Nenhuma integração calculou condições. ${nossaFintechResult?.error || 'Revise a configuração das APIs e os dados da simulação.'}`);
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
        body: JSON.stringify({ partnerId, operationCode: API_OPERATION_CODES[operationCode], ruleId, hasInsurance, loanValue: Number(calculation.loanValue ?? parseAmount(loanValue)), ...(operationCode === '4' ? { issueAmount: parseAmount(originDueBalanceValue) } : {}), installmentValue: Number(calculation.installmentValue ?? parseAmount(installmentValue)), rate: Number(calculation.rate ?? parseAmount(rate)), term: Number(calculation.term ?? term), ...(operationCode === '2' || operationCode === '4' ? { originContract: { lenderCode: Number(originLenderCode), contractNumber: originContractNumber.trim(), term: Number(originTerm), installmentsRemaining: Number(originInstallmentsRemaining), installmentValue: parseAmount(originInstallmentValue), dueBalanceValue: parseAmount(originDueBalanceValue) } } : {}), ...(operationCode === '3' && selectedOriginForRefin ? { originContracts: [selectedOriginForRefin] } : {}), ...(operationCode === '4' ? { refinancing: { term: Number(refinanceTerm), rate: parseAmount(refinanceRate), installmentValue: parseAmount(originInstallmentValue) + parseAmount(refinanceInstallmentValue) } } : {}),
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
  const selectField = (title: string, value: string, change: (value: string) => void, options: number[], placeholder: string) => <label className={labelClass}>{title}<select className={inputClass} required value={value} onChange={e => change(e.target.value)}><option value="">{placeholder}</option>{options.map(option => <option key={option} value={String(option)}>{option.toLocaleString('pt-BR')}</option>)}</select></label>;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
    <section className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">{OPERATION_LABELS[operationCode]}</h2><p className="mt-1 text-xs text-slate-500">Compare as condições disponíveis nas integrações habilitadas.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X className="h-5 w-5" /></button></header>
      <div className="overflow-y-auto p-5">
        {created ? <div className="space-y-4"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 className="mr-2 inline h-5 w-5" />Simulação criada no FINANTO e registrada na Central do Sentinel.<div className="mt-2 font-mono text-xs">Referência FINANTO: {created.finantoSimulationId}</div></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><ShieldCheck className="mr-2 inline h-5 w-5" />Próxima etapa: apresentar o termo ao cliente e obter autorização expressa. A assinatura não é realizada automaticamente pelo sistema.</div>
          {!authTerm && <button type="button" onClick={getAuthTerm} disabled={loadingTerm} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{loadingTerm ? 'Consultando termo...' : 'Consultar termo de autorização'}</button>}
          {authTerm && <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-200">{JSON.stringify(authTerm, null, 2)}</pre>}
          <button type="button" onClick={onClose} className="ml-2 rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Concluir</button></div> : <form onSubmit={handleCreate} className="space-y-6">
          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">1. Dados obrigatórios do cliente</h3><p className="text-xs text-slate-500">Esses dados são usados para validar a espécie e consultar as condições disponíveis.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className={labelClass}>CPF<input className={inputClass} required value={cpf} onChange={e => setCpf(formatCpf(e.target.value))} /></label>{field('Data de nascimento', birthDate, setBirthDate, 'date')}{field('Número do benefício', benefit, setBenefit, 'text', true, 20)}<InssBenefitTypeSelect className={labelClass} required value={benefitType} onChange={setBenefitType} /></div></section>

          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">2. Produto e condição</h3><p className="text-xs text-slate-500">{loadingRules ? 'Carregando condições disponíveis...' : 'As condições são consultadas nas integrações habilitadas para a modalidade e a espécie selecionadas.'}</p>
          {(operationCode === '2' || operationCode === '4') && <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h4 className="mb-3 text-sm font-bold">Dados do contrato atual para portabilidade</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field('Código do banco de origem', originLenderCode, setOriginLenderCode, 'number')}{field('Número do contrato', originContractNumber, setOriginContractNumber)}{field('Prazo original (meses)', originTerm, setOriginTerm, 'number')}{field('Parcelas restantes', originInstallmentsRemaining, setOriginInstallmentsRemaining, 'number')}{field('Valor da parcela atual (R$)', originInstallmentValue, setOriginInstallmentValue, 'number')}{field('Saldo devedor (R$)', originDueBalanceValue, setOriginDueBalanceValue, 'number')}</div></div>}
          {operationCode === '3' && <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h4 className="mb-2 text-sm font-bold">Dados para localizar o contrato de refinanciamento</h4><p className="text-xs text-slate-500">A busca usa o CPF e o benefício informados na primeira etapa.</p></div>}
          {operationCode === '4' && <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h4 className="mb-3 text-sm font-bold">Parâmetros do refinanciamento adicional</h4><div className="grid gap-3 sm:grid-cols-3">{selectField('Prazo do refinanciamento (meses)', refinanceTerm, setRefinanceTerm, availableTerms, 'Selecione o prazo')}{selectField('Taxa mensal do refinanciamento (%)', refinanceRate, setRefinanceRate, availableRates, 'Selecione a taxa')}{field('Parcela adicional (R$; 0 para manter a parcela atual)', refinanceInstallmentValue, setRefinanceInstallmentValue, 'number')}</div></div>}
          {operationCode === '1' && <div className="space-y-3"><div className="inline-flex rounded-lg border border-slate-200 p-1 dark:border-slate-700"><button type="button" onClick={() => { setNewSimulationMode('INSTALLMENT'); setCalculation(null); setQuotes([]); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${newSimulationMode === 'INSTALLMENT' ? 'bg-violet-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>Simular por parcela</button><button type="button" onClick={() => { setNewSimulationMode('AMOUNT'); setCalculation(null); setQuotes([]); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${newSimulationMode === 'AMOUNT' ? 'bg-violet-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}>Simular por valor liberado</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{newSimulationMode === 'AMOUNT' ? field('Valor liberado desejado (R$)', loanValue, value => { setLoanValue(value); setCalculation(null); setQuotes([]); }, 'number') : field('Valor da parcela desejado (R$)', installmentValue, value => { setInstallmentValue(value); setCalculation(null); setQuotes([]); }, 'number')}<label className={`${labelClass} flex items-center gap-2 self-end rounded-lg border border-slate-200 p-3 dark:border-slate-700`}><input type="checkbox" checked={hasInsurance} onChange={e => { setHasInsurance(e.target.checked); setCalculation(null); setQuotes([]); }} />Incluir seguro</label><label className={`${labelClass} flex items-center gap-2 self-end rounded-lg border border-slate-200 p-3 dark:border-slate-700`}><input type="checkbox" checked={nossaFintechLegalRepresentative} onChange={e => setNossaFintechLegalRepresentative(e.target.checked)} />Possui representante legal</label></div></div>}
          <div className="grid gap-3 sm:grid-cols-2">{selectField('Taxa mensal (%)', rate, value => { setRate(value); setCalculation(null); setQuotes([]); }, availableRates, 'Selecione a taxa')}{selectField('Prazo (meses)', term, value => { setTerm(value); setCalculation(null); setQuotes([]); }, availableTerms, 'Selecione o prazo')}</div>
          {!canCalculate && <p className="text-xs text-slate-500">Informe os dados obrigatorios do cliente acima e selecione os campos desta modalidade, taxa e prazo.</p>}<button type="button" onClick={handleCalculate} disabled={loading || loadingRules || !canCalculate} className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50 dark:border-violet-900 dark:text-violet-300">{loading ? 'Calculando...' : 'Calcular simulação'}</button>{quotes.length > 0 && <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><h4 className="text-sm font-bold">Ofertas disponíveis - selecione uma para continuar</h4>{quotes.map(quote => { const selected = String(ruleId) === String(quote.rule.id) && Boolean(calculation); const tableName = finantoTableLabel(quote.rule); const lenderName = quote.calculation?.lender?.name || quote.calculation?.fund?.name || quote.rule.lender?.name || quote.rule.lenderName || 'Instituicao nao identificada'; return <button type="button" key={String(quote.rule.id)} aria-pressed={selected} disabled={!quote.calculation} onClick={() => selectQuote(quote)} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm ${selected ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30' : 'border-slate-200 dark:border-slate-700'} disabled:cursor-not-allowed disabled:opacity-60`}><span><strong className="block">{tableName}</strong><span className="block text-xs text-slate-500">Integração: FINANTO · {lenderName} · tabela {quote.rule.code || quote.rule.id}</span>{quote.originContract && <span className="block text-xs text-slate-500">Contrato {quote.originContract.contractNumber} - saldo R$ {Number(quote.originContract.dueBalanceValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}{quote.error && <span className="block text-xs text-rose-600">{quote.error}</span>}{selected && <span className="block text-xs font-semibold text-violet-700 dark:text-violet-300">Oferta selecionada</span>}</span>{quote.calculation ? <span className="whitespace-nowrap text-right">{quote.calculation.loanValue != null ? `R$ ${Number(quote.calculation.loanValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Oferta valida'}{quote.calculation.installmentValue != null ? <span className="block text-xs">Parcela R$ {Number(quote.calculation.installmentValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> : null}</span> : <span className="text-xs text-slate-500">Indisponivel</span>}</button>})}</div>}{operationCode === '1' && (nossaFintechQuotes.length > 0 || nossaFintechError) && <div className="space-y-2 rounded-xl border border-emerald-200 p-3 dark:border-emerald-900"><h4 className="text-sm font-bold">Outras ofertas disponíveis</h4><p className="text-xs text-slate-500">Compare as condições retornadas pelas demais integrações.</p>{nossaFintechError && <p role="status" className="text-xs text-rose-600">{nossaFintechError}</p>}{nossaFintechQuotes.map((quote, index) => { const amount = getNossaFintechNovoAmount(quote.data); const tableName = quote.table?.nome_tabela || quote.table?.name || quote.table?.descricao || quote.table?.description || `Produto ${quote.table?.cod_produto ?? index + 1}`; return <div key={`${quote.table?.cod_produto ?? 'produto'}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><span><strong className="block">{tableName}</strong><span className="text-xs text-slate-500">Nossa Fintech - codigo {quote.table?.cod_produto ?? '-'}{quote.status ? ` - HTTP ${quote.status}` : ''}</span>{quote.error && <span className="block text-xs text-rose-600">{quote.error}</span>}</span><span className="text-right">{quote.success && amount != null ? `R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : quote.success ? 'Simulacao sem valor liberado no retorno' : 'Indisponivel'}{amount != null && <span className="block text-xs text-slate-500">Valor liberado</span>}</span></div>})}</div>}{calculation && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">Oferta selecionada: {calculation.loanValue != null ? `crédito R$ ${Number(calculation.loanValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'cálculo validado'}{calculation.installmentValue != null ? ` · parcela R$ ${Number(calculation.installmentValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}{calculation.rate != null ? ` · taxa ${calculation.rate}%` : ''}{calculation.term != null ? ` · ${calculation.term} meses` : ''}</div>}</section>

          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">3. Dados adicionais do cliente</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{field('Nome completo', name, setName)}{field('Início do benefício', benefitStartDate, setBenefitStartDate, 'date')}{field('UF do benefício', benefitState, setBenefitState, 'text', true, 2)}{field('Renda mensal (R$)', income, setIncome, 'number')}{field('Telefone com DDD', phone, setPhone)}{field('E-mail', email, setEmail, 'email')}</div></section>

          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">4. Endereço e documento</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{field('Logradouro', street, setStreet)}{field('Número', number, setNumber)}{field('Complemento', complement, setComplement, 'text', false)}{field('Bairro', district, setDistrict)}{field('Cidade', city, setCity)}{field('UF', state, setState, 'text', true, 2)}{field('CEP', zipCode, setZipCode)}<label className={labelClass}>Tipo de documento<select className={inputClass} value={documentType} onChange={e => setDocumentType(e.target.value)}><option value="RG">RG</option><option value="CNH">CNH</option></select></label>{field('Número do documento', documentNumber, setDocumentNumber)}{field('Data de emissão', issuingDate, setIssuingDate, 'date')}{field('Órgão emissor', issuingEntity, setIssuingEntity)}{field('UF emissora', issuingState, setIssuingState, 'text', true, 2)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Frente do documento (JPG, PNG ou PDF)<input className={inputClass} type="file" accept="image/jpeg,image/png,application/pdf" required onChange={e => setFront(e.target.files?.[0] || null)} /></label><label className={labelClass}>Verso do documento (JPG, PNG ou PDF)<input className={inputClass} type="file" accept="image/jpeg,image/png,application/pdf" required onChange={e => setBack(e.target.files?.[0] || null)} /></label></div></section>

          <section className="space-y-3"><h3 className="font-bold text-slate-900 dark:text-white">5. Conta para crédito e parceiro Sentinel</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className={labelClass}>Parceiro<select className={inputClass} required value={partnerId} onChange={e => setPartnerId(e.target.value)}><option value="">Selecione o parceiro</option>{availablePartners.map(partner => <option value={partner.id} key={partner.id}>{partner.name || partner.fullName}</option>)}</select></label>{field('Código do banco', bank, setBank)}{field('Agência', branch, setBranch)}{field('Conta', accountNumber, setAccountNumber)}{field('Dígito', accountDigit, setAccountDigit)}</div></section>
          <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">Os dados pessoais e documentos serão transmitidos à FINANTO para processamento desta simulação. Confirme que o cliente autorizou o tratamento e o envio antes de continuar. Arquivos temporários são removidos após o envio.</p>
          {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">Cancelar</button><button type="submit" disabled={loading || !calculation} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{loading ? 'Enviando...' : 'Criar simulação'}</button></div>
        </form>}
      </div>
    </section>
  </div>;
};
