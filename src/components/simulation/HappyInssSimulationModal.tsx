import React, { useState } from 'react';
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
  onClose: () => void;
  partners: Partner[];
  onSuccess: (simulation: SimulationRequest) => void;
}

type InssStep = 'CLIENTE' | 'IN100' | 'SIMULACAO' | 'RESULTADO';
type InssOpType = 'MARGEM_LIVRE' | 'PORTABILIDADE_REFIN';

export const HappyInssSimulationModal: React.FC<HappyInssSimulationModalProps> = ({
  isOpen,
  onClose,
  partners,
  onSuccess,
}) => {
  if (!isOpen) return null;

  const [step, setStep] = useState<InssStep>('CLIENTE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Cliente
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [dtNascimento, setDtNascimento] = useState('');
  const [escolaridade, setEscolaridade] = useState('1');
  const [tipoProduto, setTipoProduto] = useState('1216171824');
  const [numeroBeneficio, setNumeroBeneficio] = useState('');
  const [representanteLegal, setRepresentanteLegal] = useState(false);
  const [rogado, setRogado] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');

  // Identificadores gerados
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [happyClientId, setHappyClientId] = useState<string | null>(null);

  // Dados IN100
  const [in100Data, setIn100Data] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [formalizacaoUrl, setFormalizacaoUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Form Simulação
  const [opType, setOpType] = useState<InssOpType>('MARGEM_LIVRE');
  // Margem Livre
  const [valorParcela, setValorParcela] = useState('');
  const [prazo, setPrazo] = useState('84');
  // Portabilidade + Refin
  const [saldoDevedor, setSaldoDevedor] = useState('');
  const [numeroParcelas, setNumeroParcelas] = useState('84');
  const [valorParcelas, setValorParcelas] = useState('');
  const [valorParcelasRefin, setValorParcelasRefin] = useState('');
  const [numeroParcelasRefin, setNumeroParcelasRefin] = useState('84');
  const [taxaMensalRefin, setTaxaMensalRefin] = useState('1.66');
  const [cdBeneficioTipo, setCdBeneficioTipo] = useState('1');
  const [idExternoPlano, setIdExternoPlano] = useState('1');

  // Resultado
  const [simulationResult, setSimulationResult] = useState<any>(null);

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
          saldo_devedor: Number(saldoDevedor),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800">
        {/* HEADER */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Central de Simulações — Happy INSS
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consignado Público • Esteira IN100 & Margem
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-lg"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* PROGRESS STEP BAR */}
        <div className="px-6 pt-4 pb-2 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className={`flex items-center gap-1.5 font-bold ${step === 'CLIENTE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">1</span>
            <span>Cliente & IN100</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          <div className={`flex items-center gap-1.5 font-bold ${step === 'IN100' ? 'text-emerald-600 dark:text-emerald-400' : (isAuthorized ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400')}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">2</span>
            <span>Autorização</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          <div className={`flex items-center gap-1.5 font-bold ${step === 'SIMULACAO' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">3</span>
            <span>Condições</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          <div className={`flex items-center gap-1.5 font-bold ${step === 'RESULTADO' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">4</span>
            <span>Resultado</span>
          </div>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* PASSO 1: DADOS DO CLIENTE & BENEFÍCIO */}
          {step === 'CLIENTE' && (
            <form onSubmit={handleCadastrarClienteEConsultar} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    CPF DO CLIENTE <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={cpf}
                    onChange={handleCpfChange}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    NÚMERO DO BENEFÍCIO (10 DÍGITOS) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={numeroBeneficio}
                    onChange={handleBeneficioChange}
                    placeholder="Ex: 1234567890"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400">
                    {cleanBeneficio.length}/10 dígitos preenchidos
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    NOME COMPLETO <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Nome do cliente"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    TELEFONE (COM DDD) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="Ex: 11999998888"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    DATA DE NASCIMENTO
                  </label>
                  <input
                    type="date"
                    value={dtNascimento}
                    onChange={(e) => setDtNascimento(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ESCOLARIDADE
                  </label>
                  <select
                    value={escolaridade}
                    onChange={(e) => setEscolaridade(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="1">Não Alfabetizado</option>
                    <option value="2">Fundamental Incompleto</option>
                    <option value="3">Fundamental Completo</option>
                    <option value="4">Médio Completo</option>
                    <option value="5">Superior Completo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    TIPO PRODUTO
                  </label>
                  <input
                    type="number"
                    value={tipoProduto}
                    onChange={(e) => setTipoProduto(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={representanteLegal}
                    onChange={(e) => setRepresentanteLegal(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Possui Representante Legal</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rogado}
                    onChange={(e) => setRogado(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Assinatura a Rogo</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  PARCEIRO / CORRESPONDENTE VINCULADO (OPCIONAL)
                </label>
                <select
                  value={selectedPartnerId}
                  onChange={(e) => setSelectedPartnerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
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
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer transition-all"
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
              <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <span>Aguardando Autorização IN100 do Cliente</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  A consulta IN100 requer autorização digital do cliente beneficiário. Envie o link oficial de formalização gerado pela Happy abaixo para que o cliente realize o aceite.
                </p>

                {formalizacaoUrl ? (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200/80 dark:border-amber-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <span className="text-xs font-mono truncate text-slate-700 dark:text-slate-300 select-all">
                      {formalizacaoUrl}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-100 cursor-pointer"
                      >
                        {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
                      </button>
                      <a
                        href={formalizacaoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                        title="Abrir link"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs italic text-slate-500">
                    Processando na Dataprev/Previdência...
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('CLIENTE')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Voltar aos dados</span>
                </button>

                <button
                  type="button"
                  onClick={handleCheckIn100}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50 cursor-pointer"
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
                <div className="p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>IN100 Autorizada • Dados do Benefício {numeroBeneficio}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                      Margem Disponível
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900">
                      <span className="text-[10px] text-slate-400 block font-sans">Margem Livre</span>
                      <strong className="text-emerald-600 text-sm">
                        R$ {Number(in100Data.valor_margem || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900">
                      <span className="text-[10px] text-slate-400 block font-sans">Cartão Consignado (RMC)</span>
                      <strong className="text-slate-800 dark:text-slate-200 text-sm">
                        R$ {Number(in100Data.margem_livre_cartao_consignado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900">
                      <span className="text-[10px] text-slate-400 block font-sans">Cartão Benefício (RCC)</span>
                      <strong className="text-slate-800 dark:text-slate-200 text-sm">
                        R$ {Number(in100Data.margem_livre_cartao_beneficio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900">
                      <span className="text-[10px] text-slate-400 block font-sans">Total Margem</span>
                      <strong className="text-slate-800 dark:text-slate-200 text-sm">
                        R$ {Number(in100Data.margem_total_beneficio || in100Data.valor_margem || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* SELEÇÃO DO TIPO DE OPERAÇÃO */}
              <div className="flex border-b border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setOpType('MARGEM_LIVRE')}
                  className={`pb-2.5 px-4 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                    opType === 'MARGEM_LIVRE'
                      ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Margem Livre (Novo Empréstimo)
                </button>
                <button
                  type="button"
                  onClick={() => setOpType('PORTABILIDADE_REFIN')}
                  className={`pb-2.5 px-4 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                    opType === 'PORTABILIDADE_REFIN'
                      ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        VALOR DA PARCELA DESEJADA (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={valorParcela}
                        onChange={(e) => setValorParcela(e.target.value)}
                        placeholder="Ex: 250.00"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        PRAZO (QUANTIDADE DE PARCELAS)
                      </label>
                      <select
                        value={prazo}
                        onChange={(e) => setPrazo(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
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
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        SALDO DEVEDOR ESTIMADO (R$) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={saldoDevedor}
                        onChange={(e) => setSaldoDevedor(e.target.value)}
                        placeholder="Ex: 5000.00"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        VALOR DA PARCELA ATUAL (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={valorParcelas}
                        onChange={(e) => setValorParcelas(e.target.value)}
                        placeholder="Ex: 180.00"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        PARCELAS RESTANTES
                      </label>
                      <input
                        type="number"
                        value={numeroParcelas}
                        onChange={(e) => setNumeroParcelas(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        PARCELAS REFIN
                      </label>
                      <input
                        type="number"
                        value={numeroParcelasRefin}
                        onChange={(e) => setNumeroParcelasRefin(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        TAXA MENSAL REFIN (% a.m.)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={taxaMensalRefin}
                        onChange={(e) => setTaxaMensalRefin(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSimularPortabilidade}
                      disabled={loading || !saldoDevedor}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
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
              <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span>Simulação Concluída com Sucesso</span>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-200/60 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                    {opType === 'MARGEM_LIVRE' ? 'Margem Livre' : 'Portabilidade + Refin'}
                  </span>
                </div>

                <div className="pt-2">
                  <pre className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-emerald-200/60 dark:border-emerald-900/60 text-[11px] font-mono overflow-x-auto max-h-60 text-slate-800 dark:text-slate-200">
                    {JSON.stringify(simulationResult, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('SIMULACAO')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Nova Simulação de Condições</span>
                </button>

                <button
                  type="button"
                  onClick={handleFinish}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
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
