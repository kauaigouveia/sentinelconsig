import { PortabilityReviewFields } from './PortabilityReviewFields';
import { BankCodeSelect } from '../common/BankCodeSelect';
import { SimulationBack } from './SimulationSteps';
import { CurrencyInput } from '../common/CurrencyInput';
import React, { useEffect, useState } from 'react';
import {
  Building2,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  DollarSign,
  FileCheck2,
  ShieldAlert,
} from 'lucide-react';
import { Partner, SimulationRequest } from '../../types';
import { formatCpf, normalizeCpf, isValidCpf } from '../../lib/utils';
import { PartnerSearchSelect } from '../common/PartnerSearchSelect';

interface HappyInssSimulationModalProps {
  isOpen: boolean;
  embedded?: boolean;
  initialOperation?: 'MARGEM_LIVRE' | 'PORTABILIDADE_REFIN';
  initialData?: { cpf?: string; name?: string; phone?: string; birthDate?: string; benefit?: string; partnerId?: string };
  onClose: () => void;
  onBack?: () => void;
  partners: Partner[];
  onSuccess: (simulation: SimulationRequest) => void;
}

type InssStep = 'CLIENTE' | 'IN100' | 'SIMULACAO' | 'RESULTADO';
type InssOpType = 'MARGEM_LIVRE' | 'PORTABILIDADE_REFIN';

export const HappyInssSimulationModal: React.FC<HappyInssSimulationModalProps> = ({
  isOpen,
  embedded = false,
  initialOperation = 'MARGEM_LIVRE',
  initialData,
  onClose,
  onBack,
  partners,
  onSuccess,
}) => {
  const [portabilityContext,setPortabilityContext]=useState<Record<string,string>>({});
  const [step, setStep] = useState<InssStep>('CLIENTE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Cliente
  const [nome, setNome] = useState(initialData?.name || '');
  const [telefone, setTelefone] = useState(initialData?.phone || '');
  const [cpf, setCpf] = useState(initialData?.cpf || '');
  const [dtNascimento, setDtNascimento] = useState(initialData?.birthDate || '');
  const [escolaridade, setEscolaridade] = useState('1');
  const [tipoProduto, setTipoProduto] = useState('1216171824');
  const [numeroBeneficio, setNumeroBeneficio] = useState(initialData?.benefit || '');
  const [representanteLegal, setRepresentanteLegal] = useState(false);
  const [rogado, setRogado] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState(initialData?.partnerId || '');

  // Identificadores gerados
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [happyClientId, setHappyClientId] = useState<string | null>(null);

  // Dados IN100
  const [in100Data, setIn100Data] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [formalizacaoUrl, setFormalizacaoUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form Simulação
  const [opType, setOpType] = useState<InssOpType>(initialOperation);
  // Margem Livre
  const [valorParcela, setValorParcela] = useState('');
  const [prazo, setPrazo] = useState('84');
  // Portabilidade + Refin
  const [saldoDevedor, setSaldoDevedor] = useState('');
  const [originalBank,setOriginalBank]=useState('');
  const [paidInstallments,setPaidInstallments]=useState('');
  const [numeroParcelas, setNumeroParcelas] = useState('84');
  const [valorParcelas, setValorParcelas] = useState('');
  const [valorParcelasRefin, setValorParcelasRefin] = useState('');
  const [numeroParcelasRefin, setNumeroParcelasRefin] = useState('84');
  const [taxaMensalRefin, setTaxaMensalRefin] = useState('1.85');
  const [cdBeneficioTipo, setCdBeneficioTipo] = useState('1');
  const [idExternoPlano, setIdExternoPlano] = useState('1');

  // Resultado
  const [simulationResult, setSimulationResult] = useState<any>(null);

  useEffect(()=>{setPortabilityContext({});},[cpf]);
  useEffect(() => { if (embedded && step === 'CLIENTE') { if (initialData?.name) setNome(initialData.name); if (initialData?.phone) setTelefone(initialData.phone); if (initialData?.cpf) setCpf(initialData.cpf); if (initialData?.birthDate) setDtNascimento(initialData.birthDate); if (initialData?.benefit) setNumeroBeneficio(initialData.benefit); if (initialData?.partnerId) setSelectedPartnerId(initialData.partnerId); } }, [embedded, step, initialData?.name, initialData?.phone, initialData?.cpf, initialData?.birthDate, initialData?.benefit, initialData?.partnerId]);

  if (!isOpen) return null;

  const cleanCpf = normalizeCpf(cpf);
  const cleanBeneficio = numeroBeneficio.replace(/\D/g, '');

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCpf(e.target.value));
  };

  const handleBeneficioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    setNumeroBeneficio(digits);
  };

  // 1. Cadastrar cliente e consultar IN100
  const handleCadastrarClienteEConsultar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (cleanCpf.length !== 11 || !isValidCpf(cleanCpf)) {
      setError('Informe um CPF válido com 11 dígitos.');
      return;
    }

    if (cleanBeneficio.length !== 10) {
      setError('O número do benefício INSS deve conter exatamente 10 dígitos numéricos.');
      return;
    }

    if (!nome.trim() || !telefone.trim()) {
      setError('Nome e telefone são obrigatórios.');
      return;
    }

    setLoading(true);

    try {
      // 1. Cria cliente na Happy
      const cliRes = await fetch('/api/integrations/happy/inss/cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          telefone: telefone.replace(/\D/g, ''),
          cpf: cleanCpf,
          dt_nascimento: dtNascimento || '1980-01-01',
          escolaridade: Number(escolaridade) || 1,
          tipo_produto: Number(tipoProduto) || 1216171824,
          numero_beneficio: cleanBeneficio,
          representante_legal: representanteLegal,
          rogado,
          partnerId: selectedPartnerId || undefined,
        }),
      });

      const cliJson = await cliRes.json();
      if (!cliRes.ok) {
        throw new Error(cliJson.error || 'Erro ao cadastrar cliente na Happy.');
      }

      setSimulationId(cliJson.simulationId);
      setHappyClientId(String(cliJson.id_cliente));

      // 2. Consulta IN100 imediatamente
      const in100Res = await fetch('/api/integrations/happy/inss/in100', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: cleanCpf,
          numero_beneficio: cleanBeneficio,
          tipo_produto: Number(tipoProduto) || 1216171824,
          simulationId: cliJson.simulationId,
        }),
      });

      const in100Json = await in100Res.json();
      if (!in100Res.ok) {
        throw new Error(in100Json.error || 'Erro ao consultar IN100.');
      }

      setIn100Data(in100Json);
      setIsAuthorized(Boolean(in100Json.in100_autorizada));
      if (in100Json.url_formalizacao) {
        setFormalizacaoUrl(in100Json.url_formalizacao);
      }

      if (in100Json.in100_autorizada) {
        if (in100Json.valor_margem) {
          setValorParcela(String(in100Json.valor_margem));
        }
        setStep('SIMULACAO');
      } else {
        setStep('IN100');
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao processar a solicitação.');
    } finally {
      setLoading(false);
    }
  };

  // Verificar autorização IN100 (polling controlado)
  const handleCheckIn100 = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/integrations/happy/inss/in100', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: cleanCpf,
          numero_beneficio: cleanBeneficio,
          tipo_produto: Number(tipoProduto) || 1216171824,
          simulationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao checar status da IN100.');
      }

      setIn100Data(data);
      if (data.in100_autorizada) {
        setIsAuthorized(true);
        if (data.valor_margem) {
          setValorParcela(String(data.valor_margem));
        }
        setStep('SIMULACAO');
      } else if (data.url_formalizacao) {
        setFormalizacaoUrl(data.url_formalizacao);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao checar autorização.');
    } finally {
      setLoading(false);
    }
  };

  // Copiar link de autorização
  const handleCopyLink = () => {
    if (!formalizacaoUrl) return;
    navigator.clipboard.writeText(formalizacaoUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Simular Margem Livre
  const handleSimularMargemLivre = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/integrations/happy/inss/simulacao-margem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: cleanCpf,
          numero_beneficio: cleanBeneficio,
          valor_parcela: Number(valorParcela) || undefined,
          prazo: Number(prazo) || 84,
          tipo_produto: Number(tipoProduto) || 1216171824,
          simulationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao realizar simulação de margem livre.');
      }

      setSimulationResult(data.result);
      setStep('RESULTADO');
    } catch (err: any) {
      setError(err.message || 'Erro na simulação.');
    } finally {
      setLoading(false);
    }
  };

  // Simular Portabilidade + Refin
  const handleSimularPortabilidade = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/integrations/happy/inss/simulacao-portabilidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: cleanCpf,
          ...portabilityContext,saldo_devedor: Number(saldoDevedor), originalBank, paidInstallments: paidInstallments==''?undefined:Number(paidInstallments), birthDate: dtNascimento,
          numero_parcelas: Number(numeroParcelas),
          valor_parcelas: Number(valorParcelas),
          valor_parcelas_refin: Number(valorParcelasRefin),
          numero_parcelas_refin: Number(numeroParcelasRefin),
          taxa_mensal_refin: Number(taxaMensalRefin),
          cd_beneficio_tipo: Number(cdBeneficioTipo),
          id_externo_plano: idExternoPlano,
          simulationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao simular portabilidade.');
      }

      setSimulationResult(data.result);
      setStep('RESULTADO');
    } catch (err: any) {
      setError(err.message || 'Erro na simulação de portabilidade.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    if (simulationId) {
      try {
        const res = await fetch(`/api/simulations/${simulationId}`);
        if (res.ok) {
          const sim = await res.json();
          onSuccess(sim);
        }
      } catch {}
    }
    onClose();
  };

  return (
    <div className={embedded ? "min-w-0" : "fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs animate-in fade-in"}>
      <div className={embedded ? "w-full min-w-0 rounded-xl border border-[var(--field-border)] bg-[var(--bg-surface)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]" : "relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  border border-[var(--field-border)] dark:border-[var(--field-border)]"}>
        {/* HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[var(--success-bg)] text-[var(--success-text)] flex items-center justify-center  shadow-emerald-600/20">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <SimulationBack onBack={onBack}/><h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Central de Simulações — Happy INSS
              </h3>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Consignado Público • Esteira IN100 & Margem
              </p>
            </div>
          </div>
          <button
            type="button"
            hidden={embedded}
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] cursor-pointer p-1 rounded-lg"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* PROGRESS STEP BAR */}
        <div className="px-6 pt-4 pb-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between text-xs">
          <div className={`flex items-center gap-1.5 font-bold ${step === 'CLIENTE' ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' : 'text-[var(--text-secondary)]'}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">1</span>
            <span>Cliente & IN100</span>
          </div>
          <ChevronRight className="h-4 w-4 text-[var(--text-primary)] dark:text-[var(--text-secondary)]" />
          <div className={`flex items-center gap-1.5 font-bold ${step === 'IN100' ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' : (isAuthorized ? 'text-[var(--text-secondary)] dark:text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">2</span>
            <span>Autorização</span>
          </div>
          <ChevronRight className="h-4 w-4 text-[var(--text-primary)] dark:text-[var(--text-secondary)]" />
          <div className={`flex items-center gap-1.5 font-bold ${step === 'SIMULACAO' ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' : 'text-[var(--text-secondary)]'}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">3</span>
            <span>Condições</span>
          </div>
          <ChevronRight className="h-4 w-4 text-[var(--text-primary)] dark:text-[var(--text-secondary)]" />
          <div className={`flex items-center gap-1.5 font-bold ${step === 'RESULTADO' ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' : 'text-[var(--text-secondary)]'}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">4</span>
            <span>Resultado</span>
          </div>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] text-[var(--danger-text)] dark:text-[var(--danger-text)] text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* PASSO 1: DADOS DO CLIENTE & BENEFÍCIO */}
          {step === 'CLIENTE' && (
            <form onSubmit={handleCadastrarClienteEConsultar} className="space-y-4">
              <PortabilityReviewFields value={portabilityContext} onChange={setPortabilityContext}/>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    CPF DO CLIENTE <span className="text-[var(--danger-text)]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={cpf}
                    onChange={handleCpfChange}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[var(--success-border)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    NÚMERO DO BENEFÍCIO (10 DÍGITOS) <span className="text-[var(--danger-text)]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={numeroBeneficio}
                    onChange={handleBeneficioChange}
                    placeholder="Ex: 1234567890"
                    className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[var(--success-border)]"
                  />
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {cleanBeneficio.length}/10 dígitos preenchidos
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    NOME COMPLETO <span className="text-[var(--danger-text)]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Nome do cliente"
                    className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--success-border)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    TELEFONE (COM DDD) <span className="text-[var(--danger-text)]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="Ex: 11999998888"
                    className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--success-border)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    DATA DE NASCIMENTO
                  </label>
                  <input
                    type="date"
                    value={dtNascimento}
                    onChange={(e) => setDtNascimento(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--success-border)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    ESCOLARIDADE
                  </label>
                  <select
                    value={escolaridade}
                    onChange={(e) => setEscolaridade(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--success-border)]"
                  >
                    <option value="1">Não Alfabetizado</option>
                    <option value="2">Fundamental Incompleto</option>
                    <option value="3">Fundamental Completo</option>
                    <option value="4">Médio Completo</option>
                    <option value="5">Superior Completo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    TIPO PRODUTO
                  </label>
                  <input
                    type="number"
                    value={tipoProduto}
                    onChange={(e) => setTipoProduto(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[var(--success-border)]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={representanteLegal}
                    onChange={(e) => setRepresentanteLegal(e.target.checked)}
                    className="rounded text-[var(--success-text)] focus:ring-[var(--success-border)]"
                  />
                  <span>Possui Representante Legal</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rogado}
                    onChange={(e) => setRogado(e.target.checked)}
                    className="rounded text-[var(--success-text)] focus:ring-[var(--success-border)]"
                  />
                  <span>Assinatura a Rogo</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  PARCEIRO / CORRESPONDENTE VINCULADO (OPCIONAL)
                </label>
                <select
                  value={selectedPartnerId}
                  onChange={(e) => setSelectedPartnerId(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--success-border)]"
                >
                  <option value="">Nenhum parceiro específico</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.login} — {p.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] font-bold text-xs flex items-center gap-2   disabled:opacity-90 cursor-pointer transition-all"
                >
                  {loading ? (
                    <>
                      <RotateCcw className="h-4 w-4 animate-spin" />
                      <span>Cadastrando & Consultando IN100...</span>
                    </>
                  ) : (
                    <>
                      <span>Cadastrar Cliente & Consultar IN100</span>
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* PASSO 2: STATUS DA IN100 & FORMALIZAÇÃO */}
          {step === 'IN100' && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border border-[var(--warning-border)] dark:border-[var(--warning-border)] text-[var(--warning-text)] dark:text-[var(--warning-text)] space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-[var(--warning-text)] dark:text-[var(--warning-text)]">
                  <Clock className="h-5 w-5 text-[var(--warning-text)]" />
                  <span>Aguardando Autorização IN100 do Cliente</span>
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  A consulta IN100 requer autorização digital do cliente beneficiário. Envie o link oficial de formalização gerado pela Happy abaixo para que o cliente realize o aceite.
                </p>

                {formalizacaoUrl ? (
                  <div className="p-3 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-xl border border-[var(--warning-border)] dark:border-[var(--warning-border)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <span className="text-xs font-mono truncate text-[var(--text-secondary)] dark:text-[var(--text-primary)] select-all">
                      {formalizacaoUrl}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="px-3 py-1.5 rounded-lg bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border border-[var(--success-border)] dark:border-[var(--success-border)] text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--success-bg)] cursor-pointer"
                      >
                        {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
                      </button>
                      <a
                        href={formalizacaoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]"
                        title="Abrir link"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs italic text-[var(--text-secondary)]">
                    Processando na Dataprev/Previdência...
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('CLIENTE')}
                  className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Voltar aos dados</span>
                </button>

                <button
                  type="button"
                  onClick={handleCheckIn100}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs flex items-center gap-2   disabled:opacity-90 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RotateCcw className="h-4 w-4 animate-spin" />
                      <span>Checando status...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      <span>Verificar Autorização Novamente</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* PASSO 3: SIMULAÇÃO DAS CONDIÇÕES */}
          {step === 'SIMULACAO' && (
            <div className="space-y-5">
              {/* RESUMO DAS MARGENS */}
              {in100Data && (
                <div className="p-4 rounded-xl bg-[var(--success-bg)] dark:bg-[var(--success-bg)] border border-[var(--success-border)] dark:border-[var(--success-border)] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-[var(--success-text)] dark:text-[var(--success-text)]">
                      <CheckCircle2 className="h-4 w-4 text-[var(--success-text)]" />
                      <span>IN100 Autorizada • Dados do Benefício {numeroBeneficio}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)]">
                      Margem Disponível
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--success-border)] dark:border-[var(--success-border)]">
                      <span className="text-[10px] text-[var(--text-secondary)] block font-sans">Margem Livre</span>
                      <strong className="text-[var(--success-text)] text-sm">
                        R$ {Number(in100Data.valor_margem || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--success-border)] dark:border-[var(--success-border)]">
                      <span className="text-[10px] text-[var(--text-secondary)] block font-sans">Cartão Consignado (RMC)</span>
                      <strong className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-sm">
                        R$ {Number(in100Data.margem_livre_cartao_consignado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--success-border)] dark:border-[var(--success-border)]">
                      <span className="text-[10px] text-[var(--text-secondary)] block font-sans">Cartão Benefício (RCC)</span>
                      <strong className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-sm">
                        R$ {Number(in100Data.margem_livre_cartao_beneficio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--success-border)] dark:border-[var(--success-border)]">
                      <span className="text-[10px] text-[var(--text-secondary)] block font-sans">Total Margem</span>
                      <strong className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-sm">
                        R$ {Number(in100Data.margem_total_beneficio || in100Data.valor_margem || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* SELEÇÃO DO TIPO DE OPERAÇÃO */}
              <div className="flex border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                <button
                  type="button"
                  onClick={() => setOpType('MARGEM_LIVRE')}
                  className={`pb-2.5 px-4 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                    opType === 'MARGEM_LIVRE'
                      ? 'border-[var(--success-border)] text-[var(--success-text)] dark:text-[var(--success-text)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
                  }`}
                >
                  Margem Livre (Novo Empréstimo)
                </button>
                <button
                  type="button"
                  onClick={() => setOpType('PORTABILIDADE_REFIN')}
                  className={`pb-2.5 px-4 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                    opType === 'PORTABILIDADE_REFIN'
                      ? 'border-[var(--success-border)] text-[var(--success-text)] dark:text-[var(--success-text)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
                  }`}
                >
                  Portabilidade + Refinanciamento
                </button>
              </div>

              {/* FORM MARGEM LIVRE */}
              {opType === 'MARGEM_LIVRE' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                        VALOR DA PARCELA DESEJADA (R$)
                      </label>
                      <CurrencyInput
                        step="0.01"
                        value={valorParcela}
                        onValueChange={value => setValorParcela(value)}
                        placeholder="Ex: 250,00"
                        className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[var(--success-border)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                        PRAZO (QUANTIDADE DE PARCELAS)
                      </label>
                      <select
                        value={prazo}
                        onChange={(e) => setPrazo(e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--success-border)]"
                      >
                        <option value="84">84 meses</option>
                        <option value="72">72 meses</option>
                        <option value="60">60 meses</option>
                        <option value="48">48 meses</option>
                        <option value="36">36 meses</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSimularMargemLivre}
                      disabled={loading}
                      className="px-5 py-2.5 rounded-xl bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] font-bold text-xs flex items-center gap-2   disabled:opacity-90 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <RotateCcw className="h-4 w-4 animate-spin" />
                          <span>Calculando simulação...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          <span>Simular Margem Livre Happy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* FORM PORTABILIDADE + REFIN */}
              {opType === 'PORTABILIDADE_REFIN' && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2"><div className="text-xs font-semibold"><BankCodeSelect label="Banco de origem" value={originalBank} onChange={setOriginalBank} className="mt-2 w-full rounded-lg border border-[var(--field-border)] bg-transparent p-2"/></div><label className="text-xs font-semibold">Parcelas pagas<input type="number" min={0} step={1} value={paidInstallments} onChange={event=>setPaidInstallments(event.target.value)} className="mt-2 w-full rounded-lg border border-[var(--field-border)] bg-transparent p-2"/></label></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                        SALDO DEVEDOR ESTIMADO (R$) <span className="text-[var(--danger-text)]">*</span>
                      </label>
                      <CurrencyInput
                        step="0.01"
                        required
                        value={saldoDevedor}
                        onValueChange={value => setSaldoDevedor(value)}
                        placeholder="Ex: 5.000,00"
                        className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[var(--success-border)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                        VALOR DA PARCELA ATUAL (R$)
                      </label>
                      <CurrencyInput
                        step="0.01"
                        value={valorParcelas}
                        onValueChange={value => setValorParcelas(value)}
                        placeholder="Ex: 180,00"
                        className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[var(--success-border)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                        PARCELAS RESTANTES
                      </label>
                      <input
                        type="number"
                        value={numeroParcelas}
                        onChange={(e) => setNumeroParcelas(e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                        PARCELAS REFIN
                      </label>
                      <input
                        type="number"
                        value={numeroParcelasRefin}
                        onChange={(e) => setNumeroParcelasRefin(e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                        TAXA MENSAL REFIN (% a.m.)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={taxaMensalRefin}
                        onChange={(e) => setTaxaMensalRefin(e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSimularPortabilidade}
                      disabled={loading || !saldoDevedor}
                      className="px-5 py-2.5 rounded-xl bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] font-bold text-xs flex items-center gap-2   disabled:opacity-90 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <RotateCcw className="h-4 w-4 animate-spin" />
                          <span>Simulando portabilidade...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          <span>Simular Portabilidade + Refin Happy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PASSO 4: RESULTADO DA SIMULAÇÃO */}
          {step === 'RESULTADO' && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-[var(--success-bg)] dark:bg-[var(--success-bg)] border border-[var(--success-border)] dark:border-[var(--success-border)] text-[var(--success-text)] dark:text-[var(--success-text)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-[var(--success-text)] dark:text-[var(--success-text)]">
                    <CheckCircle2 className="h-5 w-5 text-[var(--success-text)]" />
                    <span>Simulação Concluída com Sucesso</span>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)]">
                    {opType === 'MARGEM_LIVRE' ? 'Margem Livre' : 'Portabilidade + Refin'}
                  </span>
                </div>

                <div className="pt-2">
                  <pre className="p-3.5 rounded-xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--success-border)] dark:border-[var(--success-border)] text-[11px] font-mono overflow-x-auto max-h-60 text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    {JSON.stringify(simulationResult, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('SIMULACAO')}
                  className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Nova Simulação de Condições</span>
                </button>

                <button
                  type="button"
                  onClick={handleFinish}
                  className="px-6 py-2.5 rounded-xl bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] font-bold text-xs flex items-center gap-2   cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>Salvar e Fechar</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
