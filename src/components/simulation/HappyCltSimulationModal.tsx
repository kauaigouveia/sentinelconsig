import React, { useState } from 'react';
import {
  Briefcase,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import { Partner, SimulationRequest } from '../../types';
import { formatCpf, normalizeCpf, isValidCpf } from '../../lib/utils';

interface HappyCltSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  partners: Partner[];
  onSuccess: (simulation: SimulationRequest) => void;
}

type CltStep = 'CLIENTE' | 'DATAPREV' | 'SIMULACAO' | 'RESULTADO';

export const HappyCltSimulationModal: React.FC<HappyCltSimulationModalProps> = ({
  isOpen,
  onClose,
  partners,
  onSuccess,
}) => {
  if (!isOpen) return null;

  const [step, setStep] = useState<CltStep>('CLIENTE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Cliente CLT
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [dataAutorizacaoDataprev, setDataAutorizacaoDataprev] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  });
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [canalCpfAgente, setCanalCpfAgente] = useState('');

  // Identificadores gerados
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [happyClientId, setHappyClientId] = useState<string | null>(null);
  const [dataprevData, setDataprevData] = useState<any>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Condição selecionada para simulação de contrato
  const [selectedConditionIndex, setSelectedConditionIndex] = useState<number>(0);
  const [quantidadeParcelas, setQuantidadeParcelas] = useState<number>(24);
  const [valorSolicitado, setValorSolicitado] = useState<string>('');
  const [valorParcela, setValorParcela] = useState<string>('');

  // Resultado
  const [simulationResult, setSimulationResult] = useState<any>(null);

  const cleanCpf = normalizeCpf(cpf);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCpf(e.target.value));
  };

  // 1. Cadastrar cliente e consultar Dataprev
  const handleCadastrarClienteEConsultar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (cleanCpf.length !== 11 || !isValidCpf(cleanCpf)) {
      setError('Informe um CPF válido com 11 dígitos.');
      return;
    }

    if (!nome.trim() || !telefone.trim()) {
      setError('Nome e telefone são obrigatórios.');
      return;
    }

    setLoading(true);

    try {
      // 1. Cria cliente CLT
      const cliRes = await fetch('/api/integrations/happy/clt/cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          telefone: telefone.replace(/\D/g, ''),
          cpf: cleanCpf,
          data_autorizacao_dataprev: dataAutorizacaoDataprev,
          canal_autorizacao_digital: 2,
          canal_origem_solicitacao: 'B2C',
          canal_cpf_agente: canalCpfAgente ? canalCpfAgente.replace(/\D/g, '') : undefined,
          partnerId: selectedPartnerId || undefined,
        }),
      });

      const cliJson = await cliRes.json();
      if (!cliRes.ok) {
        throw new Error(cliJson.error || 'Erro ao cadastrar cliente CLT na Happy.');
      }

      setSimulationId(cliJson.simulationId);

      // 2. Consulta Dataprev CLT
      const dpRes = await fetch('/api/integrations/happy/clt/dataprev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          telefone: telefone.replace(/\D/g, ''),
          cpf: cleanCpf,
          simulationId: cliJson.simulationId,
        }),
      });

      const dpJson = await dpRes.json();
      if (!dpRes.ok) {
        throw new Error(dpJson.error || 'Erro ao consultar Dataprev CLT.');
      }

      setDataprevData(dpJson.result);
      setIsApproved(Boolean(dpJson.isApproved));

      if (dpJson.result?.id_cliente) {
        setHappyClientId(String(dpJson.result.id_cliente));
      }

      if (dpJson.isApproved && Array.isArray(dpJson.result?.valores_credito) && dpJson.result.valores_credito.length > 0) {
        const first = dpJson.result.valores_credito[0];
        setQuantidadeParcelas(first.max_parcelas || 24);
        setValorSolicitado(String(first.max_valor || 1000));
        setStep('SIMULACAO');
      } else {
        setStep('DATAPREV');
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao processar a solicitação.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Polling Dataprev
  const handleCheckDataprev = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/integrations/happy/clt/dataprev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          telefone: telefone.replace(/\D/g, ''),
          cpf: cleanCpf,
          simulationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao consultar status Dataprev.');
      }

      setDataprevData(data.result);
      setIsApproved(Boolean(data.isApproved));

      if (data.result?.id_cliente) {
        setHappyClientId(String(data.result.id_cliente));
      }

      if (data.isApproved && Array.isArray(data.result?.valores_credito) && data.result.valores_credito.length > 0) {
        const first = data.result.valores_credito[0];
        setQuantidadeParcelas(first.max_parcelas || 24);
        setValorSolicitado(String(first.max_valor || 1000));
        setStep('SIMULACAO');
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao checar Dataprev.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!dataprevData?.url_consulta_autorizacao) return;
    navigator.clipboard.writeText(dataprevData.url_consulta_autorizacao);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // 3. Simular Contrato CLT
  const handleSimularContrato = async () => {
    setError(null);

    const conditions = dataprevData?.valores_credito || [];
    const condition = conditions[selectedConditionIndex] || conditions[0] || {};
    const clientIdToUse = happyClientId || dataprevData?.id_cliente;

    if (!clientIdToUse) {
      setError('ID do cliente não encontrado para simulação.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/integrations/happy/clt/simulacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clientIdToUse,
          quantidade_parcelas: Number(quantidadeParcelas),
          valor_solicitado: valorSolicitado ? Number(valorSolicitado) : null,
          valor_parcela: valorParcela ? Number(valorParcela) : null,
          taxa: condition.max_taxa || null,
          base_juros: condition.base_juros || null,
          chave_seguro: condition.chave_seguro || null,
          selectedCondition: condition,
          simulationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro na simulação do contrato CLT.');
      }

      setSimulationResult(data.result);
      setStep('RESULTADO');
    } catch (err: any) {
      setError(err.message || 'Falha ao simular contrato.');
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
            <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Central de Simulações — Happy CLT
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consignado Privado • Dataprev & Contrato
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
          <div className={`flex items-center gap-1.5 font-bold ${step === 'CLIENTE' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">1</span>
            <span>Cliente CLT</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          <div className={`flex items-center gap-1.5 font-bold ${step === 'DATAPREV' ? 'text-indigo-600 dark:text-indigo-400' : (isApproved ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400')}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">2</span>
            <span>Dataprev</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          <div className={`flex items-center gap-1.5 font-bold ${step === 'SIMULACAO' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">3</span>
            <span>Contrato</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          <div className={`flex items-center gap-1.5 font-bold ${step === 'RESULTADO' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
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

          {/* PASSO 1: DADOS CLIENTE CLT */}
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500"
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  NOME COMPLETO <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome do trabalhador CLT"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    DATA/HORA AUTORIZAÇÃO DATAPREV (DDMMAAAAHHMMSS)
                  </label>
                  <input
                    type="text"
                    value={dataAutorizacaoDataprev}
                    onChange={(e) => setDataAutorizacaoDataprev(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400">
                    Preenchido automaticamente no padrão Happy
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    PARCEIRO / AGENTE VINCULADO (OPCIONAL)
                  </label>
                  <select
                    value={selectedPartnerId}
                    onChange={(e) => setSelectedPartnerId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Nenhum parceiro específico</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.login} — {p.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  CPF DO AGENTE AUTORIZADO (OPCIONAL)
                </label>
                <input
                  type="text"
                  value={canalCpfAgente}
                  onChange={(e) => setCanalCpfAgente(formatCpf(e.target.value))}
                  placeholder="000.000.000-00 (deixe em branco para usar o do parceiro ou sistema)"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400">
                  Enviado no campo canal_cpf_agente exigido pela Happy
                </span>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer transition-all"
                >
                  {loading ? (
                    <>
                      <RotateCcw className="h-4 w-4 animate-spin" />
                      <span>Cadastrando & Consultando Dataprev...</span>
                    </>
                  ) : (
                    <>
                      <span>Cadastrar Cliente & Consultar Dataprev</span>
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* PASSO 2: DATAPREV STATUS / AUTORIZAÇÃO */}
          {step === 'DATAPREV' && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <span>Aguardando Autorização Digital Dataprev</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  O convênio CLT exige que o trabalhador autorize a consulta aos seus dados da carteira digital / Dataprev. Envie o link abaixo para o cliente.
                </p>

                {dataprevData?.url_consulta_autorizacao ? (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200/80 dark:border-amber-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <span className="text-xs font-mono truncate text-slate-700 dark:text-slate-300 select-all">
                      {dataprevData.url_consulta_autorizacao}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold flex items-center gap-1.5 hover:bg-indigo-100 cursor-pointer"
                      >
                        {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
                      </button>
                      <a
                        href={dataprevData.url_consulta_autorizacao}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                        title="Abrir link de autorização"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs italic text-slate-500">
                    Situação: {dataprevData?.situacao || 'Em processamento Dataprev'}
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
                  onClick={handleCheckDataprev}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RotateCcw className="h-4 w-4 animate-spin" />
                      <span>Verificando Dataprev...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      <span>Checar Autorização / Aprovação</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* PASSO 3: CONDIÇÕES APROVADAS & SIMULAÇÃO DO CONTRATO */}
          {step === 'SIMULACAO' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-xs text-indigo-800 dark:text-indigo-300">
                    <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                    <span>Aprovado pelo Motor de Crédito Dataprev</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                    Condições Liberadas
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Selecione a faixa de crédito aprovada para o trabalhador CLT e configure os parâmetros da contratação:
                </p>

                {/* LISTA DE CONDIÇÕES APROVADAS */}
                <div className="space-y-2 pt-2">
                  {Array.isArray(dataprevData?.valores_credito) &&
                    dataprevData.valores_credito.map((cond: any, idx: number) => (
                      <label
                        key={idx}
                        className={`flex items-start justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedConditionIndex === idx
                            ? 'border-indigo-600 bg-white dark:bg-slate-900 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="condition"
                            checked={selectedConditionIndex === idx}
                            onChange={() => {
                              setSelectedConditionIndex(idx);
                              setQuantidadeParcelas(cond.max_parcelas || 24);
                              setValorSolicitado(String(cond.max_valor || 1000));
                            }}
                            className="mt-1 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="text-xs space-y-1">
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              {cond.min_parcelas} a {cond.max_parcelas} parcelas
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              Valor Liberado: R$ {Number(cond.min_valor || 0).toFixed(2)} até R$ {Number(cond.max_valor || 0).toFixed(2)}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              Parcela: R$ {Number(cond.min_valor_parcela || 0).toFixed(2)} até R$ {Number(cond.max_valor_parcela || 0).toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono block">
                            Taxa: {cond.max_taxa}% a.m.
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Status: {cond.status_motor}
                          </span>
                        </div>
                      </label>
                    ))}
                </div>
              </div>

              {/* PARÂMETROS DA SIMULAÇÃO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    QUANTIDADE DE PARCELAS DESEJADA
                  </label>
                  <input
                    type="number"
                    value={quantidadeParcelas}
                    onChange={(e) => setQuantidadeParcelas(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    VALOR SOLICITADO (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={valorSolicitado}
                    onChange={(e) => setValorSolicitado(e.target.value)}
                    placeholder="Ex: 3500.00"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleSimularContrato}
                  disabled={loading || !quantidadeParcelas}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RotateCcw className="h-4 w-4 animate-spin" />
                      <span>Calculando contrato CLT...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Simular Contrato CLT Happy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* PASSO 4: RESULTADO DA SIMULAÇÃO */}
          {step === 'RESULTADO' && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-950 dark:text-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-indigo-800 dark:text-indigo-300">
                    <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                    <span>Contrato CLT Simulado com Sucesso</span>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200">
                    Consignado Privado
                  </span>
                </div>

                {simulationResult && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900">
                      <span className="text-[10px] text-slate-400 block font-sans">Valor Parcela</span>
                      <strong className="text-indigo-600 text-sm">
                        R$ {Number(simulationResult.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900">
                      <span className="text-[10px] text-slate-400 block font-sans">Valor Líquido</span>
                      <strong className="text-emerald-600 text-sm">
                        R$ {Number(simulationResult.valor_liquido || simulationResult.valor_cliente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900">
                      <span className="text-[10px] text-slate-400 block font-sans">Prazo</span>
                      <strong className="text-slate-800 dark:text-slate-200 text-sm">
                        {simulationResult.quantidade_parcelas} parcelas
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900">
                      <span className="text-[10px] text-slate-400 block font-sans">Taxa CET a.m.</span>
                      <strong className="text-slate-800 dark:text-slate-200 text-sm">
                        {simulationResult.taxa_cet_am ? `${simulationResult.taxa_cet_am}%` : 'N/A'}
                      </strong>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <pre className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-indigo-200/60 dark:border-indigo-900/60 text-[11px] font-mono overflow-x-auto max-h-52 text-slate-800 dark:text-slate-200">
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
                  <span>Nova Simulação de Contrato</span>
                </button>

                <button
                  type="button"
                  onClick={handleFinish}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 cursor-pointer"
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
